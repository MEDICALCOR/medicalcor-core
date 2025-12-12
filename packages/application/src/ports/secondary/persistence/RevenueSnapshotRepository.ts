/**
 * @fileoverview Secondary Port - RevenueSnapshotRepository
 *
 * Defines what the application needs from the revenue data persistence layer.
 * This is a hexagonal architecture SECONDARY PORT for fetching historical
 * revenue data from materialized views (Banking-Grade separation from live transactions).
 *
 * @module application/ports/secondary/persistence/RevenueSnapshotRepository
 *
 * BANKING-GRADE PRINCIPLE:
 * This port reads ONLY from pre-aggregated revenue_snapshots materialized view,
 * NOT from live payment transactions. This ensures:
 * 1. Consistent point-in-time snapshots
 * 2. No interference with transactional workloads
 * 3. Predictable query performance
 */

import type { HistoricalRevenuePoint } from '../../primary/RevenueForecastingUseCase.js';

// ============================================================================
// QUERY FILTERS
// ============================================================================

/**
 * Filter options for revenue snapshot queries
 */
export interface RevenueSnapshotFilter {
  /** Clinic identifier */
  readonly clinicId: string;

  /** Start date for historical data */
  readonly startDate: Date;

  /** End date for historical data */
  readonly endDate: Date;

  /** Data granularity (default: monthly) */
  readonly granularity?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

/**
 * Revenue snapshot summary for a clinic
 */
export interface RevenueSnapshotSummary {
  /** Clinic identifier */
  readonly clinicId: string;

  /** Total data points available */
  readonly dataPointCount: number;

  /** Earliest data point date */
  readonly earliestDate: Date | null;

  /** Latest data point date */
  readonly latestDate: Date | null;

  /** Total revenue in the period */
  readonly totalRevenue: number;

  /** Last snapshot refresh timestamp */
  readonly lastRefreshedAt: Date;
}

// ============================================================================
// SECONDARY PORT INTERFACE
// ============================================================================

/**
 * SECONDARY PORT: Revenue Snapshot Repository
 *
 * Defines the contract for fetching historical revenue data from
 * pre-aggregated materialized views. Implementations should query
 * the revenue_snapshots view, NOT live payment transactions.
 *
 * @example
 * ```typescript
 * // Infrastructure adapter implementing this port
 * class PostgresRevenueSnapshotRepository implements IRevenueSnapshotRepository {
 *   async getHistoricalRevenue(filter: RevenueSnapshotFilter) {
 *     // Query mv_revenue_snapshots materialized view
 *     const result = await this.pool.query(
 *       'SELECT * FROM mv_revenue_snapshots WHERE clinic_id = $1 AND ...',
 *       [filter.clinicId, ...]
 *     );
 *     return result.rows.map(this.mapToRevenuePoint);
 *   }
 * }
 * ```
 */
export interface IRevenueSnapshotRepository {
  /**
   * Get historical revenue data for forecasting
   *
   * Retrieves pre-aggregated revenue snapshots from the materialized view.
   * Data is sorted chronologically for time-series analysis.
   *
   * @param filter - Query filters
   * @returns Array of historical revenue points sorted by date
   */
  getHistoricalRevenue(filter: RevenueSnapshotFilter): Promise<HistoricalRevenuePoint[]>;

  /**
   * Get revenue snapshot summary for a clinic
   *
   * Returns metadata about available historical data including
   * date range and total revenue.
   *
   * @param clinicId - Clinic identifier
   * @returns Summary of available revenue data
   */
  getSnapshotSummary(clinicId: string): Promise<RevenueSnapshotSummary | null>;

  /**
   * Check if sufficient historical data exists for forecasting
   *
   * Verifies that the clinic has the minimum required data points
   * for meaningful forecast generation.
   *
   * @param clinicId - Clinic identifier
   * @param minDataPoints - Minimum required data points (default: 6)
   * @returns True if sufficient data exists
   */
  hasSufficientData(clinicId: string, minDataPoints?: number): Promise<boolean>;

  /**
   * Get the latest revenue snapshot date for a clinic
   *
   * Used for cache invalidation and freshness checks.
   *
   * @param clinicId - Clinic identifier
   * @returns Latest snapshot date or null if no data
   */
  getLatestSnapshotDate(clinicId: string): Promise<Date | null>;

  /**
   * Get historical revenue for multiple clinics (batch operation)
   *
   * Optimized for batch forecasting scenarios.
   *
   * @param clinicIds - Array of clinic identifiers
   * @param filter - Common filter options (dates, granularity)
   * @returns Map of clinicId to historical revenue points
   */
  getHistoricalRevenueForClinics(
    clinicIds: string[],
    filter: Omit<RevenueSnapshotFilter, 'clinicId'>
  ): Promise<Map<string, HistoricalRevenuePoint[]>>;
}
