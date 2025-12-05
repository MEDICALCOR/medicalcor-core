/**
 * Cognitive Memory Handler Task
 *
 * Processes events into episodic memory for AI-powered contextual responses.
 * Called after WhatsApp messages, voice calls, and other interactions to build
 * the patient's interaction history.
 *
 * ADR-004 Phase 2: Trigger.dev Integration
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { Pool } from 'pg';
import { createCognitiveSystem, type RawEventContext } from '@medicalcor/core';
import { createEmbeddingService, createOpenAIClient } from '@medicalcor/integrations';

// =============================================================================
// Payload Schema
// =============================================================================

export const CognitiveMemoryPayloadSchema = z.object({
  /** Type of subject (lead, patient, contact) */
  subjectType: z.enum(['lead', 'patient', 'contact']),

  /** Unique identifier for the subject (HubSpot ID or phone number) */
  subjectId: z.string(),

  /** Source channel of the interaction */
  sourceChannel: z.enum(['whatsapp', 'voice', 'web', 'email', 'crm', 'system']),

  /** Event type (e.g., 'message.received', 'call.completed') */
  eventType: z.string(),

  /** Event payload with interaction details */
  payload: z.record(z.unknown()),

  /** Timestamp when the event occurred */
  occurredAt: z.string().datetime(),

  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Optional: Skip embedding generation (for testing) */
  skipEmbedding: z.boolean().optional(),
});

export type CognitiveMemoryPayload = z.infer<typeof CognitiveMemoryPayloadSchema>;

// =============================================================================
// Database Pool Singleton
// =============================================================================

let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    poolInstance = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return poolInstance;
}

// =============================================================================
// Cognitive System Factory
// =============================================================================

interface CognitiveClients {
  cognitive: ReturnType<typeof createCognitiveSystem>;
}

function getCognitiveClients(): CognitiveClients | null {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!openaiApiKey || !databaseUrl) {
    logger.warn('Cognitive system not configured', {
      hasOpenAI: !!openaiApiKey,
      hasDatabase: !!databaseUrl,
    });
    return null;
  }

  const pool = getPool();
  const openai = createOpenAIClient({ apiKey: openaiApiKey });
  const embeddings = createEmbeddingService({
    apiKey: openaiApiKey,
    model: 'text-embedding-3-small',
  });

  const cognitive = createCognitiveSystem({
    pool,
    openai,
    embeddings,
  });

  return { cognitive };
}

// =============================================================================
// Main Task: Process Event into Episodic Memory
// =============================================================================

export const processEpisodicMemory = task({
  id: 'cognitive-episodic-memory',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: CognitiveMemoryPayload) => {
    const validatedPayload = CognitiveMemoryPayloadSchema.parse(payload);
    const {
      subjectType,
      subjectId,
      sourceChannel,
      eventType,
      payload: eventPayload,
      occurredAt,
      correlationId,
    } = validatedPayload;

    logger.info('Processing event into cognitive memory', {
      subjectType,
      subjectId,
      sourceChannel,
      eventType,
      correlationId,
    });

    // Get cognitive system
    const clients = getCognitiveClients();
    if (!clients) {
      logger.error('Cognitive system not available', { correlationId });
      return {
        success: false,
        error: 'Cognitive system not configured',
        correlationId,
      };
    }

    const { cognitive } = clients;

    // Build raw event context
    const rawEvent: RawEventContext = {
      eventType,
      payload: eventPayload,
      correlationId,
      occurredAt: new Date(occurredAt),
    };

    try {
      // Process event into episodic memory
      const episode = await cognitive.episodeBuilder.processEvent(
        subjectType,
        subjectId,
        sourceChannel,
        rawEvent
      );

      logger.info('Episodic memory created', {
        episodeId: episode.id,
        summary: episode.summary.substring(0, 100),
        sentiment: episode.sentiment,
        keyEntities: episode.keyEntities.length,
        correlationId,
      });

      return {
        success: true,
        episodeId: episode.id,
        summary: episode.summary,
        sentiment: episode.sentiment,
        intent: episode.intent,
        keyEntitiesCount: episode.keyEntities.length,
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to create episodic memory', {
        error,
        subjectId,
        eventType,
        correlationId,
      });

      throw error; // Re-throw to trigger retry
    }
  },
});

// =============================================================================
// Batch Processing Task
// =============================================================================

export const BatchCognitiveMemoryPayloadSchema = z.object({
  events: z.array(CognitiveMemoryPayloadSchema),
});

export type BatchCognitiveMemoryPayload = z.infer<typeof BatchCognitiveMemoryPayloadSchema>;

export const processEpisodicMemoryBatch = task({
  id: 'cognitive-episodic-memory-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: BatchCognitiveMemoryPayload) => {
    const { events } = BatchCognitiveMemoryPayloadSchema.parse(payload);

    logger.info('Processing batch into cognitive memory', {
      eventCount: events.length,
    });

    const clients = getCognitiveClients();
    if (!clients) {
      logger.error('Cognitive system not available for batch processing');
      return {
        success: false,
        error: 'Cognitive system not configured',
        processed: 0,
        failed: events.length,
      };
    }

    const { cognitive } = clients;
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const event of events) {
      try {
        const rawEvent: RawEventContext = {
          eventType: event.eventType,
          payload: event.payload,
          correlationId: event.correlationId,
          occurredAt: new Date(event.occurredAt),
        };

        await cognitive.episodeBuilder.processEvent(
          event.subjectType,
          event.subjectId,
          event.sourceChannel,
          rawEvent
        );

        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${event.eventType}:${event.subjectId}: ${String(error)}`);
        logger.warn('Failed to process event in batch', {
          eventType: event.eventType,
          subjectId: event.subjectId,
          error,
        });
      }
    }

    logger.info('Batch processing complete', results);

    return {
      success: results.failed === 0,
      ...results,
    };
  },
});

// =============================================================================
// Memory Query Task (for retrieving context before AI replies)
// =============================================================================

export const MemoryQueryPayloadSchema = z.object({
  subjectId: z.string(),
  subjectType: z.enum(['lead', 'patient', 'contact']).optional(),
  semanticQuery: z.string().optional(),
  channels: z.array(z.enum(['whatsapp', 'voice', 'web', 'email', 'crm', 'system'])).optional(),
  limit: z.number().min(1).max(20).optional(),
  daysBack: z.number().min(1).max(365).optional(),
  correlationId: z.string(),
});

export type MemoryQueryPayload = z.infer<typeof MemoryQueryPayloadSchema>;

export const queryEpisodicMemory = task({
  id: 'cognitive-memory-query',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: MemoryQueryPayload) => {
    const validatedPayload = MemoryQueryPayloadSchema.parse(payload);
    const {
      subjectId,
      subjectType,
      semanticQuery,
      channels,
      limit = 5,
      daysBack,
      correlationId,
    } = validatedPayload;

    logger.info('Querying cognitive memory', {
      subjectId,
      semanticQuery: semanticQuery?.substring(0, 50),
      correlationId,
    });

    const clients = getCognitiveClients();
    if (!clients) {
      return {
        success: false,
        error: 'Cognitive system not configured',
        memories: [],
        correlationId,
      };
    }

    const { cognitive } = clients;

    try {
      // Build query parameters
      const fromDate = daysBack ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : undefined;

      const memories = await cognitive.memoryRetrieval.query({
        subjectId,
        subjectType,
        semanticQuery,
        channels,
        limit,
        fromDate,
      });

      logger.info('Memory query complete', {
        resultCount: memories.length,
        correlationId,
      });

      return {
        success: true,
        memories: memories.map((m) => ({
          id: m.id,
          summary: m.summary,
          sentiment: m.sentiment,
          intent: m.intent,
          eventType: m.eventType,
          sourceChannel: m.sourceChannel,
          occurredAt: m.occurredAt.toISOString(),
        })),
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to query cognitive memory', {
        error,
        subjectId,
        correlationId,
      });

      return {
        success: false,
        error: String(error),
        memories: [],
        correlationId,
      };
    }
  },
});

// =============================================================================
// Subject Summary Task (comprehensive subject memory profile)
// =============================================================================

export const SubjectSummaryPayloadSchema = z.object({
  subjectType: z.enum(['lead', 'patient', 'contact']),
  subjectId: z.string(),
  correlationId: z.string(),
});

export type SubjectSummaryPayload = z.infer<typeof SubjectSummaryPayloadSchema>;

export const getSubjectMemorySummary = task({
  id: 'cognitive-subject-summary',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SubjectSummaryPayload) => {
    const { subjectType, subjectId, correlationId } = SubjectSummaryPayloadSchema.parse(payload);

    logger.info('Getting subject memory summary', {
      subjectType,
      subjectId,
      correlationId,
    });

    const clients = getCognitiveClients();
    if (!clients) {
      return {
        success: false,
        error: 'Cognitive system not configured',
        summary: null,
        correlationId,
      };
    }

    const { cognitive } = clients;

    try {
      const summary = await cognitive.memoryRetrieval.getSubjectSummary(subjectType, subjectId);

      logger.info('Subject summary retrieved', {
        totalEvents: summary.totalEvents,
        sentimentTrend: summary.sentimentTrend,
        patternsCount: summary.patterns.length,
        correlationId,
      });

      return {
        success: true,
        summary: {
          ...summary,
          firstInteraction: summary.firstInteraction?.toISOString() ?? null,
          lastInteraction: summary.lastInteraction?.toISOString() ?? null,
          patterns: summary.patterns.map((p) => ({
            type: p.patternType,
            description: p.patternDescription,
            confidence: p.confidence,
          })),
        },
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to get subject summary', {
        error,
        subjectId,
        correlationId,
      });

      return {
        success: false,
        error: String(error),
        summary: null,
        correlationId,
      };
    }
  },
});
