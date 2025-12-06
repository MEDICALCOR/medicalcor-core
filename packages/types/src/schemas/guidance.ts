/**
 * Agent Guidance / Call Scripts Schemas
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Provides structured call scripts and real-time coaching guidance
 * for agents handling voice calls and chat interactions.
 */
import { z } from 'zod';

import { TimestampSchema, UUIDSchema } from './common.js';

// =============================================================================
// Guidance Types & Categories
// =============================================================================

/**
 * Type of guidance content
 */
export const GuidanceTypeSchema = z.enum([
  'call-script', // Structured call script with flow
  'coaching-prompt', // Real-time coaching suggestions
  'knowledge-base', // Reference knowledge article
  'objection-handler', // Responses to common objections
  'procedure-guide', // Medical procedure explanation
]);

/**
 * Category of guidance for filtering
 */
export const GuidanceCategorySchema = z.enum([
  'intake', // Initial patient intake
  'scheduling', // Appointment scheduling
  'pricing', // Price discussions
  'insurance', // Insurance verification
  'follow-up', // Follow-up calls
  'emergency', // Emergency situations
  'consultation', // Treatment consultation
  'objection', // Handling objections
  'closing', // Closing the call/booking
]);

/**
 * Target audience for the guidance
 */
export const GuidanceAudienceSchema = z.enum([
  'new-patient', // New patient inquiries
  'existing-patient', // Returning patients
  'referral', // Referral calls
  'emergency', // Emergency callers
  'all', // All callers
]);

// =============================================================================
// Script Step & Flow
// =============================================================================

/**
 * Action type for script steps
 */
export const ScriptActionTypeSchema = z.enum([
  'say', // Agent speaks
  'ask', // Agent asks question
  'listen', // Wait for response
  'collect', // Collect specific data
  'verify', // Verify information
  'transfer', // Transfer call
  'book', // Book appointment
  'note', // Add internal note
  'conditional', // Branch based on condition
]);

/**
 * Individual step in a call script
 */
export const ScriptStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  actionType: ScriptActionTypeSchema,

  // Content
  content: z.string().min(1), // Main script text
  alternativeContent: z.array(z.string()).optional(), // Alternative phrasings

  // Localization
  contentRo: z.string().optional(), // Romanian version
  contentEn: z.string().optional(), // English version

  // Expected responses or data to collect
  expectedResponses: z
    .array(
      z.object({
        pattern: z.string(), // Regex or keyword pattern
        nextStepId: z.string().optional(), // Branch to step
        action: z.string().optional(), // Action to take
      })
    )
    .optional(),

  // Data collection
  collectField: z.string().optional(), // Field name to populate
  collectValidation: z.string().optional(), // Validation regex

  // Conditions for conditional steps
  condition: z
    .object({
      field: z.string(),
      operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'exists']),
      value: z.unknown(),
      thenStepId: z.string(),
      elseStepId: z.string().optional(),
    })
    .optional(),

  // Timing hints
  minDurationSeconds: z.number().int().min(0).optional(),
  maxDurationSeconds: z.number().int().min(0).optional(),

  // Hints for agent
  agentNote: z.string().optional(), // Internal note visible to agent
  coachingTip: z.string().optional(), // Real-time coaching tip

  // Metadata
  isRequired: z.boolean().default(true),
  skipCondition: z.string().optional(), // Condition to skip this step
});

/**
 * Objection handler entry
 */
export const ObjectionHandlerSchema = z.object({
  id: z.string().min(1),
  objection: z.string().min(1), // The objection text/pattern
  objectionPatterns: z.array(z.string()), // Regex patterns to detect
  response: z.string().min(1), // Recommended response
  alternativeResponses: z.array(z.string()).optional(),

  // Localization
  responseRo: z.string().optional(),
  responseEn: z.string().optional(),

  // Context
  category: GuidanceCategorySchema.optional(),
  procedure: z.string().optional(), // Related procedure

  // Effectiveness tracking
  usageCount: z.number().int().min(0).default(0),
  successRate: z.number().min(0).max(100).optional(),
});

/**
 * Key talking point
 */
export const TalkingPointSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  content: z.string().min(1),
  contentRo: z.string().optional(),
  contentEn: z.string().optional(),

  // Detection triggers
  triggers: z.array(z.string()).optional(), // Keywords that surface this point

  // Priority
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  isRequired: z.boolean().default(false),
});

// =============================================================================
// Agent Guidance (Main Entity)
// =============================================================================

/**
 * Complete agent guidance/call script
 */
export const AgentGuidanceSchema = z.object({
  id: UUIDSchema,
  clinicId: UUIDSchema,

  // Core identification
  type: GuidanceTypeSchema,
  category: GuidanceCategorySchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),

  // Target audience
  audience: GuidanceAudienceSchema.default('all'),

  // Script structure
  initialGreeting: z.string().min(1),
  initialGreetingRo: z.string().optional(),
  steps: z.array(ScriptStepSchema).default([]),

  // Talking points & objections
  keyPoints: z.array(TalkingPointSchema).default([]),
  objectionHandlers: z.array(ObjectionHandlerSchema).default([]),

  // Closing
  closingStatements: z.array(z.string()).default([]),
  closingStatementsRo: z.array(z.string()).optional(),

  // Applicable procedures
  procedures: z.array(z.string()).default([]),

  // Languages supported
  languages: z.array(z.enum(['en', 'ro'])).default(['ro', 'en']),
  defaultLanguage: z.enum(['en', 'ro']).default('ro'),

  // Status
  isActive: z.boolean().default(true),
  isDraft: z.boolean().default(true),

  // Versioning
  version: z.number().int().min(1).default(1),
  previousVersionId: UUIDSchema.optional(),

  // Effectiveness metrics
  usageCount: z.number().int().min(0).default(0),
  avgCallDuration: z.number().min(0).optional(), // seconds
  conversionRate: z.number().min(0).max(100).optional(),
  satisfactionScore: z.number().min(0).max(100).optional(),

  // Metadata
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  // Tags for search
  tags: z.array(z.string()).default([]),
});

// =============================================================================
// Input Schemas (for API)
// =============================================================================

/**
 * Create guidance request
 */
export const CreateGuidanceSchema = AgentGuidanceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  avgCallDuration: true,
  conversionRate: true,
  satisfactionScore: true,
  version: true,
  previousVersionId: true,
});

/**
 * Update guidance request
 */
export const UpdateGuidanceSchema = CreateGuidanceSchema.partial().extend({
  id: UUIDSchema,
});

/**
 * Query parameters for listing guidance
 */
export const GuidanceQuerySchema = z.object({
  type: GuidanceTypeSchema.optional(),
  category: GuidanceCategorySchema.optional(),
  audience: GuidanceAudienceSchema.optional(),
  procedure: z.string().optional(),
  isActive: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  language: z.enum(['en', 'ro']).optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// =============================================================================
// Real-time Guidance Events
// =============================================================================

/**
 * Guidance suggestion for live call
 */
export const GuidanceSuggestionSchema = z.object({
  id: UUIDSchema,
  callSid: z.string(),
  guidanceId: UUIDSchema,

  // Suggestion type
  type: z.enum([
    'next-step', // Next step in script
    'talking-point', // Relevant talking point
    'objection-response', // Response to detected objection
    'coaching-tip', // Real-time coaching
    'warning', // Warning (e.g., long silence)
    'escalation', // Escalation suggestion
  ]),

  // Content
  content: z.string().min(1),
  contentRo: z.string().optional(),

  // Context
  confidence: z.number().min(0).max(1).default(1),
  trigger: z.string().optional(), // What triggered this suggestion
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),

  // Action
  suggestedAction: z.string().optional(),
  actionPayload: z.record(z.unknown()).optional(),

  // Metadata
  timestamp: TimestampSchema,
  expiresAt: TimestampSchema.optional(),
  acknowledged: z.boolean().default(false),
});

/**
 * Guidance event for WebSocket
 */
export const GuidanceEventTypeSchema = z.enum([
  'guidance.loaded', // Script loaded for call
  'guidance.step-complete', // Agent completed step
  'guidance.suggestion', // New suggestion available
  'guidance.objection-detected', // Objection detected
  'guidance.coaching-tip', // Coaching tip
  'guidance.script-complete', // Script completed
  'guidance.metrics-update', // Effectiveness metrics update
]);

/**
 * Base guidance event
 */
export const GuidanceEventBaseSchema = z.object({
  eventId: UUIDSchema,
  eventType: GuidanceEventTypeSchema,
  timestamp: TimestampSchema,
  callSid: z.string().optional(),
});

/**
 * Guidance loaded event
 */
export const GuidanceLoadedEventSchema = GuidanceEventBaseSchema.extend({
  eventType: z.literal('guidance.loaded'),
  callSid: z.string(),
  guidance: AgentGuidanceSchema,
  currentStepId: z.string().optional(),
});

/**
 * Suggestion event
 */
export const GuidanceSuggestionEventSchema = GuidanceEventBaseSchema.extend({
  eventType: z.literal('guidance.suggestion'),
  callSid: z.string(),
  suggestion: GuidanceSuggestionSchema,
});

/**
 * Objection detected event
 */
export const ObjectionDetectedEventSchema = GuidanceEventBaseSchema.extend({
  eventType: z.literal('guidance.objection-detected'),
  callSid: z.string(),
  objection: z.string(),
  suggestedResponse: z.string(),
  handler: ObjectionHandlerSchema.optional(),
});

/**
 * Union of all guidance events
 */
export const GuidanceEventSchema = z.discriminatedUnion('eventType', [
  GuidanceLoadedEventSchema,
  GuidanceSuggestionEventSchema,
  ObjectionDetectedEventSchema,
  GuidanceEventBaseSchema.extend({
    eventType: z.literal('guidance.step-complete'),
    callSid: z.string(),
    stepId: z.string(),
    nextStepId: z.string().optional(),
  }),
  GuidanceEventBaseSchema.extend({
    eventType: z.literal('guidance.coaching-tip'),
    callSid: z.string(),
    tip: z.string(),
  }),
  GuidanceEventBaseSchema.extend({
    eventType: z.literal('guidance.script-complete'),
    callSid: z.string(),
    guidanceId: UUIDSchema,
    completedSteps: z.number().int(),
    totalSteps: z.number().int(),
    duration: z.number(), // seconds
  }),
]);

// =============================================================================
// Type Exports
// =============================================================================

export type GuidanceType = z.infer<typeof GuidanceTypeSchema>;
export type GuidanceCategory = z.infer<typeof GuidanceCategorySchema>;
export type GuidanceAudience = z.infer<typeof GuidanceAudienceSchema>;
export type ScriptActionType = z.infer<typeof ScriptActionTypeSchema>;
export type ScriptStep = z.infer<typeof ScriptStepSchema>;
export type ObjectionHandler = z.infer<typeof ObjectionHandlerSchema>;
export type TalkingPoint = z.infer<typeof TalkingPointSchema>;
export type AgentGuidance = z.infer<typeof AgentGuidanceSchema>;
export type CreateGuidance = z.infer<typeof CreateGuidanceSchema>;
export type UpdateGuidance = z.infer<typeof UpdateGuidanceSchema>;
export type GuidanceQuery = z.infer<typeof GuidanceQuerySchema>;
export type GuidanceSuggestion = z.infer<typeof GuidanceSuggestionSchema>;
export type GuidanceEventType = z.infer<typeof GuidanceEventTypeSchema>;
export type GuidanceEventBase = z.infer<typeof GuidanceEventBaseSchema>;
export type GuidanceLoadedEvent = z.infer<typeof GuidanceLoadedEventSchema>;
export type GuidanceSuggestionEvent = z.infer<typeof GuidanceSuggestionEventSchema>;
export type ObjectionDetectedEvent = z.infer<typeof ObjectionDetectedEventSchema>;
export type GuidanceEvent = z.infer<typeof GuidanceEventSchema>;
