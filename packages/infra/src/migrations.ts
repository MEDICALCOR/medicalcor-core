/**
 * Database Migration Utilities
 *
 * Programmatic API for managing database migrations.
 * Supports PostgreSQL with transaction-based atomic migrations.
 */

import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * Migration file information
 */
export interface MigrationFile {
  filename: string;
  content: string;
  checksum: string;
}

/**
 * Migration record from database
 */
export interface MigrationRecord {
  id: number;
  filename: string;
  checksum: string;
  applied_at: Date;
  applied_by: string;
  execution_time_ms: number;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  filename: string;
  status: 'applied' | 'skipped' | 'failed';
  executionTimeMs?: number;
  error?: string;
}

/**
 * Migration run summary
 */
export interface MigrationSummary {
  applied: number;
  skipped: number;
  failed: number;
  results: MigrationResult[];
  totalTimeMs: number;
}

/**
 * Database client interface for migrations
 */
export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Migration manager configuration
 */
export interface MigrationConfig {
  /** Database client */
  client: MigrationClient;
  /** Migrations table name (default: schema_migrations) */
  tableName?: string;
  /** Schema name (default: public) */
  schema?: string;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Compute SHA-256 checksum of content (first 16 chars)
 */
export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Parse migration files from a record
 *
 * @param files - Record of filename to content
 * @returns Sorted array of migration files
 */
export function parseMigrationFiles(files: Record<string, string>): MigrationFile[] {
  return Object.entries(files)
    .filter(([filename]) => filename.endsWith('.sql'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filename, content]) => ({
      filename,
      content,
      checksum: computeChecksum(content),
    }));
}

// =============================================================================
// Migration Manager
// =============================================================================

/**
 * Create a migration manager
 *
 * @param config - Migration configuration
 * @returns Migration manager with run/status methods
 *
 * @example
 * ```typescript
 * const migrations = createMigrationManager({ client: dbClient });
 *
 * // Check status
 * const status = await migrations.getStatus();
 *
 * // Run migrations
 * const files = { '001_init.sql': 'CREATE TABLE ...', '002_users.sql': '...' };
 * const result = await migrations.run(files);
 * ```
 */
export function createMigrationManager(config: MigrationConfig) {
  const { client, tableName = 'schema_migrations', schema = 'public' } = config;
  const fullTableName = `${schema}.${tableName}`;

  /**
   * Ensure migrations table exists
   */
  async function ensureTable(): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${fullTableName} (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum VARCHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        applied_by VARCHAR(100) DEFAULT current_user,
        execution_time_ms INTEGER
      )
    `);
  }

  /**
   * Get list of applied migrations
   */
  async function getApplied(): Promise<MigrationRecord[]> {
    const result = await client.query(
      `SELECT id, filename, checksum, applied_at, applied_by, execution_time_ms
       FROM ${fullTableName}
       ORDER BY filename`
    );
    return result.rows.map((row) => ({
      id: row.id as number,
      filename: row.filename as string,
      checksum: row.checksum as string,
      applied_at: new Date(row.applied_at as string),
      applied_by: row.applied_by as string,
      execution_time_ms: row.execution_time_ms as number,
    }));
  }

  /**
   * Get migration status
   */
  async function getStatus(): Promise<{
    applied: MigrationRecord[];
    tableExists: boolean;
  }> {
    try {
      await ensureTable();
      const applied = await getApplied();
      return { applied, tableExists: true };
    } catch {
      return { applied: [], tableExists: false };
    }
  }

  /**
   * Check if a migration has been applied
   */
  async function isApplied(filename: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM ${fullTableName} WHERE filename = $1`,
      [filename]
    );
    return result.rows.length > 0;
  }

  /**
   * Record a migration as applied
   */
  async function recordMigration(
    filename: string,
    checksum: string,
    executionTimeMs: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${fullTableName} (filename, checksum, execution_time_ms)
       VALUES ($1, $2, $3)`,
      [filename, checksum, executionTimeMs]
    );
  }

  /**
   * Run pending migrations
   *
   * @param files - Record of filename to SQL content
   * @param options - Run options
   * @returns Migration summary
   */
  async function run(
    files: Record<string, string>,
    options?: { dryRun?: boolean }
  ): Promise<MigrationSummary> {
    const startTime = Date.now();
    const migrations = parseMigrationFiles(files);
    const results: MigrationResult[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;

    // Ensure migrations table exists
    await ensureTable();

    for (const migration of migrations) {
      // Check if already applied
      if (await isApplied(migration.filename)) {
        results.push({ filename: migration.filename, status: 'skipped' });
        skipped++;
        continue;
      }

      if (options?.dryRun) {
        results.push({ filename: migration.filename, status: 'skipped' });
        skipped++;
        continue;
      }

      const migrationStart = Date.now();

      try {
        // Execute in transaction
        await client.beginTransaction();
        await client.query(migration.content);

        const executionTimeMs = Date.now() - migrationStart;
        await recordMigration(migration.filename, migration.checksum, executionTimeMs);

        await client.commit();

        results.push({
          filename: migration.filename,
          status: 'applied',
          executionTimeMs,
        });
        applied++;
      } catch (error) {
        // Rollback on failure
        try {
          await client.rollback();
        } catch {
          // Ignore rollback errors
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          filename: migration.filename,
          status: 'failed',
          executionTimeMs: Date.now() - migrationStart,
          error: errorMessage,
        });
        failed++;
        break; // Stop on first failure
      }
    }

    return {
      applied,
      skipped,
      failed,
      results,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Verify migration checksums
   *
   * @param files - Record of filename to SQL content
   * @returns List of files with checksum mismatches
   */
  async function verifyChecksums(
    files: Record<string, string>
  ): Promise<{ filename: string; expected: string; actual: string }[]> {
    const migrations = parseMigrationFiles(files);
    const applied = await getApplied();
    const appliedMap = new Map(applied.map((m) => [m.filename, m.checksum]));
    const mismatches: { filename: string; expected: string; actual: string }[] = [];

    for (const migration of migrations) {
      const appliedChecksum = appliedMap.get(migration.filename);
      if (appliedChecksum && appliedChecksum !== migration.checksum) {
        mismatches.push({
          filename: migration.filename,
          expected: appliedChecksum,
          actual: migration.checksum,
        });
      }
    }

    return mismatches;
  }

  return {
    ensureTable,
    getApplied,
    getStatus,
    isApplied,
    run,
    verifyChecksums,
  };
}
