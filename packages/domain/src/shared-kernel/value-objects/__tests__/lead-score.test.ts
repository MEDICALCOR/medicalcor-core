/**
 * @fileoverview Tests for LeadScore Value Object
 *
 * Tests factory methods, classification logic, query methods, transformations,
 * equality, and serialization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LeadScore,
  InvalidLeadScoreError,
  type LeadClassification,
  type LeadScoreDTO,
} from '../lead-score.js';

describe('LeadScore', () => {
  const mockTimestamp = new Date('2024-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Factory Methods', () => {
    describe('fromNumeric', () => {
      it('should create score from valid numeric value', () => {
        const score = LeadScore.fromNumeric(4);

        expect(score.numericValue).toBe(4);
        expect(score.classification).toBe('HOT');
        expect(score.confidence).toBe(0.8); // default confidence
      });

      it('should accept custom confidence', () => {
        const score = LeadScore.fromNumeric(3, 0.95);

        expect(score.confidence).toBe(0.95);
      });

      it('should set scoredAt to current time', () => {
        const score = LeadScore.fromNumeric(4);

        expect(score.scoredAt).toEqual(mockTimestamp);
      });

      it('should freeze the object', () => {
        const score = LeadScore.fromNumeric(4);

        expect(Object.isFrozen(score)).toBe(true);
      });

      it('should throw for score below 1', () => {
        expect(() => LeadScore.fromNumeric(0)).toThrow(InvalidLeadScoreError);
      });

      it('should throw for score above 5', () => {
        expect(() => LeadScore.fromNumeric(6)).toThrow(InvalidLeadScoreError);
      });

      it('should throw for non-integer score', () => {
        expect(() => LeadScore.fromNumeric(3.5)).toThrow(InvalidLeadScoreError);
      });

      it('should throw for NaN', () => {
        expect(() => LeadScore.fromNumeric(NaN)).toThrow(InvalidLeadScoreError);
      });

      it('should throw for invalid confidence (negative)', () => {
        expect(() => LeadScore.fromNumeric(4, -0.1)).toThrow(InvalidLeadScoreError);
      });

      it('should throw for invalid confidence (above 1)', () => {
        expect(() => LeadScore.fromNumeric(4, 1.5)).toThrow(InvalidLeadScoreError);
      });
    });

    describe('hot', () => {
      it('should create HOT score with value 4 by default', () => {
        const score = LeadScore.hot();

        expect(score.numericValue).toBe(4);
        expect(score.classification).toBe('HOT');
        expect(score.confidence).toBe(0.85);
      });

      it('should create max qualified HOT score with value 5', () => {
        const score = LeadScore.hot(true);

        expect(score.numericValue).toBe(5);
        expect(score.classification).toBe('HOT');
      });

      it('should accept custom confidence', () => {
        const score = LeadScore.hot(false, 0.9);

        expect(score.confidence).toBe(0.9);
      });
    });

    describe('warm', () => {
      it('should create WARM score with value 3', () => {
        const score = LeadScore.warm();

        expect(score.numericValue).toBe(3);
        expect(score.classification).toBe('WARM');
        expect(score.confidence).toBe(0.8);
      });

      it('should accept custom confidence', () => {
        const score = LeadScore.warm(0.7);

        expect(score.confidence).toBe(0.7);
      });
    });

    describe('cold', () => {
      it('should create COLD score with value 2', () => {
        const score = LeadScore.cold();

        expect(score.numericValue).toBe(2);
        expect(score.classification).toBe('COLD');
        expect(score.confidence).toBe(0.75);
      });
    });

    describe('unqualified', () => {
      it('should create UNQUALIFIED score with value 1', () => {
        const score = LeadScore.unqualified();

        expect(score.numericValue).toBe(1);
        expect(score.classification).toBe('UNQUALIFIED');
        expect(score.confidence).toBe(0.7);
      });
    });

    describe('fromClassification', () => {
      it('should create score from HOT classification', () => {
        const score = LeadScore.fromClassification('HOT');

        expect(score.numericValue).toBe(4);
        expect(score.classification).toBe('HOT');
      });

      it('should create max qualified HOT score when isMaxQualified is true', () => {
        const score = LeadScore.fromClassification('HOT', 0.8, true);

        expect(score.numericValue).toBe(5);
        expect(score.classification).toBe('HOT');
      });

      it('should create score from WARM classification', () => {
        const score = LeadScore.fromClassification('WARM');

        expect(score.numericValue).toBe(3);
        expect(score.classification).toBe('WARM');
      });

      it('should create score from COLD classification', () => {
        const score = LeadScore.fromClassification('COLD');

        expect(score.numericValue).toBe(2);
        expect(score.classification).toBe('COLD');
      });

      it('should create score from UNQUALIFIED classification', () => {
        const score = LeadScore.fromClassification('UNQUALIFIED');

        expect(score.numericValue).toBe(1);
        expect(score.classification).toBe('UNQUALIFIED');
      });

      it('should accept custom confidence', () => {
        const score = LeadScore.fromClassification('WARM', 0.9);

        expect(score.confidence).toBe(0.9);
      });
    });

    describe('parse', () => {
      it('should return success for LeadScore instance', () => {
        const original = LeadScore.hot();
        const result = LeadScore.parse(original);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(original);
        }
      });

      it('should parse number', () => {
        const result = LeadScore.parse(4);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(4);
        }
      });

      it('should parse numeric string', () => {
        const result = LeadScore.parse('3');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(3);
        }
      });

      it('should parse classification string', () => {
        const result = LeadScore.parse('HOT');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.classification).toBe('HOT');
        }
      });

      it('should parse lowercase classification string', () => {
        const result = LeadScore.parse('warm');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.classification).toBe('WARM');
        }
      });

      it('should parse object with numericValue', () => {
        const result = LeadScore.parse({ numericValue: 4, confidence: 0.9 });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(4);
          expect(result.value.confidence).toBe(0.9);
        }
      });

      it('should return failure for invalid number', () => {
        const result = LeadScore.parse(10);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('between 1 and 5');
        }
      });

      it('should return failure for invalid string', () => {
        const result = LeadScore.parse('invalid');

        expect(result.success).toBe(false);
      });

      it('should return failure for null', () => {
        const result = LeadScore.parse(null);

        expect(result.success).toBe(false);
      });
    });
  });

  describe('Classification Logic', () => {
    it('should classify score 5 as HOT', () => {
      expect(LeadScore.fromNumeric(5).classification).toBe('HOT');
    });

    it('should classify score 4 as HOT', () => {
      expect(LeadScore.fromNumeric(4).classification).toBe('HOT');
    });

    it('should classify score 3 as WARM', () => {
      expect(LeadScore.fromNumeric(3).classification).toBe('WARM');
    });

    it('should classify score 2 as COLD', () => {
      expect(LeadScore.fromNumeric(2).classification).toBe('COLD');
    });

    it('should classify score 1 as UNQUALIFIED', () => {
      expect(LeadScore.fromNumeric(1).classification).toBe('UNQUALIFIED');
    });
  });

  describe('Query Methods', () => {
    describe('isHot', () => {
      it('should return true for HOT scores', () => {
        expect(LeadScore.fromNumeric(5).isHot()).toBe(true);
        expect(LeadScore.fromNumeric(4).isHot()).toBe(true);
      });

      it('should return false for non-HOT scores', () => {
        expect(LeadScore.fromNumeric(3).isHot()).toBe(false);
        expect(LeadScore.fromNumeric(2).isHot()).toBe(false);
        expect(LeadScore.fromNumeric(1).isHot()).toBe(false);
      });
    });

    describe('isWarm', () => {
      it('should return true for WARM scores', () => {
        expect(LeadScore.fromNumeric(3).isWarm()).toBe(true);
      });

      it('should return false for non-WARM scores', () => {
        expect(LeadScore.fromNumeric(4).isWarm()).toBe(false);
        expect(LeadScore.fromNumeric(2).isWarm()).toBe(false);
      });
    });

    describe('isCold', () => {
      it('should return true for COLD scores', () => {
        expect(LeadScore.fromNumeric(2).isCold()).toBe(true);
      });

      it('should return false for non-COLD scores', () => {
        expect(LeadScore.fromNumeric(3).isCold()).toBe(false);
      });
    });

    describe('isUnqualified', () => {
      it('should return true for UNQUALIFIED scores', () => {
        expect(LeadScore.fromNumeric(1).isUnqualified()).toBe(true);
      });

      it('should return false for non-UNQUALIFIED scores', () => {
        expect(LeadScore.fromNumeric(2).isUnqualified()).toBe(false);
      });
    });

    describe('requiresImmediateAttention', () => {
      it('should return true for HOT leads', () => {
        expect(LeadScore.hot().requiresImmediateAttention()).toBe(true);
      });

      it('should return false for non-HOT leads', () => {
        expect(LeadScore.warm().requiresImmediateAttention()).toBe(false);
        expect(LeadScore.cold().requiresImmediateAttention()).toBe(false);
      });
    });

    describe('requiresNurturing', () => {
      it('should return true for COLD and WARM leads', () => {
        expect(LeadScore.cold().requiresNurturing()).toBe(true);
        expect(LeadScore.warm().requiresNurturing()).toBe(true);
      });

      it('should return false for HOT and UNQUALIFIED leads', () => {
        expect(LeadScore.hot().requiresNurturing()).toBe(false);
        expect(LeadScore.unqualified().requiresNurturing()).toBe(false);
      });
    });

    describe('shouldAutoAssignToSales', () => {
      it('should return true only for HOT leads', () => {
        expect(LeadScore.hot().shouldAutoAssignToSales()).toBe(true);
        expect(LeadScore.warm().shouldAutoAssignToSales()).toBe(false);
      });
    });

    describe('isHighConfidence', () => {
      it('should return true for confidence >= 0.8', () => {
        expect(LeadScore.fromNumeric(4, 0.8).isHighConfidence()).toBe(true);
        expect(LeadScore.fromNumeric(4, 0.9).isHighConfidence()).toBe(true);
      });

      it('should return false for confidence < 0.8', () => {
        expect(LeadScore.fromNumeric(4, 0.7).isHighConfidence()).toBe(false);
      });
    });

    describe('getSLAResponseTimeMinutes', () => {
      it('should return 5 minutes for HOT leads', () => {
        expect(LeadScore.hot().getSLAResponseTimeMinutes()).toBe(5);
      });

      it('should return 60 minutes for WARM leads', () => {
        expect(LeadScore.warm().getSLAResponseTimeMinutes()).toBe(60);
      });

      it('should return 1440 minutes (24h) for COLD leads', () => {
        expect(LeadScore.cold().getSLAResponseTimeMinutes()).toBe(1440);
      });

      it('should return 4320 minutes (72h) for UNQUALIFIED leads', () => {
        expect(LeadScore.unqualified().getSLAResponseTimeMinutes()).toBe(4320);
      });
    });

    describe('getTaskPriority', () => {
      it('should return critical for score 5', () => {
        expect(LeadScore.fromNumeric(5).getTaskPriority()).toBe('critical');
      });

      it('should return high for score 4', () => {
        expect(LeadScore.fromNumeric(4).getTaskPriority()).toBe('high');
      });

      it('should return medium for WARM', () => {
        expect(LeadScore.warm().getTaskPriority()).toBe('medium');
      });

      it('should return low for COLD and UNQUALIFIED', () => {
        expect(LeadScore.cold().getTaskPriority()).toBe('low');
        expect(LeadScore.unqualified().getTaskPriority()).toBe('low');
      });
    });
  });

  describe('Transformation Methods', () => {
    describe('boost', () => {
      it('should increase score by 1 by default', () => {
        const original = LeadScore.fromNumeric(3);
        const boosted = original.boost();

        expect(boosted.numericValue).toBe(4);
        expect(original.numericValue).toBe(3); // immutability
      });

      it('should increase score by specified amount', () => {
        const boosted = LeadScore.fromNumeric(2).boost(2);

        expect(boosted.numericValue).toBe(4);
      });

      it('should cap at 5', () => {
        const boosted = LeadScore.fromNumeric(4).boost(3);

        expect(boosted.numericValue).toBe(5);
      });

      it('should preserve confidence', () => {
        const original = LeadScore.fromNumeric(3, 0.9);
        const boosted = original.boost();

        expect(boosted.confidence).toBe(0.9);
      });
    });

    describe('decrease', () => {
      it('should decrease score by 1 by default', () => {
        const original = LeadScore.fromNumeric(4);
        const decreased = original.decrease();

        expect(decreased.numericValue).toBe(3);
      });

      it('should decrease score by specified amount', () => {
        const decreased = LeadScore.fromNumeric(5).decrease(2);

        expect(decreased.numericValue).toBe(3);
      });

      it('should floor at 1', () => {
        const decreased = LeadScore.fromNumeric(2).decrease(3);

        expect(decreased.numericValue).toBe(1);
      });
    });

    describe('withConfidence', () => {
      it('should create new score with updated confidence', () => {
        const original = LeadScore.fromNumeric(4, 0.7);
        const updated = original.withConfidence(0.95);

        expect(updated.confidence).toBe(0.95);
        expect(updated.numericValue).toBe(4);
        expect(original.confidence).toBe(0.7); // immutability
      });

      it('should preserve scoredAt', () => {
        const original = LeadScore.fromNumeric(4);
        const updated = original.withConfidence(0.9);

        expect(updated.scoredAt).toEqual(original.scoredAt);
      });
    });
  });

  describe('Equality & Comparison', () => {
    describe('equals', () => {
      it('should return true for equal scores', () => {
        const score1 = LeadScore.fromNumeric(4);
        const score2 = LeadScore.fromNumeric(4);

        expect(score1.equals(score2)).toBe(true);
      });

      it('should return false for different numeric values', () => {
        const score1 = LeadScore.fromNumeric(4);
        const score2 = LeadScore.fromNumeric(3);

        expect(score1.equals(score2)).toBe(false);
      });

      it('should ignore confidence in equality', () => {
        const score1 = LeadScore.fromNumeric(4, 0.7);
        const score2 = LeadScore.fromNumeric(4, 0.9);

        expect(score1.equals(score2)).toBe(true);
      });
    });

    describe('compareTo', () => {
      it('should return positive when this > other', () => {
        const higher = LeadScore.fromNumeric(4);
        const lower = LeadScore.fromNumeric(2);

        expect(higher.compareTo(lower)).toBeGreaterThan(0);
      });

      it('should return negative when this < other', () => {
        const lower = LeadScore.fromNumeric(2);
        const higher = LeadScore.fromNumeric(4);

        expect(lower.compareTo(higher)).toBeLessThan(0);
      });

      it('should return 0 when equal', () => {
        const score1 = LeadScore.fromNumeric(3);
        const score2 = LeadScore.fromNumeric(3);

        expect(score1.compareTo(score2)).toBe(0);
      });
    });

    describe('isHigherThan', () => {
      it('should return true when score is higher', () => {
        expect(LeadScore.fromNumeric(4).isHigherThan(LeadScore.fromNumeric(3))).toBe(true);
      });

      it('should return false when score is lower or equal', () => {
        expect(LeadScore.fromNumeric(3).isHigherThan(LeadScore.fromNumeric(4))).toBe(false);
        expect(LeadScore.fromNumeric(3).isHigherThan(LeadScore.fromNumeric(3))).toBe(false);
      });
    });

    describe('isLowerThan', () => {
      it('should return true when score is lower', () => {
        expect(LeadScore.fromNumeric(2).isLowerThan(LeadScore.fromNumeric(4))).toBe(true);
      });

      it('should return false when score is higher or equal', () => {
        expect(LeadScore.fromNumeric(4).isLowerThan(LeadScore.fromNumeric(2))).toBe(false);
        expect(LeadScore.fromNumeric(3).isLowerThan(LeadScore.fromNumeric(3))).toBe(false);
      });
    });
  });

  describe('Serialization', () => {
    describe('toJSON', () => {
      it('should return valid DTO', () => {
        const score = LeadScore.fromNumeric(4, 0.85);
        const dto = score.toJSON();

        expect(dto.numericValue).toBe(4);
        expect(dto.classification).toBe('HOT');
        expect(dto.confidence).toBe(0.85);
        expect(dto.scoredAt).toBe(mockTimestamp.toISOString());
      });
    });

    describe('toPrimitive', () => {
      it('should return numeric value', () => {
        expect(LeadScore.fromNumeric(4).toPrimitive()).toBe(4);
      });
    });

    describe('toString', () => {
      it('should return formatted string', () => {
        const score = LeadScore.fromNumeric(4, 0.85);
        const str = score.toString();

        expect(str).toContain('LeadScore');
        expect(str).toContain('4');
        expect(str).toContain('HOT');
        expect(str).toContain('85%');
      });
    });
  });

  describe('InvalidLeadScoreError', () => {
    it('should have correct properties', () => {
      const error = new InvalidLeadScoreError('Test error');

      expect(error.name).toBe('InvalidLeadScoreError');
      expect(error.code).toBe('INVALID_LEAD_SCORE');
      expect(error.message).toBe('Test error');
    });
  });
});
