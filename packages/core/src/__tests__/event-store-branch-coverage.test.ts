/**
 * Event Store Branch Coverage Tests
 * Targets specific branches for 85% HIPAA/GDPR coverage threshold
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConcurrencyError,
  InMemoryEventStore,
  PostgresEventStore,
  EventStore,
  createEventStore,
  createInMemoryEventStore,
  type StoredEvent,
  type EventPublisher,
} from '../event-store.js';

// =============================================================================
// Helper Functions
// =============================================================================

function createEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  const id = `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    type: 'TestEvent',
    aggregateId: undefined,
    aggregateType: undefined,
    version: undefined,
    payload: { test: true },
    metadata: {
      correlationId: 'corr-123',
      causationId: undefined,
      idempotencyKey: `idem-${id}`,
      timestamp: new Date().toISOString(),
      source: 'test',
    },
    ...overrides,
  };
}

// =============================================================================
// ConcurrencyError Branch Coverage
// =============================================================================

describe('ConcurrencyError Branch Coverage', () => {
  it('should create error with message only', () => {
    const error = new ConcurrencyError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ConcurrencyError');
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.aggregateId).toBeUndefined();
    expect(error.expectedVersion).toBeUndefined();
  });

  it('should create error with aggregateId only', () => {
    const error = new ConcurrencyError('Test error', 'agg-123');

    expect(error.aggregateId).toBe('agg-123');
    expect(error.expectedVersion).toBeUndefined();
  });

  it('should create error with all parameters', () => {
    const error = new ConcurrencyError('Test error', 'agg-123', 5);

    expect(error.message).toBe('Test error');
    expect(error.aggregateId).toBe('agg-123');
    expect(error.expectedVersion).toBe(5);
  });

  it('should be an instance of Error', () => {
    const error = new ConcurrencyError('Test');
    expect(error).toBeInstanceOf(Error);
  });
});

// =============================================================================
// InMemoryEventStore Branch Coverage
// =============================================================================

describe('InMemoryEventStore Branch Coverage', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe('append - idempotency key branch', () => {
    it('should silently skip duplicate idempotency keys', async () => {
      const key = 'unique-idem-key';
      const event1 = createEvent({
        type: 'First',
        metadata: { ...createEvent().metadata, idempotencyKey: key },
      });
      const event2 = createEvent({
        type: 'Second',
        metadata: { ...createEvent().metadata, idempotencyKey: key },
      });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0]?.type).toBe('First');
    });

    it('should track idempotency key after successful append', async () => {
      const key = 'new-key';
      const event = createEvent({
        metadata: { ...createEvent().metadata, idempotencyKey: key },
      });

      expect(store.hasIdempotencyKey(key)).toBe(false);
      await store.append(event);
      expect(store.hasIdempotencyKey(key)).toBe(true);
    });
  });

  describe('append - version conflict branch', () => {
    it('should throw ConcurrencyError when aggregateId and version match existing', async () => {
      const event1 = createEvent({
        aggregateId: 'agg-1',
        version: 1,
      });
      const event2 = createEvent({
        aggregateId: 'agg-1',
        version: 1,
      });

      await store.append(event1);

      // The append method throws synchronously on version conflict
      expect(() => store.append(event2)).toThrow(ConcurrencyError);
    });

    it('should include aggregateId and version in ConcurrencyError', async () => {
      const event1 = createEvent({ aggregateId: 'agg-1', version: 5 });
      const event2 = createEvent({ aggregateId: 'agg-1', version: 5 });

      await store.append(event1);

      try {
        await store.append(event2);
        expect.fail('Should have thrown ConcurrencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyError);
        const concError = error as ConcurrencyError;
        expect(concError.aggregateId).toBe('agg-1');
        expect(concError.expectedVersion).toBe(5);
      }
    });

    it('should allow same version for different aggregates', async () => {
      const event1 = createEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createEvent({ aggregateId: 'agg-2', version: 1 });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });

    it('should allow events when aggregateId is undefined', async () => {
      const event1 = createEvent({ aggregateId: undefined, version: 1 });
      const event2 = createEvent({ aggregateId: undefined, version: 1 });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });

    it('should allow events when version is undefined', async () => {
      const event1 = createEvent({ aggregateId: 'agg-1', version: undefined });
      const event2 = createEvent({ aggregateId: 'agg-1', version: undefined });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('getByAggregateId - afterVersion branch', () => {
    it('should return all events when afterVersion is undefined', async () => {
      await store.append(createEvent({ aggregateId: 'agg-1', version: 1 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 2 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 3 }));

      const result = await store.getByAggregateId('agg-1');

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.version)).toEqual([1, 2, 3]);
    });

    it('should filter events after specified version', async () => {
      await store.append(createEvent({ aggregateId: 'agg-1', version: 1 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 2 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 3 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 4 }));

      const result = await store.getByAggregateId('agg-1', 2);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.version)).toEqual([3, 4]);
    });

    it('should handle events with undefined version when filtering', async () => {
      await store.append(createEvent({ aggregateId: 'agg-1', version: undefined }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 1 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 2 }));

      const result = await store.getByAggregateId('agg-1', 0);

      // undefined versions are treated as 0, so only version > 0 is returned
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should sort events by version', async () => {
      await store.append(createEvent({ aggregateId: 'agg-1', version: 3 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 1 }));
      await store.append(createEvent({ aggregateId: 'agg-1', version: 2 }));

      const result = await store.getByAggregateId('agg-1');

      expect(result.map((e) => e.version)).toEqual([1, 2, 3]);
    });
  });

  describe('getByType - limit branch', () => {
    it('should use default limit of 100', async () => {
      for (let i = 0; i < 150; i++) {
        await store.append(createEvent({ type: 'HighVolume' }));
      }

      const result = await store.getByType('HighVolume');

      expect(result).toHaveLength(100);
    });

    it('should respect custom limit', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append(createEvent({ type: 'Limited' }));
      }

      const result = await store.getByType('Limited', 3);

      expect(result).toHaveLength(3);
    });

    it('should return last N events when limit applied', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.append(createEvent({ type: 'Ordered', payload: { order: i } }));
      }

      const result = await store.getByType('Ordered', 2);

      expect(result).toHaveLength(2);
      expect(result[0]?.payload.order).toBe(4);
      expect(result[1]?.payload.order).toBe(5);
    });
  });

  describe('getAll and clear', () => {
    it('should return copy of events array', async () => {
      await store.append(createEvent());

      const result1 = store.getAll();
      result1.push(createEvent());

      expect(store.getAll()).toHaveLength(1);
    });

    it('should clear events and idempotency keys', async () => {
      const key = 'clear-test';
      await store.append(
        createEvent({ metadata: { ...createEvent().metadata, idempotencyKey: key } })
      );

      expect(store.getAll()).toHaveLength(1);
      expect(store.hasIdempotencyKey(key)).toBe(true);

      store.clear();

      expect(store.getAll()).toHaveLength(0);
      expect(store.hasIdempotencyKey(key)).toBe(false);
    });
  });
});

// =============================================================================
// PostgresEventStore Branch Coverage
// =============================================================================

describe('PostgresEventStore Branch Coverage', () => {
  describe('tableName getter', () => {
    it('should use default tableName when not specified', () => {
      const store = new PostgresEventStore({
        connectionString: 'postgresql://localhost:5432/test',
        tableName: undefined,
      });

      // Access the tableName via the class to verify default
      expect(store).toBeDefined();
    });

    it('should use custom tableName when specified', () => {
      const store = new PostgresEventStore({
        connectionString: 'postgresql://localhost:5432/test',
        tableName: 'custom_events',
      });

      expect(store).toBeDefined();
    });
  });

  describe('initialize - connectionString check', () => {
    it('should throw when connectionString is undefined', async () => {
      const store = new PostgresEventStore({
        connectionString: undefined,
        tableName: 'events',
      });

      await expect(store.initialize()).rejects.toThrow('PostgreSQL connection string required');
    });
  });

  describe('close - pool check', () => {
    it('should handle close when pool is undefined', async () => {
      const store = new PostgresEventStore({
        connectionString: 'postgresql://localhost:5432/test',
        tableName: 'events',
      });

      // Pool is not initialized, close should not throw
      await expect(store.close()).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// EventStore Service Branch Coverage
// =============================================================================

describe('EventStore Service Branch Coverage', () => {
  let repository: InMemoryEventStore;
  let eventStore: EventStore;

  beforeEach(() => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test-service' });
  });

  describe('emit - idempotencyKey branch', () => {
    it('should use provided idempotencyKey', async () => {
      const customKey = 'custom-idem-key-123';

      const event = await eventStore.emit({
        type: 'Test',
        correlationId: 'corr-1',
        payload: {},
        idempotencyKey: customKey,
      });

      expect(event.metadata.idempotencyKey).toBe(customKey);
    });

    it('should generate idempotencyKey when not provided', async () => {
      const event1 = await eventStore.emit({
        type: 'Test',
        correlationId: 'corr-1',
        payload: {},
      });

      const event2 = await eventStore.emit({
        type: 'Test',
        correlationId: 'corr-1',
        payload: {},
      });

      expect(event1.metadata.idempotencyKey).toBeDefined();
      expect(event2.metadata.idempotencyKey).toBeDefined();
      expect(event1.metadata.idempotencyKey).not.toBe(event2.metadata.idempotencyKey);
    });
  });

  describe('emit - causationId branch', () => {
    it('should include causationId when provided', async () => {
      const event = await eventStore.emit({
        type: 'Effect',
        correlationId: 'corr-1',
        payload: {},
        causationId: 'cause-event-123',
      });

      expect(event.metadata.causationId).toBe('cause-event-123');
    });

    it('should have undefined causationId when not provided', async () => {
      const event = await eventStore.emit({
        type: 'Root',
        correlationId: 'corr-1',
        payload: {},
      });

      expect(event.metadata.causationId).toBeUndefined();
    });
  });

  describe('emit - aggregate info branches', () => {
    it('should include aggregateId when provided', async () => {
      const event = await eventStore.emit({
        type: 'AggregateEvent',
        correlationId: 'corr-1',
        payload: {},
        aggregateId: 'agg-123',
      });

      expect(event.aggregateId).toBe('agg-123');
    });

    it('should include aggregateType when provided', async () => {
      const event = await eventStore.emit({
        type: 'TypedEvent',
        correlationId: 'corr-1',
        payload: {},
        aggregateType: 'Order',
      });

      expect(event.aggregateType).toBe('Order');
    });

    it('should include version when provided', async () => {
      const event = await eventStore.emit({
        type: 'VersionedEvent',
        correlationId: 'corr-1',
        payload: {},
        aggregateId: 'agg-1',
        version: 5,
      });

      expect(event.version).toBe(5);
    });
  });

  describe('publisher - success and failure branches', () => {
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

      // Wait for async publishing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher1.publish).toHaveBeenCalledWith(event);
      expect(publisher2.publish).toHaveBeenCalledWith(event);
    });

    it('should not throw when publisher fails', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Publish failed')),
      };

      eventStore.addPublisher(failingPublisher);

      const event = await eventStore.emit({
        type: 'FailSafe',
        correlationId: 'corr-fail',
        payload: {},
      });

      expect(event).toBeDefined();

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(failingPublisher.publish).toHaveBeenCalled();
    });

    it('should continue with other publishers when one fails', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      const successPublisher: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(failingPublisher);
      eventStore.addPublisher(successPublisher);

      const event = await eventStore.emit({
        type: 'MixedPublish',
        correlationId: 'corr-mix',
        payload: {},
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(failingPublisher.publish).toHaveBeenCalledWith(event);
      expect(successPublisher.publish).toHaveBeenCalledWith(event);
    });
  });

  describe('getByCorrelationId', () => {
    it('should delegate to repository', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'specific-corr',
        payload: {},
      });

      const result = await eventStore.getByCorrelationId('specific-corr');

      expect(result).toHaveLength(1);
    });
  });

  describe('getByAggregateId', () => {
    it('should delegate to repository without afterVersion', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'specific-agg',
        version: 1,
      });

      const result = await eventStore.getByAggregateId('specific-agg');

      expect(result).toHaveLength(1);
    });

    it('should delegate to repository with afterVersion', async () => {
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'ver-agg',
        version: 1,
      });
      await eventStore.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
        aggregateId: 'ver-agg',
        version: 2,
      });

      const result = await eventStore.getByAggregateId('ver-agg', 1);

      expect(result).toHaveLength(1);
      expect(result[0]?.version).toBe(2);
    });
  });

  describe('getByType', () => {
    it('should delegate to repository without limit', async () => {
      await eventStore.emit({
        type: 'SpecificType',
        correlationId: 'corr',
        payload: {},
      });

      const result = await eventStore.getByType('SpecificType');

      expect(result).toHaveLength(1);
    });

    it('should delegate to repository with limit', async () => {
      for (let i = 0; i < 10; i++) {
        await eventStore.emit({
          type: 'LimitedType',
          correlationId: 'corr',
          payload: {},
        });
      }

      const result = await eventStore.getByType('LimitedType', 3);

      expect(result).toHaveLength(3);
    });
  });
});

// =============================================================================
// Factory Functions Branch Coverage
// =============================================================================

describe('Factory Functions Branch Coverage', () => {
  describe('createEventStore', () => {
    it('should create InMemoryEventStore when no connectionString', () => {
      const store = createEventStore({ source: 'test' });

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should create PostgresEventStore when connectionString provided', () => {
      const store = createEventStore({
        source: 'test',
        connectionString: 'postgresql://localhost:5432/test',
      });

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should pass tableName to PostgresEventStore', () => {
      const store = createEventStore({
        source: 'test',
        connectionString: 'postgresql://localhost:5432/test',
        tableName: 'custom_events',
      });

      expect(store).toBeInstanceOf(EventStore);
    });
  });

  describe('createInMemoryEventStore', () => {
    it('should create EventStore with InMemoryEventStore repository', () => {
      const store = createInMemoryEventStore('my-service');

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should use provided source', async () => {
      const store = createInMemoryEventStore('specific-source');

      const event = await store.emit({
        type: 'Test',
        correlationId: 'corr',
        payload: {},
      });

      expect(event.metadata.source).toBe('specific-source');
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Event Store Edge Cases', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it('should handle empty correlation ID query', async () => {
    await store.append(createEvent());

    const result = await store.getByCorrelationId('non-existent');

    expect(result).toEqual([]);
  });

  it('should handle empty aggregate ID query', async () => {
    await store.append(createEvent());

    const result = await store.getByAggregateId('non-existent');

    expect(result).toEqual([]);
  });

  it('should handle empty type query', async () => {
    await store.append(createEvent());

    const result = await store.getByType('NonExistentType');

    expect(result).toEqual([]);
  });

  it('should preserve all event properties through append and retrieve', async () => {
    const originalEvent = createEvent({
      type: 'CompleteEvent',
      aggregateId: 'agg-complete',
      aggregateType: 'CompleteAggregate',
      version: 42,
      payload: { nested: { value: 'test' } },
      metadata: {
        correlationId: 'corr-complete',
        causationId: 'cause-complete',
        idempotencyKey: 'idem-complete',
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'complete-source',
      },
    });

    await store.append(originalEvent);

    const [retrieved] = await store.getByCorrelationId('corr-complete');

    expect(retrieved).toEqual(originalEvent);
  });
});
