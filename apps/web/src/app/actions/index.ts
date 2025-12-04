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
} from './whatsapp-templates/index';

export type {
  WhatsAppTemplate,
  TemplateCategory,
  TemplateStatus,
  TemplateStats,
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

export type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  BillingStats,
} from './billing/index';

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
} from './staff-schedule/index';

export type { StaffMember, StaffShift, ScheduleStats } from './staff-schedule/index';

// ============================================================================
// MEDICAL RECORDS ACTIONS
// ============================================================================

export {
  getMedicalRecordsAction,
  getMedicalRecordStatsAction,
  createMedicalRecordAction,
  getDiagnosesAction,
  getPrescriptionsAction as getMedicalPrescriptionsAction,
} from './medical-records/index';

export type {
  MedicalRecord,
  Diagnosis,
  Prescription as MedicalPrescription,
  MedicalRecordStats,
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
  createDocumentRecordAction,
  createFolderAction,
  updateDocumentAction,
  deleteDocumentAction,
  deleteFolderAction,
} from './documents/index';

export type { Document, DocumentFolder, DocumentStats } from './documents/index';

// ============================================================================
// PRESCRIPTIONS ACTIONS
// ============================================================================

export {
  getPrescriptionsAction,
  getPrescriptionByIdAction,
  getPrescriptionStatsAction,
  createPrescriptionAction,
  updatePrescriptionAction,
  cancelPrescriptionAction,
  duplicatePrescriptionAction,
} from './prescriptions/index';

export type {
  Prescription,
  PrescriptionMedication,
  PrescriptionStats,
} from './prescriptions/index';
