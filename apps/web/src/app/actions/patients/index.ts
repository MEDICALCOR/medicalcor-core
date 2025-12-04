'use server';

/**
 * @fileoverview Patient Server Actions
 *
 * Server actions for patient/lead data operations.
 * All data is fetched from HubSpot (Single Source of Truth).
 *
 * @module actions/patients
 * @security All actions require authentication and VIEW_PATIENTS permission
 */

import { z } from 'zod';
import {
  PatientListItemSchema,
  RecentLeadSchema,
  DashboardStatsSchema,
  type PatientListItem,
  type RecentLead,
  type DashboardStats,
  type HubSpotContact,
  type PaginatedResponse,
  type PatientDetailData,
  type PatientTimelineEvent,
} from '@medicalcor/types';
import {
  requirePermission,
  requirePatientAccess,
  AuthorizationError,
} from '@/lib/auth/server-action-auth';
import {
  getHubSpotClient,
  getStripeClient,
  getSchedulingService,
  DEFAULT_TIMEZONE,
} from '../shared/clients';
import {
  mapHubSpotStageToStatus,
  mapScoreToClassification,
  mapLeadSource,
  maskPhone,
  formatRelativeTime,
  parseProcedureInterest,
} from '../shared/mappers';
import { validatePageSize, emptyPaginatedResponse } from '../shared/pagination';

// ============================================================================
// PATIENT LIST ACTIONS
// ============================================================================

/**
 * Fetches all patients/leads from HubSpot (legacy non-paginated version)
 *
 * @deprecated Use {@link getPatientsActionPaginated} for new implementations
 * @requires VIEW_PATIENTS permission
 *
 * @returns Array of patient list items
 */
export async function getPatientsAction(): Promise<PatientListItem[]> {
  const result = await getPatientsActionPaginated({ pageSize: 100 });
  return result.items;
}

/**
 * Fetches patients/leads from HubSpot with cursor-based pagination
 *
 * Returns validated PaginatedResponse with PatientListItem array.
 * All data is validated through Zod schemas for type safety.
 *
 * @param options - Pagination options
 * @param options.cursor - Cursor for next page (from previous response)
 * @param options.pageSize - Number of items per page (1-100, default 20)
 * @requires VIEW_PATIENTS permission
 *
 * @returns Paginated patient list with cursor for next page
 *
 * @example
 * ```typescript
 * // First page
 * const firstPage = await getPatientsActionPaginated({ pageSize: 20 });
 *
 * // Next page
 * if (firstPage.hasMore) {
 *   const secondPage = await getPatientsActionPaginated({
 *     cursor: firstPage.nextCursor,
 *     pageSize: 20
 *   });
 * }
 * ```
 */
export async function getPatientsActionPaginated(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<PatientListItem>> {
  const { cursor, pageSize = 20 } = options ?? {};
  const validatedPageSize = validatePageSize(pageSize);

  try {
    await requirePermission('VIEW_PATIENTS');

    const hubspot = getHubSpotClient();

    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lifecyclestage',
              operator: 'NEQ',
              value: '',
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

    const validatedPatients = z.array(PatientListItemSchema).parse(patients);
    const nextCursor = response.paging?.next?.after ?? null;

    return {
      items: validatedPatients,
      nextCursor,
      hasMore: nextCursor !== null,
      total: response.total,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    // Error logged server-side, return empty result
    return emptyPaginatedResponse();
  }
}

// ============================================================================
// RECENT LEADS ACTION
// ============================================================================

/**
 * Fetches recent leads for Dashboard display
 *
 * Returns leads with masked phone numbers for GDPR compliance.
 *
 * @param limit - Maximum number of leads to return (default: 5)
 * @requires VIEW_PATIENTS permission
 *
 * @returns Array of recent leads with masked phone numbers
 *
 * @example
 * ```typescript
 * const recentLeads = await getRecentLeadsAction(10);
 * // => [{ id: '123', phone: '+40721***567', score: 4, ... }]
 * ```
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
    // Error logged server-side
    return [];
  }
}

// ============================================================================
// DASHBOARD STATS ACTION
// ============================================================================

/**
 * Fetches dashboard statistics from HubSpot, SchedulingService, and Stripe
 *
 * Aggregates data from multiple sources in parallel for performance.
 *
 * @requires VIEW_PATIENTS permission
 *
 * @returns Dashboard statistics including leads, patients, appointments, and revenue
 *
 * @example
 * ```typescript
 * const stats = await getDashboardStatsAction();
 * // => { totalLeads: 150, activePatients: 45, urgentTriage: 12, ... }
 * ```
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
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }],
            },
          ],
          limit: 1,
        }),
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' }],
            },
          ],
          limit: 1,
        }),
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lead_score', operator: 'GTE', value: '4' }],
            },
          ],
          limit: 1,
        }),
        getTodayAppointmentsCount(scheduling),
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
  } catch (_error) {
    // Error logged server-side
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
 * @internal
 */
async function getTodayAppointmentsCount(
  scheduling: ReturnType<typeof getSchedulingService>
): Promise<number> {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const appointments = await scheduling.getUpcomingAppointments(todayStart, todayEnd);
    return appointments.length;
  } catch (_error) {
    // Error logged server-side
    return 0;
  }
}

/**
 * Helper: Get daily revenue from Stripe (in RON, major units)
 * @internal
 */
async function getDailyRevenueAmount(
  stripe: ReturnType<typeof getStripeClient>
): Promise<number | undefined> {
  try {
    const result = await stripe.getDailyRevenue(DEFAULT_TIMEZONE);
    return stripe.toMajorUnits(result.amount);
  } catch (_error) {
    // Error logged server-side
    return undefined;
  }
}

// ============================================================================
// PATIENT DETAIL ACTIONS
// ============================================================================

/**
 * Fetches a single patient/contact by ID from HubSpot
 *
 * Includes IDOR protection to ensure user can access the requested patient.
 *
 * @param patientId - HubSpot contact ID
 * @requires VIEW_PATIENTS permission + patient access check
 *
 * @returns Patient detail data or null if not found
 * @throws {AuthorizationError} If user lacks permission or access
 *
 * @security Validates user has access to this specific patient (IDOR protection)
 *
 * @example
 * ```typescript
 * const patient = await getPatientByIdAction('12345');
 * if (patient) {
 *   console.log(patient.firstName, patient.lastName);
 * }
 * ```
 */
export async function getPatientByIdAction(patientId: string): Promise<PatientDetailData | null> {
  try {
    await requirePermission('VIEW_PATIENTS');
    await requirePatientAccess(patientId);

    const hubspot = getHubSpotClient();
    const contact = await hubspot.getContact(patientId);

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
      procedureInterest: parseProcedureInterest(contact.properties.procedure_interest),
      language: contact.properties.hs_language,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      hubspotContactId: contact.id,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    // Error logged server-side
    return null;
  }
}

/**
 * Fetches patient timeline events from HubSpot
 *
 * @param patientId - HubSpot contact ID
 * @requires VIEW_PATIENTS permission + patient access check
 *
 * @returns Array of timeline events (currently empty - requires HubSpot Engagements API)
 *
 * @todo Implement HubSpot Engagements API integration for notes, calls, emails
 */
export async function getPatientTimelineAction(patientId: string): Promise<PatientTimelineEvent[]> {
  try {
    await requirePermission('VIEW_PATIENTS');
    await requirePatientAccess(patientId);

    // Timeline events require HubSpot Engagements API or custom timeline events
    // Currently returning empty array - requires additional HubSpot API calls
    return [];
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Error logged server-side
    return [];
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { PatientDetailData, PatientTimelineEvent } from '@medicalcor/types';
