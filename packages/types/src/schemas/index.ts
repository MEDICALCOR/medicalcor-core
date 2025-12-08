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
// Agent Skills & Skill-Based Routing Schemas (H6)
// =============================================================================
export {
  // Skill Categories & Definitions
  SkillCategorySchema,
  ProficiencyLevelSchema,
  PROFICIENCY_WEIGHTS,
  SkillSchema,
  AgentSkillSchema,
  // Agent Profile
  AgentAvailabilitySchema,
  AgentProfileSchema,
  // Skill Requirements
  SkillMatchTypeSchema,
  SkillRequirementSchema,
  TaskSkillRequirementsSchema,
  // Routing Rules
  RoutingStrategySchema,
  FallbackBehaviorSchema,
  RoutingRuleSchema,
  // Routing Results
  AgentMatchScoreSchema,
  RoutingDecisionSchema,
  // Configuration
  SkillRoutingConfigSchema,
  // Standard Skills
  STANDARD_SKILLS,
  // Types
  type SkillCategory,
  type ProficiencyLevel,
  type Skill,
  type AgentSkill,
  type AgentAvailability,
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
} from './agent-skills.js';
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
// NPS (Net Promoter Score) Schemas (M11 Milestone)
// =============================================================================
export {
  // Score & Classification
  NPSScoreSchema,
  NPSClassificationSchema,
  NPSSurveyStatusSchema,
  NPSTriggerTypeSchema,
  NPSSurveyChannelSchema,
  // Survey Request/Response
  NPSSurveyRequestSchema,
  NPSResponseSchema,
  NPSSurveyRecordSchema,
  // Workflow Payloads
  NPSCollectionPayloadSchema,
  NPSResponseProcessingPayloadSchema,
  NPSFollowUpPayloadSchema,
  // Analytics
  NPSScoreDistributionSchema,
  NPSSummaryStatsSchema,
  NPSTrendPointSchema,
  NPSDashboardDataSchema,
  // Helper Functions
  classifyNPSScore,
  calculateNPS,
  requiresImmediateFollowUp,
  getFollowUpPriority,
  // Types
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
} from './nps.js';

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
} from './pltv.js';
// Cohort LTV (Lifetime Value) Analysis Schemas (M7 Milestone)
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
} from './cohort-ltv.js';

// =============================================================================
// Collections & Overdue Payment Schemas (M5 Milestone)
// =============================================================================
export {
  // Status & Levels
  InstallmentStatusSchema,
  ReminderLevelSchema,
  // Core Schemas
  OverdueInstallmentSchema,
  ReminderConfigSchema,
  PaymentReminderPayloadSchema,
  OverdueDetectionResultSchema,
  // Events
  PaymentReminderSentEventSchema,
  CollectionEscalatedEventSchema,
  // Helper Functions
  determineReminderLevel,
  getReminderTemplateName,
  shouldSendReminder,
  calculateLateFee,
  formatCurrencyForReminder,
  formatDateForReminder,
  // Types
  type InstallmentStatus,
  type ReminderLevel,
  type OverdueInstallment,
  type ReminderConfig,
  type PaymentReminderPayload,
  type OverdueDetectionResult,
  type PaymentReminderSentEvent,
  type CollectionEscalatedEvent,
} from './collections.js';

// =============================================================================
// Follow-up Scheduling Schemas (M9 Milestone)
// =============================================================================
export {
  // Status & Type Enums
  FollowUpTaskStatusSchema,
  FollowUpTaskTypeSchema,
  FollowUpTaskPrioritySchema,
  FollowUpChannelSchema,
  // Core Entity
  FollowUpTaskSchema,
  // Input Schemas
  CreateFollowUpTaskSchema,
  UpdateFollowUpTaskSchema,
  SnoozeFollowUpTaskSchema,
  CompleteFollowUpTaskSchema,
  RecordFollowUpAttemptSchema,
  // Configuration
  FollowUpSchedulingConfigSchema,
  // Query Schemas
  FollowUpTaskFiltersSchema,
  FollowUpTaskPaginationSchema,
  FollowUpTaskPaginatedResultSchema,
  // Workflow Payloads
  FollowUpTaskCreationPayloadSchema,
  FollowUpReminderPayloadSchema,
  ProcessDueFollowUpsPayloadSchema,
  // Events
  FollowUpTaskCreatedEventSchema,
  FollowUpTaskCompletedEventSchema,
  FollowUpTaskOverdueEventSchema,
  FollowUpTaskSnoozedEventSchema,
  FollowUpReminderSentEventSchema,
  // Analytics
  FollowUpTaskSummarySchema,
  AgentFollowUpPerformanceSchema,
  // Helper Functions
  calculateDueDate,
  getPriorityForLeadScore,
  isTaskOverdue,
  canSnoozeTask,
  canAttemptTask,
  getNextBusinessDay,
  adjustToBusinessHours,
  getFollowUpTypeForDisposition,
  // Types
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
} from './followup-scheduling.js';
// Agent Presence Schemas (M2 Milestone)
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
} from './agent-presence.js';

// =============================================================================
// Revenue Forecasting Schemas
// =============================================================================
export {
  // Method & Classification
  ForecastMethodSchema,
  ForecastConfidenceLevelSchema,
  ForecastGranularitySchema,
  RevenueTrendSchema,
  // Historical Data
  HistoricalRevenuePointSchema,
  HistoricalRevenueInputSchema,
  // Configuration
  SeasonalFactorsSchema,
  ForecastConfigSchema,
  // Output
  ForecastConfidenceIntervalSchema,
  ForecastedRevenuePointSchema,
  ModelFitStatisticsSchema,
  TrendAnalysisSchema,
  RevenueForecastOutputSchema,
  // Request/Response
  GenerateRevenueForecastRequestSchema,
  RevenueForecastResponseSchema,
  BatchRevenueForecastRequestSchema,
  BatchRevenueForecastResultSchema,
  // Analytics
  ForecastAccuracyPointSchema,
  ForecastAccuracyAnalysisSchema,
  // Events
  RevenueForecastGeneratedEventSchema,
  RevenueGrowthDetectedEventSchema,
  RevenueDeclineAlertEventSchema,
  // Types
  type ForecastMethod,
  type ForecastConfidenceLevel,
  type ForecastGranularity,
  type RevenueTrend,
  type HistoricalRevenuePoint,
  type HistoricalRevenueInput,
  type SeasonalFactors,
  type ForecastConfig,
  type ForecastConfidenceInterval,
  type ForecastedRevenuePoint,
  type ModelFitStatistics,
  type TrendAnalysis,
  type RevenueForecastOutput,
  type GenerateRevenueForecastRequest,
  type RevenueForecastResponse,
  type BatchRevenueForecastRequest,
  type BatchRevenueForecastResult,
  type ForecastAccuracyPoint,
  type ForecastAccuracyAnalysis,
  type RevenueForecastGeneratedEvent,
  type RevenueGrowthDetectedEvent,
  type RevenueDeclineAlertEvent,
} from './revenue-forecast.js';
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
} from './financing.js';
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
} from './invoice-generation.js';

// =============================================================================
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
} from './index-usage.js';
