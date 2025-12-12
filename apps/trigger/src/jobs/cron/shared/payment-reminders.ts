/**
 * Payment reminder helpers for overdue payment processing
 * Extracted from cron-jobs.ts for better maintainability
 */

import type { HubSpotClient, WhatsAppClient } from '@medicalcor/integrations';

/**
 * Configuration for payment reminder timing
 */
export const REMINDER_CONFIG = {
  MIN_DAYS_BETWEEN_REMINDERS: 3,
  SECOND_REMINDER_DAYS: 7,
  FINAL_REMINDER_DAYS: 14,
  ESCALATION_DAYS: 21,
  MAX_REMINDERS: 3,
} as const;

/**
 * Reminder level types
 */
export type ReminderLevel = 'first' | 'second' | 'final' | 'escalated';

/**
 * Overdue installment data structure
 */
export interface OverdueInstallment {
  id: string;
  payment_plan_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: string;
  reminder_sent_at: string | null;
  reminder_count: number;
  late_fee_applied: number;
  case_id: string;
  clinic_id: string;
  lead_id: string;
  lead_phone: string;
  lead_full_name: string;
  lead_email: string | null;
  lead_language: string | null;
  hubspot_contact_id: string | null;
  case_outstanding_amount: number;
  plan_frequency: string;
  plan_total_installments: number;
  plan_installments_paid: number;
}

/**
 * Determine the reminder level based on days overdue and reminder count
 */
export function determineReminderLevel(
  daysOverdue: number,
  reminderCount: number
): { level: ReminderLevel; templateName: string } {
  const { MAX_REMINDERS, ESCALATION_DAYS, FINAL_REMINDER_DAYS, SECOND_REMINDER_DAYS } =
    REMINDER_CONFIG;

  if (reminderCount >= MAX_REMINDERS || daysOverdue >= ESCALATION_DAYS) {
    return { level: 'escalated', templateName: 'payment_reminder_final' };
  }

  if (daysOverdue >= FINAL_REMINDER_DAYS) {
    return { level: 'final', templateName: 'payment_reminder_final' };
  }

  if (daysOverdue >= SECOND_REMINDER_DAYS) {
    return { level: 'second', templateName: 'payment_reminder_second' };
  }

  return { level: 'first', templateName: 'payment_reminder_first' };
}

/**
 * Supported languages for reminders
 */
export type SupportedLanguage = 'ro' | 'en' | 'de';

/**
 * Get normalized language from lead language preference
 */
export function getNormalizedLanguage(leadLanguage: string | null): SupportedLanguage {
  if (leadLanguage === 'en') return 'en';
  if (leadLanguage === 'de') return 'de';
  return 'ro';
}

/**
 * Get WhatsApp template language code
 */
export function getWhatsAppLanguage(language: SupportedLanguage): 'ro' | 'en' | 'de' {
  return language;
}

/**
 * Format currency amount for display
 */
export function formatCurrencyAmount(amount: number, language: SupportedLanguage): string {
  const locale = language === 'ro' ? 'ro-RO' : language === 'de' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

/**
 * Format date for display
 */
export function formatDateForDisplay(date: Date, language: SupportedLanguage): string {
  const locale = language === 'ro' ? 'ro-RO' : language === 'de' ? 'de-DE' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Calculate days overdue from due date
 */
export function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Build WhatsApp template parameters for payment reminder
 */
export function buildReminderTemplateParams(
  installment: OverdueInstallment,
  reminderLevel: ReminderLevel,
  daysOverdue: number
): { type: 'text'; text: string }[] {
  const language = getNormalizedLanguage(installment.lead_language);
  const totalOwed = installment.amount + installment.late_fee_applied;
  const formattedAmount = formatCurrencyAmount(totalOwed, language);
  const formattedDueDate = formatDateForDisplay(new Date(installment.due_date), language);

  const params: { type: 'text'; text: string }[] = [
    { type: 'text', text: installment.lead_full_name },
    { type: 'text', text: formattedAmount },
    { type: 'text', text: formattedDueDate },
  ];

  // Add days overdue for non-first reminders
  if (reminderLevel !== 'first') {
    params.push({ type: 'text', text: String(daysOverdue) });
  }

  return params;
}

/**
 * Send payment reminder via WhatsApp
 */
export async function sendPaymentReminder(
  whatsapp: WhatsAppClient,
  installment: OverdueInstallment,
  templateName: string,
  reminderLevel: ReminderLevel,
  daysOverdue: number
): Promise<void> {
  const language = getNormalizedLanguage(installment.lead_language);
  const params = buildReminderTemplateParams(installment, reminderLevel, daysOverdue);

  await whatsapp.sendTemplate({
    to: installment.lead_phone,
    templateName,
    language: getWhatsAppLanguage(language),
    components: [{ type: 'body' as const, parameters: params }],
  });
}

/**
 * Create HubSpot task for escalated payment
 */
export async function createEscalatedPaymentTask(
  hubspot: HubSpotClient,
  installment: OverdueInstallment,
  reminderLevel: ReminderLevel,
  daysOverdue: number
): Promise<void> {
  if (!installment.hubspot_contact_id) return;

  const language = getNormalizedLanguage(installment.lead_language);
  const totalOwed = installment.amount + installment.late_fee_applied;
  const formattedAmount = formatCurrencyAmount(totalOwed, language);

  const isEscalated = reminderLevel === 'escalated';
  const subject = `${isEscalated ? '🚨 URGENT' : '⚠️ FINAL'}: Overdue Payment - ${formattedAmount}`;
  const body = [
    `Patient ${installment.lead_full_name} has an overdue payment.`,
    '',
    `Amount: ${formattedAmount}`,
    `Days Overdue: ${daysOverdue}`,
    `Reminders Sent: ${installment.reminder_count + 1}`,
  ].join('\n');

  // Due in 4 hours for escalated, 24 hours for final
  const dueHours = isEscalated ? 4 : 24;
  const dueDate = new Date(Date.now() + dueHours * 60 * 60 * 1000);

  await hubspot.createTask({
    contactId: installment.hubspot_contact_id,
    subject,
    body,
    priority: isEscalated ? 'HIGH' : 'MEDIUM',
    dueDate,
  });
}

/**
 * Update HubSpot contact with payment reminder info
 */
export async function updateHubSpotPaymentInfo(
  hubspot: HubSpotClient,
  installment: OverdueInstallment,
  daysOverdue: number
): Promise<void> {
  if (!installment.hubspot_contact_id) return;

  const language = getNormalizedLanguage(installment.lead_language);
  const totalOwed = installment.amount + installment.late_fee_applied;
  const formattedAmount = formatCurrencyAmount(totalOwed, language);

  await hubspot.updateContact(installment.hubspot_contact_id, {
    payment_reminder_sent: new Date().toISOString(),
    payment_reminder_count: String(installment.reminder_count + 1),
    payment_overdue_amount: formattedAmount,
    payment_overdue_days: String(daysOverdue),
  });
}
