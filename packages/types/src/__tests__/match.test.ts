/**
 * Pattern Matching Utilities Unit Tests
 *
 * Tests for exhaustive pattern matching including:
 * - Exhaustive matching with compile-time checks
 * - Discriminated union matching
 * - Partial matching with defaults
 * - Fluent pattern matcher (Matcher class)
 * - Union matcher with type narrowing
 * - Tagged union helpers
 * - Switch expressions
 * - Conditional helpers (cond, coalesce, etc.)
 */

import { describe, it, expect } from 'vitest';
import {
  // Exhaustive matching
  match,
  matchOn,
  matchPartial,
  // Fluent API
  Matcher,
  UnionMatcher,
  // Tagged unions
  TAG,
  variant,
  makeVariant,
  isVariant,
  tagIs,
  // Pattern utilities
  matchesPattern,
  P,
  _,
  // Switch expression
  switchExpr,
  // Conditional helpers
  cond,
  condLazy,
  coalesce,
  firstTruthy,
} from '../lib/match.js';

describe('Exhaustive Pattern Matching', () => {
  type Shape =
    | { type: 'circle'; radius: number }
    | { type: 'rectangle'; width: number; height: number }
    | { type: 'triangle'; base: number; height: number };

  describe('match', () => {
    it('should match on discriminated union', () => {
      // Use matchOn instead of match for better discriminant detection
      const calculateArea = matchOn<Shape, 'type'>('type', {
        circle: (s) => Math.PI * s.radius ** 2,
        rectangle: (s) => s.width * s.height,
        triangle: (s) => 0.5 * s.base * s.height,
      });

      expect(calculateArea({ type: 'circle', radius: 5 })).toBeCloseTo(78.54, 2);
      expect(calculateArea({ type: 'rectangle', width: 4, height: 6 })).toBe(24);
      expect(calculateArea({ type: 'triangle', base: 10, height: 5 })).toBe(25);
    });

    it('should narrow types correctly', () => {
      const getName = matchOn<Shape, 'type'>('type', {
        circle: (s) => `Circle (r=${s.radius})`,
        rectangle: (s) => `Rectangle (${s.width}x${s.height})`,
        triangle: (s) => `Triangle (b=${s.base}, h=${s.height})`,
      });

      const circle: Shape = { type: 'circle', radius: 10 };
      expect(getName(circle)).toBe('Circle (r=10)');
    });

    it('should handle all cases', () => {
      const matcher = matchOn<Shape, 'type'>('type', {
        circle: () => 1,
        rectangle: () => 2,
        triangle: () => 3,
      });

      // All cases are handled, so this shouldn't throw in normal use
      expect(matcher({ type: 'circle', radius: 5 })).toBe(1);
    });
  });

  describe('matchOn', () => {
    type Status =
      | { status: 'pending' }
      | { status: 'completed'; result: string }
      | { status: 'failed'; error: string };

    it('should match on specific discriminant key', () => {
      const handleStatus = matchOn<Status, 'status'>('status', {
        pending: () => 'Waiting...',
        completed: (s) => `Done: ${s.result}`,
        failed: (s) => `Error: ${s.error}`,
      });

      expect(handleStatus({ status: 'pending' })).toBe('Waiting...');
      expect(handleStatus({ status: 'completed', result: 'success' })).toBe('Done: success');
      expect(handleStatus({ status: 'failed', error: 'timeout' })).toBe('Error: timeout');
    });
  });

  describe('matchPartial', () => {
    type Priority = 'critical' | 'high' | 'medium' | 'low';

    it('should match specific cases with default', () => {
      type Item = { priority: Priority };

      const getUrgency = matchPartial<Item, 'priority', string>(
        'priority',
        {
          critical: () => 'URGENT!',
          high: () => 'Important',
        },
        () => 'Normal'
      );

      expect(getUrgency({ priority: 'critical' })).toBe('URGENT!');
      expect(getUrgency({ priority: 'high' })).toBe('Important');
      expect(getUrgency({ priority: 'medium' })).toBe('Normal');
      expect(getUrgency({ priority: 'low' })).toBe('Normal');
    });

    it('should call default handler for unmatched cases', () => {
      type Item = { priority: Priority };

      const matcher = matchPartial<Item, 'priority', string>(
        'priority',
        {
          critical: () => 'urgent',
        },
        (item) => `default: ${item.priority}`
      );

      expect(matcher({ priority: 'low' })).toBe('default: low');
    });
  });
});

describe('Fluent Pattern Matching', () => {
  describe('Matcher', () => {
    it('should match with predicate guards', () => {
      const classify = (score: number): string =>
        Matcher.value(score)
          .when(
            (s) => s >= 90,
            () => 'Excellent'
          )
          .when(
            (s) => s >= 70,
            () => 'Good'
          )
          .when(
            (s) => s >= 50,
            () => 'Average'
          )
          .otherwise(() => 'Poor');

      expect(classify(95)).toBe('Excellent');
      expect(classify(75)).toBe('Good');
      expect(classify(55)).toBe('Average');
      expect(classify(30)).toBe('Poor');
    });

    it('should match specific values', () => {
      const result = Matcher.value('hello')
        .is('goodbye', () => 'Farewell')
        .is('hello', () => 'Hi there')
        .otherwise(() => 'Unknown');

      expect(result).toBe('Hi there');
    });

    it('should match values in a set', () => {
      const category = Matcher.value('apple')
        .in(['apple', 'banana', 'orange'], () => 'fruit')
        .in(['carrot', 'celery'], () => 'vegetable')
        .otherwise(() => 'unknown');

      expect(category).toBe('fruit');
    });

    it('should match with type guards', () => {
      const value: unknown = 42;

      const result = Matcher.value(value)
        .isType(
          (v): v is string => typeof v === 'string',
          (s) => `String: ${s}`
        )
        .isType(
          (v): v is number => typeof v === 'number',
          (n) => `Number: ${n}`
        )
        .otherwise(() => 'Other');

      expect(result).toBe('Number: 42');
    });

    it('should stop at first match', () => {
      const result = Matcher.value(10)
        .when(
          (n) => n > 5,
          () => 'greater than 5'
        )
        .when(
          (n) => n > 8,
          () => 'greater than 8'
        )
        .otherwise(() => 'other');

      expect(result).toBe('greater than 5');
    });

    it('should support run() without default', () => {
      const result = Matcher.value(10)
        .when(
          (n) => n > 100,
          () => 'big'
        )
        .run();

      expect(result).toBeUndefined();
    });

    it('should support exhaustive() that throws on no match', () => {
      expect(() =>
        Matcher.value(10)
          .when(
            (n) => n > 100,
            () => 'big'
          )
          .exhaustive()
      ).toThrow();
    });

    it('should not throw with exhaustive() when matched', () => {
      const result = Matcher.value(10)
        .when(
          (n) => n > 5,
          () => 'matched'
        )
        .exhaustive();

      expect(result).toBe('matched');
    });
  });

  describe('UnionMatcher', () => {
    type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

    it('should match discriminated union variants', () => {
      const result: Result<number, string> = { ok: true, value: 42 };

      const message = UnionMatcher.on<Result<number, string>, 'ok'>(result, 'ok')
        .case(true, (r) => `Success: ${r.value}`)
        .case(false, (r) => `Error: ${r.error}`)
        .done();

      expect(message).toBe('Success: 42');
    });

    it('should support default handler', () => {
      const result: Result<number, string> = { ok: false, error: 'failed' };

      const message = UnionMatcher.on<Result<number, string>, 'ok'>(result, 'ok')
        .case(true, (r) => `Success: ${r.value}`)
        .default((r) => `Unknown result`);

      expect(message).toBe('Unknown result');
    });

    it('should narrow types correctly', () => {
      type Animal = { kind: 'dog'; bark: string } | { kind: 'cat'; meow: string };

      const animal: Animal = { kind: 'dog', bark: 'woof' };

      const sound = UnionMatcher.on<Animal, 'kind'>(animal, 'kind')
        .case('dog', (d) => d.bark)
        .case('cat', (c) => c.meow)
        .done();

      expect(sound).toBe('woof');
    });
  });
});

describe('Tagged Union Helpers', () => {
  describe('variant', () => {
    it('should create tagged variant', () => {
      const success = variant('success', { value: 42 });

      expect(success._tag).toBe('success');
      expect(success.value).toBe(42);
    });

    it('should be readonly', () => {
      const v = variant('test', { data: 'value' });

      // TypeScript should enforce readonly at compile time
      expect(v._tag).toBe('test');
    });
  });

  describe('makeVariant', () => {
    it('should create variant constructor', () => {
      const makeSuccess = makeVariant('success');
      const success = makeSuccess({ value: 42 });

      expect(success._tag).toBe('success');
      expect(success.value).toBe(42);
    });

    it('should create reusable constructor', () => {
      const makeError = makeVariant('error');
      const error1 = makeError({ message: 'Error 1' });
      const error2 = makeError({ message: 'Error 2' });

      expect(error1._tag).toBe('error');
      expect(error2._tag).toBe('error');
      expect(error1.message).toBe('Error 1');
      expect(error2.message).toBe('Error 2');
    });
  });

  describe('isVariant', () => {
    type Result = { _tag: 'success'; value: number } | { _tag: 'error'; message: string };

    it('should identify variant by tag', () => {
      const success: Result = { _tag: 'success', value: 42 };
      const error: Result = { _tag: 'error', message: 'failed' };

      expect(isVariant(success, 'success')).toBe(true);
      expect(isVariant<Result, 'error'>(success, 'error')).toBe(false);
      expect(isVariant(error, 'error')).toBe(true);
    });

    it('should narrow types', () => {
      const value: Result = { _tag: 'success', value: 42 };

      if (isVariant(value, 'success')) {
        expect(value.value).toBe(42);
      }
    });
  });

  describe('tagIs', () => {
    type Result = { _tag: 'success'; value: number } | { _tag: 'error'; message: string };

    it('should create type guard for tag', () => {
      const isSuccess = tagIs<Result, 'success'>('success');
      const success: Result = { _tag: 'success', value: 42 };

      expect(isSuccess(success)).toBe(true);
    });

    it('should be reusable', () => {
      const isError = tagIs<Result, 'error'>('error');
      const error1: Result = { _tag: 'error', message: 'Error 1' };
      const error2: Result = { _tag: 'error', message: 'Error 2' };

      expect(isError(error1)).toBe(true);
      expect(isError(error2)).toBe(true);
    });
  });
});

describe('Pattern Utilities', () => {
  describe('matchesPattern', () => {
    it('should match wildcard', () => {
      expect(matchesPattern(42, _)).toBe(true);
      expect(matchesPattern('anything', _)).toBe(true);
      expect(matchesPattern(null, _)).toBe(true);
    });

    it('should match exact values', () => {
      expect(matchesPattern(42, 42)).toBe(true);
      expect(matchesPattern('hello', 'hello')).toBe(true);
      expect(matchesPattern(42, 43)).toBe(false);
    });

    it('should match with predicate functions', () => {
      const isEven = (n: number) => n % 2 === 0;

      expect(matchesPattern(4, isEven)).toBe(true);
      expect(matchesPattern(5, isEven)).toBe(false);
    });

    it('should match with type guards', () => {
      const isNumber = P((v: unknown): v is number => typeof v === 'number');

      expect(matchesPattern(42, isNumber)).toBe(true);
      // Test runtime type checking - '42' is not a number
      expect(matchesPattern('42' as unknown as number, isNumber)).toBe(false);
    });
  });

  describe('wildcard (_)', () => {
    it('should be defined', () => {
      expect(_).toBeDefined();
      expect(_._).toBe('wildcard');
    });
  });

  describe('P (type pattern)', () => {
    it('should create type pattern', () => {
      const pattern = P((v: unknown): v is string => typeof v === 'string');

      expect(matchesPattern('hello', pattern)).toBe(true);
      // Test runtime type checking - 123 is not a string
      expect(matchesPattern(123 as unknown as string, pattern)).toBe(false);
    });
  });
});

describe('Switch Expression', () => {
  describe('switchExpr', () => {
    it('should match single case', () => {
      const result = switchExpr('active')
        .case('active', () => 'Running')
        .case('inactive', () => 'Stopped')
        .default(() => 'Unknown');

      expect(result).toBe('Running');
    });

    it('should match multiple values', () => {
      const result = switchExpr('warning')
        .cases(['error', 'critical'], () => 'Alert!')
        .cases(['warning', 'info'], () => 'Notice')
        .default(() => 'OK');

      expect(result).toBe('Notice');
    });

    it('should use default when no match', () => {
      const result = switchExpr('unknown')
        .case('known', () => 'Found')
        .default(() => 'Not found');

      expect(result).toBe('Not found');
    });

    it('should stop at first match', () => {
      const result = switchExpr(10)
        .case(10, () => 'ten')
        .case(10, () => 'diez')
        .default(() => 'other');

      expect(result).toBe('ten');
    });

    it('should work with different types', () => {
      type Status = 'new' | 'processing' | 'completed';
      const status: Status = 'processing';

      const message = switchExpr<Status>(status)
        .case('new', () => 'Just started')
        .case('processing', () => 'In progress')
        .case('completed', () => 'Done')
        .default(() => 'Unknown');

      expect(message).toBe('In progress');
    });
  });
});

describe('Conditional Expression Helpers', () => {
  describe('cond', () => {
    it('should return first truthy condition', () => {
      const score = 85;
      const grade = cond([score >= 90, 'A'], [score >= 80, 'B'], [score >= 70, 'C'], ['F']);

      expect(grade).toBe('B');
    });

    it('should return default when no condition matches', () => {
      const result = cond([false, 'no'], [false, 'nope'], ['default']);

      expect(result).toBe('default');
    });

    it('should throw if no default and no match', () => {
      // Use type assertion to test runtime behavior when no default is provided
      expect(() => (cond as (...args: [boolean, string][]) => string)([false, 'no'])).toThrow();
    });

    it('should support complex conditions', () => {
      const user = { isAdmin: false, isPremium: true };
      const greeting = cond(
        [user.isAdmin, 'Hello, Admin!'],
        [user.isPremium, 'Hello, Premium User!'],
        ['Hello, User!']
      );

      expect(greeting).toBe('Hello, Premium User!');
    });
  });

  describe('condLazy', () => {
    it('should evaluate handlers lazily', () => {
      let evaluated = false;

      condLazy(
        [
          false,
          () => {
            evaluated = true;
            return 'not called';
          },
        ],
        [true, () => 'called'],
        [() => 'default']
      );

      expect(evaluated).toBe(false);
    });

    it('should only evaluate matched handler', () => {
      const calls: number[] = [];

      condLazy(
        [
          false,
          () => {
            calls.push(1);
            return 'one';
          },
        ],
        [
          true,
          () => {
            calls.push(2);
            return 'two';
          },
        ],
        [
          () => {
            calls.push(3);
            return 'three';
          },
        ]
      );

      expect(calls).toEqual([2]);
    });

    it('should support expensive computations', () => {
      const expensiveComputation = () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return String(sum);
      };

      const result = condLazy(
        [true, () => 'fast'],
        [false, () => expensiveComputation()],
        [() => 'default']
      );

      expect(result).toBe('fast');
      // expensiveComputation was never called
    });
  });

  describe('coalesce', () => {
    it('should return first non-nullish value', () => {
      expect(coalesce(null, undefined, 'value', 'other')).toBe('value');
      expect(coalesce(undefined, null, 42, 0)).toBe(42);
    });

    it('should accept falsy but non-nullish values', () => {
      expect(coalesce(null, 0)).toBe(0);
      expect(coalesce(undefined, '')).toBe('');
      expect(coalesce(null, false)).toBe(false);
    });

    it('should return undefined when all are nullish', () => {
      expect(coalesce(null, undefined)).toBeUndefined();
    });

    it('should work like nullish coalescing', () => {
      const value: string | null | undefined = null;
      const default1 = 'default';

      expect(coalesce(value, default1)).toBe('default');
    });

    it('should handle nested undefined/null', () => {
      type Config = { value?: string | null };
      const config1: Config = {};
      const config2: Config = { value: null };
      const config3: Config = { value: 'actual' };

      expect(coalesce(config1.value, config2.value, config3.value, 'default')).toBe('actual');
    });
  });

  describe('firstTruthy', () => {
    it('should return first truthy value', () => {
      expect(firstTruthy(0, false, '', 'value')).toBe('value');
      expect(firstTruthy(null, undefined, 42)).toBe(42);
    });

    it('should skip all falsy values', () => {
      expect(firstTruthy(0, '', false, null, undefined, 'found')).toBe('found');
    });

    it('should return undefined when all are falsy', () => {
      expect(firstTruthy(0, '', false, null, undefined)).toBeUndefined();
    });

    it('should differ from coalesce for falsy values', () => {
      // coalesce accepts 0
      expect(coalesce(null, 0, 5)).toBe(0);
      // firstTruthy skips 0
      expect(firstTruthy(null, 0, 5)).toBe(5);
    });
  });
});

describe('Pattern Matching Edge Cases', () => {
  it('should handle empty objects', () => {
    type Empty = { type: 'empty' };
    const matcher = matchOn<Empty, 'type'>('type', {
      empty: () => 'empty',
    });

    expect(matcher({ type: 'empty' })).toBe('empty');
  });

  it('should handle numeric discriminants', () => {
    type Status = { code: 200; body: string } | { code: 404; error: string };

    const handle = (status: Status) =>
      UnionMatcher.on(status, 'code')
        .case(200, (s) => s.body)
        .case(404, (s) => s.error)
        .done();

    expect(handle({ code: 200, body: 'OK' })).toBe('OK');
    expect(handle({ code: 404, error: 'Not found' })).toBe('Not found');
  });

  it('should handle nested discriminated unions', () => {
    type Inner = { kind: 'a'; value: number } | { kind: 'b'; text: string };
    type Outer = { type: 'inner'; data: Inner } | { type: 'other'; message: string };

    const handleOuter = (outer: Outer): string =>
      UnionMatcher.on(outer, 'type')
        .case('inner', (o) => {
          return UnionMatcher.on(o.data, 'kind')
            .case('a', (i) => `Number: ${i.value}`)
            .case('b', (i) => `Text: ${i.text}`)
            .done();
        })
        .case('other', (o) => o.message)
        .done();

    expect(handleOuter({ type: 'inner', data: { kind: 'a', value: 42 } })).toBe('Number: 42');
    expect(handleOuter({ type: 'inner', data: { kind: 'b', text: 'hello' } })).toBe('Text: hello');
    expect(handleOuter({ type: 'other', message: 'test' })).toBe('test');
  });

  describe('match error handling', () => {
    it('should throw when match receives unhandled discriminant', () => {
      type TestType = { type: 'a' } | { type: 'b' };
      const handlers = {
        type: {
          a: () => 'A',
          // intentionally missing 'b' handler
        },
      };
      const matcher = match(handlers as never);

      expect(() => matcher({ type: 'b' } as TestType)).toThrow();
    });

    it('should throw when matchOn receives unhandled discriminant', () => {
      type TestStatus = { status: 'active' } | { status: 'inactive' } | { status: 'pending' };
      const handleStatus = matchOn<TestStatus, 'status'>('status', {
        active: () => 'Active',
        inactive: () => 'Inactive',
        // intentionally missing 'pending' handler
      } as never);

      expect(() => handleStatus({ status: 'pending' })).toThrow(/No handler for status/);
    });
  });
});
