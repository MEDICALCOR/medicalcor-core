'use server';

/**
 * @fileoverview Triage Server Actions
 *
 * Server actions for the triage board - lead classification and prioritization.
 * Fetches leads grouped by classification (NEW, HOT, WARM, COLD, SCHEDULED).
 *
 * @module actions/triage
 * @security All actions require VIEW_PATIENTS permission
 */

import type { TriageLead, TriageColumn, HubSpotContact, LeadSource } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getSchedulingService } from '../shared/clients';
import {
  mapLeadSource,
  maskPhone,
  formatRelativeTime,
  parseProcedureInterest,
} from '../shared/mappers';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Lead freshness threshold in minutes (leads newer than this are "NEW")
 * @constant
 */
const NEW_LEAD_THRESHOLD_MINUTES = 15;

/**
 * Days ahead to check for scheduled appointments
 * @constant
 */
const SCHEDULED_LOOKAHEAD_DAYS = 7;

/**
 * Maximum leads per column
 * @constant
 */
const COLUMN_LIMITS = {
  NEW: 10,
  HOT: 20,
  WARM: 20,
  COLD: 20,
  GENERAL: 50,
} as const;

/**
 * Triage column configuration
 * @constant
 */
const TRIAGE_COLUMNS = {
  NEW: { id: 'new', title: 'Nou' },
  HOT: { id: 'hot', title: 'HOT' },
  WARM: { id: 'warm', title: 'WARM' },
  COLD: { id: 'cold', title: 'COLD' },
  SCHEDULED: { id: 'scheduled', title: 'Programat' },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Properties to fetch from HubSpot for triage leads
 * @constant
 */
const TRIAGE_PROPERTIES = [
  'phone',
  'lead_score',
  'lead_source',
  'createdate',
  'procedure_interest',
  'hs_lead_status',
  'firstname',
] as const;

/**
 * Maps a HubSpot contact to a TriageLead
 * @internal
 */
function mapContactToTriageLead(
  contact: HubSpotContact,
  appointment?: { date: string; startTime: string } | null
): TriageLead {
  const score = parseInt(contact.properties.lead_score ?? '0', 10);
  const procedureInterest = parseProcedureInterest(contact.properties.procedure_interest) ?? [];

  // Generate reasoning based on score
  const reasoning =
    score >= 4
      ? 'High intent detected from conversation'
      : score >= 2
        ? 'Moderate interest shown'
        : 'Initial inquiry';

  return {
    id: contact.id,
    phone: maskPhone(contact.properties.phone ?? '+40700000000'),
    source: mapLeadSource(contact.properties.lead_source),
    time: formatRelativeTime(contact.createdAt),
    score: score > 0 ? score : undefined,
    confidence: undefined, // Requires AI scoring integration
    reasoning,
    procedureInterest,
    appointment: appointment ? `${appointment.date} ${appointment.startTime}` : undefined,
  };
}

/**
 * Creates an empty triage column structure
 * @internal
 */
function createEmptyColumns(): TriageColumn[] {
  return [
    { ...TRIAGE_COLUMNS.NEW, leads: [] },
    { ...TRIAGE_COLUMNS.HOT, leads: [] },
    { ...TRIAGE_COLUMNS.WARM, leads: [] },
    { ...TRIAGE_COLUMNS.COLD, leads: [] },
    { ...TRIAGE_COLUMNS.SCHEDULED, leads: [] },
  ];
}

// ============================================================================
// TRIAGE ACTIONS
// ============================================================================

/**
 * Fetches leads for Triage board, grouped by classification/status
 *
 * Organizes leads into columns:
 * - **Nou (New)**: Leads created in the last 15 minutes or without scores
 * - **HOT**: Leads with score >= 4
 * - **WARM**: Leads with score 2-3
 * - **COLD**: Leads with score < 2
 * - **Programat (Scheduled)**: Leads with upcoming appointments
 *
 * @requires VIEW_PATIENTS permission
 *
 * @returns Array of triage columns with leads
 *
 * @example
 * ```typescript
 * const columns = await getTriageLeadsAction();
 * const hotLeads = columns.find(c => c.id === 'hot')?.leads ?? [];
 * ```
 */
export async function getTriageLeadsAction(): Promise<TriageColumn[]> {
  try {
    await requirePermission('VIEW_PATIENTS');
    const hubspot = getHubSpotClient();
    const scheduling = getSchedulingService();

    // Fetch all lead categories in parallel
    const [newLeadsResponse, hotLeadsResponse, warmLeadsResponse, coldLeadsResponse] =
      await Promise.all([
        // New leads (recently created)
        hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }],
            },
          ],
          properties: [...TRIAGE_PROPERTIES],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: COLUMN_LIMITS.GENERAL,
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
          properties: [...TRIAGE_PROPERTIES],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: COLUMN_LIMITS.HOT,
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
          properties: [...TRIAGE_PROPERTIES],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: COLUMN_LIMITS.WARM,
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
          properties: [...TRIAGE_PROPERTIES],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: COLUMN_LIMITS.COLD,
        }),
      ]);

    // Get upcoming appointments
    const now = new Date();
    const nextWeek = new Date(now.getTime() + SCHEDULED_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const appointments = await scheduling.getUpcomingAppointments(now, nextWeek);
    const scheduledContactIds = new Set(appointments.map((a) => a.hubspotContactId));

    // Create appointment lookup map
    const appointmentMap = new Map(
      appointments.map((apt) => [apt.hubspotContactId, apt.slot])
    );

    // Filter function to exclude scheduled contacts
    const filterScheduled = (contacts: HubSpotContact[]) =>
      contacts.filter((c) => !scheduledContactIds.has(c.id));

    // Filter new leads: no score OR created recently
    const newLeads = newLeadsResponse.results
      .filter((c) => {
        const score = parseInt(c.properties.lead_score ?? '0', 10);
        const createdAt = new Date(c.createdAt);
        const minutesAgo = (now.getTime() - createdAt.getTime()) / 60000;
        return score === 0 || minutesAgo < NEW_LEAD_THRESHOLD_MINUTES;
      })
      .filter((c) => !scheduledContactIds.has(c.id))
      .slice(0, COLUMN_LIMITS.NEW);

    // Build columns
    const columns: TriageColumn[] = [
      {
        ...TRIAGE_COLUMNS.NEW,
        leads: newLeads.map((c) => mapContactToTriageLead(c, appointmentMap.get(c.id))),
      },
      {
        ...TRIAGE_COLUMNS.HOT,
        leads: filterScheduled(hotLeadsResponse.results).map((c) =>
          mapContactToTriageLead(c, appointmentMap.get(c.id))
        ),
      },
      {
        ...TRIAGE_COLUMNS.WARM,
        leads: filterScheduled(warmLeadsResponse.results).map((c) =>
          mapContactToTriageLead(c, appointmentMap.get(c.id))
        ),
      },
      {
        ...TRIAGE_COLUMNS.COLD,
        leads: filterScheduled(coldLeadsResponse.results).map((c) =>
          mapContactToTriageLead(c, appointmentMap.get(c.id))
        ),
      },
      {
        ...TRIAGE_COLUMNS.SCHEDULED,
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
    // Error logged server-side
    return createEmptyColumns();
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { TriageLead, TriageColumn } from '@medicalcor/types';
