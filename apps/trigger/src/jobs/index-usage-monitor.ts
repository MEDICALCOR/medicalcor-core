import { schedules, logger } from '@trigger.dev/sdk/v3';
import * as crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import type { IndexMonitoringResult } from '@medicalcor/types';
import { formatBytes } from '@medicalcor/types';

/**
 * Index Usage Monitor (L1)
 *
 * Monitors PostgreSQL index usage patterns to identify unused indexes
 * that can be removed to improve write performance.
 *
 * @module @medicalcor/trigger/jobs/index-usage-monitor
 */

const DEFAULT_SCHEMAS = ['public'];

function generateCorrelationId(): string {
  return `index_monitor_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;
  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;
  const eventStore = databaseUrl
    ? createEventStore({ source: 'index-usage-monitor', connectionString: databaseUrl })
    : createInMemoryEventStore('index-usage-monitor');
  return { db, eventStore };
}

function determineStatus(
  scans: number,
  efficiency: number,
  lastAnalyze: Date | null
): 'healthy' | 'degraded' | 'critical' | 'unused' {
  if (scans === 0) return 'unused';
  if (efficiency < 0.25) return 'critical';
  if (efficiency < 0.5) return 'degraded';
  if (lastAnalyze) {
    const daysSinceAnalyze = (Date.now() - lastAnalyze.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAnalyze > 7) return 'degraded';
  } else {
    return 'degraded';
  }
  return 'healthy';
}

function detectIndexType(indexdef: string): string {
  const def = indexdef.toLowerCase();
  if (def.includes('using btree')) return 'btree';
  if (def.includes('using hash')) return 'hash';
  if (def.includes('using gin')) return 'gin';
  if (def.includes('using gist')) return 'gist';
  if (def.includes('using brin')) return 'brin';
  if (def.includes('using hnsw')) return 'hnsw';
  if (def.includes('using ivfflat')) return 'ivfflat';
  if (!def.includes('using ')) return 'btree';
  return 'unknown';
}

async function getIndexUsage(db: DatabasePool) {
  const result = await db.query<{
    schemaname: string;
    tablename: string;
    indexname: string;
    indexdef: string;
    index_size_bytes: string;
    idx_scan: string;
    idx_tup_read: string;
    idx_tup_fetch: string;
    last_analyze: Date | null;
    last_vacuum: Date | null;
    is_unique: boolean;
    is_primary: boolean;
  }>(`
    SELECT
      sui.schemaname,
      sui.relname as tablename,
      sui.indexrelname as indexname,
      pg_get_indexdef(sui.indexrelid) as indexdef,
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
    WHERE sui.schemaname = ANY($1)
    ORDER BY pg_relation_size(sui.indexrelid) DESC
  `, [DEFAULT_SCHEMAS]);
  return result.rows;
}

async function storeMetrics(
  db: DatabasePool,
  indexes: Array<{
    indexName: string;
    tableName: string;
    schemaName: string;
    indexType: string;
    indexScans: number;
    tuplesRead: number;
    tuplesFetched: number;
    efficiency: number;
    status: string;
    sizeBytes: number;
    lastAnalyze: Date | null;
    lastVacuum: Date | null;
    recommendations: string[];
  }>,
  checkedAt: Date
): Promise<number> {
  let storedCount = 0;
  for (const index of indexes) {
    try {
      await db.query(`
        INSERT INTO index_usage_metrics (
          index_name, table_name, schema_name, index_type,
          index_scans, tuples_read, tuples_fetched, efficiency,
          status, size_bytes, last_analyze, last_vacuum,
          recommendations, checked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        index.indexName, index.tableName, index.schemaName, index.indexType,
        index.indexScans, index.tuplesRead, index.tuplesFetched, index.efficiency,
        index.status, index.sizeBytes, index.lastAnalyze, index.lastVacuum,
        JSON.stringify(index.recommendations), checkedAt,
      ]);
      storedCount++;
    } catch {
      // Ignore individual insert failures
    }
  }
  return storedCount;
}

async function storeMonitoringRun(db: DatabasePool, result: IndexMonitoringResult): Promise<void> {
  try {
    await db.query(`
      INSERT INTO index_monitoring_runs (
        success, indexes_monitored, unused_indexes_found,
        degraded_indexes_found, critical_indexes_found,
        potential_savings_bytes, processing_time_ms,
        error_message, correlation_id, started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      result.success, result.indexesMonitored, result.unusedIndexesFound,
      result.degradedIndexesFound, result.criticalIndexesFound,
      result.potentialSavingsBytes, result.processingTimeMs,
      result.error ?? null, result.correlationId,
      new Date(Date.now() - result.processingTimeMs), new Date(),
    ]);
  } catch (error) {
    logger.warn('Failed to store monitoring run result', { error });
  }
}

function processIndexRow(row: {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
  index_size_bytes: string;
  idx_scan: string;
  idx_tup_read: string;
  idx_tup_fetch: string;
  last_analyze: Date | null;
  last_vacuum: Date | null;
  is_unique: boolean;
  is_primary: boolean;
}) {
  const scans = parseInt(row.idx_scan, 10);
  const tuplesRead = parseInt(row.idx_tup_read, 10);
  const tuplesFetched = parseInt(row.idx_tup_fetch, 10);
  const efficiency = tuplesRead > 0 ? tuplesFetched / tuplesRead : 0;
  const sizeBytes = parseInt(row.index_size_bytes, 10);
  const status = determineStatus(scans, efficiency, row.last_analyze);

  const recommendations: string[] = [];
  if (status === 'unused' && !row.is_primary && !row.is_unique) {
    recommendations.push('Consider dropping this unused index.');
  }
  if (status === 'critical') {
    recommendations.push('Consider rebuilding with REINDEX CONCURRENTLY.');
  }
  if (!row.last_analyze) {
    recommendations.push('Run ANALYZE to update statistics.');
  }
  if (!row.last_vacuum) {
    recommendations.push('Run VACUUM to reclaim dead tuples.');
  }

  return {
    indexName: row.indexname,
    tableName: row.tablename,
    schemaName: row.schemaname,
    indexType: detectIndexType(row.indexdef),
    indexScans: scans,
    tuplesRead,
    tuplesFetched,
    efficiency,
    status,
    sizeBytes,
    lastAnalyze: row.last_analyze,
    lastVacuum: row.last_vacuum,
    isPrimary: row.is_primary,
    isUnique: row.is_unique,
    recommendations,
  };
}

/**
 * Daily index usage monitor - runs at 3 AM
 */
export const indexUsageMonitor = schedules.task({
  id: 'index-usage-monitor',
  cron: '0 3 * * *',
  run: async (): Promise<IndexMonitoringResult> => {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    logger.info('Starting index usage monitoring', { correlationId });

    const { db, eventStore } = getClients();
    if (!db) {
      logger.warn('Database not configured', { correlationId });
      return {
        success: false,
        indexesMonitored: 0,
        unusedIndexesFound: 0,
        degradedIndexesFound: 0,
        criticalIndexesFound: 0,
        potentialSavingsBytes: 0,
        potentialSavings: '0 Bytes',
        processingTimeMs: 0,
        correlationId,
        error: 'Database not configured',
      };
    }

    let indexesMonitored = 0;
    let unusedCount = 0;
    let degradedCount = 0;
    let criticalCount = 0;
    let potentialSavingsBytes = 0;

    try {
      const rows = await getIndexUsage(db);
      indexesMonitored = rows.length;

      const processedIndexes = rows.map(row => {
        const processed = processIndexRow(row);
        switch (processed.status) {
          case 'unused':
            unusedCount++;
            if (!processed.isPrimary && !processed.isUnique) {
              potentialSavingsBytes += processed.sizeBytes;
            }
            break;
          case 'degraded':
            degradedCount++;
            break;
          case 'critical':
            criticalCount++;
            break;
          case 'healthy':
            // No action needed
            break;
        }
        return processed;
      });

      await storeMetrics(db, processedIndexes, new Date());

      await eventStore.emit({
        type: 'index.monitoring.completed',
        correlationId,
        payload: {
          indexesMonitored,
          unusedIndexesFound: unusedCount,
          potentialSavings: formatBytes(potentialSavingsBytes),
        },
        aggregateType: 'index_monitoring',
      });

      if (unusedCount > 0) {
        logger.warn('Unused indexes detected', {
          count: unusedCount,
          potentialSavings: formatBytes(potentialSavingsBytes),
          correlationId,
        });
      }

      const result: IndexMonitoringResult = {
        success: true,
        indexesMonitored,
        unusedIndexesFound: unusedCount,
        degradedIndexesFound: degradedCount,
        criticalIndexesFound: criticalCount,
        potentialSavingsBytes,
        potentialSavings: formatBytes(potentialSavingsBytes),
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };

      await storeMonitoringRun(db, result);
      logger.info('Index monitoring completed', { ...result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Index monitoring failed', { error, correlationId });

      const result: IndexMonitoringResult = {
        success: false,
        indexesMonitored,
        unusedIndexesFound: unusedCount,
        degradedIndexesFound: degradedCount,
        criticalIndexesFound: criticalCount,
        potentialSavingsBytes,
        potentialSavings: formatBytes(potentialSavingsBytes),
        processingTimeMs: Date.now() - startTime,
        correlationId,
        error: errorMessage,
      };

      await storeMonitoringRun(db, result);
      return result;
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

/**
 * Monthly cleanup job - runs on 1st at 4 AM
 */
export const cleanupOldMetrics = schedules.task({
  id: 'index-metrics-cleanup',
  cron: '0 4 1 * *',
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting index metrics cleanup', { correlationId });

    const { db } = getClients();
    if (!db) {
      return { success: false, reason: 'Database not configured' };
    }

    try {
      const metricsResult = await db.query<{ cleanup_old_index_metrics: number }>(
        'SELECT cleanup_old_index_metrics(90)'
      );
      const deletedMetrics = metricsResult.rows[0]?.cleanup_old_index_metrics ?? 0;

      const recommendationsResult = await db.query<{ cleanup_expired_recommendations: number }>(
        'SELECT cleanup_expired_recommendations()'
      );
      const expiredRecommendations = recommendationsResult.rows[0]?.cleanup_expired_recommendations ?? 0;

      logger.info('Cleanup completed', { deletedMetrics, expiredRecommendations, correlationId });
      return { success: true, deletedMetrics, expiredRecommendations };
    } catch (error) {
      logger.error('Cleanup failed', { error, correlationId });
      return { success: false, error: String(error) };
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});
