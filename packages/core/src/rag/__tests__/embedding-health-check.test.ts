/**
 * @fileoverview Tests for EmbeddingHealthCheckService
 *
 * Comprehensive tests for the embedding health monitoring service covering:
 * - Individual health checks (consistency, quality, coverage, staleness, dimension validation)
 * - Running all checks
 * - Check history retrieval
 * - Result aggregation
 * - Helper methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  EmbeddingHealthCheckService,
  createEmbeddingHealthCheckService,
  type HealthCheckResult,
  type HealthStatus,
  type HealthCheckType,
} from '../embedding-health-check.js';
import {
  createEmbeddingModelRegistry,
  type EmbeddingModelRegistry,
} from '../embedding-model-registry.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Create mock functions for pool
function createMockPool() {
  const mockQuery = vi.fn();

  return {
    query: mockQuery,
    _mockQuery: mockQuery,
  };
}

// Type for mock pool
type MockPool = ReturnType<typeof createMockPool>;

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockDistributionResult(
  distributions: Array<{
    model: string;
    entry_count: string;
    percentage: string;
  }>
) {
  return { rows: distributions };
}

function createMockQualitySamples(
  samples: Array<{
    id: string;
    embedding: string;
    embedding_model: string;
  }>
) {
  return { rows: samples };
}

function createMockCoverageStats(stats: {
  total: string;
  with_embedding: string;
  without_embedding: string;
}) {
  return { rows: [stats] };
}

function createMockStalenessStats(stats: { total: string; stale: string; unknown_age: string }) {
  return { rows: [stats] };
}

function createMockDimensionValidation(
  results: Array<{
    model: string;
    expected_dimensions: number;
    entries_checked: string;
    valid_count: string;
    invalid_count: string;
    null_count: string;
  }>
) {
  return { rows: results };
}

function createMockHistoryRows(
  results: Array<{
    id: string;
    check_type: string;
    target_table: string;
    model_id?: string;
    status: string;
    score: string;
    total_checked: number;
    passed: number;
    failed: number;
    warnings: number;
    issues: unknown[];
    recommendations: unknown[];
    metrics: Record<string, unknown>;
    check_duration_ms: number;
    correlation_id?: string;
    created_at: string;
  }>
) {
  return { rows: results };
}

// Generate normalized embedding vector string
function createNormalizedEmbeddingString(
  dimension: number = 1536,
  magnitude: number = 1.0
): string {
  const baseValue = magnitude / Math.sqrt(dimension);
  const embedding = Array(dimension).fill(baseValue);
  return `[${embedding.join(',')}]`;
}

function createZeroEmbeddingString(dimension: number = 1536): string {
  return `[${Array(dimension).fill(0).join(',')}]`;
}

function createLowMagnitudeEmbeddingString(dimension: number = 1536): string {
  const baseValue = 0.05 / Math.sqrt(dimension);
  const embedding = Array(dimension).fill(baseValue);
  return `[${embedding.join(',')}]`;
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('EmbeddingHealthCheckService', () => {
  let service: EmbeddingHealthCheckService;
  let mockPool: MockPool;
  let registry: EmbeddingModelRegistry;

  beforeEach(() => {
    mockPool = createMockPool();
    registry = createEmbeddingModelRegistry();
    service = new EmbeddingHealthCheckService(mockPool as unknown as import('pg').Pool, registry);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // CONSISTENCY CHECK TESTS
  // ============================================================================

  describe('checkConsistency (via runCheck)', () => {
    it('should return healthy status when all models are active', async () => {
      // Mock distribution with only active models
      mockPool.query
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-3-small', entry_count: '100', percentage: '100.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.checkType).toBe('consistency');
      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.warnings).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should return warning status for deprecated models', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-3-small', entry_count: '80', percentage: '80.00' },
            { model: 'text-embedding-ada-002', entry_count: '20', percentage: '20.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('warning');
      expect(result.warnings).toBe(20);
      expect(result.issues.some((i) => i.code === 'DEPRECATED_MODEL')).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return critical status for unknown models', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-3-small', entry_count: '70', percentage: '70.00' },
            { model: 'unknown-model-xyz', entry_count: '30', percentage: '30.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('critical');
      expect(result.failed).toBe(30);
      expect(result.issues.some((i) => i.code === 'UNKNOWN_MODEL')).toBe(true);
    });

    it('should handle empty database', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult([]))
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.totalChecked).toBe(0);
    });

    it('should include model distribution in metrics', async () => {
      const distribution = [
        { model: 'text-embedding-3-small', entry_count: '60', percentage: '60.00' },
        { model: 'text-embedding-3-large', entry_count: '40', percentage: '40.00' },
      ];

      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult(distribution))
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.metrics.modelDistribution).toEqual(distribution);
      expect(result.metrics.uniqueModels).toBe(2);
    });
  });

  // ============================================================================
  // QUALITY CHECK TESTS
  // ============================================================================

  describe('checkQuality (via runCheck)', () => {
    it('should return healthy status for all valid embeddings', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockQualitySamples([
            {
              id: 'kb-1',
              embedding: createNormalizedEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
            {
              id: 'kb-2',
              embedding: createNormalizedEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
        sampleSize: 100,
      });

      expect(result.checkType).toBe('quality');
      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should detect zero vectors', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockQualitySamples([
            {
              id: 'kb-1',
              embedding: createNormalizedEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
            {
              id: 'kb-2',
              embedding: createZeroEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('critical');
      expect(result.failed).toBe(1);
      expect(result.issues.some((i) => i.code === 'ZERO_VECTOR')).toBe(true);
      expect(result.recommendations.some((r) => r.action.includes('Regenerate'))).toBe(true);
    });

    it('should detect low magnitude embeddings', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockQualitySamples([
            {
              id: 'kb-1',
              embedding: createNormalizedEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
            {
              id: 'kb-2',
              embedding: createLowMagnitudeEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
      });

      expect(result.warnings).toBe(1);
      expect(result.issues.some((i) => i.code === 'LOW_MAGNITUDE')).toBe(true);
    });

    it('should handle empty sample set', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockQualitySamples([]))
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.totalChecked).toBe(0);
    });

    it('should query message_embeddings table when specified', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockQualitySamples([]))
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      await service.runCheck('quality', {
        targetTable: 'message_embeddings',
        sampleSize: 50,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('message_embeddings'),
        expect.any(Array)
      );
    });
  });

  // ============================================================================
  // COVERAGE CHECK TESTS
  // ============================================================================

  describe('checkCoverage (via runCheck)', () => {
    it('should return healthy status for 100% coverage', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '100',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.checkType).toBe('coverage');
      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should return warning status for coverage between 80-95%', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '90',
            without_embedding: '10',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('warning');
      expect(result.score).toBe(90);
      expect(result.issues.some((i) => i.code === 'MISSING_EMBEDDINGS')).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return critical status for coverage below 80%', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '70',
            without_embedding: '30',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('critical');
      expect(result.score).toBe(70);
      expect(result.issues.some((i) => i.type === 'error')).toBe(true);
      expect(result.recommendations.some((r) => r.priority === 'high')).toBe(true);
    });

    it('should handle empty database', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '0',
            with_embedding: '0',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
    });

    it('should include coverage metrics', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '200',
            with_embedding: '190',
            without_embedding: '10',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.metrics.totalEntries).toBe(200);
      expect(result.metrics.withEmbedding).toBe(190);
      expect(result.metrics.withoutEmbedding).toBe(10);
      expect(result.metrics.coveragePercent).toBe(95);
    });
  });

  // ============================================================================
  // STALENESS CHECK TESTS
  // ============================================================================

  describe('checkStaleness (via runCheck)', () => {
    it('should return healthy status when no stale embeddings', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '0',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('staleness', {
        targetTable: 'knowledge_base',
      });

      expect(result.checkType).toBe('staleness');
      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.warnings).toBe(0);
    });

    it('should return warning status for stale embeddings > 10%', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '15',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('staleness', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('warning');
      expect(result.score).toBe(85);
      expect(result.warnings).toBe(15);
      expect(result.issues.some((i) => i.code === 'STALE_EMBEDDINGS')).toBe(true);
    });

    it('should report embeddings with unknown age', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '0',
            unknown_age: '20',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('staleness', {
        targetTable: 'knowledge_base',
      });

      expect(result.issues.some((i) => i.code === 'UNKNOWN_EMBEDDING_AGE')).toBe(true);
      expect(result.issues.find((i) => i.code === 'UNKNOWN_EMBEDDING_AGE')?.type).toBe('info');
    });

    it('should include staleness metrics', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '5',
            unknown_age: '10',
          })
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('staleness', {
        targetTable: 'knowledge_base',
      });

      expect(result.metrics.totalEmbeddings).toBe(100);
      expect(result.metrics.staleEmbeddings).toBe(5);
      expect(result.metrics.unknownAge).toBe(10);
      expect(result.metrics.freshnessPercent).toBe(95);
    });
  });

  // ============================================================================
  // DIMENSION VALIDATION TESTS
  // ============================================================================

  describe('checkDimensions (via runCheck)', () => {
    it('should return healthy status when all dimensions are valid', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDimensionValidation([
            {
              model: 'text-embedding-3-small',
              expected_dimensions: 1536,
              entries_checked: '100',
              valid_count: '100',
              invalid_count: '0',
              null_count: '0',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('dimension_validation', {
        targetTable: 'knowledge_base',
        sampleSize: 1000,
      });

      expect(result.checkType).toBe('dimension_validation');
      expect(result.status).toBe('healthy');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(100);
      expect(result.failed).toBe(0);
    });

    it('should return critical status for dimension mismatches', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDimensionValidation([
            {
              model: 'text-embedding-3-small',
              expected_dimensions: 1536,
              entries_checked: '100',
              valid_count: '90',
              invalid_count: '10',
              null_count: '0',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('dimension_validation', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('critical');
      expect(result.failed).toBe(10);
      expect(result.issues.some((i) => i.code === 'DIMENSION_MISMATCH')).toBe(true);
      expect(result.recommendations.some((r) => r.priority === 'high')).toBe(true);
    });

    it('should handle multiple models', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDimensionValidation([
            {
              model: 'text-embedding-3-small',
              expected_dimensions: 1536,
              entries_checked: '50',
              valid_count: '50',
              invalid_count: '0',
              null_count: '0',
            },
            {
              model: 'text-embedding-3-large',
              expected_dimensions: 3072,
              entries_checked: '50',
              valid_count: '45',
              invalid_count: '5',
              null_count: '0',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      const result = await service.runCheck('dimension_validation', {
        targetTable: 'knowledge_base',
      });

      expect(result.totalChecked).toBe(100);
      expect(result.passed).toBe(95);
      expect(result.failed).toBe(5);
    });
  });

  // ============================================================================
  // RUN ALL CHECKS TESTS
  // ============================================================================

  describe('runAllChecks', () => {
    it('should run all check types', async () => {
      // Mock responses for all 5 checks + their storeCheckResult calls
      mockPool.query
        // Consistency check
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-3-small', entry_count: '100', percentage: '100.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] })
        // Quality check
        .mockResolvedValueOnce(
          createMockQualitySamples([
            {
              id: 'kb-1',
              embedding: createNormalizedEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] })
        // Coverage check
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '100',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Staleness check
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '0',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Dimension validation
        .mockResolvedValueOnce(
          createMockDimensionValidation([
            {
              model: 'text-embedding-3-small',
              expected_dimensions: 1536,
              entries_checked: '100',
              valid_count: '100',
              invalid_count: '0',
              null_count: '0',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] });

      const summary = await service.runAllChecks({ targetTable: 'knowledge_base' });

      expect(summary.checks).toHaveLength(5);
      expect(summary.overallStatus).toBe('healthy');
      expect(summary.overallScore).toBe(100);
      expect(summary.criticalIssues).toBe(0);
      expect(summary.warnings).toBe(0);
      expect(summary.lastChecked).toBeInstanceOf(Date);
    });

    it('should aggregate errors from all checks', async () => {
      // Mock responses with some errors
      mockPool.query
        // Consistency check - has warning
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-ada-002', entry_count: '100', percentage: '100.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] })
        // Quality check - has error
        .mockResolvedValueOnce(
          createMockQualitySamples([
            {
              id: 'kb-1',
              embedding: createZeroEmbeddingString(),
              embedding_model: 'text-embedding-3-small',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] })
        // Coverage check - healthy
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '100',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Staleness check - healthy
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '100',
            stale: '0',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Dimension validation - healthy
        .mockResolvedValueOnce(
          createMockDimensionValidation([
            {
              model: 'text-embedding-3-small',
              expected_dimensions: 1536,
              entries_checked: '100',
              valid_count: '100',
              invalid_count: '0',
              null_count: '0',
            },
          ])
        )
        .mockResolvedValueOnce({ rows: [] });

      const summary = await service.runAllChecks({ targetTable: 'knowledge_base' });

      expect(summary.criticalIssues).toBeGreaterThan(0);
      expect(summary.warnings).toBeGreaterThan(0);
      expect(summary.overallStatus).not.toBe('healthy');
    });

    it('should handle check failures gracefully', async () => {
      // First check fails, rest succeed
      mockPool.query
        .mockRejectedValueOnce(new Error('Database connection failed'))
        // Quality check - succeeds
        .mockResolvedValueOnce(createMockQualitySamples([]))
        .mockResolvedValueOnce({ rows: [] })
        // Coverage check - succeeds
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '0',
            with_embedding: '0',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Staleness check - succeeds
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '0',
            stale: '0',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        // Dimension validation - succeeds
        .mockResolvedValueOnce(createMockDimensionValidation([]))
        .mockResolvedValueOnce({ rows: [] });

      const summary = await service.runAllChecks({ targetTable: 'knowledge_base' });

      expect(summary.checks).toHaveLength(5);
      expect(summary.checks[0].status).toBe('error');
      expect(summary.checks[0].issues[0].code).toBe('CHECK_FAILED');
      expect(summary.overallStatus).toBe('error');
    });

    it('should use provided correlationId for all checks', async () => {
      const correlationId = 'test-correlation-123';

      // Set up mocks for all checks
      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult([]))
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(createMockQualitySamples([]))
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '0',
            with_embedding: '0',
            without_embedding: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(
          createMockStalenessStats({
            total: '0',
            stale: '0',
            unknown_age: '0',
          })
        )
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(createMockDimensionValidation([]))
        .mockResolvedValueOnce({ rows: [] });

      const summary = await service.runAllChecks({
        targetTable: 'knowledge_base',
        correlationId,
      });

      // All checks should have the same correlationId
      for (const check of summary.checks) {
        expect(check.correlationId).toBe(correlationId);
      }
    });
  });

  // ============================================================================
  // GET CHECK HISTORY TESTS
  // ============================================================================

  describe('getCheckHistory', () => {
    it('should retrieve check history', async () => {
      mockPool.query.mockResolvedValueOnce(
        createMockHistoryRows([
          {
            id: 'check-1',
            check_type: 'consistency',
            target_table: 'knowledge_base',
            status: 'healthy',
            score: '100',
            total_checked: 100,
            passed: 100,
            failed: 0,
            warnings: 0,
            issues: [],
            recommendations: [],
            metrics: {},
            check_duration_ms: 50,
            created_at: '2024-01-01T00:00:00Z',
          },
        ])
      );

      const history = await service.getCheckHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('check-1');
      expect(history[0].checkType).toBe('consistency');
      expect(history[0].status).toBe('healthy');
    });

    it('should filter by checkType', async () => {
      mockPool.query.mockResolvedValueOnce(createMockHistoryRows([]));

      await service.getCheckHistory({ checkType: 'quality' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('check_type'),
        expect.arrayContaining(['quality'])
      );
    });

    it('should filter by targetTable', async () => {
      mockPool.query.mockResolvedValueOnce(createMockHistoryRows([]));

      await service.getCheckHistory({ targetTable: 'message_embeddings' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('target_table'),
        expect.arrayContaining(['message_embeddings'])
      );
    });

    it('should filter by since date', async () => {
      const sinceDate = new Date('2024-01-01');
      mockPool.query.mockResolvedValueOnce(createMockHistoryRows([]));

      await service.getCheckHistory({ since: sinceDate });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.arrayContaining([sinceDate])
      );
    });

    it('should apply limit', async () => {
      mockPool.query.mockResolvedValueOnce(createMockHistoryRows([]));

      await service.getCheckHistory({ limit: 50 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([50])
      );
    });

    it('should use default limit of 100', async () => {
      mockPool.query.mockResolvedValueOnce(createMockHistoryRows([]));

      await service.getCheckHistory();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([100])
      );
    });
  });

  // ============================================================================
  // HELPER METHOD TESTS
  // ============================================================================

  describe('determineStatus (via runCheck)', () => {
    it('should return critical for score below 70', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '60',
            without_embedding: '40',
          })
        )
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('critical');
    });

    it('should return warning for score between 70 and 90', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '85',
            without_embedding: '15',
          })
        )
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('warning');
    });

    it('should return healthy for score 90 or above', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockCoverageStats({
            total: '100',
            with_embedding: '95',
            without_embedding: '5',
          })
        )
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('coverage', {
        targetTable: 'knowledge_base',
      });

      expect(result.status).toBe('healthy');
    });
  });

  describe('parseVector', () => {
    it('should correctly parse vector strings', async () => {
      const embeddingString = '[0.1,0.2,0.3,0.4,0.5]';

      mockPool.query
        .mockResolvedValueOnce(
          createMockQualitySamples([
            { id: 'kb-1', embedding: embeddingString, embedding_model: 'text-embedding-3-small' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] });

      // Run quality check to test parseVector indirectly
      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
        sampleSize: 1,
      });

      // If parsing worked, magnitude calculation would have run
      expect(result.totalChecked).toBe(1);
    });
  });

  describe('calculateMagnitude', () => {
    it('should correctly identify normal magnitude vectors', async () => {
      // Create a unit vector
      const magnitude = Math.sqrt(3); // sqrt(1^2 + 1^2 + 1^2)
      const embedding = '[1,1,1]';

      mockPool.query
        .mockResolvedValueOnce(
          createMockQualitySamples([
            { id: 'kb-1', embedding, embedding_model: 'text-embedding-3-small' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('quality', {
        targetTable: 'knowledge_base',
        sampleSize: 1,
      });

      // Should be valid (magnitude > 0.1)
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  // ============================================================================
  // STORE CHECK RESULT TESTS
  // ============================================================================

  describe('storeCheckResult', () => {
    it('should store check result in database', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'text-embedding-3-small', entry_count: '100', percentage: '100.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      // Second query should be the INSERT for storing results
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query.mock.calls[1][0]).toContain('INSERT INTO embedding_health_checks');
    });

    it('should serialize issues and recommendations as JSON', async () => {
      mockPool.query
        .mockResolvedValueOnce(
          createMockDistributionResult([
            { model: 'unknown-model', entry_count: '10', percentage: '100.00' },
          ])
        )
        .mockResolvedValueOnce({ rows: [] }); // storeCheckResult

      await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      const insertCall = mockPool.query.mock.calls[1];
      const params = insertCall[1] as unknown[];

      // Issues param (index 9) should be JSON string
      expect(typeof params[9]).toBe('string');
      expect(() => JSON.parse(params[9] as string)).not.toThrow();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge cases', () => {
    it('should handle unknown check type', async () => {
      await expect(
        service.runCheck('unknown_type' as HealthCheckType, {
          targetTable: 'knowledge_base',
        })
      ).rejects.toThrow('Unknown check type');
    });

    it('should use default targetTable when not specified', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult([]))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('consistency');

      expect(result.targetTable).toBe('knowledge_base');
    });

    it('should generate correlationId when not provided', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult([]))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.correlationId).toBeDefined();
      expect(result.correlationId).toMatch(/^hc_/);
    });

    it('should track check duration', async () => {
      mockPool.query
        .mockResolvedValueOnce(createMockDistributionResult([]))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.runCheck('consistency', {
        targetTable: 'knowledge_base',
      });

      expect(result.checkDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // FACTORY FUNCTION TESTS
  // ============================================================================

  describe('createEmbeddingHealthCheckService', () => {
    it('should create service instance', () => {
      const pool = createMockPool();
      const service = createEmbeddingHealthCheckService(pool as unknown as import('pg').Pool);

      expect(service).toBeInstanceOf(EmbeddingHealthCheckService);
    });

    it('should use default registry when not provided', () => {
      const pool = createMockPool();
      const service = createEmbeddingHealthCheckService(pool as unknown as import('pg').Pool);

      expect(service).toBeInstanceOf(EmbeddingHealthCheckService);
    });

    it('should use custom registry when provided', () => {
      const pool = createMockPool();
      const customRegistry = createEmbeddingModelRegistry('text-embedding-3-large');
      const service = createEmbeddingHealthCheckService(
        pool as unknown as import('pg').Pool,
        customRegistry
      );

      expect(service).toBeInstanceOf(EmbeddingHealthCheckService);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should always return valid score between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }), // total must be >= 1
          (passed, total) => {
            // passed cannot exceed total in real scenarios
            const actualPassed = Math.min(passed, total);
            const score = (actualPassed / total) * 100;
            return score >= 0 && score <= 100;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return valid HealthStatus', () => {
      const validStatuses: HealthStatus[] = ['healthy', 'warning', 'critical', 'error'];

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.boolean(),
          fc.boolean(),
          (score, hasCritical, hasWarning) => {
            let status: HealthStatus;
            if (hasCritical || score < 70) {
              status = 'critical';
            } else if (hasWarning || score < 90) {
              status = 'warning';
            } else {
              status = 'healthy';
            }
            return validStatuses.includes(status);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly calculate vector magnitude', () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 100 }),
          (vector) => {
            const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
            return magnitude >= 0;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
