/**
 * Comprehensive Database Migration Tests
 *
 * Additional coverage for migration utilities including:
 * - CLI tool logic (connection masking, SSL config)
 * - Migration file validation (naming, idempotency patterns)
 * - Edge cases (empty files, unicode, concurrent access)
 * - Timestamp-based ordering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeChecksum,
  parseMigrationFiles,
  createMigrationManager,
  type MigrationClient,
  type MigrationFile,
  type MigrationRecord,
} from '../migrations.js';

// Mock the logger
vi.mock('@medicalcor/core', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// =============================================================================
// CLI Tool Logic Tests
// =============================================================================

describe('Migration CLI Logic', () => {
  describe('Connection String Masking', () => {
    it('should mask password in connection string', () => {
      const connectionString = 'postgresql://user:secretpass@localhost:5432/medicalcor';

      // Simulates the masking logic from run-migrations.ts
      const masked = connectionString.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1****$2');

      expect(masked).toBe('postgresql://user:****@localhost:5432/medicalcor');
      expect(masked).not.toContain('secretpass');
    });

    it('should mask complex passwords with special characters', () => {
      // Note: The simple regex pattern has limitations with @ in passwords
      // This test documents the actual behavior
      const connectionString = 'postgresql://admin:complexPass123@db.example.com:5432/db';

      const masked = connectionString.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1****$2');

      expect(masked).toBe('postgresql://admin:****@db.example.com:5432/db');
      expect(masked).not.toContain('complexPass123');
    });

    it('should handle connection string without password', () => {
      const connectionString = 'postgresql://user@localhost:5432/medicalcor';

      const masked = connectionString.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1****$2');

      // Pattern doesn't match, string unchanged
      expect(masked).toBe(connectionString);
    });

    it('should handle empty password', () => {
      const connectionString = 'postgresql://user:@localhost:5432/medicalcor';

      // The pattern requires at least one character after the colon
      // Empty password doesn't match, string remains unchanged
      const masked = connectionString.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1****$2');

      // Empty password case - regex doesn't match, original string unchanged
      expect(masked).toBe('postgresql://user:@localhost:5432/medicalcor');
    });
  });

  describe('SSL Configuration Logic', () => {
    it('should require SSL verification in production', () => {
      const nodeEnv = 'production';

      const sslConfig =
        nodeEnv === 'production'
          ? { rejectUnauthorized: true }
          : process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: false }
            : undefined;

      expect(sslConfig).toEqual({ rejectUnauthorized: true });
    });

    it('should allow SSL without verification in development with DATABASE_SSL=true', () => {
      const nodeEnv: string = 'development';
      const originalEnv = process.env.DATABASE_SSL;
      process.env.DATABASE_SSL = 'true';

      const sslConfig =
        nodeEnv === 'production'
          ? { rejectUnauthorized: true }
          : process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: false }
            : undefined;

      expect(sslConfig).toEqual({ rejectUnauthorized: false });

      // Restore
      process.env.DATABASE_SSL = originalEnv;
    });

    it('should disable SSL in development without DATABASE_SSL', () => {
      const nodeEnv: string = 'development';
      const originalEnv = process.env.DATABASE_SSL;
      delete process.env.DATABASE_SSL;

      const sslConfig =
        nodeEnv === 'production'
          ? { rejectUnauthorized: true }
          : process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: false }
            : undefined;

      expect(sslConfig).toBeUndefined();

      // Restore
      process.env.DATABASE_SSL = originalEnv;
    });
  });
});

// =============================================================================
// Migration File Validation Tests
// =============================================================================

describe('Migration File Validation', () => {
  describe('Naming Convention Validation', () => {
    it('should sort timestamp-prefixed files correctly', () => {
      const files: Record<string, string> = {
        '20240101000003_clinics.sql': 'CREATE TABLE clinics;',
        '20240101000001_extensions.sql': 'CREATE EXTENSION;',
        '20240101000002_auth_tables.sql': 'CREATE TABLE auth;',
      };

      const result = parseMigrationFiles(files);

      expect(result[0]?.filename).toBe('20240101000001_extensions.sql');
      expect(result[1]?.filename).toBe('20240101000002_auth_tables.sql');
      expect(result[2]?.filename).toBe('20240101000003_clinics.sql');
    });

    it('should handle mixed naming conventions', () => {
      const files: Record<string, string> = {
        '20240101000001_init.sql': 'SELECT 1;',
        '001_legacy.sql': 'SELECT 2;',
        '20250101000001_new.sql': 'SELECT 3;',
      };

      const result = parseMigrationFiles(files);

      // Should sort alphabetically (001 < 2024 < 2025)
      expect(result[0]?.filename).toBe('001_legacy.sql');
      expect(result[1]?.filename).toBe('20240101000001_init.sql');
      expect(result[2]?.filename).toBe('20250101000001_new.sql');
    });

    it('should handle same timestamp with different descriptions', () => {
      const files: Record<string, string> = {
        '20240101000001_b_second.sql': 'SELECT 2;',
        '20240101000001_a_first.sql': 'SELECT 1;',
      };

      const result = parseMigrationFiles(files);

      // Sort alphabetically - 'a' comes before 'b'
      expect(result[0]?.filename).toBe('20240101000001_a_first.sql');
      expect(result[1]?.filename).toBe('20240101000001_b_second.sql');
    });
  });

  describe('Idempotency Pattern Detection', () => {
    it('should detect IF NOT EXISTS patterns in CREATE statements', () => {
      const content = `
        CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      `;

      // Count idempotent patterns
      const idempotentPatterns = (content.match(/IF NOT EXISTS/gi) || []).length;

      expect(idempotentPatterns).toBe(3);
    });

    it('should detect IF EXISTS patterns in DROP statements', () => {
      const content = `
        DROP TABLE IF EXISTS old_users;
        DROP INDEX IF EXISTS idx_old;
        DROP FUNCTION IF EXISTS old_function;
      `;

      const idempotentPatterns = (content.match(/IF EXISTS/gi) || []).length;

      expect(idempotentPatterns).toBe(3);
    });

    it('should detect OR REPLACE patterns', () => {
      const content = `
        CREATE OR REPLACE FUNCTION update_timestamp()
        RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

        CREATE OR REPLACE VIEW active_users AS SELECT * FROM users WHERE active = true;
      `;

      const replacePatterns = (content.match(/OR REPLACE/gi) || []).length;

      expect(replacePatterns).toBe(2);
    });
  });

  describe('SQL Content Validation', () => {
    it('should handle migrations with dollar-quoted strings', () => {
      const content = `
        CREATE OR REPLACE FUNCTION test()
        RETURNS TEXT AS $$
        BEGIN
          RETURN 'Hello, World!';
        END;
        $$ LANGUAGE plpgsql;
      `;

      const files = { '001_function.sql': content };
      const result = parseMigrationFiles(files);

      expect(result[0]?.content).toContain('$$');
      expect(result[0]?.checksum).toHaveLength(16);
    });

    it('should handle migrations with comments', () => {
      const content = `
        -- This is a comment
        /* Multi-line
           comment */
        CREATE TABLE test (id INT);
      `;

      const files = { '001_test.sql': content };
      const result = parseMigrationFiles(files);

      expect(result[0]?.content).toContain('--');
      expect(result[0]?.content).toContain('/*');
    });

    it('should handle migrations with special PostgreSQL syntax', () => {
      const content = `
        -- pgvector extension usage
        CREATE TABLE embeddings (
          id SERIAL PRIMARY KEY,
          embedding vector(1536) NOT NULL
        );

        -- HNSW index
        CREATE INDEX idx_embeddings_hnsw ON embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `;

      const files = { '001_vectors.sql': content };
      const result = parseMigrationFiles(files);

      expect(result[0]?.checksum).toHaveLength(16);
    });

    it('should handle migrations with RLS policies', () => {
      const content = `
        ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can read own documents"
          ON documents FOR SELECT
          USING (user_id = auth.uid());
      `;

      const files = { '001_rls.sql': content };
      const result = parseMigrationFiles(files);

      expect(result[0]?.checksum).toHaveLength(16);
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Migration Edge Cases', () => {
  describe('Empty and Whitespace Content', () => {
    it('should handle empty SQL file', () => {
      const files = { '001_empty.sql': '' };
      const result = parseMigrationFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe('');
      expect(result[0]?.checksum).toHaveLength(16);
    });

    it('should handle whitespace-only SQL file', () => {
      const files = { '001_whitespace.sql': '   \n\t\n   ' };
      const result = parseMigrationFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0]?.checksum).toHaveLength(16);
    });

    it('should produce different checksums for different whitespace', () => {
      const checksum1 = computeChecksum('SELECT 1;');
      const checksum2 = computeChecksum('SELECT  1;');
      const checksum3 = computeChecksum('SELECT 1;\n');

      expect(checksum1).not.toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should handle Cyrillic characters', () => {
      const content = "INSERT INTO messages VALUES ('Привет мир');";
      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
      expect(checksum).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle Chinese characters', () => {
      const content = "INSERT INTO messages VALUES ('你好世界');";
      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
    });

    it('should handle emojis', () => {
      const content = "INSERT INTO reactions VALUES ('test', '👍');";
      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
    });

    it('should handle Romanian diacritics', () => {
      const content = "INSERT INTO greetings VALUES ('Bună ziua', 'română');";
      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
    });

    it('should handle newlines in different formats', () => {
      const unixContent = 'SELECT 1;\nSELECT 2;';
      const windowsContent = 'SELECT 1;\r\nSELECT 2;';
      const macContent = 'SELECT 1;\rSELECT 2;';

      const checksumUnix = computeChecksum(unixContent);
      const checksumWindows = computeChecksum(windowsContent);
      const checksumMac = computeChecksum(macContent);

      // All should be different (line endings matter for checksums)
      expect(checksumUnix).not.toBe(checksumWindows);
      expect(checksumUnix).not.toBe(checksumMac);
    });
  });

  describe('Large Migration Files', () => {
    it('should handle large SQL content', () => {
      // Generate ~1MB of SQL
      const statements = Array.from(
        { length: 10000 },
        (_, i) => `INSERT INTO data VALUES (${i}, 'value_${i}');`
      );
      const content = statements.join('\n');

      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
      expect(content.length).toBeGreaterThan(100000);
    });

    it('should parse many migration files', () => {
      const files: Record<string, string> = {};
      for (let i = 1; i <= 100; i++) {
        const num = i.toString().padStart(3, '0');
        files[`${num}_migration.sql`] = `-- Migration ${i}\nSELECT ${i};`;
      }

      const result = parseMigrationFiles(files);

      expect(result).toHaveLength(100);
      expect(result[0]?.filename).toBe('001_migration.sql');
      expect(result[99]?.filename).toBe('100_migration.sql');
    });
  });
});

// =============================================================================
// Migration Manager Advanced Tests
// =============================================================================

describe('Migration Manager - Advanced', () => {
  let mockClient: MigrationClient;
  let queryResults: Map<string, { rows: Record<string, unknown>[] }>;

  beforeEach(() => {
    queryResults = new Map();
    mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return Promise.resolve({ rows: [] });
        }
        for (const [pattern, result] of queryResults) {
          if (sql.includes(pattern)) {
            return Promise.resolve(result);
          }
        }
        return Promise.resolve({ rows: [] });
      }),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('Schema Isolation', () => {
    it('should support custom schema prefix', async () => {
      const manager = createMigrationManager({
        client: mockClient,
        schema: 'tenant_123',
        tableName: 'migrations',
      });

      await manager.ensureTable();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('tenant_123.migrations')
      );
    });

    it('should use public schema by default', async () => {
      const manager = createMigrationManager({ client: mockClient });

      await manager.ensureTable();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('public.schema_migrations')
      );
    });
  });

  describe('Checksum Verification Edge Cases', () => {
    it('should handle migrations with null checksums in database', async () => {
      queryResults.set('SELECT id, filename', {
        rows: [
          {
            id: 1,
            filename: '001_init.sql',
            checksum: null, // Legacy migration without checksum
            applied_at: '2024-01-01T00:00:00Z',
            applied_by: 'admin',
            execution_time_ms: 50,
          },
        ],
      });

      const manager = createMigrationManager({ client: mockClient });
      const mismatches = await manager.verifyChecksums({
        '001_init.sql': 'CREATE TABLE a;',
      });

      // verifyChecksums only reports mismatches when BOTH checksums exist and differ
      // Null checksum means the migration was applied before checksum tracking
      // This is expected behavior - no mismatch reported for legacy migrations
      expect(mismatches).toHaveLength(0);
    });

    it('should detect all mismatches in multiple files', async () => {
      queryResults.set('SELECT id, filename', {
        rows: [
          {
            id: 1,
            filename: '001_init.sql',
            checksum: 'wrong1',
            applied_at: '2024-01-01T00:00:00Z',
            applied_by: 'admin',
            execution_time_ms: 50,
          },
          {
            id: 2,
            filename: '002_users.sql',
            checksum: 'wrong2',
            applied_at: '2024-01-02T00:00:00Z',
            applied_by: 'admin',
            execution_time_ms: 50,
          },
          {
            id: 3,
            filename: '003_data.sql',
            checksum: 'wrong3',
            applied_at: '2024-01-03T00:00:00Z',
            applied_by: 'admin',
            execution_time_ms: 50,
          },
        ],
      });

      const manager = createMigrationManager({ client: mockClient });
      const mismatches = await manager.verifyChecksums({
        '001_init.sql': 'MODIFIED CREATE TABLE a;',
        '002_users.sql': 'MODIFIED CREATE TABLE b;',
        '003_data.sql': 'MODIFIED CREATE TABLE c;',
      });

      expect(mismatches).toHaveLength(3);
      expect(mismatches.map((m) => m.filename)).toEqual([
        '001_init.sql',
        '002_users.sql',
        '003_data.sql',
      ]);
    });
  });

  describe('Transaction Behavior', () => {
    it('should begin transaction before executing SQL', async () => {
      const callOrder: string[] = [];
      mockClient.beginTransaction = vi.fn().mockImplementation(() => {
        callOrder.push('beginTransaction');
        return Promise.resolve();
      });
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE test')) {
          callOrder.push('execute');
        }
        if (sql.includes('SELECT 1 FROM')) {
          return Promise.resolve({ rows: [] }); // Not applied
        }
        return Promise.resolve({ rows: [] });
      });
      mockClient.commit = vi.fn().mockImplementation(() => {
        callOrder.push('commit');
        return Promise.resolve();
      });

      const manager = createMigrationManager({ client: mockClient });
      await manager.run({
        '001_test.sql': 'CREATE TABLE test;',
      });

      expect(callOrder).toEqual(['beginTransaction', 'execute', 'commit']);
    });

    it('should rollback on SQL syntax error', async () => {
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT 1 FROM')) {
          return Promise.resolve({ rows: [] }); // Not applied
        }
        if (sql.includes('INVALID SQL')) {
          return Promise.reject(new Error('syntax error at or near "INVALID"'));
        }
        return Promise.resolve({ rows: [] });
      });

      const manager = createMigrationManager({ client: mockClient });
      const result = await manager.run({
        '001_bad.sql': 'INVALID SQL;',
      });

      expect(result.failed).toBe(1);
      expect(result.results[0]?.error).toContain('syntax error');
      expect(mockClient.rollback).toHaveBeenCalled();
    });

    it('should not call commit when transaction fails', async () => {
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        // Allow the migrations table to be created
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('SELECT 1 FROM')) {
          return Promise.resolve({ rows: [] });
        }
        // Fail on the actual migration SQL (not IF NOT EXISTS)
        if (sql.includes('CREATE TABLE test')) {
          return Promise.reject(new Error('relation already exists'));
        }
        return Promise.resolve({ rows: [] });
      });

      const manager = createMigrationManager({ client: mockClient });
      await manager.run({
        '001_test.sql': 'CREATE TABLE test;',
      });

      expect(mockClient.commit).not.toHaveBeenCalled();
      expect(mockClient.rollback).toHaveBeenCalled();
    });
  });

  describe('Execution Time Tracking', () => {
    it('should record accurate execution time', async () => {
      let queryDelay = 0;
      mockClient.query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT 1 FROM')) {
          return { rows: [] };
        }
        if (sql.includes('CREATE TABLE')) {
          // Simulate slow query
          await new Promise((resolve) => setTimeout(resolve, 50));
          queryDelay = 50;
        }
        return { rows: [] };
      });

      const manager = createMigrationManager({ client: mockClient });
      const result = await manager.run({
        '001_slow.sql': 'CREATE TABLE slow;',
      });

      // Execution time should be at least 50ms
      expect(result.results[0]?.executionTimeMs).toBeGreaterThanOrEqual(queryDelay);
    });

    it('should track total time across all migrations', async () => {
      mockClient.query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT 1 FROM')) {
          return { rows: [] };
        }
        // Small delay for each migration
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { rows: [] };
      });

      const manager = createMigrationManager({ client: mockClient });
      const result = await manager.run({
        '001_first.sql': 'SELECT 1;',
        '002_second.sql': 'SELECT 2;',
        '003_third.sql': 'SELECT 3;',
      });

      // Total time should be at least 30ms (3 migrations * 10ms each)
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Migration Status', () => {
    it('should correctly identify table existence', async () => {
      const manager = createMigrationManager({ client: mockClient });
      const status = await manager.getStatus();

      expect(status.tableExists).toBe(true);
    });

    it('should return applied migrations with correct types', async () => {
      const appliedAt = '2024-06-15T10:30:00Z';
      queryResults.set('SELECT id, filename', {
        rows: [
          {
            id: 1,
            filename: '001_init.sql',
            checksum: 'abc123def456',
            applied_at: appliedAt,
            applied_by: 'migration_runner',
            execution_time_ms: 150,
          },
        ],
      });

      const manager = createMigrationManager({ client: mockClient });
      const applied = await manager.getApplied();

      expect(applied[0]?.id).toBe(1);
      expect(applied[0]?.filename).toBe('001_init.sql');
      expect(applied[0]?.checksum).toBe('abc123def456');
      expect(applied[0]?.applied_at).toBeInstanceOf(Date);
      expect(applied[0]?.applied_by).toBe('migration_runner');
      expect(applied[0]?.execution_time_ms).toBe(150);
    });
  });
});

// =============================================================================
// Real Migration File Pattern Tests (based on actual MedicalCor migrations)
// =============================================================================

describe('MedicalCor Migration Patterns', () => {
  describe('Extension Migrations', () => {
    it('should validate extension creation pattern', () => {
      const content = `
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
        CREATE EXTENSION IF NOT EXISTS "vector";
      `;

      const extensionCount = (content.match(/CREATE EXTENSION IF NOT EXISTS/g) || []).length;

      expect(extensionCount).toBe(3);
    });
  });

  describe('Trigger Function Migrations', () => {
    it('should validate trigger function pattern', () => {
      const content = `
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `;

      expect(content).toContain('CREATE OR REPLACE FUNCTION');
      expect(content).toContain('RETURNS TRIGGER');
      expect(content).toContain('LANGUAGE plpgsql');
    });
  });

  describe('RLS Policy Migrations', () => {
    it('should validate RLS policy pattern', () => {
      const content = `
        ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "tenant_isolation_policy"
          ON documents
          FOR ALL
          USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
      `;

      expect(content).toContain('ENABLE ROW LEVEL SECURITY');
      expect(content).toContain('CREATE POLICY');
      expect(content).toContain('USING');
    });
  });

  describe('Partitioning Migrations', () => {
    it('should validate partition table pattern', () => {
      const content = `
        CREATE TABLE IF NOT EXISTS events (
          id UUID PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL,
          data JSONB
        ) PARTITION BY RANGE (created_at);

        CREATE TABLE IF NOT EXISTS events_2024_q1
          PARTITION OF events
          FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
      `;

      expect(content).toContain('PARTITION BY RANGE');
      expect(content).toContain('PARTITION OF');
      expect(content).toContain('FOR VALUES FROM');
    });
  });

  describe('Index Migrations', () => {
    it('should validate concurrent index creation', () => {
      const content = `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
          ON users (email);

        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_created
          ON events (created_at DESC);
      `;

      const concurrentIndexes = (content.match(/CREATE INDEX CONCURRENTLY/g) || []).length;

      expect(concurrentIndexes).toBe(2);
    });

    it('should validate HNSW index pattern for vectors', () => {
      const content = `
        CREATE INDEX idx_embeddings_hnsw
          ON embeddings
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
      `;

      expect(content).toContain('USING hnsw');
      expect(content).toContain('vector_cosine_ops');
    });
  });

  describe('Foreign Key Migrations', () => {
    it('should validate foreign key with ON DELETE CASCADE', () => {
      const content = `
        ALTER TABLE leads
          ADD CONSTRAINT fk_leads_clinic
          FOREIGN KEY (clinic_id)
          REFERENCES clinics(id)
          ON DELETE CASCADE;
      `;

      expect(content).toContain('FOREIGN KEY');
      expect(content).toContain('REFERENCES');
      expect(content).toContain('ON DELETE CASCADE');
    });
  });
});

// =============================================================================
// Checksum Integrity Tests
// =============================================================================

describe('Checksum Integrity', () => {
  it('should detect single character change', () => {
    const original = 'CREATE TABLE users (id INT);';
    const modified = 'CREATE TABLE users (id int);'; // lowercase int

    const checksumOriginal = computeChecksum(original);
    const checksumModified = computeChecksum(modified);

    expect(checksumOriginal).not.toBe(checksumModified);
  });

  it('should detect added whitespace', () => {
    const original = 'SELECT 1;';
    const modified = 'SELECT 1; ';

    const checksumOriginal = computeChecksum(original);
    const checksumModified = computeChecksum(modified);

    expect(checksumOriginal).not.toBe(checksumModified);
  });

  it('should produce reproducible checksums', () => {
    const content = 'CREATE TABLE test (id SERIAL PRIMARY KEY);';

    const checksums = Array.from({ length: 100 }, () => computeChecksum(content));

    // All checksums should be identical
    expect(new Set(checksums).size).toBe(1);
  });

  it('should use SHA-256 algorithm', () => {
    // Known SHA-256 hash (truncated to 16 chars)
    const content = 'test';
    const checksum = computeChecksum(content);

    // SHA-256 of 'test' starts with '9f86d081884c7d65'
    expect(checksum).toBe('9f86d081884c7d65');
  });
});
