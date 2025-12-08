/**
 * @fileoverview Domain Package Exports
 *
 * Central export point for all domain services, types, and utilities.
 * Banking/Medical Grade DDD Architecture for Dental OS.
 *
 * @module @medicalcor/domain
 *
 * ## Architecture Overview
 *
 * This package implements Domain-Driven Design (DDD) principles:
 *
 * ### Bounded Contexts
 * - **Patient Acquisition**: Lead scoring, triage, qualification
 * - **Consent Management**: GDPR compliance, consent tracking
 * - **Clinical Planning**: Scheduling, appointments
 *
 * ### Shared Kernel
 * - **Value Objects**: LeadScore, PhoneNumber (immutable, self-validating)
 * - **Repository Interfaces**: ILeadRepository, ICrmGateway, IAIGateway
 * - **Domain Events**: Strictly typed events for event sourcing
 *
 * ### Legacy Services (being migrated)
 * - ScoringService, TriageService, ConsentService, etc.
 *
 * @example
 * ```typescript
 * import {
 *   // Value Objects (Banking Grade)
 *   LeadScore,
 *   PhoneNumber,
 *
 *   // Repository Interfaces
 *   ILeadRepository,
 *   ICrmGateway,
 *   IAIGateway,
 *
 *   // Use Cases
 *   ScoreLeadUseCase,
 *
 *   // Domain Events
 *   LeadScoredEvent,
 *   LeadQualifiedEvent,
 *
 *   // Legacy Services
 *   createScoringService,
 *   createTriageService,
 * } from '@medicalcor/domain';
 * ```
 */

// ============================================================================
// SHARED KERNEL (Banking/Medical Grade DDD)
// ============================================================================

// Value Objects - Immutable, self-validating domain primitives
export * from './shared-kernel/value-objects/index.js';

// Repository Interfaces - Contracts for persistence & integrations
// Note: Selectively export to avoid conflicts with language service types
export {
  // Lead Repository
  type Lead,
  type LeadSource,
  type LeadStatus,
  type ConversationEntry,
  type CreateLeadInput,
  type UpdateLeadInput,
  type LeadSpecification,
  type LeadByScoreSpec,
  type LeadByStatusSpec,
  type LeadNeedingFollowUpSpec,
  type LeadBySourceSpec,
  type LeadSpec,
  type ILeadRepository,
  type LeadRepositoryResult,
  type LeadRepositoryError,
  type LeadRepositoryErrorCode,
  type QueryOptions,
  type ScoringMetadata,
  type TransactionContext,
  hotLeadsSpec,
  needsFollowUpSpec,
  byStatusSpec,
  bySourceSpec,
} from './shared-kernel/repository-interfaces/lead-repository.js';

export {
  // CRM Gateway
  type CrmContact,
  type CreateCrmContactInput,
  type UpdateCrmContactInput,
  type CrmDeal,
  type CreateCrmDealInput,
  type CrmTask,
  type CreateCrmTaskInput,
  type CrmNote,
  type CreateCrmNoteInput,
  type ICrmGateway,
  type CrmGatewayResult,
  type CrmGatewayError,
  type CrmGatewayErrorCode,
  type ScoreUpdateMetadata,
  type CrmPipeline,
  type CrmPipelineStage,
  type CrmOwner,
  type CrmHealthStatus,
  rateLimitedError,
  connectionError,
  notFoundError,
} from './shared-kernel/repository-interfaces/crm-gateway.js';

export {
  // AI Gateway (with renamed types to avoid conflicts)
  type LeadScoringContext,
  type MessageEntry,
  type AIScoringResult,
  type LanguageDetectionRequest as AILanguageDetectionRequest,
  type LanguageDetectionResult as AILanguageDetectionResult,
  type TranslationRequest as AITranslationRequest,
  type TranslationResult as AITranslationResult,
  type ConversationResponseRequest,
  type ConversationResponseResult,
  type TranscriptionRequest,
  type TranscriptionResult,
  type TranscriptionSegment,
  type IAIGateway,
  type AIGatewayResult,
  type AIGatewayError,
  type AIGatewayErrorCode,
  type SentimentAnalysisResult,
  type AIHealthStatus,
  type AIUsageStats,
  aiRateLimitedError,
  aiQuotaExceededError,
  aiModelUnavailableError,
  aiContentFilteredError,
} from './shared-kernel/repository-interfaces/ai-gateway.js';

// Domain Events - Strictly typed events for event sourcing
export * from './shared-kernel/domain-events/index.js';

// ============================================================================
// BOUNDED CONTEXTS
// ============================================================================

// Patient Acquisition Context - Lead scoring, triage, qualification
export * from './patient-acquisition/index.js';

// Leads Context - Lead Aggregate Root (H7 DDD Consolidation)
// The Lead aggregate root provides rich domain methods and event sourcing support
export {
  // Lead Aggregate Root
  LeadAggregateRoot,
  type LeadAggregateState,
  type LeadDomainEvent,
  type CreateLeadParams,
  // Lead Factory
  LeadFactory,
  leadFactory,
  type LeadAggregateSnapshot,
  type LeadSnapshotState,
  type SerializedConversationEntry,
  // Lead Errors
  LeadError,
  LeadDeletedError,
  LeadClosedError,
  LeadAlreadyConvertedError,
  LeadLostError,
  InvalidStatusTransitionError,
} from './leads/index.js';

// Patients Context - Patient Aggregate Root (M3 Lead → Patient Transition)
// The Patient aggregate root models the full patient lifecycle after lead conversion
export {
  // Patient Aggregate Root
  PatientAggregateRoot,
  type PatientAggregateState,
  type PatientDomainEvent,
  type MedicalHistoryEntry,
  type AllergyRecord,
  type TreatmentPlanReference,
  type AppointmentReference,
  type InsuranceInfo,
  type ConsentRecord,
  type ProviderAssignment,
  type PatientPreferences,
  type FromLeadConversionParams,
  type CreatePatientParams,
  type StartTreatmentParams,
  type CompleteTreatmentParams,
  type ScheduleAppointmentParams,
  type UpdateDemographicsParams,
  // Patient Factory
  PatientFactory,
  patientFactory,
  type PatientAggregateSnapshot,
  type PatientSnapshotState,
  type PatientRecord,
  // Patient Status Types
  type PatientStatus,
  type CommunicationChannel,
  // Patient Errors
  PatientError,
  PatientDeletedError,
  PatientArchivedError,
  PatientNotActiveError,
  InvalidPatientStatusTransitionError,
} from './patients/index.js';

// AllOnX Context - ONE STEP ALL ON X dental implant case management
// Full-arch rehabilitation (All-on-4, All-on-6) procedures
// Example: import { AllOnXClinicalScore, calculateScore } from '@medicalcor/domain/allonx';
export {
  // Core Value Object
  AllOnXClinicalScore,
  InvalidAllOnXScoreError,
  isAllOnXClinicalScore,

  // Entity
  createAllOnXCase,

  // Types - prefixed to avoid conflicts
  type AllOnXClinicalIndicators,
  type AllOnXClinicalScoreDTO,
  type AllOnXEligibility,
  type AllOnXRiskLevel,
  type AllOnXComplexity,
  type AllOnXTreatmentRecommendation,
  type AllOnXProcedureType,
  type AllOnXCase,
  type AllOnXCaseStatus,
  type AllOnXScoringResult,
  type AllOnXRiskFlag,
  type TreatmentPlanningResult,
  type IAllOnXCaseRepository,
} from './allonx/index.js';

// ============================================================================
// LEGACY DOMAIN SERVICES (being migrated to use cases)
// ============================================================================

export * from './scoring/index.js';
export * from './triage/index.js';
export * from './scheduling/index.js';
export * from './consent/index.js';
export * from './language/index.js';

// Voice AI & Supervisor (W3 Milestone)
export * from './voice/index.js';

// Agent Guidance / Call Scripts (M2 Milestone)
export * from './guidance/index.js';

// Cases - Treatment Plans to Payments (H1 Production Fix)
export * from './cases/index.js';

// LTV - Customer Lifetime Value (H2 Production Fix)
export * from './ltv/index.js';

// Disposition - Call Outcome Tracking (M1 Production Fix)
export * from './disposition/index.js';

// Follow-up Scheduling - Post-Disposition Task Scheduling (M9 Feature)
export * from './followup-scheduling/index.js';

// Routing - Skill-Based Agent Routing (H6 Milestone)
export * from './routing/index.js';
// Agent Performance (M7 Milestone)
export * from './agent-performance/index.js';

// Behavioral Insights (M5 Milestone)
export * from './behavioral-insights/index.js';
// Retention Scoring (M8 Milestone)
export * from './retention/index.js';

// Capacity Planning (M12 Milestone)
export * from './capacity-planning/index.js';
// Data Lineage (M15 Milestone)
export * from './data-lineage/index.js';

// Data Classification (L6 Feature)
export * from './data-classification/index.js';
// Breach Notification (L3 Milestone - GDPR Compliance)
export * from './breach-notification/index.js';

// ============================================================================
// SHARED TYPES & UTILITIES
// ============================================================================

// Export shared types from types.ts
export * from './shared/types.js';

// Export schemas and validation helpers, excluding types that conflict
// with the domain service exports above
export {
  // Common schemas
  ContactIdSchema,
  PhoneNumberSchema,
  EmailSchema,
  ISODateStringSchema,
  SupportedLanguageSchema,

  // Consent schemas
  ConsentTypeSchema,
  ConsentStatusSchema,
  ConsentChannelSchema,
  ConsentMethodSchema,
  ConsentSourceSchema,
  ConsentRequestSchema,

  // Scoring schemas
  LeadChannelSchema,
  MessageHistoryEntrySchema,
  UTMParametersSchema,
  AIScoringContextSchema,

  // Triage schemas
  LeadScoreClassificationSchema,
  TriageInputSchema,

  // Scheduling schemas
  TimeSlotSchema,
  DateStringSchema,
  ProcedureTypeSchema,
  AppointmentSlotSchema,
  BookAppointmentRequestSchema,
  AvailableSlotsRequestSchema,

  // Language schemas
  LanguageDetectionRequestSchema,
  TranslationRequestSchema,

  // Helpers
  validateWithResult,
  withValidation,

  // Non-conflicting types from schemas (types that don't exist in domain services)
  type ConsentChannel,
  type ConsentMethod,
  type LeadChannel,
  type MessageHistoryEntry,
  type UTMParameters,
  type AIScoringContext,
  type LeadScoreClassification,
  type DateString,
  type ProcedureType,
  type AppointmentSlot,
  type BookAppointmentRequest,
  type AvailableSlotsRequest,
  type LanguageDetectionRequest,
} from './shared/schemas.js';
