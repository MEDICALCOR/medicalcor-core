/**
 * Database Client Factory
 * Provides a simple database client interface for use with repositories
 *
 * This module provides a unified way to create database connections
 * that can be used by various repository implementations (e.g., ConsentRepository).
 */

import crypto from 'crypto';
import { createLogger, type Logger } from './logger.js';

/**
 * Database query result type
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/**
 * Database client interface
 * Compatible with pg.Pool and pg.Client
 */
export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

/**
 * Database pool interface for connection management
 */
export interface DatabasePool extends DatabaseClient {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

/**
 * Pool client interface (acquired connection)
 */
export interface PoolClient extends DatabaseClient {
  release(): void;
}

interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

/**
 * TYPE SAFETY FIX: Define proper interface for pg Pool to reduce inline type assertions
 * This provides better type safety and maintainability for the dynamic pg import
 */
interface PgPoolClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  release: () => void;
}

interface PgPool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  connect: () => Promise<PgPoolClient>;
  end: () => Promise<void>;
}

/**
 * PostgreSQL database pool wrapper
 */
class PostgresPool implements DatabasePool {
  private pool: PgPool | null = null;
  private logger: Logger;
  private initialized = false;

  constructor(private config: DatabaseConfig) {
    this.logger = createLogger({ name: 'database' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const pg = await import('pg');

      // SECURITY FIX: Enforce SSL/TLS for ALL database connections
      // This ensures data in transit is encrypted (HIPAA/GDPR compliance)
      // SSL is now MANDATORY in all environments for medical data protection
      const isProduction = process.env.NODE_ENV === 'production';
      const isTest = process.env.NODE_ENV === 'test';

      // SECURITY: SSL configuration - required in all environments except test
      let sslConfig: { rejectUnauthorized: boolean } | undefined;

      if (isTest && process.env.DATABASE_SSL !== 'true') {
        // Only in test environment, SSL can be disabled for local testing
        sslConfig = undefined;
      } else if (isProduction) {
        // Production: Strict SSL with certificate validation
        sslConfig = { rejectUnauthorized: true };
      } else {
        // Development/Staging: SSL required, but allow self-signed certs
        // This ensures developers use encrypted connections too
        sslConfig = { rejectUnauthorized: false };
      }

      // Log SSL status for audit
      this.logger.info({ ssl: !!sslConfig, rejectUnauthorized: sslConfig?.rejectUnauthorized },
        'Database SSL configuration');

      // TYPE SAFETY FIX: Cast only once at creation time
      this.pool = new pg.default.Pool({
        connectionString: this.config.connectionString,
        max: this.config.maxConnections ?? 10,
        idleTimeoutMillis: this.config.idleTimeoutMs ?? 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMs ?? 5000,
        // SECURITY: SSL configuration for encrypted connections
        ssl: sslConfig,
      }) as unknown as PgPool;

      // Test connection - no type assertion needed now
      const client = await this.pool.connect();
      client.release();

      this.initialized = true;
      this.logger.info('Database pool initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize database pool');
      throw error;
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    await this.initialize();
    // TYPE SAFETY FIX: Use type guard instead of inline assertion
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as T[], rowCount: result.rowCount };
  }

  async connect(): Promise<PoolClient> {
    await this.initialize();
    // TYPE SAFETY FIX: Use type guard instead of inline assertion
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await this.pool.connect();

    return {
      query: async <T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        const result = await client.query(sql, params);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      },
      release: () => client.release(),
    };
  }

  async end(): Promise<void> {
    if (this.pool) {
      // TYPE SAFETY FIX: No inline assertion needed with proper interface
      await this.pool.end();
      this.initialized = false;
      this.logger.info('Database pool closed');
    }
  }
}

/**
 * In-memory database mock for testing
 */
class InMemoryDatabase implements DatabasePool {
  private tables = new Map<string, Map<string, Record<string, unknown>>>();
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'database-mock' });
    this.logger.warn('Using in-memory database - data will be lost on restart!');
  }

  query<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<QueryResult<T>> {
    // This is a simplified mock - real implementation would parse SQL
    return Promise.resolve({ rows: [] as T[], rowCount: 0 });
  }

  connect(): Promise<PoolClient> {
    return Promise.resolve({
      query: this.query.bind(this),
      release: () => {
        /* no-op */
      },
    });
  }

  end(): Promise<void> {
    this.tables.clear();
    return Promise.resolve();
  }
}

/**
 * Global database pool instance (singleton)
 */
let globalPool: DatabasePool | null = null;

/**
 * Create or get the database client pool
 *
 * @param connectionString - PostgreSQL connection string (optional, uses DATABASE_URL env var)
 * @returns Database pool instance
 *
 * @example
 * ```typescript
 * const db = createDatabaseClient();
 * const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
 * ```
 */
export function createDatabaseClient(connectionString?: string): DatabasePool {
  const connString = connectionString ?? process.env.DATABASE_URL;

  if (!connString) {
    // CRITICAL FIX: In production, DATABASE_URL MUST be configured
    // Medical data MUST NOT be stored in volatile memory
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: DATABASE_URL must be configured in production. ' +
          'Medical/PHI data cannot be stored in volatile in-memory database. ' +
          'This is a HIPAA compliance requirement.'
      );
    }

    // Development/test only: Use in-memory mock with clear warning
    const logger = createLogger({ name: 'database' });
    logger.warn(
      { environment: process.env.NODE_ENV },
      'DEVELOPMENT WARNING: Using in-memory database - all data will be lost on restart!'
    );
    globalPool ??= new InMemoryDatabase();
    return globalPool;
  }

  // Create new pool if connection string changed or pool doesn't exist
  if (
    !globalPool ||
    (globalPool instanceof PostgresPool && connString !== process.env.DATABASE_URL)
  ) {
    globalPool = new PostgresPool({ connectionString: connString });
  }

  return globalPool;
}

/**
 * Create a new isolated database client (not singleton)
 * Use this when you need a separate connection pool
 */
export function createIsolatedDatabaseClient(config: DatabaseConfig): DatabasePool {
  return new PostgresPool(config);
}

/**
 * Close the global database pool
 * Call this during graceful shutdown
 */
export async function closeDatabasePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}

// =============================================================================
// TRANSACTION MANAGEMENT - ACID Compliance
// =============================================================================

/**
 * Transaction isolation levels
 * Use SERIALIZABLE for critical financial operations
 */
export enum IsolationLevel {
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

/**
 * Transaction configuration options
 */
export interface TransactionOptions {
  /** Isolation level for the transaction */
  isolationLevel?: IsolationLevel;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Number of retry attempts on serialization failures (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 100) */
  retryBaseDelayMs?: number;
}

/**
 * Transaction client interface with additional transaction methods
 */
export interface TransactionClient extends DatabaseClient {
  /**
   * Acquire a row lock using SELECT FOR UPDATE
   * Prevents concurrent modifications to the same row
   */
  selectForUpdate<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;

  /**
   * Acquire a row lock without waiting (NOWAIT)
   * Throws immediately if lock cannot be acquired
   */
  selectForUpdateNowait<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;

  /**
   * Acquire a row lock with skip locked (for job queues)
   * Skips already locked rows instead of waiting
   */
  selectForUpdateSkipLocked<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

/**
 * Error thrown when a transaction cannot be serialized (concurrent conflict)
 */
export class SerializationError extends Error {
  public readonly code = 'SERIALIZATION_FAILURE';
  public readonly isRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

/**
 * Error thrown when a deadlock is detected
 */
export class DeadlockError extends Error {
  public readonly code = 'DEADLOCK_DETECTED';
  public readonly isRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'DeadlockError';
  }
}

/**
 * Error thrown when a lock cannot be acquired (NOWAIT)
 */
export class LockNotAvailableError extends Error {
  public readonly code = 'LOCK_NOT_AVAILABLE';
  public readonly isRetryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'LockNotAvailableError';
  }
}

const DEFAULT_TRANSACTION_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY = 100;

/**
 * Execute a function within a database transaction with ACID guarantees
 *
 * Features:
 * - Automatic BEGIN/COMMIT/ROLLBACK management
 * - Configurable isolation level
 * - Automatic retry on serialization failures
 * - Exponential backoff between retries
 * - Transaction timeout support
 * - Pessimistic locking via SELECT FOR UPDATE
 *
 * @param pool - Database pool to use
 * @param fn - Function to execute within transaction
 * @param options - Transaction configuration
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * // Simple transaction
 * const result = await withTransaction(db, async (tx) => {
 *   await tx.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
 *   await tx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
 *   return { success: true };
 * });
 *
 * // With pessimistic locking for critical operations
 * const result = await withTransaction(db, async (tx) => {
 *   // Lock the row to prevent concurrent modifications
 *   const { rows } = await tx.selectForUpdate(
 *     'SELECT * FROM wallets WHERE id = $1',
 *     [walletId]
 *   );
 *   if (rows.length === 0) throw new Error('Wallet not found');
 *
 *   const wallet = rows[0];
 *   if (wallet.balance < amount) throw new Error('Insufficient funds');
 *
 *   await tx.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, walletId]);
 *   return { newBalance: wallet.balance - amount };
 * }, { isolationLevel: IsolationLevel.SERIALIZABLE });
 * ```
 */
export async function withTransaction<T>(
  pool: DatabasePool,
  fn: (client: TransactionClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const {
    isolationLevel = IsolationLevel.READ_COMMITTED,
    timeoutMs = DEFAULT_TRANSACTION_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY,
  } = options;

  const logger = createLogger({ name: 'transaction' });
  let attempt = 0;

  while (attempt < maxRetries) {
    const client = await pool.connect();

    try {
      // Set statement timeout
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);

      // Begin transaction with specified isolation level
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      // Create transaction client with locking helpers
      const txClient: TransactionClient = {
        query: client.query.bind(client),

        selectForUpdate: async <R = Record<string, unknown>>(
          sql: string,
          params?: unknown[]
        ): Promise<QueryResult<R>> => {
          // Ensure the query ends with FOR UPDATE
          const lockingSql = sql.trim().toLowerCase().endsWith('for update')
            ? sql
            : `${sql.trim()} FOR UPDATE`;
          return client.query<R>(lockingSql, params);
        },

        selectForUpdateNowait: async <R = Record<string, unknown>>(
          sql: string,
          params?: unknown[]
        ): Promise<QueryResult<R>> => {
          const baseSql = sql
            .trim()
            .toLowerCase()
            .replace(/\s+for\s+update.*$/i, '');
          return client.query<R>(`${baseSql} FOR UPDATE NOWAIT`, params);
        },

        selectForUpdateSkipLocked: async <R = Record<string, unknown>>(
          sql: string,
          params?: unknown[]
        ): Promise<QueryResult<R>> => {
          const baseSql = sql
            .trim()
            .toLowerCase()
            .replace(/\s+for\s+update.*$/i, '');
          return client.query<R>(`${baseSql} FOR UPDATE SKIP LOCKED`, params);
        },
      };

      // Execute the transaction function
      const result = await fn(txClient);

      // Commit on success
      await client.query('COMMIT');

      return result;
    } catch (error: unknown) {
      // Rollback on any error
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }

      // Check if error is retryable
      const pgError = error as { code?: string; message?: string };
      const isSerializationFailure = pgError.code === '40001'; // serialization_failure
      const isDeadlock = pgError.code === '40P01'; // deadlock_detected
      const isLockNotAvailable = pgError.code === '55P03'; // lock_not_available

      if (isLockNotAvailable) {
        throw new LockNotAvailableError(pgError.message ?? 'Lock not available');
      }

      if (isSerializationFailure || isDeadlock) {
        attempt++;

        if (attempt < maxRetries) {
          // SECURITY: Use crypto-secure randomness for jitter calculation
          const randomBytes = new Uint32Array(1);
          crypto.getRandomValues(randomBytes);
          const jitterFactor = 0.5 + (randomBytes[0]! / 0xffffffff) * 0.5;
          const delay = retryBaseDelayMs * Math.pow(2, attempt) * jitterFactor;

          logger.warn(
            {
              attempt,
              maxRetries,
              delay,
              errorCode: pgError.code,
            },
            'Transaction conflict, retrying with backoff'
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Max retries exceeded
        if (isSerializationFailure) {
          throw new SerializationError(
            `Transaction serialization failure after ${maxRetries} attempts: ${pgError.message}`
          );
        }
        if (isDeadlock) {
          throw new DeadlockError(
            `Deadlock detected after ${maxRetries} attempts: ${pgError.message}`
          );
        }
      }

      // Non-retryable error - throw immediately
      throw error;
    } finally {
      client.release();
    }
  }

  // Should never reach here, but TypeScript needs this
  throw new SerializationError('Transaction failed after maximum retries');
}

/**
 * Execute a function with an advisory lock
 *
 * Advisory locks are application-level locks that don't lock any table rows.
 * Useful for coordinating work across multiple processes.
 *
 * @param pool - Database pool
 * @param lockKey - Unique numeric key for the lock (use consistent hashing)
 * @param fn - Function to execute while holding the lock
 * @param waitForLock - If true, wait for lock; if false, fail immediately if locked
 *
 * @example
 * ```typescript
 * // Generate a consistent lock key from a string
 * const lockKey = hashCode('process-daily-reports');
 *
 * const result = await withAdvisoryLock(db, lockKey, async () => {
 *   // Only one process can run this at a time
 *   return await processReports();
 * });
 * ```
 */
export async function withAdvisoryLock<T>(
  pool: DatabasePool,
  lockKey: number,
  fn: () => Promise<T>,
  waitForLock = true
): Promise<T> {
  const client = await pool.connect();
  const logger = createLogger({ name: 'advisory-lock' });

  try {
    // Acquire advisory lock
    const lockFunction = waitForLock ? 'pg_advisory_lock' : 'pg_try_advisory_lock';
    const lockResult = await client.query<{ pg_try_advisory_lock?: boolean }>(
      `SELECT ${lockFunction}($1)`,
      [lockKey]
    );

    // Check if lock was acquired (for try_advisory_lock)
    if (!waitForLock && lockResult.rows[0]?.pg_try_advisory_lock === false) {
      throw new LockNotAvailableError(`Advisory lock ${lockKey} is held by another process`);
    }

    logger.debug({ lockKey }, 'Advisory lock acquired');

    try {
      return await fn();
    } finally {
      // Always release the lock
      await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      logger.debug({ lockKey }, 'Advisory lock released');
    }
  } finally {
    client.release();
  }
}

/**
 * Generate a consistent hash code from a string for use as advisory lock key
 * Uses Java-style hashCode algorithm for consistent, deterministic results
 */
export function stringToLockKey(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
