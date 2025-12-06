import { describe, it, expect, vi } from 'vitest';
import {
  Ok,
  Err,
  Some,
  None,
  tryCatch,
  tryCatchAsync,
  fromNullable,
  toNullable,
  all,
  combine,
  firstOk,
  partition,
  traverse,
  traverseAsync,
  traverseParallel,
  isOk,
  isErr,
  isSome,
  isNone,
  AsyncResult,
  type Result,
  type Option,
} from '../types/result.js';

describe('Result Type', () => {
  describe('Ok', () => {
    describe('basic properties', () => {
      it('should have correct tag', () => {
        const result = Ok(42);
        expect(result._tag).toBe('Ok');
      });

      it('should have isOk=true and isErr=false', () => {
        const result = Ok('test');
        expect(result.isOk).toBe(true);
        expect(result.isErr).toBe(false);
      });

      it('should store value', () => {
        const result = Ok({ name: 'test' });
        expect(result.value).toEqual({ name: 'test' });
      });
    });

    describe('map', () => {
      it('should transform value', () => {
        const result = Ok(5).map((n) => n * 2);
        expect(result.isOk && result.value).toBe(10);
      });

      it('should chain multiple maps', () => {
        const result = Ok(2)
          .map((n) => n + 3)
          .map((n) => n * 2);
        expect(result.isOk && result.value).toBe(10);
      });
    });

    describe('mapErr', () => {
      it('should not transform Ok value', () => {
        const result = Ok<number, string>(42).mapErr((e) => e.toUpperCase());
        expect(result.isOk && result.value).toBe(42);
      });
    });

    describe('flatMap', () => {
      it('should chain Results', () => {
        const divide = (a: number, b: number): Result<number, string> =>
          b === 0 ? Err('division by zero') : Ok(a / b);

        const result = Ok(10).flatMap((n) => divide(n, 2));
        expect(result.isOk && result.value).toBe(5);
      });

      it('should propagate errors', () => {
        const result = Ok(10).flatMap(() => Err<number, string>('error'));
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('flatMapErr', () => {
      it('should not transform Ok value', () => {
        const result = Ok<number, string>(42).flatMapErr(() => Ok(100));
        expect(result.isOk && result.value).toBe(42);
      });
    });

    describe('unwrap', () => {
      it('should return value', () => {
        expect(Ok(42).unwrap()).toBe(42);
      });
    });

    describe('unwrapOr', () => {
      it('should return value, ignoring default', () => {
        expect(Ok(42).unwrapOr(0)).toBe(42);
      });
    });

    describe('unwrapOrElse', () => {
      it('should return value, not calling function', () => {
        const fn = vi.fn().mockReturnValue(0);
        expect(Ok(42).unwrapOrElse(fn)).toBe(42);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('unwrapErr', () => {
      it('should throw', () => {
        expect(() => Ok(42).unwrapErr()).toThrow('Called unwrapErr on Ok value');
      });
    });

    describe('match', () => {
      it('should call ok handler', () => {
        const result = Ok(5).match({
          ok: (v) => `value is ${v}`,
          err: () => 'error',
        });
        expect(result).toBe('value is 5');
      });
    });

    describe('tap', () => {
      it('should call function with value', () => {
        const fn = vi.fn();
        const result = Ok(42).tap(fn);
        expect(fn).toHaveBeenCalledWith(42);
        expect(result.isOk && result.value).toBe(42);
      });
    });

    describe('tapErr', () => {
      it('should not call function', () => {
        const fn = vi.fn();
        Ok(42).tapErr(fn);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('and', () => {
      it('should return other Result', () => {
        const result = Ok(1).and(Ok(2));
        expect(result.isOk && result.value).toBe(2);
      });

      it('should return Err if other is Err', () => {
        const result = Ok(1).and(Err('error'));
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('or', () => {
      it('should return self', () => {
        const result = Ok(1).or(Ok(2));
        expect(result.isOk && result.value).toBe(1);
      });
    });

    describe('andThen', () => {
      it('should chain with function', () => {
        const result = Ok(5).andThen((n) => Ok(n * 2));
        expect(result.isOk && result.value).toBe(10);
      });
    });

    describe('orElse', () => {
      it('should not call function', () => {
        const fn = vi.fn().mockReturnValue(Ok(0));
        const result = Ok(42).orElse(fn);
        expect(fn).not.toHaveBeenCalled();
        expect(result.isOk && result.value).toBe(42);
      });
    });

    describe('toOption', () => {
      it('should convert to Some', () => {
        const option = Ok(42).toOption();
        expect(option.isSome).toBe(true);
        expect(option.isSome && option.value).toBe(42);
      });
    });

    describe('toNullable', () => {
      it('should return value', () => {
        expect(Ok(42).toNullable()).toBe(42);
      });
    });

    describe('toUndefined', () => {
      it('should return value', () => {
        expect(Ok(42).toUndefined()).toBe(42);
      });
    });

    describe('toPromise', () => {
      it('should resolve with value', async () => {
        await expect(Ok(42).toPromise()).resolves.toBe(42);
      });
    });
  });

  describe('Err', () => {
    describe('basic properties', () => {
      it('should have correct tag', () => {
        const result = Err('error');
        expect(result._tag).toBe('Err');
      });

      it('should have isOk=false and isErr=true', () => {
        const result = Err('error');
        expect(result.isOk).toBe(false);
        expect(result.isErr).toBe(true);
      });

      it('should store error', () => {
        const result = Err({ code: 'ERR001' });
        expect(result.error).toEqual({ code: 'ERR001' });
      });
    });

    describe('map', () => {
      it('should not transform error', () => {
        const result = Err<number, string>('error').map((n) => n * 2);
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('mapErr', () => {
      it('should transform error', () => {
        const result = Err('error').mapErr((e) => e.toUpperCase());
        expect(result.isErr && result.error).toBe('ERROR');
      });
    });

    describe('flatMap', () => {
      it('should not call function', () => {
        const fn = vi.fn().mockReturnValue(Ok(42));
        const result = Err<number, string>('error').flatMap(fn);
        expect(fn).not.toHaveBeenCalled();
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('flatMapErr', () => {
      it('should chain with error function', () => {
        const result = Err<number, string>('error').flatMapErr((e) =>
          e === 'error' ? Ok(42) : Err('other')
        );
        expect(result.isOk && result.value).toBe(42);
      });

      it('should chain to another error', () => {
        const result = Err<number, string>('error').flatMapErr(() => Err('new error'));
        expect(result.isErr && result.error).toBe('new error');
      });
    });

    describe('unwrap', () => {
      it('should throw with error message', () => {
        expect(() => Err('my error').unwrap()).toThrow('Called unwrap on Err value: my error');
      });
    });

    describe('unwrapOr', () => {
      it('should return default value', () => {
        expect(Err<number, string>('error').unwrapOr(42)).toBe(42);
      });
    });

    describe('unwrapOrElse', () => {
      it('should call function with error', () => {
        const result = Err<number, string>('error').unwrapOrElse((e) => e.length);
        expect(result).toBe(5);
      });
    });

    describe('unwrapErr', () => {
      it('should return error', () => {
        expect(Err('my error').unwrapErr()).toBe('my error');
      });
    });

    describe('match', () => {
      it('should call err handler', () => {
        const result = Err('error').match({
          ok: () => 'ok',
          err: (e) => `error: ${e}`,
        });
        expect(result).toBe('error: error');
      });
    });

    describe('tap', () => {
      it('should not call function', () => {
        const fn = vi.fn();
        Err('error').tap(fn);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('tapErr', () => {
      it('should call function with error', () => {
        const fn = vi.fn();
        const result = Err('my error').tapErr(fn);
        expect(fn).toHaveBeenCalledWith('my error');
        expect(result.isErr && result.error).toBe('my error');
      });
    });

    describe('and', () => {
      it('should return self', () => {
        const result = Err<number, string>('error').and(Ok(2));
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('or', () => {
      it('should return other Result', () => {
        const result = Err<number, string>('error').or(Ok(42));
        expect(result.isOk && result.value).toBe(42);
      });
    });

    describe('andThen', () => {
      it('should not call function', () => {
        const fn = vi.fn().mockReturnValue(Ok(42));
        const result = Err<number, string>('error').andThen(fn);
        expect(fn).not.toHaveBeenCalled();
        expect(result.isErr && result.error).toBe('error');
      });
    });

    describe('orElse', () => {
      it('should call function with error', () => {
        const result = Err<number, string>('error').orElse((e) => Ok(e.length));
        expect(result.isOk && result.value).toBe(5);
      });
    });

    describe('toOption', () => {
      it('should convert to None', () => {
        const option = Err('error').toOption();
        expect(option.isNone).toBe(true);
      });
    });

    describe('toNullable', () => {
      it('should return null', () => {
        expect(Err('error').toNullable()).toBeNull();
      });
    });

    describe('toUndefined', () => {
      it('should return undefined', () => {
        expect(Err('error').toUndefined()).toBeUndefined();
      });
    });

    describe('toPromise', () => {
      it('should reject with error', async () => {
        await expect(Err('my error').toPromise()).rejects.toBe('my error');
      });
    });
  });
});

describe('Option Type', () => {
  describe('Some', () => {
    describe('basic properties', () => {
      it('should have correct tag', () => {
        const option = Some(42);
        expect(option._tag).toBe('Some');
      });

      it('should have isSome=true and isNone=false', () => {
        const option = Some('test');
        expect(option.isSome).toBe(true);
        expect(option.isNone).toBe(false);
      });

      it('should store value', () => {
        const option = Some({ id: 1 });
        expect(option.value).toEqual({ id: 1 });
      });
    });

    describe('map', () => {
      it('should transform value', () => {
        const option = Some(5).map((n) => n * 2);
        expect(option.isSome && option.value).toBe(10);
      });
    });

    describe('flatMap', () => {
      it('should chain Options', () => {
        const option = Some(5).flatMap((n) => Some(n * 2));
        expect(option.isSome && option.value).toBe(10);
      });

      it('should return None if function returns None', () => {
        const option = Some(5).flatMap(() => None());
        expect(option.isNone).toBe(true);
      });
    });

    describe('filter', () => {
      it('should keep value if predicate is true', () => {
        const option = Some(10).filter((n) => n > 5);
        expect(option.isSome && option.value).toBe(10);
      });

      it('should return None if predicate is false', () => {
        const option = Some(3).filter((n) => n > 5);
        expect(option.isNone).toBe(true);
      });
    });

    describe('unwrap', () => {
      it('should return value', () => {
        expect(Some(42).unwrap()).toBe(42);
      });
    });

    describe('unwrapOr', () => {
      it('should return value, ignoring default', () => {
        expect(Some(42).unwrapOr(0)).toBe(42);
      });
    });

    describe('unwrapOrElse', () => {
      it('should return value, not calling function', () => {
        const fn = vi.fn().mockReturnValue(0);
        expect(Some(42).unwrapOrElse(fn)).toBe(42);
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('match', () => {
      it('should call some handler', () => {
        const result = Some(5).match({
          some: (v) => `value: ${v}`,
          none: () => 'none',
        });
        expect(result).toBe('value: 5');
      });
    });

    describe('toNullable', () => {
      it('should return value', () => {
        expect(Some(42).toNullable()).toBe(42);
      });
    });

    describe('toUndefined', () => {
      it('should return value', () => {
        expect(Some(42).toUndefined()).toBe(42);
      });
    });

    describe('toResult', () => {
      it('should convert to Ok', () => {
        const result = Some(42).toResult('error');
        expect(result.isOk && result.value).toBe(42);
      });
    });
  });

  describe('None', () => {
    describe('basic properties', () => {
      it('should have correct tag', () => {
        const option = None();
        expect(option._tag).toBe('None');
      });

      it('should have isSome=false and isNone=true', () => {
        const option = None();
        expect(option.isSome).toBe(false);
        expect(option.isNone).toBe(true);
      });
    });

    describe('map', () => {
      it('should return None', () => {
        const option = None<number>().map((n) => n * 2);
        expect(option.isNone).toBe(true);
      });
    });

    describe('flatMap', () => {
      it('should return None', () => {
        const fn = vi.fn().mockReturnValue(Some(42));
        const option = None<number>().flatMap(fn);
        expect(fn).not.toHaveBeenCalled();
        expect(option.isNone).toBe(true);
      });
    });

    describe('filter', () => {
      it('should return self (None)', () => {
        const option = None<number>().filter((n) => n > 5);
        expect(option.isNone).toBe(true);
      });
    });

    describe('unwrap', () => {
      it('should throw', () => {
        expect(() => None().unwrap()).toThrow('Called unwrap on None value');
      });
    });

    describe('unwrapOr', () => {
      it('should return default value', () => {
        expect(None<number>().unwrapOr(42)).toBe(42);
      });
    });

    describe('unwrapOrElse', () => {
      it('should call function', () => {
        const fn = vi.fn().mockReturnValue(42);
        expect(None<number>().unwrapOrElse(fn)).toBe(42);
        expect(fn).toHaveBeenCalled();
      });
    });

    describe('match', () => {
      it('should call none handler', () => {
        const result = None<number>().match({
          some: (v) => `value: ${v}`,
          none: () => 'no value',
        });
        expect(result).toBe('no value');
      });
    });

    describe('toNullable', () => {
      it('should return null', () => {
        expect(None().toNullable()).toBeNull();
      });
    });

    describe('toUndefined', () => {
      it('should return undefined', () => {
        expect(None().toUndefined()).toBeUndefined();
      });
    });

    describe('toResult', () => {
      it('should convert to Err', () => {
        const result = None<number>().toResult('not found');
        expect(result.isErr && result.error).toBe('not found');
      });
    });
  });
});

describe('Utility Functions', () => {
  describe('tryCatch', () => {
    it('should return Ok for successful function', () => {
      const result = tryCatch(() => 42);
      expect(result.isOk && result.value).toBe(42);
    });

    it('should return Err for throwing function', () => {
      const result = tryCatch(() => {
        throw new Error('test error');
      });
      expect(result.isErr).toBe(true);
      expect(result.isErr && (result.error as Error).message).toBe('test error');
    });
  });

  describe('tryCatchAsync', () => {
    it('should return Ok for successful async function', async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(result.isOk && result.value).toBe(42);
    });

    it('should return Err for rejecting async function', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async error');
      });
      expect(result.isErr).toBe(true);
      expect(result.isErr && (result.error as Error).message).toBe('async error');
    });
  });

  describe('fromNullable', () => {
    it('should return Some for non-null value', () => {
      const option = fromNullable(42);
      expect(option.isSome && option.value).toBe(42);
    });

    it('should return None for null', () => {
      const option = fromNullable(null);
      expect(option.isNone).toBe(true);
    });

    it('should return None for undefined', () => {
      const option = fromNullable(undefined);
      expect(option.isNone).toBe(true);
    });

    it('should return Some for falsy non-null values', () => {
      expect(fromNullable(0).isSome).toBe(true);
      expect(fromNullable('').isSome).toBe(true);
      expect(fromNullable(false).isSome).toBe(true);
    });
  });

  describe('toNullable', () => {
    it('should return value for Ok', () => {
      expect(toNullable(Ok(42))).toBe(42);
    });

    it('should return null for Err', () => {
      expect(toNullable(Err('error'))).toBeNull();
    });
  });

  describe('all', () => {
    it('should combine all Ok results', () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      const combined = all(results);
      expect(combined.isOk && combined.value).toEqual([1, 2, 3]);
    });

    it('should return first Err', () => {
      const results = [Ok(1), Err('error'), Ok(3)];
      const combined = all(results);
      expect(combined.isErr && combined.error).toBe('error');
    });

    it('should handle empty array', () => {
      const combined = all([]);
      expect(combined.isOk && combined.value).toEqual([]);
    });
  });

  describe('combine', () => {
    it('should combine 2 results', () => {
      const results: [Result<number, string>, Result<string, string>] = [Ok(1), Ok('two')];
      const combined = combine(results);
      expect(combined.isOk && combined.value).toEqual([1, 'two']);
    });

    it('should combine 3 results', () => {
      const results: [Result<number, string>, Result<string, string>, Result<boolean, string>] = [
        Ok(1),
        Ok('two'),
        Ok(true),
      ];
      const combined = combine(results);
      expect(combined.isOk && combined.value).toEqual([1, 'two', true]);
    });

    it('should combine 4 results', () => {
      const results: [
        Result<number, string>,
        Result<string, string>,
        Result<boolean, string>,
        Result<null, string>,
      ] = [Ok(1), Ok('two'), Ok(true), Ok(null)];
      const combined = combine(results);
      expect(combined.isOk && combined.value).toEqual([1, 'two', true, null]);
    });

    it('should return error if any fails', () => {
      const results: [Result<number, string>, Result<string, string>] = [Ok(1), Err('fail')];
      const combined = combine(results);
      expect(combined.isErr && combined.error).toBe('fail');
    });
  });

  describe('firstOk', () => {
    it('should return first Ok result', () => {
      const results = [Err('e1'), Ok(2), Ok(3)];
      const first = firstOk(results);
      expect(first.isOk && first.value).toBe(2);
    });

    it('should return last Err if all fail', () => {
      const results = [Err('e1'), Err('e2'), Err('e3')];
      const first = firstOk(results);
      expect(first.isErr && first.error).toBe('e3');
    });

    it('should return Err(undefined) for empty array', () => {
      const first = firstOk([]);
      expect(first.isErr).toBe(true);
    });
  });

  describe('partition', () => {
    it('should separate Ok and Err results', () => {
      const results = [Ok(1), Err('e1'), Ok(2), Err('e2'), Ok(3)];
      const { ok, err } = partition(results);
      expect(ok).toEqual([1, 2, 3]);
      expect(err).toEqual(['e1', 'e2']);
    });

    it('should handle all Ok', () => {
      const results = [Ok(1), Ok(2)];
      const { ok, err } = partition(results);
      expect(ok).toEqual([1, 2]);
      expect(err).toEqual([]);
    });

    it('should handle all Err', () => {
      const results = [Err('e1'), Err('e2')];
      const { ok, err } = partition(results);
      expect(ok).toEqual([]);
      expect(err).toEqual(['e1', 'e2']);
    });
  });

  describe('traverse', () => {
    it('should transform all values', () => {
      const result = traverse([1, 2, 3], (n) => Ok(n * 2));
      expect(result.isOk && result.value).toEqual([2, 4, 6]);
    });

    it('should short-circuit on first error', () => {
      let count = 0;
      const result = traverse([1, 2, 3], (n) => {
        count++;
        return n === 2 ? Err('error at 2') : Ok(n * 2);
      });
      expect(result.isErr && result.error).toBe('error at 2');
      expect(count).toBe(2);
    });

    it('should handle empty array', () => {
      const result = traverse([], (n: number) => Ok(n * 2));
      expect(result.isOk && result.value).toEqual([]);
    });
  });

  describe('traverseAsync', () => {
    it('should transform all values sequentially', async () => {
      const result = await traverseAsync([1, 2, 3], async (n) => Ok(n * 2));
      expect(result.isOk && result.value).toEqual([2, 4, 6]);
    });

    it('should short-circuit on first error', async () => {
      let count = 0;
      const result = await traverseAsync([1, 2, 3], async (n) => {
        count++;
        return n === 2 ? Err('error') : Ok(n * 2);
      });
      expect(result.isErr && result.error).toBe('error');
      expect(count).toBe(2);
    });
  });

  describe('traverseParallel', () => {
    it('should transform all values in parallel', async () => {
      const result = await traverseParallel([1, 2, 3], async (n) => Ok(n * 2));
      expect(result.isOk && result.value).toEqual([2, 4, 6]);
    });

    it('should return first error (but run all)', async () => {
      let count = 0;
      const result = await traverseParallel([1, 2, 3], async (n) => {
        count++;
        return n === 2 ? Err('error') : Ok(n * 2);
      });
      expect(result.isErr && result.error).toBe('error');
      expect(count).toBe(3); // All ran in parallel
    });
  });
});

describe('Type Guards', () => {
  describe('isOk', () => {
    it('should return true for Ok', () => {
      expect(isOk(Ok(42))).toBe(true);
    });

    it('should return false for Err', () => {
      expect(isOk(Err('error'))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('should return true for Err', () => {
      expect(isErr(Err('error'))).toBe(true);
    });

    it('should return false for Ok', () => {
      expect(isErr(Ok(42))).toBe(false);
    });
  });

  describe('isSome', () => {
    it('should return true for Some', () => {
      expect(isSome(Some(42))).toBe(true);
    });

    it('should return false for None', () => {
      expect(isSome(None())).toBe(false);
    });
  });

  describe('isNone', () => {
    it('should return true for None', () => {
      expect(isNone(None())).toBe(true);
    });

    it('should return false for Some', () => {
      expect(isNone(Some(42))).toBe(false);
    });
  });
});

describe('AsyncResult', () => {
  describe('ok', () => {
    it('should create resolved Ok AsyncResult', async () => {
      const result = await AsyncResult.ok(42);
      expect(result.isOk && result.value).toBe(42);
    });
  });

  describe('err', () => {
    it('should create resolved Err AsyncResult', async () => {
      const result = await AsyncResult.err('error');
      expect(result.isErr && result.error).toBe('error');
    });
  });

  describe('map', () => {
    it('should map over Ok value', async () => {
      const asyncResult = AsyncResult.ok(5);
      const mapped = await AsyncResult.map(asyncResult, (n) => n * 2);
      expect(mapped.isOk && mapped.value).toBe(10);
    });

    it('should not map over Err', async () => {
      const asyncResult = AsyncResult.err<number, string>('error');
      const mapped = await AsyncResult.map(asyncResult, (n) => n * 2);
      expect(mapped.isErr && mapped.error).toBe('error');
    });
  });

  describe('flatMap', () => {
    it('should flatMap over Ok value', async () => {
      const asyncResult = AsyncResult.ok(5);
      const flatMapped = await AsyncResult.flatMap(asyncResult, (n) => AsyncResult.ok(n * 2));
      expect(flatMapped.isOk && flatMapped.value).toBe(10);
    });

    it('should not flatMap over Err', async () => {
      const asyncResult = AsyncResult.err<number, string>('error');
      const flatMapped = await AsyncResult.flatMap(asyncResult, (n) => AsyncResult.ok(n * 2));
      expect(flatMapped.isErr && flatMapped.error).toBe('error');
    });

    it('should propagate error from inner function', async () => {
      const asyncResult = AsyncResult.ok(5);
      const flatMapped = await AsyncResult.flatMap(asyncResult, () =>
        AsyncResult.err<number, string>('inner error')
      );
      expect(flatMapped.isErr && flatMapped.error).toBe('inner error');
    });
  });

  describe('fromPromise', () => {
    it('should wrap resolved promise as Ok', async () => {
      const result = await AsyncResult.fromPromise(Promise.resolve(42));
      expect(result.isOk && result.value).toBe(42);
    });

    it('should wrap rejected promise as Err', async () => {
      const result = await AsyncResult.fromPromise(Promise.reject(new Error('fail')));
      expect(result.isErr).toBe(true);
      expect(result.isErr && (result.error as Error).message).toBe('fail');
    });
  });
});

describe('Complex Scenarios', () => {
  it('should handle railway-oriented programming', () => {
    const validateAge = (age: number): Result<number, string> =>
      age >= 0 && age < 150 ? Ok(age) : Err('Invalid age');

    const validateName = (name: string): Result<string, string> =>
      name.length > 0 ? Ok(name) : Err('Name required');

    const createUser = (name: string, age: number) =>
      validateName(name).flatMap((validName) =>
        validateAge(age).map((validAge) => ({ name: validName, age: validAge }))
      );

    const validUser = createUser('Alice', 30);
    expect(validUser.isOk && validUser.value).toEqual({ name: 'Alice', age: 30 });

    const invalidAge = createUser('Bob', -1);
    expect(invalidAge.isErr && invalidAge.error).toBe('Invalid age');

    const invalidName = createUser('', 25);
    expect(invalidName.isErr && invalidName.error).toBe('Name required');
  });

  it('should handle Option to Result conversion chain', () => {
    const findUser = (id: number): Option<{ id: number; name: string }> =>
      id > 0 ? Some({ id, name: 'User' }) : None();

    const result = findUser(1)
      .toResult('User not found')
      .map((user) => user.name);

    expect(result.isOk && result.value).toBe('User');

    const notFound = findUser(-1)
      .toResult('User not found')
      .map((user) => user.name);

    expect(notFound.isErr && notFound.error).toBe('User not found');
  });

  it('should handle chained async operations', async () => {
    const fetchUser = async (id: number): Promise<Result<{ id: number; name: string }, string>> =>
      id > 0 ? Ok({ id, name: 'Alice' }) : Err('Not found');

    const fetchOrders = async (
      userId: number
    ): Promise<Result<{ orderId: number; userId: number }[], string>> =>
      userId > 0 ? Ok([{ orderId: 1, userId }]) : Err('No orders');

    const result = await AsyncResult.flatMap(fetchUser(1), (user) =>
      AsyncResult.map(fetchOrders(user.id), (orders) => ({ user, orders }))
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.user.name).toBe('Alice');
      expect(result.value.orders).toHaveLength(1);
    }
  });
});
