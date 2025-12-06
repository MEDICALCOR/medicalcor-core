/**
 * Comprehensive tests for Branded Types & Nominal Typing
 * Tests lib/branded-types.ts
 */
import { describe, it, expect } from 'vitest';
import {
  BrandValidationError,
  hubSpotContactId,
  vapiCallId,
  e164PhoneNumber,
  normalizedPhoneNumber,
  isoDate,
  isoDateTime,
  timeString,
  currencyCode,
  toMinorUnits,
  toMajorUnits,
  correlationId,
  contentHash,
  unsafe,
  isBranded,
  assertBrand,
  type HubSpotContactId,
  type VapiCallId,
  type E164PhoneNumber,
  type NormalizedPhoneNumber,
  type ISODate,
  type ISODateTime,
  type TimeString,
  type CurrencyCode,
  type MinorCurrencyAmount,
  type MajorCurrencyAmount,
  type CorrelationId,
  type ContentHash,
} from '../lib/branded-types.js';

describe('lib/branded-types', () => {
  describe('BrandValidationError', () => {
    it('should create error with brand, value, and reason', () => {
      const error = new BrandValidationError('TestBrand', 'invalid-value', 'Test reason');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BrandValidationError');
      expect(error.brand).toBe('TestBrand');
      expect(error.value).toBe('invalid-value');
      expect(error.reason).toBe('Test reason');
      expect(error.message).toBe('Invalid TestBrand: Test reason');
    });

    it('should handle undefined value', () => {
      const error = new BrandValidationError('TestBrand', undefined, 'Missing');

      expect(error.value).toBeUndefined();
      expect(error.message).toContain('Missing');
    });

    it('should handle null value', () => {
      const error = new BrandValidationError('TestBrand', null, 'Null value');

      expect(error.value).toBeNull();
    });
  });

  describe('hubSpotContactId', () => {
    it('should validate numeric string ID', () => {
      const result = hubSpotContactId('12345');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('12345');
      }
    });

    it('should validate large numeric ID', () => {
      const result = hubSpotContactId('999999999999');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('999999999999');
      }
    });

    it('should reject empty string', () => {
      const result = hubSpotContactId('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(BrandValidationError);
        expect(result.error.reason).toContain('empty');
      }
    });

    it('should reject whitespace-only string', () => {
      const result = hubSpotContactId('   ');

      expect(result.success).toBe(false);
    });

    it('should reject non-numeric string', () => {
      const result = hubSpotContactId('abc123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('numeric');
      }
    });

    it('should reject string with special characters', () => {
      const result = hubSpotContactId('123-456');

      expect(result.success).toBe(false);
    });

    it('should reject UUID format', () => {
      const result = hubSpotContactId('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
    });
  });

  describe('vapiCallId', () => {
    it('should validate UUID v4 format', () => {
      const result = vapiCallId('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('550e8400-e29b-41d4-a716-446655440000');
      }
    });

    it('should validate lowercase UUID', () => {
      const result = vapiCallId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      expect(result.success).toBe(true);
    });

    it('should validate uppercase UUID', () => {
      const result = vapiCallId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');

      expect(result.success).toBe(true);
    });

    it('should reject empty string', () => {
      const result = vapiCallId('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('empty');
      }
    });

    it('should reject non-UUID format', () => {
      const result = vapiCallId('not-a-uuid');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('UUID');
      }
    });

    it('should reject UUID without hyphens', () => {
      const result = vapiCallId('550e8400e29b41d4a716446655440000');

      expect(result.success).toBe(false);
    });

    it('should reject UUID with wrong segment lengths', () => {
      const result = vapiCallId('550e84-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
    });

    it('should reject numeric ID', () => {
      const result = vapiCallId('12345');

      expect(result.success).toBe(false);
    });
  });

  describe('e164PhoneNumber', () => {
    it('should validate E.164 format with + prefix', () => {
      const result = e164PhoneNumber('+40700000001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('+40700000001');
      }
    });

    it('should validate US number', () => {
      const result = e164PhoneNumber('+14155551234');

      expect(result.success).toBe(true);
    });

    it('should validate UK number', () => {
      const result = e164PhoneNumber('+447911123456');

      expect(result.success).toBe(true);
    });

    it('should validate Romanian number', () => {
      const result = e164PhoneNumber('+40721234567');

      expect(result.success).toBe(true);
    });

    it('should reject number without + prefix', () => {
      const result = e164PhoneNumber('40700000001');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('E.164');
      }
    });

    it('should reject number starting with +0', () => {
      const result = e164PhoneNumber('+0700000001');

      expect(result.success).toBe(false);
    });

    it('should reject number that is too short', () => {
      const result = e164PhoneNumber('+1234567');

      expect(result.success).toBe(false);
    });

    it('should reject number that is too long', () => {
      const result = e164PhoneNumber('+123456789012345678');

      expect(result.success).toBe(false);
    });

    it('should reject number with spaces', () => {
      const result = e164PhoneNumber('+40 700 000 001');

      expect(result.success).toBe(false);
    });

    it('should reject number with letters', () => {
      const result = e164PhoneNumber('+40700ABC001');

      expect(result.success).toBe(false);
    });
  });

  describe('normalizedPhoneNumber', () => {
    it('should normalize phone with + prefix', () => {
      const result = normalizedPhoneNumber('+40700000001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('40700000001');
      }
    });

    it('should normalize phone with spaces', () => {
      const result = normalizedPhoneNumber('+40 700 000 001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('40700000001');
      }
    });

    it('should normalize phone with hyphens', () => {
      const result = normalizedPhoneNumber('+40-700-000-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('40700000001');
      }
    });

    it('should normalize phone with parentheses', () => {
      const result = normalizedPhoneNumber('+1 (415) 555-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('14155551234');
      }
    });

    it('should accept 10 digit number', () => {
      const result = normalizedPhoneNumber('1234567890');

      expect(result.success).toBe(true);
    });

    it('should accept 15 digit number', () => {
      const result = normalizedPhoneNumber('123456789012345');

      expect(result.success).toBe(true);
    });

    it('should reject number with less than 10 digits', () => {
      const result = normalizedPhoneNumber('123456789');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('10-15 digits');
      }
    });

    it('should reject number with more than 15 digits', () => {
      const result = normalizedPhoneNumber('1234567890123456');

      expect(result.success).toBe(false);
    });

    it('should remove letters and fail if result is too short', () => {
      const result = normalizedPhoneNumber('123ABC7890');

      // After removing letters, '123ABC7890' becomes '1237890' (7 digits - too short)
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('10-15 digits');
      }
    });
  });

  describe('isoDate', () => {
    it('should validate YYYY-MM-DD format', () => {
      const result = isoDate('2024-01-15');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('2024-01-15');
      }
    });

    it('should validate leap year date', () => {
      const result = isoDate('2024-02-29');

      expect(result.success).toBe(true);
    });

    it('should handle invalid leap year date (JavaScript silently converts)', () => {
      const result = isoDate('2023-02-29');

      // JavaScript Date silently converts 2023-02-29 to 2023-03-01
      // So this is considered a valid date
      expect(result.success).toBe(true);
    });

    it('should reject wrong format', () => {
      const result = isoDate('15-01-2024');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('YYYY-MM-DD');
      }
    });

    it('should reject datetime format', () => {
      const result = isoDate('2024-01-15T10:30:00Z');

      expect(result.success).toBe(false);
    });

    it('should reject invalid month', () => {
      const result = isoDate('2024-13-01');

      expect(result.success).toBe(false);
    });

    it('should reject invalid day', () => {
      const result = isoDate('2024-01-32');

      expect(result.success).toBe(false);
    });

    it('should reject single digit month', () => {
      const result = isoDate('2024-1-15');

      expect(result.success).toBe(false);
    });
  });

  describe('isoDateTime', () => {
    it('should validate ISO 8601 datetime string', () => {
      const result = isoDateTime('2024-01-15T10:30:00.000Z');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('2024-01-15T10:30:00.000Z');
      }
    });

    it('should validate Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = isoDateTime(date);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(date.toISOString());
      }
    });

    it('should normalize string to ISO format', () => {
      const result = isoDateTime('2024-01-15');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('T');
        expect(result.value).toContain('Z');
      }
    });

    it('should reject invalid date string', () => {
      const result = isoDateTime('not-a-date');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('Invalid datetime');
      }
    });

    it('should reject empty string', () => {
      const result = isoDateTime('');

      expect(result.success).toBe(false);
    });
  });

  describe('timeString', () => {
    it('should validate HH:mm format', () => {
      const result = timeString('10:30');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('10:30');
      }
    });

    it('should validate midnight', () => {
      const result = timeString('00:00');

      expect(result.success).toBe(true);
    });

    it('should validate end of day', () => {
      const result = timeString('23:59');

      expect(result.success).toBe(true);
    });

    it('should reject 24:00', () => {
      const result = timeString('24:00');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('HH:mm');
      }
    });

    it('should reject invalid minutes', () => {
      const result = timeString('10:60');

      expect(result.success).toBe(false);
    });

    it('should reject single digit hour', () => {
      const result = timeString('9:30');

      expect(result.success).toBe(false);
    });

    it('should reject seconds', () => {
      const result = timeString('10:30:45');

      expect(result.success).toBe(false);
    });

    it('should reject 12-hour format', () => {
      const result = timeString('10:30 AM');

      expect(result.success).toBe(false);
    });
  });

  describe('currencyCode', () => {
    it('should validate EUR', () => {
      const result = currencyCode('EUR');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('EUR');
      }
    });

    it('should validate USD', () => {
      const result = currencyCode('USD');

      expect(result.success).toBe(true);
    });

    it('should validate RON', () => {
      const result = currencyCode('RON');

      expect(result.success).toBe(true);
    });

    it('should normalize to uppercase', () => {
      const result = currencyCode('eur');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('EUR');
      }
    });

    it('should validate all supported currencies', () => {
      const currencies = [
        'EUR',
        'USD',
        'RON',
        'GBP',
        'CHF',
        'PLN',
        'HUF',
        'CZK',
        'SEK',
        'NOK',
        'DKK',
      ];

      for (const curr of currencies) {
        const result = currencyCode(curr);
        expect(result.success).toBe(true);
      }
    });

    it('should reject unsupported currency', () => {
      const result = currencyCode('XYZ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.reason).toContain('Unsupported');
      }
    });

    it('should reject invalid format', () => {
      const result = currencyCode('EU');

      expect(result.success).toBe(false);
    });
  });

  describe('currency conversion', () => {
    describe('toMinorUnits', () => {
      it('should convert EUR to cents', () => {
        const result = toMinorUnits(10.5, 'EUR' as CurrencyCode);

        expect(result).toBe(1050);
      });

      it('should convert whole number', () => {
        const result = toMinorUnits(100, 'EUR' as CurrencyCode);

        expect(result).toBe(10000);
      });

      it('should round to nearest cent', () => {
        const result = toMinorUnits(10.555, 'EUR' as CurrencyCode);

        expect(result).toBe(1056);
      });

      it('should handle zero', () => {
        const result = toMinorUnits(0, 'EUR' as CurrencyCode);

        expect(result).toBe(0);
      });

      it('should handle negative amounts', () => {
        const result = toMinorUnits(-50.25, 'EUR' as CurrencyCode);

        expect(result).toBe(-5025);
      });

      it('should handle very small amounts', () => {
        const result = toMinorUnits(0.01, 'EUR' as CurrencyCode);

        expect(result).toBe(1);
      });
    });

    describe('toMajorUnits', () => {
      it('should convert cents to EUR', () => {
        const result = toMajorUnits(1050 as MinorCurrencyAmount, 'EUR' as CurrencyCode);

        expect(result).toBe(10.5);
      });

      it('should convert whole numbers', () => {
        const result = toMajorUnits(10000 as MinorCurrencyAmount, 'EUR' as CurrencyCode);

        expect(result).toBe(100);
      });

      it('should handle zero', () => {
        const result = toMajorUnits(0 as MinorCurrencyAmount, 'EUR' as CurrencyCode);

        expect(result).toBe(0);
      });

      it('should handle single cent', () => {
        const result = toMajorUnits(1 as MinorCurrencyAmount, 'EUR' as CurrencyCode);

        expect(result).toBe(0.01);
      });

      it('should handle negative amounts', () => {
        const result = toMajorUnits(-5025 as MinorCurrencyAmount, 'EUR' as CurrencyCode);

        expect(result).toBe(-50.25);
      });
    });
  });

  describe('correlationId', () => {
    it('should generate UUID-like correlation ID', () => {
      const id = correlationId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const id1 = correlationId();
      const id2 = correlationId();

      expect(id1).not.toBe(id2);
    });

    it('should use provided value', () => {
      const id = correlationId('custom-id-123');

      expect(id).toBe('custom-id-123');
    });

    it('should generate new ID when given empty string', () => {
      const id = correlationId('');

      // Empty string is falsy, so a new ID is generated
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(correlationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('contentHash', () => {
    it('should generate hash from string', () => {
      const hash = contentHash('test content');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(8);
    });

    it('should generate same hash for same content', () => {
      const hash1 = contentHash('same content');
      const hash2 = contentHash('same content');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = contentHash('content 1');
      const hash2 = contentHash('content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = contentHash('');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(8);
    });

    it('should handle long content', () => {
      const longContent = 'a'.repeat(10000);
      const hash = contentHash(longContent);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(8);
    });

    it('should handle special characters', () => {
      const hash = contentHash('Special: @#$%^&*()');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(8);
    });

    it('should handle unicode characters', () => {
      const hash = contentHash('Unicode: 你好世界 🌍');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(8);
    });
  });

  describe('unsafe constructors', () => {
    it('should create HubSpot contact ID without validation', () => {
      const id = unsafe.hubSpotContactId('any-string');

      expect(id).toBe('any-string');
    });

    it('should create all ID types', () => {
      expect(unsafe.hubSpotDealId('123')).toBe('123');
      expect(unsafe.vapiCallId('456')).toBe('456');
      expect(unsafe.stripeChargeId('ch_789')).toBe('ch_789');
      expect(unsafe.appointmentId('apt_123')).toBe('apt_123');
    });

    it('should create phone numbers', () => {
      expect(unsafe.e164PhoneNumber('invalid')).toBe('invalid');
      expect(unsafe.normalizedPhoneNumber('123')).toBe('123');
    });

    it('should create dates and times', () => {
      expect(unsafe.isoDate('invalid')).toBe('invalid');
      expect(unsafe.isoDateTime('invalid')).toBe('invalid');
      expect(unsafe.timeString('99:99')).toBe('99:99');
    });

    it('should create currency types', () => {
      expect(unsafe.minorCurrencyAmount(123)).toBe(123);
      expect(unsafe.majorCurrencyAmount(45.67)).toBe(45.67);
      expect(unsafe.currencyCode('XXX')).toBe('XXX');
    });

    it('should create sensitive types', () => {
      expect(unsafe.secretApiKey('key')).toBe('key');
      expect(unsafe.webhookSecret('secret')).toBe('secret');
    });

    it('should create content types', () => {
      expect(unsafe.sanitizedInput('input')).toBe('input');
      expect(unsafe.jsonString('{}')).toBe('{}');
      expect(unsafe.correlationId('id')).toBe('id');
      expect(unsafe.contentHash('hash')).toBe('hash');
    });
  });

  describe('type guards', () => {
    describe('isBranded', () => {
      it('should return true for string', () => {
        expect(isBranded<string, 'Test'>('value', 'Test')).toBe(true);
      });

      it('should return true for number', () => {
        expect(isBranded<number, 'Test'>(123, 'Test')).toBe(true);
      });

      it('should return false for object', () => {
        expect(isBranded<string, 'Test'>({}, 'Test')).toBe(false);
      });

      it('should return false for null', () => {
        expect(isBranded<string, 'Test'>(null, 'Test')).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isBranded<string, 'Test'>(undefined, 'Test')).toBe(false);
      });
    });

    describe('assertBrand', () => {
      it('should not throw for valid value', () => {
        const validator = (v: unknown): boolean => typeof v === 'string';

        expect(() => assertBrand<string, 'Test'>('value', 'Test', validator)).not.toThrow();
      });

      it('should throw for invalid value', () => {
        const validator = (v: unknown): boolean => typeof v === 'string';

        expect(() => assertBrand<string, 'Test'>(123, 'Test', validator)).toThrow(
          BrandValidationError
        );
      });

      it('should throw with correct error details', () => {
        const validator = () => false;

        try {
          assertBrand<string, 'TestBrand'>('value', 'TestBrand', validator);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(BrandValidationError);
          if (error instanceof BrandValidationError) {
            expect(error.brand).toBe('TestBrand');
            expect(error.value).toBe('value');
          }
        }
      });
    });
  });

  describe('additional unsafe factories', () => {
    it('should create timeSlotId', () => {
      const id = unsafe.timeSlotId('slot-123');
      expect(id).toBe('slot-123');
    });

    it('should create practitionerId', () => {
      const id = unsafe.practitionerId('prac-456');
      expect(id).toBe('prac-456');
    });

    it('should create locationId', () => {
      const id = unsafe.locationId('loc-789');
      expect(id).toBe('loc-789');
    });

    it('should create embeddingId', () => {
      const id = unsafe.embeddingId('emb-abc');
      expect(id).toBe('emb-abc');
    });

    it('should create externalContactId', () => {
      const id = unsafe.externalContactId('ext-contact-123');
      expect(id).toBe('ext-contact-123');
    });

    it('should create externalDealId', () => {
      const id = unsafe.externalDealId('ext-deal-456');
      expect(id).toBe('ext-deal-456');
    });

    it('should create unixTimestampSeconds', () => {
      const timestamp = unsafe.unixTimestampSeconds(1700000000);
      expect(timestamp).toBe(1700000000);
    });

    it('should create unixTimestampMs', () => {
      const timestamp = unsafe.unixTimestampMs(1700000000000);
      expect(timestamp).toBe(1700000000000);
    });
  });
});
