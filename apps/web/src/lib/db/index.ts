/**
 * Database utility for server actions
 *
 * This module provides a typed database access layer for server actions.
 * It wraps @medicalcor/core database client and provides proper TypeScript
 * types that ESLint can resolve in the web app context.
 *
 * @module lib/db
 */

import { createDatabaseClient } from '@medicalcor/core';

/**
 * Database query result type
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/**
 * Database client interface - minimal interface for executing queries
 */
export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

/**
 * Pool client interface (acquired connection)
 */
export interface PoolClient extends DatabaseClient {
  release(): void;
}

/**
 * Database pool interface - extends client with connection management
 */
export interface DatabasePool extends DatabaseClient {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

// Singleton database pool
let db: DatabasePool | null = null;

/**
 * Get the database connection pool
 *
 * Creates a singleton database pool on first call, reuses it on subsequent calls.
 * The pool is automatically configured from the DATABASE_URL environment variable.
 *
 * @returns Database pool instance
 *
 * @example
 * ```typescript
 * const db = getDatabase();
 * const result = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
 * const user = result.rows[0];
 * ```
 */
export function getDatabase(): DatabasePool {
  // createDatabaseClient returns a pool that implements our DatabasePool interface
  db ??= createDatabaseClient() as DatabasePool;
  return db;
}

/**
 * Execute a database query with proper typing
 *
 * Convenience function that gets the database and executes a query in one call.
 * Use this for simple one-off queries in server actions.
 *
 * @param sql - SQL query string with $1, $2, etc. parameter placeholders
 * @param params - Array of parameter values
 * @returns Query result with typed rows
 *
 * @example
 * ```typescript
 * interface ClinicRow {
 *   id: string;
 *   name: string;
 *   status: string;
 * }
 *
 * const result = await query<ClinicRow>(
 *   'SELECT * FROM clinics WHERE status = $1',
 *   ['active']
 * );
 * const clinics = result.rows;
 * ```
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getDatabase();
  return pool.query<T>(sql, params);
}

/**
 * Close the database pool
 *
 * Call this during graceful shutdown to release database connections.
 * After calling this, the next call to getDatabase() will create a new pool.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.end();
    db = null;
  }
}
