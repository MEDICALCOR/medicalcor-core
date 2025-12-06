import type { Pool } from 'pg';
import { logger as defaultLogger, generateCorrelationId, type Logger } from '../logger.js';
import type { SearchType, KnowledgeSourceType } from './types.js';

/**
 * Vector Search Query Logger
 *
 * Comprehensive logging service for vector search operations.
 * Tracks query performance, results, and errors for RAG monitoring.
 *
 * Features:
 * - Detailed query logging with performance metrics
 * - Error tracking and classification
 * - Cache hit/miss tracking
 * - Query complexity analysis
 * - Non-blocking database persistence
 */

// =============================================================================
// Types
// =============================================================================

export interface VectorSearchQueryLogEntry {
  id?: string;
  queryText: string;
  queryEmbedding?: number[];
  searchType: SearchType;
  topK: number;
  similarityThreshold?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  filters: VectorSearchFilters;
  resultCount: number;
  resultIds: string[];
  resultScores: number[];
  embeddingLatencyMs?: number;
  searchLatencyMs?: number;
  totalLatencyMs?: number;
  correlationId?: string | null;
  useCase?: string | null;

  // Enhanced M4 fields
  errorMessage?: string | null;
  errorCode?: string | null;
  cacheHit?: boolean;
  queryComplexity?: QueryComplexity;
  sourceTypesSearched?: KnowledgeSourceType[];
  avgResultScore?: number;
  minResultScore?: number;
  maxResultScore?: number;
  embeddingModel?: string;
  embeddingDimensions?: number;
  indexType?: 'hnsw' | 'ivfflat' | 'exact';
  clientInfo?: ClientInfo;
  createdAt?: Date;
}

export interface VectorSearchFilters {
  sourceType?: KnowledgeSourceType;
  sourceTypes?: KnowledgeSourceType[];
  clinicId?: string;
  language?: string;
  tags?: string[];
  excludeIds?: string[];
}

export interface QueryComplexity {
  tokenCount: number;
  wordCount: number;
  hasFilters: boolean;
  filterCount: number;
  isHybrid: boolean;
}

export interface ClientInfo {
  source?: string;
  userAgent?: string;
  requestId?: string;
}

export interface VectorSearchQueryLoggerConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  persistToDatabase: boolean;
  logToConsole: boolean;
  includeEmbeddings: boolean;
  slowQueryThresholdMs: number;
  errorSamplingRate: number;
}

const DEFAULT_CONFIG: VectorSearchQueryLoggerConfig = {
  enabled: true,
  logLevel: 'info',
  persistToDatabase: true,
  logToConsole: true,
  includeEmbeddings: false, // Embeddings are large, disable by default
  slowQueryThresholdMs: 500,
  errorSamplingRate: 1.0, // Log all errors
};

// =============================================================================
// Vector Search Query Logger
// =============================================================================

export class VectorSearchQueryLogger {
  private pool: Pool;
  private config: VectorSearchQueryLoggerConfig;
  private logger: Logger;

  constructor(pool: Pool, config: Partial<VectorSearchQueryLoggerConfig> = {}, logger?: Logger) {
    this.pool = pool;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? defaultLogger.child({ module: 'vector-search-query-logger' });
  }

  /**
   * Log a vector search query with full metrics
   */
  async logQuery(entry: VectorSearchQueryLogEntry): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    const queryId = entry.id ?? generateCorrelationId();
    const enrichedEntry = this.enrichEntry(entry, queryId);

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(enrichedEntry);
    }

    // Persist to database if enabled
    if (this.config.persistToDatabase) {
      await this.persistToDatabase(enrichedEntry);
    }

    return queryId;
  }

  /**
   * Log a search error
   */
  async logError(
    queryText: string,
    error: Error,
    context: Partial<VectorSearchQueryLogEntry> = {}
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Apply error sampling rate
    if (Math.random() > this.config.errorSamplingRate) {
      return;
    }

    const errorEntry: VectorSearchQueryLogEntry = {
      queryText,
      searchType: context.searchType ?? 'semantic',
      topK: context.topK ?? 0,
      filters: context.filters ?? {},
      resultCount: 0,
      resultIds: [],
      resultScores: [],
      correlationId: context.correlationId,
      useCase: context.useCase,
      errorMessage: error.message,
      errorCode: this.classifyError(error),
      totalLatencyMs: context.totalLatencyMs,
    };

    this.logger.error(
      {
        queryText: this.truncateQuery(queryText),
        errorCode: errorEntry.errorCode,
        correlationId: context.correlationId,
        err: error,
      },
      'Vector search query failed'
    );

    if (this.config.persistToDatabase) {
      await this.persistToDatabase(errorEntry);
    }
  }

  /**
   * Log a slow query warning
   */
  logSlowQuery(entry: VectorSearchQueryLogEntry): void {
    if (!this.config.enabled) {
      return;
    }

    const totalLatency = entry.totalLatencyMs ?? 0;
    if (totalLatency >= this.config.slowQueryThresholdMs) {
      this.logger.warn(
        {
          queryText: this.truncateQuery(entry.queryText),
          totalLatencyMs: totalLatency,
          embeddingLatencyMs: entry.embeddingLatencyMs,
          searchLatencyMs: entry.searchLatencyMs,
          searchType: entry.searchType,
          topK: entry.topK,
          resultCount: entry.resultCount,
          correlationId: entry.correlationId,
        },
        'Slow vector search query detected'
      );
    }
  }

  /**
   * Create a query timing tracker for convenience
   */
  createQueryTimer(): QueryTimer {
    return new QueryTimer();
  }

  /**
   * Calculate query complexity metrics
   */
  calculateQueryComplexity(
    queryText: string,
    filters: VectorSearchFilters,
    searchType: SearchType
  ): QueryComplexity {
    const words = queryText.trim().split(/\s+/);
    const filterCount = this.countFilters(filters);

    return {
      tokenCount: Math.ceil(queryText.length / 4), // Rough token estimate
      wordCount: words.length,
      hasFilters: filterCount > 0,
      filterCount,
      isHybrid: searchType === 'hybrid',
    };
  }

  /**
   * Calculate result statistics
   */
  calculateResultStats(scores: number[]): {
    avg: number;
    min: number;
    max: number;
  } {
    if (scores.length === 0) {
      return { avg: 0, min: 0, max: 0 };
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      avg: sum / scores.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<VectorSearchQueryLoggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): VectorSearchQueryLoggerConfig {
    return { ...this.config };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private enrichEntry(
    entry: VectorSearchQueryLogEntry,
    queryId: string
  ): VectorSearchQueryLogEntry {
    const stats = this.calculateResultStats(entry.resultScores);
    const complexity = this.calculateQueryComplexity(
      entry.queryText,
      entry.filters,
      entry.searchType
    );

    // Check for slow query
    this.logSlowQuery(entry);

    return {
      ...entry,
      id: queryId,
      avgResultScore: stats.avg,
      minResultScore: stats.min,
      maxResultScore: stats.max,
      queryComplexity: complexity,
      createdAt: new Date(),
    };
  }

  private logToConsole(entry: VectorSearchQueryLogEntry): void {
    const logData = {
      queryId: entry.id,
      queryText: this.truncateQuery(entry.queryText),
      searchType: entry.searchType,
      topK: entry.topK,
      resultCount: entry.resultCount,
      avgScore: entry.avgResultScore?.toFixed(3),
      embeddingLatencyMs: entry.embeddingLatencyMs,
      searchLatencyMs: entry.searchLatencyMs,
      totalLatencyMs: entry.totalLatencyMs,
      correlationId: entry.correlationId,
      useCase: entry.useCase,
      cacheHit: entry.cacheHit,
      hasError: !!entry.errorMessage,
    };

    if (entry.errorMessage) {
      this.logger.error(logData, 'Vector search query completed with error');
    } else if ((entry.totalLatencyMs ?? 0) >= this.config.slowQueryThresholdMs) {
      this.logger.warn(logData, 'Vector search query completed (slow)');
    } else {
      this.logger.info(logData, 'Vector search query completed');
    }
  }

  private async persistToDatabase(entry: VectorSearchQueryLogEntry): Promise<void> {
    try {
      const params = this.buildQueryParams(entry);
      await this.pool.query(this.getInsertQuery(), params);
    } catch (error) {
      // Don't fail the main operation if logging fails
      this.logger.warn(
        { err: error, queryId: entry.id },
        'Failed to persist vector search query log'
      );
    }
  }

  private getInsertQuery(): string {
    return `
      INSERT INTO rag_query_log (
        id, query_text, query_embedding, search_type, top_k,
        similarity_threshold, filters, result_count, result_ids,
        result_scores, embedding_latency_ms, search_latency_ms,
        total_latency_ms, correlation_id, use_case,
        error_message, error_code, cache_hit,
        semantic_weight, keyword_weight,
        avg_result_score, min_result_score, max_result_score,
        query_token_count, query_word_count, filter_count,
        embedding_model, embedding_dimensions, index_type,
        source_types_searched, client_source
      ) VALUES (
        COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18,
        $19, $20,
        $21, $22, $23,
        $24, $25, $26,
        $27, $28, $29,
        $30, $31
      )
      RETURNING id
    `;
  }

  private buildQueryParams(
    entry: VectorSearchQueryLogEntry
  ): (string | number | boolean | null | string[] | number[])[] {
    const embedding =
      this.config.includeEmbeddings && entry.queryEmbedding
        ? `[${entry.queryEmbedding.join(',')}]`
        : null;

    return [
      entry.id ?? null,
      entry.queryText,
      embedding,
      entry.searchType,
      entry.topK,
      entry.similarityThreshold ?? null,
      JSON.stringify(entry.filters),
      entry.resultCount,
      entry.resultIds,
      entry.resultScores,
      entry.embeddingLatencyMs ?? null,
      entry.searchLatencyMs ?? null,
      entry.totalLatencyMs ?? null,
      entry.correlationId ?? null,
      entry.useCase ?? null,
      entry.errorMessage ?? null,
      entry.errorCode ?? null,
      entry.cacheHit ?? null,
      entry.semanticWeight ?? null,
      entry.keywordWeight ?? null,
      entry.avgResultScore ?? null,
      entry.minResultScore ?? null,
      entry.maxResultScore ?? null,
      entry.queryComplexity?.tokenCount ?? null,
      entry.queryComplexity?.wordCount ?? null,
      entry.queryComplexity?.filterCount ?? null,
      entry.embeddingModel ?? null,
      entry.embeddingDimensions ?? null,
      entry.indexType ?? null,
      entry.sourceTypesSearched ?? null,
      entry.clientInfo?.source ?? null,
    ];
  }

  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('connection')) return 'CONNECTION_ERROR';
    if (message.includes('embedding')) return 'EMBEDDING_ERROR';
    if (message.includes('vector')) return 'VECTOR_ERROR';
    if (message.includes('dimension')) return 'DIMENSION_MISMATCH';
    if (message.includes('index')) return 'INDEX_ERROR';
    if (message.includes('memory')) return 'MEMORY_ERROR';
    if (message.includes('rate limit')) return 'RATE_LIMIT';

    return 'UNKNOWN_ERROR';
  }

  private truncateQuery(query: string, maxLength = 200): string {
    if (query.length <= maxLength) return query;
    return query.slice(0, maxLength - 3) + '...';
  }

  private countFilters(filters: VectorSearchFilters): number {
    let count = 0;
    if (filters.sourceType) count++;
    if (filters.sourceTypes?.length) count++;
    if (filters.clinicId) count++;
    if (filters.language) count++;
    if (filters.tags?.length) count++;
    if (filters.excludeIds?.length) count++;
    return count;
  }
}

// =============================================================================
// Query Timer Helper
// =============================================================================

export class QueryTimer {
  private startTime: number;
  private embeddingStartTime?: number;
  private embeddingEndTime?: number;
  private searchStartTime?: number;
  private searchEndTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  startEmbedding(): void {
    this.embeddingStartTime = Date.now();
  }

  endEmbedding(): void {
    this.embeddingEndTime = Date.now();
  }

  startSearch(): void {
    this.searchStartTime = Date.now();
  }

  endSearch(): void {
    this.searchEndTime = Date.now();
  }

  getMetrics(): {
    embeddingLatencyMs?: number;
    searchLatencyMs?: number;
    totalLatencyMs: number;
  } {
    const now = Date.now();
    return {
      embeddingLatencyMs:
        this.embeddingStartTime && this.embeddingEndTime
          ? this.embeddingEndTime - this.embeddingStartTime
          : undefined,
      searchLatencyMs:
        this.searchStartTime && this.searchEndTime
          ? this.searchEndTime - this.searchStartTime
          : undefined,
      totalLatencyMs: now - this.startTime,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVectorSearchQueryLogger(
  pool: Pool,
  config?: Partial<VectorSearchQueryLoggerConfig>,
  logger?: Logger
): VectorSearchQueryLogger {
  return new VectorSearchQueryLogger(pool, config, logger);
}
