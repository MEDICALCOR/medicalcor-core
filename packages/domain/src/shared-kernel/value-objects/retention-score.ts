/**
 * @fileoverview RetentionScore Value Object
 *
 * Banking/Medical Grade DDD Value Object for patient retention prediction.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/shared-kernel/value-objects/retention-score
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two RetentionScores with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Churn prediction rules live here
 *
 * SCORING SCALE: 0-100 (probability of patient returning)
 * - 80-100: LOYAL - Low churn risk
 * - 60-79: STABLE - Monitor, minimal intervention
 * - 40-59: AT_RISK - Proactive outreach needed
 * - 20-39: CHURNING - Urgent intervention required
 * - 0-19: LOST - Recovery campaign needed
 */

/**
 * Churn risk level types (same as @medicalcor/types ChurnRiskLevel)
 */
export type ChurnRiskLevel = 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';

/**
 * Follow-up priority types (same as @medicalcor/types FollowUpPriority)
 */
export type FollowUpPriority = 'URGENTA' | 'RIDICATA' | 'MEDIE' | 'SCAZUTA';

/**
 * Retention classification types
 */
export type RetentionClassification = 'LOYAL' | 'STABLE' | 'AT_RISK' | 'CHURNING' | 'LOST';

/**
 * RetentionScore Value Object
 *
 * Represents a patient's retention score (0-100) with churn risk classification.
 * This is a true Value Object following DDD principles.
 *
 * @example
 * ```typescript
 * // Create from numeric score
 * const score = RetentionScore.fromNumeric(75);
 * console.log(score.classification); // 'STABLE'
 * console.log(score.isAtRisk()); // false
 *
 * // Create from classification
 * const atRisk = RetentionScore.atRisk();
 * console.log(atRisk.numericValue); // 50
 *
 * // Business logic
 * const churning = RetentionScore.fromNumeric(25);
 * console.log(churning.requiresUrgentIntervention()); // true
 * console.log(churning.getSuggestedActions()); // ['immediate_outreach', ...]
 * ```
 */
export class RetentionScore {
  /**
   * Numeric score value (0-100)
   * Represents the probability percentage of patient retention
   */
  public readonly numericValue: number;

  /**
   * Classification derived from numeric score
   */
  public readonly classification: RetentionClassification;

  /**
   * Churn risk level
   */
  public readonly churnRisk: ChurnRiskLevel;

  /**
   * Recommended follow-up priority
   */
  public readonly followUpPriority: FollowUpPriority;

  /**
   * Confidence level of the prediction (0-1)
   */
  public readonly confidence: number;

  /**
   * Timestamp when score was calculated
   */
  public readonly calculatedAt: Date;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    numericValue: number,
    confidence: number,
    lifetimeValue = 0,
    calculatedAt: Date = new Date()
  ) {
    // INVARIANT: Score must be between 0 and 100 (inclusive)
    if (typeof numericValue !== 'number' || numericValue < 0 || numericValue > 100) {
      throw new InvalidRetentionScoreError(
        `Retention score must be a number between 0 and 100, got: ${numericValue}`
      );
    }

    // INVARIANT: Confidence must be between 0 and 1 (inclusive)
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new InvalidRetentionScoreError(
        `Confidence must be a number between 0 and 1, got: ${confidence}`
      );
    }

    this.numericValue = Math.round(numericValue); // Round to integer
    this.confidence = confidence;
    this.calculatedAt = calculatedAt;
    this.classification = RetentionScore.scoreToClassification(this.numericValue);
    this.churnRisk = RetentionScore.scoreToChurnRisk(this.numericValue);
    this.followUpPriority = RetentionScore.determineFollowUpPriority(this.churnRisk, lifetimeValue);

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create RetentionScore from numeric value
   *
   * @param value - Numeric score (0-100)
   * @param confidence - Confidence level (0-1), defaults to 0.8
   * @param lifetimeValue - Customer LTV for priority calculation
   * @returns RetentionScore instance
   * @throws InvalidRetentionScoreError if value is out of range
   */
  public static fromNumeric(value: number, confidence = 0.8, lifetimeValue = 0): RetentionScore {
    return new RetentionScore(value, confidence, lifetimeValue);
  }

  /**
   * Create a LOYAL retention score (high retention)
   */
  public static loyal(confidence = 0.85): RetentionScore {
    return new RetentionScore(90, confidence);
  }

  /**
   * Create a STABLE retention score
   */
  public static stable(confidence = 0.8): RetentionScore {
    return new RetentionScore(70, confidence);
  }

  /**
   * Create an AT_RISK retention score
   */
  public static atRisk(confidence = 0.75): RetentionScore {
    return new RetentionScore(50, confidence);
  }

  /**
   * Create a CHURNING retention score
   */
  public static churning(confidence = 0.75): RetentionScore {
    return new RetentionScore(30, confidence);
  }

  /**
   * Create a LOST retention score
   */
  public static lost(confidence = 0.7): RetentionScore {
    return new RetentionScore(10, confidence);
  }

  /**
   * Create from classification string
   */
  public static fromClassification(
    classification: RetentionClassification,
    confidence = 0.8
  ): RetentionScore {
    const valueMap: Record<RetentionClassification, number> = {
      LOYAL: 90,
      STABLE: 70,
      AT_RISK: 50,
      CHURNING: 30,
      LOST: 10,
    };
    return new RetentionScore(valueMap[classification], confidence);
  }

  /**
   * Parse from unknown input (for API/database hydration)
   * Returns Result to handle invalid input gracefully
   */
  public static parse(input: unknown): RetentionScoreParseResult {
    if (input instanceof RetentionScore) {
      return { success: true, value: input };
    }

    if (typeof input === 'number') {
      try {
        return { success: true, value: RetentionScore.fromNumeric(input) };
      } catch (e) {
        return {
          success: false,
          error: e instanceof InvalidRetentionScoreError ? e.message : 'Invalid score',
        };
      }
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if ('numericValue' in obj && typeof obj.numericValue === 'number') {
        try {
          const confidence =
            'confidence' in obj && typeof obj.confidence === 'number' ? obj.confidence : 0.8;
          const lifetimeValue =
            'lifetimeValue' in obj && typeof obj.lifetimeValue === 'number' ? obj.lifetimeValue : 0;
          return {
            success: true,
            value: RetentionScore.fromNumeric(obj.numericValue, confidence, lifetimeValue),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidRetentionScoreError ? e.message : 'Invalid score',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse RetentionScore from: ${typeof input}` };
  }

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  /**
   * Convert numeric score to classification
   */
  private static scoreToClassification(value: number): RetentionClassification {
    if (value >= 80) return 'LOYAL';
    if (value >= 60) return 'STABLE';
    if (value >= 40) return 'AT_RISK';
    if (value >= 20) return 'CHURNING';
    return 'LOST';
  }

  /**
   * Convert numeric score to churn risk level
   */
  private static scoreToChurnRisk(value: number): ChurnRiskLevel {
    if (value >= 80) return 'SCAZUT'; // Low risk
    if (value >= 50) return 'MEDIU'; // Medium risk
    if (value >= 30) return 'RIDICAT'; // High risk
    return 'FOARTE_RIDICAT'; // Very high risk
  }

  /**
   * Determine follow-up priority based on risk and value
   */
  private static determineFollowUpPriority(
    churnRisk: ChurnRiskLevel,
    lifetimeValue: number
  ): FollowUpPriority {
    const isHighValue = lifetimeValue > 10000;

    if (churnRisk === 'FOARTE_RIDICAT' || (churnRisk === 'RIDICAT' && isHighValue)) {
      return 'URGENTA';
    }
    if (churnRisk === 'RIDICAT' || (churnRisk === 'MEDIU' && isHighValue)) {
      return 'RIDICATA';
    }
    if (churnRisk === 'MEDIU') {
      return 'MEDIE';
    }
    return 'SCAZUTA';
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if patient is LOYAL
   */
  public isLoyal(): boolean {
    return this.classification === 'LOYAL';
  }

  /**
   * Check if patient is STABLE
   */
  public isStable(): boolean {
    return this.classification === 'STABLE';
  }

  /**
   * Check if patient is AT_RISK
   */
  public isAtRisk(): boolean {
    return this.classification === 'AT_RISK';
  }

  /**
   * Check if patient is CHURNING
   */
  public isChurning(): boolean {
    return this.classification === 'CHURNING';
  }

  /**
   * Check if patient is LOST
   */
  public isLost(): boolean {
    return this.classification === 'LOST';
  }

  /**
   * BUSINESS RULE: Does this patient require urgent intervention?
   * CHURNING and LOST patients need immediate attention
   */
  public requiresUrgentIntervention(): boolean {
    return this.churnRisk === 'FOARTE_RIDICAT' || this.churnRisk === 'RIDICAT';
  }

  /**
   * BUSINESS RULE: Does this patient need proactive outreach?
   * AT_RISK patients benefit from proactive engagement
   */
  public needsProactiveOutreach(): boolean {
    return this.isAtRisk() || this.isChurning();
  }

  /**
   * BUSINESS RULE: Should this patient be in retention campaign?
   */
  public shouldBeInRetentionCampaign(): boolean {
    return this.numericValue < 60;
  }

  /**
   * BUSINESS RULE: Is this a high-confidence prediction?
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * BUSINESS RULE: Get SLA for follow-up in hours
   */
  public getFollowUpSLAHours(): number {
    switch (this.followUpPriority) {
      case 'URGENTA':
        return 4; // 4 hours for urgent
      case 'RIDICATA':
        return 24; // 24 hours for high priority
      case 'MEDIE':
        return 72; // 3 days for medium
      case 'SCAZUTA':
        return 168; // 1 week for low priority
      default:
        return 168; // Default to 1 week
    }
  }

  /**
   * Get suggested actions based on retention status
   */
  public getSuggestedActions(): string[] {
    switch (this.classification) {
      case 'LOYAL':
        return ['send_loyalty_reward', 'request_referral', 'schedule_next_checkup'];
      case 'STABLE':
        return ['send_personalized_content', 'offer_preventive_care', 'collect_nps_feedback'];
      case 'AT_RISK':
        return [
          'schedule_personal_call',
          'send_special_offer',
          'address_concerns',
          'offer_flexible_scheduling',
        ];
      case 'CHURNING':
        return [
          'immediate_outreach',
          'manager_intervention',
          'win_back_offer',
          'satisfaction_survey',
        ];
      case 'LOST':
        return [
          'win_back_campaign',
          'reactivation_offer',
          'feedback_request',
          'archive_if_no_response',
        ];
      default:
        return ['general_follow_up'];
    }
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Improve the score by specified amount
   * Returns new RetentionScore (immutability preserved)
   */
  public improve(amount = 5): RetentionScore {
    const newValue = Math.min(this.numericValue + amount, 100);
    return new RetentionScore(newValue, this.confidence);
  }

  /**
   * Decrease the score by specified amount
   * Returns new RetentionScore (immutability preserved)
   */
  public decrease(amount = 5): RetentionScore {
    const newValue = Math.max(this.numericValue - amount, 0);
    return new RetentionScore(newValue, this.confidence);
  }

  /**
   * Update confidence level
   * Returns new RetentionScore (immutability preserved)
   */
  public withConfidence(newConfidence: number): RetentionScore {
    return new RetentionScore(this.numericValue, newConfidence, 0, this.calculatedAt);
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: RetentionScore): boolean {
    return this.numericValue === other.numericValue && this.classification === other.classification;
  }

  /**
   * Compare scores (for sorting)
   * Returns positive if this > other, negative if this < other, 0 if equal
   */
  public compareTo(other: RetentionScore): number {
    return this.numericValue - other.numericValue;
  }

  /**
   * Check if this score is higher (better retention) than another
   */
  public isHigherThan(other: RetentionScore): boolean {
    return this.numericValue > other.numericValue;
  }

  /**
   * Check if this score is lower (worse retention) than another
   */
  public isLowerThan(other: RetentionScore): boolean {
    return this.numericValue < other.numericValue;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): RetentionScoreDTO {
    return {
      numericValue: this.numericValue,
      classification: this.classification,
      churnRisk: this.churnRisk,
      followUpPriority: this.followUpPriority,
      confidence: this.confidence,
      calculatedAt: this.calculatedAt.toISOString(),
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
    return `RetentionScore(${this.numericValue}/${this.classification}, risk: ${this.churnRisk}, confidence: ${(this.confidence * 100).toFixed(0)}%)`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid RetentionScore
 */
export class InvalidRetentionScoreError extends Error {
  public readonly code = 'INVALID_RETENTION_SCORE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidRetentionScoreError';
    Object.setPrototypeOf(this, InvalidRetentionScoreError.prototype);
  }
}

/**
 * DTO for RetentionScore serialization
 */
export interface RetentionScoreDTO {
  numericValue: number;
  classification: RetentionClassification;
  churnRisk: ChurnRiskLevel;
  followUpPriority: FollowUpPriority;
  confidence: number;
  calculatedAt: string;
}

/**
 * Parse result type
 */
export type RetentionScoreParseResult =
  | { success: true; value: RetentionScore }
  | { success: false; error: string };
