import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createEventStore, createInMemoryEventStore, IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { nurtureSequenceWorkflow } from '../workflows/patient-journey';
import {
  generateCorrelationId,
  monthsAgo,
} from '../shared/date-helpers';
import { processBatch } from '../shared/batch-processor';
import { emitJobEvent } from '../shared/event-emitter';

/**
 * Recall Jobs - Patient recall and follow-up scheduled tasks
 */

/**
 * HubSpot contact search result type
 */
interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Initialize clients for recall jobs
 */
function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const clients = createIntegrationClients({
    source: 'recall-jobs',
    includeScheduling: false,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'recall-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('recall-jobs');

  return {
    hubspot: clients.hubspot,
    eventStore,
  };
}

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
              { propertyName: 'last_appointment_date', operator: 'LT', value: monthsAgo(6) },
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
      const contactsWithPhone = (recallDueContacts.results as HubSpotContactResult[]).filter((contact) => {
        if (!contact.properties.phone) {
          logger.warn('Contact missing phone, skipping', { contactId: contact.id, correlationId });
          return false;
        }
        return true;
      });

      // Process contacts in batches for better performance
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        contactsWithPhone,
        async (contact) => {
          await nurtureSequenceWorkflow.trigger({
            phone: contact.properties.phone as string,
            hubspotContactId: contact.id,
            sequenceType: 'recall',
            correlationId: `${correlationId}_${contact.id}`,
          }, {
            idempotencyKey: IdempotencyKeys.recallCheck(contact.id, todayStr),
          });
        },
        logger
      );

      contactsProcessed = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const contact = item as HubSpotContactResult;
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
