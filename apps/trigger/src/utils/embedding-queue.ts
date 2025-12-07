/**
 * Embedding Queue Utilities
 *
 * Helper functions to queue embeddings asynchronously from API routes.
 * This prevents the 350-750ms blocking that occurs with synchronous embeddings.
 *
 * Usage:
 * ```typescript
 * import { queueEmbedding, queueBatchEmbeddings, EmbeddingIdempotencyKeys } from '@medicalcor/trigger/utils/embedding-queue';
 *
 * // In your API route
 * fastify.post('/webhook/message', async (request, reply) => {
 *   const { messageId, content, phone } = request.body;
 *
 *   // Queue embedding asynchronously (returns immediately)
 *   await queueEmbedding({
 *     contentId: messageId,
 *     content,
 *     targetType: 'message',
 *     metadata: { phone, direction: 'IN' },
 *     correlationId: request.id,
 *   });
 *
 *   // Return response immediately without waiting for embedding
 *   return reply.send({ success: true });
 * });
 * ```
 *
 * @module @medicalcor/trigger/utils/embedding-queue
 */

import { tasks } from '@trigger.dev/sdk/v3';
import { createHash } from 'crypto';

/**
 * Payload for queueing a single embedding
 */
export interface QueueEmbeddingPayload {
  /** Unique ID for the content */
  contentId: string;
  /** The content to embed */
  content: string;
  /** Target type for storage */
  targetType: 'knowledge_base' | 'message' | 'custom';
  /** Optional metadata */
  metadata?: {
    title?: string;
    sourceType?: string;
    clinicId?: string;
    language?: 'ro' | 'en' | 'de';
    tags?: string[];
    phone?: string;
    direction?: 'IN' | 'OUT';
  };
  /** Correlation ID for tracing */
  correlationId: string;
  /** Whether to store in database (default: true) */
  storeInDatabase?: boolean;
}

/**
 * Result from queueing an embedding
 */
export interface QueueResult {
  /** Task run ID */
  taskId: string;
  /** Whether the task was triggered successfully */
  queued: boolean;
  /** Idempotency key used */
  idempotencyKey: string;
}

/**
 * Idempotency key generators for embedding tasks
 */
export const EmbeddingIdempotencyKeys = {
  /**
   * Generate idempotency key for message embedding
   */
  message: (messageId: string, contentHash: string): string => {
    return `embed-msg-${messageId}-${contentHash.slice(0, 16)}`;
  },

  /**
   * Generate idempotency key for knowledge base embedding
   */
  knowledgeBase: (entryId: string, contentHash: string): string => {
    return `embed-kb-${entryId}-${contentHash.slice(0, 16)}`;
  },

  /**
   * Generate idempotency key for batch embedding
   */
  batch: (batchId: string): string => {
    return `embed-batch-${batchId}`;
  },

  /**
   * Generate idempotency key for episode embedding
   */
  episode: (episodeId: string): string => {
    return `embed-episode-${episodeId}`;
  },

  /**
   * Generate idempotency key for custom content
   */
  custom: (contentId: string, contentHash: string): string => {
    return `embed-custom-${contentId}-${contentHash.slice(0, 16)}`;
  },
};

/**
 * Hash content for idempotency key generation
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Queue a single embedding asynchronously
 *
 * This function returns immediately after triggering the background task.
 * The embedding will be generated and stored by the Trigger.dev worker.
 *
 * @example
 * ```typescript
 * // Queue embedding for a message
 * const result = await queueEmbedding({
 *   contentId: 'msg-123',
 *   content: 'Patient message about dental implants',
 *   targetType: 'message',
 *   metadata: { phone: '+40712345678', direction: 'IN' },
 *   correlationId: 'req-456',
 * });
 *
 * console.log(result.taskId); // 'run_xxx...'
 * ```
 */
export async function queueEmbedding(payload: QueueEmbeddingPayload): Promise<QueueResult> {
  const contentHash = hashContent(payload.content);

  // Generate idempotency key based on target type
  let idempotencyKey: string;
  switch (payload.targetType) {
    case 'message':
      idempotencyKey = EmbeddingIdempotencyKeys.message(payload.contentId, contentHash);
      break;
    case 'knowledge_base':
      idempotencyKey = EmbeddingIdempotencyKeys.knowledgeBase(payload.contentId, contentHash);
      break;
    case 'custom':
    default:
      idempotencyKey = EmbeddingIdempotencyKeys.custom(payload.contentId, contentHash);
      break;
  }

  try {
    const handle = await tasks.trigger(
      'embed-content',
      {
        contentId: payload.contentId,
        content: payload.content,
        targetType: payload.targetType,
        metadata: payload.metadata,
        correlationId: payload.correlationId,
        storeInDatabase: payload.storeInDatabase ?? true,
      },
      { idempotencyKey }
    );

    return {
      taskId: handle.id,
      queued: true,
      idempotencyKey,
    };
  } catch (error) {
    // Log error but don't throw - embedding is not critical for most operations
    console.error('Failed to queue embedding:', error);
    return {
      taskId: '',
      queued: false,
      idempotencyKey,
    };
  }
}

/**
 * Payload for queueing batch embeddings
 */
export interface QueueBatchEmbeddingsPayload {
  /** Unique batch identifier */
  batchId: string;
  /** Items to embed */
  items: {
    contentId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }[];
  /** Target type for all items */
  targetType: 'knowledge_base' | 'message' | 'custom';
  /** Clinic ID for all items */
  clinicId?: string;
  /** Correlation ID for tracing */
  correlationId: string;
}

/**
 * Queue batch embeddings asynchronously
 *
 * Use this for bulk operations like importing knowledge base entries.
 *
 * @example
 * ```typescript
 * // Queue batch embedding for knowledge base entries
 * const result = await queueBatchEmbeddings({
 *   batchId: 'import-2024-01',
 *   items: [
 *     { contentId: 'kb-1', content: 'About dental implants...' },
 *     { contentId: 'kb-2', content: 'Pricing information...' },
 *   ],
 *   targetType: 'knowledge_base',
 *   clinicId: 'clinic-123',
 *   correlationId: 'import-req-789',
 * });
 * ```
 */
export async function queueBatchEmbeddings(
  payload: QueueBatchEmbeddingsPayload
): Promise<QueueResult> {
  const idempotencyKey = EmbeddingIdempotencyKeys.batch(payload.batchId);

  try {
    const handle = await tasks.trigger(
      'embed-batch',
      {
        batchId: payload.batchId,
        items: payload.items,
        targetType: payload.targetType,
        clinicId: payload.clinicId,
        correlationId: payload.correlationId,
      },
      { idempotencyKey }
    );

    return {
      taskId: handle.id,
      queued: true,
      idempotencyKey,
    };
  } catch (error) {
    console.error('Failed to queue batch embeddings:', error);
    return {
      taskId: '',
      queued: false,
      idempotencyKey,
    };
  }
}

/**
 * Queue multiple independent embeddings in parallel
 *
 * This is useful when you have multiple unrelated items to embed
 * and want to queue them all at once.
 *
 * @example
 * ```typescript
 * const results = await queueManyEmbeddings([
 *   { contentId: 'msg-1', content: 'First message', targetType: 'message', correlationId: 'req-1' },
 *   { contentId: 'msg-2', content: 'Second message', targetType: 'message', correlationId: 'req-2' },
 * ]);
 * ```
 */
export async function queueManyEmbeddings(
  payloads: QueueEmbeddingPayload[]
): Promise<QueueResult[]> {
  return Promise.all(payloads.map((payload) => queueEmbedding(payload)));
}

/**
 * Check if embedding was already queued (for debugging)
 *
 * Note: This is a best-effort check based on idempotency key pattern.
 * The actual deduplication is handled by Trigger.dev.
 */
export function generateIdempotencyKey(
  contentId: string,
  content: string,
  targetType: 'knowledge_base' | 'message' | 'custom'
): string {
  const contentHash = hashContent(content);

  switch (targetType) {
    case 'message':
      return EmbeddingIdempotencyKeys.message(contentId, contentHash);
    case 'knowledge_base':
      return EmbeddingIdempotencyKeys.knowledgeBase(contentId, contentHash);
    case 'custom':
    default:
      return EmbeddingIdempotencyKeys.custom(contentId, contentHash);
  }
}
