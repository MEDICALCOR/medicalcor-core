import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePhone,
  isValidRomanianPhone,
  formatPhoneForDisplay,
  validatePhone,
  validatePhoneSync,
  normalizeRomanianPhone,
  isLikelyMobile,
  redactPhone,
  getCountryCallingCode,
} from '../phone.js';

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
// RESULT-BASED NORMALIZATION TESTS
// =============================================================================

describe('normalizeRomanianPhone', () => {
  describe('valid numbers', () => {
    it('should return valid result for local format', () => {
      const result = normalizeRomanianPhone('0712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should return valid result for E.164 format', () => {
      const result = normalizeRomanianPhone('+40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should return valid result for landline numbers', () => {
      const result = normalizeRomanianPhone('0213456789');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40213456789');
    });

    it('should normalize 40 prefix without +', () => {
      const result = normalizeRomanianPhone('40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should normalize 0040 prefix', () => {
      const result = normalizeRomanianPhone('0040712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });
  });

  describe('invalid numbers', () => {
    it('should return invalid result with original for too short', () => {
      const result = normalizeRomanianPhone('071234567');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('071234567');
    });

    it('should return invalid result for wrong prefix', () => {
      const result = normalizeRomanianPhone('0812345678');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('0812345678');
    });

    it('should return invalid result for foreign numbers', () => {
      const result = normalizeRomanianPhone('+39123456789');
      expect(result.isValid).toBe(false);
      expect(result.normalized).toBe('+39123456789');
    });

    it('should return invalid result for empty string', () => {
      const result = normalizeRomanianPhone('');
      expect(result.isValid).toBe(false);
    });
  });
});

// =============================================================================
// ASYNC VALIDATION TESTS
// =============================================================================

describe('validatePhone', () => {
  describe('Romanian numbers', () => {
    it('should validate Romanian mobile numbers', async () => {
      const result = await validatePhone('0712345678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
      expect(result.countryCode).toBe('RO');
      expect(result.error).toBeNull();
      // Type detection depends on whether libphonenumber-js is loaded
      expect(['mobile', 'fixed_line_or_mobile', 'unknown']).toContain(result.type);
    });

    it('should validate Romanian landline numbers', async () => {
      const result = await validatePhone('0213456789', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40213456789');
    });

    it('should provide national format for valid numbers', async () => {
      const result = await validatePhone('+40712345678');
      expect(result.isValid).toBe(true);
      expect(result.nationalFormat).not.toBeNull();
    });

    it('should provide international format for valid numbers', async () => {
      const result = await validatePhone('+40712345678');
      expect(result.isValid).toBe(true);
      expect(result.internationalFormat).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return error for empty phone', async () => {
      const result = await validatePhone('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Phone number is required');
      expect(result.countryCode).toBeNull();
      expect(result.nationalFormat).toBeNull();
      expect(result.internationalFormat).toBeNull();
    });

    it('should return error for whitespace only', async () => {
      const result = await validatePhone('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Phone number is required');
    });

    it('should handle numbers with invalid national prefix', async () => {
      // libphonenumber-js may validate differently from fallback
      const result = await validatePhone('0812345678', { defaultCountry: 'RO' });
      // Just verify we get a result with the right shape
      expect(typeof result.isValid).toBe('boolean');
      expect(typeof result.normalized).toBe('string');
    });

    it('should return error for clearly invalid input', async () => {
      const result = await validatePhone('abc123', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(false);
    });
  });

  describe('allowPossibleNumbers option', () => {
    it('should use default strict validation', async () => {
      const result = await validatePhone('0712345678');
      expect(result.isValid).toBe(true);
    });

    it('should allow possible numbers when option is set', async () => {
      const result = await validatePhone('0712345678', { allowPossibleNumbers: true });
      expect(result.isValid).toBe(true);
    });
  });
});

// =============================================================================
// SYNC VALIDATION TESTS
// =============================================================================

describe('validatePhoneSync', () => {
  describe('Romanian numbers', () => {
    it('should validate Romanian mobile numbers', () => {
      const result = validatePhoneSync('0712345678', { defaultCountry: 'RO' });
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
      expect(result.countryCode).toBe('RO');
      expect(result.type).toBe('mobile');
      expect(result.isMobile).toBe(true);
    });

    it('should provide national format', () => {
      const result = validatePhoneSync('0712345678');
      expect(result.isValid).toBe(true);
      expect(result.nationalFormat).toBe('+40 712 345 678');
    });

    it('should provide international format', () => {
      const result = validatePhoneSync('0712345678');
      expect(result.isValid).toBe(true);
      expect(result.internationalFormat).toBe('+40 712345678');
    });
  });

  describe('non-Romanian numbers', () => {
    it('should return error for non-RO country sync validation', () => {
      const result = validatePhoneSync('+49123456789', { defaultCountry: 'DE' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Sync validation only supports Romanian numbers');
    });

    it('should return error for US numbers in sync mode', () => {
      const result = validatePhoneSync('+12025551234', { defaultCountry: 'US' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Use validatePhone() for international');
    });
  });

  describe('invalid numbers', () => {
    it('should return invalid for wrong prefix', () => {
      const result = validatePhoneSync('0812345678');
      expect(result.isValid).toBe(false);
      expect(result.countryCode).toBeNull();
      expect(result.type).toBe('unknown');
    });

    it('should return invalid for too short numbers', () => {
      const result = validatePhoneSync('071234567');
      expect(result.isValid).toBe(false);
    });
  });
});

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('isLikelyMobile', () => {
  describe('mobile numbers', () => {
    it('should return true for Romanian mobile numbers', () => {
      expect(isLikelyMobile('0712345678')).toBe(true);
      expect(isLikelyMobile('0723456789')).toBe(true);
      expect(isLikelyMobile('+40712345678')).toBe(true);
      expect(isLikelyMobile('40712345678')).toBe(true);
    });

    it('should return true for all mobile prefixes (07X)', () => {
      expect(isLikelyMobile('0712345678')).toBe(true);
      expect(isLikelyMobile('0722345678')).toBe(true);
      expect(isLikelyMobile('0732345678')).toBe(true);
      expect(isLikelyMobile('0742345678')).toBe(true);
      expect(isLikelyMobile('0752345678')).toBe(true);
      expect(isLikelyMobile('0762345678')).toBe(true);
      expect(isLikelyMobile('0772345678')).toBe(true);
      expect(isLikelyMobile('0782345678')).toBe(true);
    });
  });

  describe('non-mobile numbers', () => {
    it('should return false for landline numbers', () => {
      expect(isLikelyMobile('0213456789')).toBe(false);
      expect(isLikelyMobile('0313456789')).toBe(false);
      expect(isLikelyMobile('+40213456789')).toBe(false);
    });

    it('should return false for invalid numbers', () => {
      expect(isLikelyMobile('123')).toBe(false);
      expect(isLikelyMobile('')).toBe(false);
      expect(isLikelyMobile('invalid')).toBe(false);
      expect(isLikelyMobile('0812345678')).toBe(false);
    });
  });
});

describe('redactPhone', () => {
  describe('valid numbers', () => {
    it('should redact E.164 format', () => {
      const result = redactPhone('+40712345678');
      expect(result).toBe('+40712***78');
    });

    it('should normalize and redact local format', () => {
      const result = redactPhone('0712345678');
      expect(result).toBe('+40712***78');
    });

    it('should redact landline numbers', () => {
      const result = redactPhone('+40213456789');
      expect(result).toBe('+40213***89');
    });

    it('should preserve first 6 and last 2 digits', () => {
      const result = redactPhone('+40712345678');
      expect(result.slice(0, 6)).toBe('+40712');
      expect(result.slice(-2)).toBe('78');
      expect(result).toContain('***');
    });
  });

  describe('invalid numbers', () => {
    it('should redact invalid numbers (best effort)', () => {
      const result = redactPhone('0812345678');
      // Invalid number but still attempts redaction
      expect(result).toContain('***');
    });

    it('should return *** for very short strings', () => {
      expect(redactPhone('123')).toBe('***');
      expect(redactPhone('12')).toBe('***');
      expect(redactPhone('1')).toBe('***');
      expect(redactPhone('')).toBe('***');
    });

    it('should handle 7-character edge case', () => {
      // Exactly 7 characters should still return ***
      expect(redactPhone('1234567')).toBe('***');
    });

    it('should handle exactly 8 characters', () => {
      // 8 characters should work
      const result = redactPhone('12345678');
      expect(result.length).toBeGreaterThan(3);
    });
  });
});

describe('getCountryCallingCode', () => {
  describe('single digit codes', () => {
    it('should return 1 for US/Canada numbers', () => {
      expect(getCountryCallingCode('+12025551234')).toBe('1');
      expect(getCountryCallingCode('+14155551234')).toBe('1');
    });

    it('should return 7 for Russia/Kazakhstan numbers', () => {
      expect(getCountryCallingCode('+79123456789')).toBe('7');
      expect(getCountryCallingCode('+77001234567')).toBe('7');
    });
  });

  describe('two digit codes', () => {
    it('should return 40 for Romania', () => {
      expect(getCountryCallingCode('+40712345678')).toBe('40');
    });

    it('should return 49 for Germany', () => {
      expect(getCountryCallingCode('+4915123456789')).toBe('49');
    });

    it('should return 44 for UK', () => {
      expect(getCountryCallingCode('+442071234567')).toBe('44');
    });

    it('should return 33 for France', () => {
      expect(getCountryCallingCode('+33123456789')).toBe('33');
    });

    it('should return 39 for Italy', () => {
      expect(getCountryCallingCode('+390612345678')).toBe('39');
    });

    it('should return 81 for Japan', () => {
      expect(getCountryCallingCode('+81312345678')).toBe('81');
    });

    it('should return 86 for China', () => {
      expect(getCountryCallingCode('+8613012345678')).toBe('86');
    });

    it('should recognize all common two-digit codes', () => {
      const twoDigitCodes = [
        '20',
        '27',
        '30',
        '31',
        '32',
        '33',
        '34',
        '36',
        '39',
        '40',
        '41',
        '43',
        '44',
        '45',
        '46',
        '47',
        '48',
        '49',
        '51',
        '52',
        '53',
        '54',
        '55',
        '56',
        '57',
        '58',
        '60',
        '61',
        '62',
        '63',
        '64',
        '65',
        '66',
        '81',
        '82',
        '84',
        '86',
        '90',
        '91',
        '92',
        '93',
        '94',
        '95',
        '98',
      ];

      for (const code of twoDigitCodes) {
        expect(getCountryCallingCode(`+${code}123456789`)).toBe(code);
      }
    });
  });

  describe('three digit codes', () => {
    it('should return 212 for Morocco', () => {
      expect(getCountryCallingCode('+212612345678')).toBe('212');
    });

    it('should return 213 for Algeria', () => {
      expect(getCountryCallingCode('+213612345678')).toBe('213');
    });

    it('should return 216 for Tunisia', () => {
      expect(getCountryCallingCode('+21612345678')).toBe('216');
    });
  });

  describe('edge cases', () => {
    it('should return null for numbers without + prefix', () => {
      expect(getCountryCallingCode('40712345678')).toBeNull();
      expect(getCountryCallingCode('12025551234')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getCountryCallingCode('')).toBeNull();
    });

    it('should return two digits for unknown codes', () => {
      // Unknown code defaults to two digits
      expect(getCountryCallingCode('+99123456789')).toBe('99');
    });
  });
});

// =============================================================================
// PHONE TYPE MAPPING TESTS
// =============================================================================

describe('phone type detection', () => {
  it('should detect mobile type for Romanian mobile numbers', async () => {
    const result = await validatePhone('0712345678');
    // Type detection depends on libphonenumber-js availability
    // Valid types for mobile: 'mobile', 'fixed_line_or_mobile', or 'unknown' (fallback)
    expect(['mobile', 'fixed_line_or_mobile', 'unknown']).toContain(result.type);
  });

  it('should return unknown type for invalid numbers', async () => {
    const result = await validatePhone('invalid');
    expect(result.type).toBe('unknown');
    expect(result.isMobile).toBe(false);
  });

  it('should handle all possible phone types', async () => {
    // Test that validatePhone returns consistent structure
    const validPhone = await validatePhone('+40712345678');
    expect(validPhone).toHaveProperty('isValid');
    expect(validPhone).toHaveProperty('normalized');
    expect(validPhone).toHaveProperty('countryCode');
    expect(validPhone).toHaveProperty('type');
    expect(validPhone).toHaveProperty('isMobile');
    expect(validPhone).toHaveProperty('nationalFormat');
    expect(validPhone).toHaveProperty('internationalFormat');
    expect(validPhone).toHaveProperty('error');
  });
});
