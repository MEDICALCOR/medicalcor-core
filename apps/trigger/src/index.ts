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
export { handlePaymentSucceeded, handlePaymentFailed } from './tasks/payment-handler.js';

// Workflows
export { patientJourneyWorkflow, nurtureSequenceWorkflow, bookingAgentWorkflow } from './workflows/patient-journey.js';
export { scoreLeadWorkflow } from './workflows/lead-scoring.js';

// Scheduled Jobs
export {
  dailyRecallCheck,
  appointmentReminders,
  leadScoringRefresh,
  weeklyAnalyticsReport,
  staleLeadCleanup,
  gdprConsentAudit,
} from './jobs/cron-jobs.js';
