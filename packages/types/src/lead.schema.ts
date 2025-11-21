import { z } from 'zod';

/**
 * Lead and Scoring Domain Schemas
 */

// Lead source channels
export const LeadChannelSchema = z.enum(['whatsapp', 'voice', 'web', 'referral']);

// Lead score levels
export const LeadScoreSchema = z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']);

// UTM parameters
export const UTMParamsSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
});

// Lead context for AI scoring
export const LeadContextSchema = z.object({
  phone: z.string(),
  name: z.string().optional(),
  channel: LeadChannelSchema,
  firstTouchTimestamp: z.string(),
  language: z.enum(['ro', 'en', 'de']).optional(),
  messageHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
  })).optional(),
  utm: UTMParamsSchema.optional(),
  hubspotContactId: z.string().optional(),
});

// AI Scoring output
export const ScoringOutputSchema = z.object({
  score: z.number().min(1).max(5),
  classification: LeadScoreSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedAction: z.string(),
  detectedIntent: z.string().optional(),
  urgencyIndicators: z.array(z.string()).optional(),
  budgetMentioned: z.boolean().optional(),
  procedureInterest: z.array(z.string()).optional(),
});

// Domain event base
export const DomainEventBaseSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  timestamp: z.string(),
  correlationId: z.string(),
  idempotencyKey: z.string(),
});

// Domain events
export const LeadCreatedEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('lead.created'),
  payload: z.object({
    phone: z.string(),
    channel: LeadChannelSchema,
    hubspotContactId: z.string().optional(),
  }),
});

export const LeadScoredEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('lead.scored'),
  payload: z.object({
    phone: z.string(),
    score: z.number(),
    classification: LeadScoreSchema,
  }),
});

export const MessageReceivedEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('message.received'),
  payload: z.object({
    phone: z.string(),
    channel: LeadChannelSchema,
    messageId: z.string(),
    content: z.string(),
  }),
});

// Union of all domain events
export const DomainEventSchema = z.discriminatedUnion('type', [
  LeadCreatedEventSchema,
  LeadScoredEventSchema,
  MessageReceivedEventSchema,
]);

// Inferred types
export type LeadChannel = z.infer<typeof LeadChannelSchema>;
export type LeadScore = z.infer<typeof LeadScoreSchema>;
export type UTMParams = z.infer<typeof UTMParamsSchema>;
export type LeadContext = z.infer<typeof LeadContextSchema>;
export type ScoringOutput = z.infer<typeof ScoringOutputSchema>;
export type DomainEventBase = z.infer<typeof DomainEventBaseSchema>;
export type LeadCreatedEvent = z.infer<typeof LeadCreatedEventSchema>;
export type LeadScoredEvent = z.infer<typeof LeadScoredEventSchema>;
export type MessageReceivedEvent = z.infer<typeof MessageReceivedEventSchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
