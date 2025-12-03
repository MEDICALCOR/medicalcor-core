/**
 * @fileoverview PhoneNumber Value Object
 *
 * Banking/Medical Grade DDD Value Object for phone numbers.
 * E.164 compliant with regional validation for dental clinic operations.
 *
 * @module domain/shared-kernel/value-objects/phone-number
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. E.164 COMPLIANCE - International standard format
 * 3. REGIONAL VALIDATION - Primary markets: Romania, Germany, UK
 * 4. BUSINESS LOGIC ENCAPSULATION - WhatsApp eligibility, region detection
 */

/**
 * Supported regions for phone validation
 * Based on MedicalCor's primary markets
 */
export type PhoneRegion = 'RO' | 'DE' | 'AT' | 'CH' | 'UK' | 'US' | 'UNKNOWN';

/**
 * Phone type classification
 */
export type PhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';

/**
 * PhoneNumber Value Object
 *
 * Represents a validated phone number in E.164 format.
 * This is a true Value Object following DDD principles.
 *
 * @example
 * ```typescript
 * // Create from raw input
 * const phone = PhoneNumber.create('+40700000001');
 * console.log(phone.e164); // '+40700000001'
 * console.log(phone.region); // 'RO'
 * console.log(phone.isWhatsAppEligible()); // true
 *
 * // Parse with validation
 * const result = PhoneNumber.parse('0721234567', 'RO');
 * if (result.success) {
 *   console.log(result.value.e164); // '+40700000001'
 * }
 *
 * // Format for display
 * console.log(phone.formatNational()); // '0721 234 567'
 * console.log(phone.formatInternational()); // '+40 721 234 567'
 * ```
 */
export class PhoneNumber {
  /**
   * E.164 formatted number (e.g., '+40700000001')
   */
  public readonly e164: string;

  /**
   * Detected region code
   */
  public readonly region: PhoneRegion;

  /**
   * Country calling code (e.g., '40' for Romania)
   */
  public readonly countryCode: string;

  /**
   * National number without country code
   */
  public readonly nationalNumber: string;

  /**
   * Detected phone type
   */
  public readonly phoneType: PhoneType;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    e164: string,
    region: PhoneRegion,
    countryCode: string,
    nationalNumber: string,
    phoneType: PhoneType
  ) {
    this.e164 = e164;
    this.region = region;
    this.countryCode = countryCode;
    this.nationalNumber = nationalNumber;
    this.phoneType = phoneType;

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create PhoneNumber from E.164 formatted string
   *
   * @param e164 - Phone number in E.164 format (must start with +)
   * @throws InvalidPhoneNumberError if format is invalid
   */
  public static create(e164: string): PhoneNumber {
    const result = PhoneNumber.parse(e164);
    if (!result.success) {
      throw new InvalidPhoneNumberError(result.error);
    }
    return result.value;
  }

  /**
   * Parse phone number from various formats
   *
   * @param input - Raw phone input
   * @param defaultRegion - Default region for national numbers
   * @returns Parse result
   */
  public static parse(
    input: string,
    defaultRegion: PhoneRegion = 'RO'
  ): PhoneNumberParseResult {
    if (!input || typeof input !== 'string') {
      return { success: false, error: 'Phone number is required' };
    }

    // Normalize input: remove spaces, dashes, parentheses
    const normalized = input.replace(/[\s\-\(\)\.]/g, '');

    // Check for E.164 format
    if (normalized.startsWith('+')) {
      return PhoneNumber.parseE164(normalized);
    }

    // Check for international format without +
    if (normalized.startsWith('00')) {
      return PhoneNumber.parseE164('+' + normalized.slice(2));
    }

    // National format - apply default region
    return PhoneNumber.parseNational(normalized, defaultRegion);
  }

  /**
   * Parse E.164 formatted number
   */
  private static parseE164(e164: string): PhoneNumberParseResult {
    // E.164 validation: + followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(e164)) {
      return {
        success: false,
        error: `Invalid E.164 format: ${e164}. Must be + followed by 7-15 digits.`,
      };
    }

    // Detect region from country code
    const { region, countryCode, nationalNumber } = PhoneNumber.parseCountryCode(e164);

    // Validate national number length by region
    const validation = PhoneNumber.validateNationalNumber(nationalNumber, region);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Detect phone type (mobile vs landline)
    const phoneType = PhoneNumber.detectPhoneType(nationalNumber, region);

    return {
      success: true,
      value: new PhoneNumber(e164, region, countryCode, nationalNumber, phoneType),
    };
  }

  /**
   * Parse national format number
   */
  private static parseNational(
    national: string,
    region: PhoneRegion
  ): PhoneNumberParseResult {
    // Get country code for region
    const countryCode = REGION_TO_COUNTRY_CODE[region];
    if (!countryCode) {
      return { success: false, error: `Unknown region: ${region}` };
    }

    // Remove leading zero if present (common in national format)
    const normalizedNational = national.startsWith('0') ? national.slice(1) : national;

    // Validate national number
    const validation = PhoneNumber.validateNationalNumber(normalizedNational, region);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Construct E.164
    const e164 = `+${countryCode}${normalizedNational}`;

    // Detect phone type
    const phoneType = PhoneNumber.detectPhoneType(normalizedNational, region);

    return {
      success: true,
      value: new PhoneNumber(e164, region, countryCode, normalizedNational, phoneType),
    };
  }

  /**
   * Parse country code from E.164 number
   */
  private static parseCountryCode(e164: string): {
    region: PhoneRegion;
    countryCode: string;
    nationalNumber: string;
  } {
    const digits = e164.slice(1); // Remove +

    // Check for country codes (ordered by length - longest first)
    for (const [code, region] of COUNTRY_CODE_TO_REGION) {
      if (digits.startsWith(code)) {
        return {
          region,
          countryCode: code,
          nationalNumber: digits.slice(code.length),
        };
      }
    }

    // Unknown region - use first 2 digits as country code
    return {
      region: 'UNKNOWN',
      countryCode: digits.slice(0, 2),
      nationalNumber: digits.slice(2),
    };
  }

  /**
   * Validate national number for region
   */
  private static validateNationalNumber(
    national: string,
    region: PhoneRegion
  ): { valid: boolean; error: string } {
    const rules = REGION_VALIDATION_RULES[region];
    if (!rules) {
      // Unknown region - basic validation
      if (national.length < 6 || national.length > 12) {
        return { valid: false, error: 'National number must be 6-12 digits' };
      }
      return { valid: true, error: '' };
    }

    if (national.length < rules.minLength || national.length > rules.maxLength) {
      return {
        valid: false,
        error: `${region} phone numbers must be ${rules.minLength}-${rules.maxLength} digits`,
      };
    }

    if (rules.pattern && !rules.pattern.test(national)) {
      return {
        valid: false,
        error: `Invalid ${region} phone number format`,
      };
    }

    return { valid: true, error: '' };
  }

  /**
   * Detect phone type (mobile vs landline)
   */
  private static detectPhoneType(national: string, region: PhoneRegion): PhoneType {
    const rules = REGION_VALIDATION_RULES[region];
    if (!rules?.mobilePattern) {
      return 'unknown';
    }

    if (rules.mobilePattern.test(national)) {
      return 'mobile';
    }

    if (rules.landlinePattern?.test(national)) {
      return 'landline';
    }

    return 'unknown';
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if phone is eligible for WhatsApp
   * Only mobile numbers can receive WhatsApp messages
   */
  public isWhatsAppEligible(): boolean {
    return this.phoneType === 'mobile';
  }

  /**
   * Check if phone is a mobile number
   */
  public isMobile(): boolean {
    return this.phoneType === 'mobile';
  }

  /**
   * Check if phone is from a supported region
   */
  public isFromSupportedRegion(): boolean {
    return this.region !== 'UNKNOWN';
  }

  /**
   * Check if phone is Romanian (primary market)
   */
  public isRomanian(): boolean {
    return this.region === 'RO';
  }

  /**
   * Check if phone is DACH region (Germany, Austria, Switzerland)
   */
  public isDACHRegion(): boolean {
    return ['DE', 'AT', 'CH'].includes(this.region);
  }

  /**
   * Get preferred language based on region
   */
  public getPreferredLanguage(): 'ro' | 'en' | 'de' {
    switch (this.region) {
      case 'RO':
        return 'ro';
      case 'DE':
      case 'AT':
      case 'CH':
        return 'de';
      default:
        return 'en';
    }
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  /**
   * Format in international format with spaces
   * Example: +40 721 234 567
   */
  public formatInternational(): string {
    // Basic formatting - group by 3
    const parts: string[] = [];
    let remaining = this.nationalNumber;

    while (remaining.length > 0) {
      parts.push(remaining.slice(0, 3));
      remaining = remaining.slice(3);
    }

    return `+${this.countryCode} ${parts.join(' ')}`;
  }

  /**
   * Format in national format
   * Example: 0721 234 567
   */
  public formatNational(): string {
    const parts: string[] = [];
    let remaining = this.nationalNumber;

    while (remaining.length > 0) {
      parts.push(remaining.slice(0, 3));
      remaining = remaining.slice(3);
    }

    return `0${parts.join(' ')}`;
  }

  /**
   * Format for display (masked for privacy)
   * Example: +40 721 *** 567
   */
  public formatMasked(): string {
    const len = this.nationalNumber.length;
    if (len <= 4) {
      return this.formatInternational();
    }

    const prefix = this.nationalNumber.slice(0, 3);
    const suffix = this.nationalNumber.slice(-3);
    const masked = '*'.repeat(len - 6);

    return `+${this.countryCode} ${prefix} ${masked} ${suffix}`;
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: PhoneNumber): boolean {
    return this.e164 === other.e164;
  }

  /**
   * Check if same region
   */
  public sameRegion(other: PhoneNumber): boolean {
    return this.region === other.region;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object
   */
  public toJSON(): PhoneNumberDTO {
    return {
      e164: this.e164,
      region: this.region,
      countryCode: this.countryCode,
      nationalNumber: this.nationalNumber,
      phoneType: this.phoneType,
    };
  }

  /**
   * Convert to primitive (E.164 string)
   */
  public toPrimitive(): string {
    return this.e164;
  }

  /**
   * String representation
   */
  public toString(): string {
    return this.e164;
  }
}

// ============================================================================
// VALIDATION RULES BY REGION
// ============================================================================

const REGION_VALIDATION_RULES: Record<
  PhoneRegion,
  {
    minLength: number;
    maxLength: number;
    pattern?: RegExp;
    mobilePattern?: RegExp;
    landlinePattern?: RegExp;
  }
> = {
  RO: {
    minLength: 9,
    maxLength: 9,
    pattern: /^[2-9]\d{8}$/,
    mobilePattern: /^7\d{8}$/,
    landlinePattern: /^[2-3]\d{8}$/,
  },
  DE: {
    minLength: 10,
    maxLength: 11,
    pattern: /^[1-9]\d{9,10}$/,
    mobilePattern: /^1[567]\d{8,9}$/,
  },
  AT: {
    minLength: 10,
    maxLength: 11,
    pattern: /^[1-9]\d{9,10}$/,
    mobilePattern: /^6\d{9,10}$/,
  },
  CH: {
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    mobilePattern: /^7[6-9]\d{7}$/,
  },
  UK: {
    minLength: 10,
    maxLength: 10,
    pattern: /^[1-9]\d{9}$/,
    mobilePattern: /^7\d{9}$/,
  },
  US: {
    minLength: 10,
    maxLength: 10,
    pattern: /^[2-9]\d{9}$/,
    mobilePattern: /^[2-9]\d{9}$/, // US doesn't distinguish mobile/landline by prefix
  },
  UNKNOWN: {
    minLength: 6,
    maxLength: 12,
  },
};

const REGION_TO_COUNTRY_CODE: Record<PhoneRegion, string> = {
  RO: '40',
  DE: '49',
  AT: '43',
  CH: '41',
  UK: '44',
  US: '1',
  UNKNOWN: '',
};

// Ordered by specificity (longer codes first)
const COUNTRY_CODE_TO_REGION: [string, PhoneRegion][] = [
  ['40', 'RO'],
  ['49', 'DE'],
  ['43', 'AT'],
  ['44', 'UK'],
  ['41', 'CH'],
  ['1', 'US'],
];

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid PhoneNumber
 */
export class InvalidPhoneNumberError extends Error {
  public readonly code = 'INVALID_PHONE_NUMBER' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneNumberError';
    Object.setPrototypeOf(this, InvalidPhoneNumberError.prototype);
  }
}

/**
 * DTO for PhoneNumber serialization
 */
export interface PhoneNumberDTO {
  e164: string;
  region: PhoneRegion;
  countryCode: string;
  nationalNumber: string;
  phoneType: PhoneType;
}

/**
 * Parse result type
 */
export type PhoneNumberParseResult =
  | { success: true; value: PhoneNumber }
  | { success: false; error: string };
