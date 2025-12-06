/**
 * @fileoverview OsaxSubjectId Value Object Tests
 *
 * Tests for the OSAX subject identifier value object.
 */

import { describe, it, expect } from 'vitest';
import {
  OsaxSubjectId,
  InvalidOsaxSubjectIdError,
  type OsaxSubjectIdType,
  type OsaxSubjectDemographics,
} from '../OsaxSubjectId.js';

// ============================================================================
// FACTORY METHOD TESTS
// ============================================================================

describe('OsaxSubjectId', () => {
  describe('generate', () => {
    it('should generate subject ID with sequence and year', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);

      expect(subjectId.formatted).toBe('OSAX-2025-001');
      expect(subjectId.type).toBe('INTERNAL');
      expect(subjectId.sequenceNumber).toBe(1);
      expect(subjectId.studyYear).toBe(2025);
    });

    it('should pad sequence number to 3 digits', () => {
      expect(OsaxSubjectId.generate(1, 2025).formatted).toBe('OSAX-2025-001');
      expect(OsaxSubjectId.generate(42, 2025).formatted).toBe('OSAX-2025-042');
      expect(OsaxSubjectId.generate(999, 2025).formatted).toBe('OSAX-2025-999');
    });

    it('should handle large sequence numbers', () => {
      expect(OsaxSubjectId.generate(1000, 2025).formatted).toBe('OSAX-2025-1000');
      expect(OsaxSubjectId.generate(12345, 2025).formatted).toBe('OSAX-2025-12345');
    });

    it('should use current year if not specified', () => {
      const currentYear = new Date().getFullYear();
      const subjectId = OsaxSubjectId.generate(1);

      expect(subjectId.studyYear).toBe(currentYear);
    });

    it('should throw for invalid sequence number', () => {
      expect(() => OsaxSubjectId.generate(0, 2025)).toThrow(InvalidOsaxSubjectIdError);
      expect(() => OsaxSubjectId.generate(-1, 2025)).toThrow(InvalidOsaxSubjectIdError);
      expect(() => OsaxSubjectId.generate(100000, 2025)).toThrow(InvalidOsaxSubjectIdError);
    });

    it('should throw for non-integer sequence number', () => {
      expect(() => OsaxSubjectId.generate(1.5, 2025)).toThrow(InvalidOsaxSubjectIdError);
    });

    it('should throw for invalid year', () => {
      expect(() => OsaxSubjectId.generate(1, 2019)).toThrow(InvalidOsaxSubjectIdError);
      expect(() => OsaxSubjectId.generate(1, 2101)).toThrow(InvalidOsaxSubjectIdError);
    });

    it('should accept demographics', () => {
      const demographics: OsaxSubjectDemographics = {
        ageGroup: 'ADULT',
        sex: 'MALE',
        cohortId: 'study-123',
      };

      const subjectId = OsaxSubjectId.generate(1, 2025, demographics);

      expect(subjectId.demographics).toBeDefined();
      expect(subjectId.demographics?.ageGroup).toBe('ADULT');
      expect(subjectId.demographics?.sex).toBe('MALE');
      expect(subjectId.demographics?.cohortId).toBe('study-123');
    });

    it('should generate unique values', () => {
      const id1 = OsaxSubjectId.generate(1, 2025);
      const id2 = OsaxSubjectId.generate(2, 2025);
      const id3 = OsaxSubjectId.generate(1, 2026);

      expect(id1.value).not.toBe(id2.value);
      expect(id1.value).not.toBe(id3.value);
    });

    it('should generate lowercase internal value', () => {
      const subjectId = OsaxSubjectId.generate(42, 2025);

      expect(subjectId.value).toBe('osax_2025_042');
    });
  });

  describe('create', () => {
    it('should create from valid formatted string', () => {
      const subjectId = OsaxSubjectId.create('OSAX-2025-001');

      expect(subjectId.formatted).toBe('OSAX-2025-001');
      expect(subjectId.type).toBe('INTERNAL');
    });

    it('should handle different case input', () => {
      const lower = OsaxSubjectId.create('osax-2025-001');
      const upper = OsaxSubjectId.create('OSAX-2025-001');
      const mixed = OsaxSubjectId.create('OsAx-2025-001');

      expect(lower.formatted).toBe('OSAX-2025-001');
      expect(upper.formatted).toBe('OSAX-2025-001');
      expect(mixed.formatted).toBe('OSAX-2025-001');
    });

    it('should throw for invalid format', () => {
      expect(() => OsaxSubjectId.create('invalid')).toThrow(InvalidOsaxSubjectIdError);
      expect(() => OsaxSubjectId.create('')).toThrow();
    });
  });

  describe('fromPatientId', () => {
    it('should create pseudonymized ID from patient ID', () => {
      const subjectId = OsaxSubjectId.fromPatientId('12345678901234567890', '0123456789abcdef');

      expect(subjectId.type).toBe('INTERNAL');
      expect(subjectId.formatted).toMatch(/^OSAX-\d{4}-[A-F0-9]{6}$/);
    });

    it('should throw for short patient ID', () => {
      expect(() => OsaxSubjectId.fromPatientId('short', '0123456789abcdef')).toThrow(
        InvalidOsaxSubjectIdError
      );
    });

    it('should throw for short salt', () => {
      expect(() => OsaxSubjectId.fromPatientId('12345678901234567890', 'short')).toThrow(
        InvalidOsaxSubjectIdError
      );
    });

    it('should generate consistent IDs for same inputs', () => {
      const id1 = OsaxSubjectId.fromPatientId('12345678901234567890', '0123456789abcdef');
      const id2 = OsaxSubjectId.fromPatientId('12345678901234567890', '0123456789abcdef');

      expect(id1.value).toBe(id2.value);
    });

    it('should generate different IDs for different inputs', () => {
      const id1 = OsaxSubjectId.fromPatientId('12345678901234567890', '0123456789abcdef');
      const id2 = OsaxSubjectId.fromPatientId('98765432109876543210', '0123456789abcdef');

      expect(id1.value).not.toBe(id2.value);
    });

    it('should accept demographics', () => {
      const demographics: OsaxSubjectDemographics = {
        ageGroup: 'GERIATRIC',
        sex: 'FEMALE',
      };

      const subjectId = OsaxSubjectId.fromPatientId(
        '12345678901234567890',
        '0123456789abcdef',
        demographics
      );

      expect(subjectId.demographics?.ageGroup).toBe('GERIATRIC');
    });
  });

  describe('forExternalStudy', () => {
    it('should create external study subject ID', () => {
      const subjectId = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');

      expect(subjectId.type).toBe('EXTERNAL_STUDY');
      expect(subjectId.formatted).toBe('EXT-NCT12345678-SUB-042');
      expect(subjectId.studyReference).toBe('NCT12345678');
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

    it('should accept demographics', () => {
      const demographics: OsaxSubjectDemographics = {
        ageGroup: 'PEDIATRIC',
      };

      const subjectId = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042', demographics);

      expect(subjectId.demographics?.ageGroup).toBe('PEDIATRIC');
    });

    it('should generate lowercase internal value', () => {
      const subjectId = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');

      expect(subjectId.value).toBe('osax_ext_nct12345678_sub-042');
    });
  });

  describe('anonymize', () => {
    it('should create anonymized ID from original', () => {
      const original = OsaxSubjectId.generate(1, 2025);
      const anonymized = OsaxSubjectId.anonymize(original, '0123456789abcdef0123456789');

      expect(anonymized.type).toBe('ANONYMIZED');
      expect(anonymized.formatted).toMatch(/^ANON-[A-F0-9]{8}$/);
    });

    it('should throw for short anonymization key', () => {
      const original = OsaxSubjectId.generate(1, 2025);

      expect(() => OsaxSubjectId.anonymize(original, 'short')).toThrow(InvalidOsaxSubjectIdError);
    });

    it('should not carry demographics', () => {
      const original = OsaxSubjectId.generate(1, 2025, { ageGroup: 'ADULT' });
      const anonymized = OsaxSubjectId.anonymize(original, '0123456789abcdef0123456789');

      expect(anonymized.demographics).toBeUndefined();
    });

    it('should generate consistent IDs for same inputs', () => {
      const original = OsaxSubjectId.generate(1, 2025);
      const anon1 = OsaxSubjectId.anonymize(original, '0123456789abcdef0123456789');
      const anon2 = OsaxSubjectId.anonymize(original, '0123456789abcdef0123456789');

      expect(anon1.value).toBe(anon2.value);
    });
  });

  describe('parse', () => {
    it('should return existing OsaxSubjectId instance', () => {
      const original = OsaxSubjectId.generate(1, 2025);
      const result = OsaxSubjectId.parse(original);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(original);
      }
    });

    it('should fail for non-string input', () => {
      const result = OsaxSubjectId.parse(123);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Expected string');
      }
    });

    it('should parse internal format', () => {
      const result = OsaxSubjectId.parse('OSAX-2025-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('INTERNAL');
        expect(result.value.studyYear).toBe(2025);
      }
    });

    it('should parse pseudonymized format', () => {
      const result = OsaxSubjectId.parse('OSAX-2025-ABC123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('INTERNAL');
      }
    });

    it('should parse external format', () => {
      const result = OsaxSubjectId.parse('EXT-NCT12345678-SUB001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('EXTERNAL_STUDY');
      }
    });

    it('should parse anonymized format', () => {
      const result = OsaxSubjectId.parse('ANON-12345678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('ANONYMIZED');
      }
    });

    it('should fail for invalid year in internal format', () => {
      const result = OsaxSubjectId.parse('OSAX-1900-001');

      expect(result.success).toBe(false);
    });

    it('should fail for invalid format', () => {
      const result = OsaxSubjectId.parse('INVALID-FORMAT');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid subject ID format');
      }
    });

    it('should handle whitespace', () => {
      const result = OsaxSubjectId.parse('  OSAX-2025-001  ');

      expect(result.success).toBe(true);
    });
  });

  describe('query methods', () => {
    it('should identify internal IDs', () => {
      const internal = OsaxSubjectId.generate(1, 2025);

      expect(internal.isInternal()).toBe(true);
      expect(internal.isExternalStudy()).toBe(false);
      expect(internal.isAnonymized()).toBe(false);
    });

    it('should identify external study IDs', () => {
      const external = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-001');

      expect(external.isInternal()).toBe(false);
      expect(external.isExternalStudy()).toBe(true);
      expect(external.isAnonymized()).toBe(false);
    });

    it('should identify anonymized IDs', () => {
      const original = OsaxSubjectId.generate(1, 2025);
      const anonymized = OsaxSubjectId.anonymize(original, '0123456789abcdef0123456789');

      expect(anonymized.isInternal()).toBe(false);
      expect(anonymized.isExternalStudy()).toBe(false);
      expect(anonymized.isAnonymized()).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);

      expect(Object.isFrozen(subjectId)).toBe(true);
    });

    it('should have frozen demographics', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025, { ageGroup: 'ADULT' });

      expect(Object.isFrozen(subjectId.demographics)).toBe(true);
    });
  });

  describe('createdAt', () => {
    it('should have creation timestamp', () => {
      const before = new Date();
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const after = new Date();

      expect(subjectId.createdAt).toBeInstanceOf(Date);
      expect(subjectId.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(subjectId.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});

// ============================================================================
// ERROR TESTS
// ============================================================================

describe('InvalidOsaxSubjectIdError', () => {
  it('should have correct name', () => {
    const error = new InvalidOsaxSubjectIdError('test message');

    expect(error.name).toBe('InvalidOsaxSubjectIdError');
  });

  it('should have correct message', () => {
    const error = new InvalidOsaxSubjectIdError('test message');

    expect(error.message).toBe('test message');
  });

  it('should be instance of Error', () => {
    const error = new InvalidOsaxSubjectIdError('test message');

    expect(error).toBeInstanceOf(Error);
  });
});
