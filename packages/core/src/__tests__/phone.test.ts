import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidRomanianPhone, formatPhoneForDisplay } from '../phone.js';

describe('normalizePhone', () => {
  describe('valid Romanian mobile numbers', () => {
    it('should normalize local format (07XX XXX XXX)', () => {
      expect(normalizePhone('0712345678')).toBe('+40712345678');
      expect(normalizePhone('0723456789')).toBe('+40723456789');
      expect(normalizePhone('0734567890')).toBe('+40734567890');
      expect(normalizePhone('0745678901')).toBe('+40745678901');
      expect(normalizePhone('0756789012')).toBe('+40756789012');
      expect(normalizePhone('0767890123')).toBe('+40767890123');
      expect(normalizePhone('0778901234')).toBe('+40778901234');
      expect(normalizePhone('0789012345')).toBe('+40789012345');
    });

    it('should handle already E.164 format (+40)', () => {
      expect(normalizePhone('+40712345678')).toBe('+40712345678');
      expect(normalizePhone('+40723456789')).toBe('+40723456789');
    });

    it('should normalize without + prefix (40)', () => {
      expect(normalizePhone('40712345678')).toBe('+40712345678');
      expect(normalizePhone('40723456789')).toBe('+40723456789');
    });

    it('should normalize international format with 00 prefix', () => {
      expect(normalizePhone('0040712345678')).toBe('+40712345678');
      expect(normalizePhone('0040723456789')).toBe('+40723456789');
    });
  });

  describe('valid Romanian landline numbers', () => {
    it('should normalize Bucharest numbers (021)', () => {
      expect(normalizePhone('0213456789')).toBe('+40213456789');
    });

    it('should normalize other landline prefixes (02X, 03X)', () => {
      expect(normalizePhone('0223456789')).toBe('+40223456789');
      expect(normalizePhone('0233456789')).toBe('+40233456789');
      expect(normalizePhone('0313456789')).toBe('+40313456789');
    });

    it('should handle landline numbers in E.164 format', () => {
      expect(normalizePhone('+40213456789')).toBe('+40213456789');
      expect(normalizePhone('40213456789')).toBe('+40213456789');
      expect(normalizePhone('0040213456789')).toBe('+40213456789');
    });
  });

  describe('formatting normalization', () => {
    it('should handle numbers with spaces', () => {
      expect(normalizePhone('0712 345 678')).toBe('+40712345678');
      expect(normalizePhone('+40 712 345 678')).toBe('+40712345678');
    });

    it('should handle numbers with dashes', () => {
      expect(normalizePhone('0712-345-678')).toBe('+40712345678');
      expect(normalizePhone('+40-712-345-678')).toBe('+40712345678');
    });

    it('should handle numbers with parentheses', () => {
      expect(normalizePhone('(0712) 345 678')).toBe('+40712345678');
      expect(normalizePhone('+40 (712) 345-678')).toBe('+40712345678');
    });

    it('should handle numbers with dots', () => {
      expect(normalizePhone('0712.345.678')).toBe('+40712345678');
      expect(normalizePhone('+40.712.345.678')).toBe('+40712345678');
    });

    it('should handle mixed formatting', () => {
      expect(normalizePhone('(0712) 345-678')).toBe('+40712345678');
      expect(normalizePhone('+40 712-345.678')).toBe('+40712345678');
    });
  });

  describe('invalid numbers', () => {
    it('should return null for too short numbers', () => {
      expect(normalizePhone('071234567')).toBeNull();
      expect(normalizePhone('0712345')).toBeNull();
      expect(normalizePhone('071')).toBeNull();
    });

    it('should return null for too long numbers', () => {
      expect(normalizePhone('07123456789')).toBeNull();
      expect(normalizePhone('071234567890')).toBeNull();
    });

    it('should return null for invalid prefixes', () => {
      expect(normalizePhone('0812345678')).toBeNull(); // 08 not valid
      expect(normalizePhone('0912345678')).toBeNull(); // 09 not valid
      expect(normalizePhone('0012345678')).toBeNull(); // 00 not valid
      expect(normalizePhone('0112345678')).toBeNull(); // 01 not valid
    });

    it('should return null for numbers with invalid country code', () => {
      expect(normalizePhone('+39712345678')).toBeNull(); // Italy
      expect(normalizePhone('+1234567890')).toBeNull(); // US format
      expect(normalizePhone('+441234567890')).toBeNull(); // UK
    });

    it('should return null for empty or whitespace strings', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone('\t\n')).toBeNull();
    });

    it('should return null for non-numeric strings', () => {
      expect(normalizePhone('abc')).toBeNull();
      expect(normalizePhone('phone')).toBeNull();
      expect(normalizePhone('N/A')).toBeNull();
    });

    it('should return null for partial international format', () => {
      expect(normalizePhone('+4071234567')).toBeNull(); // Too short
      expect(normalizePhone('4071234567')).toBeNull(); // Missing digit
    });
  });

  describe('edge cases', () => {
    it('should handle numbers starting with multiple zeros', () => {
      expect(normalizePhone('00040712345678')).toBeNull(); // Too many zeros
    });

    it('should handle numbers with only special characters', () => {
      expect(normalizePhone('---')).toBeNull();
      expect(normalizePhone('()')).toBeNull();
    });

    it('should strip letters and normalize if result is valid', () => {
      // Letters are stripped, so '0712abc345678' becomes '0712345678' which is valid
      expect(normalizePhone('0712abc345678')).toBe('+40712345678');
      expect(normalizePhone('a0712345678')).toBe('+40712345678');
      // But if after stripping the result is invalid, it returns null
      expect(normalizePhone('abc')).toBeNull();
    });
  });
});

describe('isValidRomanianPhone', () => {
  describe('valid numbers', () => {
    it('should validate mobile numbers (07X)', () => {
      expect(isValidRomanianPhone('+40712345678')).toBe(true);
      expect(isValidRomanianPhone('+40723456789')).toBe(true);
      expect(isValidRomanianPhone('+40734567890')).toBe(true);
      expect(isValidRomanianPhone('+40745678901')).toBe(true);
      expect(isValidRomanianPhone('+40756789012')).toBe(true);
      expect(isValidRomanianPhone('+40767890123')).toBe(true);
      expect(isValidRomanianPhone('+40778901234')).toBe(true);
      expect(isValidRomanianPhone('+40789012345')).toBe(true);
    });

    it('should validate landline numbers (02X, 03X)', () => {
      expect(isValidRomanianPhone('+40213456789')).toBe(true);
      expect(isValidRomanianPhone('+40223456789')).toBe(true);
      expect(isValidRomanianPhone('+40233456789')).toBe(true);
      expect(isValidRomanianPhone('+40313456789')).toBe(true);
    });
  });

  describe('invalid numbers', () => {
    it('should reject numbers without + prefix', () => {
      expect(isValidRomanianPhone('40712345678')).toBe(false);
      expect(isValidRomanianPhone('0712345678')).toBe(false);
    });

    it('should reject numbers with wrong country code', () => {
      expect(isValidRomanianPhone('+39712345678')).toBe(false);
      expect(isValidRomanianPhone('+1234567890')).toBe(false);
    });

    it('should reject numbers with invalid prefixes', () => {
      expect(isValidRomanianPhone('+40812345678')).toBe(false);
      expect(isValidRomanianPhone('+40912345678')).toBe(false);
      expect(isValidRomanianPhone('+40012345678')).toBe(false);
      expect(isValidRomanianPhone('+40112345678')).toBe(false);
      expect(isValidRomanianPhone('+40412345678')).toBe(false);
      expect(isValidRomanianPhone('+40512345678')).toBe(false);
      expect(isValidRomanianPhone('+40612345678')).toBe(false);
    });

    it('should reject numbers with wrong length', () => {
      expect(isValidRomanianPhone('+4071234567')).toBe(false); // Too short
      expect(isValidRomanianPhone('+407123456789')).toBe(false); // Too long
    });

    it('should reject numbers with spaces or formatting', () => {
      expect(isValidRomanianPhone('+40 712 345 678')).toBe(false);
      expect(isValidRomanianPhone('+40-712-345-678')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isValidRomanianPhone('')).toBe(false);
    });
  });
});

describe('formatPhoneForDisplay', () => {
  describe('valid numbers', () => {
    it('should format E.164 mobile numbers', () => {
      expect(formatPhoneForDisplay('+40712345678')).toBe('+40 712 345 678');
      expect(formatPhoneForDisplay('+40723456789')).toBe('+40 723 456 789');
    });

    it('should format local format mobile numbers', () => {
      expect(formatPhoneForDisplay('0712345678')).toBe('+40 712 345 678');
      expect(formatPhoneForDisplay('0723456789')).toBe('+40 723 456 789');
    });

    it('should format numbers without + prefix', () => {
      expect(formatPhoneForDisplay('40712345678')).toBe('+40 712 345 678');
    });

    it('should format international format with 00', () => {
      expect(formatPhoneForDisplay('0040712345678')).toBe('+40 712 345 678');
    });

    it('should format landline numbers', () => {
      expect(formatPhoneForDisplay('+40213456789')).toBe('+40 213 456 789');
      expect(formatPhoneForDisplay('0213456789')).toBe('+40 213 456 789');
    });

    it('should format numbers with existing formatting', () => {
      expect(formatPhoneForDisplay('0712 345 678')).toBe('+40 712 345 678');
      expect(formatPhoneForDisplay('+40-712-345-678')).toBe('+40 712 345 678');
      expect(formatPhoneForDisplay('(0712) 345-678')).toBe('+40 712 345 678');
    });
  });

  describe('invalid numbers', () => {
    it('should return original string for invalid numbers', () => {
      const invalid = '123456';
      expect(formatPhoneForDisplay(invalid)).toBe(invalid);
    });

    it('should return original for numbers with wrong country code', () => {
      const invalid = '+39123456789';
      expect(formatPhoneForDisplay(invalid)).toBe(invalid);
    });

    it('should return original for too short numbers', () => {
      const invalid = '071234567';
      expect(formatPhoneForDisplay(invalid)).toBe(invalid);
    });

    it('should return original for empty strings', () => {
      expect(formatPhoneForDisplay('')).toBe('');
    });

    it('should return original for non-phone strings', () => {
      const invalid = 'not a phone';
      expect(formatPhoneForDisplay(invalid)).toBe(invalid);
    });
  });
});
