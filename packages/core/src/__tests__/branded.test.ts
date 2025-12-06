import { describe, it, expect } from 'vitest';
import {
  createE164PhoneNumber,
  createRomanianPhoneNumber,
  createPatientId,
  createLeadId,
  createAppointmentId,
  createCorrelationId,
  createTraceId,
  createUserId,
  createTaskId,
  createISOTimestamp,
  dateToISOTimestamp,
  createLeadScore,
  createConfidenceScore,
  createEmailAddress,
  assertPatientId,
  assertE164PhoneNumber,
  assertLeadScore,
  assertConfidenceScore,
  type PatientId,
  type LeadId,
  type E164PhoneNumber,
  type RomanianPhoneNumber,
  type LeadScore,
  type ConfidenceScore,
  type EmailAddress,
  type AppointmentId,
  type CorrelationId,
  type TraceId,
  type UserId,
  type TaskId,
  type ISOTimestamp,
} from '../types/branded.js';

describe('Branded Types', () => {
  describe('Phone Number Validators', () => {
    describe('createE164PhoneNumber', () => {
      it('should create valid E164 phone number with + prefix', () => {
        const phone = createE164PhoneNumber('+40712345678');
        expect(phone).toBe('+40712345678');
      });

      it('should accept valid international numbers', () => {
        expect(createE164PhoneNumber('+1234567890')).toBe('+1234567890');
        expect(createE164PhoneNumber('+442079460123')).toBe('+442079460123');
        expect(createE164PhoneNumber('+33123456789')).toBe('+33123456789');
      });

      it('should return null for invalid formats', () => {
        expect(createE164PhoneNumber('0712345678')).toBeNull();
        expect(createE164PhoneNumber('40712345678')).toBeNull();
        expect(createE164PhoneNumber('+0712345678')).toBeNull();
        expect(createE164PhoneNumber('')).toBeNull();
        expect(createE164PhoneNumber('abc')).toBeNull();
      });

      it('should return null for numbers starting with 0', () => {
        expect(createE164PhoneNumber('+012345678')).toBeNull();
      });

      it('should return null for numbers that are too long', () => {
        expect(createE164PhoneNumber('+1234567890123456789')).toBeNull();
      });
    });

    describe('createRomanianPhoneNumber', () => {
      it('should create valid Romanian phone number', () => {
        const phone = createRomanianPhoneNumber('+40712345678');
        expect(phone).toBe('+40712345678');
      });

      it('should accept all valid Romanian mobile prefixes', () => {
        expect(createRomanianPhoneNumber('+40721234567')).toBe('+40721234567');
        expect(createRomanianPhoneNumber('+40731234567')).toBe('+40731234567');
        expect(createRomanianPhoneNumber('+40741234567')).toBe('+40741234567');
        expect(createRomanianPhoneNumber('+40751234567')).toBe('+40751234567');
      });

      it('should return null for non-Romanian numbers', () => {
        expect(createRomanianPhoneNumber('+1234567890')).toBeNull();
        expect(createRomanianPhoneNumber('+442079460123')).toBeNull();
      });

      it('should return null for invalid Romanian formats', () => {
        expect(createRomanianPhoneNumber('+4071234567')).toBeNull();
        expect(createRomanianPhoneNumber('+407123456789')).toBeNull();
        expect(createRomanianPhoneNumber('40712345678')).toBeNull();
      });
    });
  });

  describe('ID Creator Functions', () => {
    describe('createPatientId', () => {
      it('should create PatientId from string', () => {
        const id = createPatientId('patient-123');
        expect(id).toBe('patient-123');
      });

      it('should handle UUID format', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';
        const id = createPatientId(uuid);
        expect(id).toBe(uuid);
      });

      it('should handle empty string', () => {
        const id = createPatientId('');
        expect(id).toBe('');
      });
    });

    describe('createLeadId', () => {
      it('should create LeadId from string', () => {
        const id = createLeadId('lead-456');
        expect(id).toBe('lead-456');
      });

      it('should handle phone number format', () => {
        const id = createLeadId('+40712345678');
        expect(id).toBe('+40712345678');
      });
    });

    describe('createAppointmentId', () => {
      it('should create AppointmentId from string', () => {
        const id = createAppointmentId('apt-789');
        expect(id).toBe('apt-789');
      });
    });

    describe('createCorrelationId', () => {
      it('should create CorrelationId from string', () => {
        const id = createCorrelationId('corr-123-abc');
        expect(id).toBe('corr-123-abc');
      });
    });

    describe('createTraceId', () => {
      it('should create TraceId from string', () => {
        const id = createTraceId('trace-abc123');
        expect(id).toBe('trace-abc123');
      });
    });

    describe('createUserId', () => {
      it('should create UserId from string', () => {
        const id = createUserId('user-001');
        expect(id).toBe('user-001');
      });
    });

    describe('createTaskId', () => {
      it('should create TaskId from string', () => {
        const id = createTaskId('task-trigger-123');
        expect(id).toBe('task-trigger-123');
      });
    });
  });

  describe('Timestamp Functions', () => {
    describe('createISOTimestamp', () => {
      it('should create ISO timestamp from current time', () => {
        const before = new Date().toISOString();
        const timestamp = createISOTimestamp();
        const after = new Date().toISOString();

        expect(timestamp >= before).toBe(true);
        expect(timestamp <= after).toBe(true);
      });

      it('should return valid ISO 8601 format', () => {
        const timestamp = createISOTimestamp();
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      });
    });

    describe('dateToISOTimestamp', () => {
      it('should convert Date to ISO timestamp', () => {
        const date = new Date('2024-01-15T10:30:00.000Z');
        const timestamp = dateToISOTimestamp(date);
        expect(timestamp).toBe('2024-01-15T10:30:00.000Z');
      });

      it('should handle different dates', () => {
        const date1 = new Date('2023-12-31T23:59:59.999Z');
        const date2 = new Date('2024-06-15T12:00:00.000Z');

        expect(dateToISOTimestamp(date1)).toBe('2023-12-31T23:59:59.999Z');
        expect(dateToISOTimestamp(date2)).toBe('2024-06-15T12:00:00.000Z');
      });
    });
  });

  describe('Score Validators', () => {
    describe('createLeadScore', () => {
      it('should create valid lead score for values 1-5', () => {
        expect(createLeadScore(1)).toBe(1);
        expect(createLeadScore(2)).toBe(2);
        expect(createLeadScore(3)).toBe(3);
        expect(createLeadScore(4)).toBe(4);
        expect(createLeadScore(5)).toBe(5);
      });

      it('should return null for scores below 1', () => {
        expect(createLeadScore(0)).toBeNull();
        expect(createLeadScore(-1)).toBeNull();
      });

      it('should return null for scores above 5', () => {
        expect(createLeadScore(6)).toBeNull();
        expect(createLeadScore(10)).toBeNull();
      });

      it('should return null for non-integer values', () => {
        expect(createLeadScore(3.5)).toBeNull();
        expect(createLeadScore(2.1)).toBeNull();
        expect(createLeadScore(4.99)).toBeNull();
      });
    });

    describe('createConfidenceScore', () => {
      it('should create valid confidence score for values 0-1', () => {
        expect(createConfidenceScore(0)).toBe(0);
        expect(createConfidenceScore(0.5)).toBe(0.5);
        expect(createConfidenceScore(1)).toBe(1);
      });

      it('should accept decimal values in range', () => {
        expect(createConfidenceScore(0.25)).toBe(0.25);
        expect(createConfidenceScore(0.75)).toBe(0.75);
        expect(createConfidenceScore(0.99)).toBe(0.99);
      });

      it('should return null for values below 0', () => {
        expect(createConfidenceScore(-0.1)).toBeNull();
        expect(createConfidenceScore(-1)).toBeNull();
      });

      it('should return null for values above 1', () => {
        expect(createConfidenceScore(1.1)).toBeNull();
        expect(createConfidenceScore(2)).toBeNull();
      });
    });
  });

  describe('Email Validator', () => {
    describe('createEmailAddress', () => {
      it('should create valid email address', () => {
        expect(createEmailAddress('user@example.com')).toBe('user@example.com');
      });

      it('should accept various valid email formats', () => {
        expect(createEmailAddress('test.user@domain.com')).toBe('test.user@domain.com');
        expect(createEmailAddress('user+tag@example.org')).toBe('user+tag@example.org');
        expect(createEmailAddress('name@sub.domain.co.uk')).toBe('name@sub.domain.co.uk');
      });

      it('should return null for invalid email formats', () => {
        expect(createEmailAddress('invalid')).toBeNull();
        expect(createEmailAddress('no@domain')).toBeNull();
        expect(createEmailAddress('@nodomain.com')).toBeNull();
        expect(createEmailAddress('no domain@test.com')).toBeNull();
        expect(createEmailAddress('')).toBeNull();
      });
    });
  });

  describe('Assertion Functions', () => {
    describe('assertPatientId', () => {
      it('should not throw for valid patient ID', () => {
        expect(() => assertPatientId('patient-123')).not.toThrow();
      });

      it('should throw for empty string', () => {
        expect(() => assertPatientId('')).toThrow('Invalid PatientId');
      });

      it('should throw for null/undefined (as any)', () => {
        expect(() => assertPatientId(null as unknown as string)).toThrow('Invalid PatientId');
        expect(() => assertPatientId(undefined as unknown as string)).toThrow('Invalid PatientId');
      });

      it('should throw for non-string values', () => {
        expect(() => assertPatientId(123 as unknown as string)).toThrow('Invalid PatientId');
      });
    });

    describe('assertE164PhoneNumber', () => {
      it('should not throw for valid E164 phone number', () => {
        expect(() => assertE164PhoneNumber('+40712345678')).not.toThrow();
      });

      it('should throw for invalid phone number formats', () => {
        expect(() => assertE164PhoneNumber('0712345678')).toThrow('Invalid E164 phone number');
        expect(() => assertE164PhoneNumber('invalid')).toThrow('Invalid E164 phone number');
        expect(() => assertE164PhoneNumber('')).toThrow('Invalid E164 phone number');
      });

      it('should throw for numbers without + prefix', () => {
        expect(() => assertE164PhoneNumber('40712345678')).toThrow('Invalid E164 phone number');
      });
    });

    describe('assertLeadScore', () => {
      it('should not throw for valid lead scores', () => {
        expect(() => assertLeadScore(1)).not.toThrow();
        expect(() => assertLeadScore(3)).not.toThrow();
        expect(() => assertLeadScore(5)).not.toThrow();
      });

      it('should throw for out of range scores', () => {
        expect(() => assertLeadScore(0)).toThrow('Invalid lead score');
        expect(() => assertLeadScore(6)).toThrow('Invalid lead score');
      });

      it('should throw for non-integer scores', () => {
        expect(() => assertLeadScore(3.5)).toThrow('Invalid lead score');
        expect(() => assertLeadScore(2.99)).toThrow('Invalid lead score');
      });
    });

    describe('assertConfidenceScore', () => {
      it('should not throw for valid confidence scores', () => {
        expect(() => assertConfidenceScore(0)).not.toThrow();
        expect(() => assertConfidenceScore(0.5)).not.toThrow();
        expect(() => assertConfidenceScore(1)).not.toThrow();
      });

      it('should throw for out of range scores', () => {
        expect(() => assertConfidenceScore(-0.1)).toThrow('Invalid confidence score');
        expect(() => assertConfidenceScore(1.1)).toThrow('Invalid confidence score');
      });
    });
  });

  describe('Type Safety', () => {
    it('should enforce branded types at compile time (type checking)', () => {
      // These would fail type checking if we tried to mix them
      const patientId: PatientId = createPatientId('p-1');
      const leadId: LeadId = createLeadId('l-1');
      const appointmentId: AppointmentId = createAppointmentId('a-1');

      // Type narrowing ensures different branded types are not interchangeable
      expect(patientId).not.toBe(leadId);
      expect(patientId).not.toBe(appointmentId);
    });

    it('should preserve underlying string value', () => {
      const patientId = createPatientId('patient-xyz');
      // The branded type is still a string at runtime
      expect(typeof patientId).toBe('string');
      expect(patientId.length).toBe(11);
      expect(patientId.startsWith('patient')).toBe(true);
    });

    it('should preserve underlying number value for scores', () => {
      const score = createLeadScore(4);
      expect(score).not.toBeNull();
      if (score !== null) {
        expect(typeof score).toBe('number');
        expect(score + 1).toBe(5);
      }
    });
  });
});
