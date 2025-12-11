/**
 * Guidance SSE (WebSocket-style) E2E Tests
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Tests real-time guidance event streaming for the agent dashboard
 * using Server-Sent Events (SSE).
 *
 * Uses real HTTP connections with timeout-based SSE testing to verify
 * SSE connections work correctly.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createGuidanceWSRoutes, getGuidanceSSEManager } from '../routes/guidance-ws.js';
import type { AgentGuidance, ScriptStep } from '@medicalcor/types';
import http from 'node:http';

// Mock the domain module to avoid transitive dependency issues
vi.mock('@medicalcor/domain', () => {
  const EventEmitter = require('events').EventEmitter;

  class MockGuidanceService extends EventEmitter {
    getCallGuidance = vi.fn(() => null);
    getCurrentStep = vi.fn(() => null);
    getPendingSuggestions = vi.fn(() => []);
  }

  return {
    GuidanceService: MockGuidanceService,
  };
});

/**
 * Creates a mock IGuidanceRepository for testing
 */
interface IGuidanceRepository {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  createVersion: ReturnType<typeof vi.fn>;
  getVersionHistory: ReturnType<typeof vi.fn>;
  findForCall: ReturnType<typeof vi.fn>;
  incrementUsage: ReturnType<typeof vi.fn>;
  updateMetrics: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Mock Implementations
// =============================================================================

/**
 * Creates a mock IGuidanceRepository for testing
 */
function createMockRepository(): IGuidanceRepository {
  const mockGuidance: Partial<AgentGuidance> = {
    id: 'guidance-123',
    clinicId: 'clinic-1',
    name: 'Initial Consultation Script',
    type: 'call-script',
    category: 'consultation',
    description: 'Script for initial patient consultation calls',
    audience: 'new-patient',
    initialGreeting: 'Hello, thank you for calling!',
    initialGreetingRo: 'Bună ziua, vă mulțumim că ați sunat!',
    steps: [
      {
        id: 'step-1',
        order: 1,
        name: 'Greeting',
        script: 'Welcome the patient warmly',
        scriptRo: 'Întâmpinați pacientul cu căldură',
        duration: 30,
        isRequired: true,
      },
      {
        id: 'step-2',
        order: 2,
        name: 'Needs Assessment',
        script: 'Ask about their dental concerns',
        scriptRo: 'Întrebați despre problemele dentare',
        duration: 60,
        isRequired: true,
      },
    ] as ScriptStep[],
    keyPoints: [
      {
        id: 'kp-1',
        content: 'Emphasize our expertise',
        contentRo: 'Subliniați expertiza noastră',
        priority: 'high',
        triggers: ['experience', 'expertise'],
      },
    ],
    objectionHandlers: [
      {
        id: 'oh-1',
        category: 'price',
        objectionPatterns: ['expensive', 'too much'],
        response: 'We offer flexible payment plans',
        responseRo: 'Oferim planuri de plată flexibile',
        priority: 'high',
      },
    ],
    closingStatements: ['Thank you for your interest'],
    closingStatementsRo: ['Vă mulțumim pentru interes'],
    procedures: ['all-on-x', 'implants'],
    languages: ['en', 'ro'],
    defaultLanguage: 'ro',
    status: 'active',
    isPublished: true,
    version: 1,
    usageCount: 0,
    avgCallDuration: 0,
    successRate: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['consultation', 'new-patient'],
  };

  return {
    create: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    update: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    findById: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    list: vi.fn().mockResolvedValue({
      success: true,
      data: { items: [mockGuidance], total: 1, page: 1, pageSize: 10, totalPages: 1 },
    }),
    search: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    activate: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    deactivate: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    publish: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    createVersion: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    getVersionHistory: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    findForCall: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    incrementUsage: vi.fn().mockResolvedValue({ success: true }),
    updateMetrics: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as IGuidanceRepository;
}

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

describe('Guidance SSE Routes E2E', () => {
  let app: FastifyInstance;
  let mockRepository: IGuidanceRepository;
  let serverPort: number;

  beforeAll(async () => {
    mockRepository = createMockRepository();
    app = Fastify({ logger: false });

    const routes = createGuidanceWSRoutes(mockRepository);
    await app.register(routes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Additional suite for real SSE connections
  describe('Real SSE Connections', () => {
    let sseApp: FastifyInstance;
    let sseServerPort: number;

    beforeEach(async () => {
      sseApp = Fastify({ logger: false });
      const routes = createGuidanceWSRoutes(createMockRepository());
      await sseApp.register(routes);
      await sseApp.ready();
      // Listen on random available port
      const address = await sseApp.listen({ port: 0, host: '127.0.0.1' });
      const match = address.match(/:(\d+)$/);
      sseServerPort = match ? parseInt(match[1], 10) : 0;
    });

    afterEach(async () => {
      await sseApp.close();
    });

    it('should establish SSE connection with valid agent ID', async () => {
      const { events, headers } = await createSSEConnection(
        sseServerPort,
        '/guidance/events',
        { 'x-agent-id': 'agent-123' },
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
        '/guidance/events',
        { 'x-agent-id': 'agent-456' },
        300
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
      const connectionEvent = events[0];
      expect(connectionEvent.eventType).toBe('connection.established');
      expect(connectionEvent.clientId).toBeDefined();
      expect(connectionEvent.timestamp).toBeDefined();
      expect(connectionEvent.eventId).toBeDefined();
    });

    it('should accept optional callSid query parameter', async () => {
      const { events } = await createSSEConnection(
        sseServerPort,
        '/guidance/events?callSid=CA123',
        { 'x-agent-id': 'agent-789' },
        300
      );

      expect(events.length).toBeGreaterThan(0);
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
    });

    it('should include X-Accel-Buffering header for nginx compatibility', async () => {
      const { headers } = await createSSEConnection(
        sseServerPort,
        '/guidance/events',
        { 'x-agent-id': 'agent-nginx' },
        300
      );

      expect(headers['x-accel-buffering']).toBe('no');
    });

    it('should generate unique client IDs for each connection', async () => {
      const [conn1, conn2] = await Promise.all([
        createSSEConnection(sseServerPort, '/guidance/events', { 'x-agent-id': 'agent-a' }, 300),
        createSSEConnection(sseServerPort, '/guidance/events', { 'x-agent-id': 'agent-b' }, 300),
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
        createSSEConnection(sseServerPort, '/guidance/events', { 'x-agent-id': 'agent-1' }, 300),
        createSSEConnection(sseServerPort, '/guidance/events', { 'x-agent-id': 'agent-2' }, 300),
        createSSEConnection(sseServerPort, '/guidance/events', { 'x-agent-id': 'agent-3' }, 300),
      ]);

      connections.forEach((conn) => {
        expect(conn.events.length).toBeGreaterThan(0);
        const connectionEvent = conn.events.find((e) => e.eventType === 'connection.established');
        expect(connectionEvent).toBeDefined();
      });
    });

    it('should handle very long agent IDs', async () => {
      const longAgentId = 'agent-' + 'x'.repeat(500);
      const { events } = await createSSEConnection(
        sseServerPort,
        '/guidance/events',
        { 'x-agent-id': longAgentId },
        300
      );

      // Should still establish connection
      expect(events.length).toBeGreaterThan(0);
      const connectionEvent = events.find((e) => e.eventType === 'connection.established');
      expect(connectionEvent).toBeDefined();
    });

    describe('SSE Event Format', () => {
      it('should include eventId in all events', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/guidance/events',
          { 'x-agent-id': 'agent-format-1' },
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
          '/guidance/events',
          { 'x-agent-id': 'agent-format-2' },
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
          '/guidance/events',
          { 'x-agent-id': 'agent-format-3' },
          300
        );

        events.forEach((event) => {
          expect(event.timestamp).toBeDefined();
        });
      });

      it('should format SSE data correctly', async () => {
        const { events } = await createSSEConnection(
          sseServerPort,
          '/guidance/events',
          { 'x-agent-id': 'agent-format-4' },
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
  // GET /guidance/events - SSE Connection
  // ==========================================================================

  describe('GET /guidance/events', () => {
    it('should require x-agent-id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string };
      expect(body.error).toBe('x-agent-id header is required');
    });

    it('should return 400 for missing agent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events',
        headers: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body.error).toContain('x-agent-id');
      expect(body.correlationId).toBeDefined();
    });

    // Note: Real SSE connection tests are in the 'Real SSE Connections' describe block above
    // which uses actual HTTP connections with timeout-based testing
  });

  // ==========================================================================
  // POST /guidance/events/subscribe - Call Subscription
  // ==========================================================================

  describe('POST /guidance/events/subscribe', () => {
    it('should require clientId and callSid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string };
      expect(body.error).toContain('clientId');
    });

    it('should return 400 when clientId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {
          callSid: 'CA123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body.error).toContain('clientId');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 400 when callSid is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {
          clientId: 'client-123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body.error).toContain('callSid');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 404 for non-existent client', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {
          clientId: 'non-existent-client',
          callSid: 'CA123',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as { error: string };
      expect(body.error).toBe('Client not found');
    });

    it('should include correlationId in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {
          clientId: 'some-client',
          callSid: 'CA123',
        },
      });

      const body = JSON.parse(response.body) as { correlationId: string };
      expect(body.correlationId).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /guidance/events/status - Connection Status
  // ==========================================================================

  describe('GET /guidance/events/status', () => {
    it('should return connection status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events/status',
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
        url: '/guidance/events/status',
      });

      const body = JSON.parse(response.body) as { connectedClients: number };
      expect(typeof body.connectedClients).toBe('number');
      expect(body.connectedClients).toBeGreaterThanOrEqual(0);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events/status',
      });

      const body = JSON.parse(response.body) as { timestamp: string };
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBeDefined();
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    // Note: Real SSE connection tests are in the 'Real SSE Connections' describe block
    // which uses actual HTTP connections with timeout-based testing

    it('should handle rapid sequential requests gracefully', async () => {
      const requests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: '/guidance/events/status',
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
        url: '/guidance/events',
        headers: { 'x-agent-id': 'agent-123' },
      });

      // Should return 404 (route not found for PUT)
      expect(response.statusCode).toBe(404);
    });

    it('should handle malformed subscribe payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: 'not-json',
        headers: { 'content-type': 'text/plain' },
      });

      // Should handle gracefully (either 400 or 415)
      expect([400, 415, 500]).toContain(response.statusCode);
    });

    it('should return consistent error format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events',
        // Missing required header
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string; correlationId: string };
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('correlationId');
    });
  });

  // ==========================================================================
  // SSE Event Format Tests
  // Note: Real SSE event format tests are in the 'Real SSE Connections' describe block
  // which uses actual HTTP connections with timeout-based testing
  // ==========================================================================

  // ==========================================================================
  // CORS and Security Tests
  // ==========================================================================

  describe('Security', () => {
    it('should not expose internal error details', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/events/subscribe',
        payload: {
          clientId: 'invalid',
          callSid: 'invalid',
        },
      });

      const body = JSON.parse(response.body) as { error: string };
      // Should not expose stack traces or internal details
      expect(body.error).not.toContain('stack');
      expect(body.error).not.toContain('node_modules');
    });

    it('should handle empty headers gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/events',
        headers: {
          'x-agent-id': '',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    // Note: Real SSE connection test for long agent IDs is in the 'Real SSE Connections' block
  });

  // ==========================================================================
  // getGuidanceSSEManager Tests
  // ==========================================================================

  describe('getGuidanceSSEManager', () => {
    it('should return the SSE manager', () => {
      const manager = getGuidanceSSEManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getClientCount).toBe('function');
    });

    it('should return same instance on multiple calls', () => {
      const manager1 = getGuidanceSSEManager();
      const manager2 = getGuidanceSSEManager();
      expect(manager1).toBe(manager2);
    });
  });
});
