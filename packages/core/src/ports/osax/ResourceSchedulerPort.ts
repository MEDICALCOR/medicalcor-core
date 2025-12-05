/**
 * @fileoverview ResourceSchedulerPort - Outbound Port for Resource Scheduling
 *
 * Hexagonal Architecture SECONDARY PORT for surgical resource management.
 * This port abstracts away the scheduling system infrastructure.
 *
 * @module core/ports/osax/resource-scheduler-port
 *
 * HEXAGONAL ARCHITECTURE:
 * - Port defined in Core layer
 * - Adapters implement this interface in Infrastructure layer
 * - Domain services depend on this port, not concrete implementations
 */

import type {
  ResourceBlock,
  ResourceType,
} from '@medicalcor/domain/osax/entities/ResourceBlock.js';

// ============================================================================
// PORT INTERFACE
// ============================================================================

/**
 * ResourceSchedulerPort - Outbound port for resource scheduling
 *
 * This interface defines how the application manages surgical resource
 * reservations (OR time, equipment, staff). Implements soft-hold pattern
 * for tentative reservations.
 *
 * @example
 * ```typescript
 * // Calendar adapter implementing this port
 * class CalendarResourceAdapter implements ResourceSchedulerPort {
 *   readonly portName = 'resource-scheduler';
 *   readonly portType = 'outbound';
 *
 *   async softHoldResources(
 *     caseId: string,
 *     resources: ResourceType[],
 *     durationMinutes: number
 *   ): Promise<ResourceBlock[]> {
 *     // Create soft-holds in calendar system
 *     const blocks = await this.calendar.createTentativeHolds(...);
 *     return blocks;
 *   }
 * }
 * ```
 */
export interface ResourceSchedulerPort {
  /**
   * Port identifier
   */
  readonly portName: 'resource-scheduler';

  /**
   * Port type (outbound = driven)
   */
  readonly portType: 'outbound';

  /**
   * Create soft-holds on surgical resources
   *
   * Soft-holds are tentative reservations that expire after a TTL
   * if not confirmed. This allows cases to reserve resources while
   * awaiting patient confirmation.
   *
   * @param caseId - Associated case identifier
   * @param resources - Array of resource types to hold
   * @param durationMinutes - Requested procedure duration
   * @param options - Optional scheduling preferences
   * @returns Array of created resource blocks
   *
   * TODO: Add OpenTelemetry span: osax.resources.softHold
   */
  softHoldResources(
    caseId: string,
    resources: ResourceType[],
    durationMinutes: number,
    options?: SoftHoldOptions
  ): Promise<ResourceBlock[]>;

  /**
   * Confirm soft-held resources
   *
   * Converts soft-holds to confirmed reservations with scheduled times.
   *
   * @param blockIds - Array of resource block IDs to confirm
   * @param scheduledStart - Confirmed start time
   * @returns Array of confirmed resource blocks
   *
   * TODO: Add OpenTelemetry span: osax.resources.confirm
   */
  confirmResources(
    blockIds: string[],
    scheduledStart: Date
  ): Promise<ResourceBlock[]>;

  /**
   * Release soft-held or confirmed resources
   *
   * Releases resources back to availability. Idempotent - calling
   * release on already-released blocks has no effect.
   *
   * @param blockIds - Array of resource block IDs to release
   * @param reason - Optional reason for release
   *
   * TODO: Add OpenTelemetry span: osax.resources.release
   */
  releaseResources(
    blockIds: string[],
    reason?: string
  ): Promise<void>;

  /**
   * Check resource availability for a date range
   *
   * @param resources - Resource types to check
   * @param dateRange - Date range to check availability
   * @returns Availability result with conflicts and suggestions
   */
  checkAvailability(
    resources: ResourceType[],
    dateRange: DateRange
  ): Promise<AvailabilityResult>;

  /**
   * Get active blocks for a case
   *
   * @param caseId - Case identifier
   * @returns Array of active resource blocks
   */
  getBlocksForCase(caseId: string): Promise<ResourceBlock[]>;

  /**
   * Health check for scheduler service
   */
  healthCheck(): Promise<SchedulerHealth>;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Options for soft-hold creation
 */
export interface SoftHoldOptions {
  /**
   * Preferred date range for scheduling
   */
  readonly preferredDateRange?: DateRange;

  /**
   * Time-to-live for soft-hold in hours (default: 72)
   */
  readonly ttlHours?: number;

  /**
   * Priority level for scheduling conflicts
   */
  readonly priority?: SchedulingPriority;

  /**
   * Notes for scheduling team
   */
  readonly notes?: string;
}

/**
 * Date range for availability checking
 */
export interface DateRange {
  /**
   * Start of date range
   */
  readonly start: Date;

  /**
   * End of date range
   */
  readonly end: Date;
}

/**
 * Scheduling priority levels
 */
export type SchedulingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

/**
 * Result of availability check
 */
export interface AvailabilityResult {
  /**
   * Whether all requested resources are available
   */
  readonly available: boolean;

  /**
   * Resources that are available
   */
  readonly availableResources: readonly ResourceType[];

  /**
   * Conflicts preventing full availability
   */
  readonly conflicts: readonly ResourceConflict[];

  /**
   * Suggested alternative time slots
   */
  readonly suggestedSlots: readonly TimeSlot[];
}

/**
 * Resource conflict details
 */
export interface ResourceConflict {
  /**
   * Resource type with conflict
   */
  readonly resourceType: ResourceType;

  /**
   * Time of conflict
   */
  readonly conflictTime: Date;

  /**
   * Reason for conflict
   */
  readonly reason: string;

  /**
   * Case ID causing conflict (if available)
   */
  readonly conflictingCaseId?: string;
}

/**
 * Suggested time slot for scheduling
 */
export interface TimeSlot {
  /**
   * Slot start time
   */
  readonly start: Date;

  /**
   * Slot end time
   */
  readonly end: Date;

  /**
   * Available resources in this slot
   */
  readonly availableResources: readonly ResourceType[];

  /**
   * Suitability score (0-1)
   */
  readonly suitabilityScore: number;
}

/**
 * Scheduler health status
 */
export interface SchedulerHealth {
  /**
   * Whether scheduler is available
   */
  readonly available: boolean;

  /**
   * Current latency in milliseconds
   */
  readonly latencyMs: number;

  /**
   * Scheduler system identifier
   */
  readonly system?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for resource scheduling
 */
export type SchedulingErrorCode =
  | 'SCHEDULER_UNAVAILABLE'
  | 'RESOURCE_NOT_FOUND'
  | 'BLOCK_NOT_FOUND'
  | 'BLOCK_EXPIRED'
  | 'CONFLICT'
  | 'INVALID_DATE_RANGE'
  | 'MAX_HOLDS_EXCEEDED'
  | 'INTERNAL_ERROR';

/**
 * Error thrown by resource scheduling
 */
export class SchedulingError extends Error {
  public readonly code: SchedulingErrorCode;
  public readonly retryable: boolean;
  public readonly conflicts?: ResourceConflict[];

  constructor(
    code: SchedulingErrorCode,
    message: string,
    retryable: boolean = false,
    conflicts?: ResourceConflict[]
  ) {
    super(message);
    this.name = 'SchedulingError';
    this.code = code;
    this.retryable = retryable;
    this.conflicts = conflicts;
    Object.setPrototypeOf(this, SchedulingError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      conflicts: this.conflicts,
    };
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum soft-hold TTL in hours (1 week)
 */
export const MAX_SOFT_HOLD_TTL_HOURS = 168;

/**
 * Default soft-hold TTL in hours (3 days)
 */
export const DEFAULT_SOFT_HOLD_TTL_HOURS = 72;

/**
 * Maximum concurrent soft-holds per case
 */
export const MAX_SOFT_HOLDS_PER_CASE = 10;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for ResourceSchedulerPort
 */
export function isResourceSchedulerPort(value: unknown): value is ResourceSchedulerPort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'portName' in value &&
    (value as ResourceSchedulerPort).portName === 'resource-scheduler' &&
    'softHoldResources' in value &&
    typeof (value as ResourceSchedulerPort).softHoldResources === 'function'
  );
}
