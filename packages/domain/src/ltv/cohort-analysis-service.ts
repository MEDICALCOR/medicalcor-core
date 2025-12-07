/**
 * @fileoverview Cohort LTV Analysis Service
 *
 * M7 Milestone: Service for analyzing customer lifetime value by acquisition cohort.
 * Provides cohort comparison, evolution tracking, and trend analysis.
 *
 * @module domain/ltv/cohort-analysis-service
 */

import type {
  CohortLTVSummary,
  CohortLTVEvolutionPoint,
  CohortComparison,
  CohortQueryOptions,
} from '../cases/repositories/CaseRepository.js';

// ============================================================================
// COHORT ANALYSIS TYPES
// ============================================================================

/**
 * Cohort dashboard summary
 */
export interface CohortDashboardSummary {
  /** Total cohorts analyzed */
  totalCohorts: number;
  /** Total leads across all cohorts */
  totalLeads: number;
  /** Overall average LTV */
  overallAvgLtv: number;
  /** Overall conversion rate */
  overallConversionRate: number;
  /** Best performing cohort month */
  bestCohortMonth: Date | null;
  /** Best cohort's LTV */
  bestCohortLtv: number | null;
  /** Average LTV trend (positive = improving) */
  ltvTrend: number | null;
}

/**
 * Cohort LTV dashboard response
 */
export interface CohortLTVDashboard {
  /** Summary cohorts (aggregate, no source/channel breakdown) */
  cohorts: CohortComparison[];
  /** Optional breakdown by acquisition source */
  sourceBreakdown?: CohortLTVSummary[];
  /** Overall statistics */
  summary: CohortDashboardSummary;
  /** Metadata */
  metadata: {
    startMonth: Date | null;
    endMonth: Date | null;
    lastRefreshed?: Date;
  };
}

/**
 * Cohort evolution with metadata
 */
export interface CohortEvolution {
  /** Cohort acquisition month */
  cohortMonth: Date;
  /** Size of the cohort */
  cohortSize: number;
  /** Evolution data points by month */
  dataPoints: CohortLTVEvolutionPoint[];
  /** Total LTV at current point */
  currentLtv: number | null;
  /** Months since acquisition */
  cohortAgeMonths: number;
}

/**
 * Cohort payback analysis
 */
export interface CohortPaybackAnalysis {
  cohortMonth: Date;
  cohortSize: number;
  estimatedCac?: number;
  paybackMonth: number | null;
  ltvAt3Months: number | null;
  ltvAt6Months: number | null;
  ltvAt12Months: number | null;
  ltvAt24Months: number | null;
  ltvCacRatio: number | null;
  isProfitable: boolean | null;
}

/**
 * Cohort segment distribution
 */
export interface CohortSegmentDistribution {
  cohortMonth: Date;
  segmentName: string;
  minLtv: number;
  maxLtv: number | null;
  customerCount: number;
  totalRevenue: number;
  percentageOfCohort: number;
}

/**
 * Cohort analysis service configuration
 */
export interface CohortAnalysisConfig {
  /** Default number of cohorts to return */
  defaultCohortLimit?: number;
  /** LTV segment thresholds for cohort segment analysis */
  segmentThresholds?: number[];
  /** Segment names */
  segmentNames?: string[];
}

/**
 * Cohort analysis service dependencies
 */
export interface CohortAnalysisDeps {
  /** Get cohort LTV summaries */
  getCohortLTVSummaries: (
    clinicId: string,
    options?: CohortQueryOptions
  ) => Promise<CohortLTVSummary[]>;
  /** Get cohort comparisons */
  getCohortComparisons: (
    clinicId: string,
    options?: CohortQueryOptions
  ) => Promise<CohortComparison[]>;
  /** Get cohort LTV evolution */
  getCohortLTVEvolution: (
    clinicId: string,
    cohortMonth: Date,
    maxMonths?: number
  ) => Promise<CohortLTVEvolutionPoint[]>;
  /** Refresh materialized views */
  refreshCohortLTVViews: () => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_COHORT_LIMIT = 12;
const DEFAULT_SEGMENT_THRESHOLDS = [0, 5000, 15000, 30000, 50000];
const DEFAULT_SEGMENT_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

// ============================================================================
// COHORT ANALYSIS SERVICE
// ============================================================================

/**
 * Cohort LTV Analysis Service
 *
 * Provides cohort-based lifetime value analysis including:
 * - Cohort comparison by acquisition month
 * - LTV evolution tracking over time
 * - Payback period analysis
 * - Segment distribution by cohort
 */
export class CohortAnalysisService {
  private config: Required<CohortAnalysisConfig>;
  private deps: CohortAnalysisDeps | undefined;

  constructor(config?: CohortAnalysisConfig, deps?: CohortAnalysisDeps) {
    this.config = {
      defaultCohortLimit: config?.defaultCohortLimit ?? DEFAULT_COHORT_LIMIT,
      segmentThresholds: config?.segmentThresholds ?? [...DEFAULT_SEGMENT_THRESHOLDS],
      segmentNames: config?.segmentNames ?? [...DEFAULT_SEGMENT_NAMES],
    };
    this.deps = deps;
  }

  // ==========================================================================
  // COHORT DASHBOARD
  // ==========================================================================

  /**
   * Get cohort LTV dashboard data
   */
  async getCohortDashboard(
    clinicId: string,
    options?: CohortQueryOptions
  ): Promise<CohortLTVDashboard> {
    if (!this.deps) {
      throw new Error('Cohort analysis service dependencies not configured');
    }

    const queryOptions: CohortQueryOptions = {
      limit: options?.limit ?? this.config.defaultCohortLimit,
      ...options,
    };

    // Fetch cohort comparisons
    const cohorts = await this.deps.getCohortComparisons(clinicId, queryOptions);

    // Optionally fetch source/channel breakdown
    let sourceBreakdown: CohortLTVSummary[] | undefined;
    if (options?.includeBreakdown) {
      sourceBreakdown = await this.deps.getCohortLTVSummaries(clinicId, queryOptions);
    }

    // Calculate summary statistics
    const summary = this.calculateDashboardSummary(cohorts);

    return {
      cohorts,
      sourceBreakdown,
      summary,
      metadata: {
        startMonth: options?.startMonth ?? null,
        endMonth: options?.endMonth ?? null,
      },
    };
  }

  /**
   * Calculate dashboard summary from cohort data
   */
  calculateDashboardSummary(cohorts: CohortComparison[]): CohortDashboardSummary {
    if (cohorts.length === 0) {
      return {
        totalCohorts: 0,
        totalLeads: 0,
        overallAvgLtv: 0,
        overallConversionRate: 0,
        bestCohortMonth: null,
        bestCohortLtv: null,
        ltvTrend: null,
      };
    }

    const totalLeads = cohorts.reduce((sum, c) => sum + c.cohortSize, 0);
    const totalCollected = cohorts.reduce((sum, c) => sum + c.totalCollected, 0);
    const totalConverted = cohorts.reduce((sum, c) => sum + c.convertedLeads, 0);

    // Find best performing cohort by LTV
    const cohortWithLtv = cohorts.filter((c) => c.avgLtv !== null && c.avgLtv > 0);
    const bestCohort = cohortWithLtv.reduce<CohortComparison | null>(
      (best, c) => (!best || (c.avgLtv ?? 0) > (best.avgLtv ?? 0) ? c : best),
      null
    );

    // Calculate LTV trend (simple linear regression slope)
    const ltvTrend = this.calculateLtvTrend(cohorts);

    return {
      totalCohorts: cohorts.length,
      totalLeads,
      overallAvgLtv: totalLeads > 0 ? Math.round(totalCollected / totalLeads) : 0,
      overallConversionRate:
        totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 1000) / 10 : 0,
      bestCohortMonth: bestCohort?.cohortMonth ?? null,
      bestCohortLtv: bestCohort?.avgLtv ?? null,
      ltvTrend,
    };
  }

  /**
   * Calculate LTV trend across cohorts
   * Returns the average month-over-month change in LTV
   */
  calculateLtvTrend(cohorts: CohortComparison[]): number | null {
    const validGrowthRates = cohorts
      .filter((c) => c.ltvGrowthVsPrev !== null)
      .map((c) => c.ltvGrowthVsPrev!);

    if (validGrowthRates.length === 0) {
      return null;
    }

    const avgGrowth = validGrowthRates.reduce((sum, r) => sum + r, 0) / validGrowthRates.length;
    return Math.round(avgGrowth * 10) / 10;
  }

  // ==========================================================================
  // COHORT EVOLUTION
  // ==========================================================================

  /**
   * Get LTV evolution for a specific cohort
   */
  async getCohortEvolution(
    clinicId: string,
    cohortMonth: Date,
    maxMonths = 24
  ): Promise<CohortEvolution> {
    if (!this.deps) {
      throw new Error('Cohort analysis service dependencies not configured');
    }

    const dataPoints = await this.deps.getCohortLTVEvolution(clinicId, cohortMonth, maxMonths);

    if (dataPoints.length === 0) {
      return {
        cohortMonth,
        cohortSize: 0,
        dataPoints: [],
        currentLtv: null,
        cohortAgeMonths: 0,
      };
    }

    const cohortSize = dataPoints[0]?.cohortSize ?? 0;
    const lastPoint = dataPoints[dataPoints.length - 1];
    const currentLtv = lastPoint?.cumulativeLtvPerLead ?? null;
    const cohortAgeMonths = lastPoint?.monthsSinceAcquisition ?? 0;

    return {
      cohortMonth,
      cohortSize,
      dataPoints,
      currentLtv,
      cohortAgeMonths,
    };
  }

  /**
   * Compare evolution curves for multiple cohorts
   */
  async compareCohortEvolutions(
    clinicId: string,
    cohortMonths: Date[],
    maxMonths = 24
  ): Promise<CohortEvolution[]> {
    const evolutions = await Promise.all(
      cohortMonths.map((month) => this.getCohortEvolution(clinicId, month, maxMonths))
    );

    return evolutions;
  }

  // ==========================================================================
  // PAYBACK ANALYSIS
  // ==========================================================================

  /**
   * Calculate payback analysis for a cohort
   */
  calculatePaybackAnalysis(
    evolution: CohortEvolution,
    estimatedCac?: number
  ): CohortPaybackAnalysis {
    const { cohortMonth, cohortSize, dataPoints } = evolution;

    // Extract LTV at specific milestones
    const findLtvAtMonth = (month: number): number | null => {
      const point = dataPoints.find((p) => p.monthsSinceAcquisition === month);
      return point?.cumulativeLtvPerLead ?? null;
    };

    const ltvAt3Months = findLtvAtMonth(3);
    const ltvAt6Months = findLtvAtMonth(6);
    const ltvAt12Months = findLtvAtMonth(12);
    const ltvAt24Months = findLtvAtMonth(24);

    // Calculate payback month (when cumulative LTV exceeds CAC)
    let paybackMonth: number | null = null;
    let ltvCacRatio: number | null = null;
    let isProfitable: boolean | null = null;

    if (estimatedCac !== undefined && estimatedCac > 0) {
      for (const point of dataPoints) {
        if (point.cumulativeLtvPerLead !== null && point.cumulativeLtvPerLead >= estimatedCac) {
          paybackMonth = point.monthsSinceAcquisition;
          break;
        }
      }

      const currentLtv = evolution.currentLtv ?? 0;
      ltvCacRatio = Math.round((currentLtv / estimatedCac) * 100) / 100;
      isProfitable = currentLtv > estimatedCac;
    }

    return {
      cohortMonth,
      cohortSize,
      estimatedCac,
      paybackMonth,
      ltvAt3Months,
      ltvAt6Months,
      ltvAt12Months,
      ltvAt24Months,
      ltvCacRatio,
      isProfitable,
    };
  }

  // ==========================================================================
  // SEGMENT ANALYSIS
  // ==========================================================================

  /**
   * Calculate segment distribution for cohort members
   * Note: This requires per-lead LTV data which should come from the repository
   */
  calculateCohortSegments(
    cohortMonth: Date,
    leadLtvs: { leadId: string; totalPaid: number }[]
  ): CohortSegmentDistribution[] {
    const thresholds = this.config.segmentThresholds;
    const names = this.config.segmentNames;
    const cohortSize = leadLtvs.length;

    if (cohortSize === 0) {
      return thresholds.map((minLtv, i) => ({
        cohortMonth,
        segmentName: names[i] ?? `Tier ${i + 1}`,
        minLtv,
        maxLtv: thresholds[i + 1] ?? null,
        customerCount: 0,
        totalRevenue: 0,
        percentageOfCohort: 0,
      }));
    }

    return thresholds.map((minLtv, i) => {
      const maxLtv = thresholds[i + 1] ?? null;
      const segmentLeads = leadLtvs.filter((lead) => {
        if (maxLtv === null) return lead.totalPaid >= minLtv;
        return lead.totalPaid >= minLtv && lead.totalPaid < maxLtv;
      });

      return {
        cohortMonth,
        segmentName: names[i] ?? `Tier ${i + 1}`,
        minLtv,
        maxLtv,
        customerCount: segmentLeads.length,
        totalRevenue: segmentLeads.reduce((sum, l) => sum + l.totalPaid, 0),
        percentageOfCohort:
          cohortSize > 0 ? Math.round((segmentLeads.length / cohortSize) * 1000) / 10 : 0,
      };
    });
  }

  // ==========================================================================
  // COHORT HEALTH METRICS
  // ==========================================================================

  /**
   * Calculate cohort health score (0-100)
   * Based on conversion rate, collection rate, and LTV growth
   */
  calculateCohortHealthScore(cohort: CohortComparison): number {
    let score = 0;
    let factors = 0;

    // Conversion rate factor (0-30 points)
    if (cohort.conversionRate !== null) {
      // Assume 20% is "good" conversion
      score += Math.min(30, (cohort.conversionRate / 20) * 30);
      factors++;
    }

    // Collection rate factor (0-30 points)
    if (cohort.collectionRate !== null) {
      // Assume 80% is "good" collection
      score += Math.min(30, (cohort.collectionRate / 80) * 30);
      factors++;
    }

    // LTV growth factor (0-20 points)
    if (cohort.ltvGrowthVsPrev !== null) {
      // Positive growth is good, negative is bad
      const growthScore = Math.min(20, Math.max(0, (cohort.ltvGrowthVsPrev + 10) * 2));
      score += growthScore;
      factors++;
    }

    // Size factor (0-20 points) - larger cohorts are more reliable
    if (cohort.cohortSize >= 100) {
      score += 20;
    } else if (cohort.cohortSize >= 50) {
      score += 15;
    } else if (cohort.cohortSize >= 20) {
      score += 10;
    } else if (cohort.cohortSize >= 10) {
      score += 5;
    }
    factors++;

    return factors > 0 ? Math.round(score) : 0;
  }

  // ==========================================================================
  // VIEW MANAGEMENT
  // ==========================================================================

  /**
   * Refresh cohort LTV materialized views
   */
  async refreshViews(): Promise<void> {
    if (!this.deps) {
      throw new Error('Cohort analysis service dependencies not configured');
    }

    await this.deps.refreshCohortLTVViews();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a cohort analysis service instance
 */
export function createCohortAnalysisService(
  config?: CohortAnalysisConfig,
  deps?: CohortAnalysisDeps
): CohortAnalysisService {
  return new CohortAnalysisService(config, deps);
}
