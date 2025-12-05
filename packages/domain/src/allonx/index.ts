/**
 * @fileoverview AllOnX Domain Module
 *
 * AllOnX (ONE STEP ALL ON X) domain module for dental implant procedures.
 * Contains value objects, entities, and services for All-on-4, All-on-6,
 * and hybrid full-arch implant case management.
 *
 * @module domain/allonx
 *
 * CLINICAL CONTEXT:
 * All-on-X (All-on-4, All-on-6) is a full-arch rehabilitation technique
 * that uses tilted posterior implants to maximize bone utilization and
 * often allows immediate loading. This module provides clinical scoring
 * and case management for these procedures.
 *
 * @see ITI Treatment Guide for Implant Dentistry
 * @see European Association for Osseointegration (EAO) Guidelines
 */

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  // AllOnXClinicalScore - Class and Error
  AllOnXClinicalScore,
  InvalidAllOnXScoreError,

  // Type guards and utilities
  isAllOnXClinicalScore,
  isSuccessfulParse,

  // Constants
  CLINICAL_INDICATOR_RANGES,
  ELIGIBILITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,

  // Types
  type AllOnXArchType,
  type AllOnXProcedureType,
  type BoneDensityClass,
  type AllOnXEligibility,
  type AllOnXRiskLevel,
  type AllOnXComplexity,
  type AllOnXTreatmentRecommendation,
  type FollowUpUrgency,
  type ClinicalTaskPriority,
  type SmokingStatus,
  type DiabetesStatus,
  type AllOnXClinicalIndicators,
  type AllOnXClinicalScoreDTO,
  type AllOnXClinicalScoreParseResult,
  type InvalidAllOnXScoreErrorDetails,
  type ValidatedBoneDensity,
  type ValidatedHbA1c,
  type ValidatedCompositeScore,
  type ValidatedConfidence,
} from './value-objects/index.js';

// ============================================================================
// ENTITIES
// ============================================================================

export {
  // AllOnXCase types
  type AllOnXCase,
  type AllOnXCaseStatus,
  type TreatmentPhaseStatus,
  type ImagingType,
  type CasePriority,
  type ImagingRecord,
  type TreatmentPhaseRecord,
  type ConsultationRecord,
  type ImplantRecord,
  type FollowUpRecord,
  type PhysicianReviewRecord,
  type CreateAllOnXCaseInput,
  type UpdateAllOnXCaseInput,

  // Factory functions
  createAllOnXCase,
  generateCaseNumber,

  // State machine helpers
  isValidStatusTransition,
  getAllowedNextStatuses,

  // Query helpers
  requiresImmediateAttention,
  isActiveCase,
  isReadyForSurgery,
  needsAssessment,
  requiresBoneAugmentation,
  calculateCaseProgress,
  getCaseSummary,
  getDaysSinceCreation,
  isOverdueForFollowUp,
  getNextFollowUp,
  getImplantCount,
  getExpectedImplantCount,
  areAllImplantsPlaced,
  getEligibilitySummary,
} from './entities/index.js';

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

export {
  // Scoring Policy
  calculateScore,
  calculateCompositeScore,
  generateTreatmentPlan,
  compareScores,
  assessImplantSites,
  quickEligibilityCheck,
  classifyEligibilityFromScore,
  calculateRiskLevel,

  // Configuration
  DEFAULT_SCORING_CONFIG,

  // Types
  type AllOnXRiskFactorWeights,
  type AllOnXScoringConfig,
  type AllOnXScoringResult,
  type AllOnXRiskFlag,
  type TreatmentPlanningResult,
  type TreatmentPhase,
  type ImplantSiteAssessment,
} from './services/index.js';

// ============================================================================
// REPOSITORY INTERFACES
// ============================================================================

export {
  // Repository interface
  type IAllOnXCaseRepository,

  // Result types
  type AllOnXCaseRepositoryResult,
  type AllOnXCaseRepositoryError,
  type AllOnXCaseRepositoryErrorCode,

  // Specification types
  type AllOnXCaseSpecification,
  type AllOnXCaseByStatusSpec,
  type AllOnXCaseByEligibilitySpec,
  type AllOnXCaseByRiskLevelSpec,
  type AllOnXCaseByPrioritySpec,
  type AllOnXCaseNeedingReviewSpec,
  type AllOnXCaseByClinicianSpec,
  type AllOnXCaseByPatientSpec,
  type AllOnXCaseWithOverdueFollowUpSpec,
  type AllOnXCaseByProcedureSpec,
  type AllOnXCaseByDateRangeSpec,
  type AllOnXCaseReadyForSurgerySpec,
  type AllOnXCaseSpec,

  // Options types
  type QueryOptions,
  type TransactionContext,

  // Statistics types
  type AllOnXCaseStatistics,

  // Specification factory functions
  pendingReviewSpec,
  urgentCasesSpec,
  byStatusSpec,
  byEligibilitySpec,
  byRiskLevelSpec,
  byClinicianSpec,
  overdueFollowUpSpec,
  byDateRangeSpec,
  readyForSurgerySpec,
  byProcedureSpec,
  byPatientSpec,
} from './repositories/index.js';

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export {
  // Event metadata
  type AllOnXEventMetadata,
  type AllOnXDomainEvent,
  createAllOnXEventMetadata,

  // Case lifecycle events
  type AllOnXCaseCreatedEvent,
  type AllOnXCaseCreatedPayload,
  type AllOnXCaseStatusChangedEvent,
  type AllOnXCaseStatusChangedPayload,
  type AllOnXCasePriorityChangedEvent,
  type AllOnXCasePriorityChangedPayload,
  type AllOnXCaseAssignedEvent,
  type AllOnXCaseAssignedPayload,
  type AllOnXCaseCompletedEvent,
  type AllOnXCaseCompletedPayload,
  type AllOnXCaseCancelledEvent,
  type AllOnXCaseCancelledPayload,

  // Clinical assessment events
  type AllOnXCaseScoredEvent,
  type AllOnXCaseScoredPayload,
  type AllOnXScoreOverriddenEvent,
  type AllOnXScoreOverriddenPayload,
  type AllOnXCaseReviewedEvent,
  type AllOnXCaseReviewedPayload,

  // Imaging events
  type AllOnXImagingUploadedEvent,
  type AllOnXImagingUploadedPayload,
  type AllOnXCBCTAnalyzedEvent,
  type AllOnXCBCTAnalyzedPayload,

  // Surgical events
  type AllOnXSurgeryScheduledEvent,
  type AllOnXSurgeryScheduledPayload,
  type AllOnXImplantPlacedEvent,
  type AllOnXImplantPlacedPayload,
  type AllOnXSurgeryCompletedEvent,
  type AllOnXSurgeryCompletedPayload,

  // Prosthetic events
  type AllOnXProvisionalDeliveredEvent,
  type AllOnXProvisionalDeliveredPayload,
  type AllOnXFinalProsthesisDeliveredEvent,
  type AllOnXFinalProsthesisDeliveredPayload,

  // Follow-up events
  type AllOnXFollowUpScheduledEvent,
  type AllOnXFollowUpScheduledPayload,
  type AllOnXFollowUpCompletedEvent,
  type AllOnXFollowUpCompletedPayload,
  type AllOnXFollowUpMissedEvent,
  type AllOnXFollowUpMissedPayload,

  // Complication events
  type AllOnXComplicationReportedEvent,
  type AllOnXComplicationReportedPayload,
  type AllOnXComplicationResolvedEvent,
  type AllOnXComplicationResolvedPayload,

  // Consent events
  type AllOnXConsentObtainedEvent,
  type AllOnXConsentObtainedPayload,
  type AllOnXConsentWithdrawnEvent,
  type AllOnXConsentWithdrawnPayload,

  // Union types
  type AllOnXDomainEventUnion,
  type AllOnXEventType,

  // Event factory functions
  createAllOnXCaseCreatedEvent,
  createAllOnXCaseScoredEvent,
  createAllOnXCaseStatusChangedEvent,
  createAllOnXSurgeryScheduledEvent,
  createAllOnXImplantPlacedEvent,
  createAllOnXFollowUpScheduledEvent,
  createAllOnXComplicationReportedEvent,

  // Type guards
  isAllOnXCaseCreatedEvent,
  isAllOnXCaseScoredEvent,
  isAllOnXCaseStatusChangedEvent,
  isAllOnXSurgeryEvent,
  isAllOnXComplicationEvent,
  isAllOnXConsentEvent,
  isAllOnXFollowUpEvent,
} from './events/index.js';
