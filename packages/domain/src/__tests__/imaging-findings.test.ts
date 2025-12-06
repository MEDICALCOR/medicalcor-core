/**
 * ImagingFindings Value Object Tests
 * Comprehensive tests for dental imaging analysis results
 */

import { describe, it, expect } from 'vitest';
import {
  ImagingFindings,
  InvalidImagingFindingsError,
  isImagingFindings,
  type RegionFinding,
  type CreateImagingFindingsInput,
  type ImagingFindingsDTO,
  type ImagingModality,
  type FindingType,
  type RiskClass,
} from '../osax/value-objects/ImagingFindings.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createValidFinding = (overrides: Partial<RegionFinding> = {}): RegionFinding => ({
  regionId: 'mandible-36',
  regionName: 'Lower Left First Molar',
  findingType: 'IMPLANT_SITE_SUITABLE',
  confidence: 0.92,
  riskClass: 'GREEN',
  notes: 'Good bone density observed',
  ...overrides,
});

const createValidInput = (
  overrides: Partial<CreateImagingFindingsInput> = {}
): CreateImagingFindingsInput => ({
  findings: [
    createValidFinding(),
    createValidFinding({
      regionId: 'mandible-37',
      regionName: 'Lower Left Second Molar',
      findingType: 'BONE_DENSITY_ADEQUATE',
    }),
  ],
  modality: 'CBCT',
  algorithmVersion: '1.0.0',
  ...overrides,
});

// ============================================================================
// FACTORY METHOD: create()
// ============================================================================

describe('ImagingFindings.create', () => {
  describe('valid inputs', () => {
    it('should create findings with valid input', () => {
      const input = createValidInput();
      const findings = ImagingFindings.create(input);

      expect(findings.findings).toHaveLength(2);
      expect(findings.modality).toBe('CBCT');
      expect(findings.algorithmVersion).toBe('1.0.0');
    });

    it('should calculate overall confidence from findings', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ confidence: 0.9, riskClass: 'GREEN' }),
            createValidFinding({ confidence: 0.8, riskClass: 'GREEN' }),
          ],
        })
      );

      expect(findings.overallConfidence).toBeGreaterThan(0);
    });

    it('should weight RED findings higher in confidence calculation', () => {
      // When confidences differ, the weighted average should favor high-risk findings
      const greenFindings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ confidence: 0.9, riskClass: 'GREEN' }),
            createValidFinding({ confidence: 0.6, riskClass: 'GREEN' }),
          ],
        })
      );

      const redFindings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ confidence: 0.6, riskClass: 'RED' }),
            createValidFinding({ confidence: 0.9, riskClass: 'GREEN' }),
          ],
        })
      );

      // Green: (0.9*1.0 + 0.6*1.0) / 2.0 = 0.75
      // Red: (0.6*1.5 + 0.9*1.0) / 2.5 = (0.9 + 0.9) / 2.5 = 0.72
      // RED findings are weighted higher, so when the RED finding has lower confidence,
      // the overall confidence should be lower
      expect(redFindings.overallConfidence).toBeLessThan(greenFindings.overallConfidence);
    });

    it('should set analyzedAt to provided date', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const findings = ImagingFindings.create(createValidInput({ analyzedAt: date }));
      expect(findings.analyzedAt).toEqual(date);
    });

    it('should set analyzedAt to current date if not provided', () => {
      const before = new Date();
      const findings = ImagingFindings.create(createValidInput());
      const after = new Date();

      expect(findings.analyzedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(findings.analyzedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should freeze findings array', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(Object.isFrozen(findings.findings)).toBe(true);
    });

    it('should freeze individual findings', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(Object.isFrozen(findings.findings[0])).toBe(true);
    });

    it('should freeze the findings object', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(Object.isFrozen(findings)).toBe(true);
    });

    it('should accept all valid modalities', () => {
      const modalities: ImagingModality[] = [
        'CBCT',
        'PANORAMIC',
        'PERIAPICAL',
        'INTRAORAL_SCAN',
        'CEPHALOMETRIC',
      ];

      for (const modality of modalities) {
        const findings = ImagingFindings.create(createValidInput({ modality }));
        expect(findings.modality).toBe(modality);
      }
    });

    it('should accept all valid finding types', () => {
      const findingTypes: FindingType[] = [
        'BONE_DENSITY_ADEQUATE',
        'BONE_DENSITY_COMPROMISED',
        'SINUS_PROXIMITY',
        'NERVE_PROXIMITY',
        'PATHOLOGY_SUSPECTED',
        'IMPLANT_SITE_SUITABLE',
        'IMPLANT_SITE_REQUIRES_AUGMENTATION',
        'ROOT_RESORPTION',
        'PERIODONTAL_BONE_LOSS',
        'CYST_DETECTED',
        'IMPACTED_TOOTH',
        'ANATOMICAL_VARIATION',
      ];

      for (const findingType of findingTypes) {
        const findings = ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ findingType })],
          })
        );
        expect(findings.findings[0].findingType).toBe(findingType);
      }
    });

    it('should accept all valid risk classes', () => {
      const riskClasses: RiskClass[] = ['GREEN', 'YELLOW', 'RED'];

      for (const riskClass of riskClasses) {
        const findings = ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ riskClass })],
          })
        );
        expect(findings.findings[0].riskClass).toBe(riskClass);
      }
    });
  });

  describe('findings validation', () => {
    it('should reject non-array findings', () => {
      expect(() =>
        ImagingFindings.create({
          ...createValidInput(),
          findings: 'not-array' as unknown as RegionFinding[],
        })
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject null findings', () => {
      expect(() =>
        ImagingFindings.create({
          ...createValidInput(),
          findings: null as unknown as RegionFinding[],
        })
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('regionId validation', () => {
    it('should reject empty regionId', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ regionId: '' })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject regionId over 100 chars', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ regionId: 'x'.repeat(101) })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('regionName validation', () => {
    it('should reject empty regionName', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ regionName: '' })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject regionName over 200 chars', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ regionName: 'x'.repeat(201) })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('findingType validation', () => {
    it('should reject invalid findingType', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ findingType: 'INVALID_TYPE' as FindingType })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('confidence validation', () => {
    it('should reject confidence below 0', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ confidence: -0.1 })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject confidence above 1', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ confidence: 1.1 })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject NaN confidence', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ confidence: NaN })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('riskClass validation', () => {
    it('should reject invalid riskClass', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ riskClass: 'INVALID' as RiskClass })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('boundingBox validation', () => {
    it('should accept valid bounding box', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({
              boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            }),
          ],
        })
      );
      expect(findings.findings[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    });

    it('should reject bounding box x below 0', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [
              createValidFinding({
                boundingBox: { x: -0.1, y: 0.2, width: 0.3, height: 0.4 },
              }),
            ],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject bounding box x above 1', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [
              createValidFinding({
                boundingBox: { x: 1.1, y: 0.2, width: 0.3, height: 0.4 },
              }),
            ],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject bounding box with NaN values', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [
              createValidFinding({
                boundingBox: { x: NaN, y: 0.2, width: 0.3, height: 0.4 },
              }),
            ],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('notes validation', () => {
    it('should accept notes at max length', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ notes: 'x'.repeat(500) })],
        })
      );
      expect(findings.findings[0].notes).toHaveLength(500);
    });

    it('should reject notes over 500 chars', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            findings: [createValidFinding({ notes: 'x'.repeat(501) })],
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('modality validation', () => {
    it('should reject invalid modality', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            modality: 'INVALID_MODALITY' as ImagingModality,
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });

  describe('algorithmVersion validation', () => {
    it('should reject empty algorithmVersion', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            algorithmVersion: '',
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });

    it('should reject null algorithmVersion', () => {
      expect(() =>
        ImagingFindings.create(
          createValidInput({
            algorithmVersion: null as unknown as string,
          })
        )
      ).toThrow(InvalidImagingFindingsError);
    });
  });
});

// ============================================================================
// FACTORY METHOD: createEmpty()
// ============================================================================

describe('ImagingFindings.createEmpty', () => {
  it('should create empty findings', () => {
    const findings = ImagingFindings.createEmpty('PANORAMIC', '2.0.0');

    expect(findings.findings).toHaveLength(0);
    expect(findings.overallConfidence).toBe(0);
    expect(findings.modality).toBe('PANORAMIC');
    expect(findings.algorithmVersion).toBe('2.0.0');
  });

  it('should have isComplete return false for empty findings', () => {
    const findings = ImagingFindings.createEmpty('CBCT', '1.0.0');
    expect(findings.isComplete()).toBe(false);
  });
});

// ============================================================================
// FACTORY METHOD: reconstitute()
// ============================================================================

describe('ImagingFindings.reconstitute', () => {
  const createValidDTO = (): ImagingFindingsDTO => ({
    findings: [createValidFinding()],
    overallConfidence: 0.9,
    modality: 'CBCT',
    analyzedAt: '2024-01-15T10:00:00.000Z',
    algorithmVersion: '1.0.0',
  });

  it('should reconstitute from valid DTO with string date', () => {
    const dto = createValidDTO();
    const findings = ImagingFindings.reconstitute(dto);

    expect(findings.findings).toHaveLength(1);
    expect(findings.analyzedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
  });

  it('should reconstitute from DTO with Date object', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const dto = { ...createValidDTO(), analyzedAt: date };
    const findings = ImagingFindings.reconstitute(dto);

    expect(findings.analyzedAt).toEqual(date);
  });

  it('should reject invalid DTO (null)', () => {
    expect(() => ImagingFindings.reconstitute(null as unknown as ImagingFindingsDTO)).toThrow(
      InvalidImagingFindingsError
    );
  });

  it('should reject invalid DTO (non-object)', () => {
    expect(() => ImagingFindings.reconstitute('invalid' as unknown as ImagingFindingsDTO)).toThrow(
      InvalidImagingFindingsError
    );
  });

  it('should reject invalid analyzedAt date', () => {
    const dto = { ...createValidDTO(), analyzedAt: 'invalid-date' };
    expect(() => ImagingFindings.reconstitute(dto)).toThrow(InvalidImagingFindingsError);
  });
});

// ============================================================================
// QUERY METHODS
// ============================================================================

describe('ImagingFindings query methods', () => {
  describe('isComplete', () => {
    it('should return true when findings exist', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(findings.isComplete()).toBe(true);
    });

    it('should return false when no findings', () => {
      const findings = ImagingFindings.createEmpty('CBCT', '1.0.0');
      expect(findings.isComplete()).toBe(false);
    });
  });

  describe('aggregateConfidence', () => {
    it('should return overallConfidence value', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(findings.aggregateConfidence()).toBe(findings.overallConfidence);
    });
  });

  describe('hasHighRiskFindings', () => {
    it('should return true when RED findings exist', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'RED' }),
          ],
        })
      );
      expect(findings.hasHighRiskFindings()).toBe(true);
    });

    it('should return false when no RED findings', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'YELLOW' }),
          ],
        })
      );
      expect(findings.hasHighRiskFindings()).toBe(false);
    });
  });

  describe('hasCautionFindings', () => {
    it('should return true when YELLOW findings exist', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'YELLOW' }),
          ],
        })
      );
      expect(findings.hasCautionFindings()).toBe(true);
    });

    it('should return false when no YELLOW findings', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'GREEN' }),
          ],
        })
      );
      expect(findings.hasCautionFindings()).toBe(false);
    });
  });

  describe('requiresSpecialistReview', () => {
    it('should return true when confidence below 0.7', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ confidence: 0.5 })],
        })
      );
      expect(findings.requiresSpecialistReview()).toBe(true);
    });

    it('should return true when RED findings exist', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ confidence: 0.95, riskClass: 'RED' })],
        })
      );
      expect(findings.requiresSpecialistReview()).toBe(true);
    });

    it('should return false when high confidence and no RED findings', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ confidence: 0.9, riskClass: 'GREEN' })],
        })
      );
      expect(findings.requiresSpecialistReview()).toBe(false);
    });
  });

  describe('getFindingsByRiskClass', () => {
    it('should return only findings matching risk class', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ regionId: 'a', riskClass: 'GREEN' }),
            createValidFinding({ regionId: 'b', riskClass: 'YELLOW' }),
            createValidFinding({ regionId: 'c', riskClass: 'GREEN' }),
            createValidFinding({ regionId: 'd', riskClass: 'RED' }),
          ],
        })
      );

      expect(findings.getFindingsByRiskClass('GREEN')).toHaveLength(2);
      expect(findings.getFindingsByRiskClass('YELLOW')).toHaveLength(1);
      expect(findings.getFindingsByRiskClass('RED')).toHaveLength(1);
    });
  });

  describe('getFindingsByType', () => {
    it('should return only findings matching type', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ findingType: 'IMPLANT_SITE_SUITABLE' }),
            createValidFinding({ findingType: 'BONE_DENSITY_ADEQUATE' }),
            createValidFinding({ findingType: 'IMPLANT_SITE_SUITABLE' }),
          ],
        })
      );

      expect(findings.getFindingsByType('IMPLANT_SITE_SUITABLE')).toHaveLength(2);
      expect(findings.getFindingsByType('BONE_DENSITY_ADEQUATE')).toHaveLength(1);
      expect(findings.getFindingsByType('CYST_DETECTED')).toHaveLength(0);
    });
  });

  describe('getHighestRiskClass', () => {
    it('should return RED when RED findings exist', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'RED' }),
          ],
        })
      );
      expect(findings.getHighestRiskClass()).toBe('RED');
    });

    it('should return YELLOW when no RED but YELLOW exists', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'YELLOW' }),
          ],
        })
      );
      expect(findings.getHighestRiskClass()).toBe('YELLOW');
    });

    it('should return GREEN when only GREEN findings', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'GREEN' }),
          ],
        })
      );
      expect(findings.getHighestRiskClass()).toBe('GREEN');
    });
  });

  describe('getRiskClassCounts', () => {
    it('should return counts for each risk class', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'YELLOW' }),
            createValidFinding({ riskClass: 'RED' }),
          ],
        })
      );

      const counts = findings.getRiskClassCounts();
      expect(counts.GREEN).toBe(2);
      expect(counts.YELLOW).toBe(1);
      expect(counts.RED).toBe(1);
    });

    it('should return zeros for empty findings', () => {
      const findings = ImagingFindings.createEmpty('CBCT', '1.0.0');
      const counts = findings.getRiskClassCounts();

      expect(counts.GREEN).toBe(0);
      expect(counts.YELLOW).toBe(0);
      expect(counts.RED).toBe(0);
    });
  });

  describe('hasImplantSiteSuitable', () => {
    it('should return true when IMPLANT_SITE_SUITABLE with GREEN risk exists', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ findingType: 'IMPLANT_SITE_SUITABLE', riskClass: 'GREEN' }),
          ],
        })
      );
      expect(findings.hasImplantSiteSuitable()).toBe(true);
    });

    it('should return false when IMPLANT_SITE_SUITABLE has non-GREEN risk', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ findingType: 'IMPLANT_SITE_SUITABLE', riskClass: 'YELLOW' }),
          ],
        })
      );
      expect(findings.hasImplantSiteSuitable()).toBe(false);
    });

    it('should return false when no IMPLANT_SITE_SUITABLE finding', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ findingType: 'BONE_DENSITY_ADEQUATE' })],
        })
      );
      expect(findings.hasImplantSiteSuitable()).toBe(false);
    });
  });

  describe('requiresBoneAugmentation', () => {
    it('should return true when IMPLANT_SITE_REQUIRES_AUGMENTATION exists', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ findingType: 'IMPLANT_SITE_REQUIRES_AUGMENTATION' })],
        })
      );
      expect(findings.requiresBoneAugmentation()).toBe(true);
    });

    it('should return true when BONE_DENSITY_COMPROMISED exists', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ findingType: 'BONE_DENSITY_COMPROMISED' })],
        })
      );
      expect(findings.requiresBoneAugmentation()).toBe(true);
    });

    it('should return false when neither condition exists', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ findingType: 'IMPLANT_SITE_SUITABLE' })],
        })
      );
      expect(findings.requiresBoneAugmentation()).toBe(false);
    });
  });

  describe('getClinicalSummary', () => {
    it('should return formatted summary string', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [
            createValidFinding({ riskClass: 'GREEN' }),
            createValidFinding({ riskClass: 'YELLOW' }),
          ],
          modality: 'CBCT',
        })
      );
      const summary = findings.getClinicalSummary();

      expect(summary).toContain('CBCT Analysis');
      expect(summary).toContain('Findings: 2');
      expect(summary).toContain('G:1');
      expect(summary).toContain('Y:1');
    });

    it('should include REVIEW REQUIRED when specialist review needed', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding({ riskClass: 'RED' })],
        })
      );
      const summary = findings.getClinicalSummary();

      expect(summary).toContain('REVIEW REQUIRED');
    });
  });
});

// ============================================================================
// EQUALITY & COMPARISON
// ============================================================================

describe('ImagingFindings equality', () => {
  describe('equals', () => {
    it('should return true for same instance', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(findings.equals(findings)).toBe(true);
    });

    it('should return true for equal findings', () => {
      const findings1 = ImagingFindings.create(createValidInput());
      const findings2 = ImagingFindings.create(createValidInput());

      expect(findings1.equals(findings2)).toBe(true);
    });

    it('should return false for different modality', () => {
      const findings1 = ImagingFindings.create(createValidInput({ modality: 'CBCT' }));
      const findings2 = ImagingFindings.create(createValidInput({ modality: 'PANORAMIC' }));

      expect(findings1.equals(findings2)).toBe(false);
    });

    it('should return false for different number of findings', () => {
      const findings1 = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding()],
        })
      );
      const findings2 = ImagingFindings.create(
        createValidInput({
          findings: [createValidFinding(), createValidFinding()],
        })
      );

      expect(findings1.equals(findings2)).toBe(false);
    });

    it('should return false for null', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(findings.equals(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      const findings = ImagingFindings.create(createValidInput());
      expect(findings.equals(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// SERIALIZATION
// ============================================================================

describe('ImagingFindings serialization', () => {
  describe('toJSON', () => {
    it('should serialize to JSON-compatible object', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const findings = ImagingFindings.create(createValidInput({ analyzedAt: date }));
      const json = findings.toJSON();

      expect(json.findings).toEqual(findings.findings);
      expect(json.overallConfidence).toBe(findings.overallConfidence);
      expect(json.modality).toBe(findings.modality);
      expect(json.analyzedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(json.algorithmVersion).toBe(findings.algorithmVersion);
    });

    it('should be round-trip serializable', () => {
      const original = ImagingFindings.create(createValidInput());
      const json = original.toJSON();
      const reconstituted = ImagingFindings.reconstitute(json);

      expect(reconstituted.modality).toBe(original.modality);
      expect(reconstituted.algorithmVersion).toBe(original.algorithmVersion);
      expect(reconstituted.findings.length).toBe(original.findings.length);
    });
  });

  describe('toString', () => {
    it('should return readable string representation', () => {
      const findings = ImagingFindings.create(
        createValidInput({
          modality: 'CBCT',
          findings: [createValidFinding(), createValidFinding()],
        })
      );
      const str = findings.toString();

      expect(str).toContain('ImagingFindings');
      expect(str).toContain('CBCT');
      expect(str).toContain('2 findings');
    });
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('InvalidImagingFindingsError', () => {
  it('should have correct name and code', () => {
    const error = new InvalidImagingFindingsError('Test message');
    expect(error.name).toBe('InvalidImagingFindingsError');
    expect(error.code).toBe('INVALID_IMAGING_FINDINGS');
  });

  it('should include details', () => {
    const error = new InvalidImagingFindingsError('Field error', {
      field: 'confidence',
      value: -0.5,
    });

    expect(error.details.field).toBe('confidence');
    expect(error.details.value).toBe(-0.5);
  });

  it('should include allowed values in details', () => {
    const error = new InvalidImagingFindingsError('Invalid modality', {
      field: 'modality',
      value: 'INVALID',
      allowed: ['CBCT', 'PANORAMIC'],
    });

    expect(error.details.allowed).toEqual(['CBCT', 'PANORAMIC']);
  });

  it('should freeze details', () => {
    const error = new InvalidImagingFindingsError('Test', { field: 'test' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('should serialize to JSON', () => {
    const error = new InvalidImagingFindingsError('Test message', { field: 'test' });
    const json = error.toJSON();

    expect(json.name).toBe('InvalidImagingFindingsError');
    expect(json.code).toBe('INVALID_IMAGING_FINDINGS');
    expect(json.message).toBe('Test message');
    expect(json.details).toEqual({ field: 'test' });
  });
});

// ============================================================================
// TYPE GUARD
// ============================================================================

describe('isImagingFindings', () => {
  it('should return true for ImagingFindings instance', () => {
    const findings = ImagingFindings.create(createValidInput());
    expect(isImagingFindings(findings)).toBe(true);
  });

  it('should return false for other objects', () => {
    expect(isImagingFindings({})).toBe(false);
    expect(isImagingFindings(null)).toBe(false);
    expect(isImagingFindings(undefined)).toBe(false);
    expect(isImagingFindings('string')).toBe(false);
  });
});
