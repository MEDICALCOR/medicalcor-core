'use server';

import type { HubSpotContact, LeadSource } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getSchedulingService } from './utils/clients';
import { maskPhone, formatRelativeTime } from './utils/formatters';
import { mapLeadSource } from './utils/hubspot-mappers';
import type { TriageLead, TriageColumn } from './types';

/**
 * Triage Server Actions
 *
 * Actions for fetching and managing leads on the triage Kanban board.
 */

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
