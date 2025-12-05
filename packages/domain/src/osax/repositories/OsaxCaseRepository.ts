/**
 * @fileoverview IOsaxCaseRepository Interface
 *
 * Banking/Medical Grade Repository Interface for OSAX Case Aggregate.
 * Defines the contract for OSAX case persistence operations.
 *
 * @module domain/osax/repositories/osax-case-repository
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - Cases are accessed/modified through this repository
 * 2. PERSISTENCE IGNORANCE - Domain doesn't know about database details
 * 3. SPECIFICATION PATTERN - Complex queries via specifications
 * 4. UNIT OF WORK COMPATIBLE - Supports transactional operations
 * 5. GDPR COMPLIANT - Built-in support for data protection requirements
 */

import type {
  OsaxCase,
  OsaxCaseStatus,
  OsaxStudyMetadata,
  OsaxTreatmentRecord,
  OsaxFollowUpRecord,
  OsaxPhysicianReview,
  CreateOsaxCaseInput,
  UpdateOsaxCaseInput,
} from '../entities/OsaxCase.js';
import type { OsaxClinicalScore } from '../value-objects/OsaxClinicalScore.js';
import type { OsaxSubjectId } from '../value-objects/OsaxSubjectId.js';

// ============================================================================
// SPECIFICATION PATTERN
// ============================================================================

/**
 * Base specification interface for OSAX case queries
 */
export interface OsaxCaseSpecification {
  readonly type: string;
  isSatisfiedBy(osaxCase: OsaxCase): boolean;
}

/**
 * Specification for finding cases by status
 */
export interface OsaxCaseByStatusSpec extends OsaxCaseSpecification {
  readonly type: 'BY_STATUS';
  readonly status: OsaxCaseStatus;
}

/**
 * Specification for finding cases by severity
 */
export interface OsaxCaseBySeveritySpec extends OsaxCaseSpecification {
  readonly type: 'BY_SEVERITY';
  readonly severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
}

/**
 * Specification for finding cases needing review
 */
export interface OsaxCaseNeedingReviewSpec extends OsaxCaseSpecification {
  readonly type: 'NEEDING_REVIEW';
  readonly maxAgeHours: number;
}

/**
 * Specification for finding cases by assigned specialist
 */
export interface OsaxCaseBySpecialistSpec extends OsaxCaseSpecification {
  readonly type: 'BY_SPECIALIST';
  readonly specialistId: string;
}

/**
 * Specification for finding cases by priority
 */
export interface OsaxCaseByPrioritySpec extends OsaxCaseSpecification {
  readonly type: 'BY_PRIORITY';
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

/**
 * Specification for finding cases with overdue follow-ups
 */
export interface OsaxCaseWithOverdueFollowUpSpec extends OsaxCaseSpecification {
  readonly type: 'OVERDUE_FOLLOW_UP';
  readonly asOfDate: Date;
}

/**
 * Specification for finding cases by treatment type
 */
export interface OsaxCaseByTreatmentSpec extends OsaxCaseSpecification {
  readonly type: 'BY_TREATMENT';
  readonly treatmentType: string;
}

/**
 * Specification for finding cases created within date range
 */
export interface OsaxCaseByDateRangeSpec extends OsaxCaseSpecification {
  readonly type: 'BY_DATE_RANGE';
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * Union type of all OSAX case specifications
 */
export type OsaxCaseSpec =
  | OsaxCaseByStatusSpec
  | OsaxCaseBySeveritySpec
  | OsaxCaseNeedingReviewSpec
  | OsaxCaseBySpecialistSpec
  | OsaxCaseByPrioritySpec
  | OsaxCaseWithOverdueFollowUpSpec
  | OsaxCaseByTreatmentSpec
  | OsaxCaseByDateRangeSpec;

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * IOsaxCaseRepository - Banking Grade OSAX Case Repository
 *
 * This interface defines the contract for OSAX case persistence.
 * Implementations can be PostgreSQL/Supabase, or in-memory for testing.
 *
 * INVARIANTS:
 * - Subject IDs are unique per case
 * - Version must be checked for updates (optimistic locking)
 * - All operations return Result types (no exceptions)
 * - GDPR compliance must be maintained
 *
 * @example
 * ```typescript
 * // Get case by ID
 * const result = await repository.findById(caseId);
 * if (result.success) {
 *   const osaxCase = result.value;
 *   console.log(osaxCase?.status);
 * }
 *
 * // Find all urgent cases needing review
 * const urgentCases = await repository.findBySpecification({
 *   type: 'BY_PRIORITY',
 *   priority: 'URGENT',
 *   isSatisfiedBy: (c) => c.priority === 'URGENT'
 * });
 *
 * // Create new case
 * const newCase = await repository.create({
 *   subjectId: OsaxSubjectId.generate(1, 2025),
 *   patientId: 'patient-uuid',
 * });
 * ```
 */
export interface IOsaxCaseRepository {
  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  /**
   * Find case by unique identifier
   *
   * @param id - Case UUID
   * @returns Case or null if not found
   */
  findById(id: string): Promise<OsaxCaseRepositoryResult<OsaxCase | null>>;

  /**
   * Find case by subject ID
   *
   * @param subjectId - OsaxSubjectId value object
   * @returns Case or null if not found
   */
  findBySubjectId(subjectId: OsaxSubjectId): Promise<OsaxCaseRepositoryResult<OsaxCase | null>>;

  /**
   * Find case by case number
   *
   * @param caseNumber - Human-readable case number
   * @returns Case or null if not found
   */
  findByCaseNumber(caseNumber: string): Promise<OsaxCaseRepositoryResult<OsaxCase | null>>;

  /**
   * Find case by patient ID
   *
   * @param patientId - Patient identifier
   * @returns Cases for this patient (may have multiple)
   */
  findByPatientId(patientId: string): Promise<OsaxCaseRepositoryResult<OsaxCase[]>>;

  /**
   * Find cases matching specification
   *
   * @param spec - Query specification
   * @param options - Pagination and sorting options
   * @returns Array of matching cases
   */
  findBySpecification(
    spec: OsaxCaseSpec,
    options?: QueryOptions
  ): Promise<OsaxCaseRepositoryResult<OsaxCase[]>>;

  /**
   * Count cases matching specification
   *
   * @param spec - Query specification
   * @returns Count of matching cases
   */
  countBySpecification(spec: OsaxCaseSpec): Promise<OsaxCaseRepositoryResult<number>>;

  /**
   * Check if case exists by subject ID
   *
   * @param subjectId - OsaxSubjectId value object
   * @returns True if case exists
   */
  existsBySubjectId(subjectId: OsaxSubjectId): Promise<OsaxCaseRepositoryResult<boolean>>;

  /**
   * Get next sequence number for case generation
   *
   * @param year - Year for case numbering
   * @returns Next available sequence number
   */
  getNextSequenceNumber(year: number): Promise<OsaxCaseRepositoryResult<number>>;

  // ============================================================================
  // COMMAND OPERATIONS
  // ============================================================================

  /**
   * Create new OSAX case
   *
   * INVARIANTS:
   * - Subject ID must be unique
   * - Patient ID is required
   *
   * @param input - Case creation data
   * @returns Created case with generated ID and case number
   */
  create(input: CreateOsaxCaseInput): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Update existing case
   *
   * INVARIANTS:
   * - Case must exist
   * - Version must match (optimistic locking)
   * - Status transitions must be valid
   *
   * @param id - Case ID
   * @param input - Update data
   * @param expectedVersion - Expected version for optimistic locking
   * @returns Updated case
   */
  update(
    id: string,
    input: UpdateOsaxCaseInput,
    expectedVersion?: number
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Record study completion
   *
   * @param id - Case ID
   * @param studyMetadata - Study metadata
   * @returns Updated case
   */
  recordStudyCompletion(
    id: string,
    studyMetadata: OsaxStudyMetadata
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Record clinical score
   *
   * @param id - Case ID
   * @param score - Clinical score
   * @param scoredBy - Who scored (SYSTEM or PHYSICIAN)
   * @param notes - Optional scoring notes
   * @returns Updated case
   */
  recordClinicalScore(
    id: string,
    score: OsaxClinicalScore,
    scoredBy: 'SYSTEM' | 'PHYSICIAN',
    notes?: string
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Record physician review
   *
   * @param id - Case ID
   * @param review - Physician review record
   * @returns Updated case
   */
  recordPhysicianReview(
    id: string,
    review: OsaxPhysicianReview
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Initiate treatment
   *
   * @param id - Case ID
   * @param treatment - Treatment record
   * @returns Updated case
   */
  initiateTreatment(
    id: string,
    treatment: OsaxTreatmentRecord
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Update treatment status
   *
   * @param id - Case ID
   * @param treatmentStatus - New treatment status
   * @param complianceData - Optional compliance data
   * @returns Updated case
   */
  updateTreatmentStatus(
    id: string,
    treatmentStatus: OsaxTreatmentRecord['status'],
    complianceData?: OsaxTreatmentRecord['compliance']
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Schedule follow-up
   *
   * @param id - Case ID
   * @param followUp - Follow-up record
   * @returns Updated case
   */
  scheduleFollowUp(
    id: string,
    followUp: Omit<OsaxFollowUpRecord, 'id'>
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Complete follow-up
   *
   * @param id - Case ID
   * @param followUpId - Follow-up ID
   * @param completionData - Completion data
   * @returns Updated case
   */
  completeFollowUp(
    id: string,
    followUpId: string,
    completionData: {
      completedDate: Date;
      notes?: string;
      updatedIndicators?: Partial<OsaxClinicalScore['indicators']>;
    }
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Update case status
   *
   * Validates status transitions.
   * Emits OsaxCaseStatusChanged domain event.
   *
   * @param id - Case ID
   * @param newStatus - New status
   * @param reason - Reason for status change
   */
  updateStatus(
    id: string,
    newStatus: OsaxCaseStatus,
    reason?: string
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>>;

  /**
   * Soft delete case
   *
   * Marks case as deleted but retains for audit.
   * Required for GDPR "right to be forgotten" (with retention period).
   *
   * @param id - Case ID
   * @param reason - Deletion reason
   */
  softDelete(id: string, reason: string): Promise<OsaxCaseRepositoryResult<void>>;

  /**
   * Hard delete case
   *
   * Permanently removes case data.
   * Use only for GDPR erasure requests after retention period.
   *
   * @param id - Case ID
   */
  hardDelete(id: string): Promise<OsaxCaseRepositoryResult<void>>;

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Find multiple cases by IDs
   *
   * @param ids - Array of case IDs
   * @returns Map of ID to Case
   */
  findManyByIds(ids: string[]): Promise<OsaxCaseRepositoryResult<Map<string, OsaxCase>>>;

  /**
   * Bulk update priority
   *
   * @param updates - Array of ID and priority pairs
   * @returns Number of cases updated
   */
  bulkUpdatePriority(
    updates: Array<{ id: string; priority: OsaxCase['priority'] }>
  ): Promise<OsaxCaseRepositoryResult<number>>;

  /**
   * Get case statistics
   *
   * @param dateRange - Optional date range for statistics
   * @returns Aggregated statistics
   */
  getStatistics(dateRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<OsaxCaseRepositoryResult<OsaxCaseStatistics>>;

  // ============================================================================
  // UNIT OF WORK SUPPORT
  // ============================================================================

  /**
   * Begin transaction
   *
   * @returns Transaction context
   */
  beginTransaction(): Promise<TransactionContext>;

  /**
   * Commit transaction
   *
   * @param context - Transaction context
   */
  commitTransaction(context: TransactionContext): Promise<void>;

  /**
   * Rollback transaction
   *
   * @param context - Transaction context
   */
  rollbackTransaction(context: TransactionContext): Promise<void>;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Repository operation result
 */
export type OsaxCaseRepositoryResult<T> =
  | { success: true; value: T }
  | { success: false; error: OsaxCaseRepositoryError };

/**
 * Repository error types
 */
export interface OsaxCaseRepositoryError {
  readonly code: OsaxCaseRepositoryErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;
}

/**
 * Repository error codes
 */
export type OsaxCaseRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE_SUBJECT_ID'
  | 'DUPLICATE_CASE_NUMBER'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'GDPR_VIOLATION'
  | 'UNKNOWN_ERROR';

/**
 * Query options for pagination and sorting
 */
export interface QueryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: keyof OsaxCase;
  readonly orderDirection?: 'asc' | 'desc';
  readonly includeDeleted?: boolean;
}

/**
 * Transaction context for unit of work
 */
export interface TransactionContext {
  readonly id: string;
  readonly startedAt: Date;
  readonly operations: readonly string[];
}

/**
 * Aggregated case statistics
 */
export interface OsaxCaseStatistics {
  readonly totalCases: number;
  readonly casesByStatus: Record<OsaxCaseStatus, number>;
  readonly casesBySeverity: Record<string, number>;
  readonly casesByTreatment: Record<string, number>;
  readonly averageTimeToReview: number; // hours
  readonly averageTimeToTreatment: number; // hours
  readonly treatmentComplianceRate: number; // percentage
  readonly followUpCompletionRate: number; // percentage
}

// ============================================================================
// FACTORY FUNCTIONS FOR SPECIFICATIONS
// ============================================================================

/**
 * Create specification for cases pending review
 */
export function pendingReviewSpec(maxAgeHours: number = 24): OsaxCaseNeedingReviewSpec {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  return {
    type: 'NEEDING_REVIEW',
    maxAgeHours,
    isSatisfiedBy: (c) =>
      c.status === 'SCORED' && c.reviewStatus === 'PENDING' && c.createdAt <= cutoff,
  };
}

/**
 * Create specification for urgent cases
 */
export function urgentCasesSpec(): OsaxCaseByPrioritySpec {
  return {
    type: 'BY_PRIORITY',
    priority: 'URGENT',
    isSatisfiedBy: (c) => c.priority === 'URGENT' && !c.isDeleted,
  };
}

/**
 * Create specification for cases by status
 */
export function byStatusSpec(status: OsaxCaseStatus): OsaxCaseByStatusSpec {
  return {
    type: 'BY_STATUS',
    status,
    isSatisfiedBy: (c) => c.status === status && !c.isDeleted,
  };
}

/**
 * Create specification for cases by severity
 */
export function bySeveritySpec(
  severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE'
): OsaxCaseBySeveritySpec {
  return {
    type: 'BY_SEVERITY',
    severity,
    isSatisfiedBy: (c) => c.clinicalScore?.severity === severity && !c.isDeleted,
  };
}

/**
 * Create specification for cases by assigned specialist
 */
export function bySpecialistSpec(specialistId: string): OsaxCaseBySpecialistSpec {
  return {
    type: 'BY_SPECIALIST',
    specialistId,
    isSatisfiedBy: (c) => c.assignedSpecialistId === specialistId && !c.isDeleted,
  };
}

/**
 * Create specification for cases with overdue follow-ups
 */
export function overdueFollowUpSpec(asOfDate: Date = new Date()): OsaxCaseWithOverdueFollowUpSpec {
  return {
    type: 'OVERDUE_FOLLOW_UP',
    asOfDate,
    isSatisfiedBy: (c) => {
      if (c.isDeleted) return false;
      return c.followUps.some((f) => f.status === 'SCHEDULED' && f.scheduledDate < asOfDate);
    },
  };
}

/**
 * Create specification for cases by date range
 */
export function byDateRangeSpec(startDate: Date, endDate: Date): OsaxCaseByDateRangeSpec {
  return {
    type: 'BY_DATE_RANGE',
    startDate,
    endDate,
    isSatisfiedBy: (c) => c.createdAt >= startDate && c.createdAt <= endDate && !c.isDeleted,
  };
}

/**
 * Create specification for active treatment cases
 */
export function activeTreatmentSpec(treatmentType: string): OsaxCaseByTreatmentSpec {
  return {
    type: 'BY_TREATMENT',
    treatmentType,
    isSatisfiedBy: (c) =>
      c.activeTreatment?.type === treatmentType && c.status === 'IN_TREATMENT' && !c.isDeleted,
  };
}
