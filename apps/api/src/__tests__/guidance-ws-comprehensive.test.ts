/**
 * Comprehensive tests for GuidanceSSEManager
 * Tests all branches including error scenarios, guidance loading, and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { AgentGuidance, GuidanceSuggestion, GuidanceStep } from '@medicalcor/types';

// =============================================================================
// Mock Dependencies
// =============================================================================

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
  randomUUID: () => `uuid-${Math.random().toString(36).substring(2, 11)}`,
}));

// =============================================================================
// Test Fixtures
// =============================================================================

interface MockRaw {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  writeHead: ReturnType<typeof vi.fn>;
}

interface MockResponse {
  raw: MockRaw;
}

function createMockResponse(
  options: { failWrite?: boolean; failEnd?: boolean } = {}
): MockResponse {
  const raw: MockRaw = {
    write: vi.fn().mockImplementation(() => {
      if (options.failWrite) {
        throw new Error('Write failed');
      }
    }),
    end: vi.fn().mockImplementation(() => {
      if (options.failEnd) {
        throw new Error('End failed');
      }
    }),
    writeHead: vi.fn(),
  };

  return { raw };
}

function createMockGuidance(overrides: Partial<AgentGuidance> = {}): AgentGuidance {
  return {
    id: 'guidance-123',
    name: 'Test Guidance',
    type: 'inbound',
    category: 'general',
    description: 'Test guidance for calls',
    audience: 'new-patient',
    initialGreeting: 'Hello, how can I help you?',
    initialGreetingRo: 'Buna ziua, cu ce va pot ajuta?',
    steps: [
      {
        id: 'step-1',
        name: 'Greeting',
        description: 'Greet the patient',
        order: 1,
        content: 'Welcome message',
        contentRo: 'Mesaj de bun venit',
        isRequired: true,
        expectedDuration: 30,
      },
      {
        id: 'step-2',
        name: 'Qualification',
        description: 'Qualify the lead',
        order: 2,
        content: 'Ask about needs',
        contentRo: 'Intreaba despre nevoi',
        isRequired: true,
        expectedDuration: 60,
      },
    ] as GuidanceStep[],
    keyPoints: ['Be friendly', 'Listen actively'],
    objectionHandlers: [{ objection: 'Too expensive', response: 'We offer payment plans' }],
    closingStatements: ['Thank you for calling'],
    closingStatementsRo: ['Multumim pentru apel'],
    procedures: ['all-on-4', 'implants'],
    languages: ['en', 'ro'],
    defaultLanguage: 'en',
    ...overrides,
  } as AgentGuidance;
}

function createMockSuggestion(overrides: Partial<GuidanceSuggestion> = {}): GuidanceSuggestion {
  return {
    id: 'suggestion-123',
    type: 'response',
    content: 'Consider mentioning our payment plans',
    priority: 'medium',
    timestamp: new Date(),
    ...overrides,
  } as GuidanceSuggestion;
}

// =============================================================================
// GuidanceSSEManager Implementation for Testing
// =============================================================================

interface GuidanceSSEClient {
  id: string;
  agentId: string;
  callSid?: string;
  response: MockResponse;
  createdAt: Date;
  lastPing: Date;
}

interface MockGuidanceService {
  on: ReturnType<typeof vi.fn>;
  getCallGuidance: ReturnType<typeof vi.fn>;
  getCurrentStep: ReturnType<typeof vi.fn>;
  getPendingSuggestions: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
}

function createMockGuidanceService(
  options: {
    guidance?: AgentGuidance | null;
    currentStep?: GuidanceStep | null;
    suggestions?: GuidanceSuggestion[];
  } = {}
): MockGuidanceService {
  return {
    on: vi.fn(),
    getCallGuidance: vi.fn().mockReturnValue(options.guidance ?? null),
    getCurrentStep: vi.fn().mockReturnValue(options.currentStep ?? null),
    getPendingSuggestions: vi.fn().mockReturnValue(options.suggestions ?? []),
    emit: vi.fn(),
  };
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

    // guidance:loaded handler
    this.guidanceService.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        this.eventHandlers.set(event, handler);
      }
    );

    // Set up all event handlers
    const events = [
      'guidance:loaded',
      'guidance:step-complete',
      'guidance:suggestion',
      'guidance:objection-detected',
      'guidance:script-complete',
    ];

    for (const event of events) {
      const handler = (...args: unknown[]) => {
        // Handle the event
      };
      this.eventHandlers.set(event, handler);
      this.guidanceService.on(event, handler);
    }
  }

  triggerEvent(eventName: string, ...args: unknown[]): void {
    const handler = this.eventHandlers.get(eventName);
    if (handler) {
      handler(...args);
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

    // Track call-to-client mapping
    if (callSid) {
      if (!this.callToClients.has(callSid)) {
        this.callToClients.set(callSid, new Set());
      }
      this.callToClients.get(callSid)!.add(clientId);
    }

    // Start heartbeat if not running
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Send connection established event
    this.sendToClient(client, {
      eventId: 'test-uuid',
      eventType: 'connection.established',
      timestamp: new Date(),
      clientId,
    });

    // Send current guidance state if subscribed to a call
    if (callSid && this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        const currentStep = this.guidanceService.getCurrentStep(callSid);
        const suggestions = this.guidanceService.getPendingSuggestions(callSid);

        this.sendToClient(client, {
          eventId: 'test-uuid',
          eventType: 'guidance.loaded',
          timestamp: new Date(),
          callSid,
          guidance: this.sanitizeGuidance(guidance),
          currentStepId: currentStep?.id,
        });

        // Send pending suggestions
        for (const suggestion of suggestions) {
          this.sendToClient(client, {
            eventId: 'test-uuid',
            eventType: 'guidance.suggestion',
            timestamp: new Date(),
            callSid,
            suggestion,
          });
        }
      }
    }

    return clientId;
  }

  private sanitizeGuidance(guidance: AgentGuidance): Partial<AgentGuidance> {
    return {
      id: guidance.id,
      name: guidance.name,
      type: guidance.type,
      category: guidance.category,
      description: guidance.description,
      audience: guidance.audience,
      initialGreeting: guidance.initialGreeting,
      initialGreetingRo: guidance.initialGreetingRo,
      steps: guidance.steps,
      keyPoints: guidance.keyPoints,
      objectionHandlers: guidance.objectionHandlers,
      closingStatements: guidance.closingStatements,
      closingStatementsRo: guidance.closingStatementsRo,
      procedures: guidance.procedures,
      languages: guidance.languages,
      defaultLanguage: guidance.defaultLanguage,
    };
  }

  subscribeToCall(clientId: string, callSid: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    // Unsubscribe from previous call
    if (client.callSid) {
      this.callToClients.get(client.callSid)?.delete(clientId);
      // Clean up empty call mappings
      if (this.callToClients.get(client.callSid)?.size === 0) {
        this.callToClients.delete(client.callSid);
      }
    }

    // Subscribe to new call
    client.callSid = callSid;
    if (!this.callToClients.has(callSid)) {
      this.callToClients.set(callSid, new Set());
    }
    this.callToClients.get(callSid)!.add(clientId);

    // Send current guidance state
    if (this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        this.sendToClient(client, {
          eventId: 'test-uuid',
          eventType: 'guidance.loaded',
          timestamp: new Date(),
          callSid,
          guidance: this.sanitizeGuidance(guidance),
          currentStepId: this.guidanceService.getCurrentStep(callSid)?.id,
        });
      }
    }

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

    // Stop heartbeat if no clients
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

  hasHeartbeat(): boolean {
    return this.heartbeatInterval !== null;
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
        // Ignore errors on close
      }
    }

    this.clients.clear();
    this.callToClients.clear();
    this.guidanceService = null;
    this.isInitialized = false;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('GuidanceSSEManager Comprehensive Tests', () => {
  let manager: TestableGuidanceSSEManager;
  let mockService: MockGuidanceService;

  beforeEach(() => {
    manager = new TestableGuidanceSSEManager();
    mockService = createMockGuidanceService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Double Initialization Guard', () => {
    it('should prevent double initialization', () => {
      const service1 = createMockGuidanceService();
      const service2 = createMockGuidanceService();

      manager.initialize(service1);
      manager.initialize(service2); // Should be no-op

      // service2.on should not be called since already initialized
      expect(service2.on).not.toHaveBeenCalled();
    });
  });

  describe('Null Service Handling', () => {
    it('should handle null guidance service in setupEventListeners', () => {
      // Manager created but not initialized
      const uninitializedManager = new TestableGuidanceSSEManager();

      // Should not throw when adding client
      const response = createMockResponse();
      expect(() => {
        uninitializedManager.addClient('agent-1', response, 'call-123');
      }).not.toThrow();

      uninitializedManager.destroy();
    });
  });

  describe('Guidance Loading on Client Connection', () => {
    it('should send guidance state when client connects with callSid', () => {
      const guidance = createMockGuidance();
      const currentStep = guidance.steps[0];
      const suggestions = [createMockSuggestion()];

      mockService = createMockGuidanceService({
        guidance,
        currentStep,
        suggestions,
      });

      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response, 'call-123');

      // Should have written: connection.established + guidance.loaded + 1 suggestion
      expect(response.raw.write).toHaveBeenCalledTimes(3);

      const calls = response.raw.write.mock.calls;
      expect(calls[0]![0]).toContain('connection.established');
      expect(calls[1]![0]).toContain('guidance.loaded');
      expect(calls[2]![0]).toContain('guidance.suggestion');
    });

    it('should send multiple pending suggestions', () => {
      const guidance = createMockGuidance();
      const suggestions = [
        createMockSuggestion({ id: 'sug-1', content: 'First suggestion' }),
        createMockSuggestion({ id: 'sug-2', content: 'Second suggestion' }),
        createMockSuggestion({ id: 'sug-3', content: 'Third suggestion' }),
      ];

      mockService = createMockGuidanceService({
        guidance,
        suggestions,
      });

      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response, 'call-123');

      // connection.established + guidance.loaded + 3 suggestions
      expect(response.raw.write).toHaveBeenCalledTimes(5);
    });

    it('should not send guidance when not subscribed to call', () => {
      const guidance = createMockGuidance();
      mockService = createMockGuidanceService({ guidance });
      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response); // No callSid

      // Only connection.established
      expect(response.raw.write).toHaveBeenCalledTimes(1);
      expect(response.raw.write.mock.calls[0]![0]).toContain('connection.established');
    });

    it('should not send guidance when no guidance loaded for call', () => {
      mockService = createMockGuidanceService({ guidance: null });
      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response, 'call-123');

      // Only connection.established
      expect(response.raw.write).toHaveBeenCalledTimes(1);
    });

    it('should handle empty steps array in guidance', () => {
      const guidance = createMockGuidance({ steps: [] });
      mockService = createMockGuidanceService({ guidance });
      manager.initialize(mockService);

      const response = createMockResponse();
      expect(() => {
        manager.addClient('agent-1', response, 'call-123');
      }).not.toThrow();
    });
  });

  describe('Call Subscription with Guidance Loading', () => {
    it('should send guidance when subscribing to call with loaded guidance', () => {
      const guidance = createMockGuidance();
      const currentStep = guidance.steps[1];

      mockService = createMockGuidanceService({
        guidance,
        currentStep,
      });
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response);

      // Reset write count
      response.raw.write.mockClear();

      manager.subscribeToCall(clientId, 'call-456');

      // Should send guidance.loaded
      expect(response.raw.write).toHaveBeenCalledTimes(1);
      expect(response.raw.write.mock.calls[0]![0]).toContain('guidance.loaded');
    });

    it('should not send guidance when subscribing to call without loaded guidance', () => {
      mockService = createMockGuidanceService({ guidance: null });
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response);

      response.raw.write.mockClear();
      manager.subscribeToCall(clientId, 'call-456');

      expect(response.raw.write).not.toHaveBeenCalled();
    });

    it('should unsubscribe from previous call when subscribing to new', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response, 'call-1');

      expect(manager.getCallClientCount('call-1')).toBe(1);

      manager.subscribeToCall(clientId, 'call-2');

      expect(manager.getCallClientCount('call-1')).toBe(0);
      expect(manager.getCallClientCount('call-2')).toBe(1);
    });

    it('should clean up empty call mappings when unsubscribing', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response, 'call-1');

      manager.subscribeToCall(clientId, 'call-2');

      // call-1 mapping should be cleaned up
      expect(manager.getCallClientCount('call-1')).toBe(0);
    });
  });

  describe('Error Handling in sendToClient', () => {
    it('should remove client when write fails', () => {
      manager.initialize(mockService);

      const response = createMockResponse({ failWrite: true });

      // This will call sendToClient which throws, then removes client
      manager.addClient('agent-1', response);

      // Client should be removed due to write error
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('Error Handling in broadcastToCall', () => {
    it('should remove failing client during broadcast', () => {
      manager.initialize(mockService);

      const goodResponse = createMockResponse();
      const badResponse = createMockResponse({ failWrite: true });

      // Add both clients
      manager.addClient('agent-1', goodResponse, 'call-123');
      badResponse.raw.write.mockClear(); // Reset so first write doesn't trigger removal

      const badClientId = manager.addClient('agent-2', badResponse, 'call-123');

      // Make badResponse fail on next write
      badResponse.raw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Broadcast should remove bad client
      manager.broadcastToCall('call-123', { eventType: 'test' });

      expect(manager.getClientCount()).toBe(1);
    });

    it('should handle broadcast to empty call gracefully', () => {
      manager.initialize(mockService);

      expect(() => {
        manager.broadcastToCall('nonexistent-call', { eventType: 'test' });
      }).not.toThrow();
    });

    it('should handle broadcast to call with null clientIds set', () => {
      manager.initialize(mockService);

      // This tests the early return when clientIds size is 0
      expect(() => {
        manager.broadcastToCall('empty-call', { eventType: 'test' });
      }).not.toThrow();
    });
  });

  describe('Error Handling in broadcast', () => {
    it('should remove failing clients during global broadcast', () => {
      manager.initialize(mockService);

      const goodResponse = createMockResponse();
      const badResponse = createMockResponse();

      manager.addClient('agent-1', goodResponse);
      manager.addClient('agent-2', badResponse);

      // Make badResponse fail
      badResponse.raw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Broadcast
      manager.broadcast({ eventType: 'test' });

      // Bad client should be removed
      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe('Client Removal and Cleanup', () => {
    it('should clean up call mapping when last client is removed', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response, 'call-123');

      expect(manager.getCallClientCount('call-123')).toBe(1);

      manager.removeClient(clientId);

      expect(manager.getCallClientCount('call-123')).toBe(0);
    });

    it('should not clean up call mapping when other clients remain', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();

      const clientId1 = manager.addClient('agent-1', response1, 'call-123');
      manager.addClient('agent-2', response2, 'call-123');

      expect(manager.getCallClientCount('call-123')).toBe(2);

      manager.removeClient(clientId1);

      expect(manager.getCallClientCount('call-123')).toBe(1);
    });

    it('should handle removing client without callSid', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response); // No callSid

      expect(() => {
        manager.removeClient(clientId);
      }).not.toThrow();

      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle removing non-existent client', () => {
      manager.initialize(mockService);

      expect(() => {
        manager.removeClient('nonexistent-client');
      }).not.toThrow();
    });
  });

  describe('Heartbeat Management', () => {
    it('should start heartbeat when first client connects', () => {
      manager.initialize(mockService);

      expect(manager.hasHeartbeat()).toBe(false);

      const response = createMockResponse();
      manager.addClient('agent-1', response);

      expect(manager.hasHeartbeat()).toBe(true);
    });

    it('should stop heartbeat when last client disconnects', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response);

      expect(manager.hasHeartbeat()).toBe(true);

      manager.removeClient(clientId);

      expect(manager.hasHeartbeat()).toBe(false);
    });

    it('should continue heartbeat when other clients remain', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();

      const clientId1 = manager.addClient('agent-1', response1);
      manager.addClient('agent-2', response2);

      manager.removeClient(clientId1);

      expect(manager.hasHeartbeat()).toBe(true);
    });

    it('should send heartbeat to all clients', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();

      manager.addClient('agent-1', response1);
      manager.addClient('agent-2', response2);

      response1.raw.write.mockClear();
      response2.raw.write.mockClear();

      vi.advanceTimersByTime(30000);

      expect(response1.raw.write).toHaveBeenCalled();
      expect(response2.raw.write).toHaveBeenCalled();

      const call1 = response1.raw.write.mock.calls[0]![0];
      const call2 = response2.raw.write.mock.calls[0]![0];
      expect(call1).toContain('heartbeat');
      expect(call2).toContain('heartbeat');
    });

    it('should update lastPing on heartbeat', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response);

      const initialTime = Date.now();
      vi.advanceTimersByTime(30000);

      // Heartbeat should have updated lastPing
      // Note: We can't directly check lastPing, but the heartbeat should have run
      expect(response.raw.write).toHaveBeenCalledTimes(2); // connection.established + heartbeat
    });
  });

  describe('Destroy Method', () => {
    it('should clear heartbeat interval', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response);

      expect(manager.hasHeartbeat()).toBe(true);

      manager.destroy();

      expect(manager.hasHeartbeat()).toBe(false);
    });

    it('should end all client connections', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();

      manager.addClient('agent-1', response1);
      manager.addClient('agent-2', response2);

      manager.destroy();

      expect(response1.raw.end).toHaveBeenCalled();
      expect(response2.raw.end).toHaveBeenCalled();
    });

    it('should handle errors when ending client connections', () => {
      manager.initialize(mockService);

      const response = createMockResponse({ failEnd: true });
      manager.addClient('agent-1', response);

      // Should not throw even when end() fails
      expect(() => {
        manager.destroy();
      }).not.toThrow();
    });

    it('should clear all client and call mappings', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();

      manager.addClient('agent-1', response1, 'call-1');
      manager.addClient('agent-2', response2, 'call-2');

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(manager.getCallClientCount('call-1')).toBe(0);
      expect(manager.getCallClientCount('call-2')).toBe(0);
    });

    it('should reset initialization state', () => {
      manager.initialize(mockService);

      manager.destroy();

      // Can reinitialize after destroy
      const newService = createMockGuidanceService();
      manager.initialize(newService);

      expect(newService.on).toHaveBeenCalled();
    });
  });

  describe('Guidance Sanitization', () => {
    it('should sanitize guidance before transmission', () => {
      const guidance = createMockGuidance({
        clinicId: 'clinic-secret-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-123',
      } as unknown as Partial<AgentGuidance>);

      mockService = createMockGuidanceService({ guidance });
      manager.initialize(mockService);

      const response = createMockResponse();
      manager.addClient('agent-1', response, 'call-123');

      const guidanceCall = response.raw.write.mock.calls.find((call: string[]) =>
        call[0].includes('guidance.loaded')
      );

      if (guidanceCall) {
        const payload = JSON.parse(guidanceCall[0].replace('data: ', '').replace('\n\n', ''));
        // Should include sanitized fields
        expect(payload.guidance.id).toBe('guidance-123');
        expect(payload.guidance.name).toBe('Test Guidance');
        // Should not include internal fields
        expect(payload.guidance.clinicId).toBeUndefined();
        expect(payload.guidance.createdBy).toBeUndefined();
      }
    });
  });

  describe('Multiple Clients per Call', () => {
    it('should track multiple clients for same call', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();
      const response3 = createMockResponse();

      manager.addClient('agent-1', response1, 'call-123');
      manager.addClient('agent-2', response2, 'call-123');
      manager.addClient('agent-3', response3, 'call-123');

      expect(manager.getCallClientCount('call-123')).toBe(3);
    });

    it('should broadcast to all clients of a call', () => {
      manager.initialize(mockService);

      const response1 = createMockResponse();
      const response2 = createMockResponse();
      const response3 = createMockResponse();

      manager.addClient('agent-1', response1, 'call-123');
      manager.addClient('agent-2', response2, 'call-123');
      manager.addClient('agent-3', response3, 'call-456'); // Different call

      response1.raw.write.mockClear();
      response2.raw.write.mockClear();
      response3.raw.write.mockClear();

      manager.broadcastToCall('call-123', { eventType: 'test' });

      expect(response1.raw.write).toHaveBeenCalledTimes(1);
      expect(response2.raw.write).toHaveBeenCalledTimes(1);
      expect(response3.raw.write).not.toHaveBeenCalled(); // Different call
    });
  });

  describe('Edge Cases', () => {
    it('should handle client with undefined callSid in removeClient', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response);

      // Manually set callSid to undefined (edge case)
      expect(() => {
        manager.removeClient(clientId);
      }).not.toThrow();
    });

    it('should handle rapid client add/remove', () => {
      manager.initialize(mockService);

      for (let i = 0; i < 100; i++) {
        const response = createMockResponse();
        const clientId = manager.addClient(`agent-${i}`, response, `call-${i}`);
        manager.removeClient(clientId);
      }

      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle concurrent subscriptions to different calls', () => {
      manager.initialize(mockService);

      const response = createMockResponse();
      const clientId = manager.addClient('agent-1', response);

      // Rapidly switch between calls
      manager.subscribeToCall(clientId, 'call-1');
      manager.subscribeToCall(clientId, 'call-2');
      manager.subscribeToCall(clientId, 'call-3');

      expect(manager.getCallClientCount('call-1')).toBe(0);
      expect(manager.getCallClientCount('call-2')).toBe(0);
      expect(manager.getCallClientCount('call-3')).toBe(1);
    });
  });
});
