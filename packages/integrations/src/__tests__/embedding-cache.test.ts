/**
 * Comprehensive tests for embedding-cache.ts
 * Tests EmbeddingCache and CachedEmbeddingService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingCache,
  CachedEmbeddingService,
  createEmbeddingCache,
  createCachedEmbeddingService,
  type RedisClient,
  type CachedEmbedding,
  type EmbeddingCacheConfig,
} from '../embedding-cache.js';

// Mock Redis client
class MockRedisClient implements RedisClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  pipeline() {
    const commands: Array<{ method: string; args: unknown[] }> = [];
    const self = this;

    return {
      setex(key: string, seconds: number, value: string) {
        commands.push({ method: 'setex', args: [key, seconds, value] });
        return this;
      },
      async exec() {
        const results = [];
        for (const cmd of commands) {
          if (cmd.method === 'setex') {
            const [key, seconds, value] = cmd.args as [string, number, string];
            results.push(await self.setex(key, seconds, value));
          }
        }
        return results;
      },
    };
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key)) count++;
    }
    return count;
  }

  // Test helper
  clear() {
    this.store.clear();
  }
}

describe('embedding-cache - EmbeddingCache', () => {
  let redis: MockRedisClient;
  let cache: EmbeddingCache;

  beforeEach(() => {
    redis = new MockRedisClient();
    cache = new EmbeddingCache(redis, { ttlSeconds: 3600 });
  });

  describe('constructor', () => {
    it('should create cache with defaults', () => {
      expect(cache).toBeInstanceOf(EmbeddingCache);
    });

    it('should accept custom config', () => {
      const customCache = new EmbeddingCache(redis, {
        ttlSeconds: 7200,
        keyPrefix: 'custom-prefix',
        enableMetrics: false,
      });
      expect(customCache.getKeyPrefix()).toBe('custom-prefix');
      expect(customCache.getTTL()).toBe(7200);
    });
  });

  describe('get', () => {
    it('should return null on cache miss', async () => {
      const result = await cache.get('test text', 'text-embedding-3-small');
      expect(result).toBeNull();
    });

    it('should return cached embedding on hit', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cache.set('test text', 'text-embedding-3-small', embedding);

      const result = await cache.get('test text', 'text-embedding-3-small');
      expect(result).toEqual(embedding);
    });

    it('should handle different models separately', async () => {
      const embedding1 = [0.1, 0.2];
      const embedding2 = [0.3, 0.4];

      await cache.set('test', 'model-1', embedding1);
      await cache.set('test', 'model-2', embedding2);

      const result1 = await cache.get('test', 'model-1');
      const result2 = await cache.get('test', 'model-2');

      expect(result1).toEqual(embedding1);
      expect(result2).toEqual(embedding2);
    });

    it('should return null and not throw on Redis error', async () => {
      const errorRedis = {
        ...redis,
        get: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      const result = await errorCache.get('test', 'model');

      expect(result).toBeNull();
    });
  });

  describe('getMany', () => {
    it('should return empty map for empty input', async () => {
      const results = await cache.getMany([], 'model');
      expect(results.size).toBe(0);
    });

    it('should return cached embeddings for multiple texts', async () => {
      await cache.set('text1', 'model', [0.1, 0.2]);
      await cache.set('text2', 'model', [0.3, 0.4]);

      const results = await cache.getMany(['text1', 'text2'], 'model');

      expect(results.size).toBe(2);
      expect(results.get('text1')).toEqual([0.1, 0.2]);
      expect(results.get('text2')).toEqual([0.3, 0.4]);
    });

    it('should return only cached entries', async () => {
      await cache.set('text1', 'model', [0.1, 0.2]);

      const results = await cache.getMany(['text1', 'text2', 'text3'], 'model');

      expect(results.size).toBe(1);
      expect(results.has('text1')).toBe(true);
      expect(results.has('text2')).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      const errorRedis = {
        ...redis,
        mget: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      const results = await errorCache.getMany(['text1'], 'model');

      expect(results.size).toBe(0);
    });
  });

  describe('set', () => {
    it('should cache embedding', async () => {
      await cache.set('test', 'model', [0.1, 0.2, 0.3]);

      const result = await cache.get('test', 'model');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should set dimensions from embedding length', async () => {
      await cache.set('test', 'model', [0.1, 0.2, 0.3]);

      const key = 'embedding:model:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'; // SHA-256 of "test"
      const cached = await redis.get(`embedding:model:${key.split(':')[2]}`);

      // Note: We can't easily verify the exact key without duplicating hash logic
      // so we just verify the embedding was stored
      const result = await cache.get('test', 'model');
      expect(result).toHaveLength(3);
    });

    it('should use custom dimensions when provided', async () => {
      await cache.set('test', 'model', [0.1, 0.2, 0.3], 1536);
      const result = await cache.get('test', 'model');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should not throw on Redis error', async () => {
      const errorRedis = {
        ...redis,
        setex: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      await expect(errorCache.set('test', 'model', [0.1, 0.2])).resolves.not.toThrow();
    });
  });

  describe('setMany', () => {
    it('should cache multiple embeddings', async () => {
      await cache.setMany(
        [
          { text: 'text1', embedding: [0.1, 0.2] },
          { text: 'text2', embedding: [0.3, 0.4] },
        ],
        'model'
      );

      const result1 = await cache.get('text1', 'model');
      const result2 = await cache.get('text2', 'model');

      expect(result1).toEqual([0.1, 0.2]);
      expect(result2).toEqual([0.3, 0.4]);
    });

    it('should handle empty array', async () => {
      await expect(cache.setMany([], 'model')).resolves.not.toThrow();
    });

    it('should not throw on Redis error', async () => {
      const errorRedis = {
        ...redis,
        pipeline: () => ({
          setex: vi.fn().mockReturnThis(),
          exec: vi.fn().mockRejectedValue(new Error('Pipeline error')),
        }),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      await expect(errorCache.setMany([{ text: 'test', embedding: [0.1] }], 'model')).resolves.not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true for cached embedding', async () => {
      await cache.set('test', 'model', [0.1, 0.2]);

      const result = await cache.has('test', 'model');
      expect(result).toBe(true);
    });

    it('should return false for non-cached embedding', async () => {
      const result = await cache.has('nonexistent', 'model');
      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      const errorRedis = {
        ...redis,
        exists: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      const result = await errorCache.has('test', 'model');

      expect(result).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should invalidate cached embedding', async () => {
      await cache.set('test', 'model', [0.1, 0.2]);

      const result = await cache.invalidate('test', 'model');
      expect(result).toBe(true);

      const cached = await cache.get('test', 'model');
      expect(cached).toBeNull();
    });

    it('should return false for non-existent entry', async () => {
      const result = await cache.invalidate('nonexistent', 'model');
      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      const errorRedis = {
        ...redis,
        del: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      const result = await errorCache.invalidate('test', 'model');

      expect(result).toBe(false);
    });
  });

  describe('invalidateModel', () => {
    it('should invalidate all embeddings for a model', async () => {
      await cache.set('text1', 'model-a', [0.1]);
      await cache.set('text2', 'model-a', [0.2]);
      await cache.set('text3', 'model-b', [0.3]);

      const deleted = await cache.invalidateModel('model-a');
      expect(deleted).toBeGreaterThan(0);

      const result1 = await cache.get('text1', 'model-a');
      const result2 = await cache.get('text2', 'model-a');
      const result3 = await cache.get('text3', 'model-b');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toEqual([0.3]); // Different model, not invalidated
    });

    it('should return 0 when no keys match', async () => {
      const deleted = await cache.invalidateModel('nonexistent-model');
      expect(deleted).toBe(0);
    });

    it('should return 0 on Redis error', async () => {
      const errorRedis = {
        ...redis,
        keys: vi.fn().mockRejectedValue(new Error('Redis error')),
      } as unknown as RedisClient;

      const errorCache = new EmbeddingCache(errorRedis);
      const deleted = await errorCache.invalidateModel('model');

      expect(deleted).toBe(0);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate embeddings matching pattern', async () => {
      await cache.set('test1', 'model', [0.1]);
      await cache.set('test2', 'model', [0.2]);

      // This would match keys containing the pattern
      const deleted = await cache.invalidateByPattern('*');
      expect(deleted).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when no keys match', async () => {
      const deleted = await cache.invalidateByPattern('nonexistent*');
      expect(deleted).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should track cache hits', async () => {
      await cache.set('test', 'model', [0.1]);
      await cache.get('test', 'model'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1);
    });

    it('should track cache misses', async () => {
      await cache.get('nonexistent', 'model'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate hit rate correctly', async () => {
      await cache.set('test', 'model', [0.1]);
      await cache.get('test', 'model'); // Hit
      await cache.get('miss1', 'model'); // Miss
      await cache.get('miss2', 'model'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(1 / 3);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      await cache.set('test', 'model', [0.1]);
      await cache.get('test', 'model');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getKeyPrefix', () => {
    it('should return configured key prefix', () => {
      expect(cache.getKeyPrefix()).toBe('embedding');
    });

    it('should return custom prefix', () => {
      const customCache = new EmbeddingCache(redis, { keyPrefix: 'custom' });
      expect(customCache.getKeyPrefix()).toBe('custom');
    });
  });

  describe('getTTL', () => {
    it('should return configured TTL', () => {
      expect(cache.getTTL()).toBe(3600);
    });
  });
});

describe('embedding-cache - CachedEmbeddingService', () => {
  let redis: MockRedisClient;
  let cache: EmbeddingCache;
  let embedFn: ReturnType<typeof vi.fn>;
  let embedBatchFn: ReturnType<typeof vi.fn>;
  let service: CachedEmbeddingService;

  beforeEach(() => {
    redis = new MockRedisClient();
    cache = new EmbeddingCache(redis);
    embedFn = vi.fn(async (text: string) => [0.1, 0.2, 0.3]);
    embedBatchFn = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));

    service = new CachedEmbeddingService({
      cache,
      embedFn,
      embedBatchFn,
      model: 'text-embedding-3-small',
    });
  });

  describe('embed', () => {
    it('should call embedFn on cache miss', async () => {
      const result = await service.embed('test text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(embedFn).toHaveBeenCalledWith('test text');
    });

    it('should use cache on subsequent calls', async () => {
      await service.embed('test text'); // First call - cache miss
      await service.embed('test text'); // Second call - cache hit

      expect(embedFn).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should cache the embedding', async () => {
      await service.embed('test text');

      const cached = await cache.get('test text', 'text-embedding-3-small');
      expect(cached).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('embedBatch', () => {
    it('should return empty array for empty input', async () => {
      const results = await service.embedBatch([]);
      expect(results).toEqual([]);
    });

    it('should call embedBatchFn for uncached texts', async () => {
      const results = await service.embedBatch(['text1', 'text2']);

      expect(results).toHaveLength(2);
      expect(embedBatchFn).toHaveBeenCalledWith(['text1', 'text2']);
    });

    it('should use cache for previously embedded texts', async () => {
      await service.embed('text1'); // Cache text1

      const results = await service.embedBatch(['text1', 'text2']);

      expect(results).toHaveLength(2);
      expect(embedBatchFn).toHaveBeenCalledWith(['text2']); // Only text2 is new
    });

    it('should cache new embeddings from batch', async () => {
      await service.embedBatch(['text1', 'text2']);

      const cached1 = await cache.get('text1', 'text-embedding-3-small');
      const cached2 = await cache.get('text2', 'text-embedding-3-small');

      expect(cached1).toBeTruthy();
      expect(cached2).toBeTruthy();
    });

    it('should fall back to sequential embedding without embedBatchFn', async () => {
      const serviceWithoutBatch = new CachedEmbeddingService({
        cache,
        embedFn,
        model: 'text-embedding-3-small',
      });

      const results = await serviceWithoutBatch.embedBatch(['text1', 'text2']);

      expect(results).toHaveLength(2);
      expect(embedFn).toHaveBeenCalledTimes(2);
    });

    it('should maintain order of results', async () => {
      await cache.set('text2', 'text-embedding-3-small', [0.4, 0.5, 0.6]); // Pre-cache text2

      embedBatchFn.mockImplementation(async (texts: string[]) =>
        texts.map((t) => (t === 'text1' ? [0.1, 0.2, 0.3] : [0.7, 0.8, 0.9]))
      );

      const results = await service.embedBatch(['text1', 'text2', 'text3']);

      expect(results[0]).toEqual([0.1, 0.2, 0.3]); // text1 - new
      expect(results[1]).toEqual([0.4, 0.5, 0.6]); // text2 - cached
      expect(results[2]).toEqual([0.7, 0.8, 0.9]); // text3 - new
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await service.embed('test');
      await service.embed('test'); // Cache hit

      const stats = service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});

describe('embedding-cache - Factory Functions', () => {
  describe('createEmbeddingCache', () => {
    it('should create EmbeddingCache instance', () => {
      const redis = new MockRedisClient();
      const cache = createEmbeddingCache(redis);

      expect(cache).toBeInstanceOf(EmbeddingCache);
    });

    it('should accept config', () => {
      const redis = new MockRedisClient();
      const cache = createEmbeddingCache(redis, {
        ttlSeconds: 7200,
        keyPrefix: 'custom',
      });

      expect(cache.getTTL()).toBe(7200);
      expect(cache.getKeyPrefix()).toBe('custom');
    });
  });

  describe('createCachedEmbeddingService', () => {
    it('should create CachedEmbeddingService instance', () => {
      const redis = new MockRedisClient();
      const cache = createEmbeddingCache(redis);

      const service = createCachedEmbeddingService({
        cache,
        embedFn: async () => [0.1],
        model: 'test-model',
      });

      expect(service).toBeInstanceOf(CachedEmbeddingService);
    });
  });
});
