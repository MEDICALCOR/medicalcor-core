import { schedules, logger } from '@trigger.dev/sdk/v3';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { nurtureSequenceWorkflow } from '../workflows/patient-journey.js';
import {
  getClients,
  generateCorrelationId,
  sixMonthsAgo,
  processBatch,
  emitJobEvent,
  hasValidConsent,
  logConsentDenied,
  isIn24Hours,
  isIn2Hours,
  formatDate,
  formatTime,
  type HubSpotContactResult,
} from './cron-shared.js';

/**
 * Scheduling-related cron jobs
 * - Daily recall check for patient follow-ups
 * - Appointment reminders (24h and 2h)
 */

// ============================================
// Daily Recall Check
// ============================================

/**
 * Daily recall check - finds patients due for follow-up
 * Runs every day at 9:00 AM
 */
export const dailyRecallCheck = schedules.task({
  id: 'daily-recall-check',
  cron: '0 9 * * *', // 9:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting daily recall check', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping recall check', { correlationId });
      return { success: false, reason: 'HubSpot not configured', contactsProcessed: 0 };
    }

    let contactsProcessed = 0;
    let errors = 0;

    try {
      // Find contacts due for recall (last appointment > 6 months ago)
      const recallDueContacts = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'last_appointment_date', operator: 'LT', value: sixMonthsAgo() },
              { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'last_appointment_date'],
        limit: 100, // Process in batches
      });

      logger.info(`Found ${recallDueContacts.total} contacts due for recall`, { correlationId });

      // Filter contacts with valid phone numbers
      const contactsWithPhone = (recallDueContacts.results as HubSpotContactResult[]).filter(
        (contact) => {
          if (!contact.properties.phone) {
            logger.warn('Contact missing phone, skipping', {
              contactId: contact.id,
              correlationId,
            });
            return false;
          }
          return true;
        }
      );

      // Process contacts in batches for better performance
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        contactsWithPhone,
        async (contact) => {
          await nurtureSequenceWorkflow.trigger(
            {
              phone: contact.properties.phone!,
              hubspotContactId: contact.id,
              sequenceType: 'recall',
              correlationId: `${correlationId}_${contact.id}`,
            },
            {
              idempotencyKey: IdempotencyKeys.recallCheck(contact.id, todayStr),
            }
          );
        },
        logger
      );

      contactsProcessed = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const contact = item;
        logger.error('Failed to trigger recall sequence', {
          contactId: contact.id,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.daily_recall_check.completed', {
        contactsFound: recallDueContacts.total,
        contactsProcessed,
        errors,
        correlationId,
      });

      logger.info('Daily recall check completed', { contactsProcessed, errors, correlationId });
    } catch (error) {
      logger.error('Daily recall check failed', { error, correlationId });
      return { success: false, error: String(error), contactsProcessed };
    }

    return { success: true, contactsProcessed, errors };
  },
});

// ============================================
// Appointment Reminders
// ============================================

/**
 * Appointment reminder - sends reminders for upcoming appointments
 * Runs every hour
 */
export const appointmentReminders = schedules.task({
  id: 'appointment-reminders',
  cron: '0 * * * *', // Every hour
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting appointment reminder check', { correlationId });

    const { hubspot, whatsapp, eventStore } = getClients();

    if (!whatsapp) {
      logger.warn('WhatsApp client not configured, skipping reminders', { correlationId });
      return { success: false, reason: 'WhatsApp not configured' };
    }

    let reminders24hSent = 0;
    let reminders2hSent = 0;
    let errors = 0;

    try {
      // Find contacts with appointments in the next 24 hours
      // We use HubSpot's next_appointment_date property
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // CRITICAL GDPR FIX: Only send reminders to contacts who have explicitly consented
      // to appointment reminders or treatment updates (GDPR requires specific consent)
      // DO NOT fall back to general marketing consent for medical communications
      const upcomingAppointments = await hubspot?.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'next_appointment_date',
                operator: 'GTE',
                value: now.getTime().toString(),
              },
              {
                propertyName: 'next_appointment_date',
                operator: 'LTE',
                value: in24Hours.getTime().toString(),
              },
              // GDPR CONSENT CHECK: Must have specific appointment_reminders consent
              {
                propertyName: 'consent_appointment_reminders',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
          // Alternative: Accept treatment_updates consent (related to appointments)
          {
            filters: [
              {
                propertyName: 'next_appointment_date',
                operator: 'GTE',
                value: now.getTime().toString(),
              },
              {
                propertyName: 'next_appointment_date',
                operator: 'LTE',
                value: in24Hours.getTime().toString(),
              },
              {
                propertyName: 'consent_treatment_updates',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
        ],
        properties: [
          'phone',
          'firstname',
          'next_appointment_date',
          'appointment_procedure',
          'reminder_24h_sent',
          'reminder_2h_sent',
          'hs_language',
          'consent_appointment_reminders',
          'consent_marketing',
        ],
        limit: 100,
      });

      if (!upcomingAppointments) {
        logger.warn('No HubSpot client to fetch appointments', { correlationId });
        return { success: false, reason: 'HubSpot not configured' };
      }

      logger.info(`Found ${upcomingAppointments.total} appointments in next 24 hours`, {
        correlationId,
      });

      // GDPR FIX: Filter contacts with valid data AND verified consent
      const validContacts = (upcomingAppointments.results as HubSpotContactResult[]).filter(
        (contact) => {
          // Must have phone and appointment date
          if (!contact.properties.phone || !contact.properties.next_appointment_date) {
            return false;
          }

          // CRITICAL: Verify consent for appointment reminders
          if (!hasValidConsent(contact, 'appointment_reminders')) {
            logConsentDenied(contact.id, 'appointment_reminders', correlationId);
            return false;
          }

          return true;
        }
      );

      // Separate contacts into 24h and 2h reminder groups
      const contacts24h = validContacts.filter((contact) => {
        return (
          isIn24Hours(contact.properties.next_appointment_date!) &&
          contact.properties.reminder_24h_sent !== 'true'
        );
      });

      const contacts2h = validContacts.filter((contact) => {
        return (
          isIn2Hours(contact.properties.next_appointment_date!) &&
          contact.properties.reminder_2h_sent !== 'true'
        );
      });

      // Process 24h reminders in batches
      if (contacts24h.length > 0) {
        logger.info(`Processing ${contacts24h.length} 24h reminders`, { correlationId });
        const batch24hResult = await processBatch(
          contacts24h,
          async (contact) => {
            const props = contact.properties;
            const appointmentDate = props.next_appointment_date!;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone!,
              templateName: 'appointment_reminder_24h',
              language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: props.firstname ?? 'Pacient' },
                    { type: 'text', text: formatDate(appointmentDate, language) },
                    { type: 'text', text: formatTime(appointmentDate) },
                  ],
                },
              ],
            });

            if (hubspot) {
              await hubspot.updateContact(contact.id, { reminder_24h_sent: 'true' });
            }
            logger.info('Sent 24h reminder', { contactId: contact.id, correlationId });
          },
          logger
        );
        reminders24hSent = batch24hResult.successes;
        errors += batch24hResult.errors.length;

        for (const { item, error } of batch24hResult.errors) {
          const c = item;
          logger.error('Failed to send 24h reminder', { contactId: c.id, error, correlationId });
        }
      }

      // Process 2h reminders in batches
      if (contacts2h.length > 0) {
        logger.info(`Processing ${contacts2h.length} 2h reminders`, { correlationId });
        const batch2hResult = await processBatch(
          contacts2h,
          async (contact) => {
            const props = contact.properties;
            const appointmentDate = props.next_appointment_date!;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone!,
              templateName: 'appointment_reminder_2h',
              language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: formatTime(appointmentDate) }],
                },
              ],
            });

            if (hubspot) {
              await hubspot.updateContact(contact.id, { reminder_2h_sent: 'true' });
            }
            logger.info('Sent 2h reminder', { contactId: contact.id, correlationId });
          },
          logger
        );
        reminders2hSent = batch2hResult.successes;
        errors += batch2hResult.errors.length;

        for (const { item, error } of batch2hResult.errors) {
          const c = item;
          logger.error('Failed to send 2h reminder', { contactId: c.id, error, correlationId });
        }
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.appointment_reminders.completed', {
        reminders24hSent,
        reminders2hSent,
        errors,
        correlationId,
      });

      logger.info('Appointment reminders completed', {
        reminders24hSent,
        reminders2hSent,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('Appointment reminders failed', { error, correlationId });
      return { success: false, error: String(error) };
    }

    return { success: true, reminders24hSent, reminders2hSent, errors };
  },
});
