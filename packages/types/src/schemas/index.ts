/**
 * Central export point for all domain schemas
 *
 * This is the Single Source of Truth for Zod schemas in the MedicalCor platform.
 * All schema imports should reference this file or its sub-modules.
 */

// =============================================================================
// Common/Validation Schemas
// =============================================================================
export {
  PhoneNumberSchema,
  E164PhoneSchema,
  EmailSchema,
  UUIDSchema,
  TimestampSchema,
  CorrelationIdSchema,
  PaginationSchema,
  CursorPaginationSchema,
  PaginatedResponseSchema,
  type PhoneNumber,
  type E164Phone,
  type Email,
  type UUID,
  type Timestamp,
  type CorrelationId,
  type Pagination,
  type CursorPagination,
  type PaginatedResponse,
} from './common.js';

// =============================================================================
// Lead/Patient Schemas
// =============================================================================
export {
  // Lead source/channel
  LeadSourceSchema,
  LeadChannelSchema, // @deprecated - use LeadSourceSchema
  // Lead status and priority
  LeadStatusSchema,
  LeadPrioritySchema,
  // AI scoring
  LeadScoreSchema,
  LeadClassificationSchema,
  UTMParamsSchema,
  AIScoringContextSchema,
  ScoringOutputSchema,
  // Patient data
  PatientDemographicsSchema,
  MedicalContextSchema,
  ConversationEntrySchema,
  // Full domain model
  LeadContextSchema,
  CreateLeadContextSchema,
  UpdateLeadContextSchema,
  // Types
  type LeadSource,
  type LeadChannel,
  type LeadStatus,
  type LeadPriority,
  type LeadScore,
  type LeadClassification,
  type UTMParams,
  type AIScoringContext,
  type ScoringOutput,
  type PatientDemographics,
  type MedicalContext,
  type ConversationEntry,
  type LeadContext,
  type CreateLeadContext,
  type UpdateLeadContext,
} from './lead.js';

// =============================================================================
// Voice/Telephony Schemas
// =============================================================================
export {
  // Enums
  CallDirectionSchema,
  CallStatusSchema,
  VoiceEventTypeSchema,
  // Event data
  TranscriptSegmentSchema,
  RecordingMetadataSchema,
  VoiceEventSchema,
  // Twilio webhooks
  TwilioBaseSchema,
  VoiceWebhookSchema,
  CallStatusCallbackSchema,
  TwilioStatusCallbackSchema,
  // Operations
  InitiateCallSchema,
  CallSummarySchema,
  // Types
  type CallDirection,
  type CallStatus,
  type VoiceEventType,
  type TranscriptSegment,
  type RecordingMetadata,
  type VoiceEvent,
  type TwilioBase,
  type VoiceWebhook,
  type CallStatusCallback,
  type TwilioStatusCallback,
  type InitiateCall,
  type CallSummary,
} from './voice.js';

// =============================================================================
// WhatsApp Schemas
// =============================================================================
export {
  // Message types
  WhatsAppMessageTypeSchema,
  WhatsAppTextSchema,
  WhatsAppMediaSchema,
  WhatsAppLocationSchema,
  WhatsAppInteractiveSchema,
  WhatsAppContactSchema,
  WhatsAppMessageSchema,
  WhatsAppStatusSchema,
  WhatsAppMetadataSchema,
  // Webhook structures
  WhatsAppValueSchema,
  WhatsAppChangeSchema,
  WhatsAppEntrySchema,
  WhatsAppWebhookSchema,
  // Outbound operations
  WhatsAppSendMessageSchema,
  NormalizedWhatsAppMessageSchema,
  // Types
  type WhatsAppMessageType,
  type WhatsAppText,
  type WhatsAppMedia,
  type WhatsAppLocation,
  type WhatsAppInteractive,
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppStatus,
  type WhatsAppMetadata,
  type WhatsAppValue,
  type WhatsAppChange,
  type WhatsAppEntry,
  type WhatsAppWebhook,
  type WhatsAppSendMessage,
  type NormalizedWhatsAppMessage,
} from './whatsapp.js';

// =============================================================================
// Advanced Scoring Schemas
// =============================================================================
export {
  ScoringDimensionSchema,
  RecommendedActionSchema,
  AdvancedScoringOutputSchema,
  ScoringRequestSchema,
  type ScoringDimension,
  type RecommendedAction,
  type AdvancedScoringOutput,
  type ScoringRequest,
} from './scoring.js';

// =============================================================================
// Agent Guidance / Call Scripts (M2 Milestone)
// =============================================================================
export {
  // Types & Categories
  GuidanceTypeSchema,
  GuidanceCategorySchema,
  GuidanceAudienceSchema,
  ScriptActionTypeSchema,
  // Script Components
  ScriptStepSchema,
  ObjectionHandlerSchema,
  TalkingPointSchema,
  // Main Entity
  AgentGuidanceSchema,
  // Input Schemas
  CreateGuidanceSchema,
  UpdateGuidanceSchema,
  GuidanceQuerySchema,
  // Real-time
  GuidanceSuggestionSchema,
  GuidanceEventTypeSchema,
  GuidanceEventBaseSchema,
  GuidanceLoadedEventSchema,
  GuidanceSuggestionEventSchema,
  ObjectionDetectedEventSchema,
  GuidanceEventSchema,
  // Types
  type GuidanceType,
  type GuidanceCategory,
  type GuidanceAudience,
  type ScriptActionType,
  type ScriptStep,
  type ObjectionHandler,
  type TalkingPoint,
  type AgentGuidance,
  type CreateGuidance,
  type UpdateGuidance,
  type GuidanceQuery,
  type GuidanceSuggestion,
  type GuidanceEventType,
  type GuidanceEventBase,
  type GuidanceLoadedEvent,
  type GuidanceSuggestionEvent,
  type ObjectionDetectedEvent,
  type GuidanceEvent,
} from './guidance.js';

// =============================================================================
// Supervisor/Flex Schemas (W3 Milestone)
// =============================================================================
export {
  // Permissions & Roles
  SupervisorPermissionSchema,
  SupervisorRoleSchema,
  // Call Monitoring
  MonitoredCallStateSchema,
  MonitoredCallSchema,
  SupervisorActionSchema,
  SupervisorSessionSchema,
  // Commands
  StartMonitoringCommandSchema,
  StopMonitoringCommandSchema,
  WhisperCommandSchema,
  BargeCommandSchema,
  HandoffRequestSchema,
  SupervisorNoteSchema,
  // Events
  SupervisorEventTypeSchema,
  SupervisorEventBaseSchema,
  CallStartedEventSchema,
  CallUpdatedEventSchema,
  CallEndedEventSchema,
  TranscriptMessageEventSchema,
  AlertEventSchema,
  SupervisorEventSchema,
  // Flex Workers & Queues
  FlexWorkerActivitySchema,
  FlexWorkerSchema,
  FlexQueueSchema,
  FlexTaskSchema,
  // Dashboard
  SupervisorDashboardStatsSchema,
  // Queue SLA (H6)
  QueueSLAConfigSchema,
  QueueSLAStatusSchema,
  SLABreachEventSchema,
  SLAReportSchema,
  // Types
  type SupervisorPermission,
  type SupervisorRole,
  type MonitoredCallState,
  type MonitoredCall,
  type SupervisorAction,
  type SupervisorSession,
  type StartMonitoringCommand,
  type StopMonitoringCommand,
  type WhisperCommand,
  type BargeCommand,
  type HandoffRequest,
  type SupervisorNote,
  type SupervisorEventType,
  type SupervisorEventBase,
  type CallStartedEvent,
  type CallUpdatedEvent,
  type CallEndedEvent,
  type TranscriptMessageEvent,
  type AlertEvent,
  type SupervisorEvent,
  type FlexWorkerActivity,
  type FlexWorker,
  type FlexQueue,
  type FlexTask,
  type SupervisorDashboardStats,
  // Queue SLA Types (H6)
  type QueueSLAConfig,
  type QueueSLAStatus,
  type SLABreachEvent,
  type SLAReport,
} from './supervisor.js';

// =============================================================================
// Retention Scoring Schemas (M8 Milestone)
// =============================================================================
export {
  // Risk & Priority Levels
  ChurnRiskLevelSchema,
  FollowUpPrioritySchema,
  RetentionClassificationSchema,
  // Input Metrics
  RetentionMetricsInputSchema,
  ExtendedRetentionMetricsSchema,
  // Score Output
  RetentionScoreResultSchema,
  RetentionScoreBreakdownSchema,
  RetentionScoringOutputSchema,
  // Patient Context
  PatientRetentionContextSchema,
  // Request/Response
  ScorePatientRetentionRequestSchema,
  BatchRetentionScoringRequestSchema,
  RetentionScoringResponseSchema,
  BatchRetentionScoringResultSchema,
  // Events
  ChurnRiskDetectedEventSchema,
  BatchScoringCompletedEventSchema,
  // Types
  type ChurnRiskLevel,
  type FollowUpPriority,
  type RetentionClassification,
  type RetentionMetricsInput,
  type ExtendedRetentionMetrics,
  type RetentionScoreResult,
  type RetentionScoreBreakdown,
  type RetentionScoringOutput,
  type PatientRetentionContext,
  type ScorePatientRetentionRequest,
  type BatchRetentionScoringRequest,
  type RetentionScoringResponse,
  type BatchRetentionScoringResult,
  type ChurnRiskDetectedEvent,
  type BatchScoringCompletedEvent,
} from './retention.js';
