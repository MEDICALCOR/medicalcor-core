/**
 * @fileoverview Tests for HNSW optimizer and benchmarking utilities
 */

import { describe, it, expect } from 'vitest';
import {
  SEARCH_PROFILES,
  RECOMMENDED_PARAMS,
  buildHNSWIndexSQL,
  setEfSearchSQL,
} from '../hnsw-optimizer';
import { EF_SEARCH_BY_PROFILE } from '../PgVectorService';

describe('HNSW Optimizer', () => {
  describe('SEARCH_PROFILES', () => {
    it('should have all required profiles', () => {
      expect(SEARCH_PROFILES).toHaveProperty('fast');
      expect(SEARCH_PROFILES).toHaveProperty('balanced');
      expect(SEARCH_PROFILES).toHaveProperty('accurate');
      expect(SEARCH_PROFILES).toHaveProperty('exact');
    });

    it('should have increasing ef_search values', () => {
      expect(SEARCH_PROFILES.fast.efSearch).toBeLessThan(SEARCH_PROFILES.balanced.efSearch);
      expect(SEARCH_PROFILES.balanced.efSearch).toBeLessThan(SEARCH_PROFILES.accurate.efSearch);
      expect(SEARCH_PROFILES.accurate.efSearch).toBeLessThan(SEARCH_PROFILES.exact.efSearch);
    });

    it('should match EF_SEARCH_BY_PROFILE', () => {
      expect(SEARCH_PROFILES.fast.efSearch).toBe(EF_SEARCH_BY_PROFILE.fast);
      expect(SEARCH_PROFILES.balanced.efSearch).toBe(EF_SEARCH_BY_PROFILE.balanced);
      expect(SEARCH_PROFILES.accurate.efSearch).toBe(EF_SEARCH_BY_PROFILE.accurate);
      expect(SEARCH_PROFILES.exact.efSearch).toBe(EF_SEARCH_BY_PROFILE.exact);
    });
  });

  describe('RECOMMENDED_PARAMS', () => {
    it('should have configurations for all dataset sizes', () => {
      expect(RECOMMENDED_PARAMS).toHaveProperty('small');
      expect(RECOMMENDED_PARAMS).toHaveProperty('medium');
      expect(RECOMMENDED_PARAMS).toHaveProperty('large');
      expect(RECOMMENDED_PARAMS).toHaveProperty('xlarge');
    });

    it('should have valid M parameter ranges (4-64)', () => {
      for (const key of Object.keys(RECOMMENDED_PARAMS)) {
        const params = RECOMMENDED_PARAMS[key as keyof typeof RECOMMENDED_PARAMS];
        expect(params.m).toBeGreaterThanOrEqual(4);
        expect(params.m).toBeLessThanOrEqual(64);
      }
    });

    it('should have increasing M values for larger datasets', () => {
      expect(RECOMMENDED_PARAMS.small.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.medium.m);
      expect(RECOMMENDED_PARAMS.medium.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.large.m);
      expect(RECOMMENDED_PARAMS.large.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.xlarge.m);
    });

    it('should have valid ef_construction ranges (64-512)', () => {
      for (const key of Object.keys(RECOMMENDED_PARAMS)) {
        const params = RECOMMENDED_PARAMS[key as keyof typeof RECOMMENDED_PARAMS];
        expect(params.efConstruction).toBeGreaterThanOrEqual(64);
        expect(params.efConstruction).toBeLessThanOrEqual(512);
      }
    });
  });

  describe('buildHNSWIndexSQL', () => {
    it('should generate valid SQL for index creation', () => {
      const sql = buildHNSWIndexSQL('test_table', 'embedding', {
        m: 24,
        efConstruction: 200,
        efSearch: 100,
      });

      expect(sql).toContain('CREATE INDEX CONCURRENTLY');
      expect(sql).toContain('test_table');
      expect(sql).toContain('embedding');
      expect(sql).toContain('hnsw');
      expect(sql).toContain('vector_cosine_ops');
      expect(sql).toContain('m = 24');
      expect(sql).toContain('ef_construction = 200');
    });

    it('should generate non-concurrent index when specified', () => {
      const sql = buildHNSWIndexSQL(
        'test_table',
        'embedding',
        { m: 16, efConstruction: 128, efSearch: 100 },
        false
      );

      expect(sql).not.toContain('CONCURRENTLY');
      expect(sql).toContain('CREATE INDEX');
    });

    it('should drop existing index before creating', () => {
      const sql = buildHNSWIndexSQL('my_table', 'vec', {
        m: 32,
        efConstruction: 256,
        efSearch: 150,
      });

      expect(sql).toContain('DROP INDEX IF EXISTS');
      expect(sql).toContain('idx_my_table_vec_hnsw');
    });
  });

  describe('setEfSearchSQL', () => {
    it('should generate valid SET command', () => {
      const sql = setEfSearchSQL(100);
      expect(sql).toBe('SET hnsw.ef_search = 100;');
    });

    it('should handle various ef_search values', () => {
      expect(setEfSearchSQL(40)).toBe('SET hnsw.ef_search = 40;');
      expect(setEfSearchSQL(200)).toBe('SET hnsw.ef_search = 200;');
      expect(setEfSearchSQL(500)).toBe('SET hnsw.ef_search = 500;');
    });
  });
});

describe('EF_SEARCH_BY_PROFILE', () => {
  it('should have fast profile optimized for low latency', () => {
    expect(EF_SEARCH_BY_PROFILE.fast).toBe(40);
  });

  it('should have balanced profile as default', () => {
    expect(EF_SEARCH_BY_PROFILE.balanced).toBe(100);
  });

  it('should have accurate profile for scoring', () => {
    expect(EF_SEARCH_BY_PROFILE.accurate).toBe(200);
  });

  it('should have exact profile for near-exact results', () => {
    expect(EF_SEARCH_BY_PROFILE.exact).toBe(400);
  });
});

import { vi, beforeEach, afterEach } from 'vitest';
import { HNSWOptimizer, type HNSWParams, type SearchProfile } from '../hnsw-optimizer';

describe('HNSWOptimizer Class', () => {
  let mockPool: {
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let optimizer: HNSWOptimizer;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    };
    optimizer = new HNSWOptimizer(mockPool as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('setEfSearch', () => {
    it('should set ef_search parameter on client', async () => {
      await optimizer.setEfSearch(mockClient as any, 150);

      expect(mockClient.query).toHaveBeenCalledWith('SET hnsw.ef_search = 150');
    });

    it('should handle various ef_search values', async () => {
      await optimizer.setEfSearch(mockClient as any, 40);
      expect(mockClient.query).toHaveBeenCalledWith('SET hnsw.ef_search = 40');

      await optimizer.setEfSearch(mockClient as any, 500);
      expect(mockClient.query).toHaveBeenCalledWith('SET hnsw.ef_search = 500');
    });
  });

  describe('getAdaptiveEfSearch', () => {
    it('should return base ef_search for fast profile', () => {
      const result = optimizer.getAdaptiveEfSearch('fast', 5);
      expect(result).toBe(40); // base fast value
    });

    it('should return base ef_search for balanced profile', () => {
      const result = optimizer.getAdaptiveEfSearch('balanced', 10);
      expect(result).toBe(100); // base balanced value
    });

    it('should return base ef_search for accurate profile', () => {
      const result = optimizer.getAdaptiveEfSearch('accurate', 10);
      expect(result).toBe(200); // base accurate value
    });

    it('should return base ef_search for exact profile', () => {
      const result = optimizer.getAdaptiveEfSearch('exact', 10);
      expect(result).toBe(400); // base exact value
    });

    it('should ensure minimum 2x topK', () => {
      // When topK * 2 > base profile ef_search
      const result = optimizer.getAdaptiveEfSearch('fast', 30);
      expect(result).toBe(60); // 30 * 2 = 60 > 40
    });

    it('should ensure minimum of 40', () => {
      const result = optimizer.getAdaptiveEfSearch('fast', 10);
      expect(result).toBe(40); // minEfSearch is max(20, 40) = 40
    });
  });

  describe('recommendParams', () => {
    it('should recommend small params for < 10K vectors', () => {
      const params = optimizer.recommendParams(5000);

      expect(params.m).toBe(16);
      expect(params.efConstruction).toBe(128);
      expect(params.efSearch).toBe(64);
    });

    it('should recommend medium params for 10K-100K vectors', () => {
      const params = optimizer.recommendParams(50000);

      expect(params.m).toBe(24);
      expect(params.efConstruction).toBe(200);
      expect(params.efSearch).toBe(100);
    });

    it('should recommend large params for 100K-1M vectors', () => {
      const params = optimizer.recommendParams(500000);

      expect(params.m).toBe(32);
      expect(params.efConstruction).toBe(256);
      expect(params.efSearch).toBe(128);
    });

    it('should recommend xlarge params for > 1M vectors', () => {
      const params = optimizer.recommendParams(2000000);

      expect(params.m).toBe(48);
      expect(params.efConstruction).toBe(400);
      expect(params.efSearch).toBe(200);
    });

    it('should increase params for high recall target (>= 0.99)', () => {
      const params = optimizer.recommendParams(50000, 0.99);

      expect(params.m).toBeGreaterThan(24);
      expect(params.efConstruction).toBeGreaterThan(200);
      expect(params.efSearch).toBeGreaterThan(100);
    });

    it('should increase params for good recall target (>= 0.97)', () => {
      const params = optimizer.recommendParams(50000, 0.97);

      expect(params.m).toBe(32); // 24 + 8
      expect(params.efConstruction).toBe(264); // 200 + 64
      expect(params.efSearch).toBe(150); // 100 + 50
    });

    it('should reduce ef_search for very low latency requirement (< 20ms)', () => {
      const params = optimizer.recommendParams(50000, 0.95, 15);

      expect(params.efSearch).toBe(50); // max(100 - 50, 40)
    });

    it('should reduce ef_search for low latency requirement (< 50ms)', () => {
      const params = optimizer.recommendParams(50000, 0.95, 30);

      expect(params.efSearch).toBe(80); // max(100 - 20, 50)
    });

    it('should not adjust for default latency', () => {
      const params = optimizer.recommendParams(50000, 0.95, 100);

      expect(params.efSearch).toBe(100);
    });

    it('should cap m at 64', () => {
      const params = optimizer.recommendParams(2000000, 0.99);

      expect(params.m).toBeLessThanOrEqual(64);
    });

    it('should cap efConstruction at 512', () => {
      const params = optimizer.recommendParams(2000000, 0.99);

      expect(params.efConstruction).toBeLessThanOrEqual(512);
    });

    it('should cap efSearch at 500', () => {
      const params = optimizer.recommendParams(2000000, 0.99);

      expect(params.efSearch).toBeLessThanOrEqual(500);
    });
  });

  describe('benchmarkSearch', () => {
    const mockQueryVectors = [
      new Array(1536).fill(0.1),
      new Array(1536).fill(0.2),
      new Array(1536).fill(0.3),
    ];

    beforeEach(() => {
      // Mock getIndexInfo
      mockPool.query.mockResolvedValue({
        rows: [
          {
            indexdef: 'CREATE INDEX ... USING hnsw ... WITH (m = 24, ef_construction = 200)',
            pg_size_pretty: '100 MB',
          },
        ],
      });

      // Mock search queries
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 'r1', distance: 0.1 },
          { id: 'r2', distance: 0.2 },
        ],
      });
    });

    it('should benchmark multiple ef_search values', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        mockQueryVectors,
        10,
        [40, 100]
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.params.efSearch).toBe(40);
      expect(results[1]?.params.efSearch).toBe(100);
    });

    it('should set ef_search before each benchmark', async () => {
      await optimizer.benchmarkSearch('test_table', 'embedding', mockQueryVectors, 10, [40, 100]);

      expect(mockClient.query).toHaveBeenCalledWith('SET hnsw.ef_search = 40');
      expect(mockClient.query).toHaveBeenCalledWith('SET hnsw.ef_search = 100');
    });

    it('should calculate latency statistics', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        mockQueryVectors,
        10,
        [100]
      );

      expect(results[0]).toHaveProperty('avgLatencyMs');
      expect(results[0]).toHaveProperty('p50LatencyMs');
      expect(results[0]).toHaveProperty('p95LatencyMs');
      expect(results[0]).toHaveProperty('p99LatencyMs');
      expect(results[0]).toHaveProperty('qps');
    });

    it('should estimate recall based on ef_search', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        mockQueryVectors,
        10,
        [40, 100, 200, 400]
      );

      // Higher ef_search should give higher recall
      expect(results[0]?.recall).toBeLessThanOrEqual(results[1]?.recall ?? 0);
      expect(results[1]?.recall).toBeLessThanOrEqual(results[2]?.recall ?? 0);
      expect(results[2]?.recall).toBeLessThanOrEqual(results[3]?.recall ?? 0);
    });

    it('should include index params from current configuration', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        mockQueryVectors,
        10,
        [100]
      );

      expect(results[0]?.params.m).toBe(24);
      expect(results[0]?.params.efConstruction).toBe(200);
    });

    it('should release client after benchmarking', async () => {
      await optimizer.benchmarkSearch('test_table', 'embedding', mockQueryVectors, 10, [100]);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle default ef_search values', async () => {
      const results = await optimizer.benchmarkSearch('test_table', 'embedding', mockQueryVectors);

      // Default: [40, 64, 100, 150, 200, 300]
      expect(results.length).toBe(6);
    });

    it('should use default index params when index not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        mockQueryVectors,
        10,
        [100]
      );

      expect(results[0]?.params.m).toBe(16); // default
      // When index is not found, efConstruction defaults based on getIndexInfo implementation
      expect(results[0]?.params.efConstruction).toBeGreaterThanOrEqual(64);
    });
  });

  describe('getIndexInfo', () => {
    it('should return index info when found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            indexdef: 'CREATE INDEX idx USING hnsw ... WITH (m = 32, ef_construction = 256)',
            pg_size_pretty: '150 MB',
          },
        ],
      });

      const info = await optimizer.getIndexInfo('test_table', 'embedding');

      expect(info).toEqual({
        m: 32,
        efConstruction: 256,
        indexSize: '150 MB',
      });
    });

    it('should return null when no index found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const info = await optimizer.getIndexInfo('test_table', 'embedding');

      expect(info).toBeNull();
    });

    it('should use default values when params not in indexdef', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            indexdef: 'CREATE INDEX idx USING hnsw',
            pg_size_pretty: '50 MB',
          },
        ],
      });

      const info = await optimizer.getIndexInfo('test_table', 'embedding');

      expect(info).toEqual({
        m: 16,
        efConstruction: 64,
        indexSize: '50 MB',
      });
    });
  });

  describe('getVectorStats', () => {
    it('should return vector statistics', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_vectors: '1000',
              null_embeddings: '50',
              oldest_vector: new Date('2024-01-01'),
              newest_vector: new Date('2025-01-01'),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ dim: 1536 }],
        });

      const stats = await optimizer.getVectorStats('test_table', 'embedding');

      expect(stats.totalVectors).toBe(1000);
      expect(stats.nullEmbeddings).toBe(50);
      expect(stats.vectorDimensions).toBe(1536);
      expect(stats.oldestVector).toEqual(new Date('2024-01-01'));
      expect(stats.newestVector).toEqual(new Date('2025-01-01'));
    });

    it('should handle missing stats', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const stats = await optimizer.getVectorStats('test_table', 'embedding');

      expect(stats.totalVectors).toBe(0);
      expect(stats.nullEmbeddings).toBe(0);
      expect(stats.vectorDimensions).toBeNull();
      expect(stats.oldestVector).toBeNull();
      expect(stats.newestVector).toBeNull();
    });
  });

  describe('generateOptimizationReport', () => {
    beforeEach(() => {
      // Mock getIndexInfo
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              indexdef: 'CREATE INDEX ... WITH (m = 16, ef_construction = 128)',
              pg_size_pretty: '50 MB',
            },
          ],
        })
        // Mock getVectorStats - first query
        .mockResolvedValueOnce({
          rows: [
            {
              total_vectors: '100000',
              null_embeddings: '10',
              oldest_vector: new Date('2024-01-01'),
              newest_vector: new Date('2025-01-01'),
            },
          ],
        })
        // Mock getVectorStats - dimensions query
        .mockResolvedValueOnce({
          rows: [{ dim: 1536 }],
        });
    });

    it('should generate optimization report', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      expect(report.currentConfig).toBeDefined();
      expect(report.vectorStats).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.issues).toBeInstanceOf(Array);
      expect(report.suggestions).toBeInstanceOf(Array);
    });

    it('should identify issues with low M parameter', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      // Current m=16, recommended for 100K vectors is m=32
      const hasLowMIssue = report.issues.some((issue) => issue.includes('M parameter'));
      expect(hasLowMIssue).toBe(true);
    });

    it('should identify issues with low ef_construction', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      // Current ef_construction=128, recommended for 100K vectors is 256
      const hasLowEfIssue = report.issues.some((issue) => issue.includes('ef_construction'));
      expect(hasLowEfIssue).toBe(true);
    });

    it('should report null embeddings issue', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      const hasNullIssue = report.issues.some((issue) => issue.includes('NULL embeddings'));
      expect(hasNullIssue).toBe(true);
    });

    it('should include performance suggestions', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      expect(report.suggestions.length).toBeGreaterThan(0);
      const hasLatencySuggestion = report.suggestions.some((s) => s.includes('real-time'));
      const hasAccuracySuggestion = report.suggestions.some((s) => s.includes('accuracy'));
      expect(hasLatencySuggestion || hasAccuracySuggestion).toBe(true);
    });

    it('should suggest partitioning for large datasets', async () => {
      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      const hasPartitionSuggestion = report.suggestions.some((s) => s.includes('partitioning'));
      expect(hasPartitionSuggestion).toBe(true);
    });

    it('should suggest VACUUM for very large datasets', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({
          rows: [
            {
              indexdef: 'CREATE INDEX ... WITH (m = 32, ef_construction = 256)',
              pg_size_pretty: '500 MB',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_vectors: '200000',
              null_embeddings: '0',
              oldest_vector: new Date('2024-01-01'),
              newest_vector: new Date('2025-01-01'),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ dim: 1536 }],
        });

      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      const hasVacuumSuggestion = report.suggestions.some((s) => s.includes('VACUUM'));
      expect(hasVacuumSuggestion).toBe(true);
    });

    it('should handle missing index configuration', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [] }) // No index
        .mockResolvedValueOnce({
          rows: [
            {
              total_vectors: '1000',
              null_embeddings: '0',
              oldest_vector: null,
              newest_vector: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const report = await optimizer.generateOptimizationReport('test_table', 'embedding');

      expect(report.currentConfig).toBeNull();
      expect(report.issues).toHaveLength(0); // No issues when no config
    });
  });

  describe('estimateRecall (private method via benchmarkSearch)', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValue({ rows: [] });
      mockClient.query.mockResolvedValue({ rows: [] });
    });

    it('should estimate high recall for high ef_search/topK ratio', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        [new Array(1536).fill(0.1)],
        10,
        [400] // ef_search / topK = 40
      );

      expect(results[0]?.recall).toBe(0.995);
    });

    it('should estimate lower recall for low ef_search/topK ratio', async () => {
      const results = await optimizer.benchmarkSearch(
        'test_table',
        'embedding',
        [new Array(1536).fill(0.1)],
        50,
        [100] // ef_search / topK = 2
      );

      expect(results[0]?.recall).toBe(0.85);
    });
  });
});
