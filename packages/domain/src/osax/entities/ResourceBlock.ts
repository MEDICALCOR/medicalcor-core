/**
 * @fileoverview ResourceBlock Entity
 *
 * Banking/Medical Grade DDD Entity for surgical resource soft-holds.
 * Represents a time-limited reservation of surgical resources.
 *
 * @module domain/osax/entities/resource-block
 *
 * DESIGN PRINCIPLES:
 * 1. ENTITY - Has unique identity (id), mutable state
 * 2. INVARIANT PROTECTION - Business rules enforced at all times
 * 3. STATE MACHINE - Valid status transitions only
 * 4. ZERO INFRASTRUCTURE - No external dependencies (DDD pure domain)
 *
 * BUSINESS CONTEXT:
 * A ResourceBlock represents a soft-hold on surgical resources (OR time,
 * equipment, staff). Soft-holds expire after a configured TTL and can be
 * confirmed or released.
 */

// ============================================================================
// DOMAIN TYPES (ZERO EXTERNAL DEPENDENCIES)
// ============================================================================

/**
 * Types of surgical resources that can be reserved
 */
export type ResourceType =
  | 'OR_TIME' // Operating room time slot
  | 'CBCT_MACHINE' // CBCT imaging equipment
  | 'SURGICAL_KIT' // Surgical instrument kit
  | 'SPECIALIST' // Specialist surgeon time
  | 'ANESTHESIOLOGIST' // Anesthesiologist time
  | 'DENTAL_CHAIR' // Dental chair/operatory
  | 'IMPLANT_KIT'; // Implant surgical kit

/**
 * Status of a resource block
 */
export type ResourceBlockStatus =
  | 'SOFT_HELD' // Reserved but not confirmed
  | 'CONFIRMED' // Confirmed and scheduled
  | 'RELEASED' // Released/cancelled
  | 'EXPIRED'; // TTL expired without confirmation

/**
 * Default soft-hold TTL in hours
 */
const DEFAULT_SOFT_HOLD_TTL_HOURS = 72;

/**
 * Valid status transitions
 */
const VALID_STATUS_TRANSITIONS: Record<ResourceBlockStatus, readonly ResourceBlockStatus[]> = {
  SOFT_HELD: ['CONFIRMED', 'RELEASED', 'EXPIRED'],
  CONFIRMED: ['RELEASED'],
  RELEASED: [],
  EXPIRED: [],
};

// ============================================================================
// ENTITY IMPLEMENTATION
// ============================================================================

/**
 * ResourceBlock Entity
 *
 * Represents a soft-hold on surgical resources for a case.
 *
 * Features:
 * - Unique identity (id)
 * - State machine for status transitions
 * - TTL-based expiration
 * - Immutable ID, mutable status
 *
 * @example
 * ```typescript
 * // Create a new resource block
 * const block = ResourceBlock.create({
 *   caseId: 'case-123',
 *   resourceType: 'OR_TIME',
 *   durationMinutes: 90,
 * });
 *
 * console.log(block.status); // 'SOFT_HELD'
 * console.log(block.isExpired()); // false
 *
 * // Confirm the block
 * block.confirm(new Date('2025-12-10T09:00:00Z'));
 * console.log(block.status); // 'CONFIRMED'
 *
 * // Release the block
 * block.release();
 * console.log(block.status); // 'RELEASED'
 * ```
 */
export class ResourceBlock {
  // ============================================================================
  // PROPERTIES
  // ============================================================================

  /**
   * Unique identifier (immutable)
   */
  public readonly id: string;

  /**
   * Associated case ID (immutable)
   */
  public readonly caseId: string;

  /**
   * Type of resource being held (immutable)
   */
  public readonly resourceType: ResourceType;

  /**
   * Requested duration in minutes (immutable)
   */
  public readonly durationMinutes: number;

  /**
   * Creation timestamp (immutable)
   */
  public readonly createdAt: Date;

  /**
   * Expiration timestamp for soft-hold (immutable)
   */
  public readonly expiresAt: Date;

  /**
   * Current status (mutable via state transitions)
   */
  private _status: ResourceBlockStatus;

  /**
   * Scheduled start time (set on confirmation)
   */
  private _scheduledStart?: Date;

  /**
   * Last update timestamp
   */
  private _updatedAt: Date;

  /**
   * Release reason (set on release)
   */
  private _releaseReason?: string;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Private constructor - use factory methods
   */
  private constructor(
    id: string,
    caseId: string,
    resourceType: ResourceType,
    durationMinutes: number,
    expiresAt: Date,
    createdAt: Date = new Date()
  ) {
    this.id = id;
    this.caseId = caseId;
    this.resourceType = resourceType;
    this.durationMinutes = durationMinutes;
    this.expiresAt = expiresAt;
    this.createdAt = createdAt;
    this._status = 'SOFT_HELD';
    this._updatedAt = createdAt;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  /**
   * Current status
   */
  public get status(): ResourceBlockStatus {
    return this._status;
  }

  /**
   * Scheduled start time (if confirmed)
   */
  public get scheduledStart(): Date | undefined {
    return this._scheduledStart;
  }

  /**
   * Last update timestamp
   */
  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Release reason (if released)
   */
  public get releaseReason(): string | undefined {
    return this._releaseReason;
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new ResourceBlock
   *
   * @param input - Creation input
   * @returns New ResourceBlock instance
   * @throws InvalidResourceBlockError if input is invalid
   */
  public static create(input: CreateResourceBlockInput): ResourceBlock {
    // Validate input
    ResourceBlock.validateInput(input);

    // Generate ID
    const id = input.id ?? ResourceBlock.generateId();

    // Calculate expiration
    const createdAt = input.createdAt ?? new Date();
    const ttlHours = input.ttlHours ?? DEFAULT_SOFT_HOLD_TTL_HOURS;
    const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);

    return new ResourceBlock(
      id,
      input.caseId,
      input.resourceType,
      input.durationMinutes,
      expiresAt,
      createdAt
    );
  }

  /**
   * Reconstitute from database/DTO
   */
  public static reconstitute(dto: ResourceBlockDTO): ResourceBlock {
    if (!dto || typeof dto !== 'object') {
      throw new InvalidResourceBlockError('Invalid DTO: must be an object', {
        field: 'dto',
        value: dto,
      });
    }

    const createdAt = typeof dto.createdAt === 'string' ? new Date(dto.createdAt) : dto.createdAt;
    const expiresAt = typeof dto.expiresAt === 'string' ? new Date(dto.expiresAt) : dto.expiresAt;

    const block = new ResourceBlock(
      dto.id,
      dto.caseId,
      dto.resourceType,
      dto.durationMinutes,
      expiresAt,
      createdAt
    );

    // Restore state
    block._status = dto.status;
    block._updatedAt =
      typeof dto.updatedAt === 'string' ? new Date(dto.updatedAt) : dto.updatedAt;

    if (dto.scheduledStart) {
      block._scheduledStart =
        typeof dto.scheduledStart === 'string' ? new Date(dto.scheduledStart) : dto.scheduledStart;
    }

    if (dto.releaseReason) {
      block._releaseReason = dto.releaseReason;
    }

    return block;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate creation input
   */
  private static validateInput(input: CreateResourceBlockInput): void {
    // Validate caseId
    if (!input.caseId || typeof input.caseId !== 'string') {
      throw new InvalidResourceBlockError('caseId is required', {
        field: 'caseId',
        value: input.caseId,
      });
    }

    // Validate resourceType
    const validTypes: ResourceType[] = [
      'OR_TIME',
      'CBCT_MACHINE',
      'SURGICAL_KIT',
      'SPECIALIST',
      'ANESTHESIOLOGIST',
      'DENTAL_CHAIR',
      'IMPLANT_KIT',
    ];
    if (!validTypes.includes(input.resourceType)) {
      throw new InvalidResourceBlockError(`Invalid resourceType: ${input.resourceType}`, {
        field: 'resourceType',
        value: input.resourceType,
        allowed: validTypes,
      });
    }

    // Validate durationMinutes
    if (
      typeof input.durationMinutes !== 'number' ||
      input.durationMinutes <= 0 ||
      input.durationMinutes > 480 // Max 8 hours
    ) {
      throw new InvalidResourceBlockError(
        'durationMinutes must be a positive number up to 480 (8 hours)',
        { field: 'durationMinutes', value: input.durationMinutes }
      );
    }

    // Validate ttlHours if provided
    if (input.ttlHours !== undefined) {
      if (typeof input.ttlHours !== 'number' || input.ttlHours <= 0 || input.ttlHours > 168) {
        throw new InvalidResourceBlockError('ttlHours must be between 1 and 168 (1 week)', {
          field: 'ttlHours',
          value: input.ttlHours,
        });
      }
    }
  }

  /**
   * Generate a unique ID
   */
  private static generateId(): string {
    const cryptoObj = globalThis.crypto;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fallback for older environments
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return `rb-${cryptoObj.randomUUID()}`;
    }
    // Fallback
    return `rb-${'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })}`;
  }

  // ============================================================================
  // STATE TRANSITIONS
  // ============================================================================

  /**
   * Check if a status transition is valid
   */
  private canTransitionTo(newStatus: ResourceBlockStatus): boolean {
    return VALID_STATUS_TRANSITIONS[this._status].includes(newStatus);
  }

  /**
   * Confirm the resource block
   *
   * @param scheduledStart - The scheduled start time
   * @throws InvalidResourceBlockTransitionError if transition is invalid
   */
  public confirm(scheduledStart: Date): void {
    if (!this.canTransitionTo('CONFIRMED')) {
      throw new InvalidResourceBlockTransitionError(
        `Cannot confirm from status: ${this._status}`,
        { currentStatus: this._status, targetStatus: 'CONFIRMED' }
      );
    }

    if (this.isExpired()) {
      throw new InvalidResourceBlockTransitionError(
        'Cannot confirm expired resource block',
        { currentStatus: this._status, reason: 'expired' }
      );
    }

    if (!scheduledStart || !(scheduledStart instanceof Date) || isNaN(scheduledStart.getTime())) {
      throw new InvalidResourceBlockError('scheduledStart must be a valid date', {
        field: 'scheduledStart',
        value: scheduledStart,
      });
    }

    this._status = 'CONFIRMED';
    this._scheduledStart = scheduledStart;
    this._updatedAt = new Date();
  }

  /**
   * Release the resource block
   *
   * @param reason - Optional reason for release
   */
  public release(reason?: string): void {
    if (!this.canTransitionTo('RELEASED')) {
      throw new InvalidResourceBlockTransitionError(
        `Cannot release from status: ${this._status}`,
        { currentStatus: this._status, targetStatus: 'RELEASED' }
      );
    }

    this._status = 'RELEASED';
    this._releaseReason = reason;
    this._updatedAt = new Date();
  }

  /**
   * Mark as expired (called by expiration job)
   */
  public markExpired(): void {
    if (!this.canTransitionTo('EXPIRED')) {
      throw new InvalidResourceBlockTransitionError(
        `Cannot expire from status: ${this._status}`,
        { currentStatus: this._status, targetStatus: 'EXPIRED' }
      );
    }

    this._status = 'EXPIRED';
    this._updatedAt = new Date();
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if the block has expired
   */
  public isExpired(): boolean {
    if (this._status === 'EXPIRED') return true;
    if (this._status === 'SOFT_HELD') {
      return new Date() > this.expiresAt;
    }
    return false;
  }

  /**
   * Check if the block is active (soft-held or confirmed)
   */
  public isActive(): boolean {
    return (
      (this._status === 'SOFT_HELD' && !this.isExpired()) || this._status === 'CONFIRMED'
    );
  }

  /**
   * Check if the block is soft-held (not yet confirmed)
   */
  public isSoftHeld(): boolean {
    return this._status === 'SOFT_HELD' && !this.isExpired();
  }

  /**
   * Check if the block is confirmed
   */
  public isConfirmed(): boolean {
    return this._status === 'CONFIRMED';
  }

  /**
   * Check if the block is released
   */
  public isReleased(): boolean {
    return this._status === 'RELEASED';
  }

  /**
   * Get time remaining until expiration (for soft-held blocks)
   */
  public getTimeRemainingMs(): number {
    if (this._status !== 'SOFT_HELD') return 0;
    const remaining = this.expiresAt.getTime() - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Get scheduled end time (if confirmed)
   */
  public getScheduledEnd(): Date | undefined {
    if (!this._scheduledStart) return undefined;
    return new Date(this._scheduledStart.getTime() + this.durationMinutes * 60 * 1000);
  }

  /**
   * Get human-readable resource description
   */
  public getResourceDescription(): string {
    const descriptions: Record<ResourceType, string> = {
      OR_TIME: 'Operating Room Time',
      CBCT_MACHINE: 'CBCT Scanner',
      SURGICAL_KIT: 'Surgical Instrument Kit',
      SPECIALIST: 'Specialist Surgeon',
      ANESTHESIOLOGIST: 'Anesthesiologist',
      DENTAL_CHAIR: 'Dental Operatory',
      IMPLANT_KIT: 'Implant Surgical Kit',
    };
    return descriptions[this.resourceType];
  }

  // ============================================================================
  // EQUALITY
  // ============================================================================

  /**
   * Entity equality by ID
   */
  public equals(other: ResourceBlock | null | undefined): boolean {
    if (!other) return false;
    return this.id === other.id;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): ResourceBlockDTO {
    const dto: ResourceBlockDTO = {
      id: this.id,
      caseId: this.caseId,
      resourceType: this.resourceType,
      status: this._status,
      durationMinutes: this.durationMinutes,
      expiresAt: this.expiresAt.toISOString(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };

    if (this._scheduledStart) {
      (dto as { scheduledStart?: string }).scheduledStart = this._scheduledStart.toISOString();
    }

    if (this._releaseReason) {
      (dto as { releaseReason?: string }).releaseReason = this._releaseReason;
    }

    return dto;
  }

  /**
   * String representation for debugging/logging
   */
  public toString(): string {
    return `ResourceBlock(id: ${this.id}, type: ${this.resourceType}, status: ${this._status}, duration: ${this.durationMinutes}min)`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Input for creating ResourceBlock
 */
export interface CreateResourceBlockInput {
  /** Optional ID (auto-generated if not provided) */
  readonly id?: string;

  /** Associated case ID */
  readonly caseId: string;

  /** Resource type to hold */
  readonly resourceType: ResourceType;

  /** Requested duration in minutes */
  readonly durationMinutes: number;

  /** TTL in hours for soft-hold (default: 72) */
  readonly ttlHours?: number;

  /** Creation timestamp (default: now) */
  readonly createdAt?: Date;
}

/**
 * DTO for ResourceBlock serialization
 */
export interface ResourceBlockDTO {
  readonly id: string;
  readonly caseId: string;
  readonly resourceType: ResourceType;
  readonly status: ResourceBlockStatus;
  readonly durationMinutes: number;
  readonly scheduledStart?: string | Date;
  readonly expiresAt: string | Date;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
  readonly releaseReason?: string;
}

/**
 * Error thrown when creating invalid ResourceBlock
 */
export class InvalidResourceBlockError extends Error {
  public readonly code = 'INVALID_RESOURCE_BLOCK' as const;
  public readonly details: InvalidResourceBlockErrorDetails;

  constructor(message: string, details: InvalidResourceBlockErrorDetails = {}) {
    super(message);
    this.name = 'InvalidResourceBlockError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidResourceBlockError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export interface InvalidResourceBlockErrorDetails {
  field?: string;
  value?: unknown;
  allowed?: readonly string[];
}

/**
 * Error thrown for invalid status transitions
 */
export class InvalidResourceBlockTransitionError extends Error {
  public readonly code = 'INVALID_RESOURCE_BLOCK_TRANSITION' as const;
  public readonly details: {
    currentStatus: ResourceBlockStatus;
    targetStatus?: ResourceBlockStatus;
    reason?: string;
  };

  constructor(
    message: string,
    details: { currentStatus: ResourceBlockStatus; targetStatus?: ResourceBlockStatus; reason?: string }
  ) {
    super(message);
    this.name = 'InvalidResourceBlockTransitionError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidResourceBlockTransitionError.prototype);
  }
}

/**
 * Type guard for ResourceBlock
 */
export function isResourceBlock(value: unknown): value is ResourceBlock {
  return value instanceof ResourceBlock;
}
