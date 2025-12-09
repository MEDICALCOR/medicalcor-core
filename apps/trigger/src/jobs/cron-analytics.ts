import { schedules, logger } from '@trigger.dev/sdk/v3';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { scoreLeadWorkflow } from '../workflows/lead-scoring.js';
import {
  getClients,
  generateCorrelationId,
  sevenDaysAgo,
  processBatch,
  emitJobEvent,
  formatWeeklyReport,
  type HubSpotContactResult,
} from './cron-shared.js';

/**
 * Analytics-related cron jobs
 * - Lead scoring refresh
 * - Weekly analytics report
 */

// ============================================
// Lead Scoring Refresh
// ============================================

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
              { propertyName: 'lead_score_updated', operator: 'LT', value: sevenDaysAgo() },
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

          await scoreLeadWorkflow.trigger(
            {
              phone: lead.properties.phone!,
              hubspotContactId: lead.id,
              message,
              channel: 'whatsapp',
              correlationId: `${correlationId}_${lead.id}`,
            },
            {
              idempotencyKey: IdempotencyKeys.cronJobItem(
                'lead-scoring-refresh',
                todayStr,
                lead.id
              ),
            }
          );

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
        const lead = item;
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

// ============================================
// Weekly Analytics Report
// ============================================

/**
 * Weekly analytics report - generates and sends weekly metrics
 * Runs every Monday at 8:00 AM
 */
export const weeklyAnalyticsReport = schedules.task({
  id: 'weekly-analytics-report',
  cron: '0 8 * * 1', // 8:00 AM every Monday
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Generating weekly analytics report', { correlationId });

    const { hubspot, eventStore } = getClients();

    try {
      // Calculate metrics from HubSpot
      const metrics = {
        newLeads: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
        conversions: 0,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      };

      if (hubspot) {
        // Count new leads in the last 7 days
        const newLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() }],
            },
          ],
          limit: 1,
        });
        metrics.newLeads = newLeadsResult.total;

        // Count hot leads
        const hotLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'hot' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.hotLeads = hotLeadsResult.total;

        // Count warm leads
        const warmLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'warm' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.warmLeads = warmLeadsResult.total;

        // Count cold leads
        const coldLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'cold' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.coldLeads = coldLeadsResult.total;

        // Count conversions (leads that became customers)
        const conversionsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
                {
                  propertyName: 'hs_lifecyclestage_customer_date',
                  operator: 'GTE',
                  value: sevenDaysAgo(),
                },
              ],
            },
          ],
          limit: 1,
        });
        metrics.conversions = conversionsResult.total;
      }

      // Format report
      const report = formatWeeklyReport(metrics);

      logger.info('Weekly analytics report generated', { metrics, correlationId });

      // Emit report event (could trigger Slack/Email notification)
      await emitJobEvent(eventStore, 'cron.weekly_analytics.completed', {
        metrics,
        report,
        correlationId,
      });

      return { success: true, metrics };
    } catch (error) {
      logger.error('Weekly analytics report failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});
