/**
 * @fileoverview Tests for Index Usage Monitoring Schemas
 *
 * Tests Zod schema validation for index usage monitoring types.
 */

import { describe, it, expect } from 'vitest';
import {
  IndexHealthStatusSchema,
  IndexTypeSchema,
  IndexRecommendationActionSchema,
  IndexUsageReportSchema,
  IndexUsageSummarySchema,
  IndexMonitoringConfigSchema,
  IndexMonitoringResultSchema,
  IndexUsageQuerySchema,
  IndexRecommendationSchema,
} from '../index-usage.js';

describe('Index Usage Schemas', () => {
  describe('IndexHealthStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(IndexHealthStatusSchema.safeParse('healthy').success).toBe(true);
      expect(IndexHealthStatusSchema.safeParse('degraded').success).toBe(true);
      expect(IndexHealthStatusSchema.safeParse('critical').success).toBe(true);
      expect(IndexHealthStatusSchema.safeParse('unused').success).toBe(true);
    });

    it('should reject invalid status values', () => {
      expect(IndexHealthStatusSchema.safeParse('unknown').success).toBe(false);
      expect(IndexHealthStatusSchema.safeParse('warning').success).toBe(false);
      expect(IndexHealthStatusSchema.safeParse('').success).toBe(false);
    });
  });

  describe('IndexTypeSchema', () => {
    it('should accept valid index types', () => {
      const validTypes = [
        'btree',
        'hash',
        'gin',
        'gist',
        'spgist',
        'brin',
        'hnsw',
        'ivfflat',
        'unknown',
      ];
      for (const type of validTypes) {
        expect(IndexTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('should reject invalid index types', () => {
      expect(IndexTypeSchema.safeParse('bitmap').success).toBe(false);
      expect(IndexTypeSchema.safeParse('bloom').success).toBe(false);
    });
  });

  describe('IndexRecommendationActionSchema', () => {
    it('should accept valid actions', () => {
      const validActions = ['keep', 'analyze', 'vacuum', 'reindex', 'drop', 'monitor'];
      for (const action of validActions) {
        expect(IndexRecommendationActionSchema.safeParse(action).success).toBe(true);
      }
    });

    it('should reject invalid actions', () => {
      expect(IndexRecommendationActionSchema.safeParse('delete').success).toBe(false);
      expect(IndexRecommendationActionSchema.safeParse('rebuild').success).toBe(false);
    });
  });

  describe('IndexUsageReportSchema', () => {
    const validReport = {
      indexName: 'idx_users_email',
      tableName: 'users',
      schemaName: 'public',
      indexType: 'btree',
      indexSize: '100 MB',
      indexSizeBytes: 104857600,
      indexScans: 1000,
      tuplesRead: 5000,
      tuplesFetched: 4500,
      efficiency: 0.9,
      status: 'healthy',
      lastAnalyze: new Date(),
      lastVacuum: new Date(),
      isUnique: true,
      isPrimaryKey: false,
      recommendations: ['Index is healthy'],
    };

    it('should accept a valid report', () => {
      const result = IndexUsageReportSchema.safeParse(validReport);
      expect(result.success).toBe(true);
    });

    it('should accept null for lastAnalyze and lastVacuum', () => {
      const report = { ...validReport, lastAnalyze: null, lastVacuum: null };
      const result = IndexUsageReportSchema.safeParse(report);
      expect(result.success).toBe(true);
    });

    it('should reject negative indexScans', () => {
      const report = { ...validReport, indexScans: -1 };
      const result = IndexUsageReportSchema.safeParse(report);
      expect(result.success).toBe(false);
    });

    it('should reject efficiency outside 0-1 range', () => {
      expect(IndexUsageReportSchema.safeParse({ ...validReport, efficiency: -0.1 }).success).toBe(
        false
      );
      expect(IndexUsageReportSchema.safeParse({ ...validReport, efficiency: 1.1 }).success).toBe(
        false
      );
    });

    it('should accept efficiency at boundary values', () => {
      expect(IndexUsageReportSchema.safeParse({ ...validReport, efficiency: 0 }).success).toBe(
        true
      );
      expect(IndexUsageReportSchema.safeParse({ ...validReport, efficiency: 1 }).success).toBe(
        true
      );
    });

    it('should coerce date strings to Date objects', () => {
      const report = {
        ...validReport,
        lastAnalyze: '2024-01-15T10:00:00Z',
        lastVacuum: '2024-01-15T10:00:00Z',
      };
      const result = IndexUsageReportSchema.safeParse(report);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastAnalyze).toBeInstanceOf(Date);
        expect(result.data.lastVacuum).toBeInstanceOf(Date);
      }
    });
  });

  describe('IndexUsageSummarySchema', () => {
    const validSummary = {
      totalIndexes: 50,
      healthyIndexes: 40,
      degradedIndexes: 5,
      criticalIndexes: 2,
      unusedIndexes: 3,
      totalIndexSize: '5 GB',
      totalIndexSizeBytes: 5368709120,
      overallStatus: 'degraded',
      indexes: [],
      globalRecommendations: ['3 unused indexes found'],
      checkedAt: new Date(),
    };

    it('should accept a valid summary', () => {
      const result = IndexUsageSummarySchema.safeParse(validSummary);
      expect(result.success).toBe(true);
    });

    it('should reject negative counts', () => {
      expect(IndexUsageSummarySchema.safeParse({ ...validSummary, totalIndexes: -1 }).success).toBe(
        false
      );
      expect(
        IndexUsageSummarySchema.safeParse({ ...validSummary, unusedIndexes: -1 }).success
      ).toBe(false);
    });
  });

  describe('IndexMonitoringConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = IndexMonitoringConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unusedThresholdDays).toBe(30);
        expect(result.data.healthyEfficiencyThreshold).toBe(0.5);
        expect(result.data.analyzeStalenessDays).toBe(7);
        expect(result.data.vacuumStalenessDays).toBe(7);
        expect(result.data.includeSchemas).toEqual(['public']);
        expect(result.data.excludePatterns).toEqual([]);
        expect(result.data.includeSystemIndexes).toBe(false);
      }
    });

    it('should accept custom configuration', () => {
      const config = {
        unusedThresholdDays: 60,
        healthyEfficiencyThreshold: 0.7,
        analyzeStalenessDays: 3,
        vacuumStalenessDays: 14,
        includeSchemas: ['public', 'app'],
        excludePatterns: ['^pg_', '^_'],
        includeSystemIndexes: true,
      };
      const result = IndexMonitoringConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unusedThresholdDays).toBe(60);
        expect(result.data.includeSchemas).toEqual(['public', 'app']);
      }
    });

    it('should reject invalid threshold values', () => {
      expect(IndexMonitoringConfigSchema.safeParse({ unusedThresholdDays: 0 }).success).toBe(false);
      expect(IndexMonitoringConfigSchema.safeParse({ unusedThresholdDays: -1 }).success).toBe(
        false
      );
      expect(
        IndexMonitoringConfigSchema.safeParse({ healthyEfficiencyThreshold: 1.5 }).success
      ).toBe(false);
      expect(
        IndexMonitoringConfigSchema.safeParse({ healthyEfficiencyThreshold: -0.1 }).success
      ).toBe(false);
    });
  });

  describe('IndexMonitoringResultSchema', () => {
    const validResult = {
      success: true,
      indexesMonitored: 50,
      unusedIndexesFound: 3,
      degradedIndexesFound: 5,
      criticalIndexesFound: 0,
      potentialSavingsBytes: 104857600,
      potentialSavings: '100 MB',
      processingTimeMs: 1500,
      correlationId: 'test_123',
    };

    it('should accept a valid result', () => {
      const result = IndexMonitoringResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should accept result with error', () => {
      const errorResult = { ...validResult, success: false, error: 'Database connection failed' };
      const result = IndexMonitoringResultSchema.safeParse(errorResult);
      expect(result.success).toBe(true);
    });

    it('should require correlationId', () => {
      const { correlationId, ...withoutCorrelation } = validResult;
      const result = IndexMonitoringResultSchema.safeParse(withoutCorrelation);
      expect(result.success).toBe(false);
    });
  });

  describe('IndexUsageQuerySchema', () => {
    it('should accept empty query (uses defaults)', () => {
      const result = IndexUsageQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should accept all query parameters', () => {
      const query = {
        indexName: 'idx_test',
        tableName: 'users',
        schemaName: 'public',
        status: 'unused',
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
        limit: 50,
        offset: 10,
      };
      const result = IndexUsageQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should cap limit at 1000', () => {
      const result = IndexUsageQuerySchema.safeParse({ limit: 2000 });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = IndexUsageQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('IndexRecommendationSchema', () => {
    const validRecommendation = {
      indexName: 'idx_unused_test',
      tableName: 'test_table',
      action: 'drop',
      reason: 'Index is unused and consuming storage',
      priority: 'high',
      estimatedSavingsBytes: 104857600,
      estimatedSavings: '100 MB',
    };

    it('should accept a valid recommendation', () => {
      const result = IndexRecommendationSchema.safeParse(validRecommendation);
      expect(result.success).toBe(true);
    });

    it('should accept recommendation without savings', () => {
      const { estimatedSavingsBytes, estimatedSavings, ...withoutSavings } = validRecommendation;
      const result = IndexRecommendationSchema.safeParse(withoutSavings);
      expect(result.success).toBe(true);
    });

    it('should validate priority values', () => {
      for (const priority of ['low', 'medium', 'high', 'critical']) {
        const rec = { ...validRecommendation, priority };
        expect(IndexRecommendationSchema.safeParse(rec).success).toBe(true);
      }
      expect(
        IndexRecommendationSchema.safeParse({ ...validRecommendation, priority: 'urgent' }).success
      ).toBe(false);
    });
  });
});
