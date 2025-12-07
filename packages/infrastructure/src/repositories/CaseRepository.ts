/**
 * @fileoverview Case Repository Adapter (Infrastructure Layer)
 *
 * PostgreSQL implementation of the ICaseRepository port for cohort analysis.
 * Provides MoM/YoY trend tracking capabilities for case data.
 *
 * @module @medicalcor/infrastructure/repositories/CaseRepository
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the ICaseRepository port defined
 * in the application layer, connecting to PostgreSQL for persistence.
 *
 * ## Features
 *
 * - Monthly cohort LTV summaries
 * - Month-over-Month (MoM) trend analysis
 * - Year-over-Year (YoY) trend analysis
 * - Cohort evolution tracking
 * - Comprehensive trend dashboards
 */

import type { Pool } from 'pg';
import { createLogger } from '@medicalcor/core';
import type {
  CohortLTVMonthlySummary,
  CohortComparison,
  CohortLTVEvolution,
  CohortLTVEvolutionPoint,
  CohortLTVQuery,
  CohortEvolutionQuery,
  CohortLTVDashboard,
} from '@medicalcor/types';
import type {
  ICaseRepository,
  TrendQueryParams,
  TrendAnalysis,
  TrendDataPoint,
  TrendDirection,
  CohortTrendDashboard,
  PeriodCaseStats,
} from '@medicalcor/application';

const logger = createLogger({ name: 'case-repository' });

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for Case Repository Adapter
 */
export interface CaseRepositoryConfig {
  /**
   * PostgreSQL connection pool
   */
  pool: Pool;

  /**
   * Clinic ID for single-tenant mode (optional)
   * If provided, all queries will be scoped to this clinic
   */
  defaultClinicId?: string;

  /**
   * Cache TTL in seconds for expensive queries (default: 300 = 5 minutes)
   */
  cacheTtlSeconds?: number;
}

/**
 * Internal query result types
 * PostgreSQL returns bigints as strings, so numeric fields use string | number
 */
interface CohortSummaryRow {
  clinic_id: string;
  cohort_month: Date;
  acquisition_source: string | null;
  acquisition_channel: string | null;
  cohort_size: string | number;
  converted_leads: string | number;
  conversion_rate: string | number | null;
  total_revenue: string | number;
  total_collected: string | number;
  total_outstanding: string | number;
  avg_ltv: string | number | null;
  avg_ltv_converted: string | number | null;
  total_cases: string | number;
  completed_cases: string | number;
  avg_cases_per_customer: string | number | null;
  avg_days_to_first_case: string | number | null;
  max_months_active: string | number | null;
  collection_rate: string | number | null;
}

/**
 * Period stats query result row type
 */
interface PeriodStatsQueryRow {
  idx: number;
  period_start: Date;
  period_end: Date;
  total_cases: string | number;
  completed_cases: string | number;
  total_value: string | number;
  total_collected: string | number;
  total_outstanding: string | number;
  unique_patients: string | number;
  new_patients: string | number;
  returning_patients: string | number;
  high_value_cases: string | number;
  avg_case_value: string | number;
  avg_days_to_payment: string | number | null;
  collection_rate: string | number | null;
}

/**
 * Cohort evolution query result row type
 */
interface CohortEvolutionRow {
  cohort_month: Date;
  cohort_size: string | number;
  months_since_acquisition: string | number;
  period_revenue: string | number;
  paying_customers: string | number;
  cumulative_revenue: string | number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate trend direction based on change percentage
 */
function getTrendDirection(changePercent: number): TrendDirection {
  if (changePercent > 1) return 'up';
  if (changePercent < -1) return 'down';
  return 'stable';
}

/**
 * Calculate growth percentage between two values
 */
function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Format date to YYYY-MM string
 */
function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get first day of month
 */
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get last day of month
 */
function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Map database row to CohortLTVMonthlySummary
 */
function mapToCohortSummary(row: CohortSummaryRow): CohortLTVMonthlySummary {
  return {
    clinicId: row.clinic_id,
    cohortMonth: row.cohort_month,
    acquisitionSource: row.acquisition_source,
    acquisitionChannel: row.acquisition_channel,
    cohortSize: Number(row.cohort_size),
    convertedLeads: Number(row.converted_leads),
    conversionRate: row.conversion_rate ? Number(row.conversion_rate) : null,
    totalRevenue: Number(row.total_revenue),
    totalCollected: Number(row.total_collected),
    totalOutstanding: Number(row.total_outstanding),
    avgLtv: row.avg_ltv ? Number(row.avg_ltv) : null,
    avgLtvConverted: row.avg_ltv_converted ? Number(row.avg_ltv_converted) : null,
    totalCases: Number(row.total_cases),
    completedCases: Number(row.completed_cases),
    avgCasesPerCustomer: row.avg_cases_per_customer ? Number(row.avg_cases_per_customer) : null,
    avgDaysToFirstCase: row.avg_days_to_first_case ? Number(row.avg_days_to_first_case) : null,
    maxMonthsActive: row.max_months_active ? Number(row.max_months_active) : null,
    collectionRate: row.collection_rate ? Number(row.collection_rate) : null,
  };
}

// =============================================================================
// CASE REPOSITORY ADAPTER
// =============================================================================

/**
 * PostgreSQL Case Repository Adapter
 *
 * Implements ICaseRepository port with comprehensive cohort analysis
 * and trend tracking capabilities.
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { CaseRepository } from '@medicalcor/infrastructure';
 *
 * const pool = new Pool({ connectionString: DATABASE_URL });
 * const repository = new CaseRepository({ pool });
 *
 * // Get MoM revenue trend
 * const trend = await repository.getRevenueTrend({
 *   clinicId: 'clinic-123',
 *   periodType: 'MoM',
 *   periodCount: 12,
 * });
 * ```
 */
export class CaseRepository implements ICaseRepository {
  private pool: Pool;
  private defaultClinicId?: string;
  private cacheTtlSeconds: number;

  constructor(config: CaseRepositoryConfig) {
    this.pool = config.pool;
    this.defaultClinicId = config.defaultClinicId;
    this.cacheTtlSeconds = config.cacheTtlSeconds ?? 300;

    logger.info(
      { defaultClinicId: this.defaultClinicId, cacheTtl: this.cacheTtlSeconds },
      'CaseRepository initialized'
    );
  }

  // ===========================================================================
  // COHORT SUMMARIES
  // ===========================================================================

  /**
   * @inheritdoc
   */
  async getCohortMonthlySummaries(query: CohortLTVQuery): Promise<CohortLTVMonthlySummary[]> {
    const clinicId = query.clinicId;

    logger.debug({ clinicId, query }, 'Fetching cohort monthly summaries');

    const sql = `
      WITH lead_cohorts AS (
        SELECT
          l.id AS lead_id,
          l.clinic_id,
          DATE_TRUNC('month', l.created_at) AS cohort_month,
          l.source AS acquisition_source,
          l.metadata->>'channel' AS acquisition_channel,
          l.created_at AS lead_created_at
        FROM leads l
        WHERE l.clinic_id = $1
          AND ($2::timestamp IS NULL OR l.created_at >= $2)
          AND ($3::timestamp IS NULL OR l.created_at <= $3)
          AND ($4::text IS NULL OR l.source = $4)
      ),
      case_data AS (
        SELECT
          c.lead_id,
          c.id AS case_id,
          c.status,
          c.total_value,
          c.amount_paid,
          c.created_at AS case_created_at,
          c.completed_at,
          CASE WHEN mp.is_high_value THEN 1 ELSE 0 END AS is_high_value
        FROM cases c
        LEFT JOIN medical_procedures mp ON c.procedure_id = mp.id
        WHERE c.clinic_id = $1
      ),
      cohort_metrics AS (
        SELECT
          lc.clinic_id,
          lc.cohort_month,
          CASE WHEN $5 THEN lc.acquisition_source ELSE NULL END AS acquisition_source,
          CASE WHEN $5 THEN lc.acquisition_channel ELSE NULL END AS acquisition_channel,
          COUNT(DISTINCT lc.lead_id) AS cohort_size,
          COUNT(DISTINCT CASE WHEN cd.case_id IS NOT NULL THEN lc.lead_id END) AS converted_leads,
          SUM(COALESCE(cd.total_value, 0)) AS total_revenue,
          SUM(COALESCE(cd.amount_paid, 0)) AS total_collected,
          SUM(COALESCE(cd.total_value, 0) - COALESCE(cd.amount_paid, 0)) AS total_outstanding,
          COUNT(cd.case_id) AS total_cases,
          COUNT(CASE WHEN cd.status = 'completed' THEN 1 END) AS completed_cases,
          AVG(EXTRACT(EPOCH FROM (cd.case_created_at - lc.lead_created_at)) / 86400) AS avg_days_to_first_case,
          MAX(EXTRACT(MONTH FROM AGE(NOW(), lc.cohort_month))) AS max_months_active
        FROM lead_cohorts lc
        LEFT JOIN case_data cd ON lc.lead_id = cd.lead_id
        GROUP BY
          lc.clinic_id,
          lc.cohort_month,
          CASE WHEN $5 THEN lc.acquisition_source ELSE NULL END,
          CASE WHEN $5 THEN lc.acquisition_channel ELSE NULL END
      )
      SELECT
        clinic_id,
        cohort_month,
        acquisition_source,
        acquisition_channel,
        cohort_size,
        converted_leads,
        CASE WHEN cohort_size > 0
          THEN ROUND((converted_leads::numeric / cohort_size) * 100, 2)
          ELSE NULL
        END AS conversion_rate,
        total_revenue,
        total_collected,
        total_outstanding,
        CASE WHEN cohort_size > 0
          THEN ROUND(total_collected::numeric / cohort_size, 2)
          ELSE NULL
        END AS avg_ltv,
        CASE WHEN converted_leads > 0
          THEN ROUND(total_collected::numeric / converted_leads, 2)
          ELSE NULL
        END AS avg_ltv_converted,
        total_cases,
        completed_cases,
        CASE WHEN converted_leads > 0
          THEN ROUND(total_cases::numeric / converted_leads, 2)
          ELSE NULL
        END AS avg_cases_per_customer,
        ROUND(avg_days_to_first_case::numeric, 1) AS avg_days_to_first_case,
        max_months_active::integer,
        CASE WHEN total_revenue > 0
          THEN ROUND((total_collected::numeric / total_revenue) * 100, 2)
          ELSE NULL
        END AS collection_rate
      FROM cohort_metrics
      ORDER BY cohort_month DESC
      LIMIT $6
    `;

    // Build query params - handle both Zod-parsed and raw objects
    /* eslint-disable @typescript-eslint/no-unnecessary-condition */
    const params = [
      clinicId,
      query.startMonth ?? null,
      query.endMonth ?? null,
      query.acquisitionSource ?? null,
      query.includeBreakdown ?? false,
      query.limit ?? 12,
    ];
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    const result = await this.pool.query<CohortSummaryRow>(sql, params);

    logger.info({ clinicId, rowCount: result.rowCount }, 'Fetched cohort monthly summaries');

    return result.rows.map(mapToCohortSummary);
  }

  /**
   * @inheritdoc
   */
  async getCohortComparison(query: CohortLTVQuery): Promise<CohortComparison[]> {
    const summaries = await this.getCohortMonthlySummaries(query);

    logger.debug({ clinicId: query.clinicId }, 'Building cohort comparison');

    // Calculate MoM and YoY growth for each cohort
    const comparisons: CohortComparison[] = summaries.map((current, index) => {
      // Get previous month (next in array since sorted DESC)
      const prevMonth = summaries[index + 1] ?? null;

      // Find same month last year
      const currentDate = new Date(current.cohortMonth);
      const yoyDate = new Date(currentDate);
      yoyDate.setFullYear(yoyDate.getFullYear() - 1);
      const yoyMonth = summaries.find(
        (s) => formatMonth(new Date(s.cohortMonth)) === formatMonth(yoyDate)
      );

      return {
        clinicId: current.clinicId,
        cohortMonth: current.cohortMonth,
        cohortSize: current.cohortSize,
        convertedLeads: current.convertedLeads,
        conversionRate: current.conversionRate,
        totalCollected: current.totalCollected,
        avgLtv: current.avgLtv,
        avgLtvConverted: current.avgLtvConverted,
        collectionRate: current.collectionRate,
        avgDaysToFirstCase: current.avgDaysToFirstCase,
        prevCohortAvgLtv: prevMonth?.avgLtv ?? null,
        ltvGrowthVsPrev:
          prevMonth?.avgLtv && current.avgLtv
            ? calculateGrowth(current.avgLtv, prevMonth.avgLtv)
            : null,
        yoyCohortAvgLtv: yoyMonth?.avgLtv ?? null,
        ltvGrowthYoy:
          yoyMonth?.avgLtv && current.avgLtv
            ? calculateGrowth(current.avgLtv, yoyMonth.avgLtv)
            : null,
      };
    });

    return comparisons;
  }

  /**
   * @inheritdoc
   */
  async getCohortEvolution(query: CohortEvolutionQuery): Promise<CohortLTVEvolution> {
    const { clinicId, cohortMonth, maxMonths } = query;

    logger.debug({ clinicId, cohortMonth, maxMonths }, 'Fetching cohort evolution');

    const sql = `
      WITH cohort_leads AS (
        SELECT
          l.id AS lead_id,
          l.clinic_id,
          DATE_TRUNC('month', l.created_at) AS cohort_month
        FROM leads l
        WHERE l.clinic_id = $1
          AND DATE_TRUNC('month', l.created_at) = DATE_TRUNC('month', $2::timestamp)
      ),
      monthly_revenue AS (
        SELECT
          cl.cohort_month,
          EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', p.payment_date), cl.cohort_month))::integer AS months_since_acquisition,
          COUNT(DISTINCT cl.lead_id) FILTER (WHERE p.amount > 0) AS paying_customers,
          SUM(p.amount) AS period_revenue
        FROM cohort_leads cl
        LEFT JOIN cases c ON cl.lead_id = c.lead_id
        LEFT JOIN payments p ON c.id = p.case_id
        WHERE p.payment_date IS NOT NULL
        GROUP BY cl.cohort_month, EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', p.payment_date), cl.cohort_month))
        HAVING EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', p.payment_date), cl.cohort_month)) <= $3
      ),
      cohort_size AS (
        SELECT
          cohort_month,
          COUNT(DISTINCT lead_id) AS size
        FROM cohort_leads
        GROUP BY cohort_month
      )
      SELECT
        cs.cohort_month,
        cs.size AS cohort_size,
        COALESCE(mr.months_since_acquisition, 0) AS months_since_acquisition,
        COALESCE(mr.period_revenue, 0) AS period_revenue,
        COALESCE(mr.paying_customers, 0) AS paying_customers,
        SUM(COALESCE(mr.period_revenue, 0)) OVER (
          PARTITION BY cs.cohort_month
          ORDER BY mr.months_since_acquisition
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_revenue
      FROM cohort_size cs
      LEFT JOIN monthly_revenue mr ON cs.cohort_month = mr.cohort_month
      ORDER BY mr.months_since_acquisition
    `;

    /* eslint-disable @typescript-eslint/no-unnecessary-condition */
    const result = await this.pool.query<CohortEvolutionRow>(sql, [
      clinicId,
      cohortMonth,
      maxMonths ?? 24,
    ]);
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    if (result.rows.length === 0) {
      return {
        cohortMonth,
        cohortSize: 0,
        dataPoints: [],
        currentLtv: null,
        cohortAgeMonths: 0,
      };
    }

    const firstRow = result.rows[0];
    const cohortSize = firstRow ? Number(firstRow.cohort_size) : 0;
    const dataPoints: CohortLTVEvolutionPoint[] = result.rows.map((row) => ({
      clinicId,
      cohortMonth,
      monthsSinceAcquisition: Number(row.months_since_acquisition),
      cohortSize,
      periodRevenue: Number(row.period_revenue),
      payingCustomers: Number(row.paying_customers),
      cumulativeRevenue: Number(row.cumulative_revenue),
      cumulativeLtvPerLead: cohortSize > 0 ? Number(row.cumulative_revenue) / cohortSize : null,
      payingPercentage: cohortSize > 0 ? (Number(row.paying_customers) / cohortSize) * 100 : null,
    }));

    const lastPoint = dataPoints[dataPoints.length - 1];

    return {
      cohortMonth,
      cohortSize,
      dataPoints,
      currentLtv: lastPoint?.cumulativeLtvPerLead ?? null,
      cohortAgeMonths: lastPoint?.monthsSinceAcquisition ?? 0,
    };
  }

  /**
   * @inheritdoc
   */
  async getCohortDashboard(query: CohortLTVQuery): Promise<CohortLTVDashboard> {
    logger.debug({ clinicId: query.clinicId }, 'Building cohort dashboard');

    const [cohorts, sourceBreakdown] = await Promise.all([
      this.getCohortComparison(query),
      query.includeBreakdown
        ? this.getCohortMonthlySummaries({ ...query, includeBreakdown: true })
        : Promise.resolve(undefined),
    ]);

    // Calculate overall statistics
    const totalLeads = cohorts.reduce((sum, c) => sum + c.cohortSize, 0);
    const totalConverted = cohorts.reduce((sum, c) => sum + c.convertedLeads, 0);
    // Total collected is computed but may be needed for future enhancements
    const _totalCollected = cohorts.reduce((sum, c) => sum + c.totalCollected, 0);
    void _totalCollected; // Reserved for future use

    const avgLtvValues = cohorts.filter((c) => c.avgLtv !== null).map((c) => c.avgLtv!);
    const overallAvgLtv =
      avgLtvValues.length > 0
        ? avgLtvValues.reduce((sum, v) => sum + v, 0) / avgLtvValues.length
        : 0;

    // Find best performing cohort
    const bestCohort = cohorts.reduce<CohortComparison | null>(
      (best, current) =>
        current.avgLtv !== null && (!best || current.avgLtv > (best.avgLtv ?? 0)) ? current : best,
      null
    );

    // Calculate LTV trend (slope of regression)
    const ltvTrend = this.calculateTrendSlope(
      cohorts.filter((c) => c.avgLtv !== null).map((c) => c.avgLtv!)
    );

    return {
      cohorts,
      sourceBreakdown,
      summary: {
        totalCohorts: cohorts.length,
        totalLeads,
        overallAvgLtv,
        overallConversionRate: totalLeads > 0 ? (totalConverted / totalLeads) * 100 : 0,
        bestCohortMonth: bestCohort?.cohortMonth ?? null,
        bestCohortLtv: bestCohort?.avgLtv ?? null,
        ltvTrend,
      },
      metadata: {
        startMonth: query.startMonth ?? null,
        endMonth: query.endMonth ?? null,
        lastRefreshed: new Date(),
      },
    };
  }

  // ===========================================================================
  // TREND ANALYSIS
  // ===========================================================================

  /**
   * @inheritdoc
   */
  async getTrendDashboard(params: TrendQueryParams): Promise<CohortTrendDashboard> {
    logger.debug({ ...params }, 'Building trend dashboard');

    const [revenueTrend, conversionTrend, avgLtvTrend, caseVolumeTrend, collectionRateTrend] =
      await Promise.all([
        this.getRevenueTrend(params),
        this.getConversionTrend(params),
        this.getAvgLtvTrend(params),
        this.getCaseVolumeTrend(params),
        this.getCollectionRateTrend(params),
      ]);

    const periodCount = params.periodCount ?? (params.periodType === 'YoY' ? 3 : 12);
    const endDate = params.endDate ?? new Date();
    const startDate = new Date(endDate);

    if (params.periodType === 'YoY') {
      startDate.setFullYear(startDate.getFullYear() - periodCount);
    } else if (params.periodType === 'QoQ') {
      startDate.setMonth(startDate.getMonth() - periodCount * 3);
    } else {
      startDate.setMonth(startDate.getMonth() - periodCount);
    }

    return {
      revenueTrend,
      conversionTrend,
      avgLtvTrend,
      caseVolumeTrend,
      collectionRateTrend,
      periodRange: {
        start: startDate,
        end: endDate,
      },
      lastRefreshed: new Date(),
    };
  }

  /**
   * @inheritdoc
   */
  async getRevenueTrend(params: TrendQueryParams): Promise<TrendAnalysis> {
    return this.buildTrendAnalysis(params, 'revenue');
  }

  /**
   * @inheritdoc
   */
  async getConversionTrend(params: TrendQueryParams): Promise<TrendAnalysis> {
    return this.buildTrendAnalysis(params, 'conversion');
  }

  /**
   * @inheritdoc
   */
  async getAvgLtvTrend(params: TrendQueryParams): Promise<TrendAnalysis> {
    return this.buildTrendAnalysis(params, 'avg_ltv');
  }

  /**
   * @inheritdoc
   */
  async getCaseVolumeTrend(params: TrendQueryParams): Promise<TrendAnalysis> {
    return this.buildTrendAnalysis(params, 'case_volume');
  }

  /**
   * Get collection rate trend analysis (internal method)
   */
  private async getCollectionRateTrend(params: TrendQueryParams): Promise<TrendAnalysis> {
    return this.buildTrendAnalysis(params, 'collection_rate');
  }

  /**
   * Build trend analysis for a specific metric
   */
  private async buildTrendAnalysis(
    params: TrendQueryParams,
    metricType: 'revenue' | 'conversion' | 'avg_ltv' | 'case_volume' | 'collection_rate'
  ): Promise<TrendAnalysis> {
    const { clinicId, periodType, periodCount = periodType === 'YoY' ? 3 : 12 } = params;

    logger.debug({ clinicId, periodType, metricType }, 'Building trend analysis');

    const periodStats = await this.getPeriodsForTrend(params, periodCount);

    const dataPoints: TrendDataPoint[] = [];
    let bestPeriod: string | null = null;
    let worstPeriod: string | null = null;
    let bestValue = -Infinity;
    let worstValue = Infinity;

    for (let i = 0; i < periodStats.length; i++) {
      const current = periodStats[i]!;
      const previous = periodStats[i + 1];

      let currentValue: number;
      let previousValue: number | undefined;

      switch (metricType) {
        case 'revenue':
          currentValue = current.totalCollected;
          previousValue = previous?.totalCollected;
          break;
        case 'conversion':
          currentValue =
            current.uniquePatients > 0 ? (current.newPatients / current.uniquePatients) * 100 : 0;
          previousValue =
            previous && previous.uniquePatients > 0
              ? (previous.newPatients / previous.uniquePatients) * 100
              : undefined;
          break;
        case 'avg_ltv':
          currentValue =
            current.uniquePatients > 0 ? current.totalCollected / current.uniquePatients : 0;
          previousValue =
            previous && previous.uniquePatients > 0
              ? previous.totalCollected / previous.uniquePatients
              : undefined;
          break;
        case 'case_volume':
          currentValue = current.totalCases;
          previousValue = previous?.totalCases;
          break;
        case 'collection_rate':
          currentValue = current.collectionRate ?? 0;
          previousValue = previous?.collectionRate ?? undefined;
          break;
      }

      const change = previousValue !== undefined ? currentValue - previousValue : 0;
      const changePercent =
        previousValue !== undefined ? calculateGrowth(currentValue, previousValue) : 0;

      dataPoints.push({
        period: current.period,
        value: currentValue,
        change,
        changePercent,
        direction: getTrendDirection(changePercent),
      });

      if (currentValue > bestValue) {
        bestValue = currentValue;
        bestPeriod = current.period;
      }
      if (currentValue < worstValue) {
        worstValue = currentValue;
        worstPeriod = current.period;
      }
    }

    // Reverse to chronological order
    dataPoints.reverse();

    const avgChangePercent =
      dataPoints.length > 1
        ? dataPoints.slice(1).reduce((sum, dp) => sum + dp.changePercent, 0) /
          (dataPoints.length - 1)
        : 0;

    const currentValue = dataPoints[dataPoints.length - 1]?.value ?? 0;
    const previousValue = dataPoints[dataPoints.length - 2]?.value ?? 0;

    return {
      periodType,
      dataPoints,
      overallDirection: getTrendDirection(avgChangePercent),
      avgChangePercent,
      currentValue,
      previousValue,
      bestPeriod,
      worstPeriod,
    };
  }

  /**
   * Get period statistics for trend analysis
   */
  private async getPeriodsForTrend(
    params: TrendQueryParams,
    periodCount: number
  ): Promise<PeriodCaseStats[]> {
    const { clinicId, periodType, endDate = new Date() } = params;

    const periods: { start: Date; end: Date }[] = [];
    const currentEnd = getMonthEnd(endDate);

    for (let i = 0; i < periodCount; i++) {
      let periodStart: Date;
      let periodEnd: Date;

      if (periodType === 'YoY') {
        const yearOffset = i;
        periodEnd = new Date(currentEnd);
        periodEnd.setFullYear(periodEnd.getFullYear() - yearOffset);
        periodStart = new Date(periodEnd.getFullYear(), 0, 1);
        periodEnd = new Date(periodEnd.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else if (periodType === 'QoQ') {
        const quarterOffset = i;
        const currentQuarter = Math.floor(currentEnd.getMonth() / 3);
        const targetQuarter = (currentQuarter - quarterOffset + 400) % 4;
        const yearOffset = Math.floor((quarterOffset + (3 - currentQuarter)) / 4);
        const year = currentEnd.getFullYear() - yearOffset;
        periodStart = new Date(year, targetQuarter * 3, 1);
        periodEnd = new Date(year, targetQuarter * 3 + 3, 0, 23, 59, 59, 999);
      } else {
        // MoM
        periodEnd = new Date(currentEnd);
        periodEnd.setMonth(periodEnd.getMonth() - i);
        periodEnd = getMonthEnd(periodEnd);
        periodStart = getMonthStart(periodEnd);
      }

      periods.push({ start: periodStart, end: periodEnd });
    }

    return this.getMultiPeriodStats(clinicId, periods);
  }

  // ===========================================================================
  // PERIOD STATISTICS
  // ===========================================================================

  /**
   * @inheritdoc
   */
  async getPeriodStats(clinicId: string, startDate: Date, endDate: Date): Promise<PeriodCaseStats> {
    const periods = await this.getMultiPeriodStats(clinicId, [{ start: startDate, end: endDate }]);
    return (
      periods[0] ?? {
        period: formatMonth(startDate),
        periodStart: startDate,
        periodEnd: endDate,
        totalCases: 0,
        completedCases: 0,
        totalValue: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        uniquePatients: 0,
        newPatients: 0,
        returningPatients: 0,
        highValueCases: 0,
        avgCaseValue: 0,
        avgDaysToPayment: null,
        collectionRate: null,
      }
    );
  }

  /**
   * @inheritdoc
   */
  async getMultiPeriodStats(
    clinicId: string,
    periods: { start: Date; end: Date }[]
  ): Promise<PeriodCaseStats[]> {
    logger.debug({ clinicId, periodCount: periods.length }, 'Fetching multi-period stats');

    if (periods.length === 0) {
      return [];
    }

    // Build period array for query
    const periodData = periods.map((p, idx) => ({
      idx,
      start: p.start.toISOString(),
      end: p.end.toISOString(),
    }));

    const sql = `
      WITH period_definitions AS (
        SELECT
          (value->>'idx')::int AS period_idx,
          (value->>'start')::timestamp AS period_start,
          (value->>'end')::timestamp AS period_end
        FROM jsonb_array_elements($2::jsonb) AS value
      ),
      first_cases AS (
        SELECT
          lead_id,
          MIN(created_at) AS first_case_date
        FROM cases
        WHERE clinic_id = $1
        GROUP BY lead_id
      ),
      period_cases AS (
        SELECT
          pd.period_idx,
          pd.period_start,
          pd.period_end,
          c.id AS case_id,
          c.lead_id,
          c.status,
          c.total_value,
          c.amount_paid,
          c.created_at,
          c.completed_at,
          fc.first_case_date,
          COALESCE(mp.is_high_value, false) AS is_high_value
        FROM period_definitions pd
        LEFT JOIN cases c ON c.clinic_id = $1
          AND c.created_at >= pd.period_start
          AND c.created_at <= pd.period_end
        LEFT JOIN first_cases fc ON c.lead_id = fc.lead_id
        LEFT JOIN medical_procedures mp ON c.procedure_id = mp.id
      ),
      payment_stats AS (
        SELECT
          pc.period_idx,
          AVG(EXTRACT(EPOCH FROM (p.payment_date - pc.created_at)) / 86400) AS avg_days_to_payment
        FROM period_cases pc
        LEFT JOIN payments p ON pc.case_id = p.case_id
        WHERE p.payment_date IS NOT NULL
        GROUP BY pc.period_idx
      )
      SELECT
        pc.period_idx AS idx,
        pc.period_start,
        pc.period_end,
        COUNT(DISTINCT pc.case_id) AS total_cases,
        COUNT(DISTINCT pc.case_id) FILTER (WHERE pc.status = 'completed') AS completed_cases,
        COALESCE(SUM(pc.total_value), 0) AS total_value,
        COALESCE(SUM(pc.amount_paid), 0) AS total_collected,
        COALESCE(SUM(pc.total_value - pc.amount_paid), 0) AS total_outstanding,
        COUNT(DISTINCT pc.lead_id) AS unique_patients,
        COUNT(DISTINCT pc.lead_id) FILTER (
          WHERE pc.first_case_date >= pc.period_start AND pc.first_case_date <= pc.period_end
        ) AS new_patients,
        COUNT(DISTINCT pc.lead_id) FILTER (
          WHERE pc.first_case_date < pc.period_start
        ) AS returning_patients,
        COUNT(DISTINCT pc.case_id) FILTER (WHERE pc.is_high_value = true) AS high_value_cases,
        CASE WHEN COUNT(pc.case_id) > 0
          THEN ROUND(SUM(pc.total_value)::numeric / COUNT(pc.case_id), 2)
          ELSE 0
        END AS avg_case_value,
        ROUND(ps.avg_days_to_payment::numeric, 1) AS avg_days_to_payment,
        CASE WHEN SUM(pc.total_value) > 0
          THEN ROUND((SUM(pc.amount_paid)::numeric / SUM(pc.total_value)) * 100, 2)
          ELSE NULL
        END AS collection_rate
      FROM period_cases pc
      LEFT JOIN payment_stats ps ON pc.period_idx = ps.period_idx
      GROUP BY pc.period_idx, pc.period_start, pc.period_end, ps.avg_days_to_payment
      ORDER BY pc.period_idx
    `;

    const result = await this.pool.query<PeriodStatsQueryRow>(sql, [
      clinicId,
      JSON.stringify(periodData),
    ]);

    return result.rows.map((row) => ({
      period: formatMonth(row.period_start),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalCases: Number(row.total_cases),
      completedCases: Number(row.completed_cases),
      totalValue: Number(row.total_value),
      totalCollected: Number(row.total_collected),
      totalOutstanding: Number(row.total_outstanding),
      uniquePatients: Number(row.unique_patients),
      newPatients: Number(row.new_patients),
      returningPatients: Number(row.returning_patients),
      highValueCases: Number(row.high_value_cases),
      avgCaseValue: Number(row.avg_case_value),
      avgDaysToPayment: row.avg_days_to_payment ? Number(row.avg_days_to_payment) : null,
      collectionRate: row.collection_rate ? Number(row.collection_rate) : null,
    }));
  }

  // ===========================================================================
  // YEAR-OVER-YEAR COMPARISON
  // ===========================================================================

  /**
   * @inheritdoc
   */
  async getYoYComparison(
    clinicId: string,
    month: Date
  ): Promise<{
    currentPeriod: PeriodCaseStats;
    previousPeriod: PeriodCaseStats;
    revenueGrowth: number;
    caseGrowth: number;
    ltvGrowth: number;
    conversionGrowth: number;
  }> {
    const currentStart = getMonthStart(month);
    const currentEnd = getMonthEnd(month);

    const previousStart = new Date(currentStart);
    previousStart.setFullYear(previousStart.getFullYear() - 1);
    const previousEnd = getMonthEnd(previousStart);

    const stats = await this.getMultiPeriodStats(clinicId, [
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd },
    ]);

    const current = stats[0] ?? this.getEmptyPeriodStats(currentStart, currentEnd);
    const previous = stats[1] ?? this.getEmptyPeriodStats(previousStart, previousEnd);

    const currentLtv =
      current.uniquePatients > 0 ? current.totalCollected / current.uniquePatients : 0;
    const previousLtv =
      previous.uniquePatients > 0 ? previous.totalCollected / previous.uniquePatients : 0;

    const currentConversion =
      current.uniquePatients > 0 ? current.newPatients / current.uniquePatients : 0;
    const previousConversion =
      previous.uniquePatients > 0 ? previous.newPatients / previous.uniquePatients : 0;

    return {
      currentPeriod: current,
      previousPeriod: previous,
      revenueGrowth: calculateGrowth(current.totalCollected, previous.totalCollected),
      caseGrowth: calculateGrowth(current.totalCases, previous.totalCases),
      ltvGrowth: calculateGrowth(currentLtv, previousLtv),
      conversionGrowth: calculateGrowth(currentConversion, previousConversion),
    };
  }

  /**
   * @inheritdoc
   */
  async getYoYComparisonRange(
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
  > {
    logger.debug({ clinicId, startMonth, monthCount }, 'Fetching YoY comparison range');

    const results: {
      month: Date;
      currentPeriod: PeriodCaseStats;
      previousPeriod: PeriodCaseStats | null;
      revenueGrowth: number | null;
      caseGrowth: number | null;
    }[] = [];

    // Build all periods needed
    const allPeriods: { start: Date; end: Date; monthKey: string; isYoY: boolean }[] = [];
    const currentDate = getMonthStart(startMonth);

    for (let i = 0; i < monthCount; i++) {
      const monthStart = new Date(currentDate);
      monthStart.setMonth(monthStart.getMonth() + i);
      const monthEnd = getMonthEnd(monthStart);
      const monthKey = formatMonth(monthStart);

      allPeriods.push({ start: monthStart, end: monthEnd, monthKey, isYoY: false });

      // Add YoY comparison period
      const yoyStart = new Date(monthStart);
      yoyStart.setFullYear(yoyStart.getFullYear() - 1);
      const yoyEnd = getMonthEnd(yoyStart);

      allPeriods.push({ start: yoyStart, end: yoyEnd, monthKey, isYoY: true });
    }

    // Fetch all stats in one query
    const stats = await this.getMultiPeriodStats(
      clinicId,
      allPeriods.map((p) => ({ start: p.start, end: p.end }))
    );

    // Group by month
    for (let i = 0; i < monthCount; i++) {
      const currentIdx = i * 2;
      const yoyIdx = i * 2 + 1;
      const periodInfo = allPeriods[currentIdx];
      if (!periodInfo) continue;

      const current =
        stats[currentIdx] ?? this.getEmptyPeriodStats(periodInfo.start, periodInfo.end);
      const previous = stats[yoyIdx] ?? null;

      results.push({
        month: periodInfo.start,
        currentPeriod: current,
        previousPeriod: previous,
        revenueGrowth: previous
          ? calculateGrowth(current.totalCollected, previous.totalCollected)
          : null,
        caseGrowth: previous ? calculateGrowth(current.totalCases, previous.totalCases) : null,
      });
    }

    return results;
  }

  // ===========================================================================
  // MONTH-OVER-MONTH COMPARISON
  // ===========================================================================

  /**
   * @inheritdoc
   */
  async getMoMComparison(
    clinicId: string,
    month: Date
  ): Promise<{
    currentPeriod: PeriodCaseStats;
    previousPeriod: PeriodCaseStats;
    revenueGrowth: number;
    caseGrowth: number;
    ltvGrowth: number;
    conversionGrowth: number;
  }> {
    const currentStart = getMonthStart(month);
    const currentEnd = getMonthEnd(month);

    const previousStart = new Date(currentStart);
    previousStart.setMonth(previousStart.getMonth() - 1);
    const previousEnd = getMonthEnd(previousStart);

    const stats = await this.getMultiPeriodStats(clinicId, [
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd },
    ]);

    const current = stats[0] ?? this.getEmptyPeriodStats(currentStart, currentEnd);
    const previous = stats[1] ?? this.getEmptyPeriodStats(previousStart, previousEnd);

    const currentLtv =
      current.uniquePatients > 0 ? current.totalCollected / current.uniquePatients : 0;
    const previousLtv =
      previous.uniquePatients > 0 ? previous.totalCollected / previous.uniquePatients : 0;

    const currentConversion =
      current.uniquePatients > 0 ? current.newPatients / current.uniquePatients : 0;
    const previousConversion =
      previous.uniquePatients > 0 ? previous.newPatients / previous.uniquePatients : 0;

    return {
      currentPeriod: current,
      previousPeriod: previous,
      revenueGrowth: calculateGrowth(current.totalCollected, previous.totalCollected),
      caseGrowth: calculateGrowth(current.totalCases, previous.totalCases),
      ltvGrowth: calculateGrowth(currentLtv, previousLtv),
      conversionGrowth: calculateGrowth(currentConversion, previousConversion),
    };
  }

  /**
   * @inheritdoc
   */
  async getMoMComparisonRange(
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
  > {
    logger.debug({ clinicId, startMonth, monthCount }, 'Fetching MoM comparison range');

    // Build all periods needed (current + one more for previous of first)
    const allPeriods: { start: Date; end: Date }[] = [];
    const currentDate = getMonthStart(startMonth);

    // Add one extra month at the beginning for comparison
    const extraMonth = new Date(currentDate);
    extraMonth.setMonth(extraMonth.getMonth() - 1);
    allPeriods.push({ start: extraMonth, end: getMonthEnd(extraMonth) });

    for (let i = 0; i < monthCount; i++) {
      const monthStart = new Date(currentDate);
      monthStart.setMonth(monthStart.getMonth() + i);
      allPeriods.push({ start: monthStart, end: getMonthEnd(monthStart) });
    }

    // Fetch all stats
    const stats = await this.getMultiPeriodStats(clinicId, allPeriods);

    // Build results with MoM comparison
    const results: {
      month: Date;
      currentPeriod: PeriodCaseStats;
      previousPeriod: PeriodCaseStats | null;
      revenueGrowth: number | null;
      caseGrowth: number | null;
    }[] = [];

    for (let i = 1; i <= monthCount; i++) {
      const periodInfo = allPeriods[i];
      if (!periodInfo) continue;

      const current = stats[i] ?? this.getEmptyPeriodStats(periodInfo.start, periodInfo.end);
      const previous = stats[i - 1] ?? null;

      results.push({
        month: periodInfo.start,
        currentPeriod: current,
        previousPeriod: previous,
        revenueGrowth: previous
          ? calculateGrowth(current.totalCollected, previous.totalCollected)
          : null,
        caseGrowth: previous ? calculateGrowth(current.totalCases, previous.totalCases) : null,
      });
    }

    return results;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Calculate simple linear regression slope for trend direction
   */
  private calculateTrendSlope(values: number[]): number | null {
    if (values.length < 2) return null;

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const value = values[i] ?? 0;
      sumX += i;
      sumY += value;
      sumXY += i * value;
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Create empty period stats for a given date range
   */
  private getEmptyPeriodStats(startDate: Date, endDate: Date): PeriodCaseStats {
    return {
      period: formatMonth(startDate),
      periodStart: startDate,
      periodEnd: endDate,
      totalCases: 0,
      completedCases: 0,
      totalValue: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      uniquePatients: 0,
      newPatients: 0,
      returningPatients: 0,
      highValueCases: 0,
      avgCaseValue: 0,
      avgDaysToPayment: null,
      collectionRate: null,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a Case Repository
 *
 * @param config - Repository configuration
 * @returns Configured CaseRepository instance
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { createCaseRepository } from '@medicalcor/infrastructure';
 *
 * const pool = new Pool({ connectionString: DATABASE_URL });
 * const repository = createCaseRepository({ pool });
 * ```
 */
export function createCaseRepository(config: CaseRepositoryConfig): CaseRepository {
  return new CaseRepository(config);
}
