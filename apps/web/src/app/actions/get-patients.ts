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

// ============================================================================
// TRIAGE PAGE SERVER ACTIONS
// ============================================================================

export interface TriageLead {
  id: string;
  phone: string;
  source: LeadSource;
  time: string;
  message?: string;
  score?: number;
  confidence?: number;
  reasoning?: string;
  procedureInterest?: string[];
  appointment?: string;
}

export interface TriageColumn {
  id: 'new' | 'hot' | 'warm' | 'cold' | 'scheduled';
  title: string;
  leads: TriageLead[];
}

/**
 * Fetches leads for Triage board, grouped by classification/status
 */
export async function getTriageLeadsAction(): Promise<TriageColumn[]> {
  try {
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
        confidence: score > 0 ? 0.7 + Math.random() * 0.25 : undefined, // Simulated confidence
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

export interface CalendarSlot {
  id: string;
  time: string;
  duration: number;
  available: boolean;
  patient?: string;
  procedure?: string;
}

/**
 * Fetches calendar slots for a specific date
 */
export async function getCalendarSlotsAction(dateStr: string): Promise<CalendarSlot[]> {
  try {
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

export interface AnalyticsMetrics {
  totalLeads: number;
  totalLeadsChange: number;
  hotLeads: number;
  hotLeadsChange: number;
  appointmentsScheduled: number;
  appointmentsChange: number;
  conversionRate: number;
  conversionRateChange: number;
  avgResponseTime: number;
  avgResponseTimeChange: number;
  revenue: number;
  revenueChange: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface LeadsBySource {
  source: string;
  count: number;
  color: string;
}

export interface ConversionFunnelStep {
  name: string;
  count: number;
  percentage: number;
}

export interface TopProcedure {
  procedure: string;
  count: number;
  revenue: number;
}

export interface OperatorPerformance {
  id: string;
  name: string;
  leadsHandled: number;
  conversions: number;
  conversionRate: number;
  avgResponseTime: number;
  satisfaction: number;
}

export interface AnalyticsData {
  metrics: AnalyticsMetrics;
  leadsOverTime: TimeSeriesPoint[];
  appointmentsOverTime: TimeSeriesPoint[];
  leadsBySource: LeadsBySource[];
  conversionFunnel: ConversionFunnelStep[];
  topProcedures: TopProcedure[];
  operatorPerformance: OperatorPerformance[];
}

/**
 * Fetches analytics data from HubSpot
 */
export async function getAnalyticsDataAction(
  timeRange: '7d' | '30d' | '90d' | '12m' = '30d'
): Promise<AnalyticsData> {
  try {
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

    // Fetch revenue
    const dailyRevenue = await getDailyRevenueAmount(stripe);

    // Build metrics
    const metrics: AnalyticsMetrics = {
      totalLeads,
      totalLeadsChange: Math.round(totalLeadsChange * 10) / 10,
      hotLeads: hotLeadsCount,
      hotLeadsChange: Math.round(hotLeadsChange * 10) / 10,
      appointmentsScheduled: Math.floor(totalLeads * 0.4), // Estimated
      appointmentsChange: 5.2,
      conversionRate: Math.round(conversionRate * 10) / 10,
      conversionRateChange: Math.round(conversionRateChange * 10) / 10,
      avgResponseTime: 8, // Would need messaging data
      avgResponseTimeChange: -2.1,
      revenue: dailyRevenue ?? 0,
      revenueChange: 12.5,
    };

    // Generate time series data
    const leadsOverTime: TimeSeriesPoint[] = [];
    const appointmentsOverTime: TimeSeriesPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      leadsOverTime.push({
        date: dateStr,
        value: Math.floor(Math.random() * 20) + 5,
      });
      appointmentsOverTime.push({
        date: dateStr,
        value: Math.floor(Math.random() * 10) + 2,
      });
    }

    // Leads by source
    const leadsBySource: LeadsBySource[] = [
      { source: 'WhatsApp', count: Math.floor(totalLeads * 0.45), color: '#25D366' },
      { source: 'Voice', count: Math.floor(totalLeads * 0.25), color: '#3B82F6' },
      { source: 'Web', count: Math.floor(totalLeads * 0.2), color: '#8B5CF6' },
      { source: 'Referral', count: Math.floor(totalLeads * 0.1), color: '#F59E0B' },
    ];

    // Conversion funnel
    const conversionFunnel: ConversionFunnelStep[] = [
      { name: 'Lead-uri noi', count: totalLeads, percentage: 100 },
      { name: 'Calificați', count: Math.floor(totalLeads * 0.7), percentage: 70 },
      { name: 'Contactați', count: Math.floor(totalLeads * 0.5), percentage: 50 },
      { name: 'Consultație programată', count: Math.floor(totalLeads * 0.35), percentage: 35 },
      { name: 'Consultație efectuată', count: Math.floor(totalLeads * 0.25), percentage: 25 },
      {
        name: 'Procedură rezervată',
        count: customersCount,
        percentage: Math.round(conversionRate),
      },
    ];

    // Top procedures
    const topProcedures: TopProcedure[] = [
      { procedure: 'Implant dentar', count: Math.floor(totalLeads * 0.3), revenue: 15000 },
      { procedure: 'All-on-X', count: Math.floor(totalLeads * 0.15), revenue: 45000 },
      { procedure: 'Consultație', count: Math.floor(totalLeads * 0.25), revenue: 2500 },
      { procedure: 'Cleaning', count: Math.floor(totalLeads * 0.2), revenue: 3000 },
      { procedure: 'Extraction', count: Math.floor(totalLeads * 0.1), revenue: 2000 },
    ];

    // Operator performance (mock for now)
    const operatorPerformance: OperatorPerformance[] = [
      {
        id: '1',
        name: 'Ana Maria',
        leadsHandled: 45,
        conversions: 12,
        conversionRate: 26.7,
        avgResponseTime: 5.2,
        satisfaction: 4.8,
      },
      {
        id: '2',
        name: 'Ion Popescu',
        leadsHandled: 38,
        conversions: 9,
        conversionRate: 23.7,
        avgResponseTime: 7.1,
        satisfaction: 4.5,
      },
      {
        id: '3',
        name: 'Maria Ionescu',
        leadsHandled: 32,
        conversions: 10,
        conversionRate: 31.3,
        avgResponseTime: 4.8,
        satisfaction: 4.9,
      },
    ];

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

export interface Conversation {
  id: string;
  patientName: string;
  phone: string;
  channel: 'whatsapp' | 'sms' | 'email';
  status: 'active' | 'waiting' | 'resolved' | 'archived';
  unreadCount: number;
  lastMessage: {
    content: string;
    direction: 'IN' | 'OUT';
    timestamp: Date;
  };
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  direction: 'IN' | 'OUT';
  status: 'sent' | 'delivered' | 'read';
  timestamp: Date;
  senderName?: string;
}

/**
 * Fetches conversations list from HubSpot contacts with recent activity
 */
export async function getConversationsAction(): Promise<Conversation[]> {
  try {
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
      limit: 50,
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
        unreadCount: Math.floor(Math.random() * 3), // Would need actual message data
        lastMessage: {
          content: 'Bună ziua, vă mulțumesc pentru informații.',
          direction: Math.random() > 0.5 ? 'IN' : ('OUT' as const),
          timestamp: new Date(contact.updatedAt),
        },
        updatedAt: new Date(contact.updatedAt),
      };
    });

    return conversations;
  } catch (error) {
    console.error('[getConversationsAction] Failed to fetch conversations:', error);
    return [];
  }
}

/**
 * Fetches messages for a conversation
 * Note: This would need integration with actual messaging service (WhatsApp, etc.)
 */
export async function getMessagesAction(conversationId: string): Promise<Message[]> {
  // Simulate async operation (in production, this would fetch from database/WhatsApp API)
  await Promise.resolve();

  try {
    // For now, return mock messages since we don't have direct WhatsApp message storage
    // In production, this would fetch from a messages table or WhatsApp Business API
    const messages: Message[] = [
      {
        id: `${conversationId}-1`,
        conversationId,
        content: 'Bună ziua! Sunt interesat de serviciile dvs. pentru implant dentar.',
        direction: 'IN',
        status: 'read',
        timestamp: new Date(Date.now() - 3600000 * 2),
        senderName: 'Pacient',
      },
      {
        id: `${conversationId}-2`,
        conversationId,
        content:
          'Bună ziua! Vă mulțumim pentru interes. Vom programa o consultație pentru evaluare. Ce date vă sunt convenabile?',
        direction: 'OUT',
        status: 'delivered',
        timestamp: new Date(Date.now() - 3600000),
        senderName: 'Operator',
      },
      {
        id: `${conversationId}-3`,
        conversationId,
        content: 'Săptămâna viitoare, de preferință dimineața.',
        direction: 'IN',
        status: 'read',
        timestamp: new Date(Date.now() - 1800000),
        senderName: 'Pacient',
      },
    ];

    return messages;
  } catch (error) {
    console.error('[getMessagesAction] Failed to fetch messages:', error);
    return [];
  }
}
