/**
 * Advanced AI Scoring schemas for lead qualification
 *
 * NOTE: These schemas are for future advanced scoring features.
 * The current active ScoringOutput type is defined in schemas/lead.ts
 * which uses a simpler 1-5 score scale compatible with the ScoringService.
 */
import { z } from 'zod';

import { TimestampSchema, UUIDSchema } from './common.js';
import { LeadPrioritySchema } from './lead.js';

/**
 * Scoring dimension - individual aspect of lead quality
 */
export const ScoringDimensionSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  reasoning: z.string(),
});

/**
 * Recommended action from AI scoring
 */
export const RecommendedActionSchema = z.object({
  type: z.enum([
    'schedule_callback',
    'send_info',
    'escalate_to_human',
    'nurture_sequence',
    'mark_lost',
    'immediate_contact',
  ]),
  priority: LeadPrioritySchema,
  description: z.string(),
  deadline: TimestampSchema.optional(),
});

/**
 * Advanced AI Scoring Output (0-100 scale with dimensions)
 * For future advanced multi-dimensional scoring features
 */
export const AdvancedScoringOutputSchema = z.object({
  id: UUIDSchema,
  leadId: UUIDSchema,

  // Overall score
  overallScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  priority: LeadPrioritySchema,

  // Breakdown by dimension
  dimensions: z.array(ScoringDimensionSchema),

  // AI reasoning
  summary: z.string(),
  keyInsights: z.array(z.string()),

  // Recommended actions
  recommendedActions: z.array(RecommendedActionSchema),

  // Model metadata
  modelVersion: z.string(),
  promptVersion: z.string(),
  tokensUsed: z.number().int().positive(),

  // Timestamps
  scoredAt: TimestampSchema,
});

/**
 * Scoring request input
 */
export const ScoringRequestSchema = z.object({
  leadId: UUIDSchema,
  conversationText: z.string().min(1),
  additionalContext: z.record(z.unknown()).optional(),
  forceRescore: z.boolean().default(false),
});

export type ScoringDimension = z.infer<typeof ScoringDimensionSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type AdvancedScoringOutput = z.infer<typeof AdvancedScoringOutputSchema>;
export type ScoringRequest = z.infer<typeof ScoringRequestSchema>;
