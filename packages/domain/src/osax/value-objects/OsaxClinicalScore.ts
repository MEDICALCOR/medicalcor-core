/**
 * @fileoverview OsaxClinicalScore Value Object
 *
 * Banking/Medical Grade DDD Value Object for Obstructive Sleep Apnea (OSAX) scoring.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/osax/value-objects/osax-clinical-score
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two OsaxClinicalScores with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Clinical scoring rules live here
 * 5. SINGLE SOURCE OF TRUTH - All scoring logic lives in this value object
 *
 * CLINICAL CONTEXT:
 * The OSAX score combines multiple clinical indicators to assess sleep apnea severity:
 * - AHI (Apnea-Hypopnea Index): events per hour
 * - ODI (Oxygen Desaturation Index): desaturation events per hour
 * - SpO2 nadir: lowest oxygen saturation recorded
 * - Sleep efficiency: percentage of time asleep
 * - ESS (Epworth Sleepiness Scale): daytime sleepiness score
 *
 * @see AASM Manual for the Scoring of Sleep and Associated Events
 */

// ============================================================================
// BRANDED TYPES (Compile-time type safety)
// ============================================================================

/**
 * Branded type for validated AHI values
 * Provides compile-time guarantees that AHI is within valid range
 */
declare const AHIBrand: unique symbol;
export type ValidatedAHI = number & { readonly [AHIBrand]: typeof AHIBrand };

/**
 * Branded type for validated SpO2 values
 */
declare const SpO2Brand: unique symbol;
export type ValidatedSpO2 = number & { readonly [SpO2Brand]: typeof SpO2Brand };

/**
 * Branded type for validated composite score (0-100)
 */
declare const CompositeScoreBrand: unique symbol;
export type ValidatedCompositeScore = number & {
  readonly [CompositeScoreBrand]: typeof CompositeScoreBrand;
};

/**
 * Branded type for validated confidence (0-1)
 */
declare const ConfidenceBrand: unique symbol;
export type ValidatedConfidence = number & {
  readonly [ConfidenceBrand]: typeof ConfidenceBrand;
};

// ============================================================================
// DOMAIN TYPES
// ============================================================================

/**
 * OSAX severity classification
 * Based on AHI thresholds per AASM guidelines
 *
 * @see American Academy of Sleep Medicine (AASM) Clinical Guidelines
 */
export type OsaxSeverity = 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';

/**
 * Risk level for cardiovascular complications
 * Derived from clinical indicators correlation with cardiac events
 */
export type OsaxCardiovascularRisk = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/**
 * Treatment recommendation based on score
 * Evidence-based treatment pathways
 */
export type OsaxTreatmentRecommendation =
  | 'LIFESTYLE_MODIFICATION'
  | 'POSITIONAL_THERAPY'
  | 'ORAL_APPLIANCE'
  | 'CPAP_THERAPY'
  | 'BIPAP_THERAPY'
  | 'SURGERY_EVALUATION';

/**
 * Follow-up urgency levels
 */
export type FollowUpUrgency = 'routine' | 'soon' | 'urgent' | 'immediate';

/**
 * Clinical task priority levels
 */
export type ClinicalTaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Clinical indicators used for OSAX scoring
 * All values are readonly to ensure immutability
 */
export interface OsaxClinicalIndicators {
  /** Apnea-Hypopnea Index: events per hour of sleep (0-150) */
  readonly ahi: number;

  /** Oxygen Desaturation Index: desaturation events per hour (0-150) */
  readonly odi: number;

  /** Lowest SpO2 percentage recorded during study (40-100) */
  readonly spo2Nadir: number;

  /** Average SpO2 percentage during study (60-100) */
  readonly spo2Average: number;

  /** Sleep efficiency percentage (time asleep / time in bed) (0-100) */
  readonly sleepEfficiency: number;

  /** Epworth Sleepiness Scale score (0-24) */
  readonly essScore: number;

  /** Body Mass Index (10-80) */
  readonly bmi?: number;

  /** Neck circumference in cm (20-80) */
  readonly neckCircumference?: number;

  /** Total sleep time in minutes (0-720) */
  readonly totalSleepTime?: number;

  /** REM AHI if available (events during REM sleep) */
  readonly remAhi?: number;

  /** Supine AHI if available (events while supine) */
  readonly supineAhi?: number;
}

/**
 * Validation constants for clinical indicators
 * Centralized for maintainability and documentation
 */
export const CLINICAL_INDICATOR_RANGES = {
  ahi: { min: 0, max: 150, unit: 'events/hour' },
  odi: { min: 0, max: 150, unit: 'events/hour' },
  spo2Nadir: { min: 40, max: 100, unit: '%' },
  spo2Average: { min: 60, max: 100, unit: '%' },
  sleepEfficiency: { min: 0, max: 100, unit: '%' },
  essScore: { min: 0, max: 24, unit: 'points', integer: true },
  bmi: { min: 10, max: 80, unit: 'kg/m²' },
  neckCircumference: { min: 20, max: 80, unit: 'cm' },
  totalSleepTime: { min: 0, max: 720, unit: 'minutes' },
  remAhi: { min: 0, max: 200, unit: 'events/hour' },
  supineAhi: { min: 0, max: 200, unit: 'events/hour' },
} as const;

/**
 * Severity thresholds per AASM guidelines
 */
export const SEVERITY_THRESHOLDS = {
  NONE: { ahiMax: 5 },
  MILD: { ahiMin: 5, ahiMax: 15 },
  MODERATE: { ahiMin: 15, ahiMax: 30 },
  SEVERE: { ahiMin: 30 },
} as const;

/**
 * SLA response times for clinical review (in hours)
 */
export const CLINICAL_SLA_HOURS = {
  immediate: 4,
  urgent: 24,
  soon: 72,
  routine: 168, // 1 week
} as const;

// ============================================================================
// VALUE OBJECT IMPLEMENTATION
// ============================================================================

/**
 * OsaxClinicalScore Value Object
 *
 * Represents a comprehensive clinical score for Obstructive Sleep Apnea assessment.
 * This is a true Value Object following DDD principles.
 *
 * Features:
 * - Private constructor (use factory methods)
 * - Deep immutability (Object.freeze on all nested objects)
 * - Value equality (equals, hash methods)
 * - Rich domain methods (Tell, Don't Ask pattern)
 * - Serialization support (toJSON, toPrimitive, toString)
 * - Parse/reconstitute for hydration
 *
 * @example
 * ```typescript
 * // Create from clinical indicators
 * const score = OsaxClinicalScore.fromIndicators({
 *   ahi: 25.5,
 *   odi: 22.3,
 *   spo2Nadir: 78,
 *   spo2Average: 94,
 *   sleepEfficiency: 82,
 *   essScore: 14,
 * });
 *
 * console.log(score.severity); // 'MODERATE'
 * console.log(score.requiresCPAP()); // true
 * console.log(score.cardiovascularRisk); // 'HIGH'
 *
 * // Reconstitute from database
 * const hydrated = OsaxClinicalScore.reconstitute(dto);
 *
 * // Check equality
 * console.log(score.equals(hydrated)); // true
 * console.log(score.hash()); // consistent hash for caching
 * ```
 */
export class OsaxClinicalScore {
  // ============================================================================
  // READONLY PROPERTIES
  // ============================================================================

  /**
   * Composite score (0-100) derived from clinical indicators
   * Higher score = more severe condition
   */
  public readonly compositeScore: number;

  /**
   * Severity classification per AASM guidelines
   */
  public readonly severity: OsaxSeverity;

  /**
   * Cardiovascular risk level
   */
  public readonly cardiovascularRisk: OsaxCardiovascularRisk;

  /**
   * Recommended treatment approach
   */
  public readonly treatmentRecommendation: OsaxTreatmentRecommendation;

  /**
   * Original clinical indicators (frozen)
   */
  public readonly indicators: Readonly<OsaxClinicalIndicators>;

  /**
   * Confidence level of the score (0-1)
   * - 0.9+ : Full polysomnography data
   * - 0.7-0.9: Home sleep test data
   * - 0.5-0.7: Estimated from partial data
   */
  public readonly confidence: number;

  /**
   * Timestamp when score was calculated
   */
  public readonly scoredAt: Date;

  /**
   * Version of the scoring algorithm used
   * Enables forward compatibility and audit trails
   */
  public readonly algorithmVersion: string = '1.0.0';

  // ============================================================================
  // PRIVATE CONSTRUCTOR
  // ============================================================================

  /**
   * Private constructor - use static factory methods
   *
   * @param compositeScore - Calculated composite score (0-100)
   * @param severity - AASM severity classification
   * @param cardiovascularRisk - CV risk level
   * @param treatmentRecommendation - Recommended treatment
   * @param indicators - Clinical measurement data
   * @param confidence - Confidence level (0-1)
   * @param scoredAt - Timestamp of calculation
   */
  private constructor(
    compositeScore: number,
    severity: OsaxSeverity,
    cardiovascularRisk: OsaxCardiovascularRisk,
    treatmentRecommendation: OsaxTreatmentRecommendation,
    indicators: OsaxClinicalIndicators,
    confidence: number,
    scoredAt: Date = new Date()
  ) {
    // Invariant validation
    if (compositeScore < 0 || compositeScore > 100 || Number.isNaN(compositeScore)) {
      throw new InvalidOsaxScoreError(
        `Composite score must be between 0 and 100, got: ${compositeScore}`,
        { field: 'compositeScore', value: compositeScore, range: [0, 100] }
      );
    }

    if (confidence < 0 || confidence > 1 || Number.isNaN(confidence)) {
      throw new InvalidOsaxScoreError(`Confidence must be between 0 and 1, got: ${confidence}`, {
        field: 'confidence',
        value: confidence,
        range: [0, 1],
      });
    }

    this.compositeScore = Math.round(compositeScore * 10) / 10; // 1 decimal precision
    this.severity = severity;
    this.cardiovascularRisk = cardiovascularRisk;
    this.treatmentRecommendation = treatmentRecommendation;
    this.indicators = Object.freeze({ ...indicators });
    this.confidence = Math.round(confidence * 1000) / 1000; // 3 decimal precision
    this.scoredAt = scoredAt;

    // Deep freeze to ensure complete immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create OsaxClinicalScore from clinical indicators
   *
   * This is the primary factory method that calculates all derived values.
   * All clinical scoring logic is encapsulated here.
   *
   * @param indicators - Clinical measurement data
   * @param confidence - Confidence level (0-1), defaults to 0.9
   * @returns OsaxClinicalScore instance
   * @throws InvalidOsaxScoreError if indicators are out of valid range
   *
   * @example
   * ```typescript
   * const score = OsaxClinicalScore.fromIndicators({
   *   ahi: 32.5,
   *   odi: 28.0,
   *   spo2Nadir: 72,
   *   spo2Average: 91,
   *   sleepEfficiency: 78,
   *   essScore: 16,
   *   bmi: 32.5,
   * });
   * ```
   */
  public static fromIndicators(
    indicators: OsaxClinicalIndicators,
    confidence: number = 0.9
  ): OsaxClinicalScore {
    // Validate all indicators
    OsaxClinicalScore.validateIndicators(indicators);

    // Validate confidence
    if (confidence < 0 || confidence > 1 || Number.isNaN(confidence)) {
      throw new InvalidOsaxScoreError(`Confidence must be between 0 and 1, got: ${confidence}`, {
        field: 'confidence',
        value: confidence,
        range: [0, 1],
      });
    }

    // Calculate all derived values using encapsulated business logic
    const severity = OsaxClinicalScore.calculateSeverity(indicators.ahi);
    const compositeScore = OsaxClinicalScore.calculateCompositeScore(indicators);
    const cardiovascularRisk = OsaxClinicalScore.calculateCardiovascularRisk(indicators);
    const treatmentRecommendation = OsaxClinicalScore.calculateTreatmentRecommendation(indicators);

    return new OsaxClinicalScore(
      compositeScore,
      severity,
      cardiovascularRisk,
      treatmentRecommendation,
      indicators,
      confidence
    );
  }

  /**
   * Create score from AHI only (simplified scoring)
   *
   * Useful when only AHI is available. Other indicators are estimated
   * based on typical clinical correlations.
   *
   * @param ahi - Apnea-Hypopnea Index value
   * @param confidence - Confidence level (lower due to estimation)
   * @returns OsaxClinicalScore with estimated indicators
   */
  public static fromAHI(ahi: number, confidence: number = 0.7): OsaxClinicalScore {
    if (ahi < 0 || ahi > 150 || Number.isNaN(ahi)) {
      throw new InvalidOsaxScoreError(`AHI must be between 0 and 150, got: ${ahi}`, {
        field: 'ahi',
        value: ahi,
        range: [0, 150],
      });
    }

    // Create minimal indicators with clinically-correlated estimated values
    const indicators: OsaxClinicalIndicators = {
      ahi,
      odi: Math.round(ahi * 0.85 * 10) / 10, // ODI typically ~85% of AHI
      spo2Nadir: ahi >= 30 ? 75 : ahi >= 15 ? 82 : ahi >= 5 ? 88 : 94,
      spo2Average: ahi >= 30 ? 89 : ahi >= 15 ? 92 : 95,
      sleepEfficiency: 75, // Conservative estimate
      essScore: ahi >= 30 ? 16 : ahi >= 15 ? 12 : ahi >= 5 ? 8 : 4,
    };

    return OsaxClinicalScore.fromIndicators(indicators, confidence);
  }

  /**
   * Create a minimal score for screening purposes
   *
   * @param ahi - AHI value
   * @param essScore - Epworth Sleepiness Scale score
   * @param confidence - Confidence level
   */
  public static forScreening(
    ahi: number,
    essScore: number,
    confidence: number = 0.6
  ): OsaxClinicalScore {
    if (essScore < 0 || essScore > 24 || !Number.isInteger(essScore)) {
      throw new InvalidOsaxScoreError(
        `ESS score must be an integer between 0 and 24, got: ${essScore}`,
        { field: 'essScore', value: essScore, range: [0, 24] }
      );
    }

    const indicators: OsaxClinicalIndicators = {
      ahi,
      odi: Math.round(ahi * 0.85 * 10) / 10,
      spo2Nadir: ahi >= 30 ? 75 : ahi >= 15 ? 82 : ahi >= 5 ? 88 : 94,
      spo2Average: ahi >= 30 ? 89 : ahi >= 15 ? 92 : 95,
      sleepEfficiency: 75,
      essScore,
    };

    return OsaxClinicalScore.fromIndicators(indicators, confidence);
  }

  /**
   * Reconstitute from database/DTO (bypass calculation)
   *
   * Use this when hydrating from persistence layer where all values
   * have already been calculated and stored.
   *
   * @param dto - Stored DTO with all calculated values
   * @returns OsaxClinicalScore instance
   * @throws InvalidOsaxScoreError if DTO contains invalid data
   *
   * @example
   * ```typescript
   * const dto = await repository.findById(id);
   * const score = OsaxClinicalScore.reconstitute(dto);
   * ```
   */
  public static reconstitute(dto: OsaxClinicalScoreDTO): OsaxClinicalScore {
    // Validate DTO structure
    if (!dto || typeof dto !== 'object') {
      throw new InvalidOsaxScoreError('Invalid DTO: must be an object', {
        field: 'dto',
        value: dto,
      });
    }

    // Validate required fields exist
    const requiredFields = [
      'compositeScore',
      'severity',
      'cardiovascularRisk',
      'treatmentRecommendation',
      'indicators',
      'confidence',
      'scoredAt',
    ] as const;

    for (const field of requiredFields) {
      if (!(field in dto)) {
        throw new InvalidOsaxScoreError(`Missing required field: ${field}`, {
          field,
          value: undefined,
        });
      }
    }

    // Validate indicators
    OsaxClinicalScore.validateIndicators(dto.indicators);

    // Parse scoredAt
    const scoredAt = typeof dto.scoredAt === 'string' ? new Date(dto.scoredAt) : dto.scoredAt;

    if (isNaN(scoredAt.getTime())) {
      throw new InvalidOsaxScoreError(`Invalid scoredAt date: ${dto.scoredAt}`, {
        field: 'scoredAt',
        value: dto.scoredAt,
      });
    }

    return new OsaxClinicalScore(
      dto.compositeScore,
      dto.severity,
      dto.cardiovascularRisk,
      dto.treatmentRecommendation,
      dto.indicators,
      dto.confidence,
      scoredAt
    );
  }

  /**
   * Parse from unknown input (for API/database hydration)
   *
   * Returns Result type for graceful error handling without exceptions.
   *
   * @param input - Unknown input to parse
   * @returns Parse result with success/error
   */
  public static parse(input: unknown): OsaxClinicalScoreParseResult {
    // Already an instance
    if (input instanceof OsaxClinicalScore) {
      return { success: true, value: input };
    }

    // Null/undefined check
    if (input === null || input === undefined) {
      return { success: false, error: 'Cannot parse OsaxClinicalScore from null/undefined' };
    }

    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      // Try as full DTO (has all calculated values)
      if ('compositeScore' in obj && 'severity' in obj && 'indicators' in obj) {
        try {
          return {
            success: true,
            value: OsaxClinicalScore.reconstitute(obj as unknown as OsaxClinicalScoreDTO),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidOsaxScoreError ? e.message : 'Invalid DTO',
          };
        }
      }

      // Try as indicators-only (calculate values)
      if ('indicators' in obj && typeof obj.indicators === 'object' && obj.indicators !== null) {
        try {
          const ind = obj.indicators as Record<string, unknown>;
          const indicators: OsaxClinicalIndicators = {
            ahi: Number(ind.ahi),
            odi: Number(ind.odi),
            spo2Nadir: Number(ind.spo2Nadir),
            spo2Average: Number(ind.spo2Average),
            sleepEfficiency: Number(ind.sleepEfficiency),
            essScore: Number(ind.essScore),
            ...(ind.bmi !== undefined && { bmi: Number(ind.bmi) }),
            ...(ind.neckCircumference !== undefined && {
              neckCircumference: Number(ind.neckCircumference),
            }),
            ...(ind.totalSleepTime !== undefined && {
              totalSleepTime: Number(ind.totalSleepTime),
            }),
            ...(ind.remAhi !== undefined && { remAhi: Number(ind.remAhi) }),
            ...(ind.supineAhi !== undefined && { supineAhi: Number(ind.supineAhi) }),
          };

          const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.9;

          return {
            success: true,
            value: OsaxClinicalScore.fromIndicators(indicators, confidence),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidOsaxScoreError ? e.message : 'Invalid indicators',
          };
        }
      }

      // Try as AHI-only
      if ('ahi' in obj && typeof obj.ahi === 'number') {
        try {
          const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.7;
          return { success: true, value: OsaxClinicalScore.fromAHI(obj.ahi, confidence) };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidOsaxScoreError ? e.message : 'Invalid AHI',
          };
        }
      }
    }

    // Try as numeric AHI
    if (typeof input === 'number') {
      try {
        return { success: true, value: OsaxClinicalScore.fromAHI(input) };
      } catch (e) {
        return {
          success: false,
          error: e instanceof InvalidOsaxScoreError ? e.message : 'Invalid AHI value',
        };
      }
    }

    return { success: false, error: `Cannot parse OsaxClinicalScore from: ${typeof input}` };
  }

  // ============================================================================
  // VALIDATION LOGIC
  // ============================================================================

  /**
   * Validate all clinical indicators
   *
   * @throws InvalidOsaxScoreError with details about invalid field
   */
  private static validateIndicators(indicators: OsaxClinicalIndicators): void {
    // Check for null/undefined
    if (!indicators || typeof indicators !== 'object') {
      throw new InvalidOsaxScoreError('Indicators must be a valid object', {
        field: 'indicators',
        value: indicators,
      });
    }

    // AHI validation
    if (
      typeof indicators.ahi !== 'number' ||
      Number.isNaN(indicators.ahi) ||
      indicators.ahi < 0 ||
      indicators.ahi > 150
    ) {
      throw new InvalidOsaxScoreError(`AHI must be between 0 and 150, got: ${indicators.ahi}`, {
        field: 'ahi',
        value: indicators.ahi,
        range: [0, 150],
      });
    }

    // ODI validation
    if (
      typeof indicators.odi !== 'number' ||
      Number.isNaN(indicators.odi) ||
      indicators.odi < 0 ||
      indicators.odi > 150
    ) {
      throw new InvalidOsaxScoreError(`ODI must be between 0 and 150, got: ${indicators.odi}`, {
        field: 'odi',
        value: indicators.odi,
        range: [0, 150],
      });
    }

    // SpO2 nadir validation
    if (
      typeof indicators.spo2Nadir !== 'number' ||
      Number.isNaN(indicators.spo2Nadir) ||
      indicators.spo2Nadir < 40 ||
      indicators.spo2Nadir > 100
    ) {
      throw new InvalidOsaxScoreError(
        `SpO2 nadir must be between 40 and 100, got: ${indicators.spo2Nadir}`,
        { field: 'spo2Nadir', value: indicators.spo2Nadir, range: [40, 100] }
      );
    }

    // SpO2 average validation
    if (
      typeof indicators.spo2Average !== 'number' ||
      Number.isNaN(indicators.spo2Average) ||
      indicators.spo2Average < 60 ||
      indicators.spo2Average > 100
    ) {
      throw new InvalidOsaxScoreError(
        `SpO2 average must be between 60 and 100, got: ${indicators.spo2Average}`,
        { field: 'spo2Average', value: indicators.spo2Average, range: [60, 100] }
      );
    }

    // SpO2 logical validation: nadir should not exceed average
    if (indicators.spo2Nadir > indicators.spo2Average) {
      throw new InvalidOsaxScoreError(
        `SpO2 nadir (${indicators.spo2Nadir}) cannot exceed SpO2 average (${indicators.spo2Average})`,
        {
          field: 'spo2',
          value: { nadir: indicators.spo2Nadir, average: indicators.spo2Average },
        }
      );
    }

    // Sleep efficiency validation
    if (
      typeof indicators.sleepEfficiency !== 'number' ||
      Number.isNaN(indicators.sleepEfficiency) ||
      indicators.sleepEfficiency < 0 ||
      indicators.sleepEfficiency > 100
    ) {
      throw new InvalidOsaxScoreError(
        `Sleep efficiency must be between 0 and 100, got: ${indicators.sleepEfficiency}`,
        { field: 'sleepEfficiency', value: indicators.sleepEfficiency, range: [0, 100] }
      );
    }

    // ESS score validation
    if (
      typeof indicators.essScore !== 'number' ||
      !Number.isInteger(indicators.essScore) ||
      indicators.essScore < 0 ||
      indicators.essScore > 24
    ) {
      throw new InvalidOsaxScoreError(
        `ESS score must be an integer between 0 and 24, got: ${indicators.essScore}`,
        { field: 'essScore', value: indicators.essScore, range: [0, 24] }
      );
    }

    // Optional: BMI validation
    if (
      indicators.bmi !== undefined &&
      (typeof indicators.bmi !== 'number' ||
        Number.isNaN(indicators.bmi) ||
        indicators.bmi < 10 ||
        indicators.bmi > 80)
    ) {
      throw new InvalidOsaxScoreError(`BMI must be between 10 and 80, got: ${indicators.bmi}`, {
        field: 'bmi',
        value: indicators.bmi,
        range: [10, 80],
      });
    }

    // Optional: Neck circumference validation
    if (
      indicators.neckCircumference !== undefined &&
      (typeof indicators.neckCircumference !== 'number' ||
        Number.isNaN(indicators.neckCircumference) ||
        indicators.neckCircumference < 20 ||
        indicators.neckCircumference > 80)
    ) {
      throw new InvalidOsaxScoreError(
        `Neck circumference must be between 20 and 80 cm, got: ${indicators.neckCircumference}`,
        { field: 'neckCircumference', value: indicators.neckCircumference, range: [20, 80] }
      );
    }

    // Optional: Total sleep time validation
    if (
      indicators.totalSleepTime !== undefined &&
      (typeof indicators.totalSleepTime !== 'number' ||
        Number.isNaN(indicators.totalSleepTime) ||
        indicators.totalSleepTime < 0 ||
        indicators.totalSleepTime > 720)
    ) {
      throw new InvalidOsaxScoreError(
        `Total sleep time must be between 0 and 720 minutes, got: ${indicators.totalSleepTime}`,
        { field: 'totalSleepTime', value: indicators.totalSleepTime, range: [0, 720] }
      );
    }

    // Optional: REM AHI validation
    if (
      indicators.remAhi !== undefined &&
      (typeof indicators.remAhi !== 'number' ||
        Number.isNaN(indicators.remAhi) ||
        indicators.remAhi < 0 ||
        indicators.remAhi > 200)
    ) {
      throw new InvalidOsaxScoreError(
        `REM AHI must be between 0 and 200, got: ${indicators.remAhi}`,
        { field: 'remAhi', value: indicators.remAhi, range: [0, 200] }
      );
    }

    // Optional: Supine AHI validation
    if (
      indicators.supineAhi !== undefined &&
      (typeof indicators.supineAhi !== 'number' ||
        Number.isNaN(indicators.supineAhi) ||
        indicators.supineAhi < 0 ||
        indicators.supineAhi > 200)
    ) {
      throw new InvalidOsaxScoreError(
        `Supine AHI must be between 0 and 200, got: ${indicators.supineAhi}`,
        { field: 'supineAhi', value: indicators.supineAhi, range: [0, 200] }
      );
    }
  }

  // ============================================================================
  // CALCULATION LOGIC (Private - encapsulated business rules)
  // ============================================================================

  /**
   * Calculate severity from AHI (per AASM guidelines)
   *
   * - None: AHI < 5
   * - Mild: 5 ≤ AHI < 15
   * - Moderate: 15 ≤ AHI < 30
   * - Severe: AHI ≥ 30
   */
  private static calculateSeverity(ahi: number): OsaxSeverity {
    if (ahi >= 30) return 'SEVERE';
    if (ahi >= 15) return 'MODERATE';
    if (ahi >= 5) return 'MILD';
    return 'NONE';
  }

  /**
   * Calculate composite score (0-100)
   *
   * Weighted combination of clinical indicators:
   * - AHI (40%): Primary diagnostic criterion
   * - SpO2 nadir (25%): Severity of desaturation
   * - ODI (20%): Frequency of desaturations
   * - ESS (15%): Symptom severity
   *
   * Higher composite score = more severe condition
   */
  private static calculateCompositeScore(indicators: OsaxClinicalIndicators): number {
    // Normalize AHI to 0-100 scale (capped at 60 events/hr)
    const ahiNormalized = Math.min(indicators.ahi / 60, 1) * 100;

    // Normalize SpO2 nadir (inverted: lower is worse)
    // 100% = 0 points, 60% = 100 points
    const spo2NadirNormalized = Math.max(0, (100 - indicators.spo2Nadir) / 40) * 100;

    // Normalize ODI (capped at 60 events/hr)
    const odiNormalized = Math.min(indicators.odi / 60, 1) * 100;

    // Normalize ESS (0-24 scale)
    const essNormalized = (indicators.essScore / 24) * 100;

    // Weighted average
    const composite =
      ahiNormalized * 0.4 + spo2NadirNormalized * 0.25 + odiNormalized * 0.2 + essNormalized * 0.15;

    return Math.round(composite * 10) / 10;
  }

  /**
   * Calculate cardiovascular risk
   *
   * Based on clinical evidence linking OSA severity and
   * nocturnal hypoxemia to cardiovascular complications.
   */
  private static calculateCardiovascularRisk(
    indicators: OsaxClinicalIndicators
  ): OsaxCardiovascularRisk {
    // Critical: severe OSA with significant desaturation
    if (indicators.ahi >= 30 && indicators.spo2Nadir < 75) {
      return 'CRITICAL';
    }

    // High: moderate-severe OSA or significant desaturation
    if (indicators.ahi >= 15 || indicators.spo2Nadir < 80) {
      return 'HIGH';
    }

    // Moderate: mild OSA with some risk factors
    if (indicators.ahi >= 5 || indicators.odi >= 10) {
      return 'MODERATE';
    }

    return 'LOW';
  }

  /**
   * Calculate treatment recommendation
   *
   * Evidence-based treatment pathway selection based on
   * severity, symptoms, and anatomical factors.
   */
  private static calculateTreatmentRecommendation(
    indicators: OsaxClinicalIndicators
  ): OsaxTreatmentRecommendation {
    const severity = OsaxClinicalScore.calculateSeverity(indicators.ahi);

    // Severe OSA with significant desaturation - may need BiPAP
    if (severity === 'SEVERE' && indicators.spo2Nadir < 75) {
      return 'BIPAP_THERAPY';
    }

    // Severe OSA
    if (severity === 'SEVERE') {
      return 'CPAP_THERAPY';
    }

    // Moderate OSA
    if (severity === 'MODERATE') {
      // Check for positional dependency (supine AHI > 2x overall AHI)
      if (
        indicators.supineAhi !== undefined &&
        indicators.ahi > 0 &&
        indicators.supineAhi / indicators.ahi > 2
      ) {
        return 'POSITIONAL_THERAPY';
      }
      return 'CPAP_THERAPY';
    }

    // Mild OSA
    if (severity === 'MILD') {
      // Recommend lifestyle modification for obese patients first
      if (indicators.bmi !== undefined && indicators.bmi >= 30) {
        return 'LIFESTYLE_MODIFICATION';
      }
      // Consider oral appliance for non-obese mild OSA
      return 'ORAL_APPLIANCE';
    }

    // No OSA - lifestyle advice
    return 'LIFESTYLE_MODIFICATION';
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if patient has OSA (AHI >= 5)
   */
  public hasOSA(): boolean {
    return this.severity !== 'NONE';
  }

  /**
   * Check if severity is at least moderate
   */
  public isModerateOrWorse(): boolean {
    return this.severity === 'MODERATE' || this.severity === 'SEVERE';
  }

  /**
   * Check if severity is severe
   */
  public isSevere(): boolean {
    return this.severity === 'SEVERE';
  }

  /**
   * Check if CPAP therapy is recommended
   */
  public requiresCPAP(): boolean {
    return (
      this.treatmentRecommendation === 'CPAP_THERAPY' ||
      this.treatmentRecommendation === 'BIPAP_THERAPY'
    );
  }

  /**
   * Check if BiPAP specifically is recommended
   */
  public requiresBiPAP(): boolean {
    return this.treatmentRecommendation === 'BIPAP_THERAPY';
  }

  /**
   * Check if patient requires urgent intervention
   */
  public requiresUrgentIntervention(): boolean {
    return this.cardiovascularRisk === 'CRITICAL' || this.severity === 'SEVERE';
  }

  /**
   * Check if patient is a surgical candidate
   *
   * Considers severity and BMI for surgical eligibility.
   * Patients with BMI >= 35 typically have poorer surgical outcomes.
   */
  public isSurgicalCandidate(): boolean {
    return (
      this.isModerateOrWorse() && this.indicators.bmi !== undefined && this.indicators.bmi < 35
    );
  }

  /**
   * Check if ESS indicates excessive daytime sleepiness
   * ESS >= 10 is considered abnormal
   */
  public hasExcessiveDaytimeSleepiness(): boolean {
    return this.indicators.essScore >= 10;
  }

  /**
   * Check if there's clinically significant nocturnal hypoxemia
   * SpO2 nadir < 80% or average < 90% is concerning
   */
  public hasSignificantHypoxemia(): boolean {
    return this.indicators.spo2Nadir < 80 || this.indicators.spo2Average < 90;
  }

  /**
   * Check if there's severe nocturnal hypoxemia
   * SpO2 nadir < 70% is severe
   */
  public hasSevereHypoxemia(): boolean {
    return this.indicators.spo2Nadir < 70;
  }

  /**
   * Check if patient has positional OSA
   * Supine AHI > 2x non-supine AHI indicates positional component
   */
  public hasPositionalOSA(): boolean {
    if (this.indicators.supineAhi === undefined || this.indicators.ahi === 0) {
      return false;
    }
    return this.indicators.supineAhi / this.indicators.ahi > 2;
  }

  /**
   * Check if patient has REM-predominant OSA
   */
  public hasREMPredominantOSA(): boolean {
    if (this.indicators.remAhi === undefined || this.indicators.ahi === 0) {
      return false;
    }
    return this.indicators.remAhi / this.indicators.ahi > 2;
  }

  /**
   * Check if confidence level is high enough for clinical decisions
   */
  public isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * Check if score requires physician review
   */
  public requiresPhysicianReview(): boolean {
    return this.cardiovascularRisk === 'CRITICAL' || this.confidence < 0.7;
  }

  /**
   * Get urgency level for follow-up
   */
  public getFollowUpUrgency(): FollowUpUrgency {
    if (this.cardiovascularRisk === 'CRITICAL') return 'immediate';
    if (this.severity === 'SEVERE') return 'urgent';
    if (this.severity === 'MODERATE') return 'soon';
    return 'routine';
  }

  /**
   * Get SLA response time in hours for clinical review
   */
  public getClinicalReviewSLAHours(): number {
    return CLINICAL_SLA_HOURS[this.getFollowUpUrgency()];
  }

  /**
   * Get clinical task priority
   */
  public getTaskPriority(): ClinicalTaskPriority {
    if (this.cardiovascularRisk === 'CRITICAL') return 'critical';
    if (this.severity === 'SEVERE') return 'high';
    if (this.severity === 'MODERATE') return 'medium';
    return 'low';
  }

  /**
   * Get recommended re-evaluation interval in months
   */
  public getRecommendedReEvaluationMonths(): number {
    switch (this.severity) {
      case 'SEVERE':
        return 1;
      case 'MODERATE':
        return 3;
      case 'MILD':
        return 6;
      case 'NONE':
        return 12;
    }
  }

  /**
   * Check if patient should be referred to specialist
   */
  public shouldReferToSpecialist(): boolean {
    return (
      this.cardiovascularRisk === 'CRITICAL' ||
      this.cardiovascularRisk === 'HIGH' ||
      this.isSurgicalCandidate()
    );
  }

  /**
   * Get a human-readable clinical summary
   */
  public getClinicalSummary(): string {
    const parts: string[] = [];

    parts.push(`${this.severity} OSA (AHI: ${this.indicators.ahi})`);

    if (this.hasSignificantHypoxemia()) {
      parts.push(`SpO2 nadir: ${this.indicators.spo2Nadir}%`);
    }

    parts.push(`CV Risk: ${this.cardiovascularRisk}`);
    parts.push(`Recommendation: ${this.treatmentRecommendation.replace(/_/g, ' ')}`);

    return parts.join(' | ');
  }

  // ============================================================================
  // TRANSFORMATION METHODS (Immutability preserved)
  // ============================================================================

  /**
   * Create updated score with new indicators
   * Returns new OsaxClinicalScore (immutability preserved)
   *
   * @param partialIndicators - Partial indicators to update
   * @returns New OsaxClinicalScore with recalculated values
   */
  public withUpdatedIndicators(
    partialIndicators: Partial<OsaxClinicalIndicators>
  ): OsaxClinicalScore {
    const newIndicators = { ...this.indicators, ...partialIndicators };
    return OsaxClinicalScore.fromIndicators(newIndicators, this.confidence);
  }

  /**
   * Update confidence level
   * Returns new OsaxClinicalScore (immutability preserved)
   *
   * @param newConfidence - New confidence value (0-1)
   * @returns New OsaxClinicalScore with updated confidence
   */
  public withConfidence(newConfidence: number): OsaxClinicalScore {
    if (newConfidence < 0 || newConfidence > 1 || Number.isNaN(newConfidence)) {
      throw new InvalidOsaxScoreError(`Confidence must be between 0 and 1, got: ${newConfidence}`, {
        field: 'confidence',
        value: newConfidence,
        range: [0, 1],
      });
    }
    return OsaxClinicalScore.fromIndicators(this.indicators, newConfidence);
  }

  /**
   * Create a copy with modified fields
   * Returns new OsaxClinicalScore (immutability preserved)
   *
   * @param modifications - Fields to modify
   * @returns New OsaxClinicalScore
   */
  public copy(
    modifications: Partial<{
      indicators: Partial<OsaxClinicalIndicators>;
      confidence: number;
    }> = {}
  ): OsaxClinicalScore {
    const newIndicators = modifications.indicators
      ? { ...this.indicators, ...modifications.indicators }
      : this.indicators;

    const newConfidence = modifications.confidence ?? this.confidence;

    return OsaxClinicalScore.fromIndicators(newIndicators, newConfidence);
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   *
   * Two OsaxClinicalScores are equal if they have the same
   * composite score, severity, and key indicators.
   */
  public equals(other: OsaxClinicalScore | null | undefined): boolean {
    if (!other) return false;
    if (this === other) return true;

    return (
      this.compositeScore === other.compositeScore &&
      this.severity === other.severity &&
      this.cardiovascularRisk === other.cardiovascularRisk &&
      this.indicators.ahi === other.indicators.ahi &&
      this.indicators.odi === other.indicators.odi &&
      this.indicators.spo2Nadir === other.indicators.spo2Nadir
    );
  }

  /**
   * Generate hash for value identity
   *
   * Useful for caching, deduplication, and collection operations.
   * Same inputs always produce the same hash.
   */
  public hash(): string {
    const parts = [
      this.compositeScore.toFixed(1),
      this.severity,
      this.indicators.ahi.toFixed(1),
      this.indicators.odi.toFixed(1),
      this.indicators.spo2Nadir.toString(),
      this.indicators.spo2Average.toString(),
      this.indicators.essScore.toString(),
    ];
    return parts.join('|');
  }

  /**
   * Compare scores (for sorting by severity)
   * Returns positive if this is more severe, negative if less severe
   */
  public compareTo(other: OsaxClinicalScore): number {
    return this.compositeScore - other.compositeScore;
  }

  /**
   * Check if this score indicates worse condition than another
   */
  public isWorseThan(other: OsaxClinicalScore): boolean {
    return this.compositeScore > other.compositeScore;
  }

  /**
   * Check if this score indicates better condition than another
   */
  public isBetterThan(other: OsaxClinicalScore): boolean {
    return this.compositeScore < other.compositeScore;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): OsaxClinicalScoreDTO {
    return {
      compositeScore: this.compositeScore,
      severity: this.severity,
      cardiovascularRisk: this.cardiovascularRisk,
      treatmentRecommendation: this.treatmentRecommendation,
      indicators: { ...this.indicators },
      confidence: this.confidence,
      scoredAt: this.scoredAt.toISOString(),
      algorithmVersion: this.algorithmVersion,
    };
  }

  /**
   * Convert to primitive (composite score only)
   * Useful for numeric comparisons and storage
   */
  public toPrimitive(): number {
    return this.compositeScore;
  }

  /**
   * String representation for debugging/logging
   */
  public toString(): string {
    return `OsaxClinicalScore(AHI: ${this.indicators.ahi}, Severity: ${this.severity}, Composite: ${this.compositeScore}, CV Risk: ${this.cardiovascularRisk})`;
  }

  /**
   * Get a compact string representation for logs
   */
  public toCompactString(): string {
    return `OSAX[${this.severity}:${this.compositeScore}]`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid OsaxClinicalScore
 *
 * Includes structured details about the validation failure
 * for better error handling and debugging.
 */
export class InvalidOsaxScoreError extends Error {
  public readonly code = 'INVALID_OSAX_SCORE' as const;
  public readonly details: InvalidOsaxScoreErrorDetails;

  constructor(message: string, details: InvalidOsaxScoreErrorDetails = {}) {
    super(message);
    this.name = 'InvalidOsaxScoreError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidOsaxScoreError.prototype);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Details for InvalidOsaxScoreError
 */
export interface InvalidOsaxScoreErrorDetails {
  /** Field that failed validation */
  field?: string;
  /** Value that failed validation */
  value?: unknown;
  /** Valid range if applicable */
  range?: [number, number];
}

/**
 * DTO for OsaxClinicalScore serialization
 *
 * Used for:
 * - Database persistence
 * - API responses
 * - Reconstitution via OsaxClinicalScore.reconstitute()
 */
export interface OsaxClinicalScoreDTO {
  compositeScore: number;
  severity: OsaxSeverity;
  cardiovascularRisk: OsaxCardiovascularRisk;
  treatmentRecommendation: OsaxTreatmentRecommendation;
  indicators: OsaxClinicalIndicators;
  confidence: number;
  scoredAt: string | Date;
  algorithmVersion?: string;
}

/**
 * Parse result type for OsaxClinicalScore
 *
 * Provides type-safe error handling without exceptions.
 */
export type OsaxClinicalScoreParseResult =
  | { success: true; value: OsaxClinicalScore }
  | { success: false; error: string };

/**
 * Type guard to check if a value is an OsaxClinicalScore
 */
export function isOsaxClinicalScore(value: unknown): value is OsaxClinicalScore {
  return value instanceof OsaxClinicalScore;
}

/**
 * Type guard to check if a parse result is successful
 */
export function isSuccessfulParse(
  result: OsaxClinicalScoreParseResult
): result is { success: true; value: OsaxClinicalScore } {
  return result.success === true;
}
