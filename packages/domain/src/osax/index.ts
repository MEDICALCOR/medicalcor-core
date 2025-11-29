/**
 * @fileoverview OSAX Domain Module
 *
 * Central export point for the OSAX (Obstructive Sleep Apnea Extended) domain.
 * Banking/Medical Grade DDD implementation for sleep apnea case management.
 *
 * @module domain/osax
 *
 * ## Overview
 *
 * This module implements Domain-Driven Design patterns for OSAX clinical workflows:
 *
 * ### Value Objects
 * - `OsaxClinicalScore` - Composite clinical scoring with AASM guidelines
 * - `OsaxSubjectId` - GDPR-compliant subject identification
 *
 * ### Entities
 * - `OsaxCase` - Aggregate root for sleep apnea case management
 *
 * ### Domain Services
 * - `OsaxScoringPolicy` - Pure scoring logic and treatment eligibility
 *
 * ### Repository Interfaces
 * - `IOsaxCaseRepository` - Persistence contract for cases
 *
 * ### Domain Events
 * - Case lifecycle events (created, scored, reviewed, closed)
 * - Treatment events (initiated, status changed, completed)
 * - Follow-up events (scheduled, completed, missed)
 * - GDPR compliance events (consent, export, deletion)
 *
 * @example
 * ```typescript
 * import {
 *   // Value Objects
 *   OsaxClinicalScore,
 *   OsaxSubjectId,
 *
 *   // Entities
 *   createOsaxCase,
 *   type OsaxCase,
 *
 *   // Scoring Policy
 *   calculateScore,
 *   determineTreatmentEligibility,
 *
 *   // Repository
 *   type IOsaxCaseRepository,
 *   pendingReviewSpec,
 *
 *   // Events
 *   createOsaxCaseScoredEvent,
 *   isOsaxCaseScoredEvent,
 * } from '@medicalcor/domain/osax';
 *
 * // Create a new case
 * const subjectId = OsaxSubjectId.generate(1, 2025);
 * const osaxCase = createOsaxCase({ subjectId, patientId: 'patient-123' }, 1);
 *
 * // Score from clinical indicators
 * const score = OsaxClinicalScore.fromIndicators({
 *   ahi: 25,
 *   odi: 22,
 *   spo2Nadir: 78,
 *   spo2Average: 94,
 *   sleepEfficiency: 82,
 *   essScore: 14,
 * });
 *
 * console.log(score.severity); // 'MODERATE'
 * console.log(score.requiresCPAP()); // true
 * ```
 */

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  // OsaxClinicalScore
  OsaxClinicalScore,
  InvalidOsaxScoreError,
  type OsaxSeverity,
  type OsaxCardiovascularRisk,
  type OsaxTreatmentRecommendation,
  type OsaxClinicalIndicators,
  type OsaxClinicalScoreDTO,
  type OsaxClinicalScoreParseResult,

  // OsaxSubjectId
  OsaxSubjectId,
  InvalidOsaxSubjectIdError,
  type OsaxSubjectIdType,
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
