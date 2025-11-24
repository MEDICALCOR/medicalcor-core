import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { generateCorrelationId, daysAgo } from '../shared/date-helpers';
import { emitJobEvent } from '../shared/event-emitter';

/**
 * Analytics Jobs - Weekly reports and metrics scheduled tasks
 */

/**
 * Initialize clients for analytics jobs
 */
function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const clients = createIntegrationClients({
    source: 'analytics-jobs',
    includeScheduling: false,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'analytics-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('analytics-jobs');

  return {
    hubspot: clients.hubspot,
    eventStore,
  };
}

/**
 * Weekly metrics structure
 */
interface WeeklyMetrics {
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  conversions: number;
  period: string;
  generatedAt: string;
}

/**
 * Format weekly report for notifications
 */
function formatWeeklyReport(metrics: WeeklyMetrics): string {
  return `
📊 Weekly Analytics Report
Period: ${metrics.period}
Generated: ${new Date(metrics.generatedAt).toLocaleString('ro-RO')}

📈 Lead Activity:
• New leads: ${metrics.newLeads}
• Hot leads: ${metrics.hotLeads}
• Warm leads: ${metrics.warmLeads}
• Cold leads: ${metrics.coldLeads}

🎯 Conversions: ${metrics.conversions}

💡 Conversion Rate: ${metrics.newLeads > 0 ? ((metrics.conversions / metrics.newLeads) * 100).toFixed(1) : 0}%
  `.trim();
}

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
      const metrics: WeeklyMetrics = {
        newLeads: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
        conversions: 0,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      };

      if (hubspot) {
        const sevenDaysAgoTs = daysAgo(7);

        // Count new leads in the last 7 days
        const newLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgoTs }],
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
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgoTs },
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
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgoTs },
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
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgoTs },
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
                  value: sevenDaysAgoTs,
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
