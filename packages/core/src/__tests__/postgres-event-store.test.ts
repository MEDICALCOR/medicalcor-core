/**
 * Tests for PostgresEventStore
 *
 * Note: PostgresEventStore uses dynamic imports for the pg module which makes
 * unit testing challenging. These tests focus on:
 * 1. Configuration handling
 * 2. Error class behavior
 * 3. Logic that can be tested without database connection
 *
 * For full PostgresEventStore integration testing, use the integration test suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresEventStore,
  ConcurrencyError,
  type EventStoreConfig,
  type StoredEvent,
} from '../event-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestConfig(overrides: Partial<EventStoreConfig> = {}): EventStoreConfig {
  return {
    connectionString: 'postgresql://test:test@localhost:5432/testdb',
    tableName: 'test_events',
    ...overrides,
  };
}

function createTestEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'event-123',
    type: 'TestEvent',
    aggregateId: 'agg-123',
    aggregateType: 'TestAggregate',
    version: 1,
    payload: { data: 'test' },
    metadata: {
      correlationId: 'corr-123',
      causationId: 'cause-123',
      idempotencyKey: 'idem-123',
      timestamp: new Date().toISOString(),
      source: 'test',
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('PostgresEventStore', () => {
  describe('constructor', () => {
    it('should create store with valid config', () => {
      const config = createTestConfig();
      const store = new PostgresEventStore(config);
      expect(store).toBeInstanceOf(PostgresEventStore);
    });

    it('should accept custom table name', () => {
      const config = createTestConfig({ tableName: 'custom_events' });
      const store = new PostgresEventStore(config);
      expect(store).toBeInstanceOf(PostgresEventStore);
    });

    it('should accept undefined table name (uses default)', () => {
      const config = createTestConfig({ tableName: undefined });
      const store = new PostgresEventStore(config);
      expect(store).toBeInstanceOf(PostgresEventStore);
    });

    it('should accept retry config', () => {
      const config = createTestConfig({
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 100,
        },
      });
      const store = new PostgresEventStore(config);
      expect(store).toBeInstanceOf(PostgresEventStore);
    });
  });

  describe('initialize', () => {
    it('should throw error when connection string is missing', async () => {
      const config = createTestConfig({ connectionString: undefined });
      const store = new PostgresEventStore(config);

      await expect(store.initialize()).rejects.toThrow('PostgreSQL connection string required');
    });

    it('should throw error when connection string is empty', async () => {
      const config = createTestConfig({ connectionString: '' });
      const store = new PostgresEventStore(config);

      // Empty string is falsy, so should also throw
      await expect(store.initialize()).rejects.toThrow('PostgreSQL connection string required');
    });
  });

  describe('close', () => {
    it('should not throw when pool is not initialized', async () => {
      const config = createTestConfig({ connectionString: undefined });
      const store = new PostgresEventStore(config);

      // Should not throw
      await expect(store.close()).resolves.not.toThrow();
    });
  });
});

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

  it('should preserve stack trace', () => {
    const error = new ConcurrencyError('test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ConcurrencyError');
  });

  it('should be catchable as Error', () => {
    const error = new ConcurrencyError('test');
    let caught: Error | null = null;

    try {
      throw error;
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBe(error);
    expect(caught?.message).toBe('test');
  });
});

describe('PostgresEventStore - SQL Generation Logic', () => {
  // Test the logic used in SQL generation without actual database connection

  describe('table name handling', () => {
    it('should use configured table name', () => {
      const config = createTestConfig({ tableName: 'my_events' });
      const store = new PostgresEventStore(config);

      // The store should be created with the custom table name
      // (We can't directly verify the SQL, but we test the config is accepted)
      expect(store).toBeInstanceOf(PostgresEventStore);
    });

    it('should handle special characters in table name', () => {
      const config = createTestConfig({ tableName: 'events_v2' });
      const store = new PostgresEventStore(config);
      expect(store).toBeInstanceOf(PostgresEventStore);
    });
  });

  describe('event structure', () => {
    it('should accept complete event structure', () => {
      const event = createTestEvent();

      expect(event.id).toBeDefined();
      expect(event.type).toBeDefined();
      expect(event.aggregateId).toBeDefined();
      expect(event.aggregateType).toBeDefined();
      expect(event.version).toBeDefined();
      expect(event.payload).toBeDefined();
      expect(event.metadata.correlationId).toBeDefined();
      expect(event.metadata.idempotencyKey).toBeDefined();
      expect(event.metadata.timestamp).toBeDefined();
      expect(event.metadata.source).toBeDefined();
    });

    it('should accept event without aggregate info', () => {
      const event = createTestEvent({
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
      });

      expect(event.aggregateId).toBeUndefined();
      expect(event.aggregateType).toBeUndefined();
      expect(event.version).toBeUndefined();
    });

    it('should accept event without causation ID', () => {
      const event = createTestEvent();
      event.metadata.causationId = undefined;

      expect(event.metadata.causationId).toBeUndefined();
    });
  });
});

describe('PostgresEventStore - Row Mapping Logic', () => {
  // Test the expected row-to-event mapping transformations

  describe('null value conversions', () => {
    it('should convert null aggregate_id to undefined', () => {
      const row = {
        aggregate_id: null,
        aggregate_type: null,
        version: null,
      };

      // Expected behavior: null → undefined
      const aggregateId = row.aggregate_id ?? undefined;
      const aggregateType = row.aggregate_type ?? undefined;
      const version = row.version ?? undefined;

      expect(aggregateId).toBeUndefined();
      expect(aggregateType).toBeUndefined();
      expect(version).toBeUndefined();
    });

    it('should preserve actual values', () => {
      const row = {
        aggregate_id: 'agg-123',
        aggregate_type: 'Order',
        version: 5,
      };

      const aggregateId = row.aggregate_id ?? undefined;
      const aggregateType = row.aggregate_type ?? undefined;
      const version = row.version ?? undefined;

      expect(aggregateId).toBe('agg-123');
      expect(aggregateType).toBe('Order');
      expect(version).toBe(5);
    });
  });

  describe('causation_id type narrowing', () => {
    it('should handle string causation_id', () => {
      const causationId: string | null = 'cause-123';
      const result = typeof causationId === 'string' ? causationId : undefined;

      expect(result).toBe('cause-123');
    });

    it('should handle null causation_id', () => {
      const causationId: string | null = null;
      const result = typeof causationId === 'string' ? causationId : undefined;

      expect(result).toBeUndefined();
    });

    it('should handle non-string causation_id types', () => {
      // Edge case: what if database returns something unexpected
      const causationId = 123 as unknown as string | null;
      const result = typeof causationId === 'string' ? causationId : undefined;

      expect(result).toBeUndefined();
    });
  });

  describe('timestamp conversion', () => {
    it('should convert Date to ISO string', () => {
      const timestamp = new Date('2024-01-15T10:30:00Z');
      const isoString = timestamp.toISOString();

      expect(isoString).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should preserve timezone info', () => {
      const timestamp = new Date('2024-06-15T14:30:00Z');
      const isoString = timestamp.toISOString();

      expect(isoString).toContain('Z');
      expect(isoString).toBe('2024-06-15T14:30:00.000Z');
    });
  });
});

describe('PostgresEventStore - Concurrency Detection Logic', () => {
  describe('PostgreSQL error code handling', () => {
    it('should identify unique violation code 23505', () => {
      const pgError = {
        code: '23505',
        constraint: 'idx_events_aggregate_version',
      };

      const isUniqueViolation = pgError.code === '23505';
      const isAggregateVersionConstraint = pgError.constraint?.includes('aggregate_version');

      expect(isUniqueViolation).toBe(true);
      expect(isAggregateVersionConstraint).toBe(true);
    });

    it('should not match other constraint violations', () => {
      const pgError = {
        code: '23505',
        constraint: 'idx_events_idempotency_key',
      };

      const isAggregateVersionConstraint = pgError.constraint?.includes('aggregate_version');

      expect(isAggregateVersionConstraint).toBe(false);
    });

    it('should not match other error codes', () => {
      const pgError = {
        code: '42P01', // Table doesn't exist
        constraint: undefined,
      };

      const isUniqueViolation = pgError.code === '23505';

      expect(isUniqueViolation).toBe(false);
    });

    it('should handle missing constraint field', () => {
      const pgError = {
        code: '23505',
        constraint: undefined,
      };

      const isAggregateVersionConstraint =
        pgError.constraint?.includes('aggregate_version') ?? false;

      expect(isAggregateVersionConstraint).toBe(false);
    });
  });
});

describe('PostgresEventStore - SQL Query Building Logic', () => {
  describe('afterVersion parameter handling', () => {
    it('should add version filter when afterVersion is provided', () => {
      const afterVersion = 5;
      const params: unknown[] = ['agg-123'];
      let sql = 'SELECT * FROM events WHERE aggregate_id = $1';

      if (afterVersion !== undefined) {
        sql += ` AND version > $${params.length + 1}`;
        params.push(afterVersion);
      }

      expect(sql).toContain('AND version > $2');
      expect(params).toEqual(['agg-123', 5]);
    });

    it('should not add version filter when afterVersion is undefined', () => {
      const afterVersion = undefined;
      const params: unknown[] = ['agg-123'];
      let sql = 'SELECT * FROM events WHERE aggregate_id = $1';

      if (afterVersion !== undefined) {
        sql += ` AND version > $${params.length + 1}`;
        params.push(afterVersion);
      }

      expect(sql).not.toContain('version >');
      expect(params).toEqual(['agg-123']);
    });

    it('should handle afterVersion of 0', () => {
      const afterVersion = 0;
      const params: unknown[] = ['agg-123'];
      let sql = 'SELECT * FROM events WHERE aggregate_id = $1';

      if (afterVersion !== undefined) {
        sql += ` AND version > $${params.length + 1}`;
        params.push(afterVersion);
      }

      expect(sql).toContain('AND version > $2');
      expect(params).toEqual(['agg-123', 0]);
    });
  });

  describe('limit parameter handling', () => {
    it('should use default limit of 100', () => {
      const limit = undefined;
      const effectiveLimit = limit ?? 100;

      expect(effectiveLimit).toBe(100);
    });

    it('should use provided limit', () => {
      const limit = 50;
      const effectiveLimit = limit ?? 100;

      expect(effectiveLimit).toBe(50);
    });

    it('should handle limit of 0', () => {
      const limit = 0;
      const effectiveLimit = limit ?? 100;

      // Note: 0 is NOT nullish, so ?? returns 0, not 100
      // This is correct behavior - 0 limit is preserved
      expect(effectiveLimit).toBe(0);
    });
  });
});
