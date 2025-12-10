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
  attributePaymentToLead,
  batchAttributeUnlinkedPayments,
  type PaymentAttributionPayload,
} from './tasks/payment-attribution.js';
export {
  handleUrgentCase,
  detectUrgentKeywords,
  type UrgentCasePayload,
  type UrgentKeywordDetectionPayload,
} from './tasks/urgent-case-handler.js';
export {
  dispatchNotification,
  sendUrgentAlert,
  sendAppointmentReminder,
  type NotificationDispatchPayload,
  type UrgentAlertPayload,
  type AppointmentReminderPayload,
  type DispatchResult,
} from './tasks/notification-dispatcher.js';

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
export {
  urgentCaseEscalationWorkflow,
  messageUrgencyDetectionWorkflow,
  type UrgentCaseEscalationPayload,
  type MessageUrgencyDetectionPayload,
} from './workflows/urgent-case-escalation.js';
export {
  bulkImportWorkflow,
  bulkImportBatchTask,
  largeImportOrchestrator,
  BulkImportWorkflowPayloadSchema,
  type BulkImportWorkflowPayload,
  type BulkImportWorkflowResult,
} from './workflows/bulk-import.js';

// Embedding Worker Tasks
export {
  embedContent,
  embedBatch,
  reembedContent,
  processEmbeddingEvents,
  type EmbedContentPayload,
  type BatchEmbedPayload,
  type ProcessEmbeddingEventsPayload,
  EmbedContentPayloadSchema,
  BatchEmbedPayloadSchema,
  ProcessEmbeddingEventsPayloadSchema,
} from './tasks/embedding-worker.js';

// Domain Event-driven Embedding Task
export { processEmbeddingEvent, embeddingEventCron } from './tasks/embedding-event-handler.js';

// Embedding Queue Utilities (for non-blocking API requests)
export {
  queueEmbedding,
  queueBatchEmbeddings,
  queueManyEmbeddings,
  generateIdempotencyKey,
  EmbeddingIdempotencyKeys,
  type QueueEmbeddingPayload,
  type QueueBatchEmbeddingsPayload,
  type QueueResult,
} from './utils/embedding-queue.js';

// Scheduled Jobs
export {
  dailyRecallCheck,
  appointmentReminders,
  leadScoringRefresh,
  weeklyAnalyticsReport,
  staleLeadCleanup,
  gdprConsentAudit,
  crmHealthMonitor,
  nightlyKnowledgeIngest,
  gdprHardDeletionExecutor,
  dsrDueDateMonitor,
  npsPostAppointmentSurvey,
  npsSurveyExpiryCheck,
  npsFollowUpReminder,
} from './jobs/cron-jobs.js';
export {
  weeklyEmbeddingRefresh,
  dailyEmbeddingStats,
  scheduledEmbeddingEventProcessor,
  dailyStaleEmbeddingCleanup,
} from './jobs/embedding-refresh.js';
export { queueSLAMonitor, dailySLAReport } from './jobs/queue-sla-monitor.js';
export {
  scheduledKeyRotation,
  manualKeyRotation,
  checkKeyRotationStatus,
  ManualKeyRotationPayloadSchema,
  type ManualKeyRotationPayload,
  type KeyRotationResult,
} from './jobs/key-rotation.js';

// Breach Notification Workflow (GDPR Compliance)
export {
  reportBreach,
  notifyDPO,
  breachNotificationWorkflow,
  notifyAuthority,
  notifySubject,
  breachDeadlineMonitor,
  type ReportBreachPayload,
  type BreachNotificationWorkflowPayload,
  type NotifySubjectPayload,
  type NotifyAuthorityPayload,
} from './workflows/breach-notification.js';

// LTV Orchestration Workflow
export {
  recordPaymentToCase,
  recalculatePLTV,
  batchRecalculatePLTV,
  refreshCohortViews,
  dailyLTVOrchestration,
  weeklyLTVAudit,
  RecordPaymentPayloadSchema,
  RecalculatePLTVPayloadSchema,
  type RecordPaymentPayload,
  type RecalculatePLTVPayload,
} from './workflows/ltv-orchestration.js';

// Retention Scoring Workflow
export {
  scorePatientRetention,
  batchRetentionScoring,
  dailyRetentionScoring,
  updateInactivityDays,
  RetentionScoringPayloadSchema,
  BatchRetentionScoringPayloadSchema,
} from './workflows/retention-scoring.js';
