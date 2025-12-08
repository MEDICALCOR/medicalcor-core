/**
 * Pipeline & Functional Composition Utilities
 *
 * Provides type-safe function composition and pipeline operators.
 * This enables a declarative, functional programming style while
 * maintaining full type safety.
 *
 * @example
 * ```ts
 * const result = pipe(
 *   user,
 *   validateUser,
 *   enrichUserData,
 *   saveUser,
 *   formatResponse
 * );
 *
 * // Or with async operations
 * const result = await pipeAsync(
 *   userId,
 *   fetchUser,
 *   updateUser,
 *   notifyUser
 * );
 * ```
 *
 * @module types/pipeline
 */

import { type Result, Ok, Err, type AsyncResult } from './result.js';

// ============================================================================
// PIPE FUNCTION - Left to Right Composition
// ============================================================================

/**
 * Pipe a value through a series of functions from left to right.
 * Each function receives the output of the previous function.
 *
 * @example
 * ```ts
 * const add1 = (x: number) => x + 1;
 * const double = (x: number) => x * 2;
 * const toString = (x: number) => String(x);
 *
 * pipe(5, add1, double, toString); // "12"
 * ```
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
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G
): G;
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H
): H;
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I
): I;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (i: I) => J
): J;
export function pipe(a: unknown, ...fns: ((x: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), a);
}

// ============================================================================
// FLOW FUNCTION - Creates a Pipeline Function
// ============================================================================

/**
 * Create a function that pipes its argument through the given functions.
 * Unlike pipe(), flow() returns a function that can be called later.
 *
 * @example
 * ```ts
 * const process = flow(
 *   parseInput,
 *   validate,
 *   transform,
 *   format
 * );
 *
 * const result = process(rawInput);
 * ```
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
export function flow<A, B, C, D, E, F, G>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G
): (a: A) => G;
export function flow<A, B, C, D, E, F, G, H>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H
): (a: A) => H;
export function flow<A, B, C, D, E, F, G, H, I>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I
): (a: A) => I;
export function flow(...fns: ((x: unknown) => unknown)[]): (a: unknown) => unknown {
  return (a) => fns.reduce((acc, fn) => fn(acc), a);
}

// ============================================================================
// COMPOSE - Right to Left Composition
// ============================================================================

/**
 * Compose functions from right to left.
 * Mathematical function composition: (f ∘ g)(x) = f(g(x))
 *
 * @example
 * ```ts
 * const add1 = (x: number) => x + 1;
 * const double = (x: number) => x * 2;
 *
 * const composed = compose(double, add1);
 * composed(5); // double(add1(5)) = double(6) = 12
 * ```
 */
export function compose<A, B>(ab: (a: A) => B): (a: A) => B;
export function compose<A, B, C>(bc: (b: B) => C, ab: (a: A) => B): (a: A) => C;
export function compose<A, B, C, D>(cd: (c: C) => D, bc: (b: B) => C, ab: (a: A) => B): (a: A) => D;
export function compose<A, B, C, D, E>(
  de: (d: D) => E,
  cd: (c: C) => D,
  bc: (b: B) => C,
  ab: (a: A) => B
): (a: A) => E;
export function compose(...fns: ((x: unknown) => unknown)[]): (a: unknown) => unknown {
  return (a) => fns.reduceRight((acc, fn) => fn(acc), a);
}

// ============================================================================
// ASYNC PIPE - Pipeline with Promises
// ============================================================================

/**
 * Async version of pipe - each function can return a Promise.
 * Handles both sync and async functions seamlessly.
 *
 * @example
 * ```ts
 * const result = await pipeAsync(
 *   userId,
 *   fetchUser,
 *   updateUser,
 *   sendNotification
 * );
 * ```
 */
export async function pipeAsync<A>(a: A): Promise<A>;
export async function pipeAsync<A, B>(a: A, ab: (a: A) => B | Promise<B>): Promise<B>;
export async function pipeAsync<A, B, C>(
  a: A,
  ab: (a: A) => B | Promise<B>,
  bc: (b: B) => C | Promise<C>
): Promise<C>;
export async function pipeAsync<A, B, C, D>(
  a: A,
  ab: (a: A) => B | Promise<B>,
  bc: (b: B) => C | Promise<C>,
  cd: (c: C) => D | Promise<D>
): Promise<D>;
export async function pipeAsync<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B | Promise<B>,
  bc: (b: B) => C | Promise<C>,
  cd: (c: C) => D | Promise<D>,
  de: (d: D) => E | Promise<E>
): Promise<E>;
export async function pipeAsync<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B | Promise<B>,
  bc: (b: B) => C | Promise<C>,
  cd: (c: C) => D | Promise<D>,
  de: (d: D) => E | Promise<E>,
  ef: (e: E) => F | Promise<F>
): Promise<F>;
export async function pipeAsync<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B | Promise<B>,
  bc: (b: B) => C | Promise<C>,
  cd: (c: C) => D | Promise<D>,
  de: (d: D) => E | Promise<E>,
  ef: (e: E) => F | Promise<F>,
  fg: (f: F) => G | Promise<G>
): Promise<G>;
export async function pipeAsync(a: unknown, ...fns: ((x: unknown) => unknown)[]): Promise<unknown> {
  let result = a;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result;
}

// ============================================================================
// RESULT PIPE - Pipeline with Result Type
// ============================================================================

/**
 * Pipe a value through functions that return Result types.
 * Short-circuits on first error.
 *
 * @example
 * ```ts
 * const result = pipeResult(
 *   rawInput,
 *   validate,      // Result<Validated, ValidationError>
 *   transform,     // Result<Transformed, TransformError>
 *   save           // Result<Saved, SaveError>
 * );
 * ```
 */
export function pipeResult<A, E>(a: A): Result<A, E>;
export function pipeResult<A, B, E>(a: A, ab: (a: A) => Result<B, E>): Result<B, E>;
export function pipeResult<A, B, C, E>(
  a: A,
  ab: (a: A) => Result<B, E>,
  bc: (b: B) => Result<C, E>
): Result<C, E>;
export function pipeResult<A, B, C, D, E>(
  a: A,
  ab: (a: A) => Result<B, E>,
  bc: (b: B) => Result<C, E>,
  cd: (c: C) => Result<D, E>
): Result<D, E>;
export function pipeResult<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => Result<B, F>,
  bc: (b: B) => Result<C, F>,
  cd: (c: C) => Result<D, F>,
  de: (d: D) => Result<E, F>
): Result<E, F>;
export function pipeResult<T, E>(a: T, ...fns: ((x: T) => Result<T, E>)[]): Result<T, E> {
  let result: Result<T, E> = Ok(a);
  for (const fn of fns) {
    if (result.isErr) {
      return result;
    }
    result = fn(result.value);
  }
  return result;
}

/**
 * Async version of pipeResult
 */
export async function pipeResultAsync<A, E>(a: A): AsyncResult<A, E>;
export async function pipeResultAsync<A, B, E>(
  a: A,
  ab: (a: A) => AsyncResult<B, E>
): AsyncResult<B, E>;
export async function pipeResultAsync<A, B, C, E>(
  a: A,
  ab: (a: A) => AsyncResult<B, E>,
  bc: (b: B) => AsyncResult<C, E>
): AsyncResult<C, E>;
export async function pipeResultAsync<A, B, C, D, E>(
  a: A,
  ab: (a: A) => AsyncResult<B, E>,
  bc: (b: B) => AsyncResult<C, E>,
  cd: (c: C) => AsyncResult<D, E>
): AsyncResult<D, E>;
export async function pipeResultAsync<T, E>(
  a: T,
  ...fns: ((x: T) => AsyncResult<T, E>)[]
): AsyncResult<T, E> {
  let result: Result<T, E> = Ok(a);
  for (const fn of fns) {
    if (result.isErr) {
      return result;
    }
    result = await fn(result.value);
  }
  return result;
}

// ============================================================================
// TAP - Side Effects in Pipelines
// ============================================================================

/**
 * Execute a side effect without changing the value.
 * Useful for logging, debugging, or triggering other actions in a pipeline.
 *
 * @example
 * ```ts
 * pipe(
 *   data,
 *   tap(x => console.log('Before:', x)),
 *   transform,
 *   tap(x => console.log('After:', x))
 * );
 * ```
 */
export function tap<T>(fn: (value: T) => void): (value: T) => T {
  return (value) => {
    fn(value);
    return value;
  };
}

/**
 * Async version of tap
 */
export function tapAsync<T>(fn: (value: T) => Promise<void>): (value: T) => Promise<T> {
  return async (value) => {
    await fn(value);
    return value;
  };
}

/**
 * Execute a side effect only if a condition is true
 */
export function tapIf<T>(
  condition: (value: T) => boolean,
  fn: (value: T) => void
): (value: T) => T {
  return (value) => {
    if (condition(value)) {
      fn(value);
    }
    return value;
  };
}

// ============================================================================
// CONDITIONAL TRANSFORMS
// ============================================================================

/**
 * Apply a transformation only if a condition is met
 */
export function when<T>(
  condition: (value: T) => boolean,
  transform: (value: T) => T
): (value: T) => T {
  return (value) => (condition(value) ? transform(value) : value);
}

/**
 * Apply one of two transformations based on a condition
 */
export function ifElse<T, U>(
  condition: (value: T) => boolean,
  onTrue: (value: T) => U,
  onFalse: (value: T) => U
): (value: T) => U {
  return (value) => (condition(value) ? onTrue(value) : onFalse(value));
}

/**
 * Pattern matching style transformation
 */
export function match<T, K extends string, R>(
  getKey: (value: T) => K,
  handlers: Record<K, (value: T) => R>,
  defaultHandler?: (value: T) => R
): (value: T) => R {
  return (value) => {
    const key = getKey(value);
    const handler = handlers[key];
     
    if (handler) {
      return handler(value);
    }
    if (defaultHandler) {
      return defaultHandler(value);
    }
    throw new Error(`No handler for key: ${key}`);
  };
}

// ============================================================================
// ARRAY PIPELINE OPERATORS
// ============================================================================

/**
 * Map over an array in a pipeline
 */
export function map<T, U>(fn: (value: T) => U): (arr: T[]) => U[] {
  return (arr) => arr.map(fn);
}

/**
 * Filter an array in a pipeline
 */
export function filter<T>(predicate: (value: T) => boolean): (arr: T[]) => T[] {
  return (arr) => arr.filter(predicate);
}

/**
 * Reduce an array in a pipeline
 */
export function reduce<T, U>(fn: (acc: U, value: T) => U, initial: U): (arr: T[]) => U {
  return (arr) => arr.reduce(fn, initial);
}

/**
 * FlatMap over an array in a pipeline
 */
export function flatMap<T, U>(fn: (value: T) => U[]): (arr: T[]) => U[] {
  return (arr) => arr.flatMap(fn);
}

/**
 * Sort an array in a pipeline
 */
export function sort<T>(compareFn?: (a: T, b: T) => number): (arr: T[]) => T[] {
  return (arr) => [...arr].sort(compareFn);
}

/**
 * Take first n elements in a pipeline
 */
export function take<T>(n: number): (arr: T[]) => T[] {
  return (arr) => arr.slice(0, n);
}

/**
 * Skip first n elements in a pipeline
 */
export function skip<T>(n: number): (arr: T[]) => T[] {
  return (arr) => arr.slice(n);
}

/**
 * Get unique elements in a pipeline
 */
export function unique<T>(): (arr: T[]) => T[] {
  return (arr) => [...new Set(arr)];
}

/**
 * Get unique elements by key in a pipeline
 */
export function uniqueBy<T>(keyFn: (value: T) => unknown): (arr: T[]) => T[] {
  return (arr) => {
    const seen = new Set<unknown>();
    return arr.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };
}

/**
 * Group elements by key in a pipeline
 */
export function groupBy<T, K extends string | number | symbol>(
  keyFn: (value: T) => K
): (arr: T[]) => Record<K, T[]> {
  return (arr) => {
    const result = {} as Record<K, T[]>;
    for (const item of arr) {
      const key = keyFn(item);
       
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
    }
    return result;
  };
}

/**
 * Partition array into [matches, non-matches] in a pipeline
 */
export function partition<T>(predicate: (value: T) => boolean): (arr: T[]) => [T[], T[]] {
  return (arr) => {
    const matches: T[] = [];
    const nonMatches: T[] = [];
    for (const item of arr) {
      if (predicate(item)) {
        matches.push(item);
      } else {
        nonMatches.push(item);
      }
    }
    return [matches, nonMatches];
  };
}

// ============================================================================
// OBJECT PIPELINE OPERATORS
// ============================================================================

/**
 * Pick specific keys from an object in a pipeline
 */
export function pick<T extends object, K extends keyof T>(...keys: K[]): (obj: T) => Pick<T, K> {
  return (obj) => {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      result[key] = obj[key];
    }
    return result;
  };
}

/**
 * Omit specific keys from an object in a pipeline
 */
export function omit<T extends object, K extends keyof T>(...keys: K[]): (obj: T) => Omit<T, K> {
  return (obj) => {
    const keysToOmit = new Set<K>(keys);
    const entries = Object.entries(obj) as [keyof T, T[keyof T]][];
    const filtered = entries.filter(([k]) => !keysToOmit.has(k as K));
    return Object.fromEntries(filtered) as Omit<T, K>;
  };
}

/**
 * Merge objects in a pipeline
 */
export function merge<T extends object, U extends object>(other: U): (obj: T) => T & U {
  return (obj) => ({ ...obj, ...other });
}

/**
 * Map over object values in a pipeline
 */
export function mapValues<T extends object, U>(
  fn: (value: T[keyof T], key: keyof T) => U
): (obj: T) => { [K in keyof T]: U } {
  return (obj) => {
    const result = {} as { [K in keyof T]: U };
    for (const key of Object.keys(obj) as (keyof T)[]) {
      result[key] = fn(obj[key], key);
    }
    return result;
  };
}

/**
 * Filter object entries in a pipeline
 */
export function filterEntries<T extends object>(
  predicate: (key: keyof T, value: T[keyof T]) => boolean
): (obj: T) => Partial<T> {
  return (obj) => {
    const result = {} as Partial<T>;
    for (const key of Object.keys(obj) as (keyof T)[]) {
      if (predicate(key, obj[key])) {
        result[key] = obj[key];
      }
    }
    return result;
  };
}

// ============================================================================
// VALIDATION PIPELINE
// ============================================================================

/**
 * Validation error type
 */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code?: string;
}

/**
 * Create a validator function for use in pipelines
 */
export function validator<T>(
  validate: (value: T) => ValidationError | null
): (value: T) => Result<T, ValidationError> {
  return (value) => {
    const error = validate(value);
    return error ? Err(error) : Ok(value);
  };
}

/**
 * Combine multiple validators
 */
export function validators<T>(
  ...fns: ((value: T) => ValidationError | null)[]
): (value: T) => Result<T, ValidationError[]> {
  return (value) => {
    const errors: ValidationError[] = [];
    for (const fn of fns) {
      const error = fn(value);
      if (error) {
        errors.push(error);
      }
    }
    return errors.length > 0 ? Err(errors) : Ok(value);
  };
}
