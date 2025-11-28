/**
 * Result Type - Rust/Functional Programming Style Error Handling
 *
 * The Result type represents either success (Ok) or failure (Err).
 * This eliminates the need for try/catch in most cases and makes
 * error handling explicit in function signatures.
 *
 * This is superior to exceptions because:
 * 1. Errors are visible in the type signature
 * 2. The compiler forces you to handle errors
 * 3. No hidden control flow
 * 4. Composable with map, flatMap, etc.
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err('Division by zero');
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2)
 *   .map(n => n * 2)
 *   .mapErr(e => `Error: ${e}`)
 *   .unwrapOr(0);
 * ```
 *
 * @module types/result
 */

// ============================================================================
// RESULT TYPE DEFINITION
// ============================================================================

/**
 * Discriminated union representing success or failure.
 * Uses TypeScript's discriminated unions for exhaustive type checking.
 */
export type Result<T, E> = Ok<T, E> | Err<T, E>;

/**
 * Success variant of Result
 */
export interface Ok<T, E> {
  readonly _tag: 'Ok';
  readonly value: T;

  // Type narrowing methods
  readonly isOk: true;
  readonly isErr: false;

  // Transformation methods
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapErr<F>(fn: (error: E) => F): Result<T, F>;
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F>;

  // Extraction methods
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
  unwrapOrElse(fn: (error: E) => T): T;
  unwrapErr(): never;

  // Inspection methods
  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U;
  tap(fn: (value: T) => void): Result<T, E>;
  tapErr(fn: (error: E) => void): Result<T, E>;

  // Combination methods
  and<U>(other: Result<U, E>): Result<U, E>;
  or(other: Result<T, E>): Result<T, E>;
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  orElse<F>(fn: (error: E) => Result<T, F>): Result<T, F>;

  // Conversion
  toOption(): Option<T>;
  toNullable(): T | null;
  toUndefined(): T | undefined;
  toPromise(): Promise<T>;
}

/**
 * Failure variant of Result
 */
export interface Err<T, E> {
  readonly _tag: 'Err';
  readonly error: E;

  // Type narrowing methods
  readonly isOk: false;
  readonly isErr: true;

  // Transformation methods
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapErr<F>(fn: (error: E) => F): Result<T, F>;
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F>;

  // Extraction methods
  unwrap(): never;
  unwrapOr(defaultValue: T): T;
  unwrapOrElse(fn: (error: E) => T): T;
  unwrapErr(): E;

  // Inspection methods
  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U;
  tap(fn: (value: T) => void): Result<T, E>;
  tapErr(fn: (error: E) => void): Result<T, E>;

  // Combination methods
  and<U>(other: Result<U, E>): Result<U, E>;
  or(other: Result<T, E>): Result<T, E>;
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  orElse<F>(fn: (error: E) => Result<T, F>): Result<T, F>;

  // Conversion
  toOption(): Option<T>;
  toNullable(): T | null;
  toUndefined(): T | undefined;
  toPromise(): Promise<T>;
}

// ============================================================================
// OPTION TYPE (for optional values without null/undefined)
// ============================================================================

export type Option<T> = Some<T> | None<T>;

export interface Some<T> {
  readonly _tag: 'Some';
  readonly value: T;
  readonly isSome: true;
  readonly isNone: false;

  map<U>(fn: (value: T) => U): Option<U>;
  flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  filter(predicate: (value: T) => boolean): Option<T>;
  unwrap(): T;
  unwrapOr(defaultValue: T): T;
  unwrapOrElse(fn: () => T): T;
  match<U>(handlers: { some: (value: T) => U; none: () => U }): U;
  toNullable(): T | null;
  toUndefined(): T | undefined;
  toResult<E>(error: E): Result<T, E>;
}

export interface None<T> {
  readonly _tag: 'None';
  readonly isSome: false;
  readonly isNone: true;

  map<U>(fn: (value: T) => U): Option<U>;
  flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  filter(predicate: (value: T) => boolean): Option<T>;
  unwrap(): never;
  unwrapOr(defaultValue: T): T;
  unwrapOrElse(fn: () => T): T;
  match<U>(handlers: { some: (value: T) => U; none: () => U }): U;
  toNullable(): T | null;
  toUndefined(): T | undefined;
  toResult<E>(error: E): Result<T, E>;
}

// ============================================================================
// RESULT IMPLEMENTATIONS
// ============================================================================

class OkImpl<T, E> implements Ok<T, E> {
  readonly _tag = 'Ok' as const;
  readonly isOk = true as const;
  readonly isErr = false as const;

  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new OkImpl(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new OkImpl(this.value);
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  flatMapErr<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return new OkImpl(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  unwrapOrElse(_fn: (error: E) => T): T {
    return this.value;
  }

  unwrapErr(): never {
    throw new Error('Called unwrapErr on Ok value');
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }

  tap(fn: (value: T) => void): Result<T, E> {
    fn(this.value);
    return this;
  }

  tapErr(_fn: (error: E) => void): Result<T, E> {
    return this;
  }

  and<U>(other: Result<U, E>): Result<U, E> {
    return other;
  }

  or(_other: Result<T, E>): Result<T, E> {
    return this;
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  orElse<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return new OkImpl(this.value);
  }

  toOption(): Option<T> {
    return new SomeImpl(this.value);
  }

  toNullable(): T | null {
    return this.value;
  }

  toUndefined(): T | undefined {
    return this.value;
  }

  toPromise(): Promise<T> {
    return Promise.resolve(this.value);
  }
}

class ErrImpl<T, E> implements Err<T, E> {
  readonly _tag = 'Err' as const;
  readonly isOk = false as const;
  readonly isErr = true as const;

  constructor(readonly error: E) {}

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new ErrImpl(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new ErrImpl(fn(this.error));
  }

  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return new ErrImpl(this.error);
  }

  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    return fn(this.error);
  }

  unwrap(): never {
    throw new Error(`Called unwrap on Err value: ${String(this.error)}`);
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  unwrapOrElse(fn: (error: E) => T): T {
    return fn(this.error);
  }

  unwrapErr(): E {
    return this.error;
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }

  tap(_fn: (value: T) => void): Result<T, E> {
    return this;
  }

  tapErr(fn: (error: E) => void): Result<T, E> {
    fn(this.error);
    return this;
  }

  and<U>(_other: Result<U, E>): Result<U, E> {
    return new ErrImpl(this.error);
  }

  or(other: Result<T, E>): Result<T, E> {
    return other;
  }

  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return new ErrImpl(this.error);
  }

  orElse<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    return fn(this.error);
  }

  toOption(): Option<T> {
    return new NoneImpl();
  }

  toNullable(): T | null {
    return null;
  }

  toUndefined(): T | undefined {
    return undefined;
  }

  toPromise(): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- E may not be Error
    return Promise.reject(this.error);
  }
}

// ============================================================================
// OPTION IMPLEMENTATIONS
// ============================================================================

class SomeImpl<T> implements Some<T> {
  readonly _tag = 'Some' as const;
  readonly isSome = true as const;
  readonly isNone = false as const;

  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Option<U> {
    return new SomeImpl(fn(this.value));
  }

  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value);
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : new NoneImpl();
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  unwrapOrElse(_fn: () => T): T {
    return this.value;
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.some(this.value);
  }

  toNullable(): T | null {
    return this.value;
  }

  toUndefined(): T | undefined {
    return this.value;
  }

  toResult<E>(_error: E): Result<T, E> {
    return new OkImpl(this.value);
  }
}

class NoneImpl<T> implements None<T> {
  readonly _tag = 'None' as const;
  readonly isSome = false as const;
  readonly isNone = true as const;

  map<U>(_fn: (value: T) => U): Option<U> {
    return new NoneImpl();
  }

  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return new NoneImpl();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  unwrap(): never {
    throw new Error('Called unwrap on None value');
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  unwrapOrElse(fn: () => T): T {
    return fn();
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.none();
  }

  toNullable(): T | null {
    return null;
  }

  toUndefined(): T | undefined {
    return undefined;
  }

  toResult<E>(error: E): Result<T, E> {
    return new ErrImpl(error);
  }
}

// ============================================================================
// CONSTRUCTOR FUNCTIONS
// ============================================================================

/**
 * Create a success Result
 */
export function Ok<T, E = never>(value: T): Result<T, E> {
  return new OkImpl(value);
}

/**
 * Create a failure Result
 */
export function Err<T = never, E = unknown>(error: E): Result<T, E> {
  return new ErrImpl(error);
}

/**
 * Create a Some Option
 */
export function Some<T>(value: T): Option<T> {
  return new SomeImpl(value);
}

/**
 * Create a None Option
 */
export function None<T = never>(): Option<T> {
  return new NoneImpl();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Wrap a function that may throw into one that returns Result
 */
export function tryCatch<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    return Ok(fn());
  } catch (e) {
    return Err(e as E);
  }
}

/**
 * Wrap an async function that may throw into one that returns Result
 */
export async function tryCatchAsync<T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>> {
  try {
    return Ok(await fn());
  } catch (e) {
    return Err(e as E);
  }
}

/**
 * Convert a nullable value to Option
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value !== null && value !== undefined ? Some(value) : None();
}

/**
 * Convert a Result to a nullable value
 */
export function toNullable<T, E>(result: Result<T, E>): T | null {
  return result.isOk ? result.value : null;
}

/**
 * Combine multiple Results into a single Result containing an array
 * Short-circuits on first error
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (result.isErr) {
      return Err(result.error);
    }
    values.push(result.value);
  }
  return Ok(values);
}

/**
 * Like all(), but for a tuple of Results with different types
 */
export function combine<A, B, E>(results: [Result<A, E>, Result<B, E>]): Result<[A, B], E>;
export function combine<A, B, C, E>(
  results: [Result<A, E>, Result<B, E>, Result<C, E>]
): Result<[A, B, C], E>;
export function combine<A, B, C, D, E>(
  results: [Result<A, E>, Result<B, E>, Result<C, E>, Result<D, E>]
): Result<[A, B, C, D], E>;
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  return all(results);
}

/**
 * Return the first Ok result, or the last Err if all fail
 */
export function firstOk<T, E>(results: Result<T, E>[]): Result<T, E> {
  let lastErr: Result<T, E> | undefined;
  for (const result of results) {
    if (result.isOk) {
      return result;
    }
    lastErr = result;
  }
  return lastErr ?? Err(undefined as E);
}

/**
 * Partition an array of Results into successes and failures
 */
export function partition<T, E>(results: Result<T, E>[]): { ok: T[]; err: E[] } {
  const ok: T[] = [];
  const err: E[] = [];
  for (const result of results) {
    if (result.isOk) {
      ok.push(result.value);
    } else {
      err.push(result.error);
    }
  }
  return { ok, err };
}

/**
 * Apply a function to a value if the Result is Ok, otherwise return the error
 * This is traverse for the Result type
 */
export function traverse<T, U, E>(values: T[], fn: (value: T) => Result<U, E>): Result<U[], E> {
  const results: U[] = [];
  for (const value of values) {
    const result = fn(value);
    if (result.isErr) {
      return Err(result.error);
    }
    results.push(result.value);
  }
  return Ok(results);
}

/**
 * Async version of traverse
 */
export async function traverseAsync<T, U, E>(
  values: T[],
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U[], E>> {
  const results: U[] = [];
  for (const value of values) {
    const result = await fn(value);
    if (result.isErr) {
      return Err(result.error);
    }
    results.push(result.value);
  }
  return Ok(results);
}

/**
 * Parallel version of traverseAsync - runs all promises concurrently
 */
export async function traverseParallel<T, U, E>(
  values: T[],
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U[], E>> {
  const results = await Promise.all(values.map(fn));
  return all(results);
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T, E> {
  return result._tag === 'Ok';
}

/**
 * Type guard for Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<T, E> {
  return result._tag === 'Err';
}

/**
 * Type guard for Some
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option._tag === 'Some';
}

/**
 * Type guard for None
 */
export function isNone<T>(option: Option<T>): option is None<T> {
  return option._tag === 'None';
}

// ============================================================================
// ASYNC RESULT TYPE
// ============================================================================

/**
 * AsyncResult is a Promise that resolves to a Result
 * Useful for chaining async operations with error handling
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;

/**
 * Helper namespace for working with AsyncResult
 */
export const AsyncResult = {
  /**
   * Create an AsyncResult from a value
   */
  ok<T, E = never>(value: T): AsyncResult<T, E> {
    return Promise.resolve(Ok(value));
  },

  /**
   * Create an AsyncResult from an error
   */
  err<T = never, E = unknown>(error: E): AsyncResult<T, E> {
    return Promise.resolve(Err(error));
  },

  /**
   * Map over an AsyncResult
   */
  async map<T, U, E>(asyncResult: AsyncResult<T, E>, fn: (value: T) => U): AsyncResult<U, E> {
    const result = await asyncResult;
    return result.map(fn);
  },

  /**
   * FlatMap over an AsyncResult
   */
  async flatMap<T, U, E>(
    asyncResult: AsyncResult<T, E>,
    fn: (value: T) => AsyncResult<U, E>
  ): AsyncResult<U, E> {
    const result = await asyncResult;
    if (result.isErr) {
      return Err(result.error);
    }
    return fn(result.value);
  },

  /**
   * Wrap an async function that may throw
   */
  async fromPromise<T, E = Error>(promise: Promise<T>): AsyncResult<T, E> {
    return tryCatchAsync(() => promise);
  },
};
