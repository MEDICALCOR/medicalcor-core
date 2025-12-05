/**
 * @fileoverview Comprehensive Tests for OsaxScoringPolicy Service
 *
 * Tests the OSAX clinical scoring policy including:
 * - Score calculation with various clinical indicators
 * - Severity classification
 * - Treatment eligibility determination
 * - Cardiovascular risk assessment
 * - Score comparison and improvement tracking
 * - Pediatric scoring adjustments
 * - GDPR/HIPAA compliance scenarios
 *
 * @module domain/osax/services/__tests__/osax-scoring-policy
 */

import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateCompositeScore,
  determineTreatmentEligibility,
  classifySeverityFromAHI,
  calculateCardiovascularRisk,
  compareScores,
  calculatePediatricScore,
  DEFAULT_SCORING_CONFIG,
  PEDIATRIC_SCORING_CONFIG,
  type OsaxScoringConfig,
  type OsaxClinicalIndicators,
  type OsaxRiskFlag,
} from '../OsaxScoringPolicy.js';
import { OsaxClinicalScore } from '../../value-objects/OsaxClinicalScore.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMildOsaIndicators = (): OsaxClinicalIndicators => ({
  ahi: 7.5,
  odi: 5.2,
  spo2Nadir: 88,
  spo2Average: 95,
  spo2Average: 94,
  sleepEfficiency: 82,
  totalSleepTime: 360,
  essScore: 8,
});

const createModerateOsaIndicators = (): OsaxClinicalIndicators => ({
  ahi: 22.0,
  odi: 18.5,
  spo2Nadir: 83,
  spo2Average: 95,
  spo2Average: 91,
  sleepEfficiency: 75,
  totalSleepTime: 340,
  essScore: 14,
  bmi: 32,
});

const createSevereOsaIndicators = (): OsaxClinicalIndicators => ({
  ahi: 45.0,
  odi: 40.0,
  spo2Nadir: 72,
  spo2Average: 95,
  spo2Average: 88,
  sleepEfficiency: 68,
  totalSleepTime: 320,
  essScore: 18,
  bmi: 36,
  remAhi: 55.0,
  supineAhi: 65.0,
});

const createNormalIndicators = (): OsaxClinicalIndicators => ({
  ahi: 2.0,
  odi: 1.5,
  spo2Nadir: 93,
  spo2Average: 95,
  spo2Average: 96,
  sleepEfficiency: 90,
  totalSleepTime: 420,
  essScore: 6,
});

// ============================================================================
// SCORE CALCULATION TESTS
// ============================================================================

describe('OsaxScoringPolicy - Score Calculation', () => {
  it('should calculate score for mild OSA', () => {
    const indicators = createMildOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.clinicalScore.severity).toBe('MILD');
    expect(result.clinicalScore.indicators.ahi).toBe(7.5);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.scoringMethod).toBe('STANDARD');
  });

  it('should calculate score for moderate OSA', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.clinicalScore.severity).toBe('MODERATE');
    expect(result.clinicalScore.indicators.ahi).toBe(22.0);
    expect(result.componentScores.ahiComponent).toBeGreaterThan(0);
  });

  it('should calculate score for severe OSA', () => {
    const indicators = createSevereOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.clinicalScore.severity).toBe('SEVERE');
    expect(result.clinicalScore.indicators.ahi).toBe(45.0);
    expect(result.componentScores.ahiComponent).toBeGreaterThan(50);
  });

  it('should calculate score for normal study (no OSA)', () => {
    const indicators = createNormalIndicators();
    const result = calculateScore(indicators);

    expect(result.clinicalScore.severity).toBe('NONE');
    expect(result.clinicalScore.hasOSA()).toBe(false);
  });

  it('should include all component scores', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.componentScores).toHaveProperty('ahiComponent');
    expect(result.componentScores).toHaveProperty('odiComponent');
    expect(result.componentScores).toHaveProperty('spo2Component');
    expect(result.componentScores).toHaveProperty('essComponent');
    expect(result.componentScores).toHaveProperty('bmiComponent');
  });

  it('should calculate higher confidence with complete data', () => {
    const completeIndicators = createSevereOsaIndicators();
    const incompleteIndicators = { ...createMildOsaIndicators(), totalSleepTime: undefined };

    const completeResult = calculateScore(completeIndicators);
    const incompleteResult = calculateScore(incompleteIndicators);

    expect(completeResult.confidence).toBeGreaterThan(incompleteResult.confidence);
  });

  it('should use custom scoring configuration', () => {
    const customConfig: OsaxScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      ahiThresholds: {
        mild: 10,
        moderate: 20,
        severe: 40,
      },
    };

    const indicators: OsaxClinicalIndicators = {
      ahi: 12.0,
      odi: 10.0,
      spo2Nadir: 85,
  spo2Average: 95,
      sleepEfficiency: 80,
      totalSleepTime: 360,
      essScore: 10,
    };

    const result = calculateScore(indicators, customConfig);
    expect(result.clinicalScore.severity).toBe('MILD');
  });
});

// ============================================================================
// COMPONENT SCORE TESTS
// ============================================================================

describe('OsaxScoringPolicy - Component Scores', () => {
  it('should normalize AHI component correctly', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 60.0, // At normalization threshold
      odi: 0,
      spo2Nadir: 100,
      spo2Average: 100,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 0,
    };

    const result = calculateScore(indicators);
    expect(result.componentScores.ahiComponent).toBeCloseTo(100, 0);
  });

  it('should normalize ODI component correctly', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 0,
      odi: 30.0,
      spo2Nadir: 100,
      spo2Average: 100,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 0,
    };

    const result = calculateScore(indicators);
    expect(result.componentScores.odiComponent).toBeCloseTo(50, 0);
  });

  it('should invert SpO2 component (lower is worse)', () => {
    const highSpO2: OsaxClinicalIndicators = {
      ahi: 0,
      odi: 0,
      spo2Nadir: 95,
  spo2Average: 95,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 0,
    };

    const lowSpO2: OsaxClinicalIndicators = {
      ahi: 0,
      odi: 0,
      spo2Nadir: 70,
  spo2Average: 95,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 0,
    };

    const highResult = calculateScore(highSpO2);
    const lowResult = calculateScore(lowSpO2);

    expect(lowResult.componentScores.spo2Component).toBeGreaterThan(
      highResult.componentScores.spo2Component
    );
  });

  it('should calculate ESS component from 0-24 scale', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 0,
      odi: 0,
      spo2Nadir: 100,
      spo2Average: 100,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 24, // Maximum sleepiness
    };

    const result = calculateScore(indicators);
    expect(result.componentScores.essComponent).toBeCloseTo(100, 0);
  });

  it('should calculate BMI component above threshold', () => {
    const obese: OsaxClinicalIndicators = {
      ahi: 0,
      odi: 0,
      spo2Nadir: 100,
      spo2Average: 100,
      sleepEfficiency: 100,
      totalSleepTime: 480,
      essScore: 0,
      bmi: 40, // 10 above threshold of 30
    };

    const normal: OsaxClinicalIndicators = {
      ...obese,
      bmi: 25,
    };

    const obeseResult = calculateScore(obese);
    const normalResult = calculateScore(normal);

    expect(obeseResult.componentScores.bmiComponent).toBeGreaterThan(
      normalResult.componentScores.bmiComponent
    );
  });
});

// ============================================================================
// COMPOSITE SCORE TESTS
// ============================================================================

describe('OsaxScoringPolicy - Composite Score', () => {
  it('should calculate weighted composite score', () => {
    const components = {
      ahiComponent: 50,
      odiComponent: 40,
      spo2Component: 30,
      essComponent: 20,
      bmiComponent: 10,
    };

    const composite = calculateCompositeScore(components, DEFAULT_SCORING_CONFIG.weights);
    expect(composite).toBeGreaterThan(0);
    expect(composite).toBeLessThanOrEqual(100);
  });

  it('should weight AHI most heavily by default', () => {
    expect(DEFAULT_SCORING_CONFIG.weights.ahiWeight).toBe(0.4);
    expect(DEFAULT_SCORING_CONFIG.weights.ahiWeight).toBeGreaterThan(
      DEFAULT_SCORING_CONFIG.weights.odiWeight
    );
  });

  it('should sum weights to approximately 1.0', () => {
    const weights = DEFAULT_SCORING_CONFIG.weights;
    const sum =
      weights.ahiWeight +
      weights.odiWeight +
      weights.spo2NadirWeight +
      weights.essWeight +
      weights.bmiWeight +
      weights.ageWeight;

    expect(sum).toBeCloseTo(1.0, 1);
  });
});

// ============================================================================
// RISK FLAG TESTS
// ============================================================================

describe('OsaxScoringPolicy - Risk Flags', () => {
  it('should flag HIGH_AHI for severe cases', () => {
    const indicators = createSevereOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.riskFlags).toContain('HIGH_AHI' as OsaxRiskFlag);
  });

  it('should flag SEVERE_DESATURATION for low SpO2', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      spo2Nadir: 75,
  spo2Average: 95,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('SEVERE_DESATURATION' as OsaxRiskFlag);
  });

  it('should flag EXCESSIVE_SLEEPINESS for high ESS', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createMildOsaIndicators(),
      essScore: 18,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS' as OsaxRiskFlag);
  });

  it('should flag OBESITY for high BMI', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createMildOsaIndicators(),
      bmi: 35,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('OBESITY' as OsaxRiskFlag);
  });

  it('should flag REM_PREDOMINANT when REM AHI is 2x total AHI', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
      remAhi: 45,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('REM_PREDOMINANT' as OsaxRiskFlag);
  });

  it('should flag SUPINE_DEPENDENT when supine AHI is 2x total AHI', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
      supineAhi: 50,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('SUPINE_DEPENDENT' as OsaxRiskFlag);
  });

  it('should flag CARDIOVASCULAR_RISK for severe hypoxemia', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
      spo2Nadir: 80,
  spo2Average: 95,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('CARDIOVASCULAR_RISK' as OsaxRiskFlag);
  });

  it('should flag NEEDS_SPLIT_NIGHT for very high AHI', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createSevereOsaIndicators(),
      ahi: 50,
    };

    const result = calculateScore(indicators);
    expect(result.riskFlags).toContain('NEEDS_SPLIT_NIGHT' as OsaxRiskFlag);
  });

  it('should flag NEEDS_TITRATION for moderate to severe cases', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.riskFlags).toContain('NEEDS_TITRATION' as OsaxRiskFlag);
  });

  it('should flag PEDIATRIC_CASE for children', () => {
    const indicators = createMildOsaIndicators();
    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 12);

    expect(result.riskFlags).toContain('PEDIATRIC_CASE' as OsaxRiskFlag);
  });

  it('should flag GERIATRIC_CASE for elderly patients', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 75);

    expect(result.riskFlags).toContain('GERIATRIC_CASE' as OsaxRiskFlag);
  });
});

// ============================================================================
// CLINICAL NOTES TESTS
// ============================================================================

describe('OsaxScoringPolicy - Clinical Notes', () => {
  it('should generate severity note for severe OSA', () => {
    const indicators = createSevereOsaIndicators();
    const result = calculateScore(indicators);

    expect(result.clinicalNotes.length).toBeGreaterThan(0);
    expect(result.clinicalNotes[0]).toContain('Severe obstructive sleep apnea');
  });

  it('should generate hypoxemia note for severe desaturation', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      spo2Nadir: 75,
  spo2Average: 95,
    };

    const result = calculateScore(indicators);
    const hypoxemiaNote = result.clinicalNotes.find((note) => note.includes('hypoxemia'));
    expect(hypoxemiaNote).toBeDefined();
  });

  it('should generate sleepiness warning', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      essScore: 18,
    };

    const result = calculateScore(indicators);
    const sleepinessNote = result.clinicalNotes.find((note) => note.includes('sleepiness'));
    expect(sleepinessNote).toBeDefined();
  });

  it('should mention positional therapy for supine-dependent OSA', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
      supineAhi: 50,
    };

    const result = calculateScore(indicators);
    const positionalNote = result.clinicalNotes.find((note) => note.includes('Positional'));
    expect(positionalNote).toBeDefined();
  });

  it('should mention cardiovascular risk for high-risk cases', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createSevereOsaIndicators(),
      ahi: 30,
      spo2Nadir: 75,
  spo2Average: 95,
    };

    const result = calculateScore(indicators);
    const cvNote = result.clinicalNotes.find((note) => note.includes('cardiovascular'));
    expect(cvNote).toBeDefined();
  });
});

// ============================================================================
// TREATMENT ELIGIBILITY TESTS
// ============================================================================

describe('OsaxScoringPolicy - Treatment Eligibility', () => {
  it('should recommend CPAP for severe OSA', () => {
    const indicators = createSevereOsaIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.isEligible).toBe(true);
    expect(eligibility.eligibleTreatments).toContain('CPAP_THERAPY');
  });

  it('should recommend BiPAP for severe OSA', () => {
    const indicators = createSevereOsaIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.eligibleTreatments).toContain('BIPAP_THERAPY');
  });

  it('should consider surgery for critical hypoxemia', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createSevereOsaIndicators(),
      spo2Nadir: 70,
  spo2Average: 95,
    };

    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.eligibleTreatments).toContain('SURGERY_EVALUATION');
  });

  it('should offer oral appliance for moderate OSA', () => {
    const indicators = createModerateOsaIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.eligibleTreatments).toContain('ORAL_APPLIANCE');
  });

  it('should recommend positional therapy for supine-dependent OSA', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 18,
      supineAhi: 40,
    };

    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.eligibleTreatments).toContain('POSITIONAL_THERAPY');
  });

  it('should recommend lifestyle changes for mild OSA', () => {
    const indicators = createMildOsaIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.eligibleTreatments).toContain('LIFESTYLE_MODIFICATION');
  });

  it('should check Medicare eligibility criteria (AHI >= 15)', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
    };

    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators, true);

    expect(eligibility.insuranceCriteriaMet.medicareEligible).toBe(true);
    expect(eligibility.insuranceCriteriaMet.ahiCriteriaMet).toBe(true);
  });

  it('should check Medicare eligibility with symptoms (AHI >= 5)', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createMildOsaIndicators(),
      ahi: 7,
      essScore: 12,
    };

    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators, true);

    expect(eligibility.insuranceCriteriaMet.medicareEligible).toBe(true);
    expect(eligibility.insuranceCriteriaMet.symptomCriteriaMet).toBe(true);
  });

  it('should not recommend treatment for normal study', () => {
    const indicators = createNormalIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);
    const eligibility = determineTreatmentEligibility(score, indicators);

    expect(eligibility.isEligible).toBe(false);
    expect(eligibility.primaryRecommendation).toBe('LIFESTYLE_MODIFICATION');
  });
});

// ============================================================================
// SEVERITY CLASSIFICATION TESTS
// ============================================================================

describe('OsaxScoringPolicy - Severity Classification', () => {
  it('should classify AHI < 5 as NONE', () => {
    const severity = classifySeverityFromAHI(3.0);
    expect(severity).toBe('NONE');
  });

  it('should classify AHI 5-14.9 as MILD', () => {
    expect(classifySeverityFromAHI(5.0)).toBe('MILD');
    expect(classifySeverityFromAHI(10.0)).toBe('MILD');
    expect(classifySeverityFromAHI(14.9)).toBe('MILD');
  });

  it('should classify AHI 15-29.9 as MODERATE', () => {
    expect(classifySeverityFromAHI(15.0)).toBe('MODERATE');
    expect(classifySeverityFromAHI(20.0)).toBe('MODERATE');
    expect(classifySeverityFromAHI(29.9)).toBe('MODERATE');
  });

  it('should classify AHI >= 30 as SEVERE', () => {
    expect(classifySeverityFromAHI(30.0)).toBe('SEVERE');
    expect(classifySeverityFromAHI(50.0)).toBe('SEVERE');
    expect(classifySeverityFromAHI(100.0)).toBe('SEVERE');
  });
});

// ============================================================================
// CARDIOVASCULAR RISK TESTS
// ============================================================================

describe('OsaxScoringPolicy - Cardiovascular Risk', () => {
  it('should classify CRITICAL risk for severe OSA with critical hypoxemia', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createSevereOsaIndicators(),
      ahi: 40,
      spo2Nadir: 70,
  spo2Average: 95,
    };

    const risk = calculateCardiovascularRisk(indicators);
    expect(risk).toBe('CRITICAL');
  });

  it('should classify HIGH risk for moderate OSA with hypoxemia', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 20,
      spo2Nadir: 78,
  spo2Average: 95,
    };

    const risk = calculateCardiovascularRisk(indicators);
    expect(risk).toBe('HIGH');
  });

  it('should classify MODERATE risk for mild OSA', () => {
    const indicators = createMildOsaIndicators();
    const risk = calculateCardiovascularRisk(indicators);
    expect(risk).toBe('MODERATE');
  });

  it('should classify LOW risk for normal study', () => {
    const indicators = createNormalIndicators();
    const risk = calculateCardiovascularRisk(indicators);
    expect(risk).toBe('LOW');
  });
});

// ============================================================================
// SCORE COMPARISON TESTS
// ============================================================================

describe('OsaxScoringPolicy - Score Comparison', () => {
  it('should detect improvement in severity', () => {
    const baseline = OsaxClinicalScore.fromIndicators(createSevereOsaIndicators());
    const followUp = OsaxClinicalScore.fromIndicators(createMildOsaIndicators());

    const comparison = compareScores(baseline, followUp);

    expect(comparison.severityChange).toBe('IMPROVED');
    expect(comparison.ahiChange).toBeLessThan(0);
  });

  it('should detect worsening in severity', () => {
    const baseline = OsaxClinicalScore.fromIndicators(createMildOsaIndicators());
    const followUp = OsaxClinicalScore.fromIndicators(createSevereOsaIndicators());

    const comparison = compareScores(baseline, followUp);

    expect(comparison.severityChange).toBe('WORSENED');
    expect(comparison.ahiChange).toBeGreaterThan(0);
  });

  it('should detect unchanged severity', () => {
    const baseline = OsaxClinicalScore.fromIndicators(createModerateOsaIndicators());
    const followUp = OsaxClinicalScore.fromIndicators({
      ...createModerateOsaIndicators(),
      ahi: 20,
    });

    const comparison = compareScores(baseline, followUp);

    expect(comparison.severityChange).toBe('UNCHANGED');
  });

  it('should calculate percentage change correctly', () => {
    const baselineIndicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 40,
    };
    const followUpIndicators: OsaxClinicalIndicators = {
      ...createMildOsaIndicators(),
      ahi: 20,
    };

    const baseline = OsaxClinicalScore.fromIndicators(baselineIndicators);
    const followUp = OsaxClinicalScore.fromIndicators(followUpIndicators);

    const comparison = compareScores(baseline, followUp);

    expect(comparison.ahiChangePercent).toBeCloseTo(-50, 0);
  });

  it('should classify EXCELLENT response for AHI < 5', () => {
    const baseline = OsaxClinicalScore.fromIndicators(createModerateOsaIndicators());
    const followUp = OsaxClinicalScore.fromIndicators(createNormalIndicators());

    const comparison = compareScores(baseline, followUp);

    expect(comparison.clinicalResponse).toBe('EXCELLENT');
    expect(comparison.significantImprovement).toBe(true);
  });

  it('should classify GOOD response for >50% reduction', () => {
    const baselineIndicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      ahi: 40,
    };
    const followUpIndicators: OsaxClinicalIndicators = {
      ...createMildOsaIndicators(),
      ahi: 15,
    };

    const baseline = OsaxClinicalScore.fromIndicators(baselineIndicators);
    const followUp = OsaxClinicalScore.fromIndicators(followUpIndicators);

    const comparison = compareScores(baseline, followUp);

    expect(comparison.clinicalResponse).toBe('GOOD');
    expect(comparison.significantImprovement).toBe(true);
  });

  it('should classify WORSENED response for increased AHI', () => {
    const baseline = OsaxClinicalScore.fromIndicators(createMildOsaIndicators());
    const followUp = OsaxClinicalScore.fromIndicators(createModerateOsaIndicators());

    const comparison = compareScores(baseline, followUp);

    expect(comparison.clinicalResponse).toBe('WORSENED');
  });
});

// ============================================================================
// PEDIATRIC SCORING TESTS
// ============================================================================

describe('OsaxScoringPolicy - Pediatric Scoring', () => {
  it('should use lower AHI thresholds for children', () => {
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.mild).toBe(1);
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.moderate).toBe(5);
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.severe).toBe(10);
  });

  it('should use pediatric scoring method for children', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 7.0, // MILD in standard scoring
      odi: 6.0,
      spo2Nadir: 90,
      spo2Average: 95,
      sleepEfficiency: 85,
      totalSleepTime: 480,
      essScore: 8,
    };

    const result = calculatePediatricScore(indicators, 10);

    expect(result.clinicalScore.severity).toBe('MILD');
    expect(result.scoringMethod).toBe('PEDIATRIC');
  });

  it('should throw error for adult age with pediatric scoring', () => {
    const indicators = createMildOsaIndicators();

    expect(() => calculatePediatricScore(indicators, 25)).toThrow(
      'Pediatric scoring is only for patients under 18'
    );
  });

  it('should automatically use pediatric scoring for children', () => {
    const indicators = createMildOsaIndicators();
    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 12);

    expect(result.scoringMethod).toBe('PEDIATRIC');
  });
});

// ============================================================================
// SCORING METHOD DETERMINATION TESTS
// ============================================================================

describe('OsaxScoringPolicy - Scoring Method', () => {
  it('should use STANDARD method for adults with complete data', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 45);

    expect(result.scoringMethod).toBe('STANDARD');
  });

  it('should use GERIATRIC method for elderly patients', () => {
    const indicators = createModerateOsaIndicators();
    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 75);

    expect(result.scoringMethod).toBe('GERIATRIC');
  });

  it('should use SIMPLIFIED method for poor sleep efficiency', () => {
    const indicators: OsaxClinicalIndicators = {
      ...createModerateOsaIndicators(),
      sleepEfficiency: 65,
    };

    const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 45);

    expect(result.scoringMethod).toBe('SIMPLIFIED');
  });

  it('should use SIMPLIFIED method when total sleep time is missing', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 20,
      odi: 15,
      spo2Nadir: 85,
  spo2Average: 95,
      sleepEfficiency: 75,
      totalSleepTime: undefined,
      essScore: 12,
    };

    const result = calculateScore(indicators);

    expect(result.scoringMethod).toBe('SIMPLIFIED');
  });
});
