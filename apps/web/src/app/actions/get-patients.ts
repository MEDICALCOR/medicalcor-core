'use server';

import { z } from 'zod';
import {
  PatientListItemSchema,
  type PatientListItem,
  type HubSpotContact,
  type PaginatedResponse,
} from '@medicalcor/types';
import { requirePermission, AuthorizationError } from '@/lib/auth/server-action-auth';
import { getHubSpotClient } from './utils/clients';
import {
  mapHubSpotStageToStatus,
  mapScoreToClassification,
  mapLeadSource,
} from './utils/hubspot-mappers';

/**
 * Server Actions for Patient/Lead Data Fetching
 *
 * These actions fetch data directly from HubSpot (Single Source of Truth)
 * and transform it to our internal schemas with Zod validation.
 *
 * SECURITY: All actions require authentication and appropriate permissions.
 * Note: These run ONLY on the server - API keys are never exposed to client.
 *
 * This file contains core patient listing functionality.
 * Other actions are organized by domain in separate files.
 */

// ============================================================================
// RE-EXPORTS FROM DOMAIN-SPECIFIC ACTION FILES
// ============================================================================

// Dashboard actions
export { getRecentLeadsAction, getDashboardStatsAction } from './get-dashboard';

// Triage actions
export { getTriageLeadsAction } from './get-triage';

// Calendar actions
export { getCalendarSlotsAction } from './get-calendar';

// Analytics actions
export { getAnalyticsDataAction } from './get-analytics';

// Messages actions
export {
  getConversationsAction,
  getConversationsActionPaginated,
  getMessagesAction,
} from './get-messages';

// Patient detail actions
export { getPatientByIdAction, getPatientTimelineAction } from './get-patient-detail';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type {
  // Triage types
  TriageLead,
  TriageColumn,
  // Calendar types
  CalendarSlot,
  // Analytics types
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
  // Messages types
  Conversation,
  Message,
  // Patient types
  PatientDetailData,
  PatientTimelineEvent,
} from './types';

// ============================================================================
// PATIENT LISTING ACTIONS
// ============================================================================

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
