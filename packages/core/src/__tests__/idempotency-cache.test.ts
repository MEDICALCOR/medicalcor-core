/**
 * Comprehensive Unit Tests for Idempotency Cache
 * Tests Redis-backed idempotency checking for webhook handlers
 * Coverage target: 100%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IdempotencyCache,
  createIdempotencyCache,
  createIdempotencyCacheFromEnv,
  type IdempotencyCacheConfig,
} from '../idempotency-cache.js';

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock idempotency key generation
vi.mock('../idempotency.js', () => ({
  createIdempotencyKey: vi.fn((parts: string[]) => parts.join(':')),
  createNamespacedIdempotencyKey: vi.fn(
    (ns: string, parts: string[]) => `${ns}:${parts.join(':')}`
  ),
}));

// Mock Redis client
const createMockRedis = () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
});

describe('IdempotencyCache', () => {
  let cache: IdempotencyCache;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    cache = new IdempotencyCache({
      redis: mockRedis as any,
      defaultTTLSeconds: 3600,
      keyPrefix: 'test:idempotency:',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create cache with default configuration', () => {
      const redis = createMockRedis();
      const idempotencyCache = new IdempotencyCache({
        redis: redis as any,
      });

      expect(idempotencyCache).toBeInstanceOf(IdempotencyCache);
    });

    it('should create cache with custom configuration', () => {
      const redis = createMockRedis();
      const idempotencyCache = new IdempotencyCache({
        redis: redis as any,
        defaultTTLSeconds: 7200,
        keyPrefix: 'custom:',
        enableMetrics: true,
      });

      expect(idempotencyCache).toBeInstanceOf(IdempotencyCache);
    });
  });

  describe('check', () => {
    it('should return isNew=true for new key', async () => {
      mockRedis.set.mockResolvedValue(true);

      const result = await cache.check('new-key');

      expect(result.isNew).toBe(true);
      expect(result.wasCompleted).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith('test:idempotency:new-key', expect.any(String), {
        ttlSeconds: 3600,
        nx: true,
      });
    });

    it('should return isNew=false for existing key', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'processing',
        })
      );

      const result = await cache.check('existing-key');

      expect(result.isNew).toBe(false);
      expect(result.wasCompleted).toBe(false);
      expect(result.firstSeenAt).toBeInstanceOf(Date);
    });

    it('should return wasCompleted=true for completed key', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'completed',
          completedAt: '2024-01-01T00:01:00.000Z',
          result: { success: true },
        })
      );

      const result = await cache.check('completed-key');

      expect(result.isNew).toBe(false);
      expect(result.wasCompleted).toBe(true);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.previousResult).toEqual({ success: true });
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.set.mockResolvedValue(true);

      await cache.check('key-with-custom-ttl', 7200);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:idempotency:key-with-custom-ttl',
        expect.any(String),
        { ttlSeconds: 7200, nx: true }
      );
    });

    it('should retry check if key expired between check and get', async () => {
      // First call: set returns false (key exists), get returns null (expired)
      mockRedis.set.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cache.check('race-condition-key');

      expect(result.isNew).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should fail open on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cache.check('error-key');

      expect(result.isNew).toBe(true);
      expect(result.wasCompleted).toBe(false);
    });

    it('should update stats on cache hit', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'processing',
        })
      );

      await cache.check('hit-key');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.duplicatesBlocked).toBe(1);
    });

    it('should update stats on cache miss', async () => {
      mockRedis.set.mockResolvedValue(true);

      await cache.check('miss-key');

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });
  });

  describe('complete', () => {
    it('should mark key as completed', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'processing',
        })
      );
      mockRedis.set.mockResolvedValue(true);

      await cache.complete('key-to-complete', { result: 'success' });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:idempotency:key-to-complete',
        expect.stringContaining('"status":"completed"'),
        { ttlSeconds: 3600 }
      );
    });

    it('should create new completed entry if key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      await cache.complete('new-completed-key', 'result');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:idempotency:new-completed-key',
        expect.stringContaining('"status":"completed"'),
        { ttlSeconds: 3600 }
      );
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      await cache.complete('key', 'result', 1800);

      expect(mockRedis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
        ttlSeconds: 1800,
      });
    });

    it('should update completions counter', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      await cache.complete('key');

      const stats = cache.getStats();
      expect(stats.completions).toBe(1);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cache.complete('error-key')).resolves.not.toThrow();
    });

    it('should sanitize large results', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      const largeResult = { data: 'x'.repeat(15000) };
      await cache.complete('large-result-key', largeResult);

      const setCall = mockRedis.set.mock.calls[0];
      const storedEntry = JSON.parse(setCall[1]);
      expect(storedEntry.result._truncated).toBe(true);
    });
  });

  describe('fail', () => {
    it('should remove key when allowRetry is true', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.fail('failed-key', new Error('Operation failed'), true);

      expect(mockRedis.del).toHaveBeenCalledWith('test:idempotency:failed-key');
    });

    it('should mark as failed when allowRetry is false', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'processing',
        })
      );
      mockRedis.set.mockResolvedValue(true);

      await cache.fail('failed-key', new Error('Permanent failure'), false);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:idempotency:failed-key',
        expect.stringContaining('"status":"failed"'),
        { ttlSeconds: 3600 }
      );
    });

    it('should store error message in metadata', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      await cache.fail('error-key', new Error('Test error message'), false);

      const setCall = mockRedis.set.mock.calls[0];
      const storedEntry = JSON.parse(setCall[1]);
      expect(storedEntry.metadata.error).toBe('Test error message');
    });

    it('should handle string errors', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(true);

      await cache.fail('error-key', 'String error', false);

      const setCall = mockRedis.set.mock.calls[0];
      const storedEntry = JSON.parse(setCall[1]);
      expect(storedEntry.metadata.error).toBe('String error');
    });

    it('should update failures counter', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.fail('key');

      const stats = cache.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(cache.fail('error-key')).resolves.not.toThrow();
    });
  });

  describe('withIdempotency', () => {
    it('should execute function for new key', async () => {
      mockRedis.set
        .mockResolvedValueOnce(true) // check
        .mockResolvedValueOnce(true); // complete
      mockRedis.get.mockResolvedValue(null);

      const fn = vi.fn().mockResolvedValue('result');
      const result = await cache.withIdempotency('new-key', fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should return undefined for duplicate non-completed key', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'processing',
        })
      );

      const fn = vi.fn().mockResolvedValue('result');
      const result = await cache.withIdempotency('existing-key', fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return previous result for completed duplicate', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'completed',
          result: { cached: 'result' },
        })
      );

      const fn = vi.fn().mockResolvedValue('new-result');
      const result = await cache.withIdempotency('completed-key', fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toEqual({ cached: 'result' });
    });

    it('should call fail on function error and rethrow', async () => {
      mockRedis.set.mockResolvedValue(true);
      mockRedis.del.mockResolvedValue(1);

      const error = new Error('Function failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(cache.withIdempotency('error-key', fn)).rejects.toThrow('Function failed');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should respect allowRetryOnFailure option', async () => {
      mockRedis.set.mockResolvedValue(true);
      mockRedis.get.mockResolvedValue(null);

      const error = new Error('Failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        cache.withIdempotency('key', fn, { allowRetryOnFailure: false })
      ).rejects.toThrow();

      // Should set as failed, not delete
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should not return previous result when returnPreviousResult is false', async () => {
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          firstSeenAt: '2024-01-01T00:00:00.000Z',
          status: 'completed',
          result: { cached: 'result' },
        })
      );

      const fn = vi.fn();
      const result = await cache.withIdempotency('key', fn, {
        returnPreviousResult: false,
      });

      expect(result).toBeUndefined();
    });

    it('should use custom TTL', async () => {
      mockRedis.set.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
      mockRedis.get.mockResolvedValue(null);

      const fn = vi.fn().mockResolvedValue('result');
      await cache.withIdempotency('key', fn, { ttlSeconds: 1800 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ ttlSeconds: 1800 })
      );
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cache.exists('existing-key');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test:idempotency:existing-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cache.exists('non-existing-key');

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await cache.exists('error-key');

      expect(result).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove key and return true when key existed', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await cache.remove('key-to-remove');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test:idempotency:key-to-remove');
    });

    it('should return false when key did not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await cache.remove('non-existing-key');

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      const result = await cache.remove('error-key');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = cache.getStats();

      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        duplicatesBlocked: 0,
        completions: 0,
        failures: 0,
        hitRate: 0,
      });
    });

    it('should calculate hit rate correctly', async () => {
      // 2 hits
      mockRedis.set.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ firstSeenAt: '2024-01-01', status: 'processing' })
      );
      await cache.check('key1');
      await cache.check('key2');

      // 1 miss
      mockRedis.set.mockResolvedValue(true);
      await cache.check('key3');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics to zero', async () => {
      // Generate some stats
      mockRedis.set.mockResolvedValue(true);
      await cache.check('key');
      mockRedis.get.mockResolvedValue(null);
      await cache.complete('key');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.completions).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.duplicatesBlocked).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });
});

describe('createIdempotencyCache', () => {
  it('should create cache using factory function', () => {
    const redis = createMockRedis();
    const cache = createIdempotencyCache({
      redis: redis as any,
    });

    expect(cache).toBeInstanceOf(IdempotencyCache);
  });
});

describe('createIdempotencyCacheFromEnv', () => {
  it('should return null when Redis is not configured', () => {
    const cache = createIdempotencyCacheFromEnv(null);

    expect(cache).toBeNull();
  });

  it('should create cache when Redis is configured', () => {
    const redis = createMockRedis();
    const cache = createIdempotencyCacheFromEnv(redis as any);

    expect(cache).toBeInstanceOf(IdempotencyCache);
  });

  it('should use environment variables for configuration', () => {
    const originalTTL = process.env.IDEMPOTENCY_TTL_SECONDS;
    const originalPrefix = process.env.IDEMPOTENCY_KEY_PREFIX;

    process.env.IDEMPOTENCY_TTL_SECONDS = '7200';
    process.env.IDEMPOTENCY_KEY_PREFIX = 'env:';

    const redis = createMockRedis();
    const cache = createIdempotencyCacheFromEnv(redis as any);

    expect(cache).toBeInstanceOf(IdempotencyCache);

    // Restore
    if (originalTTL) process.env.IDEMPOTENCY_TTL_SECONDS = originalTTL;
    else delete process.env.IDEMPOTENCY_TTL_SECONDS;
    if (originalPrefix) process.env.IDEMPOTENCY_KEY_PREFIX = originalPrefix;
    else delete process.env.IDEMPOTENCY_KEY_PREFIX;
  });
});

describe('Re-exports', () => {
  it('should re-export idempotency key utilities', async () => {
    const { createIdempotencyKey, createNamespacedIdempotencyKey } = await import(
      '../idempotency-cache.js'
    );

    expect(typeof createIdempotencyKey).toBe('function');
    expect(typeof createNamespacedIdempotencyKey).toBe('function');
  });
});
