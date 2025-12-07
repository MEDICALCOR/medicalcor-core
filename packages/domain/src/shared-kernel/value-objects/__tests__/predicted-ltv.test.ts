import { describe, it, expect } from 'vitest';
import { PredictedLTV, InvalidPredictedLTVError } from '../predicted-ltv.js';

/**
 * Tests for PredictedLTV Value Object
 *
 * Covers:
 * - Factory methods
 * - Tier classification
 * - Growth potential
 * - Investment priority
 * - Business rules
 * - Immutability
 * - Equality and comparison
 * - Serialization
 */

describe('PredictedLTV', () => {
  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  describe('Factory Methods', () => {
    it('should create from numeric value', () => {
      const pltv = PredictedLTV.fromValue(25000);

      expect(pltv.predictedValue).toBe(25000);
      expect(pltv.tier).toBe('GOLD');
      expect(pltv.confidence).toBe(0.8);
    });

    it('should create from value with custom confidence', () => {
      const pltv = PredictedLTV.fromValue(30000, 0.9);

      expect(pltv.predictedValue).toBe(30000);
      expect(pltv.confidence).toBe(0.9);
    });

    it('should create from value with growth potential', () => {
      const pltv = PredictedLTV.fromValue(20000, 0.85, 'HIGH_GROWTH');

      expect(pltv.predictedValue).toBe(20000);
      expect(pltv.growthPotential).toBe('HIGH_GROWTH');
    });

    it('should create diamond tier', () => {
      const pltv = PredictedLTV.diamond();

      expect(pltv.tier).toBe('DIAMOND');
      expect(pltv.predictedValue).toBe(60000);
    });

    it('should create platinum tier', () => {
      const pltv = PredictedLTV.platinum();

      expect(pltv.tier).toBe('PLATINUM');
      expect(pltv.predictedValue).toBe(40000);
    });

    it('should create gold tier', () => {
      const pltv = PredictedLTV.gold();

      expect(pltv.tier).toBe('GOLD');
      expect(pltv.predictedValue).toBe(22500);
    });

    it('should create silver tier', () => {
      const pltv = PredictedLTV.silver();

      expect(pltv.tier).toBe('SILVER');
      expect(pltv.predictedValue).toBe(10000);
    });

    it('should create bronze tier', () => {
      const pltv = PredictedLTV.bronze();

      expect(pltv.tier).toBe('BRONZE');
      expect(pltv.predictedValue).toBe(2500);
    });

    it('should create from tier classification', () => {
      const pltv = PredictedLTV.fromTier('PLATINUM');

      expect(pltv.tier).toBe('PLATINUM');
      expect(pltv.predictedValue).toBe(40000);
    });
  });

  // ============================================================================
  // VALIDATION
  // ============================================================================

  describe('Validation', () => {
    it('should throw for negative value', () => {
      expect(() => PredictedLTV.fromValue(-100)).toThrow(InvalidPredictedLTVError);
    });

    it('should throw for invalid confidence', () => {
      expect(() => PredictedLTV.fromValue(10000, 1.5)).toThrow(InvalidPredictedLTVError);
      expect(() => PredictedLTV.fromValue(10000, -0.1)).toThrow(InvalidPredictedLTVError);
    });

    it('should allow zero value', () => {
      const pltv = PredictedLTV.fromValue(0);

      expect(pltv.predictedValue).toBe(0);
      expect(pltv.tier).toBe('BRONZE');
    });
  });

  // ============================================================================
  // TIER CLASSIFICATION
  // ============================================================================

  describe('Tier Classification', () => {
    it('should classify DIAMOND for >= 50000', () => {
      expect(PredictedLTV.fromValue(50000).tier).toBe('DIAMOND');
      expect(PredictedLTV.fromValue(100000).tier).toBe('DIAMOND');
    });

    it('should classify PLATINUM for 30000-49999', () => {
      expect(PredictedLTV.fromValue(30000).tier).toBe('PLATINUM');
      expect(PredictedLTV.fromValue(49999).tier).toBe('PLATINUM');
    });

    it('should classify GOLD for 15000-29999', () => {
      expect(PredictedLTV.fromValue(15000).tier).toBe('GOLD');
      expect(PredictedLTV.fromValue(29999).tier).toBe('GOLD');
    });

    it('should classify SILVER for 5000-14999', () => {
      expect(PredictedLTV.fromValue(5000).tier).toBe('SILVER');
      expect(PredictedLTV.fromValue(14999).tier).toBe('SILVER');
    });

    it('should classify BRONZE for < 5000', () => {
      expect(PredictedLTV.fromValue(4999).tier).toBe('BRONZE');
      expect(PredictedLTV.fromValue(0).tier).toBe('BRONZE');
    });
  });

  // ============================================================================
  // INVESTMENT PRIORITY
  // ============================================================================

  describe('Investment Priority', () => {
    it('should give PRIORITATE_MAXIMA to DIAMOND', () => {
      const pltv = PredictedLTV.diamond();

      expect(pltv.investmentPriority).toBe('PRIORITATE_MAXIMA');
    });

    it('should give PRIORITATE_MAXIMA to PLATINUM with HIGH_GROWTH', () => {
      const pltv = PredictedLTV.fromValue(40000, 0.8, 'HIGH_GROWTH');

      expect(pltv.investmentPriority).toBe('PRIORITATE_MAXIMA');
    });

    it('should give PRIORITATE_RIDICATA to PLATINUM with STABLE growth', () => {
      const pltv = PredictedLTV.fromValue(40000, 0.8, 'STABLE');

      expect(pltv.investmentPriority).toBe('PRIORITATE_RIDICATA');
    });

    it('should give PRIORITATE_SCAZUTA to BRONZE', () => {
      const pltv = PredictedLTV.bronze();

      expect(pltv.investmentPriority).toBe('PRIORITATE_SCAZUTA');
    });
  });

  // ============================================================================
  // BUSINESS RULES
  // ============================================================================

  describe('Business Rules', () => {
    it('should identify high-value patients', () => {
      expect(PredictedLTV.diamond().isHighValue()).toBe(true);
      expect(PredictedLTV.platinum().isHighValue()).toBe(true);
      expect(PredictedLTV.gold().isHighValue()).toBe(true);
      expect(PredictedLTV.silver().isHighValue()).toBe(false);
      expect(PredictedLTV.bronze().isHighValue()).toBe(false);
    });

    it('should identify VIP candidates', () => {
      expect(PredictedLTV.diamond().shouldBeVIP()).toBe(true);
      expect(PredictedLTV.platinum().shouldBeVIP()).toBe(true);
      expect(PredictedLTV.gold().shouldBeVIP()).toBe(false);
    });

    it('should identify priority investment needs', () => {
      expect(PredictedLTV.diamond().requiresPriorityInvestment()).toBe(true);
      expect(PredictedLTV.platinum().requiresPriorityInvestment()).toBe(true);
      expect(PredictedLTV.bronze().requiresPriorityInvestment()).toBe(false);
    });

    it('should identify growth potential', () => {
      const growing = PredictedLTV.fromValue(20000, 0.8, 'HIGH_GROWTH');
      const stable = PredictedLTV.fromValue(20000, 0.8, 'STABLE');

      expect(growing.hasGrowthPotential()).toBe(true);
      expect(stable.hasGrowthPotential()).toBe(false);
    });

    it('should identify declining trends', () => {
      const declining = PredictedLTV.fromValue(10000, 0.8, 'DECLINING');

      expect(declining.isDeclining()).toBe(true);
    });

    it('should identify high confidence predictions', () => {
      const highConf = PredictedLTV.fromValue(10000, 0.9);
      const lowConf = PredictedLTV.fromValue(10000, 0.6);

      expect(highConf.isHighConfidence()).toBe(true);
      expect(lowConf.isHighConfidence()).toBe(false);
    });

    it('should provide correct follow-up SLA', () => {
      expect(PredictedLTV.diamond().getFollowUpSLAHours()).toBe(2);
      expect(PredictedLTV.platinum().getFollowUpSLAHours()).toBe(8);
      expect(PredictedLTV.gold().getFollowUpSLAHours()).toBe(24);
      expect(PredictedLTV.bronze().getFollowUpSLAHours()).toBe(72);
    });

    it('should provide investment actions', () => {
      const diamond = PredictedLTV.diamond();
      const actions = diamond.getInvestmentActions();

      expect(actions).toContain('assign_dedicated_coordinator');
      expect(actions).toContain('schedule_vip_consultation');
    });
  });

  // ============================================================================
  // TRANSFORMATIONS
  // ============================================================================

  describe('Transformations', () => {
    it('should increase value immutably', () => {
      const original = PredictedLTV.fromValue(20000);
      const increased = original.increase(10000);

      expect(increased.predictedValue).toBe(30000);
      expect(original.predictedValue).toBe(20000);
    });

    it('should decrease value immutably', () => {
      const original = PredictedLTV.fromValue(20000);
      const decreased = original.decrease(5000);

      expect(decreased.predictedValue).toBe(15000);
      expect(original.predictedValue).toBe(20000);
    });

    it('should not decrease below zero', () => {
      const original = PredictedLTV.fromValue(1000);
      const decreased = original.decrease(5000);

      expect(decreased.predictedValue).toBe(0);
    });

    it('should apply growth multiplier', () => {
      const original = PredictedLTV.fromValue(10000);
      const grown = original.applyGrowth(1.5);

      expect(grown.predictedValue).toBe(15000);
    });

    it('should update confidence immutably', () => {
      const original = PredictedLTV.fromValue(20000, 0.7);
      const updated = original.withConfidence(0.9);

      expect(updated.confidence).toBe(0.9);
      expect(original.confidence).toBe(0.7);
    });

    it('should update growth potential immutably', () => {
      const original = PredictedLTV.fromValue(20000, 0.8, 'STABLE');
      const updated = original.withGrowthPotential('HIGH_GROWTH');

      expect(updated.growthPotential).toBe('HIGH_GROWTH');
      expect(original.growthPotential).toBe('STABLE');
    });
  });

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  describe('Equality & Comparison', () => {
    it('should be equal by value', () => {
      const pltv1 = PredictedLTV.fromValue(25000);
      const pltv2 = PredictedLTV.fromValue(25000);

      expect(pltv1.equals(pltv2)).toBe(true);
    });

    it('should not be equal with different values', () => {
      const pltv1 = PredictedLTV.fromValue(25000);
      const pltv2 = PredictedLTV.fromValue(30000);

      expect(pltv1.equals(pltv2)).toBe(false);
    });

    it('should compare correctly', () => {
      const low = PredictedLTV.fromValue(10000);
      const high = PredictedLTV.fromValue(50000);

      expect(low.compareTo(high)).toBeLessThan(0);
      expect(high.compareTo(low)).toBeGreaterThan(0);
      expect(low.compareTo(low)).toBe(0);
    });

    it('should compare higher/lower correctly', () => {
      const low = PredictedLTV.fromValue(10000);
      const high = PredictedLTV.fromValue(50000);

      expect(high.isHigherThan(low)).toBe(true);
      expect(low.isLowerThan(high)).toBe(true);
    });

    it('should calculate difference', () => {
      const pltv1 = PredictedLTV.fromValue(30000);
      const pltv2 = PredictedLTV.fromValue(20000);

      expect(pltv1.differenceFrom(pltv2)).toBe(10000);
    });

    it('should calculate percentage change', () => {
      const pltv1 = PredictedLTV.fromValue(30000);
      const pltv2 = PredictedLTV.fromValue(20000);

      expect(pltv1.percentageChangeFrom(pltv2)).toBe(50);
    });
  });

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      const pltv = PredictedLTV.fromValue(25000, 0.85, 'HIGH_GROWTH');
      const json = pltv.toJSON();

      expect(json.predictedValue).toBe(25000);
      expect(json.tier).toBe('GOLD');
      expect(json.growthPotential).toBe('HIGH_GROWTH');
      expect(json.confidence).toBe(0.85);
      expect(json.calculatedAt).toBeDefined();
    });

    it('should convert to primitive', () => {
      const pltv = PredictedLTV.fromValue(25000);

      expect(pltv.toPrimitive()).toBe(25000);
    });

    it('should have string representation', () => {
      const pltv = PredictedLTV.fromValue(25000);
      const str = pltv.toString();

      expect(str).toContain('25,000');
      expect(str).toContain('GOLD');
    });
  });

  // ============================================================================
  // PARSING
  // ============================================================================

  describe('Parsing', () => {
    it('should parse from number', () => {
      const result = PredictedLTV.parse(25000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictedValue).toBe(25000);
      }
    });

    it('should parse from PredictedLTV instance', () => {
      const original = PredictedLTV.fromValue(25000);
      const result = PredictedLTV.parse(original);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(original);
      }
    });

    it('should parse from object', () => {
      const result = PredictedLTV.parse({
        predictedValue: 30000,
        confidence: 0.9,
        growthPotential: 'HIGH_GROWTH',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictedValue).toBe(30000);
        expect(result.value.confidence).toBe(0.9);
        expect(result.value.growthPotential).toBe('HIGH_GROWTH');
      }
    });

    it('should fail for invalid input', () => {
      const result = PredictedLTV.parse('invalid');

      expect(result.success).toBe(false);
    });

    it('should fail for negative value', () => {
      const result = PredictedLTV.parse(-100);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // IMMUTABILITY
  // ============================================================================

  describe('Immutability', () => {
    it('should be frozen', () => {
      const pltv = PredictedLTV.fromValue(25000);

      expect(() => {
        (pltv as unknown as { predictedValue: number }).predictedValue = 50000;
      }).toThrow();
    });
  });

  // ============================================================================
  // CONFIDENCE INTERVAL
  // ============================================================================

  describe('Confidence Interval', () => {
    it('should calculate confidence interval', () => {
      const pltv = PredictedLTV.fromValue(20000, 0.8);

      expect(pltv.confidenceInterval.lower).toBeLessThan(pltv.predictedValue);
      expect(pltv.confidenceInterval.upper).toBeGreaterThan(pltv.predictedValue);
      expect(pltv.confidenceInterval.level).toBe(0.95);
    });

    it('should have narrower interval for higher confidence', () => {
      const lowConf = PredictedLTV.fromValue(20000, 0.5);
      const highConf = PredictedLTV.fromValue(20000, 0.95);

      const lowRange = lowConf.confidenceInterval.upper - lowConf.confidenceInterval.lower;
      const highRange = highConf.confidenceInterval.upper - highConf.confidenceInterval.lower;

      expect(highRange).toBeLessThan(lowRange);
    });
  });
});
