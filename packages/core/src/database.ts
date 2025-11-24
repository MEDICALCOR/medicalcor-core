/**
 * Database Client Factory
 * Provides a simple database client interface for use with repositories
 *
 * This module provides a unified way to create database connections
 * that can be used by various repository implementations (e.g., ConsentRepository).
 */

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
 * PostgreSQL database pool wrapper
 */
class PostgresPool implements DatabasePool {
  private pool: unknown;
  private logger: Logger;
  private initialized = false;

  constructor(private config: DatabaseConfig) {
    this.logger = createLogger({ name: 'database' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const pg = await import('pg');
      this.pool = new pg.default.Pool({
        connectionString: this.config.connectionString,
        max: this.config.maxConnections ?? 10,
        idleTimeoutMillis: this.config.idleTimeoutMs ?? 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMs ?? 5000,
      });

      // Test connection
      const client = await (
        this.pool as { connect: () => Promise<{ release: () => void }> }
      ).connect();
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
    const pool = this.pool as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
    };
    return pool.query(sql, params);
  }

  async connect(): Promise<PoolClient> {
    await this.initialize();
    const pool = this.pool as {
      connect: () => Promise<{
        query: (
          sql: string,
          params?: unknown[]
        ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
        release: () => void;
      }>;
    };
    const client = await pool.connect();

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
      await (this.pool as { end: () => Promise<void> }).end();
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
    // Return in-memory mock if no connection string
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
