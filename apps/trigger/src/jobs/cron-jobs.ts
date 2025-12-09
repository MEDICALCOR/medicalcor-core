/**
 * Cron Jobs Module
 *
 * This file re-exports all scheduled cron jobs from their respective modules.
 * Each module focuses on a specific domain:
 *
 * - cron-scheduling.ts: Appointment reminders, daily recall
 * - cron-analytics.ts: Lead scoring refresh, weekly reports
 * - cron-gdpr.ts: Consent audit, hard deletion, DSR monitoring, Article 30 reports
 * - cron-nps.ts: NPS surveys, expiry checks, follow-up reminders
 * - cron-maintenance.ts: Stale lead cleanup, knowledge ingest, CRM health, partitions
 * - cron-payments.ts: Overdue payment reminders, payment attribution
 *
 * Shared utilities are in cron-shared.ts
 */

// ============================================
// Scheduling Jobs
// ============================================

export { dailyRecallCheck, appointmentReminders } from './cron-scheduling.js';

// ============================================
// Analytics Jobs
// ============================================

export { leadScoringRefresh, weeklyAnalyticsReport } from './cron-analytics.js';

// ============================================
// GDPR Compliance Jobs
// ============================================

export {
  gdprConsentAudit,
  gdprHardDeletionExecutor,
  dsrDueDateMonitor,
  gdprArticle30ReportGeneration,
  gdprArticle30QuarterlyReport,
} from './cron-gdpr.js';

// ============================================
// NPS Survey Jobs
// ============================================

export { npsPostAppointmentSurvey, npsSurveyExpiryCheck, npsFollowUpReminder } from './cron-nps.js';

// ============================================
// Maintenance Jobs
// ============================================

export {
  staleLeadCleanup,
  nightlyKnowledgeIngest,
  crmHealthMonitor,
  databasePartitionMaintenance,
  databasePartitionMaintenanceDaily,
} from './cron-maintenance.js';

// ============================================
// Payment Jobs
// ============================================

export { overduePaymentReminders, hourlyPaymentAttribution } from './cron-payments.js';
