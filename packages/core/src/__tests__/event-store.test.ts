/**
 * Event Store Tests
 * Tests for durable event persistence and publishing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConcurrencyError,
  InMemoryEventStore,
  EventStore,
  createEventStore,
  createInMemoryEventStore,
  type StoredEvent,
  type EventPublisher,
} from '../event-store.js';

describe('ConcurrencyError', () => {
  it('should create error with message only', () => {
    const error = new ConcurrencyError('Version conflict');

    expect(error.message).toBe('Version conflict');
    expect(error.name).toBe('ConcurrencyError');
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.aggregateId).toBeUndefined();
    expect(error.expectedVersion).toBeUndefined();
  });

  it('should create error with all fields', () => {
    const error = new ConcurrencyError('Conflict detected', 'agg-123', 5);

    expect(error.message).toBe('Conflict detected');
    expect(error.aggregateId).toBe('agg-123');
    expect(error.expectedVersion).toBe(5);
  });

  it('should be instanceof Error', () => {
    const error = new ConcurrencyError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  const createEvent = (overrides: Partial<StoredEvent> = {}): StoredEvent => ({
    id: `event-${Date.now()}-${Math.random()}`,
    type: 'TestEvent',
    aggregateId: undefined,
    aggregateType: undefined,
    version: undefined,
    payload: { data: 'test' },
    metadata: {
      correlationId: 'corr-123',
      causationId: undefined,
      idempotencyKey: `idem-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      source: 'test',
    },
    ...overrides,
  });

  describe('append', () => {
    it('should append event successfully', async () => {
      const event = createEvent();

      await store.append(event);

      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0]).toEqual(event);
    });

    it('should append multiple events', async () => {
      const event1 = createEvent({ type: 'Event1' });
      const event2 = createEvent({ type: 'Event2' });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });

    it('should silently skip duplicate idempotency keys', async () => {
      const idempotencyKey = 'unique-key-123';
      const event1 = createEvent({
        type: 'FirstEvent',
        metadata: { ...createEvent().metadata, idempotencyKey },
      });
      const event2 = createEvent({
        type: 'DuplicateEvent',
        metadata: { ...createEvent().metadata, idempotencyKey },
      });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0]!.type).toBe('FirstEvent');
    });

    it('should track idempotency keys', async () => {
      const key = 'tracked-key';
      const event = createEvent({
        metadata: { ...createEvent().metadata, idempotencyKey: key },
      });

      expect(store.hasIdempotencyKey(key)).toBe(false);
      await store.append(event);
      expect(store.hasIdempotencyKey(key)).toBe(true);
    });

    it('should throw ConcurrencyError on version conflict', async () => {
      const event1 = createEvent({
        aggregateId: 'agg-1',
        version: 1,
      });
      const event2 = createEvent({
        aggregateId: 'agg-1',
        version: 1, // Same version as event1
      });

      await store.append(event1);

      try {
        await store.append(event2);
        expect.fail('Should have thrown ConcurrencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyError);
        expect((error as ConcurrencyError).message).toMatch(/version conflict/i);
        expect((error as ConcurrencyError).aggregateId).toBe('agg-1');
        expect((error as ConcurrencyError).expectedVersion).toBe(1);
      }
    });

    it('should allow same version for different aggregates', async () => {
      const event1 = createEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createEvent({ aggregateId: 'agg-2', version: 1 });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });

    it('should allow events without aggregate/version', async () => {
      const event1 = createEvent({ aggregateId: undefined, version: undefined });
      const event2 = createEvent({ aggregateId: undefined, version: undefined });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('getByCorrelationId', () => {
    it('should return events by correlation ID', async () => {
      const correlationId = 'corr-specific';
      const event1 = createEvent({
        metadata: { ...createEvent().metadata, correlationId },
      });
      const event2 = createEvent({
        metadata: { ...createEvent().metadata, correlationId },
      });
      const event3 = createEvent(); // Different correlation ID

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const result = await store.getByCorrelationId(correlationId);

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.metadata.correlationId === correlationId)).toBe(true);
    });

    it('should return empty array when no events match', async () => {
      await store.append(createEvent());

      const result = await store.getByCorrelationId('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('getByAggregateId', () => {
    it('should return events by aggregate ID', async () => {
      const aggregateId = 'agg-specific';
      const event1 = createEvent({ aggregateId, version: 1 });
      const event2 = createEvent({ aggregateId, version: 2 });
      const event3 = createEvent({ aggregateId: 'other-agg', version: 1 });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const result = await store.getByAggregateId(aggregateId);

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.aggregateId === aggregateId)).toBe(true);
    });

    it('should return events sorted by version', async () => {
      const aggregateId = 'agg-sorted';
      const event1 = createEvent({ aggregateId, version: 3 });
      const event2 = createEvent({ aggregateId, version: 1 });
      const event3 = createEvent({ aggregateId, version: 2 });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const result = await store.getByAggregateId(aggregateId);

      expect(result.map((e) => e.version)).toEqual([1, 2, 3]);
    });

    it('should filter by afterVersion', async () => {
      const aggregateId = 'agg-filter';
      await store.append(createEvent({ aggregateId, version: 1 }));
      await store.append(createEvent({ aggregateId, version: 2 }));
      await store.append(createEvent({ aggregateId, version: 3 }));
      await store.append(createEvent({ aggregateId, version: 4 }));

      const result = await store.getByAggregateId(aggregateId, 2);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.version)).toEqual([3, 4]);
    });

    it('should handle events with undefined version', async () => {
      const aggregateId = 'agg-undef-version';
      await store.append(createEvent({ aggregateId, version: undefined }));
      await store.append(createEvent({ aggregateId, version: 1 }));

      const result = await store.getByAggregateId(aggregateId);

      expect(result).toHaveLength(2);
    });
  });

  describe('getByType', () => {
    it('should return events by type', async () => {
      await store.append(createEvent({ type: 'TypeA' }));
      await store.append(createEvent({ type: 'TypeB' }));
      await store.append(createEvent({ type: 'TypeA' }));

      const result = await store.getByType('TypeA');

      expect(result).toHaveLength(2);
      expect(result.every((e) => e.type === 'TypeA')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append(createEvent({ type: 'SameType' }));
      }

      const result = await store.getByType('SameType', 3);

      expect(result).toHaveLength(3);
    });

    it('should return last N events when limit is applied', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.append(createEvent({ type: 'Ordered', payload: { order: i } }));
      }

      const result = await store.getByType('Ordered', 2);

      // Should return last 2 (order 4 and 5)
      expect(result).toHaveLength(2);
      expect(result[0]!.payload.order).toBe(4);
      expect(result[1]!.payload.order).toBe(5);
    });

    it('should use default limit of 100', async () => {
      for (let i = 0; i < 5; i++) {
        await store.append(createEvent({ type: 'DefaultLimit' }));
      }

      const result = await store.getByType('DefaultLimit');

      // With only 5 events, should return all
      expect(result).toHaveLength(5);
    });
  });

  describe('getAll', () => {
    it('should return copy of all events', async () => {
      await store.append(createEvent());
      await store.append(createEvent());

      const result = store.getAll();

      expect(result).toHaveLength(2);
      // Verify it's a copy
      result.push(createEvent());
      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should clear all events and idempotency keys', async () => {
      const key = 'key-to-clear';
      await store.append(
        createEvent({
          metadata: { ...createEvent().metadata, idempotencyKey: key },
        })
      );

      expect(store.getAll()).toHaveLength(1);
      expect(store.hasIdempotencyKey(key)).toBe(true);

      store.clear();

      expect(store.getAll()).toHaveLength(0);
      expect(store.hasIdempotencyKey(key)).toBe(false);
    });
  });
});

describe('EventStore', () => {
  let repository: InMemoryEventStore;
  let eventStore: EventStore;

  beforeEach(() => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test-service' });
  });

  describe('emit', () => {
    it('should emit event with required fields', async () => {
      const event = await eventStore.emit({
        type: 'UserCreated',
        correlationId: 'corr-123',
        payload: { userId: 'user-1', email: 'test@example.com' },
      });

      expect(event.id).toBeDefined();
      expect(event.type).toBe('UserCreated');
      expect(event.payload).toEqual({ userId: 'user-1', email: 'test@example.com' });
      expect(event.metadata.correlationId).toBe('corr-123');
      expect(event.metadata.source).toBe('test-service');
      expect(event.metadata.timestamp).toBeDefined();
      expect(event.metadata.idempotencyKey).toBeDefined();
    });

    it('should emit event with aggregate info', async () => {
      const event = await eventStore.emit({
        type: 'OrderPlaced',
        correlationId: 'corr-456',
        payload: { orderId: 'ord-1' },
        aggregateId: 'ord-1',
        aggregateType: 'Order',
        version: 1,
      });

      expect(event.aggregateId).toBe('ord-1');
      expect(event.aggregateType).toBe('Order');
      expect(event.version).toBe(1);
    });

    it('should emit event with causation ID', async () => {
      const event = await eventStore.emit({
        type: 'SideEffect',
        correlationId: 'corr-789',
        payload: {},
        causationId: 'cause-event-123',
      });

      expect(event.metadata.causationId).toBe('cause-event-123');
    });

    it('should use custom idempotency key when provided', async () => {
      const customKey = 'custom-idem-key';
      const event = await eventStore.emit({
        type: 'CustomKey',
        correlationId: 'corr-aaa',
        payload: {},
        idempotencyKey: customKey,
      });

      expect(event.metadata.idempotencyKey).toBe(customKey);
    });

    it('should generate unique idempotency key when not provided', async () => {
      const event1 = await eventStore.emit({
        type: 'AutoKey',
        correlationId: 'corr-bbb',
        payload: {},
      });
      const event2 = await eventStore.emit({
        type: 'AutoKey',
        correlationId: 'corr-bbb',
        payload: {},
      });

      expect(event1.metadata.idempotencyKey).not.toBe(event2.metadata.idempotencyKey);
    });

    it('should persist event to repository', async () => {
      await eventStore.emit({
        type: 'Persisted',
        correlationId: 'corr-persist',
        payload: { value: 42 },
      });

      const events = repository.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('Persisted');
    });

    it('should handle event with undefined causationId', async () => {
      const event = await eventStore.emit({
        type: 'NoCausation',
        correlationId: 'corr-no-cause',
        payload: {},
        causationId: undefined,
      });

      expect(event.metadata.causationId).toBeUndefined();
    });

    it('should handle event with all optional fields populated', async () => {
      const event = await eventStore.emit({
        type: 'CompleteEvent',
        correlationId: 'corr-complete',
        payload: { data: 'test' },
        aggregateId: 'agg-complete',
        aggregateType: 'CompleteAggregate',
        version: 10,
        causationId: 'cause-complete',
        idempotencyKey: 'custom-complete-key',
      });

      expect(event.aggregateId).toBe('agg-complete');
      expect(event.aggregateType).toBe('CompleteAggregate');
      expect(event.version).toBe(10);
      expect(event.metadata.causationId).toBe('cause-complete');
      expect(event.metadata.idempotencyKey).toBe('custom-complete-key');
    });

    it('should generate different idempotency keys for rapid successive events', async () => {
      const events = await Promise.all([
        eventStore.emit({ type: 'RapidEvent', correlationId: 'corr-rapid', payload: {} }),
        eventStore.emit({ type: 'RapidEvent', correlationId: 'corr-rapid', payload: {} }),
        eventStore.emit({ type: 'RapidEvent', correlationId: 'corr-rapid', payload: {} }),
      ]);

      const keys = events.map((e) => e.metadata.idempotencyKey);
      expect(new Set(keys).size).toBe(3); // All unique
    });

    it('should include type and correlationId in generated idempotency key', async () => {
      const event = await eventStore.emit({
        type: 'SpecialType',
        correlationId: 'special-corr',
        payload: {},
      });

      expect(event.metadata.idempotencyKey).toContain('SpecialType');
      expect(event.metadata.idempotencyKey).toContain('special-corr');
    });
  });

  describe('publishers', () => {
    it('should publish to all registered publishers', async () => {
      const publisher1: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };
      const publisher2: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(publisher1);
      eventStore.addPublisher(publisher2);

      const event = await eventStore.emit({
        type: 'Published',
        correlationId: 'corr-pub',
        payload: {},
      });

      // Allow async publish to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher1.publish).toHaveBeenCalledWith(event);
      expect(publisher2.publish).toHaveBeenCalledWith(event);
    });

    it('should not throw when publisher fails', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Publish failed')),
      };

      eventStore.addPublisher(failingPublisher);

      // Should not throw
      const event = await eventStore.emit({
        type: 'FailingPublish',
        correlationId: 'corr-fail',
        payload: {},
      });

      expect(event).toBeDefined();
    });

    it('should continue publishing to other publishers when one fails', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Publish failed')),
      };
      const successPublisher: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(failingPublisher);
      eventStore.addPublisher(successPublisher);

      const event = await eventStore.emit({
        type: 'MixedPublish',
        correlationId: 'corr-mixed',
        payload: {},
      });

      // Allow async publish to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(failingPublisher.publish).toHaveBeenCalledWith(event);
      expect(successPublisher.publish).toHaveBeenCalledWith(event);
    });

    it('should work without any publishers', async () => {
      const event = await eventStore.emit({
        type: 'NoPublishers',
        correlationId: 'corr-none',
        payload: {},
      });

      expect(event).toBeDefined();
      expect(event.type).toBe('NoPublishers');
    });
  });

  describe('getByCorrelationId', () => {
    it('should delegate to repository', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'lookup-corr',
        payload: {},
      });

      const result = await eventStore.getByCorrelationId('lookup-corr');

      expect(result).toHaveLength(1);
    });
  });

  describe('getByAggregateId', () => {
    it('should delegate to repository', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'lookup-agg',
        version: 1,
      });

      const result = await eventStore.getByAggregateId('lookup-agg');

      expect(result).toHaveLength(1);
    });

    it('should pass afterVersion to repository', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'agg-ver',
        version: 1,
      });
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'agg-ver',
        version: 2,
      });

      const result = await eventStore.getByAggregateId('agg-ver', 1);

      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBe(2);
    });
  });

  describe('getByType', () => {
    it('should delegate to repository', async () => {
      await eventStore.emit({
        type: 'SpecificType',
        correlationId: 'corr',
        payload: {},
      });

      const result = await eventStore.getByType('SpecificType');

      expect(result).toHaveLength(1);
    });

    it('should pass limit to repository', async () => {
      for (let i = 0; i < 5; i++) {
        await eventStore.emit({
          type: 'ManyType',
          correlationId: 'corr',
          payload: {},
        });
      }

      const result = await eventStore.getByType('ManyType', 2);

      expect(result).toHaveLength(2);
    });
  });
});

describe('createEventStore', () => {
  it('should create in-memory store when no connection string', () => {
    const store = createEventStore({ source: 'test' });

    expect(store).toBeInstanceOf(EventStore);
  });

  it('should create postgres store when connection string provided', () => {
    const store = createEventStore({
      source: 'test',
      connectionString: 'postgresql://localhost:5432/test',
      tableName: 'custom_events',
    });

    expect(store).toBeInstanceOf(EventStore);
  });
});

describe('createInMemoryEventStore', () => {
  it('should create in-memory event store', () => {
    const store = createInMemoryEventStore('test-source');

    expect(store).toBeInstanceOf(EventStore);
  });

  it('should use provided source', async () => {
    const store = createInMemoryEventStore('my-service');

    const event = await store.emit({
      type: 'Test',
      correlationId: 'corr',
      payload: {},
    });

    expect(event.metadata.source).toBe('my-service');
  });
});

describe('InMemoryEventStore - Edge Cases', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  const createEvent = (overrides: Partial<StoredEvent> = {}): StoredEvent => ({
    id: `event-${Date.now()}-${Math.random()}`,
    type: 'TestEvent',
    aggregateId: undefined,
    aggregateType: undefined,
    version: undefined,
    payload: { data: 'test' },
    metadata: {
      correlationId: 'corr-123',
      causationId: undefined,
      idempotencyKey: `idem-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      source: 'test',
    },
    ...overrides,
  });

  it('should handle version 0 correctly', async () => {
    const event = createEvent({ aggregateId: 'agg-1', version: 0 });
    await store.append(event);

    const result = await store.getByAggregateId('agg-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.version).toBe(0);
  });

  it('should allow version conflict check to pass when aggregateId is undefined but version is defined', async () => {
    const event1 = createEvent({ aggregateId: undefined, version: 1 });
    const event2 = createEvent({ aggregateId: undefined, version: 1 });

    await store.append(event1);
    await store.append(event2);

    expect(store.getAll()).toHaveLength(2);
  });

  it('should allow version conflict check to pass when version is undefined but aggregateId is defined', async () => {
    const event1 = createEvent({ aggregateId: 'agg-1', version: undefined });
    const event2 = createEvent({ aggregateId: 'agg-1', version: undefined });

    await store.append(event1);
    await store.append(event2);

    expect(store.getAll()).toHaveLength(2);
  });

  it('should filter by afterVersion when version is 0', async () => {
    const aggregateId = 'agg-zero';
    await store.append(createEvent({ aggregateId, version: 0 }));
    await store.append(createEvent({ aggregateId, version: 1 }));
    await store.append(createEvent({ aggregateId, version: 2 }));

    const result = await store.getByAggregateId(aggregateId, 0);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.version)).toEqual([1, 2]);
  });

  it('should include version 0 when afterVersion is undefined', async () => {
    const aggregateId = 'agg-include-zero';
    await store.append(createEvent({ aggregateId, version: 0 }));
    await store.append(createEvent({ aggregateId, version: 1 }));

    const result = await store.getByAggregateId(aggregateId);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.version)).toEqual([0, 1]);
  });

  it('should handle mixed undefined and numeric versions in sorting', async () => {
    const aggregateId = 'agg-mixed';
    await store.append(createEvent({ aggregateId, version: undefined }));
    await store.append(createEvent({ aggregateId, version: 2 }));
    await store.append(createEvent({ aggregateId, version: undefined }));
    await store.append(createEvent({ aggregateId, version: 1 }));

    const result = await store.getByAggregateId(aggregateId);

    // Should be sorted, with undefined versions treated as 0
    expect(result).toHaveLength(4);
    const versions = result.map((e) => e.version ?? 0);
    expect(versions[0]).toBeLessThanOrEqual(versions[1]!);
    expect(versions[1]).toBeLessThanOrEqual(versions[2]!);
    expect(versions[2]).toBeLessThanOrEqual(versions[3]!);
  });

  it('should return empty array for non-existent aggregate', async () => {
    const result = await store.getByAggregateId('non-existent');
    expect(result).toEqual([]);
  });

  it('should return empty array for non-existent type', async () => {
    const result = await store.getByType('NonExistentType');
    expect(result).toEqual([]);
  });

  it('should handle limit larger than available events', async () => {
    await store.append(createEvent({ type: 'LimitTest' }));
    await store.append(createEvent({ type: 'LimitTest' }));

    const result = await store.getByType('LimitTest', 100);

    expect(result).toHaveLength(2);
  });
});
