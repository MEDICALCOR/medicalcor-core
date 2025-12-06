/**
 * @fileoverview Server Actions Index
 *
 * Central export point for all server actions.
 * Provides a clean, organized API for data fetching operations.
 *
 * Note: This file does NOT have 'use server' directive because it exports types.
 * Each individual action module has its own 'use server' directive.
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
  bookAppointmentAction,
} from './calendar/index';

export type {
  CalendarSlot,
  BookAppointmentRequest,
  BookAppointmentResponse,
} from './calendar/index';

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
// SHARED UTILITIES (types only - implementations are server-only)
// ============================================================================

// Note: Client implementations (getHubSpotClient, getStripeClient, etc.) are NOT exported
// from this index as they use server-only modules. Import directly from './shared/clients'
// within server action files if needed.

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

export type { PatientStatus, CommunicationChannel, ConversationStatus } from './shared/mappers';

// ============================================================================
// API KEYS ACTIONS
// ============================================================================

export {
  getApiKeysAction,
  getApiKeyStatsAction,
  createApiKeyAction,
  updateApiKeyAction,
  toggleApiKeyAction,
  revokeApiKeyAction,
  regenerateApiKeyAction,
} from './api-keys/index';

export type { ApiKey, ApiKeyStats } from './api-keys/index';

// ============================================================================
// USERS ACTIONS
// ============================================================================

export {
  getUsersAction,
  getUserByIdAction,
  getUserStatsAction,
  createUserAction,
  updateUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  unlockUserAction,
} from './users/index';

export type { User, UserRole, UserStatus, UserStats } from './users/index';

// ============================================================================
// CLINICS ACTIONS
// ============================================================================

export {
  getClinicsAction,
  getClinicByIdAction,
  getCurrentClinicAction,
  getClinicStatsAction,
  createClinicAction,
  updateClinicAction,
  deleteClinicAction,
} from './clinics/index';

export type { Clinic, ClinicStatus, ClinicStats } from './clinics/index';

// ============================================================================
// WHATSAPP TEMPLATES ACTIONS
// ============================================================================

export {
  getWhatsAppTemplatesAction,
  getWhatsAppTemplateStatsAction,
  getWhatsAppTemplateByIdAction,
  createWhatsAppTemplateAction,
  updateWhatsAppTemplateAction,
  deleteWhatsAppTemplateAction,
  duplicateWhatsAppTemplateAction,
  // M9: Enhanced template management
  previewWhatsAppTemplateAction,
  sendTestMessageAction,
  getTemplateAnalyticsAction,
  getAllTemplateAnalyticsAction,
  getVariableDefinitionsAction,
  updateVariableDefinitionsAction,
} from './whatsapp-templates/index';

export type {
  WhatsAppTemplate,
  TemplateCategory,
  TemplateStatus,
  TemplateStats,
  // M9: Enhanced types
  TemplateAnalytics,
  TemplatePreview,
  TestMessageResult,
  VariableDefinition,
} from './whatsapp-templates/index';

// ============================================================================
// BILLING ACTIONS
// ============================================================================

export {
  getInvoicesAction,
  getInvoiceByIdAction,
  getBillingStatsAction,
  createInvoiceAction,
  updateInvoiceStatusAction,
  deleteInvoiceAction,
  getStripeRevenueAction,
} from './billing/index';

export type { Invoice, InvoiceItem, InvoiceStatus, BillingStats } from './billing/index';

// ============================================================================
// CAMPAIGNS ACTIONS
// ============================================================================

export {
  getCampaignsAction,
  getCampaignStatsAction,
  createCampaignAction,
  updateCampaignAction,
  deleteCampaignAction,
  duplicateCampaignAction,
} from './campaigns/index';

export type { Campaign, CampaignStats } from './campaigns/index';

// ============================================================================
// WAITING LIST ACTIONS
// ============================================================================

export {
  getWaitingListAction,
  getWaitingListStatsAction,
  createWaitingPatientAction,
  updateWaitingPatientAction,
  removeFromWaitingListAction,
  scheduleFromWaitingListAction,
} from './waiting-list/index';

export type { WaitingPatient, WaitingListStats } from './waiting-list/index';

// ============================================================================
// REMINDERS ACTIONS
// ============================================================================

export {
  getRemindersAction,
  getReminderStatsAction,
  createReminderAction,
  updateReminderAction,
  toggleReminderAction,
  deleteReminderAction,
} from './reminders/index';

export type { Reminder, ReminderStats } from './reminders/index';

// ============================================================================
// STAFF SCHEDULE ACTIONS
// ============================================================================

export {
  getStaffMembersAction,
  getStaffScheduleAction,
  getScheduleStatsAction,
  createShiftAction,
  updateShiftAction,
  deleteShiftAction,
  copyWeekScheduleAction,
  // M12: Capacity Planning
  getCapacityDashboardAction,
  detectShiftConflictsAction,
  getStaffingRecommendationsAction,
  getDemandForecastAction,
} from './staff-schedule/index';

export type {
  StaffMember,
  StaffShift,
  Shift,
  ScheduleStats,
  // M12: Capacity Planning Types
  CapacityMetrics,
  DemandForecast,
  StaffingRecommendation,
  ShiftConflict,
  CapacityDashboardData,
} from './staff-schedule/index';

// ============================================================================
// MEDICAL RECORDS ACTIONS
// ============================================================================

export {
  getMedicalRecordsAction,
  getMedicalRecordStatsAction,
  getMedicalRecordStatsAction as getMedicalRecordsStatsAction,
  createMedicalRecordAction,
  getDiagnosesAction,
  getPrescriptionsAction as getMedicalPrescriptionsAction,
  getPrescriptionsAction as getPatientPrescriptionsAction,
} from './medical-records/index';

export type {
  MedicalRecord,
  Diagnosis,
  Prescription as MedicalPrescription,
  Prescription as PatientPrescription,
  MedicalRecordStats,
  MedicalRecordStats as MedicalRecordsStats,
} from './medical-records/index';

// ============================================================================
// BOOKING ACTIONS
// ============================================================================

export {
  getServicesAction,
  getDoctorsAction,
  getAvailableSlotsAction,
  getBookingStatsAction,
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
  createBookingAction,
} from './booking/index';

export type { Service, Doctor, TimeSlot, BookingStats } from './booking/index';

// ============================================================================
// INVENTORY ACTIONS
// ============================================================================

export {
  getInventoryAction,
  getInventoryStatsAction,
  createInventoryItemAction,
  updateInventoryItemAction,
  adjustStockAction,
  deleteInventoryItemAction,
} from './inventory/index';

export type { InventoryItem, InventoryStats } from './inventory/index';

// ============================================================================
// AUDIT ACTIONS
// ============================================================================

export {
  getAuditLogsAction,
  getAuditStatsAction,
  createAuditLogAction,
  getAuditLogsByEntityAction,
  exportAuditLogsAction,
} from './audit/index';

export type { AuditLog, AuditStats, AuditFilters } from './audit/index';

// ============================================================================
// DOCUMENTS ACTIONS
// ============================================================================

export {
  getDocumentsAction,
  getFoldersAction,
  getDocumentStatsAction,
  getDocumentStatsAction as getDocumentsStatsAction,
  createDocumentRecordAction,
  createFolderAction,
  updateDocumentAction,
  deleteDocumentAction,
  deleteFolderAction,
} from './documents/index';

export type {
  Document,
  DocumentFolder,
  DocumentStats,
  DocumentStats as DocumentsStats,
} from './documents/index';

// ============================================================================
// PRESCRIPTIONS ACTIONS
// ============================================================================

export {
  getPrescriptionsAction,
  getPrescriptionByIdAction,
  getPrescriptionStatsAction,
  getPrescriptionStatsAction as getPrescriptionsStatsAction,
  createPrescriptionAction,
  updatePrescriptionAction,
  cancelPrescriptionAction,
  duplicatePrescriptionAction,
  deletePrescriptionAction,
} from './prescriptions/index';

export type {
  Prescription,
  PrescriptionMedication,
  PrescriptionStats,
  PrescriptionStats as PrescriptionsStats,
} from './prescriptions/index';

// ============================================================================
// BEHAVIORAL INSIGHTS ACTIONS (M5)
// ============================================================================

export {
  getBehavioralInsightsDashboardAction,
  getPatternStatsAction,
  getSubjectInsightsAction,
  detectPatternsAction,
  getPatternsByTypeAction,
  getActionableInsightsAction,
} from './behavioral-insights/index';

export type {
  BehavioralPattern,
  CognitiveInsight,
  PatternStats,
  InsightsDashboardData,
  SubjectInsights,
  PatternType,
  InsightType,
  SubjectType as BehavioralSubjectType,
} from './behavioral-insights/index';

// ============================================================================
// CIRCUIT BREAKER ACTIONS (M10)
// ============================================================================

export {
  getCircuitBreakerDashboardAction,
  getCircuitBreakerStatsAction,
  getCircuitBreakerByServiceAction,
  getOpenCircuitsAction,
  getCircuitStateHistoryAction,
  resetCircuitBreakerAction,
  getDegradedServicesAction,
} from './circuit-breaker/index';

export type {
  CircuitState,
  CircuitBreakerService,
  CircuitBreakerDashboardData,
  CircuitBreakerStats,
  CircuitStateEvent,
  CircuitBreakerResetResult,
} from './circuit-breaker/index';

// ============================================================================
// LOAD TESTING ACTIONS (L7)
// ============================================================================

export {
  getLoadTestDashboardAction,
  getLoadTestResultsAction,
  getLoadTestResultAction,
  getLoadTestEnvironmentsAction,
} from './load-testing/index';

export type {
  LoadTestDashboardData,
  LoadTestResult,
  LoadTestTimeRange,
  LoadTestSummaryStats,
  LoadTestTrendPoint,
  ScenarioBreakdown,
  EnvironmentComparison,
} from './load-testing/index';
