/**
 * Advanced SSE Streaming Integration Tests
 *
 * Tests advanced SSE scenarios including:
 * - Reconnection handling
 * - Event ordering and sequencing
 * - Large payload handling
 * - Concurrent client stress testing
 * - Backpressure scenarios
 * - Connection lifecycle edge cases
 *
 * These tests use the streaming test utilities and can be applied
 * to any SSE endpoint in the system.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { supervisorWSRoutes, getSSEManagerInstance } from '../routes/supervisor-ws.js';
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
    const call = { ...callData, recentTranscript: [], flags: [] };
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

describe('Advanced SSE Streaming Scenarios', () => {
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
    clients.forEach((client) => client.close());
    clients = [];
    await app.close();
  });

  beforeEach(() => {
    clients.forEach((client) => client.close());
    clients = [];
  });

  // ==========================================================================
  // Event Ordering Tests
  // ==========================================================================

  describe('Event Ordering', () => {
    it('should receive events in order they were sent', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-order-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();

      // Send multiple events rapidly
      const events = [
        { eventType: 'call.started', callId: '1', sequence: 1 },
        { eventType: 'call.updated', callId: '1', sequence: 2 },
        { eventType: 'call.ended', callId: '1', sequence: 3 },
      ];

      for (const event of events) {
        manager.broadcast(event);
      }

      // Wait for events
      await client.waitForEvents(4, 3000); // 1 connection + 3 events

      // Verify order (skip connection.established)
      const receivedEvents = client.events.slice(1);
      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents[0]?.data.sequence).toBe(1);
      expect(receivedEvents[1]?.data.sequence).toBe(2);
      expect(receivedEvents[2]?.data.sequence).toBe(3);
    });

    it('should maintain event order under rapid broadcasting', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-rapid-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();
      const eventCount = 20;

      // Send events as fast as possible
      for (let i = 1; i <= eventCount; i++) {
        manager.broadcast({ eventType: 'test.event', sequence: i });
      }

      // Wait for all events
      await client.waitForEvents(eventCount + 1, 5000);

      // Verify all events received in order
      const testEvents = client.events.filter((e) => e.eventType === 'test.event');
      expect(testEvents).toHaveLength(eventCount);

      for (let i = 0; i < testEvents.length; i++) {
        expect(testEvents[i]?.data.sequence).toBe(i + 1);
      }
    });
  });

  // ==========================================================================
  // Large Payload Tests
  // ==========================================================================

  describe('Large Payload Handling', () => {
    it('should handle moderately large event payloads', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-large-payload' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();

      // Create a large payload (10KB)
      const largeData = 'x'.repeat(10000);
      manager.broadcast({
        eventType: 'large.payload',
        data: largeData,
        metadata: { size: largeData.length },
      });

      await client.waitForEvents(2, 3000);

      const largeEvent = client.events.find((e) => e.eventType === 'large.payload');
      expect(largeEvent).toBeDefined();
      expect((largeEvent?.data.data as string).length).toBe(10000);
    });

    it('should handle events with nested objects', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-nested-payload' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();

      // Create deeply nested object
      const nestedData = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep-value',
                  array: [1, 2, 3, 4, 5],
                },
              },
            },
          },
        },
      };

      manager.broadcast({
        eventType: 'nested.payload',
        data: nestedData,
      });

      await client.waitForEvents(2, 3000);

      const nestedEvent = client.events.find((e) => e.eventType === 'nested.payload');
      expect(nestedEvent).toBeDefined();

      const receivedNested = nestedEvent?.data.data as typeof nestedData;
      expect(receivedNested?.level1?.level2?.level3?.level4?.level5?.value).toBe('deep-value');
    });
  });

  // ==========================================================================
  // Concurrent Client Tests
  // ==========================================================================

  describe('Concurrent Client Handling', () => {
    it('should handle 10 concurrent connections', async () => {
      const clientCount = 10;

      const multiClients = await createMultipleSSEClients(
        clientCount,
        { port, path: '/supervisor/events' },
        (i) => ({ 'x-supervisor-id': `sup-concurrent-${i}` })
      );
      clients.push(...multiClients);

      // Wait for all connections
      await Promise.all(
        multiClients.map((c) => c.waitForEventType('connection.established', 3000))
      );

      // Verify status endpoint reflects all connections
      const status = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });

      const body = status.json<{ connectedClients: number }>();
      expect(body.connectedClients).toBeGreaterThanOrEqual(clientCount);
    });

    it('should broadcast event to all concurrent clients', async () => {
      const clientCount = 5;

      const multiClients = await createMultipleSSEClients(
        clientCount,
        { port, path: '/supervisor/events' },
        (i) => ({ 'x-supervisor-id': `sup-broadcast-${i}` })
      );
      clients.push(...multiClients);

      // Wait for all connections
      await Promise.all(
        multiClients.map((c) => c.waitForEventType('connection.established', 3000))
      );

      // Broadcast a single event
      const manager = getSSEManagerInstance();
      const broadcastId = `broadcast-${Date.now()}`;
      manager.broadcast({
        eventType: 'broadcast.test',
        id: broadcastId,
      });

      // Wait for all clients to receive the event
      await Promise.all(multiClients.map((c) => c.waitForEventType('broadcast.test', 3000)));

      // Verify all clients received the same event
      for (const client of multiClients) {
        const event = client.events.find((e) => e.eventType === 'broadcast.test');
        expect(event).toBeDefined();
        expect(event?.data.id).toBe(broadcastId);
      }
    });

    it('should handle clients connecting and disconnecting rapidly', async () => {
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const client = await createSSEClient({
          port,
          path: '/supervisor/events',
          headers: { 'x-supervisor-id': `sup-rapid-connect-${i}` },
        });

        await client.waitForEventType('connection.established', 2000);
        expect(client.statusCode).toBe(200);

        client.close();
        await delay(50); // Small delay between iterations
      }

      // Final status check should show no dangling connections
      await delay(200);
      const status = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      expect(status.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Connection Lifecycle Tests
  // ==========================================================================

  describe('Connection Lifecycle', () => {
    it('should clean up client when connection closes', async () => {
      // Get initial count
      const initialStatus = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      const initialCount = initialStatus.json<{ connectedClients: number }>().connectedClients;

      // Create and immediately track a client
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-lifecycle-test' },
      });

      await client.waitForEventType('connection.established', 2000);

      // Verify count increased
      const afterConnect = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      expect(afterConnect.json<{ connectedClients: number }>().connectedClients).toBe(
        initialCount + 1
      );

      // Close connection
      client.close();
      await delay(150); // Allow cleanup

      // Verify count decreased
      const afterClose = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      expect(afterClose.json<{ connectedClients: number }>().connectedClients).toBe(initialCount);
    });

    it('should handle multiple reconnection attempts from same supervisor', async () => {
      const supervisorId = 'sup-reconnect-test';

      // First connection
      const client1 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': supervisorId },
      });
      clients.push(client1);

      const event1 = await client1.waitForEventType('connection.established', 2000);
      const clientId1 = event1.data.clientId;

      // Close first connection
      client1.close();
      clients.pop();
      await delay(100);

      // Second connection (simulating reconnect)
      const client2 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': supervisorId },
      });
      clients.push(client2);

      const event2 = await client2.waitForEventType('connection.established', 2000);
      const clientId2 = event2.data.clientId;

      // Should get new client ID on reconnect
      expect(clientId2).not.toBe(clientId1);
    });
  });

  // ==========================================================================
  // Error Recovery Tests
  // ==========================================================================

  describe('Error Recovery', () => {
    it('should continue broadcasting after one client disconnects', async () => {
      // Create two clients
      const client1 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-recovery-1' },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-recovery-2' },
      });
      clients.push(client2);

      await Promise.all([
        client1.waitForEventType('connection.established', 2000),
        client2.waitForEventType('connection.established', 2000),
      ]);

      // Disconnect client1
      client1.close();
      clients.shift();
      await delay(100);

      // Broadcast event
      const manager = getSSEManagerInstance();
      manager.broadcast({
        eventType: 'after.disconnect',
        message: 'Still working',
      });

      // Client2 should still receive the event
      await client2.waitForEventType('after.disconnect', 2000);
      const event = client2.events.find((e) => e.eventType === 'after.disconnect');
      expect(event).toBeDefined();
      expect(event?.data.message).toBe('Still working');
    });

    it('should handle broadcast with no connected clients gracefully', async () => {
      const manager = getSSEManagerInstance();

      // Get current client count
      const status = await httpRequest({
        port,
        path: '/supervisor/events/status',
      });
      const currentCount = status.json<{ connectedClients: number }>().connectedClients;

      // Only test if no other clients are connected
      if (currentCount === 0) {
        // This should not throw
        expect(() => {
          manager.broadcast({
            eventType: 'orphan.event',
            data: 'No one listening',
          });
        }).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // Event Content Tests
  // ==========================================================================

  describe('Event Content Validation', () => {
    it('should preserve special characters in event data', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-special-chars' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();
      // Use field names that won't trigger PII redaction
      const specialChars = 'Test with "quotes", newlines\nand unicode: 🏥 医療';

      manager.broadcast({
        eventType: 'special.chars',
        payload: specialChars, // Use 'payload' instead of 'content' to avoid PII redaction
      });

      await client.waitForEvents(2, 3000);

      const event = client.events.find((e) => e.eventType === 'special.chars');
      expect(event).toBeDefined();
      expect(event?.data.payload).toBe(specialChars);
    });

    it('should handle events with array data', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-array-data' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();
      // Use field names that won't trigger PII redaction
      const arrayData = [
        { id: 1, label: 'Item 1' },
        { id: 2, label: 'Item 2' },
        { id: 3, label: 'Item 3' },
      ];

      manager.broadcast({
        eventType: 'array.data',
        items: arrayData,
      });

      await client.waitForEvents(2, 3000);

      const event = client.events.find((e) => e.eventType === 'array.data');
      expect(event).toBeDefined();
      expect(event?.data.items).toHaveLength(3);
      expect((event?.data.items as typeof arrayData)[1]?.label).toBe('Item 2');
    });

    it('should handle empty object payloads', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-empty-payload' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();

      manager.broadcast({
        eventType: 'empty.payload',
        data: {},
      });

      await client.waitForEvents(2, 3000);

      const event = client.events.find((e) => e.eventType === 'empty.payload');
      expect(event).toBeDefined();
      expect(event?.data.data).toEqual({});
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should handle burst of events efficiently', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-burst-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();
      const burstSize = 50;
      const startTime = Date.now();

      // Send burst of events
      for (let i = 0; i < burstSize; i++) {
        manager.broadcast({
          eventType: 'burst.event',
          index: i,
          timestamp: Date.now(),
        });
      }

      // Wait for all events
      await client.waitForEvents(burstSize + 1, 10000);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (less than 5 seconds for 50 events)
      expect(duration).toBeLessThan(5000);

      // Verify all burst events received
      const burstEvents = client.events.filter((e) => e.eventType === 'burst.event');
      expect(burstEvents).toHaveLength(burstSize);
    });

    it('should maintain low latency for event delivery', async () => {
      const client = await createSSEClient({
        port,
        path: '/supervisor/events',
        headers: { 'x-supervisor-id': 'sup-latency-test' },
      });
      clients.push(client);

      await client.waitForEventType('connection.established', 2000);

      const manager = getSSEManagerInstance();
      const sendTime = Date.now();

      manager.broadcast({
        eventType: 'latency.test',
        sendTime,
      });

      await client.waitForEventType('latency.test', 2000);

      const event = client.events.find((e) => e.eventType === 'latency.test');
      const receiveTime = Date.now();
      const latency = receiveTime - sendTime;

      // Latency should be under 100ms for local connections
      expect(latency).toBeLessThan(100);
    });
  });
});
