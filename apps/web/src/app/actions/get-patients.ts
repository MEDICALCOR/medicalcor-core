'use server';

/**
 * @fileoverview Legacy Server Actions Re-exports
 *
 * This file maintains backward compatibility with existing imports.
 * All functionality has been modularized into domain-specific modules.
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
} from './patients/index.js';

// Triage actions
export { getTriageLeadsAction } from './triage/index.js';

// Calendar actions
export { getCalendarSlotsAction } from './calendar/index.js';

// Analytics actions
export { getAnalyticsDataAction } from './analytics/index.js';

// Messages actions
export {
  getConversationsAction,
  getConversationsActionPaginated,
  getMessagesAction,
} from './messages/index.js';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { TriageLead, TriageColumn } from './triage/index.js';
export type { CalendarSlot } from './calendar/index.js';
export type {
  AnalyticsMetrics,
  TimeSeriesPoint,
  LeadsBySource,
  ConversionFunnelStep,
  TopProcedure,
  OperatorPerformance,
  AnalyticsData,
} from './analytics/index.js';
export type { Conversation, Message, PatientDetailData, PatientTimelineEvent } from '@medicalcor/types';
