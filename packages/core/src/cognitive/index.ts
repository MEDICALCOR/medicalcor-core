/**
 * Cognitive Episodic Memory System
 *
 * ADR-004: AI-powered patient interaction memory for contextual AI responses,
 * pattern recognition, and proactive engagement.
 *
 * @example
 * ```typescript
 * import { createCognitiveSystem } from '@medicalcor/core/cognitive';
 *
 * const cognitive = createCognitiveSystem({
 *   pool: pgPool,
 *   openai: openaiClient,
 *   embeddings: embeddingService,
 * });
 *
 * // Process an event into episodic memory
 * await cognitive.episodeBuilder.processEvent(
 *   'lead',
 *   leadId,
 *   'whatsapp',
 *   { eventType: 'message.received', payload: messageData, occurredAt: new Date() }
 * );
 *
 * // Query memories for context
 * const memories = await cognitive.memoryRetrieval.query({
 *   subjectId: leadId,
 *   semanticQuery: 'appointment scheduling',
 *   limit: 5,
 * });
 *
 * // Paginated query for large result sets
 * const page1 = await cognitive.memoryRetrieval.queryPaginated({
 *   subjectId: leadId,
 *   pageSize: 20,
 * });
 * if (page1.hasMore) {
 *   const page2 = await cognitive.memoryRetrieval.queryPaginated({
 *     subjectId: leadId,
 *     pageSize: 20,
 *     cursor: page1.nextCursor,
 *   });
 * }
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export {
  // Enum schemas
  SubjectTypeSchema,
  SourceChannelSchema,
  EventCategorySchema,
  SentimentSchema,
  PatternTypeSchema,
  InsightTypeSchema,
  SentimentTrendSchema,

  // Data schemas
  KeyEntitySchema,
  EpisodicEventSchema,
  CreateEpisodicEventSchema,
  BehavioralPatternSchema,
  MemoryQuerySchema,
  PaginationCursorDataSchema,
  PaginatedMemoryQuerySchema,
  CognitiveInsightSchema,

  // Configuration
  DEFAULT_COGNITIVE_CONFIG,

  // Types
  type SubjectType,
  type SourceChannel,
  type EventCategory,
  type Sentiment,
  type PatternType,
  type InsightType,
  type SentimentTrend,
  type KeyEntity,
  type EpisodicEvent,
  type EpisodicEventWithEmbedding,
  type CreateEpisodicEvent,
  type BehavioralPattern,
  type MemoryQuery,
  type PaginatedMemoryQuery,
  type PaginatedResult,
  type PaginationCursorData,
  type SubjectMemorySummary,
  type CognitiveInsight,
  type CognitiveInsightWithEvents,
  type RawEventContext,
  type EventAnalysisResult,
  type PatternDetectionResult,
  type LLMPattern,
  type MemoryContext,
  type CognitiveSystemConfig,

  // Knowledge Graph Types (H8)
  EntityTypeSchema,
  RelationTypeSchema,
  ExtractionMethodSchema,
  KnowledgeEntitySchema,
  KnowledgeRelationSchema,
  EntityEventMappingSchema,
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  type EntityType,
  type RelationType,
  type ExtractionMethod,
  type KnowledgeEntity,
  type KnowledgeEntityWithEmbedding,
  type KnowledgeRelation,
  type EntityEventMapping,
  type RelatedEntityResult,
  type EntityCooccurrenceResult,
  type EntitySearchResult,
  type KnowledgeGraphConfig,

  // Entity Deduplication Types (H8: Auto-merge similar entities)
  DEFAULT_DEDUPLICATION_CONFIG,
  type EntityDeduplicationConfig,
  type DuplicateCandidate,
  type DuplicateMatchReason,
  type DuplicateDetectionResult,
  type EntityMergeResult,
  type MergeOptions,
  type DeduplicationRunSummary,

  // PII Masking Types (L6: Dynamic Query-Time Masking)
  UserRoleSchema,
  PiiFieldTypeSchema,
  MaskingLevelSchema,
  DEFAULT_PII_MASKING_CONFIG,
  type UserRole,
  type PiiFieldType,
  type MaskingLevel,
  type MaskingContext,
  type PiiMaskingConfig,
  type MaskingResult,
  type QueryMaskingOptions,
  // Real-Time Pattern Stream Types (L5: Stream Processing for Patterns)
  PatternChangeTypeSchema,
  DEFAULT_REALTIME_STREAM_CONFIG,
  type RealtimePatternStreamConfig,
  type PatternChangeType,
  type PatternDelta,
  type PatternUpdateEvent,
  type PatternUpdateCallback,
  type RealtimePatternStats,
  type SubjectEventBuffer,

  // Entity Canonicalization Types (L4: Canonical Form Population)
  DEFAULT_CANONICALIZATION_CONFIG,
  type EntityCanonicalizationConfig,
  type CanonicalizationMethod,
  type CanonicalFormResult,
  type BatchCanonicalizationResult,
} from './types.js';

// =============================================================================
// Service Exports
// =============================================================================

export {
  EpisodeBuilder,
  createEpisodeBuilder,
  type IOpenAIClient,
  type OnEventProcessedCallback,
  // Note: IEmbeddingService is exported from '@medicalcor/core/rag' to avoid duplicate
  // The interface is compatible and can be used with cognitive services
} from './episode-builder.js';

// Real-Time Pattern Stream (L5: Stream Processing for Patterns)
export { RealtimePatternStream, createRealtimePatternStream } from './realtime-pattern-stream.js';

export {
  MemoryRetrievalService,
  createMemoryRetrievalService,
  encodeCursor,
  decodeCursor,
} from './memory-retrieval.js';

// Masked Memory Retrieval Service (L6: Dynamic Query-Time Masking)
export {
  MaskedMemoryRetrievalService,
  createMaskedMemoryRetrievalService,
  type MaskedMemoryRetrievalConfig,
} from './masked-memory-retrieval.js';

// PII Masking Service (L6: Dynamic Query-Time Masking)
export {
  PiiMaskingService,
  createPiiMaskingService,
  roleRequiresMasking,
  getMaskingLevelForRole,
} from './pii-masking.js';

// GDPR Erasure Service (H4 Production Fix)
export {
  CognitiveGDPRErasureService,
  createCognitiveGDPRErasureService,
  type CognitiveErasureResult,
  type ErasureOptions,
} from './gdpr-erasure.js';

// Pattern Detection Service (M5: Behavioral Insights)
export { PatternDetector, createPatternDetector } from './pattern-detector.js';

// Knowledge Graph Service (H8: Knowledge Graph Integration)
export { KnowledgeGraphService, createKnowledgeGraphService } from './knowledge-graph.js';

// Entity Deduplication Service (H8: Auto-merge similar entities)
export {
  EntityDeduplicationService,
  createEntityDeduplicationService,
} from './entity-deduplication.js';

// Entity Canonicalization Service (L4: Canonical Form Population)
export {
  EntityCanonicalizationService,
  createEntityCanonicalizationService,
} from './entity-canonicalization.js';

// =============================================================================
// Factory Function
// =============================================================================

import type { Pool } from 'pg';
import { EpisodeBuilder, type IOpenAIClient, type IEmbeddingService } from './episode-builder.js';
import { MemoryRetrievalService } from './memory-retrieval.js';
import { MaskedMemoryRetrievalService } from './masked-memory-retrieval.js';
import { PatternDetector } from './pattern-detector.js';
import { KnowledgeGraphService } from './knowledge-graph.js';
import { EntityDeduplicationService } from './entity-deduplication.js';
import { EntityCanonicalizationService } from './entity-canonicalization.js';
import { PiiMaskingService } from './pii-masking.js';
import { RealtimePatternStream } from './realtime-pattern-stream.js';
import type {
  CognitiveSystemConfig,
  KnowledgeGraphConfig,
  EntityDeduplicationConfig,
  EntityCanonicalizationConfig,
  PiiMaskingConfig,
  RealtimePatternStreamConfig,
} from './types.js';

/**
 * Dependencies for creating the cognitive system
 */
export interface CognitiveSystemDependencies {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** OpenAI client for LLM analysis */
  openai: IOpenAIClient;
  /** Embedding service for semantic search */
  embeddings: IEmbeddingService;
  /** Optional configuration overrides */
  config?: Partial<CognitiveSystemConfig>;
  /** Optional knowledge graph configuration (H8) */
  knowledgeGraphConfig?: Partial<KnowledgeGraphConfig>;
  /** Optional entity deduplication configuration (H8) */
  deduplicationConfig?: Partial<EntityDeduplicationConfig>;
  /** Optional entity canonicalization configuration (L4) */
  canonicalizationConfig?: Partial<EntityCanonicalizationConfig>;
  /** Optional PII masking configuration (L6) */
  maskingConfig?: Partial<PiiMaskingConfig>;
  /** Optional real-time pattern stream configuration (L5) */
  realtimeStreamConfig?: Partial<RealtimePatternStreamConfig>;
}

/**
 * The complete cognitive system with all services
 */
export interface CognitiveSystem {
  /** Episode builder for processing events into memories */
  episodeBuilder: EpisodeBuilder;
  /** Memory retrieval service for querying episodic memory */
  memoryRetrieval: MemoryRetrievalService;
  /** Memory retrieval with built-in PII masking (L6) */
  maskedMemoryRetrieval: MaskedMemoryRetrievalService;
  /** PII masking service for query-time masking (L6) */
  piiMasking: PiiMaskingService;
  /** Pattern detector for behavioral insights (M5) */
  patternDetector: PatternDetector;
  /** Knowledge graph service for entity relationships (H8) */
  knowledgeGraph: KnowledgeGraphService;
  /** Entity deduplication service for auto-merging similar entities (H8) */
  entityDeduplication: EntityDeduplicationService;
  /** Entity canonicalization service for normalizing entity names (L4) */
  entityCanonicalization: EntityCanonicalizationService;
  /** Real-time pattern stream for automatic pattern updates (L5) */
  realtimePatternStream: RealtimePatternStream;
}

/**
 * Create a complete cognitive episodic memory system
 *
 * @param deps - Dependencies including database pool, OpenAI client, and embedding service
 * @returns Object containing episodeBuilder and memoryRetrieval services
 *
 * @example
 * ```typescript
 * const cognitive = createCognitiveSystem({
 *   pool: pgPool,
 *   openai: openaiClient,
 *   embeddings: embeddingService,
 * });
 *
 * // Process incoming events
 * await cognitive.episodeBuilder.processEvent('lead', leadId, 'whatsapp', rawEvent);
 *
 * // Query for similar interactions
 * const similar = await cognitive.memoryRetrieval.findSimilarInteractions(
 *   'appointment for dental implants',
 *   { subjectId: leadId }
 * );
 * ```
 */
export function createCognitiveSystem(deps: CognitiveSystemDependencies): CognitiveSystem {
  const episodeBuilder = new EpisodeBuilder(deps.openai, deps.embeddings, deps.pool, deps.config);

  const memoryRetrieval = new MemoryRetrievalService(deps.pool, deps.embeddings, deps.config);

  // L6: PII Masking Service for query-time masking
  const piiMasking = new PiiMaskingService(deps.maskingConfig);

  // L6: Memory retrieval with built-in PII masking
  const maskedMemoryRetrieval = new MaskedMemoryRetrievalService(deps.pool, deps.embeddings, {
    cognitiveConfig: deps.config,
    maskingConfig: deps.maskingConfig,
  });

  const patternDetector = new PatternDetector(deps.pool, deps.openai, deps.config);

  // H8: Knowledge Graph Integration
  const knowledgeGraph = new KnowledgeGraphService(
    deps.pool,
    deps.embeddings,
    deps.knowledgeGraphConfig
  );

  // H8: Entity Deduplication Service for auto-merging similar entities
  const entityDeduplication = new EntityDeduplicationService(
    deps.pool,
    deps.embeddings,
    deps.deduplicationConfig
  );

  // L4: Entity Canonicalization Service for normalizing entity names
  const entityCanonicalization = new EntityCanonicalizationService(
    deps.pool,
    deps.openai,
    deps.canonicalizationConfig
  );

  // L5: Real-Time Pattern Stream for automatic pattern updates
  const realtimePatternStream = new RealtimePatternStream(
    deps.pool,
    deps.openai,
    deps.realtimeStreamConfig,
    deps.config
  );

  // Wire knowledge graph to episode builder for automatic entity extraction
  episodeBuilder.setKnowledgeGraph(knowledgeGraph);

  // L4: Wire canonicalization service to knowledge graph for automatic canonical form population
  knowledgeGraph.setCanonicalizationService(entityCanonicalization);

  // L5: Wire real-time pattern stream to episode builder for automatic pattern detection
  episodeBuilder.setRealtimePatternStream(realtimePatternStream);

  return {
    episodeBuilder,
    memoryRetrieval,
    maskedMemoryRetrieval,
    piiMasking,
    patternDetector,
    knowledgeGraph,
    entityDeduplication,
    entityCanonicalization,
    realtimePatternStream,
  };
}
