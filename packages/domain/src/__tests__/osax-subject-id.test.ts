/**
 * @fileoverview Tests for OsaxSubjectId Value Object
 * Tests creation, parsing, anonymization, and all factory methods
 */

import { describe, it, expect } from 'vitest';
import {
  OsaxSubjectId,
  InvalidOsaxSubjectIdError,
  type OsaxSubjectDemographics,
} from '../osax/value-objects/OsaxSubjectId.js';

describe('OsaxSubjectId Value Object', () => {
  describe('Factory Methods', () => {
    describe('create', () => {
      it('should create from valid internal format', () => {
        const id = OsaxSubjectId.create('OSAX-2025-001');

        expect(id.formatted).toBe('OSAX-2025-001');
        expect(id.type).toBe('INTERNAL');
        expect(id.studyYear).toBe(2025);
        expect(id.sequenceNumber).toBe(1);
      });

      it('should throw for invalid format', () => {
        expect(() => OsaxSubjectId.create('invalid')).toThrow(InvalidOsaxSubjectIdError);
      });

      it('should throw for non-string input', () => {
        expect(() => OsaxSubjectId.create(123 as any)).toThrow(InvalidOsaxSubjectIdError);
      });
    });

    describe('generate', () => {
      it('should generate internal ID with current year by default', () => {
        const currentYear = new Date().getFullYear();
        const id = OsaxSubjectId.generate(42);

        expect(id.formatted).toBe(`OSAX-${currentYear}-042`);
        expect(id.type).toBe('INTERNAL');
        expect(id.studyYear).toBe(currentYear);
        expect(id.sequenceNumber).toBe(42);
      });

      it('should generate ID with specified year', () => {
        const id = OsaxSubjectId.generate(1, 2024);

        expect(id.formatted).toBe('OSAX-2024-001');
        expect(id.studyYear).toBe(2024);
        expect(id.sequenceNumber).toBe(1);
      });

      it('should pad sequence number to 3 digits', () => {
        expect(OsaxSubjectId.generate(1, 2025).formatted).toBe('OSAX-2025-001');
        expect(OsaxSubjectId.generate(99, 2025).formatted).toBe('OSAX-2025-099');
        expect(OsaxSubjectId.generate(999, 2025).formatted).toBe('OSAX-2025-999');
        expect(OsaxSubjectId.generate(12345, 2025).formatted).toBe('OSAX-2025-12345');
      });

      it('should include demographics if provided', () => {
        const demographics: OsaxSubjectDemographics = {
          ageGroup: 'ADULT',
          sex: 'MALE',
          cohortId: 'cohort-123',
        };

        const id = OsaxSubjectId.generate(1, 2025, demographics);

        expect(id.demographics).toEqual(demographics);
        expect(id.demographics?.ageGroup).toBe('ADULT');
        expect(id.demographics?.sex).toBe('MALE');
        expect(id.demographics?.cohortId).toBe('cohort-123');
      });

      it('should throw for invalid sequence number', () => {
        expect(() => OsaxSubjectId.generate(0, 2025)).toThrow(InvalidOsaxSubjectIdError);
        expect(() => OsaxSubjectId.generate(-1, 2025)).toThrow(InvalidOsaxSubjectIdError);
        expect(() => OsaxSubjectId.generate(100000, 2025)).toThrow(InvalidOsaxSubjectIdError);
        expect(() => OsaxSubjectId.generate(1.5, 2025)).toThrow(InvalidOsaxSubjectIdError);
      });

      it('should throw for invalid year', () => {
        expect(() => OsaxSubjectId.generate(1, 2019)).toThrow(InvalidOsaxSubjectIdError);
        expect(() => OsaxSubjectId.generate(1, 2101)).toThrow(InvalidOsaxSubjectIdError);
        expect(() => OsaxSubjectId.generate(1, 2025.5)).toThrow(InvalidOsaxSubjectIdError);
      });
    });

    describe('fromPatientId', () => {
      it('should create pseudonymized ID from patient ID', () => {
        const id = OsaxSubjectId.fromPatientId(
          'patient-uuid-1234567890',
          'salt-16-characters'
        );

        expect(id.type).toBe('INTERNAL');
        expect(id.formatted).toMatch(/^OSAX-\d{4}-[A-F0-9]{6}$/);
        expect(id.value).toMatch(/^osax_pseudo_/);
        expect(id.studyYear).toBe(new Date().getFullYear());
        expect(id.sequenceNumber).toBeUndefined();
      });

      it('should produce different IDs with different salts', () => {
        const patientId = 'patient-uuid-1234567890';
        const id1 = OsaxSubjectId.fromPatientId(patientId, 'salt1-16-characters');
        const id2 = OsaxSubjectId.fromPatientId(patientId, 'salt2-16-characters');

        expect(id1.formatted).not.toBe(id2.formatted);
      });

      it('should produce same ID with same inputs', () => {
        const patientId = 'patient-uuid-1234567890';
        const salt = 'consistent-salt-123';
        const id1 = OsaxSubjectId.fromPatientId(patientId, salt);
        const id2 = OsaxSubjectId.fromPatientId(patientId, salt);

        expect(id1.formatted).toBe(id2.formatted);
      });

      it('should include demographics if provided', () => {
        const demographics: OsaxSubjectDemographics = {
          ageGroup: 'GERIATRIC',
          sex: 'FEMALE',
        };

        const id = OsaxSubjectId.fromPatientId(
          'patient-uuid-1234567890',
          'salt-16-characters',
          demographics
        );

        expect(id.demographics).toEqual(demographics);
      });

      it('should throw for short patient ID', () => {
        expect(() => OsaxSubjectId.fromPatientId('short', 'salt-16-characters')).toThrow(
          InvalidOsaxSubjectIdError
        );
      });

      it('should throw for short salt', () => {
        expect(() =>
          OsaxSubjectId.fromPatientId('patient-uuid-1234567890', 'short')
        ).toThrow(InvalidOsaxSubjectIdError);
      });
    });

    describe('forExternalStudy', () => {
      it('should create external study ID', () => {
        const id = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');

        expect(id.type).toBe('EXTERNAL_STUDY');
        expect(id.formatted).toBe('EXT-NCT12345678-SUB-042');
        expect(id.studyReference).toBe('NCT12345678');
        expect(id.value).toBe('osax_ext_nct12345678_sub-042');
      });

      it('should include demographics if provided', () => {
        const demographics: OsaxSubjectDemographics = {
          ageGroup: 'PEDIATRIC',
          cohortId: 'cohort-abc',
        };

        const id = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042', demographics);

        expect(id.demographics).toEqual(demographics);
      });

      it('should throw for short study reference', () => {
        expect(() => OsaxSubjectId.forExternalStudy('AB', 'SUB-042')).toThrow(
          InvalidOsaxSubjectIdError
        );
      });

      it('should throw for empty subject number', () => {
        expect(() => OsaxSubjectId.forExternalStudy('NCT12345678', '')).toThrow(
          InvalidOsaxSubjectIdError
        );
      });
    });

    describe('anonymize', () => {
      it('should create anonymized ID', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const anon = OsaxSubjectId.anonymize(original, 'anonymization-key-123');

        expect(anon.type).toBe('ANONYMIZED');
        expect(anon.formatted).toMatch(/^ANON-[A-F0-9]{8}$/);
        expect(anon.demographics).toBeUndefined();
      });

      it('should produce different IDs with different keys', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const anon1 = OsaxSubjectId.anonymize(original, 'key1-16-characters');
        const anon2 = OsaxSubjectId.anonymize(original, 'key2-16-characters');

        expect(anon1.formatted).not.toBe(anon2.formatted);
      });

      it('should produce same ID with same key', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const key = 'consistent-key-123';
        const anon1 = OsaxSubjectId.anonymize(original, key);
        const anon2 = OsaxSubjectId.anonymize(original, key);

        expect(anon1.formatted).toBe(anon2.formatted);
      });

      it('should remove demographics', () => {
        const original = OsaxSubjectId.generate(1, 2025, {
          ageGroup: 'ADULT',
          sex: 'MALE',
          cohortId: 'cohort-123',
        });

        const anon = OsaxSubjectId.anonymize(original, 'anonymization-key-123');

        expect(anon.demographics).toBeUndefined();
      });

      it('should throw for short anonymization key', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        expect(() => OsaxSubjectId.anonymize(original, 'short')).toThrow(
          InvalidOsaxSubjectIdError
        );
      });
    });
  });

  describe('Parsing', () => {
    describe('parse', () => {
      it('should parse valid internal format', () => {
        const result = OsaxSubjectId.parse('OSAX-2025-001');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.formatted).toBe('OSAX-2025-001');
          expect(result.value.type).toBe('INTERNAL');
        }
      });

      it('should parse case-insensitively', () => {
        const result = OsaxSubjectId.parse('osax-2025-001');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.formatted).toBe('OSAX-2025-001');
        }
      });

      it('should parse pseudonymized format', () => {
        const result = OsaxSubjectId.parse('OSAX-2025-ABC123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.type).toBe('INTERNAL');
          expect(result.value.formatted).toBe('OSAX-2025-ABC123');
        }
      });

      it('should parse external study format', () => {
        const result = OsaxSubjectId.parse('EXT-NCT12345678-SUB-042');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.type).toBe('EXTERNAL_STUDY');
          expect(result.value.studyReference).toBe('NCT12345678');
        }
      });

      it('should parse anonymized format', () => {
        const result = OsaxSubjectId.parse('ANON-ABCD1234');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.type).toBe('ANONYMIZED');
        }
      });

      it('should return error for invalid format', () => {
        const result = OsaxSubjectId.parse('invalid-format');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Invalid subject ID format');
        }
      });

      it('should return error for invalid year', () => {
        const result = OsaxSubjectId.parse('OSAX-2019-001');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Invalid year');
        }
      });

      it('should handle OsaxSubjectId instance', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const result = OsaxSubjectId.parse(original);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(original);
        }
      });

      it('should return error for non-string input', () => {
        const result = OsaxSubjectId.parse(123 as any);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Expected string');
        }
      });
    });
  });

  describe('Query Methods', () => {
    describe('isInternal', () => {
      it('should return true for internal IDs', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.isInternal()).toBe(true);
      });

      it('should return false for external IDs', () => {
        const id = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');
        expect(id.isInternal()).toBe(false);
      });

      it('should return false for anonymized IDs', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const anon = OsaxSubjectId.anonymize(original, 'key-16-characters');
        expect(anon.isInternal()).toBe(false);
      });
    });

    describe('isExternalStudy', () => {
      it('should return true for external study IDs', () => {
        const id = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');
        expect(id.isExternalStudy()).toBe(true);
      });

      it('should return false for internal IDs', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.isExternalStudy()).toBe(false);
      });
    });

    describe('isAnonymized', () => {
      it('should return true for anonymized IDs', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const anon = OsaxSubjectId.anonymize(original, 'key-16-characters');
        expect(anon.isAnonymized()).toBe(true);
      });

      it('should return false for internal IDs', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.isAnonymized()).toBe(false);
      });
    });

    describe('isInCohort', () => {
      it('should return true for matching cohort', () => {
        const id = OsaxSubjectId.generate(1, 2025, { cohortId: 'cohort-123' });
        expect(id.isInCohort('cohort-123')).toBe(true);
      });

      it('should return false for different cohort', () => {
        const id = OsaxSubjectId.generate(1, 2025, { cohortId: 'cohort-123' });
        expect(id.isInCohort('cohort-456')).toBe(false);
      });

      it('should return false for no cohort', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.isInCohort('cohort-123')).toBe(false);
      });
    });

    describe('isPediatric', () => {
      it('should return true for pediatric age group', () => {
        const id = OsaxSubjectId.generate(1, 2025, { ageGroup: 'PEDIATRIC' });
        expect(id.isPediatric()).toBe(true);
      });

      it('should return false for other age groups', () => {
        const adult = OsaxSubjectId.generate(1, 2025, { ageGroup: 'ADULT' });
        expect(adult.isPediatric()).toBe(false);

        const geriatric = OsaxSubjectId.generate(2, 2025, { ageGroup: 'GERIATRIC' });
        expect(geriatric.isPediatric()).toBe(false);
      });

      it('should return false for no age group', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.isPediatric()).toBe(false);
      });
    });

    describe('isGeriatric', () => {
      it('should return true for geriatric age group', () => {
        const id = OsaxSubjectId.generate(1, 2025, { ageGroup: 'GERIATRIC' });
        expect(id.isGeriatric()).toBe(true);
      });

      it('should return false for other age groups', () => {
        const adult = OsaxSubjectId.generate(1, 2025, { ageGroup: 'ADULT' });
        expect(adult.isGeriatric()).toBe(false);
      });
    });

    describe('getSafeDisplayId', () => {
      it('should return full ID for anonymized', () => {
        const original = OsaxSubjectId.generate(1, 2025);
        const anon = OsaxSubjectId.anonymize(original, 'key-16-characters');
        expect(anon.getSafeDisplayId()).toBe(anon.formatted);
      });

      it('should mask internal IDs', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        const safe = id.getSafeDisplayId();
        expect(safe).toContain('***');
        expect(safe).not.toBe(id.formatted);
      });

      it('should mask short IDs', () => {
        // For short formatted strings, still masks middle portion
        const id = OsaxSubjectId.forExternalStudy('ABC', 'X');
        const safe = id.getSafeDisplayId();
        expect(safe).toContain('***');
        expect(safe.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Transformation Methods', () => {
    describe('withDemographics', () => {
      it('should return new instance with demographics', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        const demographics: OsaxSubjectDemographics = {
          ageGroup: 'ADULT',
          sex: 'MALE',
          cohortId: 'cohort-123',
        };

        const updated = id.withDemographics(demographics);

        expect(updated).not.toBe(id); // Different instance
        expect(updated.demographics).toEqual(demographics);
        expect(updated.formatted).toBe(id.formatted); // Same ID
      });

      it('should preserve immutability', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        const demographics: OsaxSubjectDemographics = { ageGroup: 'ADULT' };

        const updated = id.withDemographics(demographics);

        expect(id.demographics).toBeUndefined();
        expect(updated.demographics).toEqual(demographics);
      });
    });
  });

  describe('Equality & Comparison', () => {
    describe('equals', () => {
      it('should return true for same value', () => {
        const id1 = OsaxSubjectId.generate(1, 2025);
        const id2 = OsaxSubjectId.create(id1.formatted);

        expect(id1.equals(id2)).toBe(true);
      });

      it('should return false for different values', () => {
        const id1 = OsaxSubjectId.generate(1, 2025);
        const id2 = OsaxSubjectId.generate(2, 2025);

        expect(id1.equals(id2)).toBe(false);
      });
    });

    describe('compareTo', () => {
      it('should sort by year then sequence', () => {
        const ids = [
          OsaxSubjectId.generate(2, 2025),
          OsaxSubjectId.generate(1, 2024),
          OsaxSubjectId.generate(1, 2025),
          OsaxSubjectId.generate(3, 2024),
        ];

        ids.sort((a, b) => a.compareTo(b));

        expect(ids[0]!.studyYear).toBe(2024);
        expect(ids[0]!.sequenceNumber).toBe(1);
        expect(ids[1]!.studyYear).toBe(2024);
        expect(ids[1]!.sequenceNumber).toBe(3);
        expect(ids[2]!.studyYear).toBe(2025);
        expect(ids[2]!.sequenceNumber).toBe(1);
        expect(ids[3]!.studyYear).toBe(2025);
        expect(ids[3]!.sequenceNumber).toBe(2);
      });
    });
  });

  describe('Serialization', () => {
    describe('toJSON', () => {
      it('should serialize to DTO', () => {
        const id = OsaxSubjectId.generate(1, 2025, {
          ageGroup: 'ADULT',
          sex: 'MALE',
        });

        const json = id.toJSON();

        expect(json.value).toBe(id.value);
        expect(json.formatted).toBe(id.formatted);
        expect(json.type).toBe('INTERNAL');
        expect(json.studyYear).toBe(2025);
        expect(json.sequenceNumber).toBe(1);
        expect(json.demographics).toEqual({ ageGroup: 'ADULT', sex: 'MALE' });
        expect(json.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('should omit undefined fields', () => {
        const id = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');
        const json = id.toJSON();

        expect(json.studyYear).toBeUndefined();
        expect(json.sequenceNumber).toBeUndefined();
        expect(json.demographics).toBeUndefined();
      });
    });

    describe('toPrimitive', () => {
      it('should return value string', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.toPrimitive()).toBe(id.value);
      });
    });

    describe('toString', () => {
      it('should return formatted string', () => {
        const id = OsaxSubjectId.generate(1, 2025);
        expect(id.toString()).toBe(id.formatted);
      });
    });
  });

  describe('Immutability', () => {
    it('should be immutable', () => {
      const id = OsaxSubjectId.generate(1, 2025);

      expect(() => {
        (id as any).value = 'modified';
      }).toThrow();

      expect(() => {
        (id as any).formatted = 'modified';
      }).toThrow();
    });

    it('should freeze demographics', () => {
      const id = OsaxSubjectId.generate(1, 2025, { ageGroup: 'ADULT' });

      expect(() => {
        (id.demographics as any).ageGroup = 'PEDIATRIC';
      }).toThrow();
    });
  });
});
