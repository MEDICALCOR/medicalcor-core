/**
 * @fileoverview PostgreSQL Revenue Snapshot Repository (Infrastructure Layer)
 *
 * Concrete PostgreSQL adapter implementing the IRevenueSnapshotRepository port.
 * Queries pre-aggregated revenue_snapshots materialized view for Banking-Grade
 * separation from live payment transactions.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-revenue-snapshot-repository
 *
 * BANKING-GRADE PRINCIPLE:
 * This adapter queries ONLY from the mv_revenue_snapshots materialized view,
 * NOT from live payment tables. This ensures:
 * 1. Consistent point-in-time snapshots
 * 2. No interference with transactional workloads
 * 3. Predictable query performance for forecasting
 *
 * @example
 * ```typescript
 * import { PostgresRevenueSnapshotRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresRevenueSnapshotRepository({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * const historicalData = await repository.getHistoricalRevenue({
 *   clinicId: 'clinic-123',
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date('2024-12-31'),
 *   granularity: 'monthly',
 * });
 * ```
 */

import { Pool } from 'pg';
import { createLogger } from '@medicalcor/core';

import type {
  IRevenueSnapshotRepository,
  RevenueSnapshotFilter,
  RevenueSnapshotSummary,
} from '@medicalcor/application';

import type { HistoricalRevenuePoint } from '@medicalcor/application';

const logger = createLogger({ name: 'postgres-revenue-snapshot-repository' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for PostgreSQL Revenue Snapshot Repository
 */
export interface PostgresRevenueSnapshotRepositoryConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum connections in the pool (default: 5) */
  maxConnections?: number;
  /** View name for revenue snapshots (default: 'mv_revenue_snapshots') */
  viewName?: string;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface RevenueSnapshotRow {
  clinic_id: string;
  snapshot_date: Date;
  revenue: string;
  cases_completed: string;
  new_patients: string;
  collection_rate: string | null;
  avg_case_value: string | null;
  high_value_revenue: string | null;
}

interface RevenueSnapshotSummaryRow {
  clinic_id: string;
  data_point_count: string;
  earliest_date: Date | null;
  latest_date: Date | null;
  total_revenue: string;
  last_refreshed_at: Date;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the Revenue Snapshot Repository
 *
 * Queries pre-aggregated materialized views for historical revenue data.
 * This adapter follows the Banking-Grade principle of reading from
 * pre-computed snapshots rather than live transactional data.
 */
export class PostgresRevenueSnapshotRepository implements IRevenueSnapshotRepository {
  private pool: Pool;
  private viewName: string;

  constructor(config: PostgresRevenueSnapshotRepositoryConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 5,
    });
    this.viewName = config.viewName ?? 'mv_revenue_snapshots';

    logger.info({ viewName: this.viewName }, 'PostgresRevenueSnapshotRepository initialized');
  }

  // ==========================================================================
  // GET HISTORICAL REVENUE
  // ==========================================================================

  async getHistoricalRevenue(filter: RevenueSnapshotFilter): Promise<HistoricalRevenuePoint[]> {
    logger.debug(
      {
        clinicId: filter.clinicId,
        startDate: filter.startDate,
        endDate: filter.endDate,
        granularity: filter.granularity,
      },
      'Fetching historical revenue data'
    );

    const granularity = filter.granularity ?? 'monthly';

    // Build query based on granularity
    // For daily: use raw snapshot dates
    // For weekly/monthly/quarterly: aggregate
    const sql = this.buildHistoricalRevenueQuery(granularity);

    try {
      const result = await this.pool.query<RevenueSnapshotRow>(sql, [
        filter.clinicId,
        filter.startDate,
        filter.endDate,
      ]);

      const dataPoints = result.rows.map((row) => this.mapRowToRevenuePoint(row));

      logger.debug(
        { clinicId: filter.clinicId, dataPointCount: dataPoints.length },
        'Historical revenue data fetched'
      );

      return dataPoints;
    } catch (error) {
      logger.error(
        {
          clinicId: filter.clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to fetch historical revenue data'
      );
      throw error;
    }
  }

  // ==========================================================================
  // GET SNAPSHOT SUMMARY
  // ==========================================================================

  async getSnapshotSummary(clinicId: string): Promise<RevenueSnapshotSummary | null> {
    logger.debug({ clinicId }, 'Fetching revenue snapshot summary');

    const sql = `
      SELECT
        clinic_id,
        COUNT(*) as data_point_count,
        MIN(snapshot_date) as earliest_date,
        MAX(snapshot_date) as latest_date,
        SUM(revenue) as total_revenue,
        MAX(refreshed_at) as last_refreshed_at
      FROM ${this.viewName}
      WHERE clinic_id = $1
      GROUP BY clinic_id
    `;

    try {
      const result = await this.pool.query<RevenueSnapshotSummaryRow>(sql, [clinicId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0]!;
      return {
        clinicId: row.clinic_id,
        dataPointCount: parseInt(row.data_point_count, 10),
        earliestDate: row.earliest_date,
        latestDate: row.latest_date,
        totalRevenue: parseFloat(row.total_revenue),
        lastRefreshedAt: row.last_refreshed_at,
      };
    } catch (error) {
      logger.error(
        {
          clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to fetch snapshot summary'
      );
      throw error;
    }
  }

  // ==========================================================================
  // CHECK SUFFICIENT DATA
  // ==========================================================================

  async hasSufficientData(clinicId: string, minDataPoints = 6): Promise<boolean> {
    logger.debug({ clinicId, minDataPoints }, 'Checking for sufficient historical data');

    const sql = `
      SELECT COUNT(*) as count
      FROM ${this.viewName}
      WHERE clinic_id = $1
    `;

    try {
      const result = await this.pool.query<{ count: string }>(sql, [clinicId]);
      const count = parseInt(result.rows[0]?.count ?? '0', 10);
      const hasSufficient = count >= minDataPoints;

      logger.debug(
        { clinicId, count, minDataPoints, hasSufficient },
        'Sufficient data check completed'
      );

      return hasSufficient;
    } catch (error) {
      logger.error(
        {
          clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to check sufficient data'
      );
      throw error;
    }
  }

  // ==========================================================================
  // GET LATEST SNAPSHOT DATE
  // ==========================================================================

  async getLatestSnapshotDate(clinicId: string): Promise<Date | null> {
    const sql = `
      SELECT MAX(snapshot_date) as latest_date
      FROM ${this.viewName}
      WHERE clinic_id = $1
    `;

    try {
      const result = await this.pool.query<{ latest_date: Date | null }>(sql, [clinicId]);
      return result.rows[0]?.latest_date ?? null;
    } catch (error) {
      logger.error(
        {
          clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get latest snapshot date'
      );
      throw error;
    }
  }

  // ==========================================================================
  // BATCH HISTORICAL REVENUE
  // ==========================================================================

  async getHistoricalRevenueForClinics(
    clinicIds: string[],
    filter: Omit<RevenueSnapshotFilter, 'clinicId'>
  ): Promise<Map<string, HistoricalRevenuePoint[]>> {
    if (clinicIds.length === 0) {
      return new Map();
    }

    logger.debug(
      {
        clinicCount: clinicIds.length,
        startDate: filter.startDate,
        endDate: filter.endDate,
      },
      'Fetching batch historical revenue data'
    );

    const granularity = filter.granularity ?? 'monthly';
    const sql = this.buildBatchHistoricalRevenueQuery(granularity);

    try {
      const result = await this.pool.query<RevenueSnapshotRow>(sql, [
        clinicIds,
        filter.startDate,
        filter.endDate,
      ]);

      // Group results by clinic
      const resultMap = new Map<string, HistoricalRevenuePoint[]>();
      for (const clinicId of clinicIds) {
        resultMap.set(clinicId, []);
      }

      for (const row of result.rows) {
        const dataPoint = this.mapRowToRevenuePoint(row);
        const clinicData = resultMap.get(row.clinic_id);
        if (clinicData) {
          clinicData.push(dataPoint);
        }
      }

      logger.debug(
        { clinicCount: clinicIds.length, totalRows: result.rows.length },
        'Batch historical revenue data fetched'
      );

      return resultMap;
    } catch (error) {
      logger.error(
        {
          clinicCount: clinicIds.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to fetch batch historical revenue data'
      );
      throw error;
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Maps granularity to DATE_TRUNC function name
   */
  private readonly granularityToTruncFn: Record<
    'daily' | 'weekly' | 'monthly' | 'quarterly',
    string | null
  > = {
    daily: null,
    weekly: 'week',
    monthly: 'month',
    quarterly: 'quarter',
  };

  /**
   * Builds revenue query for both single clinic and batch operations.
   * Consolidated to eliminate duplication between single/batch query builders.
   */
  private buildRevenueQuery(
    granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly',
    options: { isBatch: boolean }
  ): string {
    const truncFn = this.granularityToTruncFn[granularity];
    const clinicCondition = options.isBatch ? 'clinic_id = ANY($1)' : 'clinic_id = $1';
    const orderBy = options.isBatch ? 'clinic_id, snapshot_date ASC' : 'snapshot_date ASC';

    // Daily granularity: simple select without aggregation
    if (!truncFn) {
      return `
        SELECT
          clinic_id,
          snapshot_date,
          revenue,
          cases_completed,
          new_patients,
          collection_rate,
          avg_case_value,
          high_value_revenue
        FROM ${this.viewName}
        WHERE ${clinicCondition}
          AND snapshot_date >= $2
          AND snapshot_date <= $3
        ORDER BY ${orderBy}
      `;
    }

    // Weekly/Monthly/Quarterly: aggregated query with DATE_TRUNC
    return `
      SELECT
        clinic_id,
        DATE_TRUNC('${truncFn}', snapshot_date) as snapshot_date,
        SUM(revenue) as revenue,
        SUM(cases_completed) as cases_completed,
        SUM(new_patients) as new_patients,
        AVG(collection_rate) as collection_rate,
        AVG(avg_case_value) as avg_case_value,
        SUM(high_value_revenue) as high_value_revenue
      FROM ${this.viewName}
      WHERE ${clinicCondition}
        AND snapshot_date >= $2
        AND snapshot_date <= $3
      GROUP BY clinic_id, DATE_TRUNC('${truncFn}', snapshot_date)
      ORDER BY ${orderBy}
    `;
  }

  private buildHistoricalRevenueQuery(
    granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  ): string {
    return this.buildRevenueQuery(granularity, { isBatch: false });
  }

  private buildBatchHistoricalRevenueQuery(
    granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  ): string {
    return this.buildRevenueQuery(granularity, { isBatch: true });
  }

  private mapRowToRevenuePoint(row: RevenueSnapshotRow): HistoricalRevenuePoint {
    return {
      date: row.snapshot_date,
      revenue: parseFloat(row.revenue),
      casesCompleted: parseInt(row.cases_completed, 10),
      newPatients: parseInt(row.new_patients, 10),
      collectionRate: row.collection_rate ? parseFloat(row.collection_rate) : undefined,
      avgCaseValue: row.avg_case_value ? parseFloat(row.avg_case_value) : undefined,
      highValueRevenue: row.high_value_revenue ? parseFloat(row.high_value_revenue) : undefined,
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgresRevenueSnapshotRepository connection pool closed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a PostgreSQL Revenue Snapshot Repository
 */
export function createPostgresRevenueSnapshotRepository(
  config: PostgresRevenueSnapshotRepositoryConfig
): PostgresRevenueSnapshotRepository {
  return new PostgresRevenueSnapshotRepository(config);
}
