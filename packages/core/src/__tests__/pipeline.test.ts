import { describe, it, expect } from 'vitest';
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
} from '../types/pipeline.js';
import { Ok, Err, isOk, isErr } from '../types/result.js';

describe('Pipeline Functions', () => {
  describe('pipe', () => {
    it('should return value when no functions provided', () => {
      expect(pipe(5)).toBe(5);
      expect(pipe('hello')).toBe('hello');
      expect(pipe(null)).toBe(null);
    });

    it('should apply single function', () => {
      const double = (x: number) => x * 2;
      expect(pipe(5, double)).toBe(10);
    });

    it('should apply multiple functions left to right', () => {
      const add1 = (x: number) => x + 1;
      const double = (x: number) => x * 2;
      const toString = (x: number) => String(x);

      expect(pipe(5, add1, double, toString)).toBe('12');
    });

    it('should support type transformations', () => {
      const parse = (s: string) => parseInt(s, 10);
      const double = (n: number) => n * 2;
      const toArray = (n: number) => [n];

      const result = pipe('5', parse, double, toArray);
      expect(result).toEqual([10]);
    });

    it('should handle up to 9 functions', () => {
      const result = pipe(
        1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1
      );
      expect(result).toBe(10);
    });
  });

  describe('flow', () => {
    it('should create pipeline function', () => {
      const process = flow(
        (x: number) => x + 1,
        (x) => x * 2
      );

      expect(process(5)).toBe(12);
      expect(process(10)).toBe(22);
    });

    it('should handle single function', () => {
      const process = flow((x: number) => x * 2);
      expect(process(5)).toBe(10);
    });

    it('should support complex transformations', () => {
      const process = flow(
        (s: string) => s.split(','),
        (arr) => arr.map(Number),
        (arr) => arr.reduce((a, b) => a + b, 0)
      );

      expect(process('1,2,3,4')).toBe(10);
    });
  });

  describe('compose', () => {
    it('should compose functions right to left', () => {
      const add1 = (x: number) => x + 1;
      const double = (x: number) => x * 2;

      const composed = compose(double, add1);
      // double(add1(5)) = double(6) = 12
      expect(composed(5)).toBe(12);
    });

    it('should handle single function', () => {
      const double = (x: number) => x * 2;
      const composed = compose(double);
      expect(composed(5)).toBe(10);
    });

    it('should compose in mathematical order', () => {
      const f = (x: number) => x + 1;
      const g = (x: number) => x * 2;
      const h = (x: number) => x - 3;

      // (f ∘ g ∘ h)(x) = f(g(h(x)))
      const composed = compose(f, g, h);
      // f(g(h(5))) = f(g(2)) = f(4) = 5
      expect(composed(5)).toBe(5);
    });
  });

  describe('pipeAsync', () => {
    it('should handle async functions', async () => {
      const result = await pipeAsync(
        5,
        async (x) => x + 1,
        async (x) => x * 2
      );
      expect(result).toBe(12);
    });

    it('should handle mixed sync and async functions', async () => {
      const result = await pipeAsync(
        'hello',
        (s) => s.toUpperCase(),
        async (s) => s + '!'
      );
      expect(result).toBe('HELLO!');
    });

    it('should return value when no functions provided', async () => {
      expect(await pipeAsync(42)).toBe(42);
    });

    it('should handle sequential async operations', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const result = await pipeAsync(
        1,
        async (x) => {
          await delay(5);
          return x + 1;
        },
        async (x) => {
          await delay(5);
          return x * 2;
        }
      );
      expect(result).toBe(4);
    });
  });

  describe('pipeResult', () => {
    it('should pipe through successful results', () => {
      const validate = (x: number) => (x > 0 ? Ok(x) : Err('negative'));
      const double = (x: number) => Ok(x * 2);

      const result = pipeResult(5, validate, double);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should short-circuit on error', () => {
      let secondCalled = false;

      const fail = (_x: number) => Err('first error');
      const second = (x: number) => {
        secondCalled = true;
        return Ok(x * 2);
      };

      const result = pipeResult(5, fail, second);
      expect(isErr(result)).toBe(true);
      expect(secondCalled).toBe(false);
    });

    it('should return initial value wrapped in Ok', () => {
      const result = pipeResult(42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('pipeResultAsync', () => {
    it('should handle async Result functions', async () => {
      const validate = async (x: number) => (x > 0 ? Ok(x) : Err('negative'));
      const transform = async (x: number) => Ok(x * 2);

      const result = await pipeResultAsync(5, validate, transform);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should short-circuit on async error', async () => {
      const fail = async (_x: number) => Err('async error');
      const transform = async (x: number) => Ok(x * 2);

      const result = await pipeResultAsync(5, fail, transform);
      expect(isErr(result)).toBe(true);
    });
  });
});

describe('Side Effect Functions', () => {
  describe('tap', () => {
    it('should execute side effect and return original value', () => {
      const values: number[] = [];
      const result = pipe(
        5,
        tap((x) => values.push(x)),
        (x) => x * 2
      );

      expect(result).toBe(10);
      expect(values).toEqual([5]);
    });

    it('should not modify the value', () => {
      const result = pipe(
        'hello',
        tap(() => {
          /* no-op */
        }),
        (s) => s.length
      );
      expect(result).toBe(5);
    });
  });

  describe('tapAsync', () => {
    it('should execute async side effect', async () => {
      const values: number[] = [];

      const result = await pipeAsync(
        5,
        tapAsync(async (x) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          values.push(x);
        }),
        (x) => x * 2
      );

      expect(result).toBe(10);
      expect(values).toEqual([5]);
    });
  });

  describe('tapIf', () => {
    it('should execute side effect when condition is true', () => {
      const logs: string[] = [];

      const result = pipe(
        10,
        tapIf(
          (x) => x > 5,
          (x) => logs.push(`Value: ${x}`)
        )
      );

      expect(result).toBe(10);
      expect(logs).toEqual(['Value: 10']);
    });

    it('should skip side effect when condition is false', () => {
      const logs: string[] = [];

      const result = pipe(
        3,
        tapIf(
          (x) => x > 5,
          (x) => logs.push(`Value: ${x}`)
        )
      );

      expect(result).toBe(3);
      expect(logs).toEqual([]);
    });
  });
});

describe('Conditional Functions', () => {
  describe('when', () => {
    it('should apply transform when condition is true', () => {
      const result = pipe(
        5,
        when(
          (x) => x > 3,
          (x) => x * 2
        )
      );
      expect(result).toBe(10);
    });

    it('should not apply transform when condition is false', () => {
      const result = pipe(
        2,
        when(
          (x) => x > 3,
          (x) => x * 2
        )
      );
      expect(result).toBe(2);
    });
  });

  describe('ifElse', () => {
    it('should apply onTrue when condition is true', () => {
      const classify = ifElse(
        (x: number) => x >= 0,
        () => 'positive',
        () => 'negative'
      );

      expect(classify(5)).toBe('positive');
    });

    it('should apply onFalse when condition is false', () => {
      const classify = ifElse(
        (x: number) => x >= 0,
        () => 'positive',
        () => 'negative'
      );

      expect(classify(-5)).toBe('negative');
    });
  });

  describe('match', () => {
    it('should match on key and apply handler', () => {
      type Status = 'active' | 'inactive' | 'pending';
      interface Item {
        status: Status;
        value: number;
      }

      const processItem = match<Item, Status, string>((item) => item.status, {
        active: (item) => `Active: ${item.value}`,
        inactive: (item) => `Inactive: ${item.value}`,
        pending: (item) => `Pending: ${item.value}`,
      });

      expect(processItem({ status: 'active', value: 10 })).toBe('Active: 10');
      expect(processItem({ status: 'pending', value: 5 })).toBe('Pending: 5');
    });

    it('should use default handler when no match', () => {
      const classify = match<number, string, string>(
        (n) => (n > 100 ? 'large' : n > 10 ? 'medium' : 'small'),
        {
          large: () => 'BIG',
          medium: () => 'MED',
        },
        () => 'DEFAULT'
      );

      expect(classify(5)).toBe('DEFAULT');
    });

    it('should throw when no match and no default', () => {
      const classifier = match<number, string, string>(() => 'unknown', {
        known: () => 'found',
      });

      expect(() => classifier(5)).toThrow('No handler for key');
    });
  });
});

describe('Array Pipeline Operators', () => {
  describe('map', () => {
    it('should map over array', () => {
      const result = pipe(
        [1, 2, 3],
        map((x: number) => x * 2)
      );
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('filter', () => {
    it('should filter array', () => {
      const result = pipe(
        [1, 2, 3, 4, 5],
        filter((x: number) => x % 2 === 0)
      );
      expect(result).toEqual([2, 4]);
    });
  });

  describe('reduce', () => {
    it('should reduce array', () => {
      const result = pipe(
        [1, 2, 3, 4],
        reduce((acc: number, x: number) => acc + x, 0)
      );
      expect(result).toBe(10);
    });
  });

  describe('flatMap', () => {
    it('should flatMap array', () => {
      const result = pipe(
        [1, 2, 3],
        flatMap((x: number) => [x, x * 2])
      );
      expect(result).toEqual([1, 2, 2, 4, 3, 6]);
    });
  });

  describe('sort', () => {
    it('should sort array', () => {
      const result = pipe([3, 1, 4, 1, 5], sort());
      expect(result).toEqual([1, 1, 3, 4, 5]);
    });

    it('should sort with comparator', () => {
      const result = pipe(
        [3, 1, 4, 1, 5],
        sort((a: number, b: number) => b - a)
      );
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

    it('should handle n larger than array', () => {
      const result = pipe([1, 2], take(10));
      expect(result).toEqual([1, 2]);
    });
  });

  describe('skip', () => {
    it('should skip first n elements', () => {
      const result = pipe([1, 2, 3, 4, 5], skip(2));
      expect(result).toEqual([3, 4, 5]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      const result = pipe([1, 2, 2, 3, 1, 4], unique());
      expect(result).toEqual([1, 2, 3, 4]);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates by key', () => {
      const items = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
      ];

      const result = pipe(
        items,
        uniqueBy((item) => item.id)
      );

      expect(result).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);
    });
  });

  describe('groupBy', () => {
    it('should group elements by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];

      const result = pipe(
        items,
        groupBy((item) => item.type)
      );

      expect(result).toEqual({
        a: [
          { type: 'a', value: 1 },
          { type: 'a', value: 3 },
        ],
        b: [{ type: 'b', value: 2 }],
      });
    });
  });

  describe('partition', () => {
    it('should partition into matches and non-matches', () => {
      const result = pipe(
        [1, 2, 3, 4, 5],
        partition((x: number) => x % 2 === 0)
      );

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
      const result = pipe({ a: 1 }, merge({ b: 2 }));
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should override existing keys', () => {
      const result = pipe({ a: 1, b: 2 }, merge({ b: 3 }));
      expect(result).toEqual({ a: 1, b: 3 });
    });
  });

  describe('mapValues', () => {
    it('should map over object values', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pipe(
        obj,
        mapValues((v: number) => v * 2)
      );
      expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    it('should provide key as second argument', () => {
      const obj = { a: 1, b: 2 };
      const result = pipe(
        obj,
        mapValues((v: number, k) => `${k}:${v}`)
      );
      expect(result).toEqual({ a: 'a:1', b: 'b:2' });
    });
  });

  describe('filterEntries', () => {
    it('should filter object entries', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pipe(
        obj,
        filterEntries((_k, v: number) => v > 1)
      );
      expect(result).toEqual({ b: 2, c: 3 });
    });
  });
});

describe('Validation Pipeline', () => {
  describe('validator', () => {
    it('should return Ok for valid input', () => {
      const isPositive = validator<number>((n) =>
        n > 0 ? null : { field: 'number', message: 'Must be positive' }
      );

      const result = isPositive(5);
      expect(isOk(result)).toBe(true);
    });

    it('should return Err for invalid input', () => {
      const isPositive = validator<number>((n) =>
        n > 0 ? null : { field: 'number', message: 'Must be positive' }
      );

      const result = isPositive(-1);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe('Must be positive');
      }
    });
  });

  describe('validators', () => {
    it('should return Ok when all validators pass', () => {
      const validate = validators<number>(
        (n) => (n > 0 ? null : { field: 'n', message: 'Must be positive' }),
        (n) => (n < 100 ? null : { field: 'n', message: 'Must be less than 100' })
      );

      const result = validate(50);
      expect(isOk(result)).toBe(true);
    });

    it('should collect all errors', () => {
      const validate = validators<number>(
        (n) => (n > 0 ? null : { field: 'n', message: 'Must be positive' }),
        (n) => (n < 100 ? null : { field: 'n', message: 'Must be less than 100' }),
        (n) => (n % 2 === 0 ? null : { field: 'n', message: 'Must be even' })
      );

      // -3 fails: not positive, and not even (but passes < 100)
      const result = validate(-3);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toHaveLength(2);
        expect(result.error[0].message).toBe('Must be positive');
        expect(result.error[1].message).toBe('Must be even');
      }
    });
  });
});

describe('Complex Pipeline Examples', () => {
  it('should process data through complete pipeline', () => {
    interface User {
      name: string;
      age: number;
      active: boolean;
    }

    const users: User[] = [
      { name: 'Alice', age: 30, active: true },
      { name: 'Bob', age: 25, active: false },
      { name: 'Charlie', age: 35, active: true },
      { name: 'Diana', age: 28, active: true },
    ];

    const result = pipe(
      users,
      filter((u: User) => u.active),
      map((u: User) => ({ ...u, ageGroup: u.age >= 30 ? 'senior' : 'junior' })),
      sort((a, b) => a.age - b.age),
      take(2)
    );

    expect(result).toEqual([
      { name: 'Diana', age: 28, active: true, ageGroup: 'junior' },
      { name: 'Alice', age: 30, active: true, ageGroup: 'senior' },
    ]);
  });

  it('should compose multiple flows', () => {
    const normalize = flow(
      (s: string) => s.trim(),
      (s) => s.toLowerCase()
    );

    const validate = flow(
      (s: string) => (s.length > 0 ? Ok(s) : Err('empty')),
      (r) => (isOk(r) && r.value.length <= 20 ? r : Err('too long'))
    );

    const process = flow(normalize, validate);

    expect(isOk(process('  HELLO  '))).toBe(true);
    expect(isErr(process('  '))).toBe(true);
  });
});
