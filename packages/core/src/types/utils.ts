/**
 * Advanced TypeScript Utility Types
 *
 * State-of-the-art type utilities for maximum type safety.
 * These utilities leverage TypeScript's most advanced features
 * including conditional types, mapped types, and template literal types.
 *
 * @module types/utils
 */

// ============================================================================
// DEEP IMMUTABILITY
// ============================================================================

/**
 * Makes all properties of T deeply readonly.
 * Unlike Readonly<T>, this recursively applies to nested objects and arrays.
 *
 * @example
 * ```ts
 * type Mutable = { a: { b: number[] } };
 * type Immutable = DeepReadonly<Mutable>;
 * // Immutable.a.b.push(1) would be a compile error
 * ```
 */
export type DeepReadonly<T> = T extends (infer R)[]
  ? DeepReadonlyArray<R>
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needed for deep recursion
    T extends Function
    ? T
    : T extends object
      ? DeepReadonlyObject<T>
      : T;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- interface extension pattern
interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

type DeepReadonlyObject<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/**
 * The inverse of DeepReadonly - makes all properties deeply mutable
 */

export type DeepMutable<T> = T extends readonly (infer R)[]
  ? DeepMutableArray<R>
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needed for deep recursion
    T extends Function
    ? T
    : T extends object
      ? DeepMutableObject<T>
      : T;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- interface extension pattern
interface DeepMutableArray<T> extends Array<DeepMutable<T>> {}

type DeepMutableObject<T> = {
  -readonly [P in keyof T]: DeepMutable<T[P]>;
};

/**
 * Makes all properties of T deeply partial (optional)
 */
export type DeepPartial<T> = T extends (infer R)[]
  ? DeepPartialArray<R>
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needed for deep recursion
    T extends Function
    ? T
    : T extends object
      ? DeepPartialObject<T>
      : T | undefined;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- interface extension pattern
interface DeepPartialArray<T> extends Array<DeepPartial<T>> {}

type DeepPartialObject<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

/**
 * Makes all properties of T deeply required (non-optional)
 */
export type DeepRequired<T> = T extends (infer R)[]
  ? DeepRequiredArray<R>
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needed for deep recursion
    T extends Function
    ? T
    : T extends object
      ? DeepRequiredObject<T>
      : NonNullable<T>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- interface extension pattern
interface DeepRequiredArray<T> extends Array<DeepRequired<T>> {}

type DeepRequiredObject<T> = {
  [P in keyof T]-?: DeepRequired<T[P]>;
};

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/**
 * Pick only the keys of T whose values are assignable to V
 */
export type PickByValue<T, V> = Pick<T, { [K in keyof T]: T[K] extends V ? K : never }[keyof T]>;

/**
 * Omit keys of T whose values are assignable to V
 */
export type OmitByValue<T, V> = Pick<T, { [K in keyof T]: T[K] extends V ? never : K }[keyof T]>;

/**
 * Make specific keys of T required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific keys of T optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys of T nullable
 */
export type NullableKeys<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? T[P] | null : T[P];
};

/**
 * Get all keys of T that have optional values
 */
export type OptionalKeysOf<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

/**
 * Get all keys of T that have required values
 */
export type RequiredKeysOf<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Merge two types, with U taking precedence
 */
export type Merge<T, U> = Omit<T, keyof U> & U;

/**
 * Create a type that requires at least one property from T
 */
export type AtLeastOne<T, Keys extends keyof T = keyof T> = Partial<T> &
  { [K in Keys]: Required<Pick<T, K>> }[Keys];

/**
 * Create a type that requires exactly one property from T
 */
export type ExactlyOne<T, Keys extends keyof T = keyof T> = {
  [K in Keys]: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, never>>;
}[Keys];

// ============================================================================
// FUNCTION UTILITIES
// ============================================================================

/**
 * Extract the parameters of a function as a tuple
 */
export type Parameters<T extends (...args: never[]) => unknown> = T extends (
  ...args: infer P
) => unknown
  ? P
  : never;

/**
 * Extract the return type of a function
 */
export type ReturnType<T extends (...args: never[]) => unknown> = T extends (
  ...args: never[]
) => infer R
  ? R
  : unknown;

/**
 * Extract the return type of an async function (unwrapped from Promise)
 */
export type AsyncReturnType<T extends (...args: never[]) => Promise<unknown>> = T extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;

/**
 * Make a function's return type a Promise if it isn't already
 */
export type Promisify<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>;

/**
 * Get the type of the first parameter of a function
 */
export type FirstParameter<T extends (...args: never[]) => unknown> = T extends (
  first: infer F,
  ...rest: never[]
) => unknown
  ? F
  : never;

/**
 * Get the type of the last parameter of a function
 */
export type LastParameter<T extends (...args: never[]) => unknown> = T extends (
  ...args: [...infer _, infer L]
) => unknown
  ? L
  : never;

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Get the element type of an array
 */
export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

/**
 * Create a tuple type of length N filled with type T
 */
export type Tuple<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : Tuple<T, N, [T, ...R]>;

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Check if type is a non-empty array
 */
export type IsNonEmpty<T extends readonly unknown[]> = T extends readonly [unknown, ...unknown[]]
  ? true
  : false;

/**
 * Get the first element type of a tuple
 */
export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]]
  ? H
  : never;

/**
 * Get all but the first element of a tuple
 */
export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer R]
  ? R
  : never;

/**
 * Get the last element type of a tuple
 */
export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L]
  ? L
  : never;

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Capitalize the first letter of a string
 */
export type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

/**
 * Uncapitalize the first letter of a string
 */
export type Uncapitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Lowercase<F>}${R}`
  : S;

/**
 * Convert a string to camelCase
 */
export type CamelCase<S extends string> = S extends `${infer P}_${infer R}`
  ? `${Lowercase<P>}${Capitalize<CamelCase<R>>}`
  : Lowercase<S>;

/**
 * Convert a string to snake_case
 */
export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${SnakeCase<U>}`
  : S;

/**
 * Convert a string to kebab-case
 */
export type KebabCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '-' : ''}${Lowercase<T>}${KebabCase<U>}`
  : S;

/**
 * Get string literal union from object keys
 */
export type KeysToUnion<T> = keyof T;

/**
 * Get string literal union from object values
 */
export type ValuesToUnion<T> = T[keyof T];

// ============================================================================
// DISCRIMINATED UNION UTILITIES
// ============================================================================

/**
 * Extract members of a discriminated union by discriminant
 *
 * @example
 * ```ts
 * type Action = { type: 'A'; a: number } | { type: 'B'; b: string };
 * type ActionA = ExtractDiscriminant<Action, 'type', 'A'>;
 * // { type: 'A'; a: number }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- mapped type needed for discriminated union extraction
export type ExtractDiscriminant<T, K extends keyof T, V extends T[K]> = T extends { [P in K]: V }
  ? T
  : never;

/**
 * Exclude members of a discriminated union by discriminant
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- mapped type needed for discriminated union exclusion
export type ExcludeDiscriminant<T, K extends keyof T, V extends T[K]> = T extends { [P in K]: V }
  ? never
  : T;

/**
 * Get all discriminant values from a discriminated union
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- mapped type needed for value extraction
export type DiscriminantValues<T, K extends keyof T> = T extends { [P in K]: infer V } ? V : never;

/**
 * Create a discriminated union from a record of types
 *
 * @example
 * ```ts
 * type Events = DiscriminatedUnion<'type', {
 *   UserCreated: { userId: string };
 *   UserDeleted: { userId: string; reason: string };
 * }>;
 * // { type: 'UserCreated'; userId: string } | { type: 'UserDeleted'; userId: string; reason: string }
 * ```
 */
export type DiscriminatedUnion<K extends string, T extends Record<string, object>> = {
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style -- mapped type needed for union creation
  [P in keyof T]: { [D in K]: P } & T[P];
}[keyof T];

// ============================================================================
// JSON TYPES
// ============================================================================

/**
 * Represents a JSON-serializable value
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonArray = JsonValue[];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type alias allows union with primitives
export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Filter a type to only include JSON-serializable properties
 */
export type JsonSerializable<T> = T extends JsonPrimitive
  ? T
  : T extends (infer U)[]
    ? JsonSerializable<U>[]
    : T extends object
      ? { [K in keyof T]: JsonSerializable<T[K]> }
      : never;

// ============================================================================
// TYPE GUARDS & ASSERTIONS
// ============================================================================

/**
 * Assert that a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined');
  }
}

/**
 * Assert that a value is a string
 */
export function assertString(value: unknown, message?: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(message ?? `Expected string, got ${typeof value}`);
  }
}

/**
 * Assert that a value is a number
 */
export function assertNumber(value: unknown, message?: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(message ?? `Expected number, got ${typeof value}`);
  }
}

/**
 * Assert that a value is an object (not null)
 */
export function assertObject(
  value: unknown,
  message?: string
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(message ?? `Expected object, got ${typeof value}`);
  }
}

/**
 * Assert that a value is an array
 */
export function assertArray(value: unknown, message?: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message ?? `Expected array, got ${typeof value}`);
  }
}

/**
 * Type guard for checking if a value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard for checking if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for checking if a value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if a value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard for checking if a value is a non-empty array
 */
export function isNonEmptyArray<T>(value: T[]): value is NonEmptyArray<T> {
  return value.length > 0;
}

/**
 * Type guard for checking if a value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Type guard for checking if a value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Type guard for checking if a value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard for checking if an object has a specific key
 */
export function hasKey<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Type guard for checking if an object has specific keys
 */
export function hasKeys<K extends string>(obj: unknown, keys: K[]): obj is Record<K, unknown> {
  return isObject(obj) && keys.every((key) => key in obj);
}

// ============================================================================
// EXHAUSTIVE CHECK
// ============================================================================

/**
 * Ensures exhaustive checking in switch statements and if-else chains.
 * TypeScript will error if this function can be called (i.e., if a case is missing).
 *
 * @example
 * ```ts
 * type Status = 'pending' | 'approved' | 'rejected';
 *
 * function handleStatus(status: Status): string {
 *   switch (status) {
 *     case 'pending': return 'Waiting...';
 *     case 'approved': return 'Success!';
 *     case 'rejected': return 'Failed!';
 *     default: return exhaustive(status); // Error if a case is missing
 *   }
 * }
 * ```
 */
export function exhaustive(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

/**
 * Like exhaustive, but returns a default value instead of throwing.
 * Useful when you want to handle unknown cases gracefully.
 */
export function exhaustiveWithDefault<T>(value: never, defaultValue: T): T {
  console.warn(`Unhandled case: ${JSON.stringify(value)}, using default`);
  return defaultValue;
}

// ============================================================================
// SAFE ACCESS
// ============================================================================

/**
 * Safely access a nested property of an object.
 * Returns undefined if any part of the path is null/undefined.
 *
 * @example
 * ```ts
 * const obj = { a: { b: { c: 123 } } };
 * safeGet(obj, ['a', 'b', 'c']); // 123
 * safeGet(obj, ['a', 'x', 'c']); // undefined
 * ```
 */
export function safeGet(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/**
 * Safely set a nested property of an object.
 * Creates intermediate objects as needed.
 */
export function safeSet<T extends object>(obj: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return obj;

  const result = { ...obj } as Record<string | number, unknown>;
  let current = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!; // Safe: loop bound ensures i < path.length - 1
    const nextKey = path[i + 1]; // May be undefined at boundary
    if (current[key] === null || current[key] === undefined) {
      current[key] = typeof nextKey === 'number' ? [] : {};
    } else {
      current[key] = Array.isArray(current[key])
        ? [...(current[key] as unknown[])]
        : { ...(current[key] as object) };
    }
    current = current[key] as Record<string | number, unknown>;
  }

  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
  return result as T;
}

// ============================================================================
// CLONE & FREEZE
// ============================================================================

/**
 * Deep clone an object (JSON-safe only)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Deep freeze an object (makes it immutable at runtime)
 */
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T> {
  Object.freeze(obj);
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj as DeepReadonly<T>;
}
