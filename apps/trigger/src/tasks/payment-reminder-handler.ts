/**
 * @fileoverview Payment Reminder Handler Task
 *
 * M5 Feature: Automated collections for overdue payment reminders.
 * Processes individual payment reminders triggered by the cron job.
 *
 * Flow:
 * 1. Validate payload and reminder eligibility
 * 2. Send WhatsApp template message
 * 3. Update HubSpot contact with reminder info
 * 4. Create HubSpot task for escalated cases
 * 5. Update database tracking
 * 6. Emit domain event
 *
 * @module trigger/tasks/payment-reminder-handler
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import {
  PaymentReminderPayloadSchema,
  formatCurrencyForReminder,
  formatDateForReminder,
} from '@medicalcor/types';
import type { PaymentReminderPayload, ReminderLevel } from '@medicalcor/types';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

function getClients() {
  return createIntegrationClients({
    source: 'payment-reminder-handler',
    includeTemplateCatalog: true,
  });
}

// ============================================================================
// TEMPLATE MESSAGES
// ============================================================================

/**
 * Get WhatsApp template components for payment reminders
 */
function buildReminderComponents(
  payload: PaymentReminderPayload,
  language: 'ro' | 'en' | 'de'
): {
  type: 'header' | 'body' | 'button';
  parameters?: { type: 'text' | 'image' | 'document' | 'video'; text?: string }[];
}[] {
  const { installment, reminderLevel } = payload;
  const formattedAmount = formatCurrencyForReminder(
    installment.totalOwed,
    installment.currency,
    language
  );
  const formattedDueDate = formatDateForReminder(installment.dueDate, language);

  // Build parameters based on reminder level
  const baseParams: { type: 'text'; text: string }[] = [
    { type: 'text' as const, text: installment.fullName },
    { type: 'text' as const, text: formattedAmount },
    { type: 'text' as const, text: formattedDueDate },
  ];

  // Add days overdue for second/final reminders
  if (reminderLevel === 'second' || reminderLevel === 'final' || reminderLevel === 'escalated') {
    baseParams.push({ type: 'text' as const, text: String(installment.daysOverdue) });
  }

  return [
    {
      type: 'body',
      parameters: baseParams,
    },
  ];
}

/**
 * Get urgency prefix for HubSpot tasks based on reminder level
 */
function getTaskUrgencyPrefix(level: ReminderLevel): string {
  const prefixes: Record<ReminderLevel, string> = {
    escalated: '🚨 URGENT ESCALATION',
    final: '⚠️ FINAL NOTICE',
    second: '📣 FOLLOW-UP',
    first: '📌 REMINDER',
  };
  return prefixes[level];
}

// ============================================================================
// TASK DEFINITION
// ============================================================================

/**
 * Payment Reminder Handler Task
 *
 * Sends payment reminder via WhatsApp and tracks in HubSpot
 */
export const handlePaymentReminder = task({
  id: 'payment-reminder-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: PaymentReminderPayload) => {
    // Validate payload
    const validationResult = PaymentReminderPayloadSchema.safeParse(payload);
    if (!validationResult.success) {
      logger.error('Invalid payment reminder payload', {
        errors: validationResult.error.errors,
        correlationId: payload.correlationId,
      });
      return { success: false, error: 'Invalid payload' };
    }

    const { installment, reminderLevel, templateName, correlationId, createFollowUpTask } = payload;
    const { hubspot, whatsapp, eventStore } = getClients();

    logger.info('Processing payment reminder', {
      installmentId: installment.installmentId,
      leadId: installment.leadId,
      reminderLevel,
      daysOverdue: installment.daysOverdue,
      amountDue: installment.totalOwed,
      reminderCount: installment.reminderCount + 1,
      correlationId,
    });

    // Normalize phone number
    const phoneResult = normalizeRomanianPhone(installment.phone);
    const normalizedPhone = phoneResult.normalized;

    let whatsappSent = false;
    let hubspotUpdated = false;
    let taskCreated = false;

    // Step 1: Send WhatsApp reminder
    if (whatsapp) {
      try {
        const language = installment.language;
        const whatsappLang = language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en';

        const components = buildReminderComponents(payload, language);

        await whatsapp.sendTemplate({
          to: normalizedPhone,
          templateName,
          language: whatsappLang,
          components,
        });

        whatsappSent = true;
        logger.info('Payment reminder sent via WhatsApp', {
          phone: normalizedPhone,
          templateName,
          reminderLevel,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to send WhatsApp reminder', {
          error: err,
          phone: normalizedPhone,
          correlationId,
        });
      }
    } else {
      logger.warn('WhatsApp client not configured', { correlationId });
    }

    // Step 2: Update HubSpot contact
    if (hubspot && installment.hubspotContactId) {
      try {
        const formattedAmount = formatCurrencyForReminder(
          installment.totalOwed,
          installment.currency,
          installment.language
        );

        // Update contact properties
        await hubspot.updateContact(installment.hubspotContactId, {
          payment_reminder_sent: new Date().toISOString(),
          payment_reminder_count: String(installment.reminderCount + 1),
          payment_overdue_amount: formattedAmount,
          payment_overdue_days: String(installment.daysOverdue),
          payment_reminder_level: reminderLevel,
        });

        // Log to timeline using available method
        await hubspot.logMessageToTimeline({
          contactId: installment.hubspotContactId,
          message:
            `Payment Reminder Sent (${reminderLevel.toUpperCase()})\n\n` +
            `Amount Due: ${formattedAmount}\n` +
            `Days Overdue: ${installment.daysOverdue}\n` +
            `Reminder #${installment.reminderCount + 1}\n` +
            `Installment: ${installment.installmentNumber}/${installment.totalInstallments}\n` +
            `Channel: WhatsApp`,
          direction: 'OUT',
          channel: 'whatsapp',
        });

        hubspotUpdated = true;
        logger.info('HubSpot contact updated with reminder info', {
          contactId: installment.hubspotContactId,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to update HubSpot contact', {
          error: err,
          contactId: installment.hubspotContactId,
          correlationId,
        });
      }
    }

    // Step 3: Create HubSpot task for final/escalated reminders
    if (hubspot && createFollowUpTask && installment.hubspotContactId) {
      try {
        const formattedAmount = formatCurrencyForReminder(
          installment.totalOwed,
          installment.currency,
          installment.language
        );

        const urgencyPrefix = getTaskUrgencyPrefix(reminderLevel);
        const dueInHours = reminderLevel === 'escalated' ? 4 : 24;

        await hubspot.createTask({
          contactId: installment.hubspotContactId,
          subject: `${urgencyPrefix}: Overdue Payment - ${formattedAmount}`,
          body:
            `Patient ${installment.fullName} has an overdue payment.\n\n` +
            `Amount Due: ${formattedAmount}\n` +
            `Days Overdue: ${installment.daysOverdue}\n` +
            `Reminders Sent: ${installment.reminderCount + 1}\n` +
            `Installment: ${installment.installmentNumber} of ${installment.totalInstallments}\n\n` +
            `Phone: ${installment.phone}\n` +
            `Case ID: ${installment.caseId}\n\n` +
            `Please follow up with the patient to resolve this overdue payment.`,
          priority: reminderLevel === 'escalated' ? 'HIGH' : 'MEDIUM',
          dueDate: new Date(Date.now() + dueInHours * 60 * 60 * 1000),
        });

        taskCreated = true;
        logger.info('HubSpot task created for overdue payment', {
          contactId: installment.hubspotContactId,
          reminderLevel,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to create HubSpot task', {
          error: err,
          contactId: installment.hubspotContactId,
          correlationId,
        });
      }
    }

    // Step 4: Emit domain event
    try {
      if (reminderLevel === 'escalated') {
        await eventStore.emit({
          type: 'collection.escalated',
          correlationId,
          aggregateId: installment.installmentId,
          aggregateType: 'payment_plan_installment',
          payload: {
            installmentId: installment.installmentId,
            paymentPlanId: installment.paymentPlanId,
            caseId: installment.caseId,
            leadId: installment.leadId,
            clinicId: installment.clinicId,
            totalAmountDue: installment.totalOwed,
            daysOverdue: installment.daysOverdue,
            remindersSent: installment.reminderCount + 1,
            hubspotTaskId: taskCreated ? 'created' : null,
            escalatedAt: new Date().toISOString(),
          },
        });
      } else {
        await eventStore.emit({
          type: 'collection.reminder_sent',
          correlationId,
          aggregateId: installment.installmentId,
          aggregateType: 'payment_plan_installment',
          payload: {
            installmentId: installment.installmentId,
            paymentPlanId: installment.paymentPlanId,
            caseId: installment.caseId,
            leadId: installment.leadId,
            clinicId: installment.clinicId,
            reminderLevel,
            reminderCount: installment.reminderCount + 1,
            amountDue: installment.totalOwed,
            daysOverdue: installment.daysOverdue,
            channel: 'whatsapp',
            sentAt: new Date().toISOString(),
          },
        });
      }
      logger.info('Domain event emitted', {
        type: reminderLevel === 'escalated' ? 'collection.escalated' : 'collection.reminder_sent',
        correlationId,
      });
    } catch (err) {
      logger.error('Failed to emit domain event', { error: err, correlationId });
    }

    return {
      success: whatsappSent || hubspotUpdated,
      installmentId: installment.installmentId,
      leadId: installment.leadId,
      reminderLevel,
      reminderCount: installment.reminderCount + 1,
      whatsappSent,
      hubspotUpdated,
      taskCreated,
    };
  },
});

// ============================================================================
// BATCH HANDLER
// ============================================================================

/**
 * Batch Payment Reminders Payload
 */
export const BatchPaymentRemindersPayloadSchema = z.object({
  reminders: z.array(PaymentReminderPayloadSchema),
  correlationId: z.string(),
});

export type BatchPaymentRemindersPayload = z.infer<typeof BatchPaymentRemindersPayloadSchema>;

/**
 * Batch Payment Reminder Handler
 *
 * Triggers individual reminder tasks for a batch of overdue installments
 */
export const handleBatchPaymentReminders = task({
  id: 'batch-payment-reminders-handler',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: BatchPaymentRemindersPayload) => {
    const { reminders, correlationId } = payload;

    logger.info('Processing batch payment reminders', {
      count: reminders.length,
      correlationId,
    });

    let triggered = 0;
    let errors = 0;

    for (const reminder of reminders) {
      try {
        await handlePaymentReminder.trigger(reminder);
        triggered++;
      } catch (err) {
        errors++;
        logger.error('Failed to trigger payment reminder', {
          installmentId: reminder.installment.installmentId,
          error: err,
          correlationId,
        });
      }
    }

    logger.info('Batch payment reminders processing complete', {
      triggered,
      errors,
      correlationId,
    });

    return {
      success: errors === 0,
      triggered,
      errors,
      correlationId,
    };
  },
});
