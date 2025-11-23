'use server';

import { z } from 'zod';
import {
  HubSpotClient,
  StripeClient,
  type MockStripeClient,
  createMockStripeClient,
} from '@medicalcor/integrations';
import { SchedulingService } from '@medicalcor/domain';
import {
  PatientListItemSchema,
  RecentLeadSchema,
  DashboardStatsSchema,
  type PatientListItem,
  type RecentLead,
  type DashboardStats,
  type LeadClassification,
  type LeadSource,
  type HubSpotContact,
} from '@medicalcor/types';

/**
 * Server Actions for Patient/Lead Data Fetching
 *
 * These actions fetch data directly from HubSpot (Single Source of Truth)
 * and transform it to our internal schemas with Zod validation.
 *
 * Note: These run ONLY on the server - API keys are never exposed to client.
 */

// Lazy-initialized clients (only created when first action is called)
let hubspotClient: HubSpotClient | null = null;
let stripeClient: StripeClient | MockStripeClient | null = null;
let schedulingService: SchedulingService | null = null;

function getHubSpotClient(): HubSpotClient {
  if (!hubspotClient) {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN environment variable is not set');
    }
    hubspotClient = new HubSpotClient({ accessToken });
  }
  return hubspotClient;
}

function getStripeClient(): StripeClient | MockStripeClient {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // Use mock client for development when Stripe is not configured
      console.warn('[getStripeClient] STRIPE_SECRET_KEY not set, using mock client');
      stripeClient = createMockStripeClient();
    } else {
      stripeClient = new StripeClient({ secretKey });
    }
  }
  return stripeClient;
}

function getSchedulingService(): SchedulingService {
  schedulingService ??= new SchedulingService({
    timezone: 'Europe/Bucharest',
  });
  return schedulingService;
}

/**
 * Maps HubSpot lifecycle stage to our internal PatientStatus
 */
function mapHubSpotStageToStatus(stage?: string): 'lead' | 'active' | 'inactive' | 'archived' {
  switch (stage?.toLowerCase()) {
    case 'customer':
    case 'evangelist':
      return 'active';
    case 'lead':
    case 'subscriber':
    case 'marketingqualifiedlead':
    case 'salesqualifiedlead':
    case 'opportunity':
      return 'lead';
    case 'other':
      return 'inactive';
    default:
      return 'lead';
  }
}

/**
 * Maps lead_score string to classification
 */
function mapScoreToClassification(score?: string): LeadClassification {
  const numScore = parseInt(score ?? '0', 10);
  if (numScore >= 4) return 'HOT';
  if (numScore >= 2) return 'WARM';
  return 'COLD';
}

/**
 * Maps HubSpot lead_source to our LeadSource enum
 */
function mapLeadSource(source?: string): LeadSource {
  switch (source?.toLowerCase()) {
    case 'whatsapp':
    case '360dialog':
      return 'whatsapp';
    case 'voice':
    case 'phone':
    case 'twilio':
      return 'voice';
    case 'facebook':
    case 'facebook_ads':
      return 'facebook';
    case 'google':
    case 'google_ads':
      return 'google';
    case 'referral':
      return 'referral';
    case 'web':
    case 'website':
    case 'form':
      return 'web_form';
    default:
      return 'manual';
  }
}

/**
 * Masks phone number for display (GDPR compliance)
 * Example: +40721234567 -> +40721***567
 */
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  const visible = 6;
  const masked = phone.length - visible - 3;
  return `${phone.slice(0, visible)}${'*'.repeat(Math.max(masked, 3))}${phone.slice(-3)}`;
}

/**
 * Formats relative time for display
 */
function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'acum';
  if (diffMins < 60) return `acum ${diffMins} min`;
  if (diffHours < 24) return `acum ${diffHours} ore`;
  if (diffDays === 1) return 'ieri';
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return then.toLocaleDateString('ro-RO');
}

/**
 * Fetches all patients/leads from HubSpot
 * Returns validated PatientListItem array
 */
export async function getPatientsAction(): Promise<PatientListItem[]> {
  try {
    const hubspot = getHubSpotClient();

    // Search for all contacts with relevant properties
    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lifecyclestage',
              operator: 'NEQ',
              value: '', // Get all non-empty lifecycle stages
            },
          ],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'phone',
        'email',
        'lifecyclestage',
        'lead_score',
        'lead_source',
        'procedure_interest',
      ],
      sorts: [
        {
          propertyName: 'lastmodifieddate',
          direction: 'DESCENDING',
        },
      ],
      limit: 100,
    });

    // Map HubSpot contacts to our PatientListItem schema
    const patients = response.results.map((contact: HubSpotContact) => ({
      id: contact.id,
      firstName: contact.properties.firstname,
      lastName: contact.properties.lastname,
      phone: contact.properties.phone ?? '',
      email: contact.properties.email,
      status: mapHubSpotStageToStatus(contact.properties.lifecyclestage),
      lastContactDate: contact.updatedAt ? new Date(contact.updatedAt).toISOString() : undefined,
      lifecycleStage: contact.properties.lifecyclestage,
      leadScore: contact.properties.lead_score
        ? parseInt(contact.properties.lead_score, 10)
        : undefined,
      classification: mapScoreToClassification(contact.properties.lead_score),
      source: mapLeadSource(contact.properties.lead_source),
      procedureInterest: contact.properties.procedure_interest,
      createdAt: contact.createdAt ? new Date(contact.createdAt).toISOString() : undefined,
      updatedAt: contact.updatedAt ? new Date(contact.updatedAt).toISOString() : undefined,
    }));

    // Validate through Zod for type safety
    return z.array(PatientListItemSchema).parse(patients);
  } catch (error) {
    console.error('[getPatientsAction] Failed to fetch patients:', error);
    // Return empty array on error - UI will show empty state
    return [];
  }
}

/**
 * Fetches recent leads for Dashboard display
 * Returns leads with masked phone numbers (GDPR)
 */
export async function getRecentLeadsAction(limit = 5): Promise<RecentLead[]> {
  try {
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
 */
export async function getDashboardStatsAction(): Promise<DashboardStats> {
  try {
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
