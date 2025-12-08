import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import * as crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import {
  embedContent,
  embedBatch,
  type EmbedContentPayload,
  type BatchEmbedPayload,
} from './embedding-worker.js';

/**
 * Embedding Event Handler (M6)
 *
 * Wires the embedding worker to domain events for automatic embedding generation.
 * This handler listens for content creation/update events and triggers the
 * appropriate embedding tasks.
 *
 * Supported Events:
 * - knowledge.entry.created - New knowledge base entry
 * - knowledge.entry.updated - Updated knowledge base entry
 * - message.received - New message for conversation history
 * - episode.created - New episodic memory from the episode builder
 * - content.batch.ready - Batch of content ready for embedding
 *
 * @module @medicalcor/trigger/tasks/embedding-event-handler
 */

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Domain event types that trigger embedding
 */
export const EmbeddingTriggerEventSchema = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('knowledge.entry.created'),
    eventId: z.string(),
    correlationId: z.string(),
    payload: z.object({
      entryId: z.string(),
      content: z.string(),
      title: z.string().optional(),
      sourceType: z.string().optional(),
      clinicId: z.string().optional(),
      language: z.enum(['ro', 'en', 'de']).optional(),
      tags: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    eventType: z.literal('knowledge.entry.updated'),
    eventId: z.string(),
    correlationId: z.string(),
    payload: z.object({
      entryId: z.string(),
      content: z.string(),
      title: z.string().optional(),
      sourceType: z.string().optional(),
      clinicId: z.string().optional(),
      language: z.enum(['ro', 'en', 'de']).optional(),
      tags: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    eventType: z.literal('message.received'),
    eventId: z.string(),
    correlationId: z.string(),
    payload: z.object({
      messageId: z.string(),
      content: z.string(),
      phone: z.string(),
      direction: z.enum(['IN', 'OUT']),
      language: z.enum(['ro', 'en', 'de']).optional(),
    }),
  }),
  z.object({
    eventType: z.literal('episode.created'),
    eventId: z.string(),
    correlationId: z.string(),
    payload: z.object({
      episodeId: z.string(),
      summary: z.string(),
      entityType: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    eventType: z.literal('content.batch.ready'),
    eventId: z.string(),
    correlationId: z.string(),
    payload: z.object({
      batchId: z.string(),
      items: z.array(
        z.object({
          contentId: z.string(),
          content: z.string(),
          metadata: z.record(z.unknown()).optional(),
        })
      ),
      targetType: z.enum(['knowledge_base', 'message', 'custom']),
      clinicId: z.string().optional(),
    }),
  }),
]);

export type EmbeddingTriggerEvent = z.infer<typeof EmbeddingTriggerEventSchema>;

/**
 * Pending embedding event from database
 */
interface PendingEmbeddingEvent {
  id: string;
  type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  created_at: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Event types that should trigger embedding */
const EMBEDDING_TRIGGER_EVENTS = [
  'knowledge.entry.created',
  'knowledge.entry.updated',
  'message.received',
  'episode.created',
  'content.batch.ready',
] as const;

/** Maximum events to process per cron run */
const MAX_EVENTS_PER_RUN = 100;

/** Batch size for processing events */
const EVENT_BATCH_SIZE = 10;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCorrelationId(): string {
  return `emb_event_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'embedding-event-handler', connectionString: databaseUrl })
    : createInMemoryEventStore('embedding-event-handler');

  return { db, eventStore };
}

/**
 * Get pending embedding events from the database
 */
async function getPendingEmbeddingEvents(
  db: DatabasePool,
  limit: number
): Promise<PendingEmbeddingEvent[]> {
  const result = await db.query<PendingEmbeddingEvent>(
    `
    SELECT id, type, aggregate_id, payload, correlation_id, timestamp as created_at
    FROM domain_events
    WHERE type = ANY($1)
      AND NOT EXISTS (
        SELECT 1 FROM embedding_event_log
        WHERE event_id = domain_events.id
      )
    ORDER BY timestamp ASC
    LIMIT $2
    `,
    [EMBEDDING_TRIGGER_EVENTS, limit]
  );
  return result.rows;
}

/**
 * Mark event as processed
 */
async function markEventProcessed(
  db: DatabasePool,
  eventId: string,
  status: 'completed' | 'failed',
  error?: string
): Promise<void> {
  await db.query(
    `
    INSERT INTO embedding_event_log (event_id, status, error, processed_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (event_id) DO UPDATE SET
      status = EXCLUDED.status,
      error = EXCLUDED.error,
      processed_at = NOW()
    `,
    [eventId, status, error ?? null]
  );
}

/**
 * Emit processing event
 */
async function emitProcessingEvent(
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
      correlationId: (payload.correlationId as string) ?? generateCorrelationId(),
      payload,
      aggregateType: 'embedding',
    });
  } catch (error) {
    logger.warn('Failed to emit processing event', { type, error });
  }
}

// ============================================================================
// TASK: Process Single Embedding Event
// ============================================================================

/**
 * Process a single embedding trigger event
 *
 * This task is triggered when a domain event requires embedding generation.
 * It dispatches to the appropriate embedding task based on event type.
 */
export const processEmbeddingEvent = task({
  id: 'process-embedding-event',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (
    event: EmbeddingTriggerEvent
  ): Promise<{
    success: boolean;
    eventType: string;
    embeddingTaskId?: string;
    error?: string;
  }> => {
    const correlationId = event.correlationId ?? generateCorrelationId();

    logger.info('Processing embedding event', {
      eventType: event.eventType,
      eventId: event.eventId,
      correlationId,
    });

    try {
      switch (event.eventType) {
        case 'knowledge.entry.created':
        case 'knowledge.entry.updated': {
          const payload: EmbedContentPayload = {
            contentId: event.payload.entryId,
            content: event.payload.content,
            targetType: 'knowledge_base',
            metadata: {
              title: event.payload.title,
              sourceType: event.payload.sourceType,
              clinicId: event.payload.clinicId,
              language: event.payload.language,
              tags: event.payload.tags,
            },
            correlationId,
            storeInDatabase: true,
          };

          // Trigger embedding task
          const handle = await embedContent.trigger(payload);

          logger.info('Triggered knowledge base embedding', {
            entryId: event.payload.entryId,
            taskId: handle.id,
            correlationId,
          });

          return {
            success: true,
            eventType: event.eventType,
            embeddingTaskId: handle.id,
          };
        }

        case 'message.received': {
          const payload: EmbedContentPayload = {
            contentId: event.payload.messageId,
            content: event.payload.content,
            targetType: 'message',
            metadata: {
              phone: event.payload.phone,
              direction: event.payload.direction,
              language: event.payload.language,
            },
            correlationId,
            storeInDatabase: true,
          };

          const handle = await embedContent.trigger(payload);

          logger.info('Triggered message embedding', {
            messageId: event.payload.messageId,
            taskId: handle.id,
            correlationId,
          });

          return {
            success: true,
            eventType: event.eventType,
            embeddingTaskId: handle.id,
          };
        }

        case 'episode.created': {
          const payload: EmbedContentPayload = {
            contentId: event.payload.episodeId,
            content: event.payload.summary,
            targetType: 'custom',
            metadata: {
              sourceType: 'episode',
              ...(event.payload.metadata as Record<string, string>),
            },
            correlationId,
            storeInDatabase: true,
          };

          const handle = await embedContent.trigger(payload);

          logger.info('Triggered episode embedding', {
            episodeId: event.payload.episodeId,
            taskId: handle.id,
            correlationId,
          });

          return {
            success: true,
            eventType: event.eventType,
            embeddingTaskId: handle.id,
          };
        }

        case 'content.batch.ready': {
          const batchPayload: BatchEmbedPayload = {
            batchId: event.payload.batchId,
            items: event.payload.items,
            targetType: event.payload.targetType,
            clinicId: event.payload.clinicId,
            correlationId,
          };

          const handle = await embedBatch.trigger(batchPayload);

          logger.info('Triggered batch embedding', {
            batchId: event.payload.batchId,
            itemCount: event.payload.items.length,
            taskId: handle.id,
            correlationId,
          });

          return {
            success: true,
            eventType: event.eventType,
            embeddingTaskId: handle.id,
          };
        }

        default:
          logger.warn('Unknown embedding event type', { event });
          return {
            success: false,
            eventType: (event as { eventType: string }).eventType,
            error: 'Unknown event type',
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to process embedding event', {
        eventType: event.eventType,
        eventId: event.eventId,
        error: errorMessage,
        correlationId,
      });

      return {
        success: false,
        eventType: event.eventType,
        error: errorMessage,
      };
    }
  },
});

// ============================================================================
// CRON JOB: Process Pending Embedding Events
// ============================================================================

/**
 * Cron job to process pending embedding events
 *
 * Runs every 5 minutes to check for domain events that need embedding
 * but haven't been processed yet. This provides resilience in case
 * the real-time event handler misses events.
 */
export const embeddingEventCron = schedules.task({
  id: 'embedding-event-cron',
  cron: '*/5 * * * *', // Every 5 minutes
  run: async (): Promise<{
    success: boolean;
    eventsProcessed: number;
    eventsFailed: number;
    processingTimeMs: number;
    correlationId: string;
  }> => {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    logger.info('Starting embedding event cron job', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping embedding event processing', {
        correlationId,
      });
      return {
        success: false,
        eventsProcessed: 0,
        eventsFailed: 0,
        processingTimeMs: 0,
        correlationId,
      };
    }

    let eventsProcessed = 0;
    let eventsFailed = 0;

    try {
      // Ensure embedding_event_log table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS embedding_event_log (
          event_id UUID PRIMARY KEY,
          status VARCHAR(20) NOT NULL,
          error TEXT,
          processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `);

      // Get pending events
      const pendingEvents = await getPendingEmbeddingEvents(db, MAX_EVENTS_PER_RUN);

      if (pendingEvents.length === 0) {
        logger.info('No pending embedding events', { correlationId });
        return {
          success: true,
          eventsProcessed: 0,
          eventsFailed: 0,
          processingTimeMs: Date.now() - startTime,
          correlationId,
        };
      }

      logger.info(`Found ${pendingEvents.length} pending embedding events`, { correlationId });

      // Process events in batches
      for (let i = 0; i < pendingEvents.length; i += EVENT_BATCH_SIZE) {
        const batch = pendingEvents.slice(i, i + EVENT_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (event) => {
            try {
              // Build the trigger event
              const triggerEvent = buildTriggerEvent(event);
              if (!triggerEvent) {
                throw new Error(`Cannot build trigger event for type: ${event.type}`);
              }

              // Trigger the embedding task
              const handle = await processEmbeddingEvent.trigger(triggerEvent);

              // Mark as processed
              await markEventProcessed(db, event.id, 'completed');

              return { eventId: event.id, taskId: handle.id };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await markEventProcessed(db, event.id, 'failed', errorMessage);
              throw error;
            }
          })
        );

        // Count results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            eventsProcessed++;
          } else {
            eventsFailed++;
            logger.warn('Failed to process embedding event', {
              error: result.reason,
              correlationId,
            });
          }
        }
      }

      // Emit completion event
      await emitProcessingEvent(eventStore, 'embedding.event_cron.completed', {
        eventsProcessed,
        eventsFailed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      logger.info('Embedding event cron completed', {
        eventsProcessed,
        eventsFailed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: eventsFailed === 0,
        eventsProcessed,
        eventsFailed,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Embedding event cron failed', {
        error: errorMessage,
        correlationId,
      });

      await emitProcessingEvent(eventStore, 'embedding.event_cron.failed', {
        error: errorMessage,
        correlationId,
      });

      return {
        success: false,
        eventsProcessed,
        eventsFailed: eventsFailed + 1,
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

/**
 * Build a trigger event from a raw database event
 */
function buildTriggerEvent(event: PendingEmbeddingEvent): EmbeddingTriggerEvent | null {
  const payload = event.payload;

  switch (event.type) {
    case 'knowledge.entry.created':
    case 'knowledge.entry.updated':
      return {
        eventType: event.type,
        eventId: event.id,
        correlationId: event.correlation_id,
        payload: {
          entryId: (payload.entryId as string) ?? event.aggregate_id,
          content: payload.content as string,
          title: payload.title as string | undefined,
          sourceType: payload.sourceType as string | undefined,
          clinicId: payload.clinicId as string | undefined,
          language: payload.language as 'ro' | 'en' | 'de' | undefined,
          tags: payload.tags as string[] | undefined,
        },
      };

    case 'message.received':
      return {
        eventType: 'message.received',
        eventId: event.id,
        correlationId: event.correlation_id,
        payload: {
          messageId: (payload.messageId as string) ?? event.aggregate_id,
          content: payload.content as string,
          phone: payload.phone as string,
          direction: (payload.direction as 'IN' | 'OUT') ?? 'IN',
          language: payload.language as 'ro' | 'en' | 'de' | undefined,
        },
      };

    case 'episode.created':
      return {
        eventType: 'episode.created',
        eventId: event.id,
        correlationId: event.correlation_id,
        payload: {
          episodeId: (payload.episodeId as string) ?? event.aggregate_id,
          summary: payload.summary as string,
          entityType: payload.entityType as string | undefined,
          metadata: payload.metadata as Record<string, unknown> | undefined,
        },
      };

    case 'content.batch.ready':
      return {
        eventType: 'content.batch.ready',
        eventId: event.id,
        correlationId: event.correlation_id,
        payload: {
          batchId: (payload.batchId as string) ?? event.aggregate_id,
          items: payload.items as {
            contentId: string;
            content: string;
            metadata?: Record<string, unknown>;
          }[],
          targetType: (payload.targetType as 'knowledge_base' | 'message' | 'custom') ?? 'custom',
          clinicId: payload.clinicId as string | undefined,
        },
      };

    default:
      return null;
  }
}
