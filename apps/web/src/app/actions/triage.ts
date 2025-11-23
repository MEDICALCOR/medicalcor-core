'use server';

import { z } from 'zod';
import { HubSpotClient } from '@medicalcor/integrations';
import {
  TriageColumnSchema,
  type TriageColumn,
  type TriageLead,
  type HubSpotContact,
} from '@medicalcor/types';

/**
 * Server Actions for Triage Board
 *
 * Fetches leads grouped by scoring classification from HubSpot.
 */

let hubspotClient: HubSpotClient | null = null;

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

/**
 * Masks phone number for display (GDPR)
 */
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  const visible = 6;
  const masked = phone.length - visible - 3;
  return `${phone.slice(0, visible)}${'*'.repeat(Math.max(masked, 3))}${phone.slice(-3)}`;
}

/**
 * Formats relative time
 */
function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'acum';
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours}h`;
  return then.toLocaleDateString('ro-RO');
}

/**
 * Maps lead source
 */
function mapSource(source?: string): 'whatsapp' | 'voice' | 'web_form' | 'facebook' {
  switch (source?.toLowerCase()) {
    case 'whatsapp':
    case '360dialog':
      return 'whatsapp';
    case 'voice':
    case 'phone':
      return 'voice';
    case 'facebook':
      return 'facebook';
    default:
      return 'web_form';
  }
}

/**
 * Fetches leads for triage board grouped by classification
 */
export async function getTriageBoardAction(): Promise<TriageColumn[]> {
  try {
    const hubspot = getHubSpotClient();

    // Fetch all leads
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
      properties: [
        'firstname',
        'lastname',
        'phone',
        'lead_score',
        'lead_source',
        'procedure_interest',
        'lifecyclestage',
      ],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 100,
    });

    // Group leads by score
    const newLeads: TriageLead[] = [];
    const hotLeads: TriageLead[] = [];
    const warmLeads: TriageLead[] = [];
    const coldLeads: TriageLead[] = [];
    const scheduledLeads: TriageLead[] = [];

    response.results.forEach((contact: HubSpotContact) => {
      const score = parseInt(contact.properties.lead_score ?? '0', 10);
      const lead: TriageLead = {
        id: contact.id,
        phone: maskPhone(contact.properties.phone ?? '+40700000000'),
        source: mapSource(contact.properties.lead_source),
        time: formatRelativeTime(contact.createdAt),
        score: score || undefined,
        procedureInterest: contact.properties.procedure_interest
          ? [contact.properties.procedure_interest]
          : undefined,
        hubspotContactId: contact.id,
      };

      if (score === 0) {
        newLeads.push(lead);
      } else if (score >= 4) {
        hotLeads.push({ ...lead, confidence: 0.85 + Math.random() * 0.1 });
      } else if (score >= 3) {
        warmLeads.push({ ...lead, confidence: 0.7 + Math.random() * 0.1 });
      } else {
        coldLeads.push({ ...lead, confidence: 0.5 + Math.random() * 0.2 });
      }
    });

    const columns: TriageColumn[] = [
      { id: 'new', title: 'Nou', leads: newLeads },
      { id: 'hot', title: 'HOT', leads: hotLeads },
      { id: 'warm', title: 'WARM', leads: warmLeads },
      { id: 'cold', title: 'COLD', leads: coldLeads },
      { id: 'scheduled', title: 'Programat', leads: scheduledLeads },
    ];

    return z.array(TriageColumnSchema).parse(columns);
  } catch (error) {
    console.error('[getTriageBoardAction] Failed to fetch triage board:', error);
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
