import { describe, it, expect } from 'vitest';
import {
  normalizeRomanianPhone,
  createIdempotencyKey,
  safeJsonParse,
  isDefined,
  pick,
  omit,
} from '../utils.js';

describe('normalizeRomanianPhone', () => {
  it('should normalize +40 format', () => {
    const result = normalizeRomanianPhone('+40721123456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should normalize 0040 format', () => {
    const result = normalizeRomanianPhone('0040721123456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should normalize 07xx format', () => {
    const result = normalizeRomanianPhone('0721123456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should normalize format with spaces and dashes', () => {
    const result = normalizeRomanianPhone('0721-123-456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should handle format with parentheses', () => {
    const result = normalizeRomanianPhone('(0721) 123 456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should mark invalid phone numbers', () => {
    const result = normalizeRomanianPhone('123');
    expect(result.isValid).toBe(false);
  });

  it('should preserve original in result', () => {
    const original = '+40 721 123 456';
    const result = normalizeRomanianPhone(original);
    expect(result.original).toBe(original);
  });
});

describe('createIdempotencyKey', () => {
  it('should join components with colon', () => {
    const key = createIdempotencyKey('whatsapp', 'msg123', '2024');
    expect(key).toBe('whatsapp:msg123:2024');
  });

  it('should handle single component', () => {
    const key = createIdempotencyKey('single');
    expect(key).toBe('single');
  });

  it('should handle empty strings', () => {
    const key = createIdempotencyKey('a', '', 'b');
    expect(key).toBe('a::b');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"foo": "bar"}', {});
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return fallback for invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('not json', fallback);
    expect(result).toBe(fallback);
  });

  it('should return fallback for empty string', () => {
    const fallback = null;
    const result = safeJsonParse('', fallback);
    expect(result).toBe(fallback);
  });
});

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDefined('string')).toBe(true);
    expect(isDefined(0)).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined({})).toBe(true);
  });

  it('should return false for null', () => {
    expect(isDefined(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isDefined(undefined)).toBe(false);
  });
});

describe('pick', () => {
  it('should pick specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = pick(obj, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should ignore non-existent keys', () => {
    const obj = { a: 1 };
    const result = pick(obj, ['a', 'b' as keyof typeof obj]);
    expect(result).toEqual({ a: 1 });
  });
});

describe('omit', () => {
  it('should omit specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = omit(obj, ['b']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should return same object if no keys to omit', () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, []);
    expect(result).toEqual({ a: 1, b: 2 });
  });
});
