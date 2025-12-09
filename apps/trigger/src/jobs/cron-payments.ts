import { schedules, logger } from '@trigger.dev/sdk/v3';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { batchAttributeUnlinkedPayments } from '../tasks/payment-attribution.js';
import {
  getClients,
  getSupabaseClient,
  generateCorrelationId,
  processBatch,
  emitJobEvent,
} from './cron-shared.js';

/**
 * Payment-related cron jobs
 * - Overdue payment reminders
 * - Hourly payment attribution
 */

// ============================================
// Overdue Payment Reminders
// ============================================

/**
 * Overdue Payment Reminders - sends payment reminders for overdue installments
 * Runs every day at 10:00 AM
 *
 * GDPR: Payment reminders are transactional communications and don't require
 * marketing consent, but we still respect communication preferences.
 */
export const overduePaymentReminders = schedules.task({
  id: 'overdue-payment-reminders',
  cron: '0 10 * * *', // 10:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting overdue payment reminders check', { correlationId });

    const { hubspot, whatsapp, eventStore } = getClients();

    if (!whatsapp) {
      logger.warn('WhatsApp client not configured, skipping payment reminders', { correlationId });
      return { success: false, reason: 'WhatsApp not configured', remindersTriggered: 0 };
    }

    let remindersTriggered = 0;
    let escalations = 0;
    let errors = 0;

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured', remindersTriggered: 0 };
      }

      // Configuration for reminder timing
      const MIN_DAYS_BETWEEN_REMINDERS = 3;
      const SECOND_REMINDER_DAYS = 7;
      const FINAL_REMINDER_DAYS = 14;
      const ESCALATION_DAYS = 21;
      const MAX_REMINDERS = 3;

      interface OverdueInstallmentRow {
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

      // Query for overdue installments eligible for reminders
      const now = new Date();
      const minReminderDate = new Date(
        now.getTime() - MIN_DAYS_BETWEEN_REMINDERS * 24 * 60 * 60 * 1000
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Supabase RPC typing
      const { data: overdueInstallments, error: queryError } = await supabase.rpc(
        'get_overdue_installments_for_reminders',
        {
          p_min_reminder_date: minReminderDate.toISOString(),
          p_max_reminders: MAX_REMINDERS,
          p_limit: 100,
        }
      );

      if (queryError) {
        // If RPC doesn't exist, fall back to direct query
        logger.warn('RPC not available, using direct query', { correlationId });

        const { data: directData, error: directError } = await supabase
          .from('payment_plan_installments')
          .select(
            `
            id,
            payment_plan_id,
            installment_number,
            amount,
            due_date,
            status,
            reminder_sent_at,
            reminder_count,
            late_fee_applied,
            payment_plans!inner (
              case_id,
              frequency,
              number_of_installments,
              installments_paid,
              cases!inner (
                clinic_id,
                lead_id,
                outstanding_amount,
                leads!inner (
                  phone,
                  full_name,
                  email,
                  preferred_language,
                  hubspot_contact_id
                )
              )
            )
          `
          )
          .in('status', ['pending', 'overdue'])
          .lt('due_date', now.toISOString())
          .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${minReminderDate.toISOString()}`)
          .lt('reminder_count', MAX_REMINDERS)
          .limit(100);

        if (directError) {
          throw new Error(`Failed to query overdue installments: ${directError.message}`);
        }

        if (!directData || directData.length === 0) {
          logger.info('No overdue installments found', { correlationId });
          return { success: true, remindersTriggered: 0, message: 'No overdue installments' };
        }
      }

      const installments = overdueInstallments as OverdueInstallmentRow[] | null;
      if (!installments || installments.length === 0) {
        logger.info('No overdue installments found', { correlationId });
        return { success: true, remindersTriggered: 0, message: 'No overdue installments' };
      }

      logger.info(`Found ${installments.length} overdue installments`, { correlationId });

      // Process each overdue installment
      const batchResult = await processBatch(
        installments,
        async (inst) => {
          // Calculate days overdue
          const dueDate = new Date(inst.due_date);
          const daysOverdue = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Determine reminder level
          let reminderLevel: 'first' | 'second' | 'final' | 'escalated';
          let templateName: string;

          if (inst.reminder_count >= MAX_REMINDERS || daysOverdue >= ESCALATION_DAYS) {
            reminderLevel = 'escalated';
            templateName = 'payment_reminder_final';
            escalations++;
          } else if (daysOverdue >= FINAL_REMINDER_DAYS) {
            reminderLevel = 'final';
            templateName = 'payment_reminder_final';
          } else if (daysOverdue >= SECOND_REMINDER_DAYS) {
            reminderLevel = 'second';
            templateName = 'payment_reminder_second';
          } else {
            reminderLevel = 'first';
            templateName = 'payment_reminder_first';
          }

          const totalOwed = inst.amount + inst.late_fee_applied;
          const language: 'ro' | 'en' | 'de' =
            inst.lead_language === 'en' ? 'en' : inst.lead_language === 'de' ? 'de' : 'ro';
          const whatsappLang = language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en';

          // Format amount for display
          const formattedAmount = new Intl.NumberFormat(
            language === 'ro' ? 'ro-RO' : language === 'de' ? 'de-DE' : 'en-US',
            { style: 'currency', currency: 'EUR' }
          ).format(totalOwed);

          // Format due date
          const formattedDueDate = new Intl.DateTimeFormat(
            language === 'ro' ? 'ro-RO' : language === 'de' ? 'de-DE' : 'en-US',
            { year: 'numeric', month: 'long', day: 'numeric' }
          ).format(dueDate);

          // Send WhatsApp reminder
          await whatsapp.sendTemplate({
            to: inst.lead_phone,
            templateName,
            language: whatsappLang,
            components: [
              {
                type: 'body' as const,
                parameters: [
                  { type: 'text' as const, text: inst.lead_full_name },
                  { type: 'text' as const, text: formattedAmount },
                  { type: 'text' as const, text: formattedDueDate },
                  ...(reminderLevel !== 'first'
                    ? [{ type: 'text' as const, text: String(daysOverdue) }]
                    : []),
                ],
              },
            ],
          });

          // Update reminder tracking in database
          await supabase
            .from('payment_plan_installments')
            .update({
              status: 'overdue',
              reminder_sent_at: now.toISOString(),
              reminder_count: inst.reminder_count + 1,
            })
            .eq('id', inst.id);

          // Update HubSpot if contact exists
          if (hubspot && inst.hubspot_contact_id) {
            await hubspot.updateContact(inst.hubspot_contact_id, {
              payment_reminder_sent: now.toISOString(),
              payment_reminder_count: String(inst.reminder_count + 1),
              payment_overdue_amount: formattedAmount,
              payment_overdue_days: String(daysOverdue),
            });

            // Create task for escalated cases
            if (reminderLevel === 'escalated' || reminderLevel === 'final') {
              await hubspot.createTask({
                contactId: inst.hubspot_contact_id,
                subject: `${reminderLevel === 'escalated' ? 'URGENT' : 'FINAL'}: Overdue Payment - ${formattedAmount}`,
                body: `Patient ${inst.lead_full_name} has an overdue payment.\n\nAmount: ${formattedAmount}\nDays Overdue: ${daysOverdue}\nReminders Sent: ${inst.reminder_count + 1}`,
                priority: reminderLevel === 'escalated' ? 'HIGH' : 'MEDIUM',
                dueDate: new Date(
                  now.getTime() + (reminderLevel === 'escalated' ? 4 : 24) * 60 * 60 * 1000
                ),
              });
            }
          }

          logger.info('Payment reminder sent', {
            installmentId: inst.id,
            leadId: inst.lead_id,
            reminderLevel,
            daysOverdue,
            reminderCount: inst.reminder_count + 1,
            correlationId,
          });
        },
        logger
      );

      remindersTriggered = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors
      for (const { item, error } of batchResult.errors) {
        const inst = item;
        logger.error('Failed to send payment reminder', {
          installmentId: inst.id,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.overdue_payment_reminders.completed', {
        installmentsFound: installments.length,
        remindersTriggered,
        escalations,
        errors,
        correlationId,
      });

      logger.info('Overdue payment reminders check completed', {
        remindersTriggered,
        escalations,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('Overdue payment reminders check failed', { error, correlationId });

      await emitJobEvent(eventStore, 'cron.overdue_payment_reminders.failed', {
        error: String(error),
        correlationId,
      });

      return { success: false, error: String(error), remindersTriggered };
    }

    return { success: true, remindersTriggered, escalations, errors };
  },
});

// ============================================
// Hourly Payment Attribution
// ============================================

/**
 * Hourly payment attribution check
 *
 * H8 Production Fix: Finds unlinked payments and attempts to attribute
 * them to leads/cases for proper LTV tracking.
 *
 * Runs every hour to catch payments that couldn't be attributed
 * during webhook processing.
 */
export const hourlyPaymentAttribution = schedules.task({
  id: 'hourly-payment-attribution',
  cron: '0 * * * *', // Every hour at minute 0
  run: async () => {
    const correlationId = generateCorrelationId();
    const { eventStore } = getClients();

    logger.info('Starting hourly payment attribution', { correlationId });

    try {
      await batchAttributeUnlinkedPayments.trigger(
        { correlationId },
        {
          idempotencyKey: IdempotencyKeys.custom(
            'payment-attr-hourly',
            getTodayString(),
            new Date().getHours().toString()
          ),
        }
      );

      logger.info('Hourly payment attribution triggered', { correlationId });

      await emitJobEvent(eventStore, 'cron.hourly_payment_attribution.completed', {
        correlationId,
      });

      return { success: true, correlationId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Hourly payment attribution failed', { error: errorMessage, correlationId });

      await emitJobEvent(eventStore, 'cron.hourly_payment_attribution.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});
