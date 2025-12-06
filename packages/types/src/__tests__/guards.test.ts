/**
 * Type Guards and Assertion Functions Unit Tests
 *
 * Tests for runtime type checking including:
 * - Primitive type guards
 * - Object type guards
 * - String format guards (UUID, email, phone, etc.)
 * - Domain-specific guards
 * - Discriminated union guards
 * - Assertion functions
 * - Validation utilities
 * - Type-safe parsers
 */

import { describe, it, expect } from 'vitest';
import {
  // Primitive guards
  isString,
  isNumber,
  isFiniteNumber,
  isInteger,
  isPositive,
  isNonNegative,
  isBoolean,
  isBigInt,
  isSymbol,
  isFunction,
  isUndefined,
  isNull,
  isNullish,
  isNonNullish,
  // Object guards
  isObject,
  isPlainObject,
  isArray,
  isArrayOf,
  isNonEmptyArray,
  isDate,
  isError,
  isPromise,
  isMap,
  isSet,
  isRegExp,
  // String format guards
  isNonEmptyString,
  isTrimmedNonEmptyString,
  isUUID,
  isE164Phone,
  isRomanianPhone,
  isEmail,
  isURL,
  isHTTPSUrl,
  isISODateString,
  isJSONString,
  // Domain guards
  isLeadSource,
  isLeadStatus,
  isLeadPriority,
  isLeadScore,
  isAIScore,
  isConfidence,
  // Discriminated union guards
  hasTag,
  isTagged,
  hasKeys,
  hasKeyOfType,
  // Assertions
  assert,
  assertDefined,
  assertString,
  assertNumber,
  assertObject,
  assertArray,
  assertSchema,
  assertNever,
  AssertionError,
  // Validation
  validate,
  formatZodError,
  createValidator,
  createGuard,
  createAssertion,
  // Refinement
  refine,
  refineWith,
  narrow,
  getProperty,
  getNestedProperty,
  // Parsers
  parseJSON,
  parseNumber,
  parseInteger,
  parseBoolean,
  parseDate,
} from '../lib/guards.js';
import { z } from 'zod';
import { Ok, Err, isOk, isErr } from '../lib/result.js';

describe('Primitive Type Guards', () => {
  describe('isString', () => {
    it('should identify strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString(String('test'))).toBe(true);
    });

    it('should reject non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should identify numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-123)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    it('should reject NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isFiniteNumber', () => {
    it('should identify finite numbers', () => {
      expect(isFiniteNumber(123)).toBe(true);
      expect(isFiniteNumber(0)).toBe(true);
      expect(isFiniteNumber(-123.45)).toBe(true);
    });

    it('should reject infinite numbers', () => {
      expect(isFiniteNumber(Infinity)).toBe(false);
      expect(isFiniteNumber(-Infinity)).toBe(false);
      expect(isFiniteNumber(NaN)).toBe(false);
    });
  });

  describe('isInteger', () => {
    it('should identify integers', () => {
      expect(isInteger(123)).toBe(true);
      expect(isInteger(0)).toBe(true);
      expect(isInteger(-123)).toBe(true);
    });

    it('should reject non-integers', () => {
      expect(isInteger(3.14)).toBe(false);
      expect(isInteger(NaN)).toBe(false);
      expect(isInteger('123')).toBe(false);
    });
  });

  describe('isPositive', () => {
    it('should identify positive numbers', () => {
      expect(isPositive(1)).toBe(true);
      expect(isPositive(123.45)).toBe(true);
    });

    it('should reject zero and negative numbers', () => {
      expect(isPositive(0)).toBe(false);
      expect(isPositive(-1)).toBe(false);
    });
  });

  describe('isNonNegative', () => {
    it('should identify non-negative numbers', () => {
      expect(isNonNegative(0)).toBe(true);
      expect(isNonNegative(1)).toBe(true);
      expect(isNonNegative(123.45)).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(isNonNegative(-1)).toBe(false);
      expect(isNonNegative(-0.001)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should identify booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(Boolean(1))).toBe(true);
    });

    it('should reject non-booleans', () => {
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe('isBigInt', () => {
    it('should identify bigints', () => {
      expect(isBigInt(BigInt(123))).toBe(true);
      expect(isBigInt(123n)).toBe(true);
    });

    it('should reject non-bigints', () => {
      expect(isBigInt(123)).toBe(false);
      expect(isBigInt('123')).toBe(false);
    });
  });

  describe('isSymbol', () => {
    it('should identify symbols', () => {
      expect(isSymbol(Symbol('test'))).toBe(true);
      expect(isSymbol(Symbol.for('test'))).toBe(true);
    });

    it('should reject non-symbols', () => {
      expect(isSymbol('symbol')).toBe(false);
      expect(isSymbol({})).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should identify functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function () {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
      expect(isFunction(class {})).toBe(true);
    });

    it('should reject non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('function')).toBe(false);
    });
  });

  describe('isUndefined', () => {
    it('should identify undefined', () => {
      expect(isUndefined(undefined)).toBe(true);
      expect(isUndefined(void 0)).toBe(true);
    });

    it('should reject non-undefined', () => {
      expect(isUndefined(null)).toBe(false);
      expect(isUndefined(0)).toBe(false);
      expect(isUndefined('')).toBe(false);
    });
  });

  describe('isNull', () => {
    it('should identify null', () => {
      expect(isNull(null)).toBe(true);
    });

    it('should reject non-null', () => {
      expect(isNull(undefined)).toBe(false);
      expect(isNull(0)).toBe(false);
      expect(isNull('')).toBe(false);
    });
  });

  describe('isNullish', () => {
    it('should identify null and undefined', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
    });

    it('should reject non-nullish values', () => {
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
      expect(isNullish(false)).toBe(false);
    });
  });

  describe('isNonNullish', () => {
    it('should identify non-nullish values', () => {
      expect(isNonNullish(0)).toBe(true);
      expect(isNonNullish('')).toBe(true);
      expect(isNonNullish(false)).toBe(true);
      expect(isNonNullish({})).toBe(true);
    });

    it('should reject null and undefined', () => {
      expect(isNonNullish(null)).toBe(false);
      expect(isNonNullish(undefined)).toBe(false);
    });
  });
});

describe('Object Type Guards', () => {
  describe('isObject', () => {
    it('should identify objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject([])).toBe(true);
      expect(isObject(new Date())).toBe(true);
      expect(isObject(new Map())).toBe(true);
    });

    it('should reject null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should reject primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('should identify plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ key: 'value' })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should reject arrays', () => {
      expect(isPlainObject([])).toBe(false);
    });

    it('should reject class instances', () => {
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should identify arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(new Array())).toBe(true);
    });

    it('should reject non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe('isArrayOf', () => {
    it('should validate array elements', () => {
      expect(isArrayOf([1, 2, 3], isNumber)).toBe(true);
      expect(isArrayOf(['a', 'b'], isString)).toBe(true);
    });

    it('should reject arrays with wrong element types', () => {
      expect(isArrayOf([1, 'a'], isNumber)).toBe(false);
      expect(isArrayOf([1, 2, null], isNumber)).toBe(false);
    });

    it('should accept empty arrays', () => {
      expect(isArrayOf([], isNumber)).toBe(true);
    });
  });

  describe('isNonEmptyArray', () => {
    it('should identify non-empty arrays', () => {
      expect(isNonEmptyArray([1])).toBe(true);
      expect(isNonEmptyArray([1, 2, 3])).toBe(true);
    });

    it('should reject empty arrays', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });
  });

  describe('isDate', () => {
    it('should identify valid dates', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2024-01-01'))).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(isDate(new Date('invalid'))).toBe(false);
    });

    it('should reject non-dates', () => {
      expect(isDate('2024-01-01')).toBe(false);
      expect(isDate(1234567890)).toBe(false);
    });
  });

  describe('isError', () => {
    it('should identify errors', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError(new RangeError('test'))).toBe(true);
    });

    it('should reject non-errors', () => {
      expect(isError({ message: 'error' })).toBe(false);
      expect(isError('error')).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should identify promises', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    it('should identify thenable objects', () => {
      const thenable = {
        then: () => {},
        catch: () => {},
      };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should reject non-promises', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise({ then: () => {} })).toBe(false); // Missing catch
    });
  });

  describe('isMap', () => {
    it('should identify Maps', () => {
      expect(isMap(new Map())).toBe(true);
      expect(isMap(new Map([['key', 'value']]))).toBe(true);
    });

    it('should reject non-Maps', () => {
      expect(isMap({})).toBe(false);
      expect(isMap(new Set())).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should identify Sets', () => {
      expect(isSet(new Set())).toBe(true);
      expect(isSet(new Set([1, 2, 3]))).toBe(true);
    });

    it('should reject non-Sets', () => {
      expect(isSet([])).toBe(false);
      expect(isSet(new Map())).toBe(false);
    });
  });

  describe('isRegExp', () => {
    it('should identify RegExps', () => {
      expect(isRegExp(/test/)).toBe(true);
      expect(isRegExp(new RegExp('test'))).toBe(true);
    });

    it('should reject non-RegExps', () => {
      expect(isRegExp('test')).toBe(false);
      expect(isRegExp({})).toBe(false);
    });
  });
});

describe('String Format Guards', () => {
  describe('isNonEmptyString', () => {
    it('should identify non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should reject non-strings', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe('isTrimmedNonEmptyString', () => {
    it('should identify trimmed non-empty strings', () => {
      expect(isTrimmedNonEmptyString('hello')).toBe(true);
      expect(isTrimmedNonEmptyString('  hello  ')).toBe(true);
    });

    it('should reject whitespace-only strings', () => {
      expect(isTrimmedNonEmptyString(' ')).toBe(false);
      expect(isTrimmedNonEmptyString('   ')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isTrimmedNonEmptyString('')).toBe(false);
    });
  });

  describe('isUUID', () => {
    it('should identify valid UUIDs', () => {
      expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isUUID('not-a-uuid')).toBe(false);
      expect(isUUID('123-456')).toBe(false);
      expect(isUUID('')).toBe(false);
    });
  });

  describe('isE164Phone', () => {
    it('should identify valid E.164 phone numbers', () => {
      expect(isE164Phone('+40712345678')).toBe(true);
      expect(isE164Phone('+14155552671')).toBe(true);
      expect(isE164Phone('+442071838750')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isE164Phone('0712345678')).toBe(false); // Missing +
      expect(isE164Phone('+0712345678')).toBe(false); // Starts with 0
      expect(isE164Phone('712345678')).toBe(false);
      expect(isE164Phone('+40 712 345 678')).toBe(false); // Contains spaces
    });
  });

  describe('isRomanianPhone', () => {
    it('should identify valid Romanian phone numbers', () => {
      expect(isRomanianPhone('+40712345678')).toBe(true);
      expect(isRomanianPhone('0712345678')).toBe(true);
    });

    it('should reject invalid Romanian numbers', () => {
      expect(isRomanianPhone('+14155552671')).toBe(false);
      expect(isRomanianPhone('712345678')).toBe(false);
    });
  });

  describe('isEmail', () => {
    it('should identify valid emails', () => {
      expect(isEmail('test@example.com')).toBe(true);
      expect(isEmail('user.name@domain.co.uk')).toBe(true);
      expect(isEmail('test+tag@example.com')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isEmail('not-an-email')).toBe(false);
      expect(isEmail('@example.com')).toBe(false);
      expect(isEmail('test@')).toBe(false);
      expect(isEmail('test @example.com')).toBe(false);
    });
  });

  describe('isURL', () => {
    it('should identify valid URLs', () => {
      expect(isURL('https://example.com')).toBe(true);
      expect(isURL('http://subdomain.example.com/path')).toBe(true);
      expect(isURL('https://example.com/path?query=value')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isURL('not-a-url')).toBe(false);
      expect(isURL('ftp://example.com')).toBe(false);
      expect(isURL('//example.com')).toBe(false);
    });
  });

  describe('isHTTPSUrl', () => {
    it('should identify HTTPS URLs', () => {
      expect(isHTTPSUrl('https://example.com')).toBe(true);
      expect(isHTTPSUrl('https://subdomain.example.com/path')).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      expect(isHTTPSUrl('http://example.com')).toBe(false);
    });

    it('should reject non-URLs', () => {
      expect(isHTTPSUrl('not-a-url')).toBe(false);
    });
  });

  describe('isISODateString', () => {
    it('should identify valid ISO date strings', () => {
      expect(isISODateString('2024-01-01')).toBe(true);
      expect(isISODateString('2024-01-01T00:00:00Z')).toBe(true);
      expect(isISODateString('2024-01-01T00:00:00.000Z')).toBe(true);
      expect(isISODateString('2024-01-01T00:00:00+02:00')).toBe(true);
    });

    it('should reject invalid date strings', () => {
      expect(isISODateString('not-a-date')).toBe(false);
      expect(isISODateString('2024-13-01')).toBe(false);
      expect(isISODateString('01/01/2024')).toBe(false);
    });
  });

  describe('isJSONString', () => {
    it('should identify valid JSON strings', () => {
      expect(isJSONString('{}')).toBe(true);
      expect(isJSONString('[]')).toBe(true);
      expect(isJSONString('{"key":"value"}')).toBe(true);
      expect(isJSONString('123')).toBe(true);
      expect(isJSONString('"string"')).toBe(true);
    });

    it('should reject invalid JSON strings', () => {
      expect(isJSONString('not-json')).toBe(false);
      expect(isJSONString('{invalid}')).toBe(false);
      expect(isJSONString("{'key': 'value'}")).toBe(false); // Single quotes
    });

    it('should reject non-strings', () => {
      expect(isJSONString({})).toBe(false);
      expect(isJSONString(123)).toBe(false);
    });
  });
});

describe('Domain Type Guards', () => {
  describe('isLeadSource', () => {
    it('should identify valid lead sources', () => {
      expect(isLeadSource('whatsapp')).toBe(true);
      expect(isLeadSource('voice')).toBe(true);
      expect(isLeadSource('web_form')).toBe(true);
      expect(isLeadSource('hubspot')).toBe(true);
    });

    it('should reject invalid lead sources', () => {
      expect(isLeadSource('invalid')).toBe(false);
      expect(isLeadSource('email')).toBe(false);
      expect(isLeadSource('')).toBe(false);
    });
  });

  describe('isLeadStatus', () => {
    it('should identify valid lead statuses', () => {
      expect(isLeadStatus('new')).toBe(true);
      expect(isLeadStatus('contacted')).toBe(true);
      expect(isLeadStatus('qualified')).toBe(true);
      expect(isLeadStatus('converted')).toBe(true);
    });

    it('should reject invalid lead statuses', () => {
      expect(isLeadStatus('pending')).toBe(false);
      expect(isLeadStatus('unknown')).toBe(false);
    });
  });

  describe('isLeadPriority', () => {
    it('should identify valid lead priorities', () => {
      expect(isLeadPriority('critical')).toBe(true);
      expect(isLeadPriority('high')).toBe(true);
      expect(isLeadPriority('medium')).toBe(true);
      expect(isLeadPriority('low')).toBe(true);
    });

    it('should reject invalid priorities', () => {
      expect(isLeadPriority('urgent')).toBe(false);
      expect(isLeadPriority('normal')).toBe(false);
    });
  });

  describe('isLeadScore', () => {
    it('should identify valid lead scores', () => {
      expect(isLeadScore('HOT')).toBe(true);
      expect(isLeadScore('WARM')).toBe(true);
      expect(isLeadScore('COLD')).toBe(true);
      expect(isLeadScore('UNQUALIFIED')).toBe(true);
    });

    it('should reject invalid scores', () => {
      expect(isLeadScore('MEDIUM')).toBe(false);
      expect(isLeadScore('hot')).toBe(false); // Case sensitive
    });
  });

  describe('isAIScore', () => {
    it('should identify valid AI scores (1-5)', () => {
      expect(isAIScore(1)).toBe(true);
      expect(isAIScore(3)).toBe(true);
      expect(isAIScore(5)).toBe(true);
    });

    it('should reject invalid AI scores', () => {
      expect(isAIScore(0)).toBe(false);
      expect(isAIScore(6)).toBe(false);
      expect(isAIScore(3.5)).toBe(false);
      expect(isAIScore('3')).toBe(false);
    });
  });

  describe('isConfidence', () => {
    it('should identify valid confidence scores (0-1)', () => {
      expect(isConfidence(0)).toBe(true);
      expect(isConfidence(0.5)).toBe(true);
      expect(isConfidence(1)).toBe(true);
    });

    it('should reject invalid confidence scores', () => {
      expect(isConfidence(-0.1)).toBe(false);
      expect(isConfidence(1.1)).toBe(false);
      expect(isConfidence(NaN)).toBe(false);
    });
  });
});

describe('Discriminated Union Guards', () => {
  describe('hasTag', () => {
    it('should create type guard for specific tag', () => {
      type Event = { type: 'A'; valueA: number } | { type: 'B'; valueB: string };

      const isTypeA = hasTag('type', 'A');
      const eventA: Event = { type: 'A', valueA: 42 };
      const eventB: Event = { type: 'B', valueB: 'hello' };

      expect(isTypeA(eventA)).toBe(true);
      expect(isTypeA(eventB)).toBe(false);
    });
  });

  describe('isTagged', () => {
    it('should check _tag field', () => {
      type Tagged = { _tag: 'success'; value: number } | { _tag: 'error'; error: string };

      const isSuccess = isTagged('success');
      const successValue: Tagged = { _tag: 'success', value: 42 };
      const errorValue: Tagged = { _tag: 'error', error: 'failed' };

      expect(isSuccess(successValue)).toBe(true);
      expect(isSuccess(errorValue)).toBe(false);
    });
  });

  describe('hasKeys', () => {
    it('should check if object has all required keys', () => {
      expect(hasKeys({ a: 1, b: 2, c: 3 }, 'a', 'b')).toBe(true);
      expect(hasKeys({ a: 1 }, 'a', 'b')).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(hasKeys(null, 'key')).toBe(false);
      expect(hasKeys('string', 'key')).toBe(false);
    });
  });

  describe('hasKeyOfType', () => {
    it('should check if object has key of specific type', () => {
      const obj = { name: 'John', age: 30 };

      expect(hasKeyOfType(obj, 'name', isString)).toBe(true);
      expect(hasKeyOfType(obj, 'age', isNumber)).toBe(true);
      expect(hasKeyOfType(obj, 'name', isNumber)).toBe(false);
    });

    it('should reject missing keys', () => {
      const obj = { name: 'John' };

      expect(hasKeyOfType(obj, 'age', isNumber)).toBe(false);
    });
  });
});

describe('Assertion Functions', () => {
  describe('assert', () => {
    it('should pass for truthy conditions', () => {
      expect(() => assert(true)).not.toThrow();
      expect(() => assert(1)).not.toThrow();
      expect(() => assert('value')).not.toThrow();
    });

    it('should throw for falsy conditions', () => {
      expect(() => assert(false)).toThrow(AssertionError);
      expect(() => assert(0)).toThrow(AssertionError);
      expect(() => assert(null)).toThrow(AssertionError);
    });

    it('should include custom message', () => {
      expect(() => assert(false, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('assertDefined', () => {
    it('should pass for defined values', () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined('')).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => assertDefined(null)).toThrow(AssertionError);
    });

    it('should throw for undefined', () => {
      expect(() => assertDefined(undefined)).toThrow(AssertionError);
    });
  });

  describe('assertString', () => {
    it('should pass for strings', () => {
      expect(() => assertString('hello')).not.toThrow();
      expect(() => assertString('')).not.toThrow();
    });

    it('should throw for non-strings', () => {
      expect(() => assertString(123)).toThrow(AssertionError);
      expect(() => assertString(null)).toThrow(AssertionError);
    });
  });

  describe('assertNumber', () => {
    it('should pass for numbers', () => {
      expect(() => assertNumber(123)).not.toThrow();
      expect(() => assertNumber(0)).not.toThrow();
    });

    it('should throw for NaN', () => {
      expect(() => assertNumber(NaN)).toThrow(AssertionError);
    });

    it('should throw for non-numbers', () => {
      expect(() => assertNumber('123')).toThrow(AssertionError);
    });
  });

  describe('assertObject', () => {
    it('should pass for objects', () => {
      expect(() => assertObject({})).not.toThrow();
      expect(() => assertObject([])).not.toThrow();
      expect(() => assertObject(new Date())).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => assertObject(null)).toThrow(AssertionError);
    });

    it('should throw for primitives', () => {
      expect(() => assertObject('string')).toThrow(AssertionError);
      expect(() => assertObject(123)).toThrow(AssertionError);
    });
  });

  describe('assertArray', () => {
    it('should pass for arrays', () => {
      expect(() => assertArray([])).not.toThrow();
      expect(() => assertArray([1, 2, 3])).not.toThrow();
    });

    it('should throw for non-arrays', () => {
      expect(() => assertArray({})).toThrow(AssertionError);
      expect(() => assertArray('array')).toThrow(AssertionError);
    });
  });

  describe('assertSchema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    it('should pass for valid data', () => {
      expect(() => assertSchema({ name: 'John', age: 30 }, schema)).not.toThrow();
    });

    it('should throw for invalid data', () => {
      expect(() => assertSchema({ name: 'John' }, schema)).toThrow(AssertionError);
      expect(() => assertSchema({ name: 123, age: 30 }, schema)).toThrow(AssertionError);
    });
  });

  describe('assertNever', () => {
    it('should always throw', () => {
      expect(() => assertNever({} as never)).toThrow(AssertionError);
    });

    it('should include custom message', () => {
      expect(() => assertNever({} as never, 'Unreachable code')).toThrow('Unreachable code');
    });
  });
});

describe('Validation Utilities', () => {
  describe('validate', () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    it('should return Ok for valid data', () => {
      const result = validate({ name: 'John', age: 30 }, schema);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ name: 'John', age: 30 });
      }
    });

    it('should return Err for invalid data', () => {
      const result = validate({ name: 'John' }, schema);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toHaveLength(1);
        expect(result.error[0]?.path).toEqual(['age']);
      }
    });
  });

  describe('createValidator', () => {
    it('should create validator function from schema', () => {
      const schema = z.string().email();
      const validateEmail = createValidator(schema);

      const validResult = validateEmail('test@example.com');
      const invalidResult = validateEmail('not-an-email');

      expect(isOk(validResult)).toBe(true);
      expect(isErr(invalidResult)).toBe(true);
    });
  });

  describe('createGuard', () => {
    it('should create type guard from schema', () => {
      const schema = z.object({ type: z.literal('user'), name: z.string() });
      const isUser = createGuard(schema);

      expect(isUser({ type: 'user', name: 'John' })).toBe(true);
      expect(isUser({ type: 'admin', name: 'John' })).toBe(false);
      expect(isUser({ type: 'user' })).toBe(false);
    });
  });

  describe('createAssertion', () => {
    it('should create assertion function from schema', () => {
      const schema = z.number().positive();
      const assertPositive = createAssertion(schema);

      expect(() => assertPositive(5)).not.toThrow();
      expect(() => assertPositive(-5)).toThrow(AssertionError);
      expect(() => assertPositive('5')).toThrow(AssertionError);
    });
  });
});

describe('Refinement Types', () => {
  describe('refine', () => {
    it('should return value if guard passes', () => {
      const value = refine(isPositive, 5);

      expect(value).toBe(5);
    });

    it('should throw if guard fails', () => {
      expect(() => refine(isPositive, -5)).toThrow(AssertionError);
    });

    it('should include custom message', () => {
      expect(() => refine(isPositive, -5, 'Must be positive')).toThrow('Must be positive');
    });
  });

  describe('refineWith', () => {
    it('should return value if predicate passes', () => {
      const value = refineWith((x: number) => x > 10, 15);

      expect(value).toBe(15);
    });

    it('should throw if predicate fails', () => {
      expect(() => refineWith((x: number) => x > 10, 5)).toThrow(AssertionError);
    });
  });

  describe('narrow', () => {
    it('should filter array to specific type', () => {
      const mixed: (number | string)[] = [1, 'a', 2, 'b', 3];
      const numbers = narrow(mixed, isNumber);

      expect(numbers).toEqual([1, 2, 3]);
    });

    it('should return empty array when no matches', () => {
      const strings = ['a', 'b', 'c'];
      const numbers = narrow(strings, isNumber);

      expect(numbers).toEqual([]);
    });
  });

  describe('getProperty', () => {
    it('should get property from object', () => {
      const obj = { name: 'John', age: 30 };

      expect(getProperty(obj, 'name')).toBe('John');
      expect(getProperty(obj, 'age')).toBe(30);
    });

    it('should return undefined for null/undefined', () => {
      expect(getProperty(null as { name: string } | null, 'name')).toBeUndefined();
      expect(getProperty(undefined as { name: string } | undefined, 'name')).toBeUndefined();
    });
  });

  describe('getNestedProperty', () => {
    it('should get nested property', () => {
      const obj = { user: { profile: { name: 'John' } } };

      expect(getNestedProperty(obj, 'user.profile.name')).toBe('John');
    });

    it('should return undefined for missing paths', () => {
      const obj = { user: { name: 'John' } };

      expect(getNestedProperty(obj, 'user.profile.name')).toBeUndefined();
    });

    it('should handle non-object intermediate values', () => {
      const obj = { user: null };

      expect(getNestedProperty(obj, 'user.name')).toBeUndefined();
    });
  });
});

describe('Type-Safe Parsers', () => {
  describe('parseJSON', () => {
    const schema = z.object({ name: z.string() });

    it('should parse valid JSON', () => {
      const result = parseJSON('{"name":"John"}', schema);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ name: 'John' });
      }
    });

    it('should return Err for invalid JSON', () => {
      const result = parseJSON('{invalid}', schema);

      expect(isErr(result)).toBe(true);
    });

    it('should return Err for schema mismatch', () => {
      const result = parseJSON('{"age":30}', schema);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('parseNumber', () => {
    it('should parse valid numbers', () => {
      expect(parseNumber('123')).toBe(123);
      expect(parseNumber('3.14')).toBe(3.14);
      expect(parseNumber('-42')).toBe(-42);
    });

    it('should return undefined for invalid numbers', () => {
      expect(parseNumber('not-a-number')).toBeUndefined();
      // Empty string parses to 0, not undefined
      expect(parseNumber('abc')).toBeUndefined();
    });
  });

  describe('parseInteger', () => {
    it('should parse valid integers', () => {
      expect(parseInteger('123')).toBe(123);
      expect(parseInteger('-42')).toBe(-42);
    });

    it('should parse decimal strings as integers', () => {
      expect(parseInteger('3.14')).toBe(3);
    });

    it('should return undefined for invalid integers', () => {
      expect(parseInteger('not-a-number')).toBeUndefined();
    });
  });

  describe('parseBoolean', () => {
    it('should parse truthy values', () => {
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('True')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('yes')).toBe(true);
    });

    it('should parse falsy values', () => {
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('False')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('no')).toBe(false);
    });

    it('should return undefined for invalid values', () => {
      expect(parseBoolean('invalid')).toBeUndefined();
      expect(parseBoolean('')).toBeUndefined();
    });
  });

  describe('parseDate', () => {
    it('should parse valid date strings', () => {
      const date = parseDate('2024-01-01');

      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should return undefined for invalid dates', () => {
      expect(parseDate('invalid-date')).toBeUndefined();
      expect(parseDate('')).toBeUndefined();
    });
  });
});
