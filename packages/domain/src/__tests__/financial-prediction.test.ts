/**
 * FinancialPrediction Value Object Tests
 * Comprehensive tests for case financial outcome prediction
 */

import { describe, it, expect } from 'vitest';
import {
  FinancialPrediction,
  InvalidFinancialPredictionError,
  isFinancialPrediction,
  type PredictionFactor,
  type CreateFinancialPredictionInput,
  type FinancialPredictionDTO,
} from '../osax/value-objects/FinancialPrediction.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createValidFactor = (overrides: Partial<PredictionFactor> = {}): PredictionFactor => ({
  factor: 'insurance_coverage',
  weight: 0.3,
  contribution: 'positive',
  description: 'High insurance coverage',
  ...overrides,
});

const createValidInput = (
  overrides: Partial<CreateFinancialPredictionInput> = {}
): CreateFinancialPredictionInput => ({
  probability: 0.72,
  confidence: 0.85,
  rationale: 'High insurance coverage with low complexity procedure',
  factors: [
    createValidFactor(),
    createValidFactor({ factor: 'treatment_complexity', weight: 0.2, contribution: 'positive' }),
  ],
  estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
  modelVersion: '1.0.0',
  ...overrides,
});

// ============================================================================
// FACTORY METHOD: create()
// ============================================================================

describe('FinancialPrediction.create', () => {
  describe('valid inputs', () => {
    it('should create prediction with valid input', () => {
      const input = createValidInput();
      const prediction = FinancialPrediction.create(input);

      expect(prediction.probability).toBeCloseTo(0.72, 3);
      expect(prediction.confidence).toBeCloseTo(0.85, 3);
      expect(prediction.rationale).toBe(input.rationale);
      expect(prediction.factors).toHaveLength(2);
      expect(prediction.modelVersion).toBe('1.0.0');
    });

    it('should round probability to 3 decimal places', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.12345678 }));
      expect(prediction.probability).toBe(0.123);
    });

    it('should round confidence to 3 decimal places', () => {
      const prediction = FinancialPrediction.create(createValidInput({ confidence: 0.98765432 }));
      expect(prediction.confidence).toBe(0.988);
    });

    it('should set predictedAt to provided date', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const prediction = FinancialPrediction.create(createValidInput({ predictedAt: date }));
      expect(prediction.predictedAt).toEqual(date);
    });

    it('should set predictedAt to current date if not provided', () => {
      const before = new Date();
      const prediction = FinancialPrediction.create(createValidInput());
      const after = new Date();

      expect(prediction.predictedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(prediction.predictedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accept boundary probability values', () => {
      const predictionMin = FinancialPrediction.create(createValidInput({ probability: 0 }));
      const predictionMax = FinancialPrediction.create(createValidInput({ probability: 1 }));

      expect(predictionMin.probability).toBe(0);
      expect(predictionMax.probability).toBe(1);
    });

    it('should accept empty factors array', () => {
      const prediction = FinancialPrediction.create(createValidInput({ factors: [] }));
      expect(prediction.factors).toHaveLength(0);
    });

    it('should freeze factors array', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(Object.isFrozen(prediction.factors)).toBe(true);
    });

    it('should freeze estimatedValueRange', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(Object.isFrozen(prediction.estimatedValueRange)).toBe(true);
    });

    it('should freeze the prediction object', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(Object.isFrozen(prediction)).toBe(true);
    });
  });

  describe('probability validation', () => {
    it('should reject probability below 0', () => {
      expect(() => FinancialPrediction.create(createValidInput({ probability: -0.1 }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject probability above 1', () => {
      expect(() => FinancialPrediction.create(createValidInput({ probability: 1.1 }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject NaN probability', () => {
      expect(() => FinancialPrediction.create(createValidInput({ probability: NaN }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject non-number probability', () => {
      expect(() =>
        FinancialPrediction.create(createValidInput({ probability: 'high' as unknown as number }))
      ).toThrow(InvalidFinancialPredictionError);
    });
  });

  describe('confidence validation', () => {
    it('should reject confidence below 0', () => {
      expect(() => FinancialPrediction.create(createValidInput({ confidence: -0.1 }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject confidence above 1', () => {
      expect(() => FinancialPrediction.create(createValidInput({ confidence: 1.1 }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject NaN confidence', () => {
      expect(() => FinancialPrediction.create(createValidInput({ confidence: NaN }))).toThrow(
        InvalidFinancialPredictionError
      );
    });
  });

  describe('rationale validation', () => {
    it('should reject empty rationale', () => {
      expect(() => FinancialPrediction.create(createValidInput({ rationale: '' }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject null rationale', () => {
      expect(() =>
        FinancialPrediction.create(createValidInput({ rationale: null as unknown as string }))
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject rationale over 1000 characters', () => {
      expect(() =>
        FinancialPrediction.create(createValidInput({ rationale: 'x'.repeat(1001) }))
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should accept rationale at 1000 characters', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({ rationale: 'x'.repeat(1000) })
      );
      expect(prediction.rationale).toHaveLength(1000);
    });
  });

  describe('factors validation', () => {
    it('should reject non-array factors', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({ factors: 'not-array' as unknown as PredictionFactor[] })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with empty factor name', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ factor: '' })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with factor name over 100 chars', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ factor: 'x'.repeat(101) })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with weight below 0', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ weight: -0.1 })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with weight above 1', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ weight: 1.1 })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with NaN weight', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ weight: NaN })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject factor with invalid contribution', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ contribution: 'invalid' as 'positive' })],
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should accept all valid contribution types', () => {
      const contributions = ['positive', 'negative', 'neutral'] as const;
      for (const contribution of contributions) {
        const prediction = FinancialPrediction.create(
          createValidInput({
            factors: [createValidFactor({ contribution })],
          })
        );
        expect(prediction.factors[0].contribution).toBe(contribution);
      }
    });
  });

  describe('estimatedValueRange validation', () => {
    it('should reject null estimatedValueRange', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: null as unknown as { min: number; max: number; currency: string },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject negative min value', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: -100, max: 5000, currency: 'EUR' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject negative max value', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: 0, max: -100, currency: 'EUR' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject min greater than max', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: 5000, max: 3000, currency: 'EUR' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject NaN min value', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: NaN, max: 5000, currency: 'EUR' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject invalid currency code', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: 3000, max: 5000, currency: 'EURO' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should reject empty currency code', () => {
      expect(() =>
        FinancialPrediction.create(
          createValidInput({
            estimatedValueRange: { min: 3000, max: 5000, currency: '' },
          })
        )
      ).toThrow(InvalidFinancialPredictionError);
    });

    it('should accept equal min and max values', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 5000, max: 5000, currency: 'USD' },
        })
      );
      expect(prediction.estimatedValueRange.min).toBe(5000);
      expect(prediction.estimatedValueRange.max).toBe(5000);
    });
  });

  describe('modelVersion validation', () => {
    it('should reject empty modelVersion', () => {
      expect(() => FinancialPrediction.create(createValidInput({ modelVersion: '' }))).toThrow(
        InvalidFinancialPredictionError
      );
    });

    it('should reject null modelVersion', () => {
      expect(() =>
        FinancialPrediction.create(createValidInput({ modelVersion: null as unknown as string }))
      ).toThrow(InvalidFinancialPredictionError);
    });
  });
});

// ============================================================================
// FACTORY METHOD: fromRuleBasedCalculation()
// ============================================================================

describe('FinancialPrediction.fromRuleBasedCalculation', () => {
  it('should create rule-based prediction with defaults', () => {
    const prediction = FinancialPrediction.fromRuleBasedCalculation(
      0.75,
      'Insurance covers 80% of procedure',
      { min: 2000, max: 4000 }
    );

    expect(prediction.probability).toBe(0.75);
    expect(prediction.confidence).toBe(0.7); // Rule-based default
    expect(prediction.rationale).toBe('Insurance covers 80% of procedure');
    expect(prediction.modelVersion).toBe('rule-based-v1.0');
    expect(prediction.factors).toHaveLength(1);
    expect(prediction.factors[0].factor).toBe('rule_based_calculation');
  });

  it('should use EUR as default currency', () => {
    const prediction = FinancialPrediction.fromRuleBasedCalculation(0.5, 'Basic calculation', {
      min: 1000,
      max: 2000,
    });

    expect(prediction.estimatedValueRange.currency).toBe('EUR');
  });

  it('should accept custom currency', () => {
    const prediction = FinancialPrediction.fromRuleBasedCalculation(
      0.5,
      'Basic calculation',
      { min: 1000, max: 2000 },
      'USD'
    );

    expect(prediction.estimatedValueRange.currency).toBe('USD');
  });
});

// ============================================================================
// FACTORY METHOD: reconstitute()
// ============================================================================

describe('FinancialPrediction.reconstitute', () => {
  const createValidDTO = (): FinancialPredictionDTO => ({
    probability: 0.72,
    confidence: 0.85,
    rationale: 'Test rationale',
    factors: [createValidFactor()],
    estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
    predictedAt: '2024-01-15T10:00:00.000Z',
    modelVersion: '1.0.0',
  });

  it('should reconstitute from valid DTO with string date', () => {
    const dto = createValidDTO();
    const prediction = FinancialPrediction.reconstitute(dto);

    expect(prediction.probability).toBe(0.72);
    expect(prediction.predictedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
  });

  it('should reconstitute from DTO with Date object', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const dto = { ...createValidDTO(), predictedAt: date };
    const prediction = FinancialPrediction.reconstitute(dto);

    expect(prediction.predictedAt).toEqual(date);
  });

  it('should reject invalid DTO (null)', () => {
    expect(() =>
      FinancialPrediction.reconstitute(null as unknown as FinancialPredictionDTO)
    ).toThrow(InvalidFinancialPredictionError);
  });

  it('should reject invalid DTO (non-object)', () => {
    expect(() =>
      FinancialPrediction.reconstitute('invalid' as unknown as FinancialPredictionDTO)
    ).toThrow(InvalidFinancialPredictionError);
  });

  it('should reject invalid predictedAt date', () => {
    const dto = { ...createValidDTO(), predictedAt: 'invalid-date' };
    expect(() => FinancialPrediction.reconstitute(dto)).toThrow(InvalidFinancialPredictionError);
  });
});

// ============================================================================
// QUERY METHODS: Probability Tiers
// ============================================================================

describe('FinancialPrediction probability tier methods', () => {
  describe('isHighProbability', () => {
    it('should return true for probability >= 0.65', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.65 })).isHighProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.8 })).isHighProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 1.0 })).isHighProbability()
      ).toBe(true);
    });

    it('should return false for probability < 0.65', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.64 })).isHighProbability()
      ).toBe(false);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.5 })).isHighProbability()
      ).toBe(false);
    });
  });

  describe('isMediumProbability', () => {
    it('should return true for probability 0.35-0.65', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.35 })).isMediumProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.5 })).isMediumProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.64 })).isMediumProbability()
      ).toBe(true);
    });

    it('should return false for probability outside range', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.34 })).isMediumProbability()
      ).toBe(false);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.65 })).isMediumProbability()
      ).toBe(false);
    });
  });

  describe('isLowProbability', () => {
    it('should return true for probability < 0.35', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.34 })).isLowProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.1 })).isLowProbability()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0 })).isLowProbability()
      ).toBe(true);
    });

    it('should return false for probability >= 0.35', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.35 })).isLowProbability()
      ).toBe(false);
    });
  });

  describe('getProbabilityTier', () => {
    it('should return HIGH for high probability', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.8 })).getProbabilityTier()
      ).toBe('HIGH');
    });

    it('should return MEDIUM for medium probability', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.5 })).getProbabilityTier()
      ).toBe('MEDIUM');
    });

    it('should return LOW for low probability', () => {
      expect(
        FinancialPrediction.create(createValidInput({ probability: 0.2 })).getProbabilityTier()
      ).toBe('LOW');
    });
  });
});

// ============================================================================
// QUERY METHODS: Other Checks
// ============================================================================

describe('FinancialPrediction query methods', () => {
  describe('requiresFinancialConsultation', () => {
    it('should return true when max value exceeds default threshold (10000)', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 5000, max: 15000, currency: 'EUR' },
        })
      );
      expect(prediction.requiresFinancialConsultation()).toBe(true);
    });

    it('should return false when max value is below threshold', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
        })
      );
      expect(prediction.requiresFinancialConsultation()).toBe(false);
    });

    it('should use custom threshold', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
        })
      );
      expect(prediction.requiresFinancialConsultation(4000)).toBe(true);
      expect(prediction.requiresFinancialConsultation(6000)).toBe(false);
    });
  });

  describe('getRecommendedAction', () => {
    it('should return PROCEED_WITH_SCHEDULING for HIGH tier', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.8 }));
      expect(prediction.getRecommendedAction()).toBe('PROCEED_WITH_SCHEDULING');
    });

    it('should return FOLLOW_UP_REQUIRED for MEDIUM tier', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.5 }));
      expect(prediction.getRecommendedAction()).toBe('FOLLOW_UP_REQUIRED');
    });

    it('should return REVIEW_ALTERNATIVES for LOW tier', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.2 }));
      expect(prediction.getRecommendedAction()).toBe('REVIEW_ALTERNATIVES');
    });
  });

  describe('isHighConfidence', () => {
    it('should return true for confidence >= 0.8', () => {
      expect(
        FinancialPrediction.create(createValidInput({ confidence: 0.8 })).isHighConfidence()
      ).toBe(true);
      expect(
        FinancialPrediction.create(createValidInput({ confidence: 0.95 })).isHighConfidence()
      ).toBe(true);
    });

    it('should return false for confidence < 0.8', () => {
      expect(
        FinancialPrediction.create(createValidInput({ confidence: 0.79 })).isHighConfidence()
      ).toBe(false);
    });
  });

  describe('getPositiveFactors', () => {
    it('should return only positive factors', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          factors: [
            createValidFactor({ factor: 'positive1', contribution: 'positive' }),
            createValidFactor({ factor: 'negative1', contribution: 'negative' }),
            createValidFactor({ factor: 'positive2', contribution: 'positive' }),
            createValidFactor({ factor: 'neutral1', contribution: 'neutral' }),
          ],
        })
      );

      const positiveFactors = prediction.getPositiveFactors();
      expect(positiveFactors).toHaveLength(2);
      expect(positiveFactors[0].factor).toBe('positive1');
      expect(positiveFactors[1].factor).toBe('positive2');
    });
  });

  describe('getNegativeFactors', () => {
    it('should return only negative factors', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          factors: [
            createValidFactor({ factor: 'positive1', contribution: 'positive' }),
            createValidFactor({ factor: 'negative1', contribution: 'negative' }),
            createValidFactor({ factor: 'negative2', contribution: 'negative' }),
          ],
        })
      );

      const negativeFactors = prediction.getNegativeFactors();
      expect(negativeFactors).toHaveLength(2);
      expect(negativeFactors[0].factor).toBe('negative1');
    });
  });

  describe('getEstimatedValueMidpoint', () => {
    it('should return midpoint of value range', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 2000, max: 6000, currency: 'EUR' },
        })
      );
      expect(prediction.getEstimatedValueMidpoint()).toBe(4000);
    });
  });

  describe('formatEstimatedValueRange', () => {
    it('should format value range with currency', () => {
      const prediction = FinancialPrediction.create(
        createValidInput({
          estimatedValueRange: { min: 3000, max: 5000, currency: 'EUR' },
        })
      );
      expect(prediction.formatEstimatedValueRange()).toBe('EUR 3,000 - 5,000');
    });
  });

  describe('getSummary', () => {
    it('should return formatted summary string', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.72 }));
      const summary = prediction.getSummary();

      expect(summary).toContain('72.0%');
      expect(summary).toContain('HIGH');
      expect(summary).toContain('EUR');
      expect(summary).toContain('PROCEED_WITH_SCHEDULING');
    });
  });
});

// ============================================================================
// EQUALITY & COMPARISON
// ============================================================================

describe('FinancialPrediction equality and comparison', () => {
  describe('equals', () => {
    it('should return true for same instance', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(prediction.equals(prediction)).toBe(true);
    });

    it('should return true for equal predictions', () => {
      const prediction1 = FinancialPrediction.create(createValidInput());
      const prediction2 = FinancialPrediction.create(createValidInput());

      expect(prediction1.equals(prediction2)).toBe(true);
    });

    it('should return false for different probability', () => {
      const prediction1 = FinancialPrediction.create(createValidInput({ probability: 0.7 }));
      const prediction2 = FinancialPrediction.create(createValidInput({ probability: 0.8 }));

      expect(prediction1.equals(prediction2)).toBe(false);
    });

    it('should return false for null', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(prediction.equals(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      const prediction = FinancialPrediction.create(createValidInput());
      expect(prediction.equals(undefined)).toBe(false);
    });
  });

  describe('compareTo', () => {
    it('should return positive for higher probability', () => {
      const prediction1 = FinancialPrediction.create(createValidInput({ probability: 0.8 }));
      const prediction2 = FinancialPrediction.create(createValidInput({ probability: 0.6 }));

      expect(prediction1.compareTo(prediction2)).toBeGreaterThan(0);
    });

    it('should return negative for lower probability', () => {
      const prediction1 = FinancialPrediction.create(createValidInput({ probability: 0.5 }));
      const prediction2 = FinancialPrediction.create(createValidInput({ probability: 0.8 }));

      expect(prediction1.compareTo(prediction2)).toBeLessThan(0);
    });

    it('should return zero for equal probability', () => {
      const prediction1 = FinancialPrediction.create(createValidInput({ probability: 0.7 }));
      const prediction2 = FinancialPrediction.create(createValidInput({ probability: 0.7 }));

      expect(prediction1.compareTo(prediction2)).toBe(0);
    });
  });
});

// ============================================================================
// SERIALIZATION
// ============================================================================

describe('FinancialPrediction serialization', () => {
  describe('toJSON', () => {
    it('should serialize to JSON-compatible object', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const prediction = FinancialPrediction.create(createValidInput({ predictedAt: date }));
      const json = prediction.toJSON();

      expect(json.probability).toBe(prediction.probability);
      expect(json.confidence).toBe(prediction.confidence);
      expect(json.rationale).toBe(prediction.rationale);
      expect(json.factors).toEqual(prediction.factors);
      expect(json.estimatedValueRange).toEqual(prediction.estimatedValueRange);
      expect(json.predictedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(json.modelVersion).toBe(prediction.modelVersion);
    });

    it('should be round-trip serializable', () => {
      const original = FinancialPrediction.create(createValidInput());
      const json = original.toJSON();
      const reconstituted = FinancialPrediction.reconstitute(json);

      expect(reconstituted.probability).toBe(original.probability);
      expect(reconstituted.confidence).toBe(original.confidence);
      expect(reconstituted.rationale).toBe(original.rationale);
    });
  });

  describe('toString', () => {
    it('should return readable string representation', () => {
      const prediction = FinancialPrediction.create(createValidInput({ probability: 0.72 }));
      const str = prediction.toString();

      expect(str).toContain('FinancialPrediction');
      expect(str).toContain('72.0%');
      expect(str).toContain('HIGH');
      expect(str).toContain('EUR');
    });
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('InvalidFinancialPredictionError', () => {
  it('should have correct name and code', () => {
    const error = new InvalidFinancialPredictionError('Test message');
    expect(error.name).toBe('InvalidFinancialPredictionError');
    expect(error.code).toBe('INVALID_FINANCIAL_PREDICTION');
  });

  it('should include details', () => {
    const error = new InvalidFinancialPredictionError('Field error', {
      field: 'probability',
      value: -0.5,
    });

    expect(error.details.field).toBe('probability');
    expect(error.details.value).toBe(-0.5);
  });

  it('should freeze details', () => {
    const error = new InvalidFinancialPredictionError('Test', { field: 'test' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('should serialize to JSON', () => {
    const error = new InvalidFinancialPredictionError('Test message', { field: 'test' });
    const json = error.toJSON();

    expect(json.name).toBe('InvalidFinancialPredictionError');
    expect(json.code).toBe('INVALID_FINANCIAL_PREDICTION');
    expect(json.message).toBe('Test message');
    expect(json.details).toEqual({ field: 'test' });
  });
});

// ============================================================================
// TYPE GUARD
// ============================================================================

describe('isFinancialPrediction', () => {
  it('should return true for FinancialPrediction instance', () => {
    const prediction = FinancialPrediction.create(createValidInput());
    expect(isFinancialPrediction(prediction)).toBe(true);
  });

  it('should return false for other objects', () => {
    expect(isFinancialPrediction({})).toBe(false);
    expect(isFinancialPrediction(null)).toBe(false);
    expect(isFinancialPrediction(undefined)).toBe(false);
    expect(isFinancialPrediction('string')).toBe(false);
  });
});
