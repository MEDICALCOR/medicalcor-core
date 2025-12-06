/**
 * Database Unit Tests
 *
 * Tests for the database utilities including:
 * - Transaction management with ACID guarantees
 * - Isolation levels
 * - Retry logic for serialization failures
 * - Advisory locks
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type DatabasePool,
  type QueryResult,
  type PoolClient,
  IsolationLevel,
  SerializationError,
  DeadlockError,
  LockNotAvailableError,
  withTransaction,
  withAdvisoryLock,
  stringToLockKey,
  createDatabaseClient,
  createIsolatedDatabaseClient,
  closeDatabasePool,
} from '../database.js';

/**
 * Mock database pool for testing
 */
function createMockPool(options: {
  queryResults?: QueryResult[];
  queryError?: Error;
  clientQueries?: Array<{ query: string; params?: unknown[] }>;
}): DatabasePool & { mockClient: ReturnType<typeof createMockClient> } {
  const { queryResults = [{ rows: [], rowCount: 0 }], queryError, clientQueries = [] } = options;

  let queryIndex = 0;
  const mockClient = createMockClient(queryResults, queryError, clientQueries);

  return {
    mockClient,
    query: vi.fn().mockImplementation(async () => {
      if (queryError) throw queryError;
      return queryResults[queryIndex++ % queryResults.length] ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(
  queryResults: QueryResult[],
  queryError: Error | undefined,
  clientQueries: Array<{ query: string; params?: unknown[] }>
): PoolClient & { queries: Array<{ query: string; params?: unknown[] }> } {
  let queryIndex = 0;

  return {
    queries: clientQueries,
    query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      clientQueries.push(params !== undefined ? { query: sql, params } : { query: sql });

      if (queryError) {
        throw queryError;
      }

      return queryResults[queryIndex++ % queryResults.length] ?? { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

describe('withTransaction', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let clientQueries: Array<{ query: string; params?: unknown[] }>;

  beforeEach(() => {
    clientQueries = [];
    mockPool = createMockPool({ clientQueries });
  });

  describe('Basic Transaction Flow', () => {
    it('should execute BEGIN and COMMIT for successful transactions', async () => {
      await withTransaction(mockPool, async (tx) => {
        await tx.query('SELECT 1');
        return 'success';
      });

      const queries = clientQueries.map((q) => q.query);
      expect(queries).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
      expect(queries).toContain('COMMIT');
    });

    it('should return the result from the transaction function', async () => {
      const result = await withTransaction(mockPool, async () => {
        return { value: 42 };
      });

      expect(result).toEqual({ value: 42 });
    });

    it('should release the client after transaction', async () => {
      await withTransaction(mockPool, async () => 'done');

      expect(mockPool.mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Isolation Levels', () => {
    it('should use READ COMMITTED by default', async () => {
      await withTransaction(mockPool, async () => 'done');

      const beginQuery = clientQueries.find((q) => q.query.includes('BEGIN'));
      expect(beginQuery?.query).toContain('READ COMMITTED');
    });

    it('should use specified isolation level', async () => {
      await withTransaction(mockPool, async () => 'done', {
        isolationLevel: IsolationLevel.SERIALIZABLE,
      });

      const beginQuery = clientQueries.find((q) => q.query.includes('BEGIN'));
      expect(beginQuery?.query).toContain('SERIALIZABLE');
    });

    it('should support REPEATABLE READ isolation', async () => {
      await withTransaction(mockPool, async () => 'done', {
        isolationLevel: IsolationLevel.REPEATABLE_READ,
      });

      const beginQuery = clientQueries.find((q) => q.query.includes('BEGIN'));
      expect(beginQuery?.query).toContain('REPEATABLE READ');
    });
  });

  describe('Error Handling', () => {
    it('should ROLLBACK on error', async () => {
      const queries: string[] = [];
      const errorPool = createMockPool({ clientQueries });

      // Override to throw error on user query and track all queries
      vi.mocked(errorPool.mockClient.query).mockImplementation(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('THIS WILL FAIL')) {
          throw new Error('User query failed');
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(
        withTransaction(errorPool, async (tx) => {
          await tx.query('INSERT INTO test VALUES (1)');
          await tx.query('THIS WILL FAIL');
        })
      ).rejects.toThrow('User query failed');

      expect(queries.some((q) => q === 'ROLLBACK')).toBe(true);
    });

    it('should release client even on error', async () => {
      const errorPool = createMockPool({ clientQueries });

      vi.mocked(errorPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });
        if (sql.includes('INSERT')) {
          throw new Error('Insert failed');
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(
        withTransaction(errorPool, async (tx) => {
          await tx.query('INSERT INTO test VALUES (1)');
        })
      ).rejects.toThrow();

      expect(errorPool.mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Retry Logic', () => {
    it('should retry on serialization failure (40001)', async () => {
      const retryPool = createMockPool({ clientQueries });
      let attempts = 0;

      vi.mocked(retryPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });

        if (sql.includes('UPDATE') && attempts < 2) {
          attempts++;
          const error = new Error('serialization failure');
          (error as unknown as { code: string }).code = '40001';
          throw error;
        }

        return { rows: [], rowCount: 0 };
      });

      await withTransaction(
        retryPool,
        async (tx) => {
          await tx.query('UPDATE accounts SET balance = 100');
        },
        { maxRetries: 3, retryBaseDelayMs: 1 }
      );

      // Should have retried
      const updateQueries = clientQueries.filter((q) => q.query.includes('UPDATE'));
      expect(updateQueries.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw SerializationError after max retries', async () => {
      const retryPool = createMockPool({ clientQueries });

      vi.mocked(retryPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });

        if (sql.includes('UPDATE')) {
          const error = new Error('serialization failure');
          (error as unknown as { code: string }).code = '40001';
          throw error;
        }

        return { rows: [], rowCount: 0 };
      });

      await expect(
        withTransaction(
          retryPool,
          async (tx) => {
            await tx.query('UPDATE accounts SET balance = 100');
          },
          { maxRetries: 2, retryBaseDelayMs: 1 }
        )
      ).rejects.toThrow(SerializationError);
    });

    it('should retry on deadlock (40P01)', async () => {
      const retryPool = createMockPool({ clientQueries });
      let attempts = 0;

      vi.mocked(retryPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });

        if (sql.includes('UPDATE') && attempts < 1) {
          attempts++;
          const error = new Error('deadlock detected');
          (error as unknown as { code: string }).code = '40P01';
          throw error;
        }

        return { rows: [], rowCount: 0 };
      });

      await withTransaction(
        retryPool,
        async (tx) => {
          await tx.query('UPDATE accounts SET balance = 100');
        },
        { maxRetries: 3, retryBaseDelayMs: 1 }
      );

      expect(attempts).toBe(1); // Should have succeeded on second attempt
    });

    it('should throw DeadlockError after max retries', async () => {
      const retryPool = createMockPool({ clientQueries });

      vi.mocked(retryPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });

        if (sql.includes('UPDATE')) {
          const error = new Error('deadlock detected');
          (error as unknown as { code: string }).code = '40P01';
          throw error;
        }

        return { rows: [], rowCount: 0 };
      });

      await expect(
        withTransaction(
          retryPool,
          async (tx) => {
            await tx.query('UPDATE accounts SET balance = 100');
          },
          { maxRetries: 2, retryBaseDelayMs: 1 }
        )
      ).rejects.toThrow(DeadlockError);
    });
  });

  describe('Lock Not Available', () => {
    it('should throw LockNotAvailableError without retry', async () => {
      const lockPool = createMockPool({ clientQueries });

      vi.mocked(lockPool.mockClient.query).mockImplementation(async (sql: string) => {
        clientQueries.push({ query: sql });

        if (sql.includes('FOR UPDATE NOWAIT')) {
          const error = new Error('could not obtain lock');
          (error as unknown as { code: string }).code = '55P03';
          throw error;
        }

        return { rows: [], rowCount: 0 };
      });

      await expect(
        withTransaction(lockPool, async (tx) => {
          await tx.selectForUpdateNowait('SELECT * FROM accounts WHERE id = 1');
        })
      ).rejects.toThrow(LockNotAvailableError);

      // Should NOT retry for lock not available
      const beginCount = clientQueries.filter((q) => q.query.includes('BEGIN')).length;
      expect(beginCount).toBe(1);
    });
  });

  describe('Locking Helpers', () => {
    it('should add FOR UPDATE to query', async () => {
      await withTransaction(mockPool, async (tx) => {
        await tx.selectForUpdate('SELECT * FROM accounts WHERE id = $1', [1]);
      });

      const selectQuery = clientQueries.find((q) => q.query.includes('SELECT * FROM accounts'));
      expect(selectQuery?.query).toContain('FOR UPDATE');
    });

    it('should not duplicate FOR UPDATE', async () => {
      await withTransaction(mockPool, async (tx) => {
        await tx.selectForUpdate('SELECT * FROM accounts FOR UPDATE');
      });

      const selectQuery = clientQueries.find((q) => q.query.includes('SELECT * FROM accounts'));
      // Should not have double FOR UPDATE
      const forUpdateCount = (selectQuery?.query.match(/FOR UPDATE/gi) ?? []).length;
      expect(forUpdateCount).toBe(1);
    });

    it('should add FOR UPDATE NOWAIT', async () => {
      const queries: string[] = [];
      const pool = createMockPool({ clientQueries });
      vi.mocked(pool.mockClient.query).mockImplementation(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      });

      await withTransaction(pool, async (tx) => {
        await tx.selectForUpdateNowait('SELECT * FROM accounts WHERE id = 1');
      });

      const selectQuery = queries.find((q) => q.includes('FOR UPDATE NOWAIT'));
      expect(selectQuery).toBeDefined();
      expect(selectQuery).toContain('FOR UPDATE NOWAIT');
    });

    it('should add FOR UPDATE SKIP LOCKED', async () => {
      const queries: string[] = [];
      const pool = createMockPool({ clientQueries });
      vi.mocked(pool.mockClient.query).mockImplementation(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      });

      await withTransaction(pool, async (tx) => {
        await tx.selectForUpdateSkipLocked('SELECT * FROM jobs WHERE status = $1', ['pending']);
      });

      const selectQuery = queries.find((q) => q.includes('FOR UPDATE SKIP LOCKED'));
      expect(selectQuery).toBeDefined();
      expect(selectQuery).toContain('FOR UPDATE SKIP LOCKED');
    });
  });

  describe('Timeout Configuration', () => {
    it('should set statement timeout', async () => {
      await withTransaction(mockPool, async () => 'done', { timeoutMs: 5000 });

      const timeoutQuery = clientQueries.find((q) => q.query.includes('statement_timeout'));
      expect(timeoutQuery?.query).toContain('5000');
    });

    it('should use default timeout', async () => {
      await withTransaction(mockPool, async () => 'done');

      const timeoutQuery = clientQueries.find((q) => q.query.includes('statement_timeout'));
      expect(timeoutQuery?.query).toContain('30000'); // Default
    });
  });
});

describe('withAdvisoryLock', () => {
  let clientQueries: Array<{ query: string; params?: unknown[] }>;

  beforeEach(() => {
    clientQueries = [];
  });

  it('should acquire and release advisory lock', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    await withAdvisoryLock(mockPool, 12345, async () => 'done');

    const lockQuery = clientQueries.find((q) => q.query.includes('pg_advisory_lock'));
    expect(lockQuery).toBeDefined();
    expect(lockQuery?.params).toContain(12345);

    const unlockQuery = clientQueries.find((q) => q.query.includes('pg_advisory_unlock'));
    expect(unlockQuery).toBeDefined();
    expect(unlockQuery?.params).toContain(12345);
  });

  it('should return function result', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    const result = await withAdvisoryLock(mockPool, 12345, async () => ({ value: 'test' }));

    expect(result).toEqual({ value: 'test' });
  });

  it('should release lock on error', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    await expect(
      withAdvisoryLock(mockPool, 12345, async () => {
        throw new Error('Function failed');
      })
    ).rejects.toThrow('Function failed');

    const unlockQuery = clientQueries.find((q) => q.query.includes('pg_advisory_unlock'));
    expect(unlockQuery).toBeDefined();
  });

  it('should use try_advisory_lock when waitForLock is false', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_try_advisory_lock: true }], rowCount: 1 }],
    });

    await withAdvisoryLock(mockPool, 12345, async () => 'done', false);

    const lockQuery = clientQueries.find((q) => q.query.includes('pg_try_advisory_lock'));
    expect(lockQuery).toBeDefined();
  });

  it('should throw LockNotAvailableError when try_advisory_lock returns false', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_try_advisory_lock: false }], rowCount: 1 }],
    });

    await expect(withAdvisoryLock(mockPool, 12345, async () => 'done', false)).rejects.toThrow(
      LockNotAvailableError
    );
  });

  it('should release client connection', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    await withAdvisoryLock(mockPool, 12345, async () => 'done');

    expect(mockPool.mockClient.release).toHaveBeenCalled();
  });
});

describe('stringToLockKey', () => {
  it('should generate consistent hash for same string', () => {
    const key1 = stringToLockKey('process-daily-reports');
    const key2 = stringToLockKey('process-daily-reports');

    expect(key1).toBe(key2);
  });

  it('should generate different hashes for different strings', () => {
    const key1 = stringToLockKey('process-daily-reports');
    const key2 = stringToLockKey('process-weekly-reports');

    expect(key1).not.toBe(key2);
  });

  it('should always return positive number', () => {
    const testStrings = [
      'short',
      'a very long string that might cause overflow',
      'special!@#$%^&*()',
      '日本語テスト',
      '',
    ];

    for (const str of testStrings) {
      const key = stringToLockKey(str);
      expect(key).toBeGreaterThanOrEqual(0);
    }
  });

  it('should return 0 for empty string', () => {
    const key = stringToLockKey('');
    expect(key).toBe(0);
  });
});

describe('Error Classes', () => {
  describe('SerializationError', () => {
    it('should have correct properties', () => {
      const error = new SerializationError('Test message');

      expect(error.name).toBe('SerializationError');
      expect(error.code).toBe('SERIALIZATION_FAILURE');
      expect(error.isRetryable).toBe(true);
      expect(error.message).toBe('Test message');
    });
  });

  describe('DeadlockError', () => {
    it('should have correct properties', () => {
      const error = new DeadlockError('Test message');

      expect(error.name).toBe('DeadlockError');
      expect(error.code).toBe('DEADLOCK_DETECTED');
      expect(error.isRetryable).toBe(true);
      expect(error.message).toBe('Test message');
    });
  });

  describe('LockNotAvailableError', () => {
    it('should have correct properties', () => {
      const error = new LockNotAvailableError('Test message');

      expect(error.name).toBe('LockNotAvailableError');
      expect(error.code).toBe('LOCK_NOT_AVAILABLE');
      expect(error.isRetryable).toBe(false);
      expect(error.message).toBe('Test message');
    });
  });
});

describe('IsolationLevel enum', () => {
  it('should have correct values', () => {
    expect(IsolationLevel.READ_COMMITTED).toBe('READ COMMITTED');
    expect(IsolationLevel.REPEATABLE_READ).toBe('REPEATABLE READ');
    expect(IsolationLevel.SERIALIZABLE).toBe('SERIALIZABLE');
  });
});

// =============================================================================
// DATABASE CLIENT FACTORY TESTS
// =============================================================================

describe('createDatabaseClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
    await closeDatabasePool();
  });

  describe('in-memory database fallback', () => {
    it('should create in-memory database when DATABASE_URL not set in development', () => {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'development';

      const db = createDatabaseClient();
      expect(db).toBeDefined();
      expect(typeof db.query).toBe('function');
      expect(typeof db.connect).toBe('function');
      expect(typeof db.end).toBe('function');
    });

    it('should create in-memory database when DATABASE_URL not set in test', () => {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'test';

      const db = createDatabaseClient();
      expect(db).toBeDefined();
    });

    it('should throw error when DATABASE_URL not set in production', () => {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'production';

      expect(() => createDatabaseClient()).toThrow('CRITICAL: DATABASE_URL must be configured');
    });

    it('should mention HIPAA compliance in production error', () => {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'production';

      expect(() => createDatabaseClient()).toThrow('HIPAA compliance requirement');
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance when called multiple times without URL', () => {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'test';

      const db1 = createDatabaseClient();
      const db2 = createDatabaseClient();
      expect(db1).toBe(db2);
    });
  });
});

describe('createIsolatedDatabaseClient', () => {
  it('should create a new database pool instance', () => {
    const db = createIsolatedDatabaseClient({
      connectionString: 'postgresql://user:pass@localhost:5432/testdb',
    });

    expect(db).toBeDefined();
    expect(typeof db.query).toBe('function');
    expect(typeof db.connect).toBe('function');
    expect(typeof db.end).toBe('function');
  });

  it('should accept configuration options', () => {
    const db = createIsolatedDatabaseClient({
      connectionString: 'postgresql://user:pass@localhost:5432/testdb',
      maxConnections: 5,
      idleTimeoutMs: 10000,
      connectionTimeoutMs: 3000,
    });

    expect(db).toBeDefined();
  });
});

describe('closeDatabasePool', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    await closeDatabasePool();
  });

  it('should close the global pool', async () => {
    // Create a pool
    createDatabaseClient();

    // Close it
    await closeDatabasePool();

    // Should not throw
    expect(true).toBe(true);
  });

  it('should handle being called when no pool exists', async () => {
    // Should not throw when no pool
    await closeDatabasePool();
    await closeDatabasePool(); // Call twice

    expect(true).toBe(true);
  });
});

describe('InMemoryDatabase', () => {
  let db: DatabasePool;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    db = createDatabaseClient();
  });

  afterEach(async () => {
    await closeDatabasePool();
  });

  it('should return empty results for queries', async () => {
    const result = await db.query('SELECT * FROM users');
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('should support connect method', async () => {
    const client = await db.connect();
    expect(client).toBeDefined();
    expect(typeof client.query).toBe('function');
    expect(typeof client.release).toBe('function');
  });

  it('should have working release on client', async () => {
    const client = await db.connect();
    // Should not throw
    client.release();
    expect(true).toBe(true);
  });

  it('should support end method', async () => {
    await db.end();
    expect(true).toBe(true);
  });

  it('should return empty results from client query', async () => {
    const client = await db.connect();
    const result = await client.query('SELECT * FROM anything');
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
    client.release();
  });
});

// =============================================================================
// ADDITIONAL EDGE CASE TESTS
// =============================================================================

describe('withTransaction edge cases', () => {
  let clientQueries: Array<{ query: string; params?: unknown[] }>;

  beforeEach(() => {
    clientQueries = [];
  });

  it('should handle rollback failure gracefully', async () => {
    const mockPool = createMockPool({ clientQueries });
    let rollbackCalled = false;

    vi.mocked(mockPool.mockClient.query).mockImplementation(async (sql: string) => {
      clientQueries.push({ query: sql });

      if (sql.includes('ROLLBACK')) {
        rollbackCalled = true;
        throw new Error('Rollback failed');
      }

      if (sql.includes('USER QUERY')) {
        throw new Error('User query failed');
      }

      return { rows: [], rowCount: 0 };
    });

    // Should still throw the original error even if rollback fails
    await expect(
      withTransaction(mockPool, async (tx) => {
        await tx.query('USER QUERY');
      })
    ).rejects.toThrow('User query failed');

    expect(rollbackCalled).toBe(true);
    expect(mockPool.mockClient.release).toHaveBeenCalled();
  });

  it('should handle async transaction functions', async () => {
    const mockPool = createMockPool({ clientQueries });

    const result = await withTransaction(mockPool, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'async result';
    });

    expect(result).toBe('async result');
  });

  it('should handle transaction that throws non-Error', async () => {
    const mockPool = createMockPool({ clientQueries });

    await expect(
      withTransaction(mockPool, async () => {
        throw 'string error';
      })
    ).rejects.toBe('string error');
  });
});

describe('withAdvisoryLock edge cases', () => {
  let clientQueries: Array<{ query: string; params?: unknown[] }>;

  beforeEach(() => {
    clientQueries = [];
  });

  it('should release client on lock acquisition error', async () => {
    const mockPool = createMockPool({ clientQueries });

    vi.mocked(mockPool.mockClient.query).mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_lock')) {
        throw new Error('Lock acquisition failed');
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(withAdvisoryLock(mockPool, 12345, async () => 'done')).rejects.toThrow(
      'Lock acquisition failed'
    );

    expect(mockPool.mockClient.release).toHaveBeenCalled();
  });

  it('should handle negative lock keys', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    await withAdvisoryLock(mockPool, -12345, async () => 'done');

    const lockQuery = clientQueries.find((q) => q.query.includes('pg_advisory_lock'));
    expect(lockQuery?.params).toContain(-12345);
  });

  it('should handle zero lock key', async () => {
    const mockPool = createMockPool({
      clientQueries,
      queryResults: [{ rows: [{ pg_advisory_lock: null }], rowCount: 1 }],
    });

    await withAdvisoryLock(mockPool, 0, async () => 'done');

    const lockQuery = clientQueries.find((q) => q.query.includes('pg_advisory_lock'));
    expect(lockQuery?.params).toContain(0);
  });
});

describe('stringToLockKey edge cases', () => {
  it('should handle single character', () => {
    const key = stringToLockKey('a');
    expect(key).toBeGreaterThanOrEqual(0);
    expect(typeof key).toBe('number');
  });

  it('should handle whitespace-only string', () => {
    const key = stringToLockKey('   ');
    expect(key).toBeGreaterThanOrEqual(0);
  });

  it('should handle numeric strings', () => {
    const key = stringToLockKey('12345');
    expect(key).toBeGreaterThanOrEqual(0);
    expect(typeof key).toBe('number');
  });

  it('should produce different keys for similar strings', () => {
    const key1 = stringToLockKey('test1');
    const key2 = stringToLockKey('test2');
    const key3 = stringToLockKey('1test');

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    const key = stringToLockKey(longString);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(key)).toBe(true);
  });
});

describe('Transaction locking helper edge cases', () => {
  let clientQueries: Array<{ query: string; params?: unknown[] }>;

  beforeEach(() => {
    clientQueries = [];
  });

  it('should handle selectForUpdate with trailing whitespace', async () => {
    const queries: string[] = [];
    const mockPool = createMockPool({ clientQueries });
    vi.mocked(mockPool.mockClient.query).mockImplementation(async (sql: string) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    });

    await withTransaction(mockPool, async (tx) => {
      await tx.selectForUpdate('SELECT * FROM accounts   ', []);
    });

    const selectQuery = queries.find((q) => q.includes('FOR UPDATE'));
    expect(selectQuery).toBeDefined();
    // Should trim and add FOR UPDATE
    expect(selectQuery).toContain('FOR UPDATE');
  });

  it('should replace existing FOR UPDATE in selectForUpdateNowait', async () => {
    const queries: string[] = [];
    const mockPool = createMockPool({ clientQueries });
    vi.mocked(mockPool.mockClient.query).mockImplementation(async (sql: string) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    });

    await withTransaction(mockPool, async (tx) => {
      await tx.selectForUpdateNowait('SELECT * FROM accounts FOR UPDATE', []);
    });

    const selectQuery = queries.find((q) => q.includes('NOWAIT'));
    expect(selectQuery).toBeDefined();
    // Should replace FOR UPDATE with FOR UPDATE NOWAIT
    expect(selectQuery).toContain('FOR UPDATE NOWAIT');
    // Should not have double FOR UPDATE
    expect((selectQuery?.match(/FOR UPDATE/gi) ?? []).length).toBe(1);
  });

  it('should replace existing FOR UPDATE in selectForUpdateSkipLocked', async () => {
    const queries: string[] = [];
    const mockPool = createMockPool({ clientQueries });
    vi.mocked(mockPool.mockClient.query).mockImplementation(async (sql: string) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    });

    await withTransaction(mockPool, async (tx) => {
      await tx.selectForUpdateSkipLocked('SELECT * FROM jobs FOR UPDATE', []);
    });

    const selectQuery = queries.find((q) => q.includes('SKIP LOCKED'));
    expect(selectQuery).toBeDefined();
    expect(selectQuery).toContain('FOR UPDATE SKIP LOCKED');
  });
});
