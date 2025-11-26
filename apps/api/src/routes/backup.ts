/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/return-await */
import type { FastifyPluginAsync } from 'fastify';
import { createBackupServiceFromEnv, type BackupMetadata, type BackupType } from '@medicalcor/core';

/**
 * Backup API Routes
 *
 * Enterprise backup management endpoints for:
 * - Creating manual backups
 * - Listing backup history
 * - Restoring from backups
 * - Managing backup configuration
 * - Monitoring backup status
 */

// Initialize backup service (singleton)
let backupServiceInstance: ReturnType<typeof createBackupServiceFromEnv> = null;

function getBackupService() {
  if (!backupServiceInstance) {
    backupServiceInstance = createBackupServiceFromEnv();
  }
  return backupServiceInstance;
}

// Request/Response types
interface CreateBackupRequest {
  type?: BackupType;
  tags?: Record<string, string>;
}

interface RestoreBackupRequest {
  backupId: string;
  targetDatabaseUrl?: string;
  tables?: string[];
  verifyFirst?: boolean;
  dropExisting?: boolean;
}

interface ListBackupsQuery {
  type?: BackupType;
  status?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
}

export const backupRoutes: FastifyPluginAsync = async (fastify) => {
  // Verify backup service is available
  const backupService = getBackupService();

  if (!backupService) {
    // Register routes that return service unavailable
    fastify.get('/backup/status', async (_request, reply) => {
      return reply.status(503).send({
        error: 'Backup service not configured',
        message: 'DATABASE_URL environment variable is required for backup functionality',
      });
    });
    return;
  }

  // Initialize backup service
  await backupService.initialize();

  /**
   * GET /backup/status
   *
   * Get backup service status and statistics
   */
  fastify.get('/backup/status', async () => {
    const stats = backupService.getStats();
    const currentProgress = backupService.getCurrentProgress();

    return {
      timestamp: new Date().toISOString(),
      status: 'operational',
      stats: {
        totalBackups: stats.totalBackups,
        successfulBackups: stats.successfulBackups,
        failedBackups: stats.failedBackups,
        totalStorageBytes: stats.totalStorageBytes,
        totalStorageMB: Math.round((stats.totalStorageBytes / 1024 / 1024) * 100) / 100,
        oldestBackup: stats.oldestBackup?.toISOString() ?? null,
        newestBackup: stats.newestBackup?.toISOString() ?? null,
        avgBackupDurationMs: Math.round(stats.avgBackupDurationMs),
        avgCompressionRatio: Math.round(stats.avgCompressionRatio * 100) / 100,
      },
      currentBackup: currentProgress
        ? {
            backupId: currentProgress.backupId,
            phase: currentProgress.phase,
            progress: Math.round(currentProgress.progress),
            bytesProcessed: currentProgress.bytesProcessed,
            currentTable: currentProgress.currentTable,
            tablesCompleted: currentProgress.tablesCompleted,
            totalTables: currentProgress.totalTables,
            startedAt: currentProgress.startedAt.toISOString(),
          }
        : null,
    };
  });

  /**
   * GET /backup/list
   *
   * List all backups with optional filtering
   */
  fastify.get<{ Querystring: ListBackupsQuery }>('/backup/list', async (request) => {
    const { type, status, limit, fromDate, toDate } = request.query;

    // Build filter object without undefined values for exactOptionalPropertyTypes
    const filters: {
      type?: BackupType;
      status?: BackupMetadata['status'];
      limit?: number;
      fromDate?: Date;
      toDate?: Date;
    } = {};
    if (type) filters.type = type as BackupType;
    if (status) filters.status = status as BackupMetadata['status'];
    if (limit) filters.limit = parseInt(String(limit), 10);
    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);

    const backups = backupService.listBackups(filters);

    return {
      timestamp: new Date().toISOString(),
      count: backups.length,
      backups: backups.map((backup) => ({
        id: backup.id,
        type: backup.type,
        status: backup.status,
        createdAt: backup.createdAt.toISOString(),
        completedAt: backup.completedAt?.toISOString() ?? null,
        sizeBytes: backup.sizeBytes,
        sizeMB: Math.round((backup.sizeBytes / 1024 / 1024) * 100) / 100,
        compressedSizeBytes: backup.compressedSizeBytes,
        compressedSizeMB: backup.compressedSizeBytes
          ? Math.round((backup.compressedSizeBytes / 1024 / 1024) * 100) / 100
          : null,
        compressionRatio: backup.compressionRatio
          ? Math.round(backup.compressionRatio * 100) / 100
          : null,
        encrypted: backup.encrypted,
        compressed: backup.compressed,
        tables: backup.tables,
        rowCounts: backup.rowCounts,
        durationMs: backup.durationMs,
        durationSeconds: Math.round((backup.durationMs / 1000) * 10) / 10,
        verificationStatus: backup.verificationStatus ?? null,
        errorMessage: backup.errorMessage ?? null,
        tags: backup.tags ?? {},
      })),
    };
  });

  /**
   * GET /backup/:id
   *
   * Get details of a specific backup
   */
  fastify.get<{ Params: { id: string } }>('/backup/:id', async (request, reply) => {
    const { id } = request.params;
    const backup = backupService.getBackup(id);

    if (!backup) {
      return reply.status(404).send({
        error: 'Backup not found',
        backupId: id,
      });
    }

    return {
      id: backup.id,
      type: backup.type,
      status: backup.status,
      createdAt: backup.createdAt.toISOString(),
      completedAt: backup.completedAt?.toISOString() ?? null,
      sizeBytes: backup.sizeBytes,
      sizeMB: Math.round((backup.sizeBytes / 1024 / 1024) * 100) / 100,
      compressedSizeBytes: backup.compressedSizeBytes,
      compressedSizeMB: backup.compressedSizeBytes
        ? Math.round((backup.compressedSizeBytes / 1024 / 1024) * 100) / 100
        : null,
      checksum: backup.checksum,
      checksumAlgorithm: backup.checksumAlgorithm,
      encrypted: backup.encrypted,
      compressed: backup.compressed,
      compressionRatio: backup.compressionRatio,
      tables: backup.tables,
      rowCounts: backup.rowCounts,
      walPosition: backup.walPosition ?? null,
      parentBackupId: backup.parentBackupId ?? null,
      storageLocation: backup.storageLocation,
      verifiedAt: backup.verifiedAt?.toISOString() ?? null,
      verificationStatus: backup.verificationStatus ?? null,
      errorMessage: backup.errorMessage ?? null,
      durationMs: backup.durationMs,
      durationSeconds: Math.round((backup.durationMs / 1000) * 10) / 10,
      tags: backup.tags ?? {},
    };
  });

  /**
   * POST /backup/create
   *
   * Create a new manual backup
   */
  fastify.post<{ Body: CreateBackupRequest }>('/backup/create', async (request, reply) => {
    const { type = 'full', tags } = request.body ?? {};

    // Check if a backup is already in progress
    const currentProgress = backupService.getCurrentProgress();
    if (currentProgress) {
      return reply.status(409).send({
        error: 'Backup already in progress',
        currentBackup: {
          backupId: currentProgress.backupId,
          phase: currentProgress.phase,
          progress: Math.round(currentProgress.progress),
          startedAt: currentProgress.startedAt.toISOString(),
        },
      });
    }

    try {
      const backup = await backupService.createBackup(type, {
        ...tags,
        manual: 'true',
        createdBy: 'api',
      });

      return reply.status(201).send({
        success: true,
        message: 'Backup created successfully',
        backup: {
          id: backup.id,
          type: backup.type,
          status: backup.status,
          createdAt: backup.createdAt.toISOString(),
          completedAt: backup.completedAt?.toISOString() ?? null,
          sizeMB: Math.round((backup.sizeBytes / 1024 / 1024) * 100) / 100,
          durationSeconds: Math.round((backup.durationMs / 1000) * 10) / 10,
          tables: backup.tables.length,
          verificationStatus: backup.verificationStatus ?? null,
        },
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Backup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /backup/progress
   *
   * Get current backup progress (for polling)
   */
  fastify.get('/backup/progress', async () => {
    const progress = backupService.getCurrentProgress();

    if (!progress) {
      return {
        inProgress: false,
        backup: null,
      };
    }

    return {
      inProgress: true,
      backup: {
        backupId: progress.backupId,
        phase: progress.phase,
        progress: Math.round(progress.progress * 10) / 10,
        bytesProcessed: progress.bytesProcessed,
        totalBytes: progress.totalBytes,
        currentTable: progress.currentTable ?? null,
        tablesCompleted: progress.tablesCompleted,
        totalTables: progress.totalTables,
        startedAt: progress.startedAt.toISOString(),
        estimatedTimeRemainingMs: progress.estimatedTimeRemainingMs ?? null,
        message: progress.message ?? null,
      },
    };
  });

  /**
   * POST /backup/restore
   *
   * Restore from a backup
   */
  fastify.post<{ Body: RestoreBackupRequest }>('/backup/restore', async (request, reply) => {
    const {
      backupId,
      targetDatabaseUrl,
      tables,
      verifyFirst = true,
      dropExisting = false,
    } = request.body;

    if (!backupId) {
      return reply.status(400).send({
        error: 'backupId is required',
      });
    }

    // Verify backup exists
    const backup = backupService.getBackup(backupId);
    if (!backup) {
      return reply.status(404).send({
        error: 'Backup not found',
        backupId,
      });
    }

    // Check backup status
    if (backup.status === 'failed' || backup.status === 'corrupted') {
      return reply.status(400).send({
        error: `Cannot restore from ${backup.status} backup`,
        backupId,
      });
    }

    try {
      // Build restore options without undefined values for exactOptionalPropertyTypes
      const restoreOptions: Parameters<typeof backupService.restore>[0] = {
        backupId,
        verifyFirst,
        dropExisting,
      };
      if (targetDatabaseUrl) restoreOptions.targetDatabaseUrl = targetDatabaseUrl;
      if (tables) restoreOptions.tables = tables;

      await backupService.restore(restoreOptions);

      return {
        success: true,
        message: 'Restore completed successfully',
        backupId,
        restoredAt: new Date().toISOString(),
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Restore failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        backupId,
      });
    }
  });

  /**
   * DELETE /backup/:id
   *
   * Delete a specific backup
   */
  fastify.delete<{ Params: { id: string } }>('/backup/:id', async (request, reply) => {
    const { id } = request.params;

    const backup = backupService.getBackup(id);
    if (!backup) {
      return reply.status(404).send({
        error: 'Backup not found',
        backupId: id,
      });
    }

    try {
      await backupService.deleteBackup(id);
      return {
        success: true,
        message: 'Backup deleted successfully',
        backupId: id,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete backup',
        message: error instanceof Error ? error.message : 'Unknown error',
        backupId: id,
      });
    }
  });

  /**
   * GET /backup/config
   *
   * Get current backup configuration
   * SECURITY: Requires admin API key authentication to prevent info disclosure
   */
  fastify.get('/backup/config', {
    onRequest: async (request, reply) => {
      const apiKey = request.headers['x-api-key'];
      const adminKey = process.env.ADMIN_API_KEY || process.env.API_SECRET_KEY;

      if (!adminKey) {
        return reply.status(503).send({
          error: 'Service unavailable',
          message: 'Admin authentication not configured',
        });
      }

      if (!apiKey || apiKey !== adminKey) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Valid x-api-key header required for backup configuration',
        });
      }
    },
  }, async () => {
    return {
      timestamp: new Date().toISOString(),
      storage: {
        provider: process.env.BACKUP_STORAGE_PROVIDER ?? 'local',
        bucket: process.env.BACKUP_STORAGE_BUCKET ?? '/var/backups/medicalcor',
        region: process.env.BACKUP_STORAGE_REGION ?? null,
        prefix: process.env.BACKUP_STORAGE_PREFIX ?? 'backups/',
      },
      encryption: {
        enabled: !!process.env.BACKUP_ENCRYPTION_KEY,
      },
      retention: {
        hourlyRetention: parseInt(process.env.BACKUP_RETENTION_HOURLY ?? '24', 10),
        dailyRetention: parseInt(process.env.BACKUP_RETENTION_DAILY ?? '7', 10),
        weeklyRetention: parseInt(process.env.BACKUP_RETENTION_WEEKLY ?? '4', 10),
        monthlyRetention: parseInt(process.env.BACKUP_RETENTION_MONTHLY ?? '12', 10),
        minimumBackups: parseInt(process.env.BACKUP_MINIMUM_KEEP ?? '3', 10),
      },
      schedule: {
        enabled: process.env.BACKUP_SCHEDULE_ENABLED === 'true',
        fullBackupFrequency: process.env.BACKUP_FULL_FREQUENCY ?? 'daily',
        incrementalFrequency: process.env.BACKUP_INCREMENTAL_FREQUENCY ?? null,
        preferredHour: parseInt(process.env.BACKUP_PREFERRED_HOUR ?? '2', 10),
        timezone: process.env.BACKUP_TIMEZONE ?? 'UTC',
      },
      compression: process.env.BACKUP_COMPRESSION !== 'false',
      verification: process.env.BACKUP_VERIFY !== 'false',
    };
  });

  // Graceful shutdown handler
  fastify.addHook('onClose', async () => {
    if (backupServiceInstance) {
      await backupServiceInstance.shutdown();
    }
  });
};
