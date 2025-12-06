import { describe, it, expect } from 'vitest';
import {
  assertDefined,
  assertString,
  assertNumber,
  assertObject,
  assertArray,
  isDefined,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isNonEmptyArray,
  isFunction,
  isDate,
  isError,
  hasKey,
  hasKeys,
  exhaustive,
  exhaustiveWithDefault,
  safeGet,
  safeSet,
  deepClone,
  deepFreeze,
} from '../types/utils.js';

describe('Type-Safe Utility Functions', () => {
  describe('Assertion Functions', () => {
    describe('assertDefined', () => {
      it('should not throw for defined value', () => {
        expect(() => assertDefined('hello')).not.toThrow();
        expect(() => assertDefined(0)).not.toThrow();
        expect(() => assertDefined(false)).not.toThrow();
        expect(() => assertDefined({})).not.toThrow();
      });

      it('should throw for null', () => {
        expect(() => assertDefined(null)).toThrow('Value is null or undefined');
      });

      it('should throw for undefined', () => {
        expect(() => assertDefined(undefined)).toThrow('Value is null or undefined');
      });

      it('should use custom message', () => {
        expect(() => assertDefined(null, 'Custom error')).toThrow('Custom error');
      });
    });

    describe('assertString', () => {
      it('should not throw for string', () => {
        expect(() => assertString('hello')).not.toThrow();
        expect(() => assertString('')).not.toThrow();
      });

      it('should throw for non-string', () => {
        expect(() => assertString(123)).toThrow('Expected string, got number');
        expect(() => assertString(null)).toThrow('Expected string, got object');
        expect(() => assertString(undefined)).toThrow('Expected string, got undefined');
      });

      it('should use custom message', () => {
        expect(() => assertString(123, 'Must be string')).toThrow('Must be string');
      });
    });

    describe('assertNumber', () => {
      it('should not throw for number', () => {
        expect(() => assertNumber(123)).not.toThrow();
        expect(() => assertNumber(0)).not.toThrow();
        expect(() => assertNumber(-5.5)).not.toThrow();
      });

      it('should throw for NaN', () => {
        expect(() => assertNumber(NaN)).toThrow();
      });

      it('should throw for non-number', () => {
        expect(() => assertNumber('123')).toThrow('Expected number, got string');
      });
    });

    describe('assertObject', () => {
      it('should not throw for object', () => {
        expect(() => assertObject({})).not.toThrow();
        expect(() => assertObject({ a: 1 })).not.toThrow();
      });

      it('should throw for null', () => {
        expect(() => assertObject(null)).toThrow('Expected object, got object');
      });

      it('should throw for non-object', () => {
        expect(() => assertObject('string')).toThrow('Expected object, got string');
        expect(() => assertObject(123)).toThrow('Expected object, got number');
      });
    });

    describe('assertArray', () => {
      it('should not throw for array', () => {
        expect(() => assertArray([])).not.toThrow();
        expect(() => assertArray([1, 2, 3])).not.toThrow();
      });

      it('should throw for non-array', () => {
        expect(() => assertArray({})).toThrow('Expected array, got object');
        expect(() => assertArray('string')).toThrow('Expected array, got string');
      });
    });
  });

  describe('Type Guards', () => {
    describe('isDefined', () => {
      it('should return true for defined values', () => {
        expect(isDefined('hello')).toBe(true);
        expect(isDefined(0)).toBe(true);
        expect(isDefined(false)).toBe(true);
        expect(isDefined({})).toBe(true);
        expect(isDefined([])).toBe(true);
      });

      it('should return false for null/undefined', () => {
        expect(isDefined(null)).toBe(false);
        expect(isDefined(undefined)).toBe(false);
      });
    });

    describe('isString', () => {
      it('should return true for strings', () => {
        expect(isString('hello')).toBe(true);
        expect(isString('')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(isString(123)).toBe(false);
        expect(isString(null)).toBe(false);
        expect(isString({})).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for valid numbers', () => {
        expect(isNumber(123)).toBe(true);
        expect(isNumber(0)).toBe(true);
        expect(isNumber(-5.5)).toBe(true);
        expect(isNumber(Infinity)).toBe(true);
      });

      it('should return false for NaN', () => {
        expect(isNumber(NaN)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(isNumber('123')).toBe(false);
        expect(isNumber(null)).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should return true for booleans', () => {
        expect(isBoolean(true)).toBe(true);
        expect(isBoolean(false)).toBe(true);
      });

      it('should return false for non-booleans', () => {
        expect(isBoolean(1)).toBe(false);
        expect(isBoolean('true')).toBe(false);
        expect(isBoolean(null)).toBe(false);
      });
    });

    describe('isObject', () => {
      it('should return true for plain objects', () => {
        expect(isObject({})).toBe(true);
        expect(isObject({ a: 1 })).toBe(true);
      });

      it('should return false for null', () => {
        expect(isObject(null)).toBe(false);
      });

      it('should return false for arrays', () => {
        expect(isObject([])).toBe(false);
      });

      it('should return false for primitives', () => {
        expect(isObject('string')).toBe(false);
        expect(isObject(123)).toBe(false);
      });
    });

    describe('isArray', () => {
      it('should return true for arrays', () => {
        expect(isArray([])).toBe(true);
        expect(isArray([1, 2, 3])).toBe(true);
      });

      it('should return false for non-arrays', () => {
        expect(isArray({})).toBe(false);
        expect(isArray('string')).toBe(false);
      });
    });

    describe('isNonEmptyArray', () => {
      it('should return true for non-empty arrays', () => {
        expect(isNonEmptyArray([1])).toBe(true);
        expect(isNonEmptyArray([1, 2, 3])).toBe(true);
      });

      it('should return false for empty arrays', () => {
        expect(isNonEmptyArray([])).toBe(false);
      });
    });

    describe('isFunction', () => {
      it('should return true for functions', () => {
        expect(isFunction(() => {})).toBe(true);
        expect(isFunction(function () {})).toBe(true);
        expect(isFunction(async () => {})).toBe(true);
      });

      it('should return false for non-functions', () => {
        expect(isFunction({})).toBe(false);
        expect(isFunction('function')).toBe(false);
      });
    });

    describe('isDate', () => {
      it('should return true for valid dates', () => {
        expect(isDate(new Date())).toBe(true);
        expect(isDate(new Date('2024-01-01'))).toBe(true);
      });

      it('should return false for invalid dates', () => {
        expect(isDate(new Date('invalid'))).toBe(false);
      });

      it('should return false for non-dates', () => {
        expect(isDate('2024-01-01')).toBe(false);
        expect(isDate(1234567890)).toBe(false);
      });
    });

    describe('isError', () => {
      it('should return true for Error instances', () => {
        expect(isError(new Error('test'))).toBe(true);
        expect(isError(new TypeError('type'))).toBe(true);
      });

      it('should return false for non-errors', () => {
        expect(isError({ message: 'error' })).toBe(false);
        expect(isError('error')).toBe(false);
      });
    });

    describe('hasKey', () => {
      it('should return true when object has key', () => {
        expect(hasKey({ foo: 'bar' }, 'foo')).toBe(true);
      });

      it('should return false when object lacks key', () => {
        expect(hasKey({ foo: 'bar' }, 'baz')).toBe(false);
      });

      it('should return false for non-objects', () => {
        expect(hasKey(null, 'foo')).toBe(false);
        expect(hasKey('string', 'length')).toBe(false);
      });
    });

    describe('hasKeys', () => {
      it('should return true when object has all keys', () => {
        expect(hasKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(true);
      });

      it('should return false when object lacks any key', () => {
        expect(hasKeys({ a: 1 }, ['a', 'b'])).toBe(false);
      });

      it('should return true for empty keys array', () => {
        expect(hasKeys({ a: 1 }, [])).toBe(true);
      });
    });
  });

  describe('Exhaustive Check', () => {
    describe('exhaustive', () => {
      it('should throw for any value passed', () => {
        // This function should never be called in correct code
        expect(() => exhaustive('unexpected' as never)).toThrow('Unhandled case');
      });
    });

    describe('exhaustiveWithDefault', () => {
      it('should return default value', () => {
        const result = exhaustiveWithDefault('unexpected' as never, 'default');
        expect(result).toBe('default');
      });
    });
  });

  describe('Safe Access Functions', () => {
    describe('safeGet', () => {
      it('should get nested value', () => {
        const obj = { a: { b: { c: 123 } } };
        expect(safeGet(obj, ['a', 'b', 'c'])).toBe(123);
      });

      it('should return undefined for missing path', () => {
        const obj = { a: { b: 1 } };
        expect(safeGet(obj, ['a', 'x', 'y'])).toBeUndefined();
      });

      it('should return undefined for null in path', () => {
        const obj = { a: null };
        expect(safeGet(obj, ['a', 'b'])).toBeUndefined();
      });

      it('should handle array indices', () => {
        const obj = { items: [{ id: 1 }, { id: 2 }] };
        expect(safeGet(obj, ['items', 1, 'id'])).toBe(2);
      });

      it('should return whole object for empty path', () => {
        const obj = { a: 1 };
        expect(safeGet(obj, [])).toEqual({ a: 1 });
      });
    });

    describe('safeSet', () => {
      it('should set nested value', () => {
        const obj = { a: { b: 1 } };
        const result = safeSet(obj, ['a', 'c'], 2);
        expect(result).toEqual({ a: { b: 1, c: 2 } });
      });

      it('should create intermediate objects', () => {
        const obj = {} as Record<string, unknown>;
        const result = safeSet(obj, ['a', 'b', 'c'], 123);
        expect(result).toEqual({ a: { b: { c: 123 } } });
      });

      it('should create intermediate arrays for number keys', () => {
        const obj = {} as Record<string, unknown>;
        const result = safeSet(obj, ['items', 0], 'first');
        expect(result).toEqual({ items: ['first'] });
      });

      it('should return original for empty path', () => {
        const obj = { a: 1 };
        const result = safeSet(obj, [], 'value');
        expect(result).toEqual({ a: 1 });
      });

      it('should not mutate original object', () => {
        const obj = { a: { b: 1 } };
        safeSet(obj, ['a', 'b'], 2);
        expect(obj.a.b).toBe(1);
      });
    });
  });

  describe('Clone & Freeze', () => {
    describe('deepClone', () => {
      it('should clone object', () => {
        const obj = { a: { b: [1, 2, 3] } };
        const cloned = deepClone(obj);

        expect(cloned).toEqual(obj);
        expect(cloned).not.toBe(obj);
        expect(cloned.a).not.toBe(obj.a);
        expect(cloned.a.b).not.toBe(obj.a.b);
      });

      it('should clone arrays', () => {
        const arr = [{ id: 1 }, { id: 2 }];
        const cloned = deepClone(arr);

        expect(cloned).toEqual(arr);
        expect(cloned).not.toBe(arr);
        expect(cloned[0]).not.toBe(arr[0]);
      });

      it('should clone primitives', () => {
        expect(deepClone('string')).toBe('string');
        expect(deepClone(123)).toBe(123);
        expect(deepClone(null)).toBe(null);
      });
    });

    describe('deepFreeze', () => {
      it('should freeze object', () => {
        const obj = { a: 1 };
        const frozen = deepFreeze(obj);

        expect(Object.isFrozen(frozen)).toBe(true);
        expect(() => {
          (frozen as { a: number }).a = 2;
        }).toThrow();
      });

      it('should deeply freeze nested objects', () => {
        const obj = { a: { b: { c: 1 } } };
        const frozen = deepFreeze(obj);

        expect(Object.isFrozen(frozen.a)).toBe(true);
        expect(Object.isFrozen(frozen.a.b)).toBe(true);
      });

      it('should handle arrays', () => {
        const obj = { items: [1, 2, 3] };
        const frozen = deepFreeze(obj);

        expect(Object.isFrozen(frozen.items)).toBe(true);
      });
    });
  });
});
