/**
 * @fileoverview Advanced Type Primitives - State-of-the-Art TypeScript Patterns
 *
 * This module implements cutting-edge type-level programming techniques:
 * - Branded/Nominal Types for compile-time safety
 * - Phantom Types for encoding invariants
 * - Template Literal Types for string manipulation
 * - Conditional Types for advanced type inference
 * - Mapped Types for transformation utilities
 *
 * @module @medicalcor/types/primitives
 * @version 2.0.0
 */

import { z } from 'zod';

// =============================================================================
// BRANDED TYPES - Compile-Time Type Safety
// =============================================================================

/**
 * Brand symbol for creating nominal types
 * Uses unique symbol to ensure type incompatibility at compile time
 */
declare const __brand: unique symbol;

/**
 * Generic branded type constructor
 * Creates nominal types that are structurally incompatible despite identical runtime values
 *
 * @example
 * type UserId = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 *
 * const userId: UserId = 'user_123' as UserId;
 * const orderId: OrderId = userId; // Compile error!
 */
export type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

/**
 * Extracts the base type from a branded type
 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Creates a branded type with validation
 */
export function brand<T, TBrand extends string>(value: T, _brand: TBrand): Brand<T, TBrand> {
  return value as Brand<T, TBrand>;
}

// =============================================================================
// DOMAIN-SPECIFIC BRANDED TYPES
// =============================================================================

/** Unique identifier for leads - guaranteed unique across the system */
export type LeadId = Brand<string, 'LeadId'>;

/** Unique identifier for patients */
export type PatientId = Brand<string, 'PatientId'>;

/** Unique identifier for HubSpot contacts */
export type HubSpotContactId = Brand<string, 'HubSpotContactId'>;

/** Unique identifier for treatment plans */
export type TreatmentPlanId = Brand<string, 'TreatmentPlanId'>;

/** Unique identifier for appointments */
export type AppointmentId = Brand<string, 'AppointmentId'>;

/** Unique identifier for calls */
export type CallId = Brand<string, 'CallId'>;

/** Unique identifier for messages */
export type MessageId = Brand<string, 'MessageId'>;

/** Unique identifier for interactions */
export type InteractionId = Brand<string, 'InteractionId'>;

/** Unique identifier for clinics in multi-tenant setup */
export type ClinicId = Brand<string, 'ClinicId'>;

/** Unique identifier for users/agents */
export type UserId = Brand<string, 'UserId'>;

/** Phone number in E.164 format - validated at creation */
export type E164PhoneNumber = Brand<string, 'E164PhoneNumber'>;

/** Email address - validated at creation */
export type EmailAddress = Brand<string, 'EmailAddress'>;

/** Stripe payment intent ID */
export type StripePaymentIntentId = Brand<string, 'StripePaymentIntentId'>;

/** Stripe customer ID */
export type StripeCustomerId = Brand<string, 'StripeCustomerId'>;

/** Correlation ID for distributed tracing */
export type TraceId = Brand<string, 'TraceId'>;

/** Idempotency key for safe retries */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

// =============================================================================
// BRANDED TYPE CONSTRUCTORS WITH VALIDATION
// =============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a LeadId from a string with UUID validation
 * @throws Error if the string is not a valid UUID
 */
export function createLeadId(value: string): LeadId {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid LeadId: ${value} is not a valid UUID`);
  }
  return value as LeadId;
}

/**
 * Creates a PatientId from a string with UUID validation
 */
export function createPatientId(value: string): PatientId {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid PatientId: ${value} is not a valid UUID`);
  }
  return value as PatientId;
}

/**
 * Creates a HubSpotContactId (accepts any non-empty string)
 */
export function createHubSpotContactId(value: string): HubSpotContactId {
  if (!value || value.trim().length === 0) {
    throw new Error('HubSpotContactId cannot be empty');
  }
  return value as HubSpotContactId;
}

/**
 * Creates an E164PhoneNumber with format validation
 * @throws Error if the phone number is not in E.164 format
 */
export function createE164PhoneNumber(value: string): E164PhoneNumber {
  if (!E164_PHONE_REGEX.test(value)) {
    throw new Error(`Invalid phone number: ${value} is not in E.164 format`);
  }
  return value as E164PhoneNumber;
}

/**
 * Creates an EmailAddress with format validation
 */
export function createEmailAddress(value: string): EmailAddress {
  if (!EMAIL_REGEX.test(value)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value.toLowerCase() as EmailAddress;
}

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a TraceId for distributed tracing
 */
export function createTraceId(value?: string): TraceId {
  const id = value ?? generateUUID();
  return id as TraceId;
}

/**
 * Creates an IdempotencyKey for safe retries
 */
export function createIdempotencyKey(value?: string): IdempotencyKey {
  const key = value ?? generateUUID();
  return key as IdempotencyKey;
}

// =============================================================================
// PHANTOM TYPES - Encoding State in Types
// =============================================================================

/**
 * Phantom type marker - exists only at compile time
 */
declare const __phantom: unique symbol;

/**
 * Generic phantom type for encoding state/invariants
 * The phantom parameter TState exists only at the type level
 *
 * @example
 * type Draft = Phantom<Document, 'draft'>;
 * type Published = Phantom<Document, 'published'>;
 *
 * function publish(doc: Draft): Published { ... }
 * function unpublish(doc: Published): Draft { ... }
 */
export type Phantom<T, TState extends string> = T & { readonly [__phantom]: TState };

/**
 * State markers for lead lifecycle
 */
export type LeadState = 'new' | 'contacted' | 'qualified' | 'scheduled' | 'converted' | 'lost';

/**
 * Lead with encoded state - prevents invalid state transitions at compile time
 */
export type StatefulLead<TState extends LeadState, TData = unknown> = Phantom<TData, TState>;

// =============================================================================
// TEMPLATE LITERAL TYPES - String Manipulation at Type Level
// =============================================================================

/**
 * Event name pattern: domain.entity.action
 */
export type EventName<
  TDomain extends string,
  TEntity extends string,
  TAction extends string,
> = `${TDomain}.${TEntity}.${TAction}`;

/**
 * All valid domain event names
 */
export type DomainEventName =
  | EventName<'whatsapp', 'message', 'received' | 'sent'>
  | EventName<'whatsapp', 'status', 'updated'>
  | EventName<'voice', 'call', 'initiated' | 'completed'>
  | EventName<'voice', 'transcript', 'ready'>
  | EventName<'lead', 'lead', 'created' | 'scored' | 'qualified' | 'assigned'>
  | EventName<'payment', 'payment', 'received' | 'failed'>
  | EventName<'appointment', 'appointment', 'scheduled'>
  | EventName<'appointment', 'reminder', 'sent'>
  | EventName<'consent', 'consent', 'recorded'>;

/**
 * Extracts domain from event name
 */
export type ExtractDomain<T extends string> = T extends `${infer D}.${string}.${string}`
  ? D
  : never;

/**
 * Extracts entity from event name
 */
export type ExtractEntity<T extends string> = T extends `${string}.${infer E}.${string}`
  ? E
  : never;

/**
 * Extracts action from event name
 */
export type ExtractAction<T extends string> = T extends `${string}.${string}.${infer A}`
  ? A
  : never;

/**
 * API endpoint pattern
 */
export type ApiEndpoint<
  TVersion extends `v${number}`,
  TResource extends string,
  TAction extends string = '',
> = TAction extends ''
  ? `/api/${TVersion}/${TResource}`
  : `/api/${TVersion}/${TResource}/${TAction}`;

/**
 * Webhook endpoint pattern
 */
export type WebhookEndpoint<TProvider extends string> = `/webhooks/${TProvider}`;

// =============================================================================
// CONDITIONAL TYPES - Advanced Type Inference
// =============================================================================

/**
 * Makes specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes specific properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes all properties deeply readonly
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type AnyFunction = Function;

export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? T[K] extends AnyFunction
      ? T[K]
      : DeepReadonly<T[K]>
    : T[K];
};

/**
 * Makes all properties deeply mutable
 */
export type DeepMutable<T> = {
  -readonly [K in keyof T]: T[K] extends object
    ? T[K] extends AnyFunction
      ? T[K]
      : DeepMutable<T[K]>
    : T[K];
};

/**
 * Makes all properties deeply partial
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends AnyFunction
      ? T[K]
      : DeepPartial<T[K]>
    : T[K];
};

/**
 * Makes all properties deeply required
 */
export type DeepRequired<T> = {
  [K in keyof T]-?: T[K] extends object
    ? T[K] extends AnyFunction
      ? T[K]
      : DeepRequired<T[K]>
    : T[K];
};

/**
 * Extracts non-nullable keys from type
 */
export type NonNullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? never : undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Extracts nullable keys from type
 */
export type NullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? K : undefined extends T[K] ? K : never;
}[keyof T];

/**
 * Picks properties of a specific type
 */
export type PickByType<T, TType> = {
  [K in keyof T as T[K] extends TType ? K : never]: T[K];
};

/**
 * Omits properties of a specific type
 */
export type OmitByType<T, TType> = {
  [K in keyof T as T[K] extends TType ? never : K]: T[K];
};

/**
 * Extracts function property names
 */
export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? K : never;
}[keyof T];

/**
 * Extracts non-function property names
 */
export type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? never : K;
}[keyof T];

// =============================================================================
// MAPPED TYPES - Type Transformation Utilities
// =============================================================================

/**
 * Creates a type with all string literal keys prefixed
 */
export type Prefixed<T, TPrefix extends string> = {
  [K in keyof T as K extends string ? `${TPrefix}${K}` : never]: T[K];
};

/**
 * Creates a type with all string literal keys suffixed
 */
export type Suffixed<T, TSuffix extends string> = {
  [K in keyof T as K extends string ? `${K}${TSuffix}` : never]: T[K];
};

/**
 * Creates a type with keys transformed to camelCase
 */
export type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

/**
 * Creates a type with keys transformed to snake_case
 */
export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? U extends Uncapitalize<U>
    ? `${Lowercase<T>}${SnakeCase<U>}`
    : `${Lowercase<T>}_${SnakeCase<U>}`
  : S;

/**
 * Creates a type with all keys in camelCase
 */
export type CamelCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelCase<K> : K]: T[K];
};

/**
 * Creates a type with all keys in snake_case
 */
export type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? SnakeCase<K> : K]: T[K];
};

/**
 * Creates a union of all values in an object type
 */
export type ValueOf<T> = T[keyof T];

/**
 * Creates a union of all paths to leaf values
 */
export type Paths<T, D extends number = 10> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: K extends string | number
          ? `${K}` | Join<K, Paths<T[K], Prev[D]>>
          : never;
      }[keyof T]
    : never;

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]];

/**
 * Gets the type at a specific path
 */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

// =============================================================================
// TUPLE TYPES - Advanced Tuple Operations
// =============================================================================

/**
 * Prepends an element to a tuple
 */
export type Prepend<T extends unknown[], E> = [E, ...T];

/**
 * Appends an element to a tuple
 */
export type Append<T extends unknown[], E> = [...T, E];

/**
 * Gets the first element of a tuple
 */
export type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never;

/**
 * Gets all but the first element of a tuple
 */
export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

/**
 * Gets the last element of a tuple
 */
export type Last<T extends unknown[]> = T extends [...unknown[], infer L] ? L : never;

/**
 * Gets all but the last element of a tuple
 */
export type Init<T extends unknown[]> = T extends [...infer I, unknown] ? I : never;

/**
 * Gets the length of a tuple
 */
export type Length<T extends unknown[]> = T['length'];

/**
 * Concatenates two tuples
 */
export type Concat<T extends unknown[], U extends unknown[]> = [...T, ...U];

// =============================================================================
// UNION TYPES - Advanced Union Operations
// =============================================================================

/**
 * Converts a union to an intersection
 */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

/**
 * Gets the last member of a union
 */
export type LastOfUnion<T> =
  UnionToIntersection<T extends unknown ? () => T : never> extends () => infer R ? R : never;

/**
 * Converts a union to a tuple
 */
export type UnionToTuple<T, L = LastOfUnion<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L];

/**
 * Checks if a type is a union
 */
export type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;

// =============================================================================
// ZOD BRANDED SCHEMA FACTORIES
// =============================================================================

/**
 * Creates a Zod schema for LeadId with UUID validation
 */
export const LeadIdSchema = z
  .string()
  .uuid()
  .transform((val: string): LeadId => val as LeadId);

/**
 * Creates a Zod schema for PatientId with UUID validation
 */
export const PatientIdSchema = z
  .string()
  .uuid()
  .transform((val: string): PatientId => val as PatientId);

/**
 * Creates a Zod schema for HubSpotContactId
 */
export const HubSpotContactIdSchema = z
  .string()
  .min(1)
  .transform((val: string): HubSpotContactId => val as HubSpotContactId);

/**
 * Creates a Zod schema for E164PhoneNumber
 */
export const E164PhoneNumberSchema = z
  .string()
  .regex(E164_PHONE_REGEX, 'Invalid E.164 phone number format')
  .transform((val: string): E164PhoneNumber => val as E164PhoneNumber);

/**
 * Creates a Zod schema for EmailAddress
 */
export const EmailAddressSchema = z
  .string()
  .email()
  .transform((val: string): EmailAddress => val.toLowerCase() as EmailAddress);

/**
 * Creates a Zod schema for TraceId
 */
export const TraceIdSchema = z
  .string()
  .min(1)
  .transform((val: string): TraceId => val as TraceId);

/**
 * Creates a Zod schema for IdempotencyKey
 */
export const IdempotencyKeySchema = z
  .string()
  .uuid()
  .transform((val: string): IdempotencyKey => val as IdempotencyKey);

// =============================================================================
// TYPE ASSERTION UTILITIES
// =============================================================================

/**
 * Assert that a condition is true (compile-time)
 */
export type Assert<T extends true> = T;

/**
 * Check if two types are exactly equal
 * Note: This uses the standard TypeScript pattern for deep type equality checking.
 * The generic T parameters are intentionally used in conditional type inference positions.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
 * Note: The T type parameters are intentionally used only once - this is a standard
 * TypeScript pattern for type equality checking using conditional type inference.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- standard pattern for type equality */
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

/**
 * Check if type A extends type B
 */
export type Extends<A, B> = A extends B ? true : false;

/**
 * Check if type is never
 */
export type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Check if type is any
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Check if type is unknown
 */
export type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;

// =============================================================================
// CONST ASSERTIONS
// =============================================================================

/**
 * Ensures a value is treated as a const
 */
export function asConst<T>(value: T): T {
  return value;
}

/**
 * Creates a readonly tuple from arguments
 */
export function tuple<T extends unknown[]>(...args: T): Readonly<T> {
  return args as Readonly<T>;
}

/**
 * Creates a strictly typed object
 */
export function object<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  return Object.freeze(obj);
}

// =============================================================================
// EXHAUSTIVENESS CHECKING
// =============================================================================

/**
 * Used for exhaustive switch/if checks
 * Throws at runtime if reached, indicates missing case at compile time
 *
 * @example
 * type Status = 'pending' | 'completed' | 'failed';
 * function handle(status: Status) {
 *   switch (status) {
 *     case 'pending': return 'Waiting...';
 *     case 'completed': return 'Done!';
 *     case 'failed': return 'Error!';
 *     default: return assertNever(status);
 *   }
 * }
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * Compile-time exhaustiveness check that doesn't throw
 * Returns undefined for unreachable code
 */
export function exhaustive(_: never): undefined {
  return undefined;
}
