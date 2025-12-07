/**
 * @fileoverview PredictedLTV Value Object
 *
 * Banking/Medical Grade DDD Value Object for predicted patient lifetime value.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/shared-kernel/value-objects/predicted-ltv
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two PredictedLTV with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Investment priority rules live here
 *
 * TIER THRESHOLDS (EUR):
 * - DIAMOND: > 50,000
 * - PLATINUM: 30,000 - 50,000
 * - GOLD: 15,000 - 30,000
 * - SILVER: 5,000 - 15,000
 * - BRONZE: < 5,000
 */

/**
 * pLTV tier classification types
 */
export type PLTVTier = 'DIAMOND' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

/**
 * Growth potential classification types
 */
export type PLTVGrowthPotential = 'HIGH_GROWTH' | 'MODERATE_GROWTH' | 'STABLE' | 'DECLINING';

/**
 * Investment priority types (Romanian naming convention)
 */
export type PLTVInvestmentPriority =
  | 'PRIORITATE_MAXIMA'
  | 'PRIORITATE_RIDICATA'
  | 'PRIORITATE_MEDIE'
  | 'PRIORITATE_SCAZUTA';

/**
 * Confidence interval for predictions
 */
export interface ConfidenceInterval {
  readonly lower: number;
  readonly upper: number;
  readonly level: number;
}

/**
 * PredictedLTV Value Object
 *
 * Represents a patient's predicted lifetime value with tier classification.
 * This is a true Value Object following DDD principles.
 *
 * @example
 * ```typescript
 * // Create from predicted value
 * const pltv = PredictedLTV.fromValue(25000);
 * console.log(pltv.tier); // 'GOLD'
 * console.log(pltv.isHighValue()); // true
 *
 * // Create from tier
 * const diamond = PredictedLTV.diamond();
 * console.log(diamond.predictedValue); // 60000
 *
 * // Business logic
 * const growing = PredictedLTV.fromValue(20000, 0.85, 'HIGH_GROWTH');
 * console.log(growing.requiresPriorityInvestment()); // true
 * console.log(growing.getInvestmentActions()); // ['schedule_vip_consultation', ...]
 * ```
 */
export class PredictedLTV {
  /**
   * Predicted lifetime value in EUR
   */
  public readonly predictedValue: number;

  /**
   * Tier classification derived from predicted value
   */
  public readonly tier: PLTVTier;

  /**
   * Growth potential classification
   */
  public readonly growthPotential: PLTVGrowthPotential;

  /**
   * Investment priority derived from tier and growth
   */
  public readonly investmentPriority: PLTVInvestmentPriority;

  /**
   * Prediction confidence level (0-1)
   */
  public readonly confidence: number;

  /**
   * Confidence interval for the prediction
   */
  public readonly confidenceInterval: ConfidenceInterval;

  /**
   * Timestamp when prediction was calculated
   */
  public readonly calculatedAt: Date;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    predictedValue: number,
    confidence: number,
    growthPotential: PLTVGrowthPotential = 'STABLE',
    calculatedAt: Date = new Date()
  ) {
    // INVARIANT: Predicted value must be non-negative
    if (typeof predictedValue !== 'number' || predictedValue < 0) {
      throw new InvalidPredictedLTVError(
        `Predicted LTV must be a non-negative number, got: ${predictedValue}`
      );
    }

    // INVARIANT: Confidence must be between 0 and 1 (inclusive)
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new InvalidPredictedLTVError(
        `Confidence must be a number between 0 and 1, got: ${confidence}`
      );
    }

    this.predictedValue = Math.round(predictedValue * 100) / 100; // Round to cents
    this.confidence = confidence;
    this.growthPotential = growthPotential;
    this.calculatedAt = calculatedAt;
    this.tier = PredictedLTV.valueToTier(this.predictedValue);
    this.investmentPriority = PredictedLTV.determineInvestmentPriority(this.tier, growthPotential);
    this.confidenceInterval = PredictedLTV.calculateConfidenceInterval(
      this.predictedValue,
      confidence
    );

    // Freeze to ensure immutability
    Object.freeze(this.confidenceInterval);
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create PredictedLTV from numeric value
   *
   * @param value - Predicted value in EUR
   * @param confidence - Confidence level (0-1), defaults to 0.8
   * @param growthPotential - Growth potential classification
   * @returns PredictedLTV instance
   * @throws InvalidPredictedLTVError if value is invalid
   */
  public static fromValue(
    value: number,
    confidence = 0.8,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(value, confidence, growthPotential);
  }

  /**
   * Create a DIAMOND tier pLTV (top 5%)
   */
  public static diamond(
    confidence = 0.85,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(60000, confidence, growthPotential);
  }

  /**
   * Create a PLATINUM tier pLTV
   */
  public static platinum(
    confidence = 0.8,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(40000, confidence, growthPotential);
  }

  /**
   * Create a GOLD tier pLTV
   */
  public static gold(
    confidence = 0.8,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(22500, confidence, growthPotential);
  }

  /**
   * Create a SILVER tier pLTV
   */
  public static silver(
    confidence = 0.8,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(10000, confidence, growthPotential);
  }

  /**
   * Create a BRONZE tier pLTV
   */
  public static bronze(
    confidence = 0.75,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    return new PredictedLTV(2500, confidence, growthPotential);
  }

  /**
   * Create from tier classification
   */
  public static fromTier(
    tier: PLTVTier,
    confidence = 0.8,
    growthPotential: PLTVGrowthPotential = 'STABLE'
  ): PredictedLTV {
    const valueMap: Record<PLTVTier, number> = {
      DIAMOND: 60000,
      PLATINUM: 40000,
      GOLD: 22500,
      SILVER: 10000,
      BRONZE: 2500,
    };
    return new PredictedLTV(valueMap[tier], confidence, growthPotential);
  }

  /**
   * Parse from unknown input (for API/database hydration)
   * Returns Result to handle invalid input gracefully
   */
  public static parse(input: unknown): PredictedLTVParseResult {
    if (input instanceof PredictedLTV) {
      return { success: true, value: input };
    }

    if (typeof input === 'number') {
      try {
        return { success: true, value: PredictedLTV.fromValue(input) };
      } catch (e) {
        return {
          success: false,
          error: e instanceof InvalidPredictedLTVError ? e.message : 'Invalid pLTV value',
        };
      }
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if ('predictedValue' in obj && typeof obj.predictedValue === 'number') {
        try {
          const confidence =
            'confidence' in obj && typeof obj.confidence === 'number' ? obj.confidence : 0.8;
          const growthPotential =
            'growthPotential' in obj && typeof obj.growthPotential === 'string'
              ? (obj.growthPotential as PLTVGrowthPotential)
              : 'STABLE';
          return {
            success: true,
            value: PredictedLTV.fromValue(obj.predictedValue, confidence, growthPotential),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidPredictedLTVError ? e.message : 'Invalid pLTV value',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse PredictedLTV from: ${typeof input}` };
  }

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  /**
   * Convert predicted value to tier classification
   */
  private static valueToTier(value: number): PLTVTier {
    if (value >= 50000) return 'DIAMOND';
    if (value >= 30000) return 'PLATINUM';
    if (value >= 15000) return 'GOLD';
    if (value >= 5000) return 'SILVER';
    return 'BRONZE';
  }

  /**
   * Determine investment priority based on tier and growth potential
   */
  private static determineInvestmentPriority(
    tier: PLTVTier,
    growthPotential: PLTVGrowthPotential
  ): PLTVInvestmentPriority {
    // Diamond always gets maximum priority
    if (tier === 'DIAMOND') {
      return 'PRIORITATE_MAXIMA';
    }

    // High growth potential elevates priority
    if (growthPotential === 'HIGH_GROWTH') {
      if (tier === 'PLATINUM' || tier === 'GOLD') {
        return 'PRIORITATE_MAXIMA';
      }
      if (tier === 'SILVER') {
        return 'PRIORITATE_RIDICATA';
      }
    }

    // Platinum with stable/moderate growth
    if (tier === 'PLATINUM') {
      return 'PRIORITATE_RIDICATA';
    }

    // Gold tier
    if (tier === 'GOLD') {
      if (growthPotential === 'MODERATE_GROWTH') {
        return 'PRIORITATE_RIDICATA';
      }
      return 'PRIORITATE_MEDIE';
    }

    // Silver tier
    if (tier === 'SILVER') {
      if (growthPotential === 'MODERATE_GROWTH') {
        return 'PRIORITATE_MEDIE';
      }
      return 'PRIORITATE_SCAZUTA';
    }

    // Bronze tier
    return 'PRIORITATE_SCAZUTA';
  }

  /**
   * Calculate confidence interval based on value and confidence
   */
  private static calculateConfidenceInterval(
    value: number,
    confidence: number
  ): ConfidenceInterval {
    // Use confidence to determine interval width
    // Higher confidence = narrower interval
    const varianceMultiplier = 1 - confidence;
    const intervalWidth = value * varianceMultiplier * 0.5; // ±25% at 50% confidence

    return {
      lower: Math.max(0, value - intervalWidth),
      upper: value + intervalWidth,
      level: 0.95, // 95% confidence interval
    };
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if patient is DIAMOND tier
   */
  public isDiamond(): boolean {
    return this.tier === 'DIAMOND';
  }

  /**
   * Check if patient is PLATINUM tier
   */
  public isPlatinum(): boolean {
    return this.tier === 'PLATINUM';
  }

  /**
   * Check if patient is GOLD tier
   */
  public isGold(): boolean {
    return this.tier === 'GOLD';
  }

  /**
   * Check if patient is SILVER tier
   */
  public isSilver(): boolean {
    return this.tier === 'SILVER';
  }

  /**
   * Check if patient is BRONZE tier
   */
  public isBronze(): boolean {
    return this.tier === 'BRONZE';
  }

  /**
   * BUSINESS RULE: Is this a high-value patient?
   * GOLD, PLATINUM, and DIAMOND are considered high value
   */
  public isHighValue(): boolean {
    return this.tier === 'DIAMOND' || this.tier === 'PLATINUM' || this.tier === 'GOLD';
  }

  /**
   * BUSINESS RULE: Does this patient require priority investment?
   * Based on investment priority level
   */
  public requiresPriorityInvestment(): boolean {
    return (
      this.investmentPriority === 'PRIORITATE_MAXIMA' ||
      this.investmentPriority === 'PRIORITATE_RIDICATA'
    );
  }

  /**
   * BUSINESS RULE: Should this patient be in VIP program?
   */
  public shouldBeVIP(): boolean {
    return this.tier === 'DIAMOND' || this.tier === 'PLATINUM';
  }

  /**
   * BUSINESS RULE: Has significant growth potential?
   */
  public hasGrowthPotential(): boolean {
    return this.growthPotential === 'HIGH_GROWTH' || this.growthPotential === 'MODERATE_GROWTH';
  }

  /**
   * BUSINESS RULE: Is this a high-confidence prediction?
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * BUSINESS RULE: Is prediction declining?
   */
  public isDeclining(): boolean {
    return this.growthPotential === 'DECLINING';
  }

  /**
   * BUSINESS RULE: Get SLA for follow-up in hours
   */
  public getFollowUpSLAHours(): number {
    switch (this.investmentPriority) {
      case 'PRIORITATE_MAXIMA':
        return 2; // 2 hours for maximum priority
      case 'PRIORITATE_RIDICATA':
        return 8; // 8 hours for high priority
      case 'PRIORITATE_MEDIE':
        return 24; // 24 hours for medium
      case 'PRIORITATE_SCAZUTA':
        return 72; // 3 days for low priority
      default:
        return 72;
    }
  }

  /**
   * Get investment actions based on pLTV and growth potential
   */
  public getInvestmentActions(): string[] {
    const baseActions: string[] = [];

    // Tier-based actions
    switch (this.tier) {
      case 'DIAMOND':
        baseActions.push(
          'assign_dedicated_coordinator',
          'schedule_vip_consultation',
          'offer_premium_amenities',
          'executive_follow_up'
        );
        break;
      case 'PLATINUM':
        baseActions.push(
          'priority_scheduling',
          'personal_coordinator_call',
          'offer_financing_options',
          'send_vip_package'
        );
        break;
      case 'GOLD':
        baseActions.push(
          'priority_callback',
          'comprehensive_treatment_plan',
          'offer_payment_plan',
          'quality_follow_up'
        );
        break;
      case 'SILVER':
        baseActions.push(
          'standard_follow_up',
          'send_educational_content',
          'offer_consultation',
          'nurture_campaign'
        );
        break;
      case 'BRONZE':
        baseActions.push('automated_nurture', 'educational_emails', 'seasonal_outreach');
        break;
      default:
        // Exhaustive check - all tiers handled above
        break;
    }

    // Growth-based additional actions
    if (this.growthPotential === 'HIGH_GROWTH') {
      baseActions.push('accelerated_nurturing', 'upsell_consultation', 'growth_investment');
    } else if (this.growthPotential === 'DECLINING') {
      baseActions.push('retention_intervention', 'satisfaction_check', 'win_back_offer');
    }

    return baseActions;
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Increase the predicted value by specified amount
   * Returns new PredictedLTV (immutability preserved)
   */
  public increase(amount: number): PredictedLTV {
    const newValue = this.predictedValue + amount;
    return new PredictedLTV(newValue, this.confidence, this.growthPotential);
  }

  /**
   * Decrease the predicted value by specified amount
   * Returns new PredictedLTV (immutability preserved)
   */
  public decrease(amount: number): PredictedLTV {
    const newValue = Math.max(0, this.predictedValue - amount);
    return new PredictedLTV(newValue, this.confidence, this.growthPotential);
  }

  /**
   * Apply growth multiplier
   * Returns new PredictedLTV (immutability preserved)
   */
  public applyGrowth(multiplier: number): PredictedLTV {
    const newValue = this.predictedValue * multiplier;
    return new PredictedLTV(newValue, this.confidence, this.growthPotential);
  }

  /**
   * Update confidence level
   * Returns new PredictedLTV (immutability preserved)
   */
  public withConfidence(newConfidence: number): PredictedLTV {
    return new PredictedLTV(
      this.predictedValue,
      newConfidence,
      this.growthPotential,
      this.calculatedAt
    );
  }

  /**
   * Update growth potential
   * Returns new PredictedLTV (immutability preserved)
   */
  public withGrowthPotential(newGrowthPotential: PLTVGrowthPotential): PredictedLTV {
    return new PredictedLTV(
      this.predictedValue,
      this.confidence,
      newGrowthPotential,
      this.calculatedAt
    );
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: PredictedLTV): boolean {
    return this.predictedValue === other.predictedValue && this.tier === other.tier;
  }

  /**
   * Compare pLTV (for sorting)
   * Returns positive if this > other, negative if this < other, 0 if equal
   */
  public compareTo(other: PredictedLTV): number {
    return this.predictedValue - other.predictedValue;
  }

  /**
   * Check if this pLTV is higher than another
   */
  public isHigherThan(other: PredictedLTV): boolean {
    return this.predictedValue > other.predictedValue;
  }

  /**
   * Check if this pLTV is lower than another
   */
  public isLowerThan(other: PredictedLTV): boolean {
    return this.predictedValue < other.predictedValue;
  }

  /**
   * Calculate difference from another pLTV
   */
  public differenceFrom(other: PredictedLTV): number {
    return this.predictedValue - other.predictedValue;
  }

  /**
   * Calculate percentage change from another pLTV
   */
  public percentageChangeFrom(other: PredictedLTV): number {
    if (other.predictedValue === 0) return this.predictedValue > 0 ? 100 : 0;
    return ((this.predictedValue - other.predictedValue) / other.predictedValue) * 100;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): PredictedLTVDTO {
    return {
      predictedValue: this.predictedValue,
      tier: this.tier,
      growthPotential: this.growthPotential,
      investmentPriority: this.investmentPriority,
      confidence: this.confidence,
      confidenceInterval: { ...this.confidenceInterval },
      calculatedAt: this.calculatedAt.toISOString(),
    };
  }

  /**
   * Convert to primitive (for database storage)
   */
  public toPrimitive(): number {
    return this.predictedValue;
  }

  /**
   * String representation
   */
  public toString(): string {
    return `PredictedLTV(€${this.predictedValue.toLocaleString()}/${this.tier}, growth: ${this.growthPotential}, confidence: ${(this.confidence * 100).toFixed(0)}%)`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid PredictedLTV
 */
export class InvalidPredictedLTVError extends Error {
  public readonly code = 'INVALID_PREDICTED_LTV' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidPredictedLTVError';
    Object.setPrototypeOf(this, InvalidPredictedLTVError.prototype);
  }
}

/**
 * DTO for PredictedLTV serialization
 */
export interface PredictedLTVDTO {
  predictedValue: number;
  tier: PLTVTier;
  growthPotential: PLTVGrowthPotential;
  investmentPriority: PLTVInvestmentPriority;
  confidence: number;
  confidenceInterval: ConfidenceInterval;
  calculatedAt: string;
}

/**
 * Parse result type
 */
export type PredictedLTVParseResult =
  | { success: true; value: PredictedLTV }
  | { success: false; error: string };
