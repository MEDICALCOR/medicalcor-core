/**
 * @fileoverview FinancialPrediction Value Object
 *
 * Banking/Medical Grade DDD Value Object for case financial outcome prediction.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/osax/value-objects/financial-prediction
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two predictions with same values are equal
 * 4. ZERO INFRASTRUCTURE - No external dependencies (DDD pure domain)
 * 5. COMPLIANCE - No PII in this object
 */

// ============================================================================
// DOMAIN TYPES (ZERO EXTERNAL DEPENDENCIES)
// ============================================================================

/**
 * Probability tier classification
 */
export type ProbabilityTier = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Contribution direction of a prediction factor
 */
export type FactorContribution = 'positive' | 'negative' | 'neutral';

/**
 * Individual factor contributing to the prediction
 */
export interface PredictionFactor {
  /** Factor name/identifier */
  readonly factor: string;

  /** Weight of this factor in the prediction (0-1) */
  readonly weight: number;

  /** Direction of contribution */
  readonly contribution: FactorContribution;

  /** Human-readable description */
  readonly description?: string;
}

/**
 * Estimated case value range
 */
export interface EstimatedValueRange {
  /** Minimum estimated value */
  readonly min: number;

  /** Maximum estimated value */
  readonly max: number;

  /** Currency code (ISO 4217) */
  readonly currency: string;
}

/**
 * Validation constants
 */
const VALIDATION = {
  probability: { min: 0, max: 1 },
  confidence: { min: 0, max: 1 },
  weight: { min: 0, max: 1 },
  value: { min: 0 },
  rationale: { minLength: 1, maxLength: 1000 },
  factor: { minLength: 1, maxLength: 100 },
} as const;

/**
 * Probability tier thresholds
 */
const PROBABILITY_TIERS = {
  HIGH: 0.65,
  MEDIUM: 0.35,
  // Below 0.35 is LOW
} as const;

// ============================================================================
// VALUE OBJECT IMPLEMENTATION
// ============================================================================

/**
 * FinancialPrediction Value Object
 *
 * Represents a prediction of case acceptance probability with financial estimates.
 * This is a true Value Object following DDD principles.
 *
 * Features:
 * - Private constructor (use factory methods)
 * - Deep immutability (Object.freeze on all nested objects)
 * - Value equality (equals method)
 * - Rich domain methods (Tell, Don't Ask pattern)
 * - Serialization support (toJSON)
 *
 * @example
 * ```typescript
 * // Create from prediction data
 * const prediction = FinancialPrediction.create({
 *   probability: 0.72,
 *   confidence: 0.85,
 *   rationale: 'High insurance coverage with low complexity procedure',
 *   factors: [
 *     { factor: 'insurance_coverage', weight: 0.3, contribution: 'positive' },
 *     { factor: 'treatment_complexity', weight: 0.2, contribution: 'positive' },
 *   ],
 *   estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
 * });
 *
 * console.log(prediction.isHighProbability()); // true
 * console.log(prediction.getProbabilityTier()); // 'HIGH'
 * ```
 */
export class FinancialPrediction {
  // ============================================================================
  // READONLY PROPERTIES
  // ============================================================================

  /**
   * Probability of case acceptance (0-1)
   */
  public readonly probability: number;

  /**
   * Confidence in the prediction (0-1)
   */
  public readonly confidence: number;

  /**
   * Human-readable rationale explaining the prediction
   */
  public readonly rationale: string;

  /**
   * Contributing factors and their weights
   */
  public readonly factors: readonly PredictionFactor[];

  /**
   * Estimated case value range
   */
  public readonly estimatedValueRange: Readonly<EstimatedValueRange>;

  /**
   * Timestamp when prediction was made
   */
  public readonly predictedAt: Date;

  /**
   * Model version used for prediction
   */
  public readonly modelVersion: string;

  // ============================================================================
  // PRIVATE CONSTRUCTOR
  // ============================================================================

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    probability: number,
    confidence: number,
    rationale: string,
    factors: readonly PredictionFactor[],
    estimatedValueRange: EstimatedValueRange,
    modelVersion: string,
    predictedAt: Date = new Date()
  ) {
    this.probability = Math.round(probability * 1000) / 1000;
    this.confidence = Math.round(confidence * 1000) / 1000;
    this.rationale = rationale;
    this.factors = Object.freeze([...factors].map((f) => Object.freeze({ ...f })));
    this.estimatedValueRange = Object.freeze({ ...estimatedValueRange });
    this.modelVersion = modelVersion;
    this.predictedAt = predictedAt;

    // Deep freeze to ensure complete immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create FinancialPrediction from prediction data
   *
   * @param input - Prediction input data
   * @returns FinancialPrediction instance
   * @throws InvalidFinancialPredictionError if input is invalid
   *
   * @example
   * ```typescript
   * const prediction = FinancialPrediction.create({
   *   probability: 0.72,
   *   confidence: 0.85,
   *   rationale: 'High acceptance likelihood based on insurance and complexity',
   *   factors: [...],
   *   estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
   *   modelVersion: '1.0.0',
   * });
   * ```
   */
  public static create(input: CreateFinancialPredictionInput): FinancialPrediction {
    // Validate probability
    if (
      typeof input.probability !== 'number' ||
      Number.isNaN(input.probability) ||
      input.probability < VALIDATION.probability.min ||
      input.probability > VALIDATION.probability.max
    ) {
      throw new InvalidFinancialPredictionError(
        `Probability must be between ${VALIDATION.probability.min} and ${VALIDATION.probability.max}`,
        { field: 'probability', value: input.probability }
      );
    }

    // Validate confidence
    if (
      typeof input.confidence !== 'number' ||
      Number.isNaN(input.confidence) ||
      input.confidence < VALIDATION.confidence.min ||
      input.confidence > VALIDATION.confidence.max
    ) {
      throw new InvalidFinancialPredictionError(
        `Confidence must be between ${VALIDATION.confidence.min} and ${VALIDATION.confidence.max}`,
        { field: 'confidence', value: input.confidence }
      );
    }

    // Validate rationale
    if (
      !input.rationale ||
      typeof input.rationale !== 'string' ||
      input.rationale.length < VALIDATION.rationale.minLength ||
      input.rationale.length > VALIDATION.rationale.maxLength
    ) {
      throw new InvalidFinancialPredictionError(
        `Rationale must be between ${VALIDATION.rationale.minLength} and ${VALIDATION.rationale.maxLength} characters`,
        { field: 'rationale', value: input.rationale }
      );
    }

    // Validate factors
    if (!Array.isArray(input.factors)) {
      throw new InvalidFinancialPredictionError('Factors must be an array', {
        field: 'factors',
        value: input.factors,
      });
    }

    for (let i = 0; i < input.factors.length; i++) {
      FinancialPrediction.validateFactor(input.factors[i], i);
    }

    // Validate estimated value range
    FinancialPrediction.validateEstimatedValueRange(input.estimatedValueRange);

    // Validate model version
    if (!input.modelVersion || typeof input.modelVersion !== 'string') {
      throw new InvalidFinancialPredictionError('Model version is required', {
        field: 'modelVersion',
        value: input.modelVersion,
      });
    }

    return new FinancialPrediction(
      input.probability,
      input.confidence,
      input.rationale,
      input.factors,
      input.estimatedValueRange,
      input.modelVersion,
      input.predictedAt ?? new Date()
    );
  }

  /**
   * Create a rule-based prediction (for simple calculations)
   *
   * @param probability - Calculated probability
   * @param rationale - Explanation of calculation
   * @param estimatedValue - Estimated case value
   * @param currency - Currency code
   */
  public static fromRuleBasedCalculation(
    probability: number,
    rationale: string,
    estimatedValue: { min: number; max: number },
    currency: string = 'EUR'
  ): FinancialPrediction {
    return FinancialPrediction.create({
      probability,
      confidence: 0.7, // Rule-based has moderate confidence
      rationale,
      factors: [{ factor: 'rule_based_calculation', weight: 1.0, contribution: 'neutral' }],
      estimatedValueRange: { ...estimatedValue, currency },
      modelVersion: 'rule-based-v1.0',
    });
  }

  /**
   * Reconstitute from database/DTO
   */
  public static reconstitute(dto: FinancialPredictionDTO): FinancialPrediction {
    if (!dto || typeof dto !== 'object') {
      throw new InvalidFinancialPredictionError('Invalid DTO: must be an object', {
        field: 'dto',
        value: dto,
      });
    }

    const predictedAt =
      typeof dto.predictedAt === 'string' ? new Date(dto.predictedAt) : dto.predictedAt;

    if (isNaN(predictedAt.getTime())) {
      throw new InvalidFinancialPredictionError(`Invalid predictedAt date: ${dto.predictedAt}`, {
        field: 'predictedAt',
        value: dto.predictedAt,
      });
    }

    return new FinancialPrediction(
      dto.probability,
      dto.confidence,
      dto.rationale,
      dto.factors,
      dto.estimatedValueRange,
      dto.modelVersion,
      predictedAt
    );
  }

  // ============================================================================
  // VALIDATION LOGIC
  // ============================================================================

  /**
   * Validate a single prediction factor
   */
  private static validateFactor(factor: PredictionFactor, index: number): void {
    const prefix = `factors[${index}]`;

    // Validate factor name
    if (
      !factor.factor ||
      typeof factor.factor !== 'string' ||
      factor.factor.length < VALIDATION.factor.minLength ||
      factor.factor.length > VALIDATION.factor.maxLength
    ) {
      throw new InvalidFinancialPredictionError(
        `${prefix}.factor must be a string between ${VALIDATION.factor.minLength} and ${VALIDATION.factor.maxLength} characters`,
        { field: `${prefix}.factor`, value: factor.factor }
      );
    }

    // Validate weight
    if (
      typeof factor.weight !== 'number' ||
      Number.isNaN(factor.weight) ||
      factor.weight < VALIDATION.weight.min ||
      factor.weight > VALIDATION.weight.max
    ) {
      throw new InvalidFinancialPredictionError(
        `${prefix}.weight must be between ${VALIDATION.weight.min} and ${VALIDATION.weight.max}`,
        { field: `${prefix}.weight`, value: factor.weight }
      );
    }

    // Validate contribution
    const validContributions: FactorContribution[] = ['positive', 'negative', 'neutral'];
    if (!validContributions.includes(factor.contribution)) {
      throw new InvalidFinancialPredictionError(
        `${prefix}.contribution must be one of: ${validContributions.join(', ')}`,
        { field: `${prefix}.contribution`, value: factor.contribution }
      );
    }
  }

  /**
   * Validate estimated value range
   */
  private static validateEstimatedValueRange(range: EstimatedValueRange): void {
    if (!range || typeof range !== 'object') {
      throw new InvalidFinancialPredictionError('estimatedValueRange must be an object', {
        field: 'estimatedValueRange',
        value: range,
      });
    }

    if (
      typeof range.min !== 'number' ||
      Number.isNaN(range.min) ||
      range.min < VALIDATION.value.min
    ) {
      throw new InvalidFinancialPredictionError(
        `estimatedValueRange.min must be a non-negative number`,
        { field: 'estimatedValueRange.min', value: range.min }
      );
    }

    if (
      typeof range.max !== 'number' ||
      Number.isNaN(range.max) ||
      range.max < VALIDATION.value.min
    ) {
      throw new InvalidFinancialPredictionError(
        `estimatedValueRange.max must be a non-negative number`,
        { field: 'estimatedValueRange.max', value: range.max }
      );
    }

    if (range.min > range.max) {
      throw new InvalidFinancialPredictionError(
        `estimatedValueRange.min cannot exceed max`,
        { field: 'estimatedValueRange', value: range }
      );
    }

    if (!range.currency || typeof range.currency !== 'string' || range.currency.length !== 3) {
      throw new InvalidFinancialPredictionError(
        `estimatedValueRange.currency must be a 3-character ISO code`,
        { field: 'estimatedValueRange.currency', value: range.currency }
      );
    }
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if probability is high (>= 0.65)
   */
  public isHighProbability(): boolean {
    return this.probability >= PROBABILITY_TIERS.HIGH;
  }

  /**
   * Check if probability is medium (0.35 - 0.65)
   */
  public isMediumProbability(): boolean {
    return this.probability >= PROBABILITY_TIERS.MEDIUM && this.probability < PROBABILITY_TIERS.HIGH;
  }

  /**
   * Check if probability is low (< 0.35)
   */
  public isLowProbability(): boolean {
    return this.probability < PROBABILITY_TIERS.MEDIUM;
  }

  /**
   * Get probability tier classification
   */
  public getProbabilityTier(): ProbabilityTier {
    if (this.isHighProbability()) return 'HIGH';
    if (this.isMediumProbability()) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Check if financial consultation is recommended
   * Recommended when estimated value exceeds threshold
   */
  public requiresFinancialConsultation(threshold: number = 10000): boolean {
    return this.estimatedValueRange.max > threshold;
  }

  /**
   * Get recommended action based on probability tier
   */
  public getRecommendedAction(): string {
    const tier = this.getProbabilityTier();
    switch (tier) {
      case 'HIGH':
        return 'PROCEED_WITH_SCHEDULING';
      case 'MEDIUM':
        return 'FOLLOW_UP_REQUIRED';
      case 'LOW':
        return 'REVIEW_ALTERNATIVES';
    }
  }

  /**
   * Check if prediction has high confidence
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * Get positive contributing factors
   */
  public getPositiveFactors(): readonly PredictionFactor[] {
    return this.factors.filter((f) => f.contribution === 'positive');
  }

  /**
   * Get negative contributing factors
   */
  public getNegativeFactors(): readonly PredictionFactor[] {
    return this.factors.filter((f) => f.contribution === 'negative');
  }

  /**
   * Get estimated value midpoint
   */
  public getEstimatedValueMidpoint(): number {
    return (this.estimatedValueRange.min + this.estimatedValueRange.max) / 2;
  }

  /**
   * Format estimated value range as string
   */
  public formatEstimatedValueRange(): string {
    const { min, max, currency } = this.estimatedValueRange;
    return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  }

  /**
   * Get clinical summary string
   */
  public getSummary(): string {
    const tier = this.getProbabilityTier();
    const parts: string[] = [
      `Probability: ${(this.probability * 100).toFixed(1)}% (${tier})`,
      `Confidence: ${(this.confidence * 100).toFixed(1)}%`,
      `Est. Value: ${this.formatEstimatedValueRange()}`,
      `Action: ${this.getRecommendedAction()}`,
    ];
    return parts.join(' | ');
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: FinancialPrediction | null | undefined): boolean {
    if (!other) return false;
    if (this === other) return true;

    return (
      this.probability === other.probability &&
      this.confidence === other.confidence &&
      this.modelVersion === other.modelVersion &&
      this.estimatedValueRange.min === other.estimatedValueRange.min &&
      this.estimatedValueRange.max === other.estimatedValueRange.max &&
      this.estimatedValueRange.currency === other.estimatedValueRange.currency
    );
  }

  /**
   * Compare predictions by probability
   */
  public compareTo(other: FinancialPrediction): number {
    return this.probability - other.probability;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): FinancialPredictionDTO {
    return {
      probability: this.probability,
      confidence: this.confidence,
      rationale: this.rationale,
      factors: [...this.factors],
      estimatedValueRange: { ...this.estimatedValueRange },
      predictedAt: this.predictedAt.toISOString(),
      modelVersion: this.modelVersion,
    };
  }

  /**
   * String representation for debugging/logging
   */
  public toString(): string {
    return `FinancialPrediction(probability: ${(this.probability * 100).toFixed(1)}%, tier: ${this.getProbabilityTier()}, value: ${this.formatEstimatedValueRange()})`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Input for creating FinancialPrediction
 */
export interface CreateFinancialPredictionInput {
  readonly probability: number;
  readonly confidence: number;
  readonly rationale: string;
  readonly factors: readonly PredictionFactor[];
  readonly estimatedValueRange: EstimatedValueRange;
  readonly modelVersion: string;
  readonly predictedAt?: Date;
}

/**
 * DTO for FinancialPrediction serialization
 */
export interface FinancialPredictionDTO {
  readonly probability: number;
  readonly confidence: number;
  readonly rationale: string;
  readonly factors: readonly PredictionFactor[];
  readonly estimatedValueRange: EstimatedValueRange;
  readonly predictedAt: string | Date;
  readonly modelVersion: string;
}

/**
 * Error thrown when creating invalid FinancialPrediction
 */
export class InvalidFinancialPredictionError extends Error {
  public readonly code = 'INVALID_FINANCIAL_PREDICTION' as const;
  public readonly details: InvalidFinancialPredictionErrorDetails;

  constructor(message: string, details: InvalidFinancialPredictionErrorDetails = {}) {
    super(message);
    this.name = 'InvalidFinancialPredictionError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidFinancialPredictionError.prototype);
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

export interface InvalidFinancialPredictionErrorDetails {
  field?: string;
  value?: unknown;
}

/**
 * Type guard for FinancialPrediction
 */
export function isFinancialPrediction(value: unknown): value is FinancialPrediction {
  return value instanceof FinancialPrediction;
}
