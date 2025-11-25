/**
 * Lead and Scoring Domain Schemas
 *
 * @deprecated Import from '@medicalcor/types' or './schemas/lead.js' instead.
 * This file re-exports from the consolidated schema for backward compatibility.
 */

// Re-export all lead schemas from the Single Source of Truth
export {
  // Lead source/channel
  LeadSourceSchema,
  LeadChannelSchema,
  // Lead status and priority
  LeadStatusSchema,
  LeadPrioritySchema,
  // AI scoring
  LeadScoreSchema,
  LeadClassificationSchema,
  UTMParamsSchema,
  AIScoringContextSchema,
  ScoringOutputSchema,
  // Patient data
  PatientDemographicsSchema,
  MedicalContextSchema,
  ConversationEntrySchema,
  // Full domain model
  LeadContextSchema,
  CreateLeadContextSchema,
  UpdateLeadContextSchema,
  // Types
  type LeadSource,
  type LeadChannel,
  type LeadStatus,
  type LeadPriority,
  type LeadScore,
  type LeadClassification,
  type UTMParams,
  type AIScoringContext,
  type ScoringOutput,
  type PatientDemographics,
  type MedicalContext,
  type ConversationEntry,
  type LeadContext,
  type CreateLeadContext,
  type UpdateLeadContext,
} from './schemas/lead.js';

// Legacy schemas for backward compatibility
import { z } from 'zod';
import { LeadChannelSchema as LeadChannelSchemaSource } from './schemas/lead.js';

/**
 * Domain event base - kept for backward compatibility with existing code
 * @deprecated Use EventBaseSchema from events.schema.ts instead
 */
export const DomainEventBaseSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  timestamp: z.string(),
  correlationId: z.string(),
  idempotencyKey: z.string(),
});

/**
 * @deprecated Use LeadCreatedEventSchema from events.schema.ts instead
 */
export const LeadCreatedEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('lead.created'),
  payload: z.object({
    phone: z.string(),
    channel: LeadChannelSchemaSource,
    hubspotContactId: z.string().optional(),
  }),
});

/**
 * @deprecated Use LeadScoredEventSchema from events.schema.ts instead
 */
export const LeadScoredEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('lead.scored'),
  payload: z.object({
    phone: z.string(),
    score: z.number(),
    classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  }),
});

/**
 * @deprecated Use MessageReceivedEventSchema from events.schema.ts instead
 */
export const MessageReceivedEventSchema = DomainEventBaseSchema.extend({
  type: z.literal('message.received'),
  payload: z.object({
    phone: z.string(),
    channel: LeadChannelSchemaSource,
    messageId: z.string(),
    content: z.string(),
  }),
});

/**
 * @deprecated Use DomainEventSchema from events.schema.ts instead
 */
export const DomainEventSchema = z.discriminatedUnion('type', [
  LeadCreatedEventSchema,
  LeadScoredEventSchema,
  MessageReceivedEventSchema,
]);

// Legacy types
export type DomainEventBase = z.infer<typeof DomainEventBaseSchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
