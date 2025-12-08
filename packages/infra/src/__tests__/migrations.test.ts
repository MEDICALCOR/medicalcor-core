/**
 * @fileoverview Tests for Database Migration Utilities
 *
 * Tests the migration manager, checksum computation, and all migration operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeChecksum,
  parseMigrationFiles,
  createMigrationManager,
  type MigrationClient,
  type MigrationFile,
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

describe('Migration Utilities', () => {
  describe('computeChecksum', () => {
    it('should compute SHA-256 checksum truncated to 16 chars', () => {
      const content = 'CREATE TABLE users (id SERIAL PRIMARY KEY);';

      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
      expect(checksum).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should return consistent checksum for same content', () => {
      const content = 'SELECT 1;';

      const checksum1 = computeChecksum(content);
      const checksum2 = computeChecksum(content);

      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksums for different content', () => {
      const content1 = 'CREATE TABLE a (id INT);';
      const content2 = 'CREATE TABLE b (id INT);';

      const checksum1 = computeChecksum(content1);
      const checksum2 = computeChecksum(content2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty string', () => {
      const checksum = computeChecksum('');

      expect(checksum).toHaveLength(16);
      expect(checksum).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle unicode content', () => {
      const content = 'INSERT INTO names VALUES ($$João$$);';

      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
    });

    it('should handle multiline content', () => {
      const content = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;

      const checksum = computeChecksum(content);

      expect(checksum).toHaveLength(16);
    });
  });

  describe('parseMigrationFiles', () => {
    it('should filter only .sql files', () => {
      const files: Record<string, string> = {
        '001_init.sql': 'CREATE TABLE a;',
        '002_users.sql': 'CREATE TABLE b;',
        'README.md': '# Migrations',
        'config.json': '{}',
      };

      const result = parseMigrationFiles(files);

      expect(result).toHaveLength(2);
      expect(result.every((f) => f.filename.endsWith('.sql'))).toBe(true);
    });

    it('should sort files alphabetically by filename', () => {
      const files: Record<string, string> = {
        '003_indexes.sql': 'CREATE INDEX;',
        '001_init.sql': 'CREATE TABLE a;',
        '002_users.sql': 'CREATE TABLE b;',
      };

      const result = parseMigrationFiles(files);

      expect(result[0]?.filename).toBe('001_init.sql');
      expect(result[1]?.filename).toBe('002_users.sql');
      expect(result[2]?.filename).toBe('003_indexes.sql');
    });

    it('should compute checksum for each file', () => {
      const files: Record<string, string> = {
        '001_init.sql': 'CREATE TABLE a;',
      };

      const result = parseMigrationFiles(files);

      expect(result[0]?.checksum).toHaveLength(16);
      expect(result[0]?.checksum).toBe(computeChecksum('CREATE TABLE a;'));
    });

    it('should return empty array for no SQL files', () => {
      const files: Record<string, string> = {
        'README.md': '# Migrations',
        'config.json': '{}',
      };

      const result = parseMigrationFiles(files);

      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const result = parseMigrationFiles({});

      expect(result).toHaveLength(0);
    });

    it('should preserve file content', () => {
      const content = 'CREATE TABLE users (id SERIAL PRIMARY KEY);';
      const files: Record<string, string> = {
        '001_init.sql': content,
      };

      const result = parseMigrationFiles(files);

      expect(result[0]?.content).toBe(content);
    });
  });

  describe('createMigrationManager', () => {
    let mockClient: MigrationClient;
    let queryResults: Map<string, { rows: Record<string, unknown>[] }>;

    beforeEach(() => {
      queryResults = new Map();
      mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          // Handle table creation
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
            return Promise.resolve({ rows: [] });
          }

          // Check for specific query patterns
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

    describe('ensureTable', () => {
      it('should create migrations table with correct schema', async () => {
        const manager = createMigrationManager({ client: mockClient });

        await manager.ensureTable();

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('CREATE TABLE IF NOT EXISTS')
        );
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('schema_migrations'));
      });

      it('should use custom table name when provided', async () => {
        const manager = createMigrationManager({
          client: mockClient,
          tableName: 'custom_migrations',
        });

        await manager.ensureTable();

        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('custom_migrations'));
      });

      it('should use custom schema when provided', async () => {
        const manager = createMigrationManager({
          client: mockClient,
          schema: 'app',
        });

        await manager.ensureTable();

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('app.schema_migrations')
        );
      });
    });

    describe('getApplied', () => {
      it('should return list of applied migrations', async () => {
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum: 'abc123',
              applied_at: '2024-01-01T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const applied = await manager.getApplied();

        expect(applied).toHaveLength(1);
        expect(applied[0]?.filename).toBe('001_init.sql');
        expect(applied[0]?.checksum).toBe('abc123');
        expect(applied[0]?.id).toBe(1);
      });

      it('should return empty array when no migrations applied', async () => {
        queryResults.set('SELECT id, filename', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const applied = await manager.getApplied();

        expect(applied).toHaveLength(0);
      });

      it('should convert applied_at to Date', async () => {
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum: 'abc123',
              applied_at: '2024-01-15T10:30:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const applied = await manager.getApplied();

        expect(applied[0]?.applied_at).toBeInstanceOf(Date);
      });
    });

    describe('getStatus', () => {
      it('should return status with applied migrations and tableExists true', async () => {
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum: 'abc123',
              applied_at: '2024-01-01T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const status = await manager.getStatus();

        expect(status.tableExists).toBe(true);
        expect(status.applied).toHaveLength(1);
      });

      it('should return tableExists false when table creation fails', async () => {
        const failingClient: MigrationClient = {
          query: vi.fn().mockRejectedValue(new Error('Table does not exist')),
          beginTransaction: vi.fn(),
          commit: vi.fn(),
          rollback: vi.fn(),
        };

        const manager = createMigrationManager({ client: failingClient });
        const status = await manager.getStatus();

        expect(status.tableExists).toBe(false);
        expect(status.applied).toHaveLength(0);
      });
    });

    describe('isApplied', () => {
      it('should return true when migration is applied', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [{ '?column?': 1 }] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.isApplied('001_init.sql');

        expect(result).toBe(true);
      });

      it('should return false when migration is not applied', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.isApplied('002_users.sql');

        expect(result).toBe(false);
      });
    });

    describe('run', () => {
      it('should skip already applied migrations', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [{ '?column?': 1 }] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(result.skipped).toBe(1);
        expect(result.applied).toBe(0);
        expect(result.results[0]?.status).toBe('skipped');
      });

      it('should apply pending migrations', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] }); // Not applied

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(result.applied).toBe(1);
        expect(result.results[0]?.status).toBe('applied');
        expect(mockClient.beginTransaction).toHaveBeenCalled();
        expect(mockClient.commit).toHaveBeenCalled();
      });

      it('should record execution time', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(result.results[0]?.executionTimeMs).toBeDefined();
        expect(result.results[0]?.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should rollback on failure', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('SELECT 1 FROM')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('CREATE TABLE a')) {
            return Promise.reject(new Error('Syntax error'));
          }
          return Promise.resolve({ rows: [] });
        });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(result.failed).toBe(1);
        expect(result.results[0]?.status).toBe('failed');
        expect(result.results[0]?.error).toBe('Syntax error');
        expect(mockClient.rollback).toHaveBeenCalled();
      });

      it('should stop on first failure', async () => {
        let callCount = 0;
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('SELECT 1 FROM')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('CREATE TABLE a')) {
            return Promise.reject(new Error('Syntax error'));
          }
          callCount++;
          return Promise.resolve({ rows: [] });
        });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
          '002_users.sql': 'CREATE TABLE b;',
        });

        expect(result.failed).toBe(1);
        expect(result.applied).toBe(0);
        expect(result.results).toHaveLength(1);
      });

      it('should handle dryRun option', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({ '001_init.sql': 'CREATE TABLE a;' }, { dryRun: true });

        expect(result.skipped).toBe(1);
        expect(result.applied).toBe(0);
        expect(mockClient.beginTransaction).not.toHaveBeenCalled();
      });

      it('should apply migrations in order', async () => {
        const executionOrder: string[] = [];
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('SELECT 1 FROM')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('CREATE TABLE')) {
            executionOrder.push(sql);
          }
          return Promise.resolve({ rows: [] });
        });

        const manager = createMigrationManager({ client: mockClient });
        await manager.run({
          '003_indexes.sql': 'CREATE TABLE c;',
          '001_init.sql': 'CREATE TABLE a;',
          '002_users.sql': 'CREATE TABLE b;',
        });

        expect(executionOrder[0]).toContain('CREATE TABLE a');
        expect(executionOrder[1]).toContain('CREATE TABLE b');
        expect(executionOrder[2]).toContain('CREATE TABLE c');
      });

      it('should calculate total time', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should handle rollback failure gracefully', async () => {
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('SELECT 1 FROM')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('CREATE TABLE a')) {
            return Promise.reject(new Error('Syntax error'));
          }
          return Promise.resolve({ rows: [] });
        });
        mockClient.rollback = vi.fn().mockRejectedValue(new Error('Rollback failed'));

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
        });

        // Should still report failure even if rollback fails
        expect(result.failed).toBe(1);
      });

      it('should filter non-SQL files', async () => {
        queryResults.set('SELECT 1 FROM', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const result = await manager.run({
          '001_init.sql': 'CREATE TABLE a;',
          'README.md': '# Migrations',
        });

        expect(result.applied + result.skipped).toBe(1);
      });
    });

    describe('verifyChecksums', () => {
      it('should return empty array when all checksums match', async () => {
        const content = 'CREATE TABLE a;';
        const checksum = computeChecksum(content);
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum,
              applied_at: '2024-01-01T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const mismatches = await manager.verifyChecksums({
          '001_init.sql': content,
        });

        expect(mismatches).toHaveLength(0);
      });

      it('should detect checksum mismatches', async () => {
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum: 'old_checksum_123',
              applied_at: '2024-01-01T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const mismatches = await manager.verifyChecksums({
          '001_init.sql': 'CREATE TABLE a; -- modified',
        });

        expect(mismatches).toHaveLength(1);
        expect(mismatches[0]?.filename).toBe('001_init.sql');
        expect(mismatches[0]?.expected).toBe('old_checksum_123');
        expect(mismatches[0]?.actual).toBe(computeChecksum('CREATE TABLE a; -- modified'));
      });

      it('should ignore files not yet applied', async () => {
        queryResults.set('SELECT id, filename', { rows: [] });

        const manager = createMigrationManager({ client: mockClient });
        const mismatches = await manager.verifyChecksums({
          '001_init.sql': 'CREATE TABLE a;',
        });

        expect(mismatches).toHaveLength(0);
      });

      it('should check multiple files', async () => {
        const checksum1 = computeChecksum('CREATE TABLE a;');
        queryResults.set('SELECT id, filename', {
          rows: [
            {
              id: 1,
              filename: '001_init.sql',
              checksum: checksum1,
              applied_at: '2024-01-01T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
            {
              id: 2,
              filename: '002_users.sql',
              checksum: 'wrong_checksum',
              applied_at: '2024-01-02T00:00:00Z',
              applied_by: 'admin',
              execution_time_ms: 50,
            },
          ],
        });

        const manager = createMigrationManager({ client: mockClient });
        const mismatches = await manager.verifyChecksums({
          '001_init.sql': 'CREATE TABLE a;',
          '002_users.sql': 'CREATE TABLE b;',
        });

        expect(mismatches).toHaveLength(1);
        expect(mismatches[0]?.filename).toBe('002_users.sql');
      });
    });
  });
});
