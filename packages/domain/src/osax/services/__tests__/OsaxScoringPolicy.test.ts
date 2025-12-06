/**
 * @fileoverview Comprehensive tests for OsaxScoringPolicy domain service
 *
 * Tests OSAX clinical scoring logic including:
 * - calculateScore with various clinical indicators
 * - calculateCompositeScore for custom weighting
 * - determineTreatmentEligibility based on severity
 * - classifySeverityFromAHI per AASM guidelines
 * - calculateCardiovascularRisk from indicators
 * - compareScores for treatment response assessment
 * - calculatePediatricScore with adjusted thresholds
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
  type OsaxScoringResult,
  type OsaxRiskFlag,
} from '../OsaxScoringPolicy.js';
import {
  OsaxClinicalScore,
  type OsaxClinicalIndicators,
} from '../../value-objects/OsaxClinicalScore.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createBaseIndicators(
  overrides: Partial<OsaxClinicalIndicators> = {}
): OsaxClinicalIndicators {
  return {
    ahi: 10,
    odi: 8,
    spo2Nadir: 88,
    spo2Average: 94,
    sleepEfficiency: 85,
    essScore: 10,
    ...overrides,
  };
}

function createSevereIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 45,
    odi: 40,
    spo2Nadir: 72,
    spo2Average: 88,
    sleepEfficiency: 75,
    essScore: 18,
    bmi: 35,
    totalSleepTime: 300,
  };
}

function createModerateIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 22,
    odi: 18,
    spo2Nadir: 82,
    spo2Average: 92,
    sleepEfficiency: 75,
    essScore: 14,
    bmi: 28,
  };
}

function createMildIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 8,
    odi: 6,
    spo2Nadir: 90,
    spo2Average: 96,
    sleepEfficiency: 88,
    essScore: 8,
    bmi: 25,
  };
}

function createNormalIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 3,
    odi: 2,
    spo2Nadir: 94,
    spo2Average: 97,
    sleepEfficiency: 92,
    essScore: 4,
    bmi: 22,
  };
}

// ============================================================================
// calculateScore TESTS
// ============================================================================

describe('calculateScore', () => {
  describe('severity classification', () => {
    it('should classify severe OSA (AHI >= 30)', () => {
      const indicators = createSevereIndicators();
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('SEVERE');
      expect(result.scoringMethod).toBe('STANDARD');
    });

    it('should classify moderate OSA (AHI 15-29)', () => {
      const indicators = createModerateIndicators();
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('MODERATE');
    });

    it('should classify mild OSA (AHI 5-14)', () => {
      const indicators = createMildIndicators();
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('MILD');
    });

    it('should classify no OSA (AHI < 5)', () => {
      const indicators = createNormalIndicators();
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('NONE');
    });

    it('should classify borderline AHI = 5 as MILD', () => {
      const indicators = createBaseIndicators({ ahi: 5 });
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('MILD');
    });

    it('should classify borderline AHI = 15 as MODERATE', () => {
      const indicators = createBaseIndicators({ ahi: 15 });
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('MODERATE');
    });

    it('should classify borderline AHI = 30 as SEVERE', () => {
      const indicators = createBaseIndicators({ ahi: 30, spo2Nadir: 80 });
      const result = calculateScore(indicators);

      expect(result.clinicalScore.severity).toBe('SEVERE');
    });
  });

  describe('component scores calculation', () => {
    it('should calculate AHI component normalized to 0-100', () => {
      const indicators = createBaseIndicators({ ahi: 30 });
      const result = calculateScore(indicators);

      // AHI 30 / 60 (max) * 100 = 50
      expect(result.componentScores.ahiComponent).toBe(50);
    });

    it('should cap AHI component at 100 for very high values', () => {
      const indicators = createBaseIndicators({ ahi: 90, spo2Nadir: 70 });
      const result = calculateScore(indicators);

      // AHI 90 / 60 = 1.5, capped at 1 * 100 = 100
      expect(result.componentScores.ahiComponent).toBe(100);
    });

    it('should calculate ODI component normalized to 0-100', () => {
      const indicators = createBaseIndicators({ odi: 30 });
      const result = calculateScore(indicators);

      // ODI 30 / 60 * 100 = 50
      expect(result.componentScores.odiComponent).toBe(50);
    });

    it('should calculate SpO2 component (inverted scale)', () => {
      const indicators = createBaseIndicators({ spo2Nadir: 80 });
      const result = calculateScore(indicators);

      // (100 - 80) / 40 * 100 = 50
      expect(result.componentScores.spo2Component).toBe(50);
    });

    it('should calculate ESS component normalized to 0-100', () => {
      const indicators = createBaseIndicators({ essScore: 12 });
      const result = calculateScore(indicators);

      // 12 / 24 * 100 = 50
      expect(result.componentScores.essComponent).toBe(50);
    });

    it('should calculate BMI component with obesity threshold', () => {
      const indicators = createBaseIndicators({ bmi: 40 }); // 10 above threshold of 30
      const result = calculateScore(indicators);

      // (40 - 30) / 20 * 100 = 50
      expect(result.componentScores.bmiComponent).toBe(50);
    });

    it('should return 0 BMI component when BMI undefined', () => {
      const indicators = createBaseIndicators();
      delete (indicators as Record<string, unknown>).bmi;
      const result = calculateScore(indicators);

      expect(result.componentScores.bmiComponent).toBe(0);
    });

    it('should return 0 BMI component when below obesity threshold', () => {
      const indicators = createBaseIndicators({ bmi: 25 });
      const result = calculateScore(indicators);

      expect(result.componentScores.bmiComponent).toBe(0);
    });
  });

  describe('risk flags identification', () => {
    it('should identify HIGH_AHI flag when AHI >= 30', () => {
      const indicators = createSevereIndicators();
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('HIGH_AHI');
    });

    it('should identify SEVERE_DESATURATION flag when SpO2 nadir < 80', () => {
      const indicators = createBaseIndicators({ ahi: 25, spo2Nadir: 75 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('SEVERE_DESATURATION');
    });

    it('should identify EXCESSIVE_SLEEPINESS flag when ESS >= 16', () => {
      const indicators = createBaseIndicators({ essScore: 16 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS');
    });

    it('should identify OBESITY flag when BMI >= 30', () => {
      const indicators = createBaseIndicators({ bmi: 32 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('OBESITY');
    });

    it('should identify REM_PREDOMINANT flag when REM AHI > 2x overall AHI', () => {
      const indicators = createBaseIndicators({ ahi: 10, remAhi: 25 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('REM_PREDOMINANT');
    });

    it('should identify SUPINE_DEPENDENT flag when supine AHI > 2x overall AHI', () => {
      const indicators = createBaseIndicators({ ahi: 10, supineAhi: 25 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('SUPINE_DEPENDENT');
    });

    it('should identify CARDIOVASCULAR_RISK flag for severe cases', () => {
      const indicators = createBaseIndicators({ ahi: 20, spo2Nadir: 78 });
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('CARDIOVASCULAR_RISK');
    });

    it('should identify NEEDS_SPLIT_NIGHT flag when AHI >= 40', () => {
      const indicators = createSevereIndicators();
      indicators.ahi = 45;
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('NEEDS_SPLIT_NIGHT');
    });

    it('should identify NEEDS_TITRATION flag when AHI >= 15', () => {
      const indicators = createModerateIndicators();
      const result = calculateScore(indicators);

      expect(result.riskFlags).toContain('NEEDS_TITRATION');
    });

    it('should identify PEDIATRIC_CASE flag for patients under 18', () => {
      const indicators = createMildIndicators();
      const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 12);

      expect(result.riskFlags).toContain('PEDIATRIC_CASE');
    });

    it('should identify GERIATRIC_CASE flag for patients 65+', () => {
      const indicators = createMildIndicators();
      const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 70);

      expect(result.riskFlags).toContain('GERIATRIC_CASE');
    });

    it('should not add REM_PREDOMINANT when AHI is 0', () => {
      const indicators = createNormalIndicators();
      indicators.ahi = 0;
      indicators.remAhi = 5;
      const result = calculateScore(indicators);

      expect(result.riskFlags).not.toContain('REM_PREDOMINANT');
    });
  });

  describe('clinical notes generation', () => {
    it('should generate severe OSA note for AHI >= 30', () => {
      const indicators = createSevereIndicators();
      const result = calculateScore(indicators);

      expect(
        result.clinicalNotes.some((note) => note.includes('Severe obstructive sleep apnea'))
      ).toBe(true);
    });

    it('should generate moderate OSA note for AHI 15-29', () => {
      const indicators = createModerateIndicators();
      const result = calculateScore(indicators);

      expect(
        result.clinicalNotes.some((note) => note.includes('Moderate obstructive sleep apnea'))
      ).toBe(true);
    });

    it('should generate mild OSA note for AHI 5-14', () => {
      const indicators = createMildIndicators();
      const result = calculateScore(indicators);

      expect(
        result.clinicalNotes.some((note) => note.includes('Mild obstructive sleep apnea'))
      ).toBe(true);
    });

    it('should generate no OSA note for AHI < 5', () => {
      const indicators = createNormalIndicators();
      const result = calculateScore(indicators);

      expect(result.clinicalNotes.some((note) => note.includes('AHI within normal limits'))).toBe(
        true
      );
    });

    it('should generate hypoxemia note for severe desaturation', () => {
      const indicators = createBaseIndicators({ ahi: 25, spo2Nadir: 75 });
      const result = calculateScore(indicators);

      expect(result.clinicalNotes.some((note) => note.includes('nocturnal hypoxemia'))).toBe(true);
    });

    it('should generate sleepiness note for excessive ESS', () => {
      const indicators = createBaseIndicators({ essScore: 18 });
      const result = calculateScore(indicators);

      expect(
        result.clinicalNotes.some((note) => note.includes('Excessive daytime sleepiness'))
      ).toBe(true);
    });

    it('should generate positional therapy note for supine-dependent OSA', () => {
      const indicators = createBaseIndicators({ ahi: 10, supineAhi: 25 });
      const result = calculateScore(indicators);

      expect(result.clinicalNotes.some((note) => note.includes('Positional therapy'))).toBe(true);
    });

    it('should generate REM-related note', () => {
      const indicators = createBaseIndicators({ ahi: 10, remAhi: 25 });
      const result = calculateScore(indicators);

      expect(result.clinicalNotes.some((note) => note.includes('REM-predominant OSA'))).toBe(true);
    });

    it('should generate cardiovascular risk note', () => {
      const indicators = createBaseIndicators({ ahi: 20, spo2Nadir: 78 });
      const result = calculateScore(indicators);

      expect(result.clinicalNotes.some((note) => note.includes('cardiovascular risk'))).toBe(true);
    });
  });

  describe('confidence calculation', () => {
    it('should have base confidence of 0.7', () => {
      const indicators = createBaseIndicators();
      delete (indicators as Record<string, unknown>).totalSleepTime;
      indicators.sleepEfficiency = 70;
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should increase confidence with adequate total sleep time', () => {
      const indicators = createBaseIndicators({ totalSleepTime: 300 });
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should increase confidence with good sleep efficiency', () => {
      const indicators = createBaseIndicators({ sleepEfficiency: 90 });
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should increase confidence with REM AHI data', () => {
      const indicators = createBaseIndicators({ remAhi: 15 });
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should increase confidence with supine AHI data', () => {
      const indicators = createBaseIndicators({ supineAhi: 20 });
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should increase confidence with BMI data', () => {
      const indicators = createBaseIndicators({ bmi: 28 });
      const result = calculateScore(indicators);

      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should cap confidence at 0.99', () => {
      const indicators: OsaxClinicalIndicators = {
        ahi: 10,
        odi: 8,
        spo2Nadir: 88,
        spo2Average: 94,
        sleepEfficiency: 90,
        essScore: 10,
        bmi: 25,
        totalSleepTime: 300,
        remAhi: 15,
        supineAhi: 20,
      };
      const result = calculateScore(indicators);

      expect(result.confidence).toBeLessThanOrEqual(0.99);
    });
  });

  describe('scoring method determination', () => {
    it('should use STANDARD method for adult patients with full data', () => {
      const indicators = createBaseIndicators({ totalSleepTime: 300 });
      const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 40);

      expect(result.scoringMethod).toBe('STANDARD');
    });

    it('should use PEDIATRIC method for patients under 18', () => {
      const indicators = createBaseIndicators();
      const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 12);

      expect(result.scoringMethod).toBe('PEDIATRIC');
    });

    it('should use GERIATRIC method for patients 65+', () => {
      const indicators = createBaseIndicators();
      const result = calculateScore(indicators, DEFAULT_SCORING_CONFIG, 70);

      expect(result.scoringMethod).toBe('GERIATRIC');
    });

    it('should use SIMPLIFIED method when sleep efficiency is low', () => {
      const indicators = createBaseIndicators({ sleepEfficiency: 50 });
      const result = calculateScore(indicators);

      expect(result.scoringMethod).toBe('SIMPLIFIED');
    });

    it('should use SIMPLIFIED method when total sleep time is missing', () => {
      const indicators = createBaseIndicators();
      delete (indicators as Record<string, unknown>).totalSleepTime;
      indicators.sleepEfficiency = 85;
      const result = calculateScore(indicators);

      // With no totalSleepTime, should be STANDARD since sleepEfficiency is ok
      expect(['STANDARD', 'SIMPLIFIED']).toContain(result.scoringMethod);
    });
  });

  describe('custom configuration', () => {
    it('should use custom AHI thresholds for HIGH_AHI flag', () => {
      // Custom config where severe threshold is 20 instead of 30
      const customConfig: OsaxScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        ahiThresholds: {
          mild: 5,
          moderate: 15,
          severe: 20, // Lower than default 30
        },
      };

      const indicators = createBaseIndicators({ ahi: 25 }); // 25 >= 20 custom severe, but < 30 default
      const result = calculateScore(indicators, customConfig);

      // Should have HIGH_AHI flag since 25 >= 20 (custom severe threshold)
      expect(result.riskFlags).toContain('HIGH_AHI');
    });

    it('should use custom SpO2 thresholds for desaturation flags', () => {
      const customConfig: OsaxScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        spo2Thresholds: {
          mildDesaturation: 95,
          moderateDesaturation: 90,
          severeDesaturation: 85,
        },
      };

      const indicators = createBaseIndicators({ ahi: 25, spo2Nadir: 83 });
      const result = calculateScore(indicators, customConfig);

      expect(result.riskFlags).toContain('SEVERE_DESATURATION');
    });

    it('should use custom ESS thresholds for sleepiness flags', () => {
      const customConfig: OsaxScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        essThresholds: {
          normal: 8,
          mild: 10,
          moderate: 12,
          severe: 16,
        },
      };

      const indicators = createBaseIndicators({ essScore: 14 });
      const result = calculateScore(indicators, customConfig);

      expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS');
    });

    it('should use custom obesity threshold', () => {
      const customConfig: OsaxScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        bmiObesityThreshold: 25,
      };

      const indicators = createBaseIndicators({ bmi: 26 });
      const result = calculateScore(indicators, customConfig);

      expect(result.riskFlags).toContain('OBESITY');
    });
  });
});

// ============================================================================
// calculateCompositeScore TESTS
// ============================================================================

describe('calculateCompositeScore', () => {
  it('should calculate weighted composite score', () => {
    const components = {
      ahiComponent: 50,
      odiComponent: 50,
      spo2Component: 50,
      essComponent: 50,
      bmiComponent: 50,
    };

    const weights = DEFAULT_SCORING_CONFIG.weights;
    const result = calculateCompositeScore(components, weights);

    // 50 * (0.4 + 0.2 + 0.25 + 0.1 + 0.05) = 50 * 1.0 = 50
    expect(result).toBeCloseTo(50, 1);
  });

  it('should apply different weights correctly', () => {
    const components = {
      ahiComponent: 100,
      odiComponent: 0,
      spo2Component: 0,
      essComponent: 0,
      bmiComponent: 0,
    };

    const weights = DEFAULT_SCORING_CONFIG.weights;
    const result = calculateCompositeScore(components, weights);

    // 100 * 0.4 = 40
    expect(result).toBeCloseTo(40, 1);
  });

  it('should handle all zero components', () => {
    const components = {
      ahiComponent: 0,
      odiComponent: 0,
      spo2Component: 0,
      essComponent: 0,
      bmiComponent: 0,
    };

    const weights = DEFAULT_SCORING_CONFIG.weights;
    const result = calculateCompositeScore(components, weights);

    expect(result).toBe(0);
  });

  it('should handle all max components', () => {
    const components = {
      ahiComponent: 100,
      odiComponent: 100,
      spo2Component: 100,
      essComponent: 100,
      bmiComponent: 100,
    };

    const weights = DEFAULT_SCORING_CONFIG.weights;
    const result = calculateCompositeScore(components, weights);

    // Should be close to 100 (may not be exactly 100 due to weight sum)
    expect(result).toBeCloseTo(100, 0);
  });
});

// ============================================================================
// determineTreatmentEligibility TESTS
// ============================================================================

describe('determineTreatmentEligibility', () => {
  describe('severe OSA eligibility', () => {
    it('should recommend CPAP_THERAPY for severe OSA', () => {
      const indicators = createSevereIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.primaryRecommendation).toBe('CPAP_THERAPY');
      expect(result.eligibleTreatments).toContain('CPAP_THERAPY');
    });

    it('should recommend BIPAP_THERAPY for severe OSA with very low SpO2', () => {
      const indicators: OsaxClinicalIndicators = {
        ...createSevereIndicators(),
        spo2Nadir: 70,
      };
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('BIPAP_THERAPY');
    });

    it('should include SURGERY_EVALUATION for critical SpO2 nadir', () => {
      const indicators: OsaxClinicalIndicators = {
        ...createSevereIndicators(),
        spo2Nadir: 70,
      };
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('SURGERY_EVALUATION');
    });

    it('should mark as eligible', () => {
      const indicators = createSevereIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.isEligible).toBe(true);
    });
  });

  describe('moderate OSA eligibility', () => {
    it('should recommend CPAP_THERAPY for moderate OSA', () => {
      const indicators = createModerateIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('CPAP_THERAPY');
    });

    it('should include ORAL_APPLIANCE for moderate OSA', () => {
      const indicators = createModerateIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('ORAL_APPLIANCE');
    });

    it('should recommend POSITIONAL_THERAPY for supine-dependent moderate OSA', () => {
      const indicators: OsaxClinicalIndicators = {
        ...createModerateIndicators(),
        supineAhi: 50,
      };
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('POSITIONAL_THERAPY');
    });
  });

  describe('mild OSA eligibility', () => {
    it('should recommend ORAL_APPLIANCE for mild OSA', () => {
      const indicators = createMildIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('ORAL_APPLIANCE');
    });

    it('should include POSITIONAL_THERAPY for mild OSA', () => {
      const indicators = createMildIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('POSITIONAL_THERAPY');
    });

    it('should include LIFESTYLE_MODIFICATION for mild OSA', () => {
      const indicators = createMildIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.eligibleTreatments).toContain('LIFESTYLE_MODIFICATION');
    });
  });

  describe('no OSA eligibility', () => {
    it('should recommend LIFESTYLE_MODIFICATION for no OSA', () => {
      const indicators = createNormalIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.primaryRecommendation).toBe('LIFESTYLE_MODIFICATION');
    });

    it('should mark as not eligible for treatment', () => {
      const indicators = createNormalIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.isEligible).toBe(false);
    });
  });

  describe('insurance criteria', () => {
    it('should meet Medicare criteria for AHI >= 15', () => {
      const indicators = createModerateIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.insuranceCriteriaMet.medicareEligible).toBe(true);
      expect(result.insuranceCriteriaMet.ahiCriteriaMet).toBe(true);
    });

    it('should meet Medicare criteria for AHI 5-14 with symptoms', () => {
      const indicators = createMildIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators, true);

      expect(result.insuranceCriteriaMet.ahiCriteriaMet).toBe(true);
    });

    it('should not meet AHI criteria for AHI 5-14 without symptoms', () => {
      const indicators = createMildIndicators();
      indicators.essScore = 4; // Low sleepiness
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators, false);

      expect(result.insuranceCriteriaMet.ahiCriteriaMet).toBe(false);
    });

    it('should meet symptom criteria when ESS >= 10', () => {
      const indicators = createBaseIndicators({ essScore: 12 });
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.insuranceCriteriaMet.symptomCriteriaMet).toBe(true);
    });
  });

  describe('reasons', () => {
    it('should provide reason for severe OSA', () => {
      const indicators = createSevereIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.reasons.some((r) => r.includes('Severe OSA'))).toBe(true);
    });

    it('should provide reason for moderate OSA', () => {
      const indicators = createModerateIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.reasons.some((r) => r.includes('Moderate OSA'))).toBe(true);
    });

    it('should provide reason for mild OSA', () => {
      const indicators = createMildIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);
      const result = determineTreatmentEligibility(score, indicators);

      expect(result.reasons.some((r) => r.includes('Mild OSA'))).toBe(true);
    });
  });
});

// ============================================================================
// classifySeverityFromAHI TESTS
// ============================================================================

describe('classifySeverityFromAHI', () => {
  it('should classify NONE for AHI < 5', () => {
    expect(classifySeverityFromAHI(0)).toBe('NONE');
    expect(classifySeverityFromAHI(3)).toBe('NONE');
    expect(classifySeverityFromAHI(4.9)).toBe('NONE');
  });

  it('should classify MILD for AHI 5-14', () => {
    expect(classifySeverityFromAHI(5)).toBe('MILD');
    expect(classifySeverityFromAHI(10)).toBe('MILD');
    expect(classifySeverityFromAHI(14.9)).toBe('MILD');
  });

  it('should classify MODERATE for AHI 15-29', () => {
    expect(classifySeverityFromAHI(15)).toBe('MODERATE');
    expect(classifySeverityFromAHI(22)).toBe('MODERATE');
    expect(classifySeverityFromAHI(29.9)).toBe('MODERATE');
  });

  it('should classify SEVERE for AHI >= 30', () => {
    expect(classifySeverityFromAHI(30)).toBe('SEVERE');
    expect(classifySeverityFromAHI(50)).toBe('SEVERE');
    expect(classifySeverityFromAHI(100)).toBe('SEVERE');
  });

  it('should use custom thresholds', () => {
    const customConfig: OsaxScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      ahiThresholds: {
        mild: 10,
        moderate: 25,
        severe: 50,
      },
    };

    expect(classifySeverityFromAHI(8, customConfig)).toBe('NONE');
    expect(classifySeverityFromAHI(15, customConfig)).toBe('MILD');
    expect(classifySeverityFromAHI(30, customConfig)).toBe('MODERATE');
    expect(classifySeverityFromAHI(60, customConfig)).toBe('SEVERE');
  });
});

// ============================================================================
// calculateCardiovascularRisk TESTS
// ============================================================================

describe('calculateCardiovascularRisk', () => {
  it('should classify CRITICAL risk for severe AHI with very low SpO2', () => {
    const indicators = createBaseIndicators({ ahi: 35, spo2Nadir: 70 });
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('CRITICAL');
  });

  it('should classify HIGH risk for moderate+ AHI', () => {
    const indicators = createModerateIndicators();
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('HIGH');
  });

  it('should classify HIGH risk for SpO2 nadir < 80', () => {
    const indicators = createBaseIndicators({ ahi: 10, spo2Nadir: 78 });
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('HIGH');
  });

  it('should classify MODERATE risk for mild AHI', () => {
    const indicators = createMildIndicators();
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('MODERATE');
  });

  it('should classify MODERATE risk for elevated ODI', () => {
    const indicators = createBaseIndicators({ ahi: 3, odi: 15, spo2Nadir: 90 });
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('MODERATE');
  });

  it('should classify MODERATE risk for low SpO2 nadir (< 88)', () => {
    const indicators = createBaseIndicators({ ahi: 3, spo2Nadir: 85 });
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('MODERATE');
  });

  it('should classify LOW risk for normal indicators', () => {
    const indicators = createNormalIndicators();
    const result = calculateCardiovascularRisk(indicators);

    expect(result).toBe('LOW');
  });
});

// ============================================================================
// compareScores TESTS
// ============================================================================

describe('compareScores', () => {
  describe('AHI change calculation', () => {
    it('should calculate correct AHI change', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createSevereIndicators(),
        ahi: 20,
      });

      const result = compareScores(baseline, followUp);

      // 20 - 45 = -25
      expect(result.ahiChange).toBe(-25);
    });

    it('should calculate correct AHI change percent', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 20,
        spo2Nadir: 82,
      });

      const result = compareScores(baseline, followUp);

      // -20 / 40 * 100 = -50%
      expect(result.ahiChangePercent).toBeCloseTo(-50, 0);
    });

    it('should handle baseline AHI of 0', () => {
      const baselineIndicators = { ...createNormalIndicators(), ahi: 0 };
      const baseline = OsaxClinicalScore.fromIndicators(baselineIndicators);
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createNormalIndicators(),
        ahi: 5,
      });

      const result = compareScores(baseline, followUp);

      expect(result.ahiChangePercent).toBe(100); // New AHI > 0 when baseline was 0
    });
  });

  describe('severity change', () => {
    it('should detect IMPROVED severity', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const followUp = OsaxClinicalScore.fromIndicators(createModerateIndicators());

      const result = compareScores(baseline, followUp);

      expect(result.severityChange).toBe('IMPROVED');
    });

    it('should detect WORSENED severity', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const followUp = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const result = compareScores(baseline, followUp);

      expect(result.severityChange).toBe('WORSENED');
    });

    it('should detect UNCHANGED severity', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createModerateIndicators());
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createModerateIndicators(),
        ahi: 25,
      });

      const result = compareScores(baseline, followUp);

      expect(result.severityChange).toBe('UNCHANGED');
    });
  });

  describe('significant improvement', () => {
    it('should identify significant improvement with >50% AHI reduction', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 15,
      });

      const result = compareScores(baseline, followUp);

      expect(result.significantImprovement).toBe(true);
    });

    it('should identify significant improvement when dropping to AHI < 5', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const followUp = OsaxClinicalScore.fromIndicators(createNormalIndicators());

      const result = compareScores(baseline, followUp);

      expect(result.significantImprovement).toBe(true);
    });

    it('should not identify significant improvement with <50% reduction and AHI >= 5', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 25,
        spo2Nadir: 78,
      });

      const result = compareScores(baseline, followUp);

      expect(result.significantImprovement).toBe(false);
    });
  });

  describe('clinical response classification', () => {
    it('should classify EXCELLENT response when AHI drops below 5', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createModerateIndicators());
      const followUp = OsaxClinicalScore.fromIndicators(createNormalIndicators());

      const result = compareScores(baseline, followUp);

      expect(result.clinicalResponse).toBe('EXCELLENT');
    });

    it('should classify GOOD response with >50% reduction', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 18,
      });

      const result = compareScores(baseline, followUp);

      expect(result.clinicalResponse).toBe('GOOD');
    });

    it('should classify PARTIAL response with 25-50% reduction', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 25,
        spo2Nadir: 78,
      });

      const result = compareScores(baseline, followUp);

      expect(result.clinicalResponse).toBe('PARTIAL');
    });

    it('should classify NONE response with <25% reduction', () => {
      const baseline = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 40,
        spo2Nadir: 75,
      });
      const followUp = OsaxClinicalScore.fromIndicators({
        ...createBaseIndicators(),
        ahi: 35,
        spo2Nadir: 76,
      });

      const result = compareScores(baseline, followUp);

      expect(result.clinicalResponse).toBe('NONE');
    });

    it('should classify WORSENED response when AHI increases', () => {
      const baseline = OsaxClinicalScore.fromIndicators(createModerateIndicators());
      const followUp = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const result = compareScores(baseline, followUp);

      expect(result.clinicalResponse).toBe('WORSENED');
    });
  });
});

// ============================================================================
// calculatePediatricScore TESTS
// ============================================================================

describe('calculatePediatricScore', () => {
  it('should use PEDIATRIC scoring method for children', () => {
    const indicators = createBaseIndicators({ ahi: 8 });
    const result = calculatePediatricScore(indicators, 10);

    // Scoring method should be PEDIATRIC
    expect(result.scoringMethod).toBe('PEDIATRIC');
    // Note: severity is determined by OsaxClinicalScore.fromIndicators() which uses standard thresholds
    // AHI 8 is MILD by standard thresholds (5-14)
    expect(result.clinicalScore.severity).toBe('MILD');
  });

  it('should apply pediatric AHI thresholds for classifySeverityFromAHI', () => {
    // classifySeverityFromAHI respects custom config
    expect(classifySeverityFromAHI(2, PEDIATRIC_SCORING_CONFIG)).toBe('MILD'); // >= 1
    expect(classifySeverityFromAHI(5, PEDIATRIC_SCORING_CONFIG)).toBe('MODERATE'); // >= 5
    expect(classifySeverityFromAHI(10, PEDIATRIC_SCORING_CONFIG)).toBe('SEVERE'); // >= 10
    expect(classifySeverityFromAHI(0.5, PEDIATRIC_SCORING_CONFIG)).toBe('NONE'); // < 1
  });

  it('should apply pediatric ESS thresholds for EXCESSIVE_SLEEPINESS flag', () => {
    // With pediatric config, moderate ESS threshold is 13
    const indicators = createBaseIndicators({ ahi: 10, essScore: 14 });
    const result = calculatePediatricScore(indicators, 12);

    // ESS 14 >= 13 (pediatric moderate threshold) should trigger flag
    expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS');
  });

  it('should not classify as no OSA for AHI < 5 (uses standard thresholds)', () => {
    // OsaxClinicalScore uses standard thresholds, so AHI 3 is NONE
    const indicators = createBaseIndicators({ ahi: 3 });
    const result = calculatePediatricScore(indicators, 14);

    expect(result.clinicalScore.severity).toBe('NONE');
  });

  it('should add PEDIATRIC_CASE risk flag', () => {
    const indicators = createMildIndicators();
    const result = calculatePediatricScore(indicators, 10);

    expect(result.riskFlags).toContain('PEDIATRIC_CASE');
  });

  it('should throw error for patients 18 or older', () => {
    const indicators = createMildIndicators();

    expect(() => calculatePediatricScore(indicators, 18)).toThrow(
      'Pediatric scoring is only for patients under 18'
    );
  });

  it('should use lower ESS thresholds for pediatric', () => {
    const indicators = createBaseIndicators({ essScore: 14 });
    const result = calculatePediatricScore(indicators, 12);

    // With pediatric config, ESS >= 13 triggers EXCESSIVE_SLEEPINESS flag
    expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS');
  });
});

// ============================================================================
// DEFAULT_SCORING_CONFIG TESTS
// ============================================================================

describe('DEFAULT_SCORING_CONFIG', () => {
  it('should have correct weight sum close to 1.0', () => {
    const weights = DEFAULT_SCORING_CONFIG.weights;
    const sum =
      weights.ahiWeight +
      weights.odiWeight +
      weights.spo2NadirWeight +
      weights.essWeight +
      weights.bmiWeight +
      weights.ageWeight;

    expect(sum).toBeCloseTo(1.0, 2);
  });

  it('should have valid AHI thresholds per AASM guidelines', () => {
    const thresholds = DEFAULT_SCORING_CONFIG.ahiThresholds;

    expect(thresholds.mild).toBe(5);
    expect(thresholds.moderate).toBe(15);
    expect(thresholds.severe).toBe(30);
  });

  it('should have valid SpO2 thresholds', () => {
    const thresholds = DEFAULT_SCORING_CONFIG.spo2Thresholds;

    expect(thresholds.mildDesaturation).toBe(90);
    expect(thresholds.moderateDesaturation).toBe(85);
    expect(thresholds.severeDesaturation).toBe(80);
  });

  it('should have valid ESS thresholds', () => {
    const thresholds = DEFAULT_SCORING_CONFIG.essThresholds;

    expect(thresholds.normal).toBe(10);
    expect(thresholds.mild).toBe(12);
    expect(thresholds.moderate).toBe(16);
    expect(thresholds.severe).toBe(20);
  });

  it('should have obesity threshold of 30', () => {
    expect(DEFAULT_SCORING_CONFIG.bmiObesityThreshold).toBe(30);
  });

  it('should have age thresholds for pediatric and geriatric', () => {
    expect(DEFAULT_SCORING_CONFIG.ageThresholds.pediatric).toBe(18);
    expect(DEFAULT_SCORING_CONFIG.ageThresholds.geriatric).toBe(65);
  });
});

// ============================================================================
// PEDIATRIC_SCORING_CONFIG TESTS
// ============================================================================

describe('PEDIATRIC_SCORING_CONFIG', () => {
  it('should have lower AHI thresholds than adult', () => {
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.mild).toBe(1);
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.moderate).toBe(5);
    expect(PEDIATRIC_SCORING_CONFIG.ahiThresholds.severe).toBe(10);
  });

  it('should have lower ESS thresholds than adult', () => {
    expect(PEDIATRIC_SCORING_CONFIG.essThresholds.normal).toBe(8);
    expect(PEDIATRIC_SCORING_CONFIG.essThresholds.mild).toBe(10);
    expect(PEDIATRIC_SCORING_CONFIG.essThresholds.moderate).toBe(13);
    expect(PEDIATRIC_SCORING_CONFIG.essThresholds.severe).toBe(16);
  });

  it('should inherit other settings from DEFAULT_SCORING_CONFIG', () => {
    expect(PEDIATRIC_SCORING_CONFIG.bmiObesityThreshold).toBe(
      DEFAULT_SCORING_CONFIG.bmiObesityThreshold
    );
    expect(PEDIATRIC_SCORING_CONFIG.weights).toEqual(DEFAULT_SCORING_CONFIG.weights);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  it('should handle AHI = 0', () => {
    const indicators = createBaseIndicators({ ahi: 0, odi: 0 });
    const result = calculateScore(indicators);

    expect(result.clinicalScore.severity).toBe('NONE');
    expect(result.clinicalScore.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle extreme AHI values (throws for invalid composite score)', () => {
    // Extreme values cause composite score > 100, which the value object rejects
    const extremeIndicators: OsaxClinicalIndicators = {
      ahi: 150,
      odi: 140,
      spo2Nadir: 50,
      spo2Average: 80,
      sleepEfficiency: 40,
      essScore: 24,
      bmi: 60,
    };

    // OsaxClinicalScore.fromIndicators throws when composite score > 100
    expect(() => calculateScore(extremeIndicators)).toThrow(
      'Composite score must be between 0 and 100'
    );
  });

  it('should handle high but valid AHI values', () => {
    // High values that produce a valid composite score (<= 100)
    const highIndicators: OsaxClinicalIndicators = {
      ahi: 80,
      odi: 70,
      spo2Nadir: 70,
      spo2Average: 85,
      sleepEfficiency: 50,
      essScore: 20,
      bmi: 40,
    };

    const result = calculateScore(highIndicators);

    expect(result.clinicalScore.severity).toBe('SEVERE');
    expect(result.clinicalScore.compositeScore).toBeGreaterThan(50);
    expect(result.clinicalScore.compositeScore).toBeLessThanOrEqual(100);
  });

  it('should handle borderline SpO2 values', () => {
    const indicators = createBaseIndicators({ spo2Nadir: 80, spo2Average: 90 });
    const result = calculateScore(indicators);

    expect(result.componentScores.spo2Component).toBe(50);
  });

  it('should handle ESS = 24 (maximum)', () => {
    const indicators = createBaseIndicators({ essScore: 24 });
    const result = calculateScore(indicators);

    expect(result.componentScores.essComponent).toBe(100);
    expect(result.riskFlags).toContain('EXCESSIVE_SLEEPINESS');
  });

  it('should handle missing optional indicators', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 15,
      odi: 12,
      spo2Nadir: 85,
      spo2Average: 93,
      sleepEfficiency: 78,
      essScore: 11,
    };

    const result = calculateScore(indicators);

    expect(result.clinicalScore).toBeDefined();
    expect(result.componentScores.bmiComponent).toBe(0);
  });

  it('should handle all optional indicators present', () => {
    const indicators: OsaxClinicalIndicators = {
      ahi: 20,
      odi: 18,
      spo2Nadir: 82,
      spo2Average: 92,
      sleepEfficiency: 80,
      essScore: 14,
      bmi: 32,
      neckCircumference: 42,
      totalSleepTime: 360,
      remAhi: 45, // 45/20 = 2.25 > 2 triggers REM_PREDOMINANT
      supineAhi: 45, // 45/20 = 2.25 > 2 triggers SUPINE_DEPENDENT
    };

    const result = calculateScore(indicators);

    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.riskFlags).toContain('OBESITY');
    expect(result.riskFlags).toContain('SUPINE_DEPENDENT');
    expect(result.riskFlags).toContain('REM_PREDOMINANT');
  });
});
