/**
 * Phone number validation and normalization utilities
 *
 * Provides comprehensive phone number handling with:
 * - International E.164 format normalization
 * - Country-specific validation (Romania, EU, International)
 * - Type detection (mobile, landline, toll-free)
 * - Strict validation using libphonenumber-js when available
 *
 * IMPORTANT: This module uses libphonenumber-js (Google's library) for
 * production-grade phone validation when available. All public functions
 * reject fuzzy inputs and require valid phone numbers.
 */

import { createLogger } from './logger.js';

const logger = createLogger({ name: 'phone-utils' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported phone number types
 */
export type PhoneNumberType =
  | 'mobile'
  | 'fixed_line'
  | 'fixed_line_or_mobile'
  | 'toll_free'
  | 'premium_rate'
  | 'shared_cost'
  | 'voip'
  | 'personal_number'
  | 'pager'
  | 'uan'
  | 'voicemail'
  | 'unknown';

/**
 * Result of phone number validation
 */
export interface PhoneValidationResult {
  /** Whether the phone number is valid */
  isValid: boolean;
  /** Normalized E.164 format (e.g., +40712345678) or original if invalid */
  normalized: string;
  /** ISO 3166-1 alpha-2 country code (e.g., 'RO', 'DE', 'US') */
  countryCode: string | null;
  /** Phone number type (mobile, fixed_line, etc.) */
  type: PhoneNumberType;
  /** Whether this is likely a mobile number */
  isMobile: boolean;
  /** National format for display (e.g., '0712 345 678') */
  nationalFormat: string | null;
  /** International format for display (e.g., '+40 712 345 678') */
  internationalFormat: string | null;
  /** Error message if validation failed */
  error: string | null;
}

/**
 * Options for phone number parsing
 */
export interface PhoneParseOptions {
  /** Default country code to use if not specified in number (ISO 3166-1 alpha-2) */
  defaultCountry?: string;
  /** Whether to allow numbers that may be valid but are not definitely assigned */
  allowPossibleNumbers?: boolean;
}

// =============================================================================
// INTERNAL UTILITIES
// =============================================================================

/**
 * Interface for libphonenumber-js parsed phone number
 * Defined here to avoid requiring the package as a dependency
 */
interface ParsedPhoneNumber {
  country?: string;
  isPossible(): boolean;
  isValid(): boolean;
  getType(): string | undefined;
  format(format: 'E.164' | 'INTERNATIONAL' | 'NATIONAL' | 'RFC3966'): string;
  formatNational(): string;
  formatInternational(): string;
}

/**
 * Interface for libphonenumber-js module
 */
interface PhoneLibModule {
  parsePhoneNumber(text: string, defaultCountry?: string): ParsedPhoneNumber | undefined;
}

/**
 * Lazy-loaded libphonenumber-js module reference
 */
let phoneLib: PhoneLibModule | null = null;
let phoneLibLoadAttempted = false;

/**
 * Load libphonenumber-js dynamically
 * This allows the module to work even if libphonenumber-js is not installed
 */
async function getPhoneLib(): Promise<PhoneLibModule | null> {
  if (phoneLib) return phoneLib;
  if (phoneLibLoadAttempted) return null;

  phoneLibLoadAttempted = true;

  try {
    // Dynamic import - will fail gracefully if package not installed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lib = await import('libphonenumber-js' as string);
    phoneLib = lib as PhoneLibModule;
    return phoneLib;
  } catch {
    logger.warn('libphonenumber-js not installed, using fallback Romanian validation');
    return null;
  }
}

/**
 * Map libphonenumber-js type to our PhoneNumberType
 */
function mapPhoneType(type: string | undefined): PhoneNumberType {
  if (!type) return 'unknown';

  const typeMap: Record<string, PhoneNumberType> = {
    MOBILE: 'mobile',
    FIXED_LINE: 'fixed_line',
    FIXED_LINE_OR_MOBILE: 'fixed_line_or_mobile',
    TOLL_FREE: 'toll_free',
    PREMIUM_RATE: 'premium_rate',
    SHARED_COST: 'shared_cost',
    VOIP: 'voip',
    PERSONAL_NUMBER: 'personal_number',
    PAGER: 'pager',
    UAN: 'uan',
    VOICEMAIL: 'voicemail',
  };

  return typeMap[type] ?? 'unknown';
}

// =============================================================================
// MAIN VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate and normalize a phone number to E.164 format
 *
 * This is the RECOMMENDED function for all phone number validation.
 * It provides strict validation and returns detailed information about the number.
 * Uses libphonenumber-js when available, falls back to Romanian validation.
 *
 * @param phone - Input phone number in any format
 * @param options - Parsing options
 * @returns Detailed validation result
 *
 * @example
 * ```typescript
 * // Romanian mobile number
 * const result = await validatePhone('0712 345 678', { defaultCountry: 'RO' });
 * // { isValid: true, normalized: '+40712345678', type: 'mobile', ... }
 *
 * // International format
 * const result = await validatePhone('+49 30 123456');
 * // { isValid: true, normalized: '+4930123456', countryCode: 'DE', ... }
 *
 * // Invalid number
 * const result = await validatePhone('invalid');
 * // { isValid: false, error: 'Invalid phone number format', ... }
 * ```
 */
export async function validatePhone(
  phone: string,
  options: PhoneParseOptions = {}
): Promise<PhoneValidationResult> {
  const { defaultCountry = 'RO', allowPossibleNumbers = false } = options;

  // Clean input
  const cleaned = phone.trim();

  if (!cleaned) {
    return {
      isValid: false,
      normalized: phone,
      countryCode: null,
      type: 'unknown',
      isMobile: false,
      nationalFormat: null,
      internationalFormat: null,
      error: 'Phone number is required',
    };
  }

  const lib = await getPhoneLib();

  if (lib) {
    // Use libphonenumber-js for robust validation
    try {
      const parsed = lib.parsePhoneNumber(cleaned, defaultCountry as 'RO' | 'DE' | 'US');

      if (!parsed) {
        return {
          isValid: false,
          normalized: cleaned,
          countryCode: null,
          type: 'unknown',
          isMobile: false,
          nationalFormat: null,
          internationalFormat: null,
          error: 'Unable to parse phone number',
        };
      }

      // Check validity
      const isValid = allowPossibleNumbers ? parsed.isPossible() : parsed.isValid();

      if (!isValid) {
        return {
          isValid: false,
          normalized: cleaned,
          countryCode: parsed.country ?? null,
          type: 'unknown',
          isMobile: false,
          nationalFormat: null,
          internationalFormat: null,
          error: allowPossibleNumbers
            ? 'Phone number is not possible'
            : 'Phone number is not valid',
        };
      }

      const type = mapPhoneType(parsed.getType());

      return {
        isValid: true,
        normalized: parsed.format('E.164'),
        countryCode: parsed.country ?? null,
        type,
        isMobile: type === 'mobile' || type === 'fixed_line_or_mobile',
        nationalFormat: parsed.formatNational(),
        internationalFormat: parsed.formatInternational(),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        normalized: cleaned,
        countryCode: null,
        type: 'unknown',
        isMobile: false,
        nationalFormat: null,
        internationalFormat: null,
        error: `Parse error: ${message}`,
      };
    }
  }

  // Fallback to basic Romanian validation if libphonenumber-js is not available
  const fallbackResult = normalizeRomanianPhoneInternal(cleaned);
  return {
    isValid: fallbackResult.isValid,
    normalized: fallbackResult.normalized,
    countryCode: fallbackResult.isValid ? 'RO' : null,
    type: fallbackResult.isValid ? 'mobile' : 'unknown',
    isMobile: fallbackResult.isValid,
    nationalFormat: fallbackResult.isValid
      ? formatPhoneForDisplay(fallbackResult.normalized)
      : null,
    internationalFormat: fallbackResult.isValid
      ? fallbackResult.normalized.replace('+40', '+40 ')
      : null,
    error: fallbackResult.isValid ? null : 'Invalid Romanian phone number',
  };
}

/**
 * Synchronous phone validation (uses Romanian validation only)
 * Use this only when async is not possible
 */
export function validatePhoneSync(
  phone: string,
  options: PhoneParseOptions = {}
): PhoneValidationResult {
  const { defaultCountry = 'RO' } = options;

  if (defaultCountry !== 'RO') {
    // Without libphonenumber-js loaded, we can only validate Romanian numbers synchronously
    return {
      isValid: false,
      normalized: phone,
      countryCode: null,
      type: 'unknown',
      isMobile: false,
      nationalFormat: null,
      internationalFormat: null,
      error:
        'Sync validation only supports Romanian numbers. Use validatePhone() for international.',
    };
  }

  const result = normalizeRomanianPhoneInternal(phone);
  return {
    isValid: result.isValid,
    normalized: result.normalized,
    countryCode: result.isValid ? 'RO' : null,
    type: result.isValid ? 'mobile' : 'unknown',
    isMobile: result.isValid,
    nationalFormat: result.isValid ? formatPhoneForDisplay(result.normalized) : null,
    internationalFormat: result.isValid ? result.normalized.replace('+40', '+40 ') : null,
    error: result.isValid ? null : 'Invalid Romanian phone number',
  };
}

// =============================================================================
// ROMANIAN PHONE NUMBER UTILITIES
// =============================================================================

/**
 * Result of Romanian phone normalization
 */
export interface RomanianPhoneResult {
  /** Whether the phone number is valid */
  isValid: boolean;
  /** Normalized E.164 format (+40...) or original input if invalid */
  normalized: string;
}

/**
 * Internal Romanian phone normalization
 */
function normalizeRomanianPhoneInternal(phone: string): RomanianPhoneResult {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Handle various formats
  if (cleaned.startsWith('+40')) {
    // Already E.164, no transformation needed
  } else if (cleaned.startsWith('40') && cleaned.length === 11) {
    // Missing + prefix (40712345678)
    cleaned = `+${cleaned}`;
  } else if (cleaned.startsWith('0040')) {
    // International prefix with 00 (0040712345678)
    cleaned = `+${cleaned.slice(2)}`;
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Local format (0712345678)
    cleaned = `+40${cleaned.slice(1)}`;
  } else {
    // Invalid format
    return { isValid: false, normalized: phone };
  }

  // Validate final format
  if (!isValidRomanianPhone(cleaned)) {
    return { isValid: false, normalized: phone };
  }

  return { isValid: true, normalized: cleaned };
}

/**
 * Normalize a Romanian phone number to E.164 format
 *
 * Accepts formats:
 * - 0712345678 -> +40712345678
 * - +40712345678 -> +40712345678
 * - 40712345678 -> +40712345678
 * - 0040712345678 -> +40712345678
 * - 07 12 34 56 78 -> +40712345678 (with spaces)
 *
 * @param phone - Input phone number
 * @returns Normalization result with validity flag
 */
export function normalizeRomanianPhone(phone: string): RomanianPhoneResult {
  return normalizeRomanianPhoneInternal(phone);
}

/**
 * Validate if a string is a valid Romanian phone number in E.164 format
 *
 * Valid patterns:
 * - +40 7XX XXX XXX (mobile)
 * - +40 2X XXX XXXX (landline - Bucharest and regional)
 * - +40 3X XXX XXXX (landline - regional)
 */
export function isValidRomanianPhone(phone: string): boolean {
  // E.164 format: +40 followed by 9 digits
  // First digit after country code should be 2-3 (landline) or 7 (mobile)
  const e164Pattern = /^\+40[237]\d{8}$/;
  return e164Pattern.test(phone);
}

/**
 * Format a phone number for display (with spaces)
 *
 * @param phone - E.164 phone number
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const result = normalizeRomanianPhone(phone);
  if (!result.isValid) {
    return phone; // Return original if can't normalize
  }

  const normalized = result.normalized;

  // Format as +40 7XX XXX XXX
  const digits = normalized.slice(3); // Remove +40
  const prefix = digits.slice(0, 3);
  const middle = digits.slice(3, 6);
  const end = digits.slice(6);

  return `+40 ${prefix} ${middle} ${end}`;
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use normalizeRomanianPhone instead
 * Legacy function that returns null on invalid input
 */
export function normalizePhone(phone: string): string | null {
  const result = normalizeRomanianPhone(phone);
  return result.isValid ? result.normalized : null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a phone number is likely a mobile number (quick check)
 * For accurate detection, use validatePhone()
 */
export function isLikelyMobile(phone: string): boolean {
  const result = normalizeRomanianPhone(phone);
  if (!result.isValid) return false;

  // Romanian mobile numbers start with +407
  return result.normalized.startsWith('+407');
}

/**
 * Redact a phone number for logging (GDPR compliance)
 * Shows only first 6 and last 2 digits
 *
 * @example
 * redactPhone('+40712345678') // '+40712***78'
 */
export function redactPhone(phone: string): string {
  const result = normalizeRomanianPhone(phone);
  const normalized = result.isValid ? result.normalized : phone;

  if (normalized.length < 8) return '***';

  const prefix = normalized.slice(0, 6);
  const suffix = normalized.slice(-2);
  return `${prefix}***${suffix}`;
}

/**
 * Extract country calling code from E.164 number
 *
 * @example
 * getCountryCallingCode('+40712345678') // '40'
 * getCountryCallingCode('+14155551234') // '1'
 */
export function getCountryCallingCode(phone: string): string | null {
  if (!phone.startsWith('+')) return null;

  // Common country codes by length
  const oneDigit = phone.slice(1, 2);
  const twoDigit = phone.slice(1, 3);
  const threeDigit = phone.slice(1, 4);

  // Single digit country codes: 1 (US/CA), 7 (RU/KZ)
  if (['1', '7'].includes(oneDigit)) return oneDigit;

  // Common two-digit codes
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
  if (twoDigitCodes.includes(twoDigit)) return twoDigit;

  // Three-digit codes (less common)
  const threeDigitCodes = ['212', '213', '216', '218', '220', '221', '222', '223', '224', '225'];
  if (threeDigitCodes.includes(threeDigit)) return threeDigit;

  // Default to two digits for unknown
  return twoDigit;
}
