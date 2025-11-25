import { z } from 'zod';
import { LeadSourceSchema, LeadClassificationSchema } from './schemas/lead.js';

/**
 * Patient/Lead Schemas for Dashboard Display
 *
 * These schemas are optimized for UI display and are mapped from HubSpot contacts.
 * HubSpot remains the Single Source of Truth for all patient/lead data.
 *
 * Note: LeadSourceSchema and LeadClassificationSchema are imported from schemas/lead.ts
 * which is the Single Source of Truth for these enums.
 */

// Statusul pacientului mapat pe stările din CRM (HubSpot lifecycle stages)
export const PatientStatusSchema = z.enum(['lead', 'active', 'inactive', 'archived']);

// Schema pentru listare pacienți/leads (optimizată pentru Dashboard UI)
export const PatientListItemSchema = z.object({
  id: z.string(), // HubSpot Contact ID
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string(), // E.164 format (ex: +40721234567)
  email: z.string().email().optional(),
  status: PatientStatusSchema.default('lead'),
  lastContactDate: z.string().datetime().optional(),
  lifecycleStage: z.string().optional(),
  // Scoring fields
  leadScore: z.number().min(1).max(5).optional(),
  classification: LeadClassificationSchema.optional(),
  // Source tracking
  source: LeadSourceSchema.optional(),
  procedureInterest: z.string().optional(),
  // Timestamps
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Schema pentru leads recente în Dashboard (subset optimizat)
export const RecentLeadSchema = z.object({
  id: z.string(),
  phone: z.string(), // Masked format for display: +40721***001
  score: z.number().min(1).max(5),
  classification: LeadClassificationSchema,
  source: LeadSourceSchema,
  time: z.string(), // Relative time: "acum 5 min"
});

// Schema pentru statistici Dashboard
export const DashboardStatsSchema = z.object({
  totalLeads: z.number(),
  activePatients: z.number(),
  urgentTriage: z.number(),
  appointmentsToday: z.number(),
  dailyRevenue: z.number().optional(),
});

// Re-export consolidated types for backward compatibility
export { LeadClassificationSchema, LeadSourceSchema };
export type { LeadClassification, LeadSource } from './schemas/lead.js';

// Inferred TypeScript types
export type PatientStatus = z.infer<typeof PatientStatusSchema>;
export type PatientListItem = z.infer<typeof PatientListItemSchema>;
export type RecentLead = z.infer<typeof RecentLeadSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
