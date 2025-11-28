'use server';

/**
 * @fileoverview Server Actions Index
 *
 * Central export point for all server actions.
 * Provides a clean, organized API for data fetching operations.
 *
 * @module actions
 *
 * @example
 * ```typescript
 * // Import specific domain actions
 * import { getPatientsActionPaginated } from '@/app/actions/patients';
 * import { getTriageLeadsAction } from '@/app/actions/triage';
 *
 * // Or import from central index
 * import {
 *   getPatientsActionPaginated,
 *   getTriageLeadsAction,
 *   getAnalyticsDataAction,
 * } from '@/app/actions';
 * ```
 */

// ============================================================================
// PATIENT ACTIONS
// ============================================================================

export {
  getPatientsAction,
  getPatientsActionPaginated,
  getRecentLeadsAction,
  getDashboardStatsAction,
  getPatientByIdAction,
  getPatientTimelineAction,
} from './patients/index';

export type { PatientDetailData, PatientTimelineEvent } from './patients/index';

// ============================================================================
// TRIAGE ACTIONS
// ============================================================================

export { getTriageLeadsAction } from './triage/index';

export type { TriageLead, TriageColumn } from './triage/index';

// ============================================================================
// CALENDAR ACTIONS
// ============================================================================

export {
  getCalendarSlotsAction,
  getAvailableSlotsRangeAction,
} from './calendar/index';

export type { CalendarSlot } from './calendar/index';

// ============================================================================
// ANALYTICS ACTIONS
// ============================================================================

export { getAnalyticsDataAction } from './analytics/index';

export type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from './analytics/index';

// ============================================================================
// MESSAGES ACTIONS
// ============================================================================

export {
  getConversationsAction,
  getConversationsActionPaginated,
  getMessagesAction,
  sendMessageAction,
} from './messages/index';

export type { Conversation, Message } from './messages/index';

// ============================================================================
// SHARED UTILITIES (for internal use)
// ============================================================================

export {
  getHubSpotClient,
  getStripeClient,
  getSchedulingService,
  DEFAULT_TIMEZONE,
  HUBSPOT_PAGE_SIZE,
  MAX_FETCH_RESULTS,
} from './shared/clients';

export {
  mapHubSpotStageToStatus,
  mapScoreToClassification,
  mapLeadSource,
  maskPhone,
  formatRelativeTime,
  parseProcedureInterest,
  detectChannel,
  mapConversationStatus,
  LEAD_SCORE_THRESHOLDS,
} from './shared/mappers';

export {
  fetchAllContacts,
  validatePageSize,
  emptyPaginatedResponse,
} from './shared/pagination';

export type { PatientStatus, CommunicationChannel, ConversationStatus } from './shared/mappers';
export type { FetchAllOptions, SearchParamsWithoutPaging } from './shared/pagination';
