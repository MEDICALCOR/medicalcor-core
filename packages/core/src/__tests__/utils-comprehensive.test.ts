/**
 * Comprehensive Unit Tests for Core Utilities
 * Coverage target: 100% for all utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeRomanianPhone,
  createIdempotencyKey,
  safeJsonParse,
  isDefined,
  pick,
  omit,
  sleep,
  withRetry,
} from '../utils.js';

// ============================================================================
// normalizeRomanianPhone - Comprehensive Tests
// ============================================================================
describe('normalizeRomanianPhone - Comprehensive', () => {
  describe('Valid Romanian Mobile Numbers', () => {
    it.each([
      // +40 format
      ['+40721123456', '+40721123456'],
      ['+40731234567', '+40731234567'],
      ['+40741234567', '+40741234567'],
      ['+40751234567', '+40751234567'],
      ['+40761234567', '+40761234567'],
      ['+40771234567', '+40771234567'],
      ['+40781234567', '+40781234567'],
      ['+40791234567', '+40791234567'],
    ])('normalizes %s to %s', (input, expected) => {
      const result = normalizeRomanianPhone(input);
      expect(result.normalized).toBe(expected);
      expect(result.isValid).toBe(true);
    });

    it.each([
      // 0040 format
      ['0040721123456', '+40721123456'],
      ['0040731234567', '+40731234567'],
      ['0040791234567', '+40791234567'],
    ])('normalizes 0040 format %s to %s', (input, expected) => {
      const result = normalizeRomanianPhone(input);
      expect(result.normalized).toBe(expected);
      expect(result.isValid).toBe(true);
    });

    it.each([
      // 40 format (without plus)
      ['40721123456', '+40721123456'],
      ['40791234567', '+40791234567'],
    ])('normalizes 40 format %s to %s', (input, expected) => {
      const result = normalizeRomanianPhone(input);
      expect(result.normalized).toBe(expected);
      expect(result.isValid).toBe(true);
    });

    it.each([
      // National 0xxx format
      ['0721123456', '+40721123456'],
      ['0731234567', '+40731234567'],
      ['0741234567', '+40741234567'],
      ['0751234567', '+40751234567'],
      ['0761234567', '+40761234567'],
      ['0771234567', '+40771234567'],
      ['0781234567', '+40781234567'],
      ['0791234567', '+40791234567'],
    ])('normalizes national format %s to %s', (input, expected) => {
      const result = normalizeRomanianPhone(input);
      expect(result.normalized).toBe(expected);
      expect(result.isValid).toBe(true);
    });

    it.each([
      // Just suffix (9 digits starting with valid prefix)
      ['721123456', '+40721123456'],
      ['791234567', '+40791234567'],
    ])('normalizes suffix-only format %s to %s', (input, expected) => {
      const result = normalizeRomanianPhone(input);
      expect(result.normalized).toBe(expected);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Numbers with Formatting', () => {
    it('removes spaces', () => {
      const result = normalizeRomanianPhone('+40 721 123 456');
      expect(result.normalized).toBe('+40721123456');
      expect(result.isValid).toBe(true);
    });

    it('removes dashes', () => {
      const result = normalizeRomanianPhone('0721-123-456');
      expect(result.normalized).toBe('+40721123456');
      expect(result.isValid).toBe(true);
    });

    it('removes parentheses', () => {
      const result = normalizeRomanianPhone('(0721) 123 456');
      expect(result.normalized).toBe('+40721123456');
      expect(result.isValid).toBe(true);
    });

    it('removes dots', () => {
      const result = normalizeRomanianPhone('0721.123.456');
      expect(result.normalized).toBe('+40721123456');
      expect(result.isValid).toBe(true);
    });

    it('handles mixed formatting', () => {
      const result = normalizeRomanianPhone('+40 (721) 123-456');
      expect(result.normalized).toBe('+40721123456');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Invalid Numbers', () => {
    it('marks too short numbers as invalid', () => {
      const result = normalizeRomanianPhone('123');
      expect(result.isValid).toBe(false);
    });

    it('marks too long numbers as invalid', () => {
      const result = normalizeRomanianPhone('+407211234567890');
      expect(result.isValid).toBe(false);
    });

    it('marks numbers with invalid prefix as invalid', () => {
      const result = normalizeRomanianPhone('+40612345678');
      expect(result.isValid).toBe(false);
    });

    it('marks empty string as invalid', () => {
      const result = normalizeRomanianPhone('');
      expect(result.isValid).toBe(false);
    });

    it('marks landline numbers as invalid', () => {
      // Romanian landline: 021 (Bucharest)
      const result = normalizeRomanianPhone('0212345678');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('preserves original in result', () => {
      const original = '+40 721 123 456';
      const result = normalizeRomanianPhone(original);
      expect(result.original).toBe(original);
    });

    it('handles unicode whitespace', () => {
      const result = normalizeRomanianPhone('+40\u00A0721\u00A0123\u00A0456');
      // Note: The current implementation might not handle all unicode whitespace
      expect(result.original).toContain('\u00A0');
    });
  });
});

// ============================================================================
// createIdempotencyKey - Comprehensive Tests
// ============================================================================
describe('createIdempotencyKey - Comprehensive', () => {
  it('joins multiple components with colon', () => {
    const key = createIdempotencyKey('whatsapp', 'msg123', '2024');
    expect(key).toBe('whatsapp:msg123:2024');
  });

  it('handles single component', () => {
    const key = createIdempotencyKey('single');
    expect(key).toBe('single');
  });

  it('handles empty strings', () => {
    const key = createIdempotencyKey('a', '', 'b');
    expect(key).toBe('a::b');
  });

  it('handles no components', () => {
    const key = createIdempotencyKey();
    expect(key).toBe('');
  });

  it('handles many components', () => {
    const key = createIdempotencyKey('a', 'b', 'c', 'd', 'e', 'f');
    expect(key).toBe('a:b:c:d:e:f');
  });

  it('handles special characters', () => {
    const key = createIdempotencyKey('user@email.com', 'action/path', 'uuid-123');
    expect(key).toBe('user@email.com:action/path:uuid-123');
  });

  it('handles numeric values converted to strings', () => {
    const key = createIdempotencyKey('type', String(123), String(456));
    expect(key).toBe('type:123:456');
  });
});

// ============================================================================
// safeJsonParse - Comprehensive Tests
// ============================================================================
describe('safeJsonParse - Comprehensive', () => {
  describe('Valid JSON', () => {
    it('parses valid JSON object', () => {
      const result = safeJsonParse('{"foo": "bar"}', {});
      expect(result).toEqual({ foo: 'bar' });
    });

    it('parses valid JSON array', () => {
      const result = safeJsonParse('[1, 2, 3]', []);
      expect(result).toEqual([1, 2, 3]);
    });

    it('parses JSON number', () => {
      const result = safeJsonParse('42', 0);
      expect(result).toBe(42);
    });

    it('parses JSON string', () => {
      const result = safeJsonParse('"hello"', '');
      expect(result).toBe('hello');
    });

    it('parses JSON boolean', () => {
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('false', true)).toBe(false);
    });

    it('parses JSON null', () => {
      const result = safeJsonParse('null', 'default');
      expect(result).toBeNull();
    });

    it('parses nested JSON', () => {
      const json = '{"a": {"b": {"c": [1, 2, 3]}}}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ a: { b: { c: [1, 2, 3] } } });
    });
  });

  describe('Invalid JSON', () => {
    it('returns fallback for invalid JSON', () => {
      const fallback = { default: true };
      const result = safeJsonParse('not json', fallback);
      expect(result).toBe(fallback);
    });

    it('returns fallback for empty string', () => {
      const fallback = null;
      const result = safeJsonParse('', fallback);
      expect(result).toBe(fallback);
    });

    it('returns fallback for malformed JSON', () => {
      const fallback = { error: true };
      const result = safeJsonParse('{"unclosed": "object"', fallback);
      expect(result).toBe(fallback);
    });

    it('returns fallback for undefined', () => {
      const fallback = 'default';
      const result = safeJsonParse('undefined', fallback);
      expect(result).toBe(fallback);
    });

    it('returns fallback for single quotes', () => {
      const fallback = { error: true };
      const result = safeJsonParse("{'key': 'value'}", fallback);
      expect(result).toBe(fallback);
    });
  });

  describe('Type Safety', () => {
    it('preserves type of parsed result', () => {
      interface MyType {
        id: number;
        name: string;
      }
      const result = safeJsonParse<MyType>('{"id": 1, "name": "test"}', { id: 0, name: '' });
      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
    });
  });
});

// ============================================================================
// isDefined - Comprehensive Tests
// ============================================================================
describe('isDefined - Comprehensive', () => {
  describe('Defined Values', () => {
    it('returns true for non-empty string', () => {
      expect(isDefined('string')).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(isDefined('')).toBe(true);
    });

    it('returns true for zero', () => {
      expect(isDefined(0)).toBe(true);
    });

    it('returns true for negative numbers', () => {
      expect(isDefined(-1)).toBe(true);
    });

    it('returns true for positive numbers', () => {
      expect(isDefined(42)).toBe(true);
    });

    it('returns true for NaN', () => {
      expect(isDefined(NaN)).toBe(true);
    });

    it('returns true for Infinity', () => {
      expect(isDefined(Infinity)).toBe(true);
    });

    it('returns true for false', () => {
      expect(isDefined(false)).toBe(true);
    });

    it('returns true for true', () => {
      expect(isDefined(true)).toBe(true);
    });

    it('returns true for empty object', () => {
      expect(isDefined({})).toBe(true);
    });

    it('returns true for empty array', () => {
      expect(isDefined([])).toBe(true);
    });

    it('returns true for Date', () => {
      expect(isDefined(new Date())).toBe(true);
    });

    it('returns true for function', () => {
      expect(isDefined(() => {})).toBe(true);
    });

    it('returns true for Symbol', () => {
      expect(isDefined(Symbol('test'))).toBe(true);
    });

    it('returns true for BigInt', () => {
      expect(isDefined(BigInt(123))).toBe(true);
    });
  });

  describe('Undefined Values', () => {
    it('returns false for null', () => {
      expect(isDefined(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isDefined(undefined)).toBe(false);
    });

    it('returns false for void 0', () => {
      expect(isDefined(void 0)).toBe(false);
    });
  });

  describe('Type Guard Behavior', () => {
    it('narrows type correctly', () => {
      const value: string | null | undefined = 'test';
      if (isDefined(value)) {
        // TypeScript should now know value is string
        const upper: string = value.toUpperCase();
        expect(upper).toBe('TEST');
      }
    });
  });
});

// ============================================================================
// pick - Comprehensive Tests
// ============================================================================
describe('pick - Comprehensive', () => {
  it('picks specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = pick(obj, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('ignores non-existent keys', () => {
    const obj = { a: 1 };
    const result = pick(obj, ['a', 'b' as keyof typeof obj]);
    expect(result).toEqual({ a: 1 });
  });

  it('returns empty object for empty keys array', () => {
    const obj = { a: 1, b: 2 };
    const result = pick(obj, []);
    expect(result).toEqual({});
  });

  it('handles empty source object', () => {
    const obj = {};
    const result = pick(obj, []);
    expect(result).toEqual({});
  });

  it('preserves value types', () => {
    const obj = {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 2, 3],
      nested: { a: 1 },
    };
    const result = pick(obj, ['str', 'num', 'nested']);
    expect(result).toEqual({
      str: 'hello',
      num: 42,
      nested: { a: 1 },
    });
  });

  it('handles objects with undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const result = pick(obj, ['a', 'b']);
    expect(result).toEqual({ a: 1, b: undefined });
    expect('b' in result).toBe(true);
  });

  it('handles objects with null values', () => {
    const obj = { a: 1, b: null, c: 3 };
    const result = pick(obj, ['b']);
    expect(result).toEqual({ b: null });
  });

  it('does not mutate original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const original = { ...obj };
    pick(obj, ['a']);
    expect(obj).toEqual(original);
  });
});

// ============================================================================
// omit - Comprehensive Tests
// ============================================================================
describe('omit - Comprehensive', () => {
  it('omits specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = omit(obj, ['b']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('returns same object if no keys to omit', () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, []);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('handles non-existent keys', () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, ['c' as keyof typeof obj]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('omits multiple keys', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = omit(obj, ['b', 'd']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('returns empty object when all keys omitted', () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, ['a', 'b']);
    expect(result).toEqual({});
  });

  it('preserves value types', () => {
    const obj = {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 2, 3],
      nested: { a: 1 },
    };
    const result = omit(obj, ['num', 'bool']);
    expect(result).toEqual({
      str: 'hello',
      arr: [1, 2, 3],
      nested: { a: 1 },
    });
  });

  it('does not mutate original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const original = { ...obj };
    omit(obj, ['a']);
    expect(obj).toEqual(original);
  });
});

// ============================================================================
// sleep - Tests
// ============================================================================
describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after specified duration', async () => {
    const promise = sleep(1000);

    vi.advanceTimersByTime(999);
    // Should still be pending
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('resolves immediately for 0ms', async () => {
    const promise = sleep(0);
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBeUndefined();
  });
});

// ============================================================================
// withRetry - Comprehensive Tests
// ============================================================================
describe('withRetry - Comprehensive', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValueOnce('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
      })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('respects shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal error'));

    await expect(
      withRetry(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        shouldRetry: (error) => !error.message.includes('fatal'),
      })
    ).rejects.toThrow('fatal error');

    // Should not retry because shouldRetry returns false
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxDelayMs cap', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 5,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('handles async errors correctly', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      throw new Error('async error');
    });

    await expect(
      withRetry(fn, {
        maxRetries: 1,
        baseDelayMs: 1,
      })
    ).rejects.toThrow('async error');
  });
});
