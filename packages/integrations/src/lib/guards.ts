/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    TYPE GUARDS & RUNTIME ASSERTIONS                           ║
 * ║                                                                               ║
 * ║  Exhaustive type guards with compile-time guarantees. Runtime validation     ║
 * ║  that narrows types and ensures correctness at system boundaries.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { z, type ZodIssue } from 'zod';

// =============================================================================
// Core Guard Utilities
// =============================================================================

/**
 * Type guard result with detailed error information
 */
export interface GuardResult<T> {
  readonly success: boolean;
  readonly value?: T;
  readonly errors?: readonly string[];
}

/**
 * Create a successful guard result
 */
export function guardOk<T>(value: T): GuardResult<T> {
  return { success: true, value };
}

/**
 * Create a failed guard result
 */
export function guardFail<T>(errors: readonly string[]): GuardResult<T> {
  return { success: false, errors };
}

// =============================================================================
// Primitive Type Guards
// =============================================================================

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Check if value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Check if value is a valid Date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a valid ISO date string
 */
export function isISODateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && value === date.toISOString();
}

/**
 * Check if value is a valid URL
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid email
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // RFC 5322 compliant email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Check if value is a valid phone number (basic)
 */
export function isValidPhone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Basic phone validation: 10-15 digits, optional + prefix
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  return phoneRegex.test(value.replace(/[\s\-()]/g, ''));
}

/**
 * Check if value is a valid E.164 phone number
 */
export function isE164Phone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  return e164Regex.test(value);
}

/**
 * Check if value is a valid UUID
 */
export function isUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// =============================================================================
// Integration-Specific Guards
// =============================================================================

/**
 * HubSpot contact data guard
 */
export function isHubSpotContact(value: unknown): value is {
  id: string;
  properties: Record<string, string>;
} {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (!isObject(value.properties)) return false;
  return true;
}

/**
 * WhatsApp message guard
 */
export function isWhatsAppMessage(value: unknown): value is {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
} {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.from !== 'string') return false;
  if (typeof value.timestamp !== 'string') return false;
  if (typeof value.type !== 'string') return false;
  return true;
}

/**
 * Vapi call data guard
 */
export function isVapiCall(value: unknown): value is {
  id: string;
  status: string;
  type: 'inbound' | 'outbound';
} {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.status !== 'string') return false;
  if (value.type !== 'inbound' && value.type !== 'outbound') return false;
  return true;
}

/**
 * Stripe charge guard
 */
export function isStripeCharge(value: unknown): value is {
  id: string;
  amount: number;
  currency: string;
  status: string;
} {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.amount !== 'number') return false;
  if (typeof value.currency !== 'string') return false;
  if (typeof value.status !== 'string') return false;
  return true;
}

// =============================================================================
// Discriminated Union Guards
// =============================================================================

/**
 * Guard for discriminated unions by tag field
 */
export function hasTag<T extends string>(
  value: unknown,
  tag: T
): value is { _tag: T } & Record<string, unknown> {
  return isObject(value) && value._tag === tag;
}

/**
 * Guard for discriminated unions by type field
 */
export function hasType<T extends string>(
  value: unknown,
  type: T
): value is { type: T } & Record<string, unknown> {
  return isObject(value) && value.type === type;
}

/**
 * Guard for discriminated unions by kind field
 */
export function hasKind<T extends string>(
  value: unknown,
  kind: T
): value is { kind: T } & Record<string, unknown> {
  return isObject(value) && value.kind === kind;
}

// =============================================================================
// Exhaustive Pattern Matching
// =============================================================================

/**
 * Assert exhaustive pattern matching at compile time
 * If a case is not handled, TypeScript will show an error
 *
 * @example
 * ```typescript
 * type Status = 'pending' | 'active' | 'completed';
 *
 * function handleStatus(status: Status) {
 *   switch (status) {
 *     case 'pending': return 'waiting';
 *     case 'active': return 'in progress';
 *     case 'completed': return 'done';
 *     default: return assertNever(status);
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unhandled discriminated union member: ${JSON.stringify(value)}`);
}

/**
 * Exhaustive match function for discriminated unions
 *
 * @example
 * ```typescript
 * type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };
 *
 * const message = exhaustiveMatch(result, {
 *   Ok: ({ value }) => `Success: ${value}`,
 *   Err: ({ error }) => `Error: ${error}`
 * });
 * ```
 */

/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- M ensures exhaustive matcher object */
export function exhaustiveMatch<
  T extends { _tag: string },
  R,
  M extends { [K in T['_tag']]: (value: Extract<T, { _tag: K }>) => R },
>(value: T, matchers: M): R {
  /* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
  const tag = value._tag;
  const matcher = matchers[tag as keyof M];
   
  if (!matcher) {
    throw new Error(`No matcher for tag: ${tag}`);
  }
  // Cast is safe because we've verified the tag exists in matchers
  return (matcher as (value: T) => R)(value);
}

/**
 * Match with default fallback
 */

/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- M enables proper matcher inference */
export function matchWithDefault<
  T extends { _tag: string },
  R,
  M extends Partial<{ [K in T['_tag']]: (value: Extract<T, { _tag: K }>) => R }>,
>(value: T, matchers: M, defaultValue: R | ((value: T) => R)): R {
  /* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
  const tag = value._tag;
  const matcher = matchers[tag as keyof M];
  if (matcher) {
    // Cast is safe because we've verified the tag exists in matchers
    return (matcher as (value: T) => R)(value);
  }
  return typeof defaultValue === 'function'
    ? (defaultValue as (value: T) => R)(value)
    : defaultValue;
}

// =============================================================================
// Runtime Assertions
// =============================================================================

/**
 * Assertion error with context
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly actual: unknown,
    public readonly expected?: string
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Assert a condition is true
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message, condition, 'true');
  }
}

/**
 * Assert value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new AssertionError(
      message ?? 'Expected value to be defined',
      value,
      'non-null/undefined'
    );
  }
}

/**
 * Assert value is a non-empty string
 */
export function assertNonEmptyString(value: unknown, message?: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new AssertionError(message ?? 'Expected non-empty string', value, 'non-empty string');
  }
}

/**
 * Assert value is a positive integer
 */
export function assertPositiveInteger(value: unknown, message?: string): asserts value is number {
  if (!isPositiveInteger(value)) {
    throw new AssertionError(message ?? 'Expected positive integer', value, 'positive integer');
  }
}

/**
 * Assert value matches a Zod schema
 */
export function assertSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message?: string
): asserts value is T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const errors = result.error.errors.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new AssertionError(
      message ?? `Schema validation failed: ${errors.join(', ')}`,
      value,
      schema.description
    );
  }
}

// =============================================================================
// Safe Property Access
// =============================================================================

/**
 * Safely get a property from an object
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T enables callers to specify the expected return type
export function getProperty<T>(obj: unknown, key: string): T | undefined {
  if (!isObject(obj)) return undefined;
  return obj[key] as T | undefined;
}

/**
 * Safely get a nested property from an object
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T enables callers to specify the expected return type
export function getNestedProperty<T>(obj: unknown, path: string[]): T | undefined {
  let current: unknown = obj;

  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }

  return current as T | undefined;
}

/**
 * Get property with type guard
 */
export function getPropertyGuarded<T>(
  obj: unknown,
  key: string,
  guard: (value: unknown) => value is T
): T | undefined {
  const value = getProperty(obj, key);
  return guard(value) ? value : undefined;
}

// =============================================================================
// Array Guards
// =============================================================================

/**
 * Check if value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if all elements in array satisfy a guard
 */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * Check if array has exact length
 */
export function hasLength<T>(value: unknown, length: number): value is T[] {
  return Array.isArray(value) && value.length === length;
}

/**
 * Check if array has minimum length
 */
export function hasMinLength<T>(value: unknown, minLength: number): value is T[] {
  return Array.isArray(value) && value.length >= minLength;
}

// =============================================================================
// Webhook Payload Guards
// =============================================================================

/**
 * HubSpot webhook payload guard
 */
export const HubSpotWebhookPayloadSchema = z.array(
  z.object({
    eventId: z.number(),
    subscriptionId: z.number(),
    portalId: z.number(),
    occurredAt: z.number(),
    subscriptionType: z.string(),
    attemptNumber: z.number(),
    objectId: z.number(),
    changeSource: z.string().optional(),
    propertyName: z.string().optional(),
    propertyValue: z.string().optional(),
  })
);

export type HubSpotWebhookPayload = z.infer<typeof HubSpotWebhookPayloadSchema>;

export function isHubSpotWebhookPayload(value: unknown): value is HubSpotWebhookPayload {
  return HubSpotWebhookPayloadSchema.safeParse(value).success;
}

/**
 * WhatsApp webhook payload guard
 */
export const WhatsAppWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.literal('whatsapp'),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z
                    .object({
                      body: z.string(),
                    })
                    .optional(),
                })
              )
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.enum(['sent', 'delivered', 'read', 'failed']),
                  timestamp: z.string(),
                })
              )
              .optional(),
          }),
          field: z.literal('messages'),
        })
      ),
    })
  ),
});

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppWebhookPayloadSchema>;

export function isWhatsAppWebhookPayload(value: unknown): value is WhatsAppWebhookPayload {
  return WhatsAppWebhookPayloadSchema.safeParse(value).success;
}

/**
 * Stripe webhook payload guard
 */
export const StripeWebhookPayloadSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  created: z.number(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
  livemode: z.boolean(),
  pending_webhooks: z.number(),
  request: z
    .object({
      id: z.string().nullable(),
      idempotency_key: z.string().nullable(),
    })
    .nullable(),
});

export type StripeWebhookPayload = z.infer<typeof StripeWebhookPayloadSchema>;

export function isStripeWebhookPayload(value: unknown): value is StripeWebhookPayload {
  return StripeWebhookPayloadSchema.safeParse(value).success;
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate and return typed result
 */
export function validate<T>(schema: z.ZodType<T>, value: unknown): GuardResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return guardOk(result.data);
  }
  return guardFail(result.error.errors.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`));
}

/**
 * Validate or throw
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, value: unknown, errorMessage?: string): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const errors = result.error.errors.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`);
  throw new Error(errorMessage ?? `Validation failed: ${errors.join(', ')}`);
}

/**
 * Validate with custom error transformation
 */
export function validateWithErrors<T, E>(
  schema: z.ZodType<T>,
  value: unknown,
  transformError: (errors: z.ZodError) => E
): { success: true; data: T } | { success: false; error: E } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: transformError(result.error) };
}

// =============================================================================
// Type Narrowing Utilities
// =============================================================================

/**
 * Narrow an array to non-empty
 */
export function toNonEmptyArray<T>(arr: T[]): [T, ...T[]] | null {
  if (arr.length === 0) return null;
  return arr as [T, ...T[]];
}

/**
 * Narrow a string to non-empty
 */
export function toNonEmptyString(str: string): string | null {
  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Filter and narrow array elements
 */
export function filterMap<T, U>(arr: readonly T[], fn: (item: T) => U | null | undefined): U[] {
  const result: U[] = [];
  for (const item of arr) {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Partition array by predicate
 */
export function partition<T, U extends T>(
  arr: readonly T[],
  guard: (item: T) => item is U
): [U[], Exclude<T, U>[]] {
  const pass: U[] = [];
  const fail: Exclude<T, U>[] = [];

  for (const item of arr) {
    if (guard(item)) {
      pass.push(item);
    } else {
      fail.push(item as Exclude<T, U>);
    }
  }

  return [pass, fail];
}
