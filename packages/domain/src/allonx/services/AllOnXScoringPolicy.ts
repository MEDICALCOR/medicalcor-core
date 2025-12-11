/**
 * @fileoverview AllOnXScoringPolicy Domain Service
 *
 * Pure domain service for ONE STEP ALL ON X clinical scoring logic.
 * Contains business rules for dental implant eligibility assessment.
 *
 * @module domain/allonx/services/allonx-scoring-policy
 *
 * DESIGN PRINCIPLES:
 * 1. PURE FUNCTIONS - No side effects, no I/O
 * 2. DOMAIN LOGIC ONLY - No infrastructure concerns
 * 3. CLINICAL GUIDELINES BASED - ITI/EAO standards compliance
 * 4. TESTABILITY - All functions are independently testable
 *
 * CLINICAL REFERENCES:
 * - ITI Treatment Guide for Implant Dentistry
 * - European Association for Osseointegration (EAO) Guidelines
 * - American Academy of Implant Dentistry (AAID) Standards
 * - AAOMS Position Paper on Medication-Related Osteonecrosis of the Jaw
 */

import {
  AllOnXClinicalScore,
  type AllOnXClinicalIndicators,
  type AllOnXEligibility,
  type AllOnXRiskLevel,
  type AllOnXProcedureType,
} from '../value-objects/AllOnXClinicalScore.js';

// ============================================================================
// SCORING POLICY TYPES
// ============================================================================

/**
 * Risk factor weights for scoring
 */
export interface AllOnXRiskFactorWeights {
  readonly boneQualityWeight: number;
  readonly medicalRiskWeight: number;
  readonly oralHealthWeight: number;
  readonly proceduralComplexityWeight: number;
  readonly patientFactorsWeight: number;
}

/**
 * Scoring configuration
 */
export interface AllOnXScoringConfig {
  /** Weights for composite score calculation */
  readonly weights: AllOnXRiskFactorWeights;

  /** Bone height thresholds (mm) */
  readonly boneHeightThresholds: {
    readonly minimum: number;
    readonly adequate: number;
    readonly ideal: number;
  };

  /** Bone width thresholds (mm) */
  readonly boneWidthThresholds: {
    readonly minimum: number;
    readonly adequate: number;
    readonly ideal: number;
  };

  /** HbA1c thresholds for diabetes assessment */
  readonly hba1cThresholds: {
    readonly controlled: number;
    readonly moderatelyControlled: number;
    readonly poorlyControlled: number;
  };

  /** Bisphosphonate risk thresholds (years) */
  readonly bisphosphonateThresholds: {
    readonly lowRisk: number;
    readonly moderateRisk: number;
    readonly highRisk: number;
  };

  /** Age thresholds for risk stratification */
  readonly ageThresholds: {
    readonly youngAdult: number;
    readonly middleAge: number;
    readonly elderly: number;
    readonly veryElderly: number;
  };
}

/**
 * Scoring result with detailed breakdown
 */
export interface AllOnXScoringResult {
  /** Overall clinical score */
  readonly clinicalScore: AllOnXClinicalScore;

  /** Component scores for transparency */
  readonly componentScores: {
    readonly boneQualityComponent: number;
    readonly medicalRiskComponent: number;
    readonly oralHealthComponent: number;
    readonly proceduralComplexityComponent: number;
    readonly patientFactorsComponent: number;
  };

  /** Risk flags identified */
  readonly riskFlags: readonly AllOnXRiskFlag[];

  /** Clinical notes generated */
  readonly clinicalNotes: readonly string[];

  /** Contraindications if any */
  readonly contraindications: readonly string[];

  /** Special considerations */
  readonly specialConsiderations: readonly string[];

  /** Confidence level */
  readonly confidence: number;

  /** Scoring method used */
  readonly scoringMethod: 'STANDARD' | 'GERIATRIC' | 'HIGH_RISK' | 'SIMPLIFIED';
}

/**
 * Risk flags for clinical attention
 */
export type AllOnXRiskFlag =
  | 'HEAVY_SMOKER'
  | 'ACTIVE_SMOKER'
  | 'UNCONTROLLED_DIABETES'
  | 'BISPHOSPHONATE_THERAPY'
  | 'LONG_TERM_BISPHOSPHONATES'
  | 'OSTEOPOROSIS'
  | 'RADIATION_HISTORY'
  | 'IMMUNOCOMPROMISED'
  | 'CARDIOVASCULAR_RISK'
  | 'ANTICOAGULANT_THERAPY'
  | 'POOR_BONE_QUALITY'
  | 'INSUFFICIENT_BONE'
  | 'ACTIVE_PERIODONTAL_DISEASE'
  | 'POOR_ORAL_HYGIENE'
  | 'BRUXISM'
  | 'PREVIOUS_IMPLANT_FAILURE'
  | 'GERIATRIC_PATIENT'
  | 'HIGH_ASA_CLASS'
  | 'LOW_COMPLIANCE'
  | 'BONE_AUGMENTATION_REQUIRED'
  | 'SINUS_LIFT_REQUIRED'
  | 'DUAL_ARCH_COMPLEXITY'
  | 'HIGH_ESTHETIC_DEMANDS';

/**
 * Treatment planning result
 */
export interface TreatmentPlanningResult {
  /** Is procedure feasible */
  readonly isFeasible: boolean;

  /** Recommended procedure type */
  readonly recommendedProcedure: AllOnXProcedureType;

  /** Treatment phases */
  readonly phases: readonly TreatmentPhase[];

  /** Pre-treatment requirements */
  readonly preTreatmentRequirements: readonly string[];

  /** Estimated total duration (months) */
  readonly estimatedDuration: number;

  /** Success probability estimate (0-1) */
  readonly successProbability: number;

  /** Key risks to discuss with patient */
  readonly keyRisks: readonly string[];

  /** Reasons for recommendation */
  readonly reasons: readonly string[];
}

/**
 * Treatment phase definition
 */
export interface TreatmentPhase {
  readonly phase: number;
  readonly name: string;
  readonly description: string;
  readonly estimatedDuration: string;
  readonly procedures: readonly string[];
  readonly prerequisites: readonly string[];
}

/**
 * Implant site assessment
 */
export interface ImplantSiteAssessment {
  readonly site:
    | 'anterior_maxilla'
    | 'posterior_maxilla'
    | 'anterior_mandible'
    | 'posterior_mandible';
  readonly boneQuality: 'excellent' | 'good' | 'fair' | 'poor';
  readonly boneQuantity: 'adequate' | 'marginal' | 'insufficient';
  readonly augmentationNeeded: boolean;
  readonly primaryStabilityLikelihood: 'high' | 'moderate' | 'low';
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default scoring configuration based on clinical guidelines
 */
export const DEFAULT_SCORING_CONFIG: AllOnXScoringConfig = {
  weights: {
    boneQualityWeight: 0.35,
    medicalRiskWeight: 0.3,
    oralHealthWeight: 0.2,
    proceduralComplexityWeight: 0.1,
    patientFactorsWeight: 0.05,
  },
  boneHeightThresholds: {
    minimum: 8,
    adequate: 10,
    ideal: 12,
  },
  boneWidthThresholds: {
    minimum: 5,
    adequate: 6,
    ideal: 8,
  },
  hba1cThresholds: {
    controlled: 7.0,
    moderatelyControlled: 7.5,
    poorlyControlled: 9.0,
  },
  bisphosphonateThresholds: {
    lowRisk: 2,
    moderateRisk: 4,
    highRisk: 6,
  },
  ageThresholds: {
    youngAdult: 35,
    middleAge: 55,
    elderly: 70,
    veryElderly: 80,
  },
};

// ============================================================================
// CORE SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate full clinical score with detailed breakdown
 */
export function calculateScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig = DEFAULT_SCORING_CONFIG
): AllOnXScoringResult {
  // Determine scoring method
  const scoringMethod = determineScoringMethod(indicators, config);

  // Calculate component scores
  const componentScores = calculateComponentScores(indicators, config);

  // Identify risk flags
  const riskFlags = identifyRiskFlags(indicators, config);

  // Generate clinical notes
  const clinicalNotes = generateClinicalNotes(indicators, riskFlags);

  // Identify contraindications
  const contraindications = identifyContraindications(indicators);

  // Identify special considerations
  const specialConsiderations = identifySpecialConsiderations(indicators, riskFlags);

  // Calculate confidence based on data quality
  const confidence = calculateConfidence(indicators);

  // Create the clinical score value object
  const clinicalScore = AllOnXClinicalScore.fromIndicators(indicators, confidence);

  return {
    clinicalScore,
    componentScores,
    riskFlags,
    clinicalNotes,
    contraindications,
    specialConsiderations,
    confidence,
    scoringMethod,
  };
}

/**
 * Determine which scoring method to apply
 */
function determineScoringMethod(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXScoringResult['scoringMethod'] {
  // High-risk scoring for patients with significant medical conditions
  if (
    indicators.asaClassification >= 3 ||
    indicators.hasUncontrolledCardiovascular ||
    indicators.isImmunocompromised ||
    (indicators.hba1c !== undefined && indicators.hba1c > config.hba1cThresholds.poorlyControlled)
  ) {
    return 'HIGH_RISK';
  }

  // Geriatric scoring for elderly patients
  if (indicators.patientAge >= config.ageThresholds.elderly) {
    return 'GERIATRIC';
  }

  // Simplified if key data is missing
  if (indicators.sinusPneumatization === undefined && indicators.targetArch !== 2) {
    return 'SIMPLIFIED';
  }

  return 'STANDARD';
}

/**
 * Calculate individual component scores
 */
function calculateComponentScores(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXScoringResult['componentScores'] {
  // Bone quality component (0-100, higher = better)
  const boneQualityComponent = calculateBoneQualityScore(indicators, config);

  // Medical risk component (0-100, higher = lower risk = better)
  const medicalRiskComponent = calculateMedicalRiskScore(indicators, config);

  // Oral health component (0-100, higher = better)
  const oralHealthComponent = calculateOralHealthScore(indicators);

  // Procedural complexity component (0-100, higher = less complex = better)
  const proceduralComplexityComponent = calculateProceduralComplexityScore(indicators);

  // Patient factors component (0-100, higher = better)
  const patientFactorsComponent = calculatePatientFactorsScore(indicators, config);

  return {
    boneQualityComponent: Math.round(boneQualityComponent * 10) / 10,
    medicalRiskComponent: Math.round(medicalRiskComponent * 10) / 10,
    oralHealthComponent: Math.round(oralHealthComponent * 10) / 10,
    proceduralComplexityComponent: Math.round(proceduralComplexityComponent * 10) / 10,
    patientFactorsComponent: Math.round(patientFactorsComponent * 10) / 10,
  };
}

/**
 * Calculate bone quality score
 */
function calculateBoneQualityScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): number {
  let score = 100;

  // Bone density (D1=best, D4=worst)
  const densityPenalty = (indicators.boneDensity - 1) * 10;
  score -= densityPenalty;

  // Bone height assessment
  const targetBoneHeight =
    indicators.targetArch === 2 ? indicators.mandibleBoneHeight : indicators.maxillaBoneHeight;

  if (targetBoneHeight < config.boneHeightThresholds.minimum) {
    score -= 30;
  } else if (targetBoneHeight < config.boneHeightThresholds.adequate) {
    score -= 15;
  } else if (targetBoneHeight < config.boneHeightThresholds.ideal) {
    score -= 5;
  }

  // Bone width assessment
  if (indicators.boneWidth < config.boneWidthThresholds.minimum) {
    score -= 25;
  } else if (indicators.boneWidth < config.boneWidthThresholds.adequate) {
    score -= 12;
  } else if (indicators.boneWidth < config.boneWidthThresholds.ideal) {
    score -= 4;
  }

  // Sinus pneumatization (for maxilla)
  if (indicators.targetArch !== 2 && indicators.sinusPneumatization !== undefined) {
    score -= (indicators.sinusPneumatization - 1) * 4;
  }

  return Math.max(0, score);
}

/**
 * Calculate medical risk score
 */
function calculateMedicalRiskScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): number {
  let score = 100;

  // Smoking
  score -= indicators.smokingStatus * 8;

  // Former smoker bonus
  if (indicators.smokingStatus === 1 && indicators.yearsSinceQuitSmoking !== undefined) {
    const yearsBonus = Math.min(indicators.yearsSinceQuitSmoking, 5) * 1.5;
    score += yearsBonus;
  }

  // Diabetes
  if (indicators.hba1c !== undefined) {
    if (indicators.hba1c > config.hba1cThresholds.poorlyControlled) {
      score -= 35;
    } else if (indicators.hba1c > config.hba1cThresholds.moderatelyControlled) {
      score -= 20;
    } else if (indicators.hba1c > config.hba1cThresholds.controlled) {
      score -= 10;
    }
  }

  // Bisphosphonates
  if (indicators.onBisphosphonates) {
    const years = indicators.bisphosphonateYears ?? 1;
    if (years >= config.bisphosphonateThresholds.highRisk) {
      score -= 40;
    } else if (years >= config.bisphosphonateThresholds.moderateRisk) {
      score -= 25;
    } else {
      score -= 15;
    }
  }

  // Other conditions
  if (indicators.hasOsteoporosis) score -= 15;
  if (indicators.hasRadiationHistory) score -= 50;
  if (indicators.hasUncontrolledCardiovascular) score -= 40;
  if (indicators.isImmunocompromised) score -= 30;
  if (indicators.onAnticoagulants) score -= 10;

  // ASA classification
  if (indicators.asaClassification === 4) score -= 35;
  else if (indicators.asaClassification === 3) score -= 20;

  return Math.max(0, score);
}

/**
 * Calculate oral health score
 */
function calculateOralHealthScore(indicators: AllOnXClinicalIndicators): number {
  let score = 100;

  // Periodontal disease severity
  score -= indicators.periodontalDisease * 12;

  // Oral hygiene
  score += (indicators.oralHygieneScore - 2) * 8;

  // Bruxism
  if (indicators.hasBruxism) score -= 15;

  // Previous failed implants
  if (indicators.previousFailedImplants !== undefined) {
    score -= Math.min(indicators.previousFailedImplants * 8, 25);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate procedural complexity score
 */
function calculateProceduralComplexityScore(indicators: AllOnXClinicalIndicators): number {
  let score = 100;

  // Bone grafting needed
  if (indicators.needsBoneGrafting) score -= 20;

  // Sinus lift needed
  if (indicators.needsSinusLift) score -= 25;

  // Both arches
  if (indicators.targetArch === 3) score -= 20;

  // Number of extractions
  if (indicators.extractionsNeeded > 15) score -= 15;
  else if (indicators.extractionsNeeded > 10) score -= 8;

  // Immediate loading feasibility
  score += (indicators.immediateLoadingFeasibility - 3) * 6;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate patient factors score
 */
function calculatePatientFactorsScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): number {
  let score = 100;

  // Age factor
  if (indicators.patientAge >= config.ageThresholds.veryElderly) {
    score -= 20;
  } else if (indicators.patientAge >= config.ageThresholds.elderly) {
    score -= 10;
  }

  // Compliance
  score += (indicators.complianceScore - 3) * 8;

  // Esthetic demands (higher demands = more challenging)
  if (indicators.estheticDemands >= 5) score -= 10;

  // Functional demands (higher demands = more critical)
  if (indicators.functionalDemands >= 5) score -= 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate weighted composite score
 */
export function calculateCompositeScore(
  components: AllOnXScoringResult['componentScores'],
  weights: AllOnXRiskFactorWeights
): number {
  const weighted =
    components.boneQualityComponent * weights.boneQualityWeight +
    components.medicalRiskComponent * weights.medicalRiskWeight +
    components.oralHealthComponent * weights.oralHealthWeight +
    components.proceduralComplexityComponent * weights.proceduralComplexityWeight +
    components.patientFactorsComponent * weights.patientFactorsWeight;

  return Math.round(weighted * 10) / 10;
}

// ============================================================================
// RISK FLAG IDENTIFICATION HELPERS
// ============================================================================

/**
 * Identify smoking-related risk flags
 */
function identifySmokingFlags(indicators: AllOnXClinicalIndicators): AllOnXRiskFlag[] {
  if (indicators.smokingStatus >= 4) return ['HEAVY_SMOKER'];
  if (indicators.smokingStatus >= 2) return ['ACTIVE_SMOKER'];
  return [];
}

/**
 * Identify diabetes-related risk flags
 */
function identifyDiabetesFlags(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXRiskFlag[] {
  if (
    indicators.hba1c !== undefined &&
    indicators.hba1c > config.hba1cThresholds.poorlyControlled
  ) {
    return ['UNCONTROLLED_DIABETES'];
  }
  return [];
}

/**
 * Identify bisphosphonate-related risk flags
 */
function identifyBisphosphonateFlags(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXRiskFlag[] {
  if (!indicators.onBisphosphonates) return [];

  const flags: AllOnXRiskFlag[] = ['BISPHOSPHONATE_THERAPY'];
  if (
    indicators.bisphosphonateYears !== undefined &&
    indicators.bisphosphonateYears >= config.bisphosphonateThresholds.highRisk
  ) {
    flags.push('LONG_TERM_BISPHOSPHONATES');
  }
  return flags;
}

/**
 * Identify general medical condition risk flags
 */
function identifyMedicalConditionFlags(indicators: AllOnXClinicalIndicators): AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [];
  if (indicators.hasOsteoporosis) flags.push('OSTEOPOROSIS');
  if (indicators.hasRadiationHistory) flags.push('RADIATION_HISTORY');
  if (indicators.isImmunocompromised) flags.push('IMMUNOCOMPROMISED');
  if (indicators.hasUncontrolledCardiovascular) flags.push('CARDIOVASCULAR_RISK');
  if (indicators.onAnticoagulants) flags.push('ANTICOAGULANT_THERAPY');
  return flags;
}

/**
 * Identify bone quality and structure risk flags
 */
function identifyBoneFlags(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [];

  if (indicators.boneDensity >= 4) flags.push('POOR_BONE_QUALITY');

  const targetBoneHeight =
    indicators.targetArch === 2 ? indicators.mandibleBoneHeight : indicators.maxillaBoneHeight;

  const hasInsufficientBone =
    targetBoneHeight < config.boneHeightThresholds.minimum ||
    indicators.boneWidth < config.boneWidthThresholds.minimum;

  if (hasInsufficientBone) flags.push('INSUFFICIENT_BONE');

  return flags;
}

/**
 * Identify oral health risk flags
 */
function identifyOralHealthFlags(indicators: AllOnXClinicalIndicators): AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [];
  if (indicators.periodontalDisease >= 2) flags.push('ACTIVE_PERIODONTAL_DISEASE');
  if (indicators.oralHygieneScore <= 1) flags.push('POOR_ORAL_HYGIENE');
  if (indicators.hasBruxism) flags.push('BRUXISM');
  if (indicators.previousFailedImplants !== undefined && indicators.previousFailedImplants > 0) {
    flags.push('PREVIOUS_IMPLANT_FAILURE');
  }
  return flags;
}

/**
 * Identify patient-specific risk flags (age, ASA classification, compliance)
 */
function identifyPatientFlags(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [];
  if (indicators.patientAge >= config.ageThresholds.elderly) flags.push('GERIATRIC_PATIENT');
  if (indicators.asaClassification >= 3) flags.push('HIGH_ASA_CLASS');
  if (indicators.complianceScore <= 2) flags.push('LOW_COMPLIANCE');
  return flags;
}

/**
 * Identify procedural complexity risk flags
 */
function identifyProceduralFlags(indicators: AllOnXClinicalIndicators): AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [];
  if (indicators.needsBoneGrafting) flags.push('BONE_AUGMENTATION_REQUIRED');
  if (indicators.needsSinusLift) flags.push('SINUS_LIFT_REQUIRED');
  if (indicators.targetArch === 3) flags.push('DUAL_ARCH_COMPLEXITY');
  if (indicators.estheticDemands >= 5) flags.push('HIGH_ESTHETIC_DEMANDS');
  return flags;
}

/**
 * Identify clinical risk flags
 *
 * Orchestrates category-specific flag identification for a comprehensive
 * clinical risk assessment.
 */
function identifyRiskFlags(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig
): readonly AllOnXRiskFlag[] {
  const flags: AllOnXRiskFlag[] = [
    ...identifySmokingFlags(indicators),
    ...identifyDiabetesFlags(indicators, config),
    ...identifyBisphosphonateFlags(indicators, config),
    ...identifyMedicalConditionFlags(indicators),
    ...identifyBoneFlags(indicators, config),
    ...identifyOralHealthFlags(indicators),
    ...identifyPatientFlags(indicators, config),
    ...identifyProceduralFlags(indicators),
  ];

  return Object.freeze(flags);
}

/**
 * Generate clinical notes
 */
function generateClinicalNotes(
  indicators: AllOnXClinicalIndicators,
  riskFlags: readonly AllOnXRiskFlag[]
): readonly string[] {
  const notes: string[] = [];

  // Bone assessment notes
  if (indicators.boneDensity <= 2) {
    notes.push('Good bone density (D1-D2) supports optimal primary stability.');
  } else if (indicators.boneDensity === 3) {
    notes.push(
      'Moderate bone density (D3). Consider longer healing time or increased implant length.'
    );
  } else {
    notes.push(
      'Poor bone density (D4). High risk for inadequate primary stability. Consider bone condensing techniques.'
    );
  }

  // Smoking notes
  if (riskFlags.includes('HEAVY_SMOKER')) {
    notes.push(
      'Heavy smoker. Strongly recommend smoking cessation minimum 2 weeks pre-op and 8 weeks post-op. Increased failure risk.'
    );
  } else if (riskFlags.includes('ACTIVE_SMOKER')) {
    notes.push('Active smoker. Counsel on smoking cessation for improved outcomes.');
  }

  // Diabetes notes
  if (riskFlags.includes('UNCONTROLLED_DIABETES')) {
    notes.push(
      `Poorly controlled diabetes (HbA1c: ${indicators.hba1c}%). Optimize glycemic control before procedure. Antibiotic prophylaxis recommended.`
    );
  }

  // Bisphosphonate notes
  if (riskFlags.includes('LONG_TERM_BISPHOSPHONATES')) {
    notes.push(
      `Long-term bisphosphonate therapy (${indicators.bisphosphonateYears} years). High MRONJ risk. Consider drug holiday per AAOMS guidelines. Obtain informed consent for MRONJ risk.`
    );
  } else if (riskFlags.includes('BISPHOSPHONATE_THERAPY')) {
    notes.push(
      'Current bisphosphonate therapy. MRONJ risk present. Discuss with prescribing physician.'
    );
  }

  // Procedural notes
  if (riskFlags.includes('SINUS_LIFT_REQUIRED')) {
    notes.push('Sinus lift required for maxillary implant placement. Consider staged approach.');
  }

  if (riskFlags.includes('BONE_AUGMENTATION_REQUIRED')) {
    notes.push('Bone augmentation required. May extend treatment timeline by 4-6 months.');
  }

  // Periodontal notes
  if (riskFlags.includes('ACTIVE_PERIODONTAL_DISEASE')) {
    notes.push(
      'Active periodontal disease present. Complete periodontal treatment before implant placement.'
    );
  }

  // Bruxism notes
  if (riskFlags.includes('BRUXISM')) {
    notes.push(
      'Bruxism/clenching present. Night guard mandatory post-treatment. Consider increased number of implants.'
    );
  }

  // Age-related notes
  if (riskFlags.includes('GERIATRIC_PATIENT')) {
    notes.push('Geriatric patient. Consider systemic health optimization and healing capacity.');
  }

  return Object.freeze(notes);
}

/**
 * Identify contraindications
 */
function identifyContraindications(indicators: AllOnXClinicalIndicators): readonly string[] {
  const contraindications: string[] = [];

  if (indicators.hasRadiationHistory) {
    contraindications.push('History of head/neck radiation - high risk of osteoradionecrosis');
  }

  if (indicators.hasUncontrolledCardiovascular) {
    contraindications.push('Uncontrolled cardiovascular disease - medical clearance required');
  }

  if (indicators.asaClassification >= 4) {
    contraindications.push(
      'ASA IV classification - significant systemic risk for elective surgery'
    );
  }

  if (indicators.hba1c !== undefined && indicators.hba1c > 10) {
    contraindications.push(
      'Severely uncontrolled diabetes (HbA1c > 10%) - optimize before procedure'
    );
  }

  if (
    indicators.onBisphosphonates &&
    indicators.bisphosphonateYears !== undefined &&
    indicators.bisphosphonateYears > 8
  ) {
    contraindications.push('Prolonged IV bisphosphonate therapy - very high MRONJ risk');
  }

  return Object.freeze(contraindications);
}

/**
 * Identify special considerations
 */
function identifySpecialConsiderations(
  indicators: AllOnXClinicalIndicators,
  riskFlags: readonly AllOnXRiskFlag[]
): readonly string[] {
  const considerations: string[] = [];

  if (indicators.targetArch === 3) {
    considerations.push('Dual arch treatment - consider staged approach for optimal outcomes');
  }

  if (indicators.estheticDemands >= 4) {
    considerations.push('High esthetic demands - consider provisional prosthesis design carefully');
  }

  if (indicators.functionalDemands >= 4) {
    considerations.push(
      'High functional demands - ensure adequate implant number and distribution'
    );
  }

  if (riskFlags.includes('ANTICOAGULANT_THERAPY')) {
    considerations.push(
      'Anticoagulant therapy - coordinate with physician for perioperative management'
    );
  }

  if (indicators.complianceScore <= 3) {
    considerations.push('Moderate/low compliance anticipated - simplify maintenance protocol');
  }

  if (indicators.previousFailedImplants !== undefined && indicators.previousFailedImplants > 0) {
    considerations.push('Previous implant failure - investigate cause and address risk factors');
  }

  return Object.freeze(considerations);
}

/**
 * Calculate confidence score
 */
function calculateConfidence(indicators: AllOnXClinicalIndicators): number {
  let confidence = 0.75; // Base confidence

  // CBCT data available (inferred from detailed bone measurements)
  if (
    indicators.maxillaBoneHeight > 0 &&
    indicators.mandibleBoneHeight > 0 &&
    indicators.boneWidth > 0
  ) {
    confidence += 0.1;
  }

  // Complete medical history
  if (indicators.hba1c !== undefined) {
    confidence += 0.05;
  }

  // Complete oral health assessment
  if (indicators.previousFailedImplants !== undefined) {
    confidence += 0.03;
  }

  // Sinus assessment for maxilla
  if (indicators.targetArch !== 2 && indicators.sinusPneumatization !== undefined) {
    confidence += 0.05;
  }

  // Former smoker details
  if (indicators.smokingStatus === 1 && indicators.yearsSinceQuitSmoking !== undefined) {
    confidence += 0.02;
  }

  return Math.min(confidence, 0.99);
}

// ============================================================================
// TREATMENT PLANNING HELPERS
// ============================================================================

/**
 * Context for building treatment phases
 */
interface TreatmentPlanContext {
  phases: TreatmentPhase[];
  preTreatmentRequirements: string[];
  keyRisks: string[];
  reasons: string[];
  estimatedDuration: number;
}

/**
 * Build pre-treatment optimization phase
 */
function buildPreTreatmentPhase(
  indicators: AllOnXClinicalIndicators,
  context: TreatmentPlanContext
): void {
  const procedures: string[] = [];

  if (indicators.periodontalDisease >= 2) {
    context.preTreatmentRequirements.push('Complete periodontal treatment');
    procedures.push('Periodontal scaling and root planing');
    context.estimatedDuration += 2;
  }

  if (indicators.smokingStatus >= 2) {
    context.preTreatmentRequirements.push('Smoking cessation counseling');
    context.keyRisks.push('Smoking significantly increases implant failure risk');
  }

  if (indicators.hba1c !== undefined && indicators.hba1c > 7.5) {
    context.preTreatmentRequirements.push('Optimize glycemic control (target HbA1c < 7.5%)');
    context.keyRisks.push('Uncontrolled diabetes increases infection and healing complications');
  }

  if (indicators.asaClassification >= 3) {
    context.preTreatmentRequirements.push('Medical clearance from physician');
  }

  if (procedures.length > 0 || context.preTreatmentRequirements.length > 0) {
    context.phases.push({
      phase: 1,
      name: 'Pre-Treatment Optimization',
      description: 'Address modifiable risk factors before surgical intervention',
      estimatedDuration: '4-8 weeks',
      procedures,
      prerequisites: [],
    });
  }
}

/**
 * Build bone augmentation phase if needed
 */
function buildBoneAugmentationPhase(
  indicators: AllOnXClinicalIndicators,
  context: TreatmentPlanContext
): void {
  if (!indicators.needsBoneGrafting && !indicators.needsSinusLift) {
    return;
  }

  const procedures: string[] = [];

  if (indicators.needsSinusLift) {
    procedures.push('Sinus floor elevation');
    context.estimatedDuration += 6;
  }

  if (indicators.needsBoneGrafting) {
    procedures.push('Bone grafting procedure');
    context.estimatedDuration += 4;
  }

  context.phases.push({
    phase: context.phases.length + 1,
    name: 'Bone Augmentation',
    description: 'Enhance bone volume for optimal implant placement',
    estimatedDuration: '4-6 months healing',
    procedures,
    prerequisites: ['Complete pre-treatment requirements', 'CBCT imaging'],
  });

  context.keyRisks.push('Bone graft failure or partial resorption may occur');
}

/**
 * Build surgical phase
 */
function buildSurgicalPhase(
  score: AllOnXClinicalScore,
  indicators: AllOnXClinicalIndicators,
  context: TreatmentPlanContext
): void {
  const procedures: string[] = [];

  if (indicators.extractionsNeeded > 0) {
    procedures.push(`Extract ${indicators.extractionsNeeded} remaining teeth`);
  }

  procedures.push(`${score.recommendedProcedure.replace(/_/g, '-')} implant placement`);

  if (score.isImmediateLoadingFeasible()) {
    procedures.push('Immediate provisional prosthesis placement');
    context.reasons.push('Patient eligible for immediate loading protocol');
  } else {
    context.estimatedDuration += 3;
    context.reasons.push('Conventional loading protocol recommended for optimal healing');
  }

  const hasPrerequisitePhases = context.phases.length > 0;

  context.phases.push({
    phase: context.phases.length + 1,
    name: 'Surgical Phase',
    description: 'Implant placement and initial prosthesis delivery',
    estimatedDuration: score.isImmediateLoadingFeasible() ? '1 day' : '3-4 months healing',
    procedures,
    prerequisites: hasPrerequisitePhases
      ? ['Complete previous phase', 'Verify bone healing']
      : ['CBCT imaging', 'Surgical guide fabrication'],
  });
}

/**
 * Build final prosthetic phase
 */
function buildProstheticPhase(context: TreatmentPlanContext): void {
  context.phases.push({
    phase: context.phases.length + 1,
    name: 'Final Prosthesis',
    description: 'Definitive prosthesis fabrication and delivery',
    estimatedDuration: '4-6 weeks',
    procedures: [
      'Final impressions',
      'Framework try-in',
      'Final prosthesis delivery',
      'Occlusal adjustments',
    ],
    prerequisites: ['Adequate osseointegration confirmed', 'Soft tissue maturation'],
  });
}

/**
 * Calculate success probability based on risk factors
 */
function calculateSuccessProbability(indicators: AllOnXClinicalIndicators): number {
  let probability = 0.95; // Base success rate for All-on-X

  // Smoking impact
  if (indicators.smokingStatus >= 3) {
    probability -= 0.1;
  } else if (indicators.smokingStatus >= 2) {
    probability -= 0.05;
  }

  // Diabetes impact
  if (indicators.hba1c !== undefined && indicators.hba1c > 8) {
    probability -= 0.08;
  }

  // Bone quality impact
  if (indicators.boneDensity >= 4) {
    probability -= 0.05;
  }

  // Medication impact
  if (indicators.onBisphosphonates) {
    probability -= 0.05;
  }

  // Bruxism impact
  if (indicators.hasBruxism) {
    probability -= 0.03;
  }

  return Math.max(0.7, Math.round(probability * 100) / 100);
}

/**
 * Add standard and conditional key risks
 */
function addStandardKeyRisks(indicators: AllOnXClinicalIndicators, keyRisks: string[]): void {
  keyRisks.push('Implant failure requiring replacement');
  keyRisks.push('Temporary numbness or altered sensation');
  keyRisks.push('Prosthetic complications requiring adjustments');

  if (indicators.hasBruxism) {
    keyRisks.push('Prosthetic fracture risk due to bruxism');
  }
}

// ============================================================================
// TREATMENT PLANNING
// ============================================================================

/**
 * Generate treatment plan based on clinical score
 *
 * Orchestrates phase building through focused helper functions
 * for improved readability and testability.
 */
export function generateTreatmentPlan(
  score: AllOnXClinicalScore,
  indicators: AllOnXClinicalIndicators
): TreatmentPlanningResult {
  const context: TreatmentPlanContext = {
    phases: [],
    preTreatmentRequirements: [],
    keyRisks: [],
    reasons: [],
    estimatedDuration: 6, // Base duration in months
  };

  // Build treatment phases in sequence
  buildPreTreatmentPhase(indicators, context);
  buildBoneAugmentationPhase(indicators, context);
  buildSurgicalPhase(score, indicators, context);
  buildProstheticPhase(context);

  // Calculate outcomes
  const successProbability = calculateSuccessProbability(indicators);
  addStandardKeyRisks(indicators, context.keyRisks);

  return {
    isFeasible: score.isCandidate(),
    recommendedProcedure: score.recommendedProcedure,
    phases: Object.freeze(context.phases),
    preTreatmentRequirements: Object.freeze(context.preTreatmentRequirements),
    estimatedDuration: context.estimatedDuration,
    successProbability,
    keyRisks: Object.freeze(context.keyRisks),
    reasons: Object.freeze(context.reasons),
  };
}

// ============================================================================
// COMPARISON & TRACKING
// ============================================================================

/**
 * Compare two scores for treatment response assessment
 */
export function compareScores(
  baseline: AllOnXClinicalScore,
  followUp: AllOnXClinicalScore
): {
  scoreChange: number;
  scoreChangePercent: number;
  eligibilityChange: 'IMPROVED' | 'UNCHANGED' | 'WORSENED';
  significantImprovement: boolean;
  clinicalResponse: 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'NONE' | 'WORSENED';
} {
  const scoreChange = followUp.compositeScore - baseline.compositeScore;
  const scoreChangePercent =
    baseline.compositeScore > 0
      ? (scoreChange / baseline.compositeScore) * 100
      : followUp.compositeScore > 0
        ? 100
        : 0;

  // Eligibility order
  const eligibilityOrder: Record<AllOnXEligibility, number> = {
    CONTRAINDICATED: 0,
    CONDITIONAL: 1,
    SUITABLE: 2,
    IDEAL: 3,
  };

  const baselineEligibilityValue = eligibilityOrder[baseline.eligibility];
  const followUpEligibilityValue = eligibilityOrder[followUp.eligibility];

  let eligibilityChange: 'IMPROVED' | 'UNCHANGED' | 'WORSENED';
  if (followUpEligibilityValue > baselineEligibilityValue) {
    eligibilityChange = 'IMPROVED';
  } else if (followUpEligibilityValue < baselineEligibilityValue) {
    eligibilityChange = 'WORSENED';
  } else {
    eligibilityChange = 'UNCHANGED';
  }

  // Significant improvement: moved to better eligibility or >15% score improvement
  const significantImprovement = eligibilityChange === 'IMPROVED' || scoreChangePercent >= 15;

  // Clinical response
  let clinicalResponse: 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'NONE' | 'WORSENED';
  if (scoreChange < -5) {
    clinicalResponse = 'WORSENED';
  } else if (followUp.eligibility === 'IDEAL' && baseline.eligibility !== 'IDEAL') {
    clinicalResponse = 'EXCELLENT';
  } else if (scoreChangePercent >= 15) {
    clinicalResponse = 'GOOD';
  } else if (scoreChangePercent >= 5) {
    clinicalResponse = 'PARTIAL';
  } else {
    clinicalResponse = 'NONE';
  }

  return {
    scoreChange: Math.round(scoreChange * 10) / 10,
    scoreChangePercent: Math.round(scoreChangePercent * 10) / 10,
    eligibilityChange,
    significantImprovement,
    clinicalResponse,
  };
}

// ============================================================================
// IMPLANT SITE ASSESSMENT
// ============================================================================

/**
 * Assess implant sites for the planned procedure
 */
export function assessImplantSites(
  indicators: AllOnXClinicalIndicators
): readonly ImplantSiteAssessment[] {
  const assessments: ImplantSiteAssessment[] = [];

  // Maxillary sites
  if (indicators.targetArch === 1 || indicators.targetArch === 3) {
    // Anterior maxilla
    assessments.push({
      site: 'anterior_maxilla',
      boneQuality: getBoneQualityDescription(indicators.boneDensity),
      boneQuantity:
        indicators.maxillaBoneHeight >= 12
          ? 'adequate'
          : indicators.maxillaBoneHeight >= 8
            ? 'marginal'
            : 'insufficient',
      augmentationNeeded: indicators.needsBoneGrafting,
      primaryStabilityLikelihood:
        indicators.boneDensity <= 2 ? 'high' : indicators.boneDensity === 3 ? 'moderate' : 'low',
    });

    // Posterior maxilla (tilted implants avoid sinus)
    assessments.push({
      site: 'posterior_maxilla',
      boneQuality: getBoneQualityDescription(indicators.boneDensity),
      boneQuantity: indicators.needsSinusLift
        ? 'insufficient'
        : indicators.maxillaBoneHeight >= 10
          ? 'adequate'
          : 'marginal',
      augmentationNeeded: indicators.needsSinusLift,
      primaryStabilityLikelihood: indicators.boneDensity <= 2 ? 'high' : 'moderate',
    });
  }

  // Mandibular sites
  if (indicators.targetArch === 2 || indicators.targetArch === 3) {
    // Anterior mandible
    assessments.push({
      site: 'anterior_mandible',
      boneQuality: getBoneQualityDescription(Math.max(1, indicators.boneDensity - 1)), // Mandible typically denser
      boneQuantity:
        indicators.mandibleBoneHeight >= 12
          ? 'adequate'
          : indicators.mandibleBoneHeight >= 8
            ? 'marginal'
            : 'insufficient',
      augmentationNeeded: indicators.needsBoneGrafting && indicators.mandibleBoneHeight < 8,
      primaryStabilityLikelihood: 'high', // Mandible usually provides good stability
    });

    // Posterior mandible
    assessments.push({
      site: 'posterior_mandible',
      boneQuality: getBoneQualityDescription(indicators.boneDensity),
      boneQuantity: indicators.mandibleBoneHeight >= 10 ? 'adequate' : 'marginal',
      augmentationNeeded: false, // All-on-X uses tilted implants to avoid nerve
      primaryStabilityLikelihood: indicators.boneDensity <= 2 ? 'high' : 'moderate',
    });
  }

  return Object.freeze(assessments);
}

/**
 * Convert bone density number to description
 */
function getBoneQualityDescription(density: number): ImplantSiteAssessment['boneQuality'] {
  if (density <= 1) return 'excellent';
  if (density <= 2) return 'good';
  if (density <= 3) return 'fair';
  return 'poor';
}

// ============================================================================
// ELIGIBILITY HELPERS
// ============================================================================

/**
 * Quick eligibility check from minimal data
 */
export function quickEligibilityCheck(
  boneDensity: number,
  boneHeight: number,
  smokingStatus: number,
  hba1c?: number,
  hasContraindications = false
): {
  likelyEligible: boolean;
  preliminaryEligibility: AllOnXEligibility;
  keyFactors: string[];
} {
  const keyFactors: string[] = [];

  if (hasContraindications) {
    return {
      likelyEligible: false,
      preliminaryEligibility: 'CONTRAINDICATED',
      keyFactors: ['Absolute contraindication present'],
    };
  }

  let score = 100;

  // Bone assessment
  score -= (boneDensity - 1) * 8;
  if (boneHeight < 8) {
    score -= 20;
    keyFactors.push('Insufficient bone height');
  }

  // Smoking
  if (smokingStatus >= 3) {
    score -= 15;
    keyFactors.push('Heavy smoker - significant risk factor');
  }

  // Diabetes
  if (hba1c !== undefined && hba1c > 9) {
    score -= 20;
    keyFactors.push('Poorly controlled diabetes');
  }

  let preliminaryEligibility: AllOnXEligibility;
  if (score >= 80) {
    preliminaryEligibility = 'IDEAL';
    keyFactors.push('Good candidate based on preliminary assessment');
  } else if (score >= 60) {
    preliminaryEligibility = 'SUITABLE';
    keyFactors.push('Suitable candidate with some considerations');
  } else if (score >= 40) {
    preliminaryEligibility = 'CONDITIONAL';
    keyFactors.push('Conditional eligibility - full assessment needed');
  } else {
    preliminaryEligibility = 'CONTRAINDICATED';
    keyFactors.push('Multiple risk factors present');
  }

  return {
    likelyEligible: preliminaryEligibility !== 'CONTRAINDICATED',
    preliminaryEligibility,
    keyFactors,
  };
}

/**
 * Classify eligibility from composite score
 */
export function classifyEligibilityFromScore(compositeScore: number): AllOnXEligibility {
  if (compositeScore >= 80) return 'IDEAL';
  if (compositeScore >= 60) return 'SUITABLE';
  if (compositeScore >= 40) return 'CONDITIONAL';
  return 'CONTRAINDICATED';
}

/**
 * Calculate risk level from indicators
 */
export function calculateRiskLevel(indicators: AllOnXClinicalIndicators): AllOnXRiskLevel {
  let riskScore = 0;

  if (indicators.smokingStatus >= 3) riskScore += 20;
  else if (indicators.smokingStatus >= 2) riskScore += 10;

  if (indicators.hba1c !== undefined) {
    if (indicators.hba1c > 9) riskScore += 25;
    else if (indicators.hba1c > 7.5) riskScore += 15;
  }

  if (indicators.onBisphosphonates) riskScore += 20;
  if (indicators.hasOsteoporosis) riskScore += 10;
  if (indicators.isImmunocompromised) riskScore += 15;
  if (indicators.hasRadiationHistory) riskScore += 30;
  if (indicators.hasUncontrolledCardiovascular) riskScore += 25;
  if (indicators.asaClassification >= 3) riskScore += 15;

  if (riskScore >= 60) return 'CRITICAL';
  if (riskScore >= 40) return 'HIGH';
  if (riskScore >= 20) return 'MODERATE';
  return 'LOW';
}
