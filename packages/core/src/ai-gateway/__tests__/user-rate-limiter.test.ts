/**
 * User Rate Limiter Tests
 *
 * Comprehensive tests for per-user AI request rate limiting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  UserRateLimiter,
  createUserRateLimiter,
  createRateLimitMiddleware,
  DEFAULT_TIER_LIMITS,
  TierLimitsSchema,
  UserRateLimiterConfigSchema,
  type UserTier,
} from '../user-rate-limiter.js';
import type { SecureRedisClient } from '../../infrastructure/redis-client.js';

describe('UserRateLimiter', () => {
  let mockRedis: SecureRedisClient;
  let rateLimiter: UserRateLimiter;

  function createMockRedis(): SecureRedisClient {
    const counters = new Map<string, number>();

    return {
      get: vi.fn().mockImplementation((key: string) => {
        const value = counters.get(key);
        return Promise.resolve(value?.toString() ?? null);
      }),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockImplementation((...keys: string[]) => {
        keys.forEach((k) => counters.delete(k));
        return Promise.resolve(keys.length);
      }),
      incrbyWithExpire: vi.fn().mockImplementation((key: string, amount: number) => {
        const current = counters.get(key) ?? 0;
        const newValue = current + amount;
        counters.set(key, newValue);
        return Promise.resolve(newValue);
      }),
      keys: vi.fn().mockResolvedValue([]),
      lrange: vi.fn().mockResolvedValue([]),
      rpush: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      // Add other methods as needed
    } as unknown as SecureRedisClient;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
    mockRedis = createMockRedis();
    rateLimiter = new UserRateLimiter(mockRedis);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkLimit', () => {
    it('should allow requests when under limit', async () => {
      const result = await rateLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.tier).toBe('free');
    });

    it('should block requests when limit exceeded', async () => {
      // Simulate exceeding the limit
      const effectiveLimit =
        DEFAULT_TIER_LIMITS.free.requestsPerMinute + DEFAULT_TIER_LIMITS.free.burstAllowance;
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        effectiveLimit + 1
      );

      const result = await rateLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should use specified tier', async () => {
      const result = await rateLimiter.checkLimit('user-123', { tier: 'pro' });

      expect(result.tier).toBe('pro');
      expect(result.limit).toBe(DEFAULT_TIER_LIMITS.pro.requestsPerMinute);
    });

    it('should check hourly limits', async () => {
      // First call sets up minute counter
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
      // Second call returns hourly count at limit
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        DEFAULT_TIER_LIMITS.free.requestsPerHour.toString()
      );

      const result = await rateLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Hourly limit exceeded');
    });

    it('should check daily limits', async () => {
      // First call sets up minute counter
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
      // Hourly is fine
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('0');
      // Daily at limit
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        DEFAULT_TIER_LIMITS.free.requestsPerDay.toString()
      );

      const result = await rateLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('should check token limits when provided', async () => {
      const tokenLimiter = new UserRateLimiter(mockRedis, { enableTokenLimiting: true });

      // Setup counters to pass request limits
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (mockRedis.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('0') // hourly
        .mockResolvedValueOnce('0') // daily
        .mockResolvedValueOnce((DEFAULT_TIER_LIMITS.free.tokensPerDay - 100).toString()); // tokens near limit

      const result = await tokenLimiter.checkLimit('user-123', {
        estimatedTokens: 1000, // Would exceed daily token limit
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('token limit exceeded');
    });

    it('should check concurrent request limits', async () => {
      const concurrentLimiter = new UserRateLimiter(mockRedis, { enableConcurrentLimiting: true });

      // Setup counters
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (mockRedis.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('0') // hourly
        .mockResolvedValueOnce('0') // daily
        .mockResolvedValueOnce(DEFAULT_TIER_LIMITS.free.maxConcurrent.toString()); // at concurrent limit

      const result = await concurrentLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Concurrent request limit');
    });

    it('should handle Redis errors gracefully', async () => {
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis down')
      );

      const result = await rateLimiter.checkLimit('user-123');

      // Should allow on Redis failure (graceful degradation)
      expect(result.allowed).toBe(true);
    });

    it('should return correct reset times', async () => {
      const result = await rateLimiter.checkLimit('user-123');

      expect(result.resetInSeconds).toBeGreaterThan(0);
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should allow unlimited tier without limits', async () => {
      const result = await rateLimiter.checkLimit('user-123', { tier: 'unlimited' });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(DEFAULT_TIER_LIMITS.unlimited.requestsPerMinute);
    });
  });

  describe('checkLimit - disabled', () => {
    it('should always allow when rate limiting disabled', async () => {
      const disabledLimiter = new UserRateLimiter(mockRedis, { enabled: false });

      const result = await disabledLimiter.checkLimit('user-123');

      expect(result.allowed).toBe(true);
      expect(mockRedis.incrbyWithExpire).not.toHaveBeenCalled();
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage', async () => {
      await rateLimiter.recordTokenUsage('user-123', 500);

      expect(mockRedis.incrbyWithExpire).toHaveBeenCalled();
    });

    it('should not record when disabled', async () => {
      const disabledLimiter = new UserRateLimiter(mockRedis, { enabled: false });

      await disabledLimiter.recordTokenUsage('user-123', 500);

      expect(mockRedis.incrbyWithExpire).not.toHaveBeenCalled();
    });

    it('should not record when token limiting disabled', async () => {
      const noTokenLimiter = new UserRateLimiter(mockRedis, { enableTokenLimiting: false });

      await noTokenLimiter.recordTokenUsage('user-123', 500);

      expect(mockRedis.incrbyWithExpire).not.toHaveBeenCalled();
    });

    it('should handle Redis errors', async () => {
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis error')
      );

      // Should not throw
      await expect(rateLimiter.recordTokenUsage('user-123', 500)).resolves.not.toThrow();
    });
  });

  describe('acquireConcurrentSlot', () => {
    it('should acquire slot when under limit', async () => {
      const result = await rateLimiter.acquireConcurrentSlot('user-123');

      expect(result).toBe(true);
    });

    it('should fail when at limit', async () => {
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        DEFAULT_TIER_LIMITS.free.maxConcurrent + 1
      );

      const result = await rateLimiter.acquireConcurrentSlot('user-123');

      expect(result).toBe(false);
    });

    it('should return true when disabled', async () => {
      const disabledLimiter = new UserRateLimiter(mockRedis, { enabled: false });

      const result = await disabledLimiter.acquireConcurrentSlot('user-123');

      expect(result).toBe(true);
    });

    it('should handle Redis errors gracefully', async () => {
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis error')
      );

      const result = await rateLimiter.acquireConcurrentSlot('user-123');

      expect(result).toBe(true); // Allow on failure
    });
  });

  describe('releaseConcurrentSlot', () => {
    it('should release slot', async () => {
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('2');

      await rateLimiter.releaseConcurrentSlot('user-123');

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should delete key when reaching zero', async () => {
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('1');

      await rateLimiter.releaseConcurrentSlot('user-123');

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should not throw when disabled', async () => {
      const disabledLimiter = new UserRateLimiter(mockRedis, { enabled: false });

      await expect(disabledLimiter.releaseConcurrentSlot('user-123')).resolves.not.toThrow();
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      (mockRedis.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('5') // minute
        .mockResolvedValueOnce('50') // daily
        .mockResolvedValueOnce('200') // monthly
        .mockResolvedValueOnce('1000') // daily tokens
        .mockResolvedValueOnce('5000'); // monthly tokens

      const stats = await rateLimiter.getUsageStats('user-123');

      expect(stats.userId).toBe('user-123');
      expect(stats.tier).toBe('free');
      expect(stats.requestsThisWindow).toBe(5);
      expect(stats.requestsToday).toBe(50);
      expect(stats.requestsThisMonth).toBe(200);
      expect(stats.tokensUsedToday).toBe(1000);
      expect(stats.tokensUsedThisMonth).toBe(5000);
    });

    it('should return empty stats on Redis error', async () => {
      (mockRedis.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis error'));

      const stats = await rateLimiter.getUsageStats('user-123');

      expect(stats.requestsThisWindow).toBe(0);
      expect(stats.tokensUsedToday).toBe(0);
    });

    it('should use specified tier', async () => {
      const stats = await rateLimiter.getUsageStats('user-123', 'enterprise');

      expect(stats.tier).toBe('enterprise');
    });
  });

  describe('resetUserLimits', () => {
    it('should delete all user limit keys', async () => {
      await rateLimiter.resetUserLimits('user-123');

      expect(mockRedis.del).toHaveBeenCalled();
      const [deletedKeys] = (mockRedis.del as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(deletedKeys).toContain('user-123');
    });
  });

  describe('getTierLimits', () => {
    it('should return limits for specified tier', () => {
      const limits = rateLimiter.getTierLimits('pro');

      expect(limits.requestsPerMinute).toBe(DEFAULT_TIER_LIMITS.pro.requestsPerMinute);
      expect(limits.requestsPerHour).toBe(DEFAULT_TIER_LIMITS.pro.requestsPerHour);
    });

    it('should return copy of limits', () => {
      const limits = rateLimiter.getTierLimits('free');

      limits.requestsPerMinute = 999999;

      expect(rateLimiter.getTierLimits('free').requestsPerMinute).toBe(
        DEFAULT_TIER_LIMITS.free.requestsPerMinute
      );
    });
  });

  describe('setTierLimits', () => {
    it('should update tier limits', () => {
      rateLimiter.setTierLimits('free', { requestsPerMinute: 10 });

      expect(rateLimiter.getTierLimits('free').requestsPerMinute).toBe(10);
    });

    it('should only update specified properties', () => {
      const originalHourly = rateLimiter.getTierLimits('free').requestsPerHour;

      rateLimiter.setTierLimits('free', { requestsPerMinute: 10 });

      expect(rateLimiter.getTierLimits('free').requestsPerHour).toBe(originalHourly);
    });
  });

  describe('getConfig and updateConfig', () => {
    it('should return configuration', () => {
      const config = rateLimiter.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.defaultTier).toBe('free');
    });

    it('should update configuration', () => {
      rateLimiter.updateConfig({ defaultTier: 'pro' });

      expect(rateLimiter.getConfig().defaultTier).toBe('pro');
    });
  });

  describe('isEnabled and setEnabled', () => {
    it('should return enabled state', () => {
      expect(rateLimiter.isEnabled()).toBe(true);
    });

    it('should update enabled state', () => {
      rateLimiter.setEnabled(false);

      expect(rateLimiter.isEnabled()).toBe(false);
    });
  });

  describe('DEFAULT_TIER_LIMITS', () => {
    it('should have all tiers configured', () => {
      const tiers: UserTier[] = ['free', 'basic', 'pro', 'enterprise', 'unlimited'];

      for (const tier of tiers) {
        expect(DEFAULT_TIER_LIMITS[tier]).toBeDefined();
        expect(DEFAULT_TIER_LIMITS[tier].requestsPerMinute).toBeGreaterThan(0);
      }
    });

    it('should have increasing limits for higher tiers', () => {
      expect(DEFAULT_TIER_LIMITS.basic.requestsPerMinute).toBeGreaterThan(
        DEFAULT_TIER_LIMITS.free.requestsPerMinute
      );
      expect(DEFAULT_TIER_LIMITS.pro.requestsPerMinute).toBeGreaterThan(
        DEFAULT_TIER_LIMITS.basic.requestsPerMinute
      );
      expect(DEFAULT_TIER_LIMITS.enterprise.requestsPerMinute).toBeGreaterThan(
        DEFAULT_TIER_LIMITS.pro.requestsPerMinute
      );
    });
  });

  describe('Schema Validation', () => {
    it('should validate TierLimits', () => {
      const validLimits = {
        requestsPerMinute: 10,
        requestsPerHour: 100,
        requestsPerDay: 500,
        tokensPerMinute: 5000,
        tokensPerDay: 50000,
        tokensPerMonth: 500000,
        maxConcurrent: 5,
        burstAllowance: 5,
      };

      expect(() => TierLimitsSchema.parse(validLimits)).not.toThrow();
    });

    it('should validate UserRateLimiterConfig', () => {
      const validConfig = {
        enabled: true,
        defaultTier: 'pro',
        enableTokenLimiting: true,
      };

      expect(() => UserRateLimiterConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should apply defaults', () => {
      const parsed = UserRateLimiterConfigSchema.parse({});

      expect(parsed.enabled).toBe(true);
      expect(parsed.defaultTier).toBe('free');
      expect(parsed.windowSizeSeconds).toBe(60);
    });
  });

  describe('Factory Function', () => {
    it('should create rate limiter', () => {
      const limiter = createUserRateLimiter(mockRedis);

      expect(limiter).toBeInstanceOf(UserRateLimiter);
    });

    it('should create with custom config', () => {
      const limiter = createUserRateLimiter(mockRedis, { defaultTier: 'enterprise' });

      expect(limiter.getConfig().defaultTier).toBe('enterprise');
    });
  });

  describe('createRateLimitMiddleware', () => {
    it('should allow requests when rate limit check passes', async () => {
      const middleware = createRateLimitMiddleware(rateLimiter);

      const mockRequest = {
        headers: { 'x-user-id': 'user-123' },
      };
      const mockReply = {
        header: vi.fn(),
        status: vi.fn().mockReturnValue({ send: vi.fn() }),
      };

      const result = await middleware(mockRequest, mockReply);

      expect(result).toBe(true);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
    });

    it('should block and return 429 when limit exceeded', async () => {
      (mockRedis.incrbyWithExpire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1000);

      const middleware = createRateLimitMiddleware(rateLimiter);

      const mockRequest = {
        headers: { 'x-user-id': 'user-123' },
      };
      const sendMock = vi.fn();
      const mockReply = {
        header: vi.fn(),
        status: vi.fn().mockReturnValue({ send: sendMock }),
      };

      const result = await middleware(mockRequest, mockReply);

      expect(result).toBe(false);
      expect(mockReply.status).toHaveBeenCalledWith(429);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });

    it('should skip check when no user ID', async () => {
      const middleware = createRateLimitMiddleware(rateLimiter);

      const mockRequest = {
        headers: {},
      };
      const mockReply = {
        header: vi.fn(),
        status: vi.fn().mockReturnValue({ send: vi.fn() }),
      };

      const result = await middleware(mockRequest, mockReply);

      expect(result).toBe(true);
      expect(mockRedis.incrbyWithExpire).not.toHaveBeenCalled();
    });
  });

  describe('Custom Tier Limits', () => {
    it('should merge custom limits with defaults', () => {
      const customLimiter = new UserRateLimiter(mockRedis, {
        tierLimits: {
          free: {
            requestsPerMinute: 10,
            requestsPerHour: 100,
            requestsPerDay: 500,
            tokensPerMinute: 5000,
            tokensPerDay: 50000,
            tokensPerMonth: 500000,
            maxConcurrent: 2,
            burstAllowance: 3,
          },
        },
      });

      const limits = customLimiter.getTierLimits('free');
      expect(limits.requestsPerMinute).toBe(10);
      expect(limits.maxConcurrent).toBe(2);
    });
  });
});
