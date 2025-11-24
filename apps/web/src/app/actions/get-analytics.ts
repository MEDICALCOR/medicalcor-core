'use server';

import type { HubSpotContact, HubSpotSearchRequest } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getStripeClient, getSchedulingService } from './utils/clients';
import { mapLeadSource } from './utils/hubspot-mappers';
import type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from './types';

/**
 * Analytics Server Actions
 *
 * Actions for fetching analytics data and metrics.
 */

/**
 * Fetches all contacts matching a search query using cursor-based pagination
 * Handles HubSpot's 100-per-page limit automatically
 * @param searchParams - HubSpot search parameters (without limit/after)
 * @param maxResults - Maximum results to fetch (default 5000, prevents runaway queries)
 */
async function fetchAllContacts(
  searchParams: Omit<HubSpotSearchRequest, 'limit' | 'after'>,
  maxResults = 5000
): Promise<HubSpotContact[]> {
  const hubspot = getHubSpotClient();
  const allResults: HubSpotContact[] = [];
  let cursor: string | undefined;
  const pageSize = 100; // HubSpot max per page

  do {
    const response = await hubspot.searchContacts({
      ...searchParams,
      limit: pageSize,
      after: cursor,
    });

    allResults.push(...response.results);

    // Get next cursor from HubSpot paging
    cursor = response.paging?.next?.after;

    // Safety check to prevent infinite loops
    if (allResults.length >= maxResults) {
      console.warn(
        `[fetchAllContacts] Reached maxResults limit (${maxResults}), stopping pagination`
      );
      break;
    }
  } while (cursor);

  return allResults;
}

/**
 * Helper: Get count of today's appointments
 */
async function getTodayAppointmentsCount(): Promise<number> {
  try {
    const scheduling = getSchedulingService();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const appointments = await scheduling.getUpcomingAppointments(todayStart, todayEnd);
    return appointments.length;
  } catch (error) {
    console.error('[getTodayAppointmentsCount] Failed to fetch appointments:', error);
    return 0;
  }
}

/**
 * Fetches analytics data from HubSpot
 * @requires VIEW_ANALYTICS permission
 */
export async function getAnalyticsDataAction(
  timeRange: '7d' | '30d' | '90d' | '12m' = '30d'
): Promise<AnalyticsData> {
  try {
    await requirePermission('VIEW_ANALYTICS');
    const hubspot = getHubSpotClient();
    const stripe = getStripeClient();
    const scheduling = getSchedulingService();

    // Calculate date range
    const now = new Date();
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
    const days = daysMap[timeRange];
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch data in parallel
    const [currentLeads, previousLeads, hotLeads, previousHotLeads, customers, previousCustomers] =
      await Promise.all([
        // Current period leads
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
                {
                  propertyName: 'createdate',
                  operator: 'GTE',
                  value: startDate.getTime().toString(),
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Previous period leads
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
                {
                  propertyName: 'createdate',
                  operator: 'GTE',
                  value: previousPeriodStart.getTime().toString(),
                },
                {
                  propertyName: 'createdate',
                  operator: 'LT',
                  value: startDate.getTime().toString(),
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Current HOT leads
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_score', operator: 'GTE', value: '4' },
                {
                  propertyName: 'createdate',
                  operator: 'GTE',
                  value: startDate.getTime().toString(),
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Previous HOT leads
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_score', operator: 'GTE', value: '4' },
                {
                  propertyName: 'createdate',
                  operator: 'GTE',
                  value: previousPeriodStart.getTime().toString(),
                },
                {
                  propertyName: 'createdate',
                  operator: 'LT',
                  value: startDate.getTime().toString(),
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Current customers (conversions)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' }],
            },
          ],
          limit: 1,
        }),
        // Previous customers
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' }],
            },
          ],
          limit: 1,
        }),
      ]);

    // Calculate metrics
    const totalLeads = currentLeads.total;
    const previousTotalLeads = previousLeads.total || 1;
    const totalLeadsChange = ((totalLeads - previousTotalLeads) / previousTotalLeads) * 100;

    const hotLeadsCount = hotLeads.total;
    const previousHotLeadsCount = previousHotLeads.total || 1;
    const hotLeadsChange = ((hotLeadsCount - previousHotLeadsCount) / previousHotLeadsCount) * 100;

    const customersCount = customers.total;
    const conversionRate = totalLeads > 0 ? (customersCount / totalLeads) * 100 : 0;
    const previousConversionRate =
      previousTotalLeads > 0 ? (previousCustomers.total / previousTotalLeads) * 100 : 0;
    const conversionRateChange = conversionRate - previousConversionRate;

    // Fetch revenue for current and previous periods
    const [currentRevenue, previousRevenue, appointmentsCount] = await Promise.all([
      stripe.getRevenueForPeriod(startDate, now),
      stripe.getRevenueForPeriod(previousPeriodStart, startDate),
      getTodayAppointmentsCount(),
    ]);

    const currentRevenueAmount = stripe.toMajorUnits(currentRevenue.amount);
    const previousRevenueAmount = stripe.toMajorUnits(previousRevenue.amount);
    const revenueChange =
      previousRevenueAmount > 0
        ? ((currentRevenueAmount - previousRevenueAmount) / previousRevenueAmount) * 100
        : 0;

    // Build metrics - using real data only, 0 for unavailable metrics
    const metrics: AnalyticsMetrics = {
      totalLeads,
      totalLeadsChange: Math.round(totalLeadsChange * 10) / 10,
      hotLeads: hotLeadsCount,
      hotLeadsChange: Math.round(hotLeadsChange * 10) / 10,
      appointmentsScheduled: appointmentsCount,
      appointmentsChange: 0, // Requires historical appointment data (SchedulingService doesn't track history)
      conversionRate: Math.round(conversionRate * 10) / 10,
      conversionRateChange: Math.round(conversionRateChange * 10) / 10,
      avgResponseTime: 0, // Requires messaging service integration
      avgResponseTimeChange: 0,
      revenue: currentRevenueAmount,
      revenueChange: Math.round(revenueChange * 10) / 10,
    };

    // Fetch time series data from HubSpot contacts created per day
    const leadsOverTime: TimeSeriesPoint[] = [];
    const appointmentsOverTime: TimeSeriesPoint[] = [];

    // Aggregate leads by creation date from HubSpot (using paginated fetch for all results)
    const leadsWithDates = await fetchAllContacts({
      filterGroups: [
        {
          filters: [
            { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
            { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
          ],
        },
      ],
      properties: ['createdate'],
    });

    // Count leads per day
    const leadsByDay = new Map<string, number>();
    for (const contact of leadsWithDates) {
      const dateStr = new Date(contact.createdAt).toISOString().split('T')[0] ?? '';
      leadsByDay.set(dateStr, (leadsByDay.get(dateStr) ?? 0) + 1);
    }

    // Fetch all appointments for the period
    const allAppointments = await scheduling.getUpcomingAppointments(startDate, now);

    // Count appointments per day
    const appointmentsByDay = new Map<string, number>();
    for (const apt of allAppointments) {
      const dateStr = apt.slot.date;
      appointmentsByDay.set(dateStr, (appointmentsByDay.get(dateStr) ?? 0) + 1);
    }

    // Build time series
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      leadsOverTime.push({
        date: dateStr,
        value: leadsByDay.get(dateStr) ?? 0,
      });
      appointmentsOverTime.push({
        date: dateStr,
        value: appointmentsByDay.get(dateStr) ?? 0,
      });
    }

    // Fetch leads by source from HubSpot
    const sourceColors: Record<string, string> = {
      whatsapp: '#25D366',
      voice: '#3B82F6',
      web_form: '#8B5CF6',
      referral: '#F59E0B',
      facebook: '#1877F2',
      google: '#EA4335',
      manual: '#6B7280',
    };

    const leadsWithSource = await fetchAllContacts({
      filterGroups: [
        {
          filters: [
            { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
            { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
          ],
        },
      ],
      properties: ['lead_source'],
    });

    // Count by source
    const sourceCount = new Map<string, number>();
    for (const contact of leadsWithSource) {
      const source = mapLeadSource(contact.properties.lead_source);
      sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);
    }

    const leadsBySource: LeadsBySource[] = Array.from(sourceCount.entries())
      .map(([source, count]) => ({
        source: source.charAt(0).toUpperCase() + source.slice(1).replace('_', ' '),
        count,
        color: sourceColors[source] ?? '#6B7280',
      }))
      .sort((a, b) => b.count - a.count);

    // Conversion funnel - based on actual HubSpot data
    const conversionFunnel: ConversionFunnelStep[] = [
      { name: 'Lead-uri noi', count: totalLeads, percentage: 100 },
      {
        name: 'Calificați (HOT)',
        count: hotLeadsCount,
        percentage: totalLeads > 0 ? Math.round((hotLeadsCount / totalLeads) * 100) : 0,
      },
      {
        name: 'Clienți',
        count: customersCount,
        percentage: Math.round(conversionRate),
      },
    ];

    // Top procedures - requires procedure_interest aggregation from HubSpot
    const leadsWithProcedure = await fetchAllContacts({
      filterGroups: [
        {
          filters: [
            { propertyName: 'procedure_interest', operator: 'NEQ', value: '' },
            { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
          ],
        },
      ],
      properties: ['procedure_interest'],
    });

    const procedureCount = new Map<string, number>();
    for (const contact of leadsWithProcedure) {
      const procedures = contact.properties.procedure_interest?.split(',') ?? [];
      for (const proc of procedures) {
        const trimmed = proc.trim();
        if (trimmed) {
          procedureCount.set(trimmed, (procedureCount.get(trimmed) ?? 0) + 1);
        }
      }
    }

    const topProcedures: TopProcedure[] = Array.from(procedureCount.entries())
      .map(([procedure, count]) => ({
        procedure,
        count,
        revenue: 0, // Revenue requires Stripe integration per procedure
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Operator performance - requires user assignment tracking (not yet implemented)
    const operatorPerformance: OperatorPerformance[] = [];

    return {
      metrics,
      leadsOverTime,
      appointmentsOverTime,
      leadsBySource,
      conversionFunnel,
      topProcedures,
      operatorPerformance,
    };
  } catch (error) {
    console.error('[getAnalyticsDataAction] Failed to fetch analytics:', error);
    // Return default data on error
    return {
      metrics: {
        totalLeads: 0,
        totalLeadsChange: 0,
        hotLeads: 0,
        hotLeadsChange: 0,
        appointmentsScheduled: 0,
        appointmentsChange: 0,
        conversionRate: 0,
        conversionRateChange: 0,
        avgResponseTime: 0,
        avgResponseTimeChange: 0,
        revenue: 0,
        revenueChange: 0,
      },
      leadsOverTime: [],
      appointmentsOverTime: [],
      leadsBySource: [],
      conversionFunnel: [],
      topProcedures: [],
      operatorPerformance: [],
    };
  }
}
