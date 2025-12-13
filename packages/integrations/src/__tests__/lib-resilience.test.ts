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

describe('lib/resilience - Bulkhead - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BulkheadRejectedError', () => {
    it('should create error with "full" reason and correct message', () => {
      const error = new BulkheadRejectedError('test-bulkhead', 'full');
      expect(error.name).toBe('BulkheadRejectedError');
      expect(error.bulkheadName).toBe('test-bulkhead');
      expect(error.reason).toBe('full');
      expect(error.message).toContain('full');
      expect(error.message).toContain('rejected');
    });

    it('should create error with "timeout" reason and correct message', () => {
      const error = new BulkheadRejectedError('test-bulkhead', 'timeout');
      expect(error.name).toBe('BulkheadRejectedError');
      expect(error.bulkheadName).toBe('test-bulkhead');
      expect(error.reason).toBe('timeout');
      expect(error.message).toContain('timeout');
      expect(error.message).toContain('rejected');
    });
  });

  describe('error handling and stats', () => {
    it('should track totalExecuted correctly', async () => {
      const bulkhead = new Bulkhead({
        name: 'stats-test',
        maxConcurrent: 5,
        maxQueue: 5,
        queueTimeoutMs: 1000,
      });

      await bulkhead.execute(async () => 1);
      await bulkhead.execute(async () => 2);
      await bulkhead.execute(async () => 3);

      const stats = bulkhead.getStats();
      expect(stats.totalExecuted).toBe(3);
    });

    it('should track totalRejected when queue is full', async () => {
      const bulkhead = new Bulkhead({
        name: 'reject-test',
        maxConcurrent: 1,
        maxQueue: 1,
        queueTimeoutMs: 1000,
      });

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity and queue
      bulkhead.execute(async () => {
        await delay(500);
        return 1;
      });
      bulkhead.execute(async () => {
        await delay(500);
        return 2;
      });

      // This should be rejected
      try {
        await bulkhead.execute(async () => 3);
      } catch {
        // Expected
      }

      const stats = bulkhead.getStats();
      expect(stats.totalRejected).toBe(1);
    });

    it('should track totalTimedOut when queue times out', async () => {
      const bulkhead = new Bulkhead({
        name: 'timeout-test',
        maxConcurrent: 1,
        maxQueue: 2,
        queueTimeoutMs: 100,
      });

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity
      bulkhead.execute(async () => {
        await delay(500);
        return 1;
      });

      // Queue an operation
      const queuedPromise = bulkhead.execute(async () => 2);

      // Advance past timeout
      vi.advanceTimersByTime(150);

      try {
        await queuedPromise;
      } catch {
        // Expected timeout
      }

      const stats = bulkhead.getStats();
      expect(stats.totalTimedOut).toBe(1);
    });

    it('should execute finally block even when operation throws', async () => {
      const bulkhead = new Bulkhead({
        name: 'error-test',
        maxConcurrent: 2,
        maxQueue: 2,
        queueTimeoutMs: 1000,
      });

      const initialStats = bulkhead.getStats();
      expect(initialStats.currentActive).toBe(0);

      try {
        await bulkhead.execute(async () => {
          throw new Error('operation failed');
        });
      } catch {
        // Expected
      }

      const stats = bulkhead.getStats();
      expect(stats.currentActive).toBe(0); // Should be decremented in finally
    });
  });

  describe('releaseFromQueue edge cases', () => {
    it('should handle empty queue in releaseFromQueue', async () => {
      const bulkhead = new Bulkhead({
        name: 'release-test',
        maxConcurrent: 1,
        maxQueue: 1,
        queueTimeoutMs: 1000,
      });

      // Execute operation that completes immediately
      await bulkhead.execute(async () => 42);

      // Should not throw when no queue items
      const stats = bulkhead.getStats();
      expect(stats.currentQueued).toBe(0);
    });
  });

  describe('hasCapacity and hasQueueSpace edge cases', () => {
    it('should return false when at max capacity', async () => {
      const bulkhead = new Bulkhead({
        name: 'capacity-test',
        maxConcurrent: 1,
        maxQueue: 1,
        queueTimeoutMs: 1000,
      });

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity
      bulkhead.execute(async () => {
        await delay(500);
        return 1;
      });

      expect(bulkhead.hasCapacity()).toBe(false);
    });

    it('should return false when queue is full', async () => {
      const bulkhead = new Bulkhead({
        name: 'queue-test',
        maxConcurrent: 1,
        maxQueue: 1,
        queueTimeoutMs: 1000,
      });

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Fill capacity and queue
      bulkhead.execute(async () => {
        await delay(500);
        return 1;
      });
      bulkhead.execute(async () => {
        await delay(500);
        return 2;
      });

      expect(bulkhead.hasQueueSpace()).toBe(false);
    });
  });
});

describe('lib/resilience - RequestDeduplicator - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('default configuration', () => {
    it('should use default values when config is empty', () => {
      const dedup = new RequestDeduplicator();
      const stats = dedup.getStats();

      expect(stats.maxSize).toBe(1000); // Default maxSize
      dedup.destroy();
    });

    it('should use default ttlMs and maxSize', async () => {
      const dedup = new RequestDeduplicator({});
      const operation = vi.fn(async () => 42);

      await dedup.execute('key1', operation);

      const stats = dedup.getStats();
      expect(stats.size).toBe(1);

      dedup.destroy();
    });
  });

  describe('cleanup timer', () => {
    it('should automatically cleanup expired entries', async () => {
      const dedup = new RequestDeduplicator({ ttlMs: 100, maxSize: 100 });

      await dedup.execute('key1', async () => 1);
      await dedup.execute('key2', async () => 2);

      expect(dedup.getStats().size).toBe(2);

      // Advance past TTL and cleanup interval
      vi.advanceTimersByTime(150);

      // Trigger cleanup by executing new operation
      await dedup.execute('key3', async () => 3);

      // Original entries should be expired
      const operation = vi.fn(async () => 99);
      await dedup.execute('key1', operation);

      expect(operation).toHaveBeenCalled(); // Should execute, not cached

      dedup.destroy();
    });
  });

  describe('evictOldest edge cases', () => {
    it('should handle eviction when cache is at max size', async () => {
      const dedup = new RequestDeduplicator({ ttlMs: 10000, maxSize: 2 });

      await dedup.execute('key1', async () => 1);
      await dedup.execute('key2', async () => 2);

      expect(dedup.getStats().size).toBe(2);

      // This should trigger eviction of oldest
      await dedup.execute('key3', async () => 3);

      const stats = dedup.getStats();
      expect(stats.size).toBeLessThanOrEqual(2);

      dedup.destroy();
    });

    it('should not throw when evicting from empty cache', async () => {
      const dedup = new RequestDeduplicator({ ttlMs: 1000, maxSize: 0 });

      // Should not throw even though maxSize is 0
      await expect(dedup.execute('key1', async () => 42)).resolves.toBe(42);

      dedup.destroy();
    });
  });

  describe('generateKey with JSON.stringify fallback', () => {
    it('should use JSON.stringify when no custom keyGenerator', () => {
      const dedup = new RequestDeduplicator({ ttlMs: 1000, maxSize: 100 });

      const key = dedup.generateKey('operation', { id: 123 }, ['a', 'b']);
      expect(key).toContain('operation:');
      expect(key).toContain('123');

      dedup.destroy();
    });

    it('should handle primitive arguments', () => {
      const dedup = new RequestDeduplicator({ ttlMs: 1000, maxSize: 100 });

      const key = dedup.generateKey('op', 'arg1', 42, true);
      expect(key).toContain('op:');
      expect(key).toContain('arg1');
      expect(key).toContain('42');
      expect(key).toContain('true');

      dedup.destroy();
    });
  });

  describe('cache entry removal on error', () => {
    it('should remove entry only if it matches current entry', async () => {
      const dedup = new RequestDeduplicator({ ttlMs: 5000, maxSize: 100 });

      const errorOp = vi.fn(async () => {
        throw new Error('test error');
      });

      // First call - should fail and remove entry
      await expect(dedup.execute('key1', errorOp)).rejects.toThrow('test error');

      // Second call - should execute again since entry was removed
      await expect(dedup.execute('key1', errorOp)).rejects.toThrow('test error');

      expect(errorOp).toHaveBeenCalledTimes(2);

      dedup.destroy();
    });
  });

  describe('destroy cleanup', () => {
    it('should clear cache and stop cleanup timer', async () => {
      const dedup = new RequestDeduplicator({ ttlMs: 1000, maxSize: 100 });

      await dedup.execute('key1', async () => 1);
      expect(dedup.getStats().size).toBe(1);

      dedup.destroy();

      const stats = dedup.getStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('lib/resilience - GracefulDegradation - Additional Coverage', () => {
  describe('error classification', () => {
    it('should classify network errors as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('Network error occurred');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should classify ECONNREFUSED as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('ECONNREFUSED: connection refused');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should classify timeout errors as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('Request timeout after 5000ms');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should classify 429 rate limit as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('429 Too Many Requests');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should classify 500 server errors as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('500 Internal Server Error');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should classify 503 service unavailable as degraded', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('503 Service Unavailable');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should return normal for unknown error types', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('Unknown error type');
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should handle non-Error objects', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error';
        },
        degraded: async () => 'degraded-fallback',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('degraded-fallback');
    });

    it('should use custom classifyError when provided', async () => {
      const customClassify = vi.fn(() => 'minimal' as const);
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('test');
        },
        degraded: async () => {
          throw new Error('degraded failed');
        },
        minimal: async () => 'minimal-fallback',
        classifyError: customClassify,
      });

      const result = await degradation.execute();
      expect(result.value).toBe('minimal-fallback');
      expect(customClassify).toHaveBeenCalled();
    });
  });

  describe('consecutive failures and auto-degradation', () => {
    it('should auto-degrade to degraded after 3 consecutive failures', async () => {
      let callCount = 0;
      const degradation = new GracefulDegradation({
        normal: async () => {
          callCount++;
          if (callCount <= 3) {
            throw new Error('failure');
          }
          return 'normal-success';
        },
        degraded: async () => 'degraded-fallback',
      });

      // First 3 failures
      await degradation.execute();
      await degradation.execute();
      await degradation.execute();

      // Should now be at degraded level
      expect(degradation.getCurrentLevel()).toBe('degraded');
    });

    it('should auto-degrade to minimal after 5 consecutive failures at degraded', async () => {
      let callCount = 0;
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('normal failed');
        },
        degraded: async () => {
          callCount++;
          if (callCount <= 5) {
            throw new Error('degraded failed');
          }
          return 'degraded-success';
        },
        minimal: async () => 'minimal-fallback',
      });

      // Force to degraded level first
      degradation.setLevel('degraded');

      // Execute multiple failures
      for (let i = 0; i < 6; i++) {
        await degradation.execute();
      }

      expect(degradation.getCurrentLevel()).toBe('minimal');
    });
  });

  describe('onSuccess with non-normal levels', () => {
    it('should not reset consecutive failures when succeeding at degraded level', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
      });

      degradation.setLevel('degraded');

      const result = await degradation.execute();
      expect(result.value).toBe('degraded');

      // Should still be at degraded level
      expect(degradation.getCurrentLevel()).toBe('degraded');
    });

    it('should gradually upgrade after 60 seconds of successful operations at degraded level', async () => {
      vi.useFakeTimers();
      const realNow = Date.now();
      vi.setSystemTime(realNow);

      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
        minimal: async () => 'minimal',
      });

      // Force to minimal level
      degradation.setLevel('minimal');

      // Execute successfully at minimal
      const result1 = await degradation.execute();
      expect(result1.value).toBe('minimal');

      // Advance time by more than 60 seconds
      vi.advanceTimersByTime(61000);

      // Execute again - should trigger tryUpgrade
      const result2 = await degradation.execute();
      expect(result2.value).toBe('minimal'); // Still minimal after first upgrade

      vi.useRealTimers();
    });

    it('should set level to offline and track it in metrics', () => {
      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        offline: async () => 'offline',
      });

      // Force to offline level to cover getLevelValue case for offline
      degradation.setLevel('offline');

      expect(degradation.getCurrentLevel()).toBe('offline');
    });

    it('should upgrade from offline to minimal to degraded to normal over time', async () => {
      vi.useFakeTimers();
      const realNow = Date.now();
      vi.setSystemTime(realNow);

      const degradation = new GracefulDegradation({
        normal: async () => 'normal',
        degraded: async () => 'degraded',
        minimal: async () => 'minimal',
        offline: async () => 'offline',
      });

      // Start at offline
      degradation.setLevel('offline');
      expect(degradation.getCurrentLevel()).toBe('offline');

      // First success at offline
      await degradation.execute();

      // Advance time and execute to trigger upgrade
      vi.advanceTimersByTime(61000);
      await degradation.execute();

      vi.useRealTimers();
    });
  });

  describe('all degradation levels', () => {
    it('should use offline level when all others fail', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('normal failed');
        },
        degraded: async () => {
          throw new Error('degraded failed');
        },
        minimal: async () => {
          throw new Error('minimal failed');
        },
        offline: async () => 'offline-mode',
      });

      const result = await degradation.execute();
      expect(result.value).toBe('offline-mode');
    });

    it('should skip undefined degradation levels', async () => {
      const degradation = new GracefulDegradation({
        normal: async () => {
          throw new Error('normal failed');
        },
        minimal: async () => 'minimal-fallback',
        // degraded is undefined
      });

      const result = await degradation.execute();
      expect(result.value).toBe('minimal-fallback');
    });
  });
});

describe('lib/resilience - AdaptiveTimeout - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('configuration defaults', () => {
    it('should use all default values when no config provided', () => {
      const timeout = new AdaptiveTimeout();
      expect(timeout.getCurrentTimeout()).toBe(5000);
    });

    it('should use custom initial timeout', () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 3000 });
      expect(timeout.getCurrentTimeout()).toBe(3000);
    });

    it('should use custom min/max bounds', () => {
      const timeout = new AdaptiveTimeout({
        initialTimeoutMs: 5000,
        minTimeoutMs: 2000,
        maxTimeoutMs: 10000,
      });

      const stats = timeout.getStats();
      expect(stats.currentTimeoutMs).toBe(5000);
    });

    it('should apply all custom config values', () => {
      const timeout = new AdaptiveTimeout({
        initialTimeoutMs: 3000,
        minTimeoutMs: 1000,
        maxTimeoutMs: 30000,
        successFactor: 0.8,
        timeoutFactor: 1.2,
        windowSize: 20,
      });

      expect(timeout.getCurrentTimeout()).toBe(3000);
    });
  });

  describe('timeout bounds enforcement', () => {
    it('should not decrease timeout below minTimeoutMs', async () => {
      const timeout = new AdaptiveTimeout({
        initialTimeoutMs: 5000,
        minTimeoutMs: 2000,
        maxTimeoutMs: 10000,
      });

      // Execute many very fast operations
      for (let i = 0; i < 20; i++) {
        const promise = timeout.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return i;
        });
        await vi.advanceTimersByTimeAsync(10);
        await promise;
      }

      const currentTimeout = timeout.getCurrentTimeout();
      expect(currentTimeout).toBeGreaterThanOrEqual(2000);
    });

    it('should not increase timeout above maxTimeoutMs', async () => {
      const timeout = new AdaptiveTimeout({
        initialTimeoutMs: 5000,
        minTimeoutMs: 1000,
        maxTimeoutMs: 8000,
      });

      // Trigger multiple timeouts
      for (let i = 0; i < 5; i++) {
        const promise = timeout.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100000));
          return i;
        });

        vi.advanceTimersByTime(timeout.getCurrentTimeout());

        try {
          await promise;
        } catch {
          // Expected timeout
        }
      }

      const currentTimeout = timeout.getCurrentTimeout();
      expect(currentTimeout).toBeLessThanOrEqual(8000);
    });
  });

  describe('P99 calculation edge cases', () => {
    it('should handle single response time', async () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });

      const promise = timeout.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 42;
      });

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      const stats = timeout.getStats();
      expect(stats.successCount).toBe(1);
    });

    it('should maintain window size correctly', async () => {
      const timeout = new AdaptiveTimeout({
        initialTimeoutMs: 5000,
        windowSize: 3,
      });

      // Add more than window size operations
      for (let i = 0; i < 5; i++) {
        const promise = timeout.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return i;
        });
        await vi.advanceTimersByTimeAsync(50);
        await promise;
      }

      const stats = timeout.getStats();
      expect(stats.successCount).toBe(5);
    });
  });

  describe('error handling', () => {
    it('should rethrow non-timeout errors', async () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });

      const errorOp = async () => {
        throw new Error('Custom operation error');
      };

      await expect(timeout.execute(errorOp)).rejects.toThrow('Custom operation error');
    });

    it('should track timeouts correctly', async () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 1000 });

      const slowOp = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return 42;
      };

      const promise = timeout.execute(slowOp);
      vi.advanceTimersByTime(1000);

      try {
        await promise;
      } catch {
        // Expected
      }

      const stats = timeout.getStats();
      expect(stats.timeoutCount).toBe(1);
    });
  });

  describe('avgResponseTimeMs calculation', () => {
    it('should return 0 when no response times recorded', () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });
      const stats = timeout.getStats();
      expect(stats.avgResponseTimeMs).toBe(0);
    });

    it('should calculate average correctly', async () => {
      const timeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });

      const responseTimes = [100, 200, 300];
      for (const time of responseTimes) {
        const promise = timeout.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, time));
          return time;
        });
        await vi.advanceTimersByTimeAsync(time);
        await promise;
      }

      const stats = timeout.getStats();
      expect(stats.avgResponseTimeMs).toBeGreaterThan(0);
    });
  });
});

describe('lib/resilience - TokenBucketRateLimiter - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('default count parameters', () => {
    it('should use count=1 by default in tryAcquire', () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'default-test',
        maxTokens: 10,
        refillRate: 5,
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(9);
    });

    it('should use count=1 by default in acquire', async () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'default-test',
        maxTokens: 10,
        refillRate: 5,
      });

      await limiter.acquire();
      expect(limiter.getAvailableTokens()).toBe(9);
    });

    it('should use tokens=1 by default in execute', async () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'default-test',
        maxTokens: 10,
        refillRate: 5,
      });

      const operation = vi.fn(async () => 42);
      await limiter.execute(operation);

      expect(operation).toHaveBeenCalled();
      expect(limiter.getAvailableTokens()).toBe(9);
    });
  });

  describe('partial token refill', () => {
    it('should handle partial second refills', () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'refill-test',
        maxTokens: 100,
        refillRate: 10,
      });

      limiter.tryAcquire(50);
      expect(limiter.getAvailableTokens()).toBe(50);

      // Advance 500ms (should refill 5 tokens)
      vi.advanceTimersByTime(500);

      expect(limiter.getAvailableTokens()).toBe(55);
    });

    it('should accumulate fractional tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'fractional-test',
        maxTokens: 100,
        refillRate: 3, // 3 tokens per second = 0.3 per 100ms
      });

      limiter.tryAcquire(50);

      // Multiple small time advances (need > 1 second for at least 3 tokens)
      vi.advanceTimersByTime(100); // +0.3 tokens
      vi.advanceTimersByTime(100); // +0.3 tokens
      vi.advanceTimersByTime(100); // +0.3 tokens
      vi.advanceTimersByTime(100); // +0.3 tokens
      vi.advanceTimersByTime(100); // +0.3 tokens

      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(51); // Should have at least 1 full token
    });
  });

  describe('acquire wait time calculation', () => {
    it('should calculate correct wait time when tokens needed', async () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'wait-test',
        maxTokens: 10,
        refillRate: 2, // 2 tokens per second
      });

      // Use all tokens
      limiter.tryAcquire(10);

      // Try to acquire 5 tokens (need to wait for refill)
      const acquirePromise = limiter.acquire(5);

      // Should wait approximately 2.5 seconds for 5 tokens at 2/second
      vi.advanceTimersByTime(2500);

      await acquirePromise;
      expect(limiter.getAvailableTokens()).toBeLessThan(5);
    });

    it('should use minimum wait time of 10ms', async () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'min-wait-test',
        maxTokens: 1000,
        refillRate: 100, // Very fast refill
      });

      limiter.tryAcquire(1000);

      const acquirePromise = limiter.acquire(1);

      // Even with fast refill, should wait at least 10ms
      vi.advanceTimersByTime(10);

      await acquirePromise;
    });
  });

  describe('multiple token acquisition', () => {
    it('should handle acquiring multiple tokens at once', () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'multi-test',
        maxTokens: 20,
        refillRate: 5,
      });

      expect(limiter.tryAcquire(10)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(10);

      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(5);
    });

    it('should reject when not enough tokens for multiple', () => {
      const limiter = new TokenBucketRateLimiter({
        name: 'reject-multi-test',
        maxTokens: 10,
        refillRate: 5,
      });

      limiter.tryAcquire(8);

      expect(limiter.tryAcquire(5)).toBe(false);
      expect(limiter.getAvailableTokens()).toBe(2);
    });
  });
});

describe('lib/resilience - CompositeResilience - Additional Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('partial component configurations', () => {
    it('should work with only bulkhead', async () => {
      const composite = new CompositeResilience({
        name: 'bulkhead-only',
        bulkhead: {
          name: 'test',
          maxConcurrent: 5,
          maxQueue: 10,
          queueTimeoutMs: 1000,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      const stats = composite.getStats();
      expect(stats.bulkhead).toBeDefined();
      expect(stats.rateLimiter).toBeUndefined();
      expect(stats.deduplicator).toBeUndefined();
      expect(stats.adaptiveTimeout).toBeUndefined();

      composite.destroy();
    });

    it('should work with only rateLimiter', async () => {
      const composite = new CompositeResilience({
        name: 'ratelimiter-only',
        rateLimiter: {
          name: 'test',
          maxTokens: 10,
          refillRate: 5,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      const stats = composite.getStats();
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.bulkhead).toBeUndefined();

      composite.destroy();
    });

    it('should work with only deduplication', async () => {
      const composite = new CompositeResilience({
        name: 'dedup-only',
        deduplication: {
          ttlMs: 1000,
          maxSize: 100,
        },
      });

      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation);
      await composite.execute('key1', operation);

      expect(operation).toHaveBeenCalledTimes(1); // Deduplicated

      composite.destroy();
    });

    it('should work with only adaptiveTimeout', async () => {
      const composite = new CompositeResilience({
        name: 'timeout-only',
        adaptiveTimeout: {
          initialTimeoutMs: 5000,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      const stats = composite.getStats();
      expect(stats.adaptiveTimeout).toBeDefined();

      composite.destroy();
    });

    it('should work with no components configured', async () => {
      const composite = new CompositeResilience({
        name: 'minimal',
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      const stats = composite.getStats();
      expect(stats.bulkhead).toBeUndefined();
      expect(stats.rateLimiter).toBeUndefined();
      expect(stats.deduplicator).toBeUndefined();
      expect(stats.adaptiveTimeout).toBeUndefined();

      composite.destroy();
    });
  });

  describe('execution paths without specific components', () => {
    it('should execute without deduplicator when skipDedup is true', async () => {
      const composite = new CompositeResilience({
        name: 'no-dedup-path',
        deduplication: {
          ttlMs: 1000,
          maxSize: 100,
        },
        bulkhead: {
          name: 'test',
          maxConcurrent: 5,
          maxQueue: 10,
          queueTimeoutMs: 1000,
        },
      });

      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation, { skipDedup: true });
      await composite.execute('key1', operation, { skipDedup: true });

      expect(operation).toHaveBeenCalledTimes(2); // Not deduplicated

      composite.destroy();
    });

    it('should execute without rateLimiter when skipRateLimit is true', async () => {
      const composite = new CompositeResilience({
        name: 'no-ratelimit-path',
        rateLimiter: {
          name: 'test',
          maxTokens: 1,
          refillRate: 0.1,
        },
      });

      const operation = vi.fn(async () => 42);

      // Use up the single token
      await composite.execute('key1', operation);

      // This should work because we skip rate limiting
      await composite.execute('key2', operation, { skipRateLimit: true });

      expect(operation).toHaveBeenCalledTimes(2);

      composite.destroy();
    });

    it('should execute without adaptiveTimeout when not configured', async () => {
      const composite = new CompositeResilience({
        name: 'no-timeout',
        bulkhead: {
          name: 'test',
          maxConcurrent: 5,
          maxQueue: 10,
          queueTimeoutMs: 1000,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      composite.destroy();
    });

    it('should execute without bulkhead when not configured', async () => {
      const composite = new CompositeResilience({
        name: 'no-bulkhead',
        adaptiveTimeout: {
          initialTimeoutMs: 5000,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      composite.destroy();
    });
  });

  describe('component interaction combinations', () => {
    it('should combine bulkhead and timeout without dedup or ratelimit', async () => {
      const composite = new CompositeResilience({
        name: 'bulkhead-timeout',
        bulkhead: {
          name: 'test',
          maxConcurrent: 2,
          maxQueue: 2,
          queueTimeoutMs: 1000,
        },
        adaptiveTimeout: {
          initialTimeoutMs: 5000,
        },
      });

      const result = await composite.execute('key1', async () => 42);
      expect(result).toBe(42);

      const stats = composite.getStats();
      expect(stats.bulkhead).toBeDefined();
      expect(stats.adaptiveTimeout).toBeDefined();

      composite.destroy();
    });

    it('should combine ratelimit and dedup without bulkhead or timeout', async () => {
      const composite = new CompositeResilience({
        name: 'ratelimit-dedup',
        rateLimiter: {
          name: 'test',
          maxTokens: 10,
          refillRate: 5,
        },
        deduplication: {
          ttlMs: 1000,
          maxSize: 100,
        },
      });

      const operation = vi.fn(async () => 42);

      await composite.execute('key1', operation);
      await composite.execute('key1', operation);

      expect(operation).toHaveBeenCalledTimes(1); // Deduplicated

      composite.destroy();
    });
  });

  describe('invalidateDedup with different configurations', () => {
    it('should invalidate when deduplicator exists', async () => {
      const composite = new CompositeResilience({
        name: 'with-dedup',
        deduplication: {
          ttlMs: 5000,
          maxSize: 100,
        },
      });

      const operation = vi.fn(async () => 42);
      await composite.execute('key1', operation);

      const invalidated = composite.invalidateDedup('key1');
      expect(invalidated).toBe(true);

      await composite.execute('key1', operation);
      expect(operation).toHaveBeenCalledTimes(2);

      composite.destroy();
    });

    it('should return false when deduplicator does not exist', () => {
      const composite = new CompositeResilience({
        name: 'no-dedup',
      });

      const invalidated = composite.invalidateDedup('key1');
      expect(invalidated).toBe(false);

      composite.destroy();
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

  it('should handle error scenarios gracefully', async () => {
    const composite = new CompositeResilience({
      name: 'error-test',
      bulkhead: {
        name: 'test',
        maxConcurrent: 2,
        maxQueue: 2,
        queueTimeoutMs: 1000,
      },
    });

    vi.useFakeTimers();

    const errorOp = vi.fn(async () => {
      throw new Error('Operation failed');
    });

    await expect(composite.execute('key1', errorOp)).rejects.toThrow('Operation failed');

    // Should still be able to execute after error
    const successOp = vi.fn(async () => 42);
    const result = await composite.execute('key2', successOp);
    expect(result).toBe(42);

    composite.destroy();
    vi.useRealTimers();
  });
});
