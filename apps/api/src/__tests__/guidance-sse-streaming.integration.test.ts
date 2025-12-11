/**
 * Guidance SSE Streaming Integration Tests
 *
 * Tests real SSE streaming behavior for the guidance endpoint
 * using native HTTP client.
 *
 * These tests start a real Fastify server and connect with actual
 * HTTP connections to verify streaming functionality for agent
 * guidance call scripts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createGuidanceWSRoutes, getGuidanceSSEManager } from '../routes/guidance-ws.js';
import {
  createSSEClient,
  httpRequest,
  getAvailablePort,
  delay,
  createMultipleSSEClients,
  type SSEClientResult,
} from './streaming-test-utils.js';
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

// =============================================================================
// Mock Repository
// =============================================================================

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

function createMockRepository(): IGuidanceRepository {
  const mockGuidance: Partial<AgentGuidance> = {
    id: 'guidance-stream-test',
    clinicId: 'clinic-1',
    name: 'Streaming Test Script',
    type: 'call-script',
    category: 'consultation',
    description: 'Script for streaming integration tests',
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
// Test Suite
// =============================================================================

describe('Guidance SSE Streaming Integration', () => {
  let app: FastifyInstance;
  let port: number;
  let clients: SSEClientResult[] = [];
  let mockRepository: IGuidanceRepository;

  beforeAll(async () => {
    port = await getAvailablePort();
    mockRepository = createMockRepository();
    app = Fastify({ logger: false });

    const routes = createGuidanceWSRoutes(mockRepository);
    await app.register(routes);
    await app.listen({ port, host: '127.0.0.1' });
  });

  afterAll(async () => {
    // Close all client connections
    clients.forEach((client) => client.close());
    clients = [];

    // Close the server
    await app.close();
  });

  beforeEach(() => {
    // Clean up any lingering clients from previous tests
    clients.forEach((client) => client.close());
    clients = [];
  });

  // ==========================================================================
  // Connection Establishment Tests
  // ==========================================================================

  describe('Connection Establishment', () => {
    it('should establish SSE connection with valid agent ID', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-test-123' },
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
      expect(client.headers['content-type']).toBe('text/event-stream');
      expect(client.headers['cache-control']).toBe('no-cache');
      expect(client.headers['connection']).toBe('keep-alive');
    });

    it('should include X-Accel-Buffering header for nginx compatibility', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-nginx-test' },
      });
      clients.push(client);

      expect(client.headers['x-accel-buffering']).toBe('no');
    });

    it('should send connection.established event on connect', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-establish-test' },
      });
      clients.push(client);

      const event = await client.waitForEventType('connection.established', 2000);

      expect(event.eventType).toBe('connection.established');
      expect(event.data).toHaveProperty('clientId');
      expect(event.data).toHaveProperty('timestamp');
    });

    it('should generate unique client IDs for each connection', async () => {
      const client1 = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-unique-1' },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-unique-2' },
      });
      clients.push(client2);

      const event1 = await client1.waitForEventType('connection.established', 2000);
      const event2 = await client2.waitForEventType('connection.established', 2000);

      expect(event1.data.clientId).not.toBe(event2.data.clientId);
    });

    it('should accept optional callSid query parameter', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events?callSid=CA-query-test',
        headers: { 'x-agent-id': 'agent-callsid-test' },
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
      const event = await client.waitForEventType('connection.established', 2000);
      expect(event.eventType).toBe('connection.established');
    });

    it('should allow same agent to have multiple connections', async () => {
      const sameAgentId = 'agent-multi-conn';

      const client1 = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': sameAgentId },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': sameAgentId },
      });
      clients.push(client2);

      // Both should receive connection.established
      const event1 = await client1.waitForEventType('connection.established', 2000);
      const event2 = await client2.waitForEventType('connection.established', 2000);

      expect(event1.eventType).toBe('connection.established');
      expect(event2.eventType).toBe('connection.established');

      // But with different client IDs
      expect(event1.data.clientId).not.toBe(event2.data.clientId);
    });
  });

  // ==========================================================================
  // SSE Event Format Tests
  // ==========================================================================

  describe('SSE Event Format', () => {
    it('should include eventId in all events', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-format-1' },
      });
      clients.push(client);

      const event = await client.waitForEventType('connection.established', 2000);

      expect(event.data).toHaveProperty('eventId');
      expect(typeof event.data.eventId).toBe('string');
      expect((event.data.eventId as string).length).toBeGreaterThan(0);
    });

    it('should include timestamp in all events', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-format-2' },
      });
      clients.push(client);

      const event = await client.waitForEventType('connection.established', 2000);

      expect(event.data).toHaveProperty('timestamp');
      // Timestamp can be either ISO string or Date object serialized
      const timestampValue = event.data.timestamp;
      if (typeof timestampValue === 'string') {
        const timestamp = new Date(timestampValue);
        expect(isNaN(timestamp.getTime())).toBe(false);
      } else if (timestampValue && typeof timestampValue === 'object') {
        // Date object serialized as JSON
        expect(timestampValue).toBeDefined();
      }
    });

    it('should format SSE data correctly with data: prefix', async () => {
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-format-3' },
      });
      clients.push(client);

      // The parsing is handled by our utility, but let's verify events arrive
      const event = await client.waitForEventType('connection.established', 2000);

      // If we got here, the SSE was parsed correctly
      expect(event.eventType).toBe('connection.established');
      expect(event.data).toBeDefined();
    });
  });

  // ==========================================================================
  // Connection Status Tests
  // ==========================================================================

  describe('Connection Status', () => {
    it('should return connection status', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ connectedClients: number; timestamp: string }>();
      expect(body).toHaveProperty('connectedClients');
      expect(body).toHaveProperty('timestamp');
    });

    it('should reflect correct client count in status endpoint', async () => {
      // Check initial count
      const initialStatus = await httpRequest({
        port,
        path: '/guidance/events/status',
      });
      const initialCount = initialStatus.json<{ connectedClients: number }>().connectedClients;

      // Connect a client
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-status-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      // Check count increased
      const afterConnect = await httpRequest({
        port,
        path: '/guidance/events/status',
      });
      const afterCount = afterConnect.json<{ connectedClients: number }>().connectedClients;

      expect(afterCount).toBe(initialCount + 1);

      // Disconnect the client
      client.close();
      clients.pop();

      // Give the server time to process the disconnect
      await delay(100);

      // Check count decreased
      const afterDisconnect = await httpRequest({
        port,
        path: '/guidance/events/status',
      });
      const finalCount = afterDisconnect.json<{ connectedClients: number }>().connectedClients;

      expect(finalCount).toBe(initialCount);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/status',
      });

      const body = response.json<{ timestamp: string }>();
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBeDefined();
      expect(isNaN(date.getTime())).toBe(false);
    });

    it('should handle multiple concurrent connections correctly', async () => {
      const initialStatus = await httpRequest({
        port,
        path: '/guidance/events/status',
      });
      const initialCount = initialStatus.json<{ connectedClients: number }>().connectedClients;

      // Connect 5 clients
      const multiClients = await createMultipleSSEClients(
        5,
        { port, path: '/guidance/events' },
        (i) => ({ 'x-agent-id': `agent-concurrent-${i}` })
      );
      clients.push(...multiClients);

      // Wait for all connections
      await Promise.all(
        multiClients.map((c) => c.waitForEventType('connection.established', 2000))
      );

      const afterConnect = await httpRequest({
        port,
        path: '/guidance/events/status',
      });
      const afterCount = afterConnect.json<{ connectedClients: number }>().connectedClients;

      expect(afterCount).toBe(initialCount + 5);
    });
  });

  // ==========================================================================
  // Subscribe Endpoint Tests
  // ==========================================================================

  describe('POST /guidance/events/subscribe', () => {
    it('should require clientId and callSid', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toContain('clientId');
    });

    it('should return 400 when clientId is missing', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { callSid: 'CA123' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; correlationId: string }>();
      expect(body.error).toContain('clientId');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 400 when callSid is missing', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { clientId: 'client-123' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; correlationId: string }>();
      expect(body.error).toContain('callSid');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 404 for non-existent client', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { clientId: 'non-existent-client', callSid: 'CA123' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('Client not found');
    });

    it('should successfully subscribe connected client to call', async () => {
      // First, connect a client
      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': 'agent-subscribe-test' },
      });
      clients.push(client);

      const connectionEvent = await client.waitForEventType('connection.established', 2000);
      const clientId = connectionEvent.data.clientId as string;

      // Now subscribe to a call
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { clientId, callSid: 'CA-subscribe-test' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean; correlationId: string }>();
      expect(body.success).toBe(true);
      expect(body.correlationId).toBeDefined();
    });

    it('should include correlationId in response', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { clientId: 'some-client', callSid: 'CA123' },
      });

      const body = response.json<{ correlationId: string }>();
      expect(body.correlationId).toBeDefined();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return 400 for missing agent ID header', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; correlationId: string }>();
      expect(body.error).toBe('x-agent-id header is required');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 400 for empty agent ID header', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle very long agent IDs', async () => {
      const longId = 'agent-' + 'x'.repeat(1000);

      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': longId },
      });
      clients.push(client);

      // Should still establish connection
      expect(client.statusCode).toBe(200);
      const event = await client.waitForEventType('connection.established', 2000);
      expect(event.eventType).toBe('connection.established');
    });

    it('should handle special characters in agent ID', async () => {
      const specialId = 'agent-test-!@#$%^&*()_+-=[]{}|;:,.<>?';

      const client = await createSSEClient({
        port,
        path: '/guidance/events',
        headers: { 'x-agent-id': specialId },
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
      const event = await client.waitForEventType('connection.established', 2000);
      expect(event.eventType).toBe('connection.established');
    });

    it('should handle invalid HTTP methods gracefully', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events',
        method: 'PUT',
        headers: { 'x-agent-id': 'agent-123' },
      });

      // Should return 404 (route not found for PUT)
      expect(response.statusCode).toBe(404);
    });

    it('should return consistent error format', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events',
        // Missing required header
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; correlationId: string }>();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('correlationId');
    });
  });

  // ==========================================================================
  // Security Tests
  // ==========================================================================

  describe('Security', () => {
    it('should not expose internal error details', async () => {
      const response = await httpRequest({
        port,
        path: '/guidance/events/subscribe',
        method: 'POST',
        body: { clientId: 'invalid', callSid: 'invalid' },
      });

      const body = response.json<{ error: string }>();
      // Should not expose stack traces or internal details
      expect(body.error).not.toContain('stack');
      expect(body.error).not.toContain('node_modules');
    });
  });

  // ==========================================================================
  // getGuidanceSSEManager Tests
  // ==========================================================================

  describe('SSE Manager Instance', () => {
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
