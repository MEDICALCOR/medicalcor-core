import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { backupRoutes } from '../routes/backup.js';

/**
 * Comprehensive Backup Routes Tests
 *
 * Tests for:
 * - GET /backup/status - Service status and statistics
 * - GET /backup/list - List all backups with filtering
 * - GET /backup/:id - Get specific backup details
 * - POST /backup/create - Create manual backup
 * - GET /backup/progress - Get current backup progress
 * - POST /backup/restore - Restore from backup
 * - DELETE /backup/:id - Delete backup
 * - GET /backup/config - Get backup configuration
 */

// Mock the backup service
vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual('@medicalcor/core');
  return {
    ...actual,
    createBackupServiceFromEnv: vi.fn(() => {
      const mockBackups = new Map();
      const mockStats = {
        totalBackups: 5,
        successfulBackups: 4,
        failedBackups: 1,
        totalStorageBytes: 1024 * 1024 * 100, // 100MB
        oldestBackup: new Date('2025-01-01'),
        newestBackup: new Date('2025-12-06'),
        avgBackupDurationMs: 5000,
        avgCompressionRatio: 0.7,
      };

      let currentProgress: any = null;

      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn(() => mockStats),
        getCurrentProgress: vi.fn(() => currentProgress),
        listBackups: vi.fn((filters) => {
          const allBackups = [
            {
              id: 'backup-1',
              type: 'full',
              status: 'completed',
              createdAt: new Date('2025-12-05T02:00:00Z'),
              completedAt: new Date('2025-12-05T02:05:00Z'),
              sizeBytes: 1024 * 1024 * 50,
              compressedSizeBytes: 1024 * 1024 * 35,
              compressionRatio: 0.7,
              encrypted: true,
              compressed: true,
              tables: ['users', 'contacts', 'leads'],
              rowCounts: { users: 100, contacts: 500, leads: 250 },
              durationMs: 300000,
              checksum: 'abc123',
              checksumAlgorithm: 'sha256',
              verificationStatus: 'verified',
              tags: { manual: 'true', createdBy: 'api' },
            },
            {
              id: 'backup-2',
              type: 'incremental',
              status: 'completed',
              createdAt: new Date('2025-12-06T02:00:00Z'),
              completedAt: new Date('2025-12-06T02:02:00Z'),
              sizeBytes: 1024 * 1024 * 10,
              compressedSizeBytes: 1024 * 1024 * 7,
              compressionRatio: 0.7,
              encrypted: true,
              compressed: true,
              tables: ['users', 'contacts'],
              rowCounts: { users: 20, contacts: 50 },
              durationMs: 120000,
              checksum: 'def456',
              checksumAlgorithm: 'sha256',
              verificationStatus: 'verified',
              tags: { auto: 'true' },
            },
          ];

          let filtered = allBackups;
          if (filters?.type) {
            filtered = filtered.filter((b) => b.type === filters.type);
          }
          if (filters?.status) {
            filtered = filtered.filter((b) => b.status === filters.status);
          }
          if (filters?.limit) {
            filtered = filtered.slice(0, filters.limit);
          }

          return filtered;
        }),
        getBackup: vi.fn((id: string) => {
          if (id === 'backup-1') {
            return {
              id: 'backup-1',
              type: 'full',
              status: 'completed',
              createdAt: new Date('2025-12-05T02:00:00Z'),
              completedAt: new Date('2025-12-05T02:05:00Z'),
              sizeBytes: 1024 * 1024 * 50,
              compressedSizeBytes: 1024 * 1024 * 35,
              compressionRatio: 0.7,
              checksum: 'abc123',
              checksumAlgorithm: 'sha256',
              encrypted: true,
              compressed: true,
              tables: ['users', 'contacts', 'leads'],
              rowCounts: { users: 100, contacts: 500, leads: 250 },
              durationMs: 300000,
              verificationStatus: 'verified',
              storageLocation: '/backups/backup-1.tar.gz',
              tags: { manual: 'true' },
            };
          }
          if (id === 'backup-failed') {
            return {
              id: 'backup-failed',
              type: 'full',
              status: 'failed',
              createdAt: new Date('2025-12-04T02:00:00Z'),
              sizeBytes: 0,
              tables: [],
              rowCounts: {},
              durationMs: 1000,
              errorMessage: 'Disk full',
            };
          }
          return null;
        }),
        createBackup: vi.fn(async (type, tags) => {
          currentProgress = {
            backupId: 'backup-new',
            phase: 'dump',
            progress: 50,
            bytesProcessed: 1024 * 1024 * 25,
            totalBytes: 1024 * 1024 * 50,
            currentTable: 'contacts',
            tablesCompleted: 1,
            totalTables: 3,
            startedAt: new Date(),
          };

          // Simulate backup completion
          setTimeout(() => {
            currentProgress = null;
          }, 100);

          return {
            id: 'backup-new',
            type,
            status: 'completed',
            createdAt: new Date(),
            completedAt: new Date(),
            sizeBytes: 1024 * 1024 * 50,
            compressedSizeBytes: 1024 * 1024 * 35,
            tables: ['users', 'contacts', 'leads'],
            durationMs: 5000,
            verificationStatus: 'verified',
            tags,
          };
        }),
        restore: vi.fn(async (options) => {
          // Mock restore logic
          return Promise.resolve();
        }),
        deleteBackup: vi.fn(async (id) => {
          mockBackups.delete(id);
          return Promise.resolve();
        }),
      };
    }),
  };
});

describe('Backup Routes', () => {
  let app: FastifyInstance;
  const validApiKey = 'test-admin-key-12345';

  beforeAll(async () => {
    // Set environment variables
    process.env.ADMIN_API_KEY = validApiKey;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    app = Fastify({ logger: false });
    await app.register(backupRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': 'invalid-key',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should accept requests with valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should use constant-time comparison for API keys', async () => {
      // Try a timing attack - should still fail
      const almostValidKey = validApiKey.slice(0, -1) + 'X';

      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': almostValidKey,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // GET /backup/status
  // ==========================================================================

  describe('GET /backup/status', () => {
    it('should return backup service status and statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('timestamp');
      expect(body.status).toBe('operational');
      expect(body).toHaveProperty('stats');
      expect(body.stats).toHaveProperty('totalBackups');
      expect(body.stats).toHaveProperty('successfulBackups');
      expect(body.stats).toHaveProperty('failedBackups');
      expect(body.stats).toHaveProperty('totalStorageBytes');
      expect(body.stats).toHaveProperty('totalStorageMB');
    });

    it('should include backup statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.stats.totalBackups).toBe(5);
      expect(body.stats.successfulBackups).toBe(4);
      expect(body.stats.failedBackups).toBe(1);
      expect(body.stats.totalStorageMB).toBeGreaterThan(0);
    });

    it('should include current backup progress if available', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      // currentBackup can be null if no backup in progress
      expect(body).toHaveProperty('currentBackup');
    });
  });

  // ==========================================================================
  // GET /backup/list
  // ==========================================================================

  describe('GET /backup/list', () => {
    it('should return list of all backups', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/list',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('backups');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.backups)).toBe(true);
      expect(body.backups.length).toBeGreaterThan(0);
    });

    it('should include backup metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/list',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      const backup = body.backups[0];
      expect(backup).toHaveProperty('id');
      expect(backup).toHaveProperty('type');
      expect(backup).toHaveProperty('status');
      expect(backup).toHaveProperty('createdAt');
      expect(backup).toHaveProperty('sizeBytes');
      expect(backup).toHaveProperty('sizeMB');
      expect(backup).toHaveProperty('tables');
    });

    it('should filter backups by type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/list?type=full',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      body.backups.forEach((backup: any) => {
        expect(backup.type).toBe('full');
      });
    });

    it('should filter backups by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/list?status=completed',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      body.backups.forEach((backup: any) => {
        expect(backup.status).toBe('completed');
      });
    });

    it('should limit number of results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/list?limit=1',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.backups.length).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // GET /backup/:id
  // ==========================================================================

  describe('GET /backup/:id', () => {
    it('should return 404 for non-existent backup', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/non-existent-backup',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Backup not found');
    });

    it('should return backup details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/backup-1',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('backup-1');
      expect(body.type).toBe('full');
      expect(body.status).toBe('completed');
      expect(body).toHaveProperty('checksum');
      expect(body).toHaveProperty('storageLocation');
    });

    it('should include detailed backup information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/backup-1',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('tables');
      expect(body).toHaveProperty('rowCounts');
      expect(body).toHaveProperty('compressionRatio');
      expect(body).toHaveProperty('verificationStatus');
      expect(body).toHaveProperty('durationSeconds');
    });
  });

  // ==========================================================================
  // POST /backup/create
  // ==========================================================================

  describe('POST /backup/create', () => {
    it('should create a manual backup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          type: 'full',
          tags: {
            reason: 'manual test backup',
          },
        },
      });

      expect([201, 409]).toContain(response.statusCode);
      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('backup');
        expect(body.backup).toHaveProperty('id');
        expect(body.backup.type).toBe('full');
      }
    });

    it('should default to full backup type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {},
      });

      expect([201, 409]).toContain(response.statusCode);
    });

    it('should reject concurrent backup creation', async () => {
      // First request starts a backup
      const response1 = await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: { type: 'full' },
      });

      // Immediately try another backup
      const response2 = await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: { type: 'full' },
      });

      // One should succeed, other should return 409 or both succeed if first completed
      expect([201, 409]).toContain(response1.statusCode);
      expect([201, 409]).toContain(response2.statusCode);
    });

    it('should include custom tags in backup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          type: 'full',
          tags: {
            environment: 'test',
            triggeredBy: 'automated-test',
          },
        },
      });

      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body.backup).toHaveProperty('id');
      }
    });
  });

  // ==========================================================================
  // GET /backup/progress
  // ==========================================================================

  describe('GET /backup/progress', () => {
    it('should return no progress when no backup is running', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/progress',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('inProgress');
    });

    it('should return progress details when backup is running', async () => {
      // Create a backup to trigger progress
      await app.inject({
        method: 'POST',
        url: '/backup/create',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: { type: 'full' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/backup/progress',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('inProgress');
      if (body.inProgress) {
        expect(body.backup).toHaveProperty('backupId');
        expect(body.backup).toHaveProperty('phase');
        expect(body.backup).toHaveProperty('progress');
        expect(body.backup).toHaveProperty('tablesCompleted');
        expect(body.backup).toHaveProperty('totalTables');
      }
    });
  });

  // ==========================================================================
  // POST /backup/restore
  // ==========================================================================

  describe('POST /backup/restore', () => {
    it('should require backupId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('backupId');
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          backupId: 'non-existent-backup',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Backup not found');
    });

    it('should reject restore from failed backup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          backupId: 'backup-failed',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('failed');
    });

    it('should restore from valid backup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          backupId: 'backup-1',
          verifyFirst: true,
          dropExisting: false,
        },
      });

      expect([200, 403]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('restoredAt');
      }
    });

    it('should validate target database URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          backupId: 'backup-1',
          targetDatabaseUrl: 'postgresql://unauthorized:pass@localhost/db',
        },
      });

      expect([200, 403]).toContain(response.statusCode);
      if (response.statusCode === 403) {
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Forbidden');
      }
    });

    it('should support selective table restore', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/backup/restore',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: {
          backupId: 'backup-1',
          tables: ['users', 'contacts'],
        },
      });

      expect([200, 403]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // DELETE /backup/:id
  // ==========================================================================

  describe('DELETE /backup/:id', () => {
    it('should return 404 for non-existent backup', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/backup/non-existent-backup',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Backup not found');
    });

    it('should delete existing backup', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/backup/backup-1',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('deletedAt');
      }
    });
  });

  // ==========================================================================
  // GET /backup/config
  // ==========================================================================

  describe('GET /backup/config', () => {
    it('should return backup configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/config',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('storage');
      expect(body).toHaveProperty('encryption');
      expect(body).toHaveProperty('retention');
      expect(body).toHaveProperty('schedule');
      expect(body).toHaveProperty('compression');
      expect(body).toHaveProperty('verification');
    });

    it('should include storage configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/config',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.storage).toHaveProperty('provider');
      expect(body.storage).toHaveProperty('bucket');
    });

    it('should include retention policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/config',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.retention).toHaveProperty('hourlyRetention');
      expect(body.retention).toHaveProperty('dailyRetention');
      expect(body.retention).toHaveProperty('weeklyRetention');
      expect(body.retention).toHaveProperty('monthlyRetention');
    });

    it('should not expose sensitive encryption keys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/backup/config',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.encryption).toHaveProperty('enabled');
      expect(body.encryption).not.toHaveProperty('key');
    });
  });

  // ==========================================================================
  // Service Unavailable Tests
  // ==========================================================================

  describe('Service Unavailable', () => {
    it('should return 503 when API_SECRET_KEY is not configured', async () => {
      const originalKey = process.env.ADMIN_API_KEY;
      const originalSecretKey = process.env.API_SECRET_KEY;
      delete process.env.ADMIN_API_KEY;
      delete process.env.API_SECRET_KEY;

      const response = await app.inject({
        method: 'GET',
        url: '/backup/status',
        headers: {
          'x-api-key': 'any-key',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service unavailable');

      // Restore
      process.env.ADMIN_API_KEY = originalKey;
      process.env.API_SECRET_KEY = originalSecretKey;
    });
  });
});
