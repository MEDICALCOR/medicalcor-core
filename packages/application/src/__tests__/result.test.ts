/**
 * Application Result Type Tests
 * Tests for functional error handling Result monad
 */

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

describe('Ok', () => {
  it('should create Ok result with value', () => {
    const result = Ok(42);

    expect(result._tag).toBe('Ok');
    expect(result.value).toBe(42);
  });

  it('should work with different value types', () => {
    expect(Ok('string').value).toBe('string');
    expect(Ok({ key: 'value' }).value).toEqual({ key: 'value' });
    expect(Ok([1, 2, 3]).value).toEqual([1, 2, 3]);
    expect(Ok(null).value).toBeNull();
    expect(Ok(undefined).value).toBeUndefined();
  });
});

describe('Err', () => {
  it('should create Err result with error', () => {
    const result = Err('error message');

    expect(result._tag).toBe('Err');
    expect(result.error).toBe('error message');
  });

  it('should work with Error objects', () => {
    const error = new Error('test error');
    const result = Err(error);

    expect(result.error).toBe(error);
    expect(result.error.message).toBe('test error');
  });

  it('should work with custom error types', () => {
    const result = Err({ code: 'NOT_FOUND', message: 'Resource not found' });

    expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
  });
});

describe('isOk', () => {
  it('should return true for Ok result', () => {
    expect(isOk(Ok(42))).toBe(true);
    expect(isOk(Ok(null))).toBe(true);
    expect(isOk(Ok(undefined))).toBe(true);
  });

  it('should return false for Err result', () => {
    expect(isOk(Err('error'))).toBe(false);
    expect(isOk(Err(new Error('test')))).toBe(false);
  });

  it('should narrow type correctly', () => {
    const result: Result<number, string> = Ok(42);
    if (isOk(result)) {
      // TypeScript should know result.value is number
      expect(result.value).toBe(42);
    }
  });
});

describe('isErr', () => {
  it('should return true for Err result', () => {
    expect(isErr(Err('error'))).toBe(true);
    expect(isErr(Err(new Error('test')))).toBe(true);
  });

  it('should return false for Ok result', () => {
    expect(isErr(Ok(42))).toBe(false);
    expect(isErr(Ok(null))).toBe(false);
  });

  it('should narrow type correctly', () => {
    const result: Result<number, string> = Err('error');
    if (isErr(result)) {
      // TypeScript should know result.error is string
      expect(result.error).toBe('error');
    }
  });
});

describe('unwrap', () => {
  it('should return value for Ok result', () => {
    expect(unwrap(Ok(42))).toBe(42);
    expect(unwrap(Ok('string'))).toBe('string');
    expect(unwrap(Ok({ key: 'value' }))).toEqual({ key: 'value' });
  });

  it('should throw error for Err result', () => {
    const error = new Error('test error');
    expect(() => unwrap(Err(error))).toThrow(error);
  });

  it('should throw the error value directly', () => {
    const errorMessage = 'custom error';
    expect(() => unwrap(Err(errorMessage))).toThrow(errorMessage);
  });
});

describe('unwrapOr', () => {
  it('should return value for Ok result', () => {
    expect(unwrapOr(Ok(42), 0)).toBe(42);
    expect(unwrapOr(Ok('value'), 'default')).toBe('value');
  });

  it('should return default for Err result', () => {
    expect(unwrapOr(Err('error'), 0)).toBe(0);
    expect(unwrapOr(Err(new Error('test')), 'default')).toBe('default');
  });

  it('should work with null/undefined defaults', () => {
    expect(unwrapOr(Err('error'), null)).toBeNull();
    expect(unwrapOr(Err('error'), undefined)).toBeUndefined();
  });
});

describe('map', () => {
  it('should transform Ok value', () => {
    const result = map(Ok(2), (x) => x * 3);

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(6);
  });

  it('should pass through Err unchanged', () => {
    const error = 'original error';
    const result = map(Err(error), (x: number) => x * 3);

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<string>>).error).toBe(error);
  });

  it('should chain multiple maps', () => {
    const result = map(
      map(Ok(2), (x) => x + 1),
      (x) => x * 2
    );

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(6);
  });

  it('should work with type-changing transformations', () => {
    const result = map(Ok(42), (x) => `Number: ${x}`);

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<string>>).value).toBe('Number: 42');
  });
});

describe('mapErr', () => {
  it('should transform Err value', () => {
    const result = mapErr(Err('error'), (e) => e.toUpperCase());

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<string>>).error).toBe('ERROR');
  });

  it('should pass through Ok unchanged', () => {
    const result = mapErr(Ok(42), (e: string) => e.toUpperCase());

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(42);
  });

  it('should work with error type conversion', () => {
    const result = mapErr(Err('not_found'), (e) => ({ code: e, message: 'Resource not found' }));

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<{ code: string; message: string }>>).error).toEqual({
      code: 'not_found',
      message: 'Resource not found',
    });
  });
});

describe('flatMap', () => {
  const divide = (a: number, b: number): Result<number, string> => {
    if (b === 0) {
      return Err('Division by zero');
    }
    return Ok(a / b);
  };

  it('should chain successful operations', () => {
    const result = flatMap(Ok(10), (x) => divide(x, 2));

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(5);
  });

  it('should short-circuit on error', () => {
    const result = flatMap(Ok(10), (x) => divide(x, 0));

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<string>>).error).toBe('Division by zero');
  });

  it('should pass through initial Err', () => {
    const result = flatMap(Err('initial error'), (x: number) => divide(x, 2));

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<string>>).error).toBe('initial error');
  });

  it('should chain multiple flatMaps', () => {
    const result = flatMap(
      flatMap(Ok(100), (x) => divide(x, 2)),
      (x) => divide(x, 5)
    );

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(10);
  });
});

describe('combine', () => {
  it('should combine all Ok results', () => {
    const results = [Ok(1), Ok(2), Ok(3)];
    const combined = combine(results);

    expect(isOk(combined)).toBe(true);
    expect((combined as ReturnType<typeof Ok<number[]>>).value).toEqual([1, 2, 3]);
  });

  it('should return first Err', () => {
    const results = [Ok(1), Err('first error'), Ok(3), Err('second error')];
    const combined = combine(results);

    expect(isErr(combined)).toBe(true);
    expect((combined as ReturnType<typeof Err<string>>).error).toBe('first error');
  });

  it('should return Ok for empty array', () => {
    const combined = combine([]);

    expect(isOk(combined)).toBe(true);
    expect((combined as ReturnType<typeof Ok<never[]>>).value).toEqual([]);
  });

  it('should work with single result', () => {
    const okResult = combine([Ok(42)]);
    expect(isOk(okResult)).toBe(true);
    expect((okResult as ReturnType<typeof Ok<number[]>>).value).toEqual([42]);

    const errResult = combine([Err('error')]);
    expect(isErr(errResult)).toBe(true);
  });
});

describe('tryCatch', () => {
  it('should return Ok for successful async operation', async () => {
    const result = await tryCatch(async () => 42);

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(42);
  });

  it('should return Err for failed async operation', async () => {
    const error = new Error('async error');
    const result = await tryCatch(async () => {
      throw error;
    });

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<Error>>).error).toBe(error);
  });

  it('should wrap non-Error throws in Error', async () => {
    const result = await tryCatch(async () => {
      throw 'string error';
    });

    expect(isErr(result)).toBe(true);
    const err = (result as ReturnType<typeof Err<Error>>).error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error');
  });

  it('should handle async operations with delay', async () => {
    const result = await tryCatch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'delayed result';
    });

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<string>>).value).toBe('delayed result');
  });
});

describe('tryCatchSync', () => {
  it('should return Ok for successful sync operation', () => {
    const result = tryCatchSync(() => 42);

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<number>>).value).toBe(42);
  });

  it('should return Err for failed sync operation', () => {
    const error = new Error('sync error');
    const result = tryCatchSync(() => {
      throw error;
    });

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<Error>>).error).toBe(error);
  });

  it('should wrap non-Error throws in Error', () => {
    const result = tryCatchSync(() => {
      throw 'string error';
    });

    expect(isErr(result)).toBe(true);
    const err = (result as ReturnType<typeof Err<Error>>).error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error');
  });

  it('should handle complex operations', () => {
    const result = tryCatchSync(() => {
      const obj = { a: 1, b: 2 };
      return JSON.stringify(obj);
    });

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<string>>).value).toBe('{"a":1,"b":2}');
  });

  it('should catch JSON parse errors', () => {
    const result = tryCatchSync(() => {
      return JSON.parse('invalid json');
    });

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<Error>>).error).toBeInstanceOf(SyntaxError);
  });
});

describe('Result integration', () => {
  interface User {
    id: string;
    name: string;
    email: string;
  }

  const validateEmail = (email: string): Result<string, string> => {
    if (email.includes('@')) {
      return Ok(email);
    }
    return Err('Invalid email format');
  };

  const createUser = (name: string, email: string): Result<User, string> => {
    return flatMap(validateEmail(email), (validEmail) =>
      Ok({ id: '123', name, email: validEmail })
    );
  };

  it('should handle valid user creation', () => {
    const result = createUser('John', 'john@example.com');

    expect(isOk(result)).toBe(true);
    expect((result as ReturnType<typeof Ok<User>>).value).toEqual({
      id: '123',
      name: 'John',
      email: 'john@example.com',
    });
  });

  it('should handle invalid user creation', () => {
    const result = createUser('John', 'invalid-email');

    expect(isErr(result)).toBe(true);
    expect((result as ReturnType<typeof Err<string>>).error).toBe('Invalid email format');
  });

  it('should work with unwrapOr for default values', () => {
    const okUser = createUser('John', 'john@example.com');
    const errUser = createUser('John', 'invalid');

    const defaultUser: User = { id: '0', name: 'Guest', email: 'guest@example.com' };

    expect(unwrapOr(okUser, defaultUser)).toEqual({
      id: '123',
      name: 'John',
      email: 'john@example.com',
    });
    expect(unwrapOr(errUser, defaultUser)).toEqual(defaultUser);
  });
});
