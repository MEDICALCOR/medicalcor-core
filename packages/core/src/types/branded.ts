/**
 * Branded Types - Silicon Valley Grade Type Safety
 *
 * Branded types (also known as opaque types or nominal types) prevent
 * accidental misuse of structurally identical types. This is CRITICAL
 * for a medical system where mixing up patient IDs, appointment IDs,
 * or phone numbers could have serious consequences.
 *
 * @example
 * ```ts
 * // These are structurally identical (both strings) but semantically different
 * const patientId = 'patient-123' as PatientId;
 * const appointmentId = 'apt-456' as AppointmentId;
 *
 * // TypeScript will ERROR if you try to use appointmentId where PatientId is expected
 * function getPatient(id: PatientId): Patient { ... }
 * getPatient(appointmentId); // ERROR: Type 'AppointmentId' is not assignable to type 'PatientId'
 * ```
 *
 * @module types/branded
 */

// ============================================================================
// BRAND SYMBOL - The foundation of nominal typing in TypeScript
// ============================================================================

/**
 * Unique symbol used as the brand key.
 * Using a symbol ensures the brand cannot be accidentally matched.
 */
declare const __brand: unique symbol;

/**
 * Brand type that adds a nominal type tag to a base type.
 * The brand is a phantom type - it exists only at compile time.
 *
 * @template T - The base type being branded
 * @template Brand - The unique brand identifier (a string literal)
 */
export type Brand<T, Brand extends string> = T & {
  readonly [__brand]: Brand;
};

/**
 * Flavor is a weaker form of branding that allows implicit conversion
 * FROM the base type TO the branded type, but not vice versa.
 * Useful when you want type hints but don't want to force explicit casting everywhere.
 *
 * @template T - The base type
 * @template FlavorT - The flavor identifier
 */
export type Flavor<T, FlavorT extends string> = T & {
  readonly __flavor?: FlavorT;
};

// ============================================================================
// DOMAIN ID TYPES - Medical CRM Specific
// ============================================================================

/**
 * Patient identifier - unique across the system
 * Format: UUID v4 or HubSpot contact ID
 */
export type PatientId = Brand<string, 'PatientId'>;

/**
 * Lead identifier - phone number in E.164 format or UUID
 */
export type LeadId = Brand<string, 'LeadId'>;

/**
 * Appointment identifier
 */
export type AppointmentId = Brand<string, 'AppointmentId'>;

/**
 * Doctor/Provider identifier
 */
export type DoctorId = Brand<string, 'DoctorId'>;

/**
 * Consent record identifier
 */
export type ConsentId = Brand<string, 'ConsentId'>;

/**
 * Workflow task identifier (Trigger.dev)
 */
export type TaskId = Brand<string, 'TaskId'>;

/**
 * WhatsApp message identifier
 */
export type MessageId = Brand<string, 'MessageId'>;

/**
 * HubSpot contact identifier
 */
export type HubSpotContactId = Brand<string, 'HubSpotContactId'>;

/**
 * Correlation ID for distributed tracing
 */
export type CorrelationId = Brand<string, 'CorrelationId'>;

/**
 * Trace ID for OpenTelemetry
 */
export type TraceId = Brand<string, 'TraceId'>;

/**
 * Span ID for OpenTelemetry
 */
export type SpanId = Brand<string, 'SpanId'>;

/**
 * User ID for authentication
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session ID for authentication
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * Tenant ID for multi-tenancy
 */
export type TenantId = Brand<string, 'TenantId'>;

// ============================================================================
// PHONE NUMBER TYPES
// ============================================================================

/**
 * Phone number in E.164 format (e.g., +40700000001)
 * This is the canonical format for phone numbers in the system.
 */
export type E164PhoneNumber = Brand<string, 'E164PhoneNumber'>;

/**
 * Romanian phone number (starts with +40)
 */
export type RomanianPhoneNumber = Brand<E164PhoneNumber, 'RomanianPhoneNumber'>;

// ============================================================================
// TIMESTAMP TYPES
// ============================================================================

/**
 * ISO 8601 timestamp string
 */
export type ISOTimestamp = Brand<string, 'ISOTimestamp'>;

/**
 * Unix timestamp in milliseconds
 */
export type UnixTimestampMs = Brand<number, 'UnixTimestampMs'>;

/**
 * Unix timestamp in seconds
 */
export type UnixTimestampSec = Brand<number, 'UnixTimestampSec'>;

// ============================================================================
// MEDICAL DOMAIN TYPES
// ============================================================================

/**
 * Lead score on the unified 1-5 scale
 */
export type LeadScore = Brand<number, 'LeadScore'>;

/**
 * Confidence score (0-1)
 */
export type ConfidenceScore = Brand<number, 'ConfidenceScore'>;

/**
 * Romanian Personal Numeric Code (CNP) - 13 digits
 */
export type CNP = Brand<string, 'CNP'>;

/**
 * Email address (validated)
 */
export type EmailAddress = Brand<string, 'EmailAddress'>;

// ============================================================================
// TYPE GUARDS & VALIDATORS
// ============================================================================

/**
 * Validates and creates an E164PhoneNumber.
 * Returns null if validation fails.
 */
export function createE164PhoneNumber(phone: string): E164PhoneNumber | null {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  if (!e164Regex.test(phone)) {
    return null;
  }
  return phone as E164PhoneNumber;
}

/**
 * Validates and creates a RomanianPhoneNumber.
 */
export function createRomanianPhoneNumber(phone: string): RomanianPhoneNumber | null {
  const roRegex = /^\+40\d{9}$/;
  if (!roRegex.test(phone)) {
    return null;
  }
  return phone as RomanianPhoneNumber;
}

/**
 * Creates a PatientId from a string (assumes valid input)
 */
export function createPatientId(id: string): PatientId {
  return id as PatientId;
}

/**
 * Creates a LeadId from a string
 */
export function createLeadId(id: string): LeadId {
  return id as LeadId;
}

/**
 * Creates an AppointmentId from a string
 */
export function createAppointmentId(id: string): AppointmentId {
  return id as AppointmentId;
}

/**
 * Creates a CorrelationId from a string
 */
export function createCorrelationId(id: string): CorrelationId {
  return id as CorrelationId;
}

/**
 * Creates a TraceId from a string
 */
export function createTraceId(id: string): TraceId {
  return id as TraceId;
}

/**
 * Creates a UserId from a string
 */
export function createUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Creates a TaskId from a string
 */
export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

/**
 * Creates an ISOTimestamp from current time
 */
export function createISOTimestamp(): ISOTimestamp {
  return new Date().toISOString() as ISOTimestamp;
}

/**
 * Creates an ISOTimestamp from a Date
 */
export function dateToISOTimestamp(date: Date): ISOTimestamp {
  return date.toISOString() as ISOTimestamp;
}

/**
 * Validates and creates a LeadScore (1-5)
 */
export function createLeadScore(score: number): LeadScore | null {
  if (score < 1 || score > 5 || !Number.isInteger(score)) {
    return null;
  }
  return score as LeadScore;
}

/**
 * Validates and creates a ConfidenceScore (0-1)
 */
export function createConfidenceScore(confidence: number): ConfidenceScore | null {
  if (confidence < 0 || confidence > 1) {
    return null;
  }
  return confidence as ConfidenceScore;
}

/**
 * Validates and creates an EmailAddress
 */
export function createEmailAddress(email: string): EmailAddress | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return null;
  }
  return email as EmailAddress;
}

// ============================================================================
// TYPE ASSERTIONS (for when you KNOW the value is valid)
// ============================================================================

/**
 * Assert functions throw at runtime if the assertion fails.
 * Use these when you have validated the data elsewhere and just need the type.
 */

export function assertPatientId(id: string): asserts id is PatientId {
  if (!id || typeof id !== 'string') {
    throw new Error(`Invalid PatientId: ${id}`);
  }
}

export function assertE164PhoneNumber(phone: string): asserts phone is E164PhoneNumber {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  if (!e164Regex.test(phone)) {
    throw new Error(`Invalid E164 phone number: ${phone}`);
  }
}

export function assertLeadScore(score: number): asserts score is LeadScore {
  if (score < 1 || score > 5 || !Number.isInteger(score)) {
    throw new Error(`Invalid lead score: ${score}. Must be integer 1-5.`);
  }
}

export function assertConfidenceScore(confidence: number): asserts confidence is ConfidenceScore {
  if (confidence < 0 || confidence > 1) {
    throw new Error(`Invalid confidence score: ${confidence}. Must be 0-1.`);
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract the base type from a branded type
 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Make all branded types in an object optional
 */
export type PartialBranded<T> = {
  [K in keyof T]?: T[K] extends Brand<infer U, string> ? U | T[K] : T[K];
};

/**
 * Create a new branded type from an existing one
 */
export type Rebrand<T, NewBrand extends string> =
  T extends Brand<infer U, string> ? Brand<U, NewBrand> : never;
