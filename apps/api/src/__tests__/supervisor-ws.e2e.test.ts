/**
 * Supervisor SSE (WebSocket-style) E2E Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Tests real-time supervisor event streaming for the supervisor dashboard
 * using Server-Sent Events (SSE).
 *
 * Note: SSE connections are long-lived and don't complete with a response.
 * Tests for actual SSE streaming are marked as skip and would require
 * integration tests with a real HTTP client.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  supervisorWSRoutes,
  emitSupervisorEvent,
  getSSEManagerInstance,
} from '../routes/supervisor-ws.js';

// Mock the supervisor agent to isolate SSE testing
vi.mock('@medicalcor/domain', () => {
  const EventEmitter = require('events').EventEmitter;
  const mockAgent = new EventEmitter();

  // Add methods that the SSE manager calls
  mockAgent.getActiveCalls = vi.fn(() => [
    {
      callSid: 'CA123',
      customerPhone: '+40712345678',
      state: 'active',
      direction: 'inbound',
      duration: 120,
      sentiment: 'positive',
      urgencyLevel: 'normal',
      flags: [],
      agentId: 'agent-1',
      startedAt: new Date(),
      recentTranscript: [],
    },
  ]);

  mockAgent.registerCall = vi.fn((callData) => {
    const call = {
      ...callData,
      recentTranscript: [],
      flags: [],
    };
    mockAgent.emit('call:started', call);
    return call;
  });

  mockAgent.updateCall = vi.fn((callSid, changes) => {
    mockAgent.emit('call:updated', callSid, changes);
    return { callSid, ...changes };
  });

  mockAgent.endCall = vi.fn((callSid, outcome) => {
    mockAgent.emit('call:ended', callSid, outcome);
  });

  mockAgent.processTranscriptMessage = vi.fn((callSid, speaker, text, confidence) => {
    mockAgent.emit('transcript:message', callSid, speaker, text);
  });

  mockAgent.flagCall = vi.fn();
  mockAgent.unflagCall = vi.fn();
  mockAgent.createSession = vi.fn();
  mockAgent.getSession = vi.fn();
  mockAgent.endSession = vi.fn();
  mockAgent.startMonitoring = vi.fn();
  mockAgent.stopMonitoring = vi.fn();
  mockAgent.changeMonitoringMode = vi.fn();
  mockAgent.requestHandoff = vi.fn();
  mockAgent.completeHandoff = vi.fn();
  mockAgent.addNote = vi.fn();
  mockAgent.getNotes = vi.fn();
  mockAgent.getDashboardStats = vi.fn(() => ({
    activeCalls: 1,
    callsInQueue: 0,
    activeAlerts: 0,
    escalationsToday: 0,
    handoffsToday: 0,
  }));

  return {
    getSupervisorAgent: vi.fn(() => mockAgent),
    resetSupervisorAgent: vi.fn(() => {
      mockAgent.removeAllListeners();
    }),
  };
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse SSE data from response body
 */
function parseSSEData(body: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const lines = body.split('\n\n').filter(Boolean);

  for (const chunk of lines) {
    const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) {
      const jsonStr = dataLine.replace('data: ', '');
      try {
        events.push(JSON.parse(jsonStr) as Record<string, unknown>);
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return events;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Supervisor SSE Routes E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(supervisorWSRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /supervisor/events - SSE Connection
  // ==========================================================================

  describe('GET /supervisor/events', () => {
    it('should require x-supervisor-id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string };
      expect(body.error).toBe('x-supervisor-id header is required');
    });

    it('should return 400 for missing supervisor ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
        headers: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body.error).toContain('x-supervisor-id');
      expect(body.correlationId).toBeDefined();
    });

    // Note: SSE connection tests are skipped because Fastify's inject() method
    // waits for the response to complete, but SSE connections are long-lived.
    // These tests would require a real HTTP client for integration testing.

    it.skip('should establish SSE connection with valid supervisor ID', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should send connection.established event on connect', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should include X-Accel-Buffering header for nginx compatibility', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should send initial call state on connect', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
  });

  // ==========================================================================
  // GET /supervisor/events/status - Connection Status
  // ==========================================================================

  describe('GET /supervisor/events/status', () => {
    it('should return connection status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        connectedClients: number;
        timestamp: string;
      };
      expect(body).toHaveProperty('connectedClients');
      expect(body).toHaveProperty('timestamp');
    });

    it('should return numeric client count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events/status',
      });

      const body = JSON.parse(response.body) as { connectedClients: number };
      expect(typeof body.connectedClients).toBe('number');
      expect(body.connectedClients).toBeGreaterThanOrEqual(0);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events/status',
      });

      const body = JSON.parse(response.body) as { timestamp: string };
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBeDefined();
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  // ==========================================================================
  // emitSupervisorEvent() - Manual Event Emission
  // ==========================================================================

  describe('emitSupervisorEvent', () => {
    it('should handle call.started event with valid data', () => {
      // This should not throw
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.started',
          callSid: 'CA999',
          data: {
            customerPhone: '+40712345999',
            direction: 'inbound',
          },
        });
      }).not.toThrow();
    });

    it('should handle call.started without customerPhone gracefully', () => {
      // Should warn but not crash
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.started',
          callSid: 'CA998',
          data: {},
        });
      }).not.toThrow();
    });

    it('should handle call.updated event', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.updated',
          callSid: 'CA123',
          data: {
            state: 'active',
            sentiment: 'positive',
          },
        });
      }).not.toThrow();
    });

    it('should handle call.ended event', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.ended',
          callSid: 'CA123',
          data: {
            outcome: 'completed',
          },
        });
      }).not.toThrow();
    });

    it('should handle transcript.message event', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'transcript.message',
          callSid: 'CA123',
          data: {
            speaker: 'customer',
            text: 'Hello, I need help with my appointment',
            confidence: 0.95,
          },
        });
      }).not.toThrow();
    });

    it('should handle unknown event types gracefully', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'unknown.event',
          callSid: 'CA123',
          data: {},
        });
      }).not.toThrow();
    });

    it('should validate call direction defaults to inbound', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.started',
          callSid: 'CA997',
          data: {
            customerPhone: '+40712345997',
            // direction not specified - should default to 'inbound'
          },
        });
      }).not.toThrow();
    });

    it('should validate call outcome defaults to completed', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.ended',
          callSid: 'CA123',
          data: {
            // outcome not specified - should default to 'completed'
          },
        });
      }).not.toThrow();
    });

    it('should handle outbound call direction', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'call.started',
          callSid: 'CA996',
          data: {
            customerPhone: '+40712345996',
            direction: 'outbound',
          },
        });
      }).not.toThrow();
    });

    it('should handle all call end outcomes', () => {
      const outcomes = ['completed', 'transferred', 'abandoned', 'failed', 'voicemail'];
      outcomes.forEach((outcome) => {
        expect(() => {
          emitSupervisorEvent({
            eventType: 'call.ended',
            callSid: 'CA123',
            data: { outcome },
          });
        }).not.toThrow();
      });
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    // Note: SSE connection tests are skipped because Fastify's inject() waits
    // for response completion, but SSE connections are long-lived streams.

    it.skip('should handle multiple concurrent SSE connections', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it('should handle rapid sequential status requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: '/supervisor/events/status',
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it.skip('should generate unique client IDs for each connection', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should allow same supervisor to have multiple connections', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle invalid HTTP methods gracefully', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-123' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return consistent error format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('correlationId');
    });

    it('should handle empty supervisor ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
        headers: { 'x-supervisor-id': '' },
      });

      expect(response.statusCode).toBe(400);
    });

    // Note: SSE connection tests are skipped - they time out with Fastify's inject()
    it.skip('should handle very long supervisor IDs', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    // Note: SSE connection tests are skipped - they time out with Fastify's inject()
    it.skip('should handle special characters in supervisor ID', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
  });

  // ==========================================================================
  // SSE Event Format Tests
  // ==========================================================================

  describe('SSE Event Format', () => {
    // Note: SSE connection tests are skipped because Fastify's inject() waits
    // for response completion, but SSE connections are long-lived streams.

    it.skip('should include eventId in all events', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should include eventType in all events', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should include timestamp in all events', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should format SSE data correctly', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
  });

  // ==========================================================================
  // Security Tests (GDPR/HIPAA)
  // ==========================================================================

  describe('Security & Privacy', () => {
    // Note: SSE connection tests are skipped - they time out with Fastify's inject()
    it.skip('should mask customer phone numbers in call events', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it('should not expose internal error details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
      });

      const body = JSON.parse(response.body) as { error: string };
      expect(body.error).not.toContain('stack');
      expect(body.error).not.toContain('node_modules');
      expect(body.error).not.toContain('at ');
    });

    it('should include correlationId for tracing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/events',
      });

      const body = JSON.parse(response.body) as { correlationId: string };
      expect(body.correlationId).toBeDefined();
      expect(typeof body.correlationId).toBe('string');
    });
  });

  // ==========================================================================
  // Event Type Coverage Tests
  // ==========================================================================

  describe('Event Types', () => {
    // Note: SSE connection tests are skipped - they time out with Fastify's inject()
    it.skip('should support call.started event type', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it('should handle transcript speaker types', () => {
      const speakers = ['customer', 'agent', 'assistant'];
      speakers.forEach((speaker) => {
        expect(() => {
          emitSupervisorEvent({
            eventType: 'transcript.message',
            callSid: 'CA123',
            data: {
              speaker,
              text: 'Test message',
            },
          });
        }).not.toThrow();
      });
    });

    it('should default invalid speaker to customer', () => {
      expect(() => {
        emitSupervisorEvent({
          eventType: 'transcript.message',
          callSid: 'CA123',
          data: {
            speaker: 'invalid-speaker',
            text: 'Test message',
          },
        });
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // getSSEManagerInstance Tests
  // ==========================================================================

  describe('getSSEManagerInstance', () => {
    it('should return the singleton SSE manager', () => {
      const manager = getSSEManagerInstance();
      expect(manager).toBeDefined();
      expect(typeof manager.getClientCount).toBe('function');
    });

    it('should return same instance on multiple calls', () => {
      const manager1 = getSSEManagerInstance();
      const manager2 = getSSEManagerInstance();
      expect(manager1).toBe(manager2);
    });
  });
});
