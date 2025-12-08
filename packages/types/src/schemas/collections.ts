/**
 * @fileoverview Collections & Overdue Payment Schemas
 *
 * M5 Feature: Automated collections for overdue payment reminders.
 * Defines types for tracking overdue installments and payment reminders.
 *
 * @module types/schemas/collections
 */

import { z } from 'zod';

// ============================================================================
// OVERDUE INSTALLMENT STATUS
// ============================================================================

/**
 * Installment status tracking for payment plans
 */
export const InstallmentStatusSchema = z.enum([
  'pending', // Not yet due
  'overdue', // Past due date
  'paid', // Fully paid
  'skipped', // Skipped (e.g., payment holiday)
  'cancelled', // Plan cancelled
]);

export type InstallmentStatus = z.infer<typeof InstallmentStatusSchema>;

// ============================================================================
// REMINDER ESCALATION LEVELS
// ============================================================================

/**
 * Reminder escalation levels for collections workflow
 */
export const ReminderLevelSchema = z.enum([
  'first', // Initial gentle reminder (day 1-3 after due)
  'second', // Follow-up reminder (day 7-10 after due)
  'final', // Final notice before escalation (day 14-21 after due)
  'escalated', // Handed off to collections/staff
]);

export type ReminderLevel = z.infer<typeof ReminderLevelSchema>;

// ============================================================================
// OVERDUE INSTALLMENT
// ============================================================================

/**
 * Overdue installment with lead/case context for reminders
 */
export const OverdueInstallmentSchema = z.object({
  /** Installment ID */
  installmentId: z.string().uuid(),
  /** Parent payment plan ID */
  paymentPlanId: z.string().uuid(),
  /** Associated case ID */
  caseId: z.string().uuid(),
  /** Clinic ID for multi-tenant filtering */
  clinicId: z.string().uuid(),
  /** Lead/patient ID */
  leadId: z.string().uuid(),

  // Installment details
  /** Installment number in the plan */
  installmentNumber: z.number().int().positive(),
  /** Amount due for this installment */
  amountDue: z.number().positive(),
  /** Currency code */
  currency: z.string().length(3).default('EUR'),
  /** Original due date */
  dueDate: z.coerce.date(),
  /** Days past due */
  daysOverdue: z.number().int().min(0),

  // Reminder tracking
  /** Current reminder count */
  reminderCount: z.number().int().min(0).default(0),
  /** Last reminder sent timestamp */
  lastReminderSentAt: z.coerce.date().nullable().default(null),
  /** Current reminder level */
  reminderLevel: ReminderLevelSchema.nullable().default(null),

  // Late fees
  /** Late fee applied */
  lateFeeApplied: z.number().min(0).default(0),
  /** Total amount owed (installment + late fee) */
  totalOwed: z.number().positive(),

  // Lead contact info for sending reminders
  /** Lead's phone number (E.164 format) */
  phone: z.string().min(1),
  /** Lead's full name */
  fullName: z.string().min(1),
  /** Lead's email (optional) */
  email: z.string().email().nullable().optional(),
  /** Preferred language for communication */
  language: z.enum(['ro', 'en', 'de']).default('ro'),

  // Case context
  /** Total outstanding for the entire case */
  caseOutstandingAmount: z.number().min(0),
  /** Payment plan frequency */
  planFrequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']),
  /** Total installments in the plan */
  totalInstallments: z.number().int().positive(),
  /** Installments already paid */
  installmentsPaid: z.number().int().min(0),

  // HubSpot integration
  /** HubSpot contact ID if synced */
  hubspotContactId: z.string().nullable().optional(),
});

export type OverdueInstallment = z.infer<typeof OverdueInstallmentSchema>;

// ============================================================================
// REMINDER CONFIGURATION
// ============================================================================

/**
 * Configuration for reminder escalation timing
 */
export const ReminderConfigSchema = z.object({
  /** Days after due date for first reminder */
  firstReminderDays: z.number().int().min(1).default(1),
  /** Days after due date for second reminder */
  secondReminderDays: z.number().int().min(1).default(7),
  /** Days after due date for final reminder */
  finalReminderDays: z.number().int().min(1).default(14),
  /** Days after due date to escalate to staff */
  escalationDays: z.number().int().min(1).default(21),
  /** Minimum days between reminders */
  minDaysBetweenReminders: z.number().int().min(1).default(3),
  /** Maximum reminders before escalation */
  maxReminders: z.number().int().min(1).default(3),
  /** Apply late fee after this many days */
  lateFeeAfterDays: z.number().int().min(1).default(7),
  /** Late fee percentage (e.g., 0.05 for 5%) */
  lateFeePercentage: z.number().min(0).max(1).default(0),
});

export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

// ============================================================================
// PAYMENT REMINDER PAYLOAD
// ============================================================================

/**
 * Payload for triggering a payment reminder task
 */
export const PaymentReminderPayloadSchema = z.object({
  /** Overdue installment to remind about */
  installment: OverdueInstallmentSchema,
  /** Reminder level for this notification */
  reminderLevel: ReminderLevelSchema,
  /** Template name to use */
  templateName: z.string(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Scheduled send time (optional delayed send) */
  scheduledFor: z.coerce.date().optional(),
  /** Whether to create HubSpot task on final/escalation */
  createFollowUpTask: z.boolean().default(false),
});

export type PaymentReminderPayload = z.infer<typeof PaymentReminderPayloadSchema>;

// ============================================================================
// OVERDUE DETECTION RESULT
// ============================================================================

/**
 * Result of overdue detection scan
 */
export const OverdueDetectionResultSchema = z.object({
  /** Scan timestamp */
  scannedAt: z.coerce.date(),
  /** Clinic ID scanned (null for all clinics) */
  clinicId: z.string().uuid().nullable(),
  /** Total overdue installments found */
  totalOverdue: z.number().int().min(0),
  /** Overdue by reminder level */
  byLevel: z.object({
    first: z.number().int().min(0),
    second: z.number().int().min(0),
    final: z.number().int().min(0),
    escalated: z.number().int().min(0),
  }),
  /** Total amount overdue */
  totalAmountOverdue: z.number().min(0),
  /** Reminders triggered in this scan */
  remindersTriggered: z.number().int().min(0),
  /** Errors encountered */
  errors: z.number().int().min(0),
  /** Correlation ID */
  correlationId: z.string(),
});

export type OverdueDetectionResult = z.infer<typeof OverdueDetectionResultSchema>;

// ============================================================================
// REMINDER SENT EVENT
// ============================================================================

/**
 * Domain event for payment reminder sent
 */
export const PaymentReminderSentEventSchema = z.object({
  type: z.literal('collection.reminder_sent'),
  installmentId: z.string().uuid(),
  paymentPlanId: z.string().uuid(),
  caseId: z.string().uuid(),
  leadId: z.string().uuid(),
  clinicId: z.string().uuid(),
  reminderLevel: ReminderLevelSchema,
  reminderCount: z.number().int().min(1),
  amountDue: z.number().positive(),
  daysOverdue: z.number().int().min(0),
  channel: z.enum(['whatsapp', 'sms', 'email']),
  sentAt: z.coerce.date(),
  correlationId: z.string(),
});

export type PaymentReminderSentEvent = z.infer<typeof PaymentReminderSentEventSchema>;

// ============================================================================
// ESCALATION EVENT
// ============================================================================

/**
 * Domain event for collection escalation
 */
export const CollectionEscalatedEventSchema = z.object({
  type: z.literal('collection.escalated'),
  installmentId: z.string().uuid(),
  paymentPlanId: z.string().uuid(),
  caseId: z.string().uuid(),
  leadId: z.string().uuid(),
  clinicId: z.string().uuid(),
  totalAmountDue: z.number().positive(),
  daysOverdue: z.number().int().positive(),
  remindersSent: z.number().int().min(0),
  hubspotTaskId: z.string().nullable(),
  escalatedAt: z.coerce.date(),
  correlationId: z.string(),
});

export type CollectionEscalatedEvent = z.infer<typeof CollectionEscalatedEventSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine the appropriate reminder level based on days overdue and config
 */
export function determineReminderLevel(
  daysOverdue: number,
  reminderCount: number,
  config: ReminderConfig
): ReminderLevel {
  if (reminderCount >= config.maxReminders || daysOverdue >= config.escalationDays) {
    return 'escalated';
  }
  if (daysOverdue >= config.finalReminderDays) {
    return 'final';
  }
  if (daysOverdue >= config.secondReminderDays) {
    return 'second';
  }
  return 'first';
}

/**
 * Get template name for reminder level
 */
export function getReminderTemplateName(level: ReminderLevel): string {
  const templates: Record<ReminderLevel, string> = {
    first: 'payment_reminder_first',
    second: 'payment_reminder_second',
    final: 'payment_reminder_final',
    escalated: 'payment_reminder_final', // Same as final for WhatsApp
  };
  return templates[level];
}

/**
 * Check if a reminder should be sent based on timing constraints
 */
export function shouldSendReminder(
  lastReminderSentAt: Date | null,
  minDaysBetweenReminders: number
): boolean {
  if (!lastReminderSentAt) {
    return true;
  }
  const now = new Date();
  const daysSinceLastReminder = Math.floor(
    (now.getTime() - lastReminderSentAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceLastReminder >= minDaysBetweenReminders;
}

/**
 * Calculate late fee based on config
 */
export function calculateLateFee(
  amount: number,
  daysOverdue: number,
  config: ReminderConfig
): number {
  if (daysOverdue < config.lateFeeAfterDays || config.lateFeePercentage === 0) {
    return 0;
  }
  return Math.round(amount * config.lateFeePercentage * 100) / 100;
}

/**
 * Format currency for display in reminders
 */
export function formatCurrencyForReminder(
  amount: number,
  currency: string,
  language: 'ro' | 'en' | 'de' = 'ro'
): string {
  const locales: Record<string, string> = {
    ro: 'ro-RO',
    en: 'en-US',
    de: 'de-DE',
  };

  return new Intl.NumberFormat(locales[language], {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

/**
 * Format date for reminder messages
 */
export function formatDateForReminder(date: Date, language: 'ro' | 'en' | 'de' = 'ro'): string {
  const locales: Record<string, string> = {
    ro: 'ro-RO',
    en: 'en-US',
    de: 'de-DE',
  };

  return new Intl.DateTimeFormat(locales[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
