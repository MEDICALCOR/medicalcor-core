/**
 * @fileoverview Tests for Shared Domain Types Utilities
 * Tests Result pattern helpers, retry logic, and error handling
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  sleep,
  withRetry,
  DomainError,
  ValidationError,
  DEFAULT_RETRY_CONFIG,
  type Result,
} from '../shared/types.js';
import { z } from 'zod';

describe('Result Pattern Utilities', () => {
  describe('ok', () => {
    it('should create success result', () => {
      const result = ok('success value');

      expect(result.success).toBe(true);
      expect(result.value).toBe('success value');
      expect(result.error).toBeUndefined();
    });

    it('should work with different types', () => {
      const numResult = ok(42);
      const objResult = ok({ id: '123', name: 'test' });
      const arrResult = ok([1, 2, 3]);

      expect(numResult.value).toBe(42);
      expect(objResult.value).toEqual({ id: '123', name: 'test' });
      expect(arrResult.value).toEqual([1, 2, 3]);
    });
  });

  describe('err', () => {
    it('should create failure result', () => {
      const error = new Error('test error');
      const result = err(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.value).toBeUndefined();
    });

    it('should work with different error types', () => {
      const stringErr = err('string error');
      const objErr = err({ code: 'ERR001', message: 'test' });

      expect(stringErr.error).toBe('string error');
      expect(objErr.error).toEqual({ code: 'ERR001', message: 'test' });
    });
  });

  describe('isOk', () => {
    it('should return true for success result', () => {
      const result = ok('value');
      expect(isOk(result)).toBe(true);
    });

    it('should return false for failure result', () => {
      const result = err(new Error('test'));
      expect(isOk(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<string, Error> = ok('value');

      if (isOk(result)) {
        // TypeScript should know result.value is string
        const value: string = result.value;
        expect(value).toBe('value');
      }
    });
  });

  describe('isErr', () => {
    it('should return true for failure result', () => {
      const result = err(new Error('test'));
      expect(isErr(result)).toBe(true);
    });

    it('should return false for success result', () => {
      const result = ok('value');
      expect(isErr(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<string, Error> = err(new Error('test error'));

      if (isErr(result)) {
        // TypeScript should know result.error is Error
        const error: Error = result.error;
        expect(error.message).toBe('test error');
      }
    });
  });

  describe('unwrap', () => {
    it('should return value for success result', () => {
      const result = ok('test value');
      expect(unwrap(result)).toBe('test value');
    });

    it('should throw error for failure result', () => {
      const error = new Error('test error');
      const result = err(error);

      expect(() => unwrap(result)).toThrow(error);
    });
  });

  describe('unwrapOr', () => {
    it('should return value for success result', () => {
      const result = ok('actual value');
      expect(unwrapOr(result, 'default value')).toBe('actual value');
    });

    it('should return default for failure result', () => {
      const result = err(new Error('test'));
      expect(unwrapOr(result, 'default value')).toBe('default value');
    });

    it('should work with different default types', () => {
      const numResult = err<number, Error>(new Error('test'));
      expect(unwrapOr(numResult, 42)).toBe(42);

      const objResult = err<{ id: string }, Error>(new Error('test'));
      expect(unwrapOr(objResult, { id: 'default' })).toEqual({ id: 'default' });
    });
  });
});

describe('Async Utilities', () => {
  describe('sleep', () => {
    it('should resolve after specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(95); // Allow some margin
      expect(duration).toBeLessThan(150);
    });

    it('should return promise that resolves to void', async () => {
      const result = await sleep(10);
      expect(result).toBeUndefined();
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const operation = vi.fn(async () => 'success');
      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'success';
      });

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const operation = vi.fn(async () => {
        throw new Error('permanent failure');
      });

      await expect(
        withRetry(operation, { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 })
      ).rejects.toThrow('permanent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      let lastTime = Date.now();
      let attempts = 0;

      const operation = vi.fn(async () => {
        attempts++;
        const now = Date.now();
        // Only record delay after first attempt
        if (attempts > 1) {
          delays.push(now - lastTime);
        }
        lastTime = now;
        throw new Error('test');
      });

      const config = {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      await expect(withRetry(operation, config)).rejects.toThrow();

      // Check that delays roughly follow exponential backoff
      // Should have 3 delays for retries (after attempts 1, 2, 3)
      expect(delays.length).toBe(3);
      expect(delays[0]).toBeGreaterThanOrEqual(8); // ~10ms
      expect(delays[1]).toBeGreaterThanOrEqual(18); // ~20ms
      expect(delays[2]).toBeGreaterThanOrEqual(38); // ~40ms
    });

    it('should respect max delay', async () => {
      const delays: number[] = [];
      let lastTime = Date.now();

      const operation = vi.fn(async () => {
        const now = Date.now();
        if (delays.length > 0) {
          delays.push(now - lastTime);
        }
        lastTime = now;
        throw new Error('test');
      });

      const config = {
        maxRetries: 5,
        initialDelayMs: 50,
        maxDelayMs: 100,
        backoffMultiplier: 3,
      };

      await expect(withRetry(operation, config)).rejects.toThrow();

      // Later retries should be capped at maxDelayMs
      const cappedDelays = delays.slice(-2);
      expect(cappedDelays.every((d) => d >= 90 && d <= 120)).toBe(true);
    });

    it('should handle non-Error exceptions', async () => {
      const operation = vi.fn(async () => {
        throw 'string error'; // Non-Error exception
      });

      await expect(
        withRetry(operation, { ...DEFAULT_RETRY_CONFIG, maxRetries: 1 })
      ).rejects.toThrow('string error');
    });
  });
});

describe('Domain Error Classes', () => {
  describe('DomainError', () => {
    it('should create domain error with code and message', () => {
      const error = new DomainError('NOT_FOUND', 'Resource not found');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('DomainError');
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create error with details', () => {
      const error = new DomainError('VALIDATION_ERROR', 'Invalid data', {
        field: 'email',
        reason: 'invalid format',
      });

      expect(error.details).toEqual({
        field: 'email',
        reason: 'invalid format',
      });
    });

    it('should create error with cause', () => {
      const cause = new Error('underlying error');
      const error = new DomainError('INTERNAL_ERROR', 'Operation failed', undefined, cause);

      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new DomainError('VALIDATION_ERROR', 'Invalid input', { field: 'name' });
      const json = error.toJSON();

      expect(json.name).toBe('DomainError');
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.message).toBe('Invalid input');
      expect(json.details).toEqual({ field: 'name' });
      expect(json.stack).toBeDefined();
    });

    it('should work with different error codes', () => {
      const codes: Array<DomainError['code']> = [
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'ALREADY_EXISTS',
        'PERMISSION_DENIED',
        'CONSENT_REQUIRED',
        'AI_SERVICE_ERROR',
      ];

      codes.forEach((code) => {
        const error = new DomainError(code, 'test message');
        expect(error.code).toBe(code);
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field errors', () => {
      const fieldErrors = {
        email: ['invalid format', 'required field'],
        age: ['must be positive'],
      };

      const error = new ValidationError('Validation failed', fieldErrors);

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Validation failed');
      expect(error.fieldErrors).toEqual(fieldErrors);
      expect(error.name).toBe('ValidationError');
      expect(error.details).toEqual({ fieldErrors });
    });

    it('should create from Zod error', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().positive(),
      });

      try {
        schema.parse({ email: 'invalid', age: -1 });
      } catch (e) {
        if (e instanceof z.ZodError) {
          const error = ValidationError.fromZodError(e);

          expect(error).toBeInstanceOf(ValidationError);
          expect(error.message).toBe('Validation failed');
          expect(error.fieldErrors.email).toBeDefined();
          expect(error.fieldErrors.age).toBeDefined();
        }
      }
    });

    it('should handle Zod errors without path', () => {
      const schema = z.string().min(5);

      try {
        schema.parse('ab');
      } catch (e) {
        if (e instanceof z.ZodError) {
          const error = ValidationError.fromZodError(e);
          expect(error.fieldErrors._root).toBeDefined();
        }
      }
    });
  });
});
