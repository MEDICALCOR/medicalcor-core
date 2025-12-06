import { schedules, task, logger } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';
import {
  createDatabaseClient,
  createEventStore,
  createInMemoryEventStore,
  type DatabasePool,
} from '@medicalcor/core';
import { createEmbeddingService, getOpenAIApiKey } from '@medicalcor/integrations';

/**
 * Embedding Migration Jobs
 *
 * Trigger.dev jobs for managing embedding model migrations:
 * - Scheduled migration runner
 * - On-demand migration task
 * - Health check scheduler
 * - Migration progress monitoring
 *
 * @module @medicalcor/trigger/jobs/embedding-migration
 */

// ============================================================================
// TYPES
// ============================================================================

interface MigrationJobRow {
  id: string;
  job_name: string;
  from_model: string;
  to_model: string;
  target_table: string;
  status: string;
  priority: number;
  total_entries: number;
  processed_entries: number;
  failed_entries: number;
  batch_size: number;
  last_processed_id: string | null;
  correlation_id: string | null;
}

interface MigrationEntry {
  entry_id: string;
  content: string;
  current_model: string;
  embedding_version: number;
}

interface MigrationResult {
  jobId: string;
  status: 'completed' | 'in_progress' | 'failed' | 'paused';
  processedThisRun: number;
  totalProcessed: number;
  failed: number;
  remainingEntries: number;
  durationMs: number;
  correlationId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current recommended embedding model */
const CURRENT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Maximum entries to process per job run */
const MAX_ENTRIES_PER_RUN = 500;

/** Batch size for embedding generation */
const EMBEDDING_BATCH_SIZE = 50;

/** Delay between batches (ms) */
const BATCH_DELAY_MS = 100;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCorrelationId(): string {
  return `emb_mig_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'embedding-migration', connectionString: databaseUrl })
    : createInMemoryEventStore('embedding-migration');

  return { db, eventStore };
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Emit migration event
 */
async function emitMigrationEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || generateCorrelationId();
  try {
    await eventStore.emit({
      type,
      correlationId,
      payload,
      aggregateType: 'embedding_migration',
    });
  } catch (error) {
    logger.warn('Failed to emit migration event', { type, error });
  }
}

/**
 * Fetch pending or running migration jobs
 */
async function fetchPendingJobs(db: DatabasePool): Promise<MigrationJobRow[]> {
  const result = await db.query<MigrationJobRow>(`
    SELECT * FROM embedding_migration_jobs
    WHERE status IN ('pending', 'running', 'paused')
    ORDER BY priority DESC, created_at ASC
    LIMIT 5
  `);
  return result.rows;
}

/**
 * Fetch batch of entries for migration
 */
async function fetchMigrationBatch(
  db: DatabasePool,
  fromModel: string,
  targetTable: string,
  batchSize: number,
  lastProcessedId: string | null
): Promise<MigrationEntry[]> {
  const result = await db.query<MigrationEntry>(
    'SELECT * FROM find_entries_for_migration($1, $2, $3, $4, $5)',
    [fromModel, fromModel, targetTable, batchSize, lastProcessedId]
  );
  return result.rows;
}

/**
 * Update job status
 */
async function updateJobStatus(
  db: DatabasePool,
  jobId: string,
  status: string,
  updates?: {
    processedEntries?: number;
    failedEntries?: number;
    lastProcessedId?: string | null;
    lastError?: string | null;
  }
): Promise<void> {
  const setClauses = ['status = $2', 'updated_at = NOW()'];
  const values: unknown[] = [jobId, status];
  let paramIndex = 3;

  if (updates?.processedEntries !== undefined) {
    setClauses.push(`processed_entries = $${paramIndex++}`);
    values.push(updates.processedEntries);
  }
  if (updates?.failedEntries !== undefined) {
    setClauses.push(`failed_entries = $${paramIndex++}`);
    values.push(updates.failedEntries);
  }
  if (updates?.lastProcessedId !== undefined) {
    setClauses.push(`last_processed_id = $${paramIndex++}`);
    values.push(updates.lastProcessedId);
  }
  if (updates?.lastError !== undefined) {
    setClauses.push(`last_error = $${paramIndex++}`);
    values.push(updates.lastError);
  }

  if (status === 'running') {
    setClauses.push('started_at = COALESCE(started_at, NOW())');
  } else if (status === 'completed') {
    setClauses.push('completed_at = NOW()');
  } else if (status === 'paused') {
    setClauses.push('paused_at = NOW()');
  }

  await db.query(
    `UPDATE embedding_migration_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

/**
 * Process a single migration job
 */
async function processMigrationJob(
  db: DatabasePool,
  job: MigrationJobRow,
  embeddingService: ReturnType<typeof createEmbeddingService>,
  correlationId: string
): Promise<MigrationResult> {
  const startTime = Date.now();
  let processedThisRun = 0;
  let failed = 0;
  let lastProcessedId = job.last_processed_id;

  logger.info('Processing migration job', {
    jobId: job.id,
    fromModel: job.from_model,
    toModel: job.to_model,
    targetTable: job.target_table,
    correlationId,
  });

  // Update status to running
  await updateJobStatus(db, job.id, 'running');

  try {
    while (processedThisRun < MAX_ENTRIES_PER_RUN) {
      // Fetch batch
      const entries = await fetchMigrationBatch(
        db,
        job.from_model,
        job.target_table,
        Math.min(EMBEDDING_BATCH_SIZE, MAX_ENTRIES_PER_RUN - processedThisRun),
        lastProcessedId
      );

      if (entries.length === 0) {
        // Migration complete
        await updateJobStatus(db, job.id, 'completed', {
          processedEntries: job.processed_entries + processedThisRun,
          failedEntries: job.failed_entries + failed,
          lastProcessedId,
        });

        logger.info('Migration job completed', {
          jobId: job.id,
          totalProcessed: job.processed_entries + processedThisRun,
          correlationId,
        });

        return {
          jobId: job.id,
          status: 'completed',
          processedThisRun,
          totalProcessed: job.processed_entries + processedThisRun,
          failed: job.failed_entries + failed,
          remainingEntries: 0,
          durationMs: Date.now() - startTime,
          correlationId,
        };
      }

      // Generate embeddings
      const texts = entries.map((e) => e.content);
      const batchResult = await embeddingService.embedBatch(
        texts.map((text) => ({ text })),
        EMBEDDING_BATCH_SIZE
      );

      // Update entries
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const embedding = batchResult.embeddings[i];

          if (!entry || !embedding) {
            failed++;
            continue;
          }

          try {
            await client.query('SELECT update_embedding_with_version($1, $2, $3, $4, $5)', [
              entry.entry_id,
              job.target_table,
              `[${embedding.embedding.join(',')}]`,
              job.to_model,
              embedding.tokensUsed,
            ]);

            // Log success
            await client.query(
              `
              INSERT INTO embedding_migration_history (
                job_id, entry_id, entry_table, from_model, to_model, status,
                processing_time_ms, tokens_used
              ) VALUES ($1, $2, $3, $4, $5, 'success', $6, $7)
            `,
              [
                job.id,
                entry.entry_id,
                job.target_table,
                entry.current_model,
                job.to_model,
                0,
                embedding.tokensUsed,
              ]
            );

            processedThisRun++;
            lastProcessedId = entry.entry_id;
          } catch (error) {
            failed++;
            await client.query(
              `
              INSERT INTO embedding_migration_history (
                job_id, entry_id, entry_table, from_model, to_model, status,
                error_message
              ) VALUES ($1, $2, $3, $4, $5, 'failed', $6)
            `,
              [
                job.id,
                entry.entry_id,
                job.target_table,
                entry.current_model,
                job.to_model,
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

      // Update checkpoint
      await updateJobStatus(db, job.id, 'running', {
        processedEntries: job.processed_entries + processedThisRun,
        failedEntries: job.failed_entries + failed,
        lastProcessedId,
      });

      logger.info('Migration batch processed', {
        jobId: job.id,
        batchSize: entries.length,
        processedThisRun,
        failed,
        correlationId,
      });

      // Delay between batches
      await delay(BATCH_DELAY_MS);
    }

    // Hit max entries per run, pause for next run
    await updateJobStatus(db, job.id, 'running', {
      processedEntries: job.processed_entries + processedThisRun,
      failedEntries: job.failed_entries + failed,
      lastProcessedId,
    });

    const remaining = job.total_entries - (job.processed_entries + processedThisRun);

    return {
      jobId: job.id,
      status: 'in_progress',
      processedThisRun,
      totalProcessed: job.processed_entries + processedThisRun,
      failed: job.failed_entries + failed,
      remainingEntries: remaining,
      durationMs: Date.now() - startTime,
      correlationId,
    };
  } catch (error) {
    await updateJobStatus(db, job.id, 'failed', {
      processedEntries: job.processed_entries + processedThisRun,
      failedEntries: job.failed_entries + failed,
      lastProcessedId,
      lastError: error instanceof Error ? error.message : String(error),
    });

    logger.error('Migration job failed', {
      jobId: job.id,
      error,
      correlationId,
    });

    return {
      jobId: job.id,
      status: 'failed',
      processedThisRun,
      totalProcessed: job.processed_entries + processedThisRun,
      failed: job.failed_entries + failed,
      remainingEntries: job.total_entries - (job.processed_entries + processedThisRun),
      durationMs: Date.now() - startTime,
      correlationId,
    };
  }
}

// ============================================================================
// SCHEDULED JOB: Migration Runner
// ============================================================================

/**
 * Scheduled migration runner
 *
 * Runs every 10 minutes to process pending migration jobs.
 * Picks up where the last run left off using checkpoints.
 */
export const scheduledMigrationRunner = schedules.task({
  id: 'scheduled-embedding-migration-runner',
  cron: '*/10 * * * *', // Every 10 minutes
  run: async (): Promise<{ processed: number; jobs: MigrationResult[] }> => {
    const correlationId = generateCorrelationId();

    logger.info('Starting scheduled migration runner', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping migration', { correlationId });
      return { processed: 0, jobs: [] };
    }

    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      logger.warn('OpenAI API key not configured, skipping migration', { correlationId });
      return { processed: 0, jobs: [] };
    }

    const embeddingService = createEmbeddingService({
      apiKey: openaiKey,
      model: CURRENT_EMBEDDING_MODEL,
    });

    const results: MigrationResult[] = [];

    try {
      // Get pending jobs
      const pendingJobs = await fetchPendingJobs(db);

      if (pendingJobs.length === 0) {
        logger.info('No pending migration jobs', { correlationId });
        return { processed: 0, jobs: [] };
      }

      logger.info(`Found ${pendingJobs.length} pending migration jobs`, { correlationId });

      // Process jobs (highest priority first)
      for (const job of pendingJobs) {
        const result = await processMigrationJob(db, job, embeddingService, correlationId);
        results.push(result);

        // Emit event
        await emitMigrationEvent(eventStore, 'embedding.migration.progress', {
          ...result,
          correlationId,
        });

        // Stop if we hit a failure
        if (result.status === 'failed') {
          break;
        }
      }

      const totalProcessed = results.reduce((sum, r) => sum + r.processedThisRun, 0);

      logger.info('Migration runner completed', {
        totalProcessed,
        jobsProcessed: results.length,
        correlationId,
      });

      return { processed: totalProcessed, jobs: results };
    } catch (error) {
      logger.error('Migration runner failed', { error, correlationId });
      throw error;
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

// ============================================================================
// ON-DEMAND TASK: Create Migration Job
// ============================================================================

/**
 * Create a new migration job
 */
export const createMigrationJob = task({
  id: 'create-embedding-migration-job',
  run: async (payload: {
    fromModel: string;
    toModel?: string;
    targetTable?: string;
    priority?: number;
    createdBy?: string;
  }): Promise<{ jobId: string; totalEntries: number }> => {
    const correlationId = generateCorrelationId();
    const toModel = payload.toModel ?? CURRENT_EMBEDDING_MODEL;
    const targetTable = payload.targetTable ?? 'knowledge_base';

    logger.info('Creating migration job', {
      fromModel: payload.fromModel,
      toModel,
      targetTable,
      correlationId,
    });

    const { db, eventStore } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    try {
      // Count entries to migrate
      const countResult = await db.query<{ count: string }>(
        `
        SELECT COUNT(*) FROM ${targetTable}
        WHERE embedding_model = $1 AND embedding IS NOT NULL
        ${targetTable === 'knowledge_base' ? 'AND is_active = TRUE' : ''}
      `,
        [payload.fromModel]
      );
      const totalEntries = parseInt(countResult.rows[0]?.count ?? '0', 10);

      if (totalEntries === 0) {
        throw new Error(`No entries found with model ${payload.fromModel} in ${targetTable}`);
      }

      // Create job
      const jobName = `migration_${payload.fromModel}_to_${toModel}_${Date.now()}`;

      const insertResult = await db.query<{ id: string }>(
        `
        INSERT INTO embedding_migration_jobs (
          job_name, from_model, to_model, target_table, status, priority,
          total_entries, batch_size, created_by, correlation_id
        ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9)
        RETURNING id
      `,
        [
          jobName,
          payload.fromModel,
          toModel,
          targetTable,
          payload.priority ?? 5,
          totalEntries,
          EMBEDDING_BATCH_SIZE,
          payload.createdBy ?? 'trigger',
          correlationId,
        ]
      );

      const jobId = insertResult.rows[0]?.id;
      if (!jobId) {
        throw new Error('Failed to create migration job');
      }

      await emitMigrationEvent(eventStore, 'embedding.migration.created', {
        jobId,
        fromModel: payload.fromModel,
        toModel,
        targetTable,
        totalEntries,
        correlationId,
      });

      logger.info('Migration job created', {
        jobId,
        totalEntries,
        correlationId,
      });

      return { jobId, totalEntries };
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

// ============================================================================
// SCHEDULED JOB: Health Check
// ============================================================================

/**
 * Daily embedding health check
 *
 * Runs comprehensive health checks on embeddings and logs results.
 */
export const dailyEmbeddingHealthCheck = schedules.task({
  id: 'daily-embedding-health-check',
  cron: '0 5 * * *', // 5:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();

    logger.info('Starting daily embedding health check', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping health check', { correlationId });
      return { success: false };
    }

    try {
      // Get model distribution
      const distributionResult = await db.query(`
        SELECT * FROM get_embedding_model_distribution('knowledge_base')
      `);

      const distribution = distributionResult.rows as {
        model: string;
        entry_count: string;
        percentage: string;
      }[];

      // Check for outdated models
      const outdatedModels = distribution.filter(
        (d) => d.model !== CURRENT_EMBEDDING_MODEL && parseInt(d.entry_count, 10) > 0
      );

      // Run dimension validation
      const validationResult = await db.query(`
        SELECT * FROM validate_embedding_dimensions('knowledge_base', 1000)
      `);

      const validation = validationResult.rows as {
        model: string;
        expected_dimensions: number;
        valid_count: string;
        invalid_count: string;
      }[];

      const totalInvalid = validation.reduce((sum, v) => sum + parseInt(v.invalid_count, 10), 0);

      // Check coverage
      const coverageResult = await db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS with_embedding
        FROM knowledge_base
        WHERE is_active = TRUE
      `);

      const coverage = coverageResult.rows[0] as { total: string; with_embedding: string };
      const coveragePercent =
        parseInt(coverage.total, 10) > 0
          ? (parseInt(coverage.with_embedding, 10) / parseInt(coverage.total, 10)) * 100
          : 100;

      // Determine health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (totalInvalid > 0 || coveragePercent < 80) {
        status = 'critical';
      } else if (outdatedModels.length > 0 || coveragePercent < 95) {
        status = 'warning';
      }

      // Log results
      const healthReport = {
        status,
        currentModel: CURRENT_EMBEDDING_MODEL,
        distribution,
        outdatedModels: outdatedModels.length,
        invalidDimensions: totalInvalid,
        coveragePercent: Math.round(coveragePercent * 100) / 100,
        correlationId,
      };

      logger.info('Embedding health check completed', healthReport);

      // Store health check result
      await db.query(
        `
        INSERT INTO embedding_health_checks (
          check_type, target_table, status, score,
          total_checked, passed, failed, warnings,
          issues, recommendations, metrics, correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
        [
          'consistency',
          'knowledge_base',
          status,
          coveragePercent,
          parseInt(coverage.total, 10),
          parseInt(coverage.with_embedding, 10),
          totalInvalid,
          outdatedModels.length,
          JSON.stringify(
            outdatedModels.map((m) => ({
              type: 'warning',
              code: 'OUTDATED_MODEL',
              message: `${m.entry_count} entries using outdated model ${m.model}`,
            }))
          ),
          JSON.stringify(
            outdatedModels.length > 0
              ? [
                  {
                    priority: 'medium',
                    action: 'Create migration job for outdated models',
                    reason: 'Keep embeddings on current model for best quality',
                  },
                ]
              : []
          ),
          JSON.stringify(healthReport),
          correlationId,
        ]
      );

      await emitMigrationEvent(eventStore, 'embedding.health.checked', healthReport);

      // Alert on critical issues
      if (status === 'critical') {
        logger.error('Critical embedding health issues detected', healthReport);
      }

      return { success: true, ...healthReport };
    } catch (error) {
      logger.error('Health check failed', { error, correlationId });
      return { success: false, error: String(error) };
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

// ============================================================================
// ON-DEMAND TASK: Get Migration Status
// ============================================================================

/**
 * Get status of all migration jobs
 */
export const getMigrationStatus = task({
  id: 'get-embedding-migration-status',
  run: async (): Promise<{
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    jobs: MigrationJobRow[];
    modelDistribution: { model: string; entryCount: number; percentage: number }[];
  }> => {
    const { db } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    try {
      // Get job counts
      const countsResult = await db.query<{ status: string; count: string }>(`
        SELECT status, COUNT(*) AS count
        FROM embedding_migration_jobs
        GROUP BY status
      `);

      const counts = countsResult.rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {});

      // Get recent jobs
      const jobsResult = await db.query<MigrationJobRow>(`
        SELECT * FROM embedding_migration_jobs
        ORDER BY created_at DESC
        LIMIT 20
      `);

      // Get model distribution
      const distributionResult = await db.query<{
        model: string;
        entry_count: string;
        percentage: string;
      }>(`SELECT * FROM get_embedding_model_distribution('knowledge_base')`);

      return {
        activeJobs: (counts.pending ?? 0) + (counts.running ?? 0),
        completedJobs: counts.completed ?? 0,
        failedJobs: counts.failed ?? 0,
        jobs: jobsResult.rows,
        modelDistribution: distributionResult.rows.map((r) => ({
          model: r.model,
          entryCount: parseInt(r.entry_count, 10),
          percentage: parseFloat(r.percentage),
        })),
      };
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});
