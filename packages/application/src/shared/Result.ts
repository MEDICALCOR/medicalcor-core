/**
 * @fileoverview Result Type for Functional Error Handling
 *
 * Provides a type-safe Result monad for representing success/failure
 * without throwing exceptions. Compatible with domain Result types.
 *
 * @module application/shared/Result
 */

/**
 * Success result variant
 */
export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
}

/**
 * Error result variant
 */
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
}

/**
 * Result type - Either a success (Ok) or failure (Err)
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return Err('Division by zero');
 *   }
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (isOk(result)) {
 *   console.log('Result:', result.value);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Create a success result
 */
export function Ok<T>(value: T): Ok<T> {
  return { _tag: 'Ok', value };
}

/**
 * Create an error result
 */
export function Err<E>(error: E): Err<E> {
  return { _tag: 'Err', error };
}

/**
 * Type guard for Ok result
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === 'Ok';
}

/**
 * Type guard for Err result
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === 'Err';
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for errors
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map over a successful result
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return Ok(fn(result.value));
  }
  return result;
}

/**
 * Map over an error result
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return Err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations that return Results
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Combine multiple results
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

/**
 * Try-catch wrapper that returns a Result
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Synchronous try-catch wrapper
 */
export function tryCatchSync<T>(fn: () => T): Result<T, Error> {
  try {
    const value = fn();
    return Ok(value);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
