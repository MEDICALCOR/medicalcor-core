/**
 * Vector Index Health Monitor
 *
 * Monitors the health and performance of HNSW and IVFFlat indexes.
 * Provides recommendations for maintenance and optimization.
 *
 * @module infrastructure/ai/vector-search/index-health-monitor
 */

import type { Pool } from 'pg';
import { pino } from 'pino';

const logger = pino({ name: 'vector-index-health' });

/**
 * Index health status
 */
export type IndexHealthStatus = 'healthy' | 'degraded' | 'critical' | 'unused';

/**
 * Individual index health report
 */
export interface IndexHealthReport {
  indexName: string;
  tableName: string;
  indexType: 'hnsw' | 'ivfflat' | 'unknown';
  indexSize: string;
  indexSizeBytes: number;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
  efficiency: number;
  status: IndexHealthStatus;
  lastAnalyze: Date | null;
  lastVacuum: Date | null;
  hnswParams?: {
    m: number;
    efConstruction: number;
  };
  recommendations: string[];
}

/**
 * Overall vector search health summary
 */
export interface VectorSearchHealthSummary {
  totalIndexes: number;
  healthyIndexes: number;
  degradedIndexes: number;
  criticalIndexes: number;
  unusedIndexes: number;
  totalIndexSize: string;
  totalIndexSizeBytes: number;
  overallStatus: IndexHealthStatus;
  indexes: IndexHealthReport[];
  globalRecommendations: string[];
}

/**
 * Index performance metrics over time
 */
export interface IndexPerformanceMetrics {
  tableName: string;
  indexName: string;
  avgQueryLatencyMs: number;
  p95QueryLatencyMs: number;
  queriesPerSecond: number;
  avgResultCount: number;
  avgRecall: number;
  sampleSize: number;
}

/**
 * Vector Index Health Monitor class
 */
export class IndexHealthMonitor {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get comprehensive health report for all vector indexes
   */
  async getHealthReport(): Promise<VectorSearchHealthSummary> {
    const indexes = await this.getIndexDetails();

    let totalSizeBytes = 0;
    let healthyCount = 0;
    let degradedCount = 0;
    let criticalCount = 0;
    let unusedCount = 0;

    for (const index of indexes) {
      totalSizeBytes += index.indexSizeBytes;

      switch (index.status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'degraded':
          degradedCount++;
          break;
        case 'critical':
          criticalCount++;
          break;
        case 'unused':
          unusedCount++;
          break;
        default:
          // Exhaustive check - all cases handled
          break;
      }
    }

    const globalRecommendations: string[] = [];

    // Check for global issues
    if (criticalCount > 0) {
      globalRecommendations.push(
        `${criticalCount} index(es) are in critical state. Run REINDEX or VACUUM FULL.`
      );
    }

    if (unusedCount > 0) {
      globalRecommendations.push(
        `${unusedCount} index(es) are unused. Consider dropping to save storage.`
      );
    }

    // Check maintenance status
    const staleness = await this.checkMaintenanceStaleness();
    if (staleness.needsVacuum.length > 0) {
      globalRecommendations.push(`Tables need VACUUM: ${staleness.needsVacuum.join(', ')}`);
    }

    if (staleness.needsAnalyze.length > 0) {
      globalRecommendations.push(`Tables need ANALYZE: ${staleness.needsAnalyze.join(', ')}`);
    }

    // Determine overall status
    let overallStatus: IndexHealthStatus = 'healthy';
    if (criticalCount > 0) {
      overallStatus = 'critical';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else if (indexes.length === unusedCount) {
      overallStatus = 'unused';
    }

    return {
      totalIndexes: indexes.length,
      healthyIndexes: healthyCount,
      degradedIndexes: degradedCount,
      criticalIndexes: criticalCount,
      unusedIndexes: unusedCount,
      totalIndexSize: this.formatBytes(totalSizeBytes),
      totalIndexSizeBytes: totalSizeBytes,
      overallStatus,
      indexes,
      globalRecommendations,
    };
  }

  /**
   * Get detailed information about each vector index
   */
  private async getIndexDetails(): Promise<IndexHealthReport[]> {
    const result = await this.pool.query<{
      schemaname: string;
      tablename: string;
      indexname: string;
      indexdef: string;
      index_size: string;
      index_size_bytes: string;
      idx_scan: string;
      idx_tup_read: string;
      idx_tup_fetch: string;
      last_analyze: Date | null;
      last_vacuum: Date | null;
    }>(`
      SELECT
        sui.schemaname,
        sui.tablename,
        sui.indexname,
        pg_get_indexdef(sui.indexrelid) as indexdef,
        pg_size_pretty(pg_relation_size(sui.indexrelid)) as index_size,
        pg_relation_size(sui.indexrelid)::text as index_size_bytes,
        sui.idx_scan::text,
        sui.idx_tup_read::text,
        sui.idx_tup_fetch::text,
        pg_stat_get_last_analyze_time(c.oid) as last_analyze,
        pg_stat_get_last_vacuum_time(c.oid) as last_vacuum
      FROM pg_stat_user_indexes sui
      JOIN pg_class c ON c.oid = sui.relid
      WHERE pg_get_indexdef(sui.indexrelid) LIKE '%hnsw%'
         OR pg_get_indexdef(sui.indexrelid) LIKE '%ivfflat%'
      ORDER BY pg_relation_size(sui.indexrelid) DESC
    `);

    return result.rows.map((row) => {
      const indexType = this.detectIndexType(row.indexdef);
      const hnswParams = this.extractHNSWParams(row.indexdef);
      const scans = parseInt(row.idx_scan, 10);
      const tuplesRead = parseInt(row.idx_tup_read, 10);
      const tuplesFetched = parseInt(row.idx_tup_fetch, 10);
      const efficiency = tuplesRead > 0 ? tuplesFetched / tuplesRead : 0;
      const status = this.determineStatus(scans, efficiency, row.last_analyze);
      const recommendations = this.generateRecommendations(
        status,
        hnswParams,
        row.last_analyze,
        row.last_vacuum,
        efficiency
      );

      return {
        indexName: row.indexname,
        tableName: row.tablename,
        indexType,
        indexSize: row.index_size,
        indexSizeBytes: parseInt(row.index_size_bytes, 10),
        indexScans: scans,
        tuplesRead,
        tuplesFetched,
        efficiency,
        status,
        lastAnalyze: row.last_analyze,
        lastVacuum: row.last_vacuum,
        hnswParams,
        recommendations,
      };
    });
  }

  /**
   * Detect index type from definition
   */
  private detectIndexType(indexdef: string): 'hnsw' | 'ivfflat' | 'unknown' {
    if (indexdef.toLowerCase().includes('hnsw')) {
      return 'hnsw';
    }
    if (indexdef.toLowerCase().includes('ivfflat')) {
      return 'ivfflat';
    }
    return 'unknown';
  }

  /**
   * Extract HNSW parameters from index definition
   */
  private extractHNSWParams(indexdef: string): { m: number; efConstruction: number } | undefined {
    const mMatch = /m\s*=\s*(\d+)/i.exec(indexdef);
    const efMatch = /ef_construction\s*=\s*(\d+)/i.exec(indexdef);

    if (mMatch || efMatch) {
      return {
        m: mMatch?.[1] ? parseInt(mMatch[1], 10) : 16,
        efConstruction: efMatch?.[1] ? parseInt(efMatch[1], 10) : 64,
      };
    }

    return undefined;
  }

  /**
   * Determine index health status
   */
  private determineStatus(
    scans: number,
    efficiency: number,
    lastAnalyze: Date | null
  ): IndexHealthStatus {
    // Unused index
    if (scans === 0) {
      return 'unused';
    }

    // Check efficiency
    if (efficiency < 0.3) {
      return 'critical';
    }

    if (efficiency < 0.5) {
      return 'degraded';
    }

    // Check staleness
    if (lastAnalyze) {
      const daysSinceAnalyze = (Date.now() - lastAnalyze.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnalyze > 7) {
        return 'degraded';
      }
    } else {
      return 'degraded'; // Never analyzed
    }

    return 'healthy';
  }

  /**
   * Generate recommendations for an index
   */
  private generateRecommendations(
    status: IndexHealthStatus,
    hnswParams: { m: number; efConstruction: number } | undefined,
    lastAnalyze: Date | null,
    lastVacuum: Date | null,
    efficiency: number
  ): string[] {
    const recommendations: string[] = [];

    // Status-based recommendations
    if (status === 'critical') {
      recommendations.push('Consider rebuilding this index with REINDEX CONCURRENTLY');
    }

    if (status === 'unused') {
      recommendations.push('This index is unused. Consider dropping it to save storage.');
    }

    // HNSW parameter recommendations
    if (hnswParams) {
      if (hnswParams.m < 16) {
        recommendations.push(
          `M parameter (${hnswParams.m}) is low. Consider increasing to 24 for better recall.`
        );
      }
      if (hnswParams.efConstruction < 128) {
        recommendations.push(
          `ef_construction (${hnswParams.efConstruction}) is low. Rebuild with 200 for better quality.`
        );
      }
    }

    // Maintenance recommendations
    if (!lastAnalyze) {
      recommendations.push('Run ANALYZE on this table to update statistics.');
    } else {
      const daysSinceAnalyze = (Date.now() - lastAnalyze.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnalyze > 3) {
        recommendations.push(
          `Last ANALYZE was ${Math.round(daysSinceAnalyze)} days ago. Consider running ANALYZE.`
        );
      }
    }

    if (!lastVacuum) {
      recommendations.push('Run VACUUM to reclaim dead tuples.');
    } else {
      const daysSinceVacuum = (Date.now() - lastVacuum.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceVacuum > 7) {
        recommendations.push(
          `Last VACUUM was ${Math.round(daysSinceVacuum)} days ago. Consider running VACUUM.`
        );
      }
    }

    // Efficiency recommendations
    if (efficiency < 0.7 && efficiency > 0) {
      recommendations.push(
        `Index efficiency is ${(efficiency * 100).toFixed(1)}%. Consider tuning ef_search.`
      );
    }

    return recommendations;
  }

  /**
   * Check which tables need maintenance
   */
  private async checkMaintenanceStaleness(): Promise<{
    needsVacuum: string[];
    needsAnalyze: string[];
  }> {
    const result = await this.pool.query<{
      tablename: string;
      last_vacuum: Date | null;
      last_analyze: Date | null;
    }>(`
      SELECT
        relname as tablename,
        pg_stat_get_last_vacuum_time(c.oid) as last_vacuum,
        pg_stat_get_last_analyze_time(c.oid) as last_analyze
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN (
          SELECT DISTINCT tablename
          FROM pg_stat_user_indexes
          WHERE pg_get_indexdef(indexrelid) LIKE '%hnsw%'
             OR pg_get_indexdef(indexrelid) LIKE '%ivfflat%'
        )
    `);

    const needsVacuum: string[] = [];
    const needsAnalyze: string[] = [];
    const threshold = 3 * 24 * 60 * 60 * 1000; // 3 days

    for (const row of result.rows) {
      if (!row.last_vacuum || Date.now() - row.last_vacuum.getTime() > threshold) {
        needsVacuum.push(row.tablename);
      }
      if (!row.last_analyze || Date.now() - row.last_analyze.getTime() > threshold) {
        needsAnalyze.push(row.tablename);
      }
    }

    return { needsVacuum, needsAnalyze };
  }

  /**
   * Get query performance metrics from rag_query_log
   */
  async getQueryPerformanceMetrics(hours = 24): Promise<IndexPerformanceMetrics[]> {
    const result = await this.pool.query<{
      use_case: string;
      avg_latency: string;
      p95_latency: string;
      query_count: string;
      avg_results: string;
      avg_score: string;
    }>(`
      SELECT
        COALESCE(use_case, 'unknown') as use_case,
        AVG(total_latency_ms)::numeric(10,2) as avg_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::numeric(10,2) as p95_latency,
        COUNT(*)::text as query_count,
        AVG(result_count)::numeric(10,2) as avg_results,
        AVG(
          CASE WHEN array_length(result_scores, 1) > 0
               THEN result_scores[1]
               ELSE 0
          END
        )::numeric(10,4) as avg_score
      FROM rag_query_log
      WHERE created_at > NOW() - INTERVAL '${hours} hours'
      GROUP BY use_case
      ORDER BY COUNT(*) DESC
    `);

    return result.rows.map((row) => ({
      tableName: 'knowledge_base',
      indexName: row.use_case,
      avgQueryLatencyMs: parseFloat(row.avg_latency),
      p95QueryLatencyMs: parseFloat(row.p95_latency),
      queriesPerSecond: parseInt(row.query_count, 10) / (hours * 3600),
      avgResultCount: parseFloat(row.avg_results),
      avgRecall: parseFloat(row.avg_score), // Top result score as proxy
      sampleSize: parseInt(row.query_count, 10),
    }));
  }

  /**
   * Run maintenance on vector indexes
   */
  async runMaintenance(): Promise<{
    tablesAnalyzed: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    const tablesAnalyzed: string[] = [];

    const result = await this.pool.query<{ tablename: string }>(`
      SELECT DISTINCT tablename
      FROM pg_stat_user_indexes
      WHERE pg_get_indexdef(indexrelid) LIKE '%hnsw%'
         OR pg_get_indexdef(indexrelid) LIKE '%ivfflat%'
    `);

    for (const row of result.rows) {
      try {
        await this.pool.query(`ANALYZE ${row.tablename}`);
        tablesAnalyzed.push(row.tablename);
        logger.info({ table: row.tablename }, 'Analyzed table');
      } catch (error) {
        logger.error({ table: row.tablename, error }, 'Failed to analyze table');
      }
    }

    return {
      tablesAnalyzed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const unit = sizes[i] ?? 'TB';

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${unit}`;
  }
}

/**
 * Create an index health monitor instance
 */
export function createIndexHealthMonitor(pool: Pool): IndexHealthMonitor {
  return new IndexHealthMonitor(pool);
}
