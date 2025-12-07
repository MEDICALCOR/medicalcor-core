/**
 * @fileoverview Cohort LTV (Lifetime Value) Analysis Schemas
 *
 * M7 Milestone: Zod schemas for cohort-based lifetime value tracking
 * Enables analysis of customer value by acquisition month cohort.
 *
 * @module types/schemas/cohort-ltv
 */

import { z } from 'zod';
import { UUIDSchema, TimestampSchema } from './common.js';

// =============================================================================
// COHORT LTV MONTHLY SUMMARY
// =============================================================================

/**
 * Schema for monthly cohort LTV metrics
 * Represents aggregated LTV data for leads acquired in a specific month
 */
export const CohortLTVMonthlySummarySchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,
  /** Cohort acquisition month (first day of month) */
  cohortMonth: TimestampSchema,
  /** Lead acquisition source (optional, null for aggregate) */
  acquisitionSource: z.string().nullable(),
  /** Lead acquisition channel (optional, null for aggregate) */
  acquisitionChannel: z.string().nullable(),
  /** Total number of leads in cohort */
  cohortSize: z.number().int().nonnegative(),
  /** Number of leads that converted to customers */
  convertedLeads: z.number().int().nonnegative(),
  /** Conversion rate percentage (0-100) */
  conversionRate: z.number().nonnegative().nullable(),
  /** Total revenue generated (case values) */
  totalRevenue: z.number().nonnegative(),
  /** Total amount collected (payments received) */
  totalCollected: z.number().nonnegative(),
  /** Total outstanding balance */
  totalOutstanding: z.number().nonnegative(),
  /** Average LTV across all leads in cohort */
  avgLtv: z.number().nonnegative().nullable(),
  /** Average LTV for converted leads only */
  avgLtvConverted: z.number().nonnegative().nullable(),
  /** Total number of cases created */
  totalCases: z.number().int().nonnegative(),
  /** Number of completed cases */
  completedCases: z.number().int().nonnegative(),
  /** Average cases per converted customer */
  avgCasesPerCustomer: z.number().nonnegative().nullable(),
  /** Average days from lead creation to first case */
  avgDaysToFirstCase: z.number().nonnegative().nullable(),
  /** Maximum months a customer has been active */
  maxMonthsActive: z.number().int().nonnegative().nullable(),
  /** Collection rate percentage (paid/total) */
  collectionRate: z.number().nonnegative().nullable(),
});

export type CohortLTVMonthlySummary = z.infer<typeof CohortLTVMonthlySummarySchema>;

// =============================================================================
// COHORT LTV EVOLUTION
// =============================================================================

/**
 * Schema for cohort LTV evolution over time
 * Tracks how revenue accumulates month-by-month after acquisition
 */
export const CohortLTVEvolutionPointSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,
  /** Cohort acquisition month */
  cohortMonth: TimestampSchema,
  /** Months since cohort acquisition (0 = acquisition month) */
  monthsSinceAcquisition: z.number().int().nonnegative(),
  /** Size of the cohort */
  cohortSize: z.number().int().positive(),
  /** Revenue generated in this period */
  periodRevenue: z.number(),
  /** Number of customers who paid in this period */
  payingCustomers: z.number().int().nonnegative(),
  /** Cumulative revenue up to this point */
  cumulativeRevenue: z.number(),
  /** Cumulative LTV per lead up to this point */
  cumulativeLtvPerLead: z.number().nullable(),
  /** Percentage of cohort that paid in this period */
  payingPercentage: z.number().nonnegative().nullable(),
});

export type CohortLTVEvolutionPoint = z.infer<typeof CohortLTVEvolutionPointSchema>;

/**
 * Schema for complete cohort evolution curve
 */
export const CohortLTVEvolutionSchema = z.object({
  /** Cohort acquisition month */
  cohortMonth: TimestampSchema,
  /** Size of the cohort */
  cohortSize: z.number().int().positive(),
  /** Evolution data points by month */
  dataPoints: z.array(CohortLTVEvolutionPointSchema),
  /** Total LTV at current point */
  currentLtv: z.number().nullable(),
  /** Months since acquisition */
  cohortAgeMonths: z.number().int().nonnegative(),
});

export type CohortLTVEvolution = z.infer<typeof CohortLTVEvolutionSchema>;

// =============================================================================
// COHORT COMPARISON
// =============================================================================

/**
 * Schema for cohort comparison with growth metrics
 */
export const CohortComparisonSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,
  /** Cohort acquisition month */
  cohortMonth: TimestampSchema,
  /** Cohort size */
  cohortSize: z.number().int().nonnegative(),
  /** Converted leads */
  convertedLeads: z.number().int().nonnegative(),
  /** Conversion rate percentage */
  conversionRate: z.number().nonnegative().nullable(),
  /** Total collected revenue */
  totalCollected: z.number().nonnegative(),
  /** Average LTV */
  avgLtv: z.number().nonnegative().nullable(),
  /** Average LTV for converted customers */
  avgLtvConverted: z.number().nonnegative().nullable(),
  /** Collection rate percentage */
  collectionRate: z.number().nonnegative().nullable(),
  /** Average days to first case */
  avgDaysToFirstCase: z.number().nonnegative().nullable(),
  /** Previous cohort's average LTV (for comparison) */
  prevCohortAvgLtv: z.number().nullable(),
  /** LTV growth vs previous cohort (percentage) */
  ltvGrowthVsPrev: z.number().nullable(),
  /** Same month last year's average LTV */
  yoyCohortAvgLtv: z.number().nullable(),
  /** Year-over-year LTV growth (percentage) */
  ltvGrowthYoy: z.number().nullable(),
});

export type CohortComparison = z.infer<typeof CohortComparisonSchema>;

// =============================================================================
// QUERY PARAMETERS
// =============================================================================

/**
 * Schema for cohort LTV query parameters
 */
export const CohortLTVQuerySchema = z.object({
  /** Filter by clinic */
  clinicId: UUIDSchema,
  /** Start month for date range filter (inclusive) */
  startMonth: z.coerce.date().optional(),
  /** End month for date range filter (inclusive) */
  endMonth: z.coerce.date().optional(),
  /** Filter by acquisition source */
  acquisitionSource: z.string().optional(),
  /** Filter by acquisition channel */
  acquisitionChannel: z.string().optional(),
  /** Limit number of cohorts returned */
  limit: z.coerce.number().int().min(1).max(100).default(12),
  /** Include source/channel breakdown */
  includeBreakdown: z.boolean().default(false),
});

export type CohortLTVQuery = z.infer<typeof CohortLTVQuerySchema>;

/**
 * Schema for cohort evolution query
 */
export const CohortEvolutionQuerySchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,
  /** Specific cohort month to analyze */
  cohortMonth: z.coerce.date(),
  /** Maximum months to include in evolution (default: 24) */
  maxMonths: z.coerce.number().int().min(1).max(60).default(24),
});

export type CohortEvolutionQuery = z.infer<typeof CohortEvolutionQuerySchema>;

// =============================================================================
// RESPONSE SCHEMAS
// =============================================================================

/**
 * Schema for cohort LTV dashboard response
 */
export const CohortLTVDashboardSchema = z.object({
  /** Summary cohorts (aggregate, no source/channel breakdown) */
  cohorts: z.array(CohortComparisonSchema),
  /** Optional breakdown by acquisition source */
  sourceBreakdown: z.array(CohortLTVMonthlySummarySchema).optional(),
  /** Overall statistics */
  summary: z.object({
    /** Total cohorts analyzed */
    totalCohorts: z.number().int().nonnegative(),
    /** Total leads across all cohorts */
    totalLeads: z.number().int().nonnegative(),
    /** Overall average LTV */
    overallAvgLtv: z.number().nonnegative(),
    /** Overall conversion rate */
    overallConversionRate: z.number().nonnegative(),
    /** Best performing cohort month */
    bestCohortMonth: TimestampSchema.nullable(),
    /** Best cohort's LTV */
    bestCohortLtv: z.number().nonnegative().nullable(),
    /** Average LTV trend (positive = improving) */
    ltvTrend: z.number().nullable(),
  }),
  /** Metadata */
  metadata: z.object({
    /** Query date range start */
    startMonth: TimestampSchema.nullable(),
    /** Query date range end */
    endMonth: TimestampSchema.nullable(),
    /** Last refresh timestamp of materialized view */
    lastRefreshed: TimestampSchema.optional(),
  }),
});

export type CohortLTVDashboard = z.infer<typeof CohortLTVDashboardSchema>;

// =============================================================================
// COHORT SEGMENT ANALYSIS
// =============================================================================

/**
 * Schema for analyzing cohort performance by LTV segments
 */
export const CohortSegmentDistributionSchema = z.object({
  /** Cohort month */
  cohortMonth: TimestampSchema,
  /** LTV segment name (Bronze, Silver, Gold, Platinum, Diamond) */
  segmentName: z.string(),
  /** Minimum LTV threshold for segment */
  minLtv: z.number().nonnegative(),
  /** Maximum LTV threshold for segment (null for top tier) */
  maxLtv: z.number().nullable(),
  /** Number of customers in segment */
  customerCount: z.number().int().nonnegative(),
  /** Total revenue from segment */
  totalRevenue: z.number().nonnegative(),
  /** Percentage of cohort in this segment */
  percentageOfCohort: z.number().nonnegative(),
});

export type CohortSegmentDistribution = z.infer<typeof CohortSegmentDistributionSchema>;

// =============================================================================
// PAYBACK ANALYSIS
// =============================================================================

/**
 * Schema for cohort payback period analysis
 * Useful for understanding CAC payback
 */
export const CohortPaybackAnalysisSchema = z.object({
  /** Cohort month */
  cohortMonth: TimestampSchema,
  /** Cohort size */
  cohortSize: z.number().int().positive(),
  /** Estimated customer acquisition cost (if known) */
  estimatedCac: z.number().nonnegative().optional(),
  /** Month when cohort LTV exceeds CAC (null if not yet) */
  paybackMonth: z.number().int().nullable(),
  /** LTV at 3 months */
  ltvAt3Months: z.number().nullable(),
  /** LTV at 6 months */
  ltvAt6Months: z.number().nullable(),
  /** LTV at 12 months */
  ltvAt12Months: z.number().nullable(),
  /** LTV at 24 months */
  ltvAt24Months: z.number().nullable(),
  /** LTV/CAC ratio (if CAC known) */
  ltvCacRatio: z.number().nullable(),
  /** Is cohort profitable (LTV > CAC) */
  isProfitable: z.boolean().nullable(),
});

export type CohortPaybackAnalysis = z.infer<typeof CohortPaybackAnalysisSchema>;
