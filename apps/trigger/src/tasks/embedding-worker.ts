import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import * as crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import { createEmbeddingService, getOpenAIApiKey } from '@medicalcor/integrations';

/**
 * Async Embedding Worker (H5)
 *
 * Prevents API timeouts by processing embedding generation asynchronously.
 * This worker handles:
 * - Single content embedding requests
 * - Batch embedding for multiple content items
 * - Knowledge base entry embedding
 * - Message embedding for conversation history
 *
 * @module @medicalcor/trigger/tasks/embedding-worker
 */

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/** Embedding target types */
type EmbeddingTargetType = 'knowledge_base' | 'message' | 'custom';

/** Single embedding request payload schema */
export const EmbedContentPayloadSchema = z.object({
  /** Unique ID for the content (used for deduplication) */
  contentId: z.string(),
  /** The content to embed */
  content: z.string().min(1).max(32000),
  /** Type of content being embedded */
  targetType: z.enum(['knowledge_base', 'message', 'custom']).default('custom'),
  /** Optional metadata for context */
  metadata: z
    .object({
      title: z.string().optional(),
      sourceType: z.string().optional(),
      clinicId: z.string().optional(),
      language: z.enum(['ro', 'en', 'de']).optional(),
      tags: z.array(z.string()).optional(),
      phone: z.string().optional(),
      direction: z.enum(['IN', 'OUT']).optional(),
    })
    .optional(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Whether to store the embedding in the database */
  storeInDatabase: z.boolean().default(true),
  /** Optional callback URL for completion notification */
  callbackUrl: z.string().url().optional(),
});

export type EmbedContentPayload = z.infer<typeof EmbedContentPayloadSchema>;

/** Batch embedding request payload schema */
export const BatchEmbedPayloadSchema = z.object({
  /** Batch identifier */
  batchId: z.string(),
  /** Array of content items to embed */
  items: z.array(
    z.object({
      contentId: z.string(),
      content: z.string().min(1).max(32000),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  /** Type of content being embedded */
  targetType: z.enum(['knowledge_base', 'message', 'custom']).default('custom'),
  /** Clinic ID for all items (optional) */
  clinicId: z.string().optional(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

export type BatchEmbedPayload = z.infer<typeof BatchEmbedPayloadSchema>;

/** Embedding result for return */
interface EmbeddingTaskResult {
  success: boolean;
  contentId: string;
  embeddingId?: string;
  dimensions: number;
  model: string;
  tokensUsed: number;
  storedInDatabase: boolean;
  processingTimeMs: number;
  correlationId: string;
}

interface BatchEmbeddingResult {
  success: boolean;
  batchId: string;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  results: Array<{
    contentId: string;
    success: boolean;
    error?: string;
  }>;
  totalTokensUsed: number;
  processingTimeMs: number;
  correlationId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current embedding model */
const EMBEDDING_MODEL = 'text-embedding-3-small';

/** Maximum items per batch */
const MAX_BATCH_SIZE = 100;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'embedding-worker', connectionString: databaseUrl })
    : createInMemoryEventStore('embedding-worker');

  return { db, eventStore };
}

/**
 * Hash content for deduplication
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Store embedding in knowledge_base table
 */
async function storeKnowledgeBaseEmbedding(
  db: DatabasePool,
  contentId: string,
  content: string,
  embedding: number[],
  model: string,
  metadata?: EmbedContentPayload['metadata']
): Promise<string> {
  const contentHash = hashContent(content);

  const result = await db.query<{ id: string }>(
    `
    INSERT INTO knowledge_base (
      id, source_type, title, content, content_hash,
      embedding, embedding_model, clinic_id, language, tags, metadata
    ) VALUES (
      COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11
    )
    ON CONFLICT (content_hash) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      embedding_model = EXCLUDED.embedding_model,
      updated_at = NOW()
    RETURNING id
    `,
    [
      contentId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        ? contentId
        : null,
      metadata?.sourceType ?? 'custom',
      metadata?.title ?? content.slice(0, 100),
      content,
      contentHash,
      `[${embedding.join(',')}]`,
      model,
      metadata?.clinicId ?? null,
      metadata?.language ?? 'ro',
      metadata?.tags ?? [],
      JSON.stringify(metadata ?? {}),
    ]
  );

  return result.rows[0]?.id ?? contentId;
}

/**
 * Store embedding in message_embeddings table
 */
async function storeMessageEmbedding(
  db: DatabasePool,
  contentId: string,
  content: string,
  embedding: number[],
  model: string,
  metadata?: EmbedContentPayload['metadata'],
  correlationId?: string
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `
    INSERT INTO message_embeddings (
      id, phone, content_sanitized, embedding, direction,
      language, correlation_id
    ) VALUES (
      COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7
    )
    ON CONFLICT (id) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    RETURNING id
    `,
    [
      contentId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        ? contentId
        : null,
      metadata?.phone ?? 'unknown',
      content,
      `[${embedding.join(',')}]`,
      metadata?.direction ?? 'IN',
      metadata?.language ?? 'ro',
      correlationId ?? null,
    ]
  );

  return result.rows[0]?.id ?? contentId;
}

/**
 * Emit embedding completion event
 */
async function emitEmbeddingEvent(
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
  try {
    await eventStore.emit({
      type,
      correlationId: (payload.correlationId as string) ?? crypto.randomUUID(),
      payload,
      aggregateType: 'embedding',
    });
  } catch (error) {
    logger.warn('Failed to emit embedding event', { type, error });
  }
}

// ============================================================================
// TASK: Single Content Embedding
// ============================================================================

/**
 * Process a single content embedding request
 *
 * Use this task when you need to:
 * - Embed new knowledge base entries
 * - Embed incoming messages for RAG
 * - Generate embeddings for any content that would timeout in an API request
 */
export const embedContent = task({
  id: 'embed-content',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: EmbedContentPayload): Promise<EmbeddingTaskResult> => {
    const startTime = Date.now();
    const { contentId, content, targetType, metadata, correlationId, storeInDatabase } = payload;

    logger.info('Starting embedding generation', {
      contentId,
      contentLength: content.length,
      targetType,
      correlationId,
    });

    const { db, eventStore } = getClients();

    // Validate OpenAI API key
    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      logger.error('OpenAI API key not configured', { correlationId });
      throw new Error('OpenAI API key not configured');
    }

    // Create embedding service
    const embeddingService = createEmbeddingService({
      apiKey: openaiKey,
      model: EMBEDDING_MODEL,
    });

    try {
      // Generate embedding
      const result = await embeddingService.embed(content);

      logger.info('Embedding generated successfully', {
        contentId,
        dimensions: result.dimensions,
        tokensUsed: result.tokensUsed,
        correlationId,
      });

      let embeddingId = contentId;

      // Store in database if requested
      if (storeInDatabase && db) {
        try {
          if (targetType === 'knowledge_base') {
            embeddingId = await storeKnowledgeBaseEmbedding(
              db,
              contentId,
              content,
              result.embedding,
              result.model,
              metadata
            );
          } else if (targetType === 'message') {
            embeddingId = await storeMessageEmbedding(
              db,
              contentId,
              content,
              result.embedding,
              result.model,
              metadata,
              correlationId
            );
          }

          logger.info('Embedding stored in database', {
            embeddingId,
            targetType,
            correlationId,
          });
        } catch (dbError) {
          logger.error('Failed to store embedding in database', {
            contentId,
            targetType,
            error: dbError,
            correlationId,
          });
          // Don't fail the task - embedding was generated successfully
        }
      }

      // Emit completion event
      await emitEmbeddingEvent(eventStore, 'embedding.generated', {
        contentId,
        embeddingId,
        targetType,
        dimensions: result.dimensions,
        tokensUsed: result.tokensUsed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      const taskResult: EmbeddingTaskResult = {
        success: true,
        contentId,
        embeddingId,
        dimensions: result.dimensions,
        model: result.model,
        tokensUsed: result.tokensUsed,
        storedInDatabase: storeInDatabase && !!db,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };

      return taskResult;
    } catch (error) {
      logger.error('Embedding generation failed', {
        contentId,
        error,
        correlationId,
      });

      await emitEmbeddingEvent(eventStore, 'embedding.failed', {
        contentId,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      throw error;
    } finally {
      if (db) {
        try {
          await db.end();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  },
});

// ============================================================================
// TASK: Batch Content Embedding
// ============================================================================

/**
 * Process multiple content items for embedding
 *
 * Use this task for:
 * - Bulk knowledge base imports
 * - Processing conversation history
 * - Any batch embedding operation
 */
export const embedBatch = task({
  id: 'embed-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: BatchEmbedPayload): Promise<BatchEmbeddingResult> => {
    const startTime = Date.now();
    const { batchId, items, targetType, clinicId, correlationId } = payload;

    logger.info('Starting batch embedding', {
      batchId,
      itemCount: items.length,
      targetType,
      correlationId,
    });

    // Validate batch size
    if (items.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    const { db, eventStore } = getClients();

    // Validate OpenAI API key
    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create embedding service
    const embeddingService = createEmbeddingService({
      apiKey: openaiKey,
      model: EMBEDDING_MODEL,
    });

    const results: BatchEmbeddingResult['results'] = [];
    let totalTokensUsed = 0;
    let successfulItems = 0;
    let failedItems = 0;

    try {
      // Generate embeddings in batch
      const batchResult = await embeddingService.embedBatch(
        items.map((item) => ({ text: item.content, id: item.contentId }))
      );

      totalTokensUsed = batchResult.totalTokensUsed;

      // Process each result
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const embedding = batchResult.embeddings[i];

        if (!item) continue;

        if (embedding) {
          try {
            // Store in database based on target type
            if (db && targetType === 'knowledge_base') {
              await storeKnowledgeBaseEmbedding(
                db,
                item.contentId,
                item.content,
                embedding.embedding,
                embedding.model,
                { clinicId, ...(item.metadata as Record<string, string>) }
              );
            }

            results.push({ contentId: item.contentId, success: true });
            successfulItems++;
          } catch (storeError) {
            results.push({
              contentId: item.contentId,
              success: false,
              error: storeError instanceof Error ? storeError.message : 'Storage failed',
            });
            failedItems++;
          }
        } else {
          results.push({
            contentId: item.contentId,
            success: false,
            error: 'Embedding generation failed',
          });
          failedItems++;
        }
      }

      logger.info('Batch embedding completed', {
        batchId,
        successfulItems,
        failedItems,
        totalTokensUsed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      // Emit completion event
      await emitEmbeddingEvent(eventStore, 'embedding.batch.completed', {
        batchId,
        successfulItems,
        failedItems,
        totalTokensUsed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: failedItems === 0,
        batchId,
        totalItems: items.length,
        successfulItems,
        failedItems,
        results,
        totalTokensUsed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Batch embedding failed', {
        batchId,
        error,
        correlationId,
      });

      await emitEmbeddingEvent(eventStore, 'embedding.batch.failed', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      throw error;
    } finally {
      if (db) {
        try {
          await db.end();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  },
});

// ============================================================================
// TASK: Re-embed Outdated Content
// ============================================================================

/**
 * Re-embed content with outdated embedding models
 * Triggered on-demand to update specific entries
 */
export const reembedContent = task({
  id: 'reembed-content',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 15000,
    factor: 2,
  },
  run: async (payload: {
    contentId: string;
    targetType: EmbeddingTargetType;
    correlationId: string;
  }): Promise<EmbeddingTaskResult> => {
    const startTime = Date.now();
    const { contentId, targetType, correlationId } = payload;

    logger.info('Re-embedding content', { contentId, targetType, correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Fetch existing content
      let content: string | null = null;
      // Metadata is loaded for potential future use (logging, validation)
      let _existingMetadata: Record<string, unknown> = {};

      if (targetType === 'knowledge_base') {
        const result = await db.query<{
          content: string;
          title: string;
          source_type: string;
          clinic_id: string;
          language: string;
          tags: string[];
        }>('SELECT content, title, source_type, clinic_id, language, tags FROM knowledge_base WHERE id = $1', [
          contentId,
        ]);
        const row = result.rows[0];
        if (row) {
          content = row.content;
          _existingMetadata = {
            title: row.title,
            sourceType: row.source_type,
            clinicId: row.clinic_id,
            language: row.language,
            tags: row.tags,
          };
        }
      } else if (targetType === 'message') {
        const result = await db.query<{
          content_sanitized: string;
          phone: string;
          direction: string;
          language: string;
        }>('SELECT content_sanitized, phone, direction, language FROM message_embeddings WHERE id = $1', [
          contentId,
        ]);
        const row = result.rows[0];
        if (row) {
          content = row.content_sanitized;
          _existingMetadata = {
            phone: row.phone,
            direction: row.direction,
            language: row.language,
          };
        }
      }

      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }

      // Generate new embedding
      const embeddingService = createEmbeddingService({
        apiKey: openaiKey,
        model: EMBEDDING_MODEL,
      });

      const result = await embeddingService.embed(content);

      // Update database
      if (targetType === 'knowledge_base') {
        await db.query(
          `UPDATE knowledge_base SET embedding = $1, embedding_model = $2, updated_at = NOW() WHERE id = $3`,
          [`[${result.embedding.join(',')}]`, EMBEDDING_MODEL, contentId]
        );
      } else if (targetType === 'message') {
        await db.query(
          `UPDATE message_embeddings SET embedding = $1, updated_at = NOW() WHERE id = $2`,
          [`[${result.embedding.join(',')}]`, contentId]
        );
      }

      logger.info('Content re-embedded successfully', {
        contentId,
        targetType,
        dimensions: result.dimensions,
        correlationId,
      });

      await emitEmbeddingEvent(eventStore, 'embedding.reembedded', {
        contentId,
        targetType,
        model: EMBEDDING_MODEL,
        correlationId,
      });

      return {
        success: true,
        contentId,
        embeddingId: contentId,
        dimensions: result.dimensions,
        model: result.model,
        tokensUsed: result.tokensUsed,
        storedInDatabase: true,
        processingTimeMs: Date.now() - startTime,
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
