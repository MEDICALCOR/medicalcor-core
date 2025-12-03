/**
 * @fileoverview LeadScore Value Object
 *
 * Banking/Medical Grade DDD Value Object for lead classification.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/shared-kernel/value-objects/lead-score
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two LeadScores with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Classification rules live here
 */

/**
 * Lead classification levels
 * Based on dental implant clinic CRM requirements
 */
export type LeadClassification = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/**
 * LeadScore Value Object
 *
 * Represents a lead's qualification score (1-5) with associated classification.
 * This is a true Value Object following DDD principles:
 * - Immutable (all properties readonly)
 * - Self-validating (throws on invalid input)
 * - Equality by value (equals method)
 * - Business logic encapsulated (scoring rules)
 *
 * @example
 * ```typescript
 * // Create from numeric score
 * const score = LeadScore.fromNumeric(4);
 * console.log(score.classification); // 'HOT'
 * console.log(score.isHot()); // true
 *
 * // Create from classification
 * const hotLead = LeadScore.hot();
 * console.log(hotLead.numericValue); // 4
 *
 * // Comparison
 * const score1 = LeadScore.fromNumeric(4);
 * const score2 = LeadScore.fromNumeric(4);
 * console.log(score1.equals(score2)); // true
 *
 * // Business logic
 * const cold = LeadScore.cold();
 * console.log(cold.requiresNurturing()); // true
 * console.log(cold.requiresImmediateAttention()); // false
 * ```
 */
export class LeadScore {
  /**
   * Numeric score value (1-5)
   * - 5: Maximum qualification (explicit intent + budget + urgency)
   * - 4: High qualification (explicit interest + some signals)
   * - 3: Medium qualification (general interest)
   * - 2: Low qualification (early research stage)
   * - 1: Unqualified (not a fit)
   */
  public readonly numericValue: number;

  /**
   * Classification derived from numeric score
   */
  public readonly classification: LeadClassification;

  /**
   * Confidence level of the scoring (0-1)
   * AI scoring typically has higher confidence (0.8-0.95)
   * Rule-based fallback has lower confidence (0.6-0.7)
   */
  public readonly confidence: number;

  /**
   * Timestamp when score was calculated
   */
  public readonly scoredAt: Date;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    numericValue: number,
    confidence: number,
    scoredAt: Date = new Date()
  ) {
    // INVARIANT: Score must be between 1 and 5 (inclusive)
    if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 5) {
      throw new InvalidLeadScoreError(
        `Lead score must be an integer between 1 and 5, got: ${numericValue}`
      );
    }

    // INVARIANT: Confidence must be between 0 and 1 (inclusive)
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new InvalidLeadScoreError(
        `Confidence must be a number between 0 and 1, got: ${confidence}`
      );
    }

    this.numericValue = numericValue;
    this.confidence = confidence;
    this.scoredAt = scoredAt;
    this.classification = LeadScore.numericToClassification(numericValue);

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create LeadScore from numeric value
   *
   * @param value - Numeric score (1-5)
   * @param confidence - Confidence level (0-1), defaults to 0.8
   * @returns LeadScore instance
   * @throws InvalidLeadScoreError if value is out of range
   */
  public static fromNumeric(value: number, confidence: number = 0.8): LeadScore {
    return new LeadScore(value, confidence);
  }

  /**
   * Create HOT lead score (4-5)
   *
   * @param isMaxQualified - If true, creates score 5 (max); otherwise 4
   * @param confidence - Confidence level, defaults to 0.85
   */
  public static hot(isMaxQualified: boolean = false, confidence: number = 0.85): LeadScore {
    return new LeadScore(isMaxQualified ? 5 : 4, confidence);
  }

  /**
   * Create WARM lead score (3)
   */
  public static warm(confidence: number = 0.8): LeadScore {
    return new LeadScore(3, confidence);
  }

  /**
   * Create COLD lead score (2)
   */
  public static cold(confidence: number = 0.75): LeadScore {
    return new LeadScore(2, confidence);
  }

  /**
   * Create UNQUALIFIED lead score (1)
   */
  public static unqualified(confidence: number = 0.7): LeadScore {
    return new LeadScore(1, confidence);
  }

  /**
   * Create from classification string
   *
   * @param classification - Lead classification (HOT, WARM, COLD, UNQUALIFIED)
   * @param confidence - Confidence level (0-1), defaults to 0.8
   * @param isMaxQualified - For HOT classification, if true creates score 5 (max); otherwise 4
   *                         This parameter is ignored for non-HOT classifications
   *
   * Note: HOT classification maps to scores 4-5. Use isMaxQualified=true for score 5
   * when the lead has explicit intent + budget + urgency signals.
   */
  public static fromClassification(
    classification: LeadClassification,
    confidence: number = 0.8,
    isMaxQualified: boolean = false
  ): LeadScore {
    const numericMap: Record<LeadClassification, number> = {
      HOT: isMaxQualified ? 5 : 4, // HOT can be 4 or 5 based on qualification level
      WARM: 3,
      COLD: 2,
      UNQUALIFIED: 1,
    };
    return new LeadScore(numericMap[classification], confidence);
  }

  /**
   * Parse from unknown input (for API/database hydration)
   * Returns Result to handle invalid input gracefully
   */
  public static parse(input: unknown): LeadScoreParseResult {
    if (input instanceof LeadScore) {
      return { success: true, value: input };
    }

    if (typeof input === 'number') {
      try {
        return { success: true, value: LeadScore.fromNumeric(input) };
      } catch (e) {
        return {
          success: false,
          error: e instanceof InvalidLeadScoreError ? e.message : 'Invalid score',
        };
      }
    }

    if (typeof input === 'string') {
      const asNumber = parseInt(input, 10);
      if (!isNaN(asNumber)) {
        try {
          return { success: true, value: LeadScore.fromNumeric(asNumber) };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidLeadScoreError ? e.message : 'Invalid score',
          };
        }
      }

      // Try as classification
      const upper = input.toUpperCase() as LeadClassification;
      if (['HOT', 'WARM', 'COLD', 'UNQUALIFIED'].includes(upper)) {
        return { success: true, value: LeadScore.fromClassification(upper) };
      }
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if ('numericValue' in obj && typeof obj.numericValue === 'number') {
        try {
          const confidence =
            'confidence' in obj && typeof obj.confidence === 'number'
              ? obj.confidence
              : 0.8;
          return { success: true, value: LeadScore.fromNumeric(obj.numericValue, confidence) };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidLeadScoreError ? e.message : 'Invalid score',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse LeadScore from: ${typeof input}` };
  }

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  /**
   * Convert numeric score to classification
   *
   * BUSINESS RULES (Dental CRM):
   * - 4-5: HOT - Explicit interest + budget/urgency signals
   * - 3: WARM - General interest, needs nurturing
   * - 2: COLD - Early research, minimal engagement
   * - 1: UNQUALIFIED - Not a fit for services
   */
  private static numericToClassification(value: number): LeadClassification {
    if (value >= 4) return 'HOT';
    if (value === 3) return 'WARM';
    if (value === 2) return 'COLD';
    return 'UNQUALIFIED';
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if lead is HOT (requires immediate attention)
   */
  public isHot(): boolean {
    return this.classification === 'HOT';
  }

  /**
   * Check if lead is WARM (has potential)
   */
  public isWarm(): boolean {
    return this.classification === 'WARM';
  }

  /**
   * Check if lead is COLD (needs nurturing)
   */
  public isCold(): boolean {
    return this.classification === 'COLD';
  }

  /**
   * Check if lead is UNQUALIFIED
   */
  public isUnqualified(): boolean {
    return this.classification === 'UNQUALIFIED';
  }

  /**
   * BUSINESS RULE: Does this lead require immediate attention?
   * HOT leads should be contacted within 5 minutes
   */
  public requiresImmediateAttention(): boolean {
    return this.isHot();
  }

  /**
   * BUSINESS RULE: Does this lead require nurturing sequence?
   * COLD and WARM leads benefit from automated nurturing
   */
  public requiresNurturing(): boolean {
    return this.isCold() || this.isWarm();
  }

  /**
   * BUSINESS RULE: Should this lead be auto-assigned to sales?
   * Only HOT leads get auto-assigned
   */
  public shouldAutoAssignToSales(): boolean {
    return this.isHot();
  }

  /**
   * BUSINESS RULE: Is the score high confidence?
   * AI scoring typically produces higher confidence
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * BUSINESS RULE: Get SLA response time in minutes
   */
  public getSLAResponseTimeMinutes(): number {
    switch (this.classification) {
      case 'HOT':
        return 5; // 5 minutes for hot leads
      case 'WARM':
        return 60; // 1 hour for warm leads
      case 'COLD':
        return 1440; // 24 hours for cold leads
      case 'UNQUALIFIED':
        return 4320; // 72 hours for unqualified
    }
  }

  /**
   * BUSINESS RULE: Get priority level for task assignment
   */
  public getTaskPriority(): 'critical' | 'high' | 'medium' | 'low' {
    switch (this.classification) {
      case 'HOT':
        return this.numericValue === 5 ? 'critical' : 'high';
      case 'WARM':
        return 'medium';
      case 'COLD':
      case 'UNQUALIFIED':
        return 'low';
    }
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Boost the score by specified amount
   * Returns new LeadScore (immutability preserved)
   *
   * @param amount - Amount to boost (1-4)
   * @param reason - Reason for boost (for audit)
   */
  public boost(amount: number = 1): LeadScore {
    const newValue = Math.min(this.numericValue + amount, 5);
    return new LeadScore(newValue, this.confidence);
  }

  /**
   * Decrease the score by specified amount
   * Returns new LeadScore (immutability preserved)
   */
  public decrease(amount: number = 1): LeadScore {
    const newValue = Math.max(this.numericValue - amount, 1);
    return new LeadScore(newValue, this.confidence);
  }

  /**
   * Update confidence level
   * Returns new LeadScore (immutability preserved)
   */
  public withConfidence(newConfidence: number): LeadScore {
    return new LeadScore(this.numericValue, newConfidence, this.scoredAt);
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: LeadScore): boolean {
    return (
      this.numericValue === other.numericValue &&
      this.classification === other.classification
    );
  }

  /**
   * Compare scores (for sorting)
   * Returns positive if this > other, negative if this < other, 0 if equal
   */
  public compareTo(other: LeadScore): number {
    return this.numericValue - other.numericValue;
  }

  /**
   * Check if this score is higher than another
   */
  public isHigherThan(other: LeadScore): boolean {
    return this.numericValue > other.numericValue;
  }

  /**
   * Check if this score is lower than another
   */
  public isLowerThan(other: LeadScore): boolean {
    return this.numericValue < other.numericValue;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): LeadScoreDTO {
    return {
      numericValue: this.numericValue,
      classification: this.classification,
      confidence: this.confidence,
      scoredAt: this.scoredAt.toISOString(),
    };
  }

  /**
   * Convert to primitive (for database storage)
   */
  public toPrimitive(): number {
    return this.numericValue;
  }

  /**
   * String representation
   */
  public toString(): string {
    return `LeadScore(${this.numericValue}/${this.classification}, confidence: ${(this.confidence * 100).toFixed(0)}%)`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid LeadScore
 */
export class InvalidLeadScoreError extends Error {
  public readonly code = 'INVALID_LEAD_SCORE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidLeadScoreError';
    Object.setPrototypeOf(this, InvalidLeadScoreError.prototype);
  }
}

/**
 * DTO for LeadScore serialization
 */
export interface LeadScoreDTO {
  numericValue: number;
  classification: LeadClassification;
  confidence: number;
  scoredAt: string;
}

/**
 * Parse result type
 */
export type LeadScoreParseResult =
  | { success: true; value: LeadScore }
  | { success: false; error: string };
