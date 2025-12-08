/**
 * GDPR Data Breach Notification Schemas
 *
 * Implements GDPR Article 33 (Notification to supervisory authority)
 * and Article 34 (Communication to data subject) requirements.
 *
 * Key requirements:
 * - 72-hour notification to supervisory authority for high-risk breaches
 * - Communication to affected individuals when high risk to rights/freedoms
 * - Comprehensive documentation and audit trail
 *
 * @module @medicalcor/types/schemas/breach-notification
 */

import { z } from 'zod';

// =============================================================================
// Enums & Status Types
// =============================================================================

/**
 * Breach severity levels based on GDPR risk assessment
 */
export const BreachSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Type of data affected in the breach
 */
export const BreachDataCategorySchema = z.enum([
  'personal_data', // Name, address, phone
  'health_data', // Medical records, treatment plans (special category)
  'financial_data', // Payment info, insurance
  'biometric_data', // Dental scans, photos
  'genetic_data', // DNA, genetic markers
  'location_data', // GPS, address history
  'identification_data', // SSN, passport, ID numbers
]);

/**
 * Nature of the breach
 */
export const BreachNatureSchema = z.enum([
  'confidentiality', // Unauthorized disclosure
  'integrity', // Unauthorized alteration
  'availability', // Loss of access
]);

/**
 * Breach status in the workflow
 */
export const BreachStatusSchema = z.enum([
  'detected', // Initial detection
  'investigating', // Under investigation
  'assessed', // Risk assessment complete
  'notifying_authority', // 72h authority notification in progress
  'notifying_subjects', // Subject notification in progress
  'mitigating', // Remediation in progress
  'resolved', // Breach resolved
  'closed', // Case closed with full documentation
]);

/**
 * Notification channel for subject notifications
 */
export const BreachNotificationChannelSchema = z.enum([
  'email',
  'whatsapp',
  'sms',
  'letter', // Physical mail
  'phone',
  'in_app', // App notification
]);

// =============================================================================
// Core Breach Record Schema
// =============================================================================

/**
 * Affected data subject (individual whose data was breached)
 */
export const AffectedSubjectSchema = z.object({
  /** Internal contact/patient ID */
  contactId: z.string(),
  /** Phone number (for notifications) */
  phone: z.string().optional(),
  /** Email address (for notifications) */
  email: z.string().email().optional(),
  /** Full name */
  name: z.string().optional(),
  /** Categories of data affected for this subject */
  dataCategories: z.array(BreachDataCategorySchema),
  /** Whether this subject has been notified */
  notified: z.boolean().default(false),
  /** When subject was notified */
  notifiedAt: z.string().datetime().optional(),
  /** Channel used for notification */
  notificationChannel: BreachNotificationChannelSchema.optional(),
});

/**
 * Measures taken to address the breach
 */
export const BreachMeasureSchema = z.object({
  /** Description of the measure */
  description: z.string(),
  /** When the measure was implemented */
  implementedAt: z.string().datetime(),
  /** Who implemented the measure */
  implementedBy: z.string(),
  /** Whether this is a remediation or preventive measure */
  type: z.enum(['remediation', 'preventive', 'mitigation']),
});

/**
 * Authority notification record
 */
export const AuthorityNotificationSchema = z.object({
  /** Romanian: ANSPDCP, EU: respective DPA */
  authority: z.string(),
  /** When notification was sent */
  notifiedAt: z.string().datetime(),
  /** Reference number from authority */
  referenceNumber: z.string().optional(),
  /** Contact person at authority */
  contactPerson: z.string().optional(),
  /** Notes about the notification */
  notes: z.string().optional(),
});

/**
 * Main data breach record
 */
export const DataBreachSchema = z.object({
  /** Unique breach ID */
  id: z.string(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Clinic/organization ID */
  clinicId: z.string(),

  // Detection & Timeline
  /** When the breach was detected */
  detectedAt: z.string().datetime(),
  /** When the breach actually occurred (if known) */
  occurredAt: z.string().datetime().optional(),
  /** Who detected the breach */
  detectedBy: z.string(),
  /** How the breach was detected */
  detectionMethod: z.string(),

  // Classification
  /** Nature of the breach */
  nature: z.array(BreachNatureSchema).min(1),
  /** Categories of data affected */
  dataCategories: z.array(BreachDataCategorySchema).min(1),
  /** Severity assessment */
  severity: BreachSeveritySchema,
  /** Current status */
  status: BreachStatusSchema,

  // Description
  /** Brief description of what happened */
  description: z.string(),
  /** Detailed description for internal use */
  internalNotes: z.string().optional(),
  /** Root cause (if identified) */
  rootCause: z.string().optional(),

  // Impact Assessment
  /** Approximate number of affected individuals */
  affectedCount: z.number().int().min(0),
  /** Approximate number of affected records */
  affectedRecordsCount: z.number().int().min(0).optional(),
  /** List of affected subjects (for targeted notifications) */
  affectedSubjects: z.array(AffectedSubjectSchema).optional(),
  /** Potential consequences for data subjects */
  potentialConsequences: z.array(z.string()),
  /** Whether the breach poses high risk to rights/freedoms */
  highRiskToSubjects: z.boolean(),

  // Notifications
  /** Whether DPO has been notified */
  dpoNotified: z.boolean().default(false),
  /** When DPO was notified */
  dpoNotifiedAt: z.string().datetime().optional(),
  /** Whether authority notification is required (72h rule) */
  authorityNotificationRequired: z.boolean(),
  /** Authority notification details */
  authorityNotification: AuthorityNotificationSchema.optional(),
  /** Whether subject notification is required */
  subjectNotificationRequired: z.boolean(),
  /** Count of subjects notified */
  subjectsNotifiedCount: z.number().int().min(0).default(0),

  // Response & Mitigation
  /** Measures taken to address the breach */
  measuresTaken: z.array(BreachMeasureSchema).default([]),

  // Metadata
  /** When record was created */
  createdAt: z.string().datetime(),
  /** When record was last updated */
  updatedAt: z.string().datetime(),
  /** Who last updated the record */
  updatedBy: z.string(),
});

// =============================================================================
// Workflow Payload Schemas
// =============================================================================

/**
 * Payload for reporting a new breach
 */
export const ReportBreachPayloadSchema = z.object({
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Clinic ID */
  clinicId: z.string(),
  /** Who is reporting */
  reportedBy: z.string(),
  /** When detected */
  detectedAt: z.string().datetime().optional(),
  /** How it was detected */
  detectionMethod: z.string(),
  /** Description of what happened */
  description: z.string(),
  /** Nature of the breach */
  nature: z.array(BreachNatureSchema).min(1),
  /** Categories of data affected */
  dataCategories: z.array(BreachDataCategorySchema).min(1),
  /** Estimated affected count */
  estimatedAffectedCount: z.number().int().min(0),
  /** IDs of affected contacts (if known) */
  affectedContactIds: z.array(z.string()).optional(),
});

/**
 * Payload for the breach notification workflow
 */
export const BreachNotificationWorkflowPayloadSchema = z.object({
  /** Breach ID */
  breachId: z.string(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

/**
 * Payload for notifying a single subject
 */
export const NotifySubjectPayloadSchema = z.object({
  /** Breach ID */
  breachId: z.string(),
  /** Subject contact ID */
  contactId: z.string(),
  /** Preferred notification channel */
  channel: BreachNotificationChannelSchema,
  /** Correlation ID */
  correlationId: z.string(),
});

/**
 * Payload for notifying the supervisory authority
 */
export const NotifyAuthorityPayloadSchema = z.object({
  /** Breach ID */
  breachId: z.string(),
  /** Authority identifier (e.g., 'ANSPDCP' for Romania) */
  authority: z.string(),
  /** Correlation ID */
  correlationId: z.string(),
});

// =============================================================================
// Event Schemas
// =============================================================================

/**
 * Base event schema for breach events
 */
const BreachEventBaseSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  correlationId: z.string(),
  breachId: z.string(),
  clinicId: z.string(),
});

/**
 * Breach detected event
 */
export const BreachDetectedEventSchema = BreachEventBaseSchema.extend({
  type: z.literal('breach.detected'),
  payload: z.object({
    severity: BreachSeveritySchema,
    dataCategories: z.array(BreachDataCategorySchema),
    estimatedAffectedCount: z.number(),
    detectedBy: z.string(),
  }),
});

/**
 * Breach assessed event
 */
export const BreachAssessedEventSchema = BreachEventBaseSchema.extend({
  type: z.literal('breach.assessed'),
  payload: z.object({
    severity: BreachSeveritySchema,
    highRiskToSubjects: z.boolean(),
    authorityNotificationRequired: z.boolean(),
    subjectNotificationRequired: z.boolean(),
    affectedCount: z.number(),
  }),
});

/**
 * Authority notified event
 */
export const BreachAuthorityNotifiedEventSchema = BreachEventBaseSchema.extend({
  type: z.literal('breach.authority_notified'),
  payload: z.object({
    authority: z.string(),
    notifiedAt: z.string().datetime(),
    referenceNumber: z.string().optional(),
    withinDeadline: z.boolean(),
    hoursFromDetection: z.number(),
  }),
});

/**
 * Subject notified event
 */
export const BreachSubjectNotifiedEventSchema = BreachEventBaseSchema.extend({
  type: z.literal('breach.subject_notified'),
  payload: z.object({
    contactId: z.string(),
    channel: BreachNotificationChannelSchema,
    success: z.boolean(),
    errorReason: z.string().optional(),
  }),
});

/**
 * Breach resolved event
 */
export const BreachResolvedEventSchema = BreachEventBaseSchema.extend({
  type: z.literal('breach.resolved'),
  payload: z.object({
    resolvedAt: z.string().datetime(),
    resolvedBy: z.string(),
    measuresTakenCount: z.number(),
    subjectsNotified: z.number(),
    authorityNotified: z.boolean(),
  }),
});

/**
 * Union of all breach events
 */
export const BreachEventSchema = z.discriminatedUnion('type', [
  BreachDetectedEventSchema,
  BreachAssessedEventSchema,
  BreachAuthorityNotifiedEventSchema,
  BreachSubjectNotifiedEventSchema,
  BreachResolvedEventSchema,
]);

// =============================================================================
// Dashboard & Analytics Schemas
// =============================================================================

/**
 * Breach summary for dashboard
 */
export const BreachSummarySchema = z.object({
  totalBreaches: z.number(),
  activeBreaches: z.number(),
  resolvedBreaches: z.number(),
  averageResolutionTimeHours: z.number().optional(),
  bySeverity: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  byStatus: z.record(z.number()),
  authorityNotificationCompliance: z.object({
    total: z.number(),
    withinDeadline: z.number(),
    complianceRate: z.number(), // Percentage 0-100
  }),
});

/**
 * Configuration for breach notification
 */
export const BreachNotificationConfigSchema = z.object({
  /** Default authority for notifications (e.g., 'ANSPDCP') */
  defaultAuthority: z.string().default('ANSPDCP'),
  /** DPO email for notifications */
  dpoEmail: z.string().email(),
  /** DPO phone for urgent notifications */
  dpoPhone: z.string().optional(),
  /** Hours before authority deadline to send warning (default 48h) */
  authorityDeadlineWarningHours: z.number().default(48),
  /** Channels to use for subject notifications (in priority order) */
  subjectNotificationChannels: z
    .array(BreachNotificationChannelSchema)
    .default(['email', 'whatsapp']),
  /** Whether to auto-notify subjects for high-risk breaches */
  autoNotifySubjectsForHighRisk: z.boolean().default(false),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate hours remaining until 72h authority notification deadline
 */
export function calculateHoursUntilDeadline(detectedAt: string): number {
  const detected = new Date(detectedAt);
  const deadline = new Date(detected.getTime() + 72 * 60 * 60 * 1000);
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
  return Math.max(0, hoursRemaining);
}

/**
 * Check if breach requires authority notification based on severity
 */
export function requiresAuthorityNotification(
  severity: BreachSeverity,
  highRiskToSubjects: boolean
): boolean {
  // GDPR Article 33: Notify unless "unlikely to result in a risk to rights and freedoms"
  return severity === 'critical' || severity === 'high' || highRiskToSubjects;
}

/**
 * Check if breach requires subject notification
 */
export function requiresSubjectNotification(
  severity: BreachSeverity,
  highRiskToSubjects: boolean
): boolean {
  // GDPR Article 34: Notify when "likely to result in a high risk to rights and freedoms"
  return highRiskToSubjects || severity === 'critical';
}

/**
 * Determine severity based on data categories and breach nature
 */
export function assessBreachSeverity(
  dataCategories: BreachDataCategory[],
  nature: BreachNature[],
  affectedCount: number
): BreachSeverity {
  // Special category data (health, genetic, biometric) = higher severity
  const hasSpecialCategory = dataCategories.some((cat) =>
    ['health_data', 'genetic_data', 'biometric_data'].includes(cat)
  );

  // Financial or identification data = higher severity
  const hasSensitiveData = dataCategories.some((cat) =>
    ['financial_data', 'identification_data'].includes(cat)
  );

  // Confidentiality breach with special category = critical
  if (hasSpecialCategory && nature.includes('confidentiality')) {
    return affectedCount > 100 ? 'critical' : 'high';
  }

  // Special category with any nature = high
  if (hasSpecialCategory) {
    return 'high';
  }

  // Sensitive data breach
  if (hasSensitiveData && nature.includes('confidentiality')) {
    return affectedCount > 500 ? 'high' : 'medium';
  }

  // Large-scale breach
  if (affectedCount > 1000) {
    return 'high';
  }

  if (affectedCount > 100) {
    return 'medium';
  }

  return 'low';
}

// =============================================================================
// Type Exports
// =============================================================================

export type BreachSeverity = z.infer<typeof BreachSeveritySchema>;
export type BreachDataCategory = z.infer<typeof BreachDataCategorySchema>;
export type BreachNature = z.infer<typeof BreachNatureSchema>;
export type BreachStatus = z.infer<typeof BreachStatusSchema>;
export type BreachNotificationChannel = z.infer<typeof BreachNotificationChannelSchema>;
export type AffectedSubject = z.infer<typeof AffectedSubjectSchema>;
export type BreachMeasure = z.infer<typeof BreachMeasureSchema>;
export type AuthorityNotification = z.infer<typeof AuthorityNotificationSchema>;
export type DataBreach = z.infer<typeof DataBreachSchema>;
export type ReportBreachPayload = z.infer<typeof ReportBreachPayloadSchema>;
export type BreachNotificationWorkflowPayload = z.infer<
  typeof BreachNotificationWorkflowPayloadSchema
>;
export type NotifySubjectPayload = z.infer<typeof NotifySubjectPayloadSchema>;
export type NotifyAuthorityPayload = z.infer<typeof NotifyAuthorityPayloadSchema>;
export type BreachDetectedEvent = z.infer<typeof BreachDetectedEventSchema>;
export type BreachAssessedEvent = z.infer<typeof BreachAssessedEventSchema>;
export type BreachAuthorityNotifiedEvent = z.infer<typeof BreachAuthorityNotifiedEventSchema>;
export type BreachSubjectNotifiedEvent = z.infer<typeof BreachSubjectNotifiedEventSchema>;
export type BreachResolvedEvent = z.infer<typeof BreachResolvedEventSchema>;
export type BreachEvent = z.infer<typeof BreachEventSchema>;
export type BreachSummary = z.infer<typeof BreachSummarySchema>;
export type BreachNotificationConfig = z.infer<typeof BreachNotificationConfigSchema>;
