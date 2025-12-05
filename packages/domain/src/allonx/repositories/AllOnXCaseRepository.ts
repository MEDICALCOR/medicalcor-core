/**
 * @fileoverview AllOnXCase Repository Interface
 *
 * Repository interface for AllOnX case persistence.
 * Defines the contract for data access in the AllOnX bounded context.
 *
 * @module domain/allonx/repositories/allonx-case-repository
 *
 * DESIGN PRINCIPLES:
 * 1. INTERFACE SEGREGATION - Focused interface for case operations
 * 2. DEPENDENCY INVERSION - Domain depends on abstraction, not implementation
 * 3. SPECIFICATION PATTERN - Type-safe query composition
 * 4. RESULT TYPE - Explicit error handling without exceptions
 */

import type {
  AllOnXCase,
  AllOnXCaseStatus,
  CasePriority,
  CreateAllOnXCaseInput,
  UpdateAllOnXCaseInput,
  ImagingRecord,
  TreatmentPhaseRecord,
  ConsultationRecord,
  ImplantRecord,
  FollowUpRecord,
  PhysicianReviewRecord,
} from '../entities/AllOnXCase.js';

import type {
  AllOnXClinicalIndicators,
  AllOnXEligibility,
  AllOnXRiskLevel,
  AllOnXProcedureType,
} from '../value-objects/AllOnXClinicalScore.js';

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Repository error codes
 */
export type AllOnXCaseRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'VALIDATION_ERROR'
  | 'CONCURRENCY_CONFLICT'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Repository error
 */
export interface AllOnXCaseRepositoryError {
  readonly code: AllOnXCaseRepositoryErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Repository result type
 */
export type AllOnXCaseRepositoryResult<T> =
  | { success: true; value: T }
  | { success: false; error: AllOnXCaseRepositoryError };

// ============================================================================
// SPECIFICATION TYPES
// ============================================================================

/**
 * Base specification interface
 */
export interface AllOnXCaseSpecification {
  readonly type: string;
}

/**
 * Specification by status
 */
export interface AllOnXCaseByStatusSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_STATUS';
  readonly status: AllOnXCaseStatus | readonly AllOnXCaseStatus[];
}

/**
 * Specification by eligibility
 */
export interface AllOnXCaseByEligibilitySpec extends AllOnXCaseSpecification {
  readonly type: 'BY_ELIGIBILITY';
  readonly eligibility: AllOnXEligibility | readonly AllOnXEligibility[];
}

/**
 * Specification by risk level
 */
export interface AllOnXCaseByRiskLevelSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_RISK_LEVEL';
  readonly riskLevel: AllOnXRiskLevel | readonly AllOnXRiskLevel[];
}

/**
 * Specification by priority
 */
export interface AllOnXCaseByPrioritySpec extends AllOnXCaseSpecification {
  readonly type: 'BY_PRIORITY';
  readonly priority: CasePriority | readonly CasePriority[];
}

/**
 * Specification for cases needing review
 */
export interface AllOnXCaseNeedingReviewSpec extends AllOnXCaseSpecification {
  readonly type: 'NEEDING_REVIEW';
  readonly maxAgeHours?: number;
}

/**
 * Specification by clinician
 */
export interface AllOnXCaseByClinicianSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_CLINICIAN';
  readonly clinicianId: string;
  readonly includeUnassigned?: boolean;
}

/**
 * Specification by patient
 */
export interface AllOnXCaseByPatientSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_PATIENT';
  readonly patientId: string;
}

/**
 * Specification for cases with overdue follow-ups
 */
export interface AllOnXCaseWithOverdueFollowUpSpec extends AllOnXCaseSpecification {
  readonly type: 'OVERDUE_FOLLOW_UP';
  readonly maxOverdueDays?: number;
}

/**
 * Specification by procedure type
 */
export interface AllOnXCaseByProcedureSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_PROCEDURE';
  readonly procedure: AllOnXProcedureType;
}

/**
 * Specification by date range
 */
export interface AllOnXCaseByDateRangeSpec extends AllOnXCaseSpecification {
  readonly type: 'BY_DATE_RANGE';
  readonly field:
    | 'createdAt'
    | 'surgeryScheduledFor'
    | 'surgeryCompletedAt'
    | 'prosthesisDeliveredAt';
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * Specification for cases ready for surgery
 */
export interface AllOnXCaseReadyForSurgerySpec extends AllOnXCaseSpecification {
  readonly type: 'READY_FOR_SURGERY';
}

/**
 * Specification union type
 */
export type AllOnXCaseSpec =
  | AllOnXCaseByStatusSpec
  | AllOnXCaseByEligibilitySpec
  | AllOnXCaseByRiskLevelSpec
  | AllOnXCaseByPrioritySpec
  | AllOnXCaseNeedingReviewSpec
  | AllOnXCaseByClinicianSpec
  | AllOnXCaseByPatientSpec
  | AllOnXCaseWithOverdueFollowUpSpec
  | AllOnXCaseByProcedureSpec
  | AllOnXCaseByDateRangeSpec
  | AllOnXCaseReadyForSurgerySpec;

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Query options for listing cases
 */
export interface QueryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'createdAt' | 'updatedAt' | 'priority' | 'surgeryScheduledFor';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Transaction context for atomic operations
 */
export interface TransactionContext {
  readonly transactionId: string;
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

/**
 * Case statistics
 */
export interface AllOnXCaseStatistics {
  readonly totalCases: number;
  readonly byStatus: Record<AllOnXCaseStatus, number>;
  readonly byEligibility: Record<AllOnXEligibility, number>;
  readonly byRiskLevel: Record<AllOnXRiskLevel, number>;
  readonly byProcedure: Record<AllOnXProcedureType, number>;
  readonly averageScoreByProcedure: Record<AllOnXProcedureType, number>;
  readonly casesCompletedThisMonth: number;
  readonly casesInProgress: number;
  readonly overdueFollowUps: number;
  readonly averageTreatmentDurationDays: number;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * AllOnX Case Repository Interface
 *
 * Defines the contract for persisting and querying AllOnX cases.
 * Implementations may use PostgreSQL, MongoDB, or other storage systems.
 */
export interface IAllOnXCaseRepository {
  // ===== BASIC CRUD =====

  /**
   * Create a new case
   */
  create(input: CreateAllOnXCaseInput): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Find case by ID
   */
  findById(id: string): Promise<AllOnXCaseRepositoryResult<AllOnXCase | null>>;

  /**
   * Find case by case number
   */
  findByCaseNumber(caseNumber: string): Promise<AllOnXCaseRepositoryResult<AllOnXCase | null>>;

  /**
   * Update a case
   */
  update(id: string, input: UpdateAllOnXCaseInput): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Delete a case (soft delete recommended)
   */
  delete(id: string): Promise<AllOnXCaseRepositoryResult<void>>;

  // ===== CLINICAL ASSESSMENT =====

  /**
   * Update clinical indicators for a case
   */
  updateIndicators(
    id: string,
    indicators: AllOnXClinicalIndicators
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Store clinical score for a case
   */
  storeScore(
    id: string,
    scoreData: {
      compositeScore: number;
      eligibility: AllOnXEligibility;
      riskLevel: AllOnXRiskLevel;
      confidence: number;
    }
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  // ===== RECORDS MANAGEMENT =====

  /**
   * Add imaging record
   */
  addImagingRecord(
    caseId: string,
    record: Omit<ImagingRecord, 'id'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Add treatment phase
   */
  addTreatmentPhase(
    caseId: string,
    phase: Omit<TreatmentPhaseRecord, 'status'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Update treatment phase status
   */
  updateTreatmentPhase(
    caseId: string,
    phaseNumber: number,
    update: Partial<TreatmentPhaseRecord>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Add consultation record
   */
  addConsultation(
    caseId: string,
    consultation: Omit<ConsultationRecord, 'id'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Add implant record
   */
  addImplant(
    caseId: string,
    implant: Omit<ImplantRecord, 'id'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Add follow-up record
   */
  addFollowUp(
    caseId: string,
    followUp: Omit<FollowUpRecord, 'id'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Complete follow-up
   */
  completeFollowUp(
    caseId: string,
    followUpId: string,
    findings: string,
    nextActions?: string[]
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  /**
   * Add physician review
   */
  addPhysicianReview(
    caseId: string,
    review: Omit<PhysicianReviewRecord, 'id'>
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  // ===== CONSENT MANAGEMENT =====

  /**
   * Record consent obtained
   */
  recordConsent(
    caseId: string,
    documentId: string
  ): Promise<AllOnXCaseRepositoryResult<AllOnXCase>>;

  // ===== QUERYING =====

  /**
   * Find cases matching specification
   */
  findBySpecification(
    spec: AllOnXCaseSpec,
    options?: QueryOptions
  ): Promise<AllOnXCaseRepositoryResult<readonly AllOnXCase[]>>;

  /**
   * Count cases matching specification
   */
  countBySpecification(spec: AllOnXCaseSpec): Promise<AllOnXCaseRepositoryResult<number>>;

  /**
   * Find all cases for a patient
   */
  findByPatientId(
    patientId: string,
    options?: QueryOptions
  ): Promise<AllOnXCaseRepositoryResult<readonly AllOnXCase[]>>;

  /**
   * Find cases assigned to a clinician
   */
  findByClinicianId(
    clinicianId: string,
    options?: QueryOptions
  ): Promise<AllOnXCaseRepositoryResult<readonly AllOnXCase[]>>;

  /**
   * Find cases with pending follow-ups
   */
  findWithPendingFollowUps(
    options?: QueryOptions
  ): Promise<AllOnXCaseRepositoryResult<readonly AllOnXCase[]>>;

  /**
   * Find cases scheduled for surgery in date range
   */
  findScheduledSurgeries(
    startDate: Date,
    endDate: Date,
    options?: QueryOptions
  ): Promise<AllOnXCaseRepositoryResult<readonly AllOnXCase[]>>;

  // ===== STATISTICS =====

  /**
   * Get case statistics
   */
  getStatistics(dateRange?: {
    start: Date;
    end: Date;
  }): Promise<AllOnXCaseRepositoryResult<AllOnXCaseStatistics>>;

  /**
   * Get clinician workload
   */
  getClinicianWorkload(clinicianId: string): Promise<
    AllOnXCaseRepositoryResult<{
      activeCases: number;
      pendingReviews: number;
      upcomingSurgeries: number;
      overdueFollowUps: number;
    }>
  >;

  // ===== TRANSACTION SUPPORT =====

  /**
   * Begin transaction
   */
  beginTransaction(): Promise<TransactionContext>;

  /**
   * Commit transaction
   */
  commitTransaction(ctx: TransactionContext): Promise<void>;

  /**
   * Rollback transaction
   */
  rollbackTransaction(ctx: TransactionContext): Promise<void>;

  /**
   * Execute in transaction
   */
  executeInTransaction<T>(
    operation: (ctx: TransactionContext) => Promise<T>
  ): Promise<AllOnXCaseRepositoryResult<T>>;

  // ===== HEALTH CHECK =====

  /**
   * Check repository health
   */
  healthCheck(): Promise<{
    healthy: boolean;
    latencyMs: number;
    message?: string;
  }>;
}

// ============================================================================
// SPECIFICATION FACTORY FUNCTIONS
// ============================================================================

/**
 * Create specification for pending review cases
 */
export function pendingReviewSpec(maxAgeHours?: number): AllOnXCaseNeedingReviewSpec {
  return { type: 'NEEDING_REVIEW', maxAgeHours };
}

/**
 * Create specification for urgent cases
 */
export function urgentCasesSpec(): AllOnXCaseByPrioritySpec {
  return { type: 'BY_PRIORITY', priority: 'URGENT' };
}

/**
 * Create specification by status
 */
export function byStatusSpec(
  status: AllOnXCaseStatus | readonly AllOnXCaseStatus[]
): AllOnXCaseByStatusSpec {
  return { type: 'BY_STATUS', status };
}

/**
 * Create specification by eligibility
 */
export function byEligibilitySpec(
  eligibility: AllOnXEligibility | readonly AllOnXEligibility[]
): AllOnXCaseByEligibilitySpec {
  return { type: 'BY_ELIGIBILITY', eligibility };
}

/**
 * Create specification by risk level
 */
export function byRiskLevelSpec(
  riskLevel: AllOnXRiskLevel | readonly AllOnXRiskLevel[]
): AllOnXCaseByRiskLevelSpec {
  return { type: 'BY_RISK_LEVEL', riskLevel };
}

/**
 * Create specification by clinician
 */
export function byClinicianSpec(
  clinicianId: string,
  includeUnassigned = false
): AllOnXCaseByClinicianSpec {
  return { type: 'BY_CLINICIAN', clinicianId, includeUnassigned };
}

/**
 * Create specification for overdue follow-ups
 */
export function overdueFollowUpSpec(maxOverdueDays?: number): AllOnXCaseWithOverdueFollowUpSpec {
  return { type: 'OVERDUE_FOLLOW_UP', maxOverdueDays };
}

/**
 * Create specification by date range
 */
export function byDateRangeSpec(
  field: AllOnXCaseByDateRangeSpec['field'],
  startDate: Date,
  endDate: Date
): AllOnXCaseByDateRangeSpec {
  return { type: 'BY_DATE_RANGE', field, startDate, endDate };
}

/**
 * Create specification for cases ready for surgery
 */
export function readyForSurgerySpec(): AllOnXCaseReadyForSurgerySpec {
  return { type: 'READY_FOR_SURGERY' };
}

/**
 * Create specification by procedure type
 */
export function byProcedureSpec(procedure: AllOnXProcedureType): AllOnXCaseByProcedureSpec {
  return { type: 'BY_PROCEDURE', procedure };
}

/**
 * Create specification by patient
 */
export function byPatientSpec(patientId: string): AllOnXCaseByPatientSpec {
  return { type: 'BY_PATIENT', patientId };
}
