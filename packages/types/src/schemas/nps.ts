/**
 * NPS (Net Promoter Score) Collection Schemas
 *
 * Schemas for patient satisfaction measurement and NPS workflow.
 * Part of M11 Milestone: Patient Satisfaction
 *
 * @module @medicalcor/types/schemas/nps
 */

import { z } from 'zod';

// =============================================================================
// NPS Score & Classification
// =============================================================================

/**
 * NPS Score (0-10)
 * Standard Net Promoter Score scale
 */
export const NPSScoreSchema = z.number().int().min(0).max(10).describe('Net Promoter Score (0-10)');

/**
 * NPS Classification based on score
 * - Promoters: 9-10 (loyal enthusiasts)
 * - Passives: 7-8 (satisfied but unenthusiastic)
 * - Detractors: 0-6 (unhappy customers)
 */
export const NPSClassificationSchema = z.enum(['promoter', 'passive', 'detractor']);

/**
 * NPS Survey Status
 */
export const NPSSurveyStatusSchema = z.enum([
  'pending', // Survey scheduled but not sent
  'sent', // Survey sent, awaiting response
  'responded', // Patient responded
  'expired', // No response within window
  'skipped', // Survey skipped (consent, recent survey, etc.)
]);

/**
 * NPS Survey Trigger Type
 */
export const NPSTriggerTypeSchema = z.enum([
  'post_appointment', // After appointment completion
  'post_treatment', // After treatment completion
  'periodic', // Regular check-in (e.g., quarterly)
  'post_onboarding', // After new patient onboarding
  'manual', // Manually triggered by staff
]);

/**
 * NPS Survey Channel
 */
export const NPSSurveyChannelSchema = z.enum(['whatsapp', 'sms', 'email', 'web']);

// =============================================================================
// NPS Survey Request/Response
// =============================================================================

/**
 * Request to send NPS survey
 */
export const NPSSurveyRequestSchema = z.object({
  /** Patient phone number (E.164 format) */
  phone: z.string().regex(/^\+40[0-9]{9}$/, 'Must be E.164 format with +40 prefix'),

  /** HubSpot contact ID */
  hubspotContactId: z.string().optional(),

  /** Patient ID if available */
  patientId: z.string().uuid().optional(),

  /** Trigger type */
  triggerType: NPSTriggerTypeSchema,

  /** Related appointment ID */
  appointmentId: z.string().uuid().optional(),

  /** Related procedure/treatment type */
  procedureType: z.string().optional(),

  /** Preferred channel for survey delivery */
  channel: NPSSurveyChannelSchema.default('whatsapp'),

  /** Language for survey */
  language: z.enum(['ro', 'en', 'de']).default('ro'),

  /** Correlation ID for tracing */
  correlationId: z.string().min(1).max(64),
});

/**
 * NPS Response from patient
 */
export const NPSResponseSchema = z.object({
  /** Unique response ID */
  id: z.string().uuid(),

  /** Phone number of respondent */
  phone: z.string(),

  /** HubSpot contact ID */
  hubspotContactId: z.string().optional(),

  /** NPS score (0-10) */
  score: NPSScoreSchema,

  /** Classification derived from score */
  classification: NPSClassificationSchema,

  /** Free-form feedback text */
  feedback: z.string().max(2000).optional(),

  /** Trigger type that initiated the survey */
  triggerType: NPSTriggerTypeSchema,

  /** Related appointment ID */
  appointmentId: z.string().uuid().optional(),

  /** Related procedure type */
  procedureType: z.string().optional(),

  /** Channel through which response was received */
  channel: NPSSurveyChannelSchema,

  /** Language of the survey */
  language: z.enum(['ro', 'en', 'de']),

  /** When the survey was sent */
  surveyedAt: z.coerce.date(),

  /** When the response was received */
  respondedAt: z.coerce.date(),

  /** Response latency in minutes */
  responseLatencyMinutes: z.number().int().min(0).optional(),

  /** Whether follow-up is needed */
  requiresFollowUp: z.boolean().default(false),

  /** Follow-up reason */
  followUpReason: z.string().optional(),

  /** Sentiment analysis result */
  sentimentScore: z.number().min(-1).max(1).optional(),

  /** Detected themes in feedback */
  detectedThemes: z.array(z.string()).optional(),
});

/**
 * NPS Survey Record (full database entity)
 */
export const NPSSurveyRecordSchema = z.object({
  /** Unique survey ID */
  id: z.string().uuid(),

  /** Phone number */
  phone: z.string(),

  /** HubSpot contact ID */
  hubspotContactId: z.string().optional(),

  /** Patient ID */
  patientId: z.string().uuid().optional(),

  /** Survey status */
  status: NPSSurveyStatusSchema,

  /** Trigger type */
  triggerType: NPSTriggerTypeSchema,

  /** Related appointment ID */
  appointmentId: z.string().uuid().optional(),

  /** Procedure type */
  procedureType: z.string().optional(),

  /** Delivery channel */
  channel: NPSSurveyChannelSchema,

  /** Survey language */
  language: z.enum(['ro', 'en', 'de']),

  /** When survey was scheduled */
  scheduledFor: z.coerce.date(),

  /** When survey was sent */
  sentAt: z.coerce.date().optional(),

  /** When response was received */
  respondedAt: z.coerce.date().optional(),

  /** When survey expired */
  expiredAt: z.coerce.date().optional(),

  /** NPS score if responded */
  score: NPSScoreSchema.optional(),

  /** NPS classification if responded */
  classification: NPSClassificationSchema.optional(),

  /** Feedback text */
  feedback: z.string().optional(),

  /** Follow-up required */
  requiresFollowUp: z.boolean().default(false),

  /** Follow-up completed */
  followUpCompletedAt: z.coerce.date().optional(),

  /** Follow-up notes */
  followUpNotes: z.string().optional(),

  /** Created timestamp */
  createdAt: z.coerce.date(),

  /** Updated timestamp */
  updatedAt: z.coerce.date(),

  /** Correlation ID */
  correlationId: z.string().optional(),
});

// =============================================================================
// NPS Workflow Payloads
// =============================================================================

/**
 * NPS Collection Workflow Payload
 */
export const NPSCollectionPayloadSchema = z.object({
  /** Phone number (E.164) */
  phone: z.string(),

  /** HubSpot contact ID */
  hubspotContactId: z.string().optional(),

  /** Patient ID */
  patientId: z.string().uuid().optional(),

  /** Trigger type */
  triggerType: NPSTriggerTypeSchema,

  /** Related appointment ID */
  appointmentId: z.string().uuid().optional(),

  /** Procedure type */
  procedureType: z.string().optional(),

  /** Survey channel */
  channel: NPSSurveyChannelSchema.default('whatsapp'),

  /** Survey language */
  language: z.enum(['ro', 'en', 'de']).default('ro'),

  /** Delay before sending (minutes) */
  delayMinutes: z.number().int().min(0).default(60),

  /** Correlation ID */
  correlationId: z.string(),
});

/**
 * NPS Response Processing Payload
 */
export const NPSResponseProcessingPayloadSchema = z.object({
  /** Survey ID */
  surveyId: z.string().uuid(),

  /** Phone number */
  phone: z.string(),

  /** Raw message content */
  messageContent: z.string(),

  /** Message channel */
  channel: NPSSurveyChannelSchema,

  /** Message timestamp */
  receivedAt: z.coerce.date(),

  /** Correlation ID */
  correlationId: z.string(),
});

/**
 * NPS Follow-up Payload
 */
export const NPSFollowUpPayloadSchema = z.object({
  /** Response ID */
  responseId: z.string().uuid(),

  /** Phone number */
  phone: z.string(),

  /** HubSpot contact ID */
  hubspotContactId: z.string().optional(),

  /** NPS score */
  score: NPSScoreSchema,

  /** Classification */
  classification: NPSClassificationSchema,

  /** Feedback text */
  feedback: z.string().optional(),

  /** Follow-up reason */
  reason: z.string(),

  /** Priority level */
  priority: z.enum(['critical', 'high', 'medium', 'low']),

  /** Correlation ID */
  correlationId: z.string(),
});

// =============================================================================
// NPS Analytics
// =============================================================================

/**
 * NPS Score Distribution
 */
export const NPSScoreDistributionSchema = z.object({
  /** Score value (0-10) */
  score: NPSScoreSchema,

  /** Count of responses with this score */
  count: z.number().int().min(0),

  /** Percentage of total responses */
  percentage: z.number().min(0).max(100),
});

/**
 * NPS Summary Statistics
 */
export const NPSSummaryStatsSchema = z.object({
  /** Overall NPS score (-100 to 100) */
  npsScore: z.number().min(-100).max(100),

  /** Total responses */
  totalResponses: z.number().int().min(0),

  /** Promoter count */
  promoterCount: z.number().int().min(0),

  /** Passive count */
  passiveCount: z.number().int().min(0),

  /** Detractor count */
  detractorCount: z.number().int().min(0),

  /** Promoter percentage */
  promoterPercentage: z.number().min(0).max(100),

  /** Passive percentage */
  passivePercentage: z.number().min(0).max(100),

  /** Detractor percentage */
  detractorPercentage: z.number().min(0).max(100),

  /** Average score */
  averageScore: z.number().min(0).max(10),

  /** Response rate */
  responseRate: z.number().min(0).max(100),

  /** Period start */
  periodStart: z.coerce.date(),

  /** Period end */
  periodEnd: z.coerce.date(),
});

/**
 * NPS Trend Data Point
 */
export const NPSTrendPointSchema = z.object({
  /** Date/period */
  date: z.coerce.date(),

  /** NPS score for this period */
  npsScore: z.number().min(-100).max(100),

  /** Response count */
  responseCount: z.number().int().min(0),

  /** Promoter count */
  promoterCount: z.number().int().min(0),

  /** Passive count */
  passiveCount: z.number().int().min(0),

  /** Detractor count */
  detractorCount: z.number().int().min(0),
});

/**
 * NPS Dashboard Data
 */
export const NPSDashboardDataSchema = z.object({
  /** Summary statistics */
  summary: NPSSummaryStatsSchema,

  /** Score distribution */
  distribution: z.array(NPSScoreDistributionSchema),

  /** Trend over time */
  trend: z.array(NPSTrendPointSchema),

  /** Recent feedback requiring attention */
  recentFeedback: z.array(
    z.object({
      id: z.string().uuid(),
      phone: z.string(),
      score: NPSScoreSchema,
      classification: NPSClassificationSchema,
      feedback: z.string().optional(),
      respondedAt: z.coerce.date(),
      requiresFollowUp: z.boolean(),
      procedureType: z.string().optional(),
    })
  ),

  /** Top themes from feedback */
  topThemes: z.array(
    z.object({
      theme: z.string(),
      count: z.number().int().min(0),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
    })
  ),
});

// =============================================================================
// Type Exports
// =============================================================================

export type NPSScore = z.infer<typeof NPSScoreSchema>;
export type NPSClassification = z.infer<typeof NPSClassificationSchema>;
export type NPSSurveyStatus = z.infer<typeof NPSSurveyStatusSchema>;
export type NPSTriggerType = z.infer<typeof NPSTriggerTypeSchema>;
export type NPSSurveyChannel = z.infer<typeof NPSSurveyChannelSchema>;
export type NPSSurveyRequest = z.infer<typeof NPSSurveyRequestSchema>;
export type NPSResponse = z.infer<typeof NPSResponseSchema>;
export type NPSSurveyRecord = z.infer<typeof NPSSurveyRecordSchema>;
export type NPSCollectionPayload = z.infer<typeof NPSCollectionPayloadSchema>;
export type NPSResponseProcessingPayload = z.infer<typeof NPSResponseProcessingPayloadSchema>;
export type NPSFollowUpPayload = z.infer<typeof NPSFollowUpPayloadSchema>;
export type NPSScoreDistribution = z.infer<typeof NPSScoreDistributionSchema>;
export type NPSSummaryStats = z.infer<typeof NPSSummaryStatsSchema>;
export type NPSTrendPoint = z.infer<typeof NPSTrendPointSchema>;
export type NPSDashboardData = z.infer<typeof NPSDashboardDataSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Classify NPS score into promoter/passive/detractor
 */
export function classifyNPSScore(score: number): NPSClassification {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

/**
 * Calculate NPS from response counts
 * NPS = %Promoters - %Detractors
 */
export function calculateNPS(
  promoterCount: number,
  passiveCount: number,
  detractorCount: number
): number {
  const total = promoterCount + passiveCount + detractorCount;
  if (total === 0) return 0;

  const promoterPct = (promoterCount / total) * 100;
  const detractorPct = (detractorCount / total) * 100;

  return Math.round(promoterPct - detractorPct);
}

/**
 * Determine if a detractor response requires immediate follow-up
 */
export function requiresImmediateFollowUp(score: number, feedback?: string): boolean {
  // All detractors (0-6) require follow-up
  if (score <= 6) {
    // Critical: scores 0-3 or feedback with negative keywords
    if (score <= 3) return true;

    // Check for severe negative feedback
    if (feedback) {
      const negativeIndicators = [
        'dezamăgit',
        'groaznic',
        'oribil',
        'niciodată',
        'reclamație',
        'disappointed',
        'terrible',
        'horrible',
        'never',
        'complaint',
        'enttäuscht',
        'schrecklich',
        'niemals',
      ];
      const lowerFeedback = feedback.toLowerCase();
      return negativeIndicators.some((indicator) => lowerFeedback.includes(indicator));
    }
  }
  return false;
}

/**
 * Get follow-up priority based on score and feedback
 */
export function getFollowUpPriority(
  score: number,
  feedback?: string
): 'critical' | 'high' | 'medium' | 'low' {
  if (score <= 3) return 'critical';
  if (score <= 5) return 'high';
  if (score === 6) return 'medium';
  if (score <= 8 && feedback && feedback.length > 50) return 'low';
  return 'low';
}
