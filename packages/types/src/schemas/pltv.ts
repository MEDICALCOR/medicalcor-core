/**
 * pLTV (Predicted Lifetime Value) Schemas (M2 Milestone)
 *
 * ML-powered prediction of future patient lifetime value based on lead attributes.
 * Uses a monetary scale (EUR) for predicted future value with confidence intervals.
 *
 * PREDICTION FACTORS:
 * - Historical LTV: Past payment behavior as baseline
 * - Case Completion Rate: Treatment follow-through indicator
 * - Payment Reliability: On-time payment history
 * - Engagement Level: Treatment frequency and recency
 * - Procedure Interest: High-value procedure indicators
 * - Retention Score: Churn risk impacts future value
 * - Demographics: Location and referral source factors
 */
import { z } from 'zod';

import { UUIDSchema, TimestampSchema } from './common.js';

// =============================================================================
// pLTV Classification
// =============================================================================

/**
 * pLTV tier classification based on predicted future value
 * - DIAMOND: Expected pLTV > 50,000 EUR (top 5%)
 * - PLATINUM: Expected pLTV 30,000-50,000 EUR
 * - GOLD: Expected pLTV 15,000-30,000 EUR
 * - SILVER: Expected pLTV 5,000-15,000 EUR
 * - BRONZE: Expected pLTV < 5,000 EUR
 */
export const PLTVTierSchema = z.enum(['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE']);

/**
 * pLTV growth potential classification
 * - HIGH_GROWTH: Significant upside potential identified
 * - MODERATE_GROWTH: Some growth potential
 * - STABLE: Expected to maintain current value
 * - DECLINING: Risk of decreased future value
 */
export const PLTVGrowthPotentialSchema = z.enum([
  'HIGH_GROWTH',
  'MODERATE_GROWTH',
  'STABLE',
  'DECLINING',
]);

/**
 * Investment priority based on pLTV and growth potential
 * - PRIORITATE_MAXIMA: Maximum investment priority
 * - PRIORITATE_RIDICATA: High investment priority
 * - PRIORITATE_MEDIE: Medium investment priority
 * - PRIORITATE_SCAZUTA: Low investment priority
 */
export const PLTVInvestmentPrioritySchema = z.enum([
  'PRIORITATE_MAXIMA',
  'PRIORITATE_RIDICATA',
  'PRIORITATE_MEDIE',
  'PRIORITATE_SCAZUTA',
]);

// =============================================================================
// pLTV Input Metrics
// =============================================================================

/**
 * Historical LTV data for prediction input
 */
export const HistoricalLTVInputSchema = z.object({
  /** Total revenue collected from patient (EUR) */
  totalPaid: z.number().min(0),

  /** Total case value (including outstanding) */
  totalCaseValue: z.number().min(0),

  /** Outstanding balance */
  totalOutstanding: z.number().min(0),

  /** Number of completed cases */
  completedCases: z.number().int().min(0),

  /** Total number of cases */
  totalCases: z.number().int().min(0),

  /** Average case value */
  avgCaseValue: z.number().min(0),

  /** Days since first case */
  daysSinceFirstCase: z.number().int().min(0).nullable(),

  /** Days since last case */
  daysSinceLastCase: z.number().int().min(0).nullable(),
});

/**
 * Payment behavior metrics
 */
export const PaymentBehaviorInputSchema = z.object({
  /** Percentage of on-time payments (0-100) */
  onTimePaymentRate: z.number().min(0).max(100),

  /** Number of payment plans used */
  paymentPlansUsed: z.number().int().min(0),

  /** Average days to full payment */
  avgDaysToPayment: z.number().min(0).nullable(),

  /** Number of missed/late payments */
  missedPayments: z.number().int().min(0),

  /** Preferred payment method */
  preferredPaymentMethod: z.enum(['cash', 'card', 'transfer', 'financing', 'unknown']).optional(),
});

/**
 * Engagement metrics for prediction
 */
export const EngagementMetricsInputSchema = z.object({
  /** Total number of appointments */
  totalAppointments: z.number().int().min(0),

  /** Number of kept appointments */
  keptAppointments: z.number().int().min(0),

  /** Number of canceled appointments */
  canceledAppointments: z.number().int().min(0),

  /** Number of no-shows */
  noShows: z.number().int().min(0),

  /** Days since last contact */
  daysSinceLastContact: z.number().int().min(0),

  /** Number of referrals made */
  referralsMade: z.number().int().min(0),

  /** Has provided NPS feedback */
  hasNPSFeedback: z.boolean(),

  /** NPS score if available (0-10) */
  npsScore: z.number().int().min(0).max(10).nullable(),
});

/**
 * Procedure interest indicators
 */
export const ProcedureInterestInputSchema = z.object({
  /** Interest in All-on-X (highest value) */
  allOnXInterest: z.boolean(),

  /** Interest in implants */
  implantInterest: z.boolean(),

  /** Interest in full-mouth reconstruction */
  fullMouthInterest: z.boolean(),

  /** Interest in cosmetic procedures */
  cosmeticInterest: z.boolean(),

  /** Number of high-value procedures completed */
  highValueProceduresCompleted: z.number().int().min(0),

  /** Expressed procedures of interest */
  expressedInterests: z.array(z.string()).optional(),
});

/**
 * Complete pLTV prediction input
 */
export const PLTVPredictionInputSchema = z.object({
  /** Lead/Patient ID */
  leadId: UUIDSchema,

  /** Clinic ID */
  clinicId: UUIDSchema,

  /** Historical LTV data */
  historical: HistoricalLTVInputSchema,

  /** Payment behavior */
  paymentBehavior: PaymentBehaviorInputSchema,

  /** Engagement metrics */
  engagement: EngagementMetricsInputSchema,

  /** Procedure interests */
  procedureInterest: ProcedureInterestInputSchema,

  /** Current retention score (0-100) if available */
  retentionScore: z.number().min(0).max(100).nullable(),

  /** Lead source for demographic factor */
  leadSource: z
    .enum(['whatsapp', 'voice', 'web', 'hubspot', 'referral', 'facebook', 'google'])
    .optional(),

  /** Patient location tier */
  locationTier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
});

// =============================================================================
// pLTV Score Output
// =============================================================================

/**
 * Confidence interval for pLTV prediction
 */
export const PLTVConfidenceIntervalSchema = z.object({
  /** Lower bound of prediction (EUR) */
  lower: z.number(),

  /** Upper bound of prediction (EUR) */
  upper: z.number(),

  /** Confidence level (e.g., 0.95 for 95% CI) */
  level: z.number().min(0).max(1),
});

/**
 * Factor contribution breakdown
 */
export const PLTVFactorBreakdownSchema = z.object({
  /** Base prediction from historical LTV */
  historicalBaseline: z.number(),

  /** Adjustment from payment reliability */
  paymentReliabilityAdjustment: z.number(),

  /** Adjustment from engagement level */
  engagementAdjustment: z.number(),

  /** Adjustment from procedure interest */
  procedureInterestAdjustment: z.number(),

  /** Adjustment from retention score */
  retentionAdjustment: z.number(),

  /** Adjustment from tenure/recency */
  tenureAdjustment: z.number(),

  /** Growth potential multiplier applied */
  growthMultiplier: z.number(),

  /** Final predicted value */
  predictedValue: z.number(),
});

/**
 * Core pLTV score result
 */
export const PLTVScoreResultSchema = z.object({
  /** Predicted lifetime value in EUR */
  predictedLTV: z.number(),

  /** pLTV tier classification */
  tier: PLTVTierSchema,

  /** Growth potential classification */
  growthPotential: PLTVGrowthPotentialSchema,

  /** Investment priority */
  investmentPriority: PLTVInvestmentPrioritySchema,

  /** Prediction confidence (0-1) */
  confidence: z.number().min(0).max(1),

  /** Confidence interval */
  confidenceInterval: PLTVConfidenceIntervalSchema,
});

/**
 * Full pLTV scoring output with breakdown
 */
export const PLTVScoringOutputSchema = PLTVScoreResultSchema.extend({
  /** Lead/Patient ID */
  leadId: UUIDSchema,

  /** Detailed factor breakdown */
  breakdown: PLTVFactorBreakdownSchema,

  /** Human-readable reasoning */
  reasoning: z.string(),

  /** Recommended investment actions */
  recommendedActions: z.array(z.string()),

  /** Model version used */
  modelVersion: z.string(),

  /** Prediction method */
  method: z.enum(['ml', 'rule_based', 'hybrid']),

  /** Timestamp of calculation */
  calculatedAt: TimestampSchema,
});

// =============================================================================
// pLTV Request/Response
// =============================================================================

/**
 * Request to calculate pLTV for a single patient
 */
export const ScorePatientPLTVRequestSchema = z.object({
  /** Lead/Patient ID */
  leadId: UUIDSchema,

  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Force recalculation even if recently scored */
  forceRecalculate: z.boolean().default(false),

  /** Include full factor breakdown */
  includeBreakdown: z.boolean().default(true),
});

/**
 * Batch pLTV scoring request
 */
export const BatchPLTVScoringRequestSchema = z.object({
  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Optional clinic ID filter */
  clinicId: UUIDSchema.optional(),

  /** Optional limit */
  limit: z.number().int().positive().optional(),

  /** Only score leads without recent pLTV */
  onlyStale: z.boolean().default(true),

  /** Staleness threshold in days */
  stalenessThresholdDays: z.number().int().positive().default(7),
});

/**
 * pLTV scoring response for a single patient
 */
export const PLTVScoringResponseSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Lead/Patient ID */
  leadId: UUIDSchema,

  /** pLTV score result */
  result: PLTVScoringOutputSchema.optional(),

  /** Error message if failed */
  error: z.string().optional(),
});

/**
 * Batch scoring summary
 */
export const BatchPLTVScoringResultSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Total patients processed */
  totalPatients: z.number().int().min(0),

  /** Successfully scored count */
  scored: z.number().int().min(0),

  /** High-value patients identified */
  highValueCount: z.number().int().min(0),

  /** Total predicted value across all scored */
  totalPredictedValue: z.number(),

  /** Errors encountered */
  errors: z.array(z.string()),

  /** Processing duration in ms */
  durationMs: z.number().optional(),
});

// =============================================================================
// pLTV Events
// =============================================================================

/**
 * Event emitted when a high-value patient is identified
 */
export const HighValuePatientIdentifiedEventSchema = z.object({
  type: z.literal('pltv.high_value_patient_identified'),
  leadId: UUIDSchema,
  clinicId: UUIDSchema,
  predictedLTV: z.number(),
  tier: PLTVTierSchema,
  growthPotential: PLTVGrowthPotentialSchema,
  confidence: z.number(),
  patientName: z.string().optional(),
  phone: z.string().optional(),
  timestamp: TimestampSchema,
});

/**
 * Event emitted when pLTV is calculated
 */
export const PLTVScoredEventSchema = z.object({
  type: z.literal('pltv.scored'),
  leadId: UUIDSchema,
  clinicId: UUIDSchema,
  predictedLTV: z.number(),
  previousPLTV: z.number().optional(),
  tier: PLTVTierSchema,
  confidence: z.number(),
  method: z.enum(['ml', 'rule_based', 'hybrid']),
  timestamp: TimestampSchema,
});

/**
 * Event emitted when pLTV changes significantly
 */
export const PLTVChangedEventSchema = z.object({
  type: z.literal('pltv.changed'),
  leadId: UUIDSchema,
  clinicId: UUIDSchema,
  previousPLTV: z.number(),
  newPLTV: z.number(),
  previousTier: PLTVTierSchema,
  newTier: PLTVTierSchema,
  changePercentage: z.number(),
  changeReason: z.string(),
  timestamp: TimestampSchema,
});

/**
 * Event emitted when batch pLTV scoring completes
 */
export const BatchPLTVScoringCompletedEventSchema = z.object({
  type: z.literal('pltv.batch_scoring_completed'),
  clinicId: UUIDSchema.optional(),
  totalPatients: z.number().int().min(0),
  scored: z.number().int().min(0),
  highValueCount: z.number().int().min(0),
  totalPredictedValue: z.number(),
  errors: z.number().int().min(0),
  timestamp: TimestampSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type PLTVTier = z.infer<typeof PLTVTierSchema>;
export type PLTVGrowthPotential = z.infer<typeof PLTVGrowthPotentialSchema>;
export type PLTVInvestmentPriority = z.infer<typeof PLTVInvestmentPrioritySchema>;
export type HistoricalLTVInput = z.infer<typeof HistoricalLTVInputSchema>;
export type PaymentBehaviorInput = z.infer<typeof PaymentBehaviorInputSchema>;
export type EngagementMetricsInput = z.infer<typeof EngagementMetricsInputSchema>;
export type ProcedureInterestInput = z.infer<typeof ProcedureInterestInputSchema>;
export type PLTVPredictionInput = z.infer<typeof PLTVPredictionInputSchema>;
export type PLTVConfidenceInterval = z.infer<typeof PLTVConfidenceIntervalSchema>;
export type PLTVFactorBreakdown = z.infer<typeof PLTVFactorBreakdownSchema>;
export type PLTVScoreResult = z.infer<typeof PLTVScoreResultSchema>;
export type PLTVScoringOutput = z.infer<typeof PLTVScoringOutputSchema>;
export type ScorePatientPLTVRequest = z.infer<typeof ScorePatientPLTVRequestSchema>;
export type BatchPLTVScoringRequest = z.infer<typeof BatchPLTVScoringRequestSchema>;
export type PLTVScoringResponse = z.infer<typeof PLTVScoringResponseSchema>;
export type BatchPLTVScoringResult = z.infer<typeof BatchPLTVScoringResultSchema>;
export type HighValuePatientIdentifiedEvent = z.infer<typeof HighValuePatientIdentifiedEventSchema>;
export type PLTVScoredEvent = z.infer<typeof PLTVScoredEventSchema>;
export type PLTVChangedEvent = z.infer<typeof PLTVChangedEventSchema>;
export type BatchPLTVScoringCompletedEvent = z.infer<typeof BatchPLTVScoringCompletedEventSchema>;
