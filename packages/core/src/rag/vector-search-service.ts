import type { Pool } from 'pg';
import type {
  SearchOptions,
  SearchResult,
  SearchResponse,
  KnowledgeSourceType,
  SearchFilters,
} from './types.js';
import { KnowledgeBaseRepository } from './knowledge-base-repository.js';
import {
  VectorSearchQueryLogger,
  QueryTimer,
  type VectorSearchQueryLogEntry,
  type VectorSearchQueryLoggerConfig,
} from './vector-search-query-logger.js';
import { logger as defaultLogger, type Logger } from '../logger.js';

/**
 * Vector Search Service
 *
 * High-level service for semantic and hybrid search operations
 * Wraps pgvector operations with caching, logging, and optimization
 *
 * M4 Enhancement: Integrated query logging for RAG performance monitoring
 */

export interface VectorSearchConfig {
  defaultTopK: number;
  defaultSimilarityThreshold: number;
  defaultSemanticWeight: number;
  defaultKeywordWeight: number;
  maxResults: number;
  enableQueryLogging: boolean;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface VectorSearchContext {
  correlationId?: string;
  useCase?: string;
  clientSource?: string;
  cacheHit?: boolean;
}

const DEFAULT_CONFIG: VectorSearchConfig = {
  defaultTopK: 5,
  defaultSimilarityThreshold: 0.7,
  defaultSemanticWeight: 0.7,
  defaultKeywordWeight: 0.3,
  maxResults: 100,
  enableQueryLogging: true,
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
};

export class VectorSearchService {
  private repository: KnowledgeBaseRepository;
  private config: VectorSearchConfig;
  private pool: Pool;
  private queryLogger: VectorSearchQueryLogger | null;
  private logger: Logger;

  constructor(
    pool: Pool,
    config: Partial<VectorSearchConfig> = {},
    loggerConfig?: Partial<VectorSearchQueryLoggerConfig>,
    logger?: Logger
  ) {
    this.pool = pool;
    this.repository = new KnowledgeBaseRepository(pool);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? defaultLogger.child({ module: 'vector-search-service' });

    // Initialize query logger if logging is enabled
    if (this.config.enableQueryLogging) {
      this.queryLogger = new VectorSearchQueryLogger(pool, loggerConfig, this.logger);
    } else {
      this.queryLogger = null;
    }
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {},
    context: VectorSearchContext = {}
  ): Promise<SearchResponse> {
    const timer = new QueryTimer();
    timer.startSearch();

    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      filters,
      includeMetadata = true,
    } = options;

    try {
      const results = await this.repository.search(queryEmbedding, {
        topK: Math.min(topK, this.config.maxResults),
        similarityThreshold,
        filters: filters ? { ...filters } : {},
      });

      timer.endSearch();

      const searchResults: SearchResult[] = results.map((r) => ({
        id: r.id ?? '',
        sourceType: r.sourceType,
        title: r.title,
        content: r.content,
        similarity: r.similarity,
        metadata: includeMetadata ? r.metadata : {},
        tags: r.tags,
      }));

      const metrics = timer.getMetrics();
      const response: SearchResponse = {
        results: searchResults,
        query,
        searchType: 'semantic',
        totalResults: searchResults.length,
        latencyMs: metrics.totalLatencyMs,
      };

      // Log the query
      await this.logSearchQuery({
        queryText: query,
        queryEmbedding,
        searchType: 'semantic',
        topK,
        similarityThreshold,
        filters: filters ?? {},
        results: searchResults,
        metrics,
        context,
      });

      return response;
    } catch (error) {
      // Log the error
      if (this.queryLogger) {
        await this.queryLogger.logError(query, error as Error, {
          searchType: 'semantic',
          topK,
          filters: filters ?? {},
          correlationId: context.correlationId,
          useCase: context.useCase,
          totalLatencyMs: timer.getMetrics().totalLatencyMs,
        });
      }
      throw error;
    }
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {},
    context: VectorSearchContext = {}
  ): Promise<SearchResponse> {
    const timer = new QueryTimer();
    timer.startSearch();

    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      semanticWeight = this.config.defaultSemanticWeight,
      keywordWeight = this.config.defaultKeywordWeight,
      filters,
      includeMetadata = true,
    } = options;

    try {
      const results = await this.repository.hybridSearch(queryEmbedding, query, {
        topK: Math.min(topK, this.config.maxResults),
        similarityThreshold,
        semanticWeight,
        keywordWeight,
        filters: filters ? { ...filters } : {},
      });

      timer.endSearch();

      const searchResults: SearchResult[] = results.map((r) => ({
        id: r.id ?? '',
        sourceType: r.sourceType,
        title: r.title,
        content: r.content,
        similarity: r.semanticScore,
        keywordScore: r.keywordScore,
        combinedScore: r.combinedScore,
        metadata: includeMetadata ? r.metadata : {},
        tags: r.tags,
      }));

      const metrics = timer.getMetrics();
      const response: SearchResponse = {
        results: searchResults,
        query,
        searchType: 'hybrid',
        totalResults: searchResults.length,
        latencyMs: metrics.totalLatencyMs,
      };

      // Log the query
      await this.logSearchQuery({
        queryText: query,
        queryEmbedding,
        searchType: 'hybrid',
        topK,
        similarityThreshold,
        semanticWeight,
        keywordWeight,
        filters: filters ?? {},
        results: searchResults,
        metrics,
        context,
      });

      return response;
    } catch (error) {
      // Log the error
      if (this.queryLogger) {
        await this.queryLogger.logError(query, error as Error, {
          searchType: 'hybrid',
          topK,
          filters: filters ?? {},
          correlationId: context.correlationId,
          useCase: context.useCase,
          totalLatencyMs: timer.getMetrics().totalLatencyMs,
        });
      }
      throw error;
    }
  }

  /**
   * Search with automatic type selection
   */
  async search(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {},
    context: VectorSearchContext = {}
  ): Promise<SearchResponse> {
    const searchType = options.type ?? 'hybrid';

    if (searchType === 'semantic') {
      return this.semanticSearch(queryEmbedding, query, options, context);
    }

    return this.hybridSearch(queryEmbedding, query, options, context);
  }

  /**
   * Search by source type for specific use cases
   */
  async searchByType(
    queryEmbedding: number[],
    query: string,
    sourceTypes: KnowledgeSourceType[],
    options: Partial<Omit<SearchOptions, 'filters'>> = {}
  ): Promise<SearchResponse> {
    return this.search(queryEmbedding, query, {
      ...options,
      filters: { sourceTypes },
    });
  }

  /**
   * Search FAQs specifically
   */
  async searchFAQs(
    queryEmbedding: number[],
    query: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = { sourceType: 'faq' };
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 3,
      similarityThreshold: 0.6,
    });
  }

  /**
   * Search clinic protocols
   */
  async searchProtocols(
    queryEmbedding: number[],
    query: string,
    clinicId?: string
  ): Promise<SearchResponse> {
    const filters: SearchFilters = { sourceType: 'clinic_protocol' };
    if (clinicId) filters.clinicId = clinicId;

    return this.search(queryEmbedding, query, {
      type: 'semantic',
      filters,
      topK: 3,
      similarityThreshold: 0.65,
    });
  }

  /**
   * Search for scoring context (FAQs + protocols + treatment info)
   */
  async searchForScoring(
    queryEmbedding: number[],
    query: string,
    clinicId?: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = {
      sourceTypes: ['faq', 'clinic_protocol', 'treatment_info', 'pricing_info'],
    };
    if (clinicId) filters.clinicId = clinicId;
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 5,
      similarityThreshold: 0.6,
      semanticWeight: 0.8,
      keywordWeight: 0.2,
    });
  }

  /**
   * Search for reply generation context
   */
  async searchForReply(
    queryEmbedding: number[],
    query: string,
    clinicId?: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = {
      sourceTypes: ['faq', 'treatment_info', 'appointment_policy', 'marketing_content'],
    };
    if (clinicId) filters.clinicId = clinicId;
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 4,
      similarityThreshold: 0.65,
      semanticWeight: 0.7,
      keywordWeight: 0.3,
    });
  }

  /**
   * Get configuration
   */
  getConfig(): VectorSearchConfig {
    return { ...this.config };
  }

  /**
   * Get underlying repository for advanced operations
   */
  getRepository(): KnowledgeBaseRepository {
    return this.repository;
  }

  /**
   * Get query logger for direct access (e.g., for analytics)
   */
  getQueryLogger(): VectorSearchQueryLogger | null {
    return this.queryLogger;
  }

  /**
   * Enable or disable query logging at runtime
   */
  setQueryLoggingEnabled(enabled: boolean): void {
    if (enabled && !this.queryLogger) {
      this.queryLogger = new VectorSearchQueryLogger(this.pool, {}, this.logger);
    } else if (!enabled) {
      this.queryLogger = null;
    }
    this.config.enableQueryLogging = enabled;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Log a search query with metrics
   */
  private async logSearchQuery(params: {
    queryText: string;
    queryEmbedding: number[];
    searchType: 'semantic' | 'hybrid';
    topK: number;
    similarityThreshold?: number;
    semanticWeight?: number;
    keywordWeight?: number;
    filters: SearchFilters;
    results: SearchResult[];
    metrics: { embeddingLatencyMs?: number; searchLatencyMs?: number; totalLatencyMs: number };
    context: VectorSearchContext;
  }): Promise<void> {
    if (!this.queryLogger) {
      return;
    }

    const {
      queryText,
      queryEmbedding,
      searchType,
      topK,
      similarityThreshold,
      semanticWeight,
      keywordWeight,
      filters,
      results,
      metrics,
      context,
    } = params;

    const entry: VectorSearchQueryLogEntry = {
      queryText,
      queryEmbedding,
      searchType,
      topK,
      similarityThreshold,
      semanticWeight,
      keywordWeight,
      filters: {
        sourceType: filters.sourceType,
        sourceTypes: filters.sourceTypes,
        clinicId: filters.clinicId,
        language: filters.language,
        tags: filters.tags,
        excludeIds: filters.excludeIds,
      },
      resultCount: results.length,
      resultIds: results.map((r) => r.id),
      resultScores: results.map((r) => r.similarity),
      embeddingLatencyMs: metrics.embeddingLatencyMs,
      searchLatencyMs: metrics.searchLatencyMs,
      totalLatencyMs: metrics.totalLatencyMs,
      correlationId: context.correlationId,
      useCase: context.useCase,
      cacheHit: context.cacheHit,
      sourceTypesSearched:
        filters.sourceTypes ?? (filters.sourceType ? [filters.sourceType] : undefined),
      embeddingModel: this.config.embeddingModel,
      embeddingDimensions: this.config.embeddingDimensions,
      clientInfo: context.clientSource ? { source: context.clientSource } : undefined,
    };

    await this.queryLogger.logQuery(entry);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVectorSearchService(
  pool: Pool,
  config?: Partial<VectorSearchConfig>,
  loggerConfig?: Partial<VectorSearchQueryLoggerConfig>
): VectorSearchService {
  return new VectorSearchService(pool, config, loggerConfig);
}

// Re-export types for convenience
export type {
  VectorSearchQueryLogEntry,
  VectorSearchQueryLoggerConfig,
} from './vector-search-query-logger.js';
