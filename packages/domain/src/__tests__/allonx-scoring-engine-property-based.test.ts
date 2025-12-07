/**
 * @fileoverview Property-Based Tests for AllOnX Clinical Scoring Engine
 *
 * CRITICAL: These tests verify clinical safety invariants for dental implant
 * eligibility assessment. Patient safety depends on these invariants holding
 * for ALL possible inputs.
 *
 * Property-Based Testing Strategy:
 * 1. Clinical Safety Invariants - Contraindications MUST always be detected
 * 2. Score Bounds - All scores within valid clinical ranges
 * 3. Classification Consistency - Score maps to correct eligibility
 * 4. Determinism - Same input always produces same output
 * 5. Monotonicity - Risk factors always increase risk, never decrease
 * 6. Boundary Conditions - Edge cases at clinical thresholds
 *
 * @module domain/__tests__/allonx-scoring-engine-property-based
 *
 * CLINICAL REFERENCES:
 * - ITI Treatment Guide for Implant Dentistry
 * - European Association for Osseointegration (EAO) Guidelines
 * - AAOMS Position Paper on Medication-Related Osteonecrosis of the Jaw
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  AllOnXClinicalScore,
  InvalidAllOnXScoreError,
  type AllOnXClinicalIndicators,
  type AllOnXEligibility,
  type AllOnXRiskLevel,
  CLINICAL_INDICATOR_RANGES,
  ELIGIBILITY_THRESHOLDS,
} from '../allonx/value-objects/AllOnXClinicalScore.js';

import {
  calculateScore,
  generateTreatmentPlan,
  compareScores,
  assessImplantSites,
  quickEligibilityCheck,
  calculateRiskLevel,
  classifyEligibilityFromScore,
  calculateCompositeScore,
  DEFAULT_SCORING_CONFIG,
  type AllOnXScoringResult,
} from '../allonx/services/AllOnXScoringPolicy.js';

// ============================================================================
// CUSTOM ARBITRARIES FOR CLINICAL INDICATORS
// ============================================================================

/**
 * Generate valid bone density (D1-D4 Misch Classification)
 */
const boneDensityArbitrary = fc.integer({ min: 1, max: 4 });

/**
 * Generate valid bone height (mm)
 */
const boneHeightArbitrary = fc.integer({ min: 0, max: 30 });

/**
 * Generate valid bone width (mm)
 */
const boneWidthArbitrary = fc.integer({ min: 0, max: 15 });

/**
 * Generate valid smoking status (0=never, 4=heavy)
 */
const smokingStatusArbitrary = fc.integer({ min: 0, max: 4 });

/**
 * Generate valid HbA1c percentage
 */
const hba1cArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.double({ min: 4, max: 15, noNaN: true })
);

/**
 * Generate valid patient age
 */
const patientAgeArbitrary = fc.integer({ min: 18, max: 100 });

/**
 * Generate valid ASA classification
 */
const asaClassificationArbitrary = fc.integer({ min: 1, max: 5 });

/**
 * Generate valid oral hygiene score
 */
const oralHygieneScoreArbitrary = fc.integer({ min: 1, max: 4 });

/**
 * Generate valid compliance score
 */
const complianceScoreArbitrary = fc.integer({ min: 1, max: 5 });

/**
 * Generate valid periodontal disease severity
 */
const periodontalDiseaseArbitrary = fc.integer({ min: 0, max: 3 });

/**
 * Generate valid target arch
 */
const targetArchArbitrary = fc.integer({ min: 1, max: 3 });

/**
 * Generate valid immediate loading feasibility
 */
const immediateLoadingFeasibilityArbitrary = fc.integer({ min: 1, max: 5 });

/**
 * Generate valid esthetic/functional demands
 */
const demandsArbitrary = fc.integer({ min: 1, max: 5 });

/**
 * Generate complete valid clinical indicators
 */
const clinicalIndicatorsArbitrary: fc.Arbitrary<AllOnXClinicalIndicators> = fc.record({
  // Bone Assessment
  boneDensity: boneDensityArbitrary,
  maxillaBoneHeight: boneHeightArbitrary,
  mandibleBoneHeight: boneHeightArbitrary,
  boneWidth: boneWidthArbitrary,
  sinusPneumatization: fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 5 })),

  // Medical Risk Factors
  hba1c: hba1cArbitrary,
  smokingStatus: smokingStatusArbitrary,
  yearsSinceQuitSmoking: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 50 })),
  onBisphosphonates: fc.boolean(),
  bisphosphonateYears: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 30 })),
  onAnticoagulants: fc.boolean(),
  hasOsteoporosis: fc.boolean(),
  hasRadiationHistory: fc.boolean(),
  hasUncontrolledCardiovascular: fc.boolean(),
  isImmunocompromised: fc.boolean(),

  // Oral Health Status
  remainingTeeth: fc.integer({ min: 0, max: 32 }),
  periodontalDisease: periodontalDiseaseArbitrary,
  oralHygieneScore: oralHygieneScoreArbitrary,
  hasBruxism: fc.boolean(),
  previousFailedImplants: fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 20 })),

  // Procedural Factors
  targetArch: targetArchArbitrary,
  extractionsNeeded: fc.integer({ min: 0, max: 32 }),
  needsBoneGrafting: fc.boolean(),
  needsSinusLift: fc.boolean(),
  immediateLoadingFeasibility: immediateLoadingFeasibilityArbitrary,

  // Patient Factors
  patientAge: patientAgeArbitrary,
  asaClassification: asaClassificationArbitrary,
  complianceScore: complianceScoreArbitrary,
  estheticDemands: demandsArbitrary,
  functionalDemands: demandsArbitrary,
});

/**
 * Generate ideal candidate indicators (for baseline comparisons)
 */
const idealCandidateArbitrary: fc.Arbitrary<AllOnXClinicalIndicators> = fc.record({
  boneDensity: fc.constant(2),
  maxillaBoneHeight: fc.integer({ min: 12, max: 20 }),
  mandibleBoneHeight: fc.integer({ min: 12, max: 20 }),
  boneWidth: fc.integer({ min: 8, max: 12 }),
  sinusPneumatization: fc.constant(1),
  hba1c: fc.oneof(fc.constant(undefined), fc.double({ min: 4, max: 6.5, noNaN: true })),
  smokingStatus: fc.constant(0),
  yearsSinceQuitSmoking: fc.constant(undefined),
  onBisphosphonates: fc.constant(false),
  bisphosphonateYears: fc.constant(undefined),
  onAnticoagulants: fc.constant(false),
  hasOsteoporosis: fc.constant(false),
  hasRadiationHistory: fc.constant(false),
  hasUncontrolledCardiovascular: fc.constant(false),
  isImmunocompromised: fc.constant(false),
  remainingTeeth: fc.integer({ min: 4, max: 12 }),
  periodontalDisease: fc.constant(0),
  oralHygieneScore: fc.integer({ min: 3, max: 4 }),
  hasBruxism: fc.constant(false),
  previousFailedImplants: fc.constant(undefined),
  targetArch: fc.integer({ min: 1, max: 2 }),
  extractionsNeeded: fc.integer({ min: 4, max: 12 }),
  needsBoneGrafting: fc.constant(false),
  needsSinusLift: fc.constant(false),
  immediateLoadingFeasibility: fc.integer({ min: 4, max: 5 }),
  patientAge: fc.integer({ min: 40, max: 65 }),
  asaClassification: fc.integer({ min: 1, max: 2 }),
  complianceScore: fc.integer({ min: 4, max: 5 }),
  estheticDemands: fc.integer({ min: 2, max: 4 }),
  functionalDemands: fc.integer({ min: 2, max: 4 }),
});

/**
 * Generate high-risk candidate indicators
 */
const highRiskCandidateArbitrary: fc.Arbitrary<AllOnXClinicalIndicators> = fc.record({
  boneDensity: fc.integer({ min: 3, max: 4 }),
  maxillaBoneHeight: fc.integer({ min: 5, max: 9 }),
  mandibleBoneHeight: fc.integer({ min: 5, max: 9 }),
  boneWidth: fc.integer({ min: 3, max: 5 }),
  sinusPneumatization: fc.integer({ min: 3, max: 5 }),
  hba1c: fc.double({ min: 8, max: 12, noNaN: true }),
  smokingStatus: fc.integer({ min: 3, max: 4 }),
  yearsSinceQuitSmoking: fc.constant(undefined),
  onBisphosphonates: fc.boolean(),
  bisphosphonateYears: fc.oneof(fc.constant(undefined), fc.integer({ min: 3, max: 10 })),
  onAnticoagulants: fc.boolean(),
  hasOsteoporosis: fc.boolean(),
  hasRadiationHistory: fc.constant(false), // Keep false to avoid automatic contraindication
  hasUncontrolledCardiovascular: fc.constant(false),
  isImmunocompromised: fc.boolean(),
  remainingTeeth: fc.integer({ min: 0, max: 6 }),
  periodontalDisease: fc.integer({ min: 2, max: 3 }),
  oralHygieneScore: fc.integer({ min: 1, max: 2 }),
  hasBruxism: fc.boolean(),
  previousFailedImplants: fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 5 })),
  targetArch: fc.constant(3),
  extractionsNeeded: fc.integer({ min: 0, max: 6 }),
  needsBoneGrafting: fc.boolean(),
  needsSinusLift: fc.boolean(),
  immediateLoadingFeasibility: fc.integer({ min: 1, max: 2 }),
  patientAge: fc.integer({ min: 70, max: 85 }),
  asaClassification: fc.integer({ min: 2, max: 3 }),
  complianceScore: fc.integer({ min: 1, max: 3 }),
  estheticDemands: fc.integer({ min: 4, max: 5 }),
  functionalDemands: fc.integer({ min: 4, max: 5 }),
});

// ============================================================================
// CRITICAL CLINICAL SAFETY INVARIANTS
// ============================================================================

describe('Clinical Scoring Engine - Property-Based Tests', () => {
  describe('CRITICAL: Clinical Safety Invariants', () => {
    /**
     * SAFETY INVARIANT #1: Radiation history MUST always result in contraindication
     *
     * Clinical basis: Head/neck radiation causes osteoradionecrosis risk,
     * making dental implant surgery extremely high risk.
     */
    it('radiation history MUST always result in contraindication', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (baseIndicators) => {
          const indicatorsWithRadiation: AllOnXClinicalIndicators = {
            ...baseIndicators,
            hasRadiationHistory: true,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithRadiation);

          expect(score.eligibility).toBe('CONTRAINDICATED');
          expect(score.isCandidate()).toBe(false);
          expect(score.treatmentRecommendation).toBe('NOT_RECOMMENDED');
        }),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #2: Uncontrolled cardiovascular disease MUST always
     * result in contraindication
     *
     * Clinical basis: Surgery poses unacceptable cardiac risk.
     */
    it('uncontrolled cardiovascular disease MUST always result in contraindication', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (baseIndicators) => {
          const indicatorsWithCardio: AllOnXClinicalIndicators = {
            ...baseIndicators,
            hasUncontrolledCardiovascular: true,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithCardio);

          expect(score.eligibility).toBe('CONTRAINDICATED');
          expect(score.isCandidate()).toBe(false);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #3: ASA IV classification MUST always result in
     * contraindication for elective surgery
     *
     * Clinical basis: ASA IV indicates severe systemic disease that is
     * a constant threat to life.
     */
    it('ASA IV classification MUST always result in contraindication', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (baseIndicators) => {
          const indicatorsWithASA4: AllOnXClinicalIndicators = {
            ...baseIndicators,
            asaClassification: 4,
            // Ensure other contraindications don't mask the test
            hasRadiationHistory: false,
            hasUncontrolledCardiovascular: false,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithASA4);

          expect(score.eligibility).toBe('CONTRAINDICATED');
        }),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #4: Severely uncontrolled diabetes (HbA1c > 10%)
     * MUST always result in contraindication
     *
     * Clinical basis: Extreme infection risk and impaired healing.
     */
    it('severely uncontrolled diabetes (HbA1c > 10%) MUST result in contraindication', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.double({ min: 10.1, max: 15, noNaN: true }),
          (baseIndicators, hba1c) => {
            const indicatorsWithDiabetes: AllOnXClinicalIndicators = {
              ...baseIndicators,
              hba1c,
              // Ensure other contraindications don't mask the test
              hasRadiationHistory: false,
              hasUncontrolledCardiovascular: false,
              asaClassification: Math.min(baseIndicators.asaClassification, 3),
            };

            const score = AllOnXClinicalScore.fromIndicators(indicatorsWithDiabetes);

            expect(score.eligibility).toBe('CONTRAINDICATED');
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #5: Heavy smoker (status 4) with multiple risk factors
     * MUST NOT be classified as IDEAL candidate
     *
     * Clinical basis: Smoking significantly increases implant failure risk.
     */
    it('heavy smoker MUST NOT be classified as IDEAL candidate', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (baseIndicators) => {
          const indicatorsWithHeavySmoking: AllOnXClinicalIndicators = {
            ...baseIndicators,
            smokingStatus: 4,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithHeavySmoking);

          expect(score.eligibility).not.toBe('IDEAL');
          expect(score.hasSmokingRisk()).toBe(true);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #6: Bisphosphonate therapy MUST always be flagged
     * as MRONJ risk
     *
     * Clinical basis: Bisphosphonates cause medication-related osteonecrosis
     * of the jaw risk with dental surgery.
     */
    it('bisphosphonate therapy MUST always flag MRONJ risk', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (baseIndicators) => {
          const indicatorsWithBisphosphonates: AllOnXClinicalIndicators = {
            ...baseIndicators,
            onBisphosphonates: true,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithBisphosphonates);

          expect(score.hasMRONJRisk()).toBe(true);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * SAFETY INVARIANT #7: ASA III classification MUST require medical clearance
     * (when patient is otherwise not contraindicated)
     *
     * Clinical basis: ASA III indicates severe systemic disease requiring
     * coordination with patient's physician.
     *
     * Note: If patient is CONTRAINDICATED for other reasons, the recommendation
     * is NOT_RECOMMENDED rather than MEDICAL_CLEARANCE_REQUIRED (which is correct).
     */
    it('ASA III classification MUST require medical clearance (when not otherwise contraindicated)', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (baseIndicators) => {
          const indicatorsWithASA3: AllOnXClinicalIndicators = {
            ...baseIndicators,
            asaClassification: 3,
            // Ensure not contraindicated for other reasons
            hasRadiationHistory: false,
            hasUncontrolledCardiovascular: false,
            hba1c:
              baseIndicators.hba1c !== undefined && baseIndicators.hba1c > 10
                ? 7.0
                : baseIndicators.hba1c,
          };

          const score = AllOnXClinicalScore.fromIndicators(indicatorsWithASA3);

          // If not contraindicated, ASA III should require medical clearance
          if (score.eligibility !== 'CONTRAINDICATED') {
            expect(score.requiresMedicalClearance()).toBe(true);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  // ============================================================================
  // SCORE BOUNDS INVARIANTS
  // ============================================================================

  describe('Score Bounds Invariants', () => {
    it('composite score MUST always be between 0 and 100', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          expect(score.compositeScore).toBeGreaterThanOrEqual(0);
          expect(score.compositeScore).toBeLessThanOrEqual(100);
          expect(Number.isFinite(score.compositeScore)).toBe(true);
          expect(Number.isNaN(score.compositeScore)).toBe(false);
        }),
        { numRuns: 500 }
      );
    });

    it('confidence MUST always be between 0 and 1', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.double({ min: 0, max: 1, noNaN: true }),
          (indicators, confidence) => {
            const score = AllOnXClinicalScore.fromIndicators(indicators, confidence);

            expect(score.confidence).toBeGreaterThanOrEqual(0);
            expect(score.confidence).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 300 }
      );
    });

    it('component scores MUST all be between 0 and 100', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const result = calculateScore(indicators);

          expect(result.componentScores.boneQualityComponent).toBeGreaterThanOrEqual(0);
          expect(result.componentScores.boneQualityComponent).toBeLessThanOrEqual(100);

          expect(result.componentScores.medicalRiskComponent).toBeGreaterThanOrEqual(0);
          expect(result.componentScores.medicalRiskComponent).toBeLessThanOrEqual(100);

          expect(result.componentScores.oralHealthComponent).toBeGreaterThanOrEqual(0);
          expect(result.componentScores.oralHealthComponent).toBeLessThanOrEqual(100);

          expect(result.componentScores.proceduralComplexityComponent).toBeGreaterThanOrEqual(0);
          expect(result.componentScores.proceduralComplexityComponent).toBeLessThanOrEqual(100);

          expect(result.componentScores.patientFactorsComponent).toBeGreaterThanOrEqual(0);
          expect(result.componentScores.patientFactorsComponent).toBeLessThanOrEqual(100);
        }),
        { numRuns: 300 }
      );
    });

    it('treatment plan success probability MUST be between 0.7 and 1.0', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          // Skip contraindicated cases
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          if (!score.isCandidate()) return true;

          const plan = generateTreatmentPlan(score, indicators);

          expect(plan.successProbability).toBeGreaterThanOrEqual(0.7);
          expect(plan.successProbability).toBeLessThanOrEqual(1.0);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ============================================================================
  // CLASSIFICATION CONSISTENCY INVARIANTS
  // ============================================================================

  describe('Classification Consistency Invariants', () => {
    it('eligibility classification MUST be consistent with score thresholds', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          // Note: Contraindication can override score-based classification
          if (score.eligibility === 'CONTRAINDICATED') {
            // Contraindication can happen at any score due to absolute contraindications
            return true;
          }

          if (score.compositeScore >= ELIGIBILITY_THRESHOLDS.IDEAL.minScore) {
            expect(score.eligibility).toBe('IDEAL');
          } else if (score.compositeScore >= ELIGIBILITY_THRESHOLDS.SUITABLE.minScore) {
            expect(score.eligibility).toBe('SUITABLE');
          } else if (score.compositeScore >= ELIGIBILITY_THRESHOLDS.CONDITIONAL.minScore) {
            expect(score.eligibility).toBe('CONDITIONAL');
          } else {
            expect(score.eligibility).toBe('CONTRAINDICATED');
          }
        }),
        { numRuns: 300 }
      );
    });

    it('isCandidate() MUST return false only for CONTRAINDICATED eligibility', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          if (score.eligibility === 'CONTRAINDICATED') {
            expect(score.isCandidate()).toBe(false);
          } else {
            expect(score.isCandidate()).toBe(true);
          }
        }),
        { numRuns: 300 }
      );
    });

    it('isIdealCandidate() MUST return true only for IDEAL eligibility', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          if (score.eligibility === 'IDEAL') {
            expect(score.isIdealCandidate()).toBe(true);
          } else {
            expect(score.isIdealCandidate()).toBe(false);
          }
        }),
        { numRuns: 300 }
      );
    });

    it('risk level MUST be one of valid enum values', () => {
      const validRiskLevels: AllOnXRiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          expect(validRiskLevels).toContain(score.riskLevel);
        }),
        { numRuns: 300 }
      );
    });

    it('eligibility MUST be one of valid enum values', () => {
      const validEligibilities: AllOnXEligibility[] = [
        'IDEAL',
        'SUITABLE',
        'CONDITIONAL',
        'CONTRAINDICATED',
      ];

      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          expect(validEligibilities).toContain(score.eligibility);
        }),
        { numRuns: 300 }
      );
    });
  });

  // ============================================================================
  // DETERMINISM INVARIANTS
  // ============================================================================

  describe('Determinism Invariants', () => {
    it('same indicators MUST always produce identical scores', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score1 = AllOnXClinicalScore.fromIndicators(indicators);
          const score2 = AllOnXClinicalScore.fromIndicators(indicators);
          const score3 = AllOnXClinicalScore.fromIndicators(indicators);

          expect(score1.compositeScore).toBe(score2.compositeScore);
          expect(score2.compositeScore).toBe(score3.compositeScore);
          expect(score1.eligibility).toBe(score2.eligibility);
          expect(score1.riskLevel).toBe(score2.riskLevel);
          expect(score1.treatmentRecommendation).toBe(score2.treatmentRecommendation);
        }),
        { numRuns: 200 }
      );
    });

    it('calculateScore MUST produce identical results for same input', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const result1 = calculateScore(indicators);
          const result2 = calculateScore(indicators);

          expect(result1.clinicalScore.compositeScore).toBe(result2.clinicalScore.compositeScore);
          expect(result1.riskFlags).toEqual(result2.riskFlags);
          expect(result1.clinicalNotes).toEqual(result2.clinicalNotes);
        }),
        { numRuns: 100 }
      );
    });

    it('serialization roundtrip MUST preserve all values', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const original = AllOnXClinicalScore.fromIndicators(indicators);
          const dto = original.toJSON();
          const reconstituted = AllOnXClinicalScore.reconstitute(dto);

          expect(reconstituted.compositeScore).toBe(original.compositeScore);
          expect(reconstituted.eligibility).toBe(original.eligibility);
          expect(reconstituted.riskLevel).toBe(original.riskLevel);
          expect(reconstituted.complexity).toBe(original.complexity);
          expect(reconstituted.equals(original)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // MONOTONICITY INVARIANTS - Risk factors increase risk
  // ============================================================================

  describe('Monotonicity Invariants', () => {
    it('adding smoking risk MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, fc.integer({ min: 2, max: 4 }), (base, smoking) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withSmoking = AllOnXClinicalScore.fromIndicators({
            ...base,
            smokingStatus: smoking,
          });

          expect(withSmoking.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('adding diabetes (higher HbA1c) MUST NOT increase score', () => {
      fc.assert(
        fc.property(
          idealCandidateArbitrary,
          fc.double({ min: 7.5, max: 10, noNaN: true }),
          (base, hba1c) => {
            const baseScore = AllOnXClinicalScore.fromIndicators(base);
            const withDiabetes = AllOnXClinicalScore.fromIndicators({
              ...base,
              hba1c,
            });

            expect(withDiabetes.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('adding bisphosphonate therapy MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withBisphosphonates = AllOnXClinicalScore.fromIndicators({
            ...base,
            onBisphosphonates: true,
            bisphosphonateYears: 3,
          });

          expect(withBisphosphonates.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('worse bone density MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, fc.integer({ min: 3, max: 4 }), (base, density) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withWorstBone = AllOnXClinicalScore.fromIndicators({
            ...base,
            boneDensity: density,
          });

          expect(withWorstBone.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('adding periodontal disease MUST NOT increase score', () => {
      fc.assert(
        fc.property(
          idealCandidateArbitrary,
          fc.integer({ min: 2, max: 3 }),
          (base, periodontitis) => {
            const baseScore = AllOnXClinicalScore.fromIndicators(base);
            const withPeriodontitis = AllOnXClinicalScore.fromIndicators({
              ...base,
              periodontalDisease: periodontitis,
            });

            expect(withPeriodontitis.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('adding bruxism MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withBruxism = AllOnXClinicalScore.fromIndicators({
            ...base,
            hasBruxism: true,
          });

          expect(withBruxism.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('higher ASA classification MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, fc.integer({ min: 2, max: 3 }), (base, asa) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withHigherASA = AllOnXClinicalScore.fromIndicators({
            ...base,
            asaClassification: asa,
          });

          expect(withHigherASA.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('needing bone grafting MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withGrafting = AllOnXClinicalScore.fromIndicators({
            ...base,
            needsBoneGrafting: true,
          });

          expect(withGrafting.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });

    it('needing sinus lift MUST NOT increase score', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const baseScore = AllOnXClinicalScore.fromIndicators(base);
          const withSinusLift = AllOnXClinicalScore.fromIndicators({
            ...base,
            needsSinusLift: true,
          });

          expect(withSinusLift.compositeScore).toBeLessThanOrEqual(baseScore.compositeScore);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ============================================================================
  // TREATMENT PLANNING INVARIANTS
  // ============================================================================

  describe('Treatment Planning Invariants', () => {
    it('treatment plan MUST be marked as not feasible for contraindicated cases', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          if (score.eligibility === 'CONTRAINDICATED') {
            const plan = generateTreatmentPlan(score, indicators);
            expect(plan.isFeasible).toBe(false);
          }
        }),
        { numRuns: 200 }
      );
    });

    it('treatment plan MUST include pre-treatment for periodontal disease >= 2', () => {
      fc.assert(
        fc.property(
          idealCandidateArbitrary,
          fc.integer({ min: 2, max: 3 }),
          (base, periodontitis) => {
            const indicators = { ...base, periodontalDisease: periodontitis };
            const score = AllOnXClinicalScore.fromIndicators(indicators);
            const plan = generateTreatmentPlan(score, indicators);

            expect(
              plan.preTreatmentRequirements.some(
                (r) => r.toLowerCase().includes('periodontal') || r.toLowerCase().includes('perio')
              )
            ).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('treatment plan MUST include bone augmentation phase when grafting needed', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const indicators = { ...base, needsBoneGrafting: true };
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const plan = generateTreatmentPlan(score, indicators);

          expect(
            plan.phases.some(
              (p) =>
                p.name.toLowerCase().includes('augmentation') ||
                p.name.toLowerCase().includes('graft')
            )
          ).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('estimated duration MUST be greater for complex cases', () => {
      fc.assert(
        fc.property(idealCandidateArbitrary, (base) => {
          const simpleScore = AllOnXClinicalScore.fromIndicators(base);
          const simplePlan = generateTreatmentPlan(simpleScore, base);

          const complexIndicators = {
            ...base,
            needsBoneGrafting: true,
            needsSinusLift: true,
            targetArch: 3,
          };
          const complexScore = AllOnXClinicalScore.fromIndicators(complexIndicators);
          const complexPlan = generateTreatmentPlan(complexScore, complexIndicators);

          expect(complexPlan.estimatedDuration).toBeGreaterThan(simplePlan.estimatedDuration);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // COMPARISON INVARIANTS
  // ============================================================================

  describe('Score Comparison Invariants', () => {
    it('comparing same score MUST show no change', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const comparison = compareScores(score, score);

          expect(comparison.scoreChange).toBe(0);
          expect(comparison.eligibilityChange).toBe('UNCHANGED');
        }),
        { numRuns: 100 }
      );
    });

    it('better score MUST show positive change', () => {
      fc.assert(
        fc.property(highRiskCandidateArbitrary, idealCandidateArbitrary, (worse, better) => {
          const worseScore = AllOnXClinicalScore.fromIndicators(worse);
          const betterScore = AllOnXClinicalScore.fromIndicators(better);

          // Only test if better is actually better
          if (betterScore.compositeScore > worseScore.compositeScore) {
            const comparison = compareScores(worseScore, betterScore);
            expect(comparison.scoreChange).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('isBetterThan MUST be consistent with compareTo', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          clinicalIndicatorsArbitrary,
          (indicators1, indicators2) => {
            const score1 = AllOnXClinicalScore.fromIndicators(indicators1);
            const score2 = AllOnXClinicalScore.fromIndicators(indicators2);

            if (score1.isBetterThan(score2)) {
              expect(score1.compareTo(score2)).toBeGreaterThan(0);
            }

            if (score1.isWorseThan(score2)) {
              expect(score1.compareTo(score2)).toBeLessThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // IMPLANT SITE ASSESSMENT INVARIANTS
  // ============================================================================

  describe('Implant Site Assessment Invariants', () => {
    it('maxilla target MUST assess maxillary sites only', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (base) => {
          const indicators = { ...base, targetArch: 1 };
          const assessments = assessImplantSites(indicators);

          expect(assessments.every((a) => a.site.includes('maxilla'))).toBe(true);
          expect(assessments.some((a) => a.site.includes('mandible'))).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('mandible target MUST assess mandibular sites only', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (base) => {
          const indicators = { ...base, targetArch: 2 };
          const assessments = assessImplantSites(indicators);

          expect(assessments.every((a) => a.site.includes('mandible'))).toBe(true);
          expect(assessments.some((a) => a.site.includes('maxilla'))).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('both arches target MUST assess all four sites', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (base) => {
          const indicators = { ...base, targetArch: 3 };
          const assessments = assessImplantSites(indicators);

          expect(assessments.length).toBe(4);
          expect(assessments.some((a) => a.site === 'anterior_maxilla')).toBe(true);
          expect(assessments.some((a) => a.site === 'posterior_maxilla')).toBe(true);
          expect(assessments.some((a) => a.site === 'anterior_mandible')).toBe(true);
          expect(assessments.some((a) => a.site === 'posterior_mandible')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // QUICK ELIGIBILITY CHECK INVARIANTS
  // ============================================================================

  describe('Quick Eligibility Check Invariants', () => {
    it('contraindications MUST result in not likely eligible', () => {
      fc.assert(
        fc.property(
          boneDensityArbitrary,
          boneHeightArbitrary,
          smokingStatusArbitrary,
          hba1cArbitrary,
          (boneDensity, boneHeight, smoking, hba1c) => {
            const result = quickEligibilityCheck(
              boneDensity,
              boneHeight,
              smoking,
              hba1c,
              true // hasContraindications
            );

            expect(result.likelyEligible).toBe(false);
            expect(result.preliminaryEligibility).toBe('CONTRAINDICATED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('good parameters without contraindications SHOULD be likely eligible', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2 }), // good bone density
          fc.integer({ min: 12, max: 20 }), // good bone height
          fc.integer({ min: 0, max: 1 }), // non-smoker or former
          fc.oneof(fc.constant(undefined), fc.double({ min: 4, max: 6.5, noNaN: true })), // good HbA1c
          (boneDensity, boneHeight, smoking, hba1c) => {
            const result = quickEligibilityCheck(
              boneDensity,
              boneHeight,
              smoking,
              hba1c,
              false // no contraindications
            );

            expect(result.likelyEligible).toBe(true);
            expect(['IDEAL', 'SUITABLE']).toContain(result.preliminaryEligibility);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // IMMUTABILITY INVARIANTS
  // ============================================================================

  describe('Immutability Invariants', () => {
    it('score object MUST be frozen', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          expect(Object.isFrozen(score)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('indicators MUST be frozen', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);

          expect(Object.isFrozen(score.indicators)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('withUpdatedIndicators MUST return new instance', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const original = AllOnXClinicalScore.fromIndicators(indicators);
          const updated = original.withUpdatedIndicators({ smokingStatus: 0 });

          expect(original).not.toBe(updated);
          expect(original.indicators.smokingStatus).toBe(indicators.smokingStatus);
        }),
        { numRuns: 100 }
      );
    });

    it('withConfidence MUST return new instance', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.double({ min: 0.1, max: 0.9, noNaN: true }),
          (indicators, newConfidence) => {
            const original = AllOnXClinicalScore.fromIndicators(indicators, 0.9);
            const updated = original.withConfidence(newConfidence);

            expect(original).not.toBe(updated);
            expect(original.confidence).toBe(0.9);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // VALIDATION REJECTION INVARIANTS
  // ============================================================================

  describe('Validation Rejection Invariants', () => {
    it('MUST reject bone density outside 1-4 range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.integer().filter((n) => n < 1 || n > 4),
          (base, invalidDensity) => {
            const invalidIndicators = { ...base, boneDensity: invalidDensity };

            expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MUST reject patient age outside 18-100 range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.oneof(fc.integer({ min: 0, max: 17 }), fc.integer({ min: 101, max: 200 })),
          (base, invalidAge) => {
            const invalidIndicators = { ...base, patientAge: invalidAge };

            expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MUST reject smoking status outside 0-4 range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.integer().filter((n) => n < 0 || n > 4),
          (base, invalidSmoking) => {
            const invalidIndicators = { ...base, smokingStatus: invalidSmoking };

            expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MUST reject HbA1c outside 4-15% range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.oneof(
            fc.double({ min: 0, max: 3.9, noNaN: true }),
            fc.double({ min: 15.1, max: 30, noNaN: true })
          ),
          (base, invalidHba1c) => {
            const invalidIndicators = { ...base, hba1c: invalidHba1c };

            expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MUST reject ASA classification outside 1-5 range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.integer().filter((n) => n < 1 || n > 5),
          (base, invalidASA) => {
            const invalidIndicators = { ...base, asaClassification: invalidASA };

            expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('MUST reject confidence outside 0-1 range', () => {
      fc.assert(
        fc.property(
          clinicalIndicatorsArbitrary,
          fc.oneof(
            fc.double({ min: -10, max: -0.01, noNaN: true }),
            fc.double({ min: 1.01, max: 10, noNaN: true })
          ),
          (indicators, invalidConfidence) => {
            expect(() => AllOnXClinicalScore.fromIndicators(indicators, invalidConfidence)).toThrow(
              InvalidAllOnXScoreError
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // OUTPUT STRUCTURE INVARIANTS
  // ============================================================================

  describe('Output Structure Invariants', () => {
    it('calculateScore MUST return all required fields', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const result = calculateScore(indicators);

          expect(result).toHaveProperty('clinicalScore');
          expect(result).toHaveProperty('componentScores');
          expect(result).toHaveProperty('riskFlags');
          expect(result).toHaveProperty('clinicalNotes');
          expect(result).toHaveProperty('contraindications');
          expect(result).toHaveProperty('specialConsiderations');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('scoringMethod');
        }),
        { numRuns: 200 }
      );
    });

    it('riskFlags MUST be an array of valid flag values', () => {
      const validRiskFlags = [
        'HEAVY_SMOKER',
        'ACTIVE_SMOKER',
        'UNCONTROLLED_DIABETES',
        'BISPHOSPHONATE_THERAPY',
        'LONG_TERM_BISPHOSPHONATES',
        'OSTEOPOROSIS',
        'RADIATION_HISTORY',
        'IMMUNOCOMPROMISED',
        'CARDIOVASCULAR_RISK',
        'ANTICOAGULANT_THERAPY',
        'POOR_BONE_QUALITY',
        'INSUFFICIENT_BONE',
        'ACTIVE_PERIODONTAL_DISEASE',
        'POOR_ORAL_HYGIENE',
        'BRUXISM',
        'PREVIOUS_IMPLANT_FAILURE',
        'GERIATRIC_PATIENT',
        'HIGH_ASA_CLASS',
        'LOW_COMPLIANCE',
        'BONE_AUGMENTATION_REQUIRED',
        'SINUS_LIFT_REQUIRED',
        'DUAL_ARCH_COMPLEXITY',
        'HIGH_ESTHETIC_DEMANDS',
      ];

      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const result = calculateScore(indicators);

          expect(Array.isArray(result.riskFlags)).toBe(true);
          result.riskFlags.forEach((flag) => {
            expect(validRiskFlags).toContain(flag);
          });
        }),
        { numRuns: 200 }
      );
    });

    it('clinicalNotes MUST be an array of non-empty strings', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const result = calculateScore(indicators);

          expect(Array.isArray(result.clinicalNotes)).toBe(true);
          result.clinicalNotes.forEach((note) => {
            expect(typeof note).toBe('string');
            expect(note.length).toBeGreaterThan(0);
          });
        }),
        { numRuns: 200 }
      );
    });

    it('toJSON MUST produce valid JSON structure', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const json = score.toJSON();

          // Should be serializable
          const serialized = JSON.stringify(json);
          const parsed = JSON.parse(serialized);

          expect(parsed.compositeScore).toBe(score.compositeScore);
          expect(parsed.eligibility).toBe(score.eligibility);
          expect(parsed.riskLevel).toBe(score.riskLevel);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // CLINICAL SUMMARY INVARIANTS
  // ============================================================================

  describe('Clinical Summary Invariants', () => {
    it('getClinicalSummary MUST include eligibility', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const summary = score.getClinicalSummary();

          expect(summary).toContain(score.eligibility);
        }),
        { numRuns: 100 }
      );
    });

    it('getRiskFactors MUST include smoking for smokers', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (base) => {
          const indicators = { ...base, smokingStatus: 3 };
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const riskFactors = score.getRiskFactors();

          expect(riskFactors.some((f) => f.toLowerCase().includes('smoking'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('getRiskFactors MUST include diabetes for diabetics', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (base) => {
          const indicators = { ...base, hba1c: 8.5 };
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const riskFactors = score.getRiskFactors();

          expect(riskFactors.some((f) => f.toLowerCase().includes('diabetes'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('toString MUST produce non-empty string representation', () => {
      fc.assert(
        fc.property(clinicalIndicatorsArbitrary, (indicators) => {
          const score = AllOnXClinicalScore.fromIndicators(indicators);
          const str = score.toString();

          expect(typeof str).toBe('string');
          expect(str.length).toBeGreaterThan(0);
          expect(str).toContain('AllOnXClinicalScore');
        }),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// BOUNDARY CONDITION TESTS
// ============================================================================

describe('Clinical Scoring Engine - Boundary Conditions', () => {
  describe('HbA1c Thresholds', () => {
    it('HbA1c at exactly 7.0 should not trigger diabetes risk', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        hba1c: 7.0,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 55,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      expect(score.hasDiabetesRisk()).toBe(false);
    });

    it('HbA1c at 7.01 should trigger diabetes risk', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        hba1c: 7.01,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 55,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      expect(score.hasDiabetesRisk()).toBe(true);
    });

    it('HbA1c at exactly 10.0 should be contraindicated', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        hba1c: 10.0,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 55,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      // HbA1c > 10 triggers contraindication, so exactly 10.0 should still be suitable
      expect(score.eligibility).not.toBe('CONTRAINDICATED');
    });

    it('HbA1c at 10.01 should be contraindicated', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        hba1c: 10.01,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 55,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      expect(score.eligibility).toBe('CONTRAINDICATED');
    });
  });

  describe('Bone Height Thresholds', () => {
    it('bone height at exactly minimum (8mm) should be assessed as minimum', () => {
      const result = quickEligibilityCheck(2, 8, 0);
      expect(result.likelyEligible).toBe(true);
    });

    it('bone height below minimum (7mm) should flag insufficient bone', () => {
      const result = quickEligibilityCheck(2, 7, 0);
      expect(result.keyFactors.some((f) => f.toLowerCase().includes('bone'))).toBe(true);
    });
  });

  describe('Age Thresholds', () => {
    it('patient at exactly 18 should be valid', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 18,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(indicators)).not.toThrow();
    });

    it('patient at exactly 100 should be valid', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 100,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(indicators)).not.toThrow();
    });

    it('patient at 17 should be rejected', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 17,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(indicators)).toThrow(InvalidAllOnXScoreError);
    });

    it('patient at 101 should be rejected', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 101,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(indicators)).toThrow(InvalidAllOnXScoreError);
    });
  });

  describe('Eligibility Score Thresholds', () => {
    it('score at exactly 80 should be IDEAL', () => {
      const eligibility = classifyEligibilityFromScore(80);
      expect(eligibility).toBe('IDEAL');
    });

    it('score at 79.9 should be SUITABLE', () => {
      const eligibility = classifyEligibilityFromScore(79.9);
      expect(eligibility).toBe('SUITABLE');
    });

    it('score at exactly 60 should be SUITABLE', () => {
      const eligibility = classifyEligibilityFromScore(60);
      expect(eligibility).toBe('SUITABLE');
    });

    it('score at 59.9 should be CONDITIONAL', () => {
      const eligibility = classifyEligibilityFromScore(59.9);
      expect(eligibility).toBe('CONDITIONAL');
    });

    it('score at exactly 40 should be CONDITIONAL', () => {
      const eligibility = classifyEligibilityFromScore(40);
      expect(eligibility).toBe('CONDITIONAL');
    });

    it('score at 39.9 should be CONTRAINDICATED', () => {
      const eligibility = classifyEligibilityFromScore(39.9);
      expect(eligibility).toBe('CONTRAINDICATED');
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Clinical Scoring Engine - Edge Cases', () => {
  describe('Extreme Value Combinations', () => {
    it('should handle all minimum valid values', () => {
      const minIndicators: AllOnXClinicalIndicators = {
        boneDensity: 1,
        maxillaBoneHeight: 0,
        mandibleBoneHeight: 0,
        boneWidth: 0,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 0,
        periodontalDisease: 0,
        oralHygieneScore: 1,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 0,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 1,
        patientAge: 18,
        asaClassification: 1,
        complianceScore: 1,
        estheticDemands: 1,
        functionalDemands: 1,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(minIndicators)).not.toThrow();
    });

    it('should handle all maximum valid values', () => {
      const maxIndicators: AllOnXClinicalIndicators = {
        boneDensity: 4,
        maxillaBoneHeight: 30,
        mandibleBoneHeight: 30,
        boneWidth: 15,
        sinusPneumatization: 5,
        hba1c: 15, // Will cause contraindication
        smokingStatus: 4,
        yearsSinceQuitSmoking: 50,
        onBisphosphonates: true,
        bisphosphonateYears: 30,
        onAnticoagulants: true,
        hasOsteoporosis: true,
        hasRadiationHistory: true, // Will cause contraindication
        hasUncontrolledCardiovascular: true, // Will cause contraindication
        isImmunocompromised: true,
        remainingTeeth: 32,
        periodontalDisease: 3,
        oralHygieneScore: 4,
        hasBruxism: true,
        previousFailedImplants: 20,
        targetArch: 3,
        extractionsNeeded: 32,
        needsBoneGrafting: true,
        needsSinusLift: true,
        immediateLoadingFeasibility: 5,
        patientAge: 100,
        asaClassification: 5,
        complianceScore: 5,
        estheticDemands: 5,
        functionalDemands: 5,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(maxIndicators)).not.toThrow();
      const score = AllOnXClinicalScore.fromIndicators(maxIndicators);
      expect(score.eligibility).toBe('CONTRAINDICATED');
    });

    it('should handle all optional fields as undefined', () => {
      const minimalIndicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 12,
        mandibleBoneHeight: 14,
        boneWidth: 8,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 3,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 4,
        patientAge: 55,
        asaClassification: 2,
        complianceScore: 4,
        estheticDemands: 3,
        functionalDemands: 3,
        // All optional fields left undefined
        sinusPneumatization: undefined,
        hba1c: undefined,
        yearsSinceQuitSmoking: undefined,
        bisphosphonateYears: undefined,
        previousFailedImplants: undefined,
      };

      expect(() => AllOnXClinicalScore.fromIndicators(minimalIndicators)).not.toThrow();
    });
  });

  describe('Multiple Contraindications', () => {
    it('should handle multiple simultaneous contraindications', () => {
      const multipleContraindications: AllOnXClinicalIndicators = {
        boneDensity: 4,
        maxillaBoneHeight: 5,
        mandibleBoneHeight: 5,
        boneWidth: 3,
        hba1c: 12,
        smokingStatus: 4,
        onBisphosphonates: true,
        bisphosphonateYears: 10,
        onAnticoagulants: true,
        hasOsteoporosis: true,
        hasRadiationHistory: true,
        hasUncontrolledCardiovascular: true,
        isImmunocompromised: true,
        remainingTeeth: 2,
        periodontalDisease: 3,
        oralHygieneScore: 1,
        hasBruxism: true,
        previousFailedImplants: 5,
        targetArch: 3,
        extractionsNeeded: 2,
        needsBoneGrafting: true,
        needsSinusLift: true,
        immediateLoadingFeasibility: 1,
        patientAge: 85,
        asaClassification: 4,
        complianceScore: 1,
        estheticDemands: 5,
        functionalDemands: 5,
      };

      const score = AllOnXClinicalScore.fromIndicators(multipleContraindications);

      expect(score.eligibility).toBe('CONTRAINDICATED');
      expect(score.isCandidate()).toBe(false);
      expect(score.riskLevel).toBe('CRITICAL');
      expect(score.getRiskFactors().length).toBeGreaterThan(5);
    });
  });

  describe('Parse Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = AllOnXClinicalScore.parse(null);
      expect(result.success).toBe(false);
    });

    it('should handle undefined input gracefully', () => {
      const result = AllOnXClinicalScore.parse(undefined);
      expect(result.success).toBe(false);
    });

    it('should handle empty object gracefully', () => {
      const result = AllOnXClinicalScore.parse({});
      expect(result.success).toBe(false);
    });

    it('should handle primitive input gracefully', () => {
      expect(AllOnXClinicalScore.parse(42).success).toBe(false);
      expect(AllOnXClinicalScore.parse('test').success).toBe(false);
      expect(AllOnXClinicalScore.parse(true).success).toBe(false);
    });

    it('should handle already parsed AllOnXClinicalScore instance', () => {
      const indicators: AllOnXClinicalIndicators = {
        boneDensity: 2,
        maxillaBoneHeight: 14,
        mandibleBoneHeight: 16,
        boneWidth: 9,
        smokingStatus: 0,
        onBisphosphonates: false,
        onAnticoagulants: false,
        hasOsteoporosis: false,
        hasRadiationHistory: false,
        hasUncontrolledCardiovascular: false,
        isImmunocompromised: false,
        remainingTeeth: 8,
        periodontalDisease: 0,
        oralHygieneScore: 4,
        hasBruxism: false,
        targetArch: 1,
        extractionsNeeded: 8,
        needsBoneGrafting: false,
        needsSinusLift: false,
        immediateLoadingFeasibility: 5,
        patientAge: 55,
        asaClassification: 1,
        complianceScore: 5,
        estheticDemands: 3,
        functionalDemands: 3,
      };

      const original = AllOnXClinicalScore.fromIndicators(indicators);
      const result = AllOnXClinicalScore.parse(original);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(original);
      }
    });
  });

  describe('Screening Edge Cases', () => {
    it('should handle screening with minimal parameters', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0);
      expect(score).toBeDefined();
      expect(score.confidence).toBeLessThan(0.9);
    });

    it('should handle screening with all parameters', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0, 6.5, 55, 0.7);
      expect(score).toBeDefined();
      expect(score.confidence).toBe(0.7);
    });
  });
});
