/**
 * Comprehensive tests for pipeline and functional composition utilities
 * Testing pipe, flow, compose, async operations, and array/object operators
 */

import { describe, it, expect, vi } from 'vitest';
import {
  pipe,
  flow,
  compose,
  pipeAsync,
  pipeResult,
  pipeResultAsync,
  tap,
  tapAsync,
  tapIf,
  when,
  ifElse,
  match,
  map,
  filter,
  reduce,
  flatMap,
  sort,
  take,
  skip,
  unique,
  uniqueBy,
  groupBy,
  partition,
  pick,
  omit,
  merge,
  mapValues,
  filterEntries,
  validator,
  validators,
  type ValidationError,
} from '../pipeline.js';
import { Ok, Err, type Result } from '../result.js';

describe('Pipe Function', () => {
  it('should return the input when no functions provided', () => {
    const result = pipe(5);
    expect(result).toBe(5);
  });

  it('should pipe value through single function', () => {
    const add1 = (x: number) => x + 1;
    const result = pipe(5, add1);
    expect(result).toBe(6);
  });

  it('should pipe value through multiple functions', () => {
    const add1 = (x: number) => x + 1;
    const double = (x: number) => x * 2;
    const toString = (x: number) => String(x);

    const result = pipe(5, add1, double, toString);
    expect(result).toBe('12');
  });

  it('should execute functions left to right', () => {
    const ops: string[] = [];
    const f1 = (x: number) => {
      ops.push('f1');
      return x + 1;
    };
    const f2 = (x: number) => {
      ops.push('f2');
      return x * 2;
    };

    pipe(5, f1, f2);
    expect(ops).toEqual(['f1', 'f2']);
  });

  it('should handle complex transformations', () => {
    const result = pipe(
      [1, 2, 3, 4, 5],
      (arr) => arr.filter((x) => x % 2 === 0),
      (arr) => arr.map((x) => x * 2),
      (arr) => arr.reduce((sum, x) => sum + x, 0)
    );

    expect(result).toBe(12); // [2, 4] -> [4, 8] -> 12
  });

  it('should work with different types', () => {
    const result = pipe(
      'hello',
      (s) => s.toUpperCase(),
      (s) => s.split(''),
      (arr) => arr.length
    );

    expect(result).toBe(5);
  });

  it('should handle up to 10 functions', () => {
    const add1 = (x: number) => x + 1;
    const result = pipe(0, add1, add1, add1, add1, add1, add1, add1, add1, add1, add1);
    expect(result).toBe(10);
  });
});

describe('Flow Function', () => {
  it('should create a pipeline function', () => {
    const add1 = (x: number) => x + 1;
    const process = flow(add1);

    expect(process(5)).toBe(6);
  });

  it('should create a function that can be reused', () => {
    const add1 = (x: number) => x + 1;
    const double = (x: number) => x * 2;
    const process = flow(add1, double);

    expect(process(5)).toBe(12);
    expect(process(10)).toBe(22);
    expect(process(0)).toBe(2);
  });

  it('should compose multiple transformations', () => {
    const process = flow(
      (x: number) => x + 1,
      (x) => x * 2,
      (x) => String(x)
    );

    expect(process(5)).toBe('12');
  });

  it('should allow partial application', () => {
    const addThenDouble = flow(
      (x: number) => x + 1,
      (x) => x * 2
    );

    const process = flow(addThenDouble, (x) => String(x));

    expect(process(5)).toBe('12');
  });
});

describe('Compose Function', () => {
  it('should compose functions right to left', () => {
    const add1 = (x: number) => x + 1;
    const double = (x: number) => x * 2;

    const composed = compose(double, add1);

    // double(add1(5)) = double(6) = 12
    expect(composed(5)).toBe(12);
  });

  it('should execute in reverse order of pipe', () => {
    const add1 = (x: number) => x + 1;
    const double = (x: number) => x * 2;

    const piped = pipe(5, add1, double);
    const composed = compose(double, add1)(5);

    expect(piped).toBe(composed);
  });

  it('should handle multiple compositions', () => {
    const add1 = (x: number) => x + 1;
    const double = (x: number) => x * 2;
    const square = (x: number) => x * x;

    const composed = compose(square, double, add1);

    // square(double(add1(2))) = square(double(3)) = square(6) = 36
    expect(composed(2)).toBe(36);
  });
});

describe('Async Pipe', () => {
  it('should handle async functions', async () => {
    const asyncAdd1 = async (x: number) => x + 1;
    const result = await pipeAsync(5, asyncAdd1);
    expect(result).toBe(6);
  });

  it('should handle mixed sync and async functions', async () => {
    const syncAdd1 = (x: number) => x + 1;
    const asyncDouble = async (x: number) => x * 2;

    const result = await pipeAsync(5, syncAdd1, asyncDouble);
    expect(result).toBe(12);
  });

  it('should execute functions sequentially', async () => {
    const ops: string[] = [];

    const f1 = async (x: number) => {
      ops.push('f1');
      return x + 1;
    };

    const f2 = async (x: number) => {
      ops.push('f2');
      return x * 2;
    };

    await pipeAsync(5, f1, f2);
    expect(ops).toEqual(['f1', 'f2']);
  });

  it('should handle async operations with delays', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const asyncOp1 = async (x: number) => {
      await delay(10);
      return x + 1;
    };

    const asyncOp2 = async (x: number) => {
      await delay(10);
      return x * 2;
    };

    const result = await pipeAsync(5, asyncOp1, asyncOp2);
    expect(result).toBe(12);
  });

  it('should propagate errors', async () => {
    const throwError = async () => {
      throw new Error('Test error');
    };

    await expect(pipeAsync(5, throwError)).rejects.toThrow('Test error');
  });
});

describe('Result Pipe', () => {
  it('should pipe through Result-returning functions', () => {
    const add1 = (x: number): Result<number, string> => Ok(x + 1);
    const double = (x: number): Result<number, string> => Ok(x * 2);

    const result = pipeResult(5, add1, double);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe(12);
    }
  });

  it('should short-circuit on first error', () => {
    const add1 = (x: number): Result<number, string> => Ok(x + 1);
    const fail = (_x: number): Result<number, string> => Err('Error occurred');
    const double = vi.fn((x: number): Result<number, string> => Ok(x * 2));

    const result = pipeResult(5, add1, fail, double);

    expect(result.isErr).toBe(true);
    expect(double).not.toHaveBeenCalled();
  });

  it('should preserve error from first failure', () => {
    const add1 = (x: number): Result<number, string> => Ok(x + 1);
    const fail1 = (_x: number): Result<number, string> => Err('First error');
    const fail2 = (_x: number): Result<number, string> => Err('Second error');

    const result = pipeResult(5, add1, fail1, fail2);

    if (result.isErr) {
      expect(result.error).toBe('First error');
    }
  });

  it('should handle successful pipeline', () => {
    const validate = (x: number): Result<number, string> =>
      x > 0 ? Ok(x) : Err('Must be positive');
    const add1 = (x: number): Result<number, string> => Ok(x + 1);
    const double = (x: number): Result<number, string> => Ok(x * 2);

    const result = pipeResult(5, validate, add1, double);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe(12);
    }
  });
});

describe('Async Result Pipe', () => {
  it('should pipe through async Result-returning functions', async () => {
    const add1 = async (x: number): Promise<Result<number, string>> => Ok(x + 1);
    const double = async (x: number): Promise<Result<number, string>> => Ok(x * 2);

    const result = await pipeResultAsync(5, add1, double);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe(12);
    }
  });

  it('should short-circuit on first error', async () => {
    const add1 = async (x: number): Promise<Result<number, string>> => Ok(x + 1);
    const fail = async (_x: number): Promise<Result<number, string>> => Err('Error');
    const double = vi.fn(async (x: number): Promise<Result<number, string>> => Ok(x * 2));

    const result = await pipeResultAsync(5, add1, fail, double);

    expect(result.isErr).toBe(true);
    expect(double).not.toHaveBeenCalled();
  });
});

describe('Tap Functions', () => {
  describe('tap', () => {
    it('should execute side effect without changing value', () => {
      const sideEffect = vi.fn();

      const result = pipe(5, tap(sideEffect), (x) => x + 1);

      expect(sideEffect).toHaveBeenCalledWith(5);
      expect(result).toBe(6);
    });

    it('should allow inspection in pipeline', () => {
      const inspected: number[] = [];

      const result = pipe(
        5,
        (x) => x + 1,
        tap((x) => inspected.push(x)),
        (x) => x * 2
      );

      expect(inspected).toEqual([6]);
      expect(result).toBe(12);
    });
  });

  describe('tapAsync', () => {
    it('should execute async side effect', async () => {
      const sideEffect = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const result = await pipeAsync(5, tapAsync(sideEffect), async (x) => x + 1);

      expect(sideEffect).toHaveBeenCalledWith(5);
      expect(result).toBe(6);
    });
  });

  describe('tapIf', () => {
    it('should execute side effect only when condition is true', () => {
      const sideEffect = vi.fn();
      const isEven = (x: number) => x % 2 === 0;

      pipe(4, tapIf(isEven, sideEffect));
      expect(sideEffect).toHaveBeenCalledWith(4);

      sideEffect.mockClear();

      pipe(5, tapIf(isEven, sideEffect));
      expect(sideEffect).not.toHaveBeenCalled();
    });
  });
});

describe('Conditional Transforms', () => {
  describe('when', () => {
    it('should apply transform when condition is true', () => {
      const isEven = (x: number) => x % 2 === 0;
      const double = (x: number) => x * 2;

      const result = pipe(4, when(isEven, double));
      expect(result).toBe(8);
    });

    it('should not apply transform when condition is false', () => {
      const isEven = (x: number) => x % 2 === 0;
      const double = (x: number) => x * 2;

      const result = pipe(5, when(isEven, double));
      expect(result).toBe(5);
    });
  });

  describe('ifElse', () => {
    it('should apply first transform when condition is true', () => {
      const isPositive = (x: number) => x > 0;
      const abs = (x: number) => Math.abs(x);
      const negate = (x: number) => -x;

      const result = pipe(5, ifElse(isPositive, abs, negate));
      expect(result).toBe(5);
    });

    it('should apply second transform when condition is false', () => {
      const isPositive = (x: number) => x > 0;
      const abs = (x: number) => Math.abs(x);
      const negate = (x: number) => -x;

      const result = pipe(-5, ifElse(isPositive, abs, negate));
      expect(result).toBe(5);
    });
  });

  describe('match', () => {
    it('should apply matching handler', () => {
      type Status = 'pending' | 'approved' | 'rejected';
      interface Request {
        status: Status;
        id: string;
      }

      const handleRequest = match<Request, Status, string>(
        (req) => req.status,
        {
          pending: () => 'Waiting for approval',
          approved: () => 'Request approved',
          rejected: () => 'Request rejected',
        }
      );

      expect(handleRequest({ status: 'pending', id: '1' })).toBe('Waiting for approval');
      expect(handleRequest({ status: 'approved', id: '2' })).toBe('Request approved');
    });

    it('should use default handler when no match', () => {
      const handleStatus = match<{ status: string }, string, string>(
        (obj) => obj.status as 'a' | 'b',
        {
          a: () => 'A',
          b: () => 'B',
        },
        () => 'Unknown'
      );

      expect(handleStatus({ status: 'c' })).toBe('Unknown');
    });

    it('should throw when no match and no default', () => {
      const handleStatus = match<{ status: string }, string, string>(
        (obj) => obj.status as 'a' | 'b',
        {
          a: () => 'A',
          b: () => 'B',
        }
      );

      expect(() => handleStatus({ status: 'c' })).toThrow('No handler for key: c');
    });
  });
});

describe('Array Pipeline Operators', () => {
  describe('map', () => {
    it('should map over array', () => {
      const double = (x: number) => x * 2;
      const result = pipe([1, 2, 3], map(double));
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('filter', () => {
    it('should filter array', () => {
      const isEven = (x: number) => x % 2 === 0;
      const result = pipe([1, 2, 3, 4, 5], filter(isEven));
      expect(result).toEqual([2, 4]);
    });
  });

  describe('reduce', () => {
    it('should reduce array', () => {
      const sum = (acc: number, x: number) => acc + x;
      const result = pipe([1, 2, 3, 4, 5], reduce(sum, 0));
      expect(result).toBe(15);
    });
  });

  describe('flatMap', () => {
    it('should flatMap over array', () => {
      const duplicate = (x: number) => [x, x];
      const result = pipe([1, 2, 3], flatMap(duplicate));
      expect(result).toEqual([1, 1, 2, 2, 3, 3]);
    });
  });

  describe('sort', () => {
    it('should sort array', () => {
      const result = pipe([3, 1, 4, 1, 5], sort());
      expect(result).toEqual([1, 1, 3, 4, 5]);
    });

    it('should sort with compare function', () => {
      const descending = (a: number, b: number) => b - a;
      const result = pipe([3, 1, 4, 1, 5], sort(descending));
      expect(result).toEqual([5, 4, 3, 1, 1]);
    });

    it('should not mutate original array', () => {
      const original = [3, 1, 4];
      pipe(original, sort());
      expect(original).toEqual([3, 1, 4]);
    });
  });

  describe('take', () => {
    it('should take first n elements', () => {
      const result = pipe([1, 2, 3, 4, 5], take(3));
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle n larger than array length', () => {
      const result = pipe([1, 2], take(5));
      expect(result).toEqual([1, 2]);
    });
  });

  describe('skip', () => {
    it('should skip first n elements', () => {
      const result = pipe([1, 2, 3, 4, 5], skip(2));
      expect(result).toEqual([3, 4, 5]);
    });

    it('should handle n larger than array length', () => {
      const result = pipe([1, 2], skip(5));
      expect(result).toEqual([]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      const result = pipe([1, 2, 2, 3, 3, 3, 4], unique());
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should handle empty array', () => {
      const result = pipe([], unique());
      expect(result).toEqual([]);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates by key', () => {
      const users = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Alice2' },
      ];

      const result = pipe(
        users,
        uniqueBy((u) => u.id)
      );

      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  describe('groupBy', () => {
    it('should group by key', () => {
      const items = [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
        { type: 'veggie', name: 'carrot' },
      ];

      const result = pipe(
        items,
        groupBy((item) => item.type)
      );

      expect(result.fruit).toHaveLength(2);
      expect(result.veggie).toHaveLength(1);
    });
  });

  describe('partition', () => {
    it('should partition into matches and non-matches', () => {
      const isEven = (x: number) => x % 2 === 0;
      const result = pipe([1, 2, 3, 4, 5], partition(isEven));

      expect(result).toEqual([
        [2, 4],
        [1, 3, 5],
      ]);
    });
  });
});

describe('Object Pipeline Operators', () => {
  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pipe(obj, pick('a', 'c'));
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pipe(obj, omit('b'));
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('merge', () => {
    it('should merge objects', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { c: 3, d: 4 };
      const result = pipe(obj1, merge(obj2));
      expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should override with second object values', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 3, c: 4 };
      const result = pipe(obj1, merge(obj2));
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });
  });

  describe('mapValues', () => {
    it('should map over object values', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pipe(
        obj,
        mapValues((v) => v * 2)
      );
      expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });
  });

  describe('filterEntries', () => {
    it('should filter object entries', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      const result = pipe(
        obj,
        filterEntries((_, v) => v % 2 === 0)
      );
      expect(result).toEqual({ b: 2, d: 4 });
    });
  });
});

describe('Validation Pipeline', () => {
  describe('validator', () => {
    it('should return Ok for valid value', () => {
      const validatePositive = validator<number>((x) => (x > 0 ? null : { field: 'value', message: 'Must be positive' }));

      const result = pipe(5, validatePositive);
      expect(result.isOk).toBe(true);
    });

    it('should return Err for invalid value', () => {
      const validatePositive = validator<number>((x) => (x > 0 ? null : { field: 'value', message: 'Must be positive' }));

      const result = pipe(-5, validatePositive);
      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error.message).toBe('Must be positive');
      }
    });
  });

  describe('validators', () => {
    it('should combine multiple validators', () => {
      const isPositive = (x: number): ValidationError | null =>
        x > 0 ? null : { field: 'value', message: 'Must be positive' };

      const isLessThan100 = (x: number): ValidationError | null =>
        x < 100 ? null : { field: 'value', message: 'Must be less than 100' };

      const validate = validators(isPositive, isLessThan100);

      const result = pipe(50, validate);
      expect(result.isOk).toBe(true);
    });

    it('should collect all validation errors', () => {
      const isPositive = (x: number): ValidationError | null =>
        x > 0 ? null : { field: 'value', message: 'Must be positive' };

      const isEven = (x: number): ValidationError | null =>
        x % 2 === 0 ? null : { field: 'value', message: 'Must be even' };

      const validate = validators(isPositive, isEven);

      const result = pipe(-5, validate);
      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error).toHaveLength(2);
      }
    });
  });
});

describe('Complex Pipelines', () => {
  it('should handle complex data transformations', () => {
    interface User {
      id: number;
      name: string;
      age: number;
      active: boolean;
    }

    const users: User[] = [
      { id: 1, name: 'Alice', age: 25, active: true },
      { id: 2, name: 'Bob', age: 30, active: false },
      { id: 3, name: 'Charlie', age: 35, active: true },
      { id: 4, name: 'David', age: 25, active: true },
    ];

    const result = pipe(
      users,
      filter((u) => u.active),
      map((u) => ({ ...u, age: u.age + 1 })),
      groupBy((u) => u.age),
      mapValues((group) => group.length)
    );

    expect(result[26]).toBe(2);
    expect(result[36]).toBe(1);
  });

  it('should chain array and object operations', () => {
    const data = [
      { category: 'A', value: 10 },
      { category: 'B', value: 20 },
      { category: 'A', value: 15 },
    ];

    const result = pipe(
      data,
      groupBy((item) => item.category),
      mapValues((items) => items.reduce((sum, item) => sum + item.value, 0))
    );

    expect(result.A).toBe(25);
    expect(result.B).toBe(20);
  });
});
