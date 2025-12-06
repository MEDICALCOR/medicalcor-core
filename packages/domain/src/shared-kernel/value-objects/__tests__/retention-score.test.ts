import { describe, it, expect } from 'vitest';
import { RetentionScore, InvalidRetentionScoreError } from '../retention-score.js';

/**
 * Tests for RetentionScore Value Object
 *
 * Covers:
 * - Factory methods (fromNumeric, fromClassification, loyal, atRisk, etc.)
 * - Classification logic (score to classification mapping)
 * - Churn risk calculation
 * - Follow-up priority determination
 * - Business rule methods (isAtRisk, requiresUrgentIntervention, etc.)
 * - Transformation methods (improve, decrease, withConfidence)
 * - Equality and comparison
 * - Serialization (toJSON, toPrimitive, toString)
 * - Error handling for invalid inputs
 */

describe('RetentionScore Value Object', () => {
  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  describe('Factory Methods', () => {
    describe('fromNumeric', () => {
      it('should create score from valid numeric value', () => {
        const score = RetentionScore.fromNumeric(75);

        expect(score.numericValue).toBe(75);
        expect(score.confidence).toBe(0.8); // default
      });

      it('should accept custom confidence', () => {
        const score = RetentionScore.fromNumeric(80, 0.95);

        expect(score.numericValue).toBe(80);
        expect(score.confidence).toBe(0.95);
      });

      it('should reject negative scores', () => {
        expect(() => RetentionScore.fromNumeric(-5)).toThrow(InvalidRetentionScoreError);
      });

      it('should reject scores above 100', () => {
        expect(() => RetentionScore.fromNumeric(101)).toThrow(InvalidRetentionScoreError);
      });

      it('should reject invalid confidence', () => {
        expect(() => RetentionScore.fromNumeric(75, 1.5)).toThrow(InvalidRetentionScoreError);
        expect(() => RetentionScore.fromNumeric(75, -0.1)).toThrow(InvalidRetentionScoreError);
      });

      it('should round to integer', () => {
        const score = RetentionScore.fromNumeric(75.7);
        expect(score.numericValue).toBe(76);
      });

      it('should handle edge case values', () => {
        expect(RetentionScore.fromNumeric(0).numericValue).toBe(0);
        expect(RetentionScore.fromNumeric(100).numericValue).toBe(100);
      });
    });

    describe('fromClassification', () => {
      it('should create LOYAL score', () => {
        const score = RetentionScore.fromClassification('LOYAL');
        expect(score.classification).toBe('LOYAL');
        expect(score.numericValue).toBe(90);
      });

      it('should create STABLE score', () => {
        const score = RetentionScore.fromClassification('STABLE');
        expect(score.classification).toBe('STABLE');
        expect(score.numericValue).toBe(70);
      });

      it('should create AT_RISK score', () => {
        const score = RetentionScore.fromClassification('AT_RISK');
        expect(score.classification).toBe('AT_RISK');
        expect(score.numericValue).toBe(50);
      });

      it('should create CHURNING score', () => {
        const score = RetentionScore.fromClassification('CHURNING');
        expect(score.classification).toBe('CHURNING');
        expect(score.numericValue).toBe(30);
      });

      it('should create LOST score', () => {
        const score = RetentionScore.fromClassification('LOST');
        expect(score.classification).toBe('LOST');
        expect(score.numericValue).toBe(10);
      });
    });

    describe('convenience factory methods', () => {
      it('should create loyal score', () => {
        const score = RetentionScore.loyal();
        expect(score.isLoyal()).toBe(true);
        expect(score.numericValue).toBe(90);
      });

      it('should create stable score', () => {
        const score = RetentionScore.stable();
        expect(score.isStable()).toBe(true);
        expect(score.numericValue).toBe(70);
      });

      it('should create atRisk score', () => {
        const score = RetentionScore.atRisk();
        expect(score.isAtRisk()).toBe(true);
        expect(score.numericValue).toBe(50);
      });

      it('should create churning score', () => {
        const score = RetentionScore.churning();
        expect(score.isChurning()).toBe(true);
        expect(score.numericValue).toBe(30);
      });

      it('should create lost score', () => {
        const score = RetentionScore.lost();
        expect(score.isLost()).toBe(true);
        expect(score.numericValue).toBe(10);
      });
    });

    describe('parse', () => {
      it('should parse RetentionScore instance', () => {
        const original = RetentionScore.fromNumeric(75);
        const result = RetentionScore.parse(original);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(original);
        }
      });

      it('should parse numeric value', () => {
        const result = RetentionScore.parse(65);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(65);
        }
      });

      it('should parse object with numericValue', () => {
        const result = RetentionScore.parse({
          numericValue: 80,
          confidence: 0.9,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(80);
          expect(result.value.confidence).toBe(0.9);
        }
      });

      it('should return error for invalid type', () => {
        const result = RetentionScore.parse('invalid');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Cannot parse');
        }
      });

      it('should return error for out of range value', () => {
        const result = RetentionScore.parse(150);

        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  describe('Classification Logic', () => {
    it('should classify 80-100 as LOYAL', () => {
      expect(RetentionScore.fromNumeric(80).classification).toBe('LOYAL');
      expect(RetentionScore.fromNumeric(90).classification).toBe('LOYAL');
      expect(RetentionScore.fromNumeric(100).classification).toBe('LOYAL');
    });

    it('should classify 60-79 as STABLE', () => {
      expect(RetentionScore.fromNumeric(60).classification).toBe('STABLE');
      expect(RetentionScore.fromNumeric(70).classification).toBe('STABLE');
      expect(RetentionScore.fromNumeric(79).classification).toBe('STABLE');
    });

    it('should classify 40-59 as AT_RISK', () => {
      expect(RetentionScore.fromNumeric(40).classification).toBe('AT_RISK');
      expect(RetentionScore.fromNumeric(50).classification).toBe('AT_RISK');
      expect(RetentionScore.fromNumeric(59).classification).toBe('AT_RISK');
    });

    it('should classify 20-39 as CHURNING', () => {
      expect(RetentionScore.fromNumeric(20).classification).toBe('CHURNING');
      expect(RetentionScore.fromNumeric(30).classification).toBe('CHURNING');
      expect(RetentionScore.fromNumeric(39).classification).toBe('CHURNING');
    });

    it('should classify 0-19 as LOST', () => {
      expect(RetentionScore.fromNumeric(0).classification).toBe('LOST');
      expect(RetentionScore.fromNumeric(10).classification).toBe('LOST');
      expect(RetentionScore.fromNumeric(19).classification).toBe('LOST');
    });
  });

  // ============================================================================
  // CHURN RISK
  // ============================================================================

  describe('Churn Risk', () => {
    it('should set SCAZUT (low) for score >= 80', () => {
      expect(RetentionScore.fromNumeric(85).churnRisk).toBe('SCAZUT');
    });

    it('should set MEDIU for score 50-79', () => {
      expect(RetentionScore.fromNumeric(65).churnRisk).toBe('MEDIU');
      expect(RetentionScore.fromNumeric(50).churnRisk).toBe('MEDIU');
    });

    it('should set RIDICAT for score 30-49', () => {
      expect(RetentionScore.fromNumeric(40).churnRisk).toBe('RIDICAT');
    });

    it('should set FOARTE_RIDICAT for score < 30', () => {
      expect(RetentionScore.fromNumeric(20).churnRisk).toBe('FOARTE_RIDICAT');
      expect(RetentionScore.fromNumeric(0).churnRisk).toBe('FOARTE_RIDICAT');
    });
  });

  // ============================================================================
  // FOLLOW-UP PRIORITY
  // ============================================================================

  describe('Follow-up Priority', () => {
    it('should set URGENTA for very high risk', () => {
      const score = RetentionScore.fromNumeric(20, 0.8, 0);
      expect(score.followUpPriority).toBe('URGENTA');
    });

    it('should set URGENTA for high risk + high value', () => {
      const score = RetentionScore.fromNumeric(40, 0.8, 15000);
      expect(score.followUpPriority).toBe('URGENTA');
    });

    it('should set RIDICATA for high risk', () => {
      const score = RetentionScore.fromNumeric(40, 0.8, 5000);
      expect(score.followUpPriority).toBe('RIDICATA');
    });

    it('should set MEDIE for medium risk', () => {
      const score = RetentionScore.fromNumeric(60, 0.8, 5000);
      expect(score.followUpPriority).toBe('MEDIE');
    });

    it('should set SCAZUTA for low risk', () => {
      const score = RetentionScore.fromNumeric(90, 0.8, 5000);
      expect(score.followUpPriority).toBe('SCAZUTA');
    });
  });

  // ============================================================================
  // BUSINESS RULES
  // ============================================================================

  describe('Business Rules', () => {
    describe('classification checks', () => {
      it('isLoyal should return true for LOYAL', () => {
        expect(RetentionScore.fromNumeric(85).isLoyal()).toBe(true);
        expect(RetentionScore.fromNumeric(50).isLoyal()).toBe(false);
      });

      it('isStable should return true for STABLE', () => {
        expect(RetentionScore.fromNumeric(70).isStable()).toBe(true);
        expect(RetentionScore.fromNumeric(50).isStable()).toBe(false);
      });

      it('isAtRisk should return true for AT_RISK', () => {
        expect(RetentionScore.fromNumeric(50).isAtRisk()).toBe(true);
        expect(RetentionScore.fromNumeric(70).isAtRisk()).toBe(false);
      });

      it('isChurning should return true for CHURNING', () => {
        expect(RetentionScore.fromNumeric(30).isChurning()).toBe(true);
        expect(RetentionScore.fromNumeric(50).isChurning()).toBe(false);
      });

      it('isLost should return true for LOST', () => {
        expect(RetentionScore.fromNumeric(10).isLost()).toBe(true);
        expect(RetentionScore.fromNumeric(50).isLost()).toBe(false);
      });
    });

    describe('requiresUrgentIntervention', () => {
      it('should return true for high and very high risk', () => {
        expect(RetentionScore.fromNumeric(40).requiresUrgentIntervention()).toBe(true);
        expect(RetentionScore.fromNumeric(20).requiresUrgentIntervention()).toBe(true);
      });

      it('should return false for low and medium risk', () => {
        expect(RetentionScore.fromNumeric(90).requiresUrgentIntervention()).toBe(false);
        expect(RetentionScore.fromNumeric(60).requiresUrgentIntervention()).toBe(false);
      });
    });

    describe('needsProactiveOutreach', () => {
      it('should return true for AT_RISK and CHURNING', () => {
        expect(RetentionScore.fromNumeric(50).needsProactiveOutreach()).toBe(true);
        expect(RetentionScore.fromNumeric(30).needsProactiveOutreach()).toBe(true);
      });

      it('should return false for LOYAL, STABLE, and LOST', () => {
        expect(RetentionScore.fromNumeric(90).needsProactiveOutreach()).toBe(false);
        expect(RetentionScore.fromNumeric(70).needsProactiveOutreach()).toBe(false);
        expect(RetentionScore.fromNumeric(10).needsProactiveOutreach()).toBe(false);
      });
    });

    describe('shouldBeInRetentionCampaign', () => {
      it('should return true for score < 60', () => {
        expect(RetentionScore.fromNumeric(50).shouldBeInRetentionCampaign()).toBe(true);
        expect(RetentionScore.fromNumeric(30).shouldBeInRetentionCampaign()).toBe(true);
      });

      it('should return false for score >= 60', () => {
        expect(RetentionScore.fromNumeric(70).shouldBeInRetentionCampaign()).toBe(false);
        expect(RetentionScore.fromNumeric(90).shouldBeInRetentionCampaign()).toBe(false);
      });
    });

    describe('isHighConfidence', () => {
      it('should return true for confidence >= 0.8', () => {
        expect(RetentionScore.fromNumeric(70, 0.8).isHighConfidence()).toBe(true);
        expect(RetentionScore.fromNumeric(70, 0.9).isHighConfidence()).toBe(true);
      });

      it('should return false for confidence < 0.8', () => {
        expect(RetentionScore.fromNumeric(70, 0.7).isHighConfidence()).toBe(false);
      });
    });

    describe('getFollowUpSLAHours', () => {
      it('should return 4 hours for URGENTA', () => {
        const score = RetentionScore.fromNumeric(10, 0.8, 0);
        expect(score.getFollowUpSLAHours()).toBe(4);
      });

      it('should return 24 hours for RIDICATA', () => {
        const score = RetentionScore.fromNumeric(40, 0.8, 5000);
        expect(score.getFollowUpSLAHours()).toBe(24);
      });

      it('should return 72 hours for MEDIE', () => {
        const score = RetentionScore.fromNumeric(60, 0.8, 5000);
        expect(score.getFollowUpSLAHours()).toBe(72);
      });

      it('should return 168 hours for SCAZUTA', () => {
        const score = RetentionScore.fromNumeric(90, 0.8, 5000);
        expect(score.getFollowUpSLAHours()).toBe(168);
      });
    });

    describe('getSuggestedActions', () => {
      it('should return loyalty actions for LOYAL', () => {
        const actions = RetentionScore.fromNumeric(90).getSuggestedActions();
        expect(actions).toContain('send_loyalty_reward');
        expect(actions).toContain('request_referral');
      });

      it('should return engagement actions for STABLE', () => {
        const actions = RetentionScore.fromNumeric(70).getSuggestedActions();
        expect(actions).toContain('send_personalized_content');
        expect(actions).toContain('collect_nps_feedback');
      });

      it('should return outreach actions for AT_RISK', () => {
        const actions = RetentionScore.fromNumeric(50).getSuggestedActions();
        expect(actions).toContain('schedule_personal_call');
        expect(actions).toContain('send_special_offer');
      });

      it('should return intervention actions for CHURNING', () => {
        const actions = RetentionScore.fromNumeric(30).getSuggestedActions();
        expect(actions).toContain('immediate_outreach');
        expect(actions).toContain('manager_intervention');
      });

      it('should return win-back actions for LOST', () => {
        const actions = RetentionScore.fromNumeric(10).getSuggestedActions();
        expect(actions).toContain('win_back_campaign');
        expect(actions).toContain('reactivation_offer');
      });
    });
  });

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  describe('Transformation Methods', () => {
    describe('improve', () => {
      it('should increase score by default amount', () => {
        const original = RetentionScore.fromNumeric(70);
        const improved = original.improve();

        expect(improved.numericValue).toBe(75);
        expect(original.numericValue).toBe(70); // immutable
      });

      it('should increase score by custom amount', () => {
        const score = RetentionScore.fromNumeric(60).improve(15);
        expect(score.numericValue).toBe(75);
      });

      it('should not exceed 100', () => {
        const score = RetentionScore.fromNumeric(98).improve(10);
        expect(score.numericValue).toBe(100);
      });
    });

    describe('decrease', () => {
      it('should decrease score by default amount', () => {
        const original = RetentionScore.fromNumeric(70);
        const decreased = original.decrease();

        expect(decreased.numericValue).toBe(65);
        expect(original.numericValue).toBe(70); // immutable
      });

      it('should decrease score by custom amount', () => {
        const score = RetentionScore.fromNumeric(60).decrease(20);
        expect(score.numericValue).toBe(40);
      });

      it('should not go below 0', () => {
        const score = RetentionScore.fromNumeric(5).decrease(10);
        expect(score.numericValue).toBe(0);
      });
    });

    describe('withConfidence', () => {
      it('should create new score with updated confidence', () => {
        const original = RetentionScore.fromNumeric(70, 0.8);
        const updated = original.withConfidence(0.95);

        expect(updated.confidence).toBe(0.95);
        expect(original.confidence).toBe(0.8); // immutable
        expect(updated.numericValue).toBe(70); // value preserved
      });
    });
  });

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  describe('Equality & Comparison', () => {
    describe('equals', () => {
      it('should return true for same value and classification', () => {
        const score1 = RetentionScore.fromNumeric(75);
        const score2 = RetentionScore.fromNumeric(75);

        expect(score1.equals(score2)).toBe(true);
      });

      it('should return false for different values', () => {
        const score1 = RetentionScore.fromNumeric(75);
        const score2 = RetentionScore.fromNumeric(80);

        expect(score1.equals(score2)).toBe(false);
      });
    });

    describe('compareTo', () => {
      it('should return positive when this > other', () => {
        const higher = RetentionScore.fromNumeric(80);
        const lower = RetentionScore.fromNumeric(60);

        expect(higher.compareTo(lower)).toBeGreaterThan(0);
      });

      it('should return negative when this < other', () => {
        const lower = RetentionScore.fromNumeric(60);
        const higher = RetentionScore.fromNumeric(80);

        expect(lower.compareTo(higher)).toBeLessThan(0);
      });

      it('should return 0 when equal', () => {
        const score1 = RetentionScore.fromNumeric(70);
        const score2 = RetentionScore.fromNumeric(70);

        expect(score1.compareTo(score2)).toBe(0);
      });
    });

    describe('isHigherThan / isLowerThan', () => {
      it('isHigherThan should return true when score is higher', () => {
        const higher = RetentionScore.fromNumeric(80);
        const lower = RetentionScore.fromNumeric(60);

        expect(higher.isHigherThan(lower)).toBe(true);
        expect(lower.isHigherThan(higher)).toBe(false);
      });

      it('isLowerThan should return true when score is lower', () => {
        const higher = RetentionScore.fromNumeric(80);
        const lower = RetentionScore.fromNumeric(60);

        expect(lower.isLowerThan(higher)).toBe(true);
        expect(higher.isLowerThan(lower)).toBe(false);
      });
    });
  });

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  describe('Serialization', () => {
    describe('toJSON', () => {
      it('should return complete DTO', () => {
        const score = RetentionScore.fromNumeric(75, 0.85, 15000);
        const json = score.toJSON();

        expect(json).toMatchObject({
          numericValue: 75,
          classification: 'STABLE',
          churnRisk: 'MEDIU',
          confidence: 0.85,
        });
        expect(json.calculatedAt).toBeDefined();
      });
    });

    describe('toPrimitive', () => {
      it('should return numeric value', () => {
        const score = RetentionScore.fromNumeric(75);
        expect(score.toPrimitive()).toBe(75);
      });
    });

    describe('toString', () => {
      it('should return readable string', () => {
        const score = RetentionScore.fromNumeric(75, 0.85);
        const str = score.toString();

        expect(str).toContain('75');
        expect(str).toContain('STABLE');
        expect(str).toContain('MEDIU');
        expect(str).toContain('85%');
      });
    });
  });

  // ============================================================================
  // IMMUTABILITY
  // ============================================================================

  describe('Immutability', () => {
    it('should be frozen', () => {
      const score = RetentionScore.fromNumeric(70);

      expect(Object.isFrozen(score)).toBe(true);
    });

    it('should not allow property modification', () => {
      const score = RetentionScore.fromNumeric(70);

      expect(() => {
        (score as unknown as { numericValue: number }).numericValue = 90;
      }).toThrow();
    });
  });
});
