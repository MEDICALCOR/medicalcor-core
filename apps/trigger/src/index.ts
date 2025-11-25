/**
 * Trigger.dev Entry Point
 * Exports all tasks, workflows, and scheduled jobs
 */

// Tasks
export {
  handleWhatsAppMessage,
  handleWhatsAppStatus,
  type WhatsAppMessagePayload,
  type WhatsAppStatusPayload,
} from './tasks/whatsapp-handler.js';
export { handleVoiceCall, handleCallCompleted } from './tasks/voice-handler.js';
export {
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleRefund,
} from './tasks/payment-handler.js';

// Workflows
export {
  patientJourneyWorkflow,
  nurtureSequenceWorkflow,
  bookingAgentWorkflow,
} from './workflows/patient-journey.js';
export { scoreLeadWorkflow } from './workflows/lead-scoring.js';
export {
  processPostCall,
  handleVapiWebhook,
  generateTranscriptSummary,
  extractKeywordsFromTranscript,
  type PostCallPayload,
  type TranscriptWebhookPayload,
} from './workflows/voice-transcription.js';

// Scheduled Jobs
export {
  dailyRecallCheck,
  appointmentReminders,
  leadScoringRefresh,
  weeklyAnalyticsReport,
  staleLeadCleanup,
  gdprConsentAudit,
} from './jobs/cron-jobs.js';

// Database Backup (Disaster Recovery)
export {
  scheduledDatabaseBackup,
  manualDatabaseBackup,
  checkBackupStatus,
  type ManualBackupPayload,
} from './tasks/database-backup.js';
