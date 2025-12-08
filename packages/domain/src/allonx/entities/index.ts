/**
 * @fileoverview AllOnX Entities Index
 *
 * Re-exports all entities for the AllOnX domain.
 *
 * @module domain/allonx/entities
 */

export {
  // Types
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

  // Entity class (preferred - with instance methods)
  AllOnXCaseEntity,

  // Factory functions
  createAllOnXCase,
  generateCaseNumber,

  // State machine helpers
  isValidStatusTransition,
  getAllowedNextStatuses,

  // Query helpers (deprecated - use AllOnXCaseEntity instance methods instead)
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
} from './AllOnXCase.js';
