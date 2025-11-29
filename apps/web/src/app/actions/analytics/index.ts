'use server';

/**
 * @fileoverview Analytics Server Actions
 *
 * Server actions for analytics data fetching and aggregation.
 * Provides metrics, time series, and breakdown data for dashboards.
 *
 * @module actions/analytics
 * @security All actions require VIEW_ANALYTICS permission
 */

import type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getStripeClient, getSchedulingService } from '../shared/clients';
import { fetchAllContacts } from '../shared/pagination';
import { mapLeadSource } from '../shared/mappers';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Time range to days mapping
 * @constant
 */
const TIME_RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
} as const;

/**
 * Source color palette for charts
 * @constant
 */
const SOURCE_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  voice: '#3B82F6',
  web_form: '#8B5CF6',
  referral: '#F59E0B',
  facebook: '#1877F2',
  google: '#EA4335',
  manual: '#6B7280',
} as const;

/**
 * Default color for unknown sources
 * @constant
 */
const DEFAULT_SOURCE_COLOR = '#6B7280';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates percentage change between two values
 * @internal
 */
function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Formats source name for display
 * @internal
 */
function formatSourceName(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1).replace('_', ' ');
}

/**
 * Generates date range for a time period
 * @internal
 */
function getDateRange(days: number): { start: Date; end: Date; previousStart: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, previousStart };
}

/**
 * Creates empty analytics data structure
 * @internal
 */
function createEmptyAnalyticsData(): AnalyticsData {
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

// ============================================================================
// ANALYTICS ACTIONS
// ============================================================================

/**
 * Fetches comprehensive analytics data from HubSpot and Stripe
 *
 * Aggregates data across multiple sources to provide:
 * - Key metrics with period-over-period changes
 * - Time series data for leads and appointments
 * - Leads breakdown by source
 * - Conversion funnel stages
 * - Top procedures by interest
 *
 * @param timeRange - Time range for analytics (7d, 30d, 90d, 12m)
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Comprehensive analytics data structure
 *
 * @example
 * ```typescript
 * const analytics = await getAnalyticsDataAction('30d');
 * console.log(analytics.metrics.totalLeads);
 * console.log(analytics.leadsOverTime);
 * ```
 */
export async function getAnalyticsDataAction(
  timeRange: '7d' | '30d' | '90d' | '12m' = '30d'
): Promise<AnalyticsData> {
  try {
    await requirePermission('VIEW_ANALYTICS');
    const hubspot = getHubSpotClient();
    const stripe = getStripeClient();
    const scheduling = getSchedulingService();

    // Calculate date ranges
    const days = TIME_RANGE_DAYS[timeRange] ?? 30;
    const { start: startDate, end: now, previousStart: previousPeriodStart } = getDateRange(days);

    // Fetch all metrics in parallel
    const [
      currentLeads,
      previousLeads,
      hotLeads,
      previousHotLeads,
      customers,
      previousCustomers,
      currentRevenue,
      previousRevenue,
      appointmentsCount,
    ] = await Promise.all([
      // Current period leads
      hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
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
              { propertyName: 'createdate', operator: 'GTE', value: previousPeriodStart.getTime().toString() },
              { propertyName: 'createdate', operator: 'LT', value: startDate.getTime().toString() },
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
              { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
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
              { propertyName: 'createdate', operator: 'GTE', value: previousPeriodStart.getTime().toString() },
              { propertyName: 'createdate', operator: 'LT', value: startDate.getTime().toString() },
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
      // Revenue
      stripe.getRevenueForPeriod(startDate, now),
      stripe.getRevenueForPeriod(previousPeriodStart, startDate),
      // Today's appointments
      (async () => {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        const appointments = await scheduling.getUpcomingAppointments(todayStart, todayEnd);
        return appointments.length;
      })(),
    ]);

    // Calculate metrics
    const totalLeads = currentLeads.total;
    const previousTotalLeads = previousLeads.total || 1;
    const hotLeadsCount = hotLeads.total;
    const previousHotLeadsCount = previousHotLeads.total || 1;
    const customersCount = customers.total;

    const conversionRate = totalLeads > 0 ? (customersCount / totalLeads) * 100 : 0;
    const previousConversionRate =
      previousTotalLeads > 0 ? (previousCustomers.total / previousTotalLeads) * 100 : 0;

    const currentRevenueAmount = stripe.toMajorUnits(currentRevenue.amount);
    const previousRevenueAmount = stripe.toMajorUnits(previousRevenue.amount);

    const metrics: AnalyticsMetrics = {
      totalLeads,
      totalLeadsChange: calculatePercentageChange(totalLeads, previousTotalLeads),
      hotLeads: hotLeadsCount,
      hotLeadsChange: calculatePercentageChange(hotLeadsCount, previousHotLeadsCount),
      appointmentsScheduled: appointmentsCount,
      appointmentsChange: 0, // Requires historical data
      conversionRate: Math.round(conversionRate * 10) / 10,
      conversionRateChange: Math.round((conversionRate - previousConversionRate) * 10) / 10,
      avgResponseTime: 0, // Requires messaging integration
      avgResponseTimeChange: 0,
      revenue: currentRevenueAmount,
      revenueChange: calculatePercentageChange(currentRevenueAmount, previousRevenueAmount),
    };

    // Fetch time series and breakdown data
    const [leadsWithDates, leadsWithSource, leadsWithProcedure, allAppointments] = await Promise.all([
      // Leads with dates for time series
      fetchAllContacts(hubspot, {
        filterGroups: [
          {
            filters: [
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
            ],
          },
        ],
        properties: ['createdate'],
      }),
      // Leads with source for breakdown
      fetchAllContacts(hubspot, {
        filterGroups: [
          {
            filters: [
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
            ],
          },
        ],
        properties: ['lead_source'],
      }),
      // Leads with procedure interest
      fetchAllContacts(hubspot, {
        filterGroups: [
          {
            filters: [
              { propertyName: 'procedure_interest', operator: 'NEQ', value: '' },
              { propertyName: 'createdate', operator: 'GTE', value: startDate.getTime().toString() },
            ],
          },
        ],
        properties: ['procedure_interest'],
      }),
      // Appointments for time series
      scheduling.getUpcomingAppointments(startDate, now),
    ]);

    // Build leads over time
    const leadsByDay = new Map<string, number>();
    for (const contact of leadsWithDates) {
      const dateStr = new Date(contact.createdAt).toISOString().split('T')[0] ?? '';
      leadsByDay.set(dateStr, (leadsByDay.get(dateStr) ?? 0) + 1);
    }

    // Build appointments over time
    const appointmentsByDay = new Map<string, number>();
    for (const apt of allAppointments) {
      const dateStr = apt.slot.date;
      appointmentsByDay.set(dateStr, (appointmentsByDay.get(dateStr) ?? 0) + 1);
    }

    // Generate time series
    const leadsOverTime: TimeSeriesPoint[] = [];
    const appointmentsOverTime: TimeSeriesPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      leadsOverTime.push({ date: dateStr, value: leadsByDay.get(dateStr) ?? 0 });
      appointmentsOverTime.push({ date: dateStr, value: appointmentsByDay.get(dateStr) ?? 0 });
    }

    // Build leads by source
    const sourceCount = new Map<string, number>();
    for (const contact of leadsWithSource) {
      const source = mapLeadSource(contact.properties.lead_source);
      sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);
    }

    const leadsBySource: LeadsBySource[] = Array.from(sourceCount.entries())
      .map(([source, count]) => ({
        source: formatSourceName(source),
        count,
        color: SOURCE_COLORS[source] ?? DEFAULT_SOURCE_COLOR,
      }))
      .sort((a, b) => b.count - a.count);

    // Build conversion funnel
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

    // Build top procedures
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
        revenue: 0, // Requires per-procedure Stripe integration
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Operator performance (requires user assignment tracking)
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
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAnalyticsDataAction] Failed to fetch analytics:', error);
    }
    return createEmptyAnalyticsData();
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from '@medicalcor/types';
