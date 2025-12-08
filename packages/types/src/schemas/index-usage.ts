/**
 * Index Usage Monitoring Schemas (L1 Feature)
 *
 * Provides types and schemas for monitoring PostgreSQL index usage.
 * Helps identify unused indexes that can be removed to improve write performance.
 *
 * @module @medicalcor/types/schemas/index-usage
 */

import { z } from 'zod';

// =============================================================================
// STATUS ENUMS
// =============================================================================

/**
 * Index health status based on usage patterns
 */
export const IndexHealthStatusSchema = z.enum([
  'healthy', // Index is actively used with good efficiency
  'degraded', // Index is used but has low efficiency or stale statistics
  'critical', // Index has very low efficiency, needs attention
  'unused', // Index has zero scans, candidate for removal
]);
export type IndexHealthStatus = z.infer<typeof IndexHealthStatusSchema>;

/**
 * Index type classification
 */
export const IndexTypeSchema = z.enum([
  'btree', // Standard B-tree index
  'hash', // Hash index
  'gin', // GIN (Generalized Inverted Index)
  'gist', // GiST (Generalized Search Tree)
  'spgist', // SP-GiST (Space-Partitioned GiST)
  'brin', // BRIN (Block Range Index)
  'hnsw', // HNSW vector index (pgvector)
  'ivfflat', // IVFFlat vector index (pgvector)
  'unknown', // Unknown index type
]);
export type IndexType = z.infer<typeof IndexTypeSchema>;

/**
 * Recommendation action types
 */
export const IndexRecommendationActionSchema = z.enum([
  'keep', // Index is healthy, keep it
  'analyze', // Run ANALYZE on the table
  'vacuum', // Run VACUUM on the table
  'reindex', // Rebuild the index
  'drop', // Consider dropping the index
  'monitor', // Continue monitoring before action
]);
export type IndexRecommendationAction = z.infer<typeof IndexRecommendationActionSchema>;

// =============================================================================
// INDEX METRICS SCHEMAS
// =============================================================================

/**
 * Individual index usage report
 */
export const IndexUsageReportSchema = z.object({
  indexName: z.string().describe('Name of the index'),
  tableName: z.string().describe('Name of the table the index belongs to'),
  schemaName: z.string().default('public').describe('Schema name'),
  indexType: IndexTypeSchema.describe('Type of index'),
  indexSize: z.string().describe('Human-readable index size'),
  indexSizeBytes: z.number().int().nonnegative().describe('Index size in bytes'),
  indexScans: z.number().int().nonnegative().describe('Number of index scans'),
  tuplesRead: z.number().int().nonnegative().describe('Number of tuples read from index'),
  tuplesFetched: z.number().int().nonnegative().describe('Number of tuples fetched via index'),
  efficiency: z.number().min(0).max(1).describe('Fetch/read ratio (0-1)'),
  status: IndexHealthStatusSchema.describe('Current health status'),
  lastAnalyze: z.coerce.date().nullable().describe('Last ANALYZE timestamp'),
  lastVacuum: z.coerce.date().nullable().describe('Last VACUUM timestamp'),
  isUnique: z.boolean().describe('Whether this is a unique index'),
  isPrimaryKey: z.boolean().describe('Whether this is a primary key index'),
  indexDefinition: z.string().optional().describe('Full index definition'),
  recommendations: z.array(z.string()).describe('Action recommendations'),
});
export type IndexUsageReport = z.infer<typeof IndexUsageReportSchema>;

/**
 * Overall index usage summary for the database
 */
export const IndexUsageSummarySchema = z.object({
  totalIndexes: z.number().int().nonnegative(),
  healthyIndexes: z.number().int().nonnegative(),
  degradedIndexes: z.number().int().nonnegative(),
  criticalIndexes: z.number().int().nonnegative(),
  unusedIndexes: z.number().int().nonnegative(),
  totalIndexSize: z.string().describe('Human-readable total size'),
  totalIndexSizeBytes: z.number().int().nonnegative(),
  overallStatus: IndexHealthStatusSchema,
  indexes: z.array(IndexUsageReportSchema),
  globalRecommendations: z.array(z.string()),
  checkedAt: z.coerce.date(),
});
export type IndexUsageSummary = z.infer<typeof IndexUsageSummarySchema>;

/**
 * Historical index usage metric for a single index
 */
export const IndexUsageMetricSchema = z.object({
  id: z.string().uuid().optional(),
  indexName: z.string(),
  tableName: z.string(),
  schemaName: z.string().default('public'),
  indexType: IndexTypeSchema,
  indexScans: z.number().int().nonnegative(),
  tuplesRead: z.number().int().nonnegative(),
  tuplesFetched: z.number().int().nonnegative(),
  efficiency: z.number().min(0).max(1),
  status: IndexHealthStatusSchema,
  sizeBytes: z.number().int().nonnegative(),
  lastAnalyze: z.coerce.date().nullable(),
  lastVacuum: z.coerce.date().nullable(),
  recommendations: z.array(z.string()),
  checkedAt: z.coerce.date(),
});
export type IndexUsageMetric = z.infer<typeof IndexUsageMetricSchema>;

// =============================================================================
// RECOMMENDATION SCHEMAS
// =============================================================================

/**
 * Specific recommendation for an index
 */
export const IndexRecommendationSchema = z.object({
  indexName: z.string(),
  tableName: z.string(),
  action: IndexRecommendationActionSchema,
  reason: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedSavingsBytes: z.number().int().nonnegative().optional(),
  estimatedSavings: z.string().optional().describe('Human-readable savings'),
});
export type IndexRecommendation = z.infer<typeof IndexRecommendationSchema>;

/**
 * Batch of recommendations from analysis
 */
export const IndexRecommendationBatchSchema = z.object({
  generatedAt: z.coerce.date(),
  totalIndexes: z.number().int().nonnegative(),
  unusedCount: z.number().int().nonnegative(),
  potentialSavingsBytes: z.number().int().nonnegative(),
  potentialSavings: z.string(),
  recommendations: z.array(IndexRecommendationSchema),
});
export type IndexRecommendationBatch = z.infer<typeof IndexRecommendationBatchSchema>;

// =============================================================================
// MONITORING JOB SCHEMAS
// =============================================================================

/**
 * Configuration for index monitoring
 */
export const IndexMonitoringConfigSchema = z.object({
  /** Minimum days without scans to be considered unused */
  unusedThresholdDays: z.number().int().positive().default(30),
  /** Minimum efficiency ratio to be considered healthy */
  healthyEfficiencyThreshold: z.number().min(0).max(1).default(0.5),
  /** Days since last ANALYZE to recommend running it */
  analyzeStalenessDays: z.number().int().positive().default(7),
  /** Days since last VACUUM to recommend running it */
  vacuumStalenessDays: z.number().int().positive().default(7),
  /** Schemas to include (empty = all) */
  includeSchemas: z.array(z.string()).default(['public']),
  /** Index name patterns to exclude from monitoring */
  excludePatterns: z.array(z.string()).default([]),
  /** Whether to include system indexes */
  includeSystemIndexes: z.boolean().default(false),
});
export type IndexMonitoringConfig = z.infer<typeof IndexMonitoringConfigSchema>;

/**
 * Result of a monitoring job run
 */
export const IndexMonitoringResultSchema = z.object({
  success: z.boolean(),
  indexesMonitored: z.number().int().nonnegative(),
  unusedIndexesFound: z.number().int().nonnegative(),
  degradedIndexesFound: z.number().int().nonnegative(),
  criticalIndexesFound: z.number().int().nonnegative(),
  potentialSavingsBytes: z.number().int().nonnegative(),
  potentialSavings: z.string(),
  processingTimeMs: z.number().nonnegative(),
  correlationId: z.string(),
  error: z.string().optional(),
});
export type IndexMonitoringResult = z.infer<typeof IndexMonitoringResultSchema>;

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/**
 * Query parameters for index usage history
 */
export const IndexUsageQuerySchema = z.object({
  indexName: z.string().optional(),
  tableName: z.string().optional(),
  schemaName: z.string().optional(),
  status: IndexHealthStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});
export type IndexUsageQuery = z.infer<typeof IndexUsageQuerySchema>;

/**
 * Trend point for index usage over time
 */
export const IndexUsageTrendPointSchema = z.object({
  checkedAt: z.coerce.date(),
  totalIndexes: z.number().int().nonnegative(),
  unusedCount: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  averageEfficiency: z.number().min(0).max(1),
});
export type IndexUsageTrendPoint = z.infer<typeof IndexUsageTrendPointSchema>;

/**
 * Dashboard data for index usage monitoring
 */
export const IndexUsageDashboardSchema = z.object({
  summary: IndexUsageSummarySchema,
  recommendations: IndexRecommendationBatchSchema,
  trend: z.array(IndexUsageTrendPointSchema),
  topUnusedIndexes: z.array(IndexUsageReportSchema),
  topLargestIndexes: z.array(IndexUsageReportSchema),
});
export type IndexUsageDashboard = z.infer<typeof IndexUsageDashboardSchema>;

// =============================================================================
// EVENT SCHEMAS
// =============================================================================

/**
 * Event emitted when index monitoring completes
 */
export const IndexMonitoringCompletedEventSchema = z.object({
  type: z.literal('index.monitoring.completed'),
  correlationId: z.string(),
  timestamp: z.coerce.date(),
  payload: IndexMonitoringResultSchema,
});
export type IndexMonitoringCompletedEvent = z.infer<typeof IndexMonitoringCompletedEventSchema>;

/**
 * Event emitted when unused indexes are detected
 */
export const UnusedIndexesDetectedEventSchema = z.object({
  type: z.literal('index.unused.detected'),
  correlationId: z.string(),
  timestamp: z.coerce.date(),
  payload: z.object({
    count: z.number().int().nonnegative(),
    indexes: z.array(
      z.object({
        indexName: z.string(),
        tableName: z.string(),
        sizeBytes: z.number().int().nonnegative(),
        size: z.string(),
      })
    ),
    totalSavingsBytes: z.number().int().nonnegative(),
    totalSavings: z.string(),
  }),
});
export type UnusedIndexesDetectedEvent = z.infer<typeof UnusedIndexesDetectedEventSchema>;

/**
 * Event emitted when critical index health is detected
 */
export const CriticalIndexHealthEventSchema = z.object({
  type: z.literal('index.health.critical'),
  correlationId: z.string(),
  timestamp: z.coerce.date(),
  payload: z.object({
    indexName: z.string(),
    tableName: z.string(),
    efficiency: z.number(),
    status: IndexHealthStatusSchema,
    recommendation: z.string(),
  }),
});
export type CriticalIndexHealthEvent = z.infer<typeof CriticalIndexHealthEventSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine health status based on index metrics
 */
export function determineIndexStatus(
  scans: number,
  efficiency: number,
  lastAnalyze: Date | null,
  config: Pick<IndexMonitoringConfig, 'healthyEfficiencyThreshold' | 'analyzeStalenessDays'>
): IndexHealthStatus {
  // Unused index
  if (scans === 0) {
    return 'unused';
  }

  // Critical efficiency
  if (efficiency < config.healthyEfficiencyThreshold * 0.5) {
    return 'critical';
  }

  // Degraded efficiency
  if (efficiency < config.healthyEfficiencyThreshold) {
    return 'degraded';
  }

  // Check staleness
  if (lastAnalyze) {
    const daysSinceAnalyze = (Date.now() - lastAnalyze.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAnalyze > config.analyzeStalenessDays) {
      return 'degraded';
    }
  } else {
    return 'degraded'; // Never analyzed
  }

  return 'healthy';
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const unit = sizes[i] ?? 'TB';

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${unit}`;
}

/**
 * Calculate potential savings from dropping unused indexes
 */
export function calculatePotentialSavings(
  indexes: Pick<IndexUsageReport, 'status' | 'indexSizeBytes' | 'isPrimaryKey' | 'isUnique'>[]
): { bytes: number; formatted: string } {
  const savingsBytes = indexes
    .filter((idx) => idx.status === 'unused' && !idx.isPrimaryKey && !idx.isUnique)
    .reduce((sum, idx) => sum + idx.indexSizeBytes, 0);

  return {
    bytes: savingsBytes,
    formatted: formatBytes(savingsBytes),
  };
}

/**
 * Generate recommendations for an index based on its metrics
 */
export function generateIndexRecommendations(
  index: Pick<
    IndexUsageReport,
    'status' | 'efficiency' | 'lastAnalyze' | 'lastVacuum' | 'isPrimaryKey' | 'isUnique'
  >,
  config: IndexMonitoringConfig
): string[] {
  const recommendations: string[] = [];

  // Status-based recommendations
  switch (index.status) {
    case 'critical':
      recommendations.push('Consider rebuilding this index with REINDEX CONCURRENTLY');
      break;
    case 'unused':
      if (!index.isPrimaryKey && !index.isUnique) {
        recommendations.push(
          'This index is unused. Consider dropping it to save storage and improve write performance.'
        );
      } else if (index.isPrimaryKey) {
        recommendations.push(
          'Primary key index is unused - verify table is being accessed correctly.'
        );
      } else {
        recommendations.push(
          'Unique constraint index is unused - verify constraint is still needed.'
        );
      }
      break;
    case 'degraded':
      recommendations.push('Index efficiency is below optimal. Consider running ANALYZE.');
      break;
    case 'healthy':
      // No recommendations needed
      break;
  }

  // Maintenance recommendations
  if (!index.lastAnalyze) {
    recommendations.push('Run ANALYZE on this table to update statistics.');
  } else {
    const daysSinceAnalyze = (Date.now() - index.lastAnalyze.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAnalyze > config.analyzeStalenessDays) {
      recommendations.push(
        `Last ANALYZE was ${Math.round(daysSinceAnalyze)} days ago. Consider running ANALYZE.`
      );
    }
  }

  if (!index.lastVacuum) {
    recommendations.push('Run VACUUM to reclaim dead tuples.');
  } else {
    const daysSinceVacuum = (Date.now() - index.lastVacuum.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceVacuum > config.vacuumStalenessDays) {
      recommendations.push(
        `Last VACUUM was ${Math.round(daysSinceVacuum)} days ago. Consider running VACUUM.`
      );
    }
  }

  // Efficiency recommendations
  if (index.efficiency < config.healthyEfficiencyThreshold && index.efficiency > 0) {
    recommendations.push(
      `Index efficiency is ${(index.efficiency * 100).toFixed(1)}%. Consider reviewing query patterns.`
    );
  }

  return recommendations;
}
