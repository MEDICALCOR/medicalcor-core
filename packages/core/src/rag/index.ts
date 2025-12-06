/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * State-of-the-art RAG implementation with:
 * - pgvector for vector storage
 * - Hybrid search (semantic + keyword)
 * - Document chunking with overlap
 * - Context injection for AI prompts
 * - HubSpot patient context integration
 * - Conversation embedding for semantic search
 * - M4: Comprehensive query logging and performance monitoring
 */

export * from './knowledge-base-repository.js';
export * from './vector-search-service.js';
export * from './rag-pipeline.js';
export * from './types.js';

// HubSpot Context Provider for RAG
export {
  HubSpotContextProvider,
  createHubSpotContextProvider,
  HubSpotContextConfigSchema,
  type IHubSpotClient,
  type HubSpotContactForRAG,
  type PatientContext,
  type RAGPatientContext,
  type HubSpotContextConfig,
} from './hubspot-context-provider.js';

// Conversation Embedding Service for semantic search
export {
  ConversationEmbeddingService,
  createConversationEmbeddingService,
  ConversationEmbeddingConfigSchema,
  type ConversationMessage,
  type ConversationSearchResult,
  type ConversationContext,
  type ConversationEmbeddingConfig,
} from './conversation-embedding-service.js';

// M4: Vector Search Query Logger for performance monitoring
export {
  VectorSearchQueryLogger,
  QueryTimer,
  createVectorSearchQueryLogger,
  type VectorSearchQueryLogEntry,
  type VectorSearchQueryLoggerConfig,
  type VectorSearchFilters,
  type QueryComplexity,
  type ClientInfo,
} from './vector-search-query-logger.js';

// M4: RAG Query Analytics for dashboards and alerting
export {
  RAGQueryAnalytics,
  createRAGQueryAnalytics,
  type PerformanceMetric,
  type PerformanceSummary,
  type LatencyDistribution,
  type HourlyMetrics,
  type DailyMetrics,
  type ErrorBreakdown,
  type UseCaseComparison,
  type TrendData,
  type QueryTrend,
  type AlertThresholds,
  type HealthStatus,
} from './rag-query-analytics.js';
