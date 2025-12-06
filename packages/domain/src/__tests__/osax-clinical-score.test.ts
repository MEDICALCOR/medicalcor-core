/**
 * OsaxClinicalScore Value Object Tests
 * Comprehensive tests for OSAX clinical scoring value object
 */

import { describe, it, expect } from 'vitest';
import {
  OsaxClinicalScore,
  InvalidOsaxScoreError,
  isOsaxClinicalScore,
  isSuccessfulParse,
  CLINICAL_INDICATOR_RANGES,
  SEVERITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,
  type OsaxClinicalIndicators,
  type OsaxClinicalScoreDTO,
} from '../osax/value-objects/OsaxClinicalScore.js';

// ============================================================================
// HELPER FACTORIES
// ============================================================================

const createValidIndicators = (
  overrides: Partial<OsaxClinicalIndicators> = {}
): OsaxClinicalIndicators => ({
  ahi: 25.5,
  odi: 22.3,
  spo2Nadir: 78,
  spo2Average: 94,
  sleepEfficiency: 82,
  essScore: 14,
  ...overrides,
});

const createMildIndicators = (): OsaxClinicalIndicators => ({
  ahi: 8,
  odi: 7,
  spo2Nadir: 90,
  spo2Average: 96,
  sleepEfficiency: 88,
  essScore: 6,
});

const createModerateIndicators = (): OsaxClinicalIndicators => ({
  ahi: 22,
  odi: 19,
  spo2Nadir: 82,
  spo2Average: 93,
  sleepEfficiency: 80,
  essScore: 12,
});

const createSevereIndicators = (): OsaxClinicalIndicators => ({
  ahi: 45,
  odi: 40,
  spo2Nadir: 78, // Keep above 75 to avoid BiPAP and above 75 for HIGH (not CRITICAL) CV risk
  spo2Average: 88,
  sleepEfficiency: 65,
  essScore: 18,
});

const createCriticalIndicators = (): OsaxClinicalIndicators => ({
  ahi: 45,
  odi: 40,
  spo2Nadir: 70, // Below 75 triggers CRITICAL CV risk and BiPAP
  spo2Average: 85,
  sleepEfficiency: 60,
  essScore: 20,
});

const createNoOsaIndicators = (): OsaxClinicalIndicators => ({
  ahi: 3,
  odi: 2.5,
  spo2Nadir: 93,
  spo2Average: 97,
  sleepEfficiency: 92,
  essScore: 4,
});

// ============================================================================
// FACTORY METHODS
// ============================================================================

describe('OsaxClinicalScore.fromIndicators', () => {
  it('should create valid score from complete indicators', () => {
    const indicators = createValidIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);

    expect(score).toBeInstanceOf(OsaxClinicalScore);
    expect(score.compositeScore).toBeGreaterThan(0);
    expect(score.indicators.ahi).toBe(25.5);
    expect(score.confidence).toBe(0.9);
  });

  it('should calculate NONE severity for AHI < 5', () => {
    const score = OsaxClinicalScore.fromIndicators(createNoOsaIndicators());
    expect(score.severity).toBe('NONE');
  });

  it('should calculate MILD severity for 5 <= AHI < 15', () => {
    const score = OsaxClinicalScore.fromIndicators(createMildIndicators());
    expect(score.severity).toBe('MILD');
  });

  it('should calculate MODERATE severity for 15 <= AHI < 30', () => {
    const score = OsaxClinicalScore.fromIndicators(createModerateIndicators());
    expect(score.severity).toBe('MODERATE');
  });

  it('should calculate SEVERE severity for AHI >= 30', () => {
    const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());
    expect(score.severity).toBe('SEVERE');
  });

  it('should accept custom confidence level', () => {
    const score = OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.75);
    expect(score.confidence).toBe(0.75);
  });

  it('should throw for invalid AHI', () => {
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ ahi: -1 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ ahi: 151 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ ahi: NaN }))).toThrow(
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
      OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          spo2Nadir: 95,
          spo2Average: 90,
        })
      )
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should throw for invalid sleep efficiency', () => {
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ sleepEfficiency: -1 }))
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ sleepEfficiency: 101 }))
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should throw for invalid ESS score', () => {
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ essScore: -1 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ essScore: 25 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ essScore: 10.5 }))
    ).toThrow(InvalidOsaxScoreError); // Not integer
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

  it('should validate optional BMI', () => {
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ bmi: 9 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ bmi: 81 }))).toThrow(
      InvalidOsaxScoreError
    );

    // Valid BMI should work
    const score = OsaxClinicalScore.fromIndicators(createValidIndicators({ bmi: 28 }));
    expect(score.indicators.bmi).toBe(28);
  });

  it('should validate optional neck circumference', () => {
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ neckCircumference: 19 }))
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ neckCircumference: 81 }))
    ).toThrow(InvalidOsaxScoreError);

    const score = OsaxClinicalScore.fromIndicators(
      createValidIndicators({ neckCircumference: 42 })
    );
    expect(score.indicators.neckCircumference).toBe(42);
  });

  it('should validate optional total sleep time', () => {
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ totalSleepTime: -1 }))
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ totalSleepTime: 721 }))
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should validate optional REM AHI', () => {
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ remAhi: -1 }))).toThrow(
      InvalidOsaxScoreError
    );
    expect(() => OsaxClinicalScore.fromIndicators(createValidIndicators({ remAhi: 201 }))).toThrow(
      InvalidOsaxScoreError
    );
  });

  it('should validate optional supine AHI', () => {
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ supineAhi: -1 }))
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.fromIndicators(createValidIndicators({ supineAhi: 201 }))
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should throw for null/undefined indicators', () => {
    expect(() =>
      OsaxClinicalScore.fromIndicators(null as unknown as OsaxClinicalIndicators)
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.fromIndicators(undefined as unknown as OsaxClinicalIndicators)
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should freeze indicators for immutability', () => {
    const indicators = createValidIndicators();
    const score = OsaxClinicalScore.fromIndicators(indicators);

    expect(Object.isFrozen(score.indicators)).toBe(true);
    expect(Object.isFrozen(score)).toBe(true);
  });
});

describe('OsaxClinicalScore.fromAHI', () => {
  it('should create score from AHI only', () => {
    const score = OsaxClinicalScore.fromAHI(25);

    expect(score.indicators.ahi).toBe(25);
    expect(score.confidence).toBe(0.7); // Lower confidence for AHI-only
  });

  it('should estimate ODI from AHI', () => {
    const score = OsaxClinicalScore.fromAHI(30);
    expect(score.indicators.odi).toBeCloseTo(25.5, 1); // ~85% of AHI
  });

  it('should estimate SpO2 nadir based on severity', () => {
    expect(OsaxClinicalScore.fromAHI(3).indicators.spo2Nadir).toBe(94);
    expect(OsaxClinicalScore.fromAHI(8).indicators.spo2Nadir).toBe(88);
    expect(OsaxClinicalScore.fromAHI(20).indicators.spo2Nadir).toBe(82);
    expect(OsaxClinicalScore.fromAHI(40).indicators.spo2Nadir).toBe(75);
  });

  it('should estimate ESS based on severity', () => {
    expect(OsaxClinicalScore.fromAHI(3).indicators.essScore).toBe(4);
    expect(OsaxClinicalScore.fromAHI(8).indicators.essScore).toBe(8);
    expect(OsaxClinicalScore.fromAHI(20).indicators.essScore).toBe(12);
    expect(OsaxClinicalScore.fromAHI(40).indicators.essScore).toBe(16);
  });

  it('should throw for invalid AHI', () => {
    expect(() => OsaxClinicalScore.fromAHI(-1)).toThrow(InvalidOsaxScoreError);
    expect(() => OsaxClinicalScore.fromAHI(151)).toThrow(InvalidOsaxScoreError);
    expect(() => OsaxClinicalScore.fromAHI(NaN)).toThrow(InvalidOsaxScoreError);
  });

  it('should accept custom confidence', () => {
    const score = OsaxClinicalScore.fromAHI(20, 0.5);
    expect(score.confidence).toBe(0.5);
  });
});

describe('OsaxClinicalScore.forScreening', () => {
  it('should create screening score from AHI and ESS', () => {
    const score = OsaxClinicalScore.forScreening(15, 12);

    expect(score.indicators.ahi).toBe(15);
    expect(score.indicators.essScore).toBe(12);
    expect(score.confidence).toBe(0.6); // Lower for screening
  });

  it('should throw for invalid ESS', () => {
    expect(() => OsaxClinicalScore.forScreening(15, -1)).toThrow(InvalidOsaxScoreError);
    expect(() => OsaxClinicalScore.forScreening(15, 25)).toThrow(InvalidOsaxScoreError);
    expect(() => OsaxClinicalScore.forScreening(15, 10.5)).toThrow(InvalidOsaxScoreError); // Not integer
  });

  it('should accept custom confidence', () => {
    const score = OsaxClinicalScore.forScreening(20, 15, 0.4);
    expect(score.confidence).toBe(0.4);
  });
});

describe('OsaxClinicalScore.reconstitute', () => {
  it('should reconstitute from valid DTO', () => {
    const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
    const dto = original.toJSON();
    const reconstituted = OsaxClinicalScore.reconstitute(dto);

    expect(reconstituted.compositeScore).toBe(original.compositeScore);
    expect(reconstituted.severity).toBe(original.severity);
    expect(reconstituted.indicators.ahi).toBe(original.indicators.ahi);
  });

  it('should parse string scoredAt date', () => {
    const dto: OsaxClinicalScoreDTO = {
      compositeScore: 50,
      severity: 'MODERATE',
      cardiovascularRisk: 'HIGH',
      treatmentRecommendation: 'CPAP_THERAPY',
      indicators: createValidIndicators(),
      confidence: 0.9,
      scoredAt: '2024-01-15T10:30:00.000Z',
    };

    const score = OsaxClinicalScore.reconstitute(dto);
    expect(score.scoredAt).toBeInstanceOf(Date);
  });

  it('should throw for invalid DTO', () => {
    expect(() => OsaxClinicalScore.reconstitute(null as unknown as OsaxClinicalScoreDTO)).toThrow(
      InvalidOsaxScoreError
    );
    expect(() =>
      OsaxClinicalScore.reconstitute(undefined as unknown as OsaxClinicalScoreDTO)
    ).toThrow(InvalidOsaxScoreError);
    expect(() =>
      OsaxClinicalScore.reconstitute('invalid' as unknown as OsaxClinicalScoreDTO)
    ).toThrow(InvalidOsaxScoreError);
  });

  it('should throw for missing required fields', () => {
    const dto = { compositeScore: 50 } as unknown as OsaxClinicalScoreDTO;
    expect(() => OsaxClinicalScore.reconstitute(dto)).toThrow('Missing required field');
  });

  it('should throw for invalid scoredAt date', () => {
    const dto: OsaxClinicalScoreDTO = {
      compositeScore: 50,
      severity: 'MODERATE',
      cardiovascularRisk: 'HIGH',
      treatmentRecommendation: 'CPAP_THERAPY',
      indicators: createValidIndicators(),
      confidence: 0.9,
      scoredAt: 'invalid-date',
    };

    expect(() => OsaxClinicalScore.reconstitute(dto)).toThrow('Invalid scoredAt date');
  });
});

describe('OsaxClinicalScore.parse', () => {
  it('should return existing OsaxClinicalScore instance', () => {
    const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
    const result = OsaxClinicalScore.parse(original);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(original);
    }
  });

  it('should parse full DTO', () => {
    const dto = OsaxClinicalScore.fromIndicators(createValidIndicators()).toJSON();
    const result = OsaxClinicalScore.parse(dto);

    expect(result.success).toBe(true);
  });

  it('should parse indicators-only object', () => {
    const obj = { indicators: createValidIndicators() };
    const result = OsaxClinicalScore.parse(obj);

    expect(result.success).toBe(true);
  });

  it('should parse AHI-only object', () => {
    const obj = { ahi: 25 };
    const result = OsaxClinicalScore.parse(obj);

    expect(result.success).toBe(true);
  });

  it('should parse numeric AHI value', () => {
    const result = OsaxClinicalScore.parse(25);

    expect(result.success).toBe(true);
  });

  it('should return error for null/undefined', () => {
    expect(OsaxClinicalScore.parse(null).success).toBe(false);
    expect(OsaxClinicalScore.parse(undefined).success).toBe(false);
  });

  it('should return error for invalid types', () => {
    expect(OsaxClinicalScore.parse('invalid').success).toBe(false);
    expect(OsaxClinicalScore.parse(true).success).toBe(false);
  });

  it('should return error for invalid AHI value', () => {
    const result = OsaxClinicalScore.parse(-5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('AHI');
    }
  });

  it('should include confidence from object when parsing indicators', () => {
    const obj = { indicators: createValidIndicators(), confidence: 0.8 };
    const result = OsaxClinicalScore.parse(obj);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.confidence).toBe(0.8);
    }
  });
});

// ============================================================================
// CARDIOVASCULAR RISK CALCULATION
// ============================================================================

describe('cardiovascular risk calculation', () => {
  it('should calculate CRITICAL risk for severe OSA with low SpO2', () => {
    const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());

    expect(score.cardiovascularRisk).toBe('CRITICAL');
  });

  it('should calculate HIGH risk for moderate+ OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createModerateIndicators());
    expect(score.cardiovascularRisk).toBe('HIGH');
  });

  it('should calculate HIGH risk for SpO2 nadir < 80', () => {
    const score = OsaxClinicalScore.fromIndicators(
      createValidIndicators({
        ahi: 10,
        spo2Nadir: 75,
      })
    );
    expect(score.cardiovascularRisk).toBe('HIGH');
  });

  it('should calculate MODERATE risk for mild OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createMildIndicators());
    expect(score.cardiovascularRisk).toBe('MODERATE');
  });

  it('should calculate LOW risk for no OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createNoOsaIndicators());
    expect(score.cardiovascularRisk).toBe('LOW');
  });
});

// ============================================================================
// TREATMENT RECOMMENDATION CALCULATION
// ============================================================================

describe('treatment recommendation calculation', () => {
  it('should recommend BiPAP for severe OSA with very low SpO2', () => {
    const score = OsaxClinicalScore.fromIndicators(
      createValidIndicators({
        ahi: 50,
        spo2Nadir: 70,
        spo2Average: 85,
      })
    );

    expect(score.treatmentRecommendation).toBe('BIPAP_THERAPY');
  });

  it('should recommend CPAP for severe OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());
    expect(score.treatmentRecommendation).toBe('CPAP_THERAPY');
  });

  it('should recommend positional therapy for position-dependent moderate OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(
      createValidIndicators({
        ahi: 20,
        supineAhi: 60, // More than 2x overall AHI
      })
    );

    expect(score.treatmentRecommendation).toBe('POSITIONAL_THERAPY');
  });

  it('should recommend CPAP for moderate OSA without positional dependency', () => {
    const score = OsaxClinicalScore.fromIndicators(createModerateIndicators());
    expect(score.treatmentRecommendation).toBe('CPAP_THERAPY');
  });

  it('should recommend lifestyle modification for obese mild OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(
      createValidIndicators({
        ahi: 10,
        bmi: 32,
        spo2Nadir: 88,
        spo2Average: 95,
      })
    );

    expect(score.treatmentRecommendation).toBe('LIFESTYLE_MODIFICATION');
  });

  it('should recommend oral appliance for non-obese mild OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createMildIndicators());
    expect(score.treatmentRecommendation).toBe('ORAL_APPLIANCE');
  });

  it('should recommend lifestyle modification for no OSA', () => {
    const score = OsaxClinicalScore.fromIndicators(createNoOsaIndicators());
    expect(score.treatmentRecommendation).toBe('LIFESTYLE_MODIFICATION');
  });
});

// ============================================================================
// QUERY METHODS
// ============================================================================

describe('query methods', () => {
  describe('hasOSA', () => {
    it('should return true for AHI >= 5', () => {
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).hasOSA()).toBe(true);
      expect(OsaxClinicalScore.fromIndicators(createModerateIndicators()).hasOSA()).toBe(true);
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).hasOSA()).toBe(true);
    });

    it('should return false for AHI < 5', () => {
      expect(OsaxClinicalScore.fromIndicators(createNoOsaIndicators()).hasOSA()).toBe(false);
    });
  });

  describe('isModerateOrWorse', () => {
    it('should return true for moderate and severe', () => {
      expect(OsaxClinicalScore.fromIndicators(createModerateIndicators()).isModerateOrWorse()).toBe(
        true
      );
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).isModerateOrWorse()).toBe(
        true
      );
    });

    it('should return false for mild and none', () => {
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).isModerateOrWorse()).toBe(
        false
      );
      expect(OsaxClinicalScore.fromIndicators(createNoOsaIndicators()).isModerateOrWorse()).toBe(
        false
      );
    });
  });

  describe('isSevere', () => {
    it('should return true only for severe', () => {
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).isSevere()).toBe(true);
    });

    it('should return false for non-severe', () => {
      expect(OsaxClinicalScore.fromIndicators(createModerateIndicators()).isSevere()).toBe(false);
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).isSevere()).toBe(false);
      expect(OsaxClinicalScore.fromIndicators(createNoOsaIndicators()).isSevere()).toBe(false);
    });
  });

  describe('requiresCPAP', () => {
    it('should return true for CPAP or BiPAP recommendations', () => {
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).requiresCPAP()).toBe(true);
      expect(OsaxClinicalScore.fromIndicators(createModerateIndicators()).requiresCPAP()).toBe(
        true
      );
    });

    it('should return false for other treatments', () => {
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).requiresCPAP()).toBe(false);
    });
  });

  describe('requiresBiPAP', () => {
    it('should return true only for BiPAP recommendation', () => {
      const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(score.requiresBiPAP()).toBe(true);
    });

    it('should return false for CPAP', () => {
      // Severe with SpO2 nadir >= 75 should get CPAP, not BiPAP
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).requiresBiPAP()).toBe(
        false
      );
    });
  });

  describe('requiresUrgentIntervention', () => {
    it('should return true for critical CV risk', () => {
      const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(score.requiresUrgentIntervention()).toBe(true);
    });

    it('should return true for severe OSA', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createSevereIndicators()).requiresUrgentIntervention()
      ).toBe(true);
    });

    it('should return false for moderate or less', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createModerateIndicators()).requiresUrgentIntervention()
      ).toBe(false);
    });
  });

  describe('isSurgicalCandidate', () => {
    it('should return true for moderate+ OSA with BMI < 35', () => {
      const score = OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          ahi: 25,
          bmi: 30,
          spo2Nadir: 82,
        })
      );
      expect(score.isSurgicalCandidate()).toBe(true);
    });

    it('should return false for high BMI', () => {
      const score = OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          ahi: 25,
          bmi: 40,
          spo2Nadir: 82,
        })
      );
      expect(score.isSurgicalCandidate()).toBe(false);
    });

    it('should return false when BMI not provided', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createModerateIndicators()).isSurgicalCandidate()
      ).toBe(false);
    });
  });

  describe('hasExcessiveDaytimeSleepiness', () => {
    it('should return true for ESS >= 10', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ essScore: 12 })
        ).hasExcessiveDaytimeSleepiness()
      ).toBe(true);
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ essScore: 10 })
        ).hasExcessiveDaytimeSleepiness()
      ).toBe(true);
    });

    it('should return false for ESS < 10', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ essScore: 8 })
        ).hasExcessiveDaytimeSleepiness()
      ).toBe(false);
    });
  });

  describe('hasSignificantHypoxemia', () => {
    it('should return true for SpO2 nadir < 80', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ spo2Nadir: 75 })
        ).hasSignificantHypoxemia()
      ).toBe(true);
    });

    it('should return true for SpO2 average < 90', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ spo2Nadir: 85, spo2Average: 88 })
        ).hasSignificantHypoxemia()
      ).toBe(true);
    });

    it('should return false for normal values', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createMildIndicators()).hasSignificantHypoxemia()
      ).toBe(false);
    });
  });

  describe('hasSevereHypoxemia', () => {
    it('should return true for SpO2 nadir < 70', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ spo2Nadir: 65, spo2Average: 85 })
        ).hasSevereHypoxemia()
      ).toBe(true);
    });

    it('should return false for SpO2 nadir >= 70', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createValidIndicators({ spo2Nadir: 75 })
        ).hasSevereHypoxemia()
      ).toBe(false);
    });
  });

  describe('hasPositionalOSA', () => {
    it('should return true when supine AHI > 2x overall', () => {
      const score = OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          ahi: 20,
          supineAhi: 50,
        })
      );
      expect(score.hasPositionalOSA()).toBe(true);
    });

    it('should return false when supine AHI not provided', () => {
      expect(OsaxClinicalScore.fromIndicators(createValidIndicators()).hasPositionalOSA()).toBe(
        false
      );
    });

    it('should return false when AHI is 0', () => {
      const score = OsaxClinicalScore.fromIndicators(createNoOsaIndicators());
      expect(score.hasPositionalOSA()).toBe(false);
    });
  });

  describe('hasREMPredominantOSA', () => {
    it('should return true when REM AHI > 2x overall', () => {
      const score = OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          ahi: 20,
          remAhi: 50,
        })
      );
      expect(score.hasREMPredominantOSA()).toBe(true);
    });

    it('should return false when REM AHI not provided', () => {
      expect(OsaxClinicalScore.fromIndicators(createValidIndicators()).hasREMPredominantOSA()).toBe(
        false
      );
    });
  });

  describe('isHighConfidence', () => {
    it('should return true for confidence >= 0.8', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.9).isHighConfidence()
      ).toBe(true);
      expect(
        OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.8).isHighConfidence()
      ).toBe(true);
    });

    it('should return false for confidence < 0.8', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.7).isHighConfidence()
      ).toBe(false);
    });
  });

  describe('requiresPhysicianReview', () => {
    it('should return true for critical CV risk', () => {
      const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(score.requiresPhysicianReview()).toBe(true);
    });

    it('should return true for low confidence', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.6).requiresPhysicianReview()
      ).toBe(true);
    });

    it('should return false for high confidence non-critical', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createMildIndicators()).requiresPhysicianReview()
      ).toBe(false);
    });
  });

  describe('getFollowUpUrgency', () => {
    it('should return immediate for critical CV risk', () => {
      const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(score.getFollowUpUrgency()).toBe('immediate');
    });

    it('should return urgent for severe', () => {
      // Severe with HIGH (not CRITICAL) CV risk should be urgent
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).getFollowUpUrgency()).toBe(
        'urgent'
      );
    });

    it('should return soon for moderate', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createModerateIndicators()).getFollowUpUrgency()
      ).toBe('soon');
    });

    it('should return routine for mild/none', () => {
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).getFollowUpUrgency()).toBe(
        'routine'
      );
    });
  });

  describe('getClinicalReviewSLAHours', () => {
    it('should return correct SLA hours', () => {
      const critical = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(critical.getClinicalReviewSLAHours()).toBe(4); // immediate = 4 hours

      // Severe (with HIGH CV risk, not CRITICAL) should be urgent = 24 hours
      expect(
        OsaxClinicalScore.fromIndicators(createSevereIndicators()).getClinicalReviewSLAHours()
      ).toBe(24);
      expect(
        OsaxClinicalScore.fromIndicators(createModerateIndicators()).getClinicalReviewSLAHours()
      ).toBe(72);
      expect(
        OsaxClinicalScore.fromIndicators(createMildIndicators()).getClinicalReviewSLAHours()
      ).toBe(168);
    });
  });

  describe('getTaskPriority', () => {
    it('should return correct priority', () => {
      const critical = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(critical.getTaskPriority()).toBe('critical');

      // Severe with HIGH (not CRITICAL) CV risk should be high priority
      expect(OsaxClinicalScore.fromIndicators(createSevereIndicators()).getTaskPriority()).toBe(
        'high'
      );
      expect(OsaxClinicalScore.fromIndicators(createModerateIndicators()).getTaskPriority()).toBe(
        'medium'
      );
      expect(OsaxClinicalScore.fromIndicators(createMildIndicators()).getTaskPriority()).toBe(
        'low'
      );
    });
  });

  describe('getRecommendedReEvaluationMonths', () => {
    it('should return correct re-evaluation interval', () => {
      expect(
        OsaxClinicalScore.fromIndicators(
          createSevereIndicators()
        ).getRecommendedReEvaluationMonths()
      ).toBe(1);
      expect(
        OsaxClinicalScore.fromIndicators(
          createModerateIndicators()
        ).getRecommendedReEvaluationMonths()
      ).toBe(3);
      expect(
        OsaxClinicalScore.fromIndicators(createMildIndicators()).getRecommendedReEvaluationMonths()
      ).toBe(6);
      expect(
        OsaxClinicalScore.fromIndicators(createNoOsaIndicators()).getRecommendedReEvaluationMonths()
      ).toBe(12);
    });
  });

  describe('shouldReferToSpecialist', () => {
    it('should return true for critical/high CV risk', () => {
      const critical = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(critical.shouldReferToSpecialist()).toBe(true);

      // Severe also has HIGH CV risk, so should refer
      expect(
        OsaxClinicalScore.fromIndicators(createSevereIndicators()).shouldReferToSpecialist()
      ).toBe(true);
    });

    it('should return true for surgical candidates', () => {
      const score = OsaxClinicalScore.fromIndicators(
        createValidIndicators({
          ahi: 25,
          bmi: 28,
          spo2Nadir: 82,
        })
      );
      expect(score.shouldReferToSpecialist()).toBe(true);
    });

    it('should return false for mild OSA', () => {
      expect(
        OsaxClinicalScore.fromIndicators(createMildIndicators()).shouldReferToSpecialist()
      ).toBe(false);
    });
  });

  describe('getClinicalSummary', () => {
    it('should return formatted summary', () => {
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const summary = score.getClinicalSummary();

      expect(summary).toContain('SEVERE OSA');
      expect(summary).toContain('AHI: 45');
      expect(summary).toContain('CV Risk:');
      expect(summary).toContain('Recommendation:');
    });

    it('should include SpO2 for significant hypoxemia', () => {
      // SpO2 nadir < 80 or average < 90 triggers hypoxemia warning
      const score = OsaxClinicalScore.fromIndicators(createCriticalIndicators());
      expect(score.getClinicalSummary()).toContain('SpO2 nadir: 70%');
    });
  });
});

// ============================================================================
// TRANSFORMATION METHODS
// ============================================================================

describe('transformation methods', () => {
  describe('withUpdatedIndicators', () => {
    it('should create new score with updated indicators', () => {
      const original = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const updated = original.withUpdatedIndicators({ ahi: 35 });

      expect(original.severity).toBe('MILD');
      expect(updated.severity).toBe('SEVERE');
      expect(original.indicators.ahi).toBe(8);
      expect(updated.indicators.ahi).toBe(35);
    });

    it('should preserve original confidence', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.85);
      const updated = original.withUpdatedIndicators({ ahi: 10 });

      expect(updated.confidence).toBe(0.85);
    });
  });

  describe('withConfidence', () => {
    it('should create new score with updated confidence', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.9);
      const updated = original.withConfidence(0.7);

      expect(original.confidence).toBe(0.9);
      expect(updated.confidence).toBe(0.7);
    });

    it('should throw for invalid confidence', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      expect(() => score.withConfidence(-0.1)).toThrow(InvalidOsaxScoreError);
      expect(() => score.withConfidence(1.1)).toThrow(InvalidOsaxScoreError);
    });
  });

  describe('copy', () => {
    it('should create copy with modifications', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators(), 0.9);
      const copy = original.copy({
        indicators: { ahi: 40 },
        confidence: 0.8,
      });

      expect(copy.indicators.ahi).toBe(40);
      expect(copy.confidence).toBe(0.8);
    });

    it('should create identical copy without modifications', () => {
      const original = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const copy = original.copy();

      expect(copy.equals(original)).toBe(true);
    });
  });
});

// ============================================================================
// EQUALITY & COMPARISON
// ============================================================================

describe('equality and comparison', () => {
  describe('equals', () => {
    it('should return true for same values', () => {
      const indicators = createValidIndicators();
      const score1 = OsaxClinicalScore.fromIndicators(indicators);
      const score2 = OsaxClinicalScore.fromIndicators(indicators);

      expect(score1.equals(score2)).toBe(true);
    });

    it('should return true for same instance', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      expect(score.equals(score)).toBe(true);
    });

    it('should return false for different values', () => {
      const score1 = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const score2 = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(score1.equals(score2)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      expect(score.equals(null)).toBe(false);
      expect(score.equals(undefined)).toBe(false);
    });
  });

  describe('hash', () => {
    it('should return consistent hash for same values', () => {
      const indicators = createValidIndicators();
      const score1 = OsaxClinicalScore.fromIndicators(indicators);
      const score2 = OsaxClinicalScore.fromIndicators(indicators);

      expect(score1.hash()).toBe(score2.hash());
    });

    it('should return different hash for different values', () => {
      const score1 = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const score2 = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(score1.hash()).not.toBe(score2.hash());
    });
  });

  describe('compareTo', () => {
    it('should return positive for more severe score', () => {
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(severe.compareTo(mild)).toBeGreaterThan(0);
    });

    it('should return negative for less severe score', () => {
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(mild.compareTo(severe)).toBeLessThan(0);
    });

    it('should return 0 for equal scores', () => {
      const score1 = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const score2 = OsaxClinicalScore.fromIndicators(createValidIndicators());

      expect(score1.compareTo(score2)).toBe(0);
    });
  });

  describe('isWorseThan', () => {
    it('should return true when more severe', () => {
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(severe.isWorseThan(mild)).toBe(true);
    });

    it('should return false when less severe', () => {
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(mild.isWorseThan(severe)).toBe(false);
    });
  });

  describe('isBetterThan', () => {
    it('should return true when less severe', () => {
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      expect(mild.isBetterThan(severe)).toBe(true);
    });

    it('should return false when more severe', () => {
      const severe = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const mild = OsaxClinicalScore.fromIndicators(createMildIndicators());

      expect(severe.isBetterThan(mild)).toBe(false);
    });
  });
});

// ============================================================================
// SERIALIZATION
// ============================================================================

describe('serialization', () => {
  describe('toJSON', () => {
    it('should include all fields', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const json = score.toJSON();

      expect(json).toHaveProperty('compositeScore');
      expect(json).toHaveProperty('severity');
      expect(json).toHaveProperty('cardiovascularRisk');
      expect(json).toHaveProperty('treatmentRecommendation');
      expect(json).toHaveProperty('indicators');
      expect(json).toHaveProperty('confidence');
      expect(json).toHaveProperty('scoredAt');
      expect(json).toHaveProperty('algorithmVersion');
    });

    it('should serialize scoredAt as ISO string', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      const json = score.toJSON();

      expect(typeof json.scoredAt).toBe('string');
      expect(json.scoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const str = score.toString();

      expect(str).toContain('OsaxClinicalScore');
      expect(str).toContain('AHI: 45');
      expect(str).toContain('Severity: SEVERE');
    });
  });

  describe('toCompactString', () => {
    it('should return compact representation', () => {
      const score = OsaxClinicalScore.fromIndicators(createSevereIndicators());
      const compact = score.toCompactString();

      expect(compact).toMatch(/OSAX\[SEVERE:\d+\.?\d*\]/);
    });
  });
});

// ============================================================================
// ERROR CLASS
// ============================================================================

describe('InvalidOsaxScoreError', () => {
  it('should have correct name and code', () => {
    const error = new InvalidOsaxScoreError('Test error');

    expect(error.name).toBe('InvalidOsaxScoreError');
    expect(error.code).toBe('INVALID_OSAX_SCORE');
    expect(error.message).toBe('Test error');
  });

  it('should include details', () => {
    const error = new InvalidOsaxScoreError('Invalid AHI', {
      field: 'ahi',
      value: -5,
      range: [0, 150],
    });

    expect(error.details.field).toBe('ahi');
    expect(error.details.value).toBe(-5);
    expect(error.details.range).toEqual([0, 150]);
  });

  it('should freeze details', () => {
    const error = new InvalidOsaxScoreError('Test', { field: 'test' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('should serialize to JSON', () => {
    const error = new InvalidOsaxScoreError('Test error', { field: 'test' });
    const json = error.toJSON();

    expect(json.name).toBe('InvalidOsaxScoreError');
    expect(json.code).toBe('INVALID_OSAX_SCORE');
    expect(json.message).toBe('Test error');
    expect(json.details).toEqual({ field: 'test' });
  });
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

describe('type guards', () => {
  describe('isOsaxClinicalScore', () => {
    it('should return true for OsaxClinicalScore instance', () => {
      const score = OsaxClinicalScore.fromIndicators(createValidIndicators());
      expect(isOsaxClinicalScore(score)).toBe(true);
    });

    it('should return false for non-instances', () => {
      expect(isOsaxClinicalScore(null)).toBe(false);
      expect(isOsaxClinicalScore(undefined)).toBe(false);
      expect(isOsaxClinicalScore({})).toBe(false);
      expect(isOsaxClinicalScore({ severity: 'MODERATE' })).toBe(false);
    });
  });

  describe('isSuccessfulParse', () => {
    it('should return true for successful parse', () => {
      const result = OsaxClinicalScore.parse(createValidIndicators());
      expect(isSuccessfulParse(result)).toBe(true);
    });

    it('should return false for failed parse', () => {
      const result = OsaxClinicalScore.parse(null);
      expect(isSuccessfulParse(result)).toBe(false);
    });
  });
});

// ============================================================================
// CONSTANTS
// ============================================================================

describe('constants', () => {
  it('should export CLINICAL_INDICATOR_RANGES', () => {
    expect(CLINICAL_INDICATOR_RANGES.ahi).toEqual({ min: 0, max: 150, unit: 'events/hour' });
    expect(CLINICAL_INDICATOR_RANGES.essScore).toEqual({
      min: 0,
      max: 24,
      unit: 'points',
      integer: true,
    });
  });

  it('should export SEVERITY_THRESHOLDS', () => {
    expect(SEVERITY_THRESHOLDS.NONE).toEqual({ ahiMax: 5 });
    expect(SEVERITY_THRESHOLDS.MILD).toEqual({ ahiMin: 5, ahiMax: 15 });
    expect(SEVERITY_THRESHOLDS.SEVERE).toEqual({ ahiMin: 30 });
  });

  it('should export CLINICAL_SLA_HOURS', () => {
    expect(CLINICAL_SLA_HOURS.immediate).toBe(4);
    expect(CLINICAL_SLA_HOURS.urgent).toBe(24);
    expect(CLINICAL_SLA_HOURS.soon).toBe(72);
    expect(CLINICAL_SLA_HOURS.routine).toBe(168);
  });
});
