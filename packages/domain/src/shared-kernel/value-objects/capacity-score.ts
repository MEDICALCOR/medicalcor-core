/**
 * @fileoverview CapacityScore Value Object
 *
 * Banking/Medical Grade DDD Value Object for shift capacity planning.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/shared-kernel/value-objects/capacity-score
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two CapacityScores with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Capacity rules live here
 *
 * CAPACITY SCALE: 0-100 (utilization percentage)
 * - 0-40: UNDERUTILIZED - Has significant spare capacity
 * - 41-70: OPTIMAL - Good utilization level
 * - 71-85: HIGH - Approaching capacity limits
 * - 86-95: CRITICAL - At risk of overbooking
 * - 96-100: OVERBOOKED - Exceeds safe capacity
 */

/**
 * Capacity utilization level types
 */
export type CapacityLevel = 'UNDERUTILIZED' | 'OPTIMAL' | 'HIGH' | 'CRITICAL' | 'OVERBOOKED';

/**
 * Staffing recommendation types
 */
export type StaffingRecommendation =
  | 'REDUCE_STAFF'
  | 'MAINTAIN'
  | 'ADD_STAFF'
  | 'URGENT_STAFF_NEEDED';

/**
 * Booking status for the capacity
 */
export type BookingStatus = 'OPEN' | 'LIMITED' | 'WAITLIST_ONLY' | 'CLOSED';

/**
 * CapacityScore Value Object
 *
 * Represents a shift's capacity utilization (0-100%) with staffing recommendations.
 * This is a true Value Object following DDD principles.
 *
 * @example
 * ```typescript
 * // Create from utilization percentage
 * const capacity = CapacityScore.fromUtilization(75);
 * console.log(capacity.level); // 'HIGH'
 * console.log(capacity.canAcceptBookings()); // true
 *
 * // Create from booked/total slots
 * const shiftCapacity = CapacityScore.fromSlots(15, 20);
 * console.log(shiftCapacity.utilizationPercent); // 75
 *
 * // Business logic
 * const critical = CapacityScore.fromUtilization(90);
 * console.log(critical.staffingRecommendation); // 'URGENT_STAFF_NEEDED'
 * console.log(critical.bookingStatus); // 'WAITLIST_ONLY'
 * ```
 */
export class CapacityScore {
  /**
   * Utilization percentage (0-100)
   * Represents booked slots / total slots * 100
   */
  public readonly utilizationPercent: number;

  /**
   * Number of booked slots
   */
  public readonly bookedSlots: number;

  /**
   * Total available slots
   */
  public readonly totalSlots: number;

  /**
   * Capacity level derived from utilization
   */
  public readonly level: CapacityLevel;

  /**
   * Staffing recommendation based on capacity
   */
  public readonly staffingRecommendation: StaffingRecommendation;

  /**
   * Booking status for this capacity level
   */
  public readonly bookingStatus: BookingStatus;

  /**
   * Confidence level of the capacity calculation (0-1)
   */
  public readonly confidence: number;

  /**
   * Timestamp when capacity was calculated
   */
  public readonly calculatedAt: Date;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    utilizationPercent: number,
    bookedSlots: number,
    totalSlots: number,
    confidence: number,
    calculatedAt: Date = new Date()
  ) {
    // INVARIANT: Utilization must be between 0 and 100+ (allow slight overbooking)
    if (
      typeof utilizationPercent !== 'number' ||
      utilizationPercent < 0 ||
      utilizationPercent > 150
    ) {
      throw new InvalidCapacityScoreError(
        `Utilization must be a number between 0 and 150, got: ${utilizationPercent}`
      );
    }

    // INVARIANT: Slots must be non-negative
    if (bookedSlots < 0 || totalSlots < 0) {
      throw new InvalidCapacityScoreError(
        `Slots must be non-negative, got booked: ${bookedSlots}, total: ${totalSlots}`
      );
    }

    // INVARIANT: Confidence must be between 0 and 1
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new InvalidCapacityScoreError(
        `Confidence must be a number between 0 and 1, got: ${confidence}`
      );
    }

    this.utilizationPercent = Math.round(utilizationPercent * 10) / 10; // Round to 1 decimal
    this.bookedSlots = bookedSlots;
    this.totalSlots = totalSlots;
    this.confidence = confidence;
    this.calculatedAt = calculatedAt;
    this.level = CapacityScore.utilizationToLevel(this.utilizationPercent);
    this.staffingRecommendation = CapacityScore.determineStaffingRecommendation(this.level);
    this.bookingStatus = CapacityScore.determineBookingStatus(this.level);

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create CapacityScore from utilization percentage
   *
   * @param percent - Utilization percentage (0-150, allows overbooking detection)
   * @param confidence - Confidence level (0-1), defaults to 0.9
   * @returns CapacityScore instance
   * @throws InvalidCapacityScoreError if percent is out of range
   */
  public static fromUtilization(percent: number, confidence = 0.9): CapacityScore {
    return new CapacityScore(percent, 0, 0, confidence);
  }

  /**
   * Create CapacityScore from slot counts
   *
   * @param bookedSlots - Number of booked slots
   * @param totalSlots - Total available slots
   * @param confidence - Confidence level (0-1), defaults to 0.95
   * @returns CapacityScore instance
   */
  public static fromSlots(
    bookedSlots: number,
    totalSlots: number,
    confidence = 0.95
  ): CapacityScore {
    if (totalSlots === 0) {
      return new CapacityScore(0, 0, 0, confidence);
    }
    const utilization = (bookedSlots / totalSlots) * 100;
    return new CapacityScore(utilization, bookedSlots, totalSlots, confidence);
  }

  /**
   * Create an UNDERUTILIZED capacity score
   */
  public static underutilized(confidence = 0.9): CapacityScore {
    return new CapacityScore(30, 3, 10, confidence);
  }

  /**
   * Create an OPTIMAL capacity score
   */
  public static optimal(confidence = 0.9): CapacityScore {
    return new CapacityScore(60, 6, 10, confidence);
  }

  /**
   * Create a HIGH capacity score
   */
  public static high(confidence = 0.9): CapacityScore {
    return new CapacityScore(80, 8, 10, confidence);
  }

  /**
   * Create a CRITICAL capacity score
   */
  public static critical(confidence = 0.9): CapacityScore {
    return new CapacityScore(92, 9, 10, confidence);
  }

  /**
   * Create an OVERBOOKED capacity score
   */
  public static overbooked(confidence = 0.9): CapacityScore {
    return new CapacityScore(110, 11, 10, confidence);
  }

  /**
   * Create from level classification
   */
  public static fromLevel(level: CapacityLevel, confidence = 0.9): CapacityScore {
    const utilizationMap: Record<CapacityLevel, number> = {
      UNDERUTILIZED: 30,
      OPTIMAL: 60,
      HIGH: 80,
      CRITICAL: 92,
      OVERBOOKED: 105,
    };
    return new CapacityScore(utilizationMap[level], 0, 0, confidence);
  }

  /**
   * Parse from unknown input (for API/database hydration)
   * Returns Result to handle invalid input gracefully
   */
  public static parse(input: unknown): CapacityScoreParseResult {
    if (input instanceof CapacityScore) {
      return { success: true, value: input };
    }

    if (typeof input === 'number') {
      try {
        return { success: true, value: CapacityScore.fromUtilization(input) };
      } catch (e) {
        return {
          success: false,
          error: e instanceof InvalidCapacityScoreError ? e.message : 'Invalid capacity',
        };
      }
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;

      // Try slots-based parsing
      if ('bookedSlots' in obj && 'totalSlots' in obj) {
        const booked = typeof obj.bookedSlots === 'number' ? obj.bookedSlots : 0;
        const total = typeof obj.totalSlots === 'number' ? obj.totalSlots : 0;
        const confidence =
          'confidence' in obj && typeof obj.confidence === 'number' ? obj.confidence : 0.9;
        try {
          return { success: true, value: CapacityScore.fromSlots(booked, total, confidence) };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidCapacityScoreError ? e.message : 'Invalid capacity',
          };
        }
      }

      // Try utilization-based parsing
      if ('utilizationPercent' in obj && typeof obj.utilizationPercent === 'number') {
        const confidence =
          'confidence' in obj && typeof obj.confidence === 'number' ? obj.confidence : 0.9;
        try {
          return {
            success: true,
            value: CapacityScore.fromUtilization(obj.utilizationPercent, confidence),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidCapacityScoreError ? e.message : 'Invalid capacity',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse CapacityScore from: ${typeof input}` };
  }

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  /**
   * Convert utilization percentage to capacity level
   */
  private static utilizationToLevel(percent: number): CapacityLevel {
    if (percent <= 40) return 'UNDERUTILIZED';
    if (percent <= 70) return 'OPTIMAL';
    if (percent <= 85) return 'HIGH';
    if (percent <= 95) return 'CRITICAL';
    return 'OVERBOOKED';
  }

  /**
   * Determine staffing recommendation based on capacity level
   */
  private static determineStaffingRecommendation(level: CapacityLevel): StaffingRecommendation {
    switch (level) {
      case 'UNDERUTILIZED':
        return 'REDUCE_STAFF';
      case 'OPTIMAL':
        return 'MAINTAIN';
      case 'HIGH':
        return 'ADD_STAFF';
      case 'CRITICAL':
      case 'OVERBOOKED':
        return 'URGENT_STAFF_NEEDED';
      default: {
        // Exhaustiveness check - should never reach here
        const _exhaustive: never = level;
        return _exhaustive;
      }
    }
  }

  /**
   * Determine booking status based on capacity level
   */
  private static determineBookingStatus(level: CapacityLevel): BookingStatus {
    switch (level) {
      case 'UNDERUTILIZED':
      case 'OPTIMAL':
        return 'OPEN';
      case 'HIGH':
        return 'LIMITED';
      case 'CRITICAL':
        return 'WAITLIST_ONLY';
      case 'OVERBOOKED':
        return 'CLOSED';
      default: {
        // Exhaustiveness check - should never reach here
        const _exhaustive: never = level;
        return _exhaustive;
      }
    }
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if capacity is UNDERUTILIZED
   */
  public isUnderutilized(): boolean {
    return this.level === 'UNDERUTILIZED';
  }

  /**
   * Check if capacity is OPTIMAL
   */
  public isOptimal(): boolean {
    return this.level === 'OPTIMAL';
  }

  /**
   * Check if capacity is HIGH
   */
  public isHigh(): boolean {
    return this.level === 'HIGH';
  }

  /**
   * Check if capacity is CRITICAL
   */
  public isCritical(): boolean {
    return this.level === 'CRITICAL';
  }

  /**
   * Check if capacity is OVERBOOKED
   */
  public isOverbooked(): boolean {
    return this.level === 'OVERBOOKED';
  }

  /**
   * BUSINESS RULE: Can this shift accept new bookings?
   */
  public canAcceptBookings(): boolean {
    return this.bookingStatus !== 'CLOSED';
  }

  /**
   * BUSINESS RULE: Does this shift need additional staff?
   */
  public needsAdditionalStaff(): boolean {
    return (
      this.staffingRecommendation === 'ADD_STAFF' ||
      this.staffingRecommendation === 'URGENT_STAFF_NEEDED'
    );
  }

  /**
   * BUSINESS RULE: Should we reduce staff for this shift?
   */
  public shouldReduceStaff(): boolean {
    return this.staffingRecommendation === 'REDUCE_STAFF';
  }

  /**
   * BUSINESS RULE: Is this capacity at a concerning level?
   */
  public requiresAttention(): boolean {
    return this.isCritical() || this.isOverbooked();
  }

  /**
   * BUSINESS RULE: Get remaining available slots
   */
  public getRemainingSlots(): number {
    return Math.max(0, this.totalSlots - this.bookedSlots);
  }

  /**
   * BUSINESS RULE: Get buffer percentage (how much spare capacity)
   */
  public getBufferPercent(): number {
    return Math.max(0, 100 - this.utilizationPercent);
  }

  /**
   * BUSINESS RULE: Is this a high-confidence calculation?
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.85;
  }

  /**
   * Get recommended action based on capacity level
   */
  public getRecommendedAction(): string {
    switch (this.level) {
      case 'UNDERUTILIZED':
        return 'Consider reducing scheduled staff or promoting available slots';
      case 'OPTIMAL':
        return 'Capacity is well-balanced, maintain current staffing';
      case 'HIGH':
        return 'Monitor closely, consider adding staff if bookings increase';
      case 'CRITICAL':
        return 'Urgent: Add additional staff or limit new bookings';
      case 'OVERBOOKED':
        return 'Critical: Reschedule appointments or add emergency staff';
      default: {
        // Exhaustiveness check - should never reach here
        const _exhaustive: never = this.level;
        return _exhaustive;
      }
    }
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Add bookings to capacity
   * Returns new CapacityScore (immutability preserved)
   */
  public addBookings(count: number): CapacityScore {
    const newBooked = this.bookedSlots + count;
    return CapacityScore.fromSlots(newBooked, this.totalSlots, this.confidence);
  }

  /**
   * Remove bookings from capacity
   * Returns new CapacityScore (immutability preserved)
   */
  public removeBookings(count: number): CapacityScore {
    const newBooked = Math.max(0, this.bookedSlots - count);
    return CapacityScore.fromSlots(newBooked, this.totalSlots, this.confidence);
  }

  /**
   * Increase total capacity (add slots)
   * Returns new CapacityScore (immutability preserved)
   */
  public increaseCapacity(additionalSlots: number): CapacityScore {
    const newTotal = this.totalSlots + additionalSlots;
    return CapacityScore.fromSlots(this.bookedSlots, newTotal, this.confidence);
  }

  /**
   * Update confidence level
   * Returns new CapacityScore (immutability preserved)
   */
  public withConfidence(newConfidence: number): CapacityScore {
    return new CapacityScore(
      this.utilizationPercent,
      this.bookedSlots,
      this.totalSlots,
      newConfidence,
      this.calculatedAt
    );
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: CapacityScore): boolean {
    return (
      this.utilizationPercent === other.utilizationPercent &&
      this.bookedSlots === other.bookedSlots &&
      this.totalSlots === other.totalSlots
    );
  }

  /**
   * Compare capacities (for sorting by utilization)
   * Returns positive if this > other, negative if this < other, 0 if equal
   */
  public compareTo(other: CapacityScore): number {
    return this.utilizationPercent - other.utilizationPercent;
  }

  /**
   * Check if this capacity is higher than another
   */
  public isHigherThan(other: CapacityScore): boolean {
    return this.utilizationPercent > other.utilizationPercent;
  }

  /**
   * Check if this capacity is lower than another
   */
  public isLowerThan(other: CapacityScore): boolean {
    return this.utilizationPercent < other.utilizationPercent;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): CapacityScoreDTO {
    return {
      utilizationPercent: this.utilizationPercent,
      bookedSlots: this.bookedSlots,
      totalSlots: this.totalSlots,
      level: this.level,
      staffingRecommendation: this.staffingRecommendation,
      bookingStatus: this.bookingStatus,
      confidence: this.confidence,
      calculatedAt: this.calculatedAt.toISOString(),
    };
  }

  /**
   * Convert to primitive (for database storage)
   */
  public toPrimitive(): number {
    return this.utilizationPercent;
  }

  /**
   * String representation
   */
  public toString(): string {
    return `CapacityScore(${this.utilizationPercent}% ${this.level}, ${this.bookedSlots}/${this.totalSlots} slots, status: ${this.bookingStatus})`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid CapacityScore
 */
export class InvalidCapacityScoreError extends Error {
  public readonly code = 'INVALID_CAPACITY_SCORE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidCapacityScoreError';
    Object.setPrototypeOf(this, InvalidCapacityScoreError.prototype);
  }
}

/**
 * DTO for CapacityScore serialization
 */
export interface CapacityScoreDTO {
  utilizationPercent: number;
  bookedSlots: number;
  totalSlots: number;
  level: CapacityLevel;
  staffingRecommendation: StaffingRecommendation;
  bookingStatus: BookingStatus;
  confidence: number;
  calculatedAt: string;
}

/**
 * Parse result type
 */
export type CapacityScoreParseResult =
  | { success: true; value: CapacityScore }
  | { success: false; error: string };
