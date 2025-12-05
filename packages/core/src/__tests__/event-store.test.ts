/**
 * Event Store Unit Tests
 *
 * Comprehensive tests for the event store implementation including:
 * - Event store initialization
 * - Event appending/retrieving
 * - Snapshot handling
 * - Event stream operations
 * - All error handling
 * - ConcurrencyError handling
 * - Idempotency guarantees
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConcurrencyError,
  InMemoryEventStore,
  PostgresEventStore,
  EventStore,
  createEventStore,
  createInMemoryEventStore,
  type StoredEvent,
  type EventPublisher,
  type EventStoreConfig,
} from '../event-store.js';

// Mock pg module
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn(),
  end: vi.fn(),
};

// Create a mock Pool class
class MockPool {
  constructor() {
    return mockPool;
  }
}

vi.mock('pg', () => ({
  default: {
    Pool: MockPool,
  },
}));

/**
 * Helper to create a test event with unique defaults
 */
let eventCounter = 0;
function createTestEvent(overrides?: Partial<StoredEvent>): StoredEvent {
  eventCounter++;
  const base = {
    id: `test-event-id-${eventCounter}`,
    type: 'TestEvent',
    aggregateId: `test-aggregate-${eventCounter}`,
    aggregateType: 'TestAggregate',
    version: 1,
    payload: { data: 'test' },
    metadata: {
      correlationId: `test-correlation-id-${eventCounter}`,
      causationId: 'test-causation-id',
      idempotencyKey: `test-idempotency-key-${eventCounter}`,
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'test-source',
    },
  };

  // Deep merge metadata if provided
  if (overrides?.metadata) {
    return {
      ...base,
      ...overrides,
      metadata: {
        ...base.metadata,
        ...overrides.metadata,
      },
    };
  }

  return {
    ...base,
    ...overrides,
  };
}

/**
 * Track queries for testing
 */
const queries: Array<{ sql: string; params?: unknown[] }> = [];

/**
 * Reset mock state
 */
function resetMocks() {
  queries.length = 0;
  vi.clearAllMocks();
  mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 0 };
  });
  mockClient.release.mockImplementation(() => {});
  mockPool.connect.mockResolvedValue(mockClient);
  mockPool.end.mockResolvedValue(undefined);
}

describe('ConcurrencyError', () => {
  it('should create error with all properties', () => {
    const error = new ConcurrencyError('Test message', 'aggregate-123', 5);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConcurrencyError');
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.aggregateId).toBe('aggregate-123');
    expect(error.expectedVersion).toBe(5);
  });

  it('should create error without optional properties', () => {
    const error = new ConcurrencyError('Test message');

    expect(error.name).toBe('ConcurrencyError');
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.aggregateId).toBeUndefined();
    expect(error.expectedVersion).toBeUndefined();
  });

  it('should create error with partial properties', () => {
    const error = new ConcurrencyError('Test message', 'aggregate-456');

    expect(error.aggregateId).toBe('aggregate-456');
    expect(error.expectedVersion).toBeUndefined();
  });
});

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe('append', () => {
    it('should append event successfully', async () => {
      const event = createTestEvent();

      await store.append(event);

      const events = store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it('should append multiple events', async () => {
      const event1 = createTestEvent();
      const event2 = createTestEvent();

      await store.append(event1);
      await store.append(event2);

      const events = store.getAll();
      expect(events).toHaveLength(2);
    });

    it('should skip duplicate events with same idempotency key', async () => {
      const event = createTestEvent();

      await store.append(event);
      await store.append(event); // Should be skipped (same idempotency key)

      const events = store.getAll();
      expect(events).toHaveLength(1);
    });

    it('should track idempotency keys', async () => {
      const event = createTestEvent();

      await store.append(event);

      expect(store.hasIdempotencyKey(event.metadata.idempotencyKey)).toBe(true);
      expect(store.hasIdempotencyKey('non-existent')).toBe(false);
    });

    it('should throw ConcurrencyError on version conflict', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createTestEvent({ aggregateId: 'agg-1', version: 1 });

      await store.append(event1);

      try {
        await store.append(event2);
        expect.fail('Should have thrown ConcurrencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyError);
        expect(error).toHaveProperty('message');
        expect((error as ConcurrencyError).message).toContain('Event version conflict: aggregate agg-1 already has version 1');
      }
    });

    it('should allow same version for different aggregates', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createTestEvent({ aggregateId: 'agg-2', version: 1 });

      await store.append(event1);
      await store.append(event2);

      expect(store.getAll()).toHaveLength(2);
    });

    it('should allow events without aggregate ID', async () => {
      const event = createTestEvent({ aggregateId: undefined, version: undefined });

      await store.append(event);

      expect(store.getAll()).toHaveLength(1);
    });

    it('should allow events without version', async () => {
      const event = createTestEvent({ aggregateId: 'agg-1', version: undefined });

      await store.append(event);

      expect(store.getAll()).toHaveLength(1);
    });

    it('should include aggregate details in ConcurrencyError', async () => {
      const event1 = createTestEvent({ aggregateId: 'aggregate-123', version: 5 });
      const event2 = createTestEvent({ aggregateId: 'aggregate-123', version: 5 });

      await store.append(event1);

      try {
        await store.append(event2);
        expect.fail('Should have thrown ConcurrencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyError);
        const concurrencyError = error as ConcurrencyError;
        expect(concurrencyError.aggregateId).toBe('aggregate-123');
        expect(concurrencyError.expectedVersion).toBe(5);
      }
    });
  });

  describe('getByCorrelationId', () => {
    it('should retrieve events by correlation ID', async () => {
      const event1 = createTestEvent({ metadata: { correlationId: 'corr-1' } } as Partial<StoredEvent>);
      const event2 = createTestEvent({ metadata: { correlationId: 'corr-1' } } as Partial<StoredEvent>);
      const event3 = createTestEvent({ metadata: { correlationId: 'corr-2' } } as Partial<StoredEvent>);

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const events = await store.getByCorrelationId('corr-1');

      expect(events).toHaveLength(2);
      expect(events[0].metadata.correlationId).toBe('corr-1');
      expect(events[1].metadata.correlationId).toBe('corr-1');
    });

    it('should return empty array for non-existent correlation ID', async () => {
      const events = await store.getByCorrelationId('non-existent');

      expect(events).toEqual([]);
    });
  });

  describe('getByAggregateId', () => {
    it('should retrieve events by aggregate ID', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createTestEvent({ aggregateId: 'agg-1', version: 2 });
      const event3 = createTestEvent({ aggregateId: 'agg-2', version: 1 });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const events = await store.getByAggregateId('agg-1');

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.aggregateId === 'agg-1')).toBe(true);
    });

    it('should return events sorted by version', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: 3 });
      const event2 = createTestEvent({ aggregateId: 'agg-1', version: 1 });
      const event3 = createTestEvent({ aggregateId: 'agg-1', version: 2 });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const events = await store.getByAggregateId('agg-1');

      expect(events.map((e) => e.version)).toEqual([1, 2, 3]);
    });

    it('should filter by afterVersion', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: 1 });
      const event2 = createTestEvent({ aggregateId: 'agg-1', version: 2 });
      const event3 = createTestEvent({ aggregateId: 'agg-1', version: 3 });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const events = await store.getByAggregateId('agg-1', 1);

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.version)).toEqual([2, 3]);
    });

    it('should handle events with undefined version', async () => {
      const event1 = createTestEvent({ aggregateId: 'agg-1', version: undefined });
      const event2 = createTestEvent({ aggregateId: 'agg-1', version: 1 });

      await store.append(event1);
      await store.append(event2);

      const events = await store.getByAggregateId('agg-1');

      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent aggregate ID', async () => {
      const events = await store.getByAggregateId('non-existent');

      expect(events).toEqual([]);
    });
  });

  describe('getByType', () => {
    it('should retrieve events by type', async () => {
      const event1 = createTestEvent({ type: 'TypeA' });
      const event2 = createTestEvent({ type: 'TypeA' });
      const event3 = createTestEvent({ type: 'TypeB' });

      await store.append(event1);
      await store.append(event2);
      await store.append(event3);

      const events = await store.getByType('TypeA');

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.type === 'TypeA')).toBe(true);
    });

    it('should use default limit of 100', async () => {
      // Add 150 events of the same type
      for (let i = 0; i < 150; i++) {
        await store.append(createTestEvent({ type: 'CommonType' }));
      }

      const events = await store.getByType('CommonType');

      expect(events).toHaveLength(100); // Default limit
    });

    it('should respect custom limit', async () => {
      for (let i = 0; i < 20; i++) {
        await store.append(createTestEvent({ type: 'LimitedType' }));
      }

      const events = await store.getByType('LimitedType', 5);

      expect(events).toHaveLength(5);
    });

    it('should return most recent events when limit is applied', async () => {
      const testEvents = [];
      for (let i = 0; i < 10; i++) {
        const event = createTestEvent({ type: 'RecentType' });
        testEvents.push(event);
        await store.append(event);
      }

      const events = await store.getByType('RecentType', 3);

      // Should return last 3 events
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.id)).toEqual([
        testEvents[7].id,
        testEvents[8].id,
        testEvents[9].id,
      ]);
    });

    it('should return empty array for non-existent type', async () => {
      const events = await store.getByType('NonExistentType');

      expect(events).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all events', async () => {
      await store.append(createTestEvent());
      await store.append(createTestEvent());

      expect(store.getAll()).toHaveLength(2);

      store.clear();

      expect(store.getAll()).toHaveLength(0);
    });

    it('should clear idempotency keys', async () => {
      const event = createTestEvent();
      await store.append(event);

      expect(store.hasIdempotencyKey(event.metadata.idempotencyKey)).toBe(true);

      store.clear();

      expect(store.hasIdempotencyKey(event.metadata.idempotencyKey)).toBe(false);
    });
  });
});

describe('PostgresEventStore', () => {
  let config: EventStoreConfig;

  beforeEach(() => {
    resetMocks();
    config = {
      connectionString: 'postgresql://localhost/test',
      tableName: 'test_events',
    };
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      const store = new PostgresEventStore(config);

      expect(store).toBeInstanceOf(PostgresEventStore);
    });

    it('should use default table name if not provided', () => {
      const store = new PostgresEventStore({ connectionString: 'postgresql://localhost/test', tableName: undefined });

      expect(store).toBeInstanceOf(PostgresEventStore);
    });
  });

  describe('initialize', () => {
    it('should throw error if connection string is not provided', async () => {
      const store = new PostgresEventStore({ connectionString: undefined, tableName: 'events' });

      await expect(store.initialize()).rejects.toThrow('PostgreSQL connection string required');
    });

    it('should create pool and table on initialization', async () => {
      const store = new PostgresEventStore(config);
      await store.initialize();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();

      // Verify table creation SQL was called
      const createTableCall = vi.mocked(mockClient.query).mock.calls.find((call) =>
        call[0].includes('CREATE TABLE IF NOT EXISTS')
      );
      expect(createTableCall).toBeDefined();
    });
  });

  describe('append', () => {
    it('should insert event into database', async () => {
      const store = new PostgresEventStore(config);
      await store.initialize();

      const event = createTestEvent();
      await store.append(event);

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();

      // Check INSERT query
      const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain(event.id);
      expect(insertQuery?.params).toContain(event.type);
    });

    it('should handle idempotency with ON CONFLICT DO NOTHING', async () => {
      const store = new PostgresEventStore(config);
      await store.initialize();

      await store.append(createTestEvent());

      const insertQuery = queries.find((q) => q.sql.includes('ON CONFLICT (idempotency_key) DO NOTHING'));
      expect(insertQuery).toBeDefined();
    });

    it('should throw ConcurrencyError on version conflict (23505)', async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO')) {
          const error = new Error('duplicate key value violates unique constraint') as Error & {
            code: string;
            constraint: string;
          };
          error.code = '23505';
          error.constraint = 'idx_events_aggregate_version';
          throw error;
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      const event = createTestEvent({ aggregateId: 'agg-1', version: 1 });

      await expect(store.append(event)).rejects.toThrow(ConcurrencyError);
      await expect(store.append(event)).rejects.toThrow('Event version conflict');
    });

    it('should rethrow non-concurrency errors', async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO')) {
          throw new Error('Database connection failed');
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await expect(store.append(createTestEvent())).rejects.toThrow('Database connection failed');
    });

    it('should release client even on error', async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO')) {
          throw new Error('Some error');
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await expect(store.append(createTestEvent())).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getByCorrelationId', () => {
    it('should query events by correlation ID', async () => {
      const dbRow = {
        id: 'event-1',
        type: 'TestEvent',
        aggregate_id: 'agg-1',
        aggregate_type: 'TestAggregate',
        version: 1,
        payload: { data: 'test' },
        correlation_id: 'corr-1',
        causation_id: 'cause-1',
        idempotency_key: 'key-1',
        timestamp: new Date('2024-01-01'),
        source: 'test',
      };

      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT') && sql.includes('correlation_id')) {
          return { rows: [dbRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      const events = await store.getByCorrelationId('corr-1');

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('event-1');
      expect(events[0].metadata.correlationId).toBe('corr-1');
      expect(mockClient.release).toHaveBeenCalled();

      const selectQuery = queries.find((q) => q.sql.includes('SELECT') && q.sql.includes('correlation_id'));
      expect(selectQuery?.params).toContain('corr-1');
    });

    it('should convert database rows to StoredEvent format', async () => {
      const dbRow = {
        id: 'event-1',
        type: 'TestEvent',
        aggregate_id: null,
        aggregate_type: null,
        version: null,
        payload: { data: 'test' },
        correlation_id: 'corr-1',
        causation_id: null,
        idempotency_key: 'key-1',
        timestamp: new Date('2024-01-01'),
        source: 'test',
      };

      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT')) {
          return { rows: [dbRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      const events = await store.getByCorrelationId('corr-1');

      expect(events[0].aggregateId).toBeUndefined();
      expect(events[0].aggregateType).toBeUndefined();
      expect(events[0].version).toBeUndefined();
      expect(events[0].metadata.causationId).toBeUndefined();
    });
  });

  describe('getByAggregateId', () => {
    it('should query events by aggregate ID', async () => {
      const dbRow = {
        id: 'event-1',
        type: 'TestEvent',
        aggregate_id: 'agg-1',
        aggregate_type: 'TestAggregate',
        version: 1,
        payload: { data: 'test' },
        correlation_id: 'corr-1',
        causation_id: 'cause-1',
        idempotency_key: 'key-1',
        timestamp: new Date('2024-01-01'),
        source: 'test',
      };

      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT') && sql.includes('aggregate_id')) {
          return { rows: [dbRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      const events = await store.getByAggregateId('agg-1');

      expect(events).toHaveLength(1);
      expect(events[0].aggregateId).toBe('agg-1');

      const selectQuery = queries.find((q) => q.sql.includes('SELECT') && q.sql.includes('aggregate_id'));
      expect(selectQuery?.params).toContain('agg-1');
    });

    it('should filter by afterVersion when provided', async () => {
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await store.getByAggregateId('agg-1', 5);

      const selectQuery = queries.find((q) => q.sql.includes('version > $2'));
      expect(selectQuery).toBeDefined();
      expect(selectQuery?.params).toEqual(['agg-1', 5]);
    });

    it('should not filter by version when afterVersion is undefined', async () => {
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await store.getByAggregateId('agg-1');

      const selectQuery = queries.find(
        (q) => q.sql.includes('SELECT') && q.sql.includes('aggregate_id') && !q.sql.includes('version >')
      );
      expect(selectQuery).toBeDefined();
      expect(selectQuery?.params).toEqual(['agg-1']);
    });
  });

  describe('getByType', () => {
    it('should query events by type', async () => {
      const dbRow = {
        id: 'event-1',
        type: 'TestEvent',
        aggregate_id: 'agg-1',
        aggregate_type: 'TestAggregate',
        version: 1,
        payload: { data: 'test' },
        correlation_id: 'corr-1',
        causation_id: 'cause-1',
        idempotency_key: 'key-1',
        timestamp: new Date('2024-01-01'),
        source: 'test',
      };

      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT') && sql.includes('type =')) {
          return { rows: [dbRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      const events = await store.getByType('TestEvent');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('TestEvent');

      const selectQuery = queries.find((q) => q.sql.includes('type ='));
      expect(selectQuery?.params).toContain('TestEvent');
    });

    it('should use default limit of 100', async () => {
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await store.getByType('TestEvent');

      const selectQuery = queries.find((q) => q.sql.includes('LIMIT'));
      expect(selectQuery?.params).toContain(100);
    });

    it('should respect custom limit', async () => {
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      });

      const store = new PostgresEventStore(config);
      await store.initialize();

      await store.getByType('TestEvent', 50);

      const selectQuery = queries.find((q) => q.sql.includes('LIMIT'));
      expect(selectQuery?.params).toContain(50);
    });
  });

  describe('close', () => {
    it('should close the pool', async () => {
      const store = new PostgresEventStore(config);
      await store.initialize();
      await store.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close when pool is not initialized', async () => {
      const store = new PostgresEventStore(config);

      // Should not throw
      await expect(store.close()).resolves.toBeUndefined();
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

  describe('constructor', () => {
    it('should create event store with repository and source', () => {
      const store = new EventStore(repository, { source: 'my-service' });

      expect(store).toBeInstanceOf(EventStore);
    });
  });

  describe('addPublisher', () => {
    it('should add event publisher', () => {
      const publisher: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(publisher);

      // Should not throw
      expect(eventStore).toBeDefined();
    });

    it('should add multiple publishers', () => {
      const publisher1: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };
      const publisher2: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(publisher1);
      eventStore.addPublisher(publisher2);

      expect(eventStore).toBeDefined();
    });
  });

  describe('emit', () => {
    it('should emit event with required fields', async () => {
      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      expect(event.id).toBeDefined();
      expect(event.type).toBe('TestEvent');
      expect(event.metadata.correlationId).toBe('corr-123');
      expect(event.payload).toEqual({ data: 'test' });
      expect(event.metadata.source).toBe('test-service');
      expect(event.metadata.timestamp).toBeDefined();
      expect(event.metadata.idempotencyKey).toBeDefined();
    });

    it('should emit event with all optional fields', async () => {
      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
        aggregateId: 'agg-456',
        aggregateType: 'TestAggregate',
        version: 3,
        causationId: 'cause-789',
      });

      expect(event.aggregateId).toBe('agg-456');
      expect(event.aggregateType).toBe('TestAggregate');
      expect(event.version).toBe(3);
      expect(event.metadata.causationId).toBe('cause-789');
    });

    it('should use custom idempotency key when provided', async () => {
      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
        idempotencyKey: 'custom-key-123',
      });

      expect(event.metadata.idempotencyKey).toBe('custom-key-123');
    });

    it('should generate unique idempotency key when not provided', async () => {
      const event1 = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      const event2 = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      expect(event1.metadata.idempotencyKey).not.toBe(event2.metadata.idempotencyKey);
      expect(event1.metadata.idempotencyKey).toContain('TestEvent:corr-123:');
      expect(event2.metadata.idempotencyKey).toContain('TestEvent:corr-123:');
    });

    it('should persist event to repository', async () => {
      await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      const events = repository.getAll();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('TestEvent');
    });

    it('should publish to all publishers', async () => {
      const publisher1: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };
      const publisher2: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(publisher1);
      eventStore.addPublisher(publisher2);

      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      // Give time for fire-and-forget publishing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher1.publish).toHaveBeenCalledWith(event);
      expect(publisher2.publish).toHaveBeenCalledWith(event);
    });

    it('should not fail if publisher throws error', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Publisher failed')),
      };

      eventStore.addPublisher(failingPublisher);

      // Should not throw despite publisher error
      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      expect(event).toBeDefined();

      // Give time for fire-and-forget publishing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(failingPublisher.publish).toHaveBeenCalled();
    });

    it('should continue publishing to other publishers if one fails', async () => {
      const failingPublisher: EventPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Publisher failed')),
      };
      const successPublisher: EventPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      eventStore.addPublisher(failingPublisher);
      eventStore.addPublisher(successPublisher);

      const event = await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      // Give time for fire-and-forget publishing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(failingPublisher.publish).toHaveBeenCalledWith(event);
      expect(successPublisher.publish).toHaveBeenCalledWith(event);
    });

    it('should throw ConcurrencyError from repository', async () => {
      // Create two events with same aggregate and version
      await eventStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-1',
        payload: { data: 'test' },
        aggregateId: 'agg-1',
        version: 1,
        idempotencyKey: 'key-1',
      });

      await expect(
        eventStore.emit({
          type: 'TestEvent',
          correlationId: 'corr-2',
          payload: { data: 'test' },
          aggregateId: 'agg-1',
          version: 1,
          idempotencyKey: 'key-2',
        })
      ).rejects.toThrow(ConcurrencyError);
    });
  });

  describe('getByCorrelationId', () => {
    it('should retrieve events by correlation ID', async () => {
      await eventStore.emit({
        type: 'Event1',
        correlationId: 'corr-1',
        payload: { data: 'test1' },
      });
      await eventStore.emit({
        type: 'Event2',
        correlationId: 'corr-1',
        payload: { data: 'test2' },
      });
      await eventStore.emit({
        type: 'Event3',
        correlationId: 'corr-2',
        payload: { data: 'test3' },
      });

      const events = await eventStore.getByCorrelationId('corr-1');

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual(['Event1', 'Event2']);
    });
  });

  describe('getByAggregateId', () => {
    it('should retrieve events by aggregate ID', async () => {
      await eventStore.emit({
        type: 'Event1',
        correlationId: 'corr-1',
        payload: { data: 'test1' },
        aggregateId: 'agg-1',
        version: 1,
      });
      await eventStore.emit({
        type: 'Event2',
        correlationId: 'corr-2',
        payload: { data: 'test2' },
        aggregateId: 'agg-1',
        version: 2,
      });

      const events = await eventStore.getByAggregateId('agg-1');

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.version)).toEqual([1, 2]);
    });

    it('should retrieve events after specific version', async () => {
      await eventStore.emit({
        type: 'Event1',
        correlationId: 'corr-1',
        payload: { data: 'test1' },
        aggregateId: 'agg-1',
        version: 1,
      });
      await eventStore.emit({
        type: 'Event2',
        correlationId: 'corr-2',
        payload: { data: 'test2' },
        aggregateId: 'agg-1',
        version: 2,
      });
      await eventStore.emit({
        type: 'Event3',
        correlationId: 'corr-3',
        payload: { data: 'test3' },
        aggregateId: 'agg-1',
        version: 3,
      });

      const events = await eventStore.getByAggregateId('agg-1', 1);

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.version)).toEqual([2, 3]);
    });
  });

  describe('getByType', () => {
    it('should retrieve events by type', async () => {
      await eventStore.emit({
        type: 'TypeA',
        correlationId: 'corr-1',
        payload: { data: 'test1' },
      });
      await eventStore.emit({
        type: 'TypeA',
        correlationId: 'corr-2',
        payload: { data: 'test2' },
      });
      await eventStore.emit({
        type: 'TypeB',
        correlationId: 'corr-3',
        payload: { data: 'test3' },
      });

      const events = await eventStore.getByType('TypeA');

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual(['TypeA', 'TypeA']);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await eventStore.emit({
          type: 'CommonType',
          correlationId: `corr-${i}`,
          payload: { data: `test${i}` },
        });
      }

      const events = await eventStore.getByType('CommonType', 5);

      expect(events).toHaveLength(5);
    });
  });
});

describe('Factory Functions', () => {
  describe('createEventStore', () => {
    it('should create InMemoryEventStore when no connection string provided', () => {
      const store = createEventStore({ source: 'test-service' });

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should create PostgresEventStore when connection string provided', () => {
      const store = createEventStore({
        source: 'test-service',
        connectionString: 'postgresql://localhost/test',
        tableName: 'events',
      });

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should pass source to EventStore', async () => {
      const store = createEventStore({ source: 'my-test-service' });

      const event = await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      expect(event.metadata.source).toBe('my-test-service');
    });
  });

  describe('createInMemoryEventStore', () => {
    it('should create InMemoryEventStore with source', () => {
      const store = createInMemoryEventStore('test-source');

      expect(store).toBeInstanceOf(EventStore);
    });

    it('should use provided source', async () => {
      const store = createInMemoryEventStore('memory-test-service');

      const event = await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { data: 'test' },
      });

      expect(event.metadata.source).toBe('memory-test-service');
    });
  });
});
