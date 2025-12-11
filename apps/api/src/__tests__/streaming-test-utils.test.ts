/**
 * Tests for Streaming Test Utilities
 *
 * Unit tests for the enhanced SSE testing utilities.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  parseSSEChunk,
  createSSEClient,
  createSSEClientWithRetry,
  filterEventsByType,
  filterEventsByTypes,
  filterEventsByData,
  findEvent,
  hasEvent,
  calculateClientStats,
  waitForCondition,
  waitForEventCount,
  checkConnectionHealth,
  createEventRecorder,
  closeAllClients,
  getCombinedStats,
  assertEventsInOrder,
  assertEventStructure,
  assertLatency,
  getAvailablePort,
  delay,
  type SSEEvent,
  type SSEClientResult,
} from './streaming-test-utils.js';

// =============================================================================
// Parse SSE Chunk Tests
// =============================================================================

describe('parseSSEChunk', () => {
  it('should parse standard SSE data format', () => {
    const chunk = 'data: {"eventType":"test","message":"hello"}\n\n';
    const events = parseSSEChunk(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('test');
    expect(events[0]?.data.message).toBe('hello');
  });

  it('should parse multiple events in one chunk', () => {
    const chunk = 'data: {"eventType":"event1"}\n\n' + 'data: {"eventType":"event2"}\n\n';
    const events = parseSSEChunk(chunk);

    expect(events).toHaveLength(2);
    expect(events[0]?.eventType).toBe('event1');
    expect(events[1]?.eventType).toBe('event2');
  });

  it('should handle SSE with event type field', () => {
    const chunk = 'event: custom\ndata: {"message":"test"}\n\n';
    const events = parseSSEChunk(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('custom');
  });

  it('should handle SSE with id field', () => {
    const chunk = 'id: 123\ndata: {"eventType":"test"}\n\n';
    const events = parseSSEChunk(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe('123');
  });

  it('should skip malformed JSON', () => {
    const chunk = 'data: {invalid json}\n\ndata: {"eventType":"valid"}\n\n';
    const events = parseSSEChunk(chunk);

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('valid');
  });
});

// =============================================================================
// Event Filtering Tests
// =============================================================================

describe('Event Filtering Utilities', () => {
  const mockEvents: SSEEvent[] = [
    { eventType: 'type1', data: { id: 1, status: 'active' } },
    { eventType: 'type2', data: { id: 2, status: 'inactive' } },
    { eventType: 'type1', data: { id: 3, status: 'active' } },
    { eventType: 'type3', data: { id: 4, status: 'pending' } },
  ];

  describe('filterEventsByType', () => {
    it('should filter events by single type', () => {
      const filtered = filterEventsByType(mockEvents, 'type1');
      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.eventType === 'type1')).toBe(true);
    });

    it('should return empty array for non-existent type', () => {
      const filtered = filterEventsByType(mockEvents, 'nonexistent');
      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterEventsByTypes', () => {
    it('should filter events by multiple types', () => {
      const filtered = filterEventsByTypes(mockEvents, ['type1', 'type3']);
      expect(filtered).toHaveLength(3);
    });
  });

  describe('filterEventsByData', () => {
    it('should filter events by data predicate', () => {
      const filtered = filterEventsByData(mockEvents, (data) => data.status === 'active');
      expect(filtered).toHaveLength(2);
    });
  });

  describe('findEvent', () => {
    it('should find first matching event', () => {
      const event = findEvent(mockEvents, (e) => e.data.id === 3);
      expect(event).toBeDefined();
      expect(event?.data.id).toBe(3);
    });

    it('should return undefined for no match', () => {
      const event = findEvent(mockEvents, (e) => e.data.id === 999);
      expect(event).toBeUndefined();
    });
  });

  describe('hasEvent', () => {
    it('should return true when event exists', () => {
      expect(hasEvent(mockEvents, (e) => e.eventType === 'type2')).toBe(true);
    });

    it('should return false when event does not exist', () => {
      expect(hasEvent(mockEvents, (e) => e.eventType === 'type99')).toBe(false);
    });
  });
});

// =============================================================================
// Statistics Tests
// =============================================================================

describe('calculateClientStats', () => {
  it('should calculate correct statistics', () => {
    const mockClient = {
      events: [
        { eventType: 'type1', data: {}, timestamp: new Date().toISOString() },
        { eventType: 'type1', data: {}, timestamp: new Date().toISOString() },
        { eventType: 'type2', data: {}, timestamp: new Date().toISOString() },
      ],
    } as SSEClientResult;

    const connectedAt = new Date(Date.now() - 1000); // 1 second ago
    const stats = calculateClientStats(mockClient, connectedAt);

    expect(stats.totalEvents).toBe(3);
    expect(stats.eventsByType['type1']).toBe(2);
    expect(stats.eventsByType['type2']).toBe(1);
    expect(stats.connectionDurationMs).toBeGreaterThanOrEqual(1000);
    expect(stats.eventsPerSecond).toBeGreaterThan(0);
  });

  it('should handle empty events', () => {
    const mockClient = { events: [] } as SSEClientResult;
    const connectedAt = new Date();
    const stats = calculateClientStats(mockClient, connectedAt);

    expect(stats.totalEvents).toBe(0);
    expect(stats.eventsByType).toEqual({});
  });
});

// =============================================================================
// Health Check Tests
// =============================================================================

describe('checkConnectionHealth', () => {
  it('should report healthy connection with recent events', () => {
    const mockClient = {
      statusCode: 200,
      events: [{ eventType: 'test', data: {}, timestamp: new Date().toISOString() }],
    } as SSEClientResult;

    const health = checkConnectionHealth(mockClient);

    expect(health.connected).toBe(true);
    expect(health.eventsReceived).toBe(1);
    expect(health.healthy).toBe(true);
  });

  it('should report unhealthy with old events', () => {
    const oldTimestamp = new Date(Date.now() - 120000).toISOString(); // 2 min ago
    const mockClient = {
      statusCode: 200,
      events: [{ eventType: 'test', data: {}, timestamp: oldTimestamp }],
    } as SSEClientResult;

    const health = checkConnectionHealth(mockClient, 60000); // 1 min threshold

    expect(health.connected).toBe(true);
    expect(health.healthy).toBe(false);
    expect(health.lastEventAge).toBeGreaterThan(60000);
  });

  it('should report disconnected for non-200 status', () => {
    const mockClient = {
      statusCode: 500,
      events: [],
    } as SSEClientResult;

    const health = checkConnectionHealth(mockClient);
    expect(health.connected).toBe(false);
  });
});

// =============================================================================
// Event Recorder Tests
// =============================================================================

describe('createEventRecorder', () => {
  it('should record events with timestamps', async () => {
    const recorder = createEventRecorder();

    recorder.record({ eventType: 'test1', data: {} });
    await delay(50);
    recorder.record({ eventType: 'test2', data: {} });

    const recording = recorder.getRecording();
    expect(recording.events).toHaveLength(2);
    expect(recording.events[0]?.receivedAt).toBeLessThan(recording.events[1]?.receivedAt ?? 0);
  });

  it('should calculate event deltas', async () => {
    const recorder = createEventRecorder();

    recorder.record({ eventType: 'test1', data: {} });
    await delay(100);
    recorder.record({ eventType: 'test2', data: {} });
    await delay(50);
    recorder.record({ eventType: 'test3', data: {} });

    const deltas = recorder.getEventDeltas();
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toBeGreaterThanOrEqual(90); // ~100ms with tolerance
    expect(deltas[1]).toBeGreaterThanOrEqual(40); // ~50ms with tolerance
  });
});

// =============================================================================
// Batch Operations Tests
// =============================================================================

describe('getCombinedStats', () => {
  it('should combine stats from multiple clients', () => {
    const clients = [
      {
        events: [
          { eventType: 'a', data: {} },
          { eventType: 'b', data: {} },
        ],
      },
      {
        events: [
          { eventType: 'a', data: {} },
          { eventType: 'c', data: {} },
        ],
      },
    ] as SSEClientResult[];

    const stats = getCombinedStats(clients, new Date());

    expect(stats.totalClients).toBe(2);
    expect(stats.totalEvents).toBe(4);
    expect(stats.avgEventsPerClient).toBe(2);
    expect(stats.eventsByType['a']).toBe(2);
    expect(stats.eventsByType['b']).toBe(1);
    expect(stats.eventsByType['c']).toBe(1);
  });
});

// =============================================================================
// Assertion Helpers Tests
// =============================================================================

describe('Assertion Helpers', () => {
  describe('assertEventsInOrder', () => {
    it('should pass for correct order', () => {
      const events: SSEEvent[] = [
        { eventType: 'a', data: {} },
        { eventType: 'b', data: {} },
        { eventType: 'c', data: {} },
      ];

      expect(() => assertEventsInOrder(events, ['a', 'b', 'c'])).not.toThrow();
    });

    it('should fail for wrong order', () => {
      const events: SSEEvent[] = [
        { eventType: 'a', data: {} },
        { eventType: 'c', data: {} },
        { eventType: 'b', data: {} },
      ];

      expect(() => assertEventsInOrder(events, ['a', 'b', 'c'])).toThrow();
    });
  });

  describe('assertEventStructure', () => {
    it('should pass when all fields present', () => {
      const event: SSEEvent = {
        eventType: 'test',
        data: { id: 1, status: 'active' },
      };

      expect(() => assertEventStructure(event, ['id', 'status'])).not.toThrow();
    });

    it('should fail when field missing', () => {
      const event: SSEEvent = {
        eventType: 'test',
        data: { id: 1 },
      };

      expect(() => assertEventStructure(event, ['id', 'status'])).toThrow();
    });
  });

  describe('assertLatency', () => {
    it('should pass for acceptable latency', () => {
      const sendTime = Date.now() - 50;
      const receiveTime = Date.now();

      expect(() => assertLatency(sendTime, receiveTime, 100)).not.toThrow();
    });

    it('should fail for excessive latency', () => {
      const sendTime = Date.now() - 200;
      const receiveTime = Date.now();

      expect(() => assertLatency(sendTime, receiveTime, 100)).toThrow();
    });
  });
});

// =============================================================================
// Integration Tests (requires server)
// =============================================================================

describe('SSE Client Integration', () => {
  let app: FastifyInstance;
  let port: number;
  let clients: SSEClientResult[] = [];

  beforeAll(async () => {
    port = await getAvailablePort();
    app = Fastify({ logger: false });

    // Simple SSE endpoint for testing utilities
    app.get('/test/events', (request, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial event
      reply.raw.write(
        `data: ${JSON.stringify({ eventType: 'connected', timestamp: new Date().toISOString() })}\n\n`
      );

      // Keep connection open
      request.raw.on('close', () => {
        // Cleanup
      });
    });

    await app.listen({ port, host: '127.0.0.1' });
  });

  afterAll(async () => {
    closeAllClients(clients);
    await app.close();
  });

  beforeEach(() => {
    closeAllClients(clients);
    clients = [];
  });

  describe('createSSEClientWithRetry', () => {
    it('should connect successfully on first try', async () => {
      const client = await createSSEClientWithRetry({
        port,
        path: '/test/events',
        maxRetries: 3,
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
    });

    it('should retry on connection failure', async () => {
      let retryCount = 0;

      // Connect to non-existent port first, then succeed
      await expect(
        createSSEClientWithRetry({
          port: 59999, // Non-existent port
          path: '/test/events',
          maxRetries: 2,
          retryDelayMs: 100,
          onRetry: () => {
            retryCount++;
          },
        })
      ).rejects.toThrow();

      expect(retryCount).toBe(1); // Should have retried once before giving up
    });
  });

  describe('waitForCondition', () => {
    it('should resolve when condition is met', async () => {
      const client = await createSSEClient({
        port,
        path: '/test/events',
      });
      clients.push(client);

      const events = await waitForCondition(
        client,
        (evts) => evts.some((e) => e.eventType === 'connected'),
        { timeoutMs: 2000 }
      );

      expect(events.some((e) => e.eventType === 'connected')).toBe(true);
    });

    it('should timeout when condition not met', async () => {
      const client = await createSSEClient({
        port,
        path: '/test/events',
      });
      clients.push(client);

      await expect(
        waitForCondition(client, (evts) => evts.length > 100, { timeoutMs: 500 })
      ).rejects.toThrow('Timeout');
    });
  });

  describe('waitForEventCount', () => {
    it('should wait for specific number of events', async () => {
      const client = await createSSEClient({
        port,
        path: '/test/events',
      });
      clients.push(client);

      const events = await waitForEventCount(client, 'connected', 1, 2000);
      expect(events).toHaveLength(1);
    });
  });
});
