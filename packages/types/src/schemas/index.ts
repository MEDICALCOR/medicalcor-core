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
} from './geolocation.js';
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
} from './data-classification.js';
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
} from './breach-notification.js';
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
} from './queue.js';

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
} from './compliance-matrix.js';

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
} from './dental-lab.js';

// =============================================================================
// Orchestration Schemas (Multi-Agent Coordination)
// =============================================================================
export {
  // Agent Codenames & Roles
  AgentCodenameSchema,
  // Task Complexity & Risk
  TaskComplexitySchema,
  RiskLevelSchema,
  // Quality Gates
  QualityGateSchema,
  QualityGateStatusSchema,
  QualityGateResultSchema,
  // Task Analysis
  TaskAnalysisSchema,
  // Agent Directives & Reports
  TaskPrioritySchema,
  ReportingFrequencySchema,
  AgentDirectiveSchema,
  AgentTaskStatusSchema,
  FindingSchema,
  RecommendationSchema,
  BlockerSchema,
  AgentReportSchema,
  // Conflict Resolution
  ConflictTypeSchema,
  ConflictResolutionSchema,
  // Orchestration Session
  OrchestrationStatusSchema,
  OrchestrationSessionSchema,
  // Events
  OrchestrationEventTypeSchema,
  OrchestrationEventBaseSchema,
  SessionStartedEventSchema,
  TaskAnalyzedEventSchema,
  AgentDispatchedEventSchema,
  AgentCompletedEventSchema,
  QualityGateCheckedEventSchema,
  ConflictDetectedEventSchema,
  SessionCompletedEventSchema,
  // Request/Response
  CreateOrchestrationSessionSchema,
  OrchestrationReportSchema,
  // Constants
  AGENT_PRIORITY,
  TASK_TYPE_QUALITY_GATES,
  TASK_TYPE_ROUTING,
  // Helper Functions
  getConflictResolver,
  hasHigherPriority,
  allQualityGatesPassed,
  getRequiredQualityGates,
  getTaskRouting,
  // Types
  type AgentCodename,
  type TaskComplexity,
  type RiskLevel,
  type QualityGate,
  type QualityGateStatus,
  type QualityGateResult,
  type TaskAnalysis,
  type TaskPriority,
  type ReportingFrequency,
  type AgentDirective,
  type AgentTaskStatus,
  type Finding,
  type Recommendation,
  type Blocker,
  type AgentReport,
  type ConflictType,
  type ConflictResolution,
  type OrchestrationStatus,
  type OrchestrationSession,
  type OrchestrationEventType,
  type SessionStartedEvent,
  type TaskAnalyzedEvent,
  type AgentDispatchedEvent,
  type AgentCompletedEvent,
  type QualityGateCheckedEvent,
  type ConflictDetectedEvent,
  type SessionCompletedEvent,
  type CreateOrchestrationSession,
  type OrchestrationReport,
} from './orchestration.js';
