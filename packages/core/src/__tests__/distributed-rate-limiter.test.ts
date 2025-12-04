/**
 * Distributed Rate Limiter Tests
 * Comprehensive coverage for sliding window rate limiting with Redis
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  DistributedRateLimiter,
  RATE_LIMIT_TIERS,
  createDistributedRateLimiter,
  type RateLimitTier,
  type RateLimitResult,
  type DistributedRateLimiterConfig,
} from '../distributed-rate-limiter.js';

// Mock Redis client
const createMockRedis = () => ({
  eval: vi.fn(),
  zcount: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  quit: vi.fn(),
  isReady: true,
});

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

describe('RATE_LIMIT_TIERS', () => {
  it('should have all expected tiers defined', () => {
    const expectedTiers = ['free', 'pro', 'enterprise', 'webhook', 'api', 'ai'];
    for (const tier of expectedTiers) {
      expect(RATE_LIMIT_TIERS[tier]).toBeDefined();
    }
  });

  it('should have valid tier configurations', () => {
    for (const [name, tier] of Object.entries(RATE_LIMIT_TIERS)) {
      expect(tier.name).toBe(name);
      expect(tier.maxRequests).toBeGreaterThan(0);
      expect(tier.windowSeconds).toBeGreaterThan(0);
      expect(tier.burstAllowance).toBeGreaterThanOrEqual(0);
    }
  });

  it('should have increasing limits from free to enterprise', () => {
    const free = RATE_LIMIT_TIERS.free!;
    const pro = RATE_LIMIT_TIERS.pro!;
    const enterprise = RATE_LIMIT_TIERS.enterprise!;

    expect(free.maxRequests).toBeLessThan(pro.maxRequests);
    expect(pro.maxRequests).toBeLessThan(enterprise.maxRequests);
  });

  it('should have free tier with expected values', () => {
    const free = RATE_LIMIT_TIERS.free!;
    expect(free.maxRequests).toBe(100);
    expect(free.windowSeconds).toBe(60);
    expect(free.burstAllowance).toBe(10);
  });

  it('should have enterprise tier with highest limits', () => {
    const enterprise = RATE_LIMIT_TIERS.enterprise!;
    expect(enterprise.maxRequests).toBe(2000);
    expect(enterprise.burstAllowance).toBe(200);
  });

  it('should have AI tier with lower limits for expensive operations', () => {
    const ai = RATE_LIMIT_TIERS.ai!;
    expect(ai.maxRequests).toBe(30);
    expect(ai.burstAllowance).toBe(5);
  });

  it('should have webhook tier for external webhooks', () => {
    const webhook = RATE_LIMIT_TIERS.webhook!;
    expect(webhook.maxRequests).toBe(60);
    expect(webhook.burstAllowance).toBe(5);
  });
});

describe('DistributedRateLimiter', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    // @ts-expect-error - mock redis for testing
    limiter = new DistributedRateLimiter({
      redis: mockRedis,
      logger: mockLogger,
      defaultTier: 'api',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create limiter with default configuration', () => {
      // @ts-expect-error - mock redis for testing
      const defaultLimiter = new DistributedRateLimiter({ redis: mockRedis });
      expect(defaultLimiter).toBeInstanceOf(DistributedRateLimiter);
    });

    it('should accept custom key prefix', () => {
      // @ts-expect-error - mock redis for testing
      const customLimiter = new DistributedRateLimiter({
        redis: mockRedis,
        keyPrefix: 'custom-prefix',
      });
      expect(customLimiter).toBeInstanceOf(DistributedRateLimiter);
    });

    it('should accept failOpen configuration', () => {
      // @ts-expect-error - mock redis for testing
      const failClosedLimiter = new DistributedRateLimiter({
        redis: mockRedis,
        failOpen: false,
      });
      expect(failClosedLimiter).toBeInstanceOf(DistributedRateLimiter);
    });

    it('should accept circuit breaker configuration', () => {
      // @ts-expect-error - mock redis for testing
      const limiterWithCB = new DistributedRateLimiter({
        redis: mockRedis,
        circuitBreaker: {
          failureThreshold: 10,
          resetTimeoutMs: 60000,
          successThreshold: 5,
        },
      });
      expect(limiterWithCB).toBeInstanceOf(DistributedRateLimiter);
    });
  });

  describe('check', () => {
    it('should allow request when under limit', async () => {
      // Mock Redis Lua script response: [allowed, current, resetAt]
      mockRedis.eval.mockResolvedValueOnce([1, 1, Date.now() + 60000]);

      const result = await limiter.check('user:123', 'api');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.tier).toBe('api');
      expect(result.fallback).toBe(false);
    });

    it('should deny request when over limit', async () => {
      const apiTier = RATE_LIMIT_TIERS.api!;
      const limit = apiTier.maxRequests + (apiTier.burstAllowance ?? 0);

      // Mock response where current equals limit (denied)
      mockRedis.eval.mockResolvedValueOnce([0, limit, Date.now() + 60000]);

      const result = await limiter.check('user:123', 'api');

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(limit);
      expect(result.remaining).toBe(0);
    });

    it('should use default tier when none specified', async () => {
      mockRedis.eval.mockResolvedValueOnce([1, 1, Date.now() + 60000]);

      const result = await limiter.check('user:123');

      expect(result.tier).toBe('api'); // default tier
    });

    it('should accept custom tier configuration', async () => {
      mockRedis.eval.mockResolvedValueOnce([1, 1, Date.now() + 60000]);

      const customTier: RateLimitTier = {
        name: 'custom',
        maxRequests: 50,
        windowSeconds: 30,
        burstAllowance: 5,
      };

      const result = await limiter.check('user:123', customTier);

      expect(result.tier).toBe('custom');
      expect(result.limit).toBe(55); // 50 + 5 burst
    });

    it('should include context in key generation', async () => {
      mockRedis.eval.mockResolvedValueOnce([1, 1, Date.now() + 60000]);

      await limiter.check('user:123', 'api', '/api/endpoint');

      expect(mockRedis.eval).toHaveBeenCalled();
      const [, keys] = mockRedis.eval.mock.calls[0]!;
      expect(keys[0]).toContain('/api/endpoint');
    });

    it('should calculate remaining correctly', async () => {
      const apiTier = RATE_LIMIT_TIERS.api!;
      const limit = apiTier.maxRequests + (apiTier.burstAllowance ?? 0);
      const current = 100;

      mockRedis.eval.mockResolvedValueOnce([1, current, Date.now() + 60000]);

      const result = await limiter.check('user:123', 'api');

      expect(result.remaining).toBe(limit - current);
    });

    it('should calculate resetIn correctly', async () => {
      const resetAt = Date.now() + 30000; // 30 seconds from now
      mockRedis.eval.mockResolvedValueOnce([1, 1, resetAt]);

      const result = await limiter.check('user:123', 'api');

      expect(result.resetIn).toBeGreaterThan(0);
      expect(result.resetIn).toBeLessThanOrEqual(30);
    });

    it('should use fallback when Redis fails', async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await limiter.check('user:123', 'api');

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(true); // fail-open by default
    });

    it('should deny when failOpen is false and Redis fails', async () => {
      // @ts-expect-error - mock redis for testing
      const failClosedLimiter = new DistributedRateLimiter({
        redis: mockRedis,
        failOpen: false,
        logger: mockLogger,
      });

      mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await failClosedLimiter.check('user:123', 'api');

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(false);
    });

    it('should log warning when using fallback', async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));

      await limiter.check('user:123', 'api');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current status without incrementing', async () => {
      mockRedis.zcount.mockResolvedValueOnce(50);

      const result = await limiter.getStatus('user:123', 'api');

      expect(result.current).toBe(50);
      expect(result.allowed).toBe(true);
      expect(mockRedis.zcount).toHaveBeenCalled();
    });

    it('should show not allowed when at limit', async () => {
      const apiTier = RATE_LIMIT_TIERS.api!;
      const limit = apiTier.maxRequests + (apiTier.burstAllowance ?? 0);

      mockRedis.zcount.mockResolvedValueOnce(limit);

      const result = await limiter.getStatus('user:123', 'api');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should include windowStart timestamp', async () => {
      mockRedis.zcount.mockResolvedValueOnce(10);

      const result = await limiter.getStatus('user:123', 'api');

      expect(result.windowStart).toBeDefined();
      expect(result.windowStart).toBeLessThan(Date.now() / 1000);
    });

    it('should return fallback status on Redis error', async () => {
      mockRedis.zcount.mockRejectedValueOnce(new Error('Redis error'));

      const result = await limiter.getStatus('user:123', 'api');

      expect(result.fallback).toBe(true);
      expect(result.current).toBe(0);
      expect(result.allowed).toBe(true);
    });
  });

  describe('reset', () => {
    it('should delete rate limit key from Redis', async () => {
      mockRedis.del.mockResolvedValueOnce(1);

      const result = await limiter.reset('user:123', 'api');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should use default tier when not specified', async () => {
      mockRedis.del.mockResolvedValueOnce(1);

      await limiter.reset('user:123');

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should include context in key when provided', async () => {
      mockRedis.del.mockResolvedValueOnce(1);

      await limiter.reset('user:123', 'api', '/endpoint');

      const [key] = mockRedis.del.mock.calls[0]!;
      expect(key).toContain('/endpoint');
    });

    it('should return false on Redis error', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Redis error'));

      const result = await limiter.reset('user:123', 'api');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getCircuitState', () => {
    it('should return current circuit breaker state', () => {
      const state = limiter.getCircuitState();

      expect(['closed', 'open', 'half-open', 'CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });
  });

  describe('getMetrics', () => {
    it('should return circuit state and stats', () => {
      const metrics = limiter.getMetrics();

      expect(metrics).toHaveProperty('circuitState');
      expect(metrics).toHaveProperty('circuitStats');
      expect(['closed', 'open', 'half-open', 'CLOSED', 'OPEN', 'HALF_OPEN']).toContain(
        metrics.circuitState
      );
    });
  });
});

describe('createDistributedRateLimiter', () => {
  it('should create a DistributedRateLimiter instance', () => {
    const mockRedis = createMockRedis();
    // @ts-expect-error - mock redis for testing
    const limiter = createDistributedRateLimiter({ redis: mockRedis });

    expect(limiter).toBeInstanceOf(DistributedRateLimiter);
  });
});

describe('Rate Limit Tier Resolution', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockRedis.eval.mockResolvedValue([1, 1, Date.now() + 60000]);
    // @ts-expect-error - mock redis for testing
    limiter = new DistributedRateLimiter({ redis: mockRedis, defaultTier: 'api' });
  });

  it('should resolve tier by name', async () => {
    await limiter.check('user:123', 'free');
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('should use default tier for unknown tier name', async () => {
    const result = await limiter.check('user:123', 'unknown-tier');
    // Should fall back to default tier (api)
    expect(result.tier).toBe('api');
  });

  it('should accept tier object directly', async () => {
    const customTier: RateLimitTier = {
      name: 'my-tier',
      maxRequests: 25,
      windowSeconds: 120,
    };

    const result = await limiter.check('user:123', customTier);
    expect(result.tier).toBe('my-tier');
    expect(result.limit).toBe(25);
  });
});

describe('Property-based tests', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    mockRedis = createMockRedis();
    // @ts-expect-error - mock redis for testing
    limiter = new DistributedRateLimiter({ redis: mockRedis });
  });

  it('should always return valid RateLimitResult structure', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (identifier) => {
        const now = Date.now();
        mockRedis.eval.mockResolvedValueOnce([1, 1, now + 60000]);

        const result = await limiter.check(identifier);

        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.current).toBe('number');
        expect(typeof result.limit).toBe('number');
        expect(typeof result.remaining).toBe('number');
        expect(typeof result.resetIn).toBe('number');
        expect(typeof result.resetAt).toBe('number');
        expect(typeof result.tier).toBe('string');
        expect(typeof result.fallback).toBe('boolean');

        return result.remaining >= 0 && result.current >= 0;
      }),
      { numRuns: 20 }
    );
  });

  it('should have remaining = limit - current when under limit', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (current) => {
        const apiTier = RATE_LIMIT_TIERS.api!;
        const limit = apiTier.maxRequests + (apiTier.burstAllowance ?? 0);

        if (current > limit) return true; // Skip invalid cases

        mockRedis.eval.mockResolvedValueOnce([1, current, Date.now() + 60000]);

        const result = await limiter.check('test-user', 'api');

        return result.remaining === Math.max(0, limit - current);
      }),
      { numRuns: 20 }
    );
  });

  it('should never have negative remaining', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1000 }), async (current) => {
        mockRedis.eval.mockResolvedValueOnce([0, current, Date.now() + 60000]);

        const result = await limiter.check('test-user', 'api');

        return result.remaining >= 0;
      }),
      { numRuns: 20 }
    );
  });
});

describe('InMemoryFallback behavior', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    mockRedis = createMockRedis();
    // Always fail Redis to trigger fallback
    mockRedis.eval.mockRejectedValue(new Error('Redis unavailable'));
    // @ts-expect-error - mock redis for testing
    limiter = new DistributedRateLimiter({ redis: mockRedis, failOpen: true });
  });

  it('should track requests in memory when Redis unavailable', async () => {
    const result1 = await limiter.check('user:fallback', 'api');
    expect(result1.fallback).toBe(true);
    expect(result1.allowed).toBe(true);
    expect(result1.current).toBe(1);

    const result2 = await limiter.check('user:fallback', 'api');
    expect(result2.current).toBe(2);
  });

  it('should respect limits in fallback mode', async () => {
    const customTier: RateLimitTier = {
      name: 'test-fallback',
      maxRequests: 3,
      windowSeconds: 60,
      burstAllowance: 0,
    };

    // Make 3 requests (should all be allowed)
    for (let i = 0; i < 3; i++) {
      const result = await limiter.check('user:limited', customTier);
      expect(result.allowed).toBe(true);
    }

    // 4th request should be denied
    const result = await limiter.check('user:limited', customTier);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(4);
  });

  it('should have correct tier name in fallback', async () => {
    const result = await limiter.check('user:tier', 'api');
    expect(result.tier).toBe('fallback');
  });
});
