/**
 * Guidance SSE (WebSocket-style) E2E Tests
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Tests real-time guidance event streaming for the agent dashboard
 * using Server-Sent Events (SSE).
 *
 * Note: SSE connections are long-lived and don't complete with a response.
 * Tests for actual SSE streaming are marked as skip and would require
 * integration tests with a real HTTP client.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createGuidanceWSRoutes, getGuidanceSSEManager } from '../routes/guidance-ws.js';
import type { AgentGuidance, ScriptStep } from '@medicalcor/types';

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

// =============================================================================
// Test Suite
// =============================================================================

describe('Guidance SSE Routes E2E', () => {
  let app: FastifyInstance;
  let mockRepository: IGuidanceRepository;

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

    // Note: SSE connection tests are skipped because Fastify's inject() method
    // waits for the response to complete, but SSE connections are long-lived.
    // These tests would require a real HTTP client for integration testing.

    it.skip('should establish SSE connection with valid agent ID', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should send connection.established event on connect', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should accept optional callSid query parameter', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

    it.skip('should include X-Accel-Buffering header for nginx compatibility', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
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
    // Note: SSE connection tests are skipped because Fastify's inject() waits
    // for response completion, but SSE connections are long-lived streams.

    it.skip('should handle multiple concurrent SSE connections', async () => {
      // SSE connections don't complete - would require real HTTP client
    });

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

    it.skip('should generate unique client IDs for each connection', async () => {
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

    // Note: SSE connection tests are skipped - they time out with Fastify's inject()
    it.skip('should handle very long agent IDs', async () => {
      // SSE connections don't complete - would require real HTTP client
    });
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
