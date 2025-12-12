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

  // Dental Lab (New)
  LabCaseStatusSchema,
  LabCasePrioritySchema,
  LabCaseSchema,
  LabSLATrackingSchema,
  LabEventSchema,
  LabCaseStatusChangedEventSchema,
  LabCaseSLABreachEventSchema,
  LabCaseReadyForPickupEventSchema,
  LabPerformanceMetricsSchema,
  SLAOverallStatusSchema,
  CreateLabCaseSchema,
  UpdateLabCaseSchema,
  LabCaseQueryFiltersSchema,
  LabCasePaginationSchema,
  LabCaseListResponseSchema,
  DigitalScanSchema,
  CreateDigitalScanSchema,
  CADDesignSchema,
  CreateCADDesignSchema,
  ApproveDesignSchema,
  FabricationRecordSchema,
  CreateFabricationRecordSchema,
  QCInspectionSchema,
  CreateQCInspectionSchema,
  TryInRecordSchema,
  CreateTryInRecordSchema,
  StatusHistoryEntrySchema,
  CollaborationThreadSchema,
  CreateCollaborationThreadSchema,
  CollaborationMessageSchema,
  AddMessageToThreadSchema,
  DesignFeedbackSchema,
  CreateDesignFeedbackSchema,
  DigitalFileFormatSchema,
  LabNotificationPreferencesSchema,
  ScanTypeSchema,
  isValidStatusTransition,
  isActiveStatus,
  didQCPass,
  calculateSLADeadline,
  type ScanType,
  type LabCaseStatus,
  type LabCasePriority,
  type LabCase,
  type LabSLATracking,
  type LabEvent,
  type LabCaseStatusChangedEvent,
  type LabCaseSLABreachEvent,
  type LabCaseReadyForPickupEvent,
  type LabPerformanceMetrics,
  type SLAOverallStatus,
  type CreateLabCase,
  type UpdateLabCase,
  type LabCaseQueryFilters,
  type LabCasePagination,
  type LabCaseListResponse,
  type DigitalScan,
  type CreateDigitalScan,
  type CADDesign,
  type CreateCADDesign,
  type ApproveDesign,
  type FabricationRecord,
  type CreateFabricationRecord,
  type QCInspection,
  type CreateQCInspection,
  type TryInRecord,
  type CreateTryInRecord,
  type StatusHistoryEntry,
  type CollaborationThread,
  type CreateCollaborationThread,
  type CollaborationMessage,
  type AddMessageToThread,
  type DesignFeedback,
  type CreateDesignFeedback,
  type DigitalFileFormat,
  type LabNotificationPreferences,
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
// Pipedrive CRM Schemas
// =============================================================================
export {
  // Core Pipedrive types
  PipedriveDealStatusSchema,
  PipedriveActivityTypeSchema,
  PipedriveVisibilitySchema,
  // Phone/Email value objects
  PipedrivePhoneSchema,
  PipedriveEmailSchema,
  // Person (Contact)
  PipedrivePersonSchema,
  PipedriveCreatePersonInputSchema,
  PipedriveUpdatePersonInputSchema,
  // Organization
  PipedriveOrganizationSchema,
  // Deal
  PipedriveDealSchema,
  PipedriveCreateDealInputSchema,
  PipedriveUpdateDealInputSchema,
  // Activity (Task)
  PipedriveActivitySchema,
  PipedriveCreateActivityInputSchema,
  PipedriveUpdateActivityInputSchema,
  // Note
  PipedriveNoteSchema,
  PipedriveCreateNoteInputSchema,
  // Pipeline & Stages
  PipedrivePipelineSchema,
  PipedriveStageSchema,
  // User (Owner)
  PipedriveUserSchema,
  // API Response wrappers
  PipedriveApiResponseSchema,
  PipedrivePaginatedResponseSchema,
  // Webhook
  PipedriveWebhookMetaSchema,
  PipedriveWebhookPayloadSchema,
  // Search
  PipedriveSearchResultItemSchema,
  PipedriveSearchResponseSchema,
  // Config
  PipedriveClientConfigSchema,
  PipedriveFieldMappingSchema,
  PipedriveHealthStatusSchema,
  // Types
  type PipedriveDealStatus,
  type PipedriveActivityType,
  type PipedriveVisibility,
  type PipedrivePhone,
  type PipedriveEmail,
  type PipedrivePerson,
  type PipedriveCreatePersonInput,
  type PipedriveUpdatePersonInput,
  type PipedriveOrganization,
  type PipedriveDeal,
  type PipedriveCreateDealInput,
  type PipedriveUpdateDealInput,
  type PipedriveActivity,
  type PipedriveCreateActivityInput,
  type PipedriveUpdateActivityInput,
  type PipedriveNote,
  type PipedriveCreateNoteInput,
  type PipedrivePipeline,
  type PipedriveStage,
  type PipedriveUser,
  type PipedriveWebhookMeta,
  type PipedriveWebhookPayload,
  type PipedriveSearchResultItem,
  type PipedriveSearchResponse,
  type PipedriveClientConfig,
  type PipedriveFieldMapping,
  type PipedriveHealthStatus,
} from './pipedrive.schema.js';

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
  // Queue breach events
  QueueBreachDetectedEventSchema,
  QueueBreachResolvedEventSchema,
  QueueBreachEscalatedEventSchema,
  QueueBreachAcknowledgedEventSchema,
  QueueBreachAlertSentEventSchema,
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
  // Queue breach event types
  type QueueBreachDetectedEvent,
  type QueueBreachResolvedEvent,
  type QueueBreachEscalatedEvent,
  type QueueBreachAcknowledgedEvent,
  type QueueBreachAlertSentEvent,
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
// IP Geolocation & Security Alerts Schemas (L5 Feature)
// =============================================================================
export {
  // Core Types
  GeoCoordinatesSchema,
  GeoLocationSchema,
  LocationHistoryEntrySchema,
  // Anomaly Detection
  GeoAlertSeveritySchema,
  GeoAnomalyTypeSchema,
  GeoAlertStatusSchema,
  ImpossibleTravelDetailsSchema,
  GeoAnomalyAlertSchema,
  // Configuration
  GeoAnomalyConfigSchema,
  ClinicGeoConfigSchema,
  // Request/Response
  ResolveGeoLocationRequestSchema,
  ResolveGeoLocationResponseSchema,
  CheckGeoAnomalyRequestSchema,
  CheckGeoAnomalyResponseSchema,
  GeoAlertQueryFiltersSchema,
  GeoAlertQueryResultSchema,
  UpdateGeoAlertStatusSchema,
  // Events
  GeoAnomalyDetectedEventSchema,
  GeoAlertStatusChangedEventSchema,
  GeoAccessBlockedEventSchema,
  // Dashboard/Statistics
  GeoAccessDistributionSchema,
  GeoAlertStatsSchema,
  GeoDashboardDataSchema,
  // Helper Functions
  calculateDistanceKm,
  calculateRequiredSpeed,
  isImpossibleTravel,
  getAnomalySeverity,
  getRecommendedAction,
  getAnomalyDescription,
  // Types
  type GeoCoordinates,
  type GeoLocation,
  type LocationHistoryEntry,
  type GeoAlertSeverity,
  type GeoAnomalyType,
  type GeoAlertStatus,
  type ImpossibleTravelDetails,
  type GeoAnomalyAlert,
  type GeoAnomalyConfig,
  type ClinicGeoConfig,
  type ResolveGeoLocationRequest,
  type ResolveGeoLocationResponse,
  type CheckGeoAnomalyRequest,
  type CheckGeoAnomalyResponse,
  type GeoAlertQueryFilters,
  type GeoAlertQueryResult,
  type UpdateGeoAlertStatus,
  type GeoAnomalyDetectedEvent,
  type GeoAlertStatusChangedEvent,
  type GeoAccessBlockedEvent,
  type GeoAccessDistribution,
  type GeoAlertStats,
  type GeoDashboardData,
} from './schemas/geolocation.js';
// GDPR Article 30 Compliance Reporting Schemas (L10)
// =============================================================================
export {
  // Enums
  Article30LegalBasisSchema,
  Article30DataCategorySchema,
  Article30DataSubjectTypeSchema,
  Article30RecipientTypeSchema,
  Article30TransferSafeguardSchema,
  Article30ReportStatusSchema,
  Article30ReportFrequencySchema,
  Article30ExportFormatSchema,
  // Data Structures
  Article30DataRecipientSchema,
  Article30ProcessingActivitySchema,
  Article30ControllerInfoSchema,
  Article30ConsentSummarySchema,
  Article30DataBreachSummarySchema,
  Article30DSRSummarySchema,
  // Main Report Schema
  Article30ReportSchema,
  // Request/Config Schemas
  GenerateArticle30ReportRequestSchema,
  Article30ScheduledReportConfigSchema,
  Article30CronJobPayloadSchema,
  // Event Schemas
  Article30ReportGeneratedEventSchema,
  Article30ReportApprovedEventSchema,
  // Helper Functions
  getLegalBasisLabel,
  getDataCategoryLabel,
  activityNeedsReview,
  calculateReportStatistics,
  // Types
  type Article30LegalBasis,
  type Article30DataCategory,
  type Article30DataSubjectType,
  type Article30RecipientType,
  type Article30TransferSafeguard,
  type Article30ReportStatus,
  type Article30ReportFrequency,
  type Article30ExportFormat,
  type Article30DataRecipient,
  type Article30ProcessingActivity,
  type Article30ControllerInfo,
  type Article30ConsentSummary,
  type Article30DataBreachSummary,
  type Article30DSRSummary,
  type Article30Report,
  type GenerateArticle30ReportRequest,
  type Article30ScheduledReportConfig,
  type Article30CronJobPayload,
  type Article30ReportGeneratedEvent,
  type Article30ReportApprovedEvent,
} from './article30.schema.js';
// Data Classification Schemas (L6 Feature)
// =============================================================================
export {
  // Sensitivity & Compliance
  DataSensitivityLevelSchema,
  ComplianceFrameworkSchema,
  DataCategorySchema,
  EncryptionRequirementSchema,
  RetentionCategorySchema,
  // Column Classification
  ColumnClassificationSchema,
  // Table Classification
  TableClassificationSchema,
  CreateTableClassificationSchema,
  UpdateTableClassificationSchema,
  // Query
  ClassificationQueryFiltersSchema,
  // Reports
  ClassificationSummarySchema,
  ComplianceGapSchema,
  ClassificationComplianceReportSchema,
  // Database Record
  DataClassificationRecordSchema,
  // Constants
  DEFAULT_PII_COLUMN_PATTERNS,
  DEFAULT_PHI_COLUMN_PATTERNS,
  SENSITIVITY_PRECEDENCE,
  // Helper Functions
  getHighestSensitivity,
  isPiiColumnName,
  isPhiColumnName,
  getRequiredFrameworks,
  // Types
  type DataSensitivityLevel,
  type ComplianceFramework,
  type DataCategory,
  type EncryptionRequirement,
  type RetentionCategory,
  type ColumnClassification,
  type TableClassification,
  type CreateTableClassification,
  type UpdateTableClassification,
  type ClassificationQueryFilters,
  type ClassificationSummary,
  type ComplianceGap,
  type ClassificationComplianceReport,
  type DataClassificationRecord,
} from './schemas/data-classification.js';
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

// =============================================================================
// Queue Event Validation Schemas
// =============================================================================
export {
  // Enums
  QueueBreachTypeSchema,
  QueueBreachSeveritySchema,
  QueueEventStatusSchema,
  QueueActionTypeSchema,
  QueueEventFailureReasonSchema,
  // Event Payload
  QueueEventPayloadSchema,
  CreateQueueEventSchema,
  UpdateQueueEventSchema,
  // Action Request
  QueueActionRequestSchema,
  // Result Schemas
  QueueEventSuccessResultSchema,
  QueueEventFailureResultSchema,
  QueueEventResultSchema,
  // Batch Processing
  BatchQueueEventRequestSchema,
  BatchQueueEventItemResultSchema,
  BatchQueueEventResultSchema,
  // Statistics
  QueueBreachStatsSchema,
  // Helper Functions
  parseQueueEventPayload,
  createQueueEventSuccess,
  createQueueEventFailure,
  isBreachCritical,
  calculateBreachDuration,
  // Types
  type QueueBreachType,
  type QueueBreachSeverity,
  type QueueEventStatus,
  type QueueEventPayload,
  type CreateQueueEvent,
  type UpdateQueueEvent,
  type QueueActionType,
  type QueueActionRequest,
  type QueueEventSuccessResult,
  type QueueEventFailureReason,
  type QueueEventFailureResult,
  type QueueEventResult,
  type BatchQueueEventRequest,
  type BatchQueueEventItemResult,
  type BatchQueueEventResult,
  type QueueBreachStats,
} from './schemas/queue.js';

// =============================================================================
// Ads Conversion Tracking Schemas (Pipedrive → Facebook/Google)
// =============================================================================
export {
  // Platform & Event Types
  AdsPlatformSchema,
  ConversionEventTypeSchema,
  ConversionStatusSchema,
  // User Data
  UserDataSchema,
  // Conversion Event
  ConversionEventSchema,
  // Facebook Conversions API
  FacebookConversionEventSchema,
  FacebookConversionBatchSchema,
  FacebookConversionResponseSchema,
  // Google Ads Offline Conversions
  GoogleConversionActionTypeSchema,
  GoogleClickConversionSchema,
  GoogleCallConversionSchema,
  GoogleConversionUploadRequestSchema,
  GoogleConversionUploadResponseSchema,
  // Tracking Record
  ConversionTrackingRecordSchema,
  // Configuration
  FacebookConversionConfigSchema,
  GoogleConversionConfigSchema,
  AdsConversionConfigSchema,
  // Workflow Payloads
  AdsConversionWorkflowPayloadSchema,
  AdsConversionWorkflowResultSchema,
  // Domain Events
  AdsConversionSentEventSchema,
  AdsConversionFailedEventSchema,
  // Helper Functions
  generateConversionEventId,
  toGoogleAdsDateTime,
  isGoogleClickId,
  isFacebookClickId,
  detectClickIdType,
  mapDealStatusToConversionEvent,
  // Types
  type AdsPlatform,
  type ConversionEventType,
  type ConversionStatus,
  type UserData,
  type ConversionEvent,
  type FacebookConversionEvent,
  type FacebookConversionBatch,
  type FacebookConversionResponse,
  type GoogleConversionActionType,
  type GoogleClickConversion,
  type GoogleCallConversion,
  type GoogleConversionUploadRequest,
  type GoogleConversionUploadResponse,
  type ConversionTrackingRecord,
  type FacebookConversionConfig,
  type GoogleConversionConfig,
  type AdsConversionConfig,
  type AdsConversionWorkflowPayload,
  type AdsConversionWorkflowResult,
  type AdsConversionSentEvent,
  type AdsConversionFailedEvent,
} from './ads-conversion.schema.js';

// =============================================================================
// Compliance Matrix Schemas
// =============================================================================
export {
  // Status & Category Enums
  ComplianceStatusSchema,
  ConstraintCategorySchema,
  ConstraintSeveritySchema,
  // Constraint Definition
  ConstraintDefinitionSchema,
  CreateConstraintDefinitionSchema,
  UpdateConstraintDefinitionSchema,
  // Work Items
  ComplianceWorkItemSchema,
  // Sprint Compliance
  SprintComplianceEntrySchema,
  CreateSprintComplianceEntrySchema,
  UpdateSprintComplianceEntrySchema,
  // Sprint Definition
  SprintDefinitionSchema,
  // Full Matrix
  ComplianceMatrixSchema,
  // Query
  ComplianceQueryFiltersSchema,
  // Reports
  SprintComplianceSummarySchema,
  CategoryComplianceSummarySchema,
  ConstraintAttentionItemSchema,
  ComplianceMatrixReportSchema,
  // Events
  ComplianceStatusChangedEventSchema,
  CriticalViolationDetectedEventSchema,
  ComplianceTargetMissedEventSchema,
  // Constants
  DEFAULT_MEDICALCOR_CONSTRAINTS,
  COMPLIANCE_STATUS_DISPLAY,
  CONSTRAINT_CATEGORY_DISPLAY,
  // Helper Functions
  calculateCompliancePercentage,
  determineComplianceTrend,
  requiresImmediateAttention,
  calculateDaysFromTarget,
  getSeverityWeight,
  sortByPriority,
  // Types
  type ComplianceStatus,
  type ConstraintCategory,
  type ConstraintSeverity,
  type ConstraintDefinition,
  type CreateConstraintDefinition,
  type UpdateConstraintDefinition,
  type ComplianceWorkItem,
  type SprintComplianceEntry,
  type CreateSprintComplianceEntry,
  type UpdateSprintComplianceEntry,
  type SprintDefinition,
  type ComplianceMatrix,
  type ComplianceQueryFilters,
  type SprintComplianceSummary,
  type CategoryComplianceSummary,
  type ConstraintAttentionItem,
  type ComplianceMatrixReport,
  type ComplianceStatusChangedEvent,
  type CriticalViolationDetectedEvent,
  type ComplianceTargetMissedEvent,
} from './schemas/compliance-matrix.js';

// =============================================================================
// Dental Lab Production Schemas
// =============================================================================
export {
  // Constants
  LAB_CASE_STATUSES,
  LAB_CASE_PRIORITIES,
  PROSTHETIC_TYPES,
  PROSTHETIC_MATERIALS,
  SHADE_SYSTEMS,
  FDI_TOOTH_NUMBERS,
  SCAN_TYPES,
  DIGITAL_FILE_FORMATS,
  SCAN_QUALITY_LEVELS,
  FABRICATION_METHODS,
  CAD_SOFTWARE,
  OCCLUSAL_SCHEMES,
  MARGIN_TYPES,
  CONTACT_TYPES,
  IMPLANT_CONNECTION_TYPES,
  ABUTMENT_TYPES,
  DESIGN_APPROVAL_STATUSES,
  DESIGN_FEEDBACK_TYPES,
  COLLABORATION_ROLES,
  ORGANIZATIONS,
  THREAD_STATUSES,
  MESSAGE_TYPES,
  SLA_TYPES,
  SLA_MILESTONE_STATUSES,
  SLA_OVERALL_STATUSES,
  ADJUSTMENT_TYPES,
  ANNOTATION_TYPES,
  QC_CRITERIA,
  PERFORMANCE_TRENDS,
  // Enum Schemas
  LabCaseStatusSchema,
  LabCasePrioritySchema,
  ProstheticTypeSchema,
  ProstheticMaterialSchema,
  ShadeSystemSchema,
  FDIToothNumberSchema,
  ScanTypeSchema,
  DigitalFileFormatSchema,
  ScanQualitySchema,
  FabricationMethodSchema,
  CADSoftwareSchema,
  OcclusalSchemeSchema,
  MarginTypeSchema,
  ContactTypeSchema,
  ImplantConnectionTypeSchema,
  AbutmentTypeSchema,
  DesignApprovalStatusSchema,
  DesignFeedbackTypeSchema,
  CollaborationRoleSchema,
  OrganizationSchema,
  ThreadStatusSchema,
  MessageTypeSchema,
  SLATypeSchema,
  SLAMilestoneStatusSchema,
  SLAOverallStatusSchema,
  AdjustmentTypeSchema,
  AnnotationTypeSchema,
  QCCriterionSchema,
  PerformanceTrendSchema,
  // Entity Schemas
  ProstheticSpecSchema,
  ImplantComponentSpecSchema,
  DigitalScanSchema,
  CreateDigitalScanSchema,
  CADDesignSchema,
  CreateCADDesignSchema,
  ApproveDesignSchema,
  FabricationRecordSchema,
  CreateFabricationRecordSchema,
  QCCriteriaResultSchema,
  QCInspectionSchema,
  CreateQCInspectionSchema,
  AdjustmentRequestSchema,
  TryInRecordSchema,
  CreateTryInRecordSchema,
  StatusHistoryEntrySchema,
  LabCaseSchema,
  CreateLabCaseSchema,
  UpdateLabCaseSchema,
  TransitionLabCaseStatusSchema,
  // Collaboration Schemas
  MessageSenderSchema,
  MessageAttachmentSchema,
  MessageReferenceSchema,
  CollaborationMessageSchema,
  ThreadParticipantSchema,
  CollaborationThreadSchema,
  CreateCollaborationThreadSchema,
  AddMessageToThreadSchema,
  DesignAnnotationSchema,
  CriteriaScoreSchema,
  DesignFeedbackSchema,
  CreateDesignFeedbackSchema,
  // SLA & Metrics Schemas
  SLAMilestoneSchema,
  LabSLATrackingSchema,
  LabPerformanceMetricsSchema,
  LabNotificationPreferencesSchema,
  // Query & Filter Schemas
  LabCaseQueryFiltersSchema,
  LabCasePaginationSchema,
  LabCaseListResponseSchema,
  // Event Schemas
  LabCaseStatusChangedEventSchema,
  LabCaseSLABreachEventSchema,
  DesignReviewRequiredEventSchema,
  QCInspectionCompletedEventSchema,
  LabCaseReadyForPickupEventSchema,
  LabEventSchema,
  // Workflow Payload Schemas
  MonitorSLAWorkflowPayloadSchema,
  CalculatePerformanceMetricsPayloadSchema,
  SendStatusNotificationPayloadSchema,
  // Helper Functions
  isValidStatusTransition,
  getSLAHours,
  calculateSLADeadline,
  isActiveStatus,
  isDesignPhase,
  isFabricationPhase,
  calculateQCScore,
  didQCPass,
  getDaysUntilDue,
  isCaseOverdue,
  getPriorityMultiplier,
  formatCaseNumber,
  generateCaseSummary,
  // Types
  type LabCaseStatus,
  type LabCasePriority,
  type ProstheticType,
  type ProstheticMaterial,
  type ShadeSystem,
  type FDIToothNumber,
  type ScanType,
  type DigitalFileFormat,
  type ScanQuality,
  type FabricationMethod,
  type CADSoftware,
  type OcclusalScheme,
  type MarginType,
  type ContactType,
  type ImplantConnectionType,
  type AbutmentType,
  type DesignApprovalStatus,
  type DesignFeedbackType,
  type CollaborationRole,
  type Organization,
  type ThreadStatus,
  type MessageType,
  type SLAType,
  type SLAMilestoneStatus,
  type SLAOverallStatus,
  type AdjustmentType,
  type AnnotationType,
  type QCCriterion,
  type PerformanceTrend,
  type ProstheticSpec,
  type ImplantComponentSpec,
  type DigitalScan,
  type CreateDigitalScan,
  type CADDesign,
  type CreateCADDesign,
  type ApproveDesign,
  type FabricationRecord,
  type CreateFabricationRecord,
  type QCCriteriaResult,
  type QCInspection,
  type CreateQCInspection,
  type AdjustmentRequest,
  type TryInRecord,
  type CreateTryInRecord,
  type StatusHistoryEntry,
  type LabCase,
  type CreateLabCase,
  type UpdateLabCase,
  type TransitionLabCaseStatus,
  type MessageSender,
  type MessageAttachment,
  type MessageReference,
  type CollaborationMessage,
  type ThreadParticipant,
  type CollaborationThread,
  type CreateCollaborationThread,
  type AddMessageToThread,
  type DesignAnnotation,
  type CriteriaScore,
  type DesignFeedback,
  type CreateDesignFeedback,
  type SLAMilestone,
  type LabSLATracking,
  type LabPerformanceMetrics,
  type LabNotificationPreferences,
  type LabCaseQueryFilters,
  type LabCasePagination,
  type LabCaseListResponse,
  type LabCaseStatusChangedEvent,
  type LabCaseSLABreachEvent,
  type DesignReviewRequiredEvent,
  type QCInspectionCompletedEvent,
  type LabCaseReadyForPickupEvent,
  type LabEvent,
  type MonitorSLAWorkflowPayload,
  type CalculatePerformanceMetricsPayload,
  type SendStatusNotificationPayload,
} from './schemas/dental-lab.js';
