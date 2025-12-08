/**
 * Lead context schemas for the MedicalCor platform
 */
import { z } from 'zod';

import { E164PhoneSchema, EmailSchema, TimestampSchema, UUIDSchema } from './common.js';

/**
 * Lead source/channel - unified enum covering all acquisition channels
 * Consolidated from: schemas/lead.ts, patient.schema.ts, lead.schema.ts
 */
export const LeadSourceSchema = z.enum([
  'whatsapp',
  'voice',
  'web_form',
  'web', // Alias for web_form (backward compatibility)
  'hubspot',
  'facebook',
  'google',
  'referral',
  'manual',
]);

/**
 * Lead channel for AI scoring (simplified subset)
 * @deprecated Use LeadSourceSchema instead
 */
export const LeadChannelSchema = LeadSourceSchema;

/**
 * Lead status in the pipeline
 */
export const LeadStatusSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'nurturing',
  'scheduled',
  'converted',
  'lost',
  'invalid',
]);

/**
 * Lead priority based on AI scoring
 */
export const LeadPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

/**
 * Patient demographics (PII - handle with care)
 */
export const PatientDemographicsSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  city: z.string().max(100).optional(),
  county: z.string().max(100).optional(),
});

/**
 * Medical context gathered from conversation
 */
export const MedicalContextSchema = z.object({
  primarySymptoms: z.array(z.string()).default([]),
  symptomDuration: z.string().optional(),
  urgencyLevel: z.enum(['emergency', 'urgent', 'routine', 'preventive']).optional(),
  preferredSpecialty: z.string().optional(),
  hasInsurance: z.boolean().optional(),
  insuranceProvider: z.string().optional(),
  previousTreatments: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  currentMedications: z.array(z.string()).default([]),
});

/**
 * Conversation history entry
 */
export const ConversationEntrySchema = z.object({
  id: UUIDSchema,
  timestamp: TimestampSchema,
  role: z.enum(['patient', 'assistant', 'agent', 'system']),
  channel: z.enum(['whatsapp', 'voice', 'sms', 'email']),
  content: z.string(),
  // CRITICAL FIX: Properly validate metadata to prevent injection attacks
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

/**
 * Complete Lead Context - the central domain entity
 */
export const LeadContextSchema = z.object({
  id: UUIDSchema,
  hubspotContactId: z.string().optional(),
  hubspotDealId: z.string().optional(),

  // Contact info (PII)
  phone: E164PhoneSchema,
  email: EmailSchema.optional(),

  // Demographics (PII)
  demographics: PatientDemographicsSchema.optional(),

  // Lead metadata
  source: LeadSourceSchema,
  status: LeadStatusSchema,
  priority: LeadPrioritySchema.optional(),

  // Medical context
  medicalContext: MedicalContextSchema.optional(),

  // Conversation tracking
  conversationHistory: z.array(ConversationEntrySchema).default([]),
  lastContactAt: TimestampSchema.optional(),

  // AI scoring results (unified 1-5 scale)
  aiScoreId: UUIDSchema.optional(),
  aiScore: z.number().min(1).max(5).optional(),

  // Timestamps
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  // CRITICAL FIX: Properly validate metadata to prevent injection attacks
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

/**
 * Lead context creation input (without auto-generated fields)
 */
export const CreateLeadContextSchema = LeadContextSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  conversationHistory: true,
  metadata: true,
});

/**
 * Lead context update input
 */
export const UpdateLeadContextSchema = LeadContextSchema.partial().omit({
  id: true,
  createdAt: true,
});

// =============================================================================
// AI Scoring Schemas (consolidated from lead.schema.ts)
// =============================================================================

/**
 * Lead score classification levels
 */
export const LeadScoreSchema = z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']);

/**
 * Lead classification (alias for LeadScoreSchema)
 */
export const LeadClassificationSchema = LeadScoreSchema;

/**
 * UTM tracking parameters
 */
export const UTMParamsSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
});

/**
 * Simplified lead context for AI scoring operations
 * Use LeadContextSchema for the full domain model
 */
export const AIScoringContextSchema = z.object({
  phone: z.string(),
  name: z.string().optional(),
  channel: LeadSourceSchema,
  firstTouchTimestamp: z.string(),
  language: z.enum(['ro', 'en', 'de']).optional(),
  messageHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string(),
      })
    )
    .optional(),
  utm: UTMParamsSchema.optional(),
  hubspotContactId: z.string().optional(),
});

/**
 * AI Scoring output schema
 */
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

// =============================================================================
// Type exports
// =============================================================================

export type LeadSource = z.infer<typeof LeadSourceSchema>;
export type LeadChannel = LeadSource; // Backward compatibility alias
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type LeadPriority = z.infer<typeof LeadPrioritySchema>;
export type LeadScore = z.infer<typeof LeadScoreSchema>;
export type LeadClassification = LeadScore; // Alias
export type PatientDemographics = z.infer<typeof PatientDemographicsSchema>;
export type MedicalContext = z.infer<typeof MedicalContextSchema>;
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
export type LeadContext = z.infer<typeof LeadContextSchema>;
export type CreateLeadContext = z.infer<typeof CreateLeadContextSchema>;
export type UpdateLeadContext = z.infer<typeof UpdateLeadContextSchema>;
export type UTMParams = z.infer<typeof UTMParamsSchema>;
export type AIScoringContext = z.infer<typeof AIScoringContextSchema>;
export type ScoringOutput = z.infer<typeof ScoringOutputSchema>;
