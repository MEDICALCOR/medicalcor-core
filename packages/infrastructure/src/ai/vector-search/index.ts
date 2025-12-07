/**
 * Vector Search Module
 *
 * Provides pgvector-based semantic search with HNSW indexing.
 * Includes optimization, benchmarking, and health monitoring utilities.
 *
 * @module infrastructure/ai/vector-search
 */

// Main service
export {
  PgVectorService,
  type PgVectorConfig,
  type HNSWConfig,
  type VectorSearchResult,
  type VectorSearchFilters,
  type VectorSearchOptions,
  type SearchProfile,
  EF_SEARCH_BY_PROFILE,
} from './PgVectorService.js';

// HNSW optimizer and benchmarking
export {
  HNSWOptimizer,
  type HNSWParams,
  type BenchmarkResult,
  SEARCH_PROFILES,
  RECOMMENDED_PARAMS,
  buildHNSWIndexSQL,
  setEfSearchSQL,
} from './hnsw-optimizer.js';

// Index health monitoring
export {
  IndexHealthMonitor,
  createIndexHealthMonitor,
  type IndexHealthStatus,
  type IndexHealthReport,
  type VectorSearchHealthSummary,
  type IndexPerformanceMetrics,
} from './index-health-monitor.js';
