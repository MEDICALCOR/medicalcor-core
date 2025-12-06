import { describe, it, expect } from 'vitest';
import {
  Ok,
  Err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  combine,
  tryCatch,
  tryCatchSync,
  type Result,
} from '../shared/Result.js';

/**
 * Tests for Result Type and Utilities
 *
 * Covers:
 * - Result creation (Ok, Err)
 * - Type guards (isOk, isErr)
 * - Unwrapping (unwrap, unwrapOr)
 * - Mapping operations (map, mapErr, flatMap)
 * - Combining results
 * - Try-catch wrappers
 * - Error handling and edge cases
 */

describe('Result Type', () => {
  describe('Ok and Err Constructors', () => {
    it('should create Ok result with value', () => {
      const result = Ok(42);

      expect(result._tag).toBe('Ok');
      expect(result.value).toBe(42);
    });

    it('should create Ok result with string value', () => {
      const result = Ok('success');

      expect(result._tag).toBe('Ok');
      expect(result.value).toBe('success');
    });

    it('should create Ok result with object value', () => {
      const obj = { id: '123', name: 'test' };
      const result = Ok(obj);

      expect(result._tag).toBe('Ok');
      expect(result.value).toBe(obj);
      expect(result.value).toEqual(obj);
    });

    it('should create Ok result with null value', () => {
      const result = Ok(null);

      expect(result._tag).toBe('Ok');
      expect(result.value).toBeNull();
    });

    it('should create Ok result with undefined value', () => {
      const result = Ok(undefined);

      expect(result._tag).toBe('Ok');
      expect(result.value).toBeUndefined();
    });

    it('should create Err result with error', () => {
      const error = new Error('Something went wrong');
      const result = Err(error);

      expect(result._tag).toBe('Err');
      expect(result.error).toBe(error);
    });

    it('should create Err result with string error', () => {
      const result = Err('error message');

      expect(result._tag).toBe('Err');
      expect(result.error).toBe('error message');
    });

    it('should create Err result with custom error object', () => {
      const customError = { code: 'ERR_001', message: 'Custom error' };
      const result = Err(customError);

      expect(result._tag).toBe('Err');
      expect(result.error).toEqual(customError);
    });
  });

  describe('Type Guards', () => {
    describe('isOk', () => {
      it('should return true for Ok result', () => {
        const result = Ok(123);
        expect(isOk(result)).toBe(true);
      });

      it('should return false for Err result', () => {
        const result = Err('error');
        expect(isOk(result)).toBe(false);
      });

      it('should narrow type to Ok', () => {
        const result: Result<number, string> = Ok(42);

        if (isOk(result)) {
          // TypeScript should recognize result.value as number
          const value: number = result.value;
          expect(value).toBe(42);
        }
      });
    });

    describe('isErr', () => {
      it('should return true for Err result', () => {
        const result = Err('error message');
        expect(isErr(result)).toBe(true);
      });

      it('should return false for Ok result', () => {
        const result = Ok('success');
        expect(isErr(result)).toBe(false);
      });

      it('should narrow type to Err', () => {
        const result: Result<number, string> = Err('error');

        if (isErr(result)) {
          // TypeScript should recognize result.error as string
          const error: string = result.error;
          expect(error).toBe('error');
        }
      });
    });
  });

  describe('unwrap', () => {
    it('should return value for Ok result', () => {
      const result = Ok(42);
      const value = unwrap(result);

      expect(value).toBe(42);
    });

    it('should throw error for Err result with Error', () => {
      const error = new Error('Test error');
      const result = Err(error);

      expect(() => unwrap(result)).toThrow(error);
    });

    it('should throw error for Err result with string', () => {
      const result = Err('error message');

      expect(() => unwrap(result)).toThrow('error message');
    });

    it('should return complex object for Ok result', () => {
      const obj = { a: 1, b: 'test', c: { nested: true } };
      const result = Ok(obj);

      expect(unwrap(result)).toEqual(obj);
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok result', () => {
      const result = Ok(42);
      const value = unwrapOr(result, 0);

      expect(value).toBe(42);
    });

    it('should return default value for Err result', () => {
      const result = Err('error');
      const value = unwrapOr(result, 0);

      expect(value).toBe(0);
    });

    it('should return default value of different type for Err result', () => {
      const result: Result<string, Error> = Err(new Error('error'));
      const value = unwrapOr(result, 'default');

      expect(value).toBe('default');
    });

    it('should work with null as default', () => {
      const result: Result<number, string> = Err('error');
      const value = unwrapOr(result, null);

      expect(value).toBeNull();
    });

    it('should work with undefined as default', () => {
      const result: Result<number, string> = Err('error');
      const value = unwrapOr(result, undefined);

      expect(value).toBeUndefined();
    });
  });

  describe('map', () => {
    it('should transform Ok value', () => {
      const result = Ok(5);
      const mapped = map(result, (n) => n * 2);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should not transform Err', () => {
      const result: Result<number, string> = Err('error');
      const mapped = map(result, (n) => n * 2);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe('error');
      }
    });

    it('should change type through mapping', () => {
      const result = Ok(42);
      const mapped = map(result, (n) => String(n));

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe('42');
        expect(typeof mapped.value).toBe('string');
      }
    });

    it('should chain multiple maps', () => {
      const result = Ok(2);
      const mapped = map(
        map(
          map(result, (n) => n * 2),
          (n) => n + 1
        ),
        (n) => n * 3
      );

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(15); // ((2 * 2) + 1) * 3 = 15
      }
    });

    it('should map to complex objects', () => {
      const result = Ok({ id: '123' });
      const mapped = map(result, (obj) => ({ ...obj, name: 'test' }));

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toEqual({ id: '123', name: 'test' });
      }
    });
  });

  describe('mapErr', () => {
    it('should transform Err value', () => {
      const result: Result<number, string> = Err('error');
      const mapped = mapErr(result, (e) => new Error(e));

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBeInstanceOf(Error);
        expect(mapped.error.message).toBe('error');
      }
    });

    it('should not transform Ok', () => {
      const result: Result<number, string> = Ok(42);
      const mapped = mapErr(result, (e) => new Error(e));

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(42);
      }
    });

    it('should change error type through mapping', () => {
      const result: Result<number, Error> = Err(new Error('test'));
      const mapped = mapErr(result, (e) => e.message);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe('test');
      }
    });

    it('should transform error to structured error', () => {
      const result: Result<number, string> = Err('NOT_FOUND');
      const mapped = mapErr(result, (code) => ({ code, message: 'Resource not found' }));

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
      }
    });
  });

  describe('flatMap', () => {
    it('should chain Ok results', () => {
      const result = Ok(5);
      const chained = flatMap(result, (n) => Ok(n * 2));

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe(10);
      }
    });

    it('should short-circuit on Err', () => {
      const result: Result<number, string> = Err('error');
      const chained = flatMap(result, (n) => Ok(n * 2));

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe('error');
      }
    });

    it('should propagate Err from flatMap function', () => {
      const result = Ok(5);
      const chained = flatMap(result, (n) => {
        if (n > 3) {
          return Err('too large');
        }
        return Ok(n * 2);
      });

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe('too large');
      }
    });

    it('should chain multiple flatMap operations', () => {
      const result = Ok(2);
      const chained = flatMap(
        flatMap(result, (n) => Ok(n + 1)),
        (n) => Ok(n * 3)
      );

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe(9); // (2 + 1) * 3 = 9
      }
    });

    it('should change type through flatMap', () => {
      const result = Ok(42);
      const chained = flatMap(result, (n) => Ok(String(n)));

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe('42');
      }
    });

    it('should support conditional error paths', () => {
      function divideBy(divisor: number): (n: number) => Result<number, string> {
        return (n: number) => {
          if (divisor === 0) {
            return Err('division by zero');
          }
          return Ok(n / divisor);
        };
      }

      const result1 = flatMap(Ok(10), divideBy(2));
      expect(isOk(result1)).toBe(true);
      if (isOk(result1)) {
        expect(result1.value).toBe(5);
      }

      const result2 = flatMap(Ok(10), divideBy(0));
      expect(isErr(result2)).toBe(true);
      if (isErr(result2)) {
        expect(result2.error).toBe('division by zero');
      }
    });
  });

  describe('combine', () => {
    it('should combine multiple Ok results', () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first Err when any result is Err', () => {
      const results: Result<number, string>[] = [Ok(1), Err('error'), Ok(3)];
      const combined = combine(results);

      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe('error');
      }
    });

    it('should return empty array for empty input', () => {
      const results: Result<number, string>[] = [];
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([]);
      }
    });

    it('should handle single result', () => {
      const results = [Ok(42)];
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([42]);
      }
    });

    it('should stop at first error', () => {
      const results: Result<number, string>[] = [Ok(1), Err('first error'), Err('second error')];
      const combined = combine(results);

      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe('first error');
      }
    });

    it('should combine results of different types', () => {
      const results: Result<string | number | boolean, Error>[] = [Ok(1), Ok('test'), Ok(true)];
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 'test', true]);
      }
    });
  });

  describe('tryCatch', () => {
    it('should return Ok for successful async operation', async () => {
      const result = await tryCatch(async () => 42);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return Err for rejected promise', async () => {
      const result = await tryCatch(async () => {
        throw new Error('Test error');
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('Test error');
      }
    });

    it('should wrap non-Error throws in Error', async () => {
      const result = await tryCatch(async () => {
        throw 'string error';
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('string error');
      }
    });

    it('should handle async operations with delay', async () => {
      const result = await tryCatch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('done');
      }
    });

    it('should handle Promise.reject', async () => {
      const result = await tryCatch(async () => {
        return Promise.reject(new Error('Rejected'));
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe('Rejected');
      }
    });

    it('should preserve error details', async () => {
      const customError = new Error('Custom error');
      customError.stack = 'custom stack';

      const result = await tryCatch(async () => {
        throw customError;
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(customError);
        expect(result.error.stack).toBe('custom stack');
      }
    });
  });

  describe('tryCatchSync', () => {
    it('should return Ok for successful sync operation', () => {
      const result = tryCatchSync(() => 42);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return Err for thrown error', () => {
      const result = tryCatchSync(() => {
        throw new Error('Test error');
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('Test error');
      }
    });

    it('should wrap non-Error throws in Error', () => {
      const result = tryCatchSync(() => {
        throw 'string error';
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('string error');
      }
    });

    it('should handle operations that return objects', () => {
      const result = tryCatchSync(() => ({ id: '123', name: 'test' }));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ id: '123', name: 'test' });
      }
    });

    it('should handle operations that return null', () => {
      const result = tryCatchSync(() => null);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeNull();
      }
    });

    it('should handle operations that return undefined', () => {
      const result = tryCatchSync(() => undefined);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should preserve error details', () => {
      const customError = new Error('Custom error');
      customError.stack = 'custom stack';

      const result = tryCatchSync(() => {
        throw customError;
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(customError);
        expect(result.error.stack).toBe('custom stack');
      }
    });

    it('should wrap number throws', () => {
      const result = tryCatchSync(() => {
        throw 404;
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('404');
      }
    });

    it('should wrap object throws', () => {
      const result = tryCatchSync(() => {
        throw { code: 'ERR_001', message: 'Custom' };
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('[object Object]');
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should support railway-oriented programming pattern', () => {
      function parseNumber(str: string): Result<number, string> {
        const num = parseInt(str, 10);
        if (isNaN(num)) {
          return Err('Invalid number');
        }
        return Ok(num);
      }

      function multiplyBy(factor: number) {
        return (n: number): Result<number, string> => Ok(n * factor);
      }

      function ensurePositive(n: number): Result<number, string> {
        if (n <= 0) {
          return Err('Must be positive');
        }
        return Ok(n);
      }

      // Success path
      const result1 = flatMap(flatMap(parseNumber('10'), multiplyBy(2)), ensurePositive);
      expect(isOk(result1)).toBe(true);
      if (isOk(result1)) {
        expect(result1.value).toBe(20);
      }

      // Parse error
      const result2 = flatMap(flatMap(parseNumber('abc'), multiplyBy(2)), ensurePositive);
      expect(isErr(result2)).toBe(true);
      if (isErr(result2)) {
        expect(result2.error).toBe('Invalid number');
      }

      // Validation error
      const result3 = flatMap(flatMap(parseNumber('-5'), multiplyBy(2)), ensurePositive);
      expect(isErr(result3)).toBe(true);
      if (isErr(result3)) {
        expect(result3.error).toBe('Must be positive');
      }
    });

    it('should support complex data validation pipelines', () => {
      interface User {
        id: string;
        email: string;
        age: number;
      }

      function validateEmail(email: string): Result<string, string> {
        if (!email.includes('@')) {
          return Err('Invalid email format');
        }
        return Ok(email);
      }

      function validateAge(age: number): Result<number, string> {
        if (age < 0 || age > 150) {
          return Err('Invalid age');
        }
        return Ok(age);
      }

      function createUser(id: string, email: string, age: number): Result<User, string> {
        const emailResult = validateEmail(email);
        if (isErr(emailResult)) {
          return emailResult;
        }

        const ageResult = validateAge(age);
        if (isErr(ageResult)) {
          return ageResult;
        }

        return Ok({ id, email: emailResult.value, age: ageResult.value });
      }

      const validUser = createUser('123', 'test@example.com', 25);
      expect(isOk(validUser)).toBe(true);

      const invalidEmail = createUser('123', 'invalid', 25);
      expect(isErr(invalidEmail)).toBe(true);

      const invalidAge = createUser('123', 'test@example.com', 200);
      expect(isErr(invalidAge)).toBe(true);
    });
  });
});
