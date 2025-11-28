/**
 * @fileoverview Legacy Server Actions Re-exports
 *
 * This file maintains backward compatibility with existing imports.
 * All functionality has been modularized into domain-specific modules.
 *
 * NOTE: Do not add 'use server' here - re-exports are not allowed in server action files.
 * The actual server action functions have 'use server' in their own files.
 *
 * @deprecated Import from domain-specific modules instead:
 * - `@/app/actions/patients` for patient/lead operations
 * - `@/app/actions/triage` for triage board operations
 * - `@/app/actions/calendar` for scheduling operations
 * - `@/app/actions/analytics` for analytics data
 * - `@/app/actions/messages` for messaging operations
 *
 * Or use the central index: `@/app/actions`
 *
 * @module actions/get-patients
 */

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Patient actions
export {
  getPatientsAction,
  getPatientsActionPaginated,
  getRecentLeadsAction,
  getDashboardStatsAction,
  getPatientByIdAction,
  getPatientTimelineAction,
} from './patients';

// Triage actions
export { getTriageLeadsAction } from './triage';

// Calendar actions
export { getCalendarSlotsAction } from './calendar';

// Analytics actions
export { getAnalyticsDataAction } from './analytics';

// Messages actions
export {
  getConversationsAction,
  getConversationsActionPaginated,
  getMessagesAction,
} from './messages';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { TriageLead, TriageColumn } from './triage';
export type { CalendarSlot } from './calendar';
export type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from './analytics';
export type { Conversation, Message, PatientDetailData, PatientTimelineEvent } from '@medicalcor/types';
