/**
 * Dead Letter Queue (DLQ) Service
 *
 * Provides persistent storage and retry logic for failed webhook operations.
 * Critical for HIPAA/GDPR compliance - ensures no patient data is lost due to transient failures.
 *
 * Features:
 * - Persistent storage of failed webhook payloads
 * - Automatic retry with exponential backoff
 * - Configurable max retry attempts
 * - Detailed failure tracking for debugging
 * - Audit logging for compliance
 *
 * @module @medicalcor/core/dead-letter-queue
 */

import { randomUUID } from 'crypto';
import { createLogger, type Logger } from './logger.js';
import type { DatabasePool } from './database.js';

const logger: Logger = createLogger({ name: 'dead-letter-queue' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Webhook types supported by the DLQ
 */
export type WebhookType =
  | 'whatsapp'
  | 'voice'
  | 'vapi'
  | 'stripe'
  | 'booking'
  | 'crm'
  | 'hubspot'
  | 'scheduling';

/**
 * DLQ entry status
 */
export type DlqStatus = 'pending' | 'retrying' | 'processed' | 'failed' | 'expired';

/**
 * Dead letter queue entry
 */
export interface DlqEntry {
  id: string;
  webhookType: WebhookType;
  correlationId: string;
  payload: Record<string, unknown>;
  errorMessage: string;
  errorStack?: string;
  status: DlqStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  lastRetryAt: Date | null;
  processedAt: Date | null;
  expiresAt: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for adding an entry to the DLQ
 */
export interface DlqAddOptions {
  webhookType: WebhookType;
  correlationId: string;
  payload: Record<string, unknown>;
  error: Error | string;
  maxRetries?: number;
  ttlDays?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Options for retry processing
 */
export interface DlqRetryOptions {
  /** Maximum entries to process in one batch */
  batchSize?: number;
  /** Webhook types to process (null for all) */
  webhookTypes?: WebhookType[];
}

/**
 * Retry handler function type
 */
export type RetryHandler = (entry: DlqEntry) => Promise<boolean>;

// =============================================================================
// DLQ SERVICE
// =============================================================================

/**
 * Dead Letter Queue Service
 *
 * @example
 * ```typescript
 * const dlq = new DeadLetterQueueService(db);
 *
 * // Add a failed webhook to the DLQ
 * await dlq.add({
 *   webhookType: 'whatsapp',
 *   correlationId: 'abc-123',
 *   payload: webhookPayload,
 *   error: new Error('Timeout'),
 * });
 *
 * // Process retries
 * await dlq.processRetries(async (entry) => {
 *   return await processWebhook(entry.webhookType, entry.payload);
 * });
 * ```
 */
export class DeadLetterQueueService {
  private static readonly DEFAULT_MAX_RETRIES = 5;
  private static readonly DEFAULT_TTL_DAYS = 7;
  private static readonly RETRY_DELAYS_MS = [
    60 * 1000,       // 1 minute
    5 * 60 * 1000,   // 5 minutes
    30 * 60 * 1000,  // 30 minutes
    2 * 60 * 60 * 1000,  // 2 hours
    24 * 60 * 60 * 1000, // 24 hours
  ];

  constructor(private readonly db: DatabasePool) {}

  /**
   * Add a failed webhook to the dead letter queue
   */
  async add(options: DlqAddOptions): Promise<DlqEntry> {
    const {
      webhookType,
      correlationId,
      payload,
      error,
      maxRetries = DeadLetterQueueService.DEFAULT_MAX_RETRIES,
      ttlDays = DeadLetterQueueService.DEFAULT_TTL_DAYS,
      metadata = {},
    } = options;

    const id = randomUUID();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    const nextRetryAt = new Date(now.getTime() + DeadLetterQueueService.RETRY_DELAYS_MS[0]!);

    await this.db.query(
      `INSERT INTO dead_letter_queue (
        id, webhook_type, correlation_id, payload, error_message, error_stack,
        status, retry_count, max_retries, next_retry_at, expires_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        webhookType,
        correlationId,
        JSON.stringify(payload),
        errorMessage,
        errorStack,
        'pending',
        0,
        maxRetries,
        nextRetryAt,
        expiresAt,
        JSON.stringify(metadata),
      ]
    );

    logger.warn(
      {
        id,
        webhookType,
        correlationId,
        errorMessage,
        maxRetries,
        nextRetryAt,
      },
      'Added failed webhook to dead letter queue'
    );

    return {
      id,
      webhookType,
      correlationId,
      payload,
      errorMessage,
      errorStack,
      status: 'pending',
      retryCount: 0,
      maxRetries,
      nextRetryAt,
      lastRetryAt: null,
      processedAt: null,
      expiresAt,
      metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process entries that are due for retry
   *
   * @param handler - Function to call for each entry. Return true if successful.
   * @param options - Processing options
   * @returns Number of successfully processed entries
   */
  async processRetries(handler: RetryHandler, options: DlqRetryOptions = {}): Promise<number> {
    const { batchSize = 10, webhookTypes } = options;

    // Get entries due for retry
    let query = `
      SELECT * FROM dead_letter_queue
      WHERE status IN ('pending', 'retrying')
        AND next_retry_at <= NOW()
        AND expires_at > NOW()
    `;

    const params: unknown[] = [];

    if (webhookTypes && webhookTypes.length > 0) {
      query += ` AND webhook_type = ANY($1)`;
      params.push(webhookTypes);
    }

    query += ` ORDER BY next_retry_at ASC LIMIT ${batchSize}`;

    const result = await this.db.query(query, params);
    let processedCount = 0;

    for (const row of result.rows) {
      const entry = this.rowToEntry(row);

      try {
        // Mark as retrying
        await this.db.query(
          `UPDATE dead_letter_queue SET status = 'retrying', updated_at = NOW() WHERE id = $1`,
          [entry.id]
        );

        const success = await handler(entry);

        if (success) {
          // Mark as processed
          await this.db.query(
            `UPDATE dead_letter_queue
             SET status = 'processed', processed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [entry.id]
          );

          logger.info(
            { id: entry.id, webhookType: entry.webhookType, correlationId: entry.correlationId },
            'DLQ entry processed successfully'
          );

          processedCount++;
        } else {
          await this.handleRetryFailure(entry, 'Handler returned false');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.handleRetryFailure(entry, errorMessage);
      }
    }

    return processedCount;
  }

  /**
   * Handle a retry failure - update retry count or mark as failed
   */
  private async handleRetryFailure(entry: DlqEntry, errorMessage: string): Promise<void> {
    const newRetryCount = entry.retryCount + 1;

    if (newRetryCount >= entry.maxRetries) {
      // Max retries exceeded - mark as failed
      await this.db.query(
        `UPDATE dead_letter_queue
         SET status = 'failed',
             retry_count = $2,
             last_retry_at = NOW(),
             error_message = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [entry.id, newRetryCount, errorMessage]
      );

      logger.error(
        {
          id: entry.id,
          webhookType: entry.webhookType,
          correlationId: entry.correlationId,
          retryCount: newRetryCount,
          errorMessage,
        },
        'DLQ entry failed after max retries'
      );
    } else {
      // Schedule next retry with exponential backoff
      const delayMs =
        DeadLetterQueueService.RETRY_DELAYS_MS[newRetryCount] ??
        DeadLetterQueueService.RETRY_DELAYS_MS[DeadLetterQueueService.RETRY_DELAYS_MS.length - 1]!;
      const nextRetryAt = new Date(Date.now() + delayMs);

      await this.db.query(
        `UPDATE dead_letter_queue
         SET status = 'pending',
             retry_count = $2,
             next_retry_at = $3,
             last_retry_at = NOW(),
             error_message = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [entry.id, newRetryCount, nextRetryAt, errorMessage]
      );

      logger.warn(
        {
          id: entry.id,
          webhookType: entry.webhookType,
          correlationId: entry.correlationId,
          retryCount: newRetryCount,
          nextRetryAt,
          errorMessage,
        },
        'DLQ entry scheduled for retry'
      );
    }
  }

  /**
   * Get entries by status
   */
  async getByStatus(status: DlqStatus, limit = 100): Promise<DlqEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM dead_letter_queue
       WHERE status = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [status, limit]
    );

    return result.rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Get entry by ID
   */
  async getById(id: string): Promise<DlqEntry | null> {
    const result = await this.db.query(
      `SELECT * FROM dead_letter_queue WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToEntry(result.rows[0]!);
  }

  /**
   * Get statistics about the DLQ
   */
  async getStats(): Promise<Record<DlqStatus, number>> {
    const result = await this.db.query(`
      SELECT status, COUNT(*) as count
      FROM dead_letter_queue
      GROUP BY status
    `);

    const stats: Record<DlqStatus, number> = {
      pending: 0,
      retrying: 0,
      processed: 0,
      failed: 0,
      expired: 0,
    };

    for (const row of result.rows) {
      const status = row.status as DlqStatus;
      stats[status] = parseInt(String(row.count), 10);
    }

    return stats;
  }

  /**
   * Expire old entries
   */
  async expireOldEntries(): Promise<number> {
    const result = await this.db.query(`
      UPDATE dead_letter_queue
      SET status = 'expired', updated_at = NOW()
      WHERE status IN ('pending', 'retrying')
        AND expires_at <= NOW()
    `);

    const expiredCount = result.rowCount ?? 0;

    if (expiredCount > 0) {
      logger.info({ expiredCount }, 'Expired old DLQ entries');
    }

    return expiredCount;
  }

  /**
   * Purge processed entries older than specified days
   */
  async purgeProcessed(olderThanDays = 30): Promise<number> {
    const result = await this.db.query(`
      DELETE FROM dead_letter_queue
      WHERE status = 'processed'
        AND processed_at < NOW() - INTERVAL '1 day' * $1
    `, [olderThanDays]);

    const purgedCount = result.rowCount ?? 0;

    if (purgedCount > 0) {
      logger.info({ purgedCount, olderThanDays }, 'Purged old processed DLQ entries');
    }

    return purgedCount;
  }

  /**
   * Manually retry a specific entry
   */
  async manualRetry(id: string): Promise<boolean> {
    const result = await this.db.query(`
      UPDATE dead_letter_queue
      SET status = 'pending',
          next_retry_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('failed', 'expired')
    `, [id]);

    const updated = (result.rowCount ?? 0) > 0;

    if (updated) {
      logger.info({ id }, 'DLQ entry manually scheduled for retry');
    }

    return updated;
  }

  /**
   * Convert database row to DlqEntry
   */
  private rowToEntry(row: Record<string, unknown>): DlqEntry {
    return {
      id: row.id as string,
      webhookType: row.webhook_type as WebhookType,
      correlationId: row.correlation_id as string,
      payload:
        typeof row.payload === 'string'
          ? JSON.parse(row.payload)
          : (row.payload as Record<string, unknown>),
      errorMessage: row.error_message as string,
      errorStack: row.error_stack as string | undefined,
      status: row.status as DlqStatus,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at as string) : null,
      lastRetryAt: row.last_retry_at ? new Date(row.last_retry_at as string) : null,
      processedAt: row.processed_at ? new Date(row.processed_at as string) : null,
      expiresAt: new Date(row.expires_at as string),
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : (row.metadata as Record<string, unknown>),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

/**
 * Create a dead letter queue service instance
 */
export function createDeadLetterQueueService(db: DatabasePool): DeadLetterQueueService {
  return new DeadLetterQueueService(db);
}

// =============================================================================
// DATABASE MIGRATION
// =============================================================================

/**
 * SQL migration to create the dead_letter_queue table
 * Run this before using the DLQ service
 */
export const DLQ_MIGRATION_SQL = `
-- Dead Letter Queue for failed webhook operations
-- HIPAA/GDPR compliant: stores failed webhooks for retry to prevent data loss

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY,
  webhook_type VARCHAR(50) NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_queue(status);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON dead_letter_queue(next_retry_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_dlq_webhook_type ON dead_letter_queue(webhook_type);
CREATE INDEX IF NOT EXISTS idx_dlq_correlation_id ON dead_letter_queue(correlation_id);
CREATE INDEX IF NOT EXISTS idx_dlq_expires_at ON dead_letter_queue(expires_at)
  WHERE status IN ('pending', 'retrying');

-- Comment for documentation
COMMENT ON TABLE dead_letter_queue IS 'Dead letter queue for failed webhook operations - ensures no data loss';
`;
