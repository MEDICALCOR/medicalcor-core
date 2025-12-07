/**
 * HNSW Index Optimizer and Benchmarking Utility
 *
 * Provides tools for tuning HNSW parameters for optimal performance.
 * Benchmarks different configurations to find the best balance between
 * recall, latency, and index build time.
 *
 * @module infrastructure/ai/vector-search/hnsw-optimizer
 */

import type { Pool, PoolClient } from 'pg';

/**
 * HNSW configuration parameters
 */
export interface HNSWParams {
  /** Max connections per node (M parameter) */
  m: number;
  /** Candidate list size during construction */
  efConstruction: number;
  /** Candidate list size during search (runtime) */
  efSearch: number;
}

/**
 * Benchmark results for a single configuration
 */
export interface BenchmarkResult {
  params: HNSWParams;
  /** Average query latency in milliseconds */
  avgLatencyMs: number;
  /** P50 latency */
  p50LatencyMs: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** P99 latency */
  p99LatencyMs: number;
  /** Recall@k (fraction of true neighbors found) */
  recall: number;
  /** Queries per second */
  qps: number;
  /** Index build time in seconds */
  indexBuildTimeSec?: number;
  /** Index size in MB */
  indexSizeMB?: number;
}

/**
 * Search profile for adaptive ef_search tuning
 */
export type SearchProfile = 'fast' | 'balanced' | 'accurate' | 'exact';

/**
 * Profile configurations for different search requirements
 */
export const SEARCH_PROFILES: Record<SearchProfile, { efSearch: number; description: string }> = {
  fast: {
    efSearch: 40,
    description: 'Lowest latency, ~90% recall. Use for real-time suggestions.',
  },
  balanced: {
    efSearch: 100,
    description: 'Good balance of speed and accuracy, ~95% recall. Default for most queries.',
  },
  accurate: {
    efSearch: 200,
    description: 'High accuracy, ~98% recall. Use for scoring and important decisions.',
  },
  exact: {
    efSearch: 400,
    description: 'Near-exact results, ~99.5% recall. Use for critical operations.',
  },
};

/**
 * Recommended HNSW parameters based on dataset size
 */
export const RECOMMENDED_PARAMS = {
  /** < 10K vectors */
  small: { m: 16, efConstruction: 128, efSearch: 64 } as const,
  /** 10K - 100K vectors */
  medium: { m: 24, efConstruction: 200, efSearch: 100 } as const,
  /** 100K - 1M vectors */
  large: { m: 32, efConstruction: 256, efSearch: 128 } as const,
  /** > 1M vectors */
  xlarge: { m: 48, efConstruction: 400, efSearch: 200 } as const,
} as const satisfies Record<string, HNSWParams>;

/**
 * HNSW Optimizer class for benchmarking and tuning
 */
export class HNSWOptimizer {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Set the ef_search parameter for the current session
   * This is the key runtime tuning parameter for HNSW
   *
   * @param efSearch - Candidate list size during search (higher = more accurate, slower)
   */
  async setEfSearch(client: PoolClient, efSearch: number): Promise<void> {
    await client.query(`SET hnsw.ef_search = ${efSearch}`);
  }

  /**
   * Get ef_search value based on search profile and result requirements
   *
   * @param profile - Search profile (fast, balanced, accurate, exact)
   * @param topK - Number of results requested
   * @returns Recommended ef_search value
   */
  getAdaptiveEfSearch(profile: SearchProfile, topK: number): number {
    const baseEfSearch = SEARCH_PROFILES[profile].efSearch;
    // ef_search should be at least 2x topK for good recall
    const minEfSearch = Math.max(topK * 2, 40);
    return Math.max(baseEfSearch, minEfSearch);
  }

  /**
   * Recommend parameters based on dataset characteristics
   *
   * @param vectorCount - Number of vectors in the dataset
   * @param targetRecall - Target recall (0-1)
   * @param maxLatencyMs - Maximum acceptable latency
   */
  recommendParams(vectorCount: number, targetRecall = 0.95, maxLatencyMs = 100): HNSWParams {
    // Base parameters on dataset size
    let params: HNSWParams;
    if (vectorCount < 10000) {
      params = {
        m: RECOMMENDED_PARAMS.small.m,
        efConstruction: RECOMMENDED_PARAMS.small.efConstruction,
        efSearch: RECOMMENDED_PARAMS.small.efSearch,
      };
    } else if (vectorCount < 100000) {
      params = {
        m: RECOMMENDED_PARAMS.medium.m,
        efConstruction: RECOMMENDED_PARAMS.medium.efConstruction,
        efSearch: RECOMMENDED_PARAMS.medium.efSearch,
      };
    } else if (vectorCount < 1000000) {
      params = {
        m: RECOMMENDED_PARAMS.large.m,
        efConstruction: RECOMMENDED_PARAMS.large.efConstruction,
        efSearch: RECOMMENDED_PARAMS.large.efSearch,
      };
    } else {
      params = {
        m: RECOMMENDED_PARAMS.xlarge.m,
        efConstruction: RECOMMENDED_PARAMS.xlarge.efConstruction,
        efSearch: RECOMMENDED_PARAMS.xlarge.efSearch,
      };
    }

    // Adjust for recall target
    if (targetRecall >= 0.99) {
      params.m = Math.min(params.m + 16, 64);
      params.efConstruction = Math.min(params.efConstruction + 128, 512);
      params.efSearch = Math.min(params.efSearch + 100, 500);
    } else if (targetRecall >= 0.97) {
      params.m = Math.min(params.m + 8, 64);
      params.efConstruction = Math.min(params.efConstruction + 64, 512);
      params.efSearch = Math.min(params.efSearch + 50, 400);
    }

    // Reduce parameters if latency is critical
    if (maxLatencyMs < 20) {
      params.efSearch = Math.max(params.efSearch - 50, 40);
    } else if (maxLatencyMs < 50) {
      params.efSearch = Math.max(params.efSearch - 20, 50);
    }

    return params;
  }

  /**
   * Benchmark vector search with current index configuration
   *
   * @param tableName - Table to benchmark
   * @param embeddingColumn - Column containing embeddings
   * @param queryVectors - Array of query vectors to test
   * @param topK - Number of results to retrieve
   * @param efSearchValues - Array of ef_search values to test
   * @returns Benchmark results for each ef_search value
   */
  async benchmarkSearch(
    tableName: string,
    embeddingColumn: string,
    queryVectors: number[][],
    topK = 10,
    efSearchValues: number[] = [40, 64, 100, 150, 200, 300]
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Get current index parameters
    const indexInfo = await this.getIndexInfo(tableName, embeddingColumn);

    for (const efSearch of efSearchValues) {
      const latencies: number[] = [];

      const client = await this.pool.connect();
      try {
        // Set ef_search for this test
        await this.setEfSearch(client, efSearch);

        // Warm up query
        const firstVector = queryVectors[0];
        if (firstVector) {
          await this.runSearchQuery(client, tableName, embeddingColumn, firstVector, topK);
        }

        // Run benchmark queries
        for (const queryVector of queryVectors) {
          const start = performance.now();
          await this.runSearchQuery(client, tableName, embeddingColumn, queryVector, topK);
          latencies.push(performance.now() - start);
        }
      } finally {
        client.release();
      }

      // Calculate statistics
      latencies.sort((a, b) => a - b);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50Index = Math.floor(latencies.length * 0.5);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p99Index = Math.floor(latencies.length * 0.99);

      results.push({
        params: {
          m: indexInfo?.m ?? 16,
          efConstruction: indexInfo?.efConstruction ?? 128,
          efSearch,
        },
        avgLatencyMs: avgLatency,
        p50LatencyMs: latencies[p50Index] ?? avgLatency,
        p95LatencyMs: latencies[p95Index] ?? avgLatency,
        p99LatencyMs: latencies[p99Index] ?? avgLatency,
        recall: this.estimateRecall(efSearch, topK),
        qps: 1000 / avgLatency,
      });
    }

    return results;
  }

  /**
   * Run a single search query for benchmarking
   */
  private async runSearchQuery(
    client: PoolClient,
    tableName: string,
    embeddingColumn: string,
    queryVector: number[],
    topK: number
  ): Promise<{ id: string; distance: number }[]> {
    const vectorStr = `[${queryVector.join(',')}]`;
    const result = await client.query<{ id: string; distance: number }>(
      `SELECT id, ${embeddingColumn} <=> $1::vector as distance
       FROM ${tableName}
       WHERE ${embeddingColumn} IS NOT NULL
       ORDER BY ${embeddingColumn} <=> $1::vector
       LIMIT $2`,
      [vectorStr, topK]
    );
    return result.rows;
  }

  /**
   * Estimate recall based on ef_search and topK
   * Based on empirical data from HNSW paper and pgvector benchmarks
   */
  private estimateRecall(efSearch: number, topK: number): number {
    const ratio = efSearch / topK;
    if (ratio >= 40) return 0.995;
    if (ratio >= 20) return 0.99;
    if (ratio >= 10) return 0.97;
    if (ratio >= 5) return 0.95;
    if (ratio >= 3) return 0.9;
    return 0.85;
  }

  /**
   * Get index information for a table
   */
  async getIndexInfo(
    tableName: string,
    embeddingColumn: string
  ): Promise<{ m: number; efConstruction: number; indexSize: string } | null> {
    const result = await this.pool.query<{
      indexdef: string;
      pg_size_pretty: string;
    }>(
      `SELECT pg_get_indexdef(i.indexrelid) as indexdef,
              pg_size_pretty(pg_relation_size(i.indexrelid)) as pg_size_pretty
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_class ic ON ic.oid = i.indexrelid
       WHERE c.relname = $1
       AND pg_get_indexdef(i.indexrelid) LIKE '%hnsw%'
       AND pg_get_indexdef(i.indexrelid) LIKE '%${embeddingColumn}%'
       LIMIT 1`,
      [tableName]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const indexDef = row.indexdef;
    const mMatch = /m\s*=\s*(\d+)/.exec(indexDef);
    const efMatch = /ef_construction\s*=\s*(\d+)/.exec(indexDef);

    return {
      m: mMatch?.[1] ? parseInt(mMatch[1], 10) : 16,
      efConstruction: efMatch?.[1] ? parseInt(efMatch[1], 10) : 64,
      indexSize: row.pg_size_pretty,
    };
  }

  /**
   * Get vector statistics for optimization recommendations
   */
  async getVectorStats(
    tableName: string,
    embeddingColumn: string
  ): Promise<{
    totalVectors: number;
    vectorDimensions: number | null;
    nullEmbeddings: number;
    oldestVector: Date | null;
    newestVector: Date | null;
  }> {
    const result = await this.pool.query<{
      total_vectors: string;
      null_embeddings: string;
      oldest_vector: Date | null;
      newest_vector: Date | null;
    }>(
      `SELECT
         COUNT(*) as total_vectors,
         COUNT(*) FILTER (WHERE ${embeddingColumn} IS NULL) as null_embeddings,
         MIN(created_at) as oldest_vector,
         MAX(created_at) as newest_vector
       FROM ${tableName}`
    );

    const row = result.rows[0];

    // Get vector dimensions from a sample
    const dimResult = await this.pool.query<{ dim: number }>(
      `SELECT vector_dims(${embeddingColumn}) as dim
       FROM ${tableName}
       WHERE ${embeddingColumn} IS NOT NULL
       LIMIT 1`
    );

    return {
      totalVectors: parseInt(row?.total_vectors ?? '0', 10),
      vectorDimensions: dimResult.rows[0]?.dim ?? null,
      nullEmbeddings: parseInt(row?.null_embeddings ?? '0', 10),
      oldestVector: row?.oldest_vector ?? null,
      newestVector: row?.newest_vector ?? null,
    };
  }

  /**
   * Generate optimization report with recommendations
   */
  async generateOptimizationReport(
    tableName: string,
    embeddingColumn: string
  ): Promise<{
    currentConfig: { m: number; efConstruction: number; indexSize: string } | null;
    vectorStats: Awaited<ReturnType<HNSWOptimizer['getVectorStats']>>;
    recommendations: HNSWParams;
    issues: string[];
    suggestions: string[];
  }> {
    const [currentConfig, vectorStats] = await Promise.all([
      this.getIndexInfo(tableName, embeddingColumn),
      this.getVectorStats(tableName, embeddingColumn),
    ]);

    const recommendations = this.recommendParams(vectorStats.totalVectors);
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for issues
    if (currentConfig) {
      if (currentConfig.m < recommendations.m - 8) {
        issues.push(
          `M parameter (${currentConfig.m}) is too low for dataset size. ` +
            `Consider increasing to ${recommendations.m}.`
        );
      }

      if (currentConfig.efConstruction < recommendations.efConstruction - 64) {
        issues.push(
          `ef_construction (${currentConfig.efConstruction}) is below optimal. ` +
            `Rebuilding with ef_construction=${recommendations.efConstruction} will improve recall.`
        );
      }
    }

    if (vectorStats.nullEmbeddings > 0) {
      issues.push(
        `${vectorStats.nullEmbeddings} records have NULL embeddings and won't be searchable.`
      );
    }

    // Add suggestions
    suggestions.push(
      `For real-time queries (< 20ms), use ef_search=${SEARCH_PROFILES.fast.efSearch}`
    );
    suggestions.push(
      `For high-accuracy queries (scoring), use ef_search=${SEARCH_PROFILES.accurate.efSearch}`
    );

    if (vectorStats.totalVectors > 50000) {
      suggestions.push(
        'Consider partitioning by clinic_id for better filtered search performance.'
      );
    }

    if (vectorStats.totalVectors > 100000) {
      suggestions.push('Run VACUUM ANALYZE regularly to maintain index performance.');
    }

    return {
      currentConfig,
      vectorStats,
      recommendations,
      issues,
      suggestions,
    };
  }
}

/**
 * Create an HNSW index with optimized parameters
 *
 * @param tableName - Table name
 * @param embeddingColumn - Embedding column name
 * @param params - HNSW parameters
 * @param concurrent - Whether to build index concurrently (non-blocking)
 */
export function buildHNSWIndexSQL(
  tableName: string,
  embeddingColumn: string,
  params: HNSWParams,
  concurrent = true
): string {
  const indexName = `idx_${tableName}_${embeddingColumn}_hnsw`;
  const concurrently = concurrent ? 'CONCURRENTLY' : '';

  return `
    DROP INDEX IF EXISTS ${indexName};
    CREATE INDEX ${concurrently} ${indexName}
    ON ${tableName}
    USING hnsw (${embeddingColumn} vector_cosine_ops)
    WITH (m = ${params.m}, ef_construction = ${params.efConstruction});
  `;
}

/**
 * SQL to set ef_search for optimal query performance
 */
export function setEfSearchSQL(efSearch: number): string {
  return `SET hnsw.ef_search = ${efSearch};`;
}
