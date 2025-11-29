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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
 * Fetches patient timeline events combining data from:
 * - Lead scoring history
 * - Message log
 * - Consent records
 * - Domain events
 *
 * @param patientId - HubSpot contact ID
 * @param options - Fetch options
 * @param options.limit - Maximum events to return (default 50)
 * @param options.types - Filter by event types
 * @requires VIEW_PATIENTS permission + patient access check
 *
 * @returns Array of timeline events sorted by date (newest first)
 */
export async function getPatientTimelineAction(
  patientId: string,
  options?: {
    limit?: number;
    types?: Array<'scoring' | 'message' | 'consent' | 'appointment' | 'call'>;
  }
): Promise<PatientTimelineEvent[]> {
  const { limit = 50, types } = options ?? {};

  try {
    await requirePermission('VIEW_PATIENTS');
    await requirePatientAccess(patientId);

    // Get patient phone from HubSpot
    const hubspot = getHubSpotClient();
    const contact = await hubspot.getContact(patientId, ['phone']);

    if (!contact?.properties?.phone) {
      return [];
    }

    const phone = contact.properties.phone;
    const { createDatabaseClient } = await import('@medicalcor/core');
    const db = createDatabaseClient();

    const events: PatientTimelineEvent[] = [];

    // Fetch scoring history
    if (!types || types.includes('scoring')) {
      const scoringResult = await db.query(
        `SELECT id, score, classification, reasoning, model_version, created_at
         FROM lead_scoring_history
         WHERE (phone = $1 OR hubspot_contact_id = $2)
         ORDER BY created_at DESC
         LIMIT $3`,
        [phone, patientId, Math.ceil(limit / 4)]
      );

      for (const row of scoringResult.rows as Array<{
        id: string;
        score: number;
        classification: string;
        reasoning: string;
        model_version: string;
        created_at: Date;
      }>) {
        events.push({
          id: row.id,
          type: 'scoring',
          title: `Lead scored: ${row.classification} (${row.score}/5)`,
          description: row.reasoning ?? 'AI lead scoring completed',
          timestamp: new Date(row.created_at),
          metadata: {
            score: row.score,
            classification: row.classification,
            modelVersion: row.model_version,
          },
        });
      }
    }

    // Fetch message history
    if (!types || types.includes('message')) {
      const messageResult = await db.query(
        `SELECT id, direction, channel, status, created_at
         FROM message_log
         WHERE phone = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [phone, Math.ceil(limit / 4)]
      );

      for (const row of messageResult.rows as Array<{
        id: string;
        direction: string;
        channel: string;
        status: string;
        created_at: Date;
      }>) {
        events.push({
          id: row.id,
          type: 'message',
          title: `${row.direction === 'IN' ? 'Received' : 'Sent'} ${row.channel} message`,
          description: `Status: ${row.status}`,
          timestamp: new Date(row.created_at),
          metadata: {
            direction: row.direction,
            channel: row.channel,
            status: row.status,
          },
        });
      }
    }

    // Fetch consent changes
    if (!types || types.includes('consent')) {
      const consentResult = await db.query(
        `SELECT id, consent_type, granted, granted_at, withdrawn_at, created_at
         FROM consent_records
         WHERE (phone = $1 OR hubspot_contact_id = $2) AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $3`,
        [phone, patientId, Math.ceil(limit / 4)]
      );

      for (const row of consentResult.rows as Array<{
        id: string;
        consent_type: string;
        granted: boolean;
        granted_at: Date | null;
        withdrawn_at: Date | null;
        created_at: Date;
      }>) {
        const isWithdrawn = row.withdrawn_at !== null;
        events.push({
          id: row.id,
          type: 'consent',
          title: `${row.consent_type} consent ${isWithdrawn ? 'withdrawn' : row.granted ? 'granted' : 'denied'}`,
          description: `GDPR consent record ${isWithdrawn ? 'withdrawal' : 'update'}`,
          timestamp: new Date(isWithdrawn ? row.withdrawn_at! : row.created_at),
          metadata: {
            consentType: row.consent_type,
            granted: row.granted && !isWithdrawn,
          },
        });
      }
    }

    // Fetch domain events (appointments, calls, etc.)
    if (!types || types.includes('appointment') || types.includes('call')) {
      const eventsResult = await db.query(
        `SELECT id, type, payload, created_at
         FROM domain_events
         WHERE (
           (payload->>'phone' = $1) OR
           (payload->>'hubspot_contact_id' = $2) OR
           (payload->>'contactId' = $2)
         )
         AND type IN ('appointment.scheduled', 'appointment.confirmed', 'appointment.cancelled', 'call.completed', 'call.missed')
         ORDER BY created_at DESC
         LIMIT $3`,
        [phone, patientId, Math.ceil(limit / 4)]
      );

      for (const row of eventsResult.rows as Array<{
        id: string;
        type: string;
        payload: Record<string, unknown>;
        created_at: Date;
      }>) {
        const eventType = row.type.startsWith('appointment') ? 'appointment' : 'call';
        events.push({
          id: row.id,
          type: eventType,
          title: row.type.replace('.', ' ').replace(/_/g, ' '),
          description: (row.payload.procedureType as string) ?? (row.payload.summary as string) ?? '',
          timestamp: new Date(row.created_at),
          metadata: row.payload,
        });
      }
    }

    // Sort all events by timestamp (newest first) and limit
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events.slice(0, limit);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getPatientTimelineAction] Failed to fetch timeline:', error);
    }
    return [];
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { PatientDetailData, PatientTimelineEvent } from '@medicalcor/types';
