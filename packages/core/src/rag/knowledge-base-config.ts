/**
 * RAG Knowledge Base Configuration
 *
 * Production-ready configuration for the RAG knowledge base including:
 * - Embedding model selection and fine-tuning parameters
 * - Vector index optimization settings
 * - Multi-source knowledge base management
 * - Content ingestion pipelines
 * - Quality metrics and monitoring
 *
 * HIPAA: PHI handling is disabled by default for RAG content.
 * GDPR: All stored content must be anonymized.
 */

import { z } from 'zod';

// =============================================================================
// EMBEDDING MODEL CONFIGURATION
// =============================================================================

export const EmbeddingModelConfigSchema = z.object({
  /**
   * Model identifier (OpenAI, Cohere, local, etc.)
   */
  provider: z.enum(['openai', 'cohere', 'voyage', 'local']).default('openai'),

  /**
   * Specific model name
   */
  model: z.string().default('text-embedding-3-small'),

  /**
   * Embedding dimensions
   */
  dimensions: z.number().int().min(64).max(4096).default(1536),

  /**
   * Maximum tokens per embedding request
   */
  maxTokens: z.number().int().min(256).max(8192).default(8191),

  /**
   * Batch size for bulk embeddings
   */
  batchSize: z.number().int().min(1).max(2048).default(100),

  /**
   * Rate limiting configuration
   */
  rateLimit: z
    .object({
      requestsPerMinute: z.number().int().default(3000),
      tokensPerMinute: z.number().int().default(1000000),
    })
    .default({}),

  /**
   * Retry configuration for transient failures
   */
  retry: z
    .object({
      maxRetries: z.number().int().default(3),
      baseDelayMs: z.number().int().default(1000),
      maxDelayMs: z.number().int().default(30000),
    })
    .default({}),
});

export type EmbeddingModelConfig = z.infer<typeof EmbeddingModelConfigSchema>;

// =============================================================================
// VECTOR INDEX CONFIGURATION
// =============================================================================

export const VectorIndexConfigSchema = z.object({
  /**
   * Index type (pgvector index type)
   */
  indexType: z.enum(['ivfflat', 'hnsw']).default('hnsw'),

  /**
   * HNSW configuration (when indexType is 'hnsw')
   */
  hnsw: z
    .object({
      /**
       * Max connections per node (higher = more accurate, slower build)
       */
      m: z.number().int().min(4).max(64).default(16),

      /**
       * Size of dynamic candidate list during construction
       */
      efConstruction: z.number().int().min(64).max(512).default(200),

      /**
       * Size of dynamic candidate list during search
       */
      efSearch: z.number().int().min(10).max(500).default(100),
    })
    .default({}),

  /**
   * IVF configuration (when indexType is 'ivfflat')
   */
  ivf: z
    .object({
      /**
       * Number of lists (clusters)
       */
      lists: z.number().int().min(100).max(10000).default(1000),

      /**
       * Number of lists to probe during search
       */
      probes: z.number().int().min(1).max(1000).default(10),
    })
    .default({}),

  /**
   * Distance metric
   */
  distanceMetric: z.enum(['cosine', 'l2', 'inner_product']).default('cosine'),

  /**
   * Maintenance configuration
   */
  maintenance: z
    .object({
      /**
       * Reindex threshold (% of new vectors before reindex)
       */
      reindexThreshold: z.number().min(0.1).max(0.5).default(0.2),

      /**
       * VACUUM schedule (cron expression)
       */
      vacuumSchedule: z.string().default('0 3 * * *'), // 3 AM daily

      /**
       * Index rebuild schedule (cron expression)
       */
      rebuildSchedule: z.string().default('0 4 * * 0'), // 4 AM Sundays
    })
    .default({}),
});

export type VectorIndexConfig = z.infer<typeof VectorIndexConfigSchema>;

// =============================================================================
// KNOWLEDGE BASE SOURCE CONFIGURATION
// =============================================================================

export const KnowledgeSourceSchema = z.object({
  /**
   * Unique source identifier
   */
  id: z.string(),

  /**
   * Human-readable name
   */
  name: z.string(),

  /**
   * Source type
   */
  type: z.enum([
    'faq',
    'procedure',
    'pricing',
    'policy',
    'clinic_info',
    'treatment_info',
    'general',
  ]),

  /**
   * Source priority (higher = preferred in retrieval)
   */
  priority: z.number().int().min(1).max(100).default(50),

  /**
   * Whether source is active
   */
  enabled: z.boolean().default(true),

  /**
   * Languages supported by this source
   */
  languages: z.array(z.string()).default(['ro', 'en']),

  /**
   * Clinic IDs this source applies to (empty = all clinics)
   */
  clinicIds: z.array(z.string()).default([]),

  /**
   * Content freshness configuration
   */
  freshness: z
    .object({
      /**
       * Refresh interval in hours
       */
      refreshIntervalHours: z.number().int().default(24),

      /**
       * Maximum age before content is stale (hours)
       */
      maxAgeHours: z.number().int().default(168), // 1 week

      /**
       * Auto-refresh enabled
       */
      autoRefresh: z.boolean().default(true),
    })
    .default({}),

  /**
   * Chunking configuration for this source
   */
  chunking: z
    .object({
      /**
       * Target chunk size in tokens
       */
      chunkSize: z.number().int().min(100).max(2000).default(500),

      /**
       * Overlap between chunks in tokens
       */
      chunkOverlap: z.number().int().min(0).max(500).default(50),

      /**
       * Chunking strategy
       */
      strategy: z.enum(['sentence', 'paragraph', 'fixed', 'semantic']).default('semantic'),
    })
    .default({}),
});

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

// =============================================================================
// FINE-TUNING CONFIGURATION
// =============================================================================

export const FineTuningConfigSchema = z.object({
  /**
   * Enable fine-tuning features
   */
  enabled: z.boolean().default(false),

  /**
   * Base model for fine-tuning
   */
  baseModel: z.string().default('gpt-4o-mini'),

  /**
   * Training data configuration
   */
  trainingData: z
    .object({
      /**
       * Minimum training examples required
       */
      minExamples: z.number().int().default(100),

      /**
       * Maximum training examples per fine-tune
       */
      maxExamples: z.number().int().default(10000),

      /**
       * Validation split ratio
       */
      validationSplit: z.number().min(0.1).max(0.3).default(0.2),

      /**
       * Data sources for training
       */
      sources: z
        .array(z.enum(['rag_feedback', 'conversation_logs', 'expert_annotations', 'synthetic']))
        .default(['rag_feedback', 'conversation_logs']),
    })
    .default({}),

  /**
   * Hyperparameters
   */
  hyperparameters: z
    .object({
      /**
       * Number of training epochs
       */
      epochs: z.number().int().min(1).max(10).default(3),

      /**
       * Learning rate multiplier
       */
      learningRateMultiplier: z.number().min(0.01).max(10).default(1.0),

      /**
       * Batch size
       */
      batchSize: z.number().int().min(1).max(64).default(16),
    })
    .default({}),

  /**
   * Evaluation metrics
   */
  evaluation: z
    .object({
      /**
       * Metrics to track
       */
      metrics: z
        .array(z.enum(['loss', 'accuracy', 'f1', 'relevance_score', 'helpfulness_rating']))
        .default(['loss', 'accuracy', 'relevance_score']),

      /**
       * Minimum performance threshold to deploy
       */
      minPerformanceThreshold: z.number().min(0).max(1).default(0.8),

      /**
       * A/B test new model before full deployment
       */
      abTestEnabled: z.boolean().default(true),

      /**
       * A/B test traffic percentage for new model
       */
      abTestTrafficPercent: z.number().min(0.01).max(0.5).default(0.1),
    })
    .default({}),

  /**
   * Scheduling
   */
  schedule: z
    .object({
      /**
       * Auto-train when enough new data available
       */
      autoTrain: z.boolean().default(false),

      /**
       * Minimum days between training runs
       */
      minDaysBetweenRuns: z.number().int().default(7),

      /**
       * Preferred training time (cron expression)
       */
      trainingSchedule: z.string().default('0 2 * * 6'), // 2 AM Saturdays
    })
    .default({}),
});

export type FineTuningConfig = z.infer<typeof FineTuningConfigSchema>;

// =============================================================================
// QUALITY METRICS CONFIGURATION
// =============================================================================

export const QualityMetricsConfigSchema = z.object({
  /**
   * Enable quality metrics collection
   */
  enabled: z.boolean().default(true),

  /**
   * Retrieval metrics
   */
  retrieval: z
    .object({
      /**
       * Track Mean Reciprocal Rank
       */
      trackMRR: z.boolean().default(true),

      /**
       * Track Normalized Discounted Cumulative Gain
       */
      trackNDCG: z.boolean().default(true),

      /**
       * Track Precision@K
       */
      trackPrecisionAtK: z.array(z.number().int()).default([1, 3, 5, 10]),

      /**
       * Track Recall@K
       */
      trackRecallAtK: z.array(z.number().int()).default([5, 10, 20]),
    })
    .default({}),

  /**
   * User feedback collection
   */
  feedback: z
    .object({
      /**
       * Enable feedback collection
       */
      enabled: z.boolean().default(true),

      /**
       * Feedback prompt percentage (0-1)
       */
      promptRate: z.number().min(0).max(1).default(0.1),

      /**
       * Required feedback before model updates
       */
      minFeedbackForUpdate: z.number().int().default(50),
    })
    .default({}),

  /**
   * Alerting thresholds
   */
  alerts: z
    .object({
      /**
       * Alert if average relevance score drops below
       */
      minAverageRelevance: z.number().min(0).max(1).default(0.7),

      /**
       * Alert if no-results rate exceeds
       */
      maxNoResultsRate: z.number().min(0).max(1).default(0.1),

      /**
       * Alert if average latency exceeds (ms)
       */
      maxAverageLatencyMs: z.number().int().default(500),

      /**
       * Alert if negative feedback rate exceeds
       */
      maxNegativeFeedbackRate: z.number().min(0).max(1).default(0.2),
    })
    .default({}),
});

export type QualityMetricsConfig = z.infer<typeof QualityMetricsConfigSchema>;

// =============================================================================
// COMPLETE KNOWLEDGE BASE CONFIGURATION
// =============================================================================

export const KnowledgeBaseConfigSchema = z.object({
  /**
   * Knowledge base version
   */
  version: z.string().default('1.0.0'),

  /**
   * Environment
   */
  environment: z.enum(['development', 'staging', 'production']).default('production'),

  /**
   * Embedding model configuration
   */
  embedding: EmbeddingModelConfigSchema.default({}),

  /**
   * Vector index configuration
   */
  vectorIndex: VectorIndexConfigSchema.default({}),

  /**
   * Knowledge sources
   */
  sources: z.array(KnowledgeSourceSchema).default([
    {
      id: 'faq-general',
      name: 'General FAQ',
      type: 'faq',
      priority: 90,
      enabled: true,
      languages: ['ro', 'en'],
      clinicIds: [],
      freshness: { refreshIntervalHours: 24, maxAgeHours: 168, autoRefresh: true },
      chunking: { chunkSize: 300, chunkOverlap: 30, strategy: 'paragraph' },
    },
    {
      id: 'procedures',
      name: 'Dental Procedures',
      type: 'procedure',
      priority: 85,
      enabled: true,
      languages: ['ro', 'en'],
      clinicIds: [],
      freshness: { refreshIntervalHours: 168, maxAgeHours: 720, autoRefresh: true },
      chunking: { chunkSize: 500, chunkOverlap: 50, strategy: 'semantic' },
    },
    {
      id: 'pricing',
      name: 'Pricing Information',
      type: 'pricing',
      priority: 80,
      enabled: true,
      languages: ['ro', 'en'],
      clinicIds: [],
      freshness: { refreshIntervalHours: 24, maxAgeHours: 48, autoRefresh: true },
      chunking: { chunkSize: 200, chunkOverlap: 20, strategy: 'paragraph' },
    },
  ]),

  /**
   * Fine-tuning configuration
   */
  fineTuning: FineTuningConfigSchema.default({}),

  /**
   * Quality metrics configuration
   */
  qualityMetrics: QualityMetricsConfigSchema.default({}),

  /**
   * Content ingestion settings
   */
  ingestion: z
    .object({
      /**
       * Enable automatic content ingestion
       */
      autoIngest: z.boolean().default(true),

      /**
       * Ingestion batch size
       */
      batchSize: z.number().int().default(50),

      /**
       * Parallel ingestion workers
       */
      parallelWorkers: z.number().int().min(1).max(10).default(3),

      /**
       * Deduplication enabled
       */
      deduplication: z.boolean().default(true),

      /**
       * Content hashing algorithm
       */
      hashAlgorithm: z.enum(['sha256', 'xxhash']).default('sha256'),
    })
    .default({}),

  /**
   * HIPAA/GDPR compliance settings
   */
  compliance: z
    .object({
      /**
       * PHI detection enabled (blocks PHI from being stored)
       */
      phiDetection: z.boolean().default(true),

      /**
       * PII anonymization enabled
       */
      piiAnonymization: z.boolean().default(true),

      /**
       * Content encryption at rest
       */
      encryptionAtRest: z.boolean().default(true),

      /**
       * Audit logging for all operations
       */
      auditLogging: z.boolean().default(true),

      /**
       * Data retention period (days)
       */
      retentionDays: z.number().int().default(2555), // ~7 years for HIPAA
    })
    .default({}),
});

export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseConfigSchema>;

// =============================================================================
// DEFAULT PRODUCTION CONFIGURATION
// =============================================================================

export const DEFAULT_KNOWLEDGE_BASE_CONFIG: KnowledgeBaseConfig = KnowledgeBaseConfigSchema.parse({
  version: '1.0.0',
  environment: 'production',
  embedding: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    maxTokens: 8191,
    batchSize: 100,
    rateLimit: {
      requestsPerMinute: 3000,
      tokensPerMinute: 1000000,
    },
    retry: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    },
  },
  vectorIndex: {
    indexType: 'hnsw',
    hnsw: {
      m: 16,
      efConstruction: 200,
      efSearch: 100,
    },
    distanceMetric: 'cosine',
    maintenance: {
      reindexThreshold: 0.2,
      vacuumSchedule: '0 3 * * *',
      rebuildSchedule: '0 4 * * 0',
    },
  },
  fineTuning: {
    enabled: true,
    baseModel: 'gpt-4o-mini',
    trainingData: {
      minExamples: 100,
      maxExamples: 10000,
      validationSplit: 0.2,
      sources: ['rag_feedback', 'conversation_logs'],
    },
    hyperparameters: {
      epochs: 3,
      learningRateMultiplier: 1.0,
      batchSize: 16,
    },
    evaluation: {
      metrics: ['loss', 'accuracy', 'relevance_score'],
      minPerformanceThreshold: 0.8,
      abTestEnabled: true,
      abTestTrafficPercent: 0.1,
    },
    schedule: {
      autoTrain: true,
      minDaysBetweenRuns: 7,
      trainingSchedule: '0 2 * * 6',
    },
  },
  qualityMetrics: {
    enabled: true,
    retrieval: {
      trackMRR: true,
      trackNDCG: true,
      trackPrecisionAtK: [1, 3, 5, 10],
      trackRecallAtK: [5, 10, 20],
    },
    feedback: {
      enabled: true,
      promptRate: 0.1,
      minFeedbackForUpdate: 50,
    },
    alerts: {
      minAverageRelevance: 0.7,
      maxNoResultsRate: 0.1,
      maxAverageLatencyMs: 500,
      maxNegativeFeedbackRate: 0.2,
    },
  },
  compliance: {
    phiDetection: true,
    piiAnonymization: true,
    encryptionAtRest: true,
    auditLogging: true,
    retentionDays: 2555,
  },
});

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createKnowledgeBaseConfig(
  overrides: Partial<KnowledgeBaseConfig> = {}
): KnowledgeBaseConfig {
  return KnowledgeBaseConfigSchema.parse({
    ...DEFAULT_KNOWLEDGE_BASE_CONFIG,
    ...overrides,
  });
}

// =============================================================================
// VALIDATION HELPER
// =============================================================================

export function validateKnowledgeBaseConfig(config: unknown): {
  valid: boolean;
  errors: string[];
  config?: KnowledgeBaseConfig;
} {
  const result = KnowledgeBaseConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [], config: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}
