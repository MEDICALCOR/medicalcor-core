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
  type PaginatedResponse,
  type HubSpotSearchRequest,
  // Server Actions types
  type TriageLead,
  type TriageColumn,
  type CalendarSlot,
  type AnalyticsMetrics,
  type TimeSeriesPoint,
  type LeadsBySource,
  type ConversionFunnelStep,
  type TopProcedure,
  type OperatorPerformance,
  type AnalyticsData,
  type Conversation,
  type Message,
  type PatientDetailData,
  type PatientTimelineEvent,
} from '@medicalcor/types';
import {
  requirePermission,
  requirePatientAccess,
  AuthorizationError,
} from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Patient/Lead Data Fetching
 *
 * These actions fetch data directly from HubSpot (Single Source of Truth)
 * and transform it to our internal schemas with Zod validation.
 *
 * SECURITY: All actions require authentication and appropriate permissions.
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
 * Fetches all contacts matching a search query using cursor-based pagination
 * Handles HubSpot's 100-per-page limit automatically
 * @param searchParams - HubSpot search parameters (without limit/after)
 * @param maxResults - Maximum results to fetch (default 5000, prevents runaway queries)
 */
async function fetchAllContacts(
  hubspot: HubSpotClient,
  searchParams: Omit<HubSpotSearchRequest, 'limit' | 'after'>,
  maxResults = 5000
): Promise<HubSpotContact[]> {
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
      // Reached maxResults limit, stopping pagination
      break;
    }
  } while (cursor);

  return allResults;
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
 * Fetches all patients/leads from HubSpot (legacy non-paginated version)
 * @deprecated Use getPatientsActionPaginated for new implementations
 * @requires VIEW_PATIENTS permission
 */
export async function getPatientsAction(): Promise<PatientListItem[]> {
  const result = await getPatientsActionPaginated({ pageSize: 100 });
  return result.items;
}

/**
 * Fetches patients/leads from HubSpot with cursor-based pagination
 * Returns validated PaginatedResponse with PatientListItem array
 * @param options.cursor - Cursor for next page (from previous response)
 * @param options.pageSize - Number of items per page (1-100, default 20)
 * @requires VIEW_PATIENTS permission
 */
export async function getPatientsActionPaginated(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<PatientListItem>> {
  const { cursor, pageSize = 20 } = options ?? {};
  const validatedPageSize = Math.min(Math.max(pageSize, 1), 100);

  try {
    // Authorization check
    await requirePermission('VIEW_PATIENTS');

    const hubspot = getHubSpotClient();

    // Search for contacts with relevant properties
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
      limit: validatedPageSize,
      after: cursor,
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
    const validatedPatients = z.array(PatientListItemSchema).parse(patients);

    // Extract next cursor from HubSpot paging info
    const nextCursor = response.paging?.next?.after ?? null;

    return {
      items: validatedPatients,
      nextCursor,
      hasMore: nextCursor !== null,
      total: response.total,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error; // Re-throw auth errors to be handled by UI
    }
    console.error('[getPatientsActionPaginated] Failed to fetch patients:', error);
    // Return empty result on error - UI will show empty state
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
    };
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
    if (error instanceof AuthorizationError) throw error;
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

// ============================================================================
// TRIAGE PAGE SERVER ACTIONS
// ============================================================================

// Types re-exported from @medicalcor/types for backwards compatibility
export type { TriageLead, TriageColumn } from '@medicalcor/types';

/**
 * Fetches leads for Triage board, grouped by classification/status
 * @requires VIEW_PATIENTS permission
 */
export async function getTriageLeadsAction(): Promise<TriageColumn[]> {
  try {
    await requirePermission('VIEW_PATIENTS');
    const hubspot = getHubSpotClient();
    const scheduling = getSchedulingService();

    // Fetch all leads in parallel
    const [newLeadsResponse, hotLeadsResponse, warmLeadsResponse, coldLeadsResponse] =
      await Promise.all([
        // New leads (recently created, not yet scored)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }],
            },
          ],
          properties: [
            'phone',
            'lead_score',
            'lead_source',
            'createdate',
            'procedure_interest',
            'hs_lead_status',
            'firstname',
          ],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 50,
        }),
        // HOT leads (score >= 4)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_score', operator: 'GTE', value: '4' },
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              ],
            },
          ],
          properties: [
            'phone',
            'lead_score',
            'lead_source',
            'createdate',
            'procedure_interest',
            'hs_lead_status',
            'firstname',
          ],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 20,
        }),
        // WARM leads (score 2-3)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_score', operator: 'GTE', value: '2' },
                { propertyName: 'lead_score', operator: 'LT', value: '4' },
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              ],
            },
          ],
          properties: [
            'phone',
            'lead_score',
            'lead_source',
            'createdate',
            'procedure_interest',
            'hs_lead_status',
            'firstname',
          ],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 20,
        }),
        // COLD leads (score < 2)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_score', operator: 'LT', value: '2' },
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
              ],
            },
          ],
          properties: [
            'phone',
            'lead_score',
            'lead_source',
            'createdate',
            'procedure_interest',
            'hs_lead_status',
            'firstname',
          ],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 20,
        }),
      ]);

    // Get upcoming appointments
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const appointments = await scheduling.getUpcomingAppointments(now, nextWeek);
    const scheduledContactIds = new Set(appointments.map((a) => a.hubspotContactId));

    // Map contacts to TriageLead format
    const mapContactToLead = (contact: HubSpotContact): TriageLead => {
      const score = parseInt(contact.properties.lead_score ?? '0', 10);
      const procedureInterest = contact.properties.procedure_interest
        ? contact.properties.procedure_interest.split(',').map((p) => p.trim())
        : [];

      // Find appointment for this contact
      const apt = appointments.find((a) => a.hubspotContactId === contact.id);

      return {
        id: contact.id,
        phone: maskPhone(contact.properties.phone ?? '+40700000000'),
        source: mapLeadSource(contact.properties.lead_source),
        time: formatRelativeTime(contact.createdAt),
        score: score > 0 ? score : undefined,
        confidence: undefined, // Requires AI scoring integration
        reasoning:
          score >= 4
            ? 'High intent detected from conversation'
            : score >= 2
              ? 'Moderate interest shown'
              : 'Initial inquiry',
        procedureInterest,
        appointment: apt ? `${apt.slot.date} ${apt.slot.startTime}` : undefined,
      };
    };

    // Filter out contacts that are scheduled from other columns
    const filterScheduled = (contacts: HubSpotContact[]) =>
      contacts.filter((c) => !scheduledContactIds.has(c.id));

    // Filter new leads (no score or very recent)
    const newLeads = newLeadsResponse.results
      .filter((c) => {
        const score = parseInt(c.properties.lead_score ?? '0', 10);
        const createdAt = new Date(c.createdAt);
        const minutesAgo = (now.getTime() - createdAt.getTime()) / 60000;
        return score === 0 || minutesAgo < 15;
      })
      .filter((c) => !scheduledContactIds.has(c.id))
      .slice(0, 10);

    // Build columns
    const columns: TriageColumn[] = [
      {
        id: 'new',
        title: 'Nou',
        leads: newLeads.map(mapContactToLead),
      },
      {
        id: 'hot',
        title: 'HOT',
        leads: filterScheduled(hotLeadsResponse.results).map(mapContactToLead),
      },
      {
        id: 'warm',
        title: 'WARM',
        leads: filterScheduled(warmLeadsResponse.results).map(mapContactToLead),
      },
      {
        id: 'cold',
        title: 'COLD',
        leads: filterScheduled(coldLeadsResponse.results).map(mapContactToLead),
      },
      {
        id: 'scheduled',
        title: 'Programat',
        leads: appointments.map((apt) => ({
          id: apt.hubspotContactId,
          phone: maskPhone(apt.phone),
          source: 'whatsapp' as LeadSource,
          time: formatRelativeTime(apt.createdAt),
          score: 4,
          procedureInterest: [apt.procedureType],
          appointment: `${apt.slot.date} ${apt.slot.startTime}`,
        })),
      },
    ];

    return columns;
  } catch (error) {
    console.error('[getTriageLeadsAction] Failed to fetch triage leads:', error);
    // Return empty columns on error
    return [
      { id: 'new', title: 'Nou', leads: [] },
      { id: 'hot', title: 'HOT', leads: [] },
      { id: 'warm', title: 'WARM', leads: [] },
      { id: 'cold', title: 'COLD', leads: [] },
      { id: 'scheduled', title: 'Programat', leads: [] },
    ];
  }
}

// ============================================================================
// CALENDAR PAGE SERVER ACTIONS
// ============================================================================

// Types re-exported from @medicalcor/types for backwards compatibility
export type { CalendarSlot } from '@medicalcor/types';

/**
 * Fetches calendar slots for a specific date
 * @requires VIEW_APPOINTMENTS permission
 */
export async function getCalendarSlotsAction(dateStr: string): Promise<CalendarSlot[]> {
  try {
    await requirePermission('VIEW_APPOINTMENTS');
    const scheduling = getSchedulingService();

    const date = new Date(dateStr);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Get available slots for the day
    const availableSlots = await scheduling.getAvailableSlots({
      procedureType: 'consultation',
      preferredDates: [dateStr],
      limit: 50,
    });

    // Get booked appointments for the day
    const appointments = await scheduling.getUpcomingAppointments(dayStart, dayEnd);

    // Merge available slots with appointments
    const allSlots: CalendarSlot[] = [];

    // Add available slots
    for (const slot of availableSlots) {
      allSlots.push({
        id: slot.id,
        time: slot.startTime,
        duration: slot.duration,
        available: true,
      });
    }

    // Add booked slots
    for (const apt of appointments) {
      // Check if this slot already exists
      const existingIndex = allSlots.findIndex((s) => s.time === apt.slot.startTime);
      if (existingIndex >= 0) {
        allSlots[existingIndex] = {
          id: apt.id,
          time: apt.slot.startTime,
          duration: apt.slot.duration,
          available: false,
          patient: apt.patientName ?? maskPhone(apt.phone),
          procedure: apt.procedureType,
        };
      } else {
        allSlots.push({
          id: apt.id,
          time: apt.slot.startTime,
          duration: apt.slot.duration,
          available: false,
          patient: apt.patientName ?? maskPhone(apt.phone),
          procedure: apt.procedureType,
        });
      }
    }

    // Sort by time
    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    return allSlots;
  } catch (error) {
    console.error('[getCalendarSlotsAction] Failed to fetch calendar slots:', error);
    return [];
  }
}

// ============================================================================
// ANALYTICS PAGE SERVER ACTIONS
// ============================================================================

// Types re-exported from @medicalcor/types for backwards compatibility
export type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from '@medicalcor/types';

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
    const scheduling = getSchedulingService();
    const [currentRevenue, previousRevenue, appointmentsCount] = await Promise.all([
      stripe.getRevenueForPeriod(startDate, now),
      stripe.getRevenueForPeriod(previousPeriodStart, startDate),
      getTodayAppointmentsCount(scheduling),
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
    const leadsWithDates = await fetchAllContacts(hubspot, {
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

    const leadsWithSource = await fetchAllContacts(hubspot, {
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
    const leadsWithProcedure = await fetchAllContacts(hubspot, {
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

// ============================================================================
// MESSAGES PAGE SERVER ACTIONS
// ============================================================================

// Types re-exported from @medicalcor/types for backwards compatibility
export type { Conversation, Message } from '@medicalcor/types';

/**
 * Fetches conversations list from HubSpot contacts (legacy non-paginated version)
 * @deprecated Use getConversationsActionPaginated for new implementations
 * @requires VIEW_MESSAGES permission
 */
export async function getConversationsAction(): Promise<Conversation[]> {
  const result = await getConversationsActionPaginated({ pageSize: 50 });
  return result.items;
}

/**
 * Fetches conversations list from HubSpot contacts with cursor-based pagination
 * @param options.cursor - Cursor for next page (from previous response)
 * @param options.pageSize - Number of items per page (1-100, default 20)
 * @requires VIEW_MESSAGES permission
 */
export async function getConversationsActionPaginated(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<Conversation>> {
  const { cursor, pageSize = 20 } = options ?? {};
  const validatedPageSize = Math.min(Math.max(pageSize, 1), 100);

  try {
    await requirePermission('VIEW_MESSAGES');
    const hubspot = getHubSpotClient();

    // Fetch recent contacts with messages
    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [{ propertyName: 'lifecyclestage', operator: 'NEQ', value: '' }],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'phone',
        'email',
        'hs_lead_status',
        'lastmodifieddate',
        'lead_source',
      ],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: validatedPageSize,
      after: cursor,
    });

    const conversations: Conversation[] = response.results.map((contact: HubSpotContact) => {
      const name =
        [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') ||
        'Unknown';

      const source = contact.properties.lead_source?.toLowerCase() ?? '';
      const channel: 'whatsapp' | 'sms' | 'email' = source.includes('whatsapp')
        ? 'whatsapp'
        : source.includes('sms')
          ? 'sms'
          : 'email';

      const status = contact.properties.lead_status?.toLowerCase() ?? '';
      const convStatus: 'active' | 'waiting' | 'resolved' | 'archived' =
        status.includes('active') || status.includes('new')
          ? 'active'
          : status.includes('waiting') || status.includes('pending')
            ? 'waiting'
            : status.includes('resolved') || status.includes('closed')
              ? 'resolved'
              : 'active';

      return {
        id: contact.id,
        patientName: name,
        phone: maskPhone(contact.properties.phone ?? '+40700000000'),
        channel,
        status: convStatus,
        unreadCount: 0, // Requires WhatsApp/messaging service integration
        lastMessage: {
          content: '', // No message data available without messaging service
          direction: 'IN' as const,
          timestamp: new Date(contact.updatedAt),
        },
        updatedAt: new Date(contact.updatedAt),
      };
    });

    // Extract next cursor from HubSpot paging info
    const nextCursor = response.paging?.next?.after ?? null;

    return {
      items: conversations,
      nextCursor,
      hasMore: nextCursor !== null,
      total: response.total,
    };
  } catch (error) {
    console.error('[getConversationsActionPaginated] Failed to fetch conversations:', error);
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
    };
  }
}

/**
 * Fetches messages for a conversation
 * Requires WhatsApp Business API or database integration to store message history.
 * Currently returns empty array until messaging storage is implemented.
 */
export async function getMessagesAction(_conversationId: string): Promise<Message[]> {
  // Real implementation requires:
  // 1. WhatsApp Business API integration to fetch message history
  // 2. Or a database table to store incoming/outgoing messages
  // Currently no messaging storage is configured

  await Promise.resolve(); // Async operation placeholder

  // Return empty array - no message data available without messaging service integration
  return [];
}

// ============================================================================
// PATIENT DETAIL SERVER ACTIONS
// ============================================================================

// Types re-exported from @medicalcor/types for backwards compatibility
export type { PatientDetailData } from '@medicalcor/types';

/**
 * Fetches a single patient/contact by ID from HubSpot
 * SECURITY: Validates user has access to this specific patient (IDOR protection)
 * @requires VIEW_PATIENTS permission + patient access check
 */
export async function getPatientByIdAction(patientId: string): Promise<PatientDetailData | null> {
  try {
    // Authorization check - verify user has VIEW_PATIENTS permission
    await requirePermission('VIEW_PATIENTS');

    // IDOR protection - verify user can access this specific patient
    await requirePatientAccess(patientId);

    const hubspot = getHubSpotClient();

    // Fetch contact from HubSpot
    // Note: getContact throws if contact not found
    const contact = await hubspot.getContact(patientId);

    // Map HubSpot contact to our PatientDetailData schema
    const procedureInterest = contact.properties.procedure_interest
      ? contact.properties.procedure_interest.split(',').map((p) => p.trim())
      : undefined;

    return {
      id: contact.id,
      firstName: contact.properties.firstname ?? '',
      lastName: contact.properties.lastname ?? '',
      phone: contact.properties.phone ?? '',
      email: contact.properties.email,
      lifecycleStage: contact.properties.lifecyclestage,
      leadScore: contact.properties.lead_score
        ? parseInt(contact.properties.lead_score, 10)
        : undefined,
      classification: mapScoreToClassification(contact.properties.lead_score),
      source: mapLeadSource(contact.properties.lead_source),
      procedureInterest,
      language: contact.properties.hs_language,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      hubspotContactId: contact.id,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error; // Re-throw auth errors to be handled by UI
    }
    console.error('[getPatientByIdAction] Failed to fetch patient:', error);
    return null;
  }
}

// PatientTimelineEvent re-exported from @medicalcor/types for backwards compatibility
export type { PatientTimelineEvent } from '@medicalcor/types';

/**
 * Fetches patient timeline events from HubSpot
 * @requires VIEW_PATIENTS permission + patient access check
 */
export async function getPatientTimelineAction(patientId: string): Promise<PatientTimelineEvent[]> {
  try {
    await requirePermission('VIEW_PATIENTS');
    await requirePatientAccess(patientId);

    // Timeline events require HubSpot Engagements API or custom timeline events
    // Currently returning empty array - requires additional HubSpot API calls
    // to fetch notes, calls, emails, and custom timeline events

    return [];
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    console.error('[getPatientTimelineAction] Failed to fetch timeline:', error);
    return [];
  }
}
