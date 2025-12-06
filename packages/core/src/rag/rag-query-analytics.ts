import type { Pool } from 'pg';
import { logger as defaultLogger, type Logger } from '../logger.js';
import type { SearchType } from './types.js';

/**
 * RAG Query Analytics Service
 *
 * Provides performance monitoring and analytics for vector search operations.
 * Enables real-time and historical analysis of:
 * - Query latency distribution
 * - Result quality metrics
 * - Error rates and classification
 * - Cache effectiveness
 * - Use case performance comparison
 *
 * Features:
 * - Real-time performance summaries
 * - Hourly/daily metric aggregation
 * - Trend analysis
 * - Alerting thresholds
 */

// =============================================================================
// Database Row Types (for type-safe query results)
// =============================================================================

interface PerformanceSummaryRow {
  metric_name: string;
  metric_value: string;
  unit: string;
}

interface LatencyDistributionRow {
  p50: string | null;
  p75: string | null;
  p90: string | null;
  p95: string | null;
  p99: string | null;
  max: string | null;
  avg: string | null;
}

interface ErrorBreakdownRow {
  error_code: string;
  count: string;
  percentage: string;
}

interface UseCaseComparisonRow {
  use_case: string | null;
  total_queries: string;
  avg_latency_ms: string | null;
  success_rate: string;
  avg_result_score: string | null;
  zero_result_rate: string;
}

interface TrendRow {
  timestamp: string;
  value: string;
}

interface HourlyMetricsRow {
  hour_start: string;
  use_case: string | null;
  search_type: string;
  clinic_id: string | null;
  total_queries: string;
  successful_queries: string;
  failed_queries: string;
  zero_result_queries: string;
  cache_hit_queries: string;
  slow_queries: string;
  avg_total_latency_ms: string | null;
  p50_total_latency_ms: string | null;
  p95_total_latency_ms: string | null;
  p99_total_latency_ms: string | null;
  max_total_latency_ms: string | null;
  avg_embedding_latency_ms: string | null;
  avg_search_latency_ms: string | null;
  avg_result_count: string | null;
  avg_result_score: string | null;
}

interface DailyMetricsRow {
  day_start: string;
  use_case: string | null;
  search_type: string;
  total_queries: string;
  successful_queries: string;
  failed_queries: string;
  zero_result_queries: string;
  timeout_errors: string | null;
  connection_errors: string | null;
  embedding_errors: string | null;
  other_errors: string | null;
  avg_total_latency_ms: string | null;
  p95_total_latency_ms: string | null;
  avg_result_count: string | null;
  avg_result_score: string | null;
  cache_hit_rate: string | null;
}

interface SlowQueryRow {
  query_text: string;
  total_latency_ms: string;
  embedding_latency_ms: string | null;
  search_latency_ms: string | null;
  search_type: string;
  result_count: string;
  created_at: string;
  correlation_id: string | null;
}

interface LowScoreQueryRow {
  query_text: string;
  avg_result_score: string;
  result_count: string;
  search_type: string;
  use_case: string | null;
  created_at: string;
}

interface ZeroResultQueryRow {
  query_text: string;
  search_type: string;
  use_case: string | null;
  filters: Record<string, unknown> | null;
  created_at: string;
}

interface AggregationResultRow {
  rows_affected: string;
}

// =============================================================================
// Types
// =============================================================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
}

export interface PerformanceSummary {
  timeRangeHours: number;
  useCase?: string;
  metrics: PerformanceMetric[];
  generatedAt: Date;
}

export interface LatencyDistribution {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

export interface HourlyMetrics {
  hourStart: Date;
  useCase: string | null;
  searchType: SearchType;
  clinicId: string | null;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  zeroResultQueries: number;
  cacheHitQueries: number;
  slowQueries: number;
  avgTotalLatencyMs: number;
  p50TotalLatencyMs: number;
  p95TotalLatencyMs: number;
  p99TotalLatencyMs: number;
  maxTotalLatencyMs: number;
  avgEmbeddingLatencyMs: number;
  avgSearchLatencyMs: number;
  avgResultCount: number;
  avgResultScore: number;
}

export interface DailyMetrics {
  dayStart: Date;
  useCase: string | null;
  searchType: SearchType;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  zeroResultQueries: number;
  timeoutErrors: number;
  connectionErrors: number;
  embeddingErrors: number;
  otherErrors: number;
  avgTotalLatencyMs: number;
  p95TotalLatencyMs: number;
  avgResultCount: number;
  avgResultScore: number;
  cacheHitRate: number;
}

export interface ErrorBreakdown {
  errorCode: string;
  count: number;
  percentage: number;
}

export interface UseCaseComparison {
  useCase: string;
  totalQueries: number;
  avgLatencyMs: number;
  successRate: number;
  avgResultScore: number;
  zeroResultRate: number;
}

export interface TrendData {
  timestamp: Date;
  value: number;
}

export interface QueryTrend {
  metricName: string;
  timeRange: string;
  dataPoints: TrendData[];
}

export interface AlertThresholds {
  maxP95LatencyMs: number;
  maxErrorRatePercent: number;
  maxZeroResultRatePercent: number;
  minCacheHitRatePercent: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  issues: string[];
  metrics: PerformanceMetric[];
  checkedAt: Date;
}

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  maxP95LatencyMs: 1000,
  maxErrorRatePercent: 5,
  maxZeroResultRatePercent: 20,
  minCacheHitRatePercent: 30,
};

// =============================================================================
// RAG Query Analytics Service
// =============================================================================

export class RAGQueryAnalytics {
  private pool: Pool;
  private logger: Logger;
  private alertThresholds: AlertThresholds;

  constructor(pool: Pool, alertThresholds: Partial<AlertThresholds> = {}, logger?: Logger) {
    this.pool = pool;
    this.alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...alertThresholds };
    this.logger = logger ?? defaultLogger.child({ module: 'rag-query-analytics' });
  }

  // ===========================================================================
  // Performance Summary
  // ===========================================================================

  /**
   * Get a performance summary for a given time range
   */
  async getPerformanceSummary(timeRangeHours = 24, useCase?: string): Promise<PerformanceSummary> {
    const result = await this.pool.query<PerformanceSummaryRow>(
      'SELECT * FROM get_rag_performance_summary($1, $2)',
      [timeRangeHours, useCase ?? null]
    );

    const metrics: PerformanceMetric[] = result.rows.map((row) => ({
      name: row.metric_name,
      value: parseFloat(row.metric_value) || 0,
      unit: row.unit,
    }));

    return {
      timeRangeHours,
      useCase,
      metrics,
      generatedAt: new Date(),
    };
  }

  /**
   * Get latency distribution for recent queries
   */
  async getLatencyDistribution(
    timeRangeHours = 24,
    useCase?: string
  ): Promise<LatencyDistribution> {
    const query = `
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_latency_ms) AS p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_latency_ms) AS p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_latency_ms) AS p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms) AS p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms) AS p99,
        MAX(total_latency_ms) AS max,
        AVG(total_latency_ms) AS avg
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND ($2::VARCHAR IS NULL OR use_case = $2)
        AND total_latency_ms IS NOT NULL
    `;

    const result = await this.pool.query<LatencyDistributionRow>(query, [
      timeRangeHours,
      useCase ?? null,
    ]);
    const row = result.rows[0];

    return {
      p50: parseFloat(row?.p50 ?? '0') || 0,
      p75: parseFloat(row?.p75 ?? '0') || 0,
      p90: parseFloat(row?.p90 ?? '0') || 0,
      p95: parseFloat(row?.p95 ?? '0') || 0,
      p99: parseFloat(row?.p99 ?? '0') || 0,
      max: parseFloat(row?.max ?? '0') || 0,
      avg: parseFloat(row?.avg ?? '0') || 0,
    };
  }

  // ===========================================================================
  // Error Analysis
  // ===========================================================================

  /**
   * Get error breakdown by type
   */
  async getErrorBreakdown(timeRangeHours = 24, useCase?: string): Promise<ErrorBreakdown[]> {
    const query = `
      WITH error_counts AS (
        SELECT
          error_code,
          COUNT(*) AS count
        FROM rag_query_log
        WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
          AND ($2::VARCHAR IS NULL OR use_case = $2)
          AND error_code IS NOT NULL
        GROUP BY error_code
      ),
      total_errors AS (
        SELECT SUM(count) AS total FROM error_counts
      )
      SELECT
        ec.error_code,
        ec.count,
        CASE WHEN te.total > 0
             THEN (ec.count::DECIMAL / te.total * 100)
             ELSE 0 END AS percentage
      FROM error_counts ec, total_errors te
      ORDER BY ec.count DESC
    `;

    const result = await this.pool.query<ErrorBreakdownRow>(query, [
      timeRangeHours,
      useCase ?? null,
    ]);

    return result.rows.map((row) => ({
      errorCode: row.error_code,
      count: parseInt(row.count),
      percentage: parseFloat(row.percentage) || 0,
    }));
  }

  // ===========================================================================
  // Use Case Comparison
  // ===========================================================================

  /**
   * Compare performance across use cases
   */
  async getUseCaseComparison(timeRangeHours = 24): Promise<UseCaseComparison[]> {
    const query = `
      SELECT
        use_case,
        COUNT(*) AS total_queries,
        AVG(total_latency_ms) AS avg_latency_ms,
        CASE WHEN COUNT(*) > 0
             THEN (COUNT(*) FILTER (WHERE error_code IS NULL))::DECIMAL / COUNT(*) * 100
             ELSE 0 END AS success_rate,
        AVG(avg_result_score) AS avg_result_score,
        CASE WHEN COUNT(*) > 0
             THEN (COUNT(*) FILTER (WHERE result_count = 0 AND error_code IS NULL))::DECIMAL / COUNT(*) * 100
             ELSE 0 END AS zero_result_rate
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY use_case
      ORDER BY total_queries DESC
    `;

    const result = await this.pool.query<UseCaseComparisonRow>(query, [timeRangeHours]);

    return result.rows.map((row) => ({
      useCase: row.use_case ?? 'unknown',
      totalQueries: parseInt(row.total_queries),
      avgLatencyMs: parseFloat(row.avg_latency_ms ?? '0') || 0,
      successRate: parseFloat(row.success_rate) || 0,
      avgResultScore: parseFloat(row.avg_result_score ?? '0') || 0,
      zeroResultRate: parseFloat(row.zero_result_rate) || 0,
    }));
  }

  // ===========================================================================
  // Trend Analysis
  // ===========================================================================

  /**
   * Get hourly latency trend
   */
  async getLatencyTrend(timeRangeHours = 24, useCase?: string): Promise<QueryTrend> {
    const query = `
      SELECT
        date_trunc('hour', created_at) AS timestamp,
        AVG(total_latency_ms) AS value
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND ($2::VARCHAR IS NULL OR use_case = $2)
        AND total_latency_ms IS NOT NULL
      GROUP BY date_trunc('hour', created_at)
      ORDER BY timestamp
    `;

    const result = await this.pool.query<TrendRow>(query, [timeRangeHours, useCase ?? null]);

    return {
      metricName: 'avg_latency_ms',
      timeRange: `${timeRangeHours}h`,
      dataPoints: result.rows.map((row) => ({
        timestamp: new Date(row.timestamp),
        value: parseFloat(row.value) || 0,
      })),
    };
  }

  /**
   * Get hourly query volume trend
   */
  async getQueryVolumeTrend(timeRangeHours = 24, useCase?: string): Promise<QueryTrend> {
    const query = `
      SELECT
        date_trunc('hour', created_at) AS timestamp,
        COUNT(*) AS value
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND ($2::VARCHAR IS NULL OR use_case = $2)
      GROUP BY date_trunc('hour', created_at)
      ORDER BY timestamp
    `;

    const result = await this.pool.query<TrendRow>(query, [timeRangeHours, useCase ?? null]);

    return {
      metricName: 'query_volume',
      timeRange: `${timeRangeHours}h`,
      dataPoints: result.rows.map((row) => ({
        timestamp: new Date(row.timestamp),
        value: parseInt(row.value),
      })),
    };
  }

  /**
   * Get hourly error rate trend
   */
  async getErrorRateTrend(timeRangeHours = 24, useCase?: string): Promise<QueryTrend> {
    const query = `
      SELECT
        date_trunc('hour', created_at) AS timestamp,
        CASE WHEN COUNT(*) > 0
             THEN (COUNT(*) FILTER (WHERE error_code IS NOT NULL))::DECIMAL / COUNT(*) * 100
             ELSE 0 END AS value
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND ($2::VARCHAR IS NULL OR use_case = $2)
      GROUP BY date_trunc('hour', created_at)
      ORDER BY timestamp
    `;

    const result = await this.pool.query<TrendRow>(query, [timeRangeHours, useCase ?? null]);

    return {
      metricName: 'error_rate_percent',
      timeRange: `${timeRangeHours}h`,
      dataPoints: result.rows.map((row) => ({
        timestamp: new Date(row.timestamp),
        value: parseFloat(row.value) || 0,
      })),
    };
  }

  // ===========================================================================
  // Aggregated Metrics
  // ===========================================================================

  /**
   * Get hourly metrics for a time range
   */
  async getHourlyMetrics(
    startTime: Date,
    endTime: Date,
    useCase?: string
  ): Promise<HourlyMetrics[]> {
    const query = `
      SELECT *
      FROM rag_query_metrics_hourly
      WHERE hour_start >= $1
        AND hour_start < $2
        AND ($3::VARCHAR IS NULL OR use_case = $3)
      ORDER BY hour_start DESC
    `;

    const result = await this.pool.query<HourlyMetricsRow>(query, [
      startTime,
      endTime,
      useCase ?? null,
    ]);

    return result.rows.map((row) => ({
      hourStart: new Date(row.hour_start),
      useCase: row.use_case,
      searchType: row.search_type as SearchType,
      clinicId: row.clinic_id,
      totalQueries: parseInt(row.total_queries),
      successfulQueries: parseInt(row.successful_queries),
      failedQueries: parseInt(row.failed_queries),
      zeroResultQueries: parseInt(row.zero_result_queries),
      cacheHitQueries: parseInt(row.cache_hit_queries),
      slowQueries: parseInt(row.slow_queries),
      avgTotalLatencyMs: parseFloat(row.avg_total_latency_ms ?? '0') || 0,
      p50TotalLatencyMs: parseInt(row.p50_total_latency_ms ?? '0') || 0,
      p95TotalLatencyMs: parseInt(row.p95_total_latency_ms ?? '0') || 0,
      p99TotalLatencyMs: parseInt(row.p99_total_latency_ms ?? '0') || 0,
      maxTotalLatencyMs: parseInt(row.max_total_latency_ms ?? '0') || 0,
      avgEmbeddingLatencyMs: parseFloat(row.avg_embedding_latency_ms ?? '0') || 0,
      avgSearchLatencyMs: parseFloat(row.avg_search_latency_ms ?? '0') || 0,
      avgResultCount: parseFloat(row.avg_result_count ?? '0') || 0,
      avgResultScore: parseFloat(row.avg_result_score ?? '0') || 0,
    }));
  }

  /**
   * Get daily metrics for a time range
   */
  async getDailyMetrics(startDate: Date, endDate: Date, useCase?: string): Promise<DailyMetrics[]> {
    const query = `
      SELECT *
      FROM rag_query_metrics_daily
      WHERE day_start >= $1::DATE
        AND day_start <= $2::DATE
        AND ($3::VARCHAR IS NULL OR use_case = $3)
      ORDER BY day_start DESC
    `;

    const result = await this.pool.query<DailyMetricsRow>(query, [
      startDate,
      endDate,
      useCase ?? null,
    ]);

    return result.rows.map((row) => ({
      dayStart: new Date(row.day_start),
      useCase: row.use_case,
      searchType: row.search_type as SearchType,
      totalQueries: parseInt(row.total_queries),
      successfulQueries: parseInt(row.successful_queries),
      failedQueries: parseInt(row.failed_queries),
      zeroResultQueries: parseInt(row.zero_result_queries),
      timeoutErrors: parseInt(row.timeout_errors ?? '0') || 0,
      connectionErrors: parseInt(row.connection_errors ?? '0') || 0,
      embeddingErrors: parseInt(row.embedding_errors ?? '0') || 0,
      otherErrors: parseInt(row.other_errors ?? '0') || 0,
      avgTotalLatencyMs: parseFloat(row.avg_total_latency_ms ?? '0') || 0,
      p95TotalLatencyMs: parseInt(row.p95_total_latency_ms ?? '0') || 0,
      avgResultCount: parseFloat(row.avg_result_count ?? '0') || 0,
      avgResultScore: parseFloat(row.avg_result_score ?? '0') || 0,
      cacheHitRate: parseFloat(row.cache_hit_rate ?? '0') || 0,
    }));
  }

  /**
   * Trigger hourly metrics aggregation
   */
  async aggregateHourlyMetrics(targetHour?: Date): Promise<number> {
    const result = await this.pool.query<AggregationResultRow>(
      'SELECT aggregate_rag_query_metrics_hourly($1) AS rows_affected',
      [targetHour ?? null]
    );
    return parseInt(result.rows[0]?.rows_affected ?? '0') || 0;
  }

  /**
   * Trigger daily metrics aggregation
   */
  async aggregateDailyMetrics(targetDay?: Date): Promise<number> {
    const result = await this.pool.query<AggregationResultRow>(
      'SELECT aggregate_rag_query_metrics_daily($1) AS rows_affected',
      [targetDay ?? null]
    );
    return parseInt(result.rows[0]?.rows_affected ?? '0') || 0;
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * Check RAG system health based on recent metrics
   */
  async checkHealth(timeRangeHours = 1): Promise<HealthStatus> {
    const summary = await this.getPerformanceSummary(timeRangeHours);
    const latency = await this.getLatencyDistribution(timeRangeHours);

    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Extract metrics
    const successRateMetric = summary.metrics.find((m) => m.name === 'success_rate');
    const zeroResultRateMetric = summary.metrics.find((m) => m.name === 'zero_result_rate');
    const cacheHitRateMetric = summary.metrics.find((m) => m.name === 'cache_hit_rate');

    const successRate = successRateMetric?.value ?? 100;
    const zeroResultRate = zeroResultRateMetric?.value ?? 0;
    const cacheHitRate = cacheHitRateMetric?.value ?? 100;
    const errorRate = 100 - successRate;

    // Check P95 latency
    if (latency.p95 > this.alertThresholds.maxP95LatencyMs) {
      issues.push(
        `P95 latency (${latency.p95.toFixed(0)}ms) exceeds threshold (${this.alertThresholds.maxP95LatencyMs}ms)`
      );
      status = 'degraded';
    }

    // Check error rate
    if (errorRate > this.alertThresholds.maxErrorRatePercent) {
      issues.push(
        `Error rate (${errorRate.toFixed(1)}%) exceeds threshold (${this.alertThresholds.maxErrorRatePercent}%)`
      );
      status = errorRate > this.alertThresholds.maxErrorRatePercent * 2 ? 'critical' : 'degraded';
    }

    // Check zero result rate
    if (zeroResultRate > this.alertThresholds.maxZeroResultRatePercent) {
      issues.push(
        `Zero result rate (${zeroResultRate.toFixed(1)}%) exceeds threshold (${this.alertThresholds.maxZeroResultRatePercent}%)`
      );
      if (status !== 'critical') status = 'degraded';
    }

    // Check cache hit rate
    if (cacheHitRate < this.alertThresholds.minCacheHitRatePercent) {
      issues.push(
        `Cache hit rate (${cacheHitRate.toFixed(1)}%) below threshold (${this.alertThresholds.minCacheHitRatePercent}%)`
      );
      // Low cache hit rate is a warning, not critical
    }

    // Log health status
    if (status !== 'healthy') {
      this.logger.warn({ status, issues, timeRangeHours }, 'RAG health check detected issues');
    }

    return {
      status,
      issues,
      metrics: [
        { name: 'p95_latency_ms', value: latency.p95, unit: 'ms' },
        { name: 'error_rate', value: errorRate, unit: 'percent' },
        { name: 'zero_result_rate', value: zeroResultRate, unit: 'percent' },
        { name: 'cache_hit_rate', value: cacheHitRate, unit: 'percent' },
      ],
      checkedAt: new Date(),
    };
  }

  // ===========================================================================
  // Top Queries Analysis
  // ===========================================================================

  /**
   * Get slowest queries for analysis
   */
  async getSlowestQueries(
    limit = 10,
    timeRangeHours = 24
  ): Promise<
    {
      queryText: string;
      totalLatencyMs: number;
      embeddingLatencyMs: number;
      searchLatencyMs: number;
      searchType: SearchType;
      resultCount: number;
      createdAt: Date;
      correlationId: string | null;
    }[]
  > {
    const query = `
      SELECT
        query_text,
        total_latency_ms,
        embedding_latency_ms,
        search_latency_ms,
        search_type,
        result_count,
        created_at,
        correlation_id
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND total_latency_ms IS NOT NULL
      ORDER BY total_latency_ms DESC
      LIMIT $2
    `;

    const result = await this.pool.query<SlowQueryRow>(query, [timeRangeHours, limit]);

    return result.rows.map((row) => ({
      queryText: row.query_text,
      totalLatencyMs: parseInt(row.total_latency_ms),
      embeddingLatencyMs: parseInt(row.embedding_latency_ms ?? '0') || 0,
      searchLatencyMs: parseInt(row.search_latency_ms ?? '0') || 0,
      searchType: row.search_type as SearchType,
      resultCount: parseInt(row.result_count),
      createdAt: new Date(row.created_at),
      correlationId: row.correlation_id,
    }));
  }

  /**
   * Get queries with lowest result scores (potential relevance issues)
   */
  async getLowScoreQueries(
    limit = 10,
    timeRangeHours = 24,
    maxScore = 0.5
  ): Promise<
    {
      queryText: string;
      avgResultScore: number;
      resultCount: number;
      searchType: SearchType;
      useCase: string | null;
      createdAt: Date;
    }[]
  > {
    const query = `
      SELECT
        query_text,
        avg_result_score,
        result_count,
        search_type,
        use_case,
        created_at
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND avg_result_score IS NOT NULL
        AND avg_result_score <= $3
        AND result_count > 0
      ORDER BY avg_result_score ASC
      LIMIT $2
    `;

    const result = await this.pool.query<LowScoreQueryRow>(query, [
      timeRangeHours,
      limit,
      maxScore,
    ]);

    return result.rows.map((row) => ({
      queryText: row.query_text,
      avgResultScore: parseFloat(row.avg_result_score),
      resultCount: parseInt(row.result_count),
      searchType: row.search_type as SearchType,
      useCase: row.use_case,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get zero-result queries for knowledge gap analysis
   */
  async getZeroResultQueries(
    limit = 50,
    timeRangeHours = 24
  ): Promise<
    {
      queryText: string;
      searchType: SearchType;
      useCase: string | null;
      filters: Record<string, unknown>;
      createdAt: Date;
    }[]
  > {
    const query = `
      SELECT
        query_text,
        search_type,
        use_case,
        filters,
        created_at
      FROM rag_query_log
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
        AND result_count = 0
        AND error_code IS NULL
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query<ZeroResultQueryRow>(query, [timeRangeHours, limit]);

    return result.rows.map((row) => ({
      queryText: row.query_text,
      searchType: row.search_type as SearchType,
      useCase: row.use_case,
      filters: row.filters ?? {},
      createdAt: new Date(row.created_at),
    }));
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Update alert thresholds
   */
  updateAlertThresholds(updates: Partial<AlertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...updates };
  }

  /**
   * Get current alert thresholds
   */
  getAlertThresholds(): AlertThresholds {
    return { ...this.alertThresholds };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRAGQueryAnalytics(
  pool: Pool,
  alertThresholds?: Partial<AlertThresholds>,
  logger?: Logger
): RAGQueryAnalytics {
  return new RAGQueryAnalytics(pool, alertThresholds, logger);
}
