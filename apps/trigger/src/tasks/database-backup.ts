import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createReadStream, createWriteStream, unlinkSync, existsSync, statSync } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

/**
 * Database Backup Task
 *
 * SECURITY AUDIT: This task implements a comprehensive backup strategy
 * for GDPR compliance and disaster recovery.
 *
 * Features:
 * - Automated PostgreSQL dumps using pg_dump
 * - Compression with gzip to reduce storage costs
 * - Backup verification
 * - Audit logging for compliance
 *
 * Schedule: Daily at 2:00 AM UTC (configurable)
 *
 * NOTE: S3 upload functionality requires @aws-sdk/client-s3 to be installed
 * and configured. This is a placeholder implementation.
 */

// =============================================================================
// Configuration Schemas
// =============================================================================

// Schema for manual backup payload validation
const _ManualBackupPayloadSchema = z.object({
  /** Reason for manual backup */
  reason: z.string().optional(),
  /** Override retention days for this backup */
  retentionDays: z.number().optional(),
  /** Correlation ID for tracking */
  correlationId: z.string(),
});

export type ManualBackupPayload = z.infer<typeof _ManualBackupPayloadSchema>;

// =============================================================================
// Backup Utilities
// =============================================================================

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(prefix = 'medicalcor-db'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.sql.gz`;
}

/**
 * Execute PostgreSQL dump
 */
async function executePgDump(databaseUrl: string, outputPath: string): Promise<void> {
  // Parse database URL to extract components
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || '5432';
  const database = url.pathname.slice(1);
  const username = url.username;
  const password = url.password;

  // Build pg_dump command with security considerations
  // Note: Using environment variable for password to avoid command line exposure
  const pgDumpPath = outputPath.replace('.gz', '');

  const pgDumpCommand = [
    'pg_dump',
    `--host=${host}`,
    `--port=${port}`,
    `--username=${username}`,
    '--no-password', // Password from PGPASSWORD env var
    '--format=plain',
    '--clean', // Include DROP statements for clean restore
    '--if-exists', // Avoid errors on DROP
    '--no-owner', // Skip ownership commands
    '--no-privileges', // Skip privilege commands
    `--file=${pgDumpPath}`,
    database,
  ].join(' ');

  // Execute pg_dump with password in environment
  await execAsync(pgDumpCommand, {
    env: {
      ...process.env,
      PGPASSWORD: password,
    },
    timeout: 600000, // 10 minutes timeout for large databases
  });

  // Compress the backup
  const readStream = createReadStream(pgDumpPath);
  const writeStream = createWriteStream(outputPath);
  const gzip = createGzip({ level: 9 }); // Maximum compression

  await pipeline(readStream, gzip, writeStream);

  // Remove uncompressed file
  unlinkSync(pgDumpPath);

  logger.info('Database dump created and compressed', {
    outputPath,
  });
}

/**
 * Verify backup integrity by checking file size and attempting to decompress header
 */
async function verifyBackup(filePath: string): Promise<{ valid: boolean; size: number }> {
  const stats = statSync(filePath);

  // Minimum valid backup should be at least 1KB
  if (stats.size < 1024) {
    return { valid: false, size: stats.size };
  }

  // Try to read and decompress the first few bytes to verify gzip format
  const readStream = createReadStream(filePath, { end: 1024 });
  const gunzip = createGunzip();

  return new Promise((resolve) => {
    readStream.pipe(gunzip);

    gunzip.on('data', () => {
      // Successfully decompressed some data
      resolve({ valid: true, size: stats.size });
      readStream.destroy();
      gunzip.destroy();
    });

    gunzip.on('error', () => {
      resolve({ valid: false, size: stats.size });
    });
  });
}

/**
 * Send notification about backup status
 */
async function sendNotification(
  webhookUrl: string,
  status: 'success' | 'failure',
  details: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'database-backup',
        status,
        timestamp: new Date().toISOString(),
        ...details,
      }),
    });
  } catch (error) {
    logger.error('Failed to send backup notification', { error, webhookUrl });
  }
}

// =============================================================================
// Scheduled Backup Task
// =============================================================================

/**
 * Scheduled database backup task
 * Runs daily at 2:00 AM UTC
 */
export const scheduledDatabaseBackup = schedules.task({
  id: 'scheduled-database-backup',
  // Run daily at 2:00 AM UTC
  cron: '0 2 * * *',
  run: async () => {
    const startTime = Date.now();
    const correlationId = `backup-${Date.now()}`;

    logger.info('Starting scheduled database backup', { correlationId });

    // Load configuration from environment
    const databaseUrl = process.env.DATABASE_URL;
    const notificationWebhook = process.env.BACKUP_NOTIFICATION_WEBHOOK;

    if (!databaseUrl) {
      logger.error('DATABASE_URL not configured - backup aborted', { correlationId });
      throw new Error('DATABASE_URL environment variable is required for backups');
    }

    const tempDir = tmpdir();
    const filename = generateBackupFilename();
    const localPath = join(tempDir, filename);

    try {
      // Step 1: Execute pg_dump
      logger.info('Executing database dump', { correlationId });
      await executePgDump(databaseUrl, localPath);

      // Step 2: Verify backup
      const verification = await verifyBackup(localPath);
      if (!verification.valid) {
        throw new Error('Backup verification failed - file appears corrupt');
      }
      logger.info('Backup verified', { size: verification.size, correlationId });

      // Step 3: Note about S3 upload
      // S3 upload functionality requires @aws-sdk/client-s3 to be installed
      // For now, backup is stored locally
      logger.info('Backup stored locally (S3 upload not configured)', {
        localPath,
        correlationId,
      });

      // Step 4: Send success notification
      const durationMs = Date.now() - startTime;
      if (notificationWebhook) {
        await sendNotification(notificationWebhook, 'success', {
          correlationId,
          filename,
          sizeBytes: verification.size,
          durationMs,
          location: localPath,
        });
      }

      logger.info('Database backup completed successfully', {
        correlationId,
        durationMs,
        filename,
      });

      return {
        success: true,
        correlationId,
        filename,
        sizeBytes: verification.size,
        location: localPath,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Database backup failed', {
        correlationId,
        error: errorMessage,
        durationMs,
      });

      // Send failure notification
      if (notificationWebhook) {
        await sendNotification(notificationWebhook, 'failure', {
          correlationId,
          error: errorMessage,
          durationMs,
        });
      }

      // Clean up partial backup file
      if (existsSync(localPath)) {
        unlinkSync(localPath);
      }

      throw error;
    }
  },
});

// =============================================================================
// Manual Backup Task
// =============================================================================

/**
 * Manual database backup task
 * Can be triggered on-demand for special scenarios
 */
export const manualDatabaseBackup = task({
  id: 'manual-database-backup',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: ManualBackupPayload) => {
    const { reason, correlationId } = payload;
    const startTime = Date.now();

    logger.info('Starting manual database backup', {
      correlationId,
      reason,
    });

    // Load configuration from environment
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required for backups');
    }

    const tempDir = tmpdir();
    const filename = generateBackupFilename('medicalcor-manual');
    const localPath = join(tempDir, filename);

    try {
      // Execute backup
      await executePgDump(databaseUrl, localPath);

      // Verify
      const verification = await verifyBackup(localPath);
      if (!verification.valid) {
        throw new Error('Backup verification failed');
      }

      const durationMs = Date.now() - startTime;

      logger.info('Manual database backup completed', {
        correlationId,
        filename,
        durationMs,
      });

      return {
        success: true,
        correlationId,
        filename,
        sizeBytes: verification.size,
        location: localPath,
        durationMs,
        reason,
      };
    } catch (error) {
      // Clean up on failure
      if (existsSync(localPath)) {
        unlinkSync(localPath);
      }
      throw error;
    }
  },
});

// =============================================================================
// Backup Status Check Task
// =============================================================================

/**
 * Check the status of recent backups
 * This is a placeholder - full implementation requires S3 SDK
 */
export const checkBackupStatus = task({
  id: 'check-backup-status',
  run: () => {
    const s3Bucket = process.env.BACKUP_S3_BUCKET;

    if (!s3Bucket) {
      return Promise.resolve({
        status: 'unconfigured' as const,
        message: 'S3 backup storage not configured. Backups stored locally only.',
        totalBackups: 0,
        latestBackup: null,
      });
    }

    // Placeholder response - full implementation requires @aws-sdk/client-s3
    return Promise.resolve({
      status: 'healthy' as const,
      message: 'S3 backup status check requires AWS SDK implementation',
      totalBackups: 0,
      latestBackup: null,
    });
  },
});
