import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  generateCorrelationId,
  isIn24Hours,
  isIn2Hours,
  formatDate,
  formatTime,
} from '../shared/date-helpers';
import { processBatch } from '../shared/batch-processor';
import { emitJobEvent } from '../shared/event-emitter';

/**
 * Appointment Jobs - Appointment reminders scheduled tasks
 */

/**
 * HubSpot contact search result type
 */
interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Initialize clients for appointment jobs
 */
function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const clients = createIntegrationClients({
    source: 'appointment-jobs',
    includeScheduling: false,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'appointment-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('appointment-jobs');

  return {
    hubspot: clients.hubspot,
    whatsapp: clients.whatsapp,
    eventStore,
  };
}

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

      // Filter contacts with valid data
      const validContacts = (upcomingAppointments.results as HubSpotContactResult[]).filter((contact) => {
        return contact.properties.phone && contact.properties.next_appointment_date;
      });

      // Separate contacts into 24h and 2h reminder groups
      const contacts24h = validContacts.filter((contact) => {
        return (
          isIn24Hours(contact.properties.next_appointment_date as string) &&
          contact.properties.reminder_24h_sent !== 'true'
        );
      });

      const contacts2h = validContacts.filter((contact) => {
        return (
          isIn2Hours(contact.properties.next_appointment_date as string) &&
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
            const appointmentDate = props.next_appointment_date as string;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone as string,
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
          const c = item as HubSpotContactResult;
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
            const appointmentDate = props.next_appointment_date as string;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone as string,
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
          const c = item as HubSpotContactResult;
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
