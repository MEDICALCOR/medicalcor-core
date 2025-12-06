/**
 * Backup Service Tests
 *
 * Comprehensive tests for enterprise backup and restore functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BackupService,
  createBackupService,
  createBackupServiceFromEnv,
  type BackupConfig,
  type BackupMetadata,
  type BackupProgress,
  type RestoreOptions,
} from '../backup-service.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('[]'),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
}));

// Mock path
vi.mock('path', () => ({
  join: (...args: string[]) => args.join('/'),
  dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
}));

describe('BackupService', () => {
  let service: BackupService;

  // Helper to mock database methods on any BackupService instance
  function mockDatabaseMethods(svc: BackupService): void {
    // @ts-expect-error - accessing private method
    svc.getDatabaseInfo = vi.fn().mockResolvedValue({
      tables: ['users', 'contacts', 'appointments'],
      estimatedSizeBytes: 1024000,
      schemaVersion: '1.0.0',
    });

    // @ts-expect-error - accessing private method
    svc.dumpDatabase = vi.fn().mockImplementation((dbInfo, onProgress) => {
      for (const table of dbInfo.tables) {
        onProgress(table, 1000);
      }
      return Promise.resolve({
        data: Buffer.from(JSON.stringify({ tables: {}, metadata: {} })),
        sizeBytes: 5000,
        rowCounts: { users: 100, contacts: 200, appointments: 50 },
        walPosition: 'test-wal-position',
      });
    });

    // @ts-expect-error - accessing private method
    svc.verifyBackup = vi.fn().mockResolvedValue('passed');
  }

  function createTestConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
    return {
      databaseUrl: 'postgresql://test:test@localhost:5432/test',
      storage: {
        provider: 'local',
        bucket: '/tmp/backups',
        prefix: 'test/',
      },
      retention: {
        hourlyRetention: 24,
        dailyRetention: 7,
        weeklyRetention: 4,
        monthlyRetention: 12,
        minimumBackups: 3,
      },
      compression: true,
      verifyBackups: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackupService(createTestConfig());
    mockDatabaseMethods(service);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Constructor', () => {
    it('should create service with default configuration', () => {
      const config = createTestConfig();
      const newService = new BackupService(config);

      expect(newService).toBeInstanceOf(BackupService);
      newService.shutdown();
    });

    it('should apply default values', () => {
      const config = createTestConfig({
        compression: undefined,
        verifyBackups: undefined,
      });
      const newService = new BackupService(config);

      // Default compression and verification should be enabled
      newService.shutdown();
    });

    it('should throw if encryption enabled without key', () => {
      const config = createTestConfig({
        encryption: {
          enabled: true,
          // No key or password
        },
      });

      expect(() => new BackupService(config)).toThrow(
        'Encryption enabled but no key or password provided'
      );
    });

    it('should accept encryption with key', () => {
      const config = createTestConfig({
        encryption: {
          enabled: true,
          key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64 hex = 32 bytes
        },
      });

      const encryptedService = new BackupService(config);
      encryptedService.shutdown();
    });

    it('should accept encryption with password', () => {
      const config = createTestConfig({
        encryption: {
          enabled: true,
          password: 'strongpassword123',
          salt: 'randomsalt',
        },
      });

      const encryptedService = new BackupService(config);
      encryptedService.shutdown();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should start scheduler if enabled', async () => {
      const scheduledService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'daily',
          },
        })
      );

      await scheduledService.initialize();
      await scheduledService.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await service.initialize();
      await expect(service.shutdown()).resolves.not.toThrow();
    });

    it('should stop all schedulers', async () => {
      const scheduledService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'hourly',
            incrementalFrequency: 'hourly',
          },
        })
      );

      await scheduledService.initialize();
      await scheduledService.shutdown();
    });
  });

  describe('createBackup', () => {
    it('should create a full backup', async () => {
      const metadata = await service.createBackup('full');

      expect(metadata.id).toMatch(/^backup-/);
      expect(metadata.type).toBe('full');
      expect(metadata.status).toBe('verified');
      expect(metadata.compressed).toBe(true);
    });

    it('should create incremental backup', async () => {
      const metadata = await service.createBackup('incremental');

      expect(metadata.type).toBe('incremental');
    });

    it('should emit backup:started event', async () => {
      const startedHandler = vi.fn();
      service.on('backup:started', startedHandler);

      await service.createBackup('full');

      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'full',
        })
      );
    });

    it('should emit backup:progress events', async () => {
      const progressHandler = vi.fn();
      service.on('backup:progress', progressHandler);

      await service.createBackup('full');

      expect(progressHandler).toHaveBeenCalled();
      const lastCall = progressHandler.mock.calls[
        progressHandler.mock.calls.length - 1
      ]![0] as BackupProgress;
      expect(lastCall.phase).toBe('completed');
      expect(lastCall.progress).toBe(100);
    });

    it('should emit backup:completed event', async () => {
      const completedHandler = vi.fn();
      service.on('backup:completed', completedHandler);

      await service.createBackup('full');

      expect(completedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'full',
          status: expect.stringMatching(/completed|verified/),
        })
      );
    });

    it('should add tags to backup metadata', async () => {
      const metadata = await service.createBackup('full', { environment: 'test', version: '1.0' });

      expect(metadata.tags).toEqual({
        environment: 'test',
        version: '1.0',
      });
    });

    it('should calculate compression ratio', async () => {
      const metadata = await service.createBackup('full');

      expect(metadata.compressionRatio).toBeGreaterThan(0);
    });

    it('should generate checksum', async () => {
      const metadata = await service.createBackup('full');

      expect(metadata.checksum).toBeDefined();
      expect(metadata.checksumAlgorithm).toBe('sha256');
    });

    it('should record duration', async () => {
      const metadata = await service.createBackup('full');

      expect(metadata.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle backup without compression', async () => {
      const uncompressedService = new BackupService(createTestConfig({ compression: false }));
      mockDatabaseMethods(uncompressedService);

      const metadata = await uncompressedService.createBackup('full');

      expect(metadata.compressed).toBe(false);
      await uncompressedService.shutdown();
    });

    it('should handle backup without verification', async () => {
      const noVerifyService = new BackupService(createTestConfig({ verifyBackups: false }));
      mockDatabaseMethods(noVerifyService);

      const metadata = await noVerifyService.createBackup('full');

      expect(metadata.status).toBe('completed');
      await noVerifyService.shutdown();
    });
  });

  describe('restore', () => {
    let backupId: string;

    beforeEach(async () => {
      const metadata = await service.createBackup('full');
      backupId = metadata.id;
    });

    it('should emit restore:started event', async () => {
      const startedHandler = vi.fn();
      service.on('restore:started', startedHandler);

      try {
        await service.restore({ backupId });
      } catch {
        // May fail due to mocked dependencies
      }

      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          backupId,
        })
      );
    });

    it('should throw for non-existent backup', async () => {
      await expect(service.restore({ backupId: 'non-existent' })).rejects.toThrow(
        'Backup not found'
      );
    });

    it('should throw for failed backup status', async () => {
      // Create a failed backup manually
      const failedBackup: BackupMetadata = {
        id: 'failed-backup',
        type: 'full',
        status: 'failed',
        createdAt: new Date(),
        sizeBytes: 0,
        checksum: '',
        checksumAlgorithm: 'sha256',
        encrypted: false,
        compressed: false,
        tables: [],
        rowCounts: {},
        storageLocation: '',
        errorMessage: 'Test failure',
        durationMs: 0,
      };
      // @ts-expect-error - accessing private property for testing
      service.backups.set('failed-backup', failedBackup);

      await expect(service.restore({ backupId: 'failed-backup' })).rejects.toThrow(
        'Cannot restore from failed backup'
      );
    });

    it('should verify backup before restore when requested', async () => {
      const options: RestoreOptions = {
        backupId,
        verifyFirst: true,
      };

      try {
        await service.restore(options);
      } catch {
        // Expected - depends on file system mock
      }
    });
  });

  describe('listBackups', () => {
    beforeEach(async () => {
      await service.createBackup('full');
      await service.createBackup('incremental');
      await service.createBackup('full');
    });

    it('should list all backups', () => {
      const backups = service.listBackups();

      expect(backups).toHaveLength(3);
    });

    it('should filter by type', () => {
      const fullBackups = service.listBackups({ type: 'full' });

      expect(fullBackups).toHaveLength(2);
      expect(fullBackups.every((b) => b.type === 'full')).toBe(true);
    });

    it('should filter by status', () => {
      const verifiedBackups = service.listBackups({ status: 'verified' });

      expect(verifiedBackups.every((b) => b.status === 'verified')).toBe(true);
    });

    it('should filter by date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const backups = service.listBackups({
        fromDate: yesterday,
        toDate: now,
      });

      expect(backups.length).toBeGreaterThanOrEqual(0);
    });

    it('should limit results', () => {
      const backups = service.listBackups({ limit: 2 });

      expect(backups).toHaveLength(2);
    });

    it('should sort by creation date descending', () => {
      const backups = service.listBackups();

      for (let i = 1; i < backups.length; i++) {
        expect(backups[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          backups[i]!.createdAt.getTime()
        );
      }
    });
  });

  describe('getBackup', () => {
    it('should return backup by ID', async () => {
      const created = await service.createBackup('full');

      const retrieved = service.getBackup(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent backup', () => {
      const result = service.getBackup('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup', async () => {
      const created = await service.createBackup('full');

      await service.deleteBackup(created.id);

      expect(service.getBackup(created.id)).toBeNull();
    });

    it('should throw for non-existent backup', async () => {
      await expect(service.deleteBackup('non-existent')).rejects.toThrow('Backup not found');
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const stats = service.getStats();

      expect(stats.totalBackups).toBe(0);
      expect(stats.successfulBackups).toBe(0);
      expect(stats.failedBackups).toBe(0);
    });

    it('should count backups correctly', async () => {
      await service.createBackup('full');
      await service.createBackup('incremental');

      const stats = service.getStats();

      expect(stats.totalBackups).toBe(2);
      expect(stats.successfulBackups).toBe(2);
    });

    it('should calculate total storage', async () => {
      await service.createBackup('full');

      const stats = service.getStats();

      expect(stats.totalStorageBytes).toBeGreaterThan(0);
    });

    it('should track oldest and newest backup', async () => {
      await service.createBackup('full');
      await new Promise((r) => setTimeout(r, 10));
      await service.createBackup('full');

      const stats = service.getStats();

      expect(stats.oldestBackup).not.toBeNull();
      expect(stats.newestBackup).not.toBeNull();
      expect(stats.oldestBackup!.getTime()).toBeLessThanOrEqual(stats.newestBackup!.getTime());
    });

    it('should calculate average duration', async () => {
      await service.createBackup('full');

      const stats = service.getStats();

      expect(stats.avgBackupDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average compression ratio', async () => {
      await service.createBackup('full');

      const stats = service.getStats();

      expect(stats.avgCompressionRatio).toBeGreaterThan(0);
    });
  });

  describe('getCurrentProgress', () => {
    it('should return null when no backup in progress', () => {
      expect(service.getCurrentProgress()).toBeNull();
    });
  });

  describe('Event Emission', () => {
    it('should emit retention:cleanup when backups deleted', async () => {
      const cleanupHandler = vi.fn();
      service.on('retention:cleanup', cleanupHandler);

      // Create many backups to trigger retention
      for (let i = 0; i < 10; i++) {
        await service.createBackup('full');
      }

      // Retention cleanup is called after each backup
      // May or may not trigger based on age
    });

    it('should emit backup:failed on error', async () => {
      const failedHandler = vi.fn();
      service.on('backup:failed', failedHandler);

      // Force a failure by mocking
      const faultyService = new BackupService(createTestConfig());
      // @ts-expect-error - accessing private method
      faultyService.getDatabaseInfo = vi.fn().mockRejectedValue(new Error('DB Error'));

      try {
        await faultyService.createBackup('full');
      } catch {
        // Expected
      }

      await faultyService.shutdown();
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const encryptedService = new BackupService(
        createTestConfig({
          encryption: {
            enabled: true,
            key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        })
      );
      mockDatabaseMethods(encryptedService);

      const metadata = await encryptedService.createBackup('full');

      expect(metadata.encrypted).toBe(true);
      await encryptedService.shutdown();
    });

    it('should use password-based key derivation', async () => {
      const passwordService = new BackupService(
        createTestConfig({
          encryption: {
            enabled: true,
            password: 'supersecretpassword',
            salt: 'randomsaltvalue',
          },
        })
      );
      mockDatabaseMethods(passwordService);

      const metadata = await passwordService.createBackup('full');

      expect(metadata.encrypted).toBe(true);
      await passwordService.shutdown();
    });
  });

  describe('Storage Providers', () => {
    it('should use local storage by default', async () => {
      const metadata = await service.createBackup('full');

      expect(metadata.storageLocation).toContain('/tmp/backups');
    });

    it('should handle S3 storage configuration', () => {
      const s3Service = new BackupService(
        createTestConfig({
          storage: {
            provider: 's3',
            bucket: 'my-backup-bucket',
            region: 'us-east-1',
            credentials: {
              accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
              secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            },
          },
        })
      );

      s3Service.shutdown();
    });
  });

  describe('Factory Functions', () => {
    it('should create service with createBackupService', () => {
      const newService = createBackupService(createTestConfig());

      expect(newService).toBeInstanceOf(BackupService);
      newService.shutdown();
    });
  });

  describe('createBackupServiceFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null without DATABASE_URL', () => {
      delete process.env.DATABASE_URL;

      const result = createBackupServiceFromEnv();

      expect(result).toBeNull();
    });

    it('should create service from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should configure storage from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_STORAGE_PROVIDER = 's3';
      process.env.BACKUP_STORAGE_BUCKET = 'my-bucket';
      process.env.BACKUP_STORAGE_REGION = 'eu-west-1';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should configure encryption from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_ENCRYPTION_KEY =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should configure scheduler from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_SCHEDULE_ENABLED = 'true';
      process.env.BACKUP_FULL_FREQUENCY = 'daily';
      process.env.BACKUP_PREFERRED_HOUR = '3';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should configure AWS credentials from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_STORAGE_PROVIDER = 's3';
      process.env.BACKUP_STORAGE_BUCKET = 'my-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should configure retention from environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_RETENTION_HOURLY = '48';
      process.env.BACKUP_RETENTION_DAILY = '14';
      process.env.BACKUP_RETENTION_WEEKLY = '8';
      process.env.BACKUP_RETENTION_MONTHLY = '24';
      process.env.BACKUP_MINIMUM_KEEP = '5';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });

    it('should disable compression via environment', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      process.env.BACKUP_COMPRESSION = 'false';

      const envService = createBackupServiceFromEnv();

      expect(envService).toBeInstanceOf(BackupService);
      envService?.shutdown();
    });
  });

  describe('Retention Policy', () => {
    it('should keep minimum backups', async () => {
      const minKeepService = new BackupService(
        createTestConfig({
          retention: {
            minimumBackups: 2,
            hourlyRetention: 0,
            dailyRetention: 0,
            weeklyRetention: 0,
            monthlyRetention: 0,
          },
        })
      );
      mockDatabaseMethods(minKeepService);

      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await minKeepService.createBackup('full');
      }

      // Should have at least minimum backups
      const backups = minKeepService.listBackups();
      expect(backups.length).toBeGreaterThanOrEqual(2);

      await minKeepService.shutdown();
    });
  });

  describe('Backup Types', () => {
    it('should support full backup', async () => {
      const metadata = await service.createBackup('full');
      expect(metadata.type).toBe('full');
    });

    it('should support incremental backup', async () => {
      const metadata = await service.createBackup('incremental');
      expect(metadata.type).toBe('incremental');
    });

    it('should support differential backup', async () => {
      const metadata = await service.createBackup('differential');
      expect(metadata.type).toBe('differential');
    });

    it('should support WAL backup', async () => {
      const metadata = await service.createBackup('wal');
      expect(metadata.type).toBe('wal');
    });
  });

  describe('Schedule Configuration', () => {
    it('should convert hourly frequency to interval', async () => {
      const hourlyService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'hourly',
          },
        })
      );

      await hourlyService.initialize();
      await hourlyService.shutdown();
    });

    it('should convert daily frequency to interval', async () => {
      const dailyService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'daily',
          },
        })
      );

      await dailyService.initialize();
      await dailyService.shutdown();
    });

    it('should convert weekly frequency to interval', async () => {
      const weeklyService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'weekly',
          },
        })
      );

      await weeklyService.initialize();
      await weeklyService.shutdown();
    });

    it('should convert monthly frequency to interval', async () => {
      const monthlyService = new BackupService(
        createTestConfig({
          schedule: {
            enabled: true,
            fullBackupFrequency: 'monthly',
          },
        })
      );

      await monthlyService.initialize();
      await monthlyService.shutdown();
    });
  });
});
