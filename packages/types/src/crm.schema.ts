/**
 * CRM Schema Definitions
 * Types for Lead Generation Machine, Pipedrive Sync, and Treatment Plans
 */

import { z } from 'zod';

// =============================================================================
// Lead DTO Schema
// =============================================================================

export const LeadDTOSchema = z.object({
  // External Source Identification
  externalSource: z.string().min(1).default('pipedrive'),
  externalContactId: z.string().min(1),
  externalUrl: z.string().url().optional(),

  // Contact Information
  fullName: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().email().optional(),

  // Marketing & Attribution
  source: z.string().optional(),
  acquisitionChannel: z.string().optional(),
  adCampaignId: z.string().optional(),

  // AI Brain
  aiScore: z.number().int().min(0).max(100).optional(),
  aiIntent: z.string().optional(),
  aiSummary: z.string().optional(),
  aiLastAnalysisAt: z.date().optional(),

  // Language & Metadata
  language: z.string().max(5).default('ro'),
  tags: z.array(z.string()).optional(),
  // CRITICAL FIX: Properly validate metadata structure to prevent injection attacks
  // Only allow primitive types - no objects, functions, or complex structures
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),

  // GDPR
  gdprConsent: z.boolean().optional(),
  gdprConsentAt: z.date().optional(),
  gdprConsentSource: z.string().optional(),

  // Pipeline Status
  status: z.string().default('new'),

  // Multi-Tenancy
  clinicId: z.string().uuid().optional(),
  assignedAgentExternalUserId: z.string().optional(),
});

export type LeadDTO = z.infer<typeof LeadDTOSchema>;

// =============================================================================
// Treatment Plan DTO Schema
// =============================================================================

export const TreatmentPlanDTOSchema = z.object({
  // External Source Identification
  externalSource: z.string().min(1).default('pipedrive'),
  externalDealId: z.string().min(1),
  leadExternalId: z.string().min(1),
  doctorExternalUserId: z.string().optional(),

  // Plan Details
  name: z.string().optional(),
  totalValue: z.number().min(0).optional(),
  currency: z.string().length(3).default('EUR'),

  // Stage & Probability
  stage: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),

  // Acceptance Status
  isAccepted: z.boolean().optional(),
  acceptedAt: z.date().nullable().optional(),
  rejectedReason: z.string().nullable().optional(),

  // Additional Info
  notes: z.string().optional(),
  validUntil: z.date().optional(),
});

export type TreatmentPlanDTO = z.infer<typeof TreatmentPlanDTOSchema>;

// =============================================================================
// Interaction DTO Schema
// =============================================================================

export const InteractionChannelSchema = z.enum(['whatsapp', 'sms', 'email', 'call', 'note']);

export const InteractionDirectionSchema = z.enum(['inbound', 'outbound']);

export const InteractionDTOSchema = z.object({
  // Lead Identification
  leadExternalSource: z.string().min(1),
  leadExternalId: z.string().min(1),

  // Interaction Identification
  externalId: z.string().min(1),
  threadId: z.string().optional(),
  provider: z.string().min(1),

  // Channel & Direction
  channel: InteractionChannelSchema,
  direction: InteractionDirectionSchema,
  type: z.string().default('text'),

  // Content
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),

  // AI Analysis
  aiSentimentScore: z.number().min(-1).max(1).optional(),
  aiTags: z.array(z.string()).optional(),

  // Status
  status: z.string().optional(),
  errorMessage: z.string().optional(),

  // Timestamps
  createdAt: z.date().optional(),
});

export type InteractionDTO = z.infer<typeof InteractionDTOSchema>;

// =============================================================================
// CRM Provider Interface
// =============================================================================

/**
 * Interface for CRM provider adapters
 * Allows pluggable CRM integrations (Pipedrive, HubSpot, etc.)
 */
export interface ICRMProvider {
  readonly sourceName: string;

  /**
   * Parse a contact/person webhook payload into a LeadDTO
   */
  parseContactWebhook(payload: unknown): LeadDTO | null;

  /**
   * Parse a deal webhook payload into a TreatmentPlanDTO
   */
  parseDealWebhook(payload: unknown): TreatmentPlanDTO | null;
}

// =============================================================================
// Lead Event Types
// =============================================================================

export const LeadEventTypeSchema = z.enum([
  'lead_created',
  'lead_updated',
  'lead_scored',
  'lead_qualified',
  'lead_assigned',
  'treatment_plan_created',
  'treatment_plan_updated',
  'interaction_added',
  'status_changed',
  'gdpr_consent_recorded',
]);

export type LeadEventType = z.infer<typeof LeadEventTypeSchema>;

// =============================================================================
// Lead Status Types
// =============================================================================

export const CRMLeadStatusSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
  'nurturing',
]);

export type CRMLeadStatus = z.infer<typeof CRMLeadStatusSchema>;

// =============================================================================
// Treatment Plan Stage Types
// =============================================================================

export const TreatmentPlanStageSchema = z.enum([
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'expired',
]);

export type TreatmentPlanStage = z.infer<typeof TreatmentPlanStageSchema>;
