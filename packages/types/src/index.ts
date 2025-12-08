/**
 * MedicalCor Types Package
 *
 * Central type definitions and Zod schemas for the MedicalCor platform.
 * All schemas are consolidated in the schemas/ directory as the Single Source of Truth.
 *
 * @module @medicalcor/types
 * @version 2.0.0
 *
 * ## Architecture
 *
 * This package provides state-of-the-art TypeScript patterns:
 *
 * ### Core Library (`lib/`)
 * - **Primitives**: Branded/nominal types, phantom types, template literals
 * - **Result/Option**: Functional error handling monads (Railway-Oriented Programming)
 * - **Builders**: Type-safe fluent builders with compile-time field tracking
 * - **Matching**: Exhaustive pattern matching with discriminated unions
 * - **Guards**: Runtime type guards and assertion functions
 * - **API**: Response handling with typed errors and pagination
 * - **Events**: Type-safe event system with full inference
 *
 * ### Domain Schemas (`schemas/`)
 * - Common validation (phone, email, UUID, pagination)
 * - Lead/Patient context and lifecycle
 * - Voice/Telephony (Twilio/Vapi)
 * - WhatsApp (360Dialog)
 * - AI Scoring
 *
 * ### Integration Schemas
 * - Stripe payments
 * - HubSpot CRM
 * - Domain events
 * - Server actions
 */

// =============================================================================
// Advanced Type System Library (State-of-the-Art)
// =============================================================================
export * from './lib/index.js';

// =============================================================================
// Consolidated Schemas (Single Source of Truth)
// =============================================================================
export {
  // Common/Validation
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

  // Lead/Patient
  LeadSourceSchema,
  LeadChannelSchema,
  LeadStatusSchema,
  LeadPrioritySchema,
  LeadScoreSchema,
  LeadClassificationSchema,
  UTMParamsSchema,
  AIScoringContextSchema,
  ScoringOutputSchema,
  PatientDemographicsSchema,
  MedicalContextSchema,
  ConversationEntrySchema,
  LeadContextSchema,
  CreateLeadContextSchema,
  UpdateLeadContextSchema,
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

  // Voice/Telephony
  CallDirectionSchema,
  CallStatusSchema,
  VoiceEventTypeSchema,
  TranscriptSegmentSchema,
  RecordingMetadataSchema,
  VoiceEventSchema,
  TwilioBaseSchema,
  VoiceWebhookSchema,
  CallStatusCallbackSchema,
  TwilioStatusCallbackSchema,
  InitiateCallSchema,
  CallSummarySchema,
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

  // WhatsApp
  WhatsAppMessageTypeSchema,
  WhatsAppTextSchema,
  WhatsAppMediaSchema,
  WhatsAppLocationSchema,
  WhatsAppInteractiveSchema,
  WhatsAppContactSchema,
  WhatsAppMessageSchema,
  WhatsAppStatusSchema,
  WhatsAppMetadataSchema,
  WhatsAppValueSchema,
  WhatsAppChangeSchema,
  WhatsAppEntrySchema,
  WhatsAppWebhookSchema,
  WhatsAppSendMessageSchema,
  NormalizedWhatsAppMessageSchema,
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

  // Advanced Scoring
  ScoringDimensionSchema,
  RecommendedActionSchema,
  AdvancedScoringOutputSchema,
  ScoringRequestSchema,
  type ScoringDimension,
  type RecommendedAction,
  type AdvancedScoringOutput,
  type ScoringRequest,

  // Agent Guidance / Call Scripts (M2 Milestone)
  GuidanceTypeSchema,
  GuidanceCategorySchema,
  GuidanceAudienceSchema,
  ScriptActionTypeSchema,
  ScriptStepSchema,
  ObjectionHandlerSchema,
  TalkingPointSchema,
  AgentGuidanceSchema,
  CreateGuidanceSchema,
  UpdateGuidanceSchema,
  GuidanceQuerySchema,
  GuidanceSuggestionSchema,
  GuidanceEventTypeSchema,
  GuidanceEventBaseSchema,
  GuidanceLoadedEventSchema,
  GuidanceSuggestionEventSchema,
  ObjectionDetectedEventSchema,
  GuidanceEventSchema,
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

  // Supervisor/Flex (W3 Milestone)
  SupervisorPermissionSchema,
  SupervisorRoleSchema,
  MonitoredCallStateSchema,
  MonitoredCallSchema,
  SupervisorActionSchema,
  SupervisorSessionSchema,
  StartMonitoringCommandSchema,
  StopMonitoringCommandSchema,
  WhisperCommandSchema,
  BargeCommandSchema,
  HandoffRequestSchema,
  SupervisorNoteSchema,
  SupervisorEventTypeSchema,
  SupervisorEventBaseSchema,
  CallStartedEventSchema,
  CallUpdatedEventSchema,
  CallEndedEventSchema,
  TranscriptMessageEventSchema,
  AlertEventSchema,
  SupervisorEventSchema,
  FlexWorkerActivitySchema,
  FlexWorkerSchema,
  FlexQueueSchema,
  FlexTaskSchema,
  SupervisorDashboardStatsSchema,
  // Queue SLA (H6)
  QueueSLAConfigSchema,
  QueueSLAStatusSchema,
  SLABreachEventSchema,
  SLAReportSchema,
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

  // NPS (Net Promoter Score) - M11 Milestone
  NPSScoreSchema,
  NPSClassificationSchema,
  NPSSurveyStatusSchema,
  NPSTriggerTypeSchema,
  NPSSurveyChannelSchema,
  NPSSurveyRequestSchema,
  NPSResponseSchema,
  NPSSurveyRecordSchema,
  NPSCollectionPayloadSchema,
  NPSResponseProcessingPayloadSchema,
  NPSFollowUpPayloadSchema,
  NPSScoreDistributionSchema,
  NPSSummaryStatsSchema,
  NPSTrendPointSchema,
  NPSDashboardDataSchema,
  classifyNPSScore,
  calculateNPS,
  requiresImmediateFollowUp,
  getFollowUpPriority,
  type NPSScore,
  type NPSClassification,
  type NPSSurveyStatus,
  type NPSTriggerType,
  type NPSSurveyChannel,
  type NPSSurveyRequest,
  type NPSResponse,
  type NPSSurveyRecord,
  type NPSCollectionPayload,
  type NPSResponseProcessingPayload,
  type NPSFollowUpPayload,
  type NPSScoreDistribution,
  type NPSSummaryStats,
  type NPSTrendPoint,
  type NPSDashboardData,

  // Collections & Overdue Payments (M5)
  InstallmentStatusSchema,
  ReminderLevelSchema,
  OverdueInstallmentSchema,
  ReminderConfigSchema,
  PaymentReminderPayloadSchema,
  OverdueDetectionResultSchema,
  PaymentReminderSentEventSchema,
  CollectionEscalatedEventSchema,
  determineReminderLevel,
  getReminderTemplateName,
  shouldSendReminder,
  calculateLateFee,
  formatCurrencyForReminder,
  formatDateForReminder,
  type InstallmentStatus,
  type ReminderLevel,
  type OverdueInstallment,
  type ReminderConfig,
  type PaymentReminderPayload,
  type OverdueDetectionResult,
  type PaymentReminderSentEvent,
  type CollectionEscalatedEvent,

  // Follow-up Scheduling (M9)
  FollowUpTaskStatusSchema,
  FollowUpTaskTypeSchema,
  FollowUpTaskPrioritySchema,
  FollowUpChannelSchema,
  FollowUpTaskSchema,
  CreateFollowUpTaskSchema,
  UpdateFollowUpTaskSchema,
  SnoozeFollowUpTaskSchema,
  CompleteFollowUpTaskSchema,
  RecordFollowUpAttemptSchema,
  FollowUpSchedulingConfigSchema,
  FollowUpTaskFiltersSchema,
  FollowUpTaskPaginationSchema,
  FollowUpTaskPaginatedResultSchema,
  FollowUpTaskCreationPayloadSchema,
  FollowUpReminderPayloadSchema,
  ProcessDueFollowUpsPayloadSchema,
  FollowUpTaskCreatedEventSchema,
  FollowUpTaskCompletedEventSchema,
  FollowUpTaskOverdueEventSchema,
  FollowUpTaskSnoozedEventSchema,
  FollowUpReminderSentEventSchema,
  FollowUpTaskSummarySchema,
  AgentFollowUpPerformanceSchema,
  calculateDueDate,
  getPriorityForLeadScore,
  isTaskOverdue,
  canSnoozeTask,
  canAttemptTask,
  getNextBusinessDay,
  adjustToBusinessHours,
  getFollowUpTypeForDisposition,
  type FollowUpTaskStatus,
  type FollowUpTaskType,
  type FollowUpTaskPriority,
  type FollowUpChannel,
  type FollowUpTask,
  type CreateFollowUpTask,
  type UpdateFollowUpTask,
  type SnoozeFollowUpTask,
  type CompleteFollowUpTask,
  type RecordFollowUpAttempt,
  type FollowUpSchedulingConfig,
  type FollowUpTaskFilters,
  type FollowUpTaskPagination,
  type FollowUpTaskPaginatedResult,
  type FollowUpTaskCreationPayload,
  type FollowUpReminderPayload,
  type ProcessDueFollowUpsPayload,
  type FollowUpTaskCreatedEvent,
  type FollowUpTaskCompletedEvent,
  type FollowUpTaskOverdueEvent,
  type FollowUpTaskSnoozedEvent,
  type FollowUpReminderSentEvent,
  type FollowUpTaskSummary,
  type AgentFollowUpPerformance,

  // Agent Skills & Skill-Based Routing (H6)
  SkillCategorySchema,
  ProficiencyLevelSchema,
  PROFICIENCY_WEIGHTS,
  SkillSchema,
  AgentSkillSchema,
  AgentAvailabilitySchema as SkillAgentAvailabilitySchema,
  AgentProfileSchema,
  SkillMatchTypeSchema,
  SkillRequirementSchema,
  TaskSkillRequirementsSchema,
  RoutingStrategySchema,
  FallbackBehaviorSchema,
  RoutingRuleSchema,
  AgentMatchScoreSchema,
  RoutingDecisionSchema,
  SkillRoutingConfigSchema,
  STANDARD_SKILLS,
  type SkillCategory,
  type ProficiencyLevel,
  type Skill,
  type AgentSkill,
  type AgentAvailability as SkillAgentAvailability,
  type AgentProfile,
  type SkillMatchType,
  type SkillRequirement,
  type TaskSkillRequirements,
  type RoutingStrategy,
  type FallbackBehavior,
  type RoutingRule,
  type AgentMatchScore,
  type RoutingDecision,
  type SkillRoutingConfig,
} from './schemas/index.js';

// =============================================================================
// Stripe Schemas
// =============================================================================
export {
  StripeEventTypeSchema,
  PaymentIntentSchema,
  ChargeSchema,
  StripeCustomerSchema,
  InvoiceSchema,
  CheckoutSessionSchema,
  SubscriptionSchema,
  StripeWebhookEventSchema,
  PaymentEventSchema,
  type StripeEventType,
  type PaymentIntent,
  type Charge,
  type StripeCustomer,
  type Invoice,
  type CheckoutSession,
  type Subscription,
  type StripeWebhookEvent,
  type PaymentEvent,
} from './stripe.schema.js';

// =============================================================================
// HubSpot Schemas
// =============================================================================
export {
  // Core HubSpot
  HubSpotContactPropertiesSchema,
  HubSpotContactSchema,
  HubSpotContactInputSchema,
  HubSpotFilterSchema,
  HubSpotFilterGroupSchema,
  HubSpotSearchRequestSchema,
  HubSpotSearchResponseSchema,
  HubSpotTimelineEventSchema,
  HubSpotTaskSchema,
  // CRM Retention enums
  ChurnRiskSchema,
  NPSCategorySchema,
  LoyaltySegmentSchema,
  FollowUpPrioritySchema,
  // Types
  type HubSpotContactProperties,
  type HubSpotContact,
  type HubSpotContactInput,
  type HubSpotFilter,
  type HubSpotFilterGroup,
  type HubSpotSearchRequest,
  type HubSpotSearchResponse,
  type HubSpotTimelineEvent,
  type HubSpotTask,
  type ChurnRisk,
  type NPSCategory,
  type LoyaltySegment,
  type FollowUpPriority,
} from './hubspot.schema.js';

// =============================================================================
// Patient/Dashboard Schemas
// =============================================================================
export {
  PatientStatusSchema,
  PatientListItemSchema,
  RecentLeadSchema,
  DashboardStatsSchema,
  type PatientStatus,
  type PatientListItem,
  type RecentLead,
  type DashboardStats,
} from './patient.schema.js';

// =============================================================================
// Domain Events Schemas
// =============================================================================
export {
  EventBaseSchema,
  WhatsAppMessageReceivedEventSchema,
  WhatsAppMessageSentEventSchema,
  WhatsAppStatusUpdateEventSchema,
  VoiceCallInitiatedEventSchema,
  VoiceCallCompletedEventSchema,
  VoiceTranscriptReadyEventSchema,
  LeadCreatedEventSchema,
  LeadScoredEventSchema,
  LeadQualifiedEventSchema,
  LeadAssignedEventSchema,
  PaymentReceivedEventSchema,
  PaymentFailedEventSchema,
  AppointmentScheduledEventSchema,
  AppointmentReminderSentEventSchema,
  ConsentRecordedEventSchema,
  DomainEventSchema,
  type EventBase,
  type WhatsAppMessageReceivedEvent,
  type WhatsAppMessageSentEvent,
  type WhatsAppStatusUpdateEvent,
  type VoiceCallInitiatedEvent,
  type VoiceCallCompletedEvent,
  type VoiceTranscriptReadyEvent,
  type LeadCreatedEvent,
  type LeadScoredEvent,
  type LeadQualifiedEvent,
  type LeadAssignedEvent,
  type PaymentReceivedEvent,
  type PaymentFailedEvent,
  type AppointmentScheduledEvent,
  type AppointmentReminderSentEvent,
  type ConsentRecordedEvent,
  type DomainEvent,
} from './events.schema.js';

// =============================================================================
// Server Actions Schemas (Triage, Calendar, Analytics, Messages, Patient Detail)
// =============================================================================
export {
  // Triage schemas
  TriageLeadSchema,
  TriageColumnIdSchema,
  TriageColumnSchema,
  type TriageLead,
  type TriageColumnId,
  type TriageColumn,
  // Calendar schemas
  CalendarSlotSchema,
  type CalendarSlot,
  // Analytics schemas
  AnalyticsMetricsSchema,
  TimeSeriesPointSchema,
  LeadsBySourceSchema,
  ConversionFunnelStepSchema,
  TopProcedureSchema,
  OperatorPerformanceSchema,
  AnalyticsDataSchema,
  type AnalyticsMetrics,
  type TimeSeriesPoint,
  type LeadsBySource,
  type ConversionFunnelStep,
  type TopProcedure,
  type OperatorPerformance,
  type AnalyticsData,
  // Messages schemas
  ConversationChannelSchema,
  ConversationStatusSchema,
  MessageDirectionSchema,
  MessageDeliveryStatusSchema,
  LastMessageSchema,
  ConversationSchema,
  MessageSchema,
  type ConversationChannel,
  type ConversationStatus,
  type MessageDirection,
  type MessageDeliveryStatus,
  type LastMessage,
  type Conversation,
  type Message,
  // Patient detail schemas
  PatientDetailDataSchema,
  PatientTimelineEventSchema,
  type PatientDetailData,
  type PatientTimelineEvent,
} from './server-actions.schema.js';

// =============================================================================
// CRM Dashboard Schemas (Retention, NPS, Loyalty)
// =============================================================================
export {
  // Patient & Stats
  CRMPatientSchema,
  CRMDashboardStatsSchema,
  CRMDashboardDataSchema,
  // Alerts & Trends
  ChurnRiskAlertSchema,
  NPSTrendDataSchema,
  RetentionTrendDataSchema,
  LoyaltyDistributionSchema,
  // Campaigns & Pricing
  WhatsAppCampaignStatsSchema,
  DynamicPricingRuleSchema,
  // NPS Analysis
  NPSFeedbackItemSchema,
  NPSThemeSchema,
  // Types
  type CRMPatient,
  type CRMDashboardStats,
  type CRMDashboardData,
  type ChurnRiskAlert,
  type NPSTrendData,
  type RetentionTrendData,
  type LoyaltyDistribution,
  type WhatsAppCampaignStats,
  type DynamicPricingRule,
  type NPSFeedbackItem,
  type NPSTheme,
} from './crm-dashboard.schema.js';

// =============================================================================
// CRM / Lead Generation Machine Schemas
// =============================================================================
export {
  // DTOs
  LeadDTOSchema,
  TreatmentPlanDTOSchema,
  InteractionDTOSchema,
  // Enums
  InteractionChannelSchema,
  InteractionDirectionSchema,
  LeadEventTypeSchema,
  CRMLeadStatusSchema,
  TreatmentPlanStageSchema,
  // Types
  type LeadDTO,
  type TreatmentPlanDTO,
  type InteractionDTO,
  type ICRMProvider,
  type LeadEventType,
  type CRMLeadStatus,
  type TreatmentPlanStage,
} from './crm.schema.js';

// =============================================================================
// Bulk Import Schemas (L3 Feature)
// =============================================================================
export {
  // Format & Status
  BulkImportFormatSchema,
  BulkImportStatusSchema,
  BulkImportErrorCodeSchema,
  // Row schemas
  BulkImportRowSchema,
  BulkImportRowResultSchema,
  // Options & Request
  BulkImportOptionsSchema,
  BulkImportRequestSchema,
  // Job tracking
  BulkImportJobSchema,
  // Response schemas
  BulkImportSyncResponseSchema,
  BulkImportAsyncResponseSchema,
  BulkImportJobStatusSchema,
  // CSV mapping
  CSVColumnMappingSchema,
  // Workflow payload
  BulkImportWorkflowPayloadSchema,
  // Helper functions
  normalizePhoneForComparison,
  generateExternalContactId,
  calculateImportProgress,
  // Types
  type BulkImportFormat,
  type BulkImportStatus,
  type BulkImportErrorCode,
  type BulkImportRow,
  type BulkImportRowResult,
  type BulkImportOptions,
  type BulkImportRequest,
  type BulkImportJob,
  type BulkImportSyncResponse,
  type BulkImportAsyncResponse,
  type BulkImportJobStatus,
  type CSVColumnMapping,
  type BulkImportWorkflowPayload,
} from './bulk-import.schema.js';

// =============================================================================
// Agent Performance Schemas (M7)
// =============================================================================
export {
  // Enums
  AgentTypeSchema,
  AgentRoleSchema,
  AgentStatusSchema,
  AgentAvailabilitySchema,
  AssignmentReasonSchema,
  LeadOutcomeSchema,
  RatingTypeSchema,
  // Core schemas
  AgentSchema,
  AgentSessionSchema,
  AgentDailyMetricsSchema,
  // Dashboard schemas
  AgentPerformanceSummarySchema,
  AgentTrendPointSchema,
  AgentDetailSchema,
  AgentDashboardMetricsSchema,
  AgentPerformanceDashboardDataSchema,
  // Request schemas
  AgentPerformanceTimeRangeSchema,
  GetAgentPerformanceRequestSchema,
  // Types
  type AgentType,
  type AgentRole,
  type AgentStatus,
  type AgentAvailability,
  type AssignmentReason,
  type LeadOutcome,
  type RatingType,
  type Agent,
  type AgentSession,
  type AgentDailyMetrics,
  type AgentPerformanceSummary,
  type AgentTrendPoint,
  type AgentDetail,
  type AgentDashboardMetrics,
  type AgentPerformanceDashboardData,
  type AgentPerformanceTimeRange,
  type GetAgentPerformanceRequest,
  // Wrap-up time tracking (M8)
  WrapUpStatusSchema,
  WrapUpEventSchema,
  StartWrapUpRequestSchema,
  CompleteWrapUpRequestSchema,
  WrapUpStatsSchema,
  WrapUpTrendPointSchema,
  AgentWrapUpPerformanceSchema,
  WrapUpDashboardDataSchema,
  type WrapUpStatus,
  type WrapUpEvent,
  type StartWrapUpRequest,
  type CompleteWrapUpRequest,
  type WrapUpStats,
  type WrapUpTrendPoint,
  type AgentWrapUpPerformance,
  type WrapUpDashboardData,
} from './agent-performance.schema.js';

// =============================================================================
// Retention Scoring Schemas (M8)
// =============================================================================
export {
  // Risk & Priority Levels (ChurnRiskLevel uses ChurnRisk values, FollowUpPriority already exported from hubspot)
  ChurnRiskLevelSchema,
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
  // Types (ChurnRiskLevel = ChurnRisk, FollowUpPriority is already exported from hubspot)
  type ChurnRiskLevel,
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
  type ChurnRiskDetectedEvent as RetentionChurnRiskDetectedEvent,
  type BatchScoringCompletedEvent,
} from './schemas/retention.js';

// =============================================================================
// Unified Audit Log Schemas (M1 - Consolidated Audit Tables)
// =============================================================================
export {
  // Enums
  AuditTypeSchema,
  AuditActorTypeSchema,
  AuditActionSchema,
  AuditSeveritySchema,
  GeneralAuditStatusSchema,
  GeneralAuditCategorySchema,
  ReplayOperationTypeSchema,
  ReplayStatusSchema,
  ConsentAuditActionSchema,
  // Actor schema
  AuditActorSchema,
  // Base and entry schemas
  BaseAuditEntrySchema,
  ComplianceAuditEntrySchema,
  GeneralAuditEntrySchema,
  ConsentAuditEntrySchema,
  ReplayAuditEntrySchema,
  UnifiedAuditEntrySchema,
  // Replay sub-schemas
  ReplayProgressSchema,
  ReplayResultSchema,
  ReplayErrorSchema,
  // Create schemas
  CreateComplianceAuditSchema,
  CreateGeneralAuditSchema,
  CreateConsentAuditSchema,
  CreateReplayAuditSchema,
  // Query schemas
  AuditQueryFiltersSchema,
  AuditQueryResultSchema,
  // Stats schemas
  AuditTypeStatsSchema,
  AuditStatsSchema,
  // Types
  type AuditType,
  type AuditActorType,
  type AuditAction,
  type AuditSeverity,
  type GeneralAuditStatus,
  type GeneralAuditCategory,
  type ReplayOperationType,
  type ReplayStatus,
  type ConsentAuditAction,
  type AuditActor,
  type ComplianceAuditEntry,
  type GeneralAuditEntry,
  type ConsentAuditEntry,
  type ReplayAuditEntry,
  type UnifiedAuditEntry,
  type ReplayProgress,
  type ReplayResult,
  type ReplayError,
  type CreateComplianceAudit,
  type CreateGeneralAudit,
  type CreateConsentAudit,
  type CreateReplayAudit,
  type AuditQueryFilters,
  type AuditQueryResult,
  type AuditTypeStats,
  type AuditStats,
} from './audit.schema.js';

// =============================================================================
// Load Testing Schemas (L7 - Performance Baseline)
// =============================================================================
export {
  // Enums
  LoadTestScenarioSchema,
  LoadTestStatusSchema,
  // Threshold schemas
  ThresholdResultSchema,
  ThresholdsMapSchema,
  // Input schemas
  LoadTestMetricsInputSchema,
  EndpointMetricsInputSchema,
  CreateLoadTestResultSchema,
  // Output schemas
  LoadTestResultSchema,
  LoadTestEndpointMetricsSchema,
  // Dashboard schemas
  LoadTestSummaryStatsSchema,
  LoadTestTrendPointSchema,
  ScenarioBreakdownSchema,
  EnvironmentComparisonSchema,
  LoadTestDashboardDataSchema,
  // Query schemas
  LoadTestTimeRangeSchema,
  LoadTestQuerySchema,
  // Types
  type LoadTestScenario,
  type LoadTestStatus,
  type ThresholdResult,
  type ThresholdsMap,
  type LoadTestMetricsInput,
  type EndpointMetricsInput,
  type CreateLoadTestResult,
  type LoadTestResult,
  type LoadTestEndpointMetrics,
  type LoadTestSummaryStats,
  type LoadTestTrendPoint,
  type ScenarioBreakdown,
  type EnvironmentComparison,
  type LoadTestDashboardData,
  type LoadTestTimeRange,
  type LoadTestQuery,
} from './load-testing.schema.js';

// =============================================================================
// Cohort LTV Analysis Schemas (M6/M7 - Cohort Analysis)
// =============================================================================
export {
  // Monthly Summary
  CohortLTVMonthlySummarySchema,
  // Evolution Tracking
  CohortLTVEvolutionPointSchema,
  CohortLTVEvolutionSchema,
  // Comparison
  CohortComparisonSchema,
  // Query Parameters
  CohortLTVQuerySchema,
  CohortEvolutionQuerySchema,
  // Dashboard Response
  CohortLTVDashboardSchema,
  // Segment Analysis
  CohortSegmentDistributionSchema,
  // Payback Analysis
  CohortPaybackAnalysisSchema,
  // Types
  type CohortLTVMonthlySummary,
  type CohortLTVEvolutionPoint,
  type CohortLTVEvolution,
  type CohortComparison,
  type CohortLTVQuery,
  type CohortEvolutionQuery,
  type CohortLTVDashboard,
  type CohortSegmentDistribution,
  type CohortPaybackAnalysis,
} from './schemas/cohort-ltv.js';

// =============================================================================
// pLTV (Predicted Lifetime Value) Schemas (M2 Milestone)
// =============================================================================
export {
  // Classification & Tiers
  PLTVTierSchema,
  PLTVGrowthPotentialSchema,
  PLTVInvestmentPrioritySchema,
  // Input Metrics
  HistoricalLTVInputSchema,
  PaymentBehaviorInputSchema,
  EngagementMetricsInputSchema,
  ProcedureInterestInputSchema,
  PLTVPredictionInputSchema,
  // Score Output
  PLTVConfidenceIntervalSchema,
  PLTVFactorBreakdownSchema,
  PLTVScoreResultSchema,
  PLTVScoringOutputSchema,
  // Request/Response
  ScorePatientPLTVRequestSchema,
  BatchPLTVScoringRequestSchema,
  PLTVScoringResponseSchema,
  BatchPLTVScoringResultSchema,
  // Events
  HighValuePatientIdentifiedEventSchema,
  PLTVScoredEventSchema,
  PLTVChangedEventSchema,
  BatchPLTVScoringCompletedEventSchema,
  // Types
  type PLTVTier,
  type PLTVGrowthPotential,
  type PLTVInvestmentPriority,
  type HistoricalLTVInput,
  type PaymentBehaviorInput,
  type EngagementMetricsInput,
  type ProcedureInterestInput,
  type PLTVPredictionInput,
  type PLTVConfidenceInterval,
  type PLTVFactorBreakdown,
  type PLTVScoreResult,
  type PLTVScoringOutput,
  type ScorePatientPLTVRequest,
  type BatchPLTVScoringRequest,
  type PLTVScoringResponse,
  type BatchPLTVScoringResult,
  type HighValuePatientIdentifiedEvent,
  type PLTVScoredEvent,
  type PLTVChangedEvent,
  type BatchPLTVScoringCompletedEvent,
} from './schemas/pltv.js';
// Agent Presence Schemas (M2 - WebSocket Presence)
// =============================================================================
export {
  // Status & Reason
  AgentPresenceStatusSchema,
  PresenceChangeReasonSchema,
  // Agent State
  AgentPresenceSchema,
  // Heartbeat
  HeartbeatConfigSchema,
  HeartbeatMessageSchema,
  HeartbeatAckSchema,
  // Event Types
  PresenceEventTypeSchema,
  PresenceEventBaseSchema,
  // Connection Events
  PresenceConnectEventSchema,
  PresenceConnectedEventSchema,
  PresenceDisconnectEventSchema,
  PresenceDisconnectedEventSchema,
  // Status Events
  PresenceStatusChangeEventSchema,
  // Heartbeat Events
  PresenceHeartbeatEventSchema,
  PresenceHeartbeatAckEventSchema,
  // Query Events
  PresenceQueryEventSchema,
  PresenceQueryResponseEventSchema,
  // Bulk Events
  PresenceBulkUpdateEventSchema,
  PresenceRosterEventSchema,
  // Union Event
  PresenceEventSchema,
  // Metrics
  AgentPresenceMetricsSchema,
  TeamPresenceSummarySchema,
  // Types
  type AgentPresenceStatus,
  type PresenceChangeReason,
  type AgentPresence,
  type HeartbeatConfig,
  type HeartbeatMessage,
  type HeartbeatAck,
  type PresenceEventType,
  type PresenceEventBase,
  type PresenceConnectEvent,
  type PresenceConnectedEvent,
  type PresenceDisconnectEvent,
  type PresenceDisconnectedEvent,
  type PresenceStatusChangeEvent,
  type PresenceHeartbeatEvent,
  type PresenceHeartbeatAckEvent,
  type PresenceQueryEvent,
  type PresenceQueryResponseEvent,
  type PresenceBulkUpdateEvent,
  type PresenceRosterEvent,
  type PresenceEvent,
  type AgentPresenceMetrics,
  type TeamPresenceSummary,
} from './schemas/agent-presence.js';

// =============================================================================
// Financing & Payment Plan Schemas (L2 Feature)
// =============================================================================
export {
  // Status & Types
  FinancingApplicationStatusSchema,
  FinancingPlanTypeSchema,
  FinancingTermSchema,
  FinancingDecisionCodeSchema,
  FinancingProviderSchema,
  // Applicant & Application
  FinancingApplicantSchema,
  CreateFinancingApplicationSchema,
  FinancingOfferSchema,
  FinancingApplicationSchema,
  // Acceptance
  AcceptFinancingOfferSchema,
  FinancingAcceptanceResultSchema,
  // Eligibility
  FinancingEligibilityCheckSchema,
  FinancingEligibilityResultSchema,
  // Events
  FinancingApplicationSubmittedEventSchema,
  FinancingApplicationApprovedEventSchema,
  FinancingApplicationDeclinedEventSchema,
  FinancingOfferAcceptedEventSchema,
  FinancingFundsDisbursedEventSchema,
  FinancingApplicationExpiredEventSchema,
  FinancingEventSchema,
  // Summary
  FinancingSummarySchema,
  // Helper Functions
  toMajorCurrencyUnits,
  toMinorCurrencyUnits,
  formatFinancingAmount,
  calculateMonthlyPayment,
  calculateTotalRepayment,
  calculateFinanceCharge,
  isApplicationActionable,
  isApplicationExpired,
  getFinancingStatusLabel,
  // Types
  type FinancingApplicationStatus,
  type FinancingPlanType,
  type FinancingTerm,
  type FinancingDecisionCode,
  type FinancingProvider,
  type FinancingApplicant,
  type CreateFinancingApplication,
  type FinancingOffer,
  type FinancingApplication,
  type AcceptFinancingOffer,
  type FinancingAcceptanceResult,
  type FinancingEligibilityCheck,
  type FinancingEligibilityResult,
  type FinancingApplicationSubmittedEvent,
  type FinancingApplicationApprovedEvent,
  type FinancingApplicationDeclinedEvent,
  type FinancingOfferAcceptedEvent,
  type FinancingFundsDisbursedEvent,
  type FinancingApplicationExpiredEvent,
  type FinancingEvent,
  type FinancingSummary,
} from './schemas/financing.js';
// Invoice Generation Schemas (L3 Feature)
// =============================================================================
export {
  // Status
  InvoiceStatusSchema,
  // Components
  InvoiceLineItemSchema,
  ClinicDetailsSchema,
  InvoiceCustomerSchema,
  InvoiceDataSchema,
  // Email Options
  InvoiceEmailOptionsSchema,
  // Payload & Result
  InvoiceGenerationPayloadSchema,
  InvoiceGenerationResultSchema,
  // Events
  InvoiceGeneratedEventSchema,
  InvoiceSentEventSchema,
  // Helper Functions
  formatInvoiceCurrency,
  formatInvoiceDate,
  calculateInvoiceTotals,
  getDefaultInvoiceStoragePath,
  getInvoiceLabels,
  // Types
  type InvoiceStatus,
  type InvoiceLineItem,
  type ClinicDetails,
  type InvoiceCustomer,
  type InvoiceData,
  type InvoiceEmailOptions,
  type InvoiceGenerationPayload,
  type InvoiceGenerationResult,
  type InvoiceGeneratedEvent,
  type InvoiceSentEvent,
} from './schemas/invoice-generation.js';

// =============================================================================
// Breach Notification Schemas (L3 - GDPR Compliance)
// =============================================================================
export {
  // Enums & Status Types
  BreachSeveritySchema,
  BreachDataCategorySchema,
  BreachNatureSchema,
  BreachStatusSchema,
  BreachNotificationChannelSchema,
  // Core Schemas
  AffectedSubjectSchema,
  BreachMeasureSchema,
  AuthorityNotificationSchema,
  DataBreachSchema,
  // Workflow Payloads
  ReportBreachPayloadSchema,
  BreachNotificationWorkflowPayloadSchema,
  NotifySubjectPayloadSchema,
  NotifyAuthorityPayloadSchema,
  // Events
  BreachDetectedEventSchema,
  BreachAssessedEventSchema,
  BreachAuthorityNotifiedEventSchema,
  BreachSubjectNotifiedEventSchema,
  BreachResolvedEventSchema,
  BreachEventSchema,
  // Dashboard & Config
  BreachSummarySchema,
  BreachNotificationConfigSchema,
  // Helper Functions
  calculateHoursUntilDeadline,
  requiresAuthorityNotification,
  requiresSubjectNotification,
  assessBreachSeverity,
  // Types
  type BreachSeverity,
  type BreachDataCategory,
  type BreachNature,
  type BreachStatus,
  type BreachNotificationChannel,
  type AffectedSubject,
  type BreachMeasure,
  type AuthorityNotification,
  type DataBreach,
  type ReportBreachPayload,
  type BreachNotificationWorkflowPayload,
  type NotifySubjectPayload,
  type NotifyAuthorityPayload,
  type BreachDetectedEvent,
  type BreachAssessedEvent,
  type BreachAuthorityNotifiedEvent,
  type BreachSubjectNotifiedEvent,
  type BreachResolvedEvent,
  type BreachEvent,
  type BreachSummary,
  type BreachNotificationConfig,
} from './schemas/breach-notification.js';
// Index Usage Monitoring Schemas (L1 Feature)
// =============================================================================
export {
  // Status Enums
  IndexHealthStatusSchema,
  IndexTypeSchema,
  IndexRecommendationActionSchema,
  // Index Metrics
  IndexUsageReportSchema,
  IndexUsageSummarySchema,
  IndexUsageMetricSchema,
  // Recommendations
  IndexRecommendationSchema,
  IndexRecommendationBatchSchema,
  // Monitoring Job
  IndexMonitoringConfigSchema,
  IndexMonitoringResultSchema,
  // Query Schemas
  IndexUsageQuerySchema,
  IndexUsageTrendPointSchema,
  IndexUsageDashboardSchema,
  // Events
  IndexMonitoringCompletedEventSchema,
  UnusedIndexesDetectedEventSchema,
  CriticalIndexHealthEventSchema,
  // Helper Functions
  determineIndexStatus,
  formatBytes,
  calculatePotentialSavings,
  generateIndexRecommendations,
  // Types
  type IndexHealthStatus,
  type IndexType,
  type IndexRecommendationAction,
  type IndexUsageReport,
  type IndexUsageSummary,
  type IndexUsageMetric,
  type IndexRecommendation,
  type IndexRecommendationBatch,
  type IndexMonitoringConfig,
  type IndexMonitoringResult,
  type IndexUsageQuery,
  type IndexUsageTrendPoint,
  type IndexUsageDashboard,
  type IndexMonitoringCompletedEvent,
  type UnusedIndexesDetectedEvent,
  type CriticalIndexHealthEvent,
} from './schemas/index-usage.js';
