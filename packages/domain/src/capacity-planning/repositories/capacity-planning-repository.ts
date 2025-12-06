/**
 * @fileoverview Capacity Planning Repository Port Interface
 *
 * Hexagonal Architecture - PORT definition for capacity planning persistence.
 * Implementations (ADAPTERS) live in @medicalcor/core.
 *
 * @module domain/capacity-planning/repositories
 */

import type { StaffShift, StaffRole, ShiftStatus, ShiftType } from '../entities/staff-shift.js';
import type { CapacityPlan, HistoricalDemandData, PlanPeriod } from '../entities/capacity-plan.js';

// ============================================================================
// RESULT TYPES (No Exceptions Pattern)
// ============================================================================

/**
 * Repository error codes
 */
export type CapacityRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'VALIDATION_ERROR'
  | 'CONSTRAINT_VIOLATION'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'CONCURRENT_MODIFICATION'
  | 'UNKNOWN';

/**
 * Repository error
 */
export interface CapacityRepositoryError {
  readonly code: CapacityRepositoryErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Result type for repository operations
 */
export type CapacityRepositoryResult<T> =
  | { success: true; value: T }
  | { success: false; error: CapacityRepositoryError };

// ============================================================================
// QUERY SPECIFICATIONS
// ============================================================================

/**
 * Specification for querying shifts
 */
export interface ShiftSpecification {
  readonly clinicId?: string;
  readonly staffId?: string;
  readonly staffRole?: StaffRole;
  readonly status?: ShiftStatus | ShiftStatus[];
  readonly shiftType?: ShiftType;
  readonly startDateFrom?: Date;
  readonly startDateTo?: Date;
  readonly dateRange?: {
    from: Date;
    to: Date;
  };
}

/**
 * Specification for querying capacity plans
 */
export interface PlanSpecification {
  readonly clinicId?: string;
  readonly period?: PlanPeriod;
  readonly startDateFrom?: Date;
  readonly startDateTo?: Date;
  readonly hasConflicts?: boolean;
  readonly capacityLevel?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input for creating a shift
 */
export interface CreateShiftInput {
  readonly clinicId: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly staffRole: StaffRole;
  readonly shiftType: ShiftType;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly breakMinutes?: number;
  readonly maxAppointments?: number;
  readonly procedureTypes?: string[];
  readonly notes?: string;
}

/**
 * Input for updating a shift
 */
export interface UpdateShiftInput {
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly breakMinutes?: number;
  readonly maxAppointments?: number;
  readonly status?: ShiftStatus;
  readonly notes?: string;
}

/**
 * Input for creating a capacity plan
 */
export interface CreateCapacityPlanInput {
  readonly clinicId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly period: PlanPeriod;
}

/**
 * Input for recording historical demand
 */
export interface RecordDemandInput {
  readonly clinicId: string;
  readonly date: Date;
  readonly appointments: number;
  readonly noShows: number;
  readonly cancellations: number;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Capacity Planning Repository Port (Hexagonal Architecture)
 *
 * This interface defines what the domain layer needs from the infrastructure
 * for capacity planning operations. Concrete implementations (PostgreSQL, etc.)
 * should implement this interface.
 *
 * @example
 * ```typescript
 * // In application layer (use case)
 * class PlanCapacityUseCase {
 *   constructor(private readonly repository: ICapacityPlanningRepository) {}
 *
 *   async execute(input: PlanCapacityInput): Promise<CapacityPlan> {
 *     const shifts = await this.repository.getShiftsBySpec({
 *       clinicId: input.clinicId,
 *       dateRange: { from: input.startDate, to: input.endDate },
 *     });
 *     // ... create plan
 *   }
 * }
 * ```
 */
export interface ICapacityPlanningRepository {
  // ============================================================================
  // SHIFT OPERATIONS
  // ============================================================================

  /**
   * Create a new staff shift
   *
   * @param input - Shift creation input
   * @returns Created shift or error
   */
  createShift(input: CreateShiftInput): Promise<CapacityRepositoryResult<StaffShift>>;

  /**
   * Get a shift by ID
   *
   * @param shiftId - Shift ID
   * @returns Shift or error
   */
  getShift(shiftId: string): Promise<CapacityRepositoryResult<StaffShift>>;

  /**
   * Get shifts matching specification
   *
   * @param spec - Query specification
   * @param pagination - Pagination options
   * @returns Matching shifts
   */
  getShiftsBySpec(
    spec: ShiftSpecification,
    pagination?: PaginationOptions
  ): Promise<CapacityRepositoryResult<PaginatedResult<StaffShift>>>;

  /**
   * Get all shifts for a date range
   *
   * @param clinicId - Clinic ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Shifts in range
   */
  getShiftsInRange(
    clinicId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CapacityRepositoryResult<StaffShift[]>>;

  /**
   * Get shifts for a specific staff member
   *
   * @param staffId - Staff member ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Staff member's shifts
   */
  getStaffShifts(
    staffId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CapacityRepositoryResult<StaffShift[]>>;

  /**
   * Update a shift
   *
   * @param shiftId - Shift ID
   * @param input - Update input
   * @returns Updated shift or error
   */
  updateShift(
    shiftId: string,
    input: UpdateShiftInput
  ): Promise<CapacityRepositoryResult<StaffShift>>;

  /**
   * Update shift booking count
   *
   * @param shiftId - Shift ID
   * @param bookedAppointments - New booking count
   * @returns Updated shift or error
   */
  updateShiftBookings(
    shiftId: string,
    bookedAppointments: number
  ): Promise<CapacityRepositoryResult<StaffShift>>;

  /**
   * Cancel a shift
   *
   * @param shiftId - Shift ID
   * @param reason - Cancellation reason
   * @returns Cancelled shift or error
   */
  cancelShift(shiftId: string, reason: string): Promise<CapacityRepositoryResult<StaffShift>>;

  /**
   * Delete a shift (hard delete)
   *
   * @param shiftId - Shift ID
   * @returns Success or error
   */
  deleteShift(shiftId: string): Promise<CapacityRepositoryResult<void>>;

  // ============================================================================
  // CAPACITY PLAN OPERATIONS
  // ============================================================================

  /**
   * Create a capacity plan
   *
   * @param input - Plan creation input
   * @returns Created plan or error
   */
  createPlan(input: CreateCapacityPlanInput): Promise<CapacityRepositoryResult<CapacityPlan>>;

  /**
   * Get a capacity plan by ID
   *
   * @param planId - Plan ID
   * @returns Plan or error
   */
  getPlan(planId: string): Promise<CapacityRepositoryResult<CapacityPlan>>;

  /**
   * Get plans matching specification
   *
   * @param spec - Query specification
   * @returns Matching plans
   */
  getPlansBySpec(spec: PlanSpecification): Promise<CapacityRepositoryResult<CapacityPlan[]>>;

  /**
   * Get the latest plan for a clinic
   *
   * @param clinicId - Clinic ID
   * @returns Latest plan or error
   */
  getLatestPlan(clinicId: string): Promise<CapacityRepositoryResult<CapacityPlan | null>>;

  /**
   * Save/update a capacity plan
   *
   * @param plan - Plan to save
   * @returns Saved plan or error
   */
  savePlan(plan: CapacityPlan): Promise<CapacityRepositoryResult<CapacityPlan>>;

  // ============================================================================
  // HISTORICAL DATA OPERATIONS
  // ============================================================================

  /**
   * Record historical demand data
   *
   * @param input - Demand data input
   * @returns Success or error
   */
  recordDemand(input: RecordDemandInput): Promise<CapacityRepositoryResult<void>>;

  /**
   * Get historical demand data
   *
   * @param clinicId - Clinic ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Historical data
   */
  getHistoricalDemand(
    clinicId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CapacityRepositoryResult<HistoricalDemandData[]>>;

  // ============================================================================
  // AGGREGATE QUERIES
  // ============================================================================

  /**
   * Get daily capacity summary
   *
   * @param clinicId - Clinic ID
   * @param date - Date to query
   * @returns Daily summary
   */
  getDailyCapacity(
    clinicId: string,
    date: Date
  ): Promise<
    CapacityRepositoryResult<{
      totalSlots: number;
      bookedSlots: number;
      staffCount: number;
      shiftCount: number;
    }>
  >;

  /**
   * Get weekly capacity overview
   *
   * @param clinicId - Clinic ID
   * @param weekStartDate - Start of week
   * @returns Weekly overview
   */
  getWeeklyCapacity(
    clinicId: string,
    weekStartDate: Date
  ): Promise<
    CapacityRepositoryResult<
      {
        date: Date;
        totalSlots: number;
        bookedSlots: number;
        utilizationPercent: number;
      }[]
    >
  >;

  /**
   * Get staff availability for a date range
   *
   * @param clinicId - Clinic ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Staff availability by date
   */
  getStaffAvailability(
    clinicId: string,
    startDate: Date,
    endDate: Date
  ): Promise<
    CapacityRepositoryResult<
      Map<
        string,
        {
          staffId: string;
          staffName: string;
          staffRole: StaffRole;
          shiftCount: number;
          totalHours: number;
        }
      >
    >
  >;
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a not found error
 */
export function notFoundError(resource: string, id: string): CapacityRepositoryError {
  return {
    code: 'NOT_FOUND',
    message: `${resource} with ID '${id}' not found`,
    details: { resource, id },
  };
}

/**
 * Create a duplicate error
 */
export function duplicateError(
  resource: string,
  field: string,
  value: string
): CapacityRepositoryError {
  return {
    code: 'DUPLICATE',
    message: `${resource} with ${field} '${value}' already exists`,
    details: { resource, field, value },
  };
}

/**
 * Create a validation error
 */
export function validationError(
  message: string,
  details?: Record<string, unknown>
): CapacityRepositoryError {
  return {
    code: 'VALIDATION_ERROR',
    message,
    details,
  };
}

/**
 * Create a constraint violation error
 */
export function constraintViolationError(
  constraint: string,
  details?: Record<string, unknown>
): CapacityRepositoryError {
  return {
    code: 'CONSTRAINT_VIOLATION',
    message: `Constraint violation: ${constraint}`,
    details,
  };
}

/**
 * Create a connection error
 */
export function connectionError(message: string): CapacityRepositoryError {
  return {
    code: 'CONNECTION_ERROR',
    message,
  };
}
