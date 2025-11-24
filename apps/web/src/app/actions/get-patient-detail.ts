'use server';

import {
  requirePermission,
  requirePatientAccess,
  AuthorizationError,
} from '@/lib/auth/server-action-auth';
import { getHubSpotClient } from './utils/clients';
import { mapScoreToClassification, mapLeadSource } from './utils/hubspot-mappers';
import type { PatientDetailData, PatientTimelineEvent } from './types';

/**
 * Patient Detail Server Actions
 *
 * Actions for fetching individual patient data and timeline.
 */

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
