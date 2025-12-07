import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import * as crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import {
  createEmbeddingService,
  getOpenAIApiKey,
  createEmbeddingCache,
  createCachedEmbeddingService,
  type RedisClient,
} from '@medicalcor/integrations';

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
  results: {
    contentId: string;
    success: boolean;
    error?: string;
  }[];
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

/**
 * Create a Redis client from URL
 * Uses dynamic import to avoid bundle issues
 */
async function createRedisClient(url: string): Promise<RedisClient | null> {
  try {
    // Dynamic import for optional Redis dependency
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ioredis: { default: new (url: string) => RedisClient } = await import('ioredis');
    const client = new ioredis.default(url);
    return client;
  } catch {
    logger.warn('Redis client not available, caching disabled');
    return null;
  }
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'embedding-worker', connectionString: databaseUrl })
    : createInMemoryEventStore('embedding-worker');

  return { db, eventStore };
}

/**
 * Get a cached embedding service if Redis is available
 * Falls back to direct service if not
 */
async function getCachedEmbeddingService(openaiKey: string) {
  const baseService = createEmbeddingService({
    apiKey: openaiKey,
    model: EMBEDDING_MODEL,
  });

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      embed: async (text: string) => {
        const result = await baseService.embed(text);
        return result;
      },
      embedBatch: async (inputs: { text: string; id?: string }[]) => {
        const result = await baseService.embedBatch(inputs);
        return result;
      },
      isCached: false,
    };
  }

  const redis = await createRedisClient(redisUrl);
  if (!redis) {
    return {
      embed: async (text: string) => {
        const result = await baseService.embed(text);
        return result;
      },
      embedBatch: async (inputs: { text: string; id?: string }[]) => {
        const result = await baseService.embedBatch(inputs);
        return result;
      },
      isCached: false,
    };
  }

  const cache = createEmbeddingCache(redis, { ttlSeconds: 86400 * 7 }); // 7 days
  const cachedService = createCachedEmbeddingService({
    cache,
    embedFn: async (text: string) => {
      const result = await baseService.embed(text);
      return result.embedding;
    },
    embedBatchFn: async (texts: string[]) => {
      const result = await baseService.embedBatch(texts.map((text) => ({ text })));
      return result.embeddings.map((e) => e.embedding);
    },
    model: EMBEDDING_MODEL,
  });

  return {
    embed: async (text: string) => {
      const embedding = await cachedService.embed(text);
      return {
        embedding,
        contentHash: hashContent(text),
        model: EMBEDDING_MODEL,
        dimensions: embedding.length,
        tokensUsed: Math.ceil(text.length / 4), // Approximate
      };
    },
    embedBatch: async (inputs: { text: string; id?: string }[]) => {
      const embeddings = await cachedService.embedBatch(inputs.map((i) => i.text));
      return {
        embeddings: embeddings.map((embedding, idx) => ({
          embedding,
          contentHash: hashContent(inputs[idx]?.text ?? ''),
          model: EMBEDDING_MODEL,
          dimensions: embedding.length,
          tokensUsed: Math.ceil((inputs[idx]?.text ?? '').length / 4),
        })),
        totalTokensUsed: inputs.reduce((sum, i) => sum + Math.ceil(i.text.length / 4), 0),
        processingTimeMs: 0, // Not tracked in cached version
      };
    },
    isCached: true,
    getStats: () => cachedService.getStats(),
  };
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(contentId)
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(contentId)
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
    const correlationId =
      typeof payload.correlationId === 'string' ? payload.correlationId : crypto.randomUUID();
    await eventStore.emit({
      type,
      correlationId,
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

    // Create cached embedding service (uses Redis cache if available)
    const embeddingService = await getCachedEmbeddingService(openaiKey);

    try {
      // Generate embedding (with cache support)
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

    // Create cached embedding service (uses Redis cache if available)
    const embeddingService = await getCachedEmbeddingService(openaiKey);

    const results: BatchEmbeddingResult['results'] = [];
    let totalTokensUsed = 0;
    let successfulItems = 0;
    let failedItems = 0;

    try {
      // Generate embeddings in batch (with cache support)
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
// TYPES FOR DOMAIN EVENT PROCESSING
// ============================================================================

/** Events that should trigger embedding generation */
const EMBEDDABLE_EVENT_TYPES = [
  'whatsapp.message.received',
  'lead.message_received',
  'knowledge_base.created',
  'knowledge_base.updated',
  'voice.transcription.completed',
] as const;

// Using const assertion above, type can be inferred where needed

/** Domain event from the event store */
interface StoredDomainEvent {
  id: string;
  type: string;
  correlation_id: string;
  aggregate_id: string | null;
  aggregate_type: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
  processed_for_embedding?: boolean;
}

/** Result of processing domain events */
interface DomainEventProcessingResult {
  success: boolean;
  eventsProcessed: number;
  embeddingsGenerated: number;
  errors: number;
  processingTimeMs: number;
  correlationId: string;
}

/** Payload for the domain event processor task */
export const ProcessEmbeddingEventsPayloadSchema = z.object({
  /** Maximum number of events to process per run */
  limit: z.number().min(1).max(500).default(100),
  /** Only process events of specific types (optional) */
  eventTypes: z.array(z.string()).optional(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

export type ProcessEmbeddingEventsPayload = z.infer<typeof ProcessEmbeddingEventsPayloadSchema>;

// ============================================================================
// HELPER: Extract embeddable content from domain events
// ============================================================================

/**
 * Extract content and metadata from a domain event for embedding
 */
function extractEmbeddableContent(event: StoredDomainEvent): {
  contentId: string;
  content: string;
  targetType: EmbeddingTargetType;
  metadata: EmbedContentPayload['metadata'];
} | null {
  const payload = event.payload;

  // Helper to safely extract string from unknown
  const getString = (key: string): string | undefined => {
    const val = payload[key];
    return typeof val === 'string' ? val : undefined;
  };

  const getStringArray = (key: string): string[] | undefined => {
    const val = payload[key];
    return Array.isArray(val) ? (val as string[]) : undefined;
  };

  switch (event.type) {
    case 'whatsapp.message.received':
    case 'lead.message_received': {
      const textContent = getString('content') ?? getString('messagePreview');
      if (!textContent || textContent.length < 10) {
        return null;
      }

      return {
        contentId: getString('messageId') ?? event.id,
        content: textContent,
        targetType: 'message',
        metadata: {
          phone: getString('phone') ?? getString('from'),
          direction: (getString('direction') as 'IN' | 'OUT' | undefined) ?? 'IN',
          language: (getString('language') as 'ro' | 'en' | 'de' | undefined) ?? 'ro',
        },
      };
    }

    case 'knowledge_base.created':
    case 'knowledge_base.updated': {
      const content = getString('content');
      if (!content || content.length < 10) {
        return null;
      }

      return {
        contentId: getString('id') ?? event.aggregate_id ?? event.id,
        content,
        targetType: 'knowledge_base',
        metadata: {
          title: getString('title'),
          sourceType: getString('sourceType'),
          clinicId: getString('clinicId'),
          language: (getString('language') as 'ro' | 'en' | 'de' | undefined) ?? 'ro',
          tags: getStringArray('tags'),
        },
      };
    }

    case 'voice.transcription.completed': {
      const transcript = getString('transcript');
      if (!transcript || transcript.length < 20) {
        return null;
      }

      return {
        contentId: getString('callId') ?? event.id,
        content: transcript,
        targetType: 'message',
        metadata: {
          phone: getString('phone'),
          direction: 'IN',
          language: (getString('language') as 'ro' | 'en' | 'de' | undefined) ?? 'ro',
        },
      };
    }

    default:
      return null;
  }
}

// ============================================================================
// TASK: Process Domain Events for Embedding
// ============================================================================

/**
 * Process pending domain events and generate embeddings
 *
 * This task:
 * 1. Fetches unprocessed domain events that may need embedding
 * 2. Extracts content from each event
 * 3. Generates embeddings and stores them
 * 4. Marks events as processed
 *
 * Use this task to wire domain events to the embedding pipeline.
 */
export const processEmbeddingEvents = task({
  id: 'process-embedding-events',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: ProcessEmbeddingEventsPayload): Promise<DomainEventProcessingResult> => {
    const startTime = Date.now();
    const { limit, eventTypes, correlationId } = payload;

    logger.info('Starting domain event processing for embeddings', {
      limit,
      eventTypes: eventTypes ?? EMBEDDABLE_EVENT_TYPES,
      correlationId,
    });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping event processing', { correlationId });
      return {
        success: false,
        eventsProcessed: 0,
        embeddingsGenerated: 0,
        errors: 0,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    }

    const openaiKey = getOpenAIApiKey();
    if (!openaiKey) {
      logger.warn('OpenAI API key not configured', { correlationId });
      return {
        success: false,
        eventsProcessed: 0,
        embeddingsGenerated: 0,
        errors: 0,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    }

    let eventsProcessed = 0;
    let embeddingsGenerated = 0;
    let errors = 0;

    try {
      // Fetch unprocessed domain events
      const typesToProcess = eventTypes ?? [...EMBEDDABLE_EVENT_TYPES];
      const placeholders = typesToProcess.map((_, i) => `$${i + 1}`).join(', ');

      const eventsResult = await db.query<StoredDomainEvent>(
        `
        SELECT id, type, correlation_id, aggregate_id, aggregate_type, payload, created_at
        FROM domain_events
        WHERE type IN (${placeholders})
          AND (metadata->>'processed_for_embedding')::boolean IS NOT TRUE
        ORDER BY created_at ASC
        LIMIT $${typesToProcess.length + 1}
        `,
        [...typesToProcess, limit]
      );

      const events = eventsResult.rows;

      if (events.length === 0) {
        logger.info('No pending events to process for embedding', { correlationId });
        return {
          success: true,
          eventsProcessed: 0,
          embeddingsGenerated: 0,
          errors: 0,
          processingTimeMs: Date.now() - startTime,
          correlationId,
        };
      }

      logger.info(`Found ${events.length} events to process`, { correlationId });

      // Create cached embedding service (uses Redis cache if available)
      const embeddingService = await getCachedEmbeddingService(openaiKey);

      // Process each event
      for (const event of events) {
        eventsProcessed++;

        try {
          const embeddable = extractEmbeddableContent(event);

          if (!embeddable) {
            logger.debug('Event does not contain embeddable content', {
              eventId: event.id,
              eventType: event.type,
              correlationId,
            });
            // Mark as processed even if no embedding generated
            await markEventProcessed(db, event.id);
            continue;
          }

          // Generate embedding
          const result = await embeddingService.embed(embeddable.content);

          // Store based on target type
          if (embeddable.targetType === 'knowledge_base') {
            await storeKnowledgeBaseEmbedding(
              db,
              embeddable.contentId,
              embeddable.content,
              result.embedding,
              result.model,
              embeddable.metadata
            );
          } else if (embeddable.targetType === 'message') {
            await storeMessageEmbedding(
              db,
              embeddable.contentId,
              embeddable.content,
              result.embedding,
              result.model,
              embeddable.metadata,
              event.correlation_id
            );
          }

          // Mark event as processed
          await markEventProcessed(db, event.id);
          embeddingsGenerated++;

          logger.debug('Embedding generated for event', {
            eventId: event.id,
            eventType: event.type,
            contentId: embeddable.contentId,
            dimensions: result.dimensions,
            correlationId,
          });
        } catch (error) {
          errors++;
          logger.error('Failed to process event for embedding', {
            eventId: event.id,
            eventType: event.type,
            error,
            correlationId,
          });
        }
      }

      // Emit completion event
      await emitEmbeddingEvent(eventStore, 'embedding.events.processed', {
        eventsProcessed,
        embeddingsGenerated,
        errors,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      logger.info('Domain event processing completed', {
        eventsProcessed,
        embeddingsGenerated,
        errors,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: errors === 0,
        eventsProcessed,
        embeddingsGenerated,
        errors,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Domain event processing failed', { error, correlationId });

      await emitEmbeddingEvent(eventStore, 'embedding.events.failed', {
        error: error instanceof Error ? error.message : String(error),
        eventsProcessed,
        embeddingsGenerated,
        errors,
        correlationId,
      });

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

/**
 * Mark a domain event as processed for embedding
 */
async function markEventProcessed(db: DatabasePool, eventId: string): Promise<void> {
  await db.query(
    `
    UPDATE domain_events
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"processed_for_embedding": true}'::jsonb
    WHERE id = $1
    `,
    [eventId]
  );
}

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
        }>(
          'SELECT content, title, source_type, clinic_id, language, tags FROM knowledge_base WHERE id = $1',
          [contentId]
        );
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
        }>(
          'SELECT content_sanitized, phone, direction, language FROM message_embeddings WHERE id = $1',
          [contentId]
        );
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

      // Generate new embedding (with cache support)
      const embeddingService = await getCachedEmbeddingService(openaiKey);
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
