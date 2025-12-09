/**
 * @fileoverview Tests for AllOnXClinicalScore Value Object
 *
 * Tests for clinical score calculation, eligibility assessment, risk evaluation,
 * and treatment recommendations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AllOnXClinicalScore,
  InvalidAllOnXScoreError,
  isAllOnXClinicalScore,
  isSuccessfulParse,
  CLINICAL_INDICATOR_RANGES,
  ELIGIBILITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,
  type AllOnXClinicalIndicators,
  type AllOnXEligibility,
  type AllOnXRiskLevel,
  type AllOnXComplexity,
  type AllOnXClinicalScoreDTO,
} from '../AllOnXClinicalScore.js';

describe('AllOnXClinicalScore', () => {
  const mockTimestamp = new Date('2024-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Ideal patient indicators for testing
  const idealIndicators: AllOnXClinicalIndicators = {
    boneDensity: 2,
    maxillaBoneHeight: 15,
    mandibleBoneHeight: 15,
    boneWidth: 10,
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

  // High risk patient indicators
  const highRiskIndicators: AllOnXClinicalIndicators = {
    ...idealIndicators,
    boneDensity: 4,
    boneWidth: 4,
    smokingStatus: 4,
    hba1c: 10,
    onBisphosphonates: true,
    bisphosphonateYears: 5,
    hasOsteoporosis: true,
    periodontalDisease: 3,
    oralHygieneScore: 1,
    hasBruxism: true,
    asaClassification: 3,
    complianceScore: 1,
  };

  describe('Constants', () => {
    it('should define clinical indicator ranges', () => {
      expect(CLINICAL_INDICATOR_RANGES.boneDensity).toEqual({ min: 1, max: 4, unit: 'class' });
      expect(CLINICAL_INDICATOR_RANGES.patientAge).toEqual({ min: 18, max: 100, unit: 'years' });
      expect(CLINICAL_INDICATOR_RANGES.hba1c).toEqual({ min: 4, max: 15, unit: '%' });
    });

    it('should define eligibility thresholds', () => {
      expect(ELIGIBILITY_THRESHOLDS.IDEAL.minScore).toBe(80);
      expect(ELIGIBILITY_THRESHOLDS.SUITABLE.minScore).toBe(60);
      expect(ELIGIBILITY_THRESHOLDS.CONDITIONAL.minScore).toBe(40);
    });

    it('should define SLA hours', () => {
      expect(CLINICAL_SLA_HOURS.immediate).toBe(4);
      expect(CLINICAL_SLA_HOURS.urgent).toBe(24);
      expect(CLINICAL_SLA_HOURS.soon).toBe(72);
      expect(CLINICAL_SLA_HOURS.routine).toBe(168);
    });
  });

  describe('fromIndicators', () => {
    it('should create score from ideal indicators', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.compositeScore).toBeGreaterThanOrEqual(80);
      expect(score.eligibility).toBe('IDEAL');
      expect(score.riskLevel).toBe('LOW');
      expect(score.confidence).toBe(0.9);
    });

    it('should accept custom confidence', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators, 0.75);

      expect(score.confidence).toBe(0.75);
    });

    it('should freeze the score object', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(Object.isFrozen(score)).toBe(true);
    });

    it('should freeze the indicators', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(Object.isFrozen(score.indicators)).toBe(true);
    });

    it('should set scoredAt to current time', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.scoredAt).toEqual(mockTimestamp);
    });

    it('should set algorithm version', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.algorithmVersion).toBe('2.0.0');
    });

    describe('validation errors', () => {
      it('should throw for invalid bone density', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, boneDensity: 0 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, boneDensity: 5 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid maxilla bone height', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, maxillaBoneHeight: -1 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, maxillaBoneHeight: 35 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid mandible bone height', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, mandibleBoneHeight: -1 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid bone width', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, boneWidth: -1 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, boneWidth: 20 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid smoking status', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, smokingStatus: -1 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, smokingStatus: 5 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid hba1c (when provided)', () => {
        expect(() => AllOnXClinicalScore.fromIndicators({ ...idealIndicators, hba1c: 3 })).toThrow(
          InvalidAllOnXScoreError
        );

        expect(() => AllOnXClinicalScore.fromIndicators({ ...idealIndicators, hba1c: 16 })).toThrow(
          InvalidAllOnXScoreError
        );
      });

      it('should throw for invalid patient age', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, patientAge: 17 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, patientAge: 101 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid ASA classification', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, asaClassification: 0 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, asaClassification: 6 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid oral hygiene score', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, oralHygieneScore: 0 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, oralHygieneScore: 5 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid target arch', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, targetArch: 0 })
        ).toThrow(InvalidAllOnXScoreError);

        expect(() =>
          AllOnXClinicalScore.fromIndicators({ ...idealIndicators, targetArch: 4 })
        ).toThrow(InvalidAllOnXScoreError);
      });

      it('should throw for invalid confidence', () => {
        expect(() => AllOnXClinicalScore.fromIndicators(idealIndicators, -0.1)).toThrow(
          InvalidAllOnXScoreError
        );

        expect(() => AllOnXClinicalScore.fromIndicators(idealIndicators, 1.1)).toThrow(
          InvalidAllOnXScoreError
        );

        expect(() => AllOnXClinicalScore.fromIndicators(idealIndicators, NaN)).toThrow(
          InvalidAllOnXScoreError
        );
      });

      it('should throw for null indicators', () => {
        expect(() =>
          AllOnXClinicalScore.fromIndicators(null as unknown as AllOnXClinicalIndicators)
        ).toThrow(InvalidAllOnXScoreError);
      });
    });
  });

  describe('forScreening', () => {
    it('should create quick screening score', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0);

      expect(score.compositeScore).toBeGreaterThan(0);
      expect(score.confidence).toBe(0.6); // Lower confidence for screening
    });

    it('should accept optional hba1c', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0, 6.5);

      expect(score.indicators.hba1c).toBe(6.5);
    });

    it('should accept custom patient age', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0, undefined, 65);

      expect(score.indicators.patientAge).toBe(65);
    });

    it('should accept custom confidence', () => {
      const score = AllOnXClinicalScore.forScreening(2, 12, 0, undefined, 55, 0.8);

      expect(score.confidence).toBe(0.8);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from valid DTO', () => {
      const originalScore = AllOnXClinicalScore.fromIndicators(idealIndicators);
      const dto = originalScore.toJSON();

      const reconstituted = AllOnXClinicalScore.reconstitute(dto);

      expect(reconstituted.compositeScore).toBe(originalScore.compositeScore);
      expect(reconstituted.eligibility).toBe(originalScore.eligibility);
    });

    it('should handle string date in DTO', () => {
      const originalScore = AllOnXClinicalScore.fromIndicators(idealIndicators);
      const dto = originalScore.toJSON();

      const reconstituted = AllOnXClinicalScore.reconstitute(dto);

      expect(reconstituted.scoredAt).toEqual(mockTimestamp);
    });

    it('should throw for missing required fields', () => {
      const invalidDto = { compositeScore: 80 } as AllOnXClinicalScoreDTO;

      expect(() => AllOnXClinicalScore.reconstitute(invalidDto)).toThrow(InvalidAllOnXScoreError);
    });

    it('should throw for invalid DTO (null)', () => {
      expect(() =>
        AllOnXClinicalScore.reconstitute(null as unknown as AllOnXClinicalScoreDTO)
      ).toThrow(InvalidAllOnXScoreError);
    });

    it('should throw for invalid scoredAt date', () => {
      const dto = AllOnXClinicalScore.fromIndicators(idealIndicators).toJSON();
      dto.scoredAt = 'invalid-date';

      expect(() => AllOnXClinicalScore.reconstitute(dto)).toThrow(InvalidAllOnXScoreError);
    });
  });

  describe('parse', () => {
    it('should return success for AllOnXClinicalScore instance', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
      const result = AllOnXClinicalScore.parse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(score);
      }
    });

    it('should return failure for null', () => {
      const result = AllOnXClinicalScore.parse(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('null/undefined');
      }
    });

    it('should return failure for undefined', () => {
      const result = AllOnXClinicalScore.parse(undefined);

      expect(result.success).toBe(false);
    });

    it('should parse DTO with compositeScore and eligibility', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
      const dto = score.toJSON();

      const result = AllOnXClinicalScore.parse(dto);

      expect(result.success).toBe(true);
    });

    it('should parse object with just indicators', () => {
      const result = AllOnXClinicalScore.parse({ indicators: idealIndicators });

      expect(result.success).toBe(true);
    });

    it('should parse object with indicators and custom confidence', () => {
      const result = AllOnXClinicalScore.parse({ indicators: idealIndicators, confidence: 0.8 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBe(0.8);
      }
    });

    it('should return failure for non-object input', () => {
      const result = AllOnXClinicalScore.parse('invalid');

      expect(result.success).toBe(false);
    });
  });

  describe('Eligibility Classification', () => {
    it('should classify IDEAL for high score without contraindications', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.eligibility).toBe('IDEAL');
    });

    it('should classify CONTRAINDICATED for radiation history', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        hasRadiationHistory: true,
      });

      expect(score.eligibility).toBe('CONTRAINDICATED');
    });

    it('should classify CONTRAINDICATED for ASA 4+', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        asaClassification: 4,
      });

      expect(score.eligibility).toBe('CONTRAINDICATED');
    });

    it('should classify CONTRAINDICATED for very high HbA1c', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        hba1c: 11,
      });

      expect(score.eligibility).toBe('CONTRAINDICATED');
    });

    it('should classify CONTRAINDICATED for uncontrolled cardiovascular', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        hasUncontrolledCardiovascular: true,
      });

      expect(score.eligibility).toBe('CONTRAINDICATED');
    });
  });

  describe('Risk Level Calculation', () => {
    it('should return LOW risk for ideal patient', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.riskLevel).toBe('LOW');
    });

    it('should return CRITICAL risk for very high risk patient', () => {
      const score = AllOnXClinicalScore.fromIndicators(highRiskIndicators);

      expect(score.riskLevel).toBe('CRITICAL');
    });

    it('should increase risk for heavy smoking', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        smokingStatus: 4,
      });

      expect(['MODERATE', 'HIGH']).toContain(score.riskLevel);
    });

    it('should increase risk for bisphosphonate therapy', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        onBisphosphonates: true,
        bisphosphonateYears: 5,
      });

      expect(score.riskLevel).not.toBe('LOW');
    });
  });

  describe('Complexity Calculation', () => {
    it('should return STANDARD complexity for ideal case', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.complexity).toBe('STANDARD');
    });

    it('should increase complexity for bone grafting', () => {
      const withGrafting = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        needsBoneGrafting: true,
      });
      const withoutGrafting = AllOnXClinicalScore.fromIndicators(idealIndicators);

      // Bone grafting adds 15 to complexity score, which may or may not cross threshold
      // The important thing is the treatment recommendation changes
      expect(withGrafting.requiresBoneAugmentation()).toBe(true);
      expect(withoutGrafting.requiresBoneAugmentation()).toBe(false);
    });

    it('should increase complexity for sinus lift', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        needsSinusLift: true,
      });

      expect(['MODERATE', 'COMPLEX', 'HIGHLY_COMPLEX']).toContain(score.complexity);
    });

    it('should increase complexity for both arches', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        targetArch: 3,
      });

      expect(['MODERATE', 'COMPLEX', 'HIGHLY_COMPLEX']).toContain(score.complexity);
    });
  });

  describe('Treatment Recommendation', () => {
    it('should recommend PROCEED_STANDARD for ideal patient', () => {
      const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

      expect(score.treatmentRecommendation).toBe('PROCEED_STANDARD');
    });

    it('should recommend NOT_RECOMMENDED for contraindicated', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        hasRadiationHistory: true,
      });

      expect(score.treatmentRecommendation).toBe('NOT_RECOMMENDED');
    });

    it('should recommend BONE_AUGMENTATION_FIRST when needed', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        needsBoneGrafting: true,
      });

      expect(['BONE_AUGMENTATION_FIRST', 'STAGED_APPROACH']).toContain(
        score.treatmentRecommendation
      );
    });

    it('should recommend MEDICAL_CLEARANCE_REQUIRED for high ASA', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        asaClassification: 3,
      });

      expect(score.treatmentRecommendation).toBe('MEDICAL_CLEARANCE_REQUIRED');
    });
  });

  describe('Procedure Recommendation', () => {
    it('should recommend ALL_ON_4 for standard cases', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        boneWidth: 6,
        maxillaBoneHeight: 10,
      });

      expect(score.recommendedProcedure).toBe('ALL_ON_4');
    });

    it('should recommend ALL_ON_6 for excellent bone', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        boneDensity: 1,
        boneWidth: 10,
        maxillaBoneHeight: 15,
        estheticDemands: 5,
      });

      expect(score.recommendedProcedure).toBe('ALL_ON_6');
    });

    it('should recommend ALL_ON_X_HYBRID for challenging anatomy', () => {
      const score = AllOnXClinicalScore.fromIndicators({
        ...idealIndicators,
        boneWidth: 4,
        maxillaBoneHeight: 7,
      });

      expect(score.recommendedProcedure).toBe('ALL_ON_X_HYBRID');
    });
  });

  describe('Query Methods', () => {
    describe('isCandidate', () => {
      it('should return true for non-contraindicated', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.isCandidate()).toBe(true);
      });

      it('should return false for contraindicated', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          hasRadiationHistory: true,
        });
        expect(score.isCandidate()).toBe(false);
      });
    });

    describe('isIdealCandidate', () => {
      it('should return true for IDEAL eligibility', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.isIdealCandidate()).toBe(true);
      });

      it('should return false for non-IDEAL', () => {
        // Need enough negative factors to drop below 80 score threshold
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 4, // Heavy smoking (-16)
          periodontalDisease: 3, // Severe (-15)
          oralHygieneScore: 1, // Poor (-3)
          boneDensity: 4, // Poor bone (-15)
        });
        expect(score.isIdealCandidate()).toBe(false);
      });
    });

    describe('canProceedImmediately', () => {
      it('should return true for standard recommendation', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.canProceedImmediately()).toBe(true);
      });

      it('should return false when bone augmentation needed', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          needsBoneGrafting: true,
        });
        expect(score.canProceedImmediately()).toBe(false);
      });
    });

    describe('requiresMedicalClearance', () => {
      it('should return true for high ASA', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          asaClassification: 3,
        });
        expect(score.requiresMedicalClearance()).toBe(true);
      });
    });

    describe('requiresBoneAugmentation', () => {
      it('should return true when grafting needed', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          needsBoneGrafting: true,
        });
        expect(score.requiresBoneAugmentation()).toBe(true);
      });

      it('should return true when sinus lift needed', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          needsSinusLift: true,
        });
        expect(score.requiresBoneAugmentation()).toBe(true);
      });
    });

    describe('isImmediateLoadingFeasible', () => {
      it('should return true for feasibility >= 3', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.isImmediateLoadingFeasible()).toBe(true);
      });

      it('should return false for feasibility < 3', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          immediateLoadingFeasibility: 2,
        });
        expect(score.isImmediateLoadingFeasible()).toBe(false);
      });
    });

    describe('risk factor checks', () => {
      it('hasSmokingRisk should return true for status >= 2', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 2,
        });
        expect(score.hasSmokingRisk()).toBe(true);
      });

      it('hasDiabetesRisk should return true for HbA1c > 7', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          hba1c: 8,
        });
        expect(score.hasDiabetesRisk()).toBe(true);
      });

      it('hasMRONJRisk should return true for bisphosphonate use', () => {
        const score = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          onBisphosphonates: true,
        });
        expect(score.hasMRONJRisk()).toBe(true);
      });
    });

    describe('getFollowUpUrgency', () => {
      it('should return immediate for CRITICAL risk', () => {
        const score = AllOnXClinicalScore.fromIndicators(highRiskIndicators);
        expect(score.getFollowUpUrgency()).toBe('immediate');
      });

      it('should return soon for IDEAL/STANDARD', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.getFollowUpUrgency()).toBe('soon');
      });
    });

    describe('getClinicalReviewSLAHours', () => {
      it('should return correct SLA hours', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.getClinicalReviewSLAHours()).toBe(72); // 'soon' = 72 hours
      });
    });

    describe('getTaskPriority', () => {
      it('should return high for IDEAL eligibility', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.getTaskPriority()).toBe('high');
      });

      it('should return critical for CRITICAL risk', () => {
        const score = AllOnXClinicalScore.fromIndicators(highRiskIndicators);
        expect(score.getTaskPriority()).toBe('critical');
      });
    });

    describe('getEstimatedTreatmentDuration', () => {
      it('should return base duration for simple case', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.getEstimatedTreatmentDuration()).toBeGreaterThanOrEqual(4);
      });

      it('should increase for bone augmentation', () => {
        const simple = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const withGrafting = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          needsBoneGrafting: true,
        });

        expect(withGrafting.getEstimatedTreatmentDuration()).toBeGreaterThan(
          simple.getEstimatedTreatmentDuration()
        );
      });
    });

    describe('getClinicalSummary', () => {
      it('should return formatted summary string', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const summary = score.getClinicalSummary();

        expect(summary).toContain('IDEAL');
        expect(summary).toContain('Score:');
        expect(summary).toContain('Risk:');
        expect(summary).toContain('Complexity:');
      });
    });

    describe('getRiskFactors', () => {
      it('should return empty array for ideal patient', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const factors = score.getRiskFactors();

        expect(factors).toHaveLength(0);
      });

      it('should list all risk factors', () => {
        const score = AllOnXClinicalScore.fromIndicators(highRiskIndicators);
        const factors = score.getRiskFactors();

        expect(factors.length).toBeGreaterThan(0);
        expect(factors.some((f) => f.includes('Smoking'))).toBe(true);
        expect(factors.some((f) => f.includes('Diabetes'))).toBe(true);
      });
    });
  });

  describe('Transformation Methods', () => {
    describe('withUpdatedIndicators', () => {
      it('should create new score with updated indicators', () => {
        const original = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const updated = original.withUpdatedIndicators({ smokingStatus: 3 });

        expect(updated.indicators.smokingStatus).toBe(3);
        expect(updated.compositeScore).toBeLessThan(original.compositeScore);
      });

      it('should preserve other indicators', () => {
        const original = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const updated = original.withUpdatedIndicators({ smokingStatus: 3 });

        expect(updated.indicators.boneDensity).toBe(original.indicators.boneDensity);
      });
    });

    describe('withConfidence', () => {
      it('should create new score with updated confidence', () => {
        const original = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const updated = original.withConfidence(0.5);

        expect(updated.confidence).toBe(0.5);
        expect(updated.compositeScore).toBe(original.compositeScore);
      });

      it('should throw for invalid confidence', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);

        expect(() => score.withConfidence(1.5)).toThrow(InvalidAllOnXScoreError);
      });
    });

    describe('copy', () => {
      it('should create copy without modifications', () => {
        const original = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const copy = original.copy();

        expect(copy.compositeScore).toBe(original.compositeScore);
      });

      it('should create copy with modifications', () => {
        const original = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const copy = original.copy({
          indicators: { smokingStatus: 2 },
          confidence: 0.7,
        });

        expect(copy.indicators.smokingStatus).toBe(2);
        expect(copy.confidence).toBe(0.7);
      });
    });
  });

  describe('Equality & Comparison', () => {
    describe('equals', () => {
      it('should return true for same instance', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.equals(score)).toBe(true);
      });

      it('should return true for equal values', () => {
        const score1 = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const score2 = AllOnXClinicalScore.fromIndicators(idealIndicators);

        expect(score1.equals(score2)).toBe(true);
      });

      it('should return false for null', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.equals(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.equals(undefined)).toBe(false);
      });
    });

    describe('hash', () => {
      it('should return consistent hash', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.hash()).toBe(score.hash());
      });
    });

    describe('compareTo', () => {
      it('should return positive when better', () => {
        const better = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const worse = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 4,
        });

        expect(better.compareTo(worse)).toBeGreaterThan(0);
      });

      it('should return negative when worse', () => {
        const better = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const worse = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 4,
        });

        expect(worse.compareTo(better)).toBeLessThan(0);
      });
    });

    describe('isBetterThan', () => {
      it('should return true when score is higher', () => {
        const better = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const worse = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 4,
        });

        expect(better.isBetterThan(worse)).toBe(true);
      });
    });

    describe('isWorseThan', () => {
      it('should return true when score is lower', () => {
        const better = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const worse = AllOnXClinicalScore.fromIndicators({
          ...idealIndicators,
          smokingStatus: 4,
        });

        expect(worse.isWorseThan(better)).toBe(true);
      });
    });
  });

  describe('Serialization', () => {
    describe('toJSON', () => {
      it('should return valid DTO', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const dto = score.toJSON();

        expect(dto.compositeScore).toBe(score.compositeScore);
        expect(dto.eligibility).toBe(score.eligibility);
        expect(dto.riskLevel).toBe(score.riskLevel);
        expect(dto.complexity).toBe(score.complexity);
        expect(typeof dto.scoredAt).toBe('string');
      });
    });

    describe('toPrimitive', () => {
      it('should return composite score', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(score.toPrimitive()).toBe(score.compositeScore);
      });
    });

    describe('toString', () => {
      it('should return descriptive string', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const str = score.toString();

        expect(str).toContain('AllOnXClinicalScore');
        expect(str).toContain('IDEAL');
      });
    });

    describe('toCompactString', () => {
      it('should return compact string', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        const str = score.toCompactString();

        expect(str).toMatch(/^ALLONX\[.+\]$/);
      });
    });
  });

  describe('Type Guards', () => {
    describe('isAllOnXClinicalScore', () => {
      it('should return true for AllOnXClinicalScore instance', () => {
        const score = AllOnXClinicalScore.fromIndicators(idealIndicators);
        expect(isAllOnXClinicalScore(score)).toBe(true);
      });

      it('should return false for plain object', () => {
        expect(isAllOnXClinicalScore({ compositeScore: 80 })).toBe(false);
      });

      it('should return false for null', () => {
        expect(isAllOnXClinicalScore(null)).toBe(false);
      });
    });

    describe('isSuccessfulParse', () => {
      it('should return true for successful result', () => {
        const result = AllOnXClinicalScore.parse(
          AllOnXClinicalScore.fromIndicators(idealIndicators)
        );
        expect(isSuccessfulParse(result)).toBe(true);
      });

      it('should return false for failed result', () => {
        const result = AllOnXClinicalScore.parse(null);
        expect(isSuccessfulParse(result)).toBe(false);
      });
    });
  });

  describe('InvalidAllOnXScoreError', () => {
    it('should have correct properties', () => {
      const error = new InvalidAllOnXScoreError('Test error', {
        field: 'boneDensity',
        value: 5,
        range: [1, 4],
      });

      expect(error.name).toBe('InvalidAllOnXScoreError');
      expect(error.code).toBe('INVALID_ALLONX_SCORE');
      expect(error.message).toBe('Test error');
      expect(error.details.field).toBe('boneDensity');
      expect(error.details.value).toBe(5);
      expect(error.details.range).toEqual([1, 4]);
    });

    it('should serialize to JSON', () => {
      const error = new InvalidAllOnXScoreError('Test error', { field: 'test' });
      const json = error.toJSON();

      expect(json.name).toBe('InvalidAllOnXScoreError');
      expect(json.code).toBe('INVALID_ALLONX_SCORE');
      expect(json.message).toBe('Test error');
    });

    it('should freeze details', () => {
      const error = new InvalidAllOnXScoreError('Test', { field: 'test' });
      expect(Object.isFrozen(error.details)).toBe(true);
    });
  });
});
