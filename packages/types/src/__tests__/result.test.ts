/**
 * Result and Option Monads Unit Tests
 *
 * Tests for functional error handling including:
 * - Result type (Ok/Err) constructors and guards
 * - Result operations (map, flatMap, fold, etc.)
 * - Option type (Some/None) constructors and guards
 * - Option operations
 * - AsyncResult for promise-based operations
 * - Do notation for monadic sequencing
 * - Pipe and flow utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  // Result constructors
  Ok,
  Err,
  isOk,
  isErr,
  type Result,
  // Result operations
  Result as R,
  // Option constructors
  Some,
  None,
  isSome,
  isNone,
  type Option,
  // Option operations
  Option as O,
  // AsyncResult
  AsyncResult,
  // Do notation
  Do,
  // Pipe and flow
  pipe,
  flow,
  identity,
  constant,
} from '../lib/result.js';

describe('Result Type', () => {
  describe('Ok', () => {
    it('should create Ok variant', () => {
      const result = Ok(42);

      expect(result._tag).toBe('Ok');
      expect(result.value).toBe(42);
    });

    it('should work with different types', () => {
      expect(Ok('string').value).toBe('string');
      expect(Ok(true).value).toBe(true);
      expect(Ok({ key: 'value' }).value).toEqual({ key: 'value' });
      expect(Ok([1, 2, 3]).value).toEqual([1, 2, 3]);
    });

    it('should accept null and undefined', () => {
      expect(Ok(null).value).toBeNull();
      expect(Ok(undefined).value).toBeUndefined();
    });
  });

  describe('Err', () => {
    it('should create Err variant', () => {
      const result = Err('error message');

      expect(result._tag).toBe('Err');
      expect(result.error).toBe('error message');
    });

    it('should work with different error types', () => {
      expect(Err(new Error('test')).error).toBeInstanceOf(Error);
      expect(Err({ code: 'ERR', message: 'test' }).error).toEqual({ code: 'ERR', message: 'test' });
      expect(Err(404).error).toBe(404);
    });
  });

  describe('Type Guards', () => {
    describe('isOk', () => {
      it('should identify Ok variants', () => {
        expect(isOk(Ok(42))).toBe(true);
        expect(isOk(Err('error'))).toBe(false);
      });

      it('should narrow types', () => {
        const result: Result<number, string> = Ok(42);

        if (isOk(result)) {
          expect(result.value).toBe(42);
        }
      });
    });

    describe('isErr', () => {
      it('should identify Err variants', () => {
        expect(isErr(Err('error'))).toBe(true);
        expect(isErr(Ok(42))).toBe(false);
      });

      it('should narrow types', () => {
        const result: Result<number, string> = Err('failed');

        if (isErr(result)) {
          expect(result.error).toBe('failed');
        }
      });
    });
  });
});

describe('Result Operations', () => {
  describe('map', () => {
    it('should transform Ok value', () => {
      const result = R.map(Ok(10), (x) => x * 2);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(20);
      }
    });

    it('should pass through Err unchanged', () => {
      const error = Err('failed');
      const result = R.map(error, (x: number) => x * 2);

      expect(result).toBe(error);
    });

    it('should chain multiple maps', () => {
      const result = pipe(
        Ok(5),
        (r) => R.map(r, (x) => x * 2),
        (r) => R.map(r, (x) => x + 3),
        (r) => R.map(r, (x) => x.toString())
      );

      if (isOk(result)) {
        expect(result.value).toBe('13');
      }
    });
  });

  describe('mapErr', () => {
    it('should transform Err value', () => {
      const result = R.mapErr(Err('error'), (e) => e.toUpperCase());

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('ERROR');
      }
    });

    it('should pass through Ok unchanged', () => {
      const ok = Ok(42);
      const result = R.mapErr(ok, (e: string) => e.toUpperCase());

      expect(result).toBe(ok);
    });
  });

  describe('flatMap', () => {
    it('should chain Result operations', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? Err('Division by zero') : Ok(a / b);

      const result = R.flatMap(Ok(10), (x) => divide(x, 2));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });

    it('should short-circuit on Err', () => {
      const error = Err('initial error');
      const result = R.flatMap(error, () => Ok(42));

      expect(result).toBe(error);
    });

    it('should propagate errors in chain', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? Err('Division by zero') : Ok(a / b);

      const result = R.flatMap(Ok(10), (x) => divide(x, 0));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('Division by zero');
      }
    });
  });

  describe('fold', () => {
    it('should handle Ok with onOk function', () => {
      const result = R.fold(
        Ok(42),
        (error) => `Error: ${error}`,
        (value) => `Success: ${value}`
      );

      expect(result).toBe('Success: 42');
    });

    it('should handle Err with onErr function', () => {
      const result = R.fold(
        Err('failed'),
        (error) => `Error: ${error}`,
        (value) => `Success: ${value}`
      );

      expect(result).toBe('Error: failed');
    });
  });

  describe('match', () => {
    it('should match Ok', () => {
      const result = R.match(Ok(42), {
        ok: (value) => `Got ${value}`,
        err: (error) => `Error: ${error}`,
      });

      expect(result).toBe('Got 42');
    });

    it('should match Err', () => {
      const result = R.match(Err('failed'), {
        ok: (value) => `Got ${value}`,
        err: (error) => `Error: ${error}`,
      });

      expect(result).toBe('Error: failed');
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok', () => {
      const value = R.unwrapOr(Ok(42), 0);

      expect(value).toBe(42);
    });

    it('should return default for Err', () => {
      const value = R.unwrapOr(Err('error'), 0);

      expect(value).toBe(0);
    });
  });

  describe('unwrapOrElse', () => {
    it('should return value for Ok', () => {
      const value = R.unwrapOrElse(Ok(42), () => 0);

      expect(value).toBe(42);
    });

    it('should compute default for Err', () => {
      const value = R.unwrapOrElse(Err('error'), (e) => e.length);

      expect(value).toBe(5);
    });
  });

  describe('unwrap', () => {
    it('should return value for Ok', () => {
      expect(R.unwrap(Ok(42))).toBe(42);
    });

    it('should throw for Err with Error', () => {
      const error = new Error('test error');
      expect(() => R.unwrap(Err(error))).toThrow('test error');
    });

    it('should throw for Err with string', () => {
      expect(() => R.unwrap(Err('failed'))).toThrow('failed');
    });
  });

  describe('unwrapErr', () => {
    it('should return error for Err', () => {
      expect(R.unwrapErr(Err('error'))).toBe('error');
    });

    it('should throw for Ok', () => {
      expect(() => R.unwrapErr(Ok(42))).toThrow('Called unwrapErr on Ok value');
    });
  });

  describe('toOption', () => {
    it('should convert Ok to Some', () => {
      const option = R.toOption(Ok(42));

      expect(isSome(option)).toBe(true);
      if (isSome(option)) {
        expect(option.value).toBe(42);
      }
    });

    it('should convert Err to None', () => {
      const option = R.toOption(Err('error'));

      expect(isNone(option)).toBe(true);
    });
  });

  describe('all', () => {
    it('should combine multiple Ok results', () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      const combined = R.all(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err', () => {
      const results = [Ok(1), Err('error'), Ok(3)];
      const combined = R.all(results);

      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe('error');
      }
    });

    it('should handle empty array', () => {
      const combined = R.all([]);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([]);
      }
    });
  });

  describe('any', () => {
    it('should return first Ok', () => {
      const results = [Err('e1'), Ok(42), Err('e2')];
      const result = R.any(results);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return all errors if all fail', () => {
      const results = [Err('e1'), Err('e2'), Err('e3')];
      const result = R.any(results);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toEqual(['e1', 'e2', 'e3']);
      }
    });
  });

  describe('try', () => {
    it('should catch exceptions as Err', () => {
      const result = R.try(() => {
        throw new Error('failed');
      });

      expect(isErr(result)).toBe(true);
    });

    it('should return Ok for successful execution', () => {
      const result = R.try(() => 42);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('fromNullable', () => {
    it('should create Ok for non-null values', () => {
      const result = R.fromNullable(42, 'null error');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err for null', () => {
      const result = R.fromNullable(null, 'null error');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('null error');
      }
    });

    it('should create Err for undefined', () => {
      const result = R.fromNullable(undefined, 'undefined error');

      expect(isErr(result)).toBe(true);
    });
  });

  describe('fromPredicate', () => {
    it('should create Ok when predicate passes', () => {
      const result = R.fromPredicate(42, (x) => x > 0, 'not positive');

      expect(isOk(result)).toBe(true);
    });

    it('should create Err when predicate fails', () => {
      const result = R.fromPredicate(-1, (x) => x > 0, 'not positive');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('not positive');
      }
    });
  });

  describe('zip', () => {
    it('should combine two Ok results', () => {
      const result = R.zip(Ok(1), Ok('a'));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([1, 'a']);
      }
    });

    it('should return first Err', () => {
      const result = R.zip(Err('error'), Ok(1));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('zipWith', () => {
    it('should combine with function', () => {
      const result = R.zipWith(Ok(2), Ok(3), (a, b) => a + b);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });
  });

  describe('filter', () => {
    it('should keep Ok when predicate passes', () => {
      const result = R.filter(Ok(42), (x) => x > 0, 'not positive');

      expect(isOk(result)).toBe(true);
    });

    it('should convert to Err when predicate fails', () => {
      const result = R.filter(Ok(-1), (x) => x > 0, 'not positive');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('not positive');
      }
    });
  });

  describe('tap', () => {
    it('should call function for Ok', () => {
      const spy = vi.fn();
      const result = R.tap(Ok(42), spy);

      expect(spy).toHaveBeenCalledWith(42);
      expect(result).toEqual(Ok(42));
    });

    it('should not call function for Err', () => {
      const spy = vi.fn();
      const error = Err('error');
      const result = R.tap(error, spy);

      expect(spy).not.toHaveBeenCalled();
      expect(result).toBe(error);
    });
  });

  describe('tapErr', () => {
    it('should call function for Err', () => {
      const spy = vi.fn();
      const error = Err('error');
      const result = R.tapErr(error, spy);

      expect(spy).toHaveBeenCalledWith('error');
      expect(result).toBe(error);
    });

    it('should not call function for Ok', () => {
      const spy = vi.fn();
      const result = R.tapErr(Ok(42), spy);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('Option Type', () => {
  describe('Some', () => {
    it('should create Some variant', () => {
      const option = Some(42);

      expect(option._tag).toBe('Some');
      expect(option.value).toBe(42);
    });

    it('should work with different types', () => {
      expect(Some('string').value).toBe('string');
      expect(Some({ key: 'value' }).value).toEqual({ key: 'value' });
    });
  });

  describe('None', () => {
    it('should be None singleton', () => {
      expect(None._tag).toBe('None');
    });

    it('should be the same instance', () => {
      const none1 = None;
      const none2 = None;

      expect(none1).toBe(none2);
    });
  });

  describe('Type Guards', () => {
    describe('isSome', () => {
      it('should identify Some variants', () => {
        expect(isSome(Some(42))).toBe(true);
        expect(isSome(None)).toBe(false);
      });

      it('should narrow types', () => {
        const option: Option<number> = Some(42);

        if (isSome(option)) {
          expect(option.value).toBe(42);
        }
      });
    });

    describe('isNone', () => {
      it('should identify None variants', () => {
        expect(isNone(None)).toBe(true);
        expect(isNone(Some(42))).toBe(false);
      });
    });
  });
});

describe('Option Operations', () => {
  describe('fromNullable', () => {
    it('should create Some for non-null values', () => {
      const option = O.fromNullable(42);

      expect(isSome(option)).toBe(true);
      if (isSome(option)) {
        expect(option.value).toBe(42);
      }
    });

    it('should create None for null', () => {
      expect(isNone(O.fromNullable(null))).toBe(true);
    });

    it('should create None for undefined', () => {
      expect(isNone(O.fromNullable(undefined))).toBe(true);
    });

    it('should accept falsy but non-null values', () => {
      expect(isSome(O.fromNullable(0))).toBe(true);
      expect(isSome(O.fromNullable(''))).toBe(true);
      expect(isSome(O.fromNullable(false))).toBe(true);
    });
  });

  describe('map', () => {
    it('should transform Some value', () => {
      const option = O.map(Some(10), (x) => x * 2);

      expect(isSome(option)).toBe(true);
      if (isSome(option)) {
        expect(option.value).toBe(20);
      }
    });

    it('should pass through None', () => {
      const option = O.map(None, (x: number) => x * 2);

      expect(isNone(option)).toBe(true);
    });
  });

  describe('flatMap', () => {
    it('should chain Option operations', () => {
      const safeDivide = (a: number, b: number): Option<number> => (b === 0 ? None : Some(a / b));

      const result = O.flatMap(Some(10), (x) => safeDivide(x, 2));

      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(5);
      }
    });

    it('should short-circuit on None', () => {
      const result = O.flatMap(None, () => Some(42));

      expect(isNone(result)).toBe(true);
    });
  });

  describe('fold', () => {
    it('should handle Some', () => {
      const result = O.fold(
        Some(42),
        () => 'none',
        (value) => `some: ${value}`
      );

      expect(result).toBe('some: 42');
    });

    it('should handle None', () => {
      const result = O.fold(
        None,
        () => 'none',
        (value) => `some: ${value}`
      );

      expect(result).toBe('none');
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Some', () => {
      expect(O.unwrapOr(Some(42), 0)).toBe(42);
    });

    it('should return default for None', () => {
      expect(O.unwrapOr(None, 0)).toBe(0);
    });
  });

  describe('toResult', () => {
    it('should convert Some to Ok', () => {
      const result = O.toResult(Some(42), 'error');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should convert None to Err', () => {
      const result = O.toResult(None, 'error');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('filter', () => {
    it('should keep Some when predicate passes', () => {
      const option = O.filter(Some(42), (x) => x > 0);

      expect(isSome(option)).toBe(true);
    });

    it('should convert to None when predicate fails', () => {
      const option = O.filter(Some(-1), (x) => x > 0);

      expect(isNone(option)).toBe(true);
    });
  });

  describe('all', () => {
    it('should combine multiple Some options', () => {
      const options = [Some(1), Some(2), Some(3)];
      const combined = O.all(options);

      expect(isSome(combined)).toBe(true);
      if (isSome(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return None if any is None', () => {
      const options = [Some(1), None, Some(3)];
      const combined = O.all(options);

      expect(isNone(combined)).toBe(true);
    });
  });

  describe('any', () => {
    it('should return first Some', () => {
      const options = [None, Some(42), None];
      const result = O.any(options);

      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return None if all are None', () => {
      const options = [None, None, None];
      const result = O.any(options);

      expect(isNone(result)).toBe(true);
    });
  });
});

describe('AsyncResult', () => {
  describe('fromPromise', () => {
    it('should convert successful promise to Ok', async () => {
      const result = await AsyncResult.fromPromise(Promise.resolve(42));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should convert rejected promise to Err', async () => {
      const result = await AsyncResult.fromPromise(Promise.reject(new Error('failed')));

      expect(isErr(result)).toBe(true);
    });
  });

  describe('map', () => {
    it('should transform async Ok value', async () => {
      const result = await AsyncResult.map(AsyncResult.ok(10), (x) => x * 2);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(20);
      }
    });
  });

  describe('flatMap', () => {
    it('should chain async operations', async () => {
      const divide = (a: number, b: number): AsyncResult<number, string> =>
        Promise.resolve(b === 0 ? Err('Division by zero') : Ok(a / b));

      const result = await AsyncResult.flatMap(AsyncResult.ok(10), (x) => divide(x, 2));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });
  });

  describe('retry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const flaky = (): AsyncResult<number, string> => {
        attempts++;
        return Promise.resolve(attempts < 3 ? Err('failed') : Ok(42));
      };

      const result = await AsyncResult.retry(flaky, { maxAttempts: 3 });

      expect(attempts).toBe(3);
      expect(isOk(result)).toBe(true);
    });

    it('should stop after max attempts', async () => {
      let attempts = 0;
      const alwaysFails = (): AsyncResult<number, string> => {
        attempts++;
        return Promise.resolve(Err('failed'));
      };

      const result = await AsyncResult.retry(alwaysFails, { maxAttempts: 3 });

      expect(attempts).toBe(3);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('timeout', () => {
    it('should timeout slow operations', async () => {
      const slow = new Promise<Result<number, string>>((resolve) => {
        setTimeout(() => resolve(Ok(42)), 1000);
      });

      const result = await AsyncResult.timeout(slow, 100, 'timeout');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('timeout');
      }
    });

    it('should not timeout fast operations', async () => {
      const fast = Promise.resolve(Ok(42));
      const result = await AsyncResult.timeout(fast, 1000, 'timeout');

      expect(isOk(result)).toBe(true);
    });
  });
});

describe('Do Notation', () => {
  describe('Result Do', () => {
    it('should sequence Result operations', () => {
      const result = Do.result
        .bind('a', Ok(10))
        .bind('b', ({ a }) => Ok(a * 2))
        .map(({ a, b }) => a + b);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(30); // 10 + 20
      }
    });

    it('should short-circuit on Err', () => {
      const result = Do.result
        .bind('a', Ok(10))
        .bind('b', () => Err('failed'))
        .bind('c', ({ a }) => Ok(a * 3))
        .map(({ a, b, c }) => a + b + c);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('Option Do', () => {
    it('should sequence Option operations', () => {
      const result = Do.option
        .bind('a', Some(10))
        .bind('b', ({ a }) => Some(a * 2))
        .map(({ a, b }) => a + b);

      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(30);
      }
    });

    it('should short-circuit on None', () => {
      const result = Do.option
        .bind('a', Some(10))
        .bind('b', () => None)
        .map(({ a, b }) => a + b);

      expect(isNone(result)).toBe(true);
    });
  });
});

describe('Pipe and Flow', () => {
  describe('pipe', () => {
    it('should pipe value through functions', () => {
      const result = pipe(
        5,
        (x) => x * 2,
        (x) => x + 1,
        (x) => x.toString()
      );

      expect(result).toBe('11');
    });

    it('should work with single function', () => {
      const result = pipe(5, (x) => x * 2);

      expect(result).toBe(10);
    });

    it('should work with no functions', () => {
      const result = pipe(42);

      expect(result).toBe(42);
    });
  });

  describe('flow', () => {
    it('should compose functions', () => {
      const process = flow(
        (x: number) => x * 2,
        (x) => x + 1,
        (x) => x.toString()
      );

      expect(process(5)).toBe('11');
    });

    it('should be reusable', () => {
      const double = flow((x: number) => x * 2);

      expect(double(5)).toBe(10);
      expect(double(10)).toBe(20);
    });
  });

  describe('identity', () => {
    it('should return input unchanged', () => {
      expect(identity(42)).toBe(42);
      expect(identity('hello')).toBe('hello');
      expect(identity({ key: 'value' })).toEqual({ key: 'value' });
    });
  });

  describe('constant', () => {
    it('should create function that returns constant', () => {
      const getAnswer = constant(42);

      expect(getAnswer()).toBe(42);
      expect(getAnswer()).toBe(42);
    });

    it('should work with different types', () => {
      expect(constant('hello')()).toBe('hello');
      expect(constant({ key: 'value' })()).toEqual({ key: 'value' });
    });
  });
});

describe('Railway-Oriented Programming', () => {
  it('should chain operations that can fail', () => {
    const parseNumber = (s: string): Result<number, string> => {
      const n = Number(s);
      return Number.isNaN(n) ? Err('Not a number') : Ok(n);
    };

    const divide = (a: number, b: number): Result<number, string> =>
      b === 0 ? Err('Division by zero') : Ok(a / b);

    const processInput = (input: string): Result<string, string> =>
      pipe(
        parseNumber(input),
        (r) => R.flatMap(r, (n) => divide(100, n)),
        (r) => R.map(r, (n) => `Result: ${n}`)
      );

    // Test success case
    const successResult = processInput('10');
    expect(isOk(successResult)).toBe(true);
    if (isOk(successResult)) {
      expect(successResult.value).toBe('Result: 10');
    }

    // Test division by zero
    const divZeroResult = processInput('0');
    expect(isErr(divZeroResult)).toBe(true);
    if (isErr(divZeroResult)) {
      expect(divZeroResult.error).toBe('Division by zero');
    }

    // Test parse error
    const parseErrorResult = processInput('invalid');
    expect(isErr(parseErrorResult)).toBe(true);
    if (isErr(parseErrorResult)) {
      expect(parseErrorResult.error).toBe('Not a number');
    }
  });

  it('should combine multiple Results', () => {
    const validateName = (name: string): Result<string, string> =>
      name.length > 0 ? Ok(name) : Err('Name is required');

    const validateAge = (age: number): Result<number, string> =>
      age >= 18 ? Ok(age) : Err('Must be 18 or older');

    const createUser = (name: string, age: number) => {
      const nameResult = validateName(name);
      const ageResult = validateAge(age);

      return R.zipWith(nameResult, ageResult, (n, a) => ({ name: n, age: a }));
    };

    const validUser = createUser('John', 25);
    expect(isOk(validUser)).toBe(true);

    const invalidAge = createUser('John', 15);
    expect(isErr(invalidAge)).toBe(true);

    const invalidName = createUser('', 25);
    expect(isErr(invalidName)).toBe(true);
  });
});

// Additional Result Operations tests
describe('Result Operations - Extended', () => {
  describe('ok and err constructors', () => {
    it('should create Ok with Result.ok', () => {
      const result = R.ok(42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should create Err with Result.err', () => {
      const result = R.err('error');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('andThen', () => {
    it('should work as alias for flatMap', () => {
      const result = R.andThen(Ok(10), (x) => Ok(x * 2));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(20);
      }
    });
  });

  describe('orElse', () => {
    it('should provide fallback for Err', () => {
      const result = R.orElse(Err('error'), () => Ok(42));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should pass through Ok', () => {
      const ok = Ok(42);
      const result = R.orElse(ok, () => Ok(0));
      expect(result).toBe(ok);
    });
  });

  describe('flatten', () => {
    it('should flatten nested Result', () => {
      const nested = Ok(Ok(42));
      const result = R.flatten(nested);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should handle outer Err', () => {
      const error = Err('outer error');
      const result = R.flatten(error);
      expect(isErr(result)).toBe(true);
    });

    it('should handle inner Err', () => {
      const nested = Ok(Err('inner error'));
      const result = R.flatten(nested);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('ap', () => {
    it('should apply function in Result to value in Result', () => {
      const fn = Ok((x: number) => x * 2);
      const value = Ok(10);
      const result = R.ap(fn, value);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(20);
      }
    });

    it('should return Err when function is Err', () => {
      const fn = Err('no function');
      const value = Ok(10);
      const result = R.ap(fn, value);
      expect(isErr(result)).toBe(true);
    });

    it('should return Err when value is Err', () => {
      const fn = Ok((x: number) => x * 2);
      const value = Err('no value');
      const result = R.ap(fn, value);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('zip edge cases', () => {
    it('should return second Err if first is Ok', () => {
      const result = R.zip(Ok(1), Err('second error'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('second error');
      }
    });
  });

  describe('zipWith edge cases', () => {
    it('should return first Err', () => {
      const result = R.zipWith(Err('first error'), Ok(2), (a, b) => a + b);
      expect(isErr(result)).toBe(true);
    });

    it('should return second Err if first is Ok', () => {
      const result = R.zipWith(Ok(1), Err('second error'), (a, b) => a + b);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('filter edge cases', () => {
    it('should pass through Err unchanged', () => {
      const error = Err('original error');
      const result = R.filter(error, () => true, 'new error');
      expect(result).toBe(error);
    });
  });

  describe('tryAsync', () => {
    it('should catch async exceptions', async () => {
      const result = await R.tryAsync(async () => {
        throw new Error('async error');
      });
      expect(isErr(result)).toBe(true);
    });

    it('should return Ok for successful async execution', async () => {
      const result = await R.tryAsync(async () => 42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });
  });
});

// Additional Option Operations tests
describe('Option Operations - Extended', () => {
  describe('some and none constructors', () => {
    it('should create Some with Option.some', () => {
      const option = O.some(42);
      expect(isSome(option)).toBe(true);
    });

    it('should create None with Option.none', () => {
      const option = O.none();
      expect(isNone(option)).toBe(true);
    });
  });

  describe('fromPredicate', () => {
    it('should create Some when predicate passes', () => {
      const option = O.fromPredicate(42, (x) => x > 0);
      expect(isSome(option)).toBe(true);
    });

    it('should create None when predicate fails', () => {
      const option = O.fromPredicate(-1, (x) => x > 0);
      expect(isNone(option)).toBe(true);
    });
  });

  describe('andThen', () => {
    it('should work as alias for flatMap', () => {
      const result = O.andThen(Some(10), (x) => Some(x * 2));
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(20);
      }
    });
  });

  describe('orElse', () => {
    it('should provide fallback for None', () => {
      const result = O.orElse(None, () => Some(42));
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should pass through Some', () => {
      const some = Some(42);
      const result = O.orElse(some, () => Some(0));
      expect(result).toBe(some);
    });
  });

  describe('match', () => {
    it('should match Some', () => {
      const result = O.match(Some(42), {
        some: (value) => `Got ${value}`,
        none: () => 'Nothing',
      });
      expect(result).toBe('Got 42');
    });

    it('should match None', () => {
      const result = O.match(None, {
        some: (value) => `Got ${value}`,
        none: () => 'Nothing',
      });
      expect(result).toBe('Nothing');
    });
  });

  describe('unwrapOrElse', () => {
    it('should return value for Some', () => {
      const result = O.unwrapOrElse(Some(42), () => 0);
      expect(result).toBe(42);
    });

    it('should compute default for None', () => {
      const result = O.unwrapOrElse(None, () => 99);
      expect(result).toBe(99);
    });
  });

  describe('unwrap', () => {
    it('should return value for Some', () => {
      expect(O.unwrap(Some(42))).toBe(42);
    });

    it('should throw default message for None', () => {
      expect(() => O.unwrap(None)).toThrow('Called unwrap on None');
    });

    it('should throw custom message for None', () => {
      expect(() => O.unwrap(None, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('toNullable', () => {
    it('should return value for Some', () => {
      expect(O.toNullable(Some(42))).toBe(42);
    });

    it('should return null for None', () => {
      expect(O.toNullable(None)).toBeNull();
    });
  });

  describe('toUndefined', () => {
    it('should return value for Some', () => {
      expect(O.toUndefined(Some(42))).toBe(42);
    });

    it('should return undefined for None', () => {
      expect(O.toUndefined(None)).toBeUndefined();
    });
  });

  describe('zip', () => {
    it('should combine two Some options', () => {
      const result = O.zip(Some(1), Some('a'));
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toEqual([1, 'a']);
      }
    });

    it('should return None if first is None', () => {
      const result = O.zip(None, Some(1));
      expect(isNone(result)).toBe(true);
    });

    it('should return None if second is None', () => {
      const result = O.zip(Some(1), None);
      expect(isNone(result)).toBe(true);
    });
  });

  describe('zipWith', () => {
    it('should combine with function', () => {
      const result = O.zipWith(Some(2), Some(3), (a, b) => a + b);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(5);
      }
    });

    it('should return None if any is None', () => {
      expect(isNone(O.zipWith(None, Some(3), (a, b) => a + b))).toBe(true);
      expect(isNone(O.zipWith(Some(2), None, (a, b) => a + b))).toBe(true);
    });
  });

  describe('flatten', () => {
    it('should flatten nested Option', () => {
      const nested = Some(Some(42));
      const result = O.flatten(nested);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should handle None', () => {
      const result = O.flatten(None);
      expect(isNone(result)).toBe(true);
    });

    it('should handle inner None', () => {
      const nested = Some(None);
      const result = O.flatten(nested);
      expect(isNone(result)).toBe(true);
    });
  });

  describe('tap', () => {
    it('should call function for Some', () => {
      const spy = vi.fn();
      const result = O.tap(Some(42), spy);
      expect(spy).toHaveBeenCalledWith(42);
      expect(result).toEqual(Some(42));
    });

    it('should not call function for None', () => {
      const spy = vi.fn();
      const result = O.tap(None, spy);
      expect(spy).not.toHaveBeenCalled();
      expect(isNone(result)).toBe(true);
    });
  });

  describe('contains', () => {
    it('should return true if Option contains value', () => {
      expect(O.contains(Some(42), 42)).toBe(true);
    });

    it('should return false if Option contains different value', () => {
      expect(O.contains(Some(42), 43)).toBe(false);
    });

    it('should return false for None', () => {
      expect(O.contains(None, 42)).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true if predicate matches', () => {
      expect(O.exists(Some(42), (x) => x > 0)).toBe(true);
    });

    it('should return false if predicate fails', () => {
      expect(O.exists(Some(-1), (x) => x > 0)).toBe(false);
    });

    it('should return false for None', () => {
      expect(O.exists(None, () => true)).toBe(false);
    });
  });

  describe('filter edge cases', () => {
    it('should return None for None input', () => {
      const result = O.filter(None, () => true);
      expect(isNone(result)).toBe(true);
    });
  });
});

// Extended AsyncResult tests
describe('AsyncResult - Extended', () => {
  describe('err', () => {
    it('should create failed AsyncResult', async () => {
      const result = await AsyncResult.err('error');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('error');
      }
    });
  });

  describe('fromPromiseTyped', () => {
    it('should map error with typed mapper', async () => {
      const result = await AsyncResult.fromPromiseTyped(
        Promise.reject(new Error('original')),
        (err) => ({ code: 'MAPPED', message: String(err) })
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toHaveProperty('code', 'MAPPED');
      }
    });
  });

  describe('mapErr', () => {
    it('should transform error', async () => {
      const result = await AsyncResult.mapErr(AsyncResult.err('error'), (e) => e.toUpperCase());
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('ERROR');
      }
    });

    it('should pass through Ok', async () => {
      const result = await AsyncResult.mapErr(AsyncResult.ok(42), (e: string) => e.toUpperCase());
      expect(isOk(result)).toBe(true);
    });
  });

  describe('flatMapSync', () => {
    it('should chain with sync Result', async () => {
      const result = await AsyncResult.flatMapSync(AsyncResult.ok(10), (x) => Ok(x * 2));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(20);
      }
    });

    it('should short-circuit on Err', async () => {
      const result = await AsyncResult.flatMapSync(AsyncResult.err('error'), () => Ok(42));
      expect(isErr(result)).toBe(true);
    });
  });

  describe('match', () => {
    it('should match Ok', async () => {
      const result = await AsyncResult.match(AsyncResult.ok(42), {
        ok: (value) => `Got ${value}`,
        err: (error) => `Error: ${error}`,
      });
      expect(result).toBe('Got 42');
    });

    it('should match Err', async () => {
      const result = await AsyncResult.match(AsyncResult.err('failed'), {
        ok: (value) => `Got ${value}`,
        err: (error) => `Error: ${error}`,
      });
      expect(result).toBe('Error: failed');
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok', async () => {
      const result = await AsyncResult.unwrapOr(AsyncResult.ok(42), 0);
      expect(result).toBe(42);
    });

    it('should return default for Err', async () => {
      const result = await AsyncResult.unwrapOr(AsyncResult.err('error'), 0);
      expect(result).toBe(0);
    });
  });

  describe('all', () => {
    it('should combine multiple async Ok results', async () => {
      const results = [AsyncResult.ok(1), AsyncResult.ok(2), AsyncResult.ok(3)];
      const combined = await AsyncResult.all(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err', async () => {
      const results = [AsyncResult.ok(1), AsyncResult.err('error'), AsyncResult.ok(3)];
      const combined = await AsyncResult.all(results);
      expect(isErr(combined)).toBe(true);
    });
  });

  describe('tap', () => {
    it('should call function for Ok', async () => {
      const spy = vi.fn();
      const result = await AsyncResult.tap(AsyncResult.ok(42), spy);
      expect(spy).toHaveBeenCalledWith(42);
      expect(isOk(result)).toBe(true);
    });

    it('should call async function for Ok', async () => {
      const spy = vi.fn().mockResolvedValue(undefined);
      const result = await AsyncResult.tap(AsyncResult.ok(42), spy);
      expect(spy).toHaveBeenCalledWith(42);
      expect(isOk(result)).toBe(true);
    });

    it('should not call function for Err', async () => {
      const spy = vi.fn();
      await AsyncResult.tap(AsyncResult.err('error'), spy);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('tapErr', () => {
    it('should call function for Err', async () => {
      const spy = vi.fn();
      const result = await AsyncResult.tapErr(AsyncResult.err('error'), spy);
      expect(spy).toHaveBeenCalledWith('error');
      expect(isErr(result)).toBe(true);
    });

    it('should call async function for Err', async () => {
      const spy = vi.fn().mockResolvedValue(undefined);
      const result = await AsyncResult.tapErr(AsyncResult.err('error'), spy);
      expect(spy).toHaveBeenCalledWith('error');
      expect(isErr(result)).toBe(true);
    });

    it('should not call function for Ok', async () => {
      const spy = vi.fn();
      await AsyncResult.tapErr(AsyncResult.ok(42), spy);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('retry with delay', () => {
    it('should wait between retries', async () => {
      let attempts = 0;
      const startTime = Date.now();
      const flaky = (): Promise<Result<number, string>> => {
        attempts++;
        return Promise.resolve(attempts < 2 ? Err('failed') : Ok(42));
      };

      const result = await AsyncResult.retry(flaky, { maxAttempts: 2, delay: 50 });

      const elapsed = Date.now() - startTime;
      expect(attempts).toBe(2);
      expect(elapsed).toBeGreaterThanOrEqual(40); // At least one delay
      expect(isOk(result)).toBe(true);
    });
  });
});

// Extended Do Notation tests
describe('Do Notation - Extended', () => {
  describe('Result Do done()', () => {
    it('should return final Result', () => {
      const result = Do.result
        .bind('a', Ok(10))
        .bind('b', ({ a }) => Ok(a * 2))
        .done();
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ a: 10, b: 20 });
      }
    });

    it('should return Err from initial bind', () => {
      const result = Do.result.bind('a', Err('initial error')).done();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('Option Do done()', () => {
    it('should return final Option', () => {
      const result = Do.option
        .bind('a', Some(10))
        .bind('b', ({ a }) => Some(a * 2))
        .done();
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toEqual({ a: 10, b: 20 });
      }
    });

    it('should return None from initial bind', () => {
      const result = Do.option.bind('a', None).done();
      expect(isNone(result)).toBe(true);
    });
  });
});

// Extended pipe tests
describe('Pipe - Extended', () => {
  it('should handle 4 functions', () => {
    const result = pipe(
      5,
      (x) => x * 2,
      (x) => x + 1,
      (x) => x * 3,
      (x) => x.toString()
    );
    expect(result).toBe('33');
  });

  it('should handle 5 functions', () => {
    const result = pipe(
      5,
      (x) => x * 2,
      (x) => x + 1,
      (x) => x * 3,
      (x) => x - 1,
      (x) => x.toString()
    );
    expect(result).toBe('32');
  });
});

// Extended flow tests
describe('Flow - Extended', () => {
  it('should handle 3 functions', () => {
    const fn = flow(
      (x: number) => x * 2,
      (x) => x + 1,
      (x) => x.toString()
    );
    expect(fn(5)).toBe('11');
  });

  it('should handle 4 functions', () => {
    const fn = flow(
      (x: number) => x * 2,
      (x) => x + 1,
      (x) => x * 3,
      (x) => x.toString()
    );
    expect(fn(5)).toBe('33');
  });

  it('should handle 5 functions', () => {
    const fn = flow(
      (x: number) => x * 2,
      (x) => x + 1,
      (x) => x * 3,
      (x) => x - 1,
      (x) => x.toString()
    );
    expect(fn(5)).toBe('32');
  });
});
