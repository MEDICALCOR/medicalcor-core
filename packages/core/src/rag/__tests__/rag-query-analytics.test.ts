/**
 * @fileoverview Tests for RAG Query Analytics Service
 *
 * M4: Tests for performance monitoring, health checks, and trend analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RAGQueryAnalytics,
  createRAGQueryAnalytics,
  type AlertThresholds,
} from '../rag-query-analytics.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool() {
  const mockPool = {
    query: vi.fn(),
  };
  return mockPool;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ============================================================================
// RAG QUERY ANALYTICS TESTS
// ============================================================================

describe('RAGQueryAnalytics', () => {
  let analytics: RAGQueryAnalytics;
  let mockPool: ReturnType<typeof createMockPool>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockPool = createMockPool();
    mockLogger = createMockLogger();
    analytics = new RAGQueryAnalytics(
      mockPool as unknown as import('pg').Pool,
      {},
      mockLogger as unknown as import('pino').Logger
    );
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create analytics with default thresholds', () => {
      const thresholds = analytics.getAlertThresholds();

      expect(thresholds.maxP95LatencyMs).toBe(1000);
      expect(thresholds.maxErrorRatePercent).toBe(5);
      expect(thresholds.maxZeroResultRatePercent).toBe(20);
      expect(thresholds.minCacheHitRatePercent).toBe(30);
    });

    it('should create analytics with custom thresholds', () => {
      const customThresholds: Partial<AlertThresholds> = {
        maxP95LatencyMs: 500,
        maxErrorRatePercent: 2,
      };

      const customAnalytics = new RAGQueryAnalytics(
        mockPool as unknown as import('pg').Pool,
        customThresholds,
        mockLogger as unknown as import('pino').Logger
      );
      const thresholds = customAnalytics.getAlertThresholds();

      expect(thresholds.maxP95LatencyMs).toBe(500);
      expect(thresholds.maxErrorRatePercent).toBe(2);
      expect(thresholds.maxZeroResultRatePercent).toBe(20); // Default
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return performance summary', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { metric_name: 'total_queries', metric_value: '1000', unit: 'count' },
          { metric_name: 'success_rate', metric_value: '98.5', unit: 'percent' },
          { metric_name: 'avg_latency_ms', metric_value: '150.5', unit: 'ms' },
        ],
      });

      const summary = await analytics.getPerformanceSummary(24);

      expect(summary.timeRangeHours).toBe(24);
      expect(summary.metrics).toHaveLength(3);
      expect(summary.metrics[0].name).toBe('total_queries');
      expect(summary.metrics[0].value).toBe(1000);
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });

    it('should filter by use case', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await analytics.getPerformanceSummary(24, 'scoring');

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [24, 'scoring']);
    });
  });

  describe('getLatencyDistribution', () => {
    it('should return latency percentiles', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            p50: '100',
            p75: '150',
            p90: '200',
            p95: '300',
            p99: '500',
            max: '1500',
            avg: '125.5',
          },
        ],
      });

      const distribution = await analytics.getLatencyDistribution(24);

      expect(distribution.p50).toBe(100);
      expect(distribution.p75).toBe(150);
      expect(distribution.p90).toBe(200);
      expect(distribution.p95).toBe(300);
      expect(distribution.p99).toBe(500);
      expect(distribution.max).toBe(1500);
      expect(distribution.avg).toBe(125.5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{}] });

      const distribution = await analytics.getLatencyDistribution(24);

      expect(distribution.p50).toBe(0);
      expect(distribution.avg).toBe(0);
    });
  });

  describe('getErrorBreakdown', () => {
    it('should return error breakdown by type', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { error_code: 'TIMEOUT', count: '50', percentage: '40' },
          { error_code: 'EMBEDDING_ERROR', count: '30', percentage: '24' },
          { error_code: 'CONNECTION_ERROR', count: '20', percentage: '16' },
        ],
      });

      const breakdown = await analytics.getErrorBreakdown(24);

      expect(breakdown).toHaveLength(3);
      expect(breakdown[0].errorCode).toBe('TIMEOUT');
      expect(breakdown[0].count).toBe(50);
      expect(breakdown[0].percentage).toBe(40);
    });

    it('should handle no errors', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const breakdown = await analytics.getErrorBreakdown(24);

      expect(breakdown).toHaveLength(0);
    });
  });

  describe('getUseCaseComparison', () => {
    it('should compare performance across use cases', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            use_case: 'scoring',
            total_queries: '500',
            avg_latency_ms: '120',
            success_rate: '99',
            avg_result_score: '0.85',
            zero_result_rate: '5',
          },
          {
            use_case: 'reply_generation',
            total_queries: '300',
            avg_latency_ms: '150',
            success_rate: '97',
            avg_result_score: '0.82',
            zero_result_rate: '8',
          },
        ],
      });

      const comparison = await analytics.getUseCaseComparison(24);

      expect(comparison).toHaveLength(2);
      expect(comparison[0].useCase).toBe('scoring');
      expect(comparison[0].totalQueries).toBe(500);
      expect(comparison[0].avgLatencyMs).toBe(120);
      expect(comparison[1].useCase).toBe('reply_generation');
    });
  });

  describe('getLatencyTrend', () => {
    it('should return hourly latency trend', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { timestamp: '2024-01-01T00:00:00Z', value: '100' },
          { timestamp: '2024-01-01T01:00:00Z', value: '110' },
          { timestamp: '2024-01-01T02:00:00Z', value: '95' },
        ],
      });

      const trend = await analytics.getLatencyTrend(24);

      expect(trend.metricName).toBe('avg_latency_ms');
      expect(trend.timeRange).toBe('24h');
      expect(trend.dataPoints).toHaveLength(3);
      expect(trend.dataPoints[0].timestamp).toBeInstanceOf(Date);
      expect(trend.dataPoints[0].value).toBe(100);
    });
  });

  describe('getQueryVolumeTrend', () => {
    it('should return hourly query volume trend', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { timestamp: '2024-01-01T00:00:00Z', value: '100' },
          { timestamp: '2024-01-01T01:00:00Z', value: '150' },
        ],
      });

      const trend = await analytics.getQueryVolumeTrend(24);

      expect(trend.metricName).toBe('query_volume');
      expect(trend.dataPoints).toHaveLength(2);
      expect(trend.dataPoints[1].value).toBe(150);
    });
  });

  describe('getErrorRateTrend', () => {
    it('should return hourly error rate trend', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { timestamp: '2024-01-01T00:00:00Z', value: '2.5' },
          { timestamp: '2024-01-01T01:00:00Z', value: '3.0' },
        ],
      });

      const trend = await analytics.getErrorRateTrend(24);

      expect(trend.metricName).toBe('error_rate_percent');
      expect(trend.dataPoints[0].value).toBe(2.5);
    });
  });

  describe('getHourlyMetrics', () => {
    it('should return hourly aggregated metrics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            hour_start: '2024-01-01T00:00:00Z',
            use_case: 'scoring',
            search_type: 'hybrid',
            clinic_id: 'clinic-1',
            total_queries: '100',
            successful_queries: '98',
            failed_queries: '2',
            zero_result_queries: '5',
            cache_hit_queries: '40',
            slow_queries: '3',
            avg_total_latency_ms: '120.5',
            p50_total_latency_ms: '100',
            p95_total_latency_ms: '300',
            p99_total_latency_ms: '500',
            max_total_latency_ms: '1000',
            avg_embedding_latency_ms: '30.5',
            avg_search_latency_ms: '50.2',
            avg_result_count: '3.5',
            avg_result_score: '0.82',
          },
        ],
      });

      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-01-02T00:00:00Z');

      const metrics = await analytics.getHourlyMetrics(startTime, endTime);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].totalQueries).toBe(100);
      expect(metrics[0].successfulQueries).toBe(98);
      expect(metrics[0].avgTotalLatencyMs).toBe(120.5);
    });
  });

  describe('getDailyMetrics', () => {
    it('should return daily aggregated metrics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            day_start: '2024-01-01',
            use_case: 'scoring',
            search_type: 'hybrid',
            total_queries: '1000',
            successful_queries: '980',
            failed_queries: '20',
            zero_result_queries: '50',
            timeout_errors: '5',
            connection_errors: '3',
            embedding_errors: '10',
            other_errors: '2',
            avg_total_latency_ms: '115.5',
            p95_total_latency_ms: '280',
            avg_result_count: '3.2',
            avg_result_score: '0.81',
            cache_hit_rate: '0.45',
          },
        ],
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-07');

      const metrics = await analytics.getDailyMetrics(startDate, endDate);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].totalQueries).toBe(1000);
      expect(metrics[0].timeoutErrors).toBe(5);
      expect(metrics[0].cacheHitRate).toBe(0.45);
    });
  });

  describe('aggregateHourlyMetrics', () => {
    it('should trigger hourly aggregation', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ rows_affected: '5' }],
      });

      const rowsAffected = await analytics.aggregateHourlyMetrics();

      expect(rowsAffected).toBe(5);
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should support custom target hour', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ rows_affected: '3' }],
      });

      const targetHour = new Date('2024-01-01T10:00:00Z');
      await analytics.aggregateHourlyMetrics(targetHour);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [targetHour]);
    });
  });

  describe('aggregateDailyMetrics', () => {
    it('should trigger daily aggregation', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ rows_affected: '2' }],
      });

      const rowsAffected = await analytics.aggregateDailyMetrics();

      expect(rowsAffected).toBe(2);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when all metrics are good', async () => {
      // Mock performance summary
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { metric_name: 'success_rate', metric_value: '99', unit: 'percent' },
          { metric_name: 'zero_result_rate', metric_value: '5', unit: 'percent' },
          { metric_name: 'cache_hit_rate', metric_value: '50', unit: 'percent' },
        ],
      });

      // Mock latency distribution
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            p50: '100',
            p75: '150',
            p90: '200',
            p95: '300',
            p99: '500',
            max: '800',
            avg: '125',
          },
        ],
      });

      const health = await analytics.checkHealth(1);

      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
      expect(health.checkedAt).toBeInstanceOf(Date);
    });

    it('should return degraded status when latency is high', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { metric_name: 'success_rate', metric_value: '99', unit: 'percent' },
          { metric_name: 'zero_result_rate', metric_value: '5', unit: 'percent' },
          { metric_name: 'cache_hit_rate', metric_value: '50', unit: 'percent' },
        ],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            p50: '500',
            p75: '800',
            p90: '1000',
            p95: '1500', // Above 1000ms threshold
            p99: '2000',
            max: '3000',
            avg: '600',
          },
        ],
      });

      const health = await analytics.checkHealth(1);

      expect(health.status).toBe('degraded');
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues[0]).toContain('P95 latency');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return critical status when error rate is very high', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { metric_name: 'success_rate', metric_value: '80', unit: 'percent' }, // 20% error rate
          { metric_name: 'zero_result_rate', metric_value: '5', unit: 'percent' },
          { metric_name: 'cache_hit_rate', metric_value: '50', unit: 'percent' },
        ],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            p50: '100',
            p75: '150',
            p90: '200',
            p95: '300',
            p99: '500',
            max: '800',
            avg: '125',
          },
        ],
      });

      const health = await analytics.checkHealth(1);

      expect(health.status).toBe('critical');
      expect(health.issues.some((i) => i.includes('Error rate'))).toBe(true);
    });

    it('should detect multiple issues', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { metric_name: 'success_rate', metric_value: '90', unit: 'percent' }, // 10% error rate
          { metric_name: 'zero_result_rate', metric_value: '30', unit: 'percent' }, // Above 20% threshold
          { metric_name: 'cache_hit_rate', metric_value: '20', unit: 'percent' }, // Below 30% threshold
        ],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            p50: '500',
            p75: '800',
            p90: '1000',
            p95: '1200', // Above threshold
            p99: '2000',
            max: '3000',
            avg: '600',
          },
        ],
      });

      const health = await analytics.checkHealth(1);

      expect(health.issues.length).toBeGreaterThan(2);
    });
  });

  describe('getSlowestQueries', () => {
    it('should return slowest queries', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            query_text: 'slow query 1',
            total_latency_ms: '2000',
            embedding_latency_ms: '500',
            search_latency_ms: '1500',
            search_type: 'hybrid',
            result_count: '3',
            created_at: '2024-01-01T00:00:00Z',
            correlation_id: 'corr-1',
          },
          {
            query_text: 'slow query 2',
            total_latency_ms: '1500',
            embedding_latency_ms: '400',
            search_latency_ms: '1100',
            search_type: 'semantic',
            result_count: '5',
            created_at: '2024-01-01T01:00:00Z',
            correlation_id: null,
          },
        ],
      });

      const slowQueries = await analytics.getSlowestQueries(10, 24);

      expect(slowQueries).toHaveLength(2);
      expect(slowQueries[0].queryText).toBe('slow query 1');
      expect(slowQueries[0].totalLatencyMs).toBe(2000);
      expect(slowQueries[1].correlationId).toBeNull();
    });
  });

  describe('getLowScoreQueries', () => {
    it('should return queries with low result scores', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            query_text: 'low score query',
            avg_result_score: '0.35',
            result_count: '2',
            search_type: 'hybrid',
            use_case: 'scoring',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const lowScoreQueries = await analytics.getLowScoreQueries(10, 24, 0.5);

      expect(lowScoreQueries).toHaveLength(1);
      expect(lowScoreQueries[0].avgResultScore).toBe(0.35);
    });
  });

  describe('getZeroResultQueries', () => {
    it('should return queries with no results', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            query_text: 'no results query',
            search_type: 'semantic',
            use_case: 'general',
            filters: '{"language": "ro"}',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const zeroResultQueries = await analytics.getZeroResultQueries(50, 24);

      expect(zeroResultQueries).toHaveLength(1);
      expect(zeroResultQueries[0].queryText).toBe('no results query');
    });
  });

  describe('updateAlertThresholds', () => {
    it('should update thresholds', () => {
      analytics.updateAlertThresholds({ maxP95LatencyMs: 500 });

      const thresholds = analytics.getAlertThresholds();
      expect(thresholds.maxP95LatencyMs).toBe(500);
    });

    it('should merge with existing thresholds', () => {
      analytics.updateAlertThresholds({ maxP95LatencyMs: 500 });
      analytics.updateAlertThresholds({ maxErrorRatePercent: 2 });

      const thresholds = analytics.getAlertThresholds();
      expect(thresholds.maxP95LatencyMs).toBe(500);
      expect(thresholds.maxErrorRatePercent).toBe(2);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createRAGQueryAnalytics', () => {
  it('should create analytics with default thresholds', () => {
    const mockPool = createMockPool();
    const analytics = createRAGQueryAnalytics(mockPool as unknown as import('pg').Pool);

    expect(analytics).toBeInstanceOf(RAGQueryAnalytics);
    expect(analytics.getAlertThresholds().maxP95LatencyMs).toBe(1000);
  });

  it('should create analytics with custom thresholds', () => {
    const mockPool = createMockPool();
    const analytics = createRAGQueryAnalytics(mockPool as unknown as import('pg').Pool, {
      maxP95LatencyMs: 500,
    });

    expect(analytics.getAlertThresholds().maxP95LatencyMs).toBe(500);
  });
});
