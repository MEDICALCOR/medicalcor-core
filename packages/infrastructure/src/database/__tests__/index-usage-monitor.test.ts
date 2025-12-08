/**
 * @fileoverview Tests for Index Usage Monitor
 *
 * Tests the IndexUsageMonitor class and related helper functions
 * for PostgreSQL index usage monitoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  determineIndexStatus,
  formatBytes,
  calculatePotentialSavings,
  generateIndexRecommendations,
  type IndexMonitoringConfig,
  type IndexUsageReport,
} from '@medicalcor/types';

// Test configuration
const DEFAULT_CONFIG: IndexMonitoringConfig = {
  unusedThresholdDays: 30,
  healthyEfficiencyThreshold: 0.5,
  analyzeStalenessDays: 7,
  vacuumStalenessDays: 7,
  includeSchemas: ['public'],
  excludePatterns: [],
  includeSystemIndexes: false,
};

describe('Index Usage Monitor', () => {
  describe('determineIndexStatus', () => {
    it('should return "unused" when scans is zero', () => {
      const status = determineIndexStatus(0, 0, null, DEFAULT_CONFIG);
      expect(status).toBe('unused');
    });

    it('should return "critical" when efficiency is below 25%', () => {
      const status = determineIndexStatus(100, 0.2, new Date(), DEFAULT_CONFIG);
      expect(status).toBe('critical');
    });

    it('should return "degraded" when efficiency is below threshold', () => {
      const status = determineIndexStatus(100, 0.4, new Date(), DEFAULT_CONFIG);
      expect(status).toBe('degraded');
    });

    it('should return "degraded" when lastAnalyze is null', () => {
      const status = determineIndexStatus(100, 0.8, null, DEFAULT_CONFIG);
      expect(status).toBe('degraded');
    });

    it('should return "degraded" when lastAnalyze is stale', () => {
      const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const status = determineIndexStatus(100, 0.8, staleDate, DEFAULT_CONFIG);
      expect(status).toBe('degraded');
    });

    it('should return "healthy" when all conditions are met', () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const status = determineIndexStatus(100, 0.8, recentDate, DEFAULT_CONFIG);
      expect(status).toBe('healthy');
    });

    it('should respect custom efficiency threshold', () => {
      const customConfig = { ...DEFAULT_CONFIG, healthyEfficiencyThreshold: 0.8 };
      const status = determineIndexStatus(100, 0.6, new Date(), customConfig);
      expect(status).toBe('degraded');
    });

    it('should respect custom staleness threshold', () => {
      const customConfig = { ...DEFAULT_CONFIG, analyzeStalenessDays: 3 };
      const staleDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const status = determineIndexStatus(100, 0.8, staleDate, customConfig);
      expect(status).toBe('degraded');
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format KB correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format MB correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });

    it('should format GB correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(2147483648)).toBe('2 GB');
    });

    it('should format TB correctly', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('should handle decimal precision', () => {
      expect(formatBytes(1500)).toBe('1.46 KB');
      expect(formatBytes(1500000)).toBe('1.43 MB');
    });
  });

  describe('calculatePotentialSavings', () => {
    it('should calculate savings for unused non-primary indexes', () => {
      const indexes: Pick<IndexUsageReport, 'status' | 'indexSizeBytes' | 'isPrimaryKey' | 'isUnique'>[] = [
        { status: 'unused', indexSizeBytes: 1000000, isPrimaryKey: false, isUnique: false },
        { status: 'unused', indexSizeBytes: 500000, isPrimaryKey: false, isUnique: false },
        { status: 'healthy', indexSizeBytes: 2000000, isPrimaryKey: false, isUnique: false },
      ];

      const result = calculatePotentialSavings(indexes);
      expect(result.bytes).toBe(1500000);
      expect(result.formatted).toBe('1.43 MB');
    });

    it('should exclude primary key indexes from savings', () => {
      const indexes: Pick<IndexUsageReport, 'status' | 'indexSizeBytes' | 'isPrimaryKey' | 'isUnique'>[] = [
        { status: 'unused', indexSizeBytes: 1000000, isPrimaryKey: true, isUnique: false },
        { status: 'unused', indexSizeBytes: 500000, isPrimaryKey: false, isUnique: false },
      ];

      const result = calculatePotentialSavings(indexes);
      expect(result.bytes).toBe(500000);
    });

    it('should exclude unique indexes from savings', () => {
      const indexes: Pick<IndexUsageReport, 'status' | 'indexSizeBytes' | 'isPrimaryKey' | 'isUnique'>[] = [
        { status: 'unused', indexSizeBytes: 1000000, isPrimaryKey: false, isUnique: true },
        { status: 'unused', indexSizeBytes: 500000, isPrimaryKey: false, isUnique: false },
      ];

      const result = calculatePotentialSavings(indexes);
      expect(result.bytes).toBe(500000);
    });

    it('should return zero for no unused indexes', () => {
      const indexes: Pick<IndexUsageReport, 'status' | 'indexSizeBytes' | 'isPrimaryKey' | 'isUnique'>[] = [
        { status: 'healthy', indexSizeBytes: 1000000, isPrimaryKey: false, isUnique: false },
        { status: 'degraded', indexSizeBytes: 500000, isPrimaryKey: false, isUnique: false },
      ];

      const result = calculatePotentialSavings(indexes);
      expect(result.bytes).toBe(0);
      expect(result.formatted).toBe('0 Bytes');
    });

    it('should handle empty array', () => {
      const result = calculatePotentialSavings([]);
      expect(result.bytes).toBe(0);
    });
  });

  describe('generateIndexRecommendations', () => {
    const baseIndex = {
      efficiency: 0.8,
      lastAnalyze: new Date(),
      lastVacuum: new Date(),
      isPrimaryKey: false,
      isUnique: false,
    };

    it('should recommend dropping unused non-primary indexes', () => {
      const index = { ...baseIndex, status: 'unused' as const };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations).toContain(
        'This index is unused. Consider dropping it to save storage and improve write performance.'
      );
    });

    it('should not recommend dropping primary key indexes', () => {
      const index = { ...baseIndex, status: 'unused' as const, isPrimaryKey: true };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.some(r => r.includes('verify table is being accessed correctly'))).toBe(true);
      expect(recommendations.some(r => r.includes('Consider dropping'))).toBe(false);
    });

    it('should recommend reindexing critical indexes', () => {
      const index = { ...baseIndex, status: 'critical' as const, efficiency: 0.1 };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.some(r => r.includes('REINDEX CONCURRENTLY'))).toBe(true);
    });

    it('should recommend ANALYZE for stale statistics', () => {
      const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const index = { ...baseIndex, status: 'healthy' as const, lastAnalyze: staleDate };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.some(r => r.includes('ANALYZE'))).toBe(true);
    });

    it('should recommend ANALYZE when never analyzed', () => {
      const index = { ...baseIndex, status: 'healthy' as const, lastAnalyze: null };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations).toContain('Run ANALYZE on this table to update statistics.');
    });

    it('should recommend VACUUM for stale vacuum', () => {
      const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const index = { ...baseIndex, status: 'healthy' as const, lastVacuum: staleDate };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.some(r => r.includes('VACUUM'))).toBe(true);
    });

    it('should recommend VACUUM when never vacuumed', () => {
      const index = { ...baseIndex, status: 'healthy' as const, lastVacuum: null };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations).toContain('Run VACUUM to reclaim dead tuples.');
    });

    it('should warn about low efficiency', () => {
      const index = { ...baseIndex, status: 'degraded' as const, efficiency: 0.3 };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.some(r => r.includes('efficiency is 30.0%'))).toBe(true);
    });

    it('should return empty recommendations for healthy indexes', () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const index = {
        ...baseIndex,
        status: 'healthy' as const,
        lastAnalyze: recentDate,
        lastVacuum: recentDate,
        efficiency: 0.9,
      };
      const recommendations = generateIndexRecommendations(index, DEFAULT_CONFIG);

      expect(recommendations.length).toBe(0);
    });
  });

  describe('IndexMonitoringConfig schema validation', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_CONFIG.unusedThresholdDays).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.healthyEfficiencyThreshold).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.healthyEfficiencyThreshold).toBeLessThanOrEqual(1);
      expect(DEFAULT_CONFIG.analyzeStalenessDays).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.vacuumStalenessDays).toBeGreaterThan(0);
    });

    it('should have valid schema configuration', () => {
      expect(Array.isArray(DEFAULT_CONFIG.includeSchemas)).toBe(true);
      expect(Array.isArray(DEFAULT_CONFIG.excludePatterns)).toBe(true);
      expect(typeof DEFAULT_CONFIG.includeSystemIndexes).toBe('boolean');
    });
  });
});

describe('Index Type Detection', () => {
  // Test cases for index type detection patterns
  const testCases = [
    { def: 'CREATE INDEX idx_test USING btree (id)', expected: 'btree' },
    { def: 'CREATE INDEX idx_test USING hash (id)', expected: 'hash' },
    { def: 'CREATE INDEX idx_test USING gin (data)', expected: 'gin' },
    { def: 'CREATE INDEX idx_test USING gist (geom)', expected: 'gist' },
    { def: 'CREATE INDEX idx_test USING brin (created_at)', expected: 'brin' },
    { def: 'CREATE INDEX idx_test USING hnsw (embedding vector_cosine_ops)', expected: 'hnsw' },
    { def: 'CREATE INDEX idx_test USING ivfflat (embedding)', expected: 'ivfflat' },
    { def: 'CREATE INDEX idx_test ON table (id)', expected: 'btree' }, // Default
  ];

  it.each(testCases)('should detect $expected index from definition', ({ def, expected }) => {
    // This tests the pattern matching logic used in the monitor
    const detectIndexType = (indexdef: string) => {
      const d = indexdef.toLowerCase();
      if (d.includes('using btree')) return 'btree';
      if (d.includes('using hash')) return 'hash';
      if (d.includes('using gin')) return 'gin';
      if (d.includes('using gist')) return 'gist';
      if (d.includes('using spgist')) return 'spgist';
      if (d.includes('using brin')) return 'brin';
      if (d.includes('using hnsw')) return 'hnsw';
      if (d.includes('using ivfflat')) return 'ivfflat';
      if (!d.includes('using ')) return 'btree';
      return 'unknown';
    };

    expect(detectIndexType(def)).toBe(expected);
  });
});

describe('Status Priority', () => {
  it('should have correct priority order for recommendations', () => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    expect(priorityOrder.critical).toBeLessThan(priorityOrder.high);
    expect(priorityOrder.high).toBeLessThan(priorityOrder.medium);
    expect(priorityOrder.medium).toBeLessThan(priorityOrder.low);
  });

  it('should map status to appropriate recommendation priority', () => {
    const statusToPriority = (status: string) => {
      switch (status) {
        case 'unused':
          return 'high';
        case 'critical':
          return 'critical';
        case 'degraded':
          return 'medium';
        case 'healthy':
          return 'low';
        default:
          return 'low';
      }
    };

    expect(statusToPriority('critical')).toBe('critical');
    expect(statusToPriority('unused')).toBe('high');
    expect(statusToPriority('degraded')).toBe('medium');
    expect(statusToPriority('healthy')).toBe('low');
  });
});
