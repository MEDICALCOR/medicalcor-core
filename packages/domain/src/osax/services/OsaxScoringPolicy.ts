/**
 * @fileoverview OsaxScoringPolicy Domain Service
 *
 * Pure domain service for OSAX clinical scoring logic.
 * Contains business rules for sleep apnea severity assessment.
 *
 * @module domain/osax/services/osax-scoring-policy
 *
 * DESIGN PRINCIPLES:
 * 1. PURE FUNCTIONS - No side effects, no I/O
 * 2. DOMAIN LOGIC ONLY - No infrastructure concerns
 * 3. CLINICAL GUIDELINES BASED - AASM standards compliance
 * 4. TESTABILITY - All functions are independently testable
 *
 * CLINICAL REFERENCES:
 * - AASM Clinical Guidelines for Sleep Apnea Diagnosis
 * - ICSD-3 Diagnostic Criteria
 * - Medicare CPAP Coverage Guidelines
 */

import {
  OsaxClinicalScore,
  type OsaxClinicalIndicators,
  type OsaxSeverity,
  type OsaxTreatmentRecommendation,
  type OsaxCardiovascularRisk,
} from '../value-objects/OsaxClinicalScore.js';

// ============================================================================
// SCORING POLICY TYPES
// ============================================================================

/**
 * Risk factor weights for scoring
 */
export interface OsaxRiskFactorWeights {
  readonly ahiWeight: number;
  readonly odiWeight: number;
  readonly spo2NadirWeight: number;
  readonly essWeight: number;
  readonly bmiWeight: number;
  readonly ageWeight: number;
}

/**
 * Scoring configuration
 */
export interface OsaxScoringConfig {
  /** Weights for composite score calculation */
  readonly weights: OsaxRiskFactorWeights;

  /** AHI thresholds for severity classification */
  readonly ahiThresholds: {
    readonly mild: number;
    readonly moderate: number;
    readonly severe: number;
  };

  /** SpO2 thresholds for hypoxemia severity */
  readonly spo2Thresholds: {
    readonly mildDesaturation: number;
    readonly moderateDesaturation: number;
    readonly severeDesaturation: number;
  };

  /** ESS thresholds for sleepiness severity */
  readonly essThresholds: {
    readonly normal: number;
    readonly mild: number;
    readonly moderate: number;
    readonly severe: number;
  };

  /** BMI threshold for obesity consideration */
  readonly bmiObesityThreshold: number;

  /** Age thresholds for risk stratification */
  readonly ageThresholds: {
    readonly pediatric: number;
    readonly geriatric: number;
  };
}

/**
 * Scoring result with detailed breakdown
 */
export interface OsaxScoringResult {
  /** Overall clinical score */
  readonly clinicalScore: OsaxClinicalScore;

  /** Component scores for transparency */
  readonly componentScores: {
    readonly ahiComponent: number;
    readonly odiComponent: number;
    readonly spo2Component: number;
    readonly essComponent: number;
    readonly bmiComponent: number;
  };

  /** Risk flags identified */
  readonly riskFlags: readonly OsaxRiskFlag[];

  /** Clinical notes generated */
  readonly clinicalNotes: readonly string[];

  /** Confidence level */
  readonly confidence: number;

  /** Scoring method used */
  readonly scoringMethod: 'STANDARD' | 'PEDIATRIC' | 'GERIATRIC' | 'SIMPLIFIED';
}

/**
 * Risk flags for clinical attention
 */
export type OsaxRiskFlag =
  | 'SEVERE_DESATURATION'
  | 'HIGH_AHI'
  | 'EXCESSIVE_SLEEPINESS'
  | 'OBESITY'
  | 'REM_PREDOMINANT'
  | 'SUPINE_DEPENDENT'
  | 'CARDIOVASCULAR_RISK'
  | 'NEEDS_SPLIT_NIGHT'
  | 'NEEDS_TITRATION'
  | 'PEDIATRIC_CASE'
  | 'GERIATRIC_CASE';

/**
 * Treatment eligibility result
 */
export interface TreatmentEligibilityResult {
  /** Is eligible for treatment */
  readonly isEligible: boolean;

  /** Eligible treatment types */
  readonly eligibleTreatments: readonly OsaxTreatmentRecommendation[];

  /** Primary recommendation */
  readonly primaryRecommendation: OsaxTreatmentRecommendation;

  /** Insurance coverage criteria met */
  readonly insuranceCriteriaMet: {
    readonly medicareEligible: boolean;
    readonly ahiCriteriaMet: boolean;
    readonly symptomCriteriaMet: boolean;
  };

  /** Reasons for recommendation */
  readonly reasons: readonly string[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default scoring configuration based on AASM guidelines
 */
export const DEFAULT_SCORING_CONFIG: OsaxScoringConfig = {
  weights: {
    ahiWeight: 0.4,
    odiWeight: 0.2,
    spo2NadirWeight: 0.25,
    essWeight: 0.1,
    bmiWeight: 0.05,
    ageWeight: 0.0,
  },
  ahiThresholds: {
    mild: 5,
    moderate: 15,
    severe: 30,
  },
  spo2Thresholds: {
    mildDesaturation: 90,
    moderateDesaturation: 85,
    severeDesaturation: 80,
  },
  essThresholds: {
    normal: 10,
    mild: 12,
    moderate: 16,
    severe: 20,
  },
  bmiObesityThreshold: 30,
  ageThresholds: {
    pediatric: 18,
    geriatric: 65,
  },
};

// ============================================================================
// CORE SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate full clinical score with detailed breakdown
 *
 * @param indicators - Clinical measurement data
 * @param config - Scoring configuration (defaults to AASM standards)
 * @param patientAge - Patient age for risk stratification (optional)
 * @returns Detailed scoring result
 */
export function calculateScore(
  indicators: OsaxClinicalIndicators,
  config: OsaxScoringConfig = DEFAULT_SCORING_CONFIG,
  patientAge?: number
): OsaxScoringResult {
  // Determine scoring method
  const scoringMethod = determineScoringMethod(indicators, patientAge, config);

  // Calculate component scores
  const componentScores = calculateComponentScores(indicators, config);

  // Note: Composite score is calculated within componentScores.total
  // calculateCompositeScore is available if needed for custom weighting

  // Identify risk flags
  const riskFlags = identifyRiskFlags(indicators, patientAge, config);

  // Generate clinical notes
  const clinicalNotes = generateClinicalNotes(indicators, riskFlags);

  // Calculate confidence based on data quality
  const confidence = calculateConfidence(indicators);

  // Create the clinical score value object
  const clinicalScore = OsaxClinicalScore.fromIndicators(indicators, confidence);

  return {
    clinicalScore,
    componentScores,
    riskFlags,
    clinicalNotes,
    confidence,
    scoringMethod,
  };
}

/**
 * Determine which scoring method to apply
 */
function determineScoringMethod(
  indicators: OsaxClinicalIndicators,
  patientAge: number | undefined,
  config: OsaxScoringConfig
): OsaxScoringResult['scoringMethod'] {
  // Pediatric scoring for patients under 18
  if (patientAge !== undefined && patientAge < config.ageThresholds.pediatric) {
    return 'PEDIATRIC';
  }

  // Geriatric considerations for patients over 65
  if (patientAge !== undefined && patientAge >= config.ageThresholds.geriatric) {
    return 'GERIATRIC';
  }

  // Simplified scoring if key indicators are missing
  if (indicators.totalSleepTime === undefined || indicators.sleepEfficiency < 70) {
    return 'SIMPLIFIED';
  }

  return 'STANDARD';
}

/**
 * Calculate individual component scores
 */
function calculateComponentScores(
  indicators: OsaxClinicalIndicators,
  config: OsaxScoringConfig
): OsaxScoringResult['componentScores'] {
  // AHI component (0-100, normalized at 60 events/hr)
  const ahiComponent = Math.min(indicators.ahi / 60, 1) * 100;

  // ODI component (0-100, normalized at 60 events/hr)
  const odiComponent = Math.min(indicators.odi / 60, 1) * 100;

  // SpO2 component (inverted: lower SpO2 = higher score)
  // 100% SpO2 = 0, 60% SpO2 = 100
  const spo2Component = Math.max(0, (100 - indicators.spo2Nadir) / 40) * 100;

  // ESS component (0-24 scale to 0-100)
  const essComponent = (indicators.essScore / 24) * 100;

  // BMI component (0 below threshold, scaled above)
  const bmiComponent =
    indicators.bmi !== undefined
      ? Math.min(Math.max(0, indicators.bmi - config.bmiObesityThreshold) / 20, 1) * 100
      : 0;

  return {
    ahiComponent: Math.round(ahiComponent * 10) / 10,
    odiComponent: Math.round(odiComponent * 10) / 10,
    spo2Component: Math.round(spo2Component * 10) / 10,
    essComponent: Math.round(essComponent * 10) / 10,
    bmiComponent: Math.round(bmiComponent * 10) / 10,
  };
}

/**
 * Calculate weighted composite score
 *
 * Utility function for custom weighting scenarios.
 * The standard scoring uses OsaxClinicalScore.fromIndicators() which
 * calculates the composite score internally.
 */
export function calculateCompositeScore(
  components: OsaxScoringResult['componentScores'],
  weights: OsaxRiskFactorWeights
): number {
  const weighted =
    components.ahiComponent * weights.ahiWeight +
    components.odiComponent * weights.odiWeight +
    components.spo2Component * weights.spo2NadirWeight +
    components.essComponent * weights.essWeight +
    components.bmiComponent * weights.bmiWeight;

  return Math.round(weighted * 10) / 10;
}

/**
 * Identify clinical risk flags
 */
function identifyRiskFlags(
  indicators: OsaxClinicalIndicators,
  patientAge: number | undefined,
  config: OsaxScoringConfig
): readonly OsaxRiskFlag[] {
  const flags: OsaxRiskFlag[] = [];

  // AHI-based flags
  if (indicators.ahi >= config.ahiThresholds.severe) {
    flags.push('HIGH_AHI');
  }

  // Desaturation flags
  if (indicators.spo2Nadir < config.spo2Thresholds.severeDesaturation) {
    flags.push('SEVERE_DESATURATION');
  }

  // ESS-based flags
  if (indicators.essScore >= config.essThresholds.moderate) {
    flags.push('EXCESSIVE_SLEEPINESS');
  }

  // Obesity flag
  if (indicators.bmi !== undefined && indicators.bmi >= config.bmiObesityThreshold) {
    flags.push('OBESITY');
  }

  // REM-predominant flag
  if (
    indicators.remAhi !== undefined &&
    indicators.ahi > 0 &&
    indicators.remAhi / indicators.ahi > 2
  ) {
    flags.push('REM_PREDOMINANT');
  }

  // Supine-dependent flag
  if (
    indicators.supineAhi !== undefined &&
    indicators.ahi > 0 &&
    indicators.supineAhi / indicators.ahi > 2
  ) {
    flags.push('SUPINE_DEPENDENT');
  }

  // Cardiovascular risk
  if (indicators.ahi >= 15 && indicators.spo2Nadir < 85) {
    flags.push('CARDIOVASCULAR_RISK');
  }

  // Split-night consideration
  if (indicators.ahi >= 40) {
    flags.push('NEEDS_SPLIT_NIGHT');
  }

  // Titration needed
  if (indicators.ahi >= 15) {
    flags.push('NEEDS_TITRATION');
  }

  // Age-related flags
  if (patientAge !== undefined) {
    if (patientAge < config.ageThresholds.pediatric) {
      flags.push('PEDIATRIC_CASE');
    }
    if (patientAge >= config.ageThresholds.geriatric) {
      flags.push('GERIATRIC_CASE');
    }
  }

  return Object.freeze(flags);
}

/**
 * Generate clinical notes based on findings
 */
function generateClinicalNotes(
  indicators: OsaxClinicalIndicators,
  riskFlags: readonly OsaxRiskFlag[]
): readonly string[] {
  const notes: string[] = [];

  // Severity note
  if (indicators.ahi >= 30) {
    notes.push('Severe obstructive sleep apnea. Immediate treatment initiation recommended.');
  } else if (indicators.ahi >= 15) {
    notes.push('Moderate obstructive sleep apnea. Treatment recommended.');
  } else if (indicators.ahi >= 5) {
    notes.push('Mild obstructive sleep apnea. Consider treatment based on symptoms.');
  } else {
    notes.push('AHI within normal limits. OSA diagnosis not met.');
  }

  // Hypoxemia note
  if (riskFlags.includes('SEVERE_DESATURATION')) {
    notes.push(
      `Significant nocturnal hypoxemia noted (nadir SpO2: ${indicators.spo2Nadir}%). Consider cardiac evaluation.`
    );
  }

  // Sleepiness note
  if (riskFlags.includes('EXCESSIVE_SLEEPINESS')) {
    notes.push(
      `Excessive daytime sleepiness (ESS: ${indicators.essScore}/24). Advise caution with driving/operating machinery.`
    );
  }

  // Positional dependency
  if (riskFlags.includes('SUPINE_DEPENDENT')) {
    notes.push('Supine-dependent OSA. Positional therapy may be beneficial.');
  }

  // REM-related
  if (riskFlags.includes('REM_PREDOMINANT')) {
    notes.push('REM-predominant OSA noted. Consider impact on memory consolidation and mood.');
  }

  // Cardiovascular
  if (riskFlags.includes('CARDIOVASCULAR_RISK')) {
    notes.push(
      'Elevated cardiovascular risk due to OSA severity and hypoxemia. Priority treatment recommended.'
    );
  }

  return Object.freeze(notes);
}

/**
 * Calculate confidence score based on data completeness
 */
function calculateConfidence(indicators: OsaxClinicalIndicators): number {
  let confidence = 0.7; // Base confidence

  // Full study data increases confidence
  if (indicators.totalSleepTime !== undefined && indicators.totalSleepTime >= 240) {
    confidence += 0.1;
  }

  // Good sleep efficiency suggests reliable data
  if (indicators.sleepEfficiency >= 85) {
    confidence += 0.05;
  }

  // Additional metrics increase confidence
  if (indicators.remAhi !== undefined) {
    confidence += 0.05;
  }

  if (indicators.supineAhi !== undefined) {
    confidence += 0.05;
  }

  // BMI available helps risk assessment
  if (indicators.bmi !== undefined) {
    confidence += 0.05;
  }

  return Math.min(confidence, 0.99);
}

// ============================================================================
// TREATMENT ELIGIBILITY
// ============================================================================

/**
 * Determine treatment eligibility based on clinical score
 *
 * @param score - Clinical score
 * @param indicators - Original indicators
 * @param hasSymptoms - Whether patient reports OSA symptoms
 * @returns Treatment eligibility result
 */
export function determineTreatmentEligibility(
  score: OsaxClinicalScore,
  indicators: OsaxClinicalIndicators,
  hasSymptoms = true
): TreatmentEligibilityResult {
  const eligibleTreatments: OsaxTreatmentRecommendation[] = [];
  const reasons: string[] = [];

  // Medicare CPAP eligibility: AHI ≥ 15, or AHI ≥ 5 with symptoms
  const ahiCriteriaMet = indicators.ahi >= 15 || (indicators.ahi >= 5 && hasSymptoms);
  const symptomCriteriaMet = hasSymptoms || indicators.essScore >= 10;
  const medicareEligible = ahiCriteriaMet && symptomCriteriaMet;

  // Determine eligible treatments based on severity
  if (score.severity === 'SEVERE') {
    eligibleTreatments.push('CPAP_THERAPY');
    eligibleTreatments.push('BIPAP_THERAPY');
    if (indicators.spo2Nadir < 75) {
      eligibleTreatments.push('SURGERY_EVALUATION');
    }
    reasons.push('Severe OSA requires positive airway pressure therapy');
  } else if (score.severity === 'MODERATE') {
    eligibleTreatments.push('CPAP_THERAPY');
    eligibleTreatments.push('ORAL_APPLIANCE');
    if (indicators.supineAhi !== undefined && indicators.supineAhi / indicators.ahi > 2) {
      eligibleTreatments.push('POSITIONAL_THERAPY');
    }
    reasons.push('Moderate OSA - multiple treatment options available');
  } else if (score.severity === 'MILD') {
    eligibleTreatments.push('ORAL_APPLIANCE');
    eligibleTreatments.push('POSITIONAL_THERAPY');
    eligibleTreatments.push('LIFESTYLE_MODIFICATION');
    reasons.push('Mild OSA - conservative treatment options may be sufficient');
  } else {
    eligibleTreatments.push('LIFESTYLE_MODIFICATION');
    reasons.push('No OSA diagnosis - lifestyle recommendations only');
  }

  // Determine primary recommendation
  const primaryRecommendation = eligibleTreatments[0] ?? 'LIFESTYLE_MODIFICATION';

  return {
    isEligible: score.hasOSA(),
    eligibleTreatments: Object.freeze(eligibleTreatments),
    primaryRecommendation,
    insuranceCriteriaMet: {
      medicareEligible,
      ahiCriteriaMet,
      symptomCriteriaMet,
    },
    reasons: Object.freeze(reasons),
  };
}

// ============================================================================
// SEVERITY CLASSIFICATION HELPERS
// ============================================================================

/**
 * Classify severity from AHI using AASM guidelines
 */
export function classifySeverityFromAHI(
  ahi: number,
  config: OsaxScoringConfig = DEFAULT_SCORING_CONFIG
): OsaxSeverity {
  if (ahi >= config.ahiThresholds.severe) return 'SEVERE';
  if (ahi >= config.ahiThresholds.moderate) return 'MODERATE';
  if (ahi >= config.ahiThresholds.mild) return 'MILD';
  return 'NONE';
}

/**
 * Calculate cardiovascular risk from indicators
 */
export function calculateCardiovascularRisk(
  indicators: OsaxClinicalIndicators
): OsaxCardiovascularRisk {
  // Critical risk factors
  if (indicators.ahi >= 30 && indicators.spo2Nadir < 75) {
    return 'CRITICAL';
  }

  // High risk
  if (indicators.ahi >= 15 || indicators.spo2Nadir < 80) {
    return 'HIGH';
  }

  // Moderate risk
  if (indicators.ahi >= 5 || indicators.odi >= 10 || indicators.spo2Nadir < 88) {
    return 'MODERATE';
  }

  return 'LOW';
}

// ============================================================================
// SCORING COMPARISON
// ============================================================================

/**
 * Compare two scores and determine improvement/worsening
 */
export function compareScores(
  baseline: OsaxClinicalScore,
  followUp: OsaxClinicalScore
): {
  ahiChange: number;
  ahiChangePercent: number;
  severityChange: 'IMPROVED' | 'UNCHANGED' | 'WORSENED';
  significantImprovement: boolean;
  clinicalResponse: 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'NONE' | 'WORSENED';
} {
  const ahiChange = followUp.indicators.ahi - baseline.indicators.ahi;
  const ahiChangePercent =
    baseline.indicators.ahi > 0
      ? (ahiChange / baseline.indicators.ahi) * 100
      : followUp.indicators.ahi > 0
        ? 100
        : 0;

  // Severity change
  const severityOrder: Record<OsaxSeverity, number> = {
    NONE: 0,
    MILD: 1,
    MODERATE: 2,
    SEVERE: 3,
  };

  const baselineSeverityValue = severityOrder[baseline.severity];
  const followUpSeverityValue = severityOrder[followUp.severity];

  let severityChange: 'IMPROVED' | 'UNCHANGED' | 'WORSENED';
  if (followUpSeverityValue < baselineSeverityValue) {
    severityChange = 'IMPROVED';
  } else if (followUpSeverityValue > baselineSeverityValue) {
    severityChange = 'WORSENED';
  } else {
    severityChange = 'UNCHANGED';
  }

  // Significant improvement: >50% reduction or drop to AHI < 5
  const significantImprovement =
    ahiChangePercent <= -50 || (baseline.indicators.ahi >= 5 && followUp.indicators.ahi < 5);

  // Clinical response classification
  let clinicalResponse: 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'NONE' | 'WORSENED';
  if (ahiChange > 0) {
    clinicalResponse = 'WORSENED';
  } else if (followUp.indicators.ahi < 5) {
    clinicalResponse = 'EXCELLENT';
  } else if (ahiChangePercent <= -50) {
    clinicalResponse = 'GOOD';
  } else if (ahiChangePercent <= -25) {
    clinicalResponse = 'PARTIAL';
  } else {
    clinicalResponse = 'NONE';
  }

  return {
    ahiChange: Math.round(ahiChange * 10) / 10,
    ahiChangePercent: Math.round(ahiChangePercent * 10) / 10,
    severityChange,
    significantImprovement,
    clinicalResponse,
  };
}

// ============================================================================
// PEDIATRIC SCORING ADJUSTMENTS
// ============================================================================

/**
 * Pediatric scoring configuration (different AHI thresholds)
 */
export const PEDIATRIC_SCORING_CONFIG: OsaxScoringConfig = {
  ...DEFAULT_SCORING_CONFIG,
  ahiThresholds: {
    mild: 1, // Pediatric mild starts at AHI ≥ 1
    moderate: 5,
    severe: 10,
  },
  essThresholds: {
    normal: 8, // Lower threshold for children
    mild: 10,
    moderate: 13,
    severe: 16,
  },
};

/**
 * Calculate pediatric score with adjusted thresholds
 */
export function calculatePediatricScore(
  indicators: OsaxClinicalIndicators,
  patientAge: number
): OsaxScoringResult {
  if (patientAge >= 18) {
    throw new Error('Pediatric scoring is only for patients under 18');
  }

  return calculateScore(indicators, PEDIATRIC_SCORING_CONFIG, patientAge);
}
