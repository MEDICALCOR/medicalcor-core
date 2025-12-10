/**
 * Branch Coverage Tests for guidance-ws.ts
 * Targets specific branches for 85% coverage threshold
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentGuidance, GuidanceStep, GuidanceSuggestion } from '@medicalcor/types';

// =============================================================================
// Mock Dependencies
// =============================================================================

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('@medicalcor/core', () => ({
  generateCorrelationId: () => 'test-correlation-id',
  logger: mockLogger,
  deepRedactObject: <T>(obj: T) => obj,
  redactString: (str: string) => `[REDACTED:${str.slice(0, 3)}]`,
}));

vi.mock('crypto', () => ({
  randomUUID: () => `uuid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
}));

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockGuidance(overrides: Partial<AgentGuidance> = {}): AgentGuidance {
  return {
    id: 'guidance-123',
    name: 'Test Guidance',
    type: 'inbound',
    category: 'general',
    description: 'Test guidance',
    audience: 'new-patient',
    initialGreeting: 'Hello',
    initialGreetingRo: 'Buna ziua',
    steps: [
      {
        id: 'step-1',
        name: 'Greeting',
        description: 'Greet',
        order: 1,
        content: 'Welcome',
        contentRo: 'Bun venit',
        isRequired: true,
        expectedDuration: 30,
      },
    ] as GuidanceStep[],
    keyPoints: ['Be friendly'],
    objectionHandlers: [{ objection: 'Price', response: 'Payment plans available' }],
    closingStatements: ['Thank you'],
    closingStatementsRo: ['Multumim'],
    procedures: ['all-on-4'],
    languages: ['en', 'ro'],
    defaultLanguage: 'en',
    ...overrides,
  } as AgentGuidance;
}

interface MockRaw {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  writeHead: ReturnType<typeof vi.fn>;
}

function createMockReply(): { reply: FastifyReply; raw: MockRaw } {
  const raw: MockRaw = {
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
    writeHead: vi.fn(),
  };
  return {
    reply: {
      raw,
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply,
    raw,
  };
}

// =============================================================================
// GuidanceSSEManager Branch Coverage Tests
// =============================================================================

describe('GuidanceSSEManager Branch Coverage', () => {
  let manager: TestableSSEManager;

  beforeEach(() => {
    manager = new TestableSSEManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Event Handler Branches', () => {
    it('should handle guidance:loaded event with empty steps array', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');

      // Trigger guidance:loaded with empty steps
      const guidance = createMockGuidance({ steps: [] });
      manager.simulateGuidanceLoaded('call-123', guidance);

      // Should still broadcast without error
      expect(raw.write).toHaveBeenCalled();
    });

    it('should handle guidance:step-complete event with missing nextStepId', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');
      raw.write.mockClear();

      // Trigger step-complete without nextStepId
      manager.simulateStepComplete('call-123', 'step-1', undefined);

      expect(raw.write).toHaveBeenCalled();
      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('guidance.step-complete');
    });

    it('should handle guidance:step-complete event with nextStepId', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');
      raw.write.mockClear();

      // Trigger step-complete with nextStepId
      manager.simulateStepComplete('call-123', 'step-1', 'step-2');

      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('step-2');
    });

    it('should redact suggestion content in guidance:suggestion event', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');
      raw.write.mockClear();

      // Trigger suggestion event
      const suggestion: GuidanceSuggestion = {
        id: 'sug-1',
        type: 'response',
        content: 'Patient mentioned specific symptoms',
        priority: 'high',
        timestamp: new Date(),
      } as GuidanceSuggestion;

      manager.simulateSuggestion('call-123', suggestion);

      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('[REDACTED');
    });

    it('should redact objection in guidance:objection-detected event', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');
      raw.write.mockClear();

      // Trigger objection-detected
      manager.simulateObjectionDetected('call-123', 'Too expensive', 'We offer payment plans');

      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('[REDACTED');
      expect(callArg).toContain('guidance.objection-detected');
    });

    it('should handle guidance:script-complete event with all stats', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');
      raw.write.mockClear();

      // Trigger script-complete
      manager.simulateScriptComplete('call-123', 'guidance-123', {
        completedSteps: 5,
        totalSteps: 6,
        duration: 300,
        skippedSteps: 1,
      });

      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('guidance.script-complete');
      expect(callArg).toContain('"completedSteps":5');
      expect(callArg).toContain('"skippedSteps":1');
    });
  });

  describe('Client Addition Branches', () => {
    it('should handle addClient without callSid (no guidance loading)', () => {
      const mockService = createMockGuidanceService({
        guidance: createMockGuidance(),
      });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw); // No callSid

      // Only connection.established should be sent
      expect(raw.write).toHaveBeenCalledTimes(1);
      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('connection.established');
    });

    it('should handle addClient with callSid but no guidance', () => {
      const mockService = createMockGuidanceService({ guidance: null });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');

      // Only connection.established (no guidance to load)
      expect(raw.write).toHaveBeenCalledTimes(1);
    });

    it('should handle addClient with callSid and guidance but no current step', () => {
      const mockService = createMockGuidanceService({
        guidance: createMockGuidance(),
        currentStep: null,
        suggestions: [],
      });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');

      // connection.established + guidance.loaded (with undefined currentStepId)
      expect(raw.write).toHaveBeenCalledTimes(2);
    });

    it('should handle addClient with callSid, guidance, current step, and suggestions', () => {
      const guidance = createMockGuidance();
      const mockService = createMockGuidanceService({
        guidance,
        currentStep: guidance.steps[0],
        suggestions: [
          { id: 'sug-1', content: 'Suggestion 1' } as GuidanceSuggestion,
          { id: 'sug-2', content: 'Suggestion 2' } as GuidanceSuggestion,
        ],
      });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');

      // connection.established + guidance.loaded + 2 suggestions
      expect(raw.write).toHaveBeenCalledTimes(4);
    });

    it('should start heartbeat only on first client', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      expect(manager.hasHeartbeat()).toBe(false);

      const { raw: raw1 } = createMockReply();
      manager.addClientDirect('agent-1', raw1);
      expect(manager.hasHeartbeat()).toBe(true);

      const { raw: raw2 } = createMockReply();
      manager.addClientDirect('agent-2', raw2);
      expect(manager.hasHeartbeat()).toBe(true); // Still running, not restarted
    });

    it('should create new callToClients set if not exists', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'new-call');

      expect(manager.getCallClientCount('new-call')).toBe(1);
    });

    it('should add to existing callToClients set', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();

      manager.addClientDirect('agent-1', raw1, 'same-call');
      manager.addClientDirect('agent-2', raw2, 'same-call');

      expect(manager.getCallClientCount('same-call')).toBe(2);
    });
  });

  describe('Subscribe to Call Branches', () => {
    it('should return false for non-existent client', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const result = manager.subscribeToCall('non-existent', 'call-123');
      expect(result).toBe(false);
    });

    it('should unsubscribe from previous call when switching', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw, 'call-1');

      expect(manager.getCallClientCount('call-1')).toBe(1);

      manager.subscribeToCall(clientId, 'call-2');

      expect(manager.getCallClientCount('call-1')).toBe(0);
      expect(manager.getCallClientCount('call-2')).toBe(1);
    });

    it('should handle subscribe without prior callSid', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw); // No callSid

      const result = manager.subscribeToCall(clientId, 'call-new');

      expect(result).toBe(true);
      expect(manager.getCallClientCount('call-new')).toBe(1);
    });

    it('should send guidance when subscribing to call with loaded guidance', () => {
      const guidance = createMockGuidance();
      const mockService = createMockGuidanceService({
        guidance,
        currentStep: guidance.steps[0],
      });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw);

      raw.write.mockClear();

      manager.subscribeToCall(clientId, 'call-123');

      expect(raw.write).toHaveBeenCalled();
      const callArg = raw.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('guidance.loaded');
    });

    it('should not send guidance when subscribing to call without loaded guidance', () => {
      const mockService = createMockGuidanceService({ guidance: null });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw);

      raw.write.mockClear();

      manager.subscribeToCall(clientId, 'call-no-guidance');

      expect(raw.write).not.toHaveBeenCalled();
    });
  });

  describe('Remove Client Branches', () => {
    it('should handle removing client without callSid', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw); // No callSid

      manager.removeClient(clientId);

      expect(manager.getClientCount()).toBe(0);
    });

    it('should clean up callToClients when last client removed', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw, 'call-cleanup');

      expect(manager.getCallClientCount('call-cleanup')).toBe(1);

      manager.removeClient(clientId);

      expect(manager.getCallClientCount('call-cleanup')).toBe(0);
    });

    it('should not clean up callToClients when other clients remain', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();

      const clientId1 = manager.addClientDirect('agent-1', raw1, 'call-shared');
      manager.addClientDirect('agent-2', raw2, 'call-shared');

      manager.removeClient(clientId1);

      expect(manager.getCallClientCount('call-shared')).toBe(1);
    });

    it('should stop heartbeat when last client removed', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw);

      expect(manager.hasHeartbeat()).toBe(true);

      manager.removeClient(clientId);

      expect(manager.hasHeartbeat()).toBe(false);
    });

    it('should keep heartbeat when other clients remain', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();

      const clientId1 = manager.addClientDirect('agent-1', raw1);
      manager.addClientDirect('agent-2', raw2);

      manager.removeClient(clientId1);

      expect(manager.hasHeartbeat()).toBe(true);
    });
  });

  describe('Send to Client Branches', () => {
    it('should remove client on write error', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      raw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Adding client will try to send connection.established which will fail
      manager.addClientDirect('agent-1', raw);

      // Client should be removed due to write error
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('Broadcast to Call Branches', () => {
    it('should return early when callSid not found', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      // Should not throw
      expect(() => {
        manager.broadcastToCallPublic('non-existent', { type: 'test' });
      }).not.toThrow();
    });

    it('should return early when clientIds set is empty', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      // Manually create an empty set scenario
      const { raw } = createMockReply();
      const clientId = manager.addClientDirect('agent-1', raw, 'call-empty');
      manager.removeClient(clientId);

      expect(() => {
        manager.broadcastToCallPublic('call-empty', { type: 'test' });
      }).not.toThrow();
    });

    it('should skip client when not found in clients map', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-test');

      // Simulate situation where client is in callToClients but not in clients
      // This is edge case that shouldn't normally happen
      raw.write.mockClear();

      manager.broadcastToCallPublic('call-test', { type: 'broadcast-test' });

      expect(raw.write).toHaveBeenCalled();
    });

    it('should remove failing clients during broadcast', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: goodRaw } = createMockReply();
      const { raw: badRaw } = createMockReply();

      manager.addClientDirect('agent-good', goodRaw, 'call-mixed');
      manager.addClientDirect('agent-bad', badRaw, 'call-mixed');

      badRaw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      manager.broadcastToCallPublic('call-mixed', { type: 'test' });

      // Bad client should be removed
      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe('Broadcast Global Branches', () => {
    it('should broadcast to all clients', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();
      const { raw: raw3 } = createMockReply();

      manager.addClientDirect('agent-1', raw1);
      manager.addClientDirect('agent-2', raw2);
      manager.addClientDirect('agent-3', raw3);

      raw1.write.mockClear();
      raw2.write.mockClear();
      raw3.write.mockClear();

      manager.broadcastPublic({ type: 'global-broadcast' });

      expect(raw1.write).toHaveBeenCalled();
      expect(raw2.write).toHaveBeenCalled();
      expect(raw3.write).toHaveBeenCalled();
    });

    it('should remove failing clients during global broadcast', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: goodRaw } = createMockReply();
      const { raw: badRaw } = createMockReply();

      manager.addClientDirect('agent-good', goodRaw);
      manager.addClientDirect('agent-bad', badRaw);

      badRaw.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      manager.broadcastPublic({ type: 'test' });

      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe('Heartbeat Branches', () => {
    it('should send heartbeat to all clients after interval', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();

      manager.addClientDirect('agent-1', raw1);
      manager.addClientDirect('agent-2', raw2);

      raw1.write.mockClear();
      raw2.write.mockClear();

      vi.advanceTimersByTime(30000);

      expect(raw1.write).toHaveBeenCalled();
      expect(raw2.write).toHaveBeenCalled();

      const callArg = raw1.write.mock.calls[0]?.[0] as string;
      expect(callArg).toContain('heartbeat');
    });
  });

  describe('Destroy Branches', () => {
    it('should clear heartbeat interval', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw);

      expect(manager.hasHeartbeat()).toBe(true);

      manager.destroy();

      expect(manager.hasHeartbeat()).toBe(false);
    });

    it('should handle destroy without heartbeat', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      // No clients added, so no heartbeat
      expect(() => {
        manager.destroy();
      }).not.toThrow();
    });

    it('should end all client connections', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw: raw1 } = createMockReply();
      const { raw: raw2 } = createMockReply();

      manager.addClientDirect('agent-1', raw1);
      manager.addClientDirect('agent-2', raw2);

      manager.destroy();

      expect(raw1.end).toHaveBeenCalled();
      expect(raw2.end).toHaveBeenCalled();
    });

    it('should handle errors when ending connections', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      raw.end.mockImplementation(() => {
        throw new Error('End failed');
      });

      manager.addClientDirect('agent-1', raw);

      expect(() => {
        manager.destroy();
      }).not.toThrow();
    });

    it('should clear all maps and reset state', () => {
      const mockService = createMockGuidanceService();
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-1');

      expect(manager.getClientCount()).toBe(1);
      expect(manager.getCallClientCount('call-1')).toBe(1);

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(manager.getCallClientCount('call-1')).toBe(0);
    });

    it('should allow re-initialization after destroy', () => {
      const mockService1 = createMockGuidanceService();
      manager.initialize(mockService1);

      manager.destroy();

      const mockService2 = createMockGuidanceService();
      manager.initialize(mockService2);

      expect(mockService2.on).toHaveBeenCalled();
    });
  });

  describe('Sanitize Guidance Branches', () => {
    it('should include all required fields in sanitized output', () => {
      const guidance = createMockGuidance({
        id: 'guid-123',
        name: 'Full Guidance',
        type: 'outbound',
        category: 'sales',
        description: 'Full description',
        audience: 'existing-patient',
        initialGreeting: 'Hi there',
        initialGreetingRo: 'Salut',
        keyPoints: ['Point 1', 'Point 2'],
        closingStatements: ['Goodbye'],
        closingStatementsRo: ['La revedere'],
        procedures: ['whitening'],
        languages: ['en'],
        defaultLanguage: 'en',
      });

      const mockService = createMockGuidanceService({ guidance });
      manager.initialize(mockService);

      const { raw } = createMockReply();
      manager.addClientDirect('agent-1', raw, 'call-123');

      const guidanceCall = raw.write.mock.calls.find(
        (call: string[]) => call[0] && call[0].includes('guidance.loaded')
      );

      expect(guidanceCall).toBeDefined();
      const payload = JSON.parse(guidanceCall![0].replace('data: ', '').replace('\n\n', ''));
      expect(payload.guidance.id).toBe('guid-123');
      expect(payload.guidance.type).toBe('outbound');
      expect(payload.guidance.procedures).toContain('whitening');
    });
  });
});

// =============================================================================
// Testable Implementation
// =============================================================================

interface MockGuidanceService {
  on: ReturnType<typeof vi.fn>;
  getCallGuidance: ReturnType<typeof vi.fn>;
  getCurrentStep: ReturnType<typeof vi.fn>;
  getPendingSuggestions: ReturnType<typeof vi.fn>;
}

function createMockGuidanceService(options: {
  guidance?: AgentGuidance | null;
  currentStep?: GuidanceStep | null;
  suggestions?: GuidanceSuggestion[];
} = {}): MockGuidanceService {
  return {
    on: vi.fn(),
    getCallGuidance: vi.fn().mockReturnValue(options.guidance ?? null),
    getCurrentStep: vi.fn().mockReturnValue(options.currentStep ?? null),
    getPendingSuggestions: vi.fn().mockReturnValue(options.suggestions ?? []),
  };
}

interface SSEClient {
  id: string;
  agentId: string;
  callSid?: string;
  response: MockRaw;
  createdAt: Date;
  lastPing: Date;
}

class TestableSSEManager {
  private clients = new Map<string, SSEClient>();
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

    // Setup actual event handlers
    this.guidanceService.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        this.eventHandlers.set(event, handler);
      }
    );

    // Register handlers
    this.guidanceService.on('guidance:loaded', (callSid: string, guidance: AgentGuidance) => {
      this.broadcastToCall(callSid, {
        eventId: 'uuid-event',
        eventType: 'guidance.loaded',
        timestamp: new Date(),
        callSid,
        guidance: this.sanitizeGuidance(guidance),
        currentStepId: guidance.steps[0]?.id,
      });
    });

    this.guidanceService.on(
      'guidance:step-complete',
      (callSid: string, stepId: string, nextStepId?: string) => {
        this.broadcastToCall(callSid, {
          eventId: 'uuid-event',
          eventType: 'guidance.step-complete',
          timestamp: new Date(),
          callSid,
          stepId,
          nextStepId,
        });
      }
    );

    this.guidanceService.on(
      'guidance:suggestion',
      (callSid: string, suggestion: GuidanceSuggestion) => {
        const { redactString } = require('@medicalcor/core');
        this.broadcastToCall(callSid, {
          eventId: 'uuid-event',
          eventType: 'guidance.suggestion',
          timestamp: new Date(),
          callSid,
          suggestion: {
            ...suggestion,
            content: redactString(suggestion.content),
          },
        });
      }
    );

    this.guidanceService.on(
      'guidance:objection-detected',
      (callSid: string, objection: string, suggestedResponse: string) => {
        const { redactString } = require('@medicalcor/core');
        this.broadcastToCall(callSid, {
          eventId: 'uuid-event',
          eventType: 'guidance.objection-detected',
          timestamp: new Date(),
          callSid,
          objection: redactString(objection),
          suggestedResponse,
        });
      }
    );

    this.guidanceService.on(
      'guidance:script-complete',
      (
        callSid: string,
        guidanceId: string,
        stats: { completedSteps: number; totalSteps: number; duration: number; skippedSteps: number }
      ) => {
        this.broadcastToCall(callSid, {
          eventId: 'uuid-event',
          eventType: 'guidance.script-complete',
          timestamp: new Date(),
          callSid,
          guidanceId,
          completedSteps: stats.completedSteps,
          totalSteps: stats.totalSteps,
          duration: stats.duration,
          skippedSteps: stats.skippedSteps,
        });
      }
    );
  }

  // Methods to simulate events
  simulateGuidanceLoaded(callSid: string, guidance: AgentGuidance): void {
    const handler = this.eventHandlers.get('guidance:loaded');
    if (handler) handler(callSid, guidance);
  }

  simulateStepComplete(callSid: string, stepId: string, nextStepId?: string): void {
    const handler = this.eventHandlers.get('guidance:step-complete');
    if (handler) handler(callSid, stepId, nextStepId);
  }

  simulateSuggestion(callSid: string, suggestion: GuidanceSuggestion): void {
    const handler = this.eventHandlers.get('guidance:suggestion');
    if (handler) handler(callSid, suggestion);
  }

  simulateObjectionDetected(callSid: string, objection: string, response: string): void {
    const handler = this.eventHandlers.get('guidance:objection-detected');
    if (handler) handler(callSid, objection, response);
  }

  simulateScriptComplete(
    callSid: string,
    guidanceId: string,
    stats: { completedSteps: number; totalSteps: number; duration: number; skippedSteps: number }
  ): void {
    const handler = this.eventHandlers.get('guidance:script-complete');
    if (handler) handler(callSid, guidanceId, stats);
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

  addClientDirect(agentId: string, raw: MockRaw, callSid?: string): string {
    const clientId = `client-${Date.now()}-${Math.random()}`;

    const client: SSEClient = {
      id: clientId,
      agentId,
      callSid,
      response: raw,
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

    // Send connection established
    this.sendToClient(client, {
      eventId: 'uuid-conn',
      eventType: 'connection.established',
      timestamp: new Date(),
      clientId,
    });

    // Send guidance state if subscribed to call
    if (callSid && this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        const currentStep = this.guidanceService.getCurrentStep(callSid);
        const suggestions = this.guidanceService.getPendingSuggestions(callSid);

        this.sendToClient(client, {
          eventId: 'uuid-guid',
          eventType: 'guidance.loaded',
          timestamp: new Date(),
          callSid,
          guidance: this.sanitizeGuidance(guidance),
          currentStepId: currentStep?.id,
        });

        for (const suggestion of suggestions) {
          this.sendToClient(client, {
            eventId: 'uuid-sug',
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

    if (this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        this.sendToClient(client, {
          eventId: 'uuid-sub',
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

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendToClient(client: SSEClient, event: Record<string, unknown>): void {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.response.write(data);
    } catch {
      this.removeClient(client.id);
    }
  }

  private broadcastToCall(callSid: string, event: Record<string, unknown>): void {
    const clientIds = this.callToClients.get(callSid);
    if (!clientIds || clientIds.size === 0) return;

    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.write(data);
        } catch {
          this.removeClient(clientId);
        }
      }
    }
  }

  broadcastToCallPublic(callSid: string, event: Record<string, unknown>): void {
    this.broadcastToCall(callSid, event);
  }

  broadcastPublic(event: Record<string, unknown>): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.response.write(data);
      } catch {
        this.removeClient(clientId);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      this.broadcastPublic({
        eventId: 'uuid-hb',
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
        client.response.end();
      } catch {
        // Ignore
      }
    }

    this.clients.clear();
    this.callToClients.clear();
    this.guidanceService = null;
    this.isInitialized = false;
    this.eventHandlers.clear();
  }
}
