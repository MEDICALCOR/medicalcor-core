/**
 * Domain Types - State-of-the-Art TypeScript Foundation
 *
 * This module establishes the type-level foundation for the domain layer.
 * Implements cutting-edge TypeScript patterns.
 *
 * Key Features:
 * - Branded types for compile-time safety
 * - Result types for explicit error handling
 * - Const assertions for exhaustive checking
 * - Template literal types for string manipulation
 * - Discriminated unions for state machines
 *
 * @module domain/types
 */

import { z } from 'zod';

// ============================================================================
// BRANDED TYPES - Nominal typing for domain entities
// ============================================================================

/**
 * Brand type for nominal typing
 */
declare const __brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

// ============================================================================
// RESULT TYPE - Functional error handling
// ============================================================================

/**
 * Result type for explicit error handling
 */
export type Result<T, E> = OkResult<T> | ErrResult<E>;

interface OkResult<T> {
  readonly isOk: true;
  readonly isErr: false;
  readonly value: T;
  readonly error?: never;
}

interface ErrResult<E> {
  readonly isOk: false;
  readonly isErr: true;
  readonly value?: never;
  readonly error: E;
}

/**
 * Create an Ok result
 */
export function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, isErr: false, value };
}

/**
 * Create an Err result
 */
export function Err<E>(error: E): Result<never, E> {
  return { isOk: false, isErr: true, error };
}

/**
 * Async result type
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;

// ============================================================================
// OPTION TYPE - Null-safe value handling
// ============================================================================

/**
 * Option type for null-safe value handling
 */
export type Option<T> = SomeOption<T> | NoneOption;

interface SomeOption<T> {
  readonly isSome: true;
  readonly isNone: false;
  readonly value: T;
}

interface NoneOption {
  readonly isSome: false;
  readonly isNone: true;
  readonly value?: never;
}

/**
 * Create a Some option
 */
export function Some<T>(value: T): Option<T> {
  return { isSome: true, isNone: false, value };
}

/**
 * Create a None option
 */
export function None<T = never>(): Option<T> {
  return { isSome: false, isNone: true };
}

// ============================================================================
// BRANDED IDENTIFIERS - Nominal typing for domain entities
// ============================================================================

/**
 * Consent record identifier
 * Format: cns_{timestamp}_{random}
 */
export type ConsentId = Brand<string, 'ConsentId'>;

/**
 * Contact identifier (HubSpot or internal)
 */
export type ContactId = Brand<string, 'ContactId'>;

/**
 * Phone number in E.164 format
 */
export type E164Phone = Brand<string, 'E164Phone'>;

/**
 * Audit entry identifier
 */
export type AuditId = Brand<string, 'AuditId'>;

/**
 * Time slot identifier
 */
export type TimeSlotId = Brand<string, 'TimeSlotId'>;

/**
 * Appointment identifier
 */
export type AppointmentId = Brand<string, 'AppointmentId'>;

/**
 * Booking confirmation code
 */
export type ConfirmationCode = Brand<string, 'ConfirmationCode'>;

/**
 * ISO 8601 timestamp string
 */
export type ISOTimestamp = Brand<string, 'ISOTimestamp'>;

// ============================================================================
// BRANDED TYPE CONSTRUCTORS - Runtime validation with type narrowing
// ============================================================================

const CONSENT_ID_PATTERN = /^cns_\d+_[a-f0-9]+$/;
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/**
 * Create a ConsentId with validation
 */
export function createConsentId(value: string): Option<ConsentId> {
  return CONSENT_ID_PATTERN.test(value) ? Some(value as ConsentId) : None();
}

/**
 * Create a ConsentId without validation (for internal use)
 */
export function unsafeConsentId(value: string): ConsentId {
  return value as ConsentId;
}

/**
 * Create a ContactId
 */
export function createContactId(value: string): ContactId {
  return value as ContactId;
}

/**
 * Create an E164Phone with validation
 */
export function createE164Phone(value: string): Option<E164Phone> {
  return E164_PATTERN.test(value) ? Some(value as E164Phone) : None();
}

/**
 * Create an E164Phone without validation
 */
export function unsafeE164Phone(value: string): E164Phone {
  return value as E164Phone;
}

/**
 * Create an ISOTimestamp
 */
export function createISOTimestamp(value: string): Option<ISOTimestamp> {
  return ISO_TIMESTAMP_PATTERN.test(value) ? Some(value as ISOTimestamp) : None();
}

/**
 * Create ISOTimestamp from current time
 */
export function nowTimestamp(): ISOTimestamp {
  return new Date().toISOString() as ISOTimestamp;
}

/**
 * Create ISOTimestamp from Date
 */
export function dateToTimestamp(date: Date): ISOTimestamp {
  return date.toISOString() as ISOTimestamp;
}

/**
 * Create a TimeSlotId
 */
export function createTimeSlotId(value: string): TimeSlotId {
  return value as TimeSlotId;
}

/**
 * Create an AppointmentId
 */
export function createAppointmentId(value: string): AppointmentId {
  return value as AppointmentId;
}

/**
 * Create an AuditId
 */
export function createAuditId(value: string): AuditId {
  return value as AuditId;
}

// ============================================================================
// CONST LITERALS - Exhaustive type checking with as const
// ============================================================================

/**
 * All supported consent types - GDPR compliant
 */
export const CONSENT_TYPES = [
  'data_processing',
  'marketing_whatsapp',
  'marketing_email',
  'marketing_sms',
  'appointment_reminders',
  'treatment_updates',
  'third_party_sharing',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

/**
 * All consent statuses
 */
export const CONSENT_STATUSES = ['granted', 'denied', 'withdrawn', 'pending'] as const;

export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/**
 * Consent source channels
 */
export const CONSENT_CHANNELS = ['whatsapp', 'web', 'phone', 'in_person', 'email'] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/**
 * Consent collection methods
 */
export const CONSENT_METHODS = ['explicit', 'implicit', 'double_opt_in'] as const;

export type ConsentMethod = (typeof CONSENT_METHODS)[number];

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = ['ro', 'en', 'de'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Language detection methods
 */
export const DETECTION_METHODS = ['rule_based', 'ai', 'user_preference'] as const;

export type DetectionMethod = (typeof DETECTION_METHODS)[number];

/**
 * Lead score classifications
 */
export const LEAD_CLASSIFICATIONS = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] as const;

export type LeadClassification = (typeof LEAD_CLASSIFICATIONS)[number];

/**
 * Lead channels
 */
export const LEAD_CHANNELS = ['whatsapp', 'voice', 'web', 'email'] as const;

export type LeadChannel = (typeof LEAD_CHANNELS)[number];

/**
 * Urgency levels for triage
 */
export const URGENCY_LEVELS = ['high_priority', 'high', 'normal', 'low'] as const;

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

/**
 * Routing recommendations
 */
export const ROUTING_RECOMMENDATIONS = [
  'next_available_slot',
  'same_day',
  'next_business_day',
  'nurture_sequence',
] as const;

export type RoutingRecommendation = (typeof ROUTING_RECOMMENDATIONS)[number];

/**
 * Audit actions
 */
export const AUDIT_ACTIONS = [
  'created',
  'granted',
  'denied',
  'withdrawn',
  'expired',
  'updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ============================================================================
// ZOD SCHEMAS - Runtime validation with inference
// ============================================================================

/**
 * Consent type schema with runtime validation
 */
export const ConsentTypeSchema = z.enum(CONSENT_TYPES);

/**
 * Consent status schema
 */
export const ConsentStatusSchema = z.enum(CONSENT_STATUSES);

/**
 * Consent channel schema
 */
export const ConsentChannelSchema = z.enum(CONSENT_CHANNELS);

/**
 * Consent method schema
 */
export const ConsentMethodSchema = z.enum(CONSENT_METHODS);

/**
 * Supported language schema
 */
export const SupportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);

/**
 * Lead classification schema
 */
export const LeadClassificationSchema = z.enum(LEAD_CLASSIFICATIONS);

/**
 * Lead channel schema
 */
export const LeadChannelSchema = z.enum(LEAD_CHANNELS);

/**
 * Urgency level schema
 */
export const UrgencyLevelSchema = z.enum(URGENCY_LEVELS);

/**
 * Routing recommendation schema
 */
export const RoutingRecommendationSchema = z.enum(ROUTING_RECOMMENDATIONS);

/**
 * E164 phone number schema
 */
export const E164PhoneSchema = z.string().regex(E164_PATTERN, 'Invalid E.164 phone number');

/**
 * ISO timestamp schema
 */
export const ISOTimestampSchema = z.string().datetime();

// ============================================================================
// DISCRIMINATED UNIONS - Type-safe state machines
// ============================================================================

/**
 * Consent state machine - discriminated union
 */
export type ConsentState =
  | { readonly status: 'pending'; readonly requestedAt: ISOTimestamp }
  | {
      readonly status: 'granted';
      readonly grantedAt: ISOTimestamp;
      readonly expiresAt: ISOTimestamp | null;
    }
  | { readonly status: 'denied'; readonly deniedAt: ISOTimestamp; readonly reason: string | null }
  | {
      readonly status: 'withdrawn';
      readonly withdrawnAt: ISOTimestamp;
      readonly reason: string | null;
    };

/**
 * Type guard for granted consent
 */
export function isGrantedConsent(
  state: ConsentState
): state is Extract<ConsentState, { status: 'granted' }> {
  return state.status === 'granted';
}

/**
 * Type guard for active consent (granted and not expired)
 */
export function isActiveConsent(state: ConsentState): boolean {
  if (!isGrantedConsent(state)) return false;
  if (!state.expiresAt) return true;
  return new Date(state.expiresAt) > new Date();
}

// ============================================================================
// DOMAIN ERROR TYPES - Typed error handling
// ============================================================================

/**
 * Domain error codes - exhaustive enumeration
 */
export const DOMAIN_ERROR_CODES = {
  // Consent errors
  CONSENT_NOT_FOUND: 'CONSENT_NOT_FOUND',
  CONSENT_ALREADY_WITHDRAWN: 'CONSENT_ALREADY_WITHDRAWN',
  CONSENT_EXPIRED: 'CONSENT_EXPIRED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  INVALID_CONSENT_TYPE: 'INVALID_CONSENT_TYPE',

  // Scheduling errors
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  SLOT_ALREADY_BOOKED: 'SLOT_ALREADY_BOOKED',
  SLOT_IN_PAST: 'SLOT_IN_PAST',
  BOOKING_FAILED: 'BOOKING_FAILED',

  // Language errors
  LANGUAGE_DETECTION_FAILED: 'LANGUAGE_DETECTION_FAILED',
  UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE',

  // Scoring errors
  SCORING_FAILED: 'SCORING_FAILED',
  AI_SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  INVALID_SCORE: 'INVALID_SCORE',

  // Triage errors
  TRIAGE_FAILED: 'TRIAGE_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Repository errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  REPOSITORY_NOT_CONFIGURED: 'REPOSITORY_NOT_CONFIGURED',
} as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

/**
 * Domain error - structured error with code and metadata
 */
export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Create a domain error
 */
export function createDomainError(
  code: DomainErrorCode,
  message: string,
  options?: { cause?: unknown; metadata?: Record<string, unknown> }
): DomainError {
  return Object.freeze({
    code,
    message,
    ...(options?.cause !== undefined && { cause: options.cause }),
    ...(options?.metadata !== undefined && { metadata: options.metadata }),
  });
}

/**
 * Type alias for domain Result
 */
export type DomainResult<T> = Result<T, DomainError>;

/**
 * Type alias for async domain Result
 */
export type AsyncDomainResult<T> = Promise<Result<T, DomainError>>;

// ============================================================================
// TEMPLATE LITERAL TYPES - Compile-time string manipulation
// ============================================================================

/**
 * Consent key format: {contactId}:{consentType}
 */
export type ConsentKey = `${string}:${ConsentType}`;

/**
 * Create a consent key
 */
export function createConsentKey(contactId: ContactId, consentType: ConsentType): ConsentKey {
  return `${contactId}:${consentType}` as ConsentKey;
}

/**
 * Parse a consent key
 */
export function parseConsentKey(key: ConsentKey): {
  contactId: ContactId;
  consentType: ConsentType;
} {
  const [contactId, consentType] = key.split(':') as [string, ConsentType];
  return { contactId: createContactId(contactId), consentType };
}

/**
 * Symptom flag format
 */
export type SymptomFlag = `symptom:${string}`;

/**
 * Create a symptom flag
 */
export function createSymptomFlag(symptom: string): SymptomFlag {
  return `symptom:${symptom.replace(/\s+/g, '_')}`;
}

// ============================================================================
// UTILITY TYPES - Advanced type manipulation
// ============================================================================

/**
 * Make specific keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make all properties readonly recursively
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * Extract the Ok type from a Result
 */
export type UnwrapOk<T> = T extends Result<infer U, unknown> ? U : never;

/**
 * Extract the Err type from a Result
 */
export type UnwrapErr<T> = T extends Result<unknown, infer E> ? E : never;

/**
 * Merge two object types with the second overriding the first
 */
export type Merge<T, U> = Omit<T, keyof U> & U;

// ============================================================================
// VALIDATION HELPERS - Zod-based parsing with Result
// ============================================================================

/**
 * Parse with Zod schema and return Result
 */
export function parseSchema<T extends z.ZodType>(
  schema: T,
  data: unknown
): Result<z.infer<T>, DomainError> {
  const result = schema.safeParse(data);
  if (result.success) {
    return Ok(result.data);
  }
  return Err(
    createDomainError(DOMAIN_ERROR_CODES.INVALID_INPUT, result.error.message, {
      metadata: { issues: result.error.issues },
    })
  );
}

/**
 * Parse with Zod schema, throwing on failure
 */
export function parseSchemaOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Zod's parse returns any in generic context
  return schema.parse(data);
}

// ============================================================================
// TYPE ASSERTIONS - For when you KNOW the value is valid
// ============================================================================

/**
 * Assert value is a ConsentType
 */
export function assertConsentType(value: unknown): asserts value is ConsentType {
  if (!CONSENT_TYPES.includes(value as ConsentType)) {
    throw new Error(`Invalid consent type: ${String(value)}`);
  }
}

/**
 * Assert value is a ConsentStatus
 */
export function assertConsentStatus(value: unknown): asserts value is ConsentStatus {
  if (!CONSENT_STATUSES.includes(value as ConsentStatus)) {
    throw new Error(`Invalid consent status: ${String(value)}`);
  }
}

/**
 * Assert value is a SupportedLanguage
 */
export function assertSupportedLanguage(value: unknown): asserts value is SupportedLanguage {
  if (!SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
    throw new Error(`Unsupported language: ${String(value)}`);
  }
}

/**
 * Assert value is a LeadClassification
 */
export function assertLeadClassification(value: unknown): asserts value is LeadClassification {
  if (!LEAD_CLASSIFICATIONS.includes(value as LeadClassification)) {
    throw new Error(`Invalid lead classification: ${String(value)}`);
  }
}
