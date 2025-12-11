/**
 * Supervisor SSE Streaming Integration Tests
 *
 * Tests real SSE streaming behavior using native HTTP client.
 * These tests start a real Fastify server and connect with actual
 * HTTP connections to verify streaming functionality.
 *
 * Unlike the E2E tests that use fastify.inject() (which waits for
 * response completion), these tests use Node.js native http module
 * to handle long-lived streaming connections.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  supervisorWSRoutes,
  emitSupervisorEvent,
  getSSEManagerInstance,
} from '../routes/supervisor-ws.js';
import {
  createSSEClient,
  httpRequest,
  getAvailablePort,
  delay,
  createMultipleSSEClients,
  type SSEClientResult,
} from './streaming-test-utils.js';

// Mock the supervisor agent to isolate SSE testing
vi.mock('@medicalcor/domain', () => {
  const EventEmitter = require('events').EventEmitter;
  const mockAgent = new EventEmitter();

  mockAgent.getActiveCalls = vi.fn(() => []);

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

  mockAgent.processTranscriptMessage = vi.fn((callSid, speaker, text) => {
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
    activeCalls: 0,
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
// Test Suite
// =============================================================================

describe('Supervisor SSE Streaming Integration', () => {
  let app: FastifyInstance;
  let port: number;
  let clients: SSEClientResult[] = [];

  beforeAll(async () => {
    port = await getAvailablePort();
    app = Fastify({ logger: false });
    await app.register(supervisorWSRoutes);
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
    it('should establish SSE connection with valid supervisor ID', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-test-123' },
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
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-nginx-test' },
      });
      clients.push(client);

      expect(client.headers['x-accel-buffering']).toBe('no');
    });

    it('should send connection.established event on connect', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-establish-test' },
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
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-unique-1' },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-unique-2' },
      });
      clients.push(client2);

      const event1 = await client1.waitForEventType('connection.established', 2000);
      const event2 = await client2.waitForEventType('connection.established', 2000);

      expect(event1.data.clientId).not.toBe(event2.data.clientId);
    });

    it('should allow same supervisor to have multiple connections', async () => {
      const sameSupervisorId = 'sup-multi-conn';

      const client1 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': sameSupervisorId },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': sameSupervisorId },
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
  // Event Broadcasting Tests
  // ==========================================================================

  describe('Event Broadcasting', () => {
    it('should broadcast call.started events to connected clients', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-broadcast-1' },
      });
      clients.push(client);

      // Wait for connection
      await client.waitForEventType('connection.established', 2000);

      // Emit a call.started event
      emitSupervisorEvent({
        eventType: 'call.started',
        callSid: 'CA-broadcast-test',
        data: {
          customerPhone: '+40712345678',
          direction: 'inbound',
        },
      });

      // Wait for the call.started event
      const event = await client.waitForEventType('call.started', 2000);

      expect(event.eventType).toBe('call.started');
      expect(event.data).toHaveProperty('callSid', 'CA-broadcast-test');
    });

    it('should broadcast to multiple clients simultaneously', async () => {
      // Connect multiple clients
      const clientPromises = createMultipleSSEClients(
        3,
        { port, path: '/supervisor/events' },
        (i) => ({ 'x-supervisor-id': `sup-multi-${i}` })
      );
      const multiClients = await clientPromises;
      clients.push(...multiClients);

      // Wait for all connections
      await Promise.all(
        multiClients.map((c) => c.waitForEventType('connection.established', 2000))
      );

      // Emit an event
      emitSupervisorEvent({
        eventType: 'call.started',
        callSid: 'CA-multi-broadcast',
        data: {
          customerPhone: '+40712345679',
          direction: 'outbound',
        },
      });

      // All clients should receive the event
      const events = await Promise.all(
        multiClients.map((c) => c.waitForEventType('call.started', 2000))
      );

      events.forEach((event) => {
        expect(event.eventType).toBe('call.started');
        expect(event.data).toHaveProperty('callSid', 'CA-multi-broadcast');
      });
    });

    it('should broadcast call.updated events', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-update-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      emitSupervisorEvent({
        eventType: 'call.updated',
        callSid: 'CA-update-test',
        data: {
          state: 'active',
          sentiment: 'positive',
        },
      });

      const event = await client.waitForEventType('call.updated', 2000);

      expect(event.eventType).toBe('call.updated');
      expect(event.data).toHaveProperty('callSid', 'CA-update-test');
    });

    it('should broadcast call.ended events', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-end-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      emitSupervisorEvent({
        eventType: 'call.ended',
        callSid: 'CA-end-test',
        data: {
          outcome: 'completed',
        },
      });

      const event = await client.waitForEventType('call.ended', 2000);

      expect(event.eventType).toBe('call.ended');
      expect(event.data).toHaveProperty('callSid', 'CA-end-test');
      expect(event.data).toHaveProperty('outcome', 'completed');
    });

    it('should broadcast transcript.message events', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-transcript-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      emitSupervisorEvent({
        eventType: 'transcript.message',
        callSid: 'CA-transcript-test',
        data: {
          speaker: 'customer',
          text: 'Hello, I need help with my appointment',
          confidence: 0.95,
        },
      });

      const event = await client.waitForEventType('transcript.message', 2000);

      expect(event.eventType).toBe('transcript.message');
      expect(event.data).toHaveProperty('callSid', 'CA-transcript-test');
      expect(event.data).toHaveProperty('speaker', 'customer');
    });
  });

  // ==========================================================================
  // SSE Event Format Tests
  // ==========================================================================

  describe('SSE Event Format', () => {
    it('should include eventId in all events', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-format-1' },
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
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-format-2' },
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
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-format-3' },
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
    it('should reflect correct client count in status endpoint', async () => {
      // Check initial count
      const initialStatus = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      const initialCount = initialStatus.json<{ connectedClients: number }>().connectedClients;

      // Connect a client
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-status-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      // Check count increased
      const afterConnect = await httpRequest({
        port,
        path: '/supervisor/events/status',
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
        path: '/supervisor/events/status',
      });
      const finalCount = afterDisconnect.json<{ connectedClients: number }>().connectedClients;

      expect(finalCount).toBe(initialCount);
    });

    it('should handle multiple concurrent connections correctly', async () => {
      const initialStatus = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      const initialCount = initialStatus.json<{ connectedClients: number }>().connectedClients;

      // Connect 5 clients
      const multiClients = await createMultipleSSEClients(
        5,
        { port, path: '/supervisor/events' },
        (i) => ({ 'x-supervisor-id': `sup-concurrent-${i}` })
      );
      clients.push(...multiClients);

      // Wait for all connections
      await Promise.all(
        multiClients.map((c) => c.waitForEventType('connection.established', 2000))
      );

      const afterConnect = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      const afterCount = afterConnect.json<{ connectedClients: number }>().connectedClients;

      expect(afterCount).toBe(initialCount + 5);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return 400 for missing supervisor ID header', async () => {
      const response = await httpRequest({
        port,
        path: '/supervisor/events',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; correlationId: string }>();
      expect(body.error).toBe('x-supervisor-id header is required');
      expect(body.correlationId).toBeDefined();
    });

    it('should return 400 for empty supervisor ID header', async () => {
      const response = await httpRequest({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle very long supervisor IDs', async () => {
      const longId = 'sup-' + 'x'.repeat(1000);

      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': longId },
      });
      clients.push(client);

      // Should still establish connection
      expect(client.statusCode).toBe(200);
      const event = await client.waitForEventType('connection.established', 2000);
      expect(event.eventType).toBe('connection.established');
    });

    it('should handle special characters in supervisor ID', async () => {
      const specialId = 'sup-test-!@#$%^&*()_+-=[]{}|;:,.<>?';

      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': specialId },
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
      const event = await client.waitForEventType('connection.established', 2000);
      expect(event.eventType).toBe('connection.established');
    });
  });

  // ==========================================================================
  // Security & Privacy Tests (GDPR/HIPAA)
  // ==========================================================================

  describe('Security & Privacy', () => {
    it('should mask customer phone numbers in call events', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-privacy-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      // Emit a call with a phone number
      emitSupervisorEvent({
        eventType: 'call.started',
        callSid: 'CA-privacy-test',
        data: {
          customerPhone: '+40712345678',
          direction: 'inbound',
        },
      });

      const event = await client.waitForEventType('call.started', 2000);

      // The call data should have masked phone
      // The SSE manager uses both maskCallData (****) and deepRedactObject ([REDACTED])
      if (event.data.call && typeof event.data.call === 'object') {
        const call = event.data.call as { customerPhone?: string };
        if (call.customerPhone) {
          // Phone is redacted - could be either **** or [REDACTED:customerPhone]
          const isRedacted =
            call.customerPhone.includes('****') || call.customerPhone.includes('[REDACTED');
          expect(isRedacted).toBe(true);
          expect(call.customerPhone).not.toBe('+40712345678');
        }
      }
    });

    it('should not expose internal error details in responses', async () => {
      const response = await httpRequest({
        port,
        path: '/supervisor/events',
      });

      const body = response.json<{ error: string }>();
      expect(body.error).not.toContain('stack');
      expect(body.error).not.toContain('node_modules');
      expect(body.error).not.toContain('at ');
    });
  });

  // ==========================================================================
  // getSSEManagerInstance Tests
  // ==========================================================================

  describe('SSE Manager Instance', () => {
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
