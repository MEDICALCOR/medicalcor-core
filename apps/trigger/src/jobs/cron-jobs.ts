/**
 * Scheduled Jobs (Cron)
 *
 * Central export file for all scheduled recurring tasks.
 * Jobs are organized by domain in separate files for maintainability.
 */

// Recall and follow-up jobs
export { dailyRecallCheck } from './recall-jobs';

// Appointment reminder jobs
export { appointmentReminders } from './appointment-jobs';

// Lead management jobs
export { leadScoringRefresh, staleLeadCleanup } from './lead-management-jobs';

// Analytics and reporting jobs
export { weeklyAnalyticsReport } from './analytics-jobs';

// GDPR and compliance jobs
export { gdprConsentAudit } from './compliance-jobs';

// Re-export shared utilities for convenience
export {
  generateCorrelationId,
  daysAgo,
  monthsAgo,
  sixMonthsAgo,
  sevenDaysAgo,
  ninetyDaysAgo,
  almostTwoYearsAgo,
  isIn24Hours,
  isIn2Hours,
  formatDate,
  formatTime,
} from '../shared/date-helpers';

export { BATCH_SIZE, processBatch, type BatchResult, type BatchLogger } from '../shared/batch-processor';

export { emitJobEvent, type EventStore } from '../shared/event-emitter';
