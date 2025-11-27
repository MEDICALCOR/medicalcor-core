/**
 * Database Migration Runner
 * Enterprise-grade migration system for MedicalCor
 *
 * Features:
 * - Idempotent: Tracks applied migrations in schema_migrations table
 * - Atomic: Each migration runs in a transaction
 * - Ordered: Migrations applied by filename sort order
 * - Safe: Rollback on failure, detailed error logging
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

interface MigrationRecord {
  filename: string;
  applied_at: Date;
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by VARCHAR(100) DEFAULT current_user,
      execution_time_ms INTEGER
    )
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query<MigrationRecord>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map((r) => r.filename));
}

function computeChecksum(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('========================================');
  console.log('  MedicalCor Database Migration Tool');
  console.log('========================================\n');

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Example: DATABASE_URL=postgresql://user:pass@localhost:5432/medicalcor');
    process.exit(1);
  }

  // Mask password in logs
  const safeConnectionString = connectionString.replace(
    /(:\/\/[^:]+:)[^@]+(@)/,
    '$1****$2'
  );
  console.log(`Database: ${safeConnectionString}\n`);

  const pool = new Pool({
    connectionString,
    // SECURITY: SSL required in production
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('Connected to database successfully\n');

    // Ensure migrations table exists
    await ensureMigrationsTable(client);

    // Get migrations directory
    const migrationsDir = path.resolve(process.cwd(), 'infra/migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.error(`ERROR: Migrations directory not found: ${migrationsDir}`);
      client.release();
      await pool.end();
      process.exit(1);
    }

    // Get SQL files sorted by name
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      client.release();
      await pool.end();
      process.exit(0);
    }

    console.log(`Found ${files.length} migration file(s):\n`);
    files.forEach((f) => console.log(`  - ${f}`));
    console.log('');

    // Get applied migrations
    const applied = await getAppliedMigrations(client);
    console.log(`Previously applied: ${applied.size} migration(s)\n`);

    // Release client for transaction-based migrations
    client.release();

    let migrationCount = 0;
    let errorOccurred = false;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`SKIP     ${file} (already applied)`);
        continue;
      }

      const migrationClient = await pool.connect();
      const migrationStart = Date.now();

      try {
        console.log(`APPLYING ${file}...`);

        const fullPath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(fullPath, 'utf8');
        const checksum = computeChecksum(sqlContent);

        // Start transaction
        await migrationClient.query('BEGIN');

        // Execute migration SQL
        await migrationClient.query(sqlContent);

        // Record migration
        const executionTime = Date.now() - migrationStart;
        await migrationClient.query(
          `INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
           VALUES ($1, $2, $3)`,
          [file, checksum, executionTime]
        );

        // Commit transaction
        await migrationClient.query('COMMIT');

        console.log(`SUCCESS  ${file} (${executionTime}ms)`);
        migrationCount++;
      } catch (error: unknown) {
        // Rollback on failure
        try {
          await migrationClient.query('ROLLBACK');
        } catch {
          // Ignore rollback errors
        }

        const errMessage = error instanceof Error ? error.message : String(error);
        console.error(`FAILED   ${file}`);
        console.error(`         Error: ${errMessage}\n`);

        errorOccurred = true;
        break; // Stop on first error
      } finally {
        migrationClient.release();
      }
    }

    // Summary
    console.log('\n========================================');
    const totalTime = Date.now() - startTime;

    if (errorOccurred) {
      console.log('  Migration Failed');
      console.log(`  Applied: ${migrationCount} migration(s) before failure`);
    } else if (migrationCount === 0) {
      console.log('  Database is up to date');
      console.log('  No new migrations to apply');
    } else {
      console.log('  Migration Complete');
      console.log(`  Applied: ${migrationCount} migration(s)`);
    }

    console.log(`  Duration: ${totalTime}ms`);
    console.log('========================================\n');

    await pool.end();
    process.exit(errorOccurred ? 1 : 0);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('FATAL: Database connection failed');
    console.error(`Error: ${errMessage}`);
    await pool.end();
    process.exit(1);
  }
}

// Run migrations
main();
