'use server';

import { z } from 'zod';
import { SchedulingService } from '@medicalcor/domain';
import {
  RecentLeadSchema,
  DashboardStatsSchema,
  type RecentLead,
  type DashboardStats,
  type HubSpotContact,
} from '@medicalcor/types';
import { StripeClient, type MockStripeClient } from '@medicalcor/integrations';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getStripeClient, getSchedulingService } from './utils/clients';
import { maskPhone, formatRelativeTime } from './utils/formatters';
import { mapScoreToClassification, mapLeadSource } from './utils/hubspot-mappers';

/**
 * Dashboard Server Actions
 *
 * Actions for fetching dashboard statistics and recent leads.
 */

/**
 * Helper: Get count of today's appointments from SchedulingService
 */
async function getTodayAppointmentsCount(scheduling: SchedulingService): Promise<number> {
  try {
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
 * Helper: Get daily revenue from Stripe (in RON, major units)
 */
async function getDailyRevenueAmount(
  stripe: StripeClient | MockStripeClient
): Promise<number | undefined> {
  try {
    const result = await stripe.getDailyRevenue('Europe/Bucharest');
    // Convert from minor units (bani) to major units (RON)
    return stripe.toMajorUnits(result.amount);
  } catch (error) {
    console.error('[getDailyRevenueAmount] Failed to fetch daily revenue:', error);
    return undefined;
  }
}

/**
 * Fetches recent leads for Dashboard display
 * Returns leads with masked phone numbers (GDPR)
 * @requires VIEW_PATIENTS permission
 */
export async function getRecentLeadsAction(limit = 5): Promise<RecentLead[]> {
  try {
    await requirePermission('VIEW_PATIENTS');
    const hubspot = getHubSpotClient();

    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lifecyclestage',
              operator: 'EQ',
              value: 'lead',
            },
          ],
        },
      ],
      properties: ['phone', 'lead_score', 'lead_source', 'createdate'],
      sorts: [
        {
          propertyName: 'createdate',
          direction: 'DESCENDING',
        },
      ],
      limit,
    });

    const leads = response.results.map((contact: HubSpotContact) => {
      const score = parseInt(contact.properties.lead_score ?? '3', 10);
      return {
        id: contact.id,
        phone: maskPhone(contact.properties.phone ?? '+40700000000'),
        score: Math.min(Math.max(score, 1), 5), // Clamp to 1-5
        classification: mapScoreToClassification(contact.properties.lead_score),
        source: mapLeadSource(contact.properties.lead_source),
        time: formatRelativeTime(contact.createdAt),
      };
    });

    return z.array(RecentLeadSchema).parse(leads);
  } catch (error) {
    console.error('[getRecentLeadsAction] Failed to fetch recent leads:', error);
    return [];
  }
}

/**
 * Fetches dashboard statistics from HubSpot, SchedulingService, and Stripe
 * @requires VIEW_PATIENTS permission
 */
export async function getDashboardStatsAction(): Promise<DashboardStats> {
  try {
    await requirePermission('VIEW_PATIENTS');
    const hubspot = getHubSpotClient();
    const scheduling = getSchedulingService();
    const stripe = getStripeClient();

    // Fetch all data in parallel for better performance
    const [leadsResponse, patientsResponse, urgentResponse, appointmentsToday, dailyRevenueResult] =
      await Promise.all([
        // Fetch leads count
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'lifecyclestage',
                  operator: 'EQ',
                  value: 'lead',
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Fetch active patients count
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'lifecyclestage',
                  operator: 'EQ',
                  value: 'customer',
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Fetch urgent (high score) leads
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'lead_score',
                  operator: 'GTE',
                  value: '4',
                },
              ],
            },
          ],
          limit: 1,
        }),
        // Fetch today's appointments from SchedulingService
        getTodayAppointmentsCount(scheduling),
        // Fetch daily revenue from Stripe
        getDailyRevenueAmount(stripe),
      ]);

    const stats: DashboardStats = {
      totalLeads: leadsResponse.total,
      activePatients: patientsResponse.total,
      urgentTriage: urgentResponse.total,
      appointmentsToday,
      dailyRevenue: dailyRevenueResult,
    };

    return DashboardStatsSchema.parse(stats);
  } catch (error) {
    console.error('[getDashboardStatsAction] Failed to fetch dashboard stats:', error);
    // Return default stats on error
    return {
      totalLeads: 0,
      activePatients: 0,
      urgentTriage: 0,
      appointmentsToday: 0,
    };
  }
}
