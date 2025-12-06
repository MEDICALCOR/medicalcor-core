import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeRomanianPhone,
  createIdempotencyKey,
  safeJsonParse,
  isDefined,
  pick,
  omit,
  withRetry,
  sleep,
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

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after specified time', async () => {
    const start = Date.now();
    const promise = sleep(100);

    vi.advanceTimersByTime(100);
    await promise;

    // In fake timers, this should work
    expect(Date.now() - start).toBe(100);
  });

  it('should return a promise', () => {
    const result = sleep(50);
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('Fail 1')).mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelayMs: 1 }); // Fast delay for tests

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 1 })).rejects.toThrow('Always fails');
    expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it('should respect maxRetries option', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow('Fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Do not retry'));

    await expect(
      withRetry(fn, {
        shouldRetry: () => false,
      })
    ).rejects.toThrow('Do not retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use shouldRetry predicate to stop', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Retryable'))
      .mockRejectedValueOnce(new Error('NotRetryable'));

    await expect(
      withRetry(fn, {
        baseDelayMs: 1,
        shouldRetry: (error) => (error as Error).message === 'Retryable',
      })
    ).rejects.toThrow('NotRetryable');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call function multiple times before success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('finally');

    const result = await withRetry(fn, { baseDelayMs: 1 });

    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('normalizeRomanianPhone - extended', () => {
  it('should handle 40 without plus format', () => {
    const result = normalizeRomanianPhone('40721123456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should handle just the suffix (9 digits)', () => {
    const result = normalizeRomanianPhone('721123456');
    expect(result.normalized).toBe('+40721123456');
    expect(result.isValid).toBe(true);
  });

  it('should validate all mobile prefixes', () => {
    const prefixes = ['72', '73', '74', '75', '76', '77', '78', '79'];
    prefixes.forEach((prefix) => {
      const result = normalizeRomanianPhone(`0${prefix}1123456`);
      expect(result.isValid).toBe(true);
    });
  });

  it('should reject invalid prefixes', () => {
    const result = normalizeRomanianPhone('0601123456');
    expect(result.isValid).toBe(false);
  });

  it('should reject wrong length for +40 format', () => {
    const result = normalizeRomanianPhone('+4072112345'); // Too short
    expect(result.isValid).toBe(false);
  });

  it('should reject wrong length for 0040 format', () => {
    const result = normalizeRomanianPhone('004072112345678'); // Too long
    expect(result.isValid).toBe(false);
  });
});
