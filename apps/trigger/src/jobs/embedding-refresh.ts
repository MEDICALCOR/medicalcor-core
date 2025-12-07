import { schedules, logger } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import { createEmbeddingService, getOpenAIApiKey } from '@medicalcor/integrations';
import { processEmbeddingEvents } from '../tasks/embedding-worker.js';

/**
 * Embedding Refresh Job
 *
 * Weekly job that:
 * 1. Finds entries with outdated embedding models
 * 2. Regenerates embeddings with the current model
 * 3. Updates the database with new embeddings
 *
 * Uses the database functions:
 * - find_outdated_embeddings(current_model, limit)
 * - batch_update_embeddings(updates_json)
 *
 * @module @medicalcor/trigger/jobs/embedding-refresh
 */

// ============================================================================
// TYPES
// ============================================================================

interface OutdatedEmbeddingEntry {
  id: string;
  content: string;
  embedding_model: string | null;
  updated_at: Date;
}

interface EmbeddingModelStats {
  embedding_model: string;
  /** PostgreSQL BIGINT - returned as string by pg driver */
  entry_count: string;
  /** PostgreSQL BIGINT - returned as string by pg driver */
  with_embedding: string;
  /** PostgreSQL BIGINT - returned as string by pg driver */
  without_embedding: string;
  oldest_updated: Date;
  newest_updated: Date;
}

interface RefreshResult {
  success: boolean;
  entriesProcessed: number;
  errors: number;
  currentModel: string;
  durationMs: number;
  correlationId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current embedding model used for new embeddings */
const CURRENT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Maximum entries to process per job run */
const MAX_ENTRIES_PER_RUN = 500;

/** Batch size for embedding generation */
const EMBEDDING_BATCH_SIZE = 50;

/** Batch size for database updates */
const DB_BATCH_SIZE = 100;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCorrelationId(): string {
  return `emb_refresh_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'embedding-refresh', connectionString: databaseUrl })
    : createInMemoryEventStore('embedding-refresh');

  return { db, eventStore };
}

/**
 * Find entries with outdated embedding models
 */
async function findOutdatedEmbeddings(
  db: DatabasePool,
  currentModel: string,
  limit: number
): Promise<OutdatedEmbeddingEntry[]> {
  const result = await db.query<OutdatedEmbeddingEntry>(
    'SELECT * FROM find_outdated_embeddings($1, $2)',
    [currentModel, limit]
  );
  return result.rows;
}

/**
 * Get embedding model statistics
 */
async function getEmbeddingModelStats(db: DatabasePool): Promise<EmbeddingModelStats[]> {
  const result = await db.query<EmbeddingModelStats>('SELECT * FROM get_embedding_model_stats()');
  return result.rows;
}

/**
 * Batch update embeddings in the database
 */
async function batchUpdateEmbeddings(
  db: DatabasePool,
  updates: { id: string; embedding: number[]; model: string }[]
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  // Convert to JSON format expected by the database function
  const updatesJson = updates.map((u) => ({
    id: u.id,
    embedding: `[${u.embedding.join(',')}]`,
    model: u.model,
  }));

  const result = await db.query<{ batch_update_embeddings: number }>(
    'SELECT batch_update_embeddings($1::jsonb)',
    [JSON.stringify(updatesJson)]
  );

  return result.rows[0]?.batch_update_embeddings ?? 0;
}

/**
 * Process entries in batches with exponential backoff retry
 */
async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number
): Promise<{ successes: number; errors: { item: T; error: unknown }[] }> {
  let successes = 0;
  const errors: { item: T; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const results = await Promise.allSettled(batch.map(processor));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result?.status === 'fulfilled') {
        successes++;
      } else if (result?.status === 'rejected') {
        errors.push({ item: batch[j] as T, error: result.reason });
      }
    }
  }

  return { successes, errors };
}

/**
 * Emit job completion event
 */
async function emitJobEvent(
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
      aggregateType: 'embedding',
    });
  } catch (error) {
    logger.warn('Failed to emit job event', { type, error });
  }
}

// ============================================================================
// CRON JOB: Weekly Embedding Refresh
// ============================================================================

/**
 * Weekly embedding refresh job
 *
 * Finds knowledge base entries with outdated embedding models
 * and regenerates their embeddings with the current model.
 *
 * Runs every Sunday at 3:30 AM to avoid peak hours.
 */
export const weeklyEmbeddingRefresh = schedules.task({
  id: 'weekly-embedding-refresh',
  cron: '30 3 * * 0', // 3:30 AM every Sunday
  run: async (): Promise<RefreshResult> => {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    logger.info('Starting weekly embedding refresh', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping embedding refresh', { correlationId });
      return {
        success: false,
        entriesProcessed: 0,
        errors: 0,
        currentModel: CURRENT_EMBEDDING_MODEL,
        durationMs: 0,
        correlationId,
      };
    }

    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      logger.warn('OpenAI API key not configured, skipping embedding refresh', { correlationId });
      return {
        success: false,
        entriesProcessed: 0,
        errors: 0,
        currentModel: CURRENT_EMBEDDING_MODEL,
        durationMs: 0,
        correlationId,
      };
    }

    let entriesProcessed = 0;
    let errors = 0;

    try {
      // Get current stats for logging
      const stats = await getEmbeddingModelStats(db);
      logger.info('Embedding model statistics', {
        stats: stats.map((s) => ({
          model: s.embedding_model,
          total: s.entry_count,
          withEmbedding: s.with_embedding,
          withoutEmbedding: s.without_embedding,
        })),
        correlationId,
      });

      // Find outdated entries
      const outdatedEntries = await findOutdatedEmbeddings(
        db,
        CURRENT_EMBEDDING_MODEL,
        MAX_ENTRIES_PER_RUN
      );

      if (outdatedEntries.length === 0) {
        logger.info('No outdated embeddings found', { correlationId });
        await emitJobEvent(eventStore, 'embedding.refresh.completed', {
          entriesProcessed: 0,
          errors: 0,
          currentModel: CURRENT_EMBEDDING_MODEL,
          correlationId,
        });
        return {
          success: true,
          entriesProcessed: 0,
          errors: 0,
          currentModel: CURRENT_EMBEDDING_MODEL,
          durationMs: Date.now() - startTime,
          correlationId,
        };
      }

      logger.info(`Found ${outdatedEntries.length} entries with outdated embeddings`, {
        correlationId,
      });

      // Create embedding service
      const embeddingService = createEmbeddingService({
        apiKey: openaiKey,
        model: CURRENT_EMBEDDING_MODEL,
      });

      // Process in batches to avoid overwhelming the API
      const pendingUpdates: { id: string; embedding: number[]; model: string }[] = [];

      const batchResult = await processBatch(
        outdatedEntries,
        async (entry) => {
          try {
            const result = await embeddingService.embed(entry.content);
            pendingUpdates.push({
              id: entry.id,
              embedding: result.embedding,
              model: CURRENT_EMBEDDING_MODEL,
            });
          } catch (error) {
            logger.warn('Failed to generate embedding for entry', {
              entryId: entry.id,
              error,
              correlationId,
            });
            throw error;
          }
        },
        EMBEDDING_BATCH_SIZE
      );

      // Update database with new embeddings
      if (pendingUpdates.length > 0) {
        // Process database updates in batches
        for (let i = 0; i < pendingUpdates.length; i += DB_BATCH_SIZE) {
          const batch = pendingUpdates.slice(i, i + DB_BATCH_SIZE);
          const updated = await batchUpdateEmbeddings(db, batch);
          entriesProcessed += updated;

          logger.info(`Updated batch ${Math.floor(i / DB_BATCH_SIZE) + 1}`, {
            batchSize: batch.length,
            updated,
            correlationId,
          });
        }
      }

      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        logger.error('Failed to refresh embedding', {
          entryId: item.id,
          oldModel: item.embedding_model,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'embedding.refresh.completed', {
        entriesProcessed,
        errors,
        currentModel: CURRENT_EMBEDDING_MODEL,
        totalOutdated: outdatedEntries.length,
        durationMs: Date.now() - startTime,
        correlationId,
      });

      logger.info('Weekly embedding refresh completed', {
        entriesProcessed,
        errors,
        durationMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: true,
        entriesProcessed,
        errors,
        currentModel: CURRENT_EMBEDDING_MODEL,
        durationMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error('Weekly embedding refresh failed', { error, correlationId, durationMs });

      await emitJobEvent(eventStore, 'embedding.refresh.failed', {
        error: error instanceof Error ? error.message : String(error),
        correlationId,
        durationMs,
      });

      return {
        success: false,
        entriesProcessed,
        errors: errors + 1,
        currentModel: CURRENT_EMBEDDING_MODEL,
        durationMs,
        correlationId,
      };
    } finally {
      // Close database connection
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

// ============================================================================
// CRON JOB: Daily Embedding Stats
// ============================================================================

/**
 * Daily embedding statistics job
 *
 * Collects and logs embedding model statistics for monitoring.
 * Runs daily at 6:00 AM.
 */
export const dailyEmbeddingStats = schedules.task({
  id: 'daily-embedding-stats',
  cron: '0 6 * * *', // 6:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting daily embedding stats collection', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping embedding stats', { correlationId });
      return { success: false, reason: 'Database not configured' };
    }

    try {
      const stats = await getEmbeddingModelStats(db);

      // Calculate totals (PostgreSQL BIGINT comes as string from pg driver)
      const totalEntries = stats.reduce((sum, s) => sum + parseInt(s.entry_count, 10), 0);
      const totalWithEmbedding = stats.reduce((sum, s) => sum + parseInt(s.with_embedding, 10), 0);
      const totalWithoutEmbedding = stats.reduce(
        (sum, s) => sum + parseInt(s.without_embedding, 10),
        0
      );

      // Find outdated entries count
      const currentModelStats = stats.find((s) => s.embedding_model === CURRENT_EMBEDDING_MODEL);
      const currentModelWithEmbedding = currentModelStats
        ? parseInt(currentModelStats.with_embedding, 10)
        : 0;
      const outdatedCount = totalWithEmbedding - currentModelWithEmbedding;

      const metrics = {
        totalEntries,
        totalWithEmbedding,
        totalWithoutEmbedding,
        currentModel: CURRENT_EMBEDDING_MODEL,
        currentModelCount: currentModelWithEmbedding,
        outdatedCount,
        embeddingCoverage: totalEntries > 0 ? totalWithEmbedding / totalEntries : 0,
        modelBreakdown: stats.map((s) => ({
          model: s.embedding_model,
          count: parseInt(s.entry_count, 10),
          withEmbedding: parseInt(s.with_embedding, 10),
        })),
      };

      logger.info('Embedding statistics collected', { ...metrics, correlationId });

      // Emit stats event for monitoring/alerting
      await emitJobEvent(eventStore, 'embedding.stats.collected', {
        ...metrics,
        correlationId,
      });

      // Alert if there are many outdated embeddings
      if (outdatedCount > 1000) {
        logger.warn('High number of outdated embeddings detected', {
          outdatedCount,
          threshold: 1000,
          correlationId,
        });
      }

      // Alert if embedding coverage is low
      if (metrics.embeddingCoverage < 0.95 && totalEntries > 100) {
        logger.warn('Low embedding coverage detected', {
          coverage: metrics.embeddingCoverage,
          threshold: 0.95,
          correlationId,
        });
      }

      return { success: true, metrics };
    } catch (error) {
      logger.error('Daily embedding stats collection failed', { error, correlationId });
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
// CRON JOB: Domain Event Embedding Processor
// ============================================================================

/**
 * Scheduled job to process domain events for embedding generation
 *
 * Runs every 5 minutes to process new domain events (messages, knowledge base
 * updates, voice transcriptions) and generate their embeddings.
 *
 * This ensures the async embedding pipeline stays current without
 * overwhelming the API during peak hours.
 */
export const scheduledEmbeddingEventProcessor = schedules.task({
  id: 'scheduled-embedding-event-processor',
  cron: '*/5 * * * *', // Every 5 minutes
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting scheduled embedding event processor', { correlationId });

    try {
      // Trigger the embedding events processor task
      const handle = await processEmbeddingEvents.trigger({
        limit: 100,
        correlationId,
      });

      logger.info('Embedding event processor triggered', {
        taskId: handle.id,
        correlationId,
      });

      return {
        success: true,
        taskId: handle.id,
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to trigger embedding event processor', {
        error,
        correlationId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      };
    }
  },
});

// ============================================================================
// CRON JOB: Stale Embedding Cleanup
// ============================================================================

/**
 * Daily job to identify and re-process stale embeddings
 *
 * Finds content that may have been missed or failed during initial processing
 * and queues them for re-embedding.
 *
 * Runs daily at 4:00 AM to avoid peak hours.
 */
export const dailyStaleEmbeddingCleanup = schedules.task({
  id: 'daily-stale-embedding-cleanup',
  cron: '0 4 * * *', // 4:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting daily stale embedding cleanup', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping stale embedding cleanup', { correlationId });
      return { success: false, reason: 'Database not configured' };
    }

    try {
      // Find knowledge base entries without embeddings
      const missingKbEmbeddings = await db.query<{ id: string; content: string }>(
        `
        SELECT id, content
        FROM knowledge_base
        WHERE embedding IS NULL
          AND content IS NOT NULL
          AND LENGTH(content) >= 10
        ORDER BY created_at DESC
        LIMIT 200
        `
      );

      // Find message embeddings without vectors
      const missingMsgEmbeddings = await db.query<{ id: string; content_sanitized: string }>(
        `
        SELECT id, content_sanitized
        FROM message_embeddings
        WHERE embedding IS NULL
          AND content_sanitized IS NOT NULL
          AND LENGTH(content_sanitized) >= 10
        ORDER BY created_at DESC
        LIMIT 200
        `
      );

      const kbCount = missingKbEmbeddings.rows.length;
      const msgCount = missingMsgEmbeddings.rows.length;

      logger.info('Found content without embeddings', {
        knowledgeBaseEntries: kbCount,
        messageEntries: msgCount,
        correlationId,
      });

      if (kbCount === 0 && msgCount === 0) {
        logger.info('No stale embeddings found', { correlationId });
        return {
          success: true,
          knowledgeBaseRequeued: 0,
          messagesRequeued: 0,
          correlationId,
        };
      }

      // Trigger batch re-embedding if we have stale entries
      if (kbCount > 0 || msgCount > 0) {
        const handle = await processEmbeddingEvents.trigger({
          limit: 200,
          correlationId: `${correlationId}_stale_cleanup`,
        });

        logger.info('Triggered embedding processor for stale content', {
          taskId: handle.id,
          knowledgeBaseEntries: kbCount,
          messageEntries: msgCount,
          correlationId,
        });
      }

      // Emit event for monitoring
      await emitJobEvent(eventStore, 'embedding.stale.cleanup', {
        knowledgeBaseEntries: kbCount,
        messageEntries: msgCount,
        correlationId,
      });

      return {
        success: true,
        knowledgeBaseRequeued: kbCount,
        messagesRequeued: msgCount,
        correlationId,
      };
    } catch (error) {
      logger.error('Daily stale embedding cleanup failed', { error, correlationId });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
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
