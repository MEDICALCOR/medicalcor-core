import crypto from 'crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createLogger } from '../logger/index.js';
import {
  type EmbeddingModelId,
  type EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
} from './embedding-model-registry.js';

/**
 * Embedding Migration Orchestrator
 *
 * Manages the lifecycle of embedding model migrations with:
 * - Batch processing with configurable concurrency
 * - Checkpointing for resumable migrations
 * - Progress tracking and ETA estimation
 * - Rollback support
 * - Health monitoring
 *
 * @module @medicalcor/core/rag/embedding-migration-orchestrator
 */

const logger = createLogger({ serviceName: 'embedding-migration-orchestrator' });

// =============================================================================
// Schema Definitions
// =============================================================================

export const MigrationJobStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'rolling_back',
]);

export type MigrationJobStatus = z.infer<typeof MigrationJobStatusSchema>;

export const MigrationEntryStatusSchema = z.enum(['success', 'failed', 'skipped', 'rolled_back']);

export type MigrationEntryStatus = z.infer<typeof MigrationEntryStatusSchema>;

export const MigrationJobConfigSchema = z.object({
  fromModel: z.string(),
  toModel: z.string(),
  targetTable: z.enum(['knowledge_base', 'message_embeddings']).default('knowledge_base'),
  batchSize: z.number().int().min(1).max(500).default(50),
  concurrency: z.number().int().min(1).max(10).default(1),
  delayBetweenBatchesMs: z.number().int().min(0).max(60000).default(100),
  maxRetries: z.number().int().min(0).max(10).default(3),
  priority: z.number().int().min(1).max(10).default(5),
  createdBy: z.string().optional(),
  correlationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type MigrationJobConfig = z.infer<typeof MigrationJobConfigSchema>;

export interface MigrationJob {
  id: string;
  jobName: string;
  fromModel: string;
  toModel: string;
  targetTable: string;
  status: MigrationJobStatus;
  priority: number;
  totalEntries: number;
  processedEntries: number;
  failedEntries: number;
  skippedEntries: number;
  batchSize: number;
  concurrency: number;
  delayBetweenBatchesMs: number;
  maxRetries: number;
  retryCount: number;
  lastError: string | null;
  errorCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  pausedAt: Date | null;
  estimatedCompletionAt: Date | null;
  lastProcessedId: string | null;
  checkpointData: Record<string, unknown>;
  createdBy: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationProgress {
  jobId: string;
  status: MigrationJobStatus;
  progressPercent: number;
  entriesPerSecond: number;
  estimatedTimeRemainingSeconds: number | null;
  errorRate: number;
  processedEntries: number;
  totalEntries: number;
  failedEntries: number;
}

export interface MigrationEntry {
  entryId: string;
  content: string;
  currentModel: string;
  embeddingVersion: number;
}

export interface ModelDistribution {
  model: string;
  entryCount: number;
  percentage: number;
  avgVersion: number;
  oldestEmbedding: Date | null;
  newestEmbedding: Date | null;
}

export interface EmbeddingGenerator {
  embed(text: string): Promise<{ embedding: number[]; tokensUsed: number }>;
  embedBatch(texts: string[]): Promise<{ embeddings: number[][]; totalTokensUsed: number }>;
  getModelInfo(): { model: string; dimensions: number };
}

// =============================================================================
// Migration Orchestrator Class
// =============================================================================

export class EmbeddingMigrationOrchestrator {
  private pool: Pool;
  private registry: EmbeddingModelRegistry;
  private embeddingGenerator: EmbeddingGenerator | null = null;
  private runningJobs = new Map<string, { controller: AbortController; promise: Promise<void> }>();

  constructor(
    pool: Pool,
    registry?: EmbeddingModelRegistry,
    embeddingGenerator?: EmbeddingGenerator
  ) {
    this.pool = pool;
    this.registry = registry ?? createEmbeddingModelRegistry();
    this.embeddingGenerator = embeddingGenerator ?? null;
  }

  /**
   * Set the embedding generator (for dependency injection)
   */
  setEmbeddingGenerator(generator: EmbeddingGenerator): void {
    this.embeddingGenerator = generator;
  }

  // ===========================================================================
  // Job Management
  // ===========================================================================

  /**
   * Create a new migration job
   */
  async createJob(config: MigrationJobConfig): Promise<MigrationJob> {
    const validated = MigrationJobConfigSchema.parse(config);

    // Validate models exist in registry
    const fromModelConfig = this.registry.getModel(validated.fromModel as EmbeddingModelId);
    const toModelConfig = this.registry.getModel(validated.toModel as EmbeddingModelId);

    if (!fromModelConfig) {
      throw new Error(`Source model ${validated.fromModel} not found in registry`);
    }
    if (!toModelConfig) {
      throw new Error(`Target model ${validated.toModel} not found in registry`);
    }

    // Check for existing active migration
    const existingJob = await this.findActiveJob(
      validated.fromModel,
      validated.toModel,
      validated.targetTable
    );
    if (existingJob) {
      throw new Error(
        `Active migration job already exists: ${existingJob.id} (status: ${existingJob.status})`
      );
    }

    // Count total entries to migrate
    const totalEntries = await this.countEntriesForMigration(
      validated.fromModel,
      validated.targetTable
    );

    const jobName = `migration_${validated.fromModel}_to_${validated.toModel}_${Date.now()}`;
    const correlationId =
      validated.correlationId ?? `mig_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const query = `
      INSERT INTO embedding_migration_jobs (
        job_name, from_model, to_model, target_table, status, priority,
        total_entries, batch_size, concurrency, delay_between_batches_ms,
        max_retries, created_by, correlation_id, metadata
      ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      jobName,
      validated.fromModel,
      validated.toModel,
      validated.targetTable,
      validated.priority,
      totalEntries,
      validated.batchSize,
      validated.concurrency,
      validated.delayBetweenBatchesMs,
      validated.maxRetries,
      validated.createdBy ?? null,
      correlationId,
      JSON.stringify(validated.metadata ?? {}),
    ]);

    const job = this.mapRowToJob(result.rows[0] as Record<string, unknown>);

    logger.info(
      {
        jobId: job.id,
        fromModel: validated.fromModel,
        toModel: validated.toModel,
        targetTable: validated.targetTable,
        totalEntries,
        correlationId,
      },
      'Created migration job'
    );

    return job;
  }

  /**
   * Start or resume a migration job
   */
  async startJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === 'running') {
      throw new Error(`Job ${jobId} is already running`);
    }

    if (job.status === 'completed') {
      throw new Error(`Job ${jobId} is already completed`);
    }

    if (!this.embeddingGenerator) {
      throw new Error('Embedding generator not configured');
    }

    // Update status to running
    await this.updateJobStatus(jobId, 'running', { startedAt: new Date() });

    // Create abort controller for this job
    const controller = new AbortController();

    // Run migration in background
    const promise = this.runMigration(job, controller.signal);

    this.runningJobs.set(jobId, { controller, promise });

    // Handle completion
    promise
      .then(() => {
        this.runningJobs.delete(jobId);
      })
      .catch((error: unknown) => {
        this.runningJobs.delete(jobId);
        logger.error({ jobId, error }, 'Migration job failed');
      });

    logger.info({ jobId, correlationId: job.correlationId }, 'Started migration job');
  }

  /**
   * Pause a running migration job
   */
  async pauseJob(jobId: string): Promise<void> {
    const running = this.runningJobs.get(jobId);
    if (!running) {
      throw new Error(`Job ${jobId} is not running`);
    }

    running.controller.abort();
    // Wait for graceful shutdown - ignoring rejection since we're just waiting
    await running.promise.catch(() => {
      // Intentionally empty - we just need to wait for promise to settle
    });

    await this.updateJobStatus(jobId, 'paused', { pausedAt: new Date() });

    logger.info({ jobId }, 'Paused migration job');
  }

  /**
   * Cancel a migration job
   */
  async cancelJob(jobId: string): Promise<void> {
    const running = this.runningJobs.get(jobId);
    if (running) {
      running.controller.abort();
      // Wait for graceful shutdown - ignoring rejection
      await running.promise.catch(() => {
        // Intentionally empty - we just need to wait for promise to settle
      });
    }

    await this.updateJobStatus(jobId, 'cancelled');

    logger.info({ jobId }, 'Cancelled migration job');
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<MigrationJob | null> {
    const result = await this.pool.query('SELECT * FROM embedding_migration_jobs WHERE id = $1', [
      jobId,
    ]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRowToJob(row) : null;
  }

  /**
   * Get job progress
   */
  async getJobProgress(jobId: string): Promise<MigrationProgress | null> {
    const result = await this.pool.query('SELECT * FROM get_migration_job_progress($1)', [jobId]);
    const row = result.rows[0] as
      | {
          job_id: string;
          status: string;
          progress_percent: string;
          entries_per_second: string;
          estimated_time_remaining_seconds: string | null;
          error_rate: string;
        }
      | undefined;

    if (!row) return null;

    const job = await this.getJob(jobId);
    if (!job) return null;

    return {
      jobId: row.job_id,
      status: row.status as MigrationJobStatus,
      progressPercent: parseFloat(row.progress_percent),
      entriesPerSecond: parseFloat(row.entries_per_second),
      estimatedTimeRemainingSeconds: row.estimated_time_remaining_seconds
        ? parseInt(row.estimated_time_remaining_seconds, 10)
        : null,
      errorRate: parseFloat(row.error_rate),
      processedEntries: job.processedEntries,
      totalEntries: job.totalEntries,
      failedEntries: job.failedEntries,
    };
  }

  /**
   * List migration jobs
   */
  async listJobs(options?: {
    status?: MigrationJobStatus;
    fromModel?: string;
    toModel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: MigrationJob[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (options?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(options.status);
    }
    if (options?.fromModel) {
      conditions.push(`from_model = $${paramIndex++}`);
      values.push(options.fromModel);
    }
    if (options?.toModel) {
      conditions.push(`to_model = $${paramIndex++}`);
      values.push(options.toModel);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM embedding_migration_jobs ${whereClause}`,
      values
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // Get jobs
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const query = `
      SELECT * FROM embedding_migration_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const result = await this.pool.query(query, [...values, limit, offset]);

    return {
      jobs: (result.rows as Record<string, unknown>[]).map((row) => this.mapRowToJob(row)),
      total,
    };
  }

  // ===========================================================================
  // Migration Execution
  // ===========================================================================

  /**
   * Run the actual migration
   */
  private async runMigration(job: MigrationJob, signal: AbortSignal): Promise<void> {
    let lastProcessedId: string | null = job.lastProcessedId;
    let processedCount = job.processedEntries;
    let failedCount = job.failedEntries;

    try {
      while (!signal.aborted) {
        // Fetch batch
        const entries = await this.fetchBatch(
          job.fromModel,
          job.toModel,
          job.targetTable,
          job.batchSize,
          lastProcessedId
        );

        if (entries.length === 0) {
          // Migration complete
          await this.updateJobStatus(job.id, 'completed', { completedAt: new Date() });
          logger.info(
            {
              jobId: job.id,
              processedEntries: processedCount,
              failedEntries: failedCount,
              correlationId: job.correlationId,
            },
            'Migration job completed'
          );
          return;
        }

        // Process batch
        const results = await this.processBatch(entries, job);

        // Update counters
        processedCount += results.successCount;
        failedCount += results.failedCount;
        lastProcessedId = entries[entries.length - 1]?.entryId ?? lastProcessedId;

        // Update checkpoint
        await this.updateJobCheckpoint(job.id, {
          lastProcessedId,
          processedEntries: processedCount,
          failedEntries: failedCount,
        });

        // Delay between batches (only if delay is configured)
        if (job.delayBetweenBatchesMs > 0) {
          await this.delay(job.delayBetweenBatchesMs);
        }
      }

      // Job was paused/cancelled
      logger.info(
        {
          jobId: job.id,
          processedEntries: processedCount,
          lastProcessedId,
          correlationId: job.correlationId,
        },
        'Migration job interrupted'
      );
    } catch (error) {
      await this.updateJobStatus(job.id, 'failed', {
        lastError: error instanceof Error ? error.message : String(error),
        errorCount: job.errorCount + 1,
      });
      throw error;
    }
  }

  /**
   * Process a batch of entries
   */
  private async processBatch(
    entries: MigrationEntry[],
    job: MigrationJob
  ): Promise<{ successCount: number; failedCount: number }> {
    if (!this.embeddingGenerator) {
      throw new Error('Embedding generator not configured');
    }

    let successCount = 0;
    let failedCount = 0;

    // Generate embeddings for batch
    const texts = entries.map((e) => e.content);
    const batchResult = await this.embeddingGenerator.embedBatch(texts);

    // Update each entry
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const embedding = batchResult.embeddings[i];

        if (!entry || !embedding) {
          failedCount++;
          continue;
        }

        const startTime = Date.now();
        try {
          // Update embedding
          await client.query('SELECT update_embedding_with_version($1, $2, $3, $4, $5)', [
            entry.entryId,
            job.targetTable,
            `[${embedding.join(',')}]`,
            job.toModel,
            Math.ceil(batchResult.totalTokensUsed / entries.length),
          ]);

          // Log history
          await client.query(
            `
            INSERT INTO embedding_migration_history (
              job_id, entry_id, entry_table, from_model, to_model, status,
              processing_time_ms, tokens_used
            ) VALUES ($1, $2, $3, $4, $5, 'success', $6, $7)
          `,
            [
              job.id,
              entry.entryId,
              job.targetTable,
              entry.currentModel,
              job.toModel,
              Date.now() - startTime,
              Math.ceil(batchResult.totalTokensUsed / entries.length),
            ]
          );

          successCount++;
        } catch (error) {
          failedCount++;

          // Log failure
          await client.query(
            `
            INSERT INTO embedding_migration_history (
              job_id, entry_id, entry_table, from_model, to_model, status,
              processing_time_ms, error_message
            ) VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7)
          `,
            [
              job.id,
              entry.entryId,
              job.targetTable,
              entry.currentModel,
              job.toModel,
              Date.now() - startTime,
              error instanceof Error ? error.message : String(error),
            ]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { successCount, failedCount };
  }

  // ===========================================================================
  // Rollback Support
  // ===========================================================================

  /**
   * Rollback a completed or failed migration job
   */
  async rollbackJob(
    jobId: string,
    options?: { limit?: number }
  ): Promise<{ rolledBack: number; failed: number }> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === 'running') {
      throw new Error('Cannot rollback a running job. Pause it first.');
    }

    await this.updateJobStatus(jobId, 'rolling_back');

    const limit = options?.limit ?? 1000;
    let rolledBack = 0;
    let failed = 0;

    try {
      // Get history entries that can be rolled back
      const historyResult = await this.pool.query(
        `
        SELECT entry_id, entry_table, from_model
        FROM embedding_migration_history
        WHERE job_id = $1 AND status = 'success' AND can_rollback = TRUE
        LIMIT $2
      `,
        [jobId, limit]
      );

      for (const row of historyResult.rows as {
        entry_id: string;
        entry_table: string;
        from_model: string;
      }[]) {
        try {
          // Rollback requires regenerating with old model - mark as needing refresh
          await this.pool.query(
            `
            UPDATE ${row.entry_table}
            SET embedding_model = $1, embedding = NULL
            WHERE id = $2
          `,
            [row.from_model, row.entry_id]
          );

          // Mark history as rolled back
          await this.pool.query(
            `
            UPDATE embedding_migration_history
            SET status = 'rolled_back', rolled_back_at = NOW()
            WHERE job_id = $1 AND entry_id = $2
          `,
            [jobId, row.entry_id]
          );

          rolledBack++;
        } catch {
          failed++;
        }
      }

      await this.updateJobStatus(jobId, 'cancelled', {
        metadata: { ...job.metadata, rolledBack, rollbackFailed: failed },
      });

      logger.info(
        {
          jobId,
          rolledBack,
          failed,
          correlationId: job.correlationId,
        },
        'Rolled back migration job'
      );

      return { rolledBack, failed };
    } catch (error) {
      await this.updateJobStatus(jobId, 'failed', {
        lastError: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
  }

  // ===========================================================================
  // Statistics and Monitoring
  // ===========================================================================

  /**
   * Get model distribution across entries
   */
  async getModelDistribution(
    targetTable: 'knowledge_base' | 'message_embeddings' = 'knowledge_base'
  ): Promise<ModelDistribution[]> {
    const result = await this.pool.query('SELECT * FROM get_embedding_model_distribution($1)', [
      targetTable,
    ]);

    return (
      result.rows as {
        model: string;
        entry_count: string;
        percentage: string;
        avg_version: string;
        oldest_embedding: Date | null;
        newest_embedding: Date | null;
      }[]
    ).map((row) => ({
      model: row.model,
      entryCount: parseInt(row.entry_count, 10),
      percentage: parseFloat(row.percentage),
      avgVersion: parseFloat(row.avg_version),
      oldestEmbedding: row.oldest_embedding,
      newestEmbedding: row.newest_embedding,
    }));
  }

  /**
   * Count entries that need migration
   */
  async countEntriesForMigration(fromModel: string, targetTable: string): Promise<number> {
    const result = await this.pool.query(
      `
      SELECT COUNT(*) FROM ${targetTable}
      WHERE embedding_model = $1 AND embedding IS NOT NULL
      ${targetTable === 'knowledge_base' ? 'AND is_active = TRUE' : ''}
    `,
      [fromModel]
    );
    return parseInt((result.rows[0] as { count: string }).count, 10);
  }

  /**
   * Estimate migration cost (in tokens)
   */
  async estimateMigrationCost(
    fromModel: string,
    toModel: string,
    targetTable: 'knowledge_base' | 'message_embeddings' = 'knowledge_base'
  ): Promise<{
    entryCount: number;
    estimatedTokens: number;
    estimatedCostUsd: number;
    estimatedDurationMinutes: number;
  }> {
    const entryCount = await this.countEntriesForMigration(fromModel, targetTable);

    // Estimate average tokens per entry (based on typical content length)
    const avgTokensPerEntry = 250; // Conservative estimate
    const estimatedTokens = entryCount * avgTokensPerEntry;

    // Get cost from registry
    const toModelConfig = this.registry.getModel(toModel as EmbeddingModelId);
    const costPer1M = toModelConfig?.costPer1MTokens ?? 0.02;
    const estimatedCostUsd = (estimatedTokens / 1_000_000) * costPer1M;

    // Estimate duration (assuming ~1000 embeddings/minute with batching)
    const entriesPerMinute = 1000;
    const estimatedDurationMinutes = Math.ceil(entryCount / entriesPerMinute);

    return {
      entryCount,
      estimatedTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
      estimatedDurationMinutes,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async findActiveJob(
    fromModel: string,
    toModel: string,
    targetTable: string
  ): Promise<MigrationJob | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM embedding_migration_jobs
      WHERE from_model = $1 AND to_model = $2 AND target_table = $3
        AND status IN ('pending', 'running', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [fromModel, toModel, targetTable]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapRowToJob(row) : null;
  }

  private async fetchBatch(
    fromModel: string,
    _toModel: string,
    targetTable: string,
    batchSize: number,
    lastProcessedId: string | null
  ): Promise<MigrationEntry[]> {
    const result = await this.pool.query(
      'SELECT * FROM find_entries_for_migration($1, $2, $3, $4, $5)',
      [fromModel, fromModel, targetTable, batchSize, lastProcessedId]
    );

    return (
      result.rows as {
        entry_id: string;
        content: string;
        current_model: string;
        embedding_version: number | null;
      }[]
    ).map((row) => ({
      entryId: row.entry_id,
      content: row.content,
      currentModel: row.current_model,
      embeddingVersion: row.embedding_version ?? 1,
    }));
  }

  private async updateJobStatus(
    jobId: string,
    status: MigrationJobStatus,
    updates?: Record<string, unknown>
  ): Promise<void> {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [jobId, status];
    let paramIndex = 3;

    if (updates) {
      for (const [key, value] of Object.entries(updates)) {
        const snakeKey = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
        if (snakeKey === 'metadata') {
          setClauses.push(`${snakeKey} = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          setClauses.push(`${snakeKey} = $${paramIndex++}`);
          values.push(value);
        }
      }
    }

    await this.pool.query(
      `UPDATE embedding_migration_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
      values
    );
  }

  private async updateJobCheckpoint(
    jobId: string,
    checkpoint: {
      lastProcessedId: string | null;
      processedEntries: number;
      failedEntries: number;
    }
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE embedding_migration_jobs
      SET
        last_processed_id = $2,
        processed_entries = $3,
        failed_entries = $4,
        checkpoint_data = checkpoint_data || $5::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
      [
        jobId,
        checkpoint.lastProcessedId,
        checkpoint.processedEntries,
        checkpoint.failedEntries,
        JSON.stringify({ lastUpdate: new Date().toISOString() }),
      ]
    );
  }

  private mapRowToJob(row: Record<string, unknown>): MigrationJob {
    return {
      id: row.id as string,
      jobName: row.job_name as string,
      fromModel: row.from_model as string,
      toModel: row.to_model as string,
      targetTable: row.target_table as string,
      status: row.status as MigrationJobStatus,
      priority: row.priority as number,
      totalEntries: row.total_entries as number,
      processedEntries: row.processed_entries as number,
      failedEntries: row.failed_entries as number,
      skippedEntries: row.skipped_entries as number,
      batchSize: row.batch_size as number,
      concurrency: row.concurrency as number,
      delayBetweenBatchesMs: row.delay_between_batches_ms as number,
      maxRetries: row.max_retries as number,
      retryCount: row.retry_count as number,
      lastError: row.last_error as string | null,
      errorCount: row.error_count as number,
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      pausedAt: row.paused_at ? new Date(row.paused_at as string) : null,
      estimatedCompletionAt: row.estimated_completion_at
        ? new Date(row.estimated_completion_at as string)
        : null,
      lastProcessedId: row.last_processed_id as string | null,
      checkpointData:
        row.checkpoint_data && typeof row.checkpoint_data === 'object'
          ? (row.checkpoint_data as Record<string, unknown>)
          : {},
      createdBy: row.created_by as string | null,
      correlationId: row.correlation_id as string | null,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmbeddingMigrationOrchestrator(
  pool: Pool,
  registry?: EmbeddingModelRegistry,
  embeddingGenerator?: EmbeddingGenerator
): EmbeddingMigrationOrchestrator {
  return new EmbeddingMigrationOrchestrator(pool, registry, embeddingGenerator);
}
