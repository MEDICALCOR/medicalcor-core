/**
 * Index Usage Monitor
 *
 * Monitors PostgreSQL index usage to identify unused indexes that can be
 * removed to improve write performance. Provides detailed metrics and
 * recommendations for index maintenance.
 *
 * @module infrastructure/database/index-usage-monitor
 */

import type { Pool } from 'pg';
import { createLogger } from '@medicalcor/core';
import type {
  IndexHealthStatus,
  IndexType,
  IndexUsageReport,
  IndexUsageSummary,
  IndexMonitoringConfig,
  IndexRecommendation,
  IndexRecommendationBatch,
} from '@medicalcor/types';
import {
  determineIndexStatus,
  formatBytes,
  generateIndexRecommendations,
  calculatePotentialSavings,
} from '@medicalcor/types';

const logger = createLogger({ name: 'index-usage-monitor' });

/**
 * Default monitoring configuration
 */
const DEFAULT_CONFIG: IndexMonitoringConfig = {
  unusedThresholdDays: 30,
  healthyEfficiencyThreshold: 0.5,
  analyzeStalenessDays: 7,
  vacuumStalenessDays: 7,
  includeSchemas: ['public'],
  excludePatterns: [],
  includeSystemIndexes: false,
};

/**
 * Index Usage Monitor class
 *
 * Provides comprehensive monitoring of PostgreSQL index usage patterns.
 */
export class IndexUsageMonitor {
  private pool: Pool;
  private config: IndexMonitoringConfig;

  constructor(pool: Pool, config: Partial<IndexMonitoringConfig> = {}) {
    this.pool = pool;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get comprehensive index usage report for all indexes
   */
  async getUsageReport(): Promise<IndexUsageSummary> {
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
      const { formatted } = calculatePotentialSavings(indexes);
      globalRecommendations.push(
        `${unusedCount} index(es) are unused. Consider dropping to save ${formatted}.`
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
    } else if (indexes.length > 0 && indexes.length === unusedCount) {
      overallStatus = 'unused';
    }

    return {
      totalIndexes: indexes.length,
      healthyIndexes: healthyCount,
      degradedIndexes: degradedCount,
      criticalIndexes: criticalCount,
      unusedIndexes: unusedCount,
      totalIndexSize: formatBytes(totalSizeBytes),
      totalIndexSizeBytes: totalSizeBytes,
      overallStatus,
      indexes,
      globalRecommendations,
      checkedAt: new Date(),
    };
  }

  /**
   * Get detailed information about each index
   */
  private async getIndexDetails(): Promise<IndexUsageReport[]> {
    const schemaFilter =
      this.config.includeSchemas.length > 0 ? `AND sui.schemaname = ANY($1)` : '';

    const params = this.config.includeSchemas.length > 0 ? [this.config.includeSchemas] : [];

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
      is_unique: boolean;
      is_primary: boolean;
    }>(
      `
      SELECT
        sui.schemaname,
        sui.relname as tablename,
        sui.indexrelname as indexname,
        pg_get_indexdef(sui.indexrelid) as indexdef,
        pg_size_pretty(pg_relation_size(sui.indexrelid)) as index_size,
        pg_relation_size(sui.indexrelid)::text as index_size_bytes,
        sui.idx_scan::text,
        sui.idx_tup_read::text,
        sui.idx_tup_fetch::text,
        pg_stat_get_last_analyze_time(c.oid) as last_analyze,
        pg_stat_get_last_vacuum_time(c.oid) as last_vacuum,
        COALESCE(i.indisunique, false) as is_unique,
        COALESCE(i.indisprimary, false) as is_primary
      FROM pg_stat_user_indexes sui
      JOIN pg_class c ON c.oid = sui.relid
      LEFT JOIN pg_index i ON i.indexrelid = sui.indexrelid
      WHERE TRUE
        ${schemaFilter}
      ORDER BY pg_relation_size(sui.indexrelid) DESC
    `,
      params
    );

    return result.rows
      .filter((row) => this.shouldIncludeIndex(row.indexname))
      .map((row) => {
        const indexType = this.detectIndexType(row.indexdef);
        const scans = parseInt(row.idx_scan, 10);
        const tuplesRead = parseInt(row.idx_tup_read, 10);
        const tuplesFetched = parseInt(row.idx_tup_fetch, 10);
        const efficiency = tuplesRead > 0 ? tuplesFetched / tuplesRead : 0;
        const status = determineIndexStatus(scans, efficiency, row.last_analyze, this.config);

        const indexData = {
          indexName: row.indexname,
          tableName: row.tablename,
          schemaName: row.schemaname,
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
          isUnique: row.is_unique,
          isPrimaryKey: row.is_primary,
          indexDefinition: row.indexdef,
          recommendations: [] as string[],
        };

        // Generate recommendations after creating the object
        indexData.recommendations = generateIndexRecommendations(indexData, this.config);

        return indexData;
      });
  }

  /**
   * Check if an index should be included based on exclude patterns
   */
  private shouldIncludeIndex(indexName: string): boolean {
    for (const pattern of this.config.excludePatterns) {
      if (new RegExp(pattern).test(indexName)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Detect index type from definition
   */
  private detectIndexType(indexdef: string): IndexType {
    const def = indexdef.toLowerCase();

    if (def.includes('using btree')) {
      return 'btree';
    }
    if (def.includes('using hash')) {
      return 'hash';
    }
    if (def.includes('using gin')) {
      return 'gin';
    }
    if (def.includes('using gist')) {
      return 'gist';
    }
    if (def.includes('using spgist')) {
      return 'spgist';
    }
    if (def.includes('using brin')) {
      return 'brin';
    }
    if (def.includes('using hnsw')) {
      return 'hnsw';
    }
    if (def.includes('using ivfflat')) {
      return 'ivfflat';
    }

    // Default btree if no USING clause (PostgreSQL default)
    if (!def.includes('using ')) {
      return 'btree';
    }

    return 'unknown';
  }

  /**
   * Check which tables need maintenance
   */
  private async checkMaintenanceStaleness(): Promise<{
    needsVacuum: string[];
    needsAnalyze: string[];
  }> {
    const schemaFilter = this.config.includeSchemas.length > 0 ? `AND n.nspname = ANY($1)` : '';

    const params = this.config.includeSchemas.length > 0 ? [this.config.includeSchemas] : [];

    const result = await this.pool.query<{
      tablename: string;
      last_vacuum: Date | null;
      last_analyze: Date | null;
    }>(
      `
      SELECT
        c.relname as tablename,
        pg_stat_get_last_vacuum_time(c.oid) as last_vacuum,
        pg_stat_get_last_analyze_time(c.oid) as last_analyze
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        ${schemaFilter}
    `,
      params
    );

    const needsVacuum: string[] = [];
    const needsAnalyze: string[] = [];
    const vacuumThreshold = this.config.vacuumStalenessDays * 24 * 60 * 60 * 1000;
    const analyzeThreshold = this.config.analyzeStalenessDays * 24 * 60 * 60 * 1000;

    for (const row of result.rows) {
      if (!row.last_vacuum || Date.now() - row.last_vacuum.getTime() > vacuumThreshold) {
        needsVacuum.push(row.tablename);
      }
      if (!row.last_analyze || Date.now() - row.last_analyze.getTime() > analyzeThreshold) {
        needsAnalyze.push(row.tablename);
      }
    }

    return { needsVacuum, needsAnalyze };
  }

  /**
   * Get unused indexes sorted by size (largest first)
   */
  async getUnusedIndexes(limit = 20): Promise<IndexUsageReport[]> {
    const report = await this.getUsageReport();
    return report.indexes
      .filter((idx) => idx.status === 'unused' && !idx.isPrimaryKey)
      .sort((a, b) => b.indexSizeBytes - a.indexSizeBytes)
      .slice(0, limit);
  }

  /**
   * Get largest indexes sorted by size
   */
  async getLargestIndexes(limit = 20): Promise<IndexUsageReport[]> {
    const report = await this.getUsageReport();
    return report.indexes.sort((a, b) => b.indexSizeBytes - a.indexSizeBytes).slice(0, limit);
  }

  /**
   * Generate recommendations batch for all indexes
   */
  async getRecommendations(): Promise<IndexRecommendationBatch> {
    const report = await this.getUsageReport();
    const recommendations: IndexRecommendation[] = [];

    for (const index of report.indexes) {
      // Skip healthy indexes with no issues
      if (index.status === 'healthy' && index.recommendations.length === 0) {
        continue;
      }

      let action: IndexRecommendation['action'] = 'monitor';
      let priority: IndexRecommendation['priority'] = 'low';
      let reason = '';

      switch (index.status) {
        case 'unused':
          if (index.isPrimaryKey) {
            action = 'monitor';
            priority = 'medium';
            reason = 'Primary key index is unused - verify table access patterns';
          } else if (index.isUnique) {
            action = 'monitor';
            priority = 'low';
            reason = 'Unique constraint index is unused - verify constraint is still needed';
          } else {
            action = 'drop';
            priority = 'high';
            reason = `Index is unused and consuming ${index.indexSize}`;
          }
          break;
        case 'critical':
          action = 'reindex';
          priority = 'critical';
          reason = `Index efficiency is critically low (${(index.efficiency * 100).toFixed(1)}%)`;
          break;
        case 'degraded':
          action = 'analyze';
          priority = 'medium';
          reason = `Index efficiency is degraded (${(index.efficiency * 100).toFixed(1)}%)`;
          break;
        case 'healthy':
          // Still might need maintenance
          if (index.recommendations.some((r) => r.includes('ANALYZE'))) {
            action = 'analyze';
            priority = 'low';
            reason = 'Statistics are stale';
          } else if (index.recommendations.some((r) => r.includes('VACUUM'))) {
            action = 'vacuum';
            priority = 'low';
            reason = 'Dead tuples need to be reclaimed';
          } else {
            action = 'keep';
            priority = 'low';
            reason = 'Index is healthy';
          }
          break;
      }

      recommendations.push({
        indexName: index.indexName,
        tableName: index.tableName,
        action,
        reason,
        priority,
        estimatedSavingsBytes: index.status === 'unused' ? index.indexSizeBytes : undefined,
        estimatedSavings: index.status === 'unused' ? index.indexSize : undefined,
      });
    }

    // Sort by priority (critical > high > medium > low)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const { bytes, formatted } = calculatePotentialSavings(report.indexes);

    return {
      generatedAt: new Date(),
      totalIndexes: report.totalIndexes,
      unusedCount: report.unusedIndexes,
      potentialSavingsBytes: bytes,
      potentialSavings: formatted,
      recommendations,
    };
  }

  /**
   * Run maintenance on tables with indexes
   */
  async runMaintenance(): Promise<{
    tablesAnalyzed: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    const tablesAnalyzed: string[] = [];

    const schemaFilter = this.config.includeSchemas.length > 0 ? `AND n.nspname = ANY($1)` : '';

    const params = this.config.includeSchemas.length > 0 ? [this.config.includeSchemas] : [];

    const result = await this.pool.query<{ tablename: string; schemaname: string }>(
      `
      SELECT DISTINCT c.relname as tablename, n.nspname as schemaname
      FROM pg_stat_user_indexes sui
      JOIN pg_class c ON c.oid = sui.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE TRUE
        ${schemaFilter}
    `,
      params
    );

    for (const row of result.rows) {
      try {
        const fullTableName =
          row.schemaname === 'public' ? row.tablename : `"${row.schemaname}"."${row.tablename}"`;
        await this.pool.query(`ANALYZE ${fullTableName}`);
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
   * Get index usage trend over time (requires historical data)
   */
  async getUsageTrend(days = 30): Promise<
    {
      checkedAt: Date;
      totalIndexes: number;
      unusedCount: number;
      totalSizeBytes: number;
      averageEfficiency: number;
    }[]
  > {
    try {
      const result = await this.pool.query<{
        checked_at: Date;
        total_indexes: string;
        unused_count: string;
        total_size_bytes: string;
        avg_efficiency: string;
      }>(`
        SELECT
          DATE_TRUNC('day', checked_at) as checked_at,
          COUNT(DISTINCT index_name)::text as total_indexes,
          COUNT(*) FILTER (WHERE status = 'unused')::text as unused_count,
          SUM(size_bytes)::text as total_size_bytes,
          AVG(efficiency)::text as avg_efficiency
        FROM index_usage_metrics
        WHERE checked_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('day', checked_at)
        ORDER BY checked_at DESC
      `);

      return result.rows.map((row) => ({
        checkedAt: row.checked_at,
        totalIndexes: parseInt(row.total_indexes, 10),
        unusedCount: parseInt(row.unused_count, 10),
        totalSizeBytes: parseInt(row.total_size_bytes, 10),
        averageEfficiency: parseFloat(row.avg_efficiency),
      }));
    } catch {
      // Table might not exist yet
      logger.debug('Index usage metrics table not found, returning empty trend');
      return [];
    }
  }

  /**
   * Store current metrics to the database for historical tracking
   */
  async storeMetrics(): Promise<number> {
    const report = await this.getUsageReport();
    let storedCount = 0;

    for (const index of report.indexes) {
      try {
        await this.pool.query(
          `
          INSERT INTO index_usage_metrics (
            index_name, table_name, schema_name, index_type,
            index_scans, tuples_read, tuples_fetched, efficiency,
            status, size_bytes, last_analyze, last_vacuum,
            recommendations, checked_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
        `,
          [
            index.indexName,
            index.tableName,
            index.schemaName,
            index.indexType,
            index.indexScans,
            index.tuplesRead,
            index.tuplesFetched,
            index.efficiency,
            index.status,
            index.indexSizeBytes,
            index.lastAnalyze,
            index.lastVacuum,
            JSON.stringify(index.recommendations),
            report.checkedAt,
          ]
        );
        storedCount++;
      } catch (error) {
        logger.warn({ indexName: index.indexName, error }, 'Failed to store index metric');
      }
    }

    logger.info({ storedCount, totalIndexes: report.indexes.length }, 'Stored index usage metrics');
    return storedCount;
  }
}

/**
 * Create an index usage monitor instance
 */
export function createIndexUsageMonitor(
  pool: Pool,
  config?: Partial<IndexMonitoringConfig>
): IndexUsageMonitor {
  return new IndexUsageMonitor(pool, config);
}
