/**
 * Comprehensive Phone Utility Tests
 * Tests for phone number validation, formatting, parsing, and international handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validatePhone,
  validatePhoneSync,
  normalizePhone,
  normalizeRomanianPhone,
  isValidRomanianPhone,
  formatPhoneForDisplay,
  isLikelyMobile,
  redactPhone,
  getCountryCallingCode,
  type PhoneValidationResult,
  type PhoneNumberType,
} from '../phone.js';

// =============================================================================
// MAIN VALIDATION FUNCTIONS
// =============================================================================

describe('validatePhone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Romanian numbers with fallback validation', () => {
    it('should validate and normalize valid Romanian mobile numbers', async () => {
      const result = await validatePhone('0712345678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
      expect(result.countryCode).toBe('RO');
      // Type may be 'mobile', 'fixed_line_or_mobile', or 'unknown' depending on libphonenumber-js
      expect(['mobile', 'fixed_line_or_mobile', 'unknown']).toContain(result.type);
      expect(result.error).toBeNull();
    });

    it('should validate Romanian numbers in E.164 format', async () => {
      const result = await validatePhone('+40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
      expect(result.countryCode).toBe('RO');
    });

    it('should validate Romanian landline numbers', async () => {
      const result = await validatePhone('0213456789', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40213456789');
      expect(result.countryCode).toBe('RO');
    });

    it('should format Romanian numbers correctly', async () => {
      const result = await validatePhone('0712345678');
      // When libphonenumber-js is loaded, it returns national format without country code
      expect(result.nationalFormat).toBeTruthy();
      expect(result.internationalFormat).toBeTruthy();
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle numbers with spaces and formatting', async () => {
      const result = await validatePhone('0712 345 678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle numbers without + prefix', async () => {
      const result = await validatePhone('40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle numbers with 00 international prefix', async () => {
      const result = await validatePhone('0040712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });
  });

  describe('invalid numbers', () => {
    it('should reject empty strings', async () => {
      const result = await validatePhone('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Phone number is required');
      expect(result.normalized).toBe('');
    });

    it('should reject whitespace-only strings', async () => {
      const result = await validatePhone('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Phone number is required');
    });

    it('should reject invalid Romanian numbers', async () => {
      // Use a clearly invalid number that libphonenumber-js will also reject
      const result = await validatePhone('0112345678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject too short numbers', async () => {
      const result = await validatePhone('071234567');
      expect(result.isValid).toBe(false);
    });

    it('should reject too long numbers', async () => {
      const result = await validatePhone('07123456789');
      expect(result.isValid).toBe(false);
    });

    it('should reject non-numeric strings', async () => {
      const result = await validatePhone('not-a-phone');
      expect(result.isValid).toBe(false);
    });
  });

  describe('different phone number types', () => {
    it('should handle toll-free numbers', async () => {
      // Romanian toll-free numbers start with 080
      const result = await validatePhone('+40800123456');
      // May be valid or invalid depending on libphonenumber-js database
      expect(result).toHaveProperty('type');
    });

    it('should handle premium rate numbers', async () => {
      // Romanian premium rate numbers start with 090
      const result = await validatePhone('+40900123456');
      expect(result).toHaveProperty('type');
    });

    it('should handle fixed line numbers', async () => {
      // Bucharest landline
      const result = await validatePhone('+40213456789');
      expect(result.isValid).toBe(true);
      expect(['fixed_line', 'fixed_line_or_mobile', 'unknown']).toContain(result.type);
    });

    it('should handle VOIP numbers if recognized', async () => {
      // Test with international VOIP number
      const result = await validatePhone('+442012345678'); // UK VOIP
      // Just verify it processes without error
      expect(result).toHaveProperty('type');
    });
  });

  describe('edge cases', () => {
    it('should trim input before validation', async () => {
      const result = await validatePhone('  0712345678  ');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle numbers with mixed formatting', async () => {
      const result = await validatePhone('(0712) 345-678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should return original input in normalized field when invalid', async () => {
      const invalid = 'invalid123';
      const result = await validatePhone(invalid);
      expect(result.normalized).toBe(invalid);
    });
  });

  describe('options handling', () => {
    it('should use default country RO when not specified', async () => {
      const result = await validatePhone('0712345678');
      expect(result.isValid).toBe(true);
      expect(result.countryCode).toBe('RO');
    });

    it('should accept custom default country', async () => {
      const result = await validatePhone('0712345678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
    });

    it('should handle allowPossibleNumbers option', async () => {
      // Test with a number that might be possible but not valid
      const result = await validatePhone('+40712345678', { allowPossibleNumbers: true });
      expect(result.isValid).toBe(true);
    });

    it('should handle different country codes', async () => {
      // German number with DE country code
      const result = await validatePhone('+4915012345678', { defaultCountry: 'DE' });
      expect(result).toHaveProperty('isValid');
    });
  });
});

describe('validatePhoneSync', () => {
  it('should validate Romanian numbers synchronously', () => {
    const result = validatePhoneSync('0712345678', { defaultCountry: 'RO' });
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('+40712345678');
    expect(result.countryCode).toBe('RO');
    expect(result.type).toBe('mobile');
    expect(result.isMobile).toBe(true);
  });

  it('should validate numbers in E.164 format', () => {
    const result = validatePhoneSync('+40712345678');
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('+40712345678');
  });

  it('should validate landline numbers', () => {
    const result = validatePhoneSync('0213456789');
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe('+40213456789');
  });

  it('should reject invalid Romanian numbers', () => {
    const result = validatePhoneSync('0812345678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid Romanian phone number');
  });

  it('should format valid numbers', () => {
    const result = validatePhoneSync('0712345678');
    expect(result.nationalFormat).toBe('+40 712 345 678');
    expect(result.internationalFormat).toBe('+40 712345678');
  });

  it('should return null formats for invalid numbers', () => {
    const result = validatePhoneSync('invalid');
    expect(result.nationalFormat).toBeNull();
    expect(result.internationalFormat).toBeNull();
  });

  it('should reject non-RO countries with error message', () => {
    const result = validatePhoneSync('0712345678', { defaultCountry: 'DE' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(
      'Sync validation only supports Romanian numbers. Use validatePhone() for international.'
    );
  });

  it('should use RO as default country', () => {
    const result = validatePhoneSync('0712345678');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('RO');
  });
});

// =============================================================================
// ROMANIAN PHONE NUMBER UTILITIES
// =============================================================================

describe('normalizeRomanianPhone', () => {
  describe('valid Romanian mobile numbers', () => {
    it('should normalize local format (07XX XXX XXX)', () => {
      expect(normalizeRomanianPhone('0712345678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
      expect(normalizeRomanianPhone('0723456789')).toEqual({
        isValid: true,
        normalized: '+40723456789',
      });
    });

    it('should handle already E.164 format (+40)', () => {
      expect(normalizeRomanianPhone('+40712345678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should normalize without + prefix (40)', () => {
      expect(normalizeRomanianPhone('40712345678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should normalize international format with 00 prefix', () => {
      expect(normalizeRomanianPhone('0040712345678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should handle numbers with spaces', () => {
      expect(normalizeRomanianPhone('0712 345 678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should handle numbers with dashes', () => {
      expect(normalizeRomanianPhone('0712-345-678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should handle numbers with parentheses', () => {
      expect(normalizeRomanianPhone('(0712) 345 678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });

    it('should handle numbers with dots', () => {
      expect(normalizeRomanianPhone('0712.345.678')).toEqual({
        isValid: true,
        normalized: '+40712345678',
      });
    });
  });

  describe('valid Romanian landline numbers', () => {
    it('should normalize Bucharest numbers (021)', () => {
      expect(normalizeRomanianPhone('0213456789')).toEqual({
        isValid: true,
        normalized: '+40213456789',
      });
    });

    it('should normalize other landline prefixes', () => {
      expect(normalizeRomanianPhone('0223456789')).toEqual({
        isValid: true,
        normalized: '+40223456789',
      });
      expect(normalizeRomanianPhone('0313456789')).toEqual({
        isValid: true,
        normalized: '+40313456789',
      });
    });
  });

  describe('invalid numbers', () => {
    it('should return isValid false for too short numbers', () => {
      const result = normalizeRomanianPhone('071234567');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('071234567');
    });

    it('should return isValid false for too long numbers', () => {
      const result = normalizeRomanianPhone('07123456789');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('07123456789');
    });

    it('should return isValid false for invalid prefixes', () => {
      expect(normalizeRomanianPhone('0812345678').isValid).toBe(false);
      expect(normalizeRomanianPhone('0912345678').isValid).toBe(false);
    });

    it('should return isValid false for wrong country codes', () => {
      expect(normalizeRomanianPhone('+39712345678').isValid).toBe(false);
      expect(normalizeRomanianPhone('+1234567890').isValid).toBe(false);
    });

    it('should return isValid false for empty strings', () => {
      const result = normalizeRomanianPhone('');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('');
    });

    it('should return isValid false for non-numeric strings', () => {
      const result = normalizeRomanianPhone('not-a-phone');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('not-a-phone');
    });
  });
});

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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

describe('isLikelyMobile', () => {
  it('should return true for Romanian mobile numbers', () => {
    expect(isLikelyMobile('0712345678')).toBe(true);
    expect(isLikelyMobile('0723456789')).toBe(true);
    expect(isLikelyMobile('0734567890')).toBe(true);
    expect(isLikelyMobile('0745678901')).toBe(true);
    expect(isLikelyMobile('0756789012')).toBe(true);
    expect(isLikelyMobile('0767890123')).toBe(true);
    expect(isLikelyMobile('0778901234')).toBe(true);
    expect(isLikelyMobile('0789012345')).toBe(true);
  });

  it('should return true for mobile numbers in E.164 format', () => {
    expect(isLikelyMobile('+40712345678')).toBe(true);
    expect(isLikelyMobile('+40723456789')).toBe(true);
  });

  it('should return true for mobile numbers without + prefix', () => {
    expect(isLikelyMobile('40712345678')).toBe(true);
  });

  it('should return false for landline numbers', () => {
    expect(isLikelyMobile('0213456789')).toBe(false);
    expect(isLikelyMobile('0223456789')).toBe(false);
    expect(isLikelyMobile('0313456789')).toBe(false);
    expect(isLikelyMobile('+40213456789')).toBe(false);
  });

  it('should return false for invalid numbers', () => {
    expect(isLikelyMobile('invalid')).toBe(false);
    expect(isLikelyMobile('')).toBe(false);
    expect(isLikelyMobile('123')).toBe(false);
  });

  it('should return false for international non-Romanian numbers', () => {
    expect(isLikelyMobile('+4915012345678')).toBe(false); // German mobile
    expect(isLikelyMobile('+1234567890')).toBe(false); // US
  });
});

describe('redactPhone', () => {
  it('should redact valid E.164 Romanian mobile numbers', () => {
    expect(redactPhone('+40712345678')).toBe('+40712***78');
    expect(redactPhone('+40723456789')).toBe('+40723***89');
  });

  it('should redact local format numbers', () => {
    expect(redactPhone('0712345678')).toBe('+40712***78');
    expect(redactPhone('0723456789')).toBe('+40723***89');
  });

  it('should redact numbers without + prefix', () => {
    expect(redactPhone('40712345678')).toBe('+40712***78');
  });

  it('should redact landline numbers', () => {
    expect(redactPhone('+40213456789')).toBe('+40213***89');
    expect(redactPhone('0213456789')).toBe('+40213***89');
  });

  it('should handle invalid numbers by returning ***', () => {
    expect(redactPhone('invalid')).toBe('***');
    expect(redactPhone('123')).toBe('***');
  });

  it('should handle short invalid numbers', () => {
    expect(redactPhone('1234567')).toBe('***');
    expect(redactPhone('12345')).toBe('***');
  });

  it('should handle empty strings', () => {
    expect(redactPhone('')).toBe('***');
  });

  it('should redact numbers with formatting', () => {
    expect(redactPhone('0712 345 678')).toBe('+40712***78');
    expect(redactPhone('+40-712-345-678')).toBe('+40712***78');
  });
});

describe('getCountryCallingCode', () => {
  describe('single-digit country codes', () => {
    it('should extract US/Canada code (1)', () => {
      expect(getCountryCallingCode('+12025551234')).toBe('1');
      expect(getCountryCallingCode('+14155551234')).toBe('1');
    });

    it('should extract Russia/Kazakhstan code (7)', () => {
      expect(getCountryCallingCode('+74951234567')).toBe('7');
      expect(getCountryCallingCode('+77012345678')).toBe('7');
    });
  });

  describe('two-digit country codes', () => {
    it('should extract Romanian code (40)', () => {
      expect(getCountryCallingCode('+40712345678')).toBe('40');
      expect(getCountryCallingCode('+40213456789')).toBe('40');
    });

    it('should extract German code (49)', () => {
      expect(getCountryCallingCode('+4915012345678')).toBe('49');
    });

    it('should extract UK code (44)', () => {
      expect(getCountryCallingCode('+447911123456')).toBe('44');
    });

    it('should extract French code (33)', () => {
      expect(getCountryCallingCode('+33612345678')).toBe('33');
    });

    it('should extract Italian code (39)', () => {
      expect(getCountryCallingCode('+393123456789')).toBe('39');
    });

    it('should extract Spanish code (34)', () => {
      expect(getCountryCallingCode('+34612345678')).toBe('34');
    });

    it('should extract other European codes', () => {
      expect(getCountryCallingCode('+31612345678')).toBe('31'); // Netherlands
      expect(getCountryCallingCode('+32471234567')).toBe('32'); // Belgium
      expect(getCountryCallingCode('+41791234567')).toBe('41'); // Switzerland
      expect(getCountryCallingCode('+43664123456')).toBe('43'); // Austria
      expect(getCountryCallingCode('+45201234567')).toBe('45'); // Denmark
      expect(getCountryCallingCode('+46701234567')).toBe('46'); // Sweden
      expect(getCountryCallingCode('+47912345678')).toBe('47'); // Norway
      expect(getCountryCallingCode('+48501234567')).toBe('48'); // Poland
    });

    it('should extract Asian codes', () => {
      expect(getCountryCallingCode('+8190123456')).toBe('81'); // Japan
      expect(getCountryCallingCode('+821012345678')).toBe('82'); // South Korea
      expect(getCountryCallingCode('+8613812345678')).toBe('86'); // China
      expect(getCountryCallingCode('+911234567890')).toBe('91'); // India
      expect(getCountryCallingCode('+6591234567')).toBe('65'); // Singapore
    });

    it('should extract other codes', () => {
      expect(getCountryCallingCode('+27821234567')).toBe('27'); // South Africa
      expect(getCountryCallingCode('+5511912345678')).toBe('55'); // Brazil
      expect(getCountryCallingCode('+5215512345678')).toBe('52'); // Mexico
      expect(getCountryCallingCode('+61412345678')).toBe('61'); // Australia
    });
  });

  describe('three-digit country codes', () => {
    it('should extract Morocco code (212)', () => {
      expect(getCountryCallingCode('+212612345678')).toBe('212');
    });

    it('should extract Algeria code (213)', () => {
      expect(getCountryCallingCode('+213550123456')).toBe('213');
    });

    it('should extract Tunisia code (216)', () => {
      expect(getCountryCallingCode('+21621234567')).toBe('216');
    });

    it('should extract Libya code (218)', () => {
      expect(getCountryCallingCode('+218912345678')).toBe('218');
    });

    it('should extract other African codes', () => {
      expect(getCountryCallingCode('+22012345678')).toBe('220'); // Gambia
      expect(getCountryCallingCode('+22112345678')).toBe('221'); // Senegal
      expect(getCountryCallingCode('+22212345678')).toBe('222'); // Mauritania
      expect(getCountryCallingCode('+22312345678')).toBe('223'); // Mali
      expect(getCountryCallingCode('+22412345678')).toBe('224'); // Guinea
      expect(getCountryCallingCode('+22512345678')).toBe('225'); // Ivory Coast
    });
  });

  describe('edge cases', () => {
    it('should return null for numbers without + prefix', () => {
      expect(getCountryCallingCode('40712345678')).toBeNull();
      expect(getCountryCallingCode('14155551234')).toBeNull();
    });

    it('should return null for empty strings', () => {
      expect(getCountryCallingCode('')).toBeNull();
    });

    it('should handle just + sign', () => {
      // When input is just '+', the function extracts what it can
      const result = getCountryCallingCode('+');
      // May return null or empty string depending on implementation
      expect(result === null || result === '').toBe(true);
    });

    it('should handle unknown country codes by defaulting to 2 digits', () => {
      // For unknown codes, it defaults to extracting 2 digits
      expect(getCountryCallingCode('+99123456789')).toBe('99');
    });

    it('should handle very short numbers', () => {
      expect(getCountryCallingCode('+1')).toBe('1');
      expect(getCountryCallingCode('+40')).toBe('40');
    });
  });
});

// =============================================================================
// TYPE TESTS
// =============================================================================

describe('PhoneValidationResult type', () => {
  it('should have all required fields', async () => {
    const result = await validatePhone('+40712345678');

    // Test that result has all expected properties
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('normalized');
    expect(result).toHaveProperty('countryCode');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('isMobile');
    expect(result).toHaveProperty('nationalFormat');
    expect(result).toHaveProperty('internationalFormat');
    expect(result).toHaveProperty('error');
  });

  it('should have correct types for valid numbers', async () => {
    const result = await validatePhone('+40712345678');

    expect(typeof result.isValid).toBe('boolean');
    expect(typeof result.normalized).toBe('string');
    expect(typeof result.isMobile).toBe('boolean');
    expect(result.countryCode === null || typeof result.countryCode === 'string').toBe(true);
    expect(result.error === null || typeof result.error === 'string').toBe(true);
  });
});

// =============================================================================
// ERROR HANDLING AND EDGE CASES
// =============================================================================

describe('error handling', () => {
  it('should handle unparseable numbers gracefully', async () => {
    const result = await validatePhone('+++++', { defaultCountry: 'RO' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should handle very long invalid numbers', async () => {
    const result = await validatePhone('0' + '1'.repeat(50));
    expect(result.isValid).toBe(false);
  });

  it('should handle special characters only', async () => {
    const result = await validatePhone('().-/');
    expect(result.isValid).toBe(false);
  });

  it('should handle numbers with letters mixed in', async () => {
    const result = await validatePhone('07abc12def345ghi678');
    // After stripping letters, might be valid or invalid
    expect(result).toHaveProperty('isValid');
  });

  it('should handle international numbers from various countries', async () => {
    const numbers = [
      '+14155551234', // US
      '+442071234567', // UK
      '+33123456789', // France
      '+4915012345678', // Germany
      '+81312345678', // Japan
    ];

    for (const number of numbers) {
      const result = await validatePhone(number);
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('countryCode');
    }
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('integration tests', () => {
  it('should work with complete workflow: normalize -> validate -> format', async () => {
    const input = '0712 345 678';

    // Normalize
    const normalized = normalizePhone(input);
    expect(normalized).toBe('+40712345678');

    // Validate
    const validation = await validatePhone(input);
    expect(validation.isValid).toBe(true);
    expect(validation.normalized).toBe('+40712345678');

    // Format
    const formatted = formatPhoneForDisplay(normalized!);
    expect(formatted).toBe('+40 712 345 678');
  });

  it('should handle various input formats consistently', async () => {
    const inputs = [
      '0712345678',
      '+40712345678',
      '40712345678',
      '0040712345678',
      '0712 345 678',
      '(0712) 345-678',
    ];

    for (const input of inputs) {
      const result = await validatePhone(input);
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
      expect(result.countryCode).toBe('RO');
    }
  });

  it('should consistently reject invalid numbers', async () => {
    const invalids = [
      '',
      'invalid',
      '123',
      '0112345678', // Invalid prefix for Romania
      '+39123456789', // Italian number (invalid when expecting RO)
      '071234567', // too short
      '07123456789', // too long
    ];

    for (const invalid of invalids) {
      const result = await validatePhone(invalid);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  it('should maintain GDPR compliance with redaction', () => {
    const sensitiveNumber = '+40712345678';
    const redacted = redactPhone(sensitiveNumber);

    expect(redacted).toBe('+40712***78');
    expect(redacted).not.toContain('345');
    expect(redacted.length).toBeLessThan(sensitiveNumber.length);
  });
});
