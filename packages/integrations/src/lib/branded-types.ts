/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     BRANDED TYPES & NOMINAL TYPING                            ║
 * ║                                                                               ║
 * ║  State-of-the-art type system using phantom types for compile-time safety    ║
 * ║  Prevents mixing incompatible IDs and ensures type-level correctness         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// Core Branding Infrastructure
// =============================================================================

/**
 * Phantom type brand symbol - invisible at runtime, enforces types at compile time
 * Uses unique symbol to prevent structural typing from bypassing our brands
 */
declare const __brand: unique symbol;
declare const __flavor: unique symbol;

/**
 * Brand<T, B> - Creates a branded (nominal) type from a base type
 *
 * Unlike structural typing, branded types prevent accidental mixing:
 * ```typescript
 * const hubspotId: HubSpotContactId = '123' as HubSpotContactId;
 * const vapiId: VapiCallId = '123' as VapiCallId;
 *
 * // Type error! Cannot assign HubSpotContactId to VapiCallId
 * const mixedUp: VapiCallId = hubspotId;
 * ```
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/**
 * Flavor<T, F> - Creates a "flavored" type (weaker branding)
 *
 * Flavored types allow assignment from unflavored values but prevent
 * mixing between different flavors. Useful for gradual adoption.
 */
export type Flavor<T, F extends string> = T & { readonly [__flavor]?: F };

/**
 * Unwrap brand to get the underlying type
 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Extract the brand name from a branded type
 */
export type BrandOf<T> = T extends Brand<unknown, infer B> ? B : never;

// =============================================================================
// Integration Service IDs - Nominal Types
// =============================================================================

// HubSpot
export type HubSpotContactId = Brand<string, 'HubSpotContactId'>;
export type HubSpotDealId = Brand<string, 'HubSpotDealId'>;
export type HubSpotTaskId = Brand<string, 'HubSpotTaskId'>;
export type HubSpotOwnerId = Brand<string, 'HubSpotOwnerId'>;
export type HubSpotPortalId = Brand<string, 'HubSpotPortalId'>;

// WhatsApp
export type WhatsAppMessageId = Brand<string, 'WhatsAppMessageId'>;
export type WhatsAppPhoneNumberId = Brand<string, 'WhatsAppPhoneNumberId'>;
export type WhatsAppTemplateId = Brand<string, 'WhatsAppTemplateId'>;
export type WhatsAppConversationId = Brand<string, 'WhatsAppConversationId'>;

// Vapi
export type VapiCallId = Brand<string, 'VapiCallId'>;
export type VapiAssistantId = Brand<string, 'VapiAssistantId'>;
export type VapiTranscriptId = Brand<string, 'VapiTranscriptId'>;
export type VapiPhoneNumberId = Brand<string, 'VapiPhoneNumberId'>;

// Stripe
export type StripeChargeId = Brand<string, 'StripeChargeId'>;
export type StripeCustomerId = Brand<string, 'StripeCustomerId'>;
export type StripePaymentIntentId = Brand<string, 'StripePaymentIntentId'>;
export type StripeWebhookId = Brand<string, 'StripeWebhookId'>;

// Scheduling
export type AppointmentId = Brand<string, 'AppointmentId'>;
export type TimeSlotId = Brand<string, 'TimeSlotId'>;
export type PractitionerId = Brand<string, 'PractitionerId'>;
export type LocationId = Brand<string, 'LocationId'>;

// Embeddings
export type EmbeddingId = Brand<string, 'EmbeddingId'>;
export type ContentHash = Brand<string, 'ContentHash'>;

// CRM Generic
export type ExternalContactId = Brand<string, 'ExternalContactId'>;
export type ExternalDealId = Brand<string, 'ExternalDealId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

// =============================================================================
// Phone Numbers - Special Branded Types with Validation
// =============================================================================

/**
 * E.164 formatted phone number (e.g., +40700000001)
 * International format with country code
 */
export type E164PhoneNumber = Brand<string, 'E164PhoneNumber'>;

/**
 * Normalized phone number without + prefix (e.g., 40700000001)
 * Format used by WhatsApp API
 */
export type NormalizedPhoneNumber = Brand<string, 'NormalizedPhoneNumber'>;

/**
 * Raw phone number input (not yet validated/normalized)
 */
export type RawPhoneNumber = Flavor<string, 'RawPhoneNumber'>;

// =============================================================================
// Currency & Money - Phantom Types for Units
// =============================================================================

/**
 * Amount in smallest currency unit (cents, bani, etc.)
 * Prevents mixing with major units
 */
export type MinorCurrencyAmount = Brand<number, 'MinorCurrencyAmount'>;

/**
 * Amount in major currency unit (dollars, RON, etc.)
 */
export type MajorCurrencyAmount = Brand<number, 'MajorCurrencyAmount'>;

/**
 * ISO 4217 currency code (EUR, RON, USD, etc.)
 */
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

// =============================================================================
// Timestamps - Distinct Types for Different Time Representations
// =============================================================================

/**
 * Unix timestamp in seconds (Stripe, many APIs)
 */
export type UnixTimestampSeconds = Brand<number, 'UnixTimestampSeconds'>;

/**
 * Unix timestamp in milliseconds (JavaScript Date.now())
 */
export type UnixTimestampMs = Brand<number, 'UnixTimestampMs'>;

/**
 * ISO 8601 date-time string
 */
export type ISODateTime = Brand<string, 'ISODateTime'>;

/**
 * ISO 8601 date only (YYYY-MM-DD)
 */
export type ISODate = Brand<string, 'ISODate'>;

/**
 * Time string (HH:mm format)
 */
export type TimeString = Brand<string, 'TimeString'>;

// =============================================================================
// API Keys & Secrets - Sensitive Data Markers
// =============================================================================

/**
 * Sensitive API key - should never be logged
 */
export type SecretApiKey = Brand<string, 'SecretApiKey'>;

/**
 * Webhook secret for signature verification
 */
export type WebhookSecret = Brand<string, 'WebhookSecret'>;

/**
 * HMAC signature
 */
export type HMACSignature = Brand<string, 'HMACSignature'>;

// =============================================================================
// Content Types
// =============================================================================

/**
 * Sanitized user input (safe from injection)
 */
export type SanitizedInput = Brand<string, 'SanitizedInput'>;

/**
 * JSON string (validated JSON)
 */
export type JSONString = Brand<string, 'JSONString'>;

/**
 * Base64 encoded string
 */
export type Base64String = Brand<string, 'Base64String'>;

// =============================================================================
// Smart Constructors - Runtime Validation with Type Refinement
// =============================================================================

/**
 * ValidationError for smart constructor failures
 */
export class BrandValidationError extends Error {
  constructor(
    public readonly brand: string,
    public readonly value: unknown,
    public readonly reason: string
  ) {
    super(`Invalid ${brand}: ${reason}`);
    this.name = 'BrandValidationError';
  }
}

/**
 * Smart constructor result type
 */
export type BrandResult<T> =
  | { success: true; value: T }
  | { success: false; error: BrandValidationError };

/**
 * Create HubSpot Contact ID with validation
 */
export function hubSpotContactId(value: string): BrandResult<HubSpotContactId> {
  if (!value || value.trim() === '') {
    return {
      success: false,
      error: new BrandValidationError('HubSpotContactId', value, 'ID cannot be empty'),
    };
  }
  // HubSpot IDs are numeric strings
  if (!/^\d+$/.test(value)) {
    return {
      success: false,
      error: new BrandValidationError('HubSpotContactId', value, 'ID must be numeric'),
    };
  }
  return { success: true, value: value as HubSpotContactId };
}

/**
 * Create Vapi Call ID with validation
 */
export function vapiCallId(value: string): BrandResult<VapiCallId> {
  if (!value || value.trim() === '') {
    return {
      success: false,
      error: new BrandValidationError('VapiCallId', value, 'ID cannot be empty'),
    };
  }
  // Vapi uses UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    return {
      success: false,
      error: new BrandValidationError('VapiCallId', value, 'ID must be a valid UUID'),
    };
  }
  return { success: true, value: value as VapiCallId };
}

/**
 * Create E.164 phone number with validation
 */
export function e164PhoneNumber(value: string): BrandResult<E164PhoneNumber> {
  // E.164 format: +[country code][subscriber number]
  // Length: 8-15 digits after +
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  if (!e164Regex.test(value)) {
    return {
      success: false,
      error: new BrandValidationError(
        'E164PhoneNumber',
        value,
        'Must be in E.164 format (+[country code][number])'
      ),
    };
  }
  return { success: true, value: value as E164PhoneNumber };
}

/**
 * Create normalized phone number (WhatsApp format)
 */
export function normalizedPhoneNumber(value: string): BrandResult<NormalizedPhoneNumber> {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 15) {
    return {
      success: false,
      error: new BrandValidationError(
        'NormalizedPhoneNumber',
        value,
        'Phone number must have 10-15 digits'
      ),
    };
  }
  return { success: true, value: digits as NormalizedPhoneNumber };
}

/**
 * Create ISO date string with validation
 */
export function isoDate(value: string): BrandResult<ISODate> {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(value)) {
    return {
      success: false,
      error: new BrandValidationError('ISODate', value, 'Must be in YYYY-MM-DD format'),
    };
  }
  // Validate it's a real date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return {
      success: false,
      error: new BrandValidationError('ISODate', value, 'Invalid date'),
    };
  }
  return { success: true, value: value as ISODate };
}

/**
 * Create ISO datetime string with validation
 */
export function isoDateTime(value: string | Date): BrandResult<ISODateTime> {
  const str = value instanceof Date ? value.toISOString() : value;
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    return {
      success: false,
      error: new BrandValidationError('ISODateTime', str, 'Invalid datetime'),
    };
  }
  return { success: true, value: date.toISOString() as ISODateTime };
}

/**
 * Create time string with validation
 */
export function timeString(value: string): BrandResult<TimeString> {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(value)) {
    return {
      success: false,
      error: new BrandValidationError('TimeString', value, 'Must be in HH:mm format'),
    };
  }
  return { success: true, value: value as TimeString };
}

/**
 * Create currency code with validation
 */
export function currencyCode(value: string): BrandResult<CurrencyCode> {
  const upperValue = value.toUpperCase();
  // Common currency codes
  const validCodes = new Set([
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
  ]);
  if (!validCodes.has(upperValue)) {
    return {
      success: false,
      error: new BrandValidationError('CurrencyCode', value, 'Unsupported currency code'),
    };
  }
  return { success: true, value: upperValue as CurrencyCode };
}

/**
 * Create minor currency amount from major units
 */
export function toMinorUnits(
  majorAmount: number,
  _currency: CurrencyCode = 'EUR' as CurrencyCode
): MinorCurrencyAmount {
  // Most currencies use 100 subunits per unit
  return Math.round(majorAmount * 100) as MinorCurrencyAmount;
}

/**
 * Convert minor units to major units
 */
export function toMajorUnits(
  minorAmount: MinorCurrencyAmount,
  _currency: CurrencyCode = 'EUR' as CurrencyCode
): MajorCurrencyAmount {
  return (minorAmount / 100) as MajorCurrencyAmount;
}

/**
 * Create correlation ID (UUID v4)
 */
export function correlationId(value?: string): CorrelationId {
  if (value) {
    return value as CorrelationId;
  }
  // Generate UUID v4 using global crypto
  // Type-safe access to crypto API
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj && 'randomUUID' in cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return (cryptoObj.randomUUID() as string) as CorrelationId;
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}` as CorrelationId;
}

/**
 * Create content hash from string
 * Uses DJB2 algorithm (fast, sync, works in all environments)
 */
export function contentHash(content: string): ContentHash {
  // Simple hash using DJB2 algorithm
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') as ContentHash;
}

// =============================================================================
// Unsafe Constructors - For Trusted Data Only
// =============================================================================

/**
 * Namespace for unsafe (unchecked) brand constructors
 * Use only when data has already been validated externally
 */
export const unsafe = {
  hubSpotContactId: (value: string) => value as HubSpotContactId,
  hubSpotDealId: (value: string) => value as HubSpotDealId,
  hubSpotTaskId: (value: string) => value as HubSpotTaskId,
  hubSpotOwnerId: (value: string) => value as HubSpotOwnerId,

  whatsAppMessageId: (value: string) => value as WhatsAppMessageId,
  whatsAppPhoneNumberId: (value: string) => value as WhatsAppPhoneNumberId,
  whatsAppTemplateId: (value: string) => value as WhatsAppTemplateId,

  vapiCallId: (value: string) => value as VapiCallId,
  vapiAssistantId: (value: string) => value as VapiAssistantId,

  stripeChargeId: (value: string) => value as StripeChargeId,
  stripeCustomerId: (value: string) => value as StripeCustomerId,
  stripePaymentIntentId: (value: string) => value as StripePaymentIntentId,

  appointmentId: (value: string) => value as AppointmentId,
  timeSlotId: (value: string) => value as TimeSlotId,
  practitionerId: (value: string) => value as PractitionerId,
  locationId: (value: string) => value as LocationId,

  embeddingId: (value: string) => value as EmbeddingId,
  externalContactId: (value: string) => value as ExternalContactId,
  externalDealId: (value: string) => value as ExternalDealId,

  e164PhoneNumber: (value: string) => value as E164PhoneNumber,
  normalizedPhoneNumber: (value: string) => value as NormalizedPhoneNumber,

  isoDate: (value: string) => value as ISODate,
  isoDateTime: (value: string) => value as ISODateTime,
  timeString: (value: string) => value as TimeString,

  unixTimestampSeconds: (value: number) => value as UnixTimestampSeconds,
  unixTimestampMs: (value: number) => value as UnixTimestampMs,

  minorCurrencyAmount: (value: number) => value as MinorCurrencyAmount,
  majorCurrencyAmount: (value: number) => value as MajorCurrencyAmount,
  currencyCode: (value: string) => value as CurrencyCode,

  secretApiKey: (value: string) => value as SecretApiKey,
  webhookSecret: (value: string) => value as WebhookSecret,

  sanitizedInput: (value: string) => value as SanitizedInput,
  jsonString: (value: string) => value as JSONString,
  correlationId: (value: string) => value as CorrelationId,
  contentHash: (value: string) => value as ContentHash,
} as const;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a branded type of a specific brand
 */
export function isBranded<T, B extends string>(
  value: unknown,
  _brand: B
): value is Brand<T, B> {
  // At runtime, branded types are just their underlying type
  // This guard just checks the underlying type
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Assert a value is a specific branded type (throws on failure)
 */
export function assertBrand<T, B extends string>(
  value: unknown,
  brand: B,
  validator: (v: unknown) => boolean
): asserts value is Brand<T, B> {
  if (!validator(value)) {
    throw new BrandValidationError(brand, value, 'Assertion failed');
  }
}
