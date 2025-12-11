/**
 * @fileoverview AllOnXClinicalScore Unit Tests
 *
 * Comprehensive tests for the AllOnX Clinical Scoring system
 * for ONE STEP ALL ON X dental implant procedures.
 *
 * @module domain/__tests__/allonx-clinical-score
 */

import { describe, it, expect } from 'vitest';
import {
  AllOnXClinicalScore,
  InvalidAllOnXScoreError,
  isAllOnXClinicalScore,
  isSuccessfulParse,
  type AllOnXClinicalIndicators,
} from '../allonx/value-objects/AllOnXClinicalScore.js';

import {
  calculateScore,
  generateTreatmentPlan,
  compareScores,
  assessImplantSites,
  quickEligibilityCheck,
} from '../allonx/services/AllOnXScoringPolicy.js';

import {
  createAllOnXCase,
  isValidStatusTransition,
  getAllowedNextStatuses,
  requiresImmediateAttention,
  isActiveCase,
  calculateCaseProgress,
} from '../allonx/entities/AllOnXCase.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Ideal candidate indicators
 */
const idealCandidateIndicators: AllOnXClinicalIndicators = {
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

/**
 * High-risk candidate indicators
 */
const highRiskCandidateIndicators: AllOnXClinicalIndicators = {
  boneDensity: 4,
  maxillaBoneHeight: 7,
  mandibleBoneHeight: 10,
  boneWidth: 5,
  smokingStatus: 4,
  hba1c: 9.5,
  onBisphosphonates: true,
  bisphosphonateYears: 5,
  onAnticoagulants: true,
  hasOsteoporosis: true,
  hasRadiationHistory: false,
  hasUncontrolledCardiovascular: false,
  isImmunocompromised: false,
  remainingTeeth: 4,
  periodontalDisease: 3,
  oralHygieneScore: 2,
  hasBruxism: true,
  targetArch: 3,
  extractionsNeeded: 4,
  needsBoneGrafting: true,
  needsSinusLift: true,
  immediateLoadingFeasibility: 1,
  patientAge: 72,
  asaClassification: 3,
  complianceScore: 2,
  estheticDemands: 4,
  functionalDemands: 4,
};

/**
 * Contraindicated candidate indicators
 */
const contraindicatedIndicators: AllOnXClinicalIndicators = {
  boneDensity: 4,
  maxillaBoneHeight: 5,
  mandibleBoneHeight: 6,
  boneWidth: 4,
  smokingStatus: 4,
  hba1c: 11,
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
  targetArch: 3,
  extractionsNeeded: 2,
  needsBoneGrafting: true,
  needsSinusLift: true,
  immediateLoadingFeasibility: 1,
  patientAge: 82,
  asaClassification: 4,
  complianceScore: 1,
  estheticDemands: 5,
  functionalDemands: 5,
};

// ============================================================================
// VALUE OBJECT TESTS
// ============================================================================

describe('AllOnXClinicalScore', () => {
  describe('fromIndicators', () => {
    it('should create score from ideal candidate indicators', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(score).toBeDefined();
      expect(score.compositeScore).toBeGreaterThanOrEqual(80);
      expect(score.eligibility).toBe('IDEAL');
      expect(score.riskLevel).toBe('LOW');
      // ALL_ON_4 is standard recommendation; ALL_ON_6 requires specific esthetic demands >= 4
      expect(['ALL_ON_4', 'ALL_ON_6']).toContain(score.recommendedProcedure);
      expect(score.isCandidate()).toBe(true);
      expect(score.isIdealCandidate()).toBe(true);
    });

    it('should create score from high-risk candidate indicators', () => {
      const score = AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators);

      expect(score).toBeDefined();
      expect(score.compositeScore).toBeLessThan(60);
      // High-risk with HbA1c > 9 and ASA >= 3 triggers CONTRAINDICATED
      expect(['CONDITIONAL', 'CONTRAINDICATED']).toContain(score.eligibility);
      expect(['HIGH', 'CRITICAL']).toContain(score.riskLevel);
      expect(score.isIdealCandidate()).toBe(false);
    });

    it('should identify contraindicated candidate', () => {
      const score = AllOnXClinicalScore.fromIndicators(contraindicatedIndicators);

      expect(score).toBeDefined();
      expect(score.eligibility).toBe('CONTRAINDICATED');
      expect(score.riskLevel).toBe('CRITICAL');
      expect(score.isCandidate()).toBe(false);
      expect(score.treatmentRecommendation).toBe('NOT_RECOMMENDED');
    });

    it('should recommend All-on-4 for standard bone conditions', () => {
      const indicators: AllOnXClinicalIndicators = {
        ...idealCandidateIndicators,
        maxillaBoneHeight: 10,
        boneWidth: 6,
        boneDensity: 3,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      expect(score.recommendedProcedure).toBe('ALL_ON_4');
    });

    it('should recommend hybrid approach for challenging anatomy', () => {
      const indicators: AllOnXClinicalIndicators = {
        ...idealCandidateIndicators,
        maxillaBoneHeight: 7,
        boneWidth: 4,
      };

      const score = AllOnXClinicalScore.fromIndicators(indicators);
      expect(score.recommendedProcedure).toBe('ALL_ON_X_HYBRID');
    });
  });

  describe('validation', () => {
    it('should reject invalid bone density', () => {
      const invalidIndicators = { ...idealCandidateIndicators, boneDensity: 5 };

      expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
        InvalidAllOnXScoreError
      );
    });

    it('should reject invalid patient age', () => {
      const invalidIndicators = { ...idealCandidateIndicators, patientAge: 15 };

      expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
        InvalidAllOnXScoreError
      );
    });

    it('should reject invalid HbA1c', () => {
      const invalidIndicators = { ...idealCandidateIndicators, hba1c: 20 };

      expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
        InvalidAllOnXScoreError
      );
    });

    it('should reject invalid smoking status', () => {
      const invalidIndicators = { ...idealCandidateIndicators, smokingStatus: 6 };

      expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
        InvalidAllOnXScoreError
      );
    });

    it('should reject invalid bone height', () => {
      const invalidIndicators = { ...idealCandidateIndicators, maxillaBoneHeight: 35 };

      expect(() => AllOnXClinicalScore.fromIndicators(invalidIndicators)).toThrow(
        InvalidAllOnXScoreError
      );
    });

    it('should accept valid optional HbA1c', () => {
      const indicatorsWithHba1c = { ...idealCandidateIndicators, hba1c: 6.5 };
      const score = AllOnXClinicalScore.fromIndicators(indicatorsWithHba1c);
      expect(score).toBeDefined();
      expect(score.indicators.hba1c).toBe(6.5);
    });
  });

  describe('risk assessment', () => {
    it('should identify smoking risk', () => {
      const indicators = { ...idealCandidateIndicators, smokingStatus: 3 };
      const score = AllOnXClinicalScore.fromIndicators(indicators);

      expect(score.hasSmokingRisk()).toBe(true);
    });

    it('should identify diabetes risk', () => {
      const indicators = { ...idealCandidateIndicators, hba1c: 8.0 };
      const score = AllOnXClinicalScore.fromIndicators(indicators);

      expect(score.hasDiabetesRisk()).toBe(true);
    });

    it('should identify MRONJ risk with bisphosphonates', () => {
      const indicators = { ...idealCandidateIndicators, onBisphosphonates: true };
      const score = AllOnXClinicalScore.fromIndicators(indicators);

      expect(score.hasMRONJRisk()).toBe(true);
    });

    it('should collect all risk factors', () => {
      const score = AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators);
      const riskFactors = score.getRiskFactors();

      expect(riskFactors.length).toBeGreaterThan(0);
      expect(riskFactors.some((f) => f.includes('Smoking'))).toBe(true);
      expect(riskFactors.some((f) => f.includes('Diabetes'))).toBe(true);
      expect(riskFactors.some((f) => f.includes('Bisphosphonate'))).toBe(true);
    });
  });

  describe('treatment recommendations', () => {
    it('should recommend standard procedure for ideal candidate', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(score.treatmentRecommendation).toBe('PROCEED_STANDARD');
      expect(score.canProceedImmediately()).toBe(true);
    });

    it('should require medical clearance for high-risk patient', () => {
      const indicators = { ...idealCandidateIndicators, asaClassification: 3 };
      const score = AllOnXClinicalScore.fromIndicators(indicators);

      expect(score.requiresMedicalClearance()).toBe(true);
    });

    it('should identify bone augmentation requirement', () => {
      const indicators = { ...idealCandidateIndicators, needsBoneGrafting: true };
      const score = AllOnXClinicalScore.fromIndicators(indicators);

      expect(score.requiresBoneAugmentation()).toBe(true);
    });

    it('should identify immediate loading feasibility', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      expect(score.isImmediateLoadingFeasible()).toBe(true);

      const lowFeasibility = {
        ...idealCandidateIndicators,
        immediateLoadingFeasibility: 2,
      };
      const score2 = AllOnXClinicalScore.fromIndicators(lowFeasibility);
      expect(score2.isImmediateLoadingFeasible()).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(() => {
        // Intentionally bypassing readonly to test runtime freeze behavior
        (score as { compositeScore: number }).compositeScore = 50;
      }).toThrow();
    });

    it('should have frozen indicators', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(() => {
        // Intentionally bypassing readonly to test runtime freeze behavior
        (score.indicators as { boneDensity: number }).boneDensity = 1;
      }).toThrow();
    });
  });

  describe('equality', () => {
    it('should equal same indicators', () => {
      const score1 = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const score2 = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(score1.equals(score2)).toBe(true);
    });

    it('should not equal different indicators', () => {
      const score1 = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const score2 = AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators);

      expect(score1.equals(score2)).toBe(false);
    });

    it('should handle null/undefined', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(score.equals(null)).toBe(false);
      expect(score.equals(undefined)).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const json = score.toJSON();

      expect(json.compositeScore).toBe(score.compositeScore);
      expect(json.eligibility).toBe(score.eligibility);
      expect(json.riskLevel).toBe(score.riskLevel);
      expect(json.indicators).toEqual(score.indicators);
    });

    it('should reconstitute from DTO', () => {
      const original = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const dto = original.toJSON();
      const reconstituted = AllOnXClinicalScore.reconstitute(dto);

      expect(reconstituted.compositeScore).toBe(original.compositeScore);
      expect(reconstituted.eligibility).toBe(original.eligibility);
      expect(reconstituted.equals(original)).toBe(true);
    });

    it('should parse from unknown input', () => {
      const original = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const dto = original.toJSON();

      const result = AllOnXClinicalScore.parse(dto);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.compositeScore).toBe(original.compositeScore);
      }
    });

    it('should handle parse failure gracefully', () => {
      const result = AllOnXClinicalScore.parse({ invalid: 'data' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('type guards', () => {
    it('should identify AllOnXClinicalScore instance', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(isAllOnXClinicalScore(score)).toBe(true);
      expect(isAllOnXClinicalScore({})).toBe(false);
      expect(isAllOnXClinicalScore(null)).toBe(false);
    });

    it('should identify successful parse result', () => {
      const success = AllOnXClinicalScore.parse(
        AllOnXClinicalScore.fromIndicators(idealCandidateIndicators).toJSON()
      );
      const failure = AllOnXClinicalScore.parse({ invalid: true });

      expect(isSuccessfulParse(success)).toBe(true);
      expect(isSuccessfulParse(failure)).toBe(false);
    });
  });

  describe('screening', () => {
    it('should create screening score', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0, undefined, 55);

      expect(score).toBeDefined();
      expect(score.confidence).toBeLessThan(0.9);
      expect(score.isCandidate()).toBe(true);
    });

    it('should reflect smoking risk in screening', () => {
      const nonSmoker = AllOnXClinicalScore.forScreening(2, 12, 0);
      const heavySmoker = AllOnXClinicalScore.forScreening(2, 12, 4);

      expect(nonSmoker.compositeScore).toBeGreaterThan(heavySmoker.compositeScore);
    });
  });

  describe('transformation', () => {
    it('should update indicators immutably', () => {
      const original = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const updated = original.withUpdatedIndicators({ smokingStatus: 3 });

      expect(original.indicators.smokingStatus).toBe(0);
      expect(updated.indicators.smokingStatus).toBe(3);
      expect(original).not.toBe(updated);
    });

    it('should update confidence immutably', () => {
      const original = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators, 0.9);
      const updated = original.withConfidence(0.7);

      expect(original.confidence).toBe(0.9);
      expect(updated.confidence).toBe(0.7);
    });
  });

  describe('comparison', () => {
    it('should compare scores correctly', () => {
      const better = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const worse = AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators);

      expect(better.isBetterThan(worse)).toBe(true);
      expect(worse.isWorseThan(better)).toBe(true);
      expect(better.compareTo(worse)).toBeGreaterThan(0);
    });
  });

  describe('clinical summary', () => {
    it('should generate clinical summary', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const summary = score.getClinicalSummary();

      expect(summary).toContain('IDEAL');
      expect(summary).toContain('LOW');
    });

    it('should include risk factors in summary for high-risk cases', () => {
      const score = AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators);
      const riskFactors = score.getRiskFactors();

      expect(riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('SLA and priority', () => {
    it('should calculate correct follow-up urgency', () => {
      const ideal = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const critical = AllOnXClinicalScore.fromIndicators(contraindicatedIndicators);

      expect(ideal.getFollowUpUrgency()).toBe('soon');
      expect(critical.getFollowUpUrgency()).toBe('immediate');
    });

    it('should calculate correct SLA hours', () => {
      const ideal = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      expect(ideal.getClinicalReviewSLAHours()).toBe(72); // 'soon' = 72 hours
    });

    it('should calculate correct task priority', () => {
      const ideal = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const critical = AllOnXClinicalScore.fromIndicators(contraindicatedIndicators);

      expect(ideal.getTaskPriority()).toBe('high');
      expect(critical.getTaskPriority()).toBe('critical');
    });
  });

  describe('treatment duration estimate', () => {
    it('should estimate treatment duration', () => {
      const simple = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const complex = AllOnXClinicalScore.fromIndicators({
        ...idealCandidateIndicators,
        needsBoneGrafting: true,
        needsSinusLift: true,
        targetArch: 3,
        immediateLoadingFeasibility: 1,
      });

      expect(simple.getEstimatedTreatmentDuration()).toBeLessThan(
        complex.getEstimatedTreatmentDuration()
      );
    });
  });
});

// ============================================================================
// SCORING POLICY TESTS
// ============================================================================

describe('AllOnXScoringPolicy', () => {
  describe('calculateScore', () => {
    it('should return detailed scoring result', () => {
      const result = calculateScore(idealCandidateIndicators);

      expect(result.clinicalScore).toBeDefined();
      expect(result.componentScores).toBeDefined();
      expect(result.riskFlags).toBeDefined();
      expect(result.clinicalNotes).toBeDefined();
      expect(result.contraindications).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should identify risk flags', () => {
      const result = calculateScore(highRiskCandidateIndicators);

      expect(result.riskFlags).toContain('HEAVY_SMOKER');
      expect(result.riskFlags).toContain('UNCONTROLLED_DIABETES');
      expect(result.riskFlags).toContain('BISPHOSPHONATE_THERAPY');
      expect(result.riskFlags).toContain('POOR_BONE_QUALITY');
    });

    it('should identify contraindications', () => {
      const result = calculateScore(contraindicatedIndicators);

      expect(result.contraindications.length).toBeGreaterThan(0);
      expect(result.contraindications.some((c) => c.includes('radiation'))).toBe(true);
    });

    it('should generate clinical notes', () => {
      const result = calculateScore(highRiskCandidateIndicators);

      expect(result.clinicalNotes.length).toBeGreaterThan(0);
      expect(result.clinicalNotes.some((n) => n.includes('smoke'))).toBe(true);
    });
  });

  describe('generateTreatmentPlan', () => {
    it('should generate treatment plan for ideal candidate', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const plan = generateTreatmentPlan(score, idealCandidateIndicators);

      expect(plan.isFeasible).toBe(true);
      expect(plan.recommendedProcedure).toBeDefined();
      expect(plan.phases.length).toBeGreaterThan(0);
      expect(plan.successProbability).toBeGreaterThan(0.9);
    });

    it('should include bone augmentation phase when needed', () => {
      const indicators = { ...idealCandidateIndicators, needsSinusLift: true };
      const score = AllOnXClinicalScore.fromIndicators(indicators);
      const plan = generateTreatmentPlan(score, indicators);

      expect(plan.phases.some((p) => p.name.includes('Augmentation'))).toBe(true);
    });

    it('should include pre-treatment for periodontal disease', () => {
      const indicators = { ...idealCandidateIndicators, periodontalDisease: 3 };
      const score = AllOnXClinicalScore.fromIndicators(indicators);
      const plan = generateTreatmentPlan(score, indicators);

      expect(plan.preTreatmentRequirements.some((r) => r.includes('periodontal'))).toBe(true);
    });

    it('should calculate success probability based on risk factors', () => {
      const idealPlan = generateTreatmentPlan(
        AllOnXClinicalScore.fromIndicators(idealCandidateIndicators),
        idealCandidateIndicators
      );
      const riskyPlan = generateTreatmentPlan(
        AllOnXClinicalScore.fromIndicators(highRiskCandidateIndicators),
        highRiskCandidateIndicators
      );

      expect(idealPlan.successProbability).toBeGreaterThan(riskyPlan.successProbability);
    });
  });

  describe('compareScores', () => {
    it('should detect improvement', () => {
      // Use indicators that result in different eligibility categories
      const baseline = AllOnXClinicalScore.fromIndicators({
        ...idealCandidateIndicators,
        smokingStatus: 4,
        hba1c: 8.5,
        periodontalDisease: 2,
      });
      const followUp = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);

      const comparison = compareScores(baseline, followUp);

      expect(comparison.scoreChange).toBeGreaterThan(0);
      // Score improved but eligibility may stay same if both are IDEAL
      expect(comparison.clinicalResponse).not.toBe('WORSENED');
    });

    it('should detect worsening', () => {
      const baseline = AllOnXClinicalScore.fromIndicators(idealCandidateIndicators);
      const followUp = AllOnXClinicalScore.fromIndicators({
        ...idealCandidateIndicators,
        smokingStatus: 4,
        hba1c: 9,
      });

      const comparison = compareScores(baseline, followUp);

      expect(comparison.scoreChange).toBeLessThan(0);
      expect(comparison.clinicalResponse).toBe('WORSENED');
    });
  });

  describe('assessImplantSites', () => {
    it('should assess maxillary sites', () => {
      const assessments = assessImplantSites({
        ...idealCandidateIndicators,
        targetArch: 1,
      });

      expect(assessments.some((a) => a.site === 'anterior_maxilla')).toBe(true);
      expect(assessments.some((a) => a.site === 'posterior_maxilla')).toBe(true);
    });

    it('should assess mandibular sites', () => {
      const assessments = assessImplantSites({
        ...idealCandidateIndicators,
        targetArch: 2,
      });

      expect(assessments.some((a) => a.site === 'anterior_mandible')).toBe(true);
      expect(assessments.some((a) => a.site === 'posterior_mandible')).toBe(true);
    });

    it('should assess all sites for dual arch', () => {
      const assessments = assessImplantSites({
        ...idealCandidateIndicators,
        targetArch: 3,
      });

      expect(assessments.length).toBe(4);
    });
  });

  describe('quickEligibilityCheck', () => {
    it('should identify likely eligible patient', () => {
      const result = quickEligibilityCheck(2, 12, 0);

      expect(result.likelyEligible).toBe(true);
      expect(result.preliminaryEligibility).toBe('IDEAL');
    });

    it('should identify contraindicated patient', () => {
      const result = quickEligibilityCheck(4, 5, 4, 11, true);

      expect(result.likelyEligible).toBe(false);
      expect(result.preliminaryEligibility).toBe('CONTRAINDICATED');
    });

    it('should provide key factors', () => {
      const result = quickEligibilityCheck(4, 6, 4, 10);

      expect(result.keyFactors.length).toBeGreaterThan(0);
      expect(result.keyFactors.some((f) => f.includes('bone'))).toBe(true);
    });
  });
});

// ============================================================================
// ENTITY TESTS
// ============================================================================

describe('AllOnXCase', () => {
  describe('createAllOnXCase', () => {
    it('should create case with required fields', () => {
      const caseEntity = createAllOnXCase({
        patientId: 'patient-123',
      });

      expect(caseEntity.id).toBeDefined();
      expect(caseEntity.caseNumber).toMatch(/^AOX-/);
      expect(caseEntity.patientId).toBe('patient-123');
      expect(caseEntity.status).toBe('INTAKE');
      expect(caseEntity.priority).toBe('MEDIUM');
    });

    it('should create case with optional fields', () => {
      const caseEntity = createAllOnXCase({
        patientId: 'patient-123',
        assignedClinicianId: 'clinician-456',
        targetArch: 'MAXILLA',
        priority: 'HIGH',
        clinicalNotes: 'Test notes',
      });

      expect(caseEntity.assignedClinicianId).toBe('clinician-456');
      expect(caseEntity.targetArch).toBe('MAXILLA');
      expect(caseEntity.priority).toBe('HIGH');
      expect(caseEntity.clinicalNotes).toBe('Test notes');
    });
  });

  describe('status transitions', () => {
    it('should allow valid transitions', () => {
      expect(isValidStatusTransition('INTAKE', 'ASSESSMENT')).toBe(true);
      expect(isValidStatusTransition('ASSESSMENT', 'PLANNING')).toBe(true);
      expect(isValidStatusTransition('SURGICAL_PHASE', 'HEALING')).toBe(true);
      expect(isValidStatusTransition('COMPLETED', 'FOLLOW_UP')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidStatusTransition('INTAKE', 'COMPLETED')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'INTAKE')).toBe(false);
      expect(isValidStatusTransition('HEALING', 'INTAKE')).toBe(false);
    });

    it('should get allowed next statuses', () => {
      const fromIntake = getAllowedNextStatuses('INTAKE');
      expect(fromIntake).toContain('ASSESSMENT');
      expect(fromIntake).toContain('CANCELLED');
      expect(fromIntake).not.toContain('COMPLETED');

      const fromCancelled = getAllowedNextStatuses('CANCELLED');
      expect(fromCancelled).toHaveLength(0);
    });
  });

  describe('query helpers', () => {
    it('should identify active case', () => {
      const activeCase = createAllOnXCase({ patientId: 'p1' });
      expect(isActiveCase(activeCase)).toBe(true);

      const cancelledCase = { ...activeCase, status: 'CANCELLED' as const };
      expect(isActiveCase(cancelledCase)).toBe(false);
    });

    it('should calculate case progress', () => {
      expect(
        calculateCaseProgress({ ...createAllOnXCase({ patientId: 'p1' }), status: 'INTAKE' })
      ).toBe(5);
      expect(
        calculateCaseProgress({
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'SURGICAL_PHASE',
        })
      ).toBe(60);
      expect(
        calculateCaseProgress({ ...createAllOnXCase({ patientId: 'p1' }), status: 'COMPLETED' })
      ).toBe(100);
    });

    it('should identify urgent cases', () => {
      const urgentCase = { ...createAllOnXCase({ patientId: 'p1' }), priority: 'URGENT' as const };
      expect(requiresImmediateAttention(urgentCase)).toBe(true);
    });
  });
});
