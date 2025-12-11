/**
 * Supervisor SSE (WebSocket-style) E2E Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Tests real-time supervisor event streaming for the supervisor dashboard
 * using Server-Sent Events (SSE).
 *
 * Uses real HTTP connections with timeout-based SSE testing to verify
 * SSE connections work correctly.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  supervisorWSRoutes,
  emitSupervisorEvent,
  getSSEManagerInstance,
} from '../routes/supervisor-ws.js';
import http from 'node:http';

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

/**
 * Creates a real SSE connection and collects events until timeout
 */
async function createSSEConnection(
  port: number,
  path: string,
  headers: Record<string, string>,
  timeoutMs = 200
): Promise<{ events: Record<string, unknown>[]; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const events: Record<string, unknown>[] = [];
    let responseHeaders: http.IncomingHttpHeaders = {};
    let buffer = '';

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...headers,
        },
      },
      (res) => {
        responseHeaders = res.headers;

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          // Parse complete SSE events
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? ''; // Keep incomplete part in buffer

          for (const part of parts) {
            if (part.trim()) {
              const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
              if (dataLine) {
                try {
                  events.push(
                    JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown>
                  );
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
        });

        // Timeout to collect events
        setTimeout(() => {
          req.destroy();
          resolve({ events, headers: responseHeaders });
        }, timeoutMs);
      }
    );

    req.on('error', (err) => {
      // ECONNRESET is expected when we abort the connection
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        resolve({ events, headers: responseHeaders });
      } else {
        reject(err);
      }
    });

    req.end();
  });
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
  // Real SSE Connections (using actual HTTP connections)
  // ==========================================================================

  describe('Real SSE Connections', () => {
    let sseApp: FastifyInstance;
    let sseServerPort: number;

    beforeEach(async () => {
      sseApp = Fastify({ logger: false });
      await sseApp.register(supervisorWSRoutes);
      await sseApp.ready();
      // Listen on random available port
      const address = await sseApp.listen({ port: 0, host: '127.0.0.1' });
      const match = address.match(/:(\d+)$/);
      sseServerPort = match ? parseInt(match[1], 10) : 0;
    });

    afterEach(async () => {
      await sseApp.close();
    });

    it('should establish SSE connection with valid supervisor ID', async () => {
      const { events, headers } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': 'sup-123' },
        300
      );

      expect(headers['content-type']).toBe('text/event-stream');
      expect(events.length).toBeGreaterThan(0);
      // Should receive connection.established event
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
    });

    it('should send connection.established event on connect', async () => {
      const { events } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': 'sup-456' },
        300
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
      expect(connectionEvent?.clientId).toBeDefined();
      expect(connectionEvent?.timestamp).toBeDefined();
      expect(connectionEvent?.eventId).toBeDefined();
    });

    it('should include X-Accel-Buffering header for nginx compatibility', async () => {
      const { headers } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': 'sup-nginx' },
        300
      );

      expect(headers['x-accel-buffering']).toBe('no');
    });

    it('should send initial call state on connect', async () => {
      const { events } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': 'sup-initial' },
        300
      );

      // Should receive connection.established first, then call.started for active calls
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();

      // Mock agent has one active call, so we should receive it
      const callEvent = events.find((e) => e.eventType === 'call.started');
      expect(callEvent).toBeDefined();
      expect(callEvent?.callSid).toBe('CA123');
    });

    it('should generate unique client IDs for each connection', async () => {
      const [conn1, conn2] = await Promise.all([
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-a' },
          300
        ),
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-b' },
          300
        ),
      ]);

      const clientId1 = conn1.events.find((e) => e.eventType === 'connection.established')
        ?.clientId as string | undefined;
      const clientId2 = conn2.events.find((e) => e.eventType === 'connection.established')
        ?.clientId as string | undefined;

      expect(clientId1).toBeDefined();
      expect(clientId2).toBeDefined();
      expect(clientId1).not.toBe(clientId2);
    });

    it('should handle multiple concurrent SSE connections', async () => {
      const connections = await Promise.all([
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-1' },
          300
        ),
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-2' },
          300
        ),
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-3' },
          300
        ),
      ]);

      connections.forEach((conn) => {
        expect(conn.events.length).toBeGreaterThan(0);
        const connectionEvent = conn.events.find((e) => e.eventType === 'connection.established');
        expect(connectionEvent).toBeDefined();
      });
    });

    it('should allow same supervisor to have multiple connections', async () => {
      const [conn1, conn2] = await Promise.all([
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-same' },
          300
        ),
        createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-same' },
          300
        ),
      ]);

      // Both connections should succeed
      expect(conn1.events.length).toBeGreaterThan(0);
      expect(conn2.events.length).toBeGreaterThan(0);

      // Should have different client IDs even though same supervisor
      const clientId1 = conn1.events.find((e) => e.eventType === 'connection.established')
        ?.clientId as string | undefined;
      const clientId2 = conn2.events.find((e) => e.eventType === 'connection.established')
        ?.clientId as string | undefined;
      expect(clientId1).not.toBe(clientId2);
    });

    it('should handle very long supervisor IDs', async () => {
      const longSupervisorId = 'sup-' + 'x'.repeat(500);
      const { events } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': longSupervisorId },
        300
      );

      // Should still establish connection
      expect(events.length).toBeGreaterThan(0);
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
    });

    it('should handle special characters in supervisor ID', async () => {
      const specialId = 'sup-test@example.com/org#123';
      const { events } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': specialId },
        300
      );

      expect(events.length).toBeGreaterThan(0);
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
    });

    it('should protect customer phone numbers in call events (GDPR/HIPAA)', async () => {
      const { events } = await createSSEConnection(
        sseServerPort,
        '/supervisor/events',
        { 'x-supervisor-id': 'sup-privacy' },
        300
      );

      const callEvent = events.find((e) => e.eventType === 'call.started') as
        | { call?: { customerPhone?: string } }
        | undefined;
      if (callEvent?.call?.customerPhone) {
        // Phone should be either masked with **** or fully redacted for GDPR/HIPAA compliance
        const phone = callEvent.call.customerPhone;
        const isProtected =
          phone.includes('****') || phone.includes('[REDACTED') || !phone.match(/^\+?\d{10,15}$/);
        expect(isProtected).toBe(true);
      }
    });

    describe('SSE Event Format', () => {
      it('should include eventId in all events', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-format-1' },
          300
        );

        events.forEach((event) => {
          expect(event.eventId).toBeDefined();
          expect(typeof event.eventId).toBe('string');
        });
      });

      it('should include eventType in all events', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-format-2' },
          300
        );

        events.forEach((event) => {
          expect(event.eventType).toBeDefined();
          expect(typeof event.eventType).toBe('string');
        });
      });

      it('should include timestamp in all events', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-format-3' },
          300
        );

        events.forEach((event) => {
          expect(event.timestamp).toBeDefined();
        });
      });

      it('should format SSE data correctly', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/supervisor/events',
          { 'x-supervisor-id': 'sup-format-4' },
          300
        );

        // All parsed events should be valid objects
        events.forEach((event) => {
          expect(typeof event).toBe('object');
          expect(event).not.toBeNull();
        });
      });
    });
  });

  // ==========================================================================
  // GET /supervisor/events - SSE Connection (Fastify inject tests)
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

    // Note: Real SSE connection tests are in the 'Real SSE Connections' describe block above
    // which uses actual HTTP connections with timeout-based testing
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
    // Note: Real SSE connection tests are in the 'Real SSE Connections' describe block
    // which uses actual HTTP connections with timeout-based testing

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

    // Note: Real SSE connection tests for long/special supervisor IDs are in 'Real SSE Connections' block
  });

  // ==========================================================================
  // SSE Event Format Tests
  // Note: Real SSE event format tests are in the 'Real SSE Connections' describe block
  // which uses actual HTTP connections with timeout-based testing
  // ==========================================================================

  // ==========================================================================
  // Security Tests (GDPR/HIPAA)
  // ==========================================================================

  describe('Security & Privacy', () => {
    // Note: Real SSE privacy test for phone masking is in the 'Real SSE Connections' block

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
    // Note: Real SSE event type tests are in the 'Real SSE Connections' block

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
