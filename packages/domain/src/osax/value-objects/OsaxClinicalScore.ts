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
 *
 * CLINICAL CONTEXT:
 * The OSAX score combines multiple clinical indicators to assess sleep apnea severity:
 * - AHI (Apnea-Hypopnea Index): events per hour
 * - ODI (Oxygen Desaturation Index): desaturation events per hour
 * - SpO2 nadir: lowest oxygen saturation recorded
 * - Sleep efficiency: percentage of time asleep
 * - ESS (Epworth Sleepiness Scale): daytime sleepiness score
 */

/**
 * OSAX severity classification
 * Based on AHI thresholds per AASM guidelines
 */
export type OsaxSeverity = 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';

/**
 * Risk level for cardiovascular complications
 */
export type OsaxCardiovascularRisk = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/**
 * Treatment recommendation based on score
 */
export type OsaxTreatmentRecommendation =
  | 'LIFESTYLE_MODIFICATION'
  | 'POSITIONAL_THERAPY'
  | 'ORAL_APPLIANCE'
  | 'CPAP_THERAPY'
  | 'BIPAP_THERAPY'
  | 'SURGERY_EVALUATION';

/**
 * Clinical indicators used for OSAX scoring
 */
export interface OsaxClinicalIndicators {
  /** Apnea-Hypopnea Index: events per hour of sleep */
  readonly ahi: number;

  /** Oxygen Desaturation Index: desaturation events per hour */
  readonly odi: number;

  /** Lowest SpO2 percentage recorded during study */
  readonly spo2Nadir: number;

  /** Average SpO2 percentage during study */
  readonly spo2Average: number;

  /** Sleep efficiency percentage (time asleep / time in bed) */
  readonly sleepEfficiency: number;

  /** Epworth Sleepiness Scale score (0-24) */
  readonly essScore: number;

  /** Body Mass Index */
  readonly bmi?: number;

  /** Neck circumference in cm */
  readonly neckCircumference?: number;

  /** Total sleep time in minutes */
  readonly totalSleepTime?: number;

  /** REM AHI if available (events during REM sleep) */
  readonly remAhi?: number;

  /** Supine AHI if available (events while supine) */
  readonly supineAhi?: number;
}

/**
 * OsaxClinicalScore Value Object
 *
 * Represents a comprehensive clinical score for Obstructive Sleep Apnea assessment.
 * This is a true Value Object following DDD principles.
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
 * ```
 */
export class OsaxClinicalScore {
  /**
   * Composite score (0-100) derived from clinical indicators
   */
  public readonly compositeScore: number;

  /**
   * Severity classification
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
   * Original clinical indicators
   */
  public readonly indicators: OsaxClinicalIndicators;

  /**
   * Confidence level of the score (0-1)
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
    compositeScore: number,
    severity: OsaxSeverity,
    cardiovascularRisk: OsaxCardiovascularRisk,
    treatmentRecommendation: OsaxTreatmentRecommendation,
    indicators: OsaxClinicalIndicators,
    confidence: number,
    scoredAt: Date = new Date()
  ) {
    this.compositeScore = compositeScore;
    this.severity = severity;
    this.cardiovascularRisk = cardiovascularRisk;
    this.treatmentRecommendation = treatmentRecommendation;
    this.indicators = Object.freeze({ ...indicators });
    this.confidence = confidence;
    this.scoredAt = scoredAt;

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create OsaxClinicalScore from clinical indicators
   *
   * @param indicators - Clinical measurement data
   * @param confidence - Confidence level (0-1), defaults to 0.9
   * @returns OsaxClinicalScore instance
   * @throws InvalidOsaxScoreError if indicators are out of valid range
   */
  public static fromIndicators(
    indicators: OsaxClinicalIndicators,
    confidence: number = 0.9
  ): OsaxClinicalScore {
    // Validate indicators
    OsaxClinicalScore.validateIndicators(indicators);

    // Calculate derived values
    const severity = OsaxClinicalScore.calculateSeverity(indicators.ahi);
    const compositeScore = OsaxClinicalScore.calculateCompositeScore(indicators);
    const cardiovascularRisk = OsaxClinicalScore.calculateCardiovascularRisk(indicators);
    const treatmentRecommendation =
      OsaxClinicalScore.calculateTreatmentRecommendation(indicators);

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
   */
  public static fromAHI(ahi: number, confidence: number = 0.7): OsaxClinicalScore {
    if (ahi < 0 || ahi > 150) {
      throw new InvalidOsaxScoreError(`AHI must be between 0 and 150, got: ${ahi}`);
    }

    // Create minimal indicators with estimated values
    const indicators: OsaxClinicalIndicators = {
      ahi,
      odi: ahi * 0.85, // Estimated ODI based on typical correlation
      spo2Nadir: ahi >= 30 ? 75 : ahi >= 15 ? 82 : ahi >= 5 ? 88 : 94,
      spo2Average: ahi >= 30 ? 89 : ahi >= 15 ? 92 : 95,
      sleepEfficiency: 75,
      essScore: ahi >= 30 ? 16 : ahi >= 15 ? 12 : ahi >= 5 ? 8 : 4,
    };

    return OsaxClinicalScore.fromIndicators(indicators, confidence);
  }

  /**
   * Parse from unknown input (for API/database hydration)
   */
  public static parse(input: unknown): OsaxClinicalScoreParseResult {
    if (input instanceof OsaxClinicalScore) {
      return { success: true, value: input };
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;

      // Check for indicators
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

          const confidence =
            typeof obj.confidence === 'number' ? obj.confidence : 0.9;

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

      // Check for AHI-only
      if ('ahi' in obj && typeof obj.ahi === 'number') {
        try {
          return { success: true, value: OsaxClinicalScore.fromAHI(obj.ahi) };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidOsaxScoreError ? e.message : 'Invalid AHI',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse OsaxClinicalScore from: ${typeof input}` };
  }

  // ============================================================================
  // CALCULATION LOGIC
  // ============================================================================

  /**
   * Validate clinical indicators
   */
  private static validateIndicators(indicators: OsaxClinicalIndicators): void {
    // AHI validation
    if (indicators.ahi < 0 || indicators.ahi > 150) {
      throw new InvalidOsaxScoreError(
        `AHI must be between 0 and 150, got: ${indicators.ahi}`
      );
    }

    // ODI validation
    if (indicators.odi < 0 || indicators.odi > 150) {
      throw new InvalidOsaxScoreError(
        `ODI must be between 0 and 150, got: ${indicators.odi}`
      );
    }

    // SpO2 nadir validation
    if (indicators.spo2Nadir < 40 || indicators.spo2Nadir > 100) {
      throw new InvalidOsaxScoreError(
        `SpO2 nadir must be between 40 and 100, got: ${indicators.spo2Nadir}`
      );
    }

    // SpO2 average validation
    if (indicators.spo2Average < 60 || indicators.spo2Average > 100) {
      throw new InvalidOsaxScoreError(
        `SpO2 average must be between 60 and 100, got: ${indicators.spo2Average}`
      );
    }

    // Sleep efficiency validation
    if (indicators.sleepEfficiency < 0 || indicators.sleepEfficiency > 100) {
      throw new InvalidOsaxScoreError(
        `Sleep efficiency must be between 0 and 100, got: ${indicators.sleepEfficiency}`
      );
    }

    // ESS score validation
    if (
      !Number.isInteger(indicators.essScore) ||
      indicators.essScore < 0 ||
      indicators.essScore > 24
    ) {
      throw new InvalidOsaxScoreError(
        `ESS score must be an integer between 0 and 24, got: ${indicators.essScore}`
      );
    }

    // BMI validation if provided
    if (indicators.bmi !== undefined && (indicators.bmi < 10 || indicators.bmi > 80)) {
      throw new InvalidOsaxScoreError(
        `BMI must be between 10 and 80, got: ${indicators.bmi}`
      );
    }

    // Neck circumference validation if provided
    if (
      indicators.neckCircumference !== undefined &&
      (indicators.neckCircumference < 20 || indicators.neckCircumference > 80)
    ) {
      throw new InvalidOsaxScoreError(
        `Neck circumference must be between 20 and 80 cm, got: ${indicators.neckCircumference}`
      );
    }
  }

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
   * Weighted combination of:
   * - AHI (40%)
   * - SpO2 nadir (25%)
   * - ODI (20%)
   * - ESS (15%)
   */
  private static calculateCompositeScore(indicators: OsaxClinicalIndicators): number {
    // Normalize AHI to 0-100 scale (capped at 60 events/hr for normalization)
    const ahiNormalized = Math.min(indicators.ahi / 60, 1) * 100;

    // Normalize SpO2 nadir (inverted: lower is worse)
    // 100% = 0 points, 60% = 100 points
    const spo2NadirNormalized = Math.max(0, (100 - indicators.spo2Nadir) / 40) * 100;

    // Normalize ODI
    const odiNormalized = Math.min(indicators.odi / 60, 1) * 100;

    // Normalize ESS (0-24 scale)
    const essNormalized = (indicators.essScore / 24) * 100;

    // Weighted average
    const composite =
      ahiNormalized * 0.4 +
      spo2NadirNormalized * 0.25 +
      odiNormalized * 0.2 +
      essNormalized * 0.15;

    return Math.round(composite * 10) / 10;
  }

  /**
   * Calculate cardiovascular risk
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
   */
  private static calculateTreatmentRecommendation(
    indicators: OsaxClinicalIndicators
  ): OsaxTreatmentRecommendation {
    const severity = OsaxClinicalScore.calculateSeverity(indicators.ahi);

    // Severe OSA with significant desaturation
    if (severity === 'SEVERE' && indicators.spo2Nadir < 75) {
      return 'BIPAP_THERAPY';
    }

    // Severe OSA
    if (severity === 'SEVERE') {
      return 'CPAP_THERAPY';
    }

    // Moderate OSA
    if (severity === 'MODERATE') {
      // Check for positional dependency
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
      // Check BMI for lifestyle modification first
      if (indicators.bmi !== undefined && indicators.bmi >= 30) {
        return 'LIFESTYLE_MODIFICATION';
      }
      return 'ORAL_APPLIANCE';
    }

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
   * Check if CPAP therapy is recommended
   */
  public requiresCPAP(): boolean {
    return (
      this.treatmentRecommendation === 'CPAP_THERAPY' ||
      this.treatmentRecommendation === 'BIPAP_THERAPY'
    );
  }

  /**
   * Check if patient requires urgent intervention
   */
  public requiresUrgentIntervention(): boolean {
    return this.cardiovascularRisk === 'CRITICAL' || this.severity === 'SEVERE';
  }

  /**
   * Check if patient is a surgical candidate
   */
  public isSurgicalCandidate(): boolean {
    // Consider surgery for moderate-severe cases that may not tolerate CPAP
    return (
      this.isModerateOrWorse() &&
      this.indicators.bmi !== undefined &&
      this.indicators.bmi < 35
    );
  }

  /**
   * Check if ESS indicates excessive daytime sleepiness
   */
  public hasExcessiveDaytimeSleepiness(): boolean {
    return this.indicators.essScore >= 10;
  }

  /**
   * Check if there's significant nocturnal hypoxemia
   */
  public hasSignificantHypoxemia(): boolean {
    return this.indicators.spo2Nadir < 80 || this.indicators.spo2Average < 90;
  }

  /**
   * Get urgency level for follow-up
   */
  public getFollowUpUrgency(): 'routine' | 'soon' | 'urgent' | 'immediate' {
    if (this.cardiovascularRisk === 'CRITICAL') return 'immediate';
    if (this.severity === 'SEVERE') return 'urgent';
    if (this.severity === 'MODERATE') return 'soon';
    return 'routine';
  }

  /**
   * Get SLA response time in hours for clinical review
   */
  public getClinicalReviewSLAHours(): number {
    switch (this.getFollowUpUrgency()) {
      case 'immediate':
        return 4;
      case 'urgent':
        return 24;
      case 'soon':
        return 72;
      case 'routine':
        return 168; // 1 week
    }
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Create updated score with new indicators
   * Returns new OsaxClinicalScore (immutability preserved)
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
   */
  public withConfidence(newConfidence: number): OsaxClinicalScore {
    if (newConfidence < 0 || newConfidence > 1) {
      throw new InvalidOsaxScoreError(
        `Confidence must be between 0 and 1, got: ${newConfidence}`
      );
    }
    return OsaxClinicalScore.fromIndicators(this.indicators, newConfidence);
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: OsaxClinicalScore): boolean {
    return (
      this.compositeScore === other.compositeScore &&
      this.severity === other.severity &&
      this.indicators.ahi === other.indicators.ahi
    );
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
    };
  }

  /**
   * Convert to primitive (composite score)
   */
  public toPrimitive(): number {
    return this.compositeScore;
  }

  /**
   * String representation
   */
  public toString(): string {
    return `OsaxClinicalScore(AHI: ${this.indicators.ahi}, Severity: ${this.severity}, Composite: ${this.compositeScore})`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid OsaxClinicalScore
 */
export class InvalidOsaxScoreError extends Error {
  public readonly code = 'INVALID_OSAX_SCORE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidOsaxScoreError';
    Object.setPrototypeOf(this, InvalidOsaxScoreError.prototype);
  }
}

/**
 * DTO for OsaxClinicalScore serialization
 */
export interface OsaxClinicalScoreDTO {
  compositeScore: number;
  severity: OsaxSeverity;
  cardiovascularRisk: OsaxCardiovascularRisk;
  treatmentRecommendation: OsaxTreatmentRecommendation;
  indicators: OsaxClinicalIndicators;
  confidence: number;
  scoredAt: string;
}

/**
 * Parse result type
 */
export type OsaxClinicalScoreParseResult =
  | { success: true; value: OsaxClinicalScore }
  | { success: false; error: string };
