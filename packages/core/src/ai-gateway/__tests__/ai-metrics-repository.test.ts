/**
 * AI Metrics Repository Tests
 *
 * Comprehensive tests for PostgreSQL-based AI metrics persistence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PostgresAIMetricsRepository,
  createPostgresAIMetricsRepository,
  type DatabaseClient,
} from '../ai-metrics-repository.js';
import type { AIMetricsRecord } from '../multi-provider-gateway.js';

describe('PostgresAIMetricsRepository', () => {
  let mockDb: DatabaseClient;
  let repository: PostgresAIMetricsRepository;

  function createMockMetric(overrides: Partial<AIMetricsRecord> = {}): AIMetricsRecord {
    return {
      provider: 'openai',
      model: 'gpt-4o',
      operation: 'scoring',
      tokensPrompt: 100,
      tokensCompletion: 50,
      tokensTotal: 150,
      costUsd: 0.0015,
      latencyMs: 500,
      success: true,
      usedFallback: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    repository = new PostgresAIMetricsRepository(mockDb);
  });

  describe('logMetric', () => {
    it('should insert a single metric with all fields', async () => {
      const metric = createMockMetric();

      await repository.logMetric(metric);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('INSERT INTO ai_metrics');
      expect(params).toHaveLength(12);
      expect(params[0]).toBe('openai');
      expect(params[1]).toBe('gpt-4o');
      expect(params[2]).toBe('scoring');
      expect(params[3]).toBe(100);
      expect(params[4]).toBe(50);
      expect(params[5]).toBe(150);
      expect(params[6]).toBe(0.0015);
      expect(params[7]).toBe(500);
      expect(params[8]).toBe(true);
      expect(params[9]).toBeNull(); // errorMessage
      expect(params[10]).toBe(false); // usedFallback
      expect(params[11]).toBeNull(); // correlationId
    });

    it('should include error message when present', async () => {
      const metric = createMockMetric({
        success: false,
        errorMessage: 'API rate limit exceeded',
      });

      await repository.logMetric(metric);

      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params[8]).toBe(false);
      expect(params[9]).toBe('API rate limit exceeded');
    });

    it('should include correlation ID when present', async () => {
      const metric = createMockMetric({
        correlationId: 'req-123-456',
      });

      await repository.logMetric(metric);

      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params[11]).toBe('req-123-456');
    });

    it('should handle usedFallback flag', async () => {
      const metric = createMockMetric({
        usedFallback: true,
      });

      await repository.logMetric(metric);

      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params[10]).toBe(true);
    });

    it('should handle different providers', async () => {
      for (const provider of ['openai', 'anthropic', 'llama', 'ollama'] as const) {
        vi.clearAllMocks();
        const metric = createMockMetric({ provider });

        await repository.logMetric(metric);

        const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(params[0]).toBe(provider);
      }
    });
  });

  describe('logMetricsBatch', () => {
    it('should handle empty batch gracefully', async () => {
      await repository.logMetricsBatch([]);

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should batch insert multiple metrics', async () => {
      const metrics = [
        createMockMetric({ operation: 'scoring' }),
        createMockMetric({ operation: 'reply_generation' }),
        createMockMetric({ operation: 'sentiment' }),
      ];

      await repository.logMetricsBatch(metrics);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('INSERT INTO ai_metrics');
      expect(params).toHaveLength(36); // 3 metrics * 12 fields
    });

    it('should build correct placeholders for batch insert', async () => {
      const metrics = [
        createMockMetric({ provider: 'openai' }),
        createMockMetric({ provider: 'anthropic' }),
      ];

      await repository.logMetricsBatch(metrics);

      const [sql] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Should have two sets of placeholders
      expect(sql).toContain('$1');
      expect(sql).toContain('$12');
      expect(sql).toContain('$13');
      expect(sql).toContain('$24');
    });

    it('should handle single item batch', async () => {
      const metrics = [createMockMetric()];

      await repository.logMetricsBatch(metrics);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [, params] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params).toHaveLength(12);
    });
  });

  describe('getCostSummary', () => {
    it('should return empty summary when no data', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const result = await repository.getCostSummary(startDate, endDate);

      expect(result).toEqual({
        totalCost: 0,
        totalTokens: 0,
        requestCount: 0,
        byProvider: {},
      });
    });

    it('should aggregate costs by provider', async () => {
      const mockRows = [
        { provider: 'openai', total_cost: '10.50', total_tokens: '100000', request_count: '50' },
        { provider: 'anthropic', total_cost: '5.25', total_tokens: '50000', request_count: '25' },
      ];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const result = await repository.getCostSummary(startDate, endDate);

      expect(result.totalCost).toBe(15.75);
      expect(result.totalTokens).toBe(150000);
      expect(result.requestCount).toBe(75);
      expect(result.byProvider.openai).toEqual({ cost: 10.5, tokens: 100000, requests: 50 });
      expect(result.byProvider.anthropic).toEqual({ cost: 5.25, tokens: 50000, requests: 25 });
    });

    it('should pass date range to query', async () => {
      const startDate = new Date('2025-06-01');
      const endDate = new Date('2025-06-30');

      await repository.getCostSummary(startDate, endDate);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [startDate, endDate]);
    });

    it('should handle single provider', async () => {
      const mockRows = [
        { provider: 'openai', total_cost: '25.00', total_tokens: '250000', request_count: '100' },
      ];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getCostSummary(new Date(), new Date());

      expect(Object.keys(result.byProvider)).toHaveLength(1);
      expect(result.byProvider.openai).toBeDefined();
    });
  });

  describe('getErrorRate', () => {
    it('should return empty object when no data', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const result = await repository.getErrorRate(startDate, endDate);

      expect(result).toEqual({});
    });

    it('should calculate error rates by provider', async () => {
      const mockRows = [
        { provider: 'openai', total: '100', errors: '5' },
        { provider: 'anthropic', total: '50', errors: '10' },
      ];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const result = await repository.getErrorRate(startDate, endDate);

      expect(result.openai).toEqual({ total: 100, errors: 5, errorRate: 0.05 });
      expect(result.anthropic).toEqual({ total: 50, errors: 10, errorRate: 0.2 });
    });

    it('should handle zero total requests', async () => {
      const mockRows = [{ provider: 'openai', total: '0', errors: '0' }];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getErrorRate(new Date(), new Date());

      expect(result.openai?.errorRate).toBe(0);
    });

    it('should handle 100% error rate', async () => {
      const mockRows = [{ provider: 'llama', total: '10', errors: '10' }];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getErrorRate(new Date(), new Date());

      expect(result.llama?.errorRate).toBe(1);
    });

    it('should pass date range to query', async () => {
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-03-31');

      await repository.getErrorRate(startDate, endDate);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [startDate, endDate]);
    });
  });

  describe('getLatencyStats', () => {
    it('should return empty object when no data', async () => {
      const result = await repository.getLatencyStats(new Date(), new Date());

      expect(result).toEqual({});
    });

    it('should return latency statistics by provider', async () => {
      const mockRows = [
        {
          provider: 'openai',
          avg_latency: 250,
          min_latency: 100,
          max_latency: 500,
          p95_latency: 450,
        },
        {
          provider: 'anthropic',
          avg_latency: 300,
          min_latency: 150,
          max_latency: 600,
          p95_latency: 550,
        },
      ];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getLatencyStats(new Date(), new Date());

      expect(result.openai).toEqual({ avg: 250, min: 100, max: 500, p95: 450 });
      expect(result.anthropic).toEqual({ avg: 300, min: 150, max: 600, p95: 550 });
    });

    it('should only include successful requests in latency stats', async () => {
      await repository.getLatencyStats(new Date(), new Date());

      const [sql] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('success = true');
    });

    it('should pass date range to query', async () => {
      const startDate = new Date('2025-04-01');
      const endDate = new Date('2025-04-30');

      await repository.getLatencyStats(startDate, endDate);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [startDate, endDate]);
    });
  });

  describe('Factory Function', () => {
    it('should create repository instance', () => {
      const repo = createPostgresAIMetricsRepository(mockDb);

      expect(repo).toBeInstanceOf(PostgresAIMetricsRepository);
    });
  });
});
