/**
 * @fileoverview AllOnXClinicalScore Value Object
 *
 * Banking/Medical Grade DDD Value Object for ONE STEP ALL ON X dental implant scoring.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/allonx/value-objects/allonx-clinical-score
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two AllOnXClinicalScores with same value are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Clinical scoring rules live here
 * 5. SINGLE SOURCE OF TRUTH - All scoring logic lives in this value object
 *
 * CLINICAL CONTEXT:
 * The AllOnX score combines multiple clinical indicators to assess patient
 * eligibility and risk for full-arch dental implant procedures:
 * - Bone quality and quantity assessment
 * - Medical risk factors (diabetes, smoking, medications)
 * - Oral health status
 * - Procedural complexity factors
 *
 * @see ITI Treatment Guide for Implant Dentistry
 * @see European Association for Osseointegration (EAO) Guidelines
 */

// ============================================================================
// BRANDED TYPES (Compile-time type safety)
// ============================================================================

/**
 * Branded type for validated bone density values (D1-D4)
 */
declare const BoneDensityBrand: unique symbol;
export type ValidatedBoneDensity = number & {
  readonly [BoneDensityBrand]: typeof BoneDensityBrand;
};

/**
 * Branded type for validated HbA1c percentage
 */
declare const HbA1cBrand: unique symbol;
export type ValidatedHbA1c = number & { readonly [HbA1cBrand]: typeof HbA1cBrand };

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
 * Arch type for All-on-X procedure
 */
export type AllOnXArchType = 'MAXILLA' | 'MANDIBLE' | 'BOTH';

/**
 * Procedure variant
 */
export type AllOnXProcedureType = 'ALL_ON_4' | 'ALL_ON_6' | 'ALL_ON_X_HYBRID';

/**
 * Bone density classification (Misch Classification)
 * D1: Dense cortical bone
 * D2: Dense to thick porous cortical bone with coarse trabecular bone
 * D3: Thin porous cortical bone with fine trabecular bone
 * D4: Fine trabecular bone only
 */
export type BoneDensityClass = 'D1' | 'D2' | 'D3' | 'D4';

/**
 * Patient eligibility classification
 */
export type AllOnXEligibility = 'IDEAL' | 'SUITABLE' | 'CONDITIONAL' | 'CONTRAINDICATED';

/**
 * Risk level classification
 */
export type AllOnXRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/**
 * Treatment complexity classification
 */
export type AllOnXComplexity = 'STANDARD' | 'MODERATE' | 'COMPLEX' | 'HIGHLY_COMPLEX';

/**
 * Treatment recommendation
 */
export type AllOnXTreatmentRecommendation =
  | 'PROCEED_STANDARD'
  | 'PROCEED_WITH_MODIFICATIONS'
  | 'STAGED_APPROACH'
  | 'BONE_AUGMENTATION_FIRST'
  | 'MEDICAL_CLEARANCE_REQUIRED'
  | 'ALTERNATIVE_TREATMENT'
  | 'NOT_RECOMMENDED';

/**
 * Follow-up urgency levels
 */
export type FollowUpUrgency = 'routine' | 'soon' | 'urgent' | 'immediate';

/**
 * Clinical task priority levels
 */
export type ClinicalTaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Smoking status classification
 */
export type SmokingStatus = 'NEVER' | 'FORMER' | 'LIGHT' | 'MODERATE' | 'HEAVY';

/**
 * Diabetes control status
 */
export type DiabetesStatus = 'NONE' | 'CONTROLLED' | 'MODERATELY_CONTROLLED' | 'POORLY_CONTROLLED';

/**
 * Clinical indicators used for AllOnX scoring
 * All values are readonly to ensure immutability
 */
export interface AllOnXClinicalIndicators {
  // ===== BONE ASSESSMENT =====
  /** Bone density classification (D1-D4) - numeric 1-4 */
  readonly boneDensity: number;

  /** Available bone height in maxilla (mm) - 0-30 */
  readonly maxillaBoneHeight: number;

  /** Available bone height in mandible (mm) - 0-30 */
  readonly mandibleBoneHeight: number;

  /** Available bone width at crest (mm) - 0-15 */
  readonly boneWidth: number;

  /** Sinus pneumatization level (1=minimal, 5=severe) */
  readonly sinusPneumatization?: number;

  // ===== MEDICAL RISK FACTORS =====
  /** HbA1c level for diabetes assessment (4-15%) */
  readonly hba1c?: number;

  /** Smoking status (0=never, 1=former, 2=light, 3=moderate, 4=heavy) */
  readonly smokingStatus: number;

  /** Years since quit smoking (for former smokers) */
  readonly yearsSinceQuitSmoking?: number;

  /** Currently on bisphosphonate therapy */
  readonly onBisphosphonates: boolean;

  /** Years on bisphosphonate therapy */
  readonly bisphosphonateYears?: number;

  /** Currently on anticoagulants */
  readonly onAnticoagulants: boolean;

  /** History of osteoporosis */
  readonly hasOsteoporosis: boolean;

  /** History of radiation therapy to head/neck */
  readonly hasRadiationHistory: boolean;

  /** Uncontrolled cardiovascular disease */
  readonly hasUncontrolledCardiovascular: boolean;

  /** Immunocompromised status */
  readonly isImmunocompromised: boolean;

  // ===== ORAL HEALTH STATUS =====
  /** Number of remaining teeth (0-32) */
  readonly remainingTeeth: number;

  /** Active periodontal disease severity (0=none, 1=mild, 2=moderate, 3=severe) */
  readonly periodontalDisease: number;

  /** Oral hygiene score (1=poor, 2=fair, 3=good, 4=excellent) */
  readonly oralHygieneScore: number;

  /** Presence of bruxism/clenching */
  readonly hasBruxism: boolean;

  /** Previous failed implants count */
  readonly previousFailedImplants?: number;

  // ===== PROCEDURAL FACTORS =====
  /** Target arch (1=maxilla, 2=mandible, 3=both) */
  readonly targetArch: number;

  /** Need for extractions count */
  readonly extractionsNeeded: number;

  /** Need for bone grafting */
  readonly needsBoneGrafting: boolean;

  /** Need for sinus lift */
  readonly needsSinusLift: boolean;

  /** Immediate loading feasibility score (1=not possible, 5=ideal) */
  readonly immediateLoadingFeasibility: number;

  // ===== PATIENT FACTORS =====
  /** Patient age in years */
  readonly patientAge: number;

  /** ASA physical status classification (1-5) */
  readonly asaClassification: number;

  /** Patient compliance likelihood (1=poor, 5=excellent) */
  readonly complianceScore: number;

  /** Esthetic demands level (1=low, 5=very high) */
  readonly estheticDemands: number;

  /** Functional demands level (1=low, 5=very high) */
  readonly functionalDemands: number;
}

/**
 * Validation constants for clinical indicators
 */
export const CLINICAL_INDICATOR_RANGES = {
  boneDensity: { min: 1, max: 4, unit: 'class' },
  maxillaBoneHeight: { min: 0, max: 30, unit: 'mm' },
  mandibleBoneHeight: { min: 0, max: 30, unit: 'mm' },
  boneWidth: { min: 0, max: 15, unit: 'mm' },
  sinusPneumatization: { min: 1, max: 5, unit: 'level' },
  hba1c: { min: 4, max: 15, unit: '%' },
  smokingStatus: { min: 0, max: 4, unit: 'level' },
  yearsSinceQuitSmoking: { min: 0, max: 50, unit: 'years' },
  bisphosphonateYears: { min: 0, max: 30, unit: 'years' },
  remainingTeeth: { min: 0, max: 32, unit: 'count' },
  periodontalDisease: { min: 0, max: 3, unit: 'severity' },
  oralHygieneScore: { min: 1, max: 4, unit: 'score' },
  previousFailedImplants: { min: 0, max: 20, unit: 'count' },
  targetArch: { min: 1, max: 3, unit: 'arch' },
  extractionsNeeded: { min: 0, max: 32, unit: 'count' },
  immediateLoadingFeasibility: { min: 1, max: 5, unit: 'score' },
  patientAge: { min: 18, max: 100, unit: 'years' },
  asaClassification: { min: 1, max: 5, unit: 'class' },
  complianceScore: { min: 1, max: 5, unit: 'score' },
  estheticDemands: { min: 1, max: 5, unit: 'level' },
  functionalDemands: { min: 1, max: 5, unit: 'level' },
} as const;

/**
 * Eligibility thresholds
 */
export const ELIGIBILITY_THRESHOLDS = {
  IDEAL: { minScore: 80 },
  SUITABLE: { minScore: 60, maxScore: 80 },
  CONDITIONAL: { minScore: 40, maxScore: 60 },
  CONTRAINDICATED: { maxScore: 40 },
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
 * AllOnXClinicalScore Value Object
 *
 * Represents a comprehensive clinical score for ONE STEP ALL ON X
 * dental implant procedure eligibility assessment.
 *
 * @example
 * ```typescript
 * const score = AllOnXClinicalScore.fromIndicators({
 *   boneDensity: 2,
 *   maxillaBoneHeight: 12,
 *   mandibleBoneHeight: 15,
 *   boneWidth: 8,
 *   smokingStatus: 0,
 *   onBisphosphonates: false,
 *   onAnticoagulants: false,
 *   hasOsteoporosis: false,
 *   hasRadiationHistory: false,
 *   hasUncontrolledCardiovascular: false,
 *   isImmunocompromised: false,
 *   remainingTeeth: 8,
 *   periodontalDisease: 1,
 *   oralHygieneScore: 3,
 *   hasBruxism: false,
 *   targetArch: 1,
 *   extractionsNeeded: 8,
 *   needsBoneGrafting: false,
 *   needsSinusLift: false,
 *   immediateLoadingFeasibility: 4,
 *   patientAge: 55,
 *   asaClassification: 2,
 *   complianceScore: 4,
 *   estheticDemands: 3,
 *   functionalDemands: 4,
 * });
 *
 * console.log(score.eligibility); // 'SUITABLE'
 * console.log(score.isCandidate()); // true
 * console.log(score.riskLevel); // 'LOW'
 * ```
 */
export class AllOnXClinicalScore {
  // ============================================================================
  // READONLY PROPERTIES
  // ============================================================================

  /**
   * Composite score (0-100) derived from clinical indicators
   * Higher score = better candidate
   */
  public readonly compositeScore: number;

  /**
   * Eligibility classification
   */
  public readonly eligibility: AllOnXEligibility;

  /**
   * Risk level classification
   */
  public readonly riskLevel: AllOnXRiskLevel;

  /**
   * Treatment complexity classification
   */
  public readonly complexity: AllOnXComplexity;

  /**
   * Recommended treatment approach
   */
  public readonly treatmentRecommendation: AllOnXTreatmentRecommendation;

  /**
   * Recommended procedure type
   */
  public readonly recommendedProcedure: AllOnXProcedureType;

  /**
   * Original clinical indicators (frozen)
   */
  public readonly indicators: Readonly<AllOnXClinicalIndicators>;

  /**
   * Confidence level of the score (0-1)
   */
  public readonly confidence: number;

  /**
   * Timestamp when score was calculated
   */
  public readonly scoredAt: Date;

  /**
   * Version of the scoring algorithm used
   */
  public readonly algorithmVersion: string = '2.0.0';

  // ============================================================================
  // PRIVATE CONSTRUCTOR
  // ============================================================================

  private constructor(
    compositeScore: number,
    eligibility: AllOnXEligibility,
    riskLevel: AllOnXRiskLevel,
    complexity: AllOnXComplexity,
    treatmentRecommendation: AllOnXTreatmentRecommendation,
    recommendedProcedure: AllOnXProcedureType,
    indicators: AllOnXClinicalIndicators,
    confidence: number,
    scoredAt: Date = new Date()
  ) {
    // Invariant validation
    if (compositeScore < 0 || compositeScore > 100 || Number.isNaN(compositeScore)) {
      throw new InvalidAllOnXScoreError(
        `Composite score must be between 0 and 100, got: ${compositeScore}`,
        { field: 'compositeScore', value: compositeScore, range: [0, 100] }
      );
    }

    if (confidence < 0 || confidence > 1 || Number.isNaN(confidence)) {
      throw new InvalidAllOnXScoreError(`Confidence must be between 0 and 1, got: ${confidence}`, {
        field: 'confidence',
        value: confidence,
        range: [0, 1],
      });
    }

    this.compositeScore = Math.round(compositeScore * 10) / 10;
    this.eligibility = eligibility;
    this.riskLevel = riskLevel;
    this.complexity = complexity;
    this.treatmentRecommendation = treatmentRecommendation;
    this.recommendedProcedure = recommendedProcedure;
    this.indicators = Object.freeze({ ...indicators });
    this.confidence = Math.round(confidence * 1000) / 1000;
    this.scoredAt = scoredAt;

    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create AllOnXClinicalScore from clinical indicators
   */
  public static fromIndicators(
    indicators: AllOnXClinicalIndicators,
    confidence = 0.9
  ): AllOnXClinicalScore {
    AllOnXClinicalScore.validateIndicators(indicators);

    if (confidence < 0 || confidence > 1 || Number.isNaN(confidence)) {
      throw new InvalidAllOnXScoreError(`Confidence must be between 0 and 1, got: ${confidence}`, {
        field: 'confidence',
        value: confidence,
        range: [0, 1],
      });
    }

    const compositeScore = AllOnXClinicalScore.calculateCompositeScore(indicators);
    const eligibility = AllOnXClinicalScore.calculateEligibility(compositeScore, indicators);
    const riskLevel = AllOnXClinicalScore.calculateRiskLevel(indicators);
    const complexity = AllOnXClinicalScore.calculateComplexity(indicators);
    const treatmentRecommendation = AllOnXClinicalScore.calculateTreatmentRecommendation(
      eligibility,
      riskLevel,
      complexity,
      indicators
    );
    const recommendedProcedure = AllOnXClinicalScore.calculateRecommendedProcedure(indicators);

    return new AllOnXClinicalScore(
      compositeScore,
      eligibility,
      riskLevel,
      complexity,
      treatmentRecommendation,
      recommendedProcedure,
      indicators,
      confidence
    );
  }

  /**
   * Quick screening score from minimal data
   */
  public static forScreening(
    boneDensity: number,
    boneHeight: number,
    smokingStatus: number,
    hba1c?: number,
    patientAge = 55,
    confidence = 0.6
  ): AllOnXClinicalScore {
    const indicators: AllOnXClinicalIndicators = {
      boneDensity,
      maxillaBoneHeight: boneHeight,
      mandibleBoneHeight: boneHeight,
      boneWidth: 8, // Conservative estimate
      smokingStatus,
      hba1c,
      onBisphosphonates: false,
      onAnticoagulants: false,
      hasOsteoporosis: false,
      hasRadiationHistory: false,
      hasUncontrolledCardiovascular: false,
      isImmunocompromised: false,
      remainingTeeth: 10,
      periodontalDisease: 1,
      oralHygieneScore: 3,
      hasBruxism: false,
      targetArch: 1,
      extractionsNeeded: 10,
      needsBoneGrafting: false,
      needsSinusLift: false,
      immediateLoadingFeasibility: 3,
      patientAge,
      asaClassification: 2,
      complianceScore: 3,
      estheticDemands: 3,
      functionalDemands: 3,
    };

    return AllOnXClinicalScore.fromIndicators(indicators, confidence);
  }

  /**
   * Reconstitute from database/DTO
   */
  public static reconstitute(dto: AllOnXClinicalScoreDTO): AllOnXClinicalScore {
    // Type guard for runtime safety when called with unknown data
    const dtoUnknown = dto as unknown;
    if (dtoUnknown === null || dtoUnknown === undefined || typeof dtoUnknown !== 'object') {
      throw new InvalidAllOnXScoreError('Invalid DTO: must be an object', {
        field: 'dto',
        value: dtoUnknown,
      });
    }

    const requiredFields = [
      'compositeScore',
      'eligibility',
      'riskLevel',
      'complexity',
      'treatmentRecommendation',
      'recommendedProcedure',
      'indicators',
      'confidence',
      'scoredAt',
    ] as const;

    for (const field of requiredFields) {
      if (!(field in dto)) {
        throw new InvalidAllOnXScoreError(`Missing required field: ${field}`, {
          field,
          value: undefined,
        });
      }
    }

    AllOnXClinicalScore.validateIndicators(dto.indicators);

    const scoredAt = typeof dto.scoredAt === 'string' ? new Date(dto.scoredAt) : dto.scoredAt;

    if (isNaN(scoredAt.getTime())) {
      throw new InvalidAllOnXScoreError(`Invalid scoredAt date: ${String(dto.scoredAt)}`, {
        field: 'scoredAt',
        value: dto.scoredAt,
      });
    }

    return new AllOnXClinicalScore(
      dto.compositeScore,
      dto.eligibility,
      dto.riskLevel,
      dto.complexity,
      dto.treatmentRecommendation,
      dto.recommendedProcedure,
      dto.indicators,
      dto.confidence,
      scoredAt
    );
  }

  /**
   * Parse from unknown input
   */
  public static parse(input: unknown): AllOnXClinicalScoreParseResult {
    if (input instanceof AllOnXClinicalScore) {
      return { success: true, value: input };
    }

    if (input === null || input === undefined) {
      return { success: false, error: 'Cannot parse AllOnXClinicalScore from null/undefined' };
    }

    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;

      if ('compositeScore' in obj && 'eligibility' in obj && 'indicators' in obj) {
        try {
          return {
            success: true,
            value: AllOnXClinicalScore.reconstitute(obj as unknown as AllOnXClinicalScoreDTO),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidAllOnXScoreError ? e.message : 'Invalid DTO',
          };
        }
      }

      if ('indicators' in obj && typeof obj.indicators === 'object' && obj.indicators !== null) {
        try {
          const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.9;
          return {
            success: true,
            value: AllOnXClinicalScore.fromIndicators(
              obj.indicators as AllOnXClinicalIndicators,
              confidence
            ),
          };
        } catch (e) {
          return {
            success: false,
            error: e instanceof InvalidAllOnXScoreError ? e.message : 'Invalid indicators',
          };
        }
      }
    }

    return { success: false, error: `Cannot parse AllOnXClinicalScore from: ${typeof input}` };
  }

  // ============================================================================
  // VALIDATION SCHEMA & HELPERS
  // ============================================================================

  /**
   * Validation rules for numeric indicator fields.
   * Each rule defines the field name, valid range, whether it's required,
   * whether it must be an integer, and a human-readable description.
   */
  private static readonly NUMERIC_FIELD_RULES: readonly {
    readonly field: keyof AllOnXClinicalIndicators;
    readonly min: number;
    readonly max: number;
    readonly required: boolean;
    readonly integer: boolean;
    readonly description: string;
  }[] = [
    {
      field: 'boneDensity',
      min: 1,
      max: 4,
      required: true,
      integer: false,
      description: 'Bone density (D1-D4)',
    },
    {
      field: 'maxillaBoneHeight',
      min: 0,
      max: 30,
      required: true,
      integer: false,
      description: 'Maxilla bone height (mm)',
    },
    {
      field: 'mandibleBoneHeight',
      min: 0,
      max: 30,
      required: true,
      integer: false,
      description: 'Mandible bone height (mm)',
    },
    {
      field: 'boneWidth',
      min: 0,
      max: 15,
      required: true,
      integer: false,
      description: 'Bone width (mm)',
    },
    {
      field: 'smokingStatus',
      min: 0,
      max: 4,
      required: true,
      integer: true,
      description: 'Smoking status',
    },
    { field: 'hba1c', min: 4, max: 15, required: false, integer: false, description: 'HbA1c (%)' },
    {
      field: 'patientAge',
      min: 18,
      max: 100,
      required: true,
      integer: true,
      description: 'Patient age',
    },
    {
      field: 'asaClassification',
      min: 1,
      max: 5,
      required: true,
      integer: true,
      description: 'ASA classification',
    },
    {
      field: 'oralHygieneScore',
      min: 1,
      max: 4,
      required: true,
      integer: true,
      description: 'Oral hygiene score',
    },
    {
      field: 'targetArch',
      min: 1,
      max: 3,
      required: true,
      integer: true,
      description: 'Target arch (1=maxilla, 2=mandible, 3=both)',
    },
    {
      field: 'complianceScore',
      min: 1,
      max: 5,
      required: true,
      integer: true,
      description: 'Compliance score',
    },
    {
      field: 'periodontalDisease',
      min: 0,
      max: 3,
      required: true,
      integer: true,
      description: 'Periodontal disease severity',
    },
    {
      field: 'immediateLoadingFeasibility',
      min: 1,
      max: 5,
      required: true,
      integer: true,
      description: 'Immediate loading feasibility',
    },
  ] as const;

  /**
   * Validates a single numeric indicator field against its rules.
   * @throws InvalidAllOnXScoreError if validation fails
   */
  private static validateNumericField(
    value: unknown,
    field: string,
    min: number,
    max: number,
    required: boolean,
    integer: boolean,
    description: string
  ): void {
    // Skip optional fields that are undefined
    if (!required && value === undefined) {
      return;
    }

    // Type and NaN check
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new InvalidAllOnXScoreError(`${description} must be a number, got: ${String(value)}`, {
        field,
        value,
        range: [min, max],
      });
    }

    // Integer check if required
    if (integer && !Number.isInteger(value)) {
      throw new InvalidAllOnXScoreError(
        `${description} must be an integer between ${min} and ${max}, got: ${value}`,
        { field, value, range: [min, max] }
      );
    }

    // Range check
    if (value < min || value > max) {
      throw new InvalidAllOnXScoreError(
        `${description} must be between ${min} and ${max}, got: ${value}`,
        { field, value, range: [min, max] }
      );
    }
  }

  // ============================================================================
  // VALIDATION LOGIC
  // ============================================================================

  /**
   * Validates all clinical indicators.
   * Uses a data-driven approach with NUMERIC_FIELD_RULES for consistent validation.
   */
  private static validateIndicators(indicators: AllOnXClinicalIndicators): void {
    // Type guard for runtime safety when called with unknown data
    const indicatorsUnknown = indicators as unknown;
    if (
      indicatorsUnknown === null ||
      indicatorsUnknown === undefined ||
      typeof indicatorsUnknown !== 'object'
    ) {
      throw new InvalidAllOnXScoreError('Indicators must be a valid object', {
        field: 'indicators',
        value: indicatorsUnknown,
      });
    }

    // Validate all numeric fields using the rules configuration
    for (const rule of AllOnXClinicalScore.NUMERIC_FIELD_RULES) {
      AllOnXClinicalScore.validateNumericField(
        indicators[rule.field],
        rule.field,
        rule.min,
        rule.max,
        rule.required,
        rule.integer,
        rule.description
      );
    }
  }

  // ============================================================================
  // CALCULATION LOGIC
  // ============================================================================

  /**
   * Calculate composite score (0-100)
   * Higher score = better candidate for All-on-X
   */
  private static calculateCompositeScore(indicators: AllOnXClinicalIndicators): number {
    let score = 100;

    // ===== BONE ASSESSMENT (35% weight) =====
    // Bone density penalty (D4 is worst)
    const boneDensityPenalty = (indicators.boneDensity - 1) * 5; // 0, 5, 10, 15
    score -= boneDensityPenalty;

    // Bone height assessment
    const targetBoneHeight =
      indicators.targetArch === 2 ? indicators.mandibleBoneHeight : indicators.maxillaBoneHeight;

    if (targetBoneHeight < 8) {
      score -= 15; // Insufficient bone
    } else if (targetBoneHeight < 10) {
      score -= 8;
    } else if (targetBoneHeight < 12) {
      score -= 3;
    }

    // Bone width penalty
    if (indicators.boneWidth < 5) {
      score -= 12;
    } else if (indicators.boneWidth < 6) {
      score -= 6;
    } else if (indicators.boneWidth < 7) {
      score -= 2;
    }

    // ===== MEDICAL RISK FACTORS (30% weight) =====
    // Smoking penalty
    score -= indicators.smokingStatus * 4; // 0, 4, 8, 12, 16

    // Diabetes penalty
    if (indicators.hba1c !== undefined) {
      if (indicators.hba1c > 9) {
        score -= 20; // Poorly controlled
      } else if (indicators.hba1c > 7.5) {
        score -= 10; // Moderately controlled
      } else if (indicators.hba1c > 7) {
        score -= 5;
      }
    }

    // Bisphosphonate penalty
    if (indicators.onBisphosphonates) {
      const years = indicators.bisphosphonateYears ?? 1;
      score -= Math.min(years * 3, 20);
    }

    // Other medical conditions
    if (indicators.hasOsteoporosis) score -= 8;
    if (indicators.hasRadiationHistory) score -= 25;
    if (indicators.hasUncontrolledCardiovascular) score -= 20;
    if (indicators.isImmunocompromised) score -= 15;
    if (indicators.onAnticoagulants) score -= 5;

    // ASA classification penalty
    if (indicators.asaClassification >= 4) {
      score -= 20;
    } else if (indicators.asaClassification === 3) {
      score -= 10;
    }

    // ===== ORAL HEALTH (20% weight) =====
    // Periodontal disease penalty
    score -= indicators.periodontalDisease * 5;

    // Oral hygiene bonus/penalty
    score += (indicators.oralHygieneScore - 2) * 3; // -3 to +6

    // Bruxism penalty
    if (indicators.hasBruxism) score -= 8;

    // Previous failed implants penalty
    if (indicators.previousFailedImplants !== undefined && indicators.previousFailedImplants > 0) {
      score -= Math.min(indicators.previousFailedImplants * 5, 15);
    }

    // ===== PROCEDURAL COMPLEXITY (10% weight) =====
    if (indicators.needsBoneGrafting) score -= 5;
    if (indicators.needsSinusLift) score -= 5;
    if (indicators.targetArch === 3) score -= 5; // Both arches more complex

    // ===== PATIENT FACTORS (5% weight) =====
    // Age considerations
    if (indicators.patientAge > 75) {
      score -= 5;
    } else if (indicators.patientAge > 80) {
      score -= 10;
    }

    // Compliance bonus/penalty
    score += (indicators.complianceScore - 3) * 2;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  }

  /**
   * Calculate eligibility classification
   */
  private static calculateEligibility(
    compositeScore: number,
    indicators: AllOnXClinicalIndicators
  ): AllOnXEligibility {
    // Absolute contraindications
    if (
      indicators.hasRadiationHistory ||
      indicators.asaClassification >= 4 ||
      (indicators.hba1c !== undefined && indicators.hba1c > 10) ||
      indicators.hasUncontrolledCardiovascular
    ) {
      return 'CONTRAINDICATED';
    }

    // Score-based classification
    if (compositeScore >= 80) return 'IDEAL';
    if (compositeScore >= 60) return 'SUITABLE';
    if (compositeScore >= 40) return 'CONDITIONAL';
    return 'CONTRAINDICATED';
  }

  /**
   * Calculate risk level
   */
  private static calculateRiskLevel(indicators: AllOnXClinicalIndicators): AllOnXRiskLevel {
    let riskScore = 0;

    // Medical risks
    if (indicators.smokingStatus >= 3) riskScore += 20;
    else if (indicators.smokingStatus >= 2) riskScore += 10;

    if (indicators.hba1c !== undefined) {
      if (indicators.hba1c > 9) riskScore += 25;
      else if (indicators.hba1c > 7.5) riskScore += 15;
    }

    if (indicators.onBisphosphonates) riskScore += 20;
    if (indicators.hasOsteoporosis) riskScore += 10;
    if (indicators.isImmunocompromised) riskScore += 15;
    if (indicators.onAnticoagulants) riskScore += 10;
    if (indicators.asaClassification >= 3) riskScore += 15;

    // Anatomical risks
    if (indicators.boneDensity >= 4) riskScore += 15;
    if (indicators.boneWidth < 5) riskScore += 15;

    // Oral health risks
    if (indicators.periodontalDisease >= 2) riskScore += 10;
    if (indicators.hasBruxism) riskScore += 10;
    if (indicators.oralHygieneScore <= 1) riskScore += 15;

    if (riskScore >= 60) return 'CRITICAL';
    if (riskScore >= 40) return 'HIGH';
    if (riskScore >= 20) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Calculate complexity classification
   */
  private static calculateComplexity(indicators: AllOnXClinicalIndicators): AllOnXComplexity {
    let complexityScore = 0;

    // Anatomical complexity
    if (indicators.needsBoneGrafting) complexityScore += 15;
    if (indicators.needsSinusLift) complexityScore += 20;
    if (indicators.targetArch === 3) complexityScore += 20;
    if (indicators.boneDensity >= 4) complexityScore += 10;
    if (indicators.boneWidth < 6) complexityScore += 10;

    const boneHeight =
      indicators.targetArch === 2 ? indicators.mandibleBoneHeight : indicators.maxillaBoneHeight;
    if (boneHeight < 10) complexityScore += 15;

    // Procedural complexity
    if (indicators.extractionsNeeded > 15) complexityScore += 10;
    if (indicators.immediateLoadingFeasibility <= 2) complexityScore += 15;

    // Esthetic demands
    if (indicators.estheticDemands >= 5) complexityScore += 10;

    if (complexityScore >= 60) return 'HIGHLY_COMPLEX';
    if (complexityScore >= 40) return 'COMPLEX';
    if (complexityScore >= 20) return 'MODERATE';
    return 'STANDARD';
  }

  /**
   * Calculate treatment recommendation
   */
  private static calculateTreatmentRecommendation(
    eligibility: AllOnXEligibility,
    riskLevel: AllOnXRiskLevel,
    complexity: AllOnXComplexity,
    indicators: AllOnXClinicalIndicators
  ): AllOnXTreatmentRecommendation {
    if (eligibility === 'CONTRAINDICATED') {
      return 'NOT_RECOMMENDED';
    }

    if (
      riskLevel === 'CRITICAL' ||
      indicators.asaClassification >= 3 ||
      indicators.hasUncontrolledCardiovascular
    ) {
      return 'MEDICAL_CLEARANCE_REQUIRED';
    }

    if (indicators.needsBoneGrafting || indicators.needsSinusLift) {
      if (complexity === 'HIGHLY_COMPLEX') {
        return 'STAGED_APPROACH';
      }
      return 'BONE_AUGMENTATION_FIRST';
    }

    if (eligibility === 'CONDITIONAL' || riskLevel === 'HIGH') {
      return 'PROCEED_WITH_MODIFICATIONS';
    }

    if (complexity === 'HIGHLY_COMPLEX') {
      return 'STAGED_APPROACH';
    }

    return 'PROCEED_STANDARD';
  }

  /**
   * Calculate recommended procedure type
   */
  private static calculateRecommendedProcedure(
    indicators: AllOnXClinicalIndicators
  ): AllOnXProcedureType {
    const boneHeight =
      indicators.targetArch === 2 ? indicators.mandibleBoneHeight : indicators.maxillaBoneHeight;

    // All-on-6 recommended for better bone availability
    if (
      boneHeight >= 12 &&
      indicators.boneWidth >= 7 &&
      indicators.boneDensity <= 2 &&
      indicators.estheticDemands >= 4
    ) {
      return 'ALL_ON_6';
    }

    // All-on-4 is standard for most cases
    if (boneHeight >= 8 && indicators.boneWidth >= 5) {
      return 'ALL_ON_4';
    }

    // Hybrid approach for challenging anatomy
    return 'ALL_ON_X_HYBRID';
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if patient is a candidate for All-on-X
   */
  public isCandidate(): boolean {
    return this.eligibility !== 'CONTRAINDICATED';
  }

  /**
   * Check if patient is an ideal candidate
   */
  public isIdealCandidate(): boolean {
    return this.eligibility === 'IDEAL';
  }

  /**
   * Check if procedure can proceed immediately
   */
  public canProceedImmediately(): boolean {
    return (
      this.treatmentRecommendation === 'PROCEED_STANDARD' ||
      this.treatmentRecommendation === 'PROCEED_WITH_MODIFICATIONS'
    );
  }

  /**
   * Check if medical clearance is required
   */
  public requiresMedicalClearance(): boolean {
    return this.treatmentRecommendation === 'MEDICAL_CLEARANCE_REQUIRED';
  }

  /**
   * Check if bone augmentation is needed
   */
  public requiresBoneAugmentation(): boolean {
    return (
      this.treatmentRecommendation === 'BONE_AUGMENTATION_FIRST' ||
      this.indicators.needsBoneGrafting ||
      this.indicators.needsSinusLift
    );
  }

  /**
   * Check if immediate loading is feasible
   */
  public isImmediateLoadingFeasible(): boolean {
    return this.indicators.immediateLoadingFeasibility >= 3;
  }

  /**
   * Check if case requires specialist consultation
   */
  public requiresSpecialistConsultation(): boolean {
    return (
      this.complexity === 'HIGHLY_COMPLEX' ||
      this.riskLevel === 'CRITICAL' ||
      this.indicators.hasRadiationHistory
    );
  }

  /**
   * Check if patient has significant smoking risk
   */
  public hasSmokingRisk(): boolean {
    return this.indicators.smokingStatus >= 2;
  }

  /**
   * Check if patient has diabetes risk
   */
  public hasDiabetesRisk(): boolean {
    return this.indicators.hba1c !== undefined && this.indicators.hba1c > 7;
  }

  /**
   * Check if patient has bisphosphonate risk (MRONJ)
   */
  public hasMRONJRisk(): boolean {
    return this.indicators.onBisphosphonates;
  }

  /**
   * Get follow-up urgency
   */
  public getFollowUpUrgency(): FollowUpUrgency {
    if (this.riskLevel === 'CRITICAL') return 'immediate';
    if (this.eligibility === 'IDEAL' && this.complexity === 'STANDARD') return 'soon';
    if (this.requiresMedicalClearance()) return 'urgent';
    return 'routine';
  }

  /**
   * Get SLA response time in hours
   */
  public getClinicalReviewSLAHours(): number {
    return CLINICAL_SLA_HOURS[this.getFollowUpUrgency()];
  }

  /**
   * Get task priority
   */
  public getTaskPriority(): ClinicalTaskPriority {
    if (this.riskLevel === 'CRITICAL') return 'critical';
    if (this.eligibility === 'IDEAL') return 'high';
    if (this.riskLevel === 'HIGH') return 'medium';
    return 'low';
  }

  /**
   * Get estimated treatment duration in months
   */
  public getEstimatedTreatmentDuration(): number {
    let duration = 4; // Base duration

    if (this.treatmentRecommendation === 'STAGED_APPROACH') duration += 6;
    if (this.requiresBoneAugmentation()) duration += 4;
    if (this.indicators.targetArch === 3) duration += 2;
    if (!this.isImmediateLoadingFeasible()) duration += 3;

    return duration;
  }

  /**
   * Get clinical summary
   */
  public getClinicalSummary(): string {
    const parts: string[] = [];

    parts.push(`${this.eligibility} candidate (Score: ${this.compositeScore})`);
    parts.push(`Risk: ${this.riskLevel}`);
    parts.push(`Complexity: ${this.complexity}`);
    parts.push(`Recommended: ${this.recommendedProcedure.replace(/_/g, ' ')}`);

    if (this.requiresBoneAugmentation()) {
      parts.push('Bone augmentation needed');
    }

    return parts.join(' | ');
  }

  /**
   * Get risk factors summary
   */
  public getRiskFactors(): string[] {
    const factors: string[] = [];

    if (this.hasSmokingRisk()) {
      factors.push(`Smoking (status: ${this.indicators.smokingStatus})`);
    }
    if (this.hasDiabetesRisk()) {
      factors.push(`Diabetes (HbA1c: ${this.indicators.hba1c}%)`);
    }
    if (this.hasMRONJRisk()) {
      factors.push(
        `Bisphosphonate therapy (${this.indicators.bisphosphonateYears ?? 'unknown'} years)`
      );
    }
    if (this.indicators.hasOsteoporosis) {
      factors.push('Osteoporosis');
    }
    if (this.indicators.periodontalDisease >= 2) {
      factors.push(`Periodontal disease (severity: ${this.indicators.periodontalDisease})`);
    }
    if (this.indicators.hasBruxism) {
      factors.push('Bruxism/clenching');
    }
    if (this.indicators.boneDensity >= 4) {
      factors.push('Poor bone density (D4)');
    }
    if (this.indicators.oralHygieneScore <= 1) {
      factors.push('Poor oral hygiene');
    }

    return factors;
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Create updated score with new indicators
   */
  public withUpdatedIndicators(
    partialIndicators: Partial<AllOnXClinicalIndicators>
  ): AllOnXClinicalScore {
    const newIndicators = { ...this.indicators, ...partialIndicators };
    return AllOnXClinicalScore.fromIndicators(newIndicators, this.confidence);
  }

  /**
   * Update confidence level
   */
  public withConfidence(newConfidence: number): AllOnXClinicalScore {
    if (newConfidence < 0 || newConfidence > 1 || Number.isNaN(newConfidence)) {
      throw new InvalidAllOnXScoreError(
        `Confidence must be between 0 and 1, got: ${newConfidence}`,
        { field: 'confidence', value: newConfidence, range: [0, 1] }
      );
    }
    return AllOnXClinicalScore.fromIndicators(this.indicators, newConfidence);
  }

  /**
   * Create a copy with modifications
   */
  public copy(
    modifications: Partial<{
      indicators: Partial<AllOnXClinicalIndicators>;
      confidence: number;
    }> = {}
  ): AllOnXClinicalScore {
    const newIndicators = modifications.indicators
      ? { ...this.indicators, ...modifications.indicators }
      : this.indicators;

    const newConfidence = modifications.confidence ?? this.confidence;

    return AllOnXClinicalScore.fromIndicators(newIndicators, newConfidence);
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: AllOnXClinicalScore | null | undefined): boolean {
    if (!other) return false;
    if (this === other) return true;

    return (
      this.compositeScore === other.compositeScore &&
      this.eligibility === other.eligibility &&
      this.riskLevel === other.riskLevel &&
      this.indicators.boneDensity === other.indicators.boneDensity &&
      this.indicators.smokingStatus === other.indicators.smokingStatus
    );
  }

  /**
   * Generate hash for value identity
   */
  public hash(): string {
    const parts = [
      this.compositeScore.toFixed(1),
      this.eligibility,
      this.riskLevel,
      this.indicators.boneDensity.toString(),
      this.indicators.smokingStatus.toString(),
      this.indicators.patientAge.toString(),
    ];
    return parts.join('|');
  }

  /**
   * Compare scores
   */
  public compareTo(other: AllOnXClinicalScore): number {
    return this.compositeScore - other.compositeScore;
  }

  /**
   * Check if this score is better than another
   */
  public isBetterThan(other: AllOnXClinicalScore): boolean {
    return this.compositeScore > other.compositeScore;
  }

  /**
   * Check if this score is worse than another
   */
  public isWorseThan(other: AllOnXClinicalScore): boolean {
    return this.compositeScore < other.compositeScore;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object
   */
  public toJSON(): AllOnXClinicalScoreDTO {
    return {
      compositeScore: this.compositeScore,
      eligibility: this.eligibility,
      riskLevel: this.riskLevel,
      complexity: this.complexity,
      treatmentRecommendation: this.treatmentRecommendation,
      recommendedProcedure: this.recommendedProcedure,
      indicators: { ...this.indicators },
      confidence: this.confidence,
      scoredAt: this.scoredAt.toISOString(),
      algorithmVersion: this.algorithmVersion,
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
    return `AllOnXClinicalScore(Eligibility: ${this.eligibility}, Score: ${this.compositeScore}, Risk: ${this.riskLevel}, Procedure: ${this.recommendedProcedure})`;
  }

  /**
   * Compact string representation
   */
  public toCompactString(): string {
    return `ALLONX[${this.eligibility}:${this.compositeScore}]`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid AllOnXClinicalScore
 */
export class InvalidAllOnXScoreError extends Error {
  public readonly code = 'INVALID_ALLONX_SCORE' as const;
  public readonly details: InvalidAllOnXScoreErrorDetails;

  constructor(message: string, details: InvalidAllOnXScoreErrorDetails = {}) {
    super(message);
    this.name = 'InvalidAllOnXScoreError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidAllOnXScoreError.prototype);
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

/**
 * Details for InvalidAllOnXScoreError
 */
export interface InvalidAllOnXScoreErrorDetails {
  field?: string;
  value?: unknown;
  range?: [number, number];
}

/**
 * DTO for AllOnXClinicalScore serialization
 */
export interface AllOnXClinicalScoreDTO {
  compositeScore: number;
  eligibility: AllOnXEligibility;
  riskLevel: AllOnXRiskLevel;
  complexity: AllOnXComplexity;
  treatmentRecommendation: AllOnXTreatmentRecommendation;
  recommendedProcedure: AllOnXProcedureType;
  indicators: AllOnXClinicalIndicators;
  confidence: number;
  scoredAt: string | Date;
  algorithmVersion?: string;
}

/**
 * Parse result type
 */
export type AllOnXClinicalScoreParseResult =
  | { success: true; value: AllOnXClinicalScore }
  | { success: false; error: string };

/**
 * Type guard to check if a value is an AllOnXClinicalScore
 */
export function isAllOnXClinicalScore(value: unknown): value is AllOnXClinicalScore {
  return value instanceof AllOnXClinicalScore;
}

/**
 * Type guard for successful parse result
 */
export function isSuccessfulParse(
  result: AllOnXClinicalScoreParseResult
): result is { success: true; value: AllOnXClinicalScore } {
  return result.success;
}
