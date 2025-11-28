/**
 * @fileoverview Type Guards and Assertion Functions
 *
 * Provides comprehensive runtime type checking with TypeScript type narrowing:
 * - Type guards for primitives and objects
 * - Domain-specific guards
 * - Assertion functions with custom errors
 * - Refinement types
 * - Validation utilities
 *
 * @module @medicalcor/types/guards
 * @version 2.0.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-function-type -- Function type needed for generic predicate guards */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- runtime type checks require any handling */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- type parameters are intentional for generic type guards */

import type { z, ZodSchema, ZodError } from 'zod';
import type { Result } from './result.js';
import { Ok, Err } from './result.js';

// =============================================================================
// PRIMITIVE TYPE GUARDS
// =============================================================================

/**
 * Type guard for string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard for finite number
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Type guard for integer
 */
export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Type guard for positive number
 */
export function isPositive(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard for non-negative number
 */
export function isNonNegative(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * Type guard for boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for bigint
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Type guard for symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/**
 * Type guard for function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Type guard for undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Type guard for null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Type guard for null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  // eslint-disable-next-line eqeqeq -- intentional: == null checks both null and undefined
  return value == null;
}

/**
 * Type guard for non-nullish values
 */
export function isNonNullish<T>(value: T): value is NonNullable<T> {
  // eslint-disable-next-line eqeqeq -- intentional: != null checks both null and undefined
  return value != null;
}

// =============================================================================
// OBJECT TYPE GUARDS
// =============================================================================

/**
 * Type guard for object (excludes null)
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for plain object (not array, not class instance)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Type guard for array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard for typed array
 */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return isArray(value) && value.every(guard);
}

/**
 * Type guard for non-empty array
 */
export function isNonEmptyArray<T>(value: T[]): value is [T, ...T[]] {
  return value.length > 0;
}

/**
 * Type guard for Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Type guard for Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard for Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    value instanceof Promise ||
    (isObject(value) &&
      isFunction((value as { then?: unknown }).then) &&
      isFunction((value as { catch?: unknown }).catch))
  );
}

/**
 * Type guard for Map
 */
export function isMap<K = unknown, V = unknown>(value: unknown): value is Map<K, V> {
  return value instanceof Map;
}

/**
 * Type guard for Set
 */
export function isSet<T = unknown>(value: unknown): value is Set<T> {
  return value instanceof Set;
}

/**
 * Type guard for RegExp
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

// =============================================================================
// STRING FORMAT GUARDS
// =============================================================================

/**
 * Type guard for non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/**
 * Type guard for trimmed non-empty string
 */
export function isTrimmedNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * UUID regex pattern
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Type guard for UUID
 */
export function isUUID(value: unknown): value is string {
  return isString(value) && UUID_REGEX.test(value);
}

/**
 * E.164 phone number regex
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Type guard for E.164 phone number
 */
export function isE164Phone(value: unknown): value is string {
  return isString(value) && E164_REGEX.test(value);
}

/**
 * Romanian phone number regex
 */
const RO_PHONE_REGEX = /^(\+40|0)[0-9]{9}$/;

/**
 * Type guard for Romanian phone number
 */
export function isRomanianPhone(value: unknown): value is string {
  return isString(value) && RO_PHONE_REGEX.test(value);
}

/**
 * Email regex (basic)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Type guard for email
 */
export function isEmail(value: unknown): value is string {
  return isString(value) && EMAIL_REGEX.test(value);
}

/**
 * URL regex
 */
const URL_REGEX = /^https?:\/\/.+/;

/**
 * URL validation regex
 */
const FULL_URL_REGEX =
  /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?(\?[^\s#]*)?(#[^\s]*)?$/i;

/**
 * Type guard for URL
 */
export function isURL(value: unknown): value is string {
  if (!isString(value)) return false;
  return URL_REGEX.test(value) && FULL_URL_REGEX.test(value);
}

/**
 * Type guard for HTTPS URL
 */
export function isHTTPSUrl(value: unknown): value is string {
  return isString(value) && value.startsWith('https://') && isURL(value);
}

/**
 * ISO 8601 date string regex
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Type guard for ISO 8601 date string
 */
export function isISODateString(value: unknown): value is string {
  return isString(value) && ISO_DATE_REGEX.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Type guard for JSON string
 */
export function isJSONString(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// DOMAIN TYPE GUARDS
// =============================================================================

/**
 * Lead source values
 */
const LEAD_SOURCES = [
  'whatsapp',
  'voice',
  'web_form',
  'web',
  'hubspot',
  'facebook',
  'google',
  'referral',
  'manual',
] as const;
type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * Type guard for lead source
 */
export function isLeadSource(value: unknown): value is LeadSource {
  return isString(value) && (LEAD_SOURCES as readonly string[]).includes(value);
}

/**
 * Lead status values
 */
const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'nurturing',
  'scheduled',
  'converted',
  'lost',
  'invalid',
] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Type guard for lead status
 */
export function isLeadStatus(value: unknown): value is LeadStatus {
  return isString(value) && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Lead priority values
 */
const LEAD_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
type LeadPriority = (typeof LEAD_PRIORITIES)[number];

/**
 * Type guard for lead priority
 */
export function isLeadPriority(value: unknown): value is LeadPriority {
  return isString(value) && (LEAD_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Lead score values
 */
const LEAD_SCORES = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] as const;
type LeadScore = (typeof LEAD_SCORES)[number];

/**
 * Type guard for lead score
 */
export function isLeadScore(value: unknown): value is LeadScore {
  return isString(value) && (LEAD_SCORES as readonly string[]).includes(value);
}

/**
 * AI score range (1-5)
 */
export function isAIScore(value: unknown): value is number {
  return isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Confidence score (0-1)
 */
export function isConfidence(value: unknown): value is number {
  return isNumber(value) && value >= 0 && value <= 1;
}

// =============================================================================
// DISCRIMINATED UNION GUARDS
// =============================================================================

/**
 * Creates a type guard for a discriminated union variant
 *
 * @example
 * const isLeadCreatedEvent = hasTag('type', 'lead.created');
 * if (isLeadCreatedEvent(event)) {
 *   console.log(event.payload.phone);
 * }
 */
export function hasTag<K extends string, V extends string>(
  key: K,
  value: V
): <T extends Record<K, string>>(obj: T) => obj is Extract<T, Record<K, V>> {
  return (obj): obj is Extract<typeof obj, Record<K, V>> => {
    return isObject(obj) && key in obj && (obj as Record<K, unknown>)[key] === value;
  };
}

/**
 * Creates a type guard that checks for a specific _tag value
 */
export function isTagged<TTag extends string>(
  tag: TTag
): <T extends { _tag: string }>(value: T) => value is Extract<T, { _tag: TTag }> {
  return hasTag('_tag', tag);
}

/**
 * Checks if an object has all required keys
 */
export function hasKeys<K extends string>(
  value: unknown,
  ...keys: K[]
): value is Record<K, unknown> {
  if (!isObject(value)) return false;
  return keys.every((key) => key in value);
}

/**
 * Checks if an object has a specific key with a specific type
 */
export function hasKeyOfType<K extends string, T>(
  value: unknown,
  key: K,
  guard: (v: unknown) => v is T
): value is Record<K, T> {
  return isObject(value) && key in value && guard((value as Record<K, unknown>)[key]);
}

// =============================================================================
// ASSERTION FUNCTIONS
// =============================================================================

/**
 * Base assertion error
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Asserts that a condition is true
 */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message ?? 'Assertion failed');
  }
}

/**
 * Asserts that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
  // eslint-disable-next-line eqeqeq -- intentional: == null checks both null and undefined
  if (value == null) {
    throw new AssertionError(message ?? 'Value is null or undefined', value);
  }
}

/**
 * Asserts that a value is a string
 */
export function assertString(value: unknown, message?: string): asserts value is string {
  if (!isString(value)) {
    throw new AssertionError(message ?? `Expected string, got ${typeof value}`, value);
  }
}

/**
 * Asserts that a value is a number
 */
export function assertNumber(value: unknown, message?: string): asserts value is number {
  if (!isNumber(value)) {
    throw new AssertionError(message ?? `Expected number, got ${typeof value}`, value);
  }
}

/**
 * Asserts that a value is an object
 */
export function assertObject(value: unknown, message?: string): asserts value is object {
  if (!isObject(value)) {
    throw new AssertionError(message ?? `Expected object, got ${typeof value}`, value);
  }
}

/**
 * Asserts that a value is an array
 */
export function assertArray(value: unknown, message?: string): asserts value is unknown[] {
  if (!isArray(value)) {
    throw new AssertionError(message ?? `Expected array, got ${typeof value}`, value);
  }
}

/**
 * Asserts that a value matches a Zod schema
 */
export function assertSchema<T>(
  value: unknown,
  schema: ZodSchema<T>,
  message?: string
): asserts value is T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AssertionError(message ?? `Schema validation failed: ${result.error.message}`, value);
  }
}

/**
 * Asserts that a value is never reached (exhaustiveness check)
 */
export function assertNever(value: never, message?: string): never {
  throw new AssertionError(message ?? `Unexpected value: ${JSON.stringify(value)}`, value);
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validation error with details
 */
export interface ValidationError {
  path: (string | number)[];
  message: string;
  code: string;
}

/**
 * Validation result
 */
export type ValidationResult<T> = Result<T, ValidationError[]>;

/**
 * Validates a value against a Zod schema
 */
export function validate<T>(value: unknown, schema: ZodSchema<T>): ValidationResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return Ok(result.data);
  }
  return Err(formatZodError(result.error));
}

/**
 * Formats a Zod error into validation errors
 */
export function formatZodError(error: ZodError): ValidationError[] {
  return error.errors.map((issue: z.ZodIssue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Creates a validator function from a Zod schema
 */
export function createValidator<T>(schema: ZodSchema<T>): (value: unknown) => ValidationResult<T> {
  return (value) => validate(value, schema);
}

/**
 * Creates a type guard from a Zod schema
 */
export function createGuard<T>(schema: ZodSchema<T>): (value: unknown) => value is T {
  return (value): value is T => schema.safeParse(value).success;
}

/**
 * Creates an assertion from a Zod schema
 */
export function createAssertion<T>(
  schema: ZodSchema<T>,
  errorMessage?: string
): (value: unknown) => asserts value is T {
  return (value): asserts value is T => {
    assertSchema(value, schema, errorMessage);
  };
}

// =============================================================================
// REFINEMENT TYPES
// =============================================================================

/**
 * Creates a refinement type with runtime validation
 */
export function refine<T, S extends T>(
  guard: (value: T) => value is S,
  value: T,
  message?: string
): S {
  if (!guard(value)) {
    throw new AssertionError(message ?? 'Refinement failed', value);
  }
  return value;
}

/**
 * Creates a refinement from a predicate
 */
export function refineWith<T>(predicate: (value: T) => boolean, value: T, message?: string): T {
  if (!predicate(value)) {
    throw new AssertionError(message ?? 'Refinement failed', value);
  }
  return value;
}

/**
 * Narrowing helper - filters array to specific type
 */
export function narrow<T, S extends T>(array: T[], guard: (value: T) => value is S): S[] {
  return array.filter(guard);
}

/**
 * Safe property access with type narrowing
 */
export function getProperty<T, K extends keyof T>(
  obj: T | null | undefined,
  key: K
): T[K] | undefined {
  return obj?.[key];
}

/**
 * Safe nested property access
 */
export function getNestedProperty<T>(obj: unknown, path: string): T | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (!isObject(current) || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current as T;
}

// =============================================================================
// TYPE-SAFE PARSERS
// =============================================================================

/**
 * Safely parses JSON with type inference
 */
export function parseJSON<T>(json: string, schema: ZodSchema<T>): ValidationResult<T> {
  try {
    const parsed = JSON.parse(json);
    return validate(parsed, schema);
  } catch (error) {
    return Err([
      {
        path: [],
        message: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'invalid_json',
      },
    ]);
  }
}

/**
 * Safely parses a number from string
 */
export function parseNumber(value: string): number | undefined {
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Safely parses an integer from string
 */
export function parseInteger(value: string): number | undefined {
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Safely parses a boolean from string
 */
export function parseBoolean(value: string): boolean | undefined {
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return undefined;
}

/**
 * Safely parses a date from string
 */
export function parseDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
