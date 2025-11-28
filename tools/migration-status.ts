/**
 * Database Migration Status Tool
 * Shows the current state of database migrations
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

interface MigrationRecord {
  filename: string;
  checksum: string | null;
  applied_at: Date;
  applied_by: string;
  execution_time_ms: number | null;
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  MedicalCor Migration Status');
  console.log('========================================\n');

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
  });

  try {
    const client = await pool.connect();

    // Check if migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      )
    `);

    if (!tableCheck.rows[0]?.exists) {
      console.log('Status: No migrations have been run yet');
      console.log('        (schema_migrations table does not exist)\n');
      client.release();
      await pool.end();
      return;
    }

    // Get applied migrations
    const applied = await client.query<MigrationRecord>(
      'SELECT filename, checksum, applied_at, applied_by, execution_time_ms FROM schema_migrations ORDER BY filename'
    );

    // Get pending migrations
    const migrationsDir = path.resolve(process.cwd(), 'infra/migrations');
    const files = fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort()
      : [];

    const appliedSet = new Set(applied.rows.map((r) => r.filename));
    const pendingFiles = files.filter((f) => !appliedSet.has(f));

    // Display applied migrations
    console.log('Applied Migrations:');
    console.log('-------------------');

    if (applied.rows.length === 0) {
      console.log('  (none)');
    } else {
      for (const m of applied.rows) {
        const time = m.execution_time_ms ? `${m.execution_time_ms}ms` : 'N/A';
        const date = new Date(m.applied_at).toISOString().split('T')[0];
        console.log(`  [x] ${m.filename}`);
        console.log(`      Applied: ${date} | Duration: ${time}`);
      }
    }

    console.log('');

    // Display pending migrations
    console.log('Pending Migrations:');
    console.log('-------------------');

    if (pendingFiles.length === 0) {
      console.log('  (none - database is up to date)');
    } else {
      for (const f of pendingFiles) {
        console.log(`  [ ] ${f}`);
      }
    }

    console.log('');
    console.log('Summary:');
    console.log(`  Applied: ${applied.rows.length}`);
    console.log(`  Pending: ${pendingFiles.length}`);
    console.log(`  Total:   ${files.length}`);

    client.release();
    await pool.end();
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${errMessage}`);
    await pool.end();
    process.exit(1);
  }
}

main();
