import crypto from 'crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createLogger } from '../logger/index.js';
import {
  type EmbeddingModelId,
  type EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
} from './embedding-model-registry.js';

/**
 * Embedding Health Check Service
 *
 * Provides comprehensive health monitoring for embeddings including:
 * - Dimension validation
 * - Model consistency checks
 * - Coverage analysis
 * - Staleness detection
 * - Quality metrics
 *
 * @module @medicalcor/core/rag/embedding-health-check
 */

const logger = createLogger({ serviceName: 'embedding-health-check' });

// =============================================================================
// Schema Definitions
// =============================================================================

export const HealthCheckTypeSchema = z.enum([
  'consistency', // Verify model matches embedding dimensions
  'quality', // Check embedding quality metrics
  'coverage', // Analyze embedding coverage
  'staleness', // Detect stale embeddings
  'dimension_validation', // Validate vector dimensions
]);

export type HealthCheckType = z.infer<typeof HealthCheckTypeSchema>;

export const HealthStatusSchema = z.enum(['healthy', 'warning', 'critical', 'error']);

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export interface HealthCheckIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  affectedEntries?: number;
  details?: Record<string, unknown>;
}

export interface HealthCheckRecommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
  estimatedImpact: string;
}

export interface HealthCheckResult {
  id?: string;
  checkType: HealthCheckType;
  targetTable: string;
  modelId?: string;
  status: HealthStatus;
  score: number;
  totalChecked: number;
  passed: number;
  failed: number;
  warnings: number;
  issues: HealthCheckIssue[];
  recommendations: HealthCheckRecommendation[];
  metrics: Record<string, unknown>;
  checkDurationMs: number;
  correlationId?: string;
  timestamp: Date;
}

export interface EmbeddingHealthSummary {
  overallStatus: HealthStatus;
  overallScore: number;
  checks: HealthCheckResult[];
  criticalIssues: number;
  warnings: number;
  lastChecked: Date;
  nextScheduledCheck?: Date;
}

// =============================================================================
// Health Check Service Class
// =============================================================================

export class EmbeddingHealthCheckService {
  private pool: Pool;
  private registry: EmbeddingModelRegistry;

  constructor(pool: Pool, registry?: EmbeddingModelRegistry) {
    this.pool = pool;
    this.registry = registry ?? createEmbeddingModelRegistry();
  }

  // ===========================================================================
  // Individual Health Checks
  // ===========================================================================

  /**
   * Run a specific health check
   */
  async runCheck(
    checkType: HealthCheckType,
    options: {
      targetTable?: 'knowledge_base' | 'message_embeddings';
      modelId?: EmbeddingModelId;
      sampleSize?: number;
      correlationId?: string;
    } = {}
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const targetTable = options.targetTable ?? 'knowledge_base';
    const correlationId =
      options.correlationId ?? `hc_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    logger.info(
      {
        checkType,
        targetTable,
        modelId: options.modelId,
        correlationId,
      },
      'Running embedding health check'
    );

    let result: HealthCheckResult;

    switch (checkType) {
      case 'consistency':
        result = await this.checkConsistency(targetTable, options.modelId, correlationId);
        break;
      case 'quality':
        result = await this.checkQuality(targetTable, options.sampleSize ?? 100, correlationId);
        break;
      case 'coverage':
        result = await this.checkCoverage(targetTable, correlationId);
        break;
      case 'staleness':
        result = await this.checkStaleness(targetTable, correlationId);
        break;
      case 'dimension_validation':
        result = await this.checkDimensions(targetTable, options.sampleSize ?? 1000, correlationId);
        break;
      default: {
        const _exhaustiveCheck: never = checkType;
        throw new Error(`Unknown check type: ${String(_exhaustiveCheck)}`);
      }
    }

    result.checkDurationMs = Date.now() - startTime;

    // Store result in database
    await this.storeCheckResult(result);

    logger.info(
      {
        checkType,
        status: result.status,
        score: result.score,
        durationMs: result.checkDurationMs,
        correlationId,
      },
      'Health check completed'
    );

    return result;
  }

  /**
   * Run all health checks
   */
  async runAllChecks(
    options: {
      targetTable?: 'knowledge_base' | 'message_embeddings';
      correlationId?: string;
    } = {}
  ): Promise<EmbeddingHealthSummary> {
    const correlationId =
      options.correlationId ?? `hc_all_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const targetTable = options.targetTable ?? 'knowledge_base';

    const checks: HealthCheckResult[] = [];

    for (const checkType of HealthCheckTypeSchema.options) {
      try {
        const result = await this.runCheck(checkType, {
          targetTable,
          correlationId,
        });
        checks.push(result);
      } catch (error) {
        logger.error({ checkType, error, correlationId }, 'Health check failed');
        checks.push({
          checkType,
          targetTable,
          status: 'error',
          score: 0,
          totalChecked: 0,
          passed: 0,
          failed: 0,
          warnings: 0,
          issues: [
            {
              type: 'error',
              code: 'CHECK_FAILED',
              message: error instanceof Error ? error.message : String(error),
            },
          ],
          recommendations: [],
          metrics: {},
          checkDurationMs: 0,
          correlationId,
          timestamp: new Date(),
        });
      }
    }

    return this.aggregateResults(checks);
  }

  // ===========================================================================
  // Specific Check Implementations
  // ===========================================================================

  private async checkConsistency(
    targetTable: string,
    modelId: EmbeddingModelId | undefined,
    correlationId: string
  ): Promise<HealthCheckResult> {
    const issues: HealthCheckIssue[] = [];
    const recommendations: HealthCheckRecommendation[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    // Check model distribution
    const distributionResult = await this.pool.query(
      'SELECT * FROM get_embedding_model_distribution($1)',
      [targetTable]
    );

    const distribution = distributionResult.rows as {
      model: string;
      entry_count: string;
      percentage: string;
    }[];

    const totalEntries = distribution.reduce((sum, d) => sum + parseInt(d.entry_count, 10), 0);

    // Check for deprecated models
    for (const dist of distribution) {
      const modelConfig = this.registry.getModel(dist.model as EmbeddingModelId);
      const count = parseInt(dist.entry_count, 10);

      if (!modelConfig) {
        failed += count;
        issues.push({
          type: 'error',
          code: 'UNKNOWN_MODEL',
          message: `Unknown embedding model: ${dist.model}`,
          affectedEntries: count,
        });
      } else if (modelConfig.status === 'retired') {
        failed += count;
        issues.push({
          type: 'error',
          code: 'RETIRED_MODEL',
          message: `Retired model still in use: ${dist.model}`,
          affectedEntries: count,
        });
        recommendations.push({
          priority: 'high',
          action: `Migrate ${count} entries from ${dist.model} to current model`,
          reason: 'Retired models may stop working',
          estimatedImpact: `${parseFloat(dist.percentage).toFixed(1)}% of entries affected`,
        });
      } else if (modelConfig.status === 'deprecated') {
        warnings += count;
        issues.push({
          type: 'warning',
          code: 'DEPRECATED_MODEL',
          message: `Deprecated model in use: ${dist.model}`,
          affectedEntries: count,
        });
        recommendations.push({
          priority: 'medium',
          action: `Plan migration for ${count} entries from ${dist.model}`,
          reason: 'Deprecated models will be retired',
          estimatedImpact: `${parseFloat(dist.percentage).toFixed(1)}% of entries need migration`,
        });
      } else {
        passed += count;
      }
    }

    const score = totalEntries > 0 ? (passed / totalEntries) * 100 : 100;
    const status = this.determineStatus(score, failed > 0, warnings > 0);

    return {
      checkType: 'consistency',
      targetTable,
      modelId,
      status,
      score,
      totalChecked: totalEntries,
      passed,
      failed,
      warnings,
      issues,
      recommendations,
      metrics: {
        modelDistribution: distribution,
        uniqueModels: distribution.length,
      },
      checkDurationMs: 0,
      correlationId,
      timestamp: new Date(),
    };
  }

  private async checkQuality(
    targetTable: string,
    sampleSize: number,
    correlationId: string
  ): Promise<HealthCheckResult> {
    const issues: HealthCheckIssue[] = [];
    const recommendations: HealthCheckRecommendation[] = [];

    // Sample embeddings and check for anomalies
    const query =
      targetTable === 'knowledge_base'
        ? `
        SELECT id, embedding, embedding_model
        FROM knowledge_base
        WHERE embedding IS NOT NULL AND is_active = TRUE
        ORDER BY RANDOM()
        LIMIT $1
      `
        : `
        SELECT id, embedding, embedding_model
        FROM message_embeddings
        WHERE embedding IS NOT NULL
        ORDER BY RANDOM()
        LIMIT $1
      `;

    const result = await this.pool.query(query, [sampleSize]);
    const samples = result.rows as { id: string; embedding: string; embedding_model: string }[];

    let validCount = 0;
    let zeroVectorCount = 0;
    let lowMagnitudeCount = 0;

    for (const sample of samples) {
      const embedding = this.parseVector(sample.embedding);
      const magnitude = this.calculateMagnitude(embedding);

      if (magnitude === 0) {
        zeroVectorCount++;
        issues.push({
          type: 'error',
          code: 'ZERO_VECTOR',
          message: `Zero vector detected for entry ${sample.id}`,
          affectedEntries: 1,
        });
      } else if (magnitude < 0.1) {
        lowMagnitudeCount++;
        issues.push({
          type: 'warning',
          code: 'LOW_MAGNITUDE',
          message: `Unusually low magnitude embedding: ${magnitude.toFixed(4)}`,
          affectedEntries: 1,
          details: { entryId: sample.id, magnitude },
        });
      } else {
        validCount++;
      }
    }

    if (zeroVectorCount > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Regenerate zero-value embeddings',
        reason: 'Zero vectors provide no semantic meaning',
        estimatedImpact: `${zeroVectorCount} entries need regeneration`,
      });
    }

    const score = samples.length > 0 ? (validCount / samples.length) * 100 : 100;
    const status = this.determineStatus(score, zeroVectorCount > 0, lowMagnitudeCount > 0);

    return {
      checkType: 'quality',
      targetTable,
      status,
      score,
      totalChecked: samples.length,
      passed: validCount,
      failed: zeroVectorCount,
      warnings: lowMagnitudeCount,
      issues,
      recommendations,
      metrics: {
        sampleSize: samples.length,
        zeroVectors: zeroVectorCount,
        lowMagnitude: lowMagnitudeCount,
        validEmbeddings: validCount,
      },
      checkDurationMs: 0,
      correlationId,
      timestamp: new Date(),
    };
  }

  private async checkCoverage(
    targetTable: string,
    correlationId: string
  ): Promise<HealthCheckResult> {
    const issues: HealthCheckIssue[] = [];
    const recommendations: HealthCheckRecommendation[] = [];

    // Count entries with and without embeddings
    const query =
      targetTable === 'knowledge_base'
        ? `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS with_embedding,
          COUNT(CASE WHEN embedding IS NULL THEN 1 END) AS without_embedding
        FROM knowledge_base
        WHERE is_active = TRUE
      `
        : `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS with_embedding,
          COUNT(CASE WHEN embedding IS NULL THEN 1 END) AS without_embedding
        FROM message_embeddings
      `;

    const result = await this.pool.query(query);
    const stats = result.rows[0] as {
      total: string;
      with_embedding: string;
      without_embedding: string;
    };

    const total = parseInt(stats.total, 10);
    const withEmbedding = parseInt(stats.with_embedding, 10);
    const withoutEmbedding = parseInt(stats.without_embedding, 10);

    const coveragePercent = total > 0 ? (withEmbedding / total) * 100 : 100;

    if (withoutEmbedding > 0) {
      const severity = coveragePercent < 80 ? 'error' : coveragePercent < 95 ? 'warning' : 'info';
      issues.push({
        type: severity,
        code: 'MISSING_EMBEDDINGS',
        message: `${withoutEmbedding} entries missing embeddings`,
        affectedEntries: withoutEmbedding,
      });

      if (coveragePercent < 95) {
        recommendations.push({
          priority: coveragePercent < 80 ? 'high' : 'medium',
          action: `Generate embeddings for ${withoutEmbedding} entries`,
          reason: 'Missing embeddings reduce search effectiveness',
          estimatedImpact: `${(100 - coveragePercent).toFixed(1)}% of content not searchable`,
        });
      }
    }

    const status = this.determineStatus(
      coveragePercent,
      coveragePercent < 80,
      coveragePercent < 95
    );

    return {
      checkType: 'coverage',
      targetTable,
      status,
      score: coveragePercent,
      totalChecked: total,
      passed: withEmbedding,
      failed: withoutEmbedding,
      warnings: 0,
      issues,
      recommendations,
      metrics: {
        totalEntries: total,
        withEmbedding,
        withoutEmbedding,
        coveragePercent,
      },
      checkDurationMs: 0,
      correlationId,
      timestamp: new Date(),
    };
  }

  private async checkStaleness(
    targetTable: string,
    correlationId: string
  ): Promise<HealthCheckResult> {
    const issues: HealthCheckIssue[] = [];
    const recommendations: HealthCheckRecommendation[] = [];

    // Find entries where content was updated after embedding
    const query =
      targetTable === 'knowledge_base'
        ? `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN embedding_generated_at IS NOT NULL
            AND updated_at > embedding_generated_at THEN 1 END) AS stale,
          COUNT(CASE WHEN embedding_generated_at IS NULL
            AND embedding IS NOT NULL THEN 1 END) AS unknown_age
        FROM knowledge_base
        WHERE is_active = TRUE AND embedding IS NOT NULL
      `
        : `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN embedding_generated_at IS NOT NULL
            AND created_at > embedding_generated_at THEN 1 END) AS stale,
          COUNT(CASE WHEN embedding_generated_at IS NULL
            AND embedding IS NOT NULL THEN 1 END) AS unknown_age
        FROM message_embeddings
        WHERE embedding IS NOT NULL
      `;

    const result = await this.pool.query(query);
    const stats = result.rows[0] as {
      total: string;
      stale: string;
      unknown_age: string;
    };

    const total = parseInt(stats.total, 10);
    const stale = parseInt(stats.stale, 10);
    const unknownAge = parseInt(stats.unknown_age, 10);

    const freshPercent = total > 0 ? ((total - stale) / total) * 100 : 100;

    if (stale > 0) {
      issues.push({
        type: 'warning',
        code: 'STALE_EMBEDDINGS',
        message: `${stale} embeddings are stale (content updated after embedding)`,
        affectedEntries: stale,
      });
      recommendations.push({
        priority: 'medium',
        action: `Refresh ${stale} stale embeddings`,
        reason: 'Stale embeddings may not match current content',
        estimatedImpact: 'Improved search accuracy',
      });
    }

    if (unknownAge > 0) {
      issues.push({
        type: 'info',
        code: 'UNKNOWN_EMBEDDING_AGE',
        message: `${unknownAge} embeddings have no generation timestamp`,
        affectedEntries: unknownAge,
      });
    }

    const status = this.determineStatus(freshPercent, false, stale > total * 0.1);

    return {
      checkType: 'staleness',
      targetTable,
      status,
      score: freshPercent,
      totalChecked: total,
      passed: total - stale,
      failed: 0,
      warnings: stale,
      issues,
      recommendations,
      metrics: {
        totalEmbeddings: total,
        staleEmbeddings: stale,
        unknownAge,
        freshnessPercent: freshPercent,
      },
      checkDurationMs: 0,
      correlationId,
      timestamp: new Date(),
    };
  }

  private async checkDimensions(
    targetTable: string,
    sampleSize: number,
    correlationId: string
  ): Promise<HealthCheckResult> {
    const issues: HealthCheckIssue[] = [];
    const recommendations: HealthCheckRecommendation[] = [];

    const result = await this.pool.query('SELECT * FROM validate_embedding_dimensions($1, $2)', [
      targetTable,
      sampleSize,
    ]);

    const validationResults = result.rows as {
      model: string;
      expected_dimensions: number;
      entries_checked: string;
      valid_count: string;
      invalid_count: string;
      null_count: string;
    }[];

    let totalChecked = 0;
    let totalValid = 0;
    let totalInvalid = 0;

    for (const row of validationResults) {
      const checked = parseInt(row.entries_checked, 10);
      const valid = parseInt(row.valid_count, 10);
      const invalid = parseInt(row.invalid_count, 10);

      totalChecked += checked;
      totalValid += valid;
      totalInvalid += invalid;

      if (invalid > 0) {
        issues.push({
          type: 'error',
          code: 'DIMENSION_MISMATCH',
          message: `${invalid} entries have wrong dimensions for model ${row.model}`,
          affectedEntries: invalid,
          details: {
            model: row.model,
            expectedDimensions: row.expected_dimensions,
          },
        });
        recommendations.push({
          priority: 'high',
          action: `Regenerate embeddings for ${invalid} entries with dimension mismatch`,
          reason: 'Dimension mismatches will cause search failures',
          estimatedImpact: 'Critical for search functionality',
        });
      }
    }

    const score = totalChecked > 0 ? (totalValid / totalChecked) * 100 : 100;
    const status = this.determineStatus(score, totalInvalid > 0, false);

    return {
      checkType: 'dimension_validation',
      targetTable,
      status,
      score,
      totalChecked,
      passed: totalValid,
      failed: totalInvalid,
      warnings: 0,
      issues,
      recommendations,
      metrics: {
        validationResults,
      },
      checkDurationMs: 0,
      correlationId,
      timestamp: new Date(),
    };
  }

  // ===========================================================================
  // History and Reporting
  // ===========================================================================

  /**
   * Get recent health check history
   */
  async getCheckHistory(options?: {
    checkType?: HealthCheckType;
    targetTable?: string;
    limit?: number;
    since?: Date;
  }): Promise<HealthCheckResult[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (options?.checkType) {
      conditions.push(`check_type = $${paramIndex++}`);
      values.push(options.checkType);
    }
    if (options?.targetTable) {
      conditions.push(`target_table = $${paramIndex++}`);
      values.push(options.targetTable);
    }
    if (options?.since) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(options.since);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;

    const query = `
      SELECT * FROM embedding_health_checks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.pool.query(query, [...values, limit]);

    return (result.rows as Record<string, unknown>[]).map((row) => this.mapRowToResult(row));
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async storeCheckResult(result: HealthCheckResult): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO embedding_health_checks (
        check_type, target_table, model_id, status, score,
        total_checked, passed, failed, warnings,
        issues, recommendations, metrics,
        check_duration_ms, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
      [
        result.checkType,
        result.targetTable,
        result.modelId ?? null,
        result.status,
        result.score,
        result.totalChecked,
        result.passed,
        result.failed,
        result.warnings,
        JSON.stringify(result.issues),
        JSON.stringify(result.recommendations),
        JSON.stringify(result.metrics),
        result.checkDurationMs,
        result.correlationId ?? null,
      ]
    );
  }

  private aggregateResults(checks: HealthCheckResult[]): EmbeddingHealthSummary {
    const criticalIssues = checks.reduce(
      (sum, c) => sum + c.issues.filter((i) => i.type === 'error').length,
      0
    );
    const warnings = checks.reduce(
      (sum, c) => sum + c.issues.filter((i) => i.type === 'warning').length,
      0
    );

    const avgScore =
      checks.length > 0 ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length : 100;

    let overallStatus: HealthStatus = 'healthy';
    if (checks.some((c) => c.status === 'error')) {
      overallStatus = 'error';
    } else if (checks.some((c) => c.status === 'critical')) {
      overallStatus = 'critical';
    } else if (checks.some((c) => c.status === 'warning')) {
      overallStatus = 'warning';
    }

    return {
      overallStatus,
      overallScore: Math.round(avgScore * 100) / 100,
      checks,
      criticalIssues,
      warnings,
      lastChecked: new Date(),
    };
  }

  private determineStatus(score: number, hasCritical: boolean, hasWarning: boolean): HealthStatus {
    if (hasCritical || score < 70) return 'critical';
    if (hasWarning || score < 90) return 'warning';
    return 'healthy';
  }

  private parseVector(vectorString: string): number[] {
    const cleaned = vectorString.replace(/[[\]]/g, '');
    return cleaned.split(',').map((n) => parseFloat(n));
  }

  private calculateMagnitude(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  }

  private mapRowToResult(row: Record<string, unknown>): HealthCheckResult {
    return {
      id: row.id as string,
      checkType: row.check_type as HealthCheckType,
      targetTable: row.target_table as string,
      modelId: row.model_id as string | undefined,
      status: row.status as HealthStatus,
      score: parseFloat(row.score as string),
      totalChecked: row.total_checked as number,
      passed: row.passed as number,
      failed: row.failed as number,
      warnings: row.warnings as number,
      issues: Array.isArray(row.issues) ? (row.issues as HealthCheckIssue[]) : [],
      recommendations: Array.isArray(row.recommendations)
        ? (row.recommendations as HealthCheckRecommendation[])
        : [],
      metrics:
        row.metrics && typeof row.metrics === 'object'
          ? (row.metrics as Record<string, unknown>)
          : {},
      checkDurationMs: row.check_duration_ms as number,
      correlationId: row.correlation_id as string | undefined,
      timestamp: new Date(row.created_at as string),
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmbeddingHealthCheckService(
  pool: Pool,
  registry?: EmbeddingModelRegistry
): EmbeddingHealthCheckService {
  return new EmbeddingHealthCheckService(pool, registry);
}
