'use server';

import { z } from 'zod';
import { HubSpotClient } from '@medicalcor/integrations';
import {
  PatientDetailSchema,
  PatientActivitySchema,
  type PatientDetail,
  type PatientActivity,
} from '@medicalcor/types';

/**
 * Server Action for fetching Patient Detail from HubSpot
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

function mapLifecycleToStatus(
  stage?: string
): 'lead' | 'contacted' | 'scheduled' | 'patient' | 'inactive' {
  switch (stage?.toLowerCase()) {
    case 'customer':
      return 'patient';
    case 'opportunity':
      return 'scheduled';
    case 'salesqualifiedlead':
    case 'marketingqualifiedlead':
      return 'contacted';
    case 'subscriber':
    case 'lead':
      return 'lead';
    default:
      return 'lead';
  }
}

/**
 * Fetches full patient detail by HubSpot contact ID
 */
export async function getPatientDetailAction(contactId: string): Promise<PatientDetail | null> {
  try {
    const hubspot = getHubSpotClient();
    const contact = await hubspot.getContact(contactId);

    const patientDetail: PatientDetail = {
      id: contact.id,
      firstName: contact.properties.firstname ?? 'N/A',
      lastName: contact.properties.lastname ?? '',
      phone: contact.properties.phone ?? '',
      email: contact.properties.email,
      status: mapLifecycleToStatus(contact.properties.lifecyclestage),
      source: contact.properties.lead_source ?? 'manual',
      tags: [],
      assignedTo: undefined, // Would come from HubSpot owner association
      createdAt: new Date(contact.createdAt),
      updatedAt: new Date(contact.updatedAt),
      medicalHistory: contact.properties.procedure_interest,
      allergies: [],
      currentMedications: [],
      appointments: [],
      documents: [],
      activities: [],
      notes: [],
      totalSpent: 0,
      appointmentCount: 0,
    };

    return PatientDetailSchema.parse(patientDetail);
  } catch (error) {
    console.error('[getPatientDetailAction] Failed:', error);
    return null;
  }
}

/**
 * Fetches patient activity timeline
 */
export function getPatientTimelineAction(_contactId: string): PatientActivity[] {
  // In production: fetch from HubSpot engagements/domain_events
  const activities: PatientActivity[] = [];
  return z.array(PatientActivitySchema).parse(activities);
}
