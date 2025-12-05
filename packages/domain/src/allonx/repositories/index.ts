/**
 * @fileoverview AllOnX Repositories Index
 *
 * Re-exports all repository interfaces for the AllOnX domain.
 *
 * @module domain/allonx/repositories
 */

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
} from './AllOnXCaseRepository.js';
