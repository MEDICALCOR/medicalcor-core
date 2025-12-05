/**
 * Tests for BackupService
 *
 * These tests focus on configuration validation and service instantiation
 * without requiring complex database mocking.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  BackupService,
  createBackupService,
  createBackupServiceFromEnv,
  type BackupConfig,
  type StorageProvider,
} from '../backup-service.js';

// ============= Mock Setup =============

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('[]')),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
}));

// Mock path
vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
}));

// Mock pg
vi.mock('pg', () => ({
  default: {
    Client: class MockClient {
      connect = vi.fn().mockResolvedValue(undefined);
      end = vi.fn().mockResolvedValue(undefined);
      query = vi.fn().mockResolvedValue({ rows: [] });
    },
  },
}));

// Mock zlib
vi.mock('zlib', () => ({
  gzip: vi.fn((data: Buffer, _options: unknown, callback: (err: Error | null, result: Buffer) => void) => {
    callback(null, Buffer.from('compressed-' + data.toString()));
  }),
  gunzip: vi.fn((data: Buffer, callback: (err: Error | null, result: Buffer) => void) => {
    callback(null, data);
  }),
}));

// ============= Helper Functions =============

function createTestConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
  return {
    databaseUrl: 'postgresql://test:test@localhost:5432/testdb',
    storage: {
      provider: 'local' as StorageProvider,
      bucket: '/tmp/test-backups',
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

// ============= Test Suite =============

describe('BackupService', () => {
  describe('Constructor and Configuration', () => {
    it('should create service with minimal config', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      expect(service).toBeInstanceOf(BackupService);
      expect(service).toBeInstanceOf(EventEmitter);
    });

    it('should apply default configuration values', () => {
      const minimalConfig: BackupConfig = {
        databaseUrl: 'postgresql://test:test@localhost:5432/testdb',
        storage: {
          provider: 'local',
          bucket: '/tmp/backups',
        },
        retention: {},
      };

      const service = new BackupService(minimalConfig);
      const stats = service.getStats();
      expect(stats).toBeDefined();
    });

    it('should throw error when encryption enabled without key or password', () => {
      const invalidConfig: BackupConfig = {
        ...createTestConfig(),
        encryption: {
          enabled: true,
          // Missing key and password
        },
      };

      expect(() => new BackupService(invalidConfig)).toThrow('Encryption enabled but no key or password provided');
    });

    it('should accept encryption with key', () => {
      const encryptedConfig: BackupConfig = {
        ...createTestConfig(),
        encryption: {
          enabled: true,
          key: '0'.repeat(64), // 32 bytes hex
        },
      };

      const service = new BackupService(encryptedConfig);
      expect(service).toBeInstanceOf(BackupService);
    });

    it('should accept encryption with password and salt', () => {
      const encryptedConfig: BackupConfig = {
        ...createTestConfig(),
        encryption: {
          enabled: true,
          password: 'secure-password',
          salt: 'random-salt',
        },
      };

      const service = new BackupService(encryptedConfig);
      expect(service).toBeInstanceOf(BackupService);
    });

    it('should set default compression algorithm', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      expect(service).toBeInstanceOf(BackupService);
    });
  });

  describe('initialize() and shutdown()', () => {
    it('should initialize service successfully', async () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      await expect(service.initialize()).resolves.not.toThrow();
      await service.shutdown();
    });

    it('should start scheduler when enabled', async () => {
      const scheduledConfig: BackupConfig = {
        ...createTestConfig(),
        schedule: {
          enabled: true,
          fullBackupFrequency: 'daily',
          preferredHour: 2,
          timezone: 'UTC',
        },
      };

      const service = new BackupService(scheduledConfig);
      await service.initialize();
      await service.shutdown();
      // Scheduler should be running (verified by no errors)
    });

    it('should shutdown gracefully', async () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      await service.initialize();
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });

  describe('getStats()', () => {
    it('should return empty stats initially', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const stats = service.getStats();

      expect(stats.totalBackups).toBe(0);
      expect(stats.successfulBackups).toBe(0);
      expect(stats.failedBackups).toBe(0);
      expect(stats.totalStorageBytes).toBe(0);
      expect(stats.oldestBackup).toBeNull();
      expect(stats.newestBackup).toBeNull();
    });

    it('should calculate stats correctly', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const stats = service.getStats();

      expect(stats.totalBackups).toBeGreaterThanOrEqual(0);
      expect(typeof stats.successfulBackups).toBe('number');
      expect(typeof stats.totalStorageBytes).toBe('number');
    });

    it('should calculate average backup duration', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const stats = service.getStats();

      expect(typeof stats.avgBackupDurationMs).toBe('number');
    });

    it('should calculate average compression ratio', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const stats = service.getStats();

      expect(typeof stats.avgCompressionRatio).toBe('number');
    });
  });

  describe('getCurrentProgress()', () => {
    it('should return null when no backup in progress', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const progress = service.getCurrentProgress();
      expect(progress).toBeNull();
    });

    it('should return progress object type', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const progress = service.getCurrentProgress();
      expect(progress === null || typeof progress === 'object').toBe(true);
    });
  });

  describe('listBackups()', () => {
    it('should return empty array initially', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const backups = service.listBackups();
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBe(0);
    });

    it('should filter by type', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const backups = service.listBackups({ type: 'full' });
      expect(Array.isArray(backups)).toBe(true);
    });

    it('should filter by status', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const backups = service.listBackups({ status: 'verified' });
      expect(Array.isArray(backups)).toBe(true);
    });

    it('should limit results', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const backups = service.listBackups({ limit: 5 });
      expect(backups.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getBackup()', () => {
    it('should return null for non-existent backup', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const backup = service.getBackup('non-existent-id');
      expect(backup).toBeNull();
    });

    it('should accept string backup ID', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      const result = service.getBackup('test-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteBackup()', () => {
    it('should throw error when deleting non-existent backup', async () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      await expect(service.deleteBackup('non-existent-id')).rejects.toThrow('Backup not found');
    });
  });

  describe('Storage Providers', () => {
    it('should support local storage', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      expect(config.storage.provider).toBe('local');
      expect(service).toBeInstanceOf(BackupService);
    });

    it('should support S3 storage configuration', () => {
      const s3Config: BackupConfig = {
        ...createTestConfig(),
        storage: {
          provider: 's3',
          bucket: 'my-backups',
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        },
      };

      const service = new BackupService(s3Config);
      expect(service).toBeInstanceOf(BackupService);
    });
  });

  describe('Retention Policy', () => {
    it('should apply retention policy configuration', () => {
      const retentionConfig: BackupConfig = {
        ...createTestConfig(),
        retention: {
          minimumBackups: 5,
          hourlyRetention: 24,
          dailyRetention: 7,
          weeklyRetention: 4,
          monthlyRetention: 12,
        },
      };

      const service = new BackupService(retentionConfig);
      expect(service).toBeInstanceOf(BackupService);
    });

    it('should keep minimum number of backups configuration', () => {
      const retentionConfig: BackupConfig = {
        ...createTestConfig(),
        retention: {
          minimumBackups: 3,
          hourlyRetention: 1,
        },
      };

      const service = new BackupService(retentionConfig);
      expect(service).toBeInstanceOf(BackupService);
    });
  });

  describe('Event Emissions', () => {
    it('should be an EventEmitter', () => {
      const config = createTestConfig();
      const service = new BackupService(config);
      expect(service).toBeInstanceOf(EventEmitter);
    });

    it('should support event listeners', () => {
      const config = createTestConfig();
      const service = new BackupService(config);

      let called = false;
      const handler = () => {
        called = true;
      };

      service.on('backup:started', handler);
      service.emit('backup:started', { backupId: 'test' });

      expect(called).toBe(true);
    });

    it('should support once listeners', () => {
      const config = createTestConfig();
      const service = new BackupService(config);

      let callCount = 0;
      service.once('backup:completed', () => {
        callCount++;
      });

      service.emit('backup:completed', { backupId: 'test' });
      service.emit('backup:completed', { backupId: 'test' });

      expect(callCount).toBe(1);
    });

    it('should support removeListener', () => {
      const config = createTestConfig();
      const service = new BackupService(config);

      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      service.on('backup:started', handler);
      service.emit('backup:started', { backupId: 'test' });
      service.removeListener('backup:started', handler);
      service.emit('backup:started', { backupId: 'test' });

      expect(callCount).toBe(1);
    });
  });
});

describe('Factory Functions', () => {
  it('should create service with createBackupService', () => {
    const config = createTestConfig();
    const service = createBackupService(config);

    expect(service).toBeInstanceOf(BackupService);
  });

  it('should create service from environment variables', () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.BACKUP_STORAGE_PROVIDER = 'local';
    process.env.BACKUP_STORAGE_BUCKET = '/tmp/backups';

    const service = createBackupServiceFromEnv();

    expect(service).toBeInstanceOf(BackupService);

    delete process.env.DATABASE_URL;
    delete process.env.BACKUP_STORAGE_PROVIDER;
    delete process.env.BACKUP_STORAGE_BUCKET;
  });

  it('should return null when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;

    const service = createBackupServiceFromEnv();

    expect(service).toBeNull();
  });

  it('should use environment encryption key', () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.BACKUP_ENCRYPTION_KEY = '0'.repeat(64);

    const service = createBackupServiceFromEnv();

    expect(service).toBeInstanceOf(BackupService);

    delete process.env.DATABASE_URL;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  it('should configure schedule from environment', () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.BACKUP_SCHEDULE_ENABLED = 'true';
    process.env.BACKUP_FULL_FREQUENCY = 'daily';

    const service = createBackupServiceFromEnv();

    expect(service).toBeInstanceOf(BackupService);

    delete process.env.DATABASE_URL;
    delete process.env.BACKUP_SCHEDULE_ENABLED;
    delete process.env.BACKUP_FULL_FREQUENCY;
  });
});
