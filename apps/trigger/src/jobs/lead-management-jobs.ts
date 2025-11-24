import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createEventStore, createInMemoryEventStore, IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { scoreLeadWorkflow } from '../workflows/lead-scoring';
import {
  generateCorrelationId,
  daysAgo,
} from '../shared/date-helpers';
import { processBatch } from '../shared/batch-processor';
import { emitJobEvent } from '../shared/event-emitter';

/**
 * Lead Management Jobs - Lead scoring and cleanup scheduled tasks
 */

/**
 * HubSpot contact search result type
 */
interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Initialize clients for lead management jobs
 */
function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const clients = createIntegrationClients({
    source: 'lead-management-jobs',
    includeScheduling: false,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'lead-management-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('lead-management-jobs');

  return {
    hubspot: clients.hubspot,
    eventStore,
  };
}

/**
 * Lead scoring refresh - re-scores inactive leads
 * Runs every day at 2:00 AM
 */
export const leadScoringRefresh = schedules.task({
  id: 'lead-scoring-refresh',
  cron: '0 2 * * *', // 2:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting lead scoring refresh', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping scoring refresh', { correlationId });
      return { success: false, reason: 'HubSpot not configured', leadsRefreshed: 0 };
    }

    let leadsRefreshed = 0;
    let errors = 0;

    try {
      // Find leads that haven't been scored recently (7+ days)
      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'lead_score_updated', operator: 'LT', value: daysAgo(7) },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: [
          'phone',
          'email',
          'firstname',
          'lead_score',
          'lead_status',
          'last_message_content',
        ],
        limit: 50, // Process in smaller batches
      });

      logger.info(`Found ${staleLeads.total} stale leads to re-score`, { correlationId });

      // Filter leads with valid phone numbers
      const leadsWithPhone = (staleLeads.results as HubSpotContactResult[]).filter((lead) => {
        if (!lead.properties.phone) {
          logger.warn('Lead missing phone, skipping', { leadId: lead.id, correlationId });
          return false;
        }
        return true;
      });

      // Process leads in batches for better performance
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        leadsWithPhone,
        async (lead) => {
          const message = lead.properties.last_message_content ?? 'Follow-up re-scoring';

          await scoreLeadWorkflow.trigger({
            phone: lead.properties.phone as string,
            hubspotContactId: lead.id,
            message,
            channel: 'whatsapp',
            correlationId: `${correlationId}_${lead.id}`,
          }, {
            idempotencyKey: IdempotencyKeys.cronJobItem('lead-scoring-refresh', todayStr, lead.id),
          });

          // Update the score timestamp
          await hubspot.updateContact(lead.id, {
            lead_score_updated: new Date().toISOString(),
          });
        },
        logger
      );

      leadsRefreshed = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const lead = item as HubSpotContactResult;
        logger.error('Failed to re-score lead', { leadId: lead.id, error, correlationId });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.lead_scoring_refresh.completed', {
        leadsFound: staleLeads.total,
        leadsRefreshed,
        errors,
        correlationId,
      });

      logger.info('Lead scoring refresh completed', { leadsRefreshed, errors, correlationId });
    } catch (error) {
      logger.error('Lead scoring refresh failed', { error, correlationId });
      return { success: false, error: String(error), leadsRefreshed };
    }

    return { success: true, leadsRefreshed, errors };
  },
});

/**
 * Stale lead cleanup - archives old unresponsive leads
 * Runs every Sunday at 3:00 AM
 */
export const staleLeadCleanup = schedules.task({
  id: 'stale-lead-cleanup',
  cron: '0 3 * * 0', // 3:00 AM every Sunday
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting stale lead cleanup', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping cleanup', { correlationId });
      return { success: false, reason: 'HubSpot not configured', leadsArchived: 0 };
    }

    let leadsArchived = 0;
    let errors = 0;

    try {
      // Find leads with no activity in 90 days
      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'notes_last_updated', operator: 'LT', value: daysAgo(90) },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'lead_status', 'notes_last_updated'],
        limit: 100,
      });

      logger.info(`Found ${staleLeads.total} stale leads to archive`, { correlationId });

      // Process leads in batches for better performance
      const batchResult = await processBatch(
        staleLeads.results as HubSpotContactResult[],
        async (lead) => {
          await hubspot.updateContact(lead.id, {
            lead_status: 'archived',
            archived_date: new Date().toISOString(),
            archived_reason: 'No activity for 90+ days',
          });
        },
        logger
      );

      leadsArchived = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const lead = item as HubSpotContactResult;
        logger.error('Failed to archive lead', { leadId: lead.id, error, correlationId });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.stale_lead_cleanup.completed', {
        leadsFound: staleLeads.total,
        leadsArchived,
        errors,
        correlationId,
      });

      logger.info('Stale lead cleanup completed', { leadsArchived, errors, correlationId });
    } catch (error) {
      logger.error('Stale lead cleanup failed', { error, correlationId });
      return { success: false, error: String(error), leadsArchived };
    }

    return { success: true, leadsArchived, errors };
  },
});
