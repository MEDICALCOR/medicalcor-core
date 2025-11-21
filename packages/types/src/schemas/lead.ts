/**
 * Lead context schemas for the MedicalCor platform
 */
import { z } from "zod";

import { E164PhoneSchema, EmailSchema, TimestampSchema, UUIDSchema } from "./common.js";

/**
 * Lead source channel
 */
export const LeadSourceSchema = z.enum([
  "whatsapp",
  "voice",
  "web_form",
  "hubspot",
  "manual",
  "referral",
]);

/**
 * Lead status in the pipeline
 */
export const LeadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "nurturing",
  "scheduled",
  "converted",
  "lost",
  "invalid",
]);

/**
 * Lead priority based on AI scoring
 */
export const LeadPrioritySchema = z.enum(["critical", "high", "medium", "low"]);

/**
 * Patient demographics (PII - handle with care)
 */
export const PatientDemographicsSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  city: z.string().max(100).optional(),
  county: z.string().max(100).optional(),
});

/**
 * Medical context gathered from conversation
 */
export const MedicalContextSchema = z.object({
  primarySymptoms: z.array(z.string()).default([]),
  symptomDuration: z.string().optional(),
  urgencyLevel: z.enum(["emergency", "urgent", "routine", "preventive"]).optional(),
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
  role: z.enum(["patient", "assistant", "agent", "system"]),
  channel: z.enum(["whatsapp", "voice", "sms", "email"]),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
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

  // AI scoring results
  aiScoreId: UUIDSchema.optional(),
  aiScore: z.number().min(0).max(100).optional(),

  // Timestamps
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  // Extensible metadata
  metadata: z.record(z.unknown()).default({}),
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

export type LeadSource = z.infer<typeof LeadSourceSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type LeadPriority = z.infer<typeof LeadPrioritySchema>;
export type PatientDemographics = z.infer<typeof PatientDemographicsSchema>;
export type MedicalContext = z.infer<typeof MedicalContextSchema>;
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
export type LeadContext = z.infer<typeof LeadContextSchema>;
export type CreateLeadContext = z.infer<typeof CreateLeadContextSchema>;
export type UpdateLeadContext = z.infer<typeof UpdateLeadContextSchema>;
