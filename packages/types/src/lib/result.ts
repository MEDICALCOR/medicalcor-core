/* eslint-disable max-lines -- monadic types require comprehensive utility functions */
/**
 * @fileoverview Result and Option Monads - Railway-Oriented Programming
 *
 * Implements functional error handling patterns with full type inference:
 * - Result<T, E>: Represents success or failure with typed errors
 * - Option<T>: Represents presence or absence of a value
 * - AsyncResult<T, E>: Promise-based Result for async operations
 *
 * These types enable:
 * - Type-safe error handling without exceptions
 * - Composable operations with map, flatMap, fold
 * - Railway-oriented programming patterns
 * - Exhaustive error handling at compile time
 *
 * @module @medicalcor/types/result
 * @version 2.0.0
 */

// =============================================================================
// RESULT TYPE - Success or Failure with Typed Errors
// =============================================================================

/**
 * Represents a successful result containing a value
 */
export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
}

/**
 * Represents a failed result containing an error
 */
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
}

/**
 * Result type - represents either success (Ok) or failure (Err)
 * Inspired by Rust's Result type and fp-ts Either
 *
 * @example
 * function divide(a: number, b: number): Result<number, DivisionError> {
 *   if (b === 0) return Err({ code: 'DIVISION_BY_ZERO' });
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2)
 *   .map(x => x * 2)
 *   .flatMap(x => divide(x, 2))
 *   .unwrapOr(0);
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful Result
 */
export function Ok<T>(value: T): Ok<T> {
  return { _tag: 'Ok', value };
}

/**
 * Creates a failed Result
 */
export function Err<E>(error: E): Err<E> {
  return { _tag: 'Err', error };
}

// =============================================================================
// RESULT TYPE GUARDS
// =============================================================================

/**
 * Type guard for Ok variant
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === 'Ok';
}

/**
 * Type guard for Err variant
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === 'Err';
}

// =============================================================================
// RESULT OPERATIONS - Functor, Applicative, Monad
// =============================================================================

/**
 * Result operations namespace - provides functional operations on Result types
 */
export const Result = {
  /**
   * Creates a successful Result
   */
  ok<T>(value: T): Result<T, never> {
    return Ok(value);
  },

  /**
   * Creates a failed Result
   */
  err<E>(error: E): Result<never, E> {
    return Err(error);
  },

  /**
   * Transforms the success value of a Result
   */
  map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return isOk(result) ? Ok(fn(result.value)) : result;
  },

  /**
   * Transforms the error value of a Result
   */
  mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    return isErr(result) ? Err(fn(result.error)) : result;
  },

  /**
   * Chains Result operations (flatMap/bind)
   */
  flatMap<T, U, E, F>(result: Result<T, E>, fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return isOk(result) ? fn(result.value) : result;
  },

  /**
   * Alias for flatMap
   */
  andThen<T, U, E, F>(result: Result<T, E>, fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return Result.flatMap(result, fn);
  },

  /**
   * Chains to another Result if this one is Err
   */
  orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
    return isErr(result) ? fn(result.error) : result;
  },

  /**
   * Pattern matches on Result, providing handlers for both cases
   */
  fold<T, E, U>(result: Result<T, E>, onErr: (error: E) => U, onOk: (value: T) => U): U {
    return isOk(result) ? onOk(result.value) : onErr(result.error);
  },

  /**
   * Alias for fold with reversed parameter order
   */
  match<T, E, U>(result: Result<T, E>, patterns: { ok: (value: T) => U; err: (error: E) => U }): U {
    return isOk(result) ? patterns.ok(result.value) : patterns.err(result.error);
  },

  /**
   * Extracts the success value or returns a default
   */
  unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return isOk(result) ? result.value : defaultValue;
  },

  /**
   * Extracts the success value or computes a default
   */
  unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
    return isOk(result) ? result.value : fn(result.error);
  },

  /**
   * Extracts the success value or throws the error
   */
  unwrap<T, E>(result: Result<T, E>): T {
    if (isOk(result)) return result.value;
    const err = result.error;
    throw err instanceof Error ? err : new Error(String(err));
  },

  /**
   * Extracts the error value or throws if Ok
   */
  unwrapErr<T, E>(result: Result<T, E>): E {
    if (isErr(result)) return result.error;
    throw new Error('Called unwrapErr on Ok value');
  },

  /**
   * Converts Result to Option, discarding the error
   */
  toOption<T, E>(result: Result<T, E>): Option<T> {
    return isOk(result) ? Some(result.value) : None;
  },

  /**
   * Combines multiple Results, returning first error or all successes
   */
  all<T extends readonly Result<unknown, unknown>[]>(
    results: T
  ): Result<
    { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
    T[number] extends Result<unknown, infer E> ? E : never
  > {
    const values: unknown[] = [];
    for (const result of results) {
      if (isErr(result)) return result as never;
      values.push(result.value);
    }
    return Ok(values as never);
  },

  /**
   * Returns first Ok or last Err
   */
  any<T, E>(results: Result<T, E>[]): Result<T, E[]> {
    const errors: E[] = [];
    for (const result of results) {
      if (isOk(result)) return result;
      errors.push(result.error);
    }
    return Err(errors);
  },

  /**
   * Tries to execute a function, catching exceptions into Err
   */
  try<T>(fn: () => T): Result<T, unknown> {
    try {
      return Ok(fn());
    } catch (error) {
      return Err(error);
    }
  },

  /**
   * Tries to execute an async function, catching exceptions into Err
   */
  async tryAsync<T>(fn: () => Promise<T>): Promise<Result<T, unknown>> {
    try {
      return Ok(await fn());
    } catch (error) {
      return Err(error);
    }
  },

  /**
   * Creates a Result from a nullable value
   */
  fromNullable<T, E>(value: T | null | undefined, error: E): Result<T, E> {
    return value !== null && value !== undefined ? Ok(value) : Err(error);
  },

  /**
   * Creates a Result from a predicate
   */
  fromPredicate<T, E>(value: T, predicate: (value: T) => boolean, error: E): Result<T, E> {
    return predicate(value) ? Ok(value) : Err(error);
  },

  /**
   * Flattens a nested Result
   */
  flatten<T, E>(result: Result<Result<T, E>, E>): Result<T, E> {
    return isOk(result) ? result.value : result;
  },

  /**
   * Applies a function wrapped in Result to a value wrapped in Result
   */
  ap<T, U, E>(resultFn: Result<(value: T) => U, E>, result: Result<T, E>): Result<U, E> {
    if (isErr(resultFn)) return resultFn;
    if (isErr(result)) return result;
    return Ok(resultFn.value(result.value));
  },

  /**
   * Zips two Results into a tuple
   */
  zip<T, U, E>(first: Result<T, E>, second: Result<U, E>): Result<[T, U], E> {
    if (isErr(first)) return first;
    if (isErr(second)) return second;
    return Ok([first.value, second.value]);
  },

  /**
   * Zips two Results with a combining function
   */
  zipWith<T, U, V, E>(
    first: Result<T, E>,
    second: Result<U, E>,
    fn: (t: T, u: U) => V
  ): Result<V, E> {
    if (isErr(first)) return first;
    if (isErr(second)) return second;
    return Ok(fn(first.value, second.value));
  },

  /**
   * Filters a Result, converting to Err if predicate fails
   */
  filter<T, E>(result: Result<T, E>, predicate: (value: T) => boolean, error: E): Result<T, E> {
    if (isErr(result)) return result;
    return predicate(result.value) ? result : Err(error);
  },

  /**
   * Taps into a Result for side effects without changing it
   */
  tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> {
    if (isOk(result)) fn(result.value);
    return result;
  },

  /**
   * Taps into a Result error for side effects
   */
  tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> {
    if (isErr(result)) fn(result.error);
    return result;
  },
};

// =============================================================================
// OPTION TYPE - Presence or Absence
// =============================================================================

/**
 * Represents a present value
 */
export interface Some<T> {
  readonly _tag: 'Some';
  readonly value: T;
}

/**
 * Represents absence of a value
 */
export interface None {
  readonly _tag: 'None';
}

/**
 * Option type - represents either a value (Some) or nothing (None)
 * Inspired by Rust's Option type and fp-ts Option
 *
 * @example
 * function findUser(id: string): Option<User> {
 *   const user = users.get(id);
 *   return user ? Some(user) : None;
 * }
 *
 * const greeting = findUser('123')
 *   .map(user => user.name)
 *   .map(name => `Hello, ${name}!`)
 *   .unwrapOr('Hello, stranger!');
 */
export type Option<T> = Some<T> | None;

/**
 * Creates a Some variant
 */
export function Some<T>(value: T): Some<T> {
  return { _tag: 'Some', value };
}

/**
 * The None singleton
 */
export const None: None = { _tag: 'None' };

// =============================================================================
// OPTION TYPE GUARDS
// =============================================================================

/**
 * Type guard for Some variant
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option._tag === 'Some';
}

/**
 * Type guard for None variant
 */
export function isNone<T>(option: Option<T>): option is None {
  return option._tag === 'None';
}

// =============================================================================
// OPTION OPERATIONS
// =============================================================================

/**
 * Option operations namespace
 */
export const Option = {
  /**
   * Creates a Some
   */
  some<T>(value: T): Option<T> {
    return Some(value);
  },

  /**
   * Returns None
   */
  none<T = never>(): Option<T> {
    return None;
  },

  /**
   * Creates an Option from a nullable value
   */
  fromNullable<T>(value: T | null | undefined): Option<T> {
    return value !== null && value !== undefined ? Some(value) : None;
  },

  /**
   * Creates an Option from a predicate
   */
  fromPredicate<T>(value: T, predicate: (value: T) => boolean): Option<T> {
    return predicate(value) ? Some(value) : None;
  },

  /**
   * Transforms the value of an Option
   */
  map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
    return isSome(option) ? Some(fn(option.value)) : None;
  },

  /**
   * Chains Option operations
   */
  flatMap<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> {
    return isSome(option) ? fn(option.value) : None;
  },

  /**
   * Alias for flatMap
   */
  andThen<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> {
    return Option.flatMap(option, fn);
  },

  /**
   * Returns alternative Option if this one is None
   */
  orElse<T>(option: Option<T>, fn: () => Option<T>): Option<T> {
    return isSome(option) ? option : fn();
  },

  /**
   * Pattern matches on Option
   */
  fold<T, U>(option: Option<T>, onNone: () => U, onSome: (value: T) => U): U {
    return isSome(option) ? onSome(option.value) : onNone();
  },

  /**
   * Pattern matches with object syntax
   */
  match<T, U>(option: Option<T>, patterns: { some: (value: T) => U; none: () => U }): U {
    return isSome(option) ? patterns.some(option.value) : patterns.none();
  },

  /**
   * Extracts value or returns default
   */
  unwrapOr<T>(option: Option<T>, defaultValue: T): T {
    return isSome(option) ? option.value : defaultValue;
  },

  /**
   * Extracts value or computes default
   */
  unwrapOrElse<T>(option: Option<T>, fn: () => T): T {
    return isSome(option) ? option.value : fn();
  },

  /**
   * Extracts value or throws
   */
  unwrap<T>(option: Option<T>, message?: string): T {
    if (isSome(option)) return option.value;
    throw new Error(message ?? 'Called unwrap on None');
  },

  /**
   * Converts Option to Result
   */
  toResult<T, E>(option: Option<T>, error: E): Result<T, E> {
    return isSome(option) ? Ok(option.value) : Err(error);
  },

  /**
   * Converts Option to nullable
   */
  toNullable<T>(option: Option<T>): T | null {
    return isSome(option) ? option.value : null;
  },

  /**
   * Converts Option to undefined
   */
  toUndefined<T>(option: Option<T>): T | undefined {
    return isSome(option) ? option.value : undefined;
  },

  /**
   * Combines multiple Options
   */
  all<T extends readonly Option<unknown>[]>(
    options: T
  ): Option<{ [K in keyof T]: T[K] extends Option<infer U> ? U : never }> {
    const values: unknown[] = [];
    for (const option of options) {
      if (isNone(option)) return None;
      values.push(option.value);
    }
    return Some(values as never);
  },

  /**
   * Returns first Some or None
   */
  any<T>(options: Option<T>[]): Option<T> {
    for (const option of options) {
      if (isSome(option)) return option;
    }
    return None;
  },

  /**
   * Filters an Option
   */
  filter<T>(option: Option<T>, predicate: (value: T) => boolean): Option<T> {
    if (isNone(option)) return None;
    return predicate(option.value) ? option : None;
  },

  /**
   * Zips two Options
   */
  zip<T, U>(first: Option<T>, second: Option<U>): Option<[T, U]> {
    if (isNone(first) || isNone(second)) return None;
    return Some([first.value, second.value]);
  },

  /**
   * Zips with a combining function
   */
  zipWith<T, U, V>(first: Option<T>, second: Option<U>, fn: (t: T, u: U) => V): Option<V> {
    if (isNone(first) || isNone(second)) return None;
    return Some(fn(first.value, second.value));
  },

  /**
   * Flattens nested Option
   */
  flatten<T>(option: Option<Option<T>>): Option<T> {
    return isSome(option) ? option.value : None;
  },

  /**
   * Taps for side effects
   */
  tap<T>(option: Option<T>, fn: (value: T) => void): Option<T> {
    if (isSome(option)) fn(option.value);
    return option;
  },

  /**
   * Checks if Option contains a value
   */
  contains<T>(option: Option<T>, value: T): boolean {
    return isSome(option) && option.value === value;
  },

  /**
   * Returns true if predicate matches
   */
  exists<T>(option: Option<T>, predicate: (value: T) => boolean): boolean {
    return isSome(option) && predicate(option.value);
  },
};

// =============================================================================
// ASYNC RESULT - Promise-based Result
// =============================================================================

/**
 * AsyncResult - A Promise that resolves to a Result
 * Enables railway-oriented programming with async operations
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;

/**
 * AsyncResult operations namespace
 */
export const AsyncResult = {
  /**
   * Creates a successful AsyncResult
   */
  ok<T>(value: T): AsyncResult<T, never> {
    return Promise.resolve(Ok(value));
  },

  /**
   * Creates a failed AsyncResult
   */
  err<E>(error: E): AsyncResult<never, E> {
    return Promise.resolve(Err(error));
  },

  /**
   * Wraps a Promise into an AsyncResult
   */
  fromPromise<T>(promise: Promise<T>): AsyncResult<T, unknown> {
    return promise.then(Ok).catch(Err);
  },

  /**
   * Wraps a Promise with typed error
   */
  fromPromiseTyped<T, E>(
    promise: Promise<T>,
    errorMapper: (error: unknown) => E
  ): AsyncResult<T, E> {
    return promise.then(Ok).catch((error: unknown) => Err(errorMapper(error)));
  },

  /**
   * Maps the success value
   */
  map<T, U, E>(asyncResult: AsyncResult<T, E>, fn: (value: T) => U): AsyncResult<U, E> {
    return asyncResult.then((result) => Result.map(result, fn));
  },

  /**
   * Maps the error value
   */
  mapErr<T, E, F>(asyncResult: AsyncResult<T, E>, fn: (error: E) => F): AsyncResult<T, F> {
    return asyncResult.then((result) => Result.mapErr(result, fn));
  },

  /**
   * Chains AsyncResult operations
   */
  flatMap<T, U, E, F>(
    asyncResult: AsyncResult<T, E>,
    fn: (value: T) => AsyncResult<U, F>
  ): AsyncResult<U, E | F> {
    return asyncResult.then(
      (result): Promise<Result<U, E | F>> =>
        isOk(result) ? fn(result.value) : Promise.resolve(result)
    );
  },

  /**
   * Chains with sync Result
   */
  flatMapSync<T, U, E, F>(
    asyncResult: AsyncResult<T, E>,
    fn: (value: T) => Result<U, F>
  ): AsyncResult<U, E | F> {
    return asyncResult.then((result) => (isOk(result) ? fn(result.value) : result));
  },

  /**
   * Pattern matches on AsyncResult
   */
  async match<T, E, U>(
    asyncResult: AsyncResult<T, E>,
    patterns: { ok: (value: T) => U; err: (error: E) => U }
  ): Promise<U> {
    const result = await asyncResult;
    return Result.match(result, patterns);
  },

  /**
   * Unwraps or returns default
   */
  async unwrapOr<T, E>(asyncResult: AsyncResult<T, E>, defaultValue: T): Promise<T> {
    const result = await asyncResult;
    return Result.unwrapOr(result, defaultValue);
  },

  /**
   * Combines multiple AsyncResults
   */
  all<T extends readonly AsyncResult<unknown, unknown>[]>(
    asyncResults: T
  ): AsyncResult<
    { [K in keyof T]: T[K] extends AsyncResult<infer U, unknown> ? U : never },
    T[number] extends AsyncResult<unknown, infer E> ? E : never
  > {
    return Promise.all(asyncResults).then((results) => Result.all(results as never) as never);
  },

  /**
   * Taps for side effects
   */
  tap<T, E>(
    asyncResult: AsyncResult<T, E>,
    fn: (value: T) => void | Promise<void>
  ): AsyncResult<T, E> {
    return asyncResult.then(async (result) => {
      if (isOk(result)) await fn(result.value);
      return result;
    });
  },

  /**
   * Taps error for side effects
   */
  tapErr<T, E>(
    asyncResult: AsyncResult<T, E>,
    fn: (error: E) => void | Promise<void>
  ): AsyncResult<T, E> {
    return asyncResult.then(async (result) => {
      if (isErr(result)) await fn(result.error);
      return result;
    });
  },

  /**
   * Retries an operation on failure
   */
  retry<T, E>(
    fn: () => AsyncResult<T, E>,
    options: { maxAttempts: number; delay?: number }
  ): AsyncResult<T, E> {
    const { maxAttempts, delay = 0 } = options;
    let attempt = 0;

    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        globalThis.setTimeout(() => resolve(), ms);
      });

    const tryOnce = async (): Promise<Result<T, E>> => {
      attempt++;
      const result = await fn();
      if (isOk(result) || attempt >= maxAttempts) return result;
      if (delay > 0) await sleep(delay);
      return tryOnce();
    };

    return tryOnce();
  },

  /**
   * Adds timeout to AsyncResult
   */
  timeout<T, E>(asyncResult: AsyncResult<T, E>, ms: number, timeoutError: E): AsyncResult<T, E> {
    return Promise.race([
      asyncResult,
      new Promise<Result<T, E>>((resolve) =>
        globalThis.setTimeout(() => resolve(Err(timeoutError)), ms)
      ),
    ]);
  },
};

// =============================================================================
// DO NOTATION HELPERS - Monadic Sequencing
// =============================================================================

/**
 * Do notation helper for Result
 * Enables imperative-style sequencing of Result operations
 *
 * @example
 * const result = Do.result
 *   .bind('user', getUser(id))
 *   .bind('orders', ({ user }) => getOrders(user.id))
 *   .map(({ user, orders }) => ({ user, orderCount: orders.length }));
 */
export const Do = {
  result: {
    bind<K extends string, T, E>(key: K, result: Result<T, E>): DoResult<Record<K, T>, E> {
      return new DoResult(isOk(result) ? Ok({ [key]: result.value } as Record<K, T>) : result);
    },
  },

  option: {
    bind<K extends string, T>(key: K, option: Option<T>): DoOption<Record<K, T>> {
      return new DoOption(isSome(option) ? Some({ [key]: option.value } as Record<K, T>) : None);
    },
  },
};

/**
 * Do notation wrapper for Result
 */
class DoResult<T extends object, E> {
  constructor(private readonly result: Result<T, E>) {}

  bind<K extends string, U, F>(
    key: Exclude<K, keyof T>,
    fn: (value: T) => Result<U, F>
  ): DoResult<T & Record<K, U>, E | F> {
    if (isErr(this.result)) return new DoResult(this.result as never);
    const nextResult = fn(this.result.value);
    if (isErr(nextResult)) return new DoResult(nextResult as never);
    return new DoResult(Ok({ ...this.result.value, [key]: nextResult.value } as T & Record<K, U>));
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return Result.map(this.result, fn);
  }

  done(): Result<T, E> {
    return this.result;
  }
}

/**
 * Do notation wrapper for Option
 */
class DoOption<T extends object> {
  constructor(private readonly option: Option<T>) {}

  bind<K extends string, U>(
    key: Exclude<K, keyof T>,
    fn: (value: T) => Option<U>
  ): DoOption<T & Record<K, U>> {
    if (isNone(this.option)) return new DoOption(None);
    const nextOption = fn(this.option.value);
    if (isNone(nextOption)) return new DoOption(None);
    return new DoOption(
      Some({ ...this.option.value, [key]: nextOption.value } as T & Record<K, U>)
    );
  }

  map<U>(fn: (value: T) => U): Option<U> {
    return Option.map(this.option, fn);
  }

  done(): Option<T> {
    return this.option;
  }
}

// =============================================================================
// PIPE AND FLOW UTILITIES
// =============================================================================

/**
 * Pipes a value through a series of functions
 *
 * @example
 * const result = pipe(
 *   5,
 *   x => x * 2,
 *   x => x + 1,
 *   x => x.toString()
 * ); // '11'
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E
): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): F;
export function pipe(value: unknown, ...fns: ((arg: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/**
 * Creates a function that pipes its argument through a series of functions
 *
 * @example
 * const process = flow(
 *   (x: number) => x * 2,
 *   x => x + 1,
 *   x => x.toString()
 * );
 * process(5); // '11'
 */
export function flow<A, B>(ab: (a: A) => B): (a: A) => B;
export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
export function flow<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D;
export function flow<A, B, C, D, E>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E
): (a: A) => E;
export function flow<A, B, C, D, E, F>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): (a: A) => F;
export function flow(...fns: ((arg: unknown) => unknown)[]): (arg: unknown) => unknown {
  return (arg) => fns.reduce((acc, fn) => fn(acc), arg);
}

// =============================================================================
// IDENTITY AND CONSTANT
// =============================================================================

/**
 * Returns its argument unchanged
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * Creates a function that always returns the same value
 */
export function constant<T>(value: T): () => T {
  return () => value;
}
