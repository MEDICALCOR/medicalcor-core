/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { task, logger, schedules } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
  createCognitiveSystem,
  type CognitiveInsight,
  type BehavioralPattern,
} from '@medicalcor/core';
import {
  createEmbeddingService,
  createOpenAIClient,
  getOpenAIApiKey,
} from '@medicalcor/integrations';

/**
 * Behavioral Insights Worker (M5)
 *
 * Background processing for pattern detection and cognitive insights.
 * This worker handles:
 * - Single subject pattern detection
 * - Batch pattern detection for multiple subjects
 * - Scheduled pattern refresh for active subjects
 * - Insight generation for proactive engagement
 *
 * @module @medicalcor/trigger/tasks/behavioral-insights-worker
 */

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/** Subject type schema */
const SubjectTypeSchema = z.enum(['lead', 'patient', 'contact']);

/** Single subject pattern detection payload */
export const DetectPatternsPayloadSchema = z.object({
  /** Subject type (lead, patient, contact) */
  subjectType: SubjectTypeSchema,
  /** Subject UUID */
  subjectId: z.string().uuid(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Whether to include LLM-based pattern detection (slower, more expensive) */
  enableLLMPatterns: z.boolean().default(false),
  /** Optional callback URL for completion notification */
  callbackUrl: z.string().url().optional(),
});

export type DetectPatternsPayload = z.infer<typeof DetectPatternsPayloadSchema>;

/** Batch pattern detection payload */
export const BatchDetectPatternsPayloadSchema = z.object({
  /** Batch identifier */
  batchId: z.string(),
  /** Array of subjects to process */
  subjects: z.array(
    z.object({
      subjectType: SubjectTypeSchema,
      subjectId: z.string().uuid(),
    })
  ),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Whether to include LLM-based pattern detection */
  enableLLMPatterns: z.boolean().default(false),
});

export type BatchDetectPatternsPayload = z.infer<typeof BatchDetectPatternsPayloadSchema>;

/** Generate insights payload */
export const GenerateInsightsPayloadSchema = z.object({
  /** Subject type */
  subjectType: SubjectTypeSchema,
  /** Subject UUID */
  subjectId: z.string().uuid(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

export type GenerateInsightsPayload = z.infer<typeof GenerateInsightsPayloadSchema>;

/** Pattern detection result */
interface PatternDetectionResult {
  success: boolean;
  subjectType: string;
  subjectId: string;
  patternsDetected: number;
  patterns: BehavioralPattern[];
  processingTimeMs: number;
  correlationId: string;
}

/** Batch detection result */
interface BatchDetectionResult {
  success: boolean;
  batchId: string;
  totalSubjects: number;
  successfulSubjects: number;
  failedSubjects: number;
  totalPatternsDetected: number;
  results: {
    subjectId: string;
    success: boolean;
    patternsDetected?: number;
    error?: string;
  }[];
  processingTimeMs: number;
  correlationId: string;
}

/** Insight generation result */
interface InsightGenerationResult {
  success: boolean;
  subjectType: string;
  subjectId: string;
  insightsGenerated: number;
  insights: CognitiveInsight[];
  processingTimeMs: number;
  correlationId: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'behavioral-insights-worker', connectionString: databaseUrl })
    : createInMemoryEventStore('behavioral-insights-worker');

  return { db, eventStore };
}

function getCognitiveServices(db: DatabasePool, enableLLMPatterns: boolean) {
  const openaiKey = getOpenAIApiKey();
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const openaiClient = createOpenAIClient({ apiKey: openaiKey });
  const embeddingService = createEmbeddingService({
    apiKey: openaiKey,
    model: 'text-embedding-3-small',
  });

  const cognitiveSystem = createCognitiveSystem({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DatabasePool is pg.Pool compatible
    pool: db as any,
    openai: openaiClient,
    embeddings: embeddingService,
    config: {
      enableLLMPatterns,
      minPatternConfidence: 0.5,
    },
  });

  return cognitiveSystem;
}

/**
 * Emit behavioral insights event
 */
async function emitInsightsEvent(
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
      correlationId:
        typeof payload.correlationId === 'string' ? payload.correlationId : crypto.randomUUID(),
      payload,
      aggregateType: 'behavioral_insights',
    });
  } catch (error) {
    logger.warn('Failed to emit behavioral insights event', { type, error });
  }
}

// ============================================================================
// TASK: Detect Patterns for Single Subject
// ============================================================================

/**
 * Detect behavioral patterns for a single subject
 *
 * Use this task when you need to:
 * - Analyze patterns after significant interaction (message, call, appointment)
 * - Generate real-time insights for agent guidance
 * - Refresh patterns for a specific lead/patient
 */
export const detectPatterns = task({
  id: 'detect-behavioral-patterns',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: DetectPatternsPayload): Promise<PatternDetectionResult> => {
    const startTime = Date.now();
    const { subjectType, subjectId, correlationId, enableLLMPatterns } = payload;

    logger.info('Starting pattern detection', {
      subjectType,
      subjectId,
      enableLLMPatterns,
      correlationId,
    });

    const { db, eventStore } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    try {
      const cognitive = getCognitiveServices(db, enableLLMPatterns);

      // Detect patterns
      const patterns = await cognitive.patternDetector.detectPatterns(subjectType, subjectId);

      logger.info('Pattern detection completed', {
        subjectId,
        patternsDetected: patterns.length,
        patternTypes: patterns.map((p) => p.patternType),
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      // Emit completion event
      await emitInsightsEvent(eventStore, 'behavioral_patterns.detected', {
        subjectType,
        subjectId,
        patternsDetected: patterns.length,
        patternTypes: patterns.map((p) => p.patternType),
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: true,
        subjectType,
        subjectId,
        patternsDetected: patterns.length,
        patterns,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Pattern detection failed', {
        subjectId,
        error,
        correlationId,
      });

      await emitInsightsEvent(eventStore, 'behavioral_patterns.failed', {
        subjectType,
        subjectId,
        error: error instanceof Error ? error.message : String(error),
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

// ============================================================================
// TASK: Batch Pattern Detection
// ============================================================================

/**
 * Detect patterns for multiple subjects in batch
 *
 * Use this task for:
 * - Scheduled pattern refresh for all active leads
 * - Bulk analysis after data import
 * - Periodic pattern update jobs
 */
export const detectPatternsBatch = task({
  id: 'detect-behavioral-patterns-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: BatchDetectPatternsPayload): Promise<BatchDetectionResult> => {
    const startTime = Date.now();
    const { batchId, subjects, correlationId, enableLLMPatterns } = payload;

    logger.info('Starting batch pattern detection', {
      batchId,
      subjectCount: subjects.length,
      enableLLMPatterns,
      correlationId,
    });

    // Validate batch size
    const MAX_BATCH_SIZE = 100;
    if (subjects.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    const { db, eventStore } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    const results: BatchDetectionResult['results'] = [];
    let successfulSubjects = 0;
    let failedSubjects = 0;
    let totalPatternsDetected = 0;

    try {
      const cognitive = getCognitiveServices(db, enableLLMPatterns);

      // Process each subject
      for (const subject of subjects) {
        try {
          const patterns = await cognitive.patternDetector.detectPatterns(
            subject.subjectType,
            subject.subjectId
          );

          results.push({
            subjectId: subject.subjectId,
            success: true,
            patternsDetected: patterns.length,
          });

          successfulSubjects++;
          totalPatternsDetected += patterns.length;
        } catch (error) {
          results.push({
            subjectId: subject.subjectId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failedSubjects++;

          logger.warn('Subject pattern detection failed', {
            subjectId: subject.subjectId,
            error,
            correlationId,
          });
        }
      }

      logger.info('Batch pattern detection completed', {
        batchId,
        successfulSubjects,
        failedSubjects,
        totalPatternsDetected,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      // Emit completion event
      await emitInsightsEvent(eventStore, 'behavioral_patterns.batch_completed', {
        batchId,
        successfulSubjects,
        failedSubjects,
        totalPatternsDetected,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: failedSubjects === 0,
        batchId,
        totalSubjects: subjects.length,
        successfulSubjects,
        failedSubjects,
        totalPatternsDetected,
        results,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Batch pattern detection failed', {
        batchId,
        error,
        correlationId,
      });

      await emitInsightsEvent(eventStore, 'behavioral_patterns.batch_failed', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
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

// ============================================================================
// TASK: Generate Insights for Subject
// ============================================================================

/**
 * Generate actionable insights for a subject based on detected patterns
 *
 * Use this task when you need to:
 * - Generate proactive engagement recommendations
 * - Identify churn risks and reactivation candidates
 * - Prepare context for agent calls
 */
export const generateInsights = task({
  id: 'generate-cognitive-insights',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 15000,
    factor: 2,
  },
  run: async (payload: GenerateInsightsPayload): Promise<InsightGenerationResult> => {
    const startTime = Date.now();
    const { subjectType, subjectId, correlationId } = payload;

    logger.info('Starting insight generation', {
      subjectType,
      subjectId,
      correlationId,
    });

    const { db, eventStore } = getClients();

    if (!db) {
      throw new Error('Database not configured');
    }

    try {
      const cognitive = getCognitiveServices(db, false);

      // Generate insights based on patterns
      const insights = await cognitive.patternDetector.generateInsights(subjectType, subjectId);

      logger.info('Insight generation completed', {
        subjectId,
        insightsGenerated: insights.length,
        insightTypes: insights.map((i) => i.type),
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      // Emit completion event
      await emitInsightsEvent(eventStore, 'cognitive_insights.generated', {
        subjectType,
        subjectId,
        insightsGenerated: insights.length,
        insightTypes: insights.map((i) => i.type),
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: true,
        subjectType,
        subjectId,
        insightsGenerated: insights.length,
        insights,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Insight generation failed', {
        subjectId,
        error,
        correlationId,
      });

      await emitInsightsEvent(eventStore, 'cognitive_insights.failed', {
        subjectType,
        subjectId,
        error: error instanceof Error ? error.message : String(error),
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

// ============================================================================
// SCHEDULED TASK: Daily Pattern Refresh
// ============================================================================

/**
 * Scheduled task to refresh patterns for active subjects
 * Runs daily at 3 AM to update behavioral patterns
 */
export const dailyPatternRefresh = schedules.task({
  id: 'daily-pattern-refresh',
  cron: '0 3 * * *', // 3 AM every day
  run: async () => {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();

    logger.info('Starting daily pattern refresh', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping daily refresh');
      return;
    }

    try {
      // Get recently active subjects (active in last 30 days)
      const result = await db.query<{ subject_type: string; subject_id: string }>(`
        SELECT DISTINCT subject_type, subject_id
        FROM episodic_events
        WHERE deleted_at IS NULL
          AND occurred_at >= NOW() - INTERVAL '30 days'
        ORDER BY subject_type, subject_id
        LIMIT 500
      `);

      const subjects = result.rows.map((row) => ({
        subjectType: row.subject_type as 'lead' | 'patient' | 'contact',
        subjectId: row.subject_id,
      }));

      if (subjects.length === 0) {
        logger.info('No active subjects found for pattern refresh', { correlationId });
        return;
      }

      logger.info('Found active subjects for refresh', {
        count: subjects.length,
        correlationId,
      });

      // Process in batches of 50
      const BATCH_SIZE = 50;
      let totalProcessed = 0;
      let totalPatterns = 0;

      const cognitive = getCognitiveServices(db, false);

      for (let i = 0; i < subjects.length; i += BATCH_SIZE) {
        const batch = subjects.slice(i, i + BATCH_SIZE);

        for (const subject of batch) {
          try {
            const patterns = await cognitive.patternDetector.detectPatterns(
              subject.subjectType,
              subject.subjectId
            );
            totalPatterns += patterns.length;
            totalProcessed++;
          } catch (error) {
            logger.warn('Failed to refresh patterns for subject', {
              subjectId: subject.subjectId,
              error,
              correlationId,
            });
          }
        }

        // Log progress
        logger.info('Batch progress', {
          processed: totalProcessed,
          total: subjects.length,
          patternsDetected: totalPatterns,
          correlationId,
        });
      }

      logger.info('Daily pattern refresh completed', {
        totalSubjects: subjects.length,
        totalProcessed,
        totalPatterns,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      await emitInsightsEvent(eventStore, 'behavioral_patterns.daily_refresh_completed', {
        totalSubjects: subjects.length,
        totalProcessed,
        totalPatterns,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });
    } catch (error) {
      logger.error('Daily pattern refresh failed', { error, correlationId });

      await emitInsightsEvent(eventStore, 'behavioral_patterns.daily_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
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
