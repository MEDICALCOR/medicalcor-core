/**
 * Trigger.dev Entry Point
 * Exports all tasks, workflows, and scheduled jobs
 */

// OpenTelemetry Instrumentation
export {
  withTaskSpan,
  withWorkflowSpan,
  injectTraceContext,
  extractTraceContext,
  getTriggerTracer,
  addTriggerAttributes,
  TriggerSpanAttributes,
  type TraceContext,
} from './instrumentation.js';

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
export {
  processEpisodicMemory,
  processEpisodicMemoryBatch,
  queryEpisodicMemory,
  getSubjectMemorySummary,
  type CognitiveMemoryPayload,
  type BatchCognitiveMemoryPayload,
  type MemoryQueryPayload,
  type SubjectSummaryPayload,
} from './tasks/cognitive-memory-handler.js';

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
  crmHealthMonitor,
} from './jobs/cron-jobs.js';
export { weeklyEmbeddingRefresh, dailyEmbeddingStats } from './jobs/embedding-refresh.js';
