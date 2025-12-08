/**
 * GDPR Article 30 Compliance Report Schemas
 *
 * Defines types and schemas for Records of Processing Activities (RoPA)
 * as required by GDPR Article 30.
 *
 * @module @medicalcor/types/article30
 * @see https://gdpr-info.eu/art-30-gdpr/
 */

import { z } from 'zod';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Legal basis for processing under GDPR Article 6
 */
export const Article30LegalBasisSchema = z.enum([
  'consent', // Art. 6(1)(a) - Consent
  'contract', // Art. 6(1)(b) - Contract performance
  'legal_obligation', // Art. 6(1)(c) - Legal obligation
  'vital_interests', // Art. 6(1)(d) - Vital interests
  'public_task', // Art. 6(1)(e) - Public task
  'legitimate_interests', // Art. 6(1)(f) - Legitimate interests
]);
export type Article30LegalBasis = z.infer<typeof Article30LegalBasisSchema>;

/**
 * Data category types
 */
export const Article30DataCategorySchema = z.enum([
  'personal', // Basic personal data (name, etc.)
  'contact', // Contact information (email, phone, address)
  'demographic', // Demographic data (age, gender, etc.)
  'financial', // Financial data (payment info, invoices)
  'health', // Health data (medical records, treatments)
  'biometric', // Biometric data
  'behavioral', // Behavioral data (preferences, interactions)
  'location', // Location data
  'genetic', // Genetic data
  'special_category', // Special category data (Art. 9)
]);
export type Article30DataCategory = z.infer<typeof Article30DataCategorySchema>;

/**
 * Data subject types
 */
export const Article30DataSubjectTypeSchema = z.enum([
  'patients',
  'leads',
  'staff',
  'practitioners',
  'suppliers',
  'visitors',
  'contractors',
]);
export type Article30DataSubjectType = z.infer<typeof Article30DataSubjectTypeSchema>;

/**
 * Recipient types
 */
export const Article30RecipientTypeSchema = z.enum([
  'internal', // Internal departments
  'processor', // Data processor
  'controller', // Joint controller
  'public_authority', // Government/regulatory
  'third_party', // Third party (e.g., partners)
]);
export type Article30RecipientType = z.infer<typeof Article30RecipientTypeSchema>;

/**
 * Transfer safeguard types for international transfers
 */
export const Article30TransferSafeguardSchema = z.enum([
  'adequacy_decision', // EU adequacy decision
  'standard_contractual_clauses', // SCCs
  'binding_corporate_rules', // BCRs
  'approved_code_of_conduct', // Approved code of conduct
  'certification', // GDPR certification
  'explicit_consent', // Explicit data subject consent
  'derogation', // Art. 49 derogation
  'none', // No safeguard (for EU transfers)
]);
export type Article30TransferSafeguard = z.infer<typeof Article30TransferSafeguardSchema>;

/**
 * Report status
 */
export const Article30ReportStatusSchema = z.enum([
  'draft', // Draft report
  'pending_review', // Awaiting DPO review
  'approved', // Approved by DPO
  'published', // Published/finalized
  'archived', // Archived (superseded by newer version)
]);
export type Article30ReportStatus = z.infer<typeof Article30ReportStatusSchema>;

/**
 * Report frequency
 */
export const Article30ReportFrequencySchema = z.enum([
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
  'on_demand',
]);
export type Article30ReportFrequency = z.infer<typeof Article30ReportFrequencySchema>;

// =============================================================================
// DATA RECIPIENT SCHEMA
// =============================================================================

/**
 * Data recipient information
 */
export const Article30DataRecipientSchema = z.object({
  /** Recipient name */
  name: z.string(),
  /** Type of recipient */
  type: Article30RecipientTypeSchema,
  /** Purpose of sharing */
  purpose: z.string(),
  /** Country code (ISO 3166-1 alpha-2) */
  country: z.string().length(2).optional(),
  /** Whether this is an international transfer */
  isInternationalTransfer: z.boolean().default(false),
  /** Transfer safeguard if international */
  transferSafeguard: Article30TransferSafeguardSchema.optional(),
  /** Contract/agreement reference */
  contractReference: z.string().optional(),
});
export type Article30DataRecipient = z.infer<typeof Article30DataRecipientSchema>;

// =============================================================================
// PROCESSING ACTIVITY SCHEMA
// =============================================================================

/**
 * Individual processing activity for Article 30 RoPA
 */
export const Article30ProcessingActivitySchema = z.object({
  /** Unique activity identifier */
  activityId: z.string(),
  /** Activity name */
  name: z.string(),
  /** Detailed description */
  description: z.string(),
  /** Purpose of processing */
  purpose: z.string(),
  /** Legal basis for processing */
  legalBasis: Article30LegalBasisSchema,
  /** Legitimate interest assessment (if legalBasis is legitimate_interests) */
  legitimateInterestAssessment: z.string().optional(),
  /** Categories of personal data processed */
  dataCategories: z.array(Article30DataCategorySchema),
  /** Types of data subjects */
  dataSubjectTypes: z.array(z.string()),
  /** Whether special category data is processed */
  specialCategoryData: z.boolean().default(false),
  /** Art. 9 condition if special category data */
  specialCategoryCondition: z.string().optional(),
  /** Data recipients */
  recipients: z.array(Article30DataRecipientSchema),
  /** Retention period (human readable) */
  retentionPeriod: z.string(),
  /** Retention period in days (for calculations) */
  retentionDays: z.number().optional(),
  /** Retention policy reference */
  retentionPolicyReference: z.string().optional(),
  /** Security measures description */
  securityMeasures: z.array(z.string()),
  /** Whether encryption at rest is used */
  encryptionAtRest: z.boolean().default(true),
  /** Whether encryption in transit is used */
  encryptionInTransit: z.boolean().default(true),
  /** Whether transfers outside EU occur */
  transfersOutsideEU: z.boolean().default(false),
  /** Transfer safeguards for international transfers */
  transferSafeguards: z.array(Article30TransferSafeguardSchema).optional(),
  /** Countries data is transferred to */
  transferCountries: z.array(z.string()).optional(),
  /** Whether DPIA is required */
  dpiaRequired: z.boolean().default(false),
  /** DPIA reference if conducted */
  dpiaReference: z.string().optional(),
  /** Risk level assessment */
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  /** System/application used for processing */
  processingSystem: z.string().optional(),
  /** Department responsible */
  responsibleDepartment: z.string().optional(),
  /** Whether activity is currently active */
  isActive: z.boolean().default(true),
  /** Last review date */
  lastReviewedAt: z.coerce.date().optional(),
  /** Reviewed by (user ID) */
  reviewedBy: z.string().optional(),
  /** Created timestamp */
  createdAt: z.coerce.date(),
  /** Updated timestamp */
  updatedAt: z.coerce.date(),
});
export type Article30ProcessingActivity = z.infer<typeof Article30ProcessingActivitySchema>;

// =============================================================================
// CONTROLLER/PROCESSOR INFO SCHEMA
// =============================================================================

/**
 * Data controller information
 */
export const Article30ControllerInfoSchema = z.object({
  /** Controller name (organization) */
  name: z.string(),
  /** Address */
  address: z.string(),
  /** Country */
  country: z.string(),
  /** Contact email */
  email: z.string().email(),
  /** Contact phone */
  phone: z.string().optional(),
  /** DPO name */
  dpoName: z.string().optional(),
  /** DPO contact email */
  dpoEmail: z.string().email().optional(),
  /** DPO contact phone */
  dpoPhone: z.string().optional(),
  /** EU representative (if controller outside EU) */
  euRepresentative: z
    .object({
      name: z.string(),
      address: z.string(),
      email: z.string().email(),
    })
    .optional(),
});
export type Article30ControllerInfo = z.infer<typeof Article30ControllerInfoSchema>;

// =============================================================================
// CONSENT SUMMARY SCHEMA
// =============================================================================

/**
 * Summary of consent records for the report
 */
export const Article30ConsentSummarySchema = z.object({
  /** Consent type */
  consentType: z.string(),
  /** Number of active consents */
  activeCount: z.number(),
  /** Number of withdrawn consents */
  withdrawnCount: z.number(),
  /** Number of expired consents */
  expiredCount: z.number(),
  /** Total consents ever granted */
  totalGranted: z.number(),
  /** Average age of consents in days */
  averageAgeInDays: z.number().optional(),
});
export type Article30ConsentSummary = z.infer<typeof Article30ConsentSummarySchema>;

// =============================================================================
// DATA BREACH SUMMARY SCHEMA
// =============================================================================

/**
 * Summary of data breaches for the report period
 */
export const Article30DataBreachSummarySchema = z.object({
  /** Total breaches in period */
  totalBreaches: z.number(),
  /** Breaches reported to supervisory authority */
  reportedToAuthority: z.number(),
  /** Breaches notified to data subjects */
  notifiedToSubjects: z.number(),
  /** Breaches by risk level */
  byRiskLevel: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical: z.number(),
  }),
});
export type Article30DataBreachSummary = z.infer<typeof Article30DataBreachSummarySchema>;

// =============================================================================
// DSR (DATA SUBJECT REQUEST) SUMMARY SCHEMA
// =============================================================================

/**
 * Summary of Data Subject Requests for the report period
 */
export const Article30DSRSummarySchema = z.object({
  /** Total DSRs received */
  totalReceived: z.number(),
  /** DSRs completed */
  completed: z.number(),
  /** DSRs pending */
  pending: z.number(),
  /** DSRs rejected */
  rejected: z.number(),
  /** DSRs overdue */
  overdue: z.number(),
  /** Average response time in days */
  averageResponseTimeDays: z.number().optional(),
  /** Breakdown by type */
  byType: z.object({
    access: z.number(), // Art. 15
    rectification: z.number(), // Art. 16
    erasure: z.number(), // Art. 17
    restriction: z.number(), // Art. 18
    portability: z.number(), // Art. 20
    objection: z.number(), // Art. 21
  }),
});
export type Article30DSRSummary = z.infer<typeof Article30DSRSummarySchema>;

// =============================================================================
// ARTICLE 30 REPORT SCHEMA
// =============================================================================

/**
 * Complete GDPR Article 30 Records of Processing Activities Report
 */
export const Article30ReportSchema = z.object({
  /** Unique report identifier */
  reportId: z.string().uuid(),
  /** Report version number */
  version: z.number().int().positive(),
  /** Report title */
  title: z.string(),
  /** Report period start */
  periodStart: z.coerce.date(),
  /** Report period end */
  periodEnd: z.coerce.date(),
  /** Report generation timestamp */
  generatedAt: z.coerce.date(),
  /** Generated by (system or user) */
  generatedBy: z.string(),
  /** Report status */
  status: Article30ReportStatusSchema,
  /** Report frequency */
  frequency: Article30ReportFrequencySchema.optional(),

  // Controller/Organization info
  /** Data controller information */
  controller: Article30ControllerInfoSchema,

  // Processing Activities
  /** All processing activities */
  processingActivities: z.array(Article30ProcessingActivitySchema),

  // Aggregated summaries
  /** Consent summary by type */
  consentSummary: z.array(Article30ConsentSummarySchema),
  /** Data breach summary for period */
  dataBreachSummary: Article30DataBreachSummarySchema.optional(),
  /** DSR summary for period */
  dsrSummary: Article30DSRSummarySchema.optional(),

  // Statistics
  /** Summary statistics */
  statistics: z.object({
    /** Total active processing activities */
    totalActivities: z.number(),
    /** Activities by legal basis */
    activitiesByLegalBasis: z.record(z.number()),
    /** Activities by risk level */
    activitiesByRiskLevel: z.record(z.number()),
    /** Activities with international transfers */
    activitiesWithTransfers: z.number(),
    /** Activities requiring DPIA */
    activitiesRequiringDPIA: z.number(),
    /** Activities processing special category data */
    activitiesWithSpecialCategory: z.number(),
    /** Total unique data categories processed */
    uniqueDataCategories: z.number(),
    /** Total unique recipients */
    uniqueRecipients: z.number(),
    /** Activities reviewed in last 12 months */
    activitiesReviewedLast12Months: z.number(),
    /** Activities needing review */
    activitiesNeedingReview: z.number(),
  }),

  // Audit trail
  /** Approval information */
  approval: z
    .object({
      approvedBy: z.string(),
      approvedAt: z.coerce.date(),
      comments: z.string().optional(),
    })
    .optional(),

  /** Previous report reference (for version tracking) */
  previousReportId: z.string().uuid().optional(),

  /** Notes/comments */
  notes: z.string().optional(),

  /** Metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type Article30Report = z.infer<typeof Article30ReportSchema>;

// =============================================================================
// REPORT GENERATION REQUEST SCHEMA
// =============================================================================

/**
 * Request to generate an Article 30 report
 */
export const GenerateArticle30ReportRequestSchema = z.object({
  /** Report period start (defaults to start of current year) */
  periodStart: z.coerce.date().optional(),
  /** Report period end (defaults to now) */
  periodEnd: z.coerce.date().optional(),
  /** Report title (defaults to "GDPR Article 30 RoPA Report") */
  title: z.string().optional(),
  /** Report frequency classification */
  frequency: Article30ReportFrequencySchema.optional(),
  /** Include data breach summary */
  includeDataBreaches: z.boolean().default(true),
  /** Include DSR summary */
  includeDSRSummary: z.boolean().default(true),
  /** Include consent summary */
  includeConsentSummary: z.boolean().default(true),
  /** Clinic/organization ID filter */
  clinicId: z.string().uuid().optional(),
  /** Requester correlation ID */
  correlationId: z.string().optional(),
  /** Notes to include */
  notes: z.string().optional(),
});
export type GenerateArticle30ReportRequest = z.infer<typeof GenerateArticle30ReportRequestSchema>;

// =============================================================================
// SCHEDULED REPORT CONFIG SCHEMA
// =============================================================================

/**
 * Configuration for scheduled Article 30 report generation
 */
export const Article30ScheduledReportConfigSchema = z.object({
  /** Unique config ID */
  configId: z.string().uuid(),
  /** Clinic/organization ID */
  clinicId: z.string().uuid().optional(),
  /** Report frequency */
  frequency: Article30ReportFrequencySchema,
  /** Day of month for monthly reports (1-28) */
  dayOfMonth: z.number().min(1).max(28).optional(),
  /** Month for annual reports (1-12) */
  monthOfYear: z.number().min(1).max(12).optional(),
  /** Whether auto-approve is enabled */
  autoApprove: z.boolean().default(false),
  /** Email recipients for generated reports */
  emailRecipients: z.array(z.string().email()).optional(),
  /** Whether to send to DPO automatically */
  sendToDPO: z.boolean().default(true),
  /** Whether config is active */
  isActive: z.boolean().default(true),
  /** Created timestamp */
  createdAt: z.coerce.date(),
  /** Updated timestamp */
  updatedAt: z.coerce.date(),
  /** Created by user ID */
  createdBy: z.string(),
});
export type Article30ScheduledReportConfig = z.infer<typeof Article30ScheduledReportConfigSchema>;

// =============================================================================
// REPORT EXPORT FORMAT
// =============================================================================

/**
 * Export format for Article 30 reports
 */
export const Article30ExportFormatSchema = z.enum([
  'json', // JSON format
  'pdf', // PDF document
  'html', // HTML document
  'csv', // CSV spreadsheet
  'xlsx', // Excel spreadsheet
]);
export type Article30ExportFormat = z.infer<typeof Article30ExportFormatSchema>;

// =============================================================================
// CRON JOB PAYLOAD SCHEMA
// =============================================================================

/**
 * Payload for the Article 30 report generation cron job
 */
export const Article30CronJobPayloadSchema = z.object({
  /** Config ID for scheduled report */
  configId: z.string().uuid().optional(),
  /** Force generation even if recent report exists */
  force: z.boolean().default(false),
  /** Override frequency for this run */
  frequency: Article30ReportFrequencySchema.optional(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});
export type Article30CronJobPayload = z.infer<typeof Article30CronJobPayloadSchema>;

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Event emitted when Article 30 report is generated
 */
export const Article30ReportGeneratedEventSchema = z.object({
  type: z.literal('gdpr.article30_report_generated'),
  reportId: z.string().uuid(),
  version: z.number(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  status: Article30ReportStatusSchema,
  totalActivities: z.number(),
  generatedBy: z.string(),
  correlationId: z.string(),
  timestamp: z.coerce.date(),
});
export type Article30ReportGeneratedEvent = z.infer<typeof Article30ReportGeneratedEventSchema>;

/**
 * Event emitted when Article 30 report is approved
 */
export const Article30ReportApprovedEventSchema = z.object({
  type: z.literal('gdpr.article30_report_approved'),
  reportId: z.string().uuid(),
  version: z.number(),
  approvedBy: z.string(),
  comments: z.string().optional(),
  correlationId: z.string(),
  timestamp: z.coerce.date(),
});
export type Article30ReportApprovedEvent = z.infer<typeof Article30ReportApprovedEventSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get human-readable label for legal basis
 */
export function getLegalBasisLabel(basis: Article30LegalBasis): string {
  const labels: Record<Article30LegalBasis, string> = {
    consent: 'Consent (Art. 6(1)(a))',
    contract: 'Contract Performance (Art. 6(1)(b))',
    legal_obligation: 'Legal Obligation (Art. 6(1)(c))',
    vital_interests: 'Vital Interests (Art. 6(1)(d))',
    public_task: 'Public Task (Art. 6(1)(e))',
    legitimate_interests: 'Legitimate Interests (Art. 6(1)(f))',
  };
  return labels[basis];
}

/**
 * Get human-readable label for data category
 */
export function getDataCategoryLabel(category: Article30DataCategory): string {
  const labels: Record<Article30DataCategory, string> = {
    personal: 'Personal Data',
    contact: 'Contact Information',
    demographic: 'Demographic Data',
    financial: 'Financial Data',
    health: 'Health Data',
    biometric: 'Biometric Data',
    behavioral: 'Behavioral Data',
    location: 'Location Data',
    genetic: 'Genetic Data',
    special_category: 'Special Category Data',
  };
  return labels[category];
}

/**
 * Check if a processing activity needs review (older than 12 months)
 */
export function activityNeedsReview(activity: Article30ProcessingActivity): boolean {
  if (!activity.lastReviewedAt) return true;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  return new Date(activity.lastReviewedAt) < twelveMonthsAgo;
}

/**
 * Calculate report statistics from processing activities
 */
export function calculateReportStatistics(
  activities: Article30ProcessingActivity[]
): Article30Report['statistics'] {
  const activitiesByLegalBasis: Record<string, number> = {};
  const activitiesByRiskLevel: Record<string, number> = {};
  const uniqueCategories = new Set<string>();
  const uniqueRecipients = new Set<string>();

  let activitiesWithTransfers = 0;
  let activitiesRequiringDPIA = 0;
  let activitiesWithSpecialCategory = 0;
  let activitiesReviewedLast12Months = 0;
  let activitiesNeedingReview = 0;

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  for (const activity of activities) {
    if (!activity.isActive) continue;

    // Legal basis
    activitiesByLegalBasis[activity.legalBasis] =
      (activitiesByLegalBasis[activity.legalBasis] ?? 0) + 1;

    // Risk level
    activitiesByRiskLevel[activity.riskLevel] =
      (activitiesByRiskLevel[activity.riskLevel] ?? 0) + 1;

    // Data categories
    for (const cat of activity.dataCategories) {
      uniqueCategories.add(cat);
    }

    // Recipients
    for (const recipient of activity.recipients) {
      uniqueRecipients.add(recipient.name);
    }

    // Transfers
    if (activity.transfersOutsideEU) {
      activitiesWithTransfers++;
    }

    // DPIA
    if (activity.dpiaRequired) {
      activitiesRequiringDPIA++;
    }

    // Special category
    if (activity.specialCategoryData) {
      activitiesWithSpecialCategory++;
    }

    // Review status
    if (activity.lastReviewedAt && new Date(activity.lastReviewedAt) >= twelveMonthsAgo) {
      activitiesReviewedLast12Months++;
    } else {
      activitiesNeedingReview++;
    }
  }

  return {
    totalActivities: activities.filter((a) => a.isActive).length,
    activitiesByLegalBasis,
    activitiesByRiskLevel,
    activitiesWithTransfers,
    activitiesRequiringDPIA,
    activitiesWithSpecialCategory,
    uniqueDataCategories: uniqueCategories.size,
    uniqueRecipients: uniqueRecipients.size,
    activitiesReviewedLast12Months,
    activitiesNeedingReview,
  };
}
