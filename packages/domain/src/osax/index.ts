/**
 * @fileoverview OSAX Domain Module
 *
 * OSAX (Oral Surgery Auxiliary eXtension) domain module.
 * Contains value objects, entities, and services for OSAX case management.
 *
 * @module domain/osax
 */

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  // OsaxClinicalScore - Class and Error
  OsaxClinicalScore,
  InvalidOsaxScoreError,

  // Type guards and utilities
  isOsaxClinicalScore,
  isSuccessfulParse,

  // Constants
  CLINICAL_INDICATOR_RANGES,
  SEVERITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,

  // Types
  type OsaxSeverity,
  type OsaxCardiovascularRisk,
  type OsaxTreatmentRecommendation,
  type FollowUpUrgency,
  type ClinicalTaskPriority,
  type OsaxClinicalIndicators,
  type OsaxClinicalScoreDTO,
  type OsaxClinicalScoreParseResult,
  type InvalidOsaxScoreErrorDetails,
  type ValidatedAHI,
  type ValidatedSpO2,
  type ValidatedCompositeScore,
  type ValidatedConfidence,

  // OsaxSubjectId
  OsaxSubjectId,
  InvalidOsaxSubjectIdError,
  type OsaxSubjectIdType,
  type OsaxSubjectType,
  type OsaxSubjectDemographics,
  type OsaxSubjectIdDTO,
  type OsaxSubjectIdParseResult,
} from './value-objects/index.js';

// ============================================================================
// ENTITIES
// ============================================================================

export {
  // OsaxCase types
  type OsaxCase,
  type OsaxCaseStatus,
  type OsaxStudyType,
  type OsaxTreatmentStatus,
  type OsaxStudyMetadata,
  type OsaxTreatmentRecord,
  type OsaxFollowUpRecord,
  type OsaxPhysicianReview,
  type CreateOsaxCaseInput,
  type UpdateOsaxCaseInput,

  // Factory functions
  createOsaxCase,
  generateCaseNumber,

  // State machine helpers
  isValidStatusTransition,
  getAllowedNextStatuses,

  // Query helpers
  requiresImmediateAttention,
  isActiveCase,
  requiresTreatment,
  isReadyForTreatment,
  calculateCaseProgress,
  getCaseSeveritySummary,
} from './entities/index.js';

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

export {
  // Scoring Policy
  calculateScore,
  calculatePediatricScore,
  determineTreatmentEligibility,
  classifySeverityFromAHI,
  calculateCardiovascularRisk,
  compareScores,

  // Configuration
  DEFAULT_SCORING_CONFIG,
  PEDIATRIC_SCORING_CONFIG,

  // Types
  type OsaxRiskFactorWeights,
  type OsaxScoringConfig,
  type OsaxScoringResult,
  type OsaxRiskFlag,
  type TreatmentEligibilityResult,
} from './services/index.js';

// ============================================================================
// REPOSITORY INTERFACES
// ============================================================================

export {
  // Repository interface
  type IOsaxCaseRepository,

  // Specification types
  type OsaxCaseSpecification,
  type OsaxCaseByStatusSpec,
  type OsaxCaseBySeveritySpec,
  type OsaxCaseNeedingReviewSpec,
  type OsaxCaseBySpecialistSpec,
  type OsaxCaseByPrioritySpec,
  type OsaxCaseWithOverdueFollowUpSpec,
  type OsaxCaseByTreatmentSpec,
  type OsaxCaseByDateRangeSpec,
  type OsaxCaseSpec,

  // Result types
  type OsaxCaseRepositoryResult,
  type OsaxCaseRepositoryError,
  type OsaxCaseRepositoryErrorCode,
  type QueryOptions,
  type TransactionContext,
  type OsaxCaseStatistics,

  // Specification factory functions
  pendingReviewSpec,
  urgentCasesSpec,
  byStatusSpec,
  bySeveritySpec,
  bySpecialistSpec,
  overdueFollowUpSpec,
  byDateRangeSpec,
  activeTreatmentSpec,
} from './repositories/index.js';

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export {
  // Event metadata
  type OsaxEventMetadata,
  type OsaxDomainEvent,
  createOsaxEventMetadata,

  // Case lifecycle events
  type OsaxCaseCreatedEvent,
  type OsaxCaseCreatedPayload,
  type OsaxCaseStatusChangedEvent,
  type OsaxCaseStatusChangedPayload,
  type OsaxCasePriorityChangedEvent,
  type OsaxCasePriorityChangedPayload,
  type OsaxCaseAssignedEvent,
  type OsaxCaseAssignedPayload,
  type OsaxCaseClosedEvent,
  type OsaxCaseClosedPayload,
  type OsaxCaseCancelledEvent,
  type OsaxCaseCancelledPayload,

  // Study events
  type OsaxStudyCompletedEvent,
  type OsaxStudyCompletedPayload,
  type OsaxStudyDataReceivedEvent,
  type OsaxStudyDataReceivedPayload,

  // Scoring events
  type OsaxCaseScoredEvent,
  type OsaxCaseScoredPayload,
  type OsaxScoreOverriddenEvent,
  type OsaxScoreOverriddenPayload,

  // Review events
  type OsaxCaseReviewedEvent,
  type OsaxCaseReviewedPayload,

  // Treatment events
  type OsaxTreatmentInitiatedEvent,
  type OsaxTreatmentInitiatedPayload,
  type OsaxTreatmentStatusChangedEvent,
  type OsaxTreatmentStatusChangedPayload,
  type OsaxTreatmentCompletedEvent,
  type OsaxTreatmentCompletedPayload,

  // Follow-up events
  type OsaxFollowUpScheduledEvent,
  type OsaxFollowUpScheduledPayload,
  type OsaxFollowUpCompletedEvent,
  type OsaxFollowUpCompletedPayload,
  type OsaxFollowUpMissedEvent,
  type OsaxFollowUpMissedPayload,

  // Consent & GDPR events
  type OsaxConsentObtainedEvent,
  type OsaxConsentObtainedPayload,
  type OsaxConsentWithdrawnEvent,
  type OsaxConsentWithdrawnPayload,
  type OsaxDataExportedEvent,
  type OsaxDataExportedPayload,
  type OsaxDataDeletedEvent,
  type OsaxDataDeletedPayload,

  // Union types
  type OsaxDomainEventUnion,
  type OsaxEventType,

  // Event factory functions
  createOsaxCaseCreatedEvent,
  createOsaxCaseScoredEvent,
  createOsaxCaseStatusChangedEvent,
  createOsaxTreatmentInitiatedEvent,
  createOsaxFollowUpScheduledEvent,

  // Type guards
  isOsaxCaseCreatedEvent,
  isOsaxCaseScoredEvent,
  isOsaxCaseStatusChangedEvent,
  isOsaxTreatmentInitiatedEvent,
  isOsaxCaseReviewedEvent,
  isOsaxFollowUpCompletedEvent,
  isOsaxConsentEvent,
  isOsaxGdprEvent,
} from './events/index.js';
