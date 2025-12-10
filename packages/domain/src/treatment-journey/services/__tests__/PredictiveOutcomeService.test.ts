/**
 * Tests for PredictiveOutcomeService
 *
 * Covers:
 * - Outcome prediction for various treatment types
 * - Risk modifier calculations
 * - Survival probability calculations
 * - Complication identification
 * - Recommendations generation
 * - Comparative outcomes
 */

import { describe, it, expect } from 'vitest';
import {
  predictOutcome,
  compareOutcomes,
  type PatientRiskProfile,
  type TreatmentParameters,
  type OutcomePrediction,
} from '../PredictiveOutcomeService.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createHealthyPatient(overrides: Partial<PatientRiskProfile> = {}): PatientRiskProfile {
  return {
    age: 45,
    gender: 'FEMALE',
    smokingStatus: 'NEVER',
    alcoholConsumption: 'MODERATE',
    oralHygieneScore: 8,
    diabetes: 'NONE',
    osteoporosis: false,
    immunocompromised: false,
    bisphosphonateHistory: false,
    radiationHistory: false,
    bruxism: false,
    periodontalStatus: 'HEALTHY',
    previousToothLoss: 0,
    pocketDepthMax: 3,
    boneQuality: 'D2',
    boneQuantity: 'ADEQUATE',
    appointmentAttendanceRate: 95,
    followsHomeInstructions: true,
    ...overrides,
  };
}

function createHighRiskPatient(): PatientRiskProfile {
  return {
    age: 68,
    gender: 'MALE',
    bmi: 32,
    smokingStatus: 'HEAVY',
    alcoholConsumption: 'HEAVY',
    oralHygieneScore: 3,
    diabetes: 'TYPE2_UNCONTROLLED',
    osteoporosis: true,
    immunocompromised: false,
    bisphosphonateHistory: false,
    radiationHistory: false,
    bruxism: true,
    periodontalStatus: 'SEVERE_PERIO',
    previousToothLoss: 12,
    pocketDepthMax: 8,
    boneQuality: 'D4',
    boneQuantity: 'DEFICIENT',
    appointmentAttendanceRate: 50,
    followsHomeInstructions: false,
  };
}

function createImplantTreatment(overrides: Partial<TreatmentParameters> = {}): TreatmentParameters {
  return {
    type: 'SINGLE_IMPLANT',
    location: 'MAXILLA',
    teethCount: 1,
    ...overrides,
  };
}

// ============================================================================
// OUTCOME PREDICTION TESTS
// ============================================================================

describe('predictOutcome', () => {
  describe('Basic Outcome Prediction', () => {
    it('should predict high success rate for healthy patient with single implant', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.overallSuccessRate).toBeGreaterThan(90);
      expect(prediction.confidenceInterval.low).toBeLessThan(prediction.overallSuccessRate);
      expect(prediction.confidenceInterval.high).toBeGreaterThan(prediction.overallSuccessRate);
    });

    it('should predict lower success rate for high-risk patient', () => {
      const patient = createHighRiskPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.overallSuccessRate).toBeLessThan(70);
    });

    it('should return valid prediction structure', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('SINGLE_IMPLANT');
      expect(prediction.modelVersion).toBeDefined();
      expect(prediction.calculatedAt).toBeInstanceOf(Date);
      expect(prediction.outcomes).toBeDefined();
      expect(prediction.survivalProbability).toBeDefined();
      expect(prediction.riskFactors).toBeDefined();
      expect(prediction.potentialComplications).toBeDefined();
    });
  });

  describe('Treatment Types', () => {
    it('should predict for ALL_ON_4 treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'ALL_ON_4',
        location: 'MAXILLA',
        teethCount: 4,
        immediateLoading: true,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('ALL_ON_4');
      expect(prediction.overallSuccessRate).toBeGreaterThan(85);
    });

    it('should predict for CROWN treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'CROWN',
        location: 'POSTERIOR',
        teethCount: 1,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('CROWN');
      expect(prediction.outcomes.osseointegrationSuccess).toBeUndefined(); // Not implant
    });

    it('should predict for BRIDGE treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'BRIDGE',
        location: 'ANTERIOR',
        teethCount: 3,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('BRIDGE');
    });

    it('should predict for VENEER treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'VENEER',
        location: 'ANTERIOR',
        teethCount: 6,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('VENEER');
    });

    it('should predict for ROOT_CANAL treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'ROOT_CANAL',
        location: 'POSTERIOR',
        teethCount: 1,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('ROOT_CANAL');
    });

    it('should predict for EXTRACTION treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'EXTRACTION',
        location: 'POSTERIOR',
        teethCount: 1,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.overallSuccessRate).toBeGreaterThan(95); // Extraction high success
    });

    it('should predict for BONE_GRAFT treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'BONE_GRAFT',
        location: 'MAXILLA',
        teethCount: 1,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('BONE_GRAFT');
    });

    it('should predict for SINUS_LIFT treatment', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'SINUS_LIFT',
        location: 'MAXILLA',
        teethCount: 2,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.treatmentType).toBe('SINUS_LIFT');
    });
  });

  describe('Risk Factors', () => {
    it('should identify smoking as negative risk factor', () => {
      const patient = createHealthyPatient({ smokingStatus: 'HEAVY' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const smokingFactor = prediction.riskFactors.find((f) => f.factor.includes('smoking'));
      expect(smokingFactor).toBeDefined();
      expect(smokingFactor?.impact).toBe('NEGATIVE');
      expect(smokingFactor?.modifiable).toBe(true);
      expect(smokingFactor?.recommendation).toBeDefined();
    });

    it('should identify non-smoker as positive factor', () => {
      const patient = createHealthyPatient({ smokingStatus: 'NEVER' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const nonSmokerFactor = prediction.riskFactors.find((f) => f.factor.includes('Non-smoker'));
      expect(nonSmokerFactor).toBeDefined();
      expect(nonSmokerFactor?.impact).toBe('POSITIVE');
    });

    it('should identify uncontrolled diabetes as high negative factor', () => {
      const patient = createHealthyPatient({ diabetes: 'TYPE2_UNCONTROLLED' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const diabetesFactor = prediction.riskFactors.find((f) =>
        f.factor.includes('Uncontrolled diabetes')
      );
      expect(diabetesFactor).toBeDefined();
      expect(diabetesFactor?.impact).toBe('NEGATIVE');
      expect(diabetesFactor?.magnitude).toBe('HIGH');
    });

    it('should identify poor oral hygiene as negative factor', () => {
      const patient = createHealthyPatient({ oralHygieneScore: 3 });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const hygieneFactor = prediction.riskFactors.find((f) =>
        f.factor.includes('Poor oral hygiene')
      );
      expect(hygieneFactor).toBeDefined();
      expect(hygieneFactor?.modifiable).toBe(true);
    });

    it('should identify excellent oral hygiene as positive factor', () => {
      const patient = createHealthyPatient({ oralHygieneScore: 9 });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const hygieneFactor = prediction.riskFactors.find((f) =>
        f.factor.includes('Excellent oral hygiene')
      );
      expect(hygieneFactor).toBeDefined();
      expect(hygieneFactor?.impact).toBe('POSITIVE');
    });

    it('should identify periodontal disease as risk factor', () => {
      const patient = createHealthyPatient({ periodontalStatus: 'SEVERE_PERIO' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const perioFactor = prediction.riskFactors.find((f) =>
        f.factor.includes('periodontal disease')
      );
      expect(perioFactor).toBeDefined();
    });

    it('should identify bone quality for implants', () => {
      const patient = createHealthyPatient({ boneQuality: 'D4' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const boneFactor = prediction.riskFactors.find((f) => f.factor.includes('bone density'));
      expect(boneFactor).toBeDefined();
      expect(boneFactor?.impact).toBe('NEGATIVE');
    });

    it('should identify bruxism as risk factor', () => {
      const patient = createHealthyPatient({ bruxism: true });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const bruxismFactor = prediction.riskFactors.find((f) => f.factor.includes('Bruxism'));
      expect(bruxismFactor).toBeDefined();
      expect(bruxismFactor?.recommendation).toContain('Night guard');
    });

    it('should identify bisphosphonate history', () => {
      const patient = createHealthyPatient({ bisphosphonateHistory: true });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const bisphoFactor = prediction.riskFactors.find((f) => f.factor.includes('Bisphosphonate'));
      expect(bisphoFactor).toBeDefined();
      expect(bisphoFactor?.magnitude).toBe('HIGH');
    });

    it('should identify old age as risk factor', () => {
      const patient = createHealthyPatient({ age: 80 });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const ageFactor = prediction.riskFactors.find((f) => f.factor.includes('Age over 75'));
      expect(ageFactor).toBeDefined();
    });

    it('should identify poor compliance as risk factor', () => {
      const patient = createHealthyPatient({ appointmentAttendanceRate: 50 });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const complianceFactor = prediction.riskFactors.find((f) => f.factor.includes('compliance'));
      expect(complianceFactor).toBeDefined();
    });
  });

  describe('Treatment-Specific Factors', () => {
    it('should factor in immediate loading', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment({ immediateLoading: true });

      const prediction = predictOutcome(patient, treatment);

      const loadingFactor = prediction.riskFactors.find((f) =>
        f.factor.includes('Immediate loading')
      );
      expect(loadingFactor).toBeDefined();
    });

    it('should factor in graft requirement', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment({ graftRequired: true });

      const prediction = predictOutcome(patient, treatment);

      const graftFactor = prediction.riskFactors.find((f) => f.factor.includes('Bone grafting'));
      expect(graftFactor).toBeDefined();
    });

    it('should factor in sinus lift requirement', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment({ sinusLiftRequired: true });

      const prediction = predictOutcome(patient, treatment);

      const sinusFactor = prediction.riskFactors.find((f) => f.factor.includes('Sinus lift'));
      expect(sinusFactor).toBeDefined();
    });
  });

  describe('Outcomes', () => {
    it('should include osseointegration success for implant treatments', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.outcomes.osseointegrationSuccess).toBeDefined();
      expect(prediction.outcomes.osseointegrationSuccess).toBeGreaterThan(0);
    });

    it('should not include osseointegration for non-implant treatments', () => {
      const patient = createHealthyPatient();
      const treatment: TreatmentParameters = {
        type: 'CROWN',
        location: 'POSTERIOR',
        teethCount: 1,
      };

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.outcomes.osseointegrationSuccess).toBeUndefined();
    });

    it('should include prosthetics success', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.outcomes.prostheticsSuccess).toBeDefined();
      expect(prediction.outcomes.prostheticsSuccess).toBeGreaterThan(0);
    });

    it('should include aesthetic satisfaction', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.outcomes.aestheticSatisfaction).toBeDefined();
    });

    it('should include functional restoration', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.outcomes.functionalRestoration).toBeDefined();
    });
  });

  describe('Survival Probability', () => {
    it('should include 1, 5, and 10 year survival rates', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.survivalProbability.oneYear).toBeDefined();
      expect(prediction.survivalProbability.fiveYear).toBeDefined();
      expect(prediction.survivalProbability.tenYear).toBeDefined();
    });

    it('should have decreasing survival over time', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.survivalProbability.oneYear).toBeGreaterThanOrEqual(
        prediction.survivalProbability.fiveYear
      );
      expect(prediction.survivalProbability.fiveYear).toBeGreaterThanOrEqual(
        prediction.survivalProbability.tenYear
      );
    });
  });

  describe('Complications', () => {
    it('should identify potential complications', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.potentialComplications.length).toBeGreaterThan(0);
    });

    it('should include complication details', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const firstComplication = prediction.potentialComplications[0];
      if (firstComplication) {
        expect(firstComplication.complication).toBeDefined();
        expect(firstComplication.probability).toBeDefined();
        expect(firstComplication.severity).toBeDefined();
        expect(firstComplication.timeframe).toBeDefined();
        expect(firstComplication.preventionStrategy).toBeDefined();
      }
    });

    it('should have higher complication risk for high-risk patients', () => {
      const healthyPatient = createHealthyPatient();
      const riskyPatient = createHighRiskPatient();
      const treatment = createImplantTreatment();

      const healthyPrediction = predictOutcome(healthyPatient, treatment);
      const riskyPrediction = predictOutcome(riskyPatient, treatment);

      // High-risk patient should have more or higher probability complications
      const healthyMaxProb = Math.max(
        ...healthyPrediction.potentialComplications.map((c) => c.probability)
      );
      const riskyMaxProb = Math.max(
        ...riskyPrediction.potentialComplications.map((c) => c.probability)
      );

      expect(riskyMaxProb).toBeGreaterThanOrEqual(healthyMaxProb);
    });
  });

  describe('Recommendations', () => {
    it('should include pre-operative recommendations', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.preOperativeRecommendations).toBeDefined();
      expect(prediction.preOperativeRecommendations.length).toBeGreaterThan(0);
    });

    it('should include post-operative recommendations', () => {
      const patient = createHealthyPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.postOperativeRecommendations).toBeDefined();
      expect(prediction.postOperativeRecommendations.length).toBeGreaterThan(0);
    });

    it('should include smoking cessation for smokers', () => {
      const patient = createHealthyPatient({ smokingStatus: 'HEAVY' });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      const hasSmokingRec =
        prediction.preOperativeRecommendations.some((r) => r.toLowerCase().includes('smok')) ||
        prediction.riskFactors.some((f) => f.factor.includes('smok') && f.recommendation);
      expect(hasSmokingRec).toBe(true);
    });
  });

  describe('Bounds and Edge Cases', () => {
    it('should clamp success rate between 30 and 99', () => {
      const patient = createHighRiskPatient();
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      expect(prediction.overallSuccessRate).toBeGreaterThanOrEqual(30);
      expect(prediction.overallSuccessRate).toBeLessThanOrEqual(99);
    });

    it('should handle young patient age', () => {
      const patient = createHealthyPatient({ age: 20 });
      const treatment = createImplantTreatment();

      const prediction = predictOutcome(patient, treatment);

      // May have slight reduction due to bone maturation
      expect(prediction.overallSuccessRate).toBeDefined();
    });
  });
});

// ============================================================================
// COMPARATIVE OUTCOMES TESTS
// ============================================================================

describe('compareOutcomes', () => {
  it('should compare multiple treatment options', () => {
    const patient = createHealthyPatient();
    const treatments: TreatmentParameters[] = [
      { type: 'SINGLE_IMPLANT', location: 'MAXILLA', teethCount: 1 },
      { type: 'BRIDGE', location: 'MAXILLA', teethCount: 3 },
      { type: 'DENTURE', location: 'MAXILLA', teethCount: 1 },
    ];

    const comparison = compareOutcomes(patient, treatments);

    expect(comparison.options.length).toBe(3);
    expect(comparison.recommendation).toBeDefined();
    expect(comparison.reasoning).toBeDefined();
  });

  it('should include success rates for each option', () => {
    const patient = createHealthyPatient();
    const treatments: TreatmentParameters[] = [
      { type: 'SINGLE_IMPLANT', location: 'POSTERIOR', teethCount: 1 },
      { type: 'CROWN', location: 'POSTERIOR', teethCount: 1 },
    ];

    const comparison = compareOutcomes(patient, treatments);

    for (const option of comparison.options) {
      expect(option.successRate).toBeGreaterThan(0);
      expect(option.costEffectiveness).toBeDefined();
      expect(option.qualityAdjustedYears).toBeDefined();
      expect(option.patientBurden).toBeDefined();
    }
  });

  it('should recommend an option based on combined score', () => {
    const patient = createHealthyPatient();
    const treatments: TreatmentParameters[] = [
      { type: 'SINGLE_IMPLANT', location: 'MAXILLA', teethCount: 1 },
      { type: 'DENTURE', location: 'MAXILLA', teethCount: 1 },
    ];

    const comparison = compareOutcomes(patient, treatments);

    // The algorithm considers success rate, cost-effectiveness, and QALYs
    // The recommended option should be one of the provided options
    const validRecommendations = ['SINGLE_IMPLANT', 'DENTURE'];
    expect(validRecommendations).toContain(comparison.recommendation);
    expect(comparison.reasoning).toContain(comparison.recommendation);
  });
});
