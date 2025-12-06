/**
 * Retention Scoring Schemas (M8 Milestone)
 *
 * Churn prediction and patient retention scoring schemas.
 * Uses a 0-100 scale for retention probability.
 *
 * SCORING FACTORS:
 * - Days Inactive: Activity recency (-40 max penalty)
 * - Canceled Appointments: Engagement indicator (-30 max penalty)
 * - NPS Score: Satisfaction indicator (-20 to +10)
 * - Treatment Engagement: Loyalty indicator (+10 max bonus)
 * - High-Value Bonus: LTV consideration (+5 bonus)
 */
import { z } from 'zod';

import { UUIDSchema, TimestampSchema } from './common.js';
import {
  ChurnRiskSchema,
  FollowUpPrioritySchema as HubSpotFollowUpPrioritySchema,
} from '../hubspot.schema.js';

// =============================================================================
// Churn Risk Classification
// =============================================================================

/**
 * Churn risk levels (Romanian naming convention for consistency)
 * Reuses the existing ChurnRiskSchema from hubspot.schema.ts
 * - SCAZUT: Low risk (score >= 80)
 * - MEDIU: Medium risk (score 50-79)
 * - RIDICAT: High risk (score 30-49)
 * - FOARTE_RIDICAT: Very high risk (score < 30)
 */
export const ChurnRiskLevelSchema = ChurnRiskSchema;

/**
 * Follow-up priority levels based on churn risk and patient value
 * Reuses the existing FollowUpPrioritySchema from hubspot.schema.ts
 * - URGENTA: Urgent - contact immediately
 * - RIDICATA: High - contact within 24h
 * - MEDIE: Medium - contact within 3 days
 * - SCAZUTA: Low - include in regular nurture
 */
export const FollowUpPrioritySchema = HubSpotFollowUpPrioritySchema;

/**
 * Retention score classification for business logic
 */
export const RetentionClassificationSchema = z.enum([
  'LOYAL', // Score >= 80 - Loyal patient
  'STABLE', // Score 60-79 - Stable, monitor
  'AT_RISK', // Score 40-59 - At risk of churn
  'CHURNING', // Score 20-39 - Actively churning
  'LOST', // Score < 20 - Likely lost
]);

// =============================================================================
// Retention Metrics Input
// =============================================================================

/**
 * Input metrics for retention score calculation
 */
export const RetentionMetricsInputSchema = z.object({
  /** Number of days since last patient activity */
  daysInactive: z.number().int().min(0),

  /** Number of canceled appointments in last 12 months */
  canceledAppointments: z.number().int().min(0),

  /** NPS score (0-10) if available */
  npsScore: z.number().int().min(0).max(10).nullable(),

  /** Customer lifetime value in EUR */
  lifetimeValue: z.number().min(0),

  /** Total number of completed treatments */
  totalTreatments: z.number().int().min(0),
});

/**
 * Extended metrics with optional fields for comprehensive analysis
 */
export const ExtendedRetentionMetricsSchema = RetentionMetricsInputSchema.extend({
  /** Last appointment date */
  lastAppointmentDate: z.coerce.date().nullable().optional(),

  /** Last treatment date */
  lastTreatmentDate: z.coerce.date().nullable().optional(),

  /** Number of no-shows in last 12 months */
  noShows: z.number().int().min(0).optional(),

  /** Number of complaints filed */
  complaints: z.number().int().min(0).optional(),

  /** Number of referrals made */
  referrals: z.number().int().min(0).optional(),

  /** Average satisfaction score (1-5) */
  avgSatisfactionScore: z.number().min(1).max(5).nullable().optional(),

  /** Payment history score (0-100) */
  paymentHistoryScore: z.number().min(0).max(100).optional(),
});

// =============================================================================
// Retention Score Output
// =============================================================================

/**
 * Core retention scoring result
 */
export const RetentionScoreResultSchema = z.object({
  /** Retention score (0-100) - probability of patient returning */
  score: z.number().min(0).max(100),

  /** Churn risk classification */
  churnRisk: ChurnRiskLevelSchema,

  /** Recommended follow-up priority */
  followUpPriority: FollowUpPrioritySchema,

  /** Business classification for retention status */
  classification: RetentionClassificationSchema,

  /** Confidence level of the prediction (0-1) */
  confidence: z.number().min(0).max(1),
});

/**
 * Detailed scoring breakdown for transparency
 */
export const RetentionScoreBreakdownSchema = z.object({
  /** Base score before adjustments */
  baseScore: z.number(),

  /** Inactivity penalty applied */
  inactivityPenalty: z.number(),

  /** Cancellation penalty applied */
  cancellationPenalty: z.number(),

  /** NPS adjustment (can be positive or negative) */
  npsAdjustment: z.number(),

  /** Engagement bonus applied */
  engagementBonus: z.number(),

  /** High-value patient bonus */
  highValueBonus: z.number(),

  /** Final calculated score */
  finalScore: z.number(),
});

/**
 * Full retention scoring output with breakdown
 */
export const RetentionScoringOutputSchema = RetentionScoreResultSchema.extend({
  /** Detailed score breakdown */
  breakdown: RetentionScoreBreakdownSchema,

  /** Human-readable reasoning */
  reasoning: z.string(),

  /** Recommended actions */
  suggestedActions: z.array(z.string()),

  /** Timestamp of calculation */
  calculatedAt: TimestampSchema,
});

// =============================================================================
// Patient Retention Context
// =============================================================================

/**
 * Full patient context for retention scoring
 */
export const PatientRetentionContextSchema = z.object({
  /** Patient/Contact ID */
  contactId: UUIDSchema,

  /** Clinic ID */
  clinicId: UUIDSchema.optional(),

  /** Patient name for personalization */
  patientName: z.string().optional(),

  /** Patient phone for outreach */
  phone: z.string().optional(),

  /** Patient email */
  email: z.string().email().optional(),

  /** Retention metrics */
  metrics: RetentionMetricsInputSchema,
});

// =============================================================================
// Retention Scoring Request/Response
// =============================================================================

/**
 * Request to calculate retention score for a single patient
 */
export const ScorePatientRetentionRequestSchema = z.object({
  /** Patient/Contact ID */
  contactId: UUIDSchema,

  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Force recalculation even if recently scored */
  forceRecalculate: z.boolean().default(false),
});

/**
 * Batch retention scoring request
 */
export const BatchRetentionScoringRequestSchema = z.object({
  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Optional clinic ID filter */
  clinicId: UUIDSchema.optional(),

  /** Optional limit */
  limit: z.number().int().positive().optional(),
});

/**
 * Retention scoring response for a single patient
 */
export const RetentionScoringResponseSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Patient/Contact ID */
  contactId: UUIDSchema,

  /** Retention score result */
  result: RetentionScoringOutputSchema.optional(),

  /** Error message if failed */
  error: z.string().optional(),
});

/**
 * Batch scoring summary
 */
export const BatchRetentionScoringResultSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Total patients processed */
  totalPatients: z.number().int().min(0),

  /** Successfully scored count */
  scored: z.number().int().min(0),

  /** High risk patient count */
  highRiskCount: z.number().int().min(0),

  /** Errors encountered */
  errors: z.array(z.string()),

  /** Processing duration in ms */
  durationMs: z.number().optional(),
});

// =============================================================================
// Retention Events
// =============================================================================

/**
 * Event emitted when churn risk is detected
 */
export const ChurnRiskDetectedEventSchema = z.object({
  type: z.literal('patient.churn_risk_detected'),
  contactId: UUIDSchema,
  retentionScore: z.number().min(0).max(100),
  churnRisk: ChurnRiskLevelSchema,
  followUpPriority: FollowUpPrioritySchema,
  lifetimeValue: z.number(),
  patientName: z.string().optional(),
  phone: z.string().optional(),
  timestamp: TimestampSchema,
});

/**
 * Event emitted when batch scoring completes
 */
export const BatchScoringCompletedEventSchema = z.object({
  type: z.literal('retention.batch_scoring_completed'),
  totalPatients: z.number().int().min(0),
  scored: z.number().int().min(0),
  highRiskCount: z.number().int().min(0),
  errors: z.number().int().min(0),
  timestamp: TimestampSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type ChurnRiskLevel = z.infer<typeof ChurnRiskLevelSchema>;
export type FollowUpPriority = z.infer<typeof FollowUpPrioritySchema>;
export type RetentionClassification = z.infer<typeof RetentionClassificationSchema>;
export type RetentionMetricsInput = z.infer<typeof RetentionMetricsInputSchema>;
export type ExtendedRetentionMetrics = z.infer<typeof ExtendedRetentionMetricsSchema>;
export type RetentionScoreResult = z.infer<typeof RetentionScoreResultSchema>;
export type RetentionScoreBreakdown = z.infer<typeof RetentionScoreBreakdownSchema>;
export type RetentionScoringOutput = z.infer<typeof RetentionScoringOutputSchema>;
export type PatientRetentionContext = z.infer<typeof PatientRetentionContextSchema>;
export type ScorePatientRetentionRequest = z.infer<typeof ScorePatientRetentionRequestSchema>;
export type BatchRetentionScoringRequest = z.infer<typeof BatchRetentionScoringRequestSchema>;
export type RetentionScoringResponse = z.infer<typeof RetentionScoringResponseSchema>;
export type BatchRetentionScoringResult = z.infer<typeof BatchRetentionScoringResultSchema>;
export type ChurnRiskDetectedEvent = z.infer<typeof ChurnRiskDetectedEventSchema>;
export type BatchScoringCompletedEvent = z.infer<typeof BatchScoringCompletedEventSchema>;
