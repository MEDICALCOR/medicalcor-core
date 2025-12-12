/**
 * Shared utilities for cron jobs
 */

// Types
export type {
  HubSpotContactResult,
  ConsentType,
  SupabaseClientAny,
  SupabaseClientResult,
  EventStoreEmitter,
} from './types.js';

// Constants
export { BATCH_SIZE, RETRY_CONFIG } from './constants.js';

// Clients
export { getClients, getSupabaseClient } from './clients.js';

// Consent
export { hasValidConsent, logConsentDenied } from './consent.js';

// Batch Processing
export { processBatch, withExponentialRetry, isRetryableError } from './batch-processing.js';

// Date Helpers
export {
  generateCorrelationId,
  sixMonthsAgo,
  sevenDaysAgo,
  ninetyDaysAgo,
  almostTwoYearsAgo,
  isIn24Hours,
  isIn2Hours,
  formatDate,
  formatTime,
} from './date-helpers.js';

// Events
export { emitJobEvent } from './events.js';

// Payment Reminders
export {
  REMINDER_CONFIG,
  determineReminderLevel,
  getNormalizedLanguage,
  formatCurrencyAmount,
  formatDateForDisplay,
  calculateDaysOverdue,
  buildReminderTemplateParams,
  sendPaymentReminder,
  createEscalatedPaymentTask,
  updateHubSpotPaymentInfo,
  type ReminderLevel,
  type OverdueInstallment,
  type SupportedLanguage,
} from './payment-reminders.js';

// HubSpot Queries
export {
  countLeadsByStatus,
  countNewLeads,
  countConversions,
  fetchWeeklyMetrics,
  formatWeeklyReport,
  type LeadStatus,
  type WeeklyMetrics,
} from './hubspot-queries.js';

// Appointment Helpers
export {
  getContactLanguage,
  getReminderConfig,
  sendAppointmentReminder,
  filterContactsForReminder,
  type ReminderType,
  type AppointmentLanguage,
} from './appointment-helpers.js';
