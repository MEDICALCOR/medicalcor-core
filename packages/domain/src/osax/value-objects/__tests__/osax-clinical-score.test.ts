/**
 * @fileoverview OsaxClinicalScore Value Object Tests
 *
 * Tests for the OSAX clinical score value object.
 */

import { describe, it, expect } from 'vitest';
import {
  OsaxClinicalScore,
  InvalidOsaxScoreError,
  SEVERITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,
  type OsaxClinicalIndicators,
  type OsaxSeverity,
  type OsaxCardiovascularRisk,
  type OsaxTreatmentRecommendation,
} from '../OsaxClinicalScore.js';

// ============================================================================
// HELPERS
// ============================================================================

function createValidIndicators(
  overrides: Partial<OsaxClinicalIndicators> = {}
): OsaxClinicalIndicators {
  return {
    ahi: 15,
    odi: 12,
    spo2Nadir: 85,
    spo2Average: 94,
    sleepEfficiency: 85,
    essScore: 10,
    ...overrides,
  };
}

function createMildIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 8,
    odi: 6,
    spo2Nadir: 88,
    spo2Average: 95,
    sleepEfficiency: 85,
    essScore: 8,
  };
}

function createModerateIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 22,
    odi: 18,
    spo2Nadir: 82,
    spo2Average: 93,
    sleepEfficiency: 80,
    essScore: 12,
  };
}

function createSevereIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 45,
    odi: 40,
    spo2Nadir: 70,
    spo2Average: 88,
    sleepEfficiency: 70,
    essScore: 18,
  };
}

function createNoneIndicators(): OsaxClinicalIndicators {
  return {
    ahi: 3,
    odi: 2,
    spo2Nadir: 92,
    spo2Average: 97,
    sleepEfficiency: 90,
    essScore: 4,
  };
}

// ============================================================================
// FACTORY METHOD TESTS
// ============================================================================

describe('OsaxClinicalScore', () => {
  describe('fromIndicators', () => {
    it('should create score from valid indicators', () => {
      const indicators = createValidIndicators();
      const score = OsaxClinicalScore.fromIndicators(indicators);

      expect(score).toBeDefined();
      expect(score.indicators).toEqual(indicators);
    });

    it('should use default confidence of 0.9', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.confidence).toBe(0.9);
    });

    it('should accept custom confidence', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.8);

      expect(score.confidence).toBe(0.8);
    });

    it('should calculate composite score', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(typeof score.compositeScore).toBe('number');
      expect(score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
    });

    it('should throw for invalid confidence', () => {
      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators(), -0.1)).toThrow(
        InvalidOsaxScoreError
      );
      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators(), 1.1)).toThrow(
        InvalidOsaxScoreError
      );
      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators(), NaN)).toThrow(
        InvalidOsaxScoreError
      );
    });

    it('should throw for invalid AHI', () => {
      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ ahi: -1 }))).toThrow(
        InvalidOsaxScoreError
      );

      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ ahi: 151 }))).toThrow(
        InvalidOsaxScoreError
      );
    });

    it('should throw for invalid ODI', () => {
      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ odi: -1 }))).toThrow(
        InvalidOsaxScoreError
      );

      expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ odi: 151 }))).toThrow(
        InvalidOsaxScoreError
      );
    });

    it('should throw for invalid SpO2 nadir', () => {
      expect(() =>
        OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Nadir: 39 }))
      ).toThrow(InvalidOsaxScoreError);

      expect(() =>
        OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Nadir: 101 }))
      ).toThrow(InvalidOsaxScoreError);
    });

    it('should throw for invalid SpO2 average', () => {
      expect(() =>
        OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Average: 59 }))
      ).toThrow(InvalidOsaxScoreError);

      expect(() =>
        OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Average: 101 }))
      ).toThrow(InvalidOsaxScoreError);
    });

    it('should throw when SpO2 nadir exceeds average', () => {
      expect(() =>
        OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Nadir: 96, spo2Average: 94 }))
      ).toThrow(InvalidOsaxScoreError);
    });

    it('should have scoredAt timestamp', () => {
      const before = new Date();
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const after = new Date();

      expect(score.scoredAt).toBeInstanceOf(Date);
      expect(score.scoredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(score.scoredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should have algorithm version', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.algorithmVersion).toBeDefined();
      expect(typeof score.algorithmVersion).toBe('string');
    });
  });

  describe('fromAHI', () => {
    it('should create score from AHI only', () => {
      const score = OsaxClinicalScore.fromAHI(25);

      expect(score.indicators.ahi).toBe(25);
    });

    it('should use lower default confidence', () => {
      const score = OsaxClinicalScore.fromAHI(25);

      expect(score.confidence).toBe(0.7);
    });

    it('should estimate ODI from AHI', () => {
      const score = OsaxClinicalScore.fromAHI(20);

      // ODI should be approximately 85% of AHI
      expect(score.indicators.odi).toBeGreaterThan(0);
      expect(score.indicators.odi).toBeLessThan(score.indicators.ahi);
    });

    it('should throw for invalid AHI', () => {
      expect(() => OsaxClinicalScore.fromAHI(-1)).toThrow(InvalidOsaxScoreError);
      expect(() => OsaxClinicalScore.fromAHI(151)).toThrow(InvalidOsaxScoreError);
      expect(() => OsaxClinicalScore.fromAHI(NaN)).toThrow(InvalidOsaxScoreError);
    });

    it('should create different severity estimates based on AHI', () => {
      const lowAHI = OsaxClinicalScore.fromAHI(3);
      const mildAHI = OsaxClinicalScore.fromAHI(10);
      const moderateAHI = OsaxClinicalScore.fromAHI(20);
      const severeAHI = OsaxClinicalScore.fromAHI(40);

      expect(lowAHI.severity).toBe('NONE');
      expect(mildAHI.severity).toBe('MILD');
      expect(moderateAHI.severity).toBe('MODERATE');
      expect(severeAHI.severity).toBe('SEVERE');
    });
  });

  describe('forScreening', () => {
    it('should create score from AHI and ESS', () => {
      const score = OsaxClinicalScore.forScreening(25, 12);

      expect(score.indicators.ahi).toBe(25);
      expect(score.indicators.essScore).toBe(12);
    });

    it('should use lower default confidence', () => {
      const score = OsaxClinicalScore.forScreening(25, 12);

      expect(score.confidence).toBe(0.6);
    });

    it('should throw for invalid ESS score', () => {
      expect(() => OsaxClinicalScore.forScreening(25, -1)).toThrow(InvalidOsaxScoreError);
      expect(() => OsaxClinicalScore.forScreening(25, 25)).toThrow(InvalidOsaxScoreError);
      expect(() => OsaxClinicalScore.forScreening(25, 12.5)).toThrow(InvalidOsaxScoreError);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from valid DTO', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const dto = original.toJSON();
      const reconstituted = OsaxClinicalScore.reconstitute(dto);

      expect(reconstituted.compositeScore).toBe(original.compositeScore);
      expect(reconstituted.severity).toBe(original.severity);
      expect(reconstituted.indicators.ahi).toBe(original.indicators.ahi);
    });

    it('should throw for null DTO', () => {
      expect(() => OsaxClinicalScore.reconstitute(null as any)).toThrow(InvalidOsaxScoreError);
    });

    it('should throw for missing required fields', () => {
      expect(() => OsaxClinicalScore.reconstitute({} as any)).toThrow(InvalidOsaxScoreError);
    });

    it('should parse scoredAt from string', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const dto = {
        ...original.toJSON(),
        scoredAt: '2025-01-15T10:30:00Z',
      };
      const reconstituted = OsaxClinicalScore.reconstitute(dto);

      expect(reconstituted.scoredAt).toBeInstanceOf(Date);
      expect(reconstituted.scoredAt.toISOString()).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should throw for invalid scoredAt', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const dto = {
        ...original.toJSON(),
        scoredAt: 'invalid-date',
      };

      expect(() => OsaxClinicalScore.reconstitute(dto)).toThrow(InvalidOsaxScoreError);
    });
  });

  describe('parse', () => {
    it('should return existing instance', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const result = OsaxClinicalScore.parse(original);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(original);
      }
    });

    it('should fail for null/undefined', () => {
      expect(OsaxClinicalScore.parse(null).success).toBe(false);
      expect(OsaxClinicalScore.parse(undefined).success).toBe(false);
    });

    it('should parse from DTO', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const result = OsaxClinicalScore.parse(original.toJSON());

      expect(result.success).toBe(true);
    });

    it('should parse from indicators object', () => {
      const result = OsaxClinicalScore.parse({
        indicators: createValidIndicators(),
      });

      expect(result.success).toBe(true);
    });

    it('should parse from AHI object', () => {
      const result = OsaxClinicalScore.parse({ ahi: 25 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.indicators.ahi).toBe(25);
      }
    });

    it('should parse from numeric AHI', () => {
      const result = OsaxClinicalScore.parse(25);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.indicators.ahi).toBe(25);
      }
    });

    it('should fail for invalid type', () => {
      const result = OsaxClinicalScore.parse('invalid');

      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// SEVERITY CLASSIFICATION TESTS
// ============================================================================

describe('Severity Classification', () => {
  it('should classify NONE for AHI < 5', () => {
    const score = OsaxClinicalScore.fromIndicators(createNoneIndicators());

    expect(score.severity).toBe('NONE');
  });

  it('should classify MILD for AHI 5-15', () => {
    const score = OsaxClinicalScore.fromIndicators(createMildIndicators());

    expect(score.severity).toBe('MILD');
  });

  it('should classify MODERATE for AHI 15-30', () => {
    const score = OsaxClinicalScore.fromIndicators(createModerateIndicators());

    expect(score.severity).toBe('MODERATE');
  });

  it('should classify SEVERE for AHI >= 30', () => {
    const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());

    expect(score.severity).toBe('SEVERE');
  });

  it('should match AASM threshold constants', () => {
    expect(SEVERITY_THRESHOLDS.NONE.ahiMax).toBe(5);
    expect(SEVERITY_THRESHOLDS.MILD.ahiMin).toBe(5);
    expect(SEVERITY_THRESHOLDS.MILD.ahiMax).toBe(15);
    expect(SEVERITY_THRESHOLDS.MODERATE.ahiMin).toBe(15);
    expect(SEVERITY_THRESHOLDS.MODERATE.ahiMax).toBe(30);
    expect(SEVERITY_THRESHOLDS.SEVERE.ahiMin).toBe(30);
  });
});

// ============================================================================
// QUERY METHOD TESTS
// ============================================================================

describe('Query Methods', () => {
  describe('hasOSA', () => {
    it('should return false for NONE severity', () => {
      const score = OsaxClinicalScore.fromIndicators(createNoneIndicators());

      expect(score.hasOSA()).toBe(false);
    });

    it('should return true for MILD severity', () => {
      const score = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(score.hasOSA()).toBe(true);
    });

    it('should return true for SEVERE severity', () => {
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(score.hasOSA()).toBe(true);
    });
  });

  describe('requiresUrgentIntervention', () => {
    it('should return false for mild cases', () => {
      const score = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(score.requiresUrgentIntervention()).toBe(false);
    });

    it('should return true for severe cases with very low SpO2', () => {
      const score = OsaxClinicalScore.fromIndicators({
        ...createSevereIndicators(),
        spo2Nadir: 65, // Critically low
      });

      expect(score.requiresUrgentIntervention()).toBe(true);
    });
  });

  describe('requiresCPAP', () => {
    it('should return false for none/mild severity', () => {
      const none = OsaxClinicalScore.fromIndicators(createNoneIndicators());
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(none.requiresCPAP()).toBe(false);
      expect(mild.requiresCPAP()).toBe(false);
    });

    it('should return true for moderate/severe severity', () => {
      const moderate = OsaxClinicalScore.fromIndicators(createModerateIndicators());
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(moderate.requiresCPAP()).toBe(true);
      expect(severe.requiresCPAP()).toBe(true);
    });
  });

  describe('getFollowUpUrgency', () => {
    it('should return routine for none severity', () => {
      const score = OsaxClinicalScore.fromIndicators(createNoneIndicators());

      expect(score.getFollowUpUrgency()).toBe('routine');
    });

    it('should return urgent for severe cases', () => {
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const urgency = score.getFollowUpUrgency();
      expect(['urgent', 'immediate']).toContain(urgency);
    });
  });

  describe('getClinicalReviewSLAHours', () => {
    it('should return correct SLA hours based on severity', () => {
      const none = OsaxClinicalScore.fromIndicators(createNoneIndicators());
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(none.getClinicalReviewSLAHours()).toBe(CLINICAL_SLA_HOURS.routine);
      expect(severe.getClinicalReviewSLAHours()).toBeLessThanOrEqual(CLINICAL_SLA_HOURS.urgent);
    });
  });

  describe('getTaskPriority', () => {
    it('should return low for none severity', () => {
      const score = OsaxClinicalScore.fromIndicators(createNoneIndicators());

      expect(score.getTaskPriority()).toBe('low');
    });

    it('should return critical for severe cases', () => {
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const priority = score.getTaskPriority();
      expect(['high', 'critical']).toContain(priority);
    });
  });
});

// ============================================================================
// CARDIOVASCULAR RISK TESTS
// ============================================================================

describe('Cardiovascular Risk', () => {
  it('should calculate LOW risk for normal values', () => {
    const score = OsaxClinicalScore.fromIndicators(createNoneIndicators());

    expect(score.cardiovascularRisk).toBe('LOW');
  });

  it('should calculate higher risk for severe OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());

    expect(['HIGH', 'CRITICAL']).toContain(score.cardiovascularRisk);
  });

  it('should increase risk with low SpO2 nadir', () => {
    const normalSpO2 = OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Nadir: 88 }));
    const lowSpO2 = OsaxClinicalScore.fromIndicators(createValidIndicators({ spo2Nadir: 70 }));

    // Lower SpO2 should result in higher or equal risk
    const riskOrder: OsaxCardiovascularRisk[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
    const normalRiskIndex = riskOrder.indexOf(normalSpO2.cardiovascularRisk);
    const lowRiskIndex = riskOrder.indexOf(lowSpO2.cardiovascularRisk);

    expect(lowRiskIndex).toBeGreaterThanOrEqual(normalRiskIndex);
  });
});

// ============================================================================
// TREATMENT RECOMMENDATION TESTS
// ============================================================================

describe('Treatment Recommendation', () => {
  it('should recommend lifestyle modification for none/mild', () => {
    const none = OsaxClinicalScore.fromIndicators(createNoneIndicators());

    expect(none.treatmentRecommendation).toBe('LIFESTYLE_MODIFICATION');
  });

  it('should recommend CPAP for moderate/severe', () => {
    const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

    const cpapRecommendations: OsaxTreatmentRecommendation[] = ['CPAP_THERAPY', 'BIPAP_THERAPY'];
    expect(cpapRecommendations).toContain(severe.treatmentRecommendation);
  });
});

// ============================================================================
// IMMUTABILITY TESTS
// ============================================================================

describe('Immutability', () => {
  it('should be frozen', () => {
    const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

    expect(Object.isFrozen(score)).toBe(true);
  });

  it('should have frozen indicators', () => {
    const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

    expect(Object.isFrozen(score.indicators)).toBe(true);
  });
});

// ============================================================================
// SERIALIZATION TESTS
// ============================================================================

describe('Serialization', () => {
  describe('toJSON', () => {
    it('should serialize to JSON-compatible object', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const json = score.toJSON();

      expect(json.compositeScore).toBe(score.compositeScore);
      expect(json.severity).toBe(score.severity);
      expect(json.cardiovascularRisk).toBe(score.cardiovascularRisk);
      expect(json.treatmentRecommendation).toBe(score.treatmentRecommendation);
      expect(json.indicators).toEqual(score.indicators);
      expect(json.confidence).toBe(score.confidence);
      expect(typeof json.scoredAt).toBe('string');
    });

    it('should be JSON.stringify compatible', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const jsonString = JSON.stringify(score);
      const parsed = JSON.parse(jsonString);

      expect(parsed.compositeScore).toBe(score.compositeScore);
      expect(parsed.severity).toBe(score.severity);
    });
  });

  describe('toPrimitive', () => {
    it('should return composite score', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.toPrimitive()).toBe(score.compositeScore);
    });
  });

  describe('toString', () => {
    it('should return descriptive string', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const str = score.toString();

      expect(str).toContain('OsaxClinicalScore');
      expect(str).toContain(score.severity);
    });
  });
});

// ============================================================================
// EQUALITY TESTS
// ============================================================================

describe('Equality', () => {
  describe('equals', () => {
    it('should return true for same instance', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.equals(score)).toBe(true);
    });

    it('should return true for equal values', () => {
      const indicators = createValidIndicators();
      const score1 = OsaxClinicalScore.fromIndicators(indicators);
      const score2 = OsaxClinicalScore.fromIndicators(indicators);

      expect(score1.equals(score2)).toBe(true);
    });

    it('should return false for different values', () => {
      const score1 = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const score2 = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(score1.equals(score2)).toBe(false);
    });

    it('should return false for null', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.equals(null)).toBe(false);
    });
  });

  describe('hash', () => {
    it('should return consistent hash', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score.hash()).toBe(score.hash());
    });

    it('should return same hash for equal scores', () => {
      const indicators = createValidIndicators();
      const score1 = OsaxClinicalScore.fromIndicators(indicators);
      const score2 = OsaxClinicalScore.fromIndicators(indicators);

      expect(score1.hash()).toBe(score2.hash());
    });

    it('should return different hash for different scores', () => {
      const score1 = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const score2 = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(score1.hash()).not.toBe(score2.hash());
    });
  });
});

// ============================================================================
// ERROR TESTS
// ============================================================================

describe('InvalidOsaxScoreError', () => {
  it('should have correct name', () => {
    const error = new InvalidOsaxScoreError('test message', { field: 'ahi' });

    expect(error.name).toBe('InvalidOsaxScoreError');
  });

  it('should have correct code', () => {
    const error = new InvalidOsaxScoreError('test message', { field: 'ahi' });

    expect(error.code).toBe('INVALID_OSAX_SCORE');
  });

  it('should have details', () => {
    const error = new InvalidOsaxScoreError('test message', { field: 'ahi', value: 200 });

    expect(error.details.field).toBe('ahi');
    expect(error.details.value).toBe(200);
  });

  it('should be instance of Error', () => {
    const error = new InvalidOsaxScoreError('test message', {});

    expect(error).toBeInstanceOf(Error);
  });

  it('should serialize to JSON', () => {
    const error = new InvalidOsaxScoreError('test message', { field: 'ahi' });
    const json = error.toJSON();

    expect(json.name).toBe('InvalidOsaxScoreError');
    expect(json.code).toBe('INVALID_OSAX_SCORE');
    expect(json.message).toBe('test message');
    expect(json.details).toBeDefined();
  });
});
