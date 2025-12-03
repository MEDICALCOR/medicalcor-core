/**
 * Rate Limiter Tests
 *
 * Tests for the Redis rate limiter including:
 * - In-memory fallback behavior
 * - Rate limit enforcement
 * - Window expiration
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue('192.168.1.1'),
  }),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// Mock Redis client - simulate unavailable Redis to test memory fallback
vi.mock('@medicalcor/core/infrastructure/redis-client', () => ({
  createRedisClientFromEnv: vi.fn().mockReturnValue(null),
}));

import {
  checkRateLimit,
  withRateLimit,
  RateLimitError,
  DEFAULT_RATE_LIMITS,
} from '@/lib/rate-limit';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the in-memory store between tests by using different prefixes
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await checkRateLimit('test-first-' + Date.now());

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should use default rate limits', async () => {
      const result = await checkRateLimit('default');

      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.default.limit);
    });

    it('should use action-specific rate limits', async () => {
      const result = await checkRateLimit('delete');

      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.delete.limit);
    });

    it('should track request count', async () => {
      const prefix = 'track-count-' + Date.now();

      const result1 = await checkRateLimit(prefix);
      expect(result1.current).toBe(1);

      const result2 = await checkRateLimit(prefix);
      expect(result2.current).toBe(2);

      const result3 = await checkRateLimit(prefix);
      expect(result3.current).toBe(3);
    });

    it('should block when limit exceeded', async () => {
      const prefix = 'exceed-limit-' + Date.now();
      const customConfig = { limit: 3, windowSeconds: 60 };

      // Make 3 requests (at limit)
      await checkRateLimit(prefix, customConfig);
      await checkRateLimit(prefix, customConfig);
      await checkRateLimit(prefix, customConfig);

      // 4th request should be blocked
      const result = await checkRateLimit(prefix, customConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return remaining count', async () => {
      const prefix = 'remaining-' + Date.now();
      const customConfig = { limit: 5, windowSeconds: 60 };

      const result1 = await checkRateLimit(prefix, customConfig);
      expect(result1.remaining).toBe(4);

      const result2 = await checkRateLimit(prefix, customConfig);
      expect(result2.remaining).toBe(3);
    });

    it('should support custom configuration', async () => {
      const prefix = 'custom-' + Date.now();
      const customConfig = {
        limit: 100,
        windowSeconds: 3600,
      };

      const result = await checkRateLimit(prefix, customConfig);

      expect(result.limit).toBe(100);
    });

    it('should indicate rate limiting is active', async () => {
      const result = await checkRateLimit('active-check-' + Date.now());

      expect(result.active).toBe(true);
    });
  });

  describe('withRateLimit decorator', () => {
    it('should execute action when under limit', async () => {
      const mockAction = vi.fn().mockResolvedValue('success');
      const limitedAction = withRateLimit('decorated-' + Date.now(), mockAction);

      const result = await limitedAction();

      expect(result).toBe('success');
      expect(mockAction).toHaveBeenCalled();
    });

    it('should throw RateLimitError when limit exceeded', async () => {
      const prefix = 'decorator-exceed-' + Date.now();
      const mockAction = vi.fn().mockResolvedValue('success');
      const limitedAction = withRateLimit(prefix, mockAction, {
        limit: 1,
        windowSeconds: 60,
      });

      // First call should succeed
      await limitedAction();

      // Second call should throw
      await expect(limitedAction()).rejects.toThrow(RateLimitError);
    });

    it('should pass arguments to wrapped action', async () => {
      const mockAction = vi.fn().mockResolvedValue('success');
      const limitedAction = withRateLimit('args-' + Date.now(), mockAction);

      await limitedAction('arg1', 'arg2', { key: 'value' });

      expect(mockAction).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
    });

    it('should preserve action return type', async () => {
      interface User {
        id: string;
        name: string;
      }
      const mockAction = vi.fn().mockResolvedValue({ id: '1', name: 'Test' });
      const limitedAction = withRateLimit<[], User>('typed-' + Date.now(), mockAction);

      const result = await limitedAction();

      expect(result).toEqual({ id: '1', name: 'Test' });
    });
  });

  describe('RateLimitError', () => {
    it('should include rate limit result', async () => {
      const prefix = 'error-result-' + Date.now();
      const mockAction = vi.fn().mockResolvedValue('success');
      const limitedAction = withRateLimit(prefix, mockAction, {
        limit: 1,
        windowSeconds: 60,
      });

      await limitedAction();

      try {
        await limitedAction();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        if (error instanceof RateLimitError) {
          expect(error.rateLimitResult).toBeDefined();
          expect(error.rateLimitResult.allowed).toBe(false);
          expect(error.rateLimitResult.limit).toBe(1);
        }
      }
    });

    it('should have descriptive message', async () => {
      const prefix = 'error-message-' + Date.now();
      const mockAction = vi.fn().mockResolvedValue('success');
      const limitedAction = withRateLimit(prefix, mockAction, {
        limit: 1,
        windowSeconds: 60,
      });

      await limitedAction();

      try {
        await limitedAction();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('Rate limit exceeded');
          expect(error.message).toContain(prefix);
        }
      }
    });
  });

  describe('DEFAULT_RATE_LIMITS', () => {
    it('should have sensible defaults for read operations', () => {
      expect(DEFAULT_RATE_LIMITS.read.limit).toBeGreaterThan(30);
    });

    it('should have stricter limits for delete operations', () => {
      expect(DEFAULT_RATE_LIMITS.delete.limit).toBeLessThan(DEFAULT_RATE_LIMITS.read.limit);
    });

    it('should have strictest limits for auth operations', () => {
      expect(DEFAULT_RATE_LIMITS.auth.limit).toBeLessThanOrEqual(5);
    });

    it('should have all expected action types', () => {
      expect(DEFAULT_RATE_LIMITS).toHaveProperty('read');
      expect(DEFAULT_RATE_LIMITS).toHaveProperty('create');
      expect(DEFAULT_RATE_LIMITS).toHaveProperty('update');
      expect(DEFAULT_RATE_LIMITS).toHaveProperty('delete');
      expect(DEFAULT_RATE_LIMITS).toHaveProperty('default');
    });
  });
});
