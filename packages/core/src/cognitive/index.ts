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
} from './types.js';

// =============================================================================
// Service Exports
// =============================================================================

export {
  EpisodeBuilder,
  createEpisodeBuilder,
  type IOpenAIClient,
  // Note: IEmbeddingService is exported from '@medicalcor/core/rag' to avoid duplicate
  // The interface is compatible and can be used with cognitive services
} from './episode-builder.js';

export { MemoryRetrievalService, createMemoryRetrievalService } from './memory-retrieval.js';

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

// =============================================================================
// Factory Function
// =============================================================================

import type { Pool } from 'pg';
import { EpisodeBuilder, type IOpenAIClient, type IEmbeddingService } from './episode-builder.js';
import { MemoryRetrievalService } from './memory-retrieval.js';
import { PatternDetector } from './pattern-detector.js';
import { KnowledgeGraphService } from './knowledge-graph.js';
import type { CognitiveSystemConfig, KnowledgeGraphConfig } from './types.js';

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
}

/**
 * The complete cognitive system with all services
 */
export interface CognitiveSystem {
  /** Episode builder for processing events into memories */
  episodeBuilder: EpisodeBuilder;
  /** Memory retrieval service for querying episodic memory */
  memoryRetrieval: MemoryRetrievalService;
  /** Pattern detector for behavioral insights (M5) */
  patternDetector: PatternDetector;
  /** Knowledge graph service for entity relationships (H8) */
  knowledgeGraph: KnowledgeGraphService;
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

  const patternDetector = new PatternDetector(deps.pool, deps.openai, deps.config);

  // H8: Knowledge Graph Integration
  const knowledgeGraph = new KnowledgeGraphService(
    deps.pool,
    deps.embeddings,
    deps.knowledgeGraphConfig
  );

  // Wire knowledge graph to episode builder for automatic entity extraction
  episodeBuilder.setKnowledgeGraph(knowledgeGraph);

  return {
    episodeBuilder,
    memoryRetrieval,
    patternDetector,
    knowledgeGraph,
  };
}
