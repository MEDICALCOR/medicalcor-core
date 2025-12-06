/**
 * AI Metrics Repository Tests
 * Comprehensive tests for AI metrics storage and retrieval
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PostgresAIMetricsRepository,
  createPostgresAIMetricsRepository,
  type DatabaseClient,
} from '../ai-metrics-repository.js';
import type { AIMetricsRecord } from '../multi-provider-gateway.js';

// Mock database client
function createMockDb(): DatabaseClient {
  return {
    query: vi.fn(),
  };
}

// Sample metric data
const sampleMetric: AIMetricsRecord = {
  provider: 'openai',
  model: 'gpt-4o',
  operation: 'chat_completion',
  tokensPrompt: 100,
  tokensCompletion: 50,
  tokensTotal: 150,
  costUsd: 0.0025,
  latencyMs: 1500,
  success: true,
  usedFallback: false,
};

const sampleMetricWithOptionalFields: AIMetricsRecord = {
  ...sampleMetric,
  errorMessage: 'Test error',
  correlationId: 'test-correlation-id',
};

const failedMetric: AIMetricsRecord = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  operation: 'chat_completion',
  tokensPrompt: 0,
  tokensCompletion: 0,
  tokensTotal: 0,
  costUsd: 0,
  latencyMs: 500,
  success: false,
  errorMessage: 'API error',
  usedFallback: true,
};

describe('PostgresAIMetricsRepository', () => {
  let mockDb: DatabaseClient;
  let repo: PostgresAIMetricsRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new PostgresAIMetricsRepository(mockDb);
  });

  describe('logMetric', () => {
    it('should insert a single metric successfully', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(sampleMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_metrics'),
        [
          'openai',
          'gpt-4o',
          'chat_completion',
          100,
          50,
          150,
          0.0025,
          1500,
          true,
          null,
          false,
          null,
        ]
      );
    });

    it('should insert metric with optional fields', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(sampleMetricWithOptionalFields);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_metrics'),
        [
          'openai',
          'gpt-4o',
          'chat_completion',
          100,
          50,
          150,
          0.0025,
          1500,
          true,
          'Test error',
          false,
          'test-correlation-id',
        ]
      );
    });

    it('should insert failed metric with error message', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(failedMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_metrics'),
        expect.arrayContaining([
          'anthropic',
          'claude-sonnet-4-5-20250929',
          'chat_completion',
          0,
          0,
          0,
          0,
          500,
          false,
          'API error',
          true,
        ])
      );
    });

    it('should handle database errors', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(repo.logMetric(sampleMetric)).rejects.toThrow('Database connection failed');
    });

    it('should include all required columns in INSERT statement', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(sampleMetric);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('provider');
      expect(query).toContain('model');
      expect(query).toContain('operation');
      expect(query).toContain('tokens_prompt');
      expect(query).toContain('tokens_completion');
      expect(query).toContain('tokens_total');
      expect(query).toContain('cost_usd');
      expect(query).toContain('latency_ms');
      expect(query).toContain('success');
      expect(query).toContain('error_message');
      expect(query).toContain('used_fallback');
      expect(query).toContain('correlation_id');
    });
  });

  describe('logMetricsBatch', () => {
    it('should insert multiple metrics in a batch', async () => {
      const metrics: AIMetricsRecord[] = [
        sampleMetric,
        failedMetric,
        { ...sampleMetric, provider: 'llama' },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetricsBatch(metrics);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [query, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[]
      ];

      expect(query).toContain('INSERT INTO ai_metrics');
      expect(query).toContain('VALUES');
      // Should have 3 value groups (one for each metric)
      expect((query.match(/\$1/g) || []).length).toBeGreaterThan(0);
      // Each metric has 12 parameters
      expect(params).toHaveLength(36); // 3 metrics * 12 params
    });

    it('should handle empty array gracefully', async () => {
      await repo.logMetricsBatch([]);

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should build correct parameterized query for batch insert', async () => {
      const metrics: AIMetricsRecord[] = [sampleMetric, failedMetric];

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetricsBatch(metrics);

      const [query, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[]
      ];

      // Check placeholders are correctly numbered
      expect(query).toContain('$1');
      expect(query).toContain('$12'); // First metric's last param
      expect(query).toContain('$13'); // Second metric's first param
      expect(query).toContain('$24'); // Second metric's last param

      // Check all values are present
      expect(params).toEqual([
        // First metric
        'openai',
        'gpt-4o',
        'chat_completion',
        100,
        50,
        150,
        0.0025,
        1500,
        true,
        null,
        false,
        null,
        // Second metric
        'anthropic',
        'claude-sonnet-4-5-20250929',
        'chat_completion',
        0,
        0,
        0,
        0,
        500,
        false,
        'API error',
        true,
        null,
      ]);
    });

    it('should handle single metric batch', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetricsBatch([sampleMetric]);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[]
      ];
      expect(params).toHaveLength(12);
    });

    it('should handle database errors in batch insert', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Batch insert failed')
      );

      await expect(repo.logMetricsBatch([sampleMetric, failedMetric])).rejects.toThrow(
        'Batch insert failed'
      );
    });

    it('should preserve null values for optional fields in batch', async () => {
      const metricsWithAndWithoutOptionals: AIMetricsRecord[] = [
        sampleMetric, // No error or correlation
        sampleMetricWithOptionalFields, // Has both
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetricsBatch(metricsWithAndWithoutOptionals);

      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[]
      ];

      // First metric should have nulls
      expect(params[9]).toBe(null); // errorMessage
      expect(params[11]).toBe(null); // correlationId

      // Second metric should have values
      expect(params[21]).toBe('Test error'); // errorMessage
      expect(params[23]).toBe('test-correlation-id'); // correlationId
    });
  });

  describe('getCostSummary', () => {
    it('should return cost summary with aggregated data', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total_cost: '10.50',
            total_tokens: '100000',
            request_count: '50',
          },
          {
            provider: 'anthropic',
            total_cost: '5.25',
            total_tokens: '50000',
            request_count: '25',
          },
        ],
      });

      const summary = await repo.getCostSummary(startDate, endDate);

      expect(summary.totalCost).toBe(15.75);
      expect(summary.totalTokens).toBe(150000);
      expect(summary.requestCount).toBe(75);
      expect(summary.byProvider).toEqual({
        openai: { cost: 10.5, tokens: 100000, requests: 50 },
        anthropic: { cost: 5.25, tokens: 50000, requests: 25 },
      });
    });

    it('should query with correct date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getCostSummary(startDate, endDate);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE created_at >= $1 AND created_at < $2'),
        [startDate, endDate]
      );
    });

    it('should handle empty results', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      const summary = await repo.getCostSummary(startDate, endDate);

      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.requestCount).toBe(0);
      expect(summary.byProvider).toEqual({});
    });

    it('should aggregate data correctly with GROUP BY provider', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getCostSummary(startDate, endDate);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('GROUP BY provider');
      expect(query).toContain('SUM(cost_usd)');
      expect(query).toContain('SUM(tokens_total)');
      expect(query).toContain('COUNT(*)');
    });

    it('should parse string numbers correctly', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total_cost: '0.001', // Small decimal
            total_tokens: '1500',
            request_count: '1',
          },
        ],
      });

      const summary = await repo.getCostSummary(startDate, endDate);

      expect(summary.totalCost).toBe(0.001);
      expect(summary.totalTokens).toBe(1500);
      expect(summary.requestCount).toBe(1);
    });

    it('should handle multiple providers correctly', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total_cost: '10.0',
            total_tokens: '100000',
            request_count: '50',
          },
          {
            provider: 'anthropic',
            total_cost: '15.0',
            total_tokens: '150000',
            request_count: '60',
          },
          {
            provider: 'llama',
            total_cost: '0.0',
            total_tokens: '50000',
            request_count: '20',
          },
        ],
      });

      const summary = await repo.getCostSummary(startDate, endDate);

      expect(Object.keys(summary.byProvider)).toHaveLength(3);
      expect(summary.totalCost).toBe(25.0);
      expect(summary.totalTokens).toBe(300000);
      expect(summary.requestCount).toBe(130);
    });

    it('should handle database errors', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Query timeout')
      );

      await expect(repo.getCostSummary(startDate, endDate)).rejects.toThrow('Query timeout');
    });
  });

  describe('getErrorRate', () => {
    it('should calculate error rates by provider', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total: '100',
            errors: '5',
          },
          {
            provider: 'anthropic',
            total: '50',
            errors: '10',
          },
        ],
      });

      const rates = await repo.getErrorRate(startDate, endDate);

      expect(rates.openai).toEqual({
        total: 100,
        errors: 5,
        errorRate: 0.05,
      });
      expect(rates.anthropic).toEqual({
        total: 50,
        errors: 10,
        errorRate: 0.2,
      });
    });

    it('should handle zero errors', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total: '100',
            errors: '0',
          },
        ],
      });

      const rates = await repo.getErrorRate(startDate, endDate);

      expect(rates.openai.errorRate).toBe(0);
    });

    it('should handle all errors', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total: '10',
            errors: '10',
          },
        ],
      });

      const rates = await repo.getErrorRate(startDate, endDate);

      expect(rates.openai.errorRate).toBe(1.0);
    });

    it('should handle division by zero gracefully', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            total: '0',
            errors: '0',
          },
        ],
      });

      const rates = await repo.getErrorRate(startDate, endDate);

      expect(rates.openai.errorRate).toBe(0);
    });

    it('should query with correct date range and grouping', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getErrorRate(startDate, endDate);

      const [query, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[]
      ];

      expect(query).toContain('WHERE created_at >= $1 AND created_at < $2');
      expect(query).toContain('GROUP BY provider');
      expect(query).toContain('COUNT(*)');
      expect(query).toContain('SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)');
      expect(params).toEqual([startDate, endDate]);
    });

    it('should handle empty results', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      const rates = await repo.getErrorRate(startDate, endDate);

      expect(rates).toEqual({});
    });

    it('should handle database errors', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      );

      await expect(repo.getErrorRate(startDate, endDate)).rejects.toThrow('Database error');
    });
  });

  describe('getLatencyStats', () => {
    it('should return latency statistics by provider', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            avg_latency: 1500,
            min_latency: 800,
            max_latency: 3000,
            p95_latency: 2500,
          },
          {
            provider: 'anthropic',
            avg_latency: 2000,
            min_latency: 1000,
            max_latency: 4000,
            p95_latency: 3500,
          },
        ],
      });

      const stats = await repo.getLatencyStats(startDate, endDate);

      expect(stats.openai).toEqual({
        avg: 1500,
        min: 800,
        max: 3000,
        p95: 2500,
      });
      expect(stats.anthropic).toEqual({
        avg: 2000,
        min: 1000,
        max: 4000,
        p95: 3500,
      });
    });

    it('should only include successful requests', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getLatencyStats(startDate, endDate);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('success = true');
    });

    it('should use PERCENTILE_CONT for p95 calculation', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getLatencyStats(startDate, endDate);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('PERCENTILE_CONT(0.95)');
      expect(query).toContain('WITHIN GROUP (ORDER BY latency_ms)');
    });

    it('should calculate aggregate functions correctly', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getLatencyStats(startDate, endDate);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('AVG(latency_ms)');
      expect(query).toContain('MIN(latency_ms)');
      expect(query).toContain('MAX(latency_ms)');
      expect(query).toContain('GROUP BY provider');
    });

    it('should query with correct date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.getLatencyStats(startDate, endDate);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE created_at >= $1 AND created_at < $2'),
        [startDate, endDate]
      );
    });

    it('should handle empty results', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      const stats = await repo.getLatencyStats(startDate, endDate);

      expect(stats).toEqual({});
    });

    it('should handle single provider', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            avg_latency: 1200,
            min_latency: 500,
            max_latency: 2000,
            p95_latency: 1800,
          },
        ],
      });

      const stats = await repo.getLatencyStats(startDate, endDate);

      expect(Object.keys(stats)).toHaveLength(1);
      expect(stats.openai).toBeDefined();
    });

    it('should handle database errors', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Query failed')
      );

      await expect(repo.getLatencyStats(startDate, endDate)).rejects.toThrow('Query failed');
    });

    it('should handle integer conversion for avg and p95', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            provider: 'openai',
            avg_latency: 1234, // Already integer from ::INTEGER cast
            min_latency: 100,
            max_latency: 5000,
            p95_latency: 4567, // Already integer from ::INTEGER cast
          },
        ],
      });

      const stats = await repo.getLatencyStats(startDate, endDate);

      expect(stats.openai.avg).toBe(1234);
      expect(stats.openai.p95).toBe(4567);
      expect(Number.isInteger(stats.openai.avg)).toBe(true);
      expect(Number.isInteger(stats.openai.p95)).toBe(true);
    });
  });

  describe('createPostgresAIMetricsRepository', () => {
    it('should create a repository instance', () => {
      const db = createMockDb();
      const repository = createPostgresAIMetricsRepository(db);

      expect(repository).toBeInstanceOf(PostgresAIMetricsRepository);
    });

    it('should use the provided database client', async () => {
      const db = createMockDb();
      const repository = createPostgresAIMetricsRepository(db);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repository.logMetric(sampleMetric);

      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('DatabaseClient interface', () => {
    it('should work with pg.Pool compatible clients', async () => {
      // Simulate a pg.Pool-like client
      const pgLikeClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const repository = new PostgresAIMetricsRepository(pgLikeClient);

      await repository.logMetric(sampleMetric);

      expect(pgLikeClient.query).toHaveBeenCalled();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very large cost values', async () => {
      const expensiveMetric: AIMetricsRecord = {
        ...sampleMetric,
        costUsd: 999999.99,
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(expensiveMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([999999.99])
      );
    });

    it('should handle zero token metrics', async () => {
      const zeroTokenMetric: AIMetricsRecord = {
        ...sampleMetric,
        tokensPrompt: 0,
        tokensCompletion: 0,
        tokensTotal: 0,
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(zeroTokenMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 0, 0])
      );
    });

    it('should handle very long error messages', async () => {
      const longErrorMetric: AIMetricsRecord = {
        ...sampleMetric,
        success: false,
        errorMessage: 'A'.repeat(1000),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(longErrorMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['A'.repeat(1000)])
      );
    });

    it('should handle special characters in error messages', async () => {
      const specialCharMetric: AIMetricsRecord = {
        ...sampleMetric,
        success: false,
        errorMessage: "Error with 'quotes' and \"double quotes\" and $pecial chars",
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(specialCharMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["Error with 'quotes' and \"double quotes\" and $pecial chars"])
      );
    });

    it('should handle very high latency values', async () => {
      const slowMetric: AIMetricsRecord = {
        ...sampleMetric,
        latencyMs: 120000, // 2 minutes
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
      });

      await repo.logMetric(slowMetric);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([120000])
      );
    });
  });
});
