/**
 * HubSpot query helpers for analytics and reporting
 * Extracted from cron-jobs.ts to reduce code duplication
 */

import type { HubSpotClient } from '@medicalcor/integrations';

/**
 * Lead status filter for HubSpot searches
 */
export type LeadStatus = 'hot' | 'warm' | 'cold';

/**
 * Search result with total count
 */
export interface SearchCountResult {
  total: number;
}

/**
 * Count contacts with a specific lead status created since a given date
 */
export async function countLeadsByStatus(
  hubspot: HubSpotClient,
  status: LeadStatus,
  sinceTimestamp: string
): Promise<number> {
  const result = await hubspot.searchContacts({
    filterGroups: [
      {
        filters: [
          { propertyName: 'lead_status', operator: 'EQ', value: status },
          { propertyName: 'createdate', operator: 'GTE', value: sinceTimestamp },
        ],
      },
    ],
    limit: 1,
  });
  return result.total;
}

/**
 * Count new leads created since a given date
 */
export async function countNewLeads(
  hubspot: HubSpotClient,
  sinceTimestamp: string
): Promise<number> {
  const result = await hubspot.searchContacts({
    filterGroups: [
      {
        filters: [{ propertyName: 'createdate', operator: 'GTE', value: sinceTimestamp }],
      },
    ],
    limit: 1,
  });
  return result.total;
}

/**
 * Count conversions (leads that became customers) since a given date
 */
export async function countConversions(
  hubspot: HubSpotClient,
  sinceTimestamp: string
): Promise<number> {
  const result = await hubspot.searchContacts({
    filterGroups: [
      {
        filters: [
          { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
          {
            propertyName: 'hs_lifecyclestage_customer_date',
            operator: 'GTE',
            value: sinceTimestamp,
          },
        ],
      },
    ],
    limit: 1,
  });
  return result.total;
}

/**
 * Weekly analytics metrics structure
 */
export interface WeeklyMetrics {
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  conversions: number;
  period: string;
  generatedAt: string;
}

/**
 * Fetch all weekly analytics metrics in parallel
 */
export async function fetchWeeklyMetrics(
  hubspot: HubSpotClient,
  sinceTimestamp: string
): Promise<WeeklyMetrics> {
  const [newLeads, hotLeads, warmLeads, coldLeads, conversions] = await Promise.all([
    countNewLeads(hubspot, sinceTimestamp),
    countLeadsByStatus(hubspot, 'hot', sinceTimestamp),
    countLeadsByStatus(hubspot, 'warm', sinceTimestamp),
    countLeadsByStatus(hubspot, 'cold', sinceTimestamp),
    countConversions(hubspot, sinceTimestamp),
  ]);

  return {
    newLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    conversions,
    period: '7 days',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Format weekly report for notifications
 */
export function formatWeeklyReport(metrics: WeeklyMetrics): string {
  const conversionRate =
    metrics.newLeads > 0 ? ((metrics.conversions / metrics.newLeads) * 100).toFixed(1) : '0';

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

💡 Conversion Rate: ${conversionRate}%
  `.trim();
}
