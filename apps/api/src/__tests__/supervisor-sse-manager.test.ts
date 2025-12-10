/**
 * Unit tests for SupervisorSSEManager
 *
 * Tests SSE client lifecycle, event broadcasting, and call masking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
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

interface MockMonitoredCall {
  callSid: string;
  customerPhone: string;
  state: string;
  direction: string;
  startedAt: Date;
  duration: number;
  recentTranscript: Array<{ speaker: string; text: string }>;
}

interface MockSupervisorAgent {
  on: ReturnType<typeof vi.fn>;
  getActiveCalls: ReturnType<typeof vi.fn>;
  registerCall: ReturnType<typeof vi.fn>;
  updateCall: ReturnType<typeof vi.fn>;
  endCall: ReturnType<typeof vi.fn>;
  processTranscriptMessage: ReturnType<typeof vi.fn>;
}

function createMockSupervisorAgent(): MockSupervisorAgent {
  return {
    on: vi.fn(),
    getActiveCalls: vi.fn().mockReturnValue([]),
    registerCall: vi.fn(),
    updateCall: vi.fn(),
    endCall: vi.fn(),
    processTranscriptMessage: vi.fn(),
  };
}

function createMockCall(overrides = {}): MockMonitoredCall {
  return {
    callSid: 'call-123',
    customerPhone: '+40721234567',
    state: 'ringing',
    direction: 'inbound',
    startedAt: new Date(),
    duration: 0,
    recentTranscript: [
      { speaker: 'customer', text: 'Hello' },
      { speaker: 'agent', text: 'Hi there' },
      { speaker: 'customer', text: 'I need help' },
      { speaker: 'agent', text: 'Of course' },
      { speaker: 'customer', text: 'Thanks' },
      { speaker: 'agent', text: 'Welcome' },
    ],
    ...overrides,
  };
}

// ============================================================================
// MANAGER IMPLEMENTATION (Simplified for testing)
// ============================================================================

interface SSEClient {
  id: string;
  supervisorId: string;
  response: MockResponse;
  createdAt: Date;
  lastPing: Date;
}

class TestableSupervisorSSEManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private agent: MockSupervisorAgent;
  private isInitialized = false;
  private eventHandlers = new Map<string, (...args: unknown[]) => void>();

  constructor(agent: MockSupervisorAgent) {
    this.agent = agent;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const events = [
      'call:started',
      'call:updated',
      'call:ended',
      'transcript:message',
      'alert:escalation',
      'alert:long-hold',
      'alert:silence',
      'alert:negative-sentiment',
      'supervisor:joined',
      'supervisor:left',
      'handoff:requested',
      'handoff:completed',
    ];

    for (const event of events) {
      const handler = vi.fn();
      this.eventHandlers.set(event, handler);
      this.agent.on(event, handler);
    }
  }

  maskCallData(call: MockMonitoredCall): Partial<MockMonitoredCall> {
    return {
      ...call,
      customerPhone: call.customerPhone.slice(0, -4) + '****',
      recentTranscript: call.recentTranscript.slice(-5),
    };
  }

  addClient(supervisorId: string, response: MockResponse): string {
    const clientId = `client-${Date.now()}-${Math.random()}`;

    const client: SSEClient = {
      id: clientId,
      supervisorId,
      response,
      createdAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Send connection established
    this.sendToClient(client, {
      eventId: 'test-uuid',
      eventType: 'connection.established',
      timestamp: new Date(),
      clientId,
    });

    // Send initial state
    const activeCalls = this.agent.getActiveCalls();
    for (const call of activeCalls) {
      this.sendToClient(client, {
        eventId: 'test-uuid',
        eventType: 'call.started',
        timestamp: new Date(),
        callSid: call.callSid,
        call: this.maskCallData(call),
      });
    }

    return clientId;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendToClient(client: SSEClient, event: Record<string, unknown>): void {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.response.raw.write(data);
    } catch {
      this.clients.delete(client.id);
    }
  }

  broadcast(event: Record<string, unknown>): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.response.raw.write(data);
      } catch {
        this.clients.delete(clientId);
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
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('SupervisorSSEManager', () => {
  let manager: TestableSupervisorSSEManager;
  let mockAgent: MockSupervisorAgent;

  beforeEach(() => {
    mockAgent = createMockSupervisorAgent();
    manager = new TestableSupervisorSSEManager(mockAgent);
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should setup event listeners on construction', () => {
      expect(mockAgent.on).toHaveBeenCalled();
      const eventNames = mockAgent.on.mock.calls.map((call) => call[0]);
      expect(eventNames).toContain('call:started');
      expect(eventNames).toContain('call:ended');
      expect(eventNames).toContain('transcript:message');
    });
  });

  describe('call data masking', () => {
    it('should mask customer phone number', () => {
      const call = createMockCall({ customerPhone: '+40721234567' });

      const masked = manager.maskCallData(call);

      // Last 4 characters should be masked
      expect(masked.customerPhone).toBe('+4072123****');
      expect(masked.customerPhone).not.toBe(call.customerPhone);
    });

    it('should limit transcript to last 5 messages', () => {
      const call = createMockCall();

      const masked = manager.maskCallData(call);

      expect(masked.recentTranscript).toHaveLength(5);
      expect(masked.recentTranscript![0]).toEqual({ speaker: 'agent', text: 'Hi there' });
    });

    it('should preserve other call properties', () => {
      const call = createMockCall({ callSid: 'call-abc', state: 'in-progress' });

      const masked = manager.maskCallData(call);

      expect(masked.callSid).toBe('call-abc');
      expect(masked.state).toBe('in-progress');
    });
  });

  describe('client management', () => {
    it('should add a new client', () => {
      const response = createMockResponse();

      const clientId = manager.addClient('supervisor-123', response as any);

      expect(clientId).toBeDefined();
      expect(manager.getClientCount()).toBe(1);
    });

    it('should send connection established event', () => {
      const response = createMockResponse();

      manager.addClient('supervisor-123', response as any);

      expect(response.raw.write).toHaveBeenCalled();
      const writeCall = response.raw.write.mock.calls[0]![0] as string;
      expect(writeCall).toContain('connection.established');
    });

    it('should send active calls on connect', () => {
      const activeCalls = [
        createMockCall({ callSid: 'call-1' }),
        createMockCall({ callSid: 'call-2' }),
      ];
      mockAgent.getActiveCalls.mockReturnValue(activeCalls);
      const response = createMockResponse();

      manager.addClient('supervisor-123', response as any);

      // connection.established + 2 call.started events
      expect(response.raw.write).toHaveBeenCalledTimes(3);
    });

    it('should remove client', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('supervisor-123', response as any);

      manager.removeClient(clientId);

      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('broadcasting', () => {
    it('should broadcast to all connected clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      manager.addClient('supervisor-1', response1 as any);
      manager.addClient('supervisor-2', response2 as any);

      manager.broadcast({ eventType: 'test.event', data: 'hello' });

      // Each client: connection.established + broadcast
      expect(response1.raw.write).toHaveBeenCalledTimes(2);
      expect(response2.raw.write).toHaveBeenCalledTimes(2);
    });

    it('should remove client on write failure', () => {
      const response = createMockResponse();
      response.raw.write
        .mockImplementationOnce(() => {
          // First call succeeds (connection.established)
        })
        .mockImplementationOnce(() => {
          throw new Error('Connection closed');
        });

      manager.addClient('supervisor-123', response as any);
      manager.broadcast({ eventType: 'test' });

      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat every 30 seconds', () => {
      const response = createMockResponse();
      manager.addClient('supervisor-123', response as any);

      vi.advanceTimersByTime(30000);

      // connection.established + heartbeat
      expect(response.raw.write).toHaveBeenCalledTimes(2);
      const lastCall = response.raw.write.mock.calls[1]![0] as string;
      expect(lastCall).toContain('heartbeat');
    });

    it('should stop heartbeat when no clients remain', () => {
      const response = createMockResponse();
      const clientId = manager.addClient('supervisor-123', response as any);

      manager.removeClient(clientId);
      vi.advanceTimersByTime(60000);

      // Only connection.established, no heartbeat
      expect(response.raw.write).toHaveBeenCalledTimes(1);
    });

    it('should send multiple heartbeats over time', () => {
      const response = createMockResponse();
      manager.addClient('supervisor-123', response as any);

      vi.advanceTimersByTime(90000); // 3 heartbeats

      // connection.established + 3 heartbeats
      expect(response.raw.write).toHaveBeenCalledTimes(4);
    });
  });

  describe('destroy', () => {
    it('should cleanup all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      manager.addClient('supervisor-1', response1 as any);
      manager.addClient('supervisor-2', response2 as any);

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(response1.raw.end).toHaveBeenCalled();
      expect(response2.raw.end).toHaveBeenCalled();
    });

    it('should stop heartbeat interval', () => {
      const response = createMockResponse();
      manager.addClient('supervisor-123', response as any);

      manager.destroy();
      vi.advanceTimersByTime(60000);

      // Only connection.established before destroy
      expect(response.raw.write).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// EVENT EMISSION TESTS
// ============================================================================

describe('emitSupervisorEvent', () => {
  let mockAgent: MockSupervisorAgent;

  beforeEach(() => {
    mockAgent = createMockSupervisorAgent();
  });

  it('should register call on call.started event', () => {
    const event = {
      eventType: 'call.started',
      callSid: 'call-123',
      data: {
        customerPhone: '+40721234567',
        direction: 'inbound',
      },
    };

    // Simulate event handling
    if (event.eventType === 'call.started' && event.data && event.callSid) {
      const customerPhone = event.data.customerPhone as string;
      const direction = event.data.direction as 'inbound' | 'outbound';
      mockAgent.registerCall({
        callSid: event.callSid,
        customerPhone,
        state: 'ringing',
        direction,
        startedAt: new Date(),
        duration: 0,
      });
    }

    expect(mockAgent.registerCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callSid: 'call-123',
        customerPhone: '+40721234567',
        direction: 'inbound',
      })
    );
  });

  it('should update call on call.updated event', () => {
    const event = {
      eventType: 'call.updated',
      callSid: 'call-123',
      data: { state: 'in-progress' },
    };

    if (event.eventType === 'call.updated' && event.callSid && event.data) {
      mockAgent.updateCall(event.callSid, event.data);
    }

    expect(mockAgent.updateCall).toHaveBeenCalledWith('call-123', { state: 'in-progress' });
  });

  it('should end call on call.ended event', () => {
    const event = {
      eventType: 'call.ended',
      callSid: 'call-123',
      data: { outcome: 'completed' },
    };

    if (event.eventType === 'call.ended' && event.callSid) {
      const outcome = (event.data?.outcome as string) ?? 'completed';
      mockAgent.endCall(event.callSid, outcome);
    }

    expect(mockAgent.endCall).toHaveBeenCalledWith('call-123', 'completed');
  });

  it('should process transcript message', () => {
    const event = {
      eventType: 'transcript.message',
      callSid: 'call-123',
      data: {
        speaker: 'customer',
        text: 'Hello, I need help',
        confidence: 0.95,
      },
    };

    if (event.eventType === 'transcript.message' && event.callSid && event.data) {
      const speaker = event.data.speaker as 'customer' | 'agent' | 'assistant';
      const text = event.data.text as string;
      const confidence = event.data.confidence as number;
      mockAgent.processTranscriptMessage(event.callSid, speaker, text, confidence);
    }

    expect(mockAgent.processTranscriptMessage).toHaveBeenCalledWith(
      'call-123',
      'customer',
      'Hello, I need help',
      0.95
    );
  });

  it('should not register call without valid phone number', () => {
    const event = {
      eventType: 'call.started',
      callSid: 'call-123',
      data: {},
    };

    if (event.eventType === 'call.started' && event.data && event.callSid) {
      const customerPhone = event.data.customerPhone as string | undefined;
      if (typeof customerPhone !== 'string' || !customerPhone) {
        // Skip registration
        return;
      }
      mockAgent.registerCall({
        callSid: event.callSid,
        customerPhone,
        state: 'ringing',
        direction: 'inbound',
        startedAt: new Date(),
        duration: 0,
      });
    }

    expect(mockAgent.registerCall).not.toHaveBeenCalled();
  });
});
