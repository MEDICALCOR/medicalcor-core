/**
 * Comprehensive tests for lib/resilience.ts
 * Tests Bulkhead, RequestDeduplicator, Graceful Degradation, Adaptive Timeout,
 * Token Bucket Rate Limiter, and Composite Resilience
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Bulkhead,
  BulkheadRejectedError,
  RequestDeduplicator,
  GracefulDegradation,
  AdaptiveTimeout,
  TokenBucketRateLimiter,
  CompositeResilience,
  type BulkheadConfig,
  type DeduplicationConfig,
  type DegradationConfig,
  type AdaptiveTimeoutConfig,
  type RateLimiterConfig,
  type CompositeResilienceConfig,
} from '../lib/resilience.js';
import { ok, err, isErr } from '../lib/result.js';

describe('lib/resilience - Bulkhead', () => {
  let bulkhead: Bulkhead;
  const config: BulkheadConfig = {
    name: 'test-bulkhead',
    maxConcurrent: 2,
    maxQueue: 2,
    queueTimeoutMs: 100,
  };

  beforeEach(() => {
    bulkhead = new Bulkhead(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute operations within capacity', async () => {
      const result = await bulkhead.execute(async () => 42);
      expect(result).toBe(42);
    });

    it('should allow max concurrent operations', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const results: Promise<number>[] = [];

      // Start 2 operations (at capacity)
      results.push(
        bulkhead.execute(async () => {
          await delay(50);
          return 1;
        })
      );
      results.push(
        bulkhead.execute(async () => {
          await delay(50);
          return 2;
        })
      );

      // Should not throw
      await Promise.all([vi.advanceTimersByTimeAsync(50), ...results]);

      const values = await Promise.all(results);
      expect(values).toEqual([1, 2]);
    });

    it('should queue operations when at capacity', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const results: Promise<number>[] = [];

      // Fill capacity
      results.push(
        bulkhead.execute(async () => {
          await delay(100);
          return 1;
        })
      );
      results.push(
        bulkhead.execute(async () => {
          await delay(100);
          return 2;
        })
      );

      // This should queue
      const queuedPromise = bulkhead.execute(async () => 3);
      results.push(queuedPromise);

      // Advance time to complete first operations
      await vi.advanceTimersByTimeAsync(100);

      // Wait for all to complete
      const values = await Promise.all(results);
      expect(values).toContain(3);
    });

    it('should reject when queue is full', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity (2) and queue (2)
      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(
          bulkhead.execute(async () => {
            await delay(200);
            return i;
          })
        );
      }

      // This should be rejected
      await expect(bulkhead.execute(async () => 999)).rejects.toThrow(BulkheadRejectedError);
    });

    it('should timeout queued operations', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity
      bulkhead.execute(async () => {
        await delay(200);
        return 1;
      });
      bulkhead.execute(async () => {
        await delay(200);
        return 2;
      });

      // Queue with timeout
      const queuedPromise = bulkhead.execute(async () => 3);

      // Advance past queue timeout
      vi.advanceTimersByTime(150);

      await expect(queuedPromise).rejects.toThrow(BulkheadRejectedError);
    });
  });

  describe('tryExecute', () => {
    it('should execute if capacity available', async () => {
      const result = await bulkhead.tryExecute(async () => 42);
      expect(result).toBe(42);
    });

    it('should return null if no capacity', async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity
      bulkhead.execute(async () => {
        await delay(100);
        return 1;
      });
      bulkhead.execute(async () => {
        await delay(100);
        return 2;
      });

      const result = await bulkhead.tryExecute(async () => 42);
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return bulkhead statistics', () => {
      const stats = bulkhead.getStats();
      expect(stats.name).toBe('test-bulkhead');
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.currentActive).toBe(0);
      expect(stats.currentQueued).toBe(0);
    });
  });

  describe('hasCapacity', () => {
    it('should return true when capacity available', () => {
      expect(bulkhead.hasCapacity()).toBe(true);
    });
  });

  describe('hasQueueSpace', () => {
    it('should return true when queue has space', () => {
      expect(bulkhead.hasQueueSpace()).toBe(true);
    });
  });
});

describe('lib/resilience - RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator<number>;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator({ ttlMs: 1000, maxSize: 10 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    deduplicator.destroy();
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute operation on cache miss', async () => {
      const operation = vi.fn(async () => 42);
      const result = await deduplicator.execute('key1', operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should reuse in-flight request', async () => {
      const operation = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 42;
      });

      // Start two concurrent requests with same key
      const promise1 = deduplicator.execute('key1', operation);
      const promise2 = deduplicator.execute('key1', operation);

      vi.advanceTimersByTime(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should cache successful results', async () => {
      const operation = vi.fn(async () => 42);

      // First call
      await deduplicator.execute('key1', operation);

      // Second call within TTL
      vi.advanceTimersByTime(500);
      const result = await deduplicator.execute('key1', operation);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1); // Cached, not called again
    });

    it('should expire cache after TTL', async () => {
      const operation = vi.fn(async () => 42);

      await deduplicator.execute('key1', operation);

      // Advance past TTL
      vi.advanceTimersByTime(1100);

      await deduplicator.execute('key1', operation);

      expect(operation).toHaveBeenCalledTimes(2); // Cache expired, called again
    });

    it('should not cache failed operations', async () => {
      const operation = vi.fn(async () => {
        throw new Error('operation failed');
      });

      await expect(deduplicator.execute('key1', operation)).rejects.toThrow();
      await expect(deduplicator.execute('key1', operation)).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(2); // Not cached
    });

    it('should enforce max size', async () => {
      const smallDedup = new RequestDeduplicator<number>({ ttlMs: 10000, maxSize: 2 });

      await smallDedup.execute('key1', async () => 1);
      await smallDedup.execute('key2', async () => 2);

      // This should evict the oldest (key1)
      await smallDedup.execute('key3', async () => 3);

      const stats = smallDedup.getStats();
      expect(stats.size).toBeLessThanOrEqual(2);

      smallDedup.destroy();
    });
  });

  describe('generateKey', () => {
    it('should generate key with prefix', () => {
      const key = deduplicator.generateKey('operation', 'arg1', 'arg2');
      expect(key).toContain('operation:');
    });

    it('should use custom key generator', () => {
      const customDedup = new RequestDeduplicator<number>({
        ttlMs: 1000,
        keyGenerator: (args) => args.join('-'),
      });

      const key = customDedup.generateKey('op', 'a', 'b');
      expect(key).toBe('op:a-b');

      customDedup.destroy();
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific key', async () => {
      const operation = vi.fn(async () => 42);
      await deduplicator.execute('key1', operation);

      const result = deduplicator.invalidate('key1');
      expect(result).toBe(true);

      await deduplicator.execute('key1', operation);
      expect(operation).toHaveBeenCalledTimes(2); // Called again after invalidation
    });

    it('should return false for non-existent key', () => {
      const result = deduplicator.invalidate('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('invalidatePrefix', () => {
    it('should invalidate all keys with prefix', async () => {
      await deduplicator.execute('user:1', async () => 1);
      await deduplicator.execute('user:2', async () => 2);
      await deduplicator.execute('post:1', async () => 3);

      const count = deduplicator.invalidatePrefix('user:');
      expect(count).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await deduplicator.execute('key1', async () => 1);
      await deduplicator.execute('key2', async () => 2);

      deduplicator.clear();

      const stats = deduplicator.getStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('lib/resilience - GracefulDegradation', () => {
  describe('execute', () => {
    it('should use normal operation when successful', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('normal');
    });

    it('should fall back to degraded on normal failure', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('normal failed');
        },
        degraded: async () => 'degraded',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded');
    });

    it('should fall back through multiple levels', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('normal failed');
        },
        degraded: async () => {
          throw new Error('degraded failed');
        },
        minimal: async () => 'minimal',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('minimal');
    });

    it('should return error when all levels fail', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('failed');
        },
      });

      const result = await degradation.execute();
      expect(isErr(result)).toBe(true);
    });
  });

  describe('getCurrentLevel', () => {
    it('should start at normal level', () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
      });

      expect(degradation.getCurrentLevel()).toBe('normal');
    });
  });

  describe('setLevel', () => {
    it('should force specific degradation level', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
      });

      degradation.setLevel('degraded');
      const result = await degradation.execute();

      expect(result.value).toBe('degraded');
    });
  });

  describe('reset', () => {
    it('should reset to normal level', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
      });

      degradation.setLevel('degraded');
      degradation.reset();

      expect(degradation.getCurrentLevel()).toBe('normal');
    });
  });
});

describe('lib/resilience - AdaptiveTimeout', () => {
  let adaptiveTimeout: AdaptiveTimeout;

  beforeEach(() => {
    adaptiveTimeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute operation within timeout', async () => {
      const result = await adaptiveTimeout.execute(async () => 42);
      expect(result).toBe(42);
    });

    it('should timeout slow operations', async () => {
      const slowOp = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return 42;
      };

      const promise = adaptiveTimeout.execute(slowOp);

      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow(/timeout/i);
    });

    it('should adjust timeout based on response times', async () => {
      // Execute fast operations
      for (let i = 0; i < 5; i++) {
        const promise = adaptiveTimeout.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return i;
        });
        await vi.advanceTimersByTimeAsync(100);
        await promise;
      }

      const stats = adaptiveTimeout.getStats();
      expect(stats.successCount).toBe(5);
      expect(stats.currentTimeoutMs).toBeLessThan(5000); // Adjusted down
    });
  });

  describe('getCurrentTimeout', () => {
    it('should return current timeout value', () => {
      const timeout = adaptiveTimeout.getCurrentTimeout();
      expect(timeout).toBe(5000);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = adaptiveTimeout.getStats();
      expect(stats.currentTimeoutMs).toBe(5000);
      expect(stats.successCount).toBe(0);
      expect(stats.timeoutCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      // Execute some operations
      await adaptiveTimeout.execute(async () => 42);

      adaptiveTimeout.reset();

      const stats = adaptiveTimeout.getStats();
      expect(stats.successCount).toBe(0);
      expect(stats.currentTimeoutMs).toBe(5000);
    });
  });
});

describe('lib/resilience - TokenBucketRateLimiter', () => {
  let rateLimiter: TokenBucketRateLimiter;
  const config: RateLimiterConfig = {
    name: 'test-limiter',
    maxTokens: 10,
    refillRate: 2, // 2 tokens per second
  };

  beforeEach(() => {
    rateLimiter = new TokenBucketRateLimiter(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tryAcquire', () => {
    it('should acquire tokens when available', () => {
      const result = rateLimiter.tryAcquire(5);
      expect(result).toBe(true);
    });

    it('should reject when insufficient tokens', () => {
      rateLimiter.tryAcquire(10); // Use all tokens
      const result = rateLimiter.tryAcquire(1);
      expect(result).toBe(false);
    });

    it('should refill tokens over time', () => {
      rateLimiter.tryAcquire(10); // Use all tokens
      expect(rateLimiter.tryAcquire(1)).toBe(false);

      // Advance time to refill 2 tokens
      vi.advanceTimersByTime(1000);

      expect(rateLimiter.tryAcquire(2)).toBe(true);
    });

    it('should not exceed max tokens', () => {
      // Start with full bucket
      vi.advanceTimersByTime(10000); // Wait a long time

      const tokens = rateLimiter.getAvailableTokens();
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe('acquire', () => {
    it('should wait until tokens are available', async () => {
      rateLimiter.tryAcquire(10); // Use all tokens

      const promise = rateLimiter.acquire(2);

      vi.advanceTimersByTime(1000); // Refill 2 tokens

      await promise; // Should complete now
      expect(rateLimiter.getAvailableTokens()).toBeLessThan(2);
    });
  });

  describe('execute', () => {
    it('should execute operation with rate limiting', async () => {
      const operation = vi.fn(async () => 42);
      const result = await rateLimiter.execute(operation, 1);

      expect(result).toBe(42);
      expect(operation).toHaveBeenCalled();
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current token count', () => {
      const tokens = rateLimiter.getAvailableTokens();
      expect(tokens).toBe(10);
    });

    it('should reflect token consumption', () => {
      rateLimiter.tryAcquire(5);
      const tokens = rateLimiter.getAvailableTokens();
      expect(tokens).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset to full capacity', () => {
      rateLimiter.tryAcquire(10);
      rateLimiter.reset();

      const tokens = rateLimiter.getAvailableTokens();
      expect(tokens).toBe(10);
    });
  });
});

describe('lib/resilience - CompositeResilience', () => {
  let composite: CompositeResilience;
  const config: CompositeResilienceConfig = {
    name: 'test-composite',
    bulkhead: {
      name: 'test',
      maxConcurrent: 2,
      maxQueue: 2,
      queueTimeoutMs: 1000,
    },
    rateLimiter: {
      name: 'test',
      maxTokens: 10,
      refillRate: 5,
    },
    deduplication: {
      ttlMs: 1000,
      maxSize: 100,
    },
    adaptiveTimeout: {
      initialTimeoutMs: 5000,
    },
  };

  beforeEach(() => {
    composite = new CompositeResilience(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    composite.destroy();
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute operation with all resilience patterns', async () => {
      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);
    });

    it('should deduplicate concurrent requests', async () => {
      const operation = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 42;
      });

      const promise1 = composite.execute('key1', operation);
      const promise2 = composite.execute('key1', operation);

      await vi.advanceTimersByTimeAsync(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(operation).toHaveBeenCalledTimes(1); // Deduplicated
    }, 15000);

    it('should skip deduplication when requested', async () => {
      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation, { skipDedup: true });
      await composite.execute('key1', operation, { skipDedup: true });

      expect(operation).toHaveBeenCalledTimes(2); // Not deduplicated
    });

    it('should skip rate limiting when requested', async () => {
      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation, { skipRateLimit: true });

      // Rate limiter should not have consumed tokens
      const stats = composite.getStats();
      expect(stats.rateLimiter?.availableTokens).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return combined statistics', () => {
      const stats = composite.getStats();

      expect(stats.bulkhead).toBeDefined();
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.deduplicator).toBeDefined();
      expect(stats.adaptiveTimeout).toBeDefined();
    });

    it('should return partial stats when components not configured', () => {
      const minimalComposite = new CompositeResilience({ name: 'minimal' });
      const stats = minimalComposite.getStats();

      expect(stats.bulkhead).toBeUndefined();
      expect(stats.rateLimiter).toBeUndefined();

      minimalComposite.destroy();
    });
  });

  describe('invalidateDedup', () => {
    it('should invalidate deduplication cache', async () => {
      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation);
      composite.invalidateDedup('key1');
      await composite.execute('key1', operation);

      expect(operation).toHaveBeenCalledTimes(2); // Called again after invalidation
    });

    it('should return false when deduplicator not configured', () => {
      const minimalComposite = new CompositeResilience({ name: 'minimal' });
      const result = minimalComposite.invalidateDedup('key1');

      expect(result).toBe(false);

      minimalComposite.destroy();
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', () => {
      composite.destroy();
      // Should not throw
    });
  });
});

describe('lib/resilience - Integration Tests', () => {
  it('should handle real-world scenario with all patterns', async () => {
    const composite = new CompositeResilience({
      name: 'integration-test',
      bulkhead: {
        name: 'test',
        maxConcurrent: 10,
        maxQueue: 20,
        queueTimeoutMs: 5000,
      },
      rateLimiter: {
        name: 'test',
        maxTokens: 100,
        refillRate: 20,
      },
      deduplication: {
        ttlMs: 5000,
        maxSize: 1000,
      },
      adaptiveTimeout: {
        initialTimeoutMs: 10000,
      },
    });

    const operation = vi.fn(async (value: number) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value * 2;
    });

    vi.useFakeTimers();

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(composite.execute(`op:${i}`, () => operation(i)));
    }

    await vi.advanceTimersByTimeAsync(100);

    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    expect(operation).toHaveBeenCalledTimes(10);

    composite.destroy();
    vi.useRealTimers();
  });
});
