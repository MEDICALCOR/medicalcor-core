/**
 * AI Metrics Repository - PostgreSQL Implementation
 *
 * Persists AI call metrics to the ai_metrics table for:
 * - Cost tracking and budgeting
 * - Performance monitoring
 * - Audit trail
 * - Provider health analysis
 */

import type { AIMetricsRecord, AIMetricsRepository } from './multi-provider-gateway.js';

/**
 * Database client interface (compatible with pg.Pool)
 */
export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * PostgreSQL implementation of AIMetricsRepository
 */
export class PostgresAIMetricsRepository implements AIMetricsRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Log a single AI metric to the database
   */
  async logMetric(metric: AIMetricsRecord): Promise<void> {
    const sql = `
      INSERT INTO ai_metrics (
        provider,
        model,
        operation,
        tokens_prompt,
        tokens_completion,
        tokens_total,
        cost_usd,
        latency_ms,
        success,
        error_message,
        used_fallback,
        correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await this.db.query(sql, [
      metric.provider,
      metric.model,
      metric.operation,
      metric.tokensPrompt,
      metric.tokensCompletion,
      metric.tokensTotal,
      metric.costUsd,
      metric.latencyMs,
      metric.success,
      metric.errorMessage ?? null,
      metric.usedFallback,
      metric.correlationId ?? null,
    ]);
  }

  /**
   * Batch insert metrics for efficiency
   */
  async logMetricsBatch(metrics: AIMetricsRecord[]): Promise<void> {
    if (metrics.length === 0) {
      return;
    }

    // Build batch insert with parameterized values
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const metric of metrics) {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(
        metric.provider,
        metric.model,
        metric.operation,
        metric.tokensPrompt,
        metric.tokensCompletion,
        metric.tokensTotal,
        metric.costUsd,
        metric.latencyMs,
        metric.success,
        metric.errorMessage ?? null,
        metric.usedFallback,
        metric.correlationId ?? null
      );
    }

    const sql = `
      INSERT INTO ai_metrics (
        provider,
        model,
        operation,
        tokens_prompt,
        tokens_completion,
        tokens_total,
        cost_usd,
        latency_ms,
        success,
        error_message,
        used_fallback,
        correlation_id
      ) VALUES ${placeholders.join(', ')}
    `;

    await this.db.query(sql, values);
  }

  /**
   * Get cost summary for a time period
   */
  async getCostSummary(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  }> {
    const sql = `
      SELECT
        provider,
        SUM(cost_usd) as total_cost,
        SUM(tokens_total) as total_tokens,
        COUNT(*) as request_count
      FROM ai_metrics
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY provider
    `;

    const result = await this.db.query<{
      provider: string;
      total_cost: string;
      total_tokens: string;
      request_count: string;
    }>(sql, [startDate, endDate]);

    let totalCost = 0;
    let totalTokens = 0;
    let requestCount = 0;
    const byProvider: Record<string, { cost: number; tokens: number; requests: number }> = {};

    for (const row of result.rows) {
      const cost = parseFloat(row.total_cost);
      const tokens = parseInt(row.total_tokens, 10);
      const requests = parseInt(row.request_count, 10);

      totalCost += cost;
      totalTokens += tokens;
      requestCount += requests;

      byProvider[row.provider] = { cost, tokens, requests };
    }

    return { totalCost, totalTokens, requestCount, byProvider };
  }

  /**
   * Get error rate by provider for a time period
   */
  async getErrorRate(
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, { total: number; errors: number; errorRate: number }>> {
    const sql = `
      SELECT
        provider,
        COUNT(*) as total,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as errors
      FROM ai_metrics
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY provider
    `;

    const result = await this.db.query<{
      provider: string;
      total: string;
      errors: string;
    }>(sql, [startDate, endDate]);

    const rates: Record<string, { total: number; errors: number; errorRate: number }> = {};

    for (const row of result.rows) {
      const total = parseInt(row.total, 10);
      const errors = parseInt(row.errors, 10);
      rates[row.provider] = {
        total,
        errors,
        errorRate: total > 0 ? errors / total : 0,
      };
    }

    return rates;
  }

  /**
   * Get average latency by provider for a time period
   */
  async getLatencyStats(
    startDate: Date,
    endDate: Date
  ): Promise<
    Record<string, { avg: number; min: number; max: number; p95: number }>
  > {
    const sql = `
      SELECT
        provider,
        AVG(latency_ms)::INTEGER as avg_latency,
        MIN(latency_ms) as min_latency,
        MAX(latency_ms) as max_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::INTEGER as p95_latency
      FROM ai_metrics
      WHERE created_at >= $1 AND created_at < $2 AND success = true
      GROUP BY provider
    `;

    const result = await this.db.query<{
      provider: string;
      avg_latency: number;
      min_latency: number;
      max_latency: number;
      p95_latency: number;
    }>(sql, [startDate, endDate]);

    const stats: Record<string, { avg: number; min: number; max: number; p95: number }> = {};

    for (const row of result.rows) {
      stats[row.provider] = {
        avg: row.avg_latency,
        min: row.min_latency,
        max: row.max_latency,
        p95: row.p95_latency,
      };
    }

    return stats;
  }
}

/**
 * Create a PostgreSQL AI metrics repository
 */
export function createPostgresAIMetricsRepository(db: DatabaseClient): PostgresAIMetricsRepository {
  return new PostgresAIMetricsRepository(db);
}
