/**
 * Comprehensive tests for lib/result.ts
 * Tests Result monad, integration errors, and utility functions
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  ok,
  err,
  isOk,
  isErr,
  fromNullable,
  fromPredicate,
  tryCatch,
  tryCatchAsync,
  map,
  mapErr,
  flatMap,
  flatMapAsync,
  ap,
  getOrElse,
  getOrElseW,
  orElse,
  recover,
  match,
  unwrap,
  expect as expectResult,
  unwrapErr,
  all,
  allSettled,
  firstOk,
  sequenceS,
  tap,
  tapErr,
  integrationError,
  toIntegrationError,
  wrapAsync,
  retryResult,
  pipeline,
  ResultPipeline,
  type IntegrationError,
  type IntegrationResult,
} from '../lib/result.js';
import { correlationId } from '../lib/branded-types.js';

describe('lib/result - Result constructors', () => {
  describe('ok', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Ok with null value', () => {
      const result = ok(null);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeNull();
      }
    });

    it('should create Ok with object', () => {
      const obj = { name: 'test', value: 123 };
      const result = ok(obj);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(obj);
      }
    });
  });

  describe('err', () => {
    it('should create Err result', () => {
      const result = err('error');
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });

    it('should create Err with Error object', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('fromNullable', () => {
    it('should create Ok for non-null value', () => {
      const result = fromNullable(42, 'value is null');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err for null', () => {
      const result = fromNullable(null, 'value is null');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('value is null');
      }
    });

    it('should create Err for undefined', () => {
      const result = fromNullable(undefined, 'value is undefined');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('value is undefined');
      }
    });
  });

  describe('fromPredicate', () => {
    it('should create Ok when predicate returns true', () => {
      const result = fromPredicate(42, (x) => x > 0, 'value must be positive');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err when predicate returns false', () => {
      const result = fromPredicate(-5, (x) => x > 0, 'value must be positive');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('value must be positive');
      }
    });
  });

  describe('tryCatch', () => {
    it('should create Ok when function succeeds', () => {
      const result = tryCatch(
        () => 42,
        (e) => String(e)
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err when function throws', () => {
      const result = tryCatch(
        () => {
          throw new Error('test error');
        },
        (e) => (e instanceof Error ? e.message : String(e))
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('test error');
      }
    });
  });

  describe('tryCatchAsync', () => {
    it('should create Ok when async function succeeds', async () => {
      const result = await tryCatchAsync(
        async () => 42,
        (e) => String(e)
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err when async function throws', async () => {
      const result = await tryCatchAsync(
        async () => {
          throw new Error('async error');
        },
        (e) => (e instanceof Error ? e.message : String(e))
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('async error');
      }
    });
  });
});

describe('lib/result - Transformations', () => {
  describe('map', () => {
    it('should transform Ok value', () => {
      const result = map(ok(5), (x) => x * 2);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should not transform Err', () => {
      const result = map(err<number, string>('error'), (x) => x * 2);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('mapErr', () => {
    it('should transform Err value', () => {
      const result = mapErr(err('error'), (e) => `transformed: ${e}`);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('transformed: error');
      }
    });

    it('should not transform Ok', () => {
      const result = mapErr(ok<number, string>(42), (e) => `transformed: ${e}`);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('flatMap', () => {
    it('should chain Ok results', () => {
      const result = flatMap(ok(5), (x) => ok(x * 2));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should propagate Err', () => {
      const result = flatMap(err<number, string>('error'), (x) => ok(x * 2));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });

    it('should handle function returning Err', () => {
      const result = flatMap(ok(5), () => err<number, string>('operation failed'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('operation failed');
      }
    });
  });

  describe('flatMapAsync', () => {
    it('should chain async Ok results', async () => {
      const result = await flatMapAsync(ok(5), async (x) => ok(x * 2));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should propagate Err in async chain', async () => {
      const result = await flatMapAsync(err<number, string>('error'), async (x) => ok(x * 2));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('ap', () => {
    it('should apply function in Ok to Ok value', () => {
      const fnResult = ok((x: number) => x * 2);
      const valueResult = ok(5);
      const result = ap(fnResult, valueResult);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should propagate Err from function', () => {
      const fnResult = err<(x: number) => number, string>('function error');
      const valueResult = ok(5);
      const result = ap(fnResult, valueResult);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('function error');
      }
    });

    it('should propagate Err from value', () => {
      const fnResult = ok((x: number) => x * 2);
      const valueResult = err<number, string>('value error');
      const result = ap(fnResult, valueResult);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('value error');
      }
    });
  });
});

describe('lib/result - Recovery & Fallbacks', () => {
  describe('getOrElse', () => {
    it('should return value from Ok', () => {
      const value = getOrElse(ok(42), 0);
      expect(value).toBe(42);
    });

    it('should return default from Err', () => {
      const value = getOrElse(err('error'), 0);
      expect(value).toBe(0);
    });
  });

  describe('getOrElseW', () => {
    it('should return value from Ok', () => {
      const value = getOrElseW(ok(42), () => 'fallback');
      expect(value).toBe(42);
    });

    it('should call function and return result from Err', () => {
      const value = getOrElseW(err('error'), (e) => `fallback: ${e}`);
      expect(value).toBe('fallback: error');
    });
  });

  describe('orElse', () => {
    it('should keep Ok result', () => {
      const result = orElse(ok(42), () => ok(0));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should call recovery function on Err', () => {
      const result = orElse(err('error'), (e) => ok(`recovered from: ${e}`));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('recovered from: error');
      }
    });
  });

  describe('recover', () => {
    it('should not recover from Ok', () => {
      const result = recover(
        ok(42),
        () => true,
        () => 0
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should recover from matching Err', () => {
      const result = recover(
        err('error'),
        (e) => e === 'error',
        () => 42
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should not recover from non-matching Err', () => {
      const result = recover(
        err('error'),
        (e) => e === 'other',
        () => 42
      );
      expect(isErr(result)).toBe(true);
    });
  });
});

describe('lib/result - Matching & Extraction', () => {
  describe('match', () => {
    it('should call ok handler for Ok', () => {
      const result = match(ok(42), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe('value: 42');
    });

    it('should call err handler for Err', () => {
      const result = match(err('failed'), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe('error: failed');
    });
  });

  describe('unwrap', () => {
    it('should return value from Ok', () => {
      const value = unwrap(ok(42));
      expect(value).toBe(42);
    });

    it('should throw Error from Err with Error', () => {
      const error = new Error('test error');
      expect(() => unwrap(err(error))).toThrow('test error');
    });

    it('should throw Error from Err with string', () => {
      expect(() => unwrap(err('string error'))).toThrow('string error');
    });
  });

  describe('expect', () => {
    it('should return value from Ok', () => {
      const value = expectResult(ok(42), 'Expected a value');
      expect(value).toBe(42);
    });

    it('should throw with custom message from Err', () => {
      expect(() => expectResult(err('failed'), 'Custom message')).toThrow('Custom message');
    });
  });

  describe('unwrapErr', () => {
    it('should return error from Err', () => {
      const error = unwrapErr(err('error'));
      expect(error).toBe('error');
    });

    it('should throw for Ok', () => {
      expect(() => unwrapErr(ok(42))).toThrow('Called unwrapErr on Ok value');
    });
  });
});

describe('lib/result - Combining Results', () => {
  describe('all', () => {
    it('should combine all Ok results', () => {
      const results = [ok(1), ok(2), ok(3)] as const;
      const combined = all(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err', () => {
      const results = [ok(1), err('error'), ok(3)] as const;
      const combined = all(results);
      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe('error');
      }
    });

    it('should handle empty array', () => {
      const combined = all([]);
      expect(isOk(combined)).toBe(true);
    });
  });

  describe('allSettled', () => {
    it('should collect all Ok values', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = allSettled(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should collect all errors', () => {
      const results = [ok(1), err('error1'), err('error2')];
      const combined = allSettled(results);
      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toEqual(['error1', 'error2']);
      }
    });

    it('should handle all errors', () => {
      const results = [err('error1'), err('error2')];
      const combined = allSettled(results);
      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toEqual(['error1', 'error2']);
      }
    });
  });

  describe('firstOk', () => {
    it('should return first Ok', () => {
      const results = [err('e1'), ok(42), ok(100)];
      const result = firstOk(results);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return last Err if all fail', () => {
      const results = [err('e1'), err('e2'), err('e3')];
      const result = firstOk(results);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('e3');
      }
    });

    it('should handle empty array', () => {
      const result = firstOk([]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('sequenceS', () => {
    it('should combine object of Ok results', () => {
      const results = {
        a: ok(1),
        b: ok('test'),
        c: ok(true),
      };
      const combined = sequenceS(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual({ a: 1, b: 'test', c: true });
      }
    });

    it('should return first Err in object', () => {
      const results = {
        a: ok(1),
        b: err('error'),
        c: ok(true),
      };
      const combined = sequenceS(results);
      expect(isErr(combined)).toBe(true);
    });
  });
});

describe('lib/result - Side Effects', () => {
  describe('tap', () => {
    it('should execute side effect on Ok', () => {
      const sideEffect = vi.fn();
      const result = tap(ok(42), sideEffect);
      expect(sideEffect).toHaveBeenCalledWith(42);
      expect(isOk(result)).toBe(true);
    });

    it('should not execute side effect on Err', () => {
      const sideEffect = vi.fn();
      const result = tap(err('error'), sideEffect);
      expect(sideEffect).not.toHaveBeenCalled();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('tapErr', () => {
    it('should execute side effect on Err', () => {
      const sideEffect = vi.fn();
      const result = tapErr(err('error'), sideEffect);
      expect(sideEffect).toHaveBeenCalledWith('error');
      expect(isErr(result)).toBe(true);
    });

    it('should not execute side effect on Ok', () => {
      const sideEffect = vi.fn();
      const result = tapErr(ok(42), sideEffect);
      expect(sideEffect).not.toHaveBeenCalled();
      expect(isOk(result)).toBe(true);
    });
  });
});

describe('lib/result - Integration Errors', () => {
  describe('integrationError', () => {
    it('should create integration error with all fields', () => {
      const cid = correlationId();
      const error = integrationError('TIMEOUT', 'hubspot', 'Request timed out', {
        correlationId: cid,
        retryable: true,
        metadata: { timeout: 5000 },
      });

      expect(error.code).toBe('TIMEOUT');
      expect(error.service).toBe('hubspot');
      expect(error.message).toBe('Request timed out');
      expect(error.correlationId).toBe(cid);
      expect(error.retryable).toBe(true);
      expect(error.metadata).toEqual({ timeout: 5000 });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should infer retryable from code', () => {
      const error = integrationError('TIMEOUT', 'service', 'timeout');
      expect(error.retryable).toBe(true);

      const error2 = integrationError('NOT_FOUND', 'service', 'not found');
      expect(error2.retryable).toBe(false);
    });

    it('should generate correlation ID if not provided', () => {
      const error = integrationError('INTERNAL_ERROR', 'service', 'error');
      expect(error.correlationId).toBeTruthy();
    });
  });

  describe('toIntegrationError', () => {
    it('should convert timeout error', () => {
      const error = new Error('Request timeout after 5000ms');
      const intError = toIntegrationError(error, 'hubspot');
      expect(intError.code).toBe('TIMEOUT');
      expect(intError.retryable).toBe(true);
    });

    it('should convert rate limit error', () => {
      const error = new Error('Rate limit exceeded (429)');
      const intError = toIntegrationError(error, 'hubspot');
      expect(intError.code).toBe('RATE_LIMITED');
      expect(intError.retryable).toBe(true);
    });

    it('should convert 401 to authentication error', () => {
      const error = new Error('401 Unauthorized');
      const intError = toIntegrationError(error, 'service');
      expect(intError.code).toBe('AUTHENTICATION_FAILED');
      expect(intError.retryable).toBe(false);
    });

    it('should convert 403 to authorization error', () => {
      const error = new Error('403 Forbidden');
      const intError = toIntegrationError(error, 'service');
      expect(intError.code).toBe('AUTHORIZATION_FAILED');
    });

    it('should convert 404 to not found error', () => {
      const error = new Error('404 Not found');
      const intError = toIntegrationError(error, 'service');
      expect(intError.code).toBe('NOT_FOUND');
    });

    it('should convert ECONNREFUSED to network error', () => {
      const error = new Error('connect ECONNREFUSED');
      const intError = toIntegrationError(error, 'service');
      expect(intError.code).toBe('NETWORK_ERROR');
      expect(intError.retryable).toBe(true);
    });

    it('should handle non-Error objects', () => {
      const intError = toIntegrationError('string error', 'service');
      expect(intError.code).toBe('INTERNAL_ERROR');
      expect(intError.message).toBe('string error');
    });
  });

  describe('wrapAsync', () => {
    it('should wrap successful operation', async () => {
      const result = await wrapAsync('service', async () => 42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should wrap failing operation', async () => {
      const result = await wrapAsync('service', async () => {
        throw new Error('operation failed');
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.service).toBe('service');
      }
    });
  });

  describe('retryResult', () => {
    it('should return Ok immediately on success', async () => {
      let attempts = 0;
      const result = await retryResult(
        async () => {
          attempts++;
          return ok(42);
        },
        { maxRetries: 3, baseDelayMs: 10 }
      );

      expect(isOk(result)).toBe(true);
      expect(attempts).toBe(1);
    });

    it('should retry on retryable error', async () => {
      let attempts = 0;
      const result = await retryResult(
        async () => {
          attempts++;
          if (attempts < 3) {
            return err(integrationError('TIMEOUT', 'service', 'timeout', { retryable: true }));
          }
          return ok(42);
        },
        { maxRetries: 3, baseDelayMs: 1 }
      );

      expect(isOk(result)).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should not retry on non-retryable error', async () => {
      let attempts = 0;
      const result = await retryResult(
        async () => {
          attempts++;
          return err(integrationError('NOT_FOUND', 'service', 'not found', { retryable: false }));
        },
        { maxRetries: 3, baseDelayMs: 10 }
      );

      expect(isErr(result)).toBe(true);
      expect(attempts).toBe(1);
    });

    it('should respect custom shouldRetry predicate', async () => {
      let attempts = 0;
      const result = await retryResult(
        async () => {
          attempts++;
          return err(integrationError('TIMEOUT', 'service', 'timeout'));
        },
        { maxRetries: 3, baseDelayMs: 1, shouldRetry: () => false }
      );

      expect(isErr(result)).toBe(true);
      expect(attempts).toBe(1);
    });

    it('should handle maxRetries = 0', async () => {
      let attempts = 0;
      const result = await retryResult(
        async () => {
          attempts++;
          return ok(42);
        },
        { maxRetries: 0, baseDelayMs: 10 }
      );

      expect(isOk(result)).toBe(true);
      expect(attempts).toBe(1);
    });
  });
});

describe('lib/result - Pipeline', () => {
  describe('ResultPipeline', () => {
    it('should chain operations with then', async () => {
      const result = await pipeline(ok(5))
        .then((x) => ok(x * 2))
        .then((x) => ok(x + 3))
        .run();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(13);
      }
    });

    it('should stop on first error', async () => {
      const result = await pipeline(ok(5))
        .then(() => err('error'))
        .then((x) => ok(x * 2))
        .run();

      expect(isErr(result)).toBe(true);
    });

    it('should transform with map', async () => {
      const result = await pipeline(ok(5))
        .map((x) => x * 2)
        .map((x) => x + 3)
        .run();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(13);
      }
    });

    it('should transform errors with mapErr', async () => {
      const result = await pipeline(err('error'))
        .mapErr((e) => `transformed: ${e}`)
        .run();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('transformed: error');
      }
    });

    it('should recover from errors', async () => {
      const result = await pipeline(err('error'))
        .recover(() => 42)
        .run();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should execute tap side effects', async () => {
      const sideEffects: number[] = [];
      const result = await pipeline(ok(5))
        .tap((x) => sideEffects.push(x))
        .map((x) => x * 2)
        .tap((x) => sideEffects.push(x))
        .run();

      expect(isOk(result)).toBe(true);
      expect(sideEffects).toEqual([5, 10]);
    });

    it('should execute tapErr on errors', async () => {
      const errors: string[] = [];
      const result = await pipeline(err('error'))
        .tapErr((e) => errors.push(e))
        .run();

      expect(isErr(result)).toBe(true);
      expect(errors).toEqual(['error']);
    });

    it('should unwrap result', async () => {
      const value = await pipeline(ok(42)).unwrap();
      expect(value).toBe(42);
    });

    it('should throw on unwrap of Err', async () => {
      await expect(pipeline(err(new Error('failed'))).unwrap()).rejects.toThrow('failed');
    });

    it('should getOrElse on Err', async () => {
      const value = await pipeline(err('error')).getOrElse(0);
      expect(value).toBe(0);
    });
  });
});

describe('lib/result - Property-based tests', () => {
  it('ok . isOk === true', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = ok(value);
        return isOk(result) === true && isErr(result) === false;
      })
    );
  });

  it('err . isErr === true', () => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        const result = err(error);
        return isErr(result) === true && isOk(result) === false;
      })
    );
  });

  it('map(ok(x), f) === ok(f(x))', () => {
    fc.assert(
      fc.property(fc.integer(), (x) => {
        const f = (n: number) => n * 2;
        const result = map(ok(x), f);
        return isOk(result) && result.value === f(x);
      })
    );
  });

  it('map(err(e), f) === err(e)', () => {
    fc.assert(
      fc.property(fc.string(), (error) => {
        const f = (n: number) => n * 2;
        const result = map(err<number, string>(error), f);
        return isErr(result) && result.error === error;
      })
    );
  });

  it('getOrElse(ok(x), default) === x', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (x, defaultValue) => {
        return getOrElse(ok(x), defaultValue) === x;
      })
    );
  });

  it('getOrElse(err(e), default) === default', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (error, defaultValue) => {
        return getOrElse(err(error), defaultValue) === defaultValue;
      })
    );
  });
});
