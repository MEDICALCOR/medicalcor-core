/**
 * @fileoverview Case Repository Port Interface (Secondary Port)
 *
 * Defines the interface for case data persistence with cohort analysis
 * capabilities. This port enables MoM/YoY trend tracking for business
 * intelligence dashboards.
 *
 * @module application/ports/secondary/persistence/CaseRepository
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for case data access.
 *
 * ## Cohort Analysis Features
 *
 * - Monthly cohort summaries with LTV metrics
 * - Month-over-Month (MoM) trend comparisons
 * - Year-over-Year (YoY) trend comparisons
 * - Cohort evolution tracking over time
 * - Acquisition source/channel breakdowns
 */

import type {
  CohortLTVMonthlySummary,
  CohortComparison,
  CohortLTVEvolution,
  CohortLTVQuery,
  CohortEvolutionQuery,
  CohortLTVDashboard,
} from '@medicalcor/types';

// =============================================================================
// TREND ANALYSIS TYPES
// =============================================================================

/**
 * Period comparison type for trend analysis
 */
export type TrendPeriod = 'MoM' | 'YoY' | 'QoQ';

/**
 * Trend direction indicator
 */
export type TrendDirection = 'up' | 'down' | 'stable';

/**
 * Single metric trend data point
 */
export interface TrendDataPoint {
  /** Period identifier (e.g., "2024-01", "2024-Q1") */
  period: string;
  /** Metric value for this period */
  value: number;
  /** Change from previous period (absolute) */
  change: number;
  /** Change percentage from previous period */
  changePercent: number;
  /** Trend direction */
  direction: TrendDirection;
}

/**
 * Comprehensive trend analysis result
 */
export interface TrendAnalysis {
  /** Trend period type */
  periodType: TrendPeriod;
  /** Data points ordered chronologically */
  dataPoints: TrendDataPoint[];
  /** Overall trend direction */
  overallDirection: TrendDirection;
  /** Average change percentage */
  avgChangePercent: number;
  /** Current period value */
  currentValue: number;
  /** Previous period value for comparison */
  previousValue: number;
  /** Best performing period */
  bestPeriod: string | null;
  /** Worst performing period */
  worstPeriod: string | null;
}

/**
 * Multi-metric trend dashboard
 */
export interface CohortTrendDashboard {
  /** Revenue trend analysis */
  revenueTrend: TrendAnalysis;
  /** Conversion rate trend */
  conversionTrend: TrendAnalysis;
  /** Average LTV trend */
  avgLtvTrend: TrendAnalysis;
  /** Case volume trend */
  caseVolumeTrend: TrendAnalysis;
  /** Collection rate trend */
  collectionRateTrend: TrendAnalysis;
  /** Period range analyzed */
  periodRange: {
    start: Date;
    end: Date;
  };
  /** Last data refresh timestamp */
  lastRefreshed: Date;
}

/**
 * Query parameters for trend analysis
 */
export interface TrendQueryParams {
  /** Clinic ID to analyze */
  clinicId: string;
  /** Trend period type */
  periodType: TrendPeriod;
  /** Number of periods to include (default: 12 for MoM, 3 for YoY) */
  periodCount?: number;
  /** Optional end date (defaults to current date) */
  endDate?: Date;
  /** Filter by acquisition source */
  acquisitionSource?: string;
  /** Filter by acquisition channel */
  acquisitionChannel?: string;
}

/**
 * Aggregated case statistics for a period
 */
export interface PeriodCaseStats {
  /** Period identifier */
  period: string;
  /** Period start date */
  periodStart: Date;
  /** Period end date */
  periodEnd: Date;
  /** Total cases created */
  totalCases: number;
  /** Completed cases */
  completedCases: number;
  /** Total case value */
  totalValue: number;
  /** Total collected amount */
  totalCollected: number;
  /** Outstanding balance */
  totalOutstanding: number;
  /** Unique patients/leads */
  uniquePatients: number;
  /** New patients acquired */
  newPatients: number;
  /** Returning patients */
  returningPatients: number;
  /** High-value cases (e.g., All-on-X, implants) */
  highValueCases: number;
  /** Average case value */
  avgCaseValue: number;
  /** Average days to payment */
  avgDaysToPayment: number | null;
  /** Collection rate percentage */
  collectionRate: number | null;
}

// =============================================================================
// CASE REPOSITORY PORT INTERFACE
// =============================================================================

/**
 * Case Repository Port Interface
 *
 * Defines the contract for case data persistence with comprehensive
 * cohort analysis capabilities for MoM/YoY trend tracking.
 *
 * @example
 * ```typescript
 * // Get monthly cohort comparison
 * const comparison = await caseRepository.getCohortComparison({
 *   clinicId: 'clinic-123',
 *   startMonth: new Date('2024-01-01'),
 *   endMonth: new Date('2024-12-31'),
 *   limit: 12,
 * });
 *
 * // Get MoM revenue trend
 * const trend = await caseRepository.getRevenueTrend({
 *   clinicId: 'clinic-123',
 *   periodType: 'MoM',
 *   periodCount: 12,
 * });
 * ```
 */
export interface ICaseRepository {
  // ===========================================================================
  // COHORT SUMMARIES
  // ===========================================================================

  /**
   * Get monthly cohort LTV summaries
   *
   * Returns aggregated LTV metrics for leads acquired in each month,
   * enabling cohort-based lifetime value analysis.
   *
   * @param query - Query parameters
   * @returns Array of monthly cohort summaries
   */
  getCohortMonthlySummaries(query: CohortLTVQuery): Promise<CohortLTVMonthlySummary[]>;

  /**
   * Get cohort comparison with growth metrics
   *
   * Returns cohort data enriched with MoM and YoY growth comparisons
   * for easy trend identification.
   *
   * @param query - Query parameters
   * @returns Array of cohort comparisons with growth metrics
   */
  getCohortComparison(query: CohortLTVQuery): Promise<CohortComparison[]>;

  /**
   * Get cohort LTV evolution over time
   *
   * Tracks how a specific cohort's LTV develops month-by-month
   * after acquisition, useful for LTV curve modeling.
   *
   * @param query - Evolution query parameters
   * @returns Cohort evolution data with monthly snapshots
   */
  getCohortEvolution(query: CohortEvolutionQuery): Promise<CohortLTVEvolution>;

  /**
   * Get complete cohort LTV dashboard data
   *
   * Returns all cohort data needed for a comprehensive dashboard
   * including summaries, comparisons, and overall statistics.
   *
   * @param query - Query parameters
   * @returns Complete dashboard data structure
   */
  getCohortDashboard(query: CohortLTVQuery): Promise<CohortLTVDashboard>;

  // ===========================================================================
  // TREND ANALYSIS
  // ===========================================================================

  /**
   * Get comprehensive trend dashboard
   *
   * Returns multi-metric trend analysis including revenue, conversion,
   * LTV, case volume, and collection rate trends.
   *
   * @param params - Trend query parameters
   * @returns Complete trend dashboard with all metrics
   */
  getTrendDashboard(params: TrendQueryParams): Promise<CohortTrendDashboard>;

  /**
   * Get revenue trend analysis
   *
   * Analyzes revenue patterns over specified periods (MoM/YoY/QoQ).
   *
   * @param params - Trend query parameters
   * @returns Revenue trend analysis
   */
  getRevenueTrend(params: TrendQueryParams): Promise<TrendAnalysis>;

  /**
   * Get conversion rate trend analysis
   *
   * Tracks lead-to-customer conversion rate over time.
   *
   * @param params - Trend query parameters
   * @returns Conversion trend analysis
   */
  getConversionTrend(params: TrendQueryParams): Promise<TrendAnalysis>;

  /**
   * Get average LTV trend analysis
   *
   * Monitors how average customer lifetime value evolves.
   *
   * @param params - Trend query parameters
   * @returns LTV trend analysis
   */
  getAvgLtvTrend(params: TrendQueryParams): Promise<TrendAnalysis>;

  /**
   * Get case volume trend analysis
   *
   * Tracks the number of cases over specified periods.
   *
   * @param params - Trend query parameters
   * @returns Case volume trend analysis
   */
  getCaseVolumeTrend(params: TrendQueryParams): Promise<TrendAnalysis>;

  // ===========================================================================
  // PERIOD STATISTICS
  // ===========================================================================

  /**
   * Get case statistics for a specific period
   *
   * Returns detailed case metrics for a single time period.
   *
   * @param clinicId - Clinic identifier
   * @param startDate - Period start date
   * @param endDate - Period end date
   * @returns Period case statistics
   */
  getPeriodStats(clinicId: string, startDate: Date, endDate: Date): Promise<PeriodCaseStats>;

  /**
   * Get case statistics for multiple periods
   *
   * Returns statistics for multiple time periods, useful for
   * building trend visualizations.
   *
   * @param clinicId - Clinic identifier
   * @param periods - Array of period definitions
   * @returns Array of period statistics
   */
  getMultiPeriodStats(
    clinicId: string,
    periods: { start: Date; end: Date }[]
  ): Promise<PeriodCaseStats[]>;

  // ===========================================================================
  // YEAR-OVER-YEAR COMPARISON
  // ===========================================================================

  /**
   * Get YoY comparison for a specific month
   *
   * Compares metrics for a month against the same month last year.
   *
   * @param clinicId - Clinic identifier
   * @param month - Month to compare (will compare against same month -1 year)
   * @returns Comparison data with growth percentages
   */
  getYoYComparison(
    clinicId: string,
    month: Date
  ): Promise<{
    currentPeriod: PeriodCaseStats;
    previousPeriod: PeriodCaseStats;
    revenueGrowth: number;
    caseGrowth: number;
    ltvGrowth: number;
    conversionGrowth: number;
  }>;

  /**
   * Get YoY comparison for multiple months
   *
   * Returns YoY comparisons for a range of months, useful for
   * identifying seasonal patterns and year-over-year trends.
   *
   * @param clinicId - Clinic identifier
   * @param startMonth - Start of the range
   * @param monthCount - Number of months to include
   * @returns Array of YoY comparisons
   */
  getYoYComparisonRange(
    clinicId: string,
    startMonth: Date,
    monthCount: number
  ): Promise<
    {
      month: Date;
      currentPeriod: PeriodCaseStats;
      previousPeriod: PeriodCaseStats | null;
      revenueGrowth: number | null;
      caseGrowth: number | null;
    }[]
  >;

  // ===========================================================================
  // MONTH-OVER-MONTH COMPARISON
  // ===========================================================================

  /**
   * Get MoM comparison for a specific month
   *
   * Compares metrics for a month against the previous month.
   *
   * @param clinicId - Clinic identifier
   * @param month - Month to compare
   * @returns Comparison data with growth percentages
   */
  getMoMComparison(
    clinicId: string,
    month: Date
  ): Promise<{
    currentPeriod: PeriodCaseStats;
    previousPeriod: PeriodCaseStats;
    revenueGrowth: number;
    caseGrowth: number;
    ltvGrowth: number;
    conversionGrowth: number;
  }>;

  /**
   * Get MoM comparison for a range of months
   *
   * Returns consecutive MoM comparisons, useful for identifying
   * month-to-month patterns and recent trends.
   *
   * @param clinicId - Clinic identifier
   * @param startMonth - Start of the range
   * @param monthCount - Number of months to include
   * @returns Array of MoM comparisons
   */
  getMoMComparisonRange(
    clinicId: string,
    startMonth: Date,
    monthCount: number
  ): Promise<
    {
      month: Date;
      currentPeriod: PeriodCaseStats;
      previousPeriod: PeriodCaseStats | null;
      revenueGrowth: number | null;
      caseGrowth: number | null;
    }[]
  >;
}
