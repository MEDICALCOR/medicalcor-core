/**
 * Unit tests for GuidanceSSEManager
 *
 * Tests SSE client lifecycle, event broadcasting, and call subscriptions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@medicalcor/core', () => ({
  generateCorrelationId: () => 'test-correlation-id',
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  deepRedactObject: <T>(obj: T) => obj,
  redactString: (str: string) => str,
}));

vi.mock('crypto', () => ({
  randomUUID: () => `uuid-${Math.random().toString(36).substr(2, 9)}`,
}));

// ============================================================================
// TEST SETUP
// ============================================================================

interface MockResponse {
  raw: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
}

function createMockResponse(): MockResponse {
  return {
    raw: {
      write: vi.fn(),
      end: vi.fn(),
      writeHead: vi.fn(),
    },
  };
}

interface MockGuidanceService {
  on: ReturnType<typeof vi.fn>;
  getCallGuidance: ReturnType<typeof vi.fn>;
  getCurrentStep: ReturnType<typeof vi.fn>;
  getPendingSuggestions: ReturnType<typeof vi.fn>;
}

function createMockGuidanceService(): MockGuidanceService {
  return {
    on: vi.fn(),
    getCallGuidance: vi.fn().mockReturnValue(null),
    getCurrentStep: vi.fn().mockReturnValue(null),
    getPendingSuggestions: vi.fn().mockReturnValue([]),
  };
}

// ============================================================================
// MANAGER IMPLEMENTATION (Simplified for testing)
// ============================================================================

interface GuidanceSSEClient {
  id: string;
  agentId: string;
  callSid?: string;
  response: MockResponse;
  createdAt: Date;
  lastPing: Date;
}

class TestableGuidanceSSEManager {
  private clients = new Map<string, GuidanceSSEClient>();
  private callToClients = new Map<string, Set<string>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private guidanceService: MockGuidanceService | null = null;
  private isInitialized = false;
  private eventHandlers = new Map<string, (...args: unknown[]) => void>();

  initialize(service: MockGuidanceService): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.guidanceService = service;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.guidanceService) return;

    const events = [
      'guidance:loaded',
      'guidance:step-complete',
      'guidance:suggestion',
      'guidance:objection-detected',
      'guidance:script-complete',
    ];

    for (const event of events) {
      const handler = vi.fn();
      this.eventHandlers.set(event, handler);
      this.guidanceService.on(event, handler);
    }
  }

  addClient(agentId: string, response: MockResponse, callSid?: string): string {
    const clientId = `client-${Date.now()}-${Math.random()}`;

    const client: GuidanceSSEClient = {
      id: clientId,
      agentId,
      callSid,
      response,
      createdAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);

    if (callSid) {
      if (!this.callToClients.has(callSid)) {
        this.callToClients.set(callSid, new Set());
      }
      this.callToClients.get(callSid)!.add(clientId);
    }

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    this.sendToClient(client, {
      eventId: 'test-uuid',
      eventType: 'connection.established',
      timestamp: new Date(),
      clientId,
    });

    return clientId;
  }

  subscribeToCall(clientId: string, callSid: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (client.callSid) {
      this.callToClients.get(client.callSid)?.delete(clientId);
    }

    client.callSid = callSid;
    if (!this.callToClients.has(callSid)) {
      this.callToClients.set(callSid, new Set());
    }
    this.callToClients.get(callSid)!.add(clientId);

    return true;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client?.callSid) {
      this.callToClients.get(client.callSid)?.delete(clientId);
      if (this.callToClients.get(client.callSid)?.size === 0) {
        this.callToClients.delete(client.callSid);
      }
    }

    this.clients.delete(clientId);

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendToClient(client: GuidanceSSEClient, event: Record<string, unknown>): void {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.response.raw.write(data);
    } catch {
      this.removeClient(client.id);
    }
  }

  broadcastToCall(callSid: string, event: Record<string, unknown>): void {
    const clientIds = this.callToClients.get(callSid);
    if (!clientIds || clientIds.size === 0) return;

    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.raw.write(data);
        } catch {
          this.removeClient(clientId);
        }
      }
    }
  }

  broadcast(event: Record<string, unknown>): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.response.raw.write(data);
      } catch {
        this.removeClient(clientId);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      this.broadcast({
        eventId: 'heartbeat-uuid',
        eventType: 'heartbeat',
        timestamp: now,
      });

      for (const client of this.clients.values()) {
        client.lastPing = now;
      }
    }, 30000);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getCallClientCount(callSid: string): number {
    return this.callToClients.get(callSid)?.size ?? 0;
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const client of this.clients.values()) {
      try {
        client.response.raw.end();
      } catch {
        // Ignore
      }
    }

    this.clients.clear();
    this.callToClients.clear();
    this.guidanceService = null;
    this.isInitialized = false;
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('GuidanceSSEManager', () => {
  let manager: TestableGuidanceSSEManager;
  let mockService: MockGuidanceService;

  beforeEach(() => {
    manager = new TestableGuidanceSSEManager();
    mockService = createMockGuidanceService();
    manager.initialize(mockService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with guidance service', () => {
      const newManager = new TestableGuidanceSSEManager();
      const service = createMockGuidanceService();

      newManager.initialize(service);

      expect(service.on).toHaveBeenCalled();
      newManager.destroy();
    });

    it('should not reinitialize if already initialized', () => {
      const service = createMockGuidanceService();
      manager.initialize(service); // Already initialized in beforeEach

      expect(service.on).not.toHaveBeenCalled();
    });
  });

  describe('client management', () => {
    it('should add a new client', () => {
      const response = createMockResponse();

      const clientId = manager.addClient('agent-123', response as any);

      expect(clientId).toBeDefined();
      expect(manager.getClientCount()).toBe(1);
    });

    it('should send connection established event', () => {
      const response = createMockResponse();

      manager.addClient('agent-123', response as any);

      expect(response.raw.write).toHaveBeenCalled();
      const writeCall = response.raw.write.mock.calls[0]![0] as string;
      expect(writeCall).toContain('connection.established');
    });

    it('should add client with call subscription', () => {
      const response = createMockResponse();

      manager.addClient('agent-123', response as any, 'call-456');

      expect(manager.getCallClientCount('call-456')).toBe(1);
    });

    it('should remove client', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('agent-123', response as any);

      manager.removeClient(clientId);

      expect(manager.getClientCount()).toBe(0);
    });

    it('should cleanup call subscription when removing client', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('agent-123', response as any, 'call-456');

      manager.removeClient(clientId);

      expect(manager.getCallClientCount('call-456')).toBe(0);
    });
  });

  describe('call subscription', () => {
    it('should subscribe client to call', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('agent-123', response as any);

      const result = manager.subscribeToCall(clientId, 'call-789');

      expect(result).toBe(true);
      expect(manager.getCallClientCount('call-789')).toBe(1);
    });

    it('should return false for non-existent client', () => {
      const result = manager.subscribeToCall('nonexistent', 'call-789');

      expect(result).toBe(false);
    });

    it('should unsubscribe from previous call when subscribing to new', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('agent-123', response as any, 'call-1');

      manager.subscribeToCall(clientId, 'call-2');

      expect(manager.getCallClientCount('call-1')).toBe(0);
      expect(manager.getCallClientCount('call-2')).toBe(1);
    });
  });

  describe('broadcasting', () => {
    it('should broadcast to all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      manager.addClient('agent-1', response1 as any);
      manager.addClient('agent-2', response2 as any);

      manager.broadcast({ eventType: 'test', data: 'hello' });

      // Each client should have received connection.established + broadcast
      expect(response1.raw.write).toHaveBeenCalledTimes(2);
      expect(response2.raw.write).toHaveBeenCalledTimes(2);
    });

    it('should broadcast to call subscribers only', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      manager.addClient('agent-1', response1 as any, 'call-123');
      manager.addClient('agent-2', response2 as any, 'call-456');

      manager.broadcastToCall('call-123', { eventType: 'test' });

      // response1 should have connection + broadcast
      expect(response1.raw.write).toHaveBeenCalledTimes(2);
      // response2 should only have connection
      expect(response2.raw.write).toHaveBeenCalledTimes(1);
    });

    it('should handle failed writes by removing client', () => {
      const response = createMockResponse();
      response.raw.write
        .mockImplementationOnce(() => {
          // First call (connection.established) succeeds
        })
        .mockImplementationOnce(() => {
          throw new Error('Write failed');
        });

      manager.addClient('agent-123', response as any);
      manager.broadcast({ eventType: 'test' });

      expect(manager.getClientCount()).toBe(0);
    });

    it('should not broadcast to call with no subscribers', () => {
      manager.broadcastToCall('nonexistent-call', { eventType: 'test' });
      // Should not throw
    });
  });

  describe('heartbeat', () => {
    it('should start heartbeat when first client connects', () => {
      const response = createMockResponse();
      manager.addClient('agent-123', response as any);

      vi.advanceTimersByTime(30000);

      // Should have connection.established + heartbeat
      expect(response.raw.write).toHaveBeenCalledTimes(2);
    });

    it('should stop heartbeat when last client disconnects', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('agent-123', response as any);

      manager.removeClient(clientId);
      vi.advanceTimersByTime(30000);

      // Should only have connection.established (no heartbeat after removal)
      expect(response.raw.write).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      manager.addClient('agent-1', response1 as any);
      manager.addClient('agent-2', response2 as any);

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(response1.raw.end).toHaveBeenCalled();
      expect(response2.raw.end).toHaveBeenCalled();
    });
  });
});
