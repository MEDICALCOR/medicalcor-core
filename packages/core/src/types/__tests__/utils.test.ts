/**
 * Comprehensive tests for advanced TypeScript utility types and functions
 * Testing deep transformations, type guards, assertions, and utility functions
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  type DeepReadonly,
  type DeepMutable,
  type DeepPartial,
  type DeepRequired,
  type PickByValue,
  type OmitByValue,
  type RequireKeys,
  type OptionalKeys,
  type NullableKeys,
  type OptionalKeysOf,
  type RequiredKeysOf,
  type Merge,
  type AtLeastOne,
  type ExactlyOne,
  type ArrayElement,
  type NonEmptyArray,
  type Head,
  type Tail,
  type Last,
  type Capitalize,
  type Uncapitalize,
  type CamelCase,
  type SnakeCase,
  type KebabCase,
  type ExtractDiscriminant,
  type ExcludeDiscriminant,
  type DiscriminatedUnion,
  type JsonValue,
  type JsonPrimitive,
  type JsonArray,
  type JsonObject,
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
} from '../utils.js';

describe('Deep Immutability Types', () => {
  describe('DeepReadonly', () => {
    it('should make nested objects readonly at type level', () => {
      interface MutableType {
        a: { b: { c: number[] } };
      }

      type ImmutableType = DeepReadonly<MutableType>;

      const value: ImmutableType = { a: { b: { c: [1, 2, 3] } } };

      // Type-level test: these should not compile
      // @ts-expect-error - deeply readonly
      value.a.b.c.push(4);

      // @ts-expect-error - deeply readonly
      value.a.b.c[0] = 10;

      // Note: DeepReadonly is a type-level feature only
      // At runtime, JavaScript doesn't enforce readonly
      // Use deepFreeze() for runtime immutability
      expect(value.a.b.c).toBeDefined();
    });
  });

  describe('DeepPartial', () => {
    it('should make all properties deeply optional', () => {
      interface FullType {
        a: {
          b: {
            c: number;
          };
        };
      }

      type PartialType = DeepPartial<FullType>;

      const partial: PartialType = {};
      expect(partial).toBeDefined();

      const nested: PartialType = { a: { b: {} } };
      expect(nested).toBeDefined();
    });
  });
});

describe('Object Utility Types', () => {
  describe('PickByValue', () => {
    it('should pick only properties with matching type', () => {
      interface Mixed {
        a: string;
        b: number;
        c: string;
        d: boolean;
      }

      type StringProps = PickByValue<Mixed, string>;

      const obj: StringProps = { a: 'test', c: 'test2' };
      expect(obj).toBeDefined();
    });
  });

  describe('OmitByValue', () => {
    it('should omit properties with matching type', () => {
      interface Mixed {
        a: string;
        b: number;
        c: string;
      }

      type NoStrings = OmitByValue<Mixed, string>;

      const obj: NoStrings = { b: 42 };
      expect(obj).toBeDefined();
    });
  });

  describe('Merge', () => {
    it('should merge two types with second taking precedence', () => {
      interface First {
        a: string;
        b: number;
      }

      interface Second {
        b: string;
        c: boolean;
      }

      type Merged = Merge<First, Second>;

      const merged: Merged = { a: 'test', b: 'override', c: true };
      expectTypeOf(merged.b).toEqualTypeOf<string>();
    });
  });

  describe('AtLeastOne', () => {
    it('should require at least one property', () => {
      interface Props {
        a?: number;
        b?: string;
        c?: boolean;
      }

      type RequireAtLeastOne = AtLeastOne<Props>;

      const valid: RequireAtLeastOne = { a: 1 };
      expect(valid).toBeDefined();

      // @ts-expect-error - requires at least one property
      const invalid: RequireAtLeastOne = {};
    });
  });
});

describe('Array Utility Types', () => {
  describe('ArrayElement', () => {
    it('should extract element type from array', () => {
      type Numbers = number[];
      type Element = ArrayElement<Numbers>;

      expectTypeOf<Element>().toEqualTypeOf<number>();
    });

    it('should work with readonly arrays', () => {
      type ReadonlyNumbers = readonly number[];
      type Element = ArrayElement<ReadonlyNumbers>;

      expectTypeOf<Element>().toEqualTypeOf<number>();
    });
  });

  describe('NonEmptyArray', () => {
    it('should represent array with at least one element', () => {
      const arr: NonEmptyArray<number> = [1];
      expect(arr[0]).toBe(1);

      const arr2: NonEmptyArray<string> = ['a', 'b', 'c'];
      expect(arr2).toHaveLength(3);
    });
  });

  describe('Head', () => {
    it('should get first element type', () => {
      type Tuple = [string, number, boolean];
      type First = Head<Tuple>;

      expectTypeOf<First>().toEqualTypeOf<string>();
    });
  });

  describe('Tail', () => {
    it('should get all but first element', () => {
      type Tuple = [string, number, boolean];
      type Rest = Tail<Tuple>;

      expectTypeOf<Rest>().toEqualTypeOf<[number, boolean]>();
    });
  });

  describe('Last', () => {
    it('should get last element type', () => {
      type Tuple = [string, number, boolean];
      type LastType = Last<Tuple>;

      expectTypeOf<LastType>().toEqualTypeOf<boolean>();
    });
  });
});

describe('String Utility Types', () => {
  describe('Capitalize', () => {
    it('should capitalize first letter', () => {
      type Lower = 'hello';
      type Upper = Capitalize<Lower>;

      expectTypeOf<Upper>().toEqualTypeOf<'Hello'>();
    });
  });

  describe('Uncapitalize', () => {
    it('should uncapitalize first letter', () => {
      type Upper = 'Hello';
      type Lower = Uncapitalize<Upper>;

      expectTypeOf<Lower>().toEqualTypeOf<'hello'>();
    });
  });

  describe('CamelCase', () => {
    it('should convert to camel case', () => {
      type Snake = 'hello_world';
      type Camel = CamelCase<Snake>;

      expectTypeOf<Camel>().toEqualTypeOf<'helloWorld'>();
    });
  });

  describe('SnakeCase', () => {
    it('should convert to snake case', () => {
      type Camel = 'HelloWorld';
      type Snake = SnakeCase<Camel>;

      expectTypeOf<Snake>().toEqualTypeOf<'_hello_world'>();
    });
  });

  describe('KebabCase', () => {
    it('should convert to kebab case', () => {
      type Camel = 'HelloWorld';
      type Kebab = KebabCase<Camel>;

      expectTypeOf<Kebab>().toEqualTypeOf<'-hello-world'>();
    });
  });
});

describe('Discriminated Union Types', () => {
  describe('ExtractDiscriminant', () => {
    it('should extract union member by discriminant', () => {
      type Action = { type: 'add'; value: number } | { type: 'remove'; id: string };

      type AddAction = ExtractDiscriminant<Action, 'type', 'add'>;

      expectTypeOf<AddAction>().toEqualTypeOf<{ type: 'add'; value: number }>();
    });
  });

  describe('ExcludeDiscriminant', () => {
    it('should exclude union member by discriminant', () => {
      type Action = { type: 'add'; value: number } | { type: 'remove'; id: string };

      type NotAdd = ExcludeDiscriminant<Action, 'type', 'add'>;

      expectTypeOf<NotAdd>().toEqualTypeOf<{ type: 'remove'; id: string }>();
    });
  });

  describe('DiscriminatedUnion', () => {
    it('should create discriminated union from record', () => {
      type Events = DiscriminatedUnion<
        'type',
        {
          UserCreated: { userId: string };
          UserDeleted: { userId: string; reason: string };
        }
      >;

      const created: Events = { type: 'UserCreated', userId: '123' };
      const deleted: Events = { type: 'UserDeleted', userId: '456', reason: 'test' };

      expect(created.type).toBe('UserCreated');
      expect(deleted.type).toBe('UserDeleted');
    });
  });
});

describe('JSON Types', () => {
  describe('JsonValue', () => {
    it('should accept valid JSON values', () => {
      const str: JsonValue = 'test';
      const num: JsonValue = 42;
      const bool: JsonValue = true;
      const nul: JsonValue = null;
      const arr: JsonValue = [1, 2, 3];
      const obj: JsonValue = { a: 1, b: 'test' };

      expect([str, num, bool, nul, arr, obj]).toBeDefined();
    });

    it('should represent nested JSON structures', () => {
      const complex: JsonValue = {
        name: 'test',
        age: 30,
        active: true,
        metadata: null,
        tags: ['a', 'b'],
        nested: { deep: { value: 123 } },
      };

      expect(complex).toBeDefined();
    });
  });
});

describe('Type Guards', () => {
  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });

    it('should narrow types correctly', () => {
      const value: string | null = 'test';
      if (isDefined(value)) {
        expectTypeOf(value).toEqualTypeOf<string>();
      }
    });
  });

  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('test')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString(String(123))).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-456)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(true)).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(Boolean(1))).toBe(true);
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
      expect(isObject(Object.create(null))).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('test')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(new Array(5))).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('test')).toBe(false);
      expect(isArray(null)).toBe(false);
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

    it('should narrow types correctly', () => {
      const arr: number[] = [1, 2, 3];
      if (isNonEmptyArray(arr)) {
        expectTypeOf(arr).toEqualTypeOf<NonEmptyArray<number>>();
        expect(arr[0]).toBe(1);
      }
    });
  });

  describe('isFunction', () => {
    it('should return true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function () {})).toBe(true);
      expect(isFunction(isFunction)).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('test')).toBe(false);
      expect(isFunction(null)).toBe(false);
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
      expect(isDate({})).toBe(false);
    });
  });

  describe('isError', () => {
    it('should return true for Error objects', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError(new RangeError('test'))).toBe(true);
    });

    it('should return false for non-errors', () => {
      expect(isError({ message: 'test' })).toBe(false);
      expect(isError('error')).toBe(false);
      expect(isError(null)).toBe(false);
    });
  });

  describe('hasKey', () => {
    it('should return true when object has key', () => {
      const obj = { a: 1, b: 2 };
      expect(hasKey(obj, 'a')).toBe(true);
      expect(hasKey(obj, 'b')).toBe(true);
    });

    it('should return false when object lacks key', () => {
      const obj = { a: 1 };
      expect(hasKey(obj, 'b')).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(hasKey('test', 'length')).toBe(false);
      expect(hasKey(null, 'key')).toBe(false);
    });
  });

  describe('hasKeys', () => {
    it('should return true when object has all keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(hasKeys(obj, ['a', 'b'])).toBe(true);
      expect(hasKeys(obj, ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false when object lacks any key', () => {
      const obj = { a: 1, b: 2 };
      expect(hasKeys(obj, ['a', 'b', 'c'])).toBe(false);
    });
  });
});

describe('Type Assertions', () => {
  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined('')).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });

    it('should throw for null or undefined', () => {
      expect(() => assertDefined(null)).toThrow('Value is null or undefined');
      expect(() => assertDefined(undefined)).toThrow('Value is null or undefined');
    });

    it('should throw with custom message', () => {
      expect(() => assertDefined(null, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('assertString', () => {
    it('should not throw for strings', () => {
      expect(() => assertString('test')).not.toThrow();
      expect(() => assertString('')).not.toThrow();
    });

    it('should throw for non-strings', () => {
      expect(() => assertString(123)).toThrow('Expected string, got number');
      expect(() => assertString(null)).toThrow('Expected string, got object');
    });
  });

  describe('assertNumber', () => {
    it('should not throw for valid numbers', () => {
      expect(() => assertNumber(123)).not.toThrow();
      expect(() => assertNumber(0)).not.toThrow();
      expect(() => assertNumber(-456)).not.toThrow();
    });

    it('should throw for NaN', () => {
      expect(() => assertNumber(NaN)).toThrow('Expected number');
    });

    it('should throw for non-numbers', () => {
      expect(() => assertNumber('123')).toThrow('Expected number, got string');
    });
  });

  describe('assertObject', () => {
    it('should not throw for objects', () => {
      expect(() => assertObject({})).not.toThrow();
      expect(() => assertObject({ a: 1 })).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => assertObject(null)).toThrow('Expected object');
    });

    it('should throw for primitives', () => {
      expect(() => assertObject('test')).toThrow('Expected object, got string');
      expect(() => assertObject(123)).toThrow('Expected object, got number');
    });
  });

  describe('assertArray', () => {
    it('should not throw for arrays', () => {
      expect(() => assertArray([])).not.toThrow();
      expect(() => assertArray([1, 2, 3])).not.toThrow();
    });

    it('should throw for non-arrays', () => {
      expect(() => assertArray({})).toThrow('Expected array');
      expect(() => assertArray('test')).toThrow('Expected array');
    });
  });
});

describe('Exhaustive Checking', () => {
  describe('exhaustive', () => {
    it('should throw with unhandled value', () => {
      const value = 'test' as never;
      expect(() => exhaustive(value)).toThrow('Unhandled case: "test"');
    });

    it('should be used in switch statements', () => {
      type Status = 'pending' | 'approved' | 'rejected';

      function handleStatus(status: Status): string {
        switch (status) {
          case 'pending':
            return 'Waiting';
          case 'approved':
            return 'Success';
          case 'rejected':
            return 'Failed';
          default:
            return exhaustive(status);
        }
      }

      expect(handleStatus('pending')).toBe('Waiting');
      expect(handleStatus('approved')).toBe('Success');
      expect(handleStatus('rejected')).toBe('Failed');
    });
  });

  describe('exhaustiveWithDefault', () => {
    it('should return default value', () => {
      const value = 'test' as never;
      const result = exhaustiveWithDefault(value, 'default');
      expect(result).toBe('default');
    });
  });
});

describe('Safe Access Functions', () => {
  describe('safeGet', () => {
    it('should get nested property', () => {
      const obj = { a: { b: { c: 123 } } };
      const result = safeGet(obj, ['a', 'b', 'c']);
      expect(result).toBe(123);
    });

    it('should return undefined for missing property', () => {
      const obj = { a: { b: {} } };
      const result = safeGet(obj, ['a', 'b', 'c']);
      expect(result).toBeUndefined();
    });

    it('should handle null in path', () => {
      const obj = { a: null };
      const result = safeGet(obj, ['a', 'b', 'c']);
      expect(result).toBeUndefined();
    });

    it('should work with arrays', () => {
      const obj = { items: [{ id: 1 }, { id: 2 }] };
      const result = safeGet(obj, ['items', 1, 'id']);
      expect(result).toBe(2);
    });

    it('should handle empty path', () => {
      const obj = { a: 1 };
      const result = safeGet(obj, []);
      expect(result).toBe(obj);
    });
  });

  describe('safeSet', () => {
    it('should set nested property', () => {
      const obj = { a: { b: { c: 123 } } };
      const result = safeSet(obj, ['a', 'b', 'c'], 456);
      expect(result.a.b.c).toBe(456);
    });

    it('should create intermediate objects', () => {
      const obj = {};
      const result = safeSet(obj, ['a', 'b', 'c'], 123);
      expect(result).toEqual({ a: { b: { c: 123 } } });
    });

    it('should create arrays when key is number', () => {
      const obj = {};
      const result = safeSet(obj, ['items', 0], 'first');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should not mutate original object', () => {
      const obj = { a: { b: 1 } };
      const result = safeSet(obj, ['a', 'b'], 2);
      expect(obj.a.b).toBe(1);
      expect(result.a.b).toBe(2);
    });

    it('should handle empty path', () => {
      const obj = { a: 1 };
      const result = safeSet(obj, [], 'value');
      expect(result).toEqual(obj);
    });
  });
});

describe('Clone & Freeze Functions', () => {
  describe('deepClone', () => {
    it('should deep clone an object', () => {
      const obj = { a: { b: { c: [1, 2, 3] } } };
      const clone = deepClone(obj);

      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.a).not.toBe(obj.a);
      expect(clone.a.b).not.toBe(obj.a.b);
    });

    it('should handle arrays', () => {
      const arr = [{ id: 1 }, { id: 2 }];
      const clone = deepClone(arr);

      expect(clone).toEqual(arr);
      expect(clone).not.toBe(arr);
      expect(clone[0]).not.toBe(arr[0]);
    });

    it('should handle primitives', () => {
      expect(deepClone(123)).toBe(123);
      expect(deepClone('test')).toBe('test');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });

    it('should handle nested structures', () => {
      const complex = {
        users: [{ id: 1, data: { name: 'Alice' } }],
        settings: { theme: 'dark', options: { sound: true } },
      };

      const clone = deepClone(complex);
      expect(clone).toEqual(complex);
      expect(clone.users[0]).not.toBe(complex.users[0]);
    });
  });

  describe('deepFreeze', () => {
    it('should freeze object deeply', () => {
      const obj = { a: { b: { c: [1, 2, 3] } } };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.a)).toBe(true);
      expect(Object.isFrozen(frozen.a.b)).toBe(true);
      expect(Object.isFrozen(frozen.a.b.c)).toBe(true);
    });

    it('should prevent modifications', () => {
      const obj = { a: { b: 1 } };
      const frozen = deepFreeze(obj);

      expect(() => {
        // @ts-expect-error - frozen object
        frozen.a.b = 2;
      }).toThrow();
    });

    it('should handle arrays', () => {
      const arr = [{ id: 1 }];
      const frozen = deepFreeze(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen[0])).toBe(true);
    });

    it('should return the same object reference', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);
      expect(frozen).toBe(obj);
    });
  });
});

describe('Edge Cases and Integration', () => {
  it('should handle complex nested structures', () => {
    const data = {
      users: [
        { id: 1, profile: { name: 'Alice', tags: ['admin'] } },
        { id: 2, profile: { name: 'Bob', tags: ['user'] } },
      ],
      settings: {
        theme: 'dark',
        notifications: { email: true, sms: false },
      },
    };

    const cloned = deepClone(data);
    expect(cloned).toEqual(data);
    expect(cloned.users[0]).not.toBe(data.users[0]);

    const value = safeGet(cloned, ['users', 0, 'profile', 'name']);
    expect(value).toBe('Alice');

    const updated = safeSet(cloned, ['settings', 'theme'], 'light');
    expect(updated.settings.theme).toBe('light');
    expect(cloned.settings.theme).toBe('dark');
  });

  it('should combine type guards effectively', () => {
    const value: unknown = { a: 1, b: 'test' };

    if (isObject(value) && hasKeys(value, ['a', 'b']) && isNumber(value.a) && isString(value.b)) {
      expect(value.a).toBe(1);
      expect(value.b).toBe('test');
    }
  });

  it('should handle undefined and null gracefully', () => {
    expect(safeGet(null, ['a', 'b'])).toBeUndefined();
    expect(safeGet(undefined, ['a', 'b'])).toBeUndefined();
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });

  it('should work with empty collections', () => {
    expect(safeGet({}, ['a'])).toBeUndefined();
    expect(safeGet([], [0])).toBeUndefined();
    expect(isNonEmptyArray([])).toBe(false);
  });
});
