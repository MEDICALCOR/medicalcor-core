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
