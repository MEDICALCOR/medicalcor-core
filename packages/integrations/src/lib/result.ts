/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    RESULT MONAD - FUNCTIONAL ERROR HANDLING                   ║
 * ║                                                                               ║
 * ║  Railway-oriented programming for TypeScript. Compose operations that can     ║
 * ║  fail without try/catch boilerplate. Inspired by Rust's Result type.         ║
 * ║                                                                               ║
 * ║  NOTE: Core Result monad is consolidated in @medicalcor/types.               ║
 * ║  This file re-exports from types and adds integration-specific utilities.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { CorrelationId } from './branded-types.js';
import { correlationId } from './branded-types.js';

// =============================================================================
// Re-export Core Result Types from @medicalcor/types
// =============================================================================

// Re-export types - consumers can import Ok/Err types directly from @medicalcor/types if needed
export type { Result, AsyncResult } from '@medicalcor/types';

// Re-export value constructors (Ok, Err), type guards, and Result namespace
export { ok as Ok, err as Err, isOk, isErr, ResultOps } from '@medicalcor/types';

// Import for internal use - alias to avoid conflicts with local ok/err functions
import { ok as makeOk, err as makeErr, isOk, isErr } from '@medicalcor/types';
import type { Result, AsyncResult } from '@medicalcor/types';

// =============================================================================
// Standalone Functions (for integration-specific use)
// These mirror the Result namespace but as standalone functions for convenience
// =============================================================================

/**
 * Create a successful Result (alias for Ok)
 */
export function ok<T>(value: T): Result<T, never> {
  return makeOk(value);
}

/**
 * Create a failed Result (alias for Err)
 */
export function err<E>(error: E): Result<never, E> {
  return makeErr(error);
}

/**
 * Create a Result from a nullable value
 */
export function fromNullable<T, E>(value: T | null | undefined, error: E): Result<T, E> {
  return value !== null && value !== undefined ? makeOk(value) : makeErr(error);
}

/**
 * Create a Result from a boolean condition
 */
export function fromPredicate<T, E>(
  value: T,
  predicate: (v: T) => boolean,
  error: E
): Result<T, E> {
  return predicate(value) ? makeOk(value) : makeErr(error);
}

/**
 * Wrap a function that might throw into a Result
 */
export function tryCatch<T, E = Error>(fn: () => T, onError: (error: unknown) => E): Result<T, E> {
  try {
    return makeOk(fn());
  } catch (e) {
    return makeErr(onError(e));
  }
}

/**
 * Wrap an async function that might throw into an AsyncResult
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  onError: (error: unknown) => E
): AsyncResult<T, E> {
  try {
    return makeOk(await fn());
  } catch (e) {
    return makeErr(onError(e));
  }
}

// =============================================================================
// Transformations (Functor/Monad Operations)
// =============================================================================

/**
 * Transform the success value (Functor map)
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? makeOk(fn(result.value)) : result;
}

/**
 * Transform the error value
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? makeErr(fn(result.error)) : result;
}

/**
 * Chain Results (Monad flatMap/bind)
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Async version of flatMap
 */
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => AsyncResult<U, E>
): AsyncResult<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Apply a Result-wrapped function to a Result value (Applicative)
 */
export function ap<T, U, E>(
  resultFn: Result<(value: T) => U, E>,
  result: Result<T, E>
): Result<U, E> {
  if (isErr(resultFn)) return resultFn;
  if (isErr(result)) return result;
  return makeOk(resultFn.value(result.value));
}

// =============================================================================
// Recovery & Fallbacks
// =============================================================================

/**
 * Provide a fallback value if Result is Err
 */
export function getOrElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Provide a fallback value from a function if Result is Err
 */
export function getOrElseW<T, E, U>(result: Result<T, E>, fn: (error: E) => U): T | U {
  return isOk(result) ? result.value : fn(result.error);
}

/**
 * Attempt recovery from an error
 */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>
): Result<T, F> {
  return isErr(result) ? fn(result.error) : result;
}

/**
 * Recover from specific errors
 */
export function recover<T, E>(
  result: Result<T, E>,
  predicate: (error: E) => boolean,
  recovery: (error: E) => T
): Result<T, E> {
  if (isErr(result) && predicate(result.error)) {
    return makeOk(recovery(result.error));
  }
  return result;
}

// =============================================================================
// Matching & Extraction
// =============================================================================

/**
 * Pattern match on Result - exhaustive handling
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
}

/**
 * Unwrap the success value or throw the error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) return result.value;
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Unwrap the success value or throw with custom error
 */
export function expect<T, E>(result: Result<T, E>, message: string): T {
  if (isOk(result)) return result.value;
  throw new Error(`${message}: ${String(result.error)}`);
}

/**
 * Unwrap the error or throw
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isErr(result)) return result.error;
  throw new Error('Called unwrapErr on Ok value');
}

// =============================================================================
// Combining Results
// =============================================================================

/**
 * Combine multiple Results into a single Result of tuple
 */
export function all<T extends readonly Result<unknown, unknown>[]>(
  results: T
): Result<
  { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
  T[number] extends Result<unknown, infer E> ? E : never
> {
  const values: unknown[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result as Result<never, T[number] extends Result<unknown, infer E> ? E : never>;
    }
    values.push(result.value);
  }
  return makeOk(values) as Result<
    { [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
    never
  >;
}

/**
 * Combine multiple Results, collecting all errors
 */
export function allSettled<T, E>(results: readonly Result<T, E>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return errors.length > 0 ? makeErr(errors) : makeOk(values);
}

/**
 * Return the first Ok result, or the last Err
 */
export function firstOk<T, E>(results: readonly Result<T, E>[]): Result<T, E> {
  let lastErr: Result<T, E> | undefined;

  for (const result of results) {
    if (isOk(result)) return result;
    lastErr = result;
  }

  return lastErr ?? makeErr(undefined as E);
}

/**
 * Sequence Results from object values
 */
export function sequenceS<R extends Record<string, Result<unknown, unknown>>>(
  results: R
): Result<
  { [K in keyof R]: R[K] extends Result<infer T, unknown> ? T : never },
  R[keyof R] extends Result<unknown, infer E> ? E : never
> {
  const entries = Object.entries(results);
  const resultEntries: [string, unknown][] = [];

  for (const [key, result] of entries) {
    if (isErr(result)) {
      return result as Result<never, R[keyof R] extends Result<unknown, infer E> ? E : never>;
    }
    resultEntries.push([key, result.value]);
  }

  return makeOk(Object.fromEntries(resultEntries)) as Result<
    { [K in keyof R]: R[K] extends Result<infer T, unknown> ? T : never },
    never
  >;
}

// =============================================================================
// Side Effects
// =============================================================================

/**
 * Execute side effect on success without changing the Result
 */
export function tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> {
  if (isOk(result)) fn(result.value);
  return result;
}

/**
 * Execute side effect on error without changing the Result
 */
export function tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> {
  if (isErr(result)) fn(result.error);
  return result;
}

// =============================================================================
// Integration Error Types
// =============================================================================

/**
 * Base integration error with rich context
 */
export interface IntegrationError {
  readonly code: IntegrationErrorCode;
  readonly message: string;
  readonly service: string;
  readonly correlationId: CorrelationId;
  readonly timestamp: Date;
  readonly retryable: boolean;
  readonly cause?: Error | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * Error codes for integration failures
 */
export type IntegrationErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'CIRCUIT_OPEN'
  | 'INTERNAL_ERROR';

/**
 * Create an integration error
 */
export function integrationError(
  code: IntegrationErrorCode,
  service: string,
  message: string,
  options: {
    retryable?: boolean;
    cause?: Error;
    correlationId?: CorrelationId | undefined;
    metadata?: Record<string, unknown>;
  } = {}
): IntegrationError {
  return {
    code,
    service,
    message,
    correlationId: options.correlationId ?? correlationId(),
    timestamp: new Date(),
    retryable: options.retryable ?? isRetryableCode(code),
    cause: options.cause,
    metadata: options.metadata,
  };
}

/**
 * Determine if an error code is typically retryable
 */
function isRetryableCode(code: IntegrationErrorCode): boolean {
  switch (code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
    case 'RATE_LIMITED':
    case 'EXTERNAL_SERVICE_ERROR':
    case 'CIRCUIT_OPEN':
      return true;
    case 'AUTHENTICATION_FAILED':
    case 'AUTHORIZATION_FAILED':
    case 'VALIDATION_ERROR':
    case 'NOT_FOUND':
    case 'CONFLICT':
    case 'WEBHOOK_SIGNATURE_INVALID':
    case 'INTERNAL_ERROR':
      return false;
  }
}

/**
 * Integration-specific Result type
 */
export type IntegrationResult<T> = Result<T, IntegrationError>;

/**
 * Async integration Result
 */
export type AsyncIntegrationResult<T> = AsyncResult<T, IntegrationError>;

// =============================================================================
// Utility Functions for Integration Results
// =============================================================================

/**
 * Convert thrown error to integration error
 */
export function toIntegrationError(
  error: unknown,
  service: string,
  correlationId?: CorrelationId
): IntegrationError {
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('timeout') || error.name === 'AbortError') {
      return integrationError('TIMEOUT', service, `Request timed out: ${error.message}`, {
        cause: error,
        correlationId,
        retryable: true,
      });
    }

    if (error.message.includes('rate_limit') || error.message.includes('429')) {
      return integrationError('RATE_LIMITED', service, `Rate limit exceeded: ${error.message}`, {
        cause: error,
        correlationId,
        retryable: true,
      });
    }

    if (error.message.includes('401') || error.message.includes('authentication')) {
      return integrationError(
        'AUTHENTICATION_FAILED',
        service,
        `Authentication failed: ${error.message}`,
        {
          cause: error,
          correlationId,
          retryable: false,
        }
      );
    }

    if (error.message.includes('403') || error.message.includes('authorization')) {
      return integrationError(
        'AUTHORIZATION_FAILED',
        service,
        `Authorization failed: ${error.message}`,
        {
          cause: error,
          correlationId,
          retryable: false,
        }
      );
    }

    if (error.message.includes('404') || error.message.includes('not found')) {
      return integrationError('NOT_FOUND', service, `Resource not found: ${error.message}`, {
        cause: error,
        correlationId,
        retryable: false,
      });
    }

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return integrationError('NETWORK_ERROR', service, `Network error: ${error.message}`, {
        cause: error,
        correlationId,
        retryable: true,
      });
    }

    return integrationError('EXTERNAL_SERVICE_ERROR', service, error.message, {
      cause: error,
      correlationId,
      retryable: true,
    });
  }

  return integrationError('INTERNAL_ERROR', service, String(error), {
    correlationId,
    retryable: false,
  });
}

/**
 * Wrap an async operation with automatic error conversion
 */
export async function wrapAsync<T>(
  service: string,
  operation: () => Promise<T>,
  correlationId?: CorrelationId
): AsyncIntegrationResult<T> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toIntegrationError(error, service, correlationId));
  }
}

/**
 * Retry a Result-returning operation
 */
export async function retryResult<T>(
  operation: () => AsyncIntegrationResult<T>,
  options: {
    maxRetries: number;
    baseDelayMs: number;
    shouldRetry?: (error: IntegrationError) => boolean;
  }
): AsyncIntegrationResult<T> {
  const { maxRetries, baseDelayMs, shouldRetry = (e) => e.retryable } = options;

  // Handle edge case of no retries
  if (maxRetries < 0) {
    return operation();
  }

  let lastResult: Result<T, IntegrationError> = await operation();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isOk(lastResult)) {
      return lastResult;
    }

    const lastError = lastResult.error;

    if (!shouldRetry(lastError) || attempt === maxRetries) {
      return lastResult;
    }

    // Exponential backoff
    const delay = baseDelayMs * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));

    lastResult = await operation();
  }

  return lastResult;
}

// =============================================================================
// Pipeline Builder (Do-notation simulation)
// =============================================================================

/**
 * Pipeline builder for chaining Result operations
 *
 * @example
 * ```typescript
 * const result = await pipeline
 *   .start(fetchUser(userId))
 *   .then(user => fetchOrders(user.id))
 *   .then(orders => calculateTotal(orders))
 *   .run();
 * ```
 */
export class ResultPipeline<T, E> {
  private constructor(private readonly result: AsyncResult<T, E>) {}

  static start<T, E>(result: Result<T, E> | AsyncResult<T, E>): ResultPipeline<T, E> {
    return new ResultPipeline(Promise.resolve(result).then((r) => r));
  }

  then<U>(fn: (value: T) => Result<U, E> | AsyncResult<U, E>): ResultPipeline<U, E> {
    return new ResultPipeline(
      this.result.then(async (result) => {
        if (isErr(result)) return result;
        const next = fn(result.value);
        return next instanceof Promise ? next : next;
      })
    );
  }

  map<U>(fn: (value: T) => U): ResultPipeline<U, E> {
    return new ResultPipeline(
      this.result.then((result) => (isOk(result) ? ok(fn(result.value)) : result))
    );
  }

  mapErr<F>(fn: (error: E) => F): ResultPipeline<T, F> {
    return new ResultPipeline(
      this.result.then((result) => (isErr(result) ? err(fn(result.error)) : result))
    );
  }

  recover(fn: (error: E) => T): ResultPipeline<T, never> {
    return new ResultPipeline(
      this.result.then((result) => (isErr(result) ? ok(fn(result.error)) : result)) as AsyncResult<
        T,
        never
      >
    );
  }

  tap(fn: (value: T) => void | Promise<void>): ResultPipeline<T, E> {
    return new ResultPipeline(
      this.result.then(async (result) => {
        if (isOk(result)) await fn(result.value);
        return result;
      })
    );
  }

  tapErr(fn: (error: E) => void | Promise<void>): ResultPipeline<T, E> {
    return new ResultPipeline(
      this.result.then(async (result) => {
        if (isErr(result)) await fn(result.error);
        return result;
      })
    );
  }

  async run(): AsyncResult<T, E> {
    return this.result;
  }

  async unwrap(): Promise<T> {
    const result = await this.result;
    return unwrap(result);
  }

  async getOrElse(defaultValue: T): Promise<T> {
    const result = await this.result;
    return getOrElse(result, defaultValue);
  }
}

/**
 * Start a Result pipeline
 */
export function pipeline<T, E>(result: Result<T, E> | AsyncResult<T, E>): ResultPipeline<T, E> {
  return ResultPipeline.start(result);
}
