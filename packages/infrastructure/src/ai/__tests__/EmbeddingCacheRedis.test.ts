/**
 * @fileoverview Tests for Redis-based embedding cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmbeddingCacheRedis,
  createEmbeddingCacheRedis,
  type EmbeddingRedisClient,
} from '../EmbeddingCacheRedis';

/**
 * Mock Redis client for testing
 */
function createMockRedis(): EmbeddingRedisClient & {
  storage: Map<string, { value: string; ttl: number }>;
} {
  const storage = new Map<string, { value: string; ttl: number }>();

  return {
    storage,
    get: vi.fn(async (key: string) => {
      const entry = storage.get(key);
      return entry?.value ?? null;
    }),
    set: vi.fn(async (key: string, value: string, options?: { ttlSeconds?: number }) => {
      storage.set(key, { value, ttl: options?.ttlSeconds ?? 0 });
      return true;
    }),
    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (storage.has(key)) {
          storage.delete(key);
          deleted++;
        }
      }
      return deleted;
    }),
    exists: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (storage.has(key)) count++;
      }
      return count;
    }),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return Array.from(storage.keys()).filter((key) => key.startsWith(prefix));
    }),
  };
}

describe('EmbeddingCacheRedis', () => {
  let cache: EmbeddingCacheRedis;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = createMockRedis();
    cache = new EmbeddingCacheRedis(mockRedis);
  });

  describe('configuration', () => {
    it('should use default 8-hour TTL', () => {
      expect(cache.getTTL()).toBe(28800);
    });

    it('should use custom TTL when provided', () => {
      const customCache = new EmbeddingCacheRedis(mockRedis, { ttlSeconds: 3600 });
      expect(customCache.getTTL()).toBe(3600);
    });

    it('should use default key prefix', () => {
      expect(cache.getKeyPrefix()).toBe('emb');
    });

    it('should use custom key prefix when provided', () => {
      const customCache = new EmbeddingCacheRedis(mockRedis, { keyPrefix: 'custom' });
      expect(customCache.getKeyPrefix()).toBe('custom');
    });
  });

  describe('get()', () => {
    it('should return null for uncached text', async () => {
      const result = await cache.get('uncached text', 'text-embedding-3-small');
      expect(result).toBeNull();
    });

    it('should return embedding for cached text', async () => {
      const testEmbedding = [0.1, 0.2, 0.3];
      await cache.set('test text', 'text-embedding-3-small', testEmbedding);

      const result = await cache.get('test text', 'text-embedding-3-small');
      expect(result).toEqual(testEmbedding);
    });

    it('should not return embedding for different model', async () => {
      const testEmbedding = [0.1, 0.2, 0.3];
      await cache.set('test text', 'text-embedding-3-small', testEmbedding);

      const result = await cache.get('test text', 'text-embedding-ada-002');
      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get = vi.fn().mockRejectedValue(new Error('Redis connection error'));

      const result = await cache.get('test text', 'text-embedding-3-small');
      expect(result).toBeNull();
    });
  });

  describe('getMany()', () => {
    it('should return empty map for empty input', async () => {
      const result = await cache.getMany([], 'text-embedding-3-small');
      expect(result.size).toBe(0);
    });

    it('should return cached embeddings', async () => {
      await cache.set('text1', 'text-embedding-3-small', [0.1, 0.2]);
      await cache.set('text2', 'text-embedding-3-small', [0.3, 0.4]);

      const result = await cache.getMany(['text1', 'text2', 'uncached'], 'text-embedding-3-small');

      expect(result.size).toBe(2);
      expect(result.get('text1')).toEqual([0.1, 0.2]);
      expect(result.get('text2')).toEqual([0.3, 0.4]);
      expect(result.has('uncached')).toBe(false);
    });
  });

  describe('set()', () => {
    it('should cache embedding with TTL', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cache.set('test text', 'text-embedding-3-small', embedding);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('emb:text-embedding-3-small:'),
        expect.any(String),
        { ttlSeconds: 28800 }
      );
    });

    it('should store embedding data correctly', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cache.set('test text', 'text-embedding-3-small', embedding);

      const stored = mockRedis.storage.values().next().value;
      const data = JSON.parse(stored.value);

      expect(data.embedding).toEqual(embedding);
      expect(data.model).toBe('text-embedding-3-small');
      expect(data.dimensions).toBe(3);
      expect(data.contentHash).toBeDefined();
      expect(data.cachedAt).toBeDefined();
    });

    it('should generate consistent keys for same content', async () => {
      await cache.set('same text', 'text-embedding-3-small', [0.1]);
      await cache.set('same text', 'text-embedding-3-small', [0.2]);

      // Should have only one key since content is the same
      expect(mockRedis.storage.size).toBe(1);
    });

    it('should generate different keys for different content', async () => {
      await cache.set('text one', 'text-embedding-3-small', [0.1]);
      await cache.set('text two', 'text-embedding-3-small', [0.2]);

      expect(mockRedis.storage.size).toBe(2);
    });
  });

  describe('setMany()', () => {
    it('should cache multiple embeddings', async () => {
      await cache.setMany(
        [
          { text: 'text1', embedding: [0.1, 0.2] },
          { text: 'text2', embedding: [0.3, 0.4] },
        ],
        'text-embedding-3-small'
      );

      expect(mockRedis.storage.size).toBe(2);
    });

    it('should handle empty entries', async () => {
      await cache.setMany([], 'text-embedding-3-small');
      expect(mockRedis.storage.size).toBe(0);
    });
  });

  describe('has()', () => {
    it('should return false for uncached text', async () => {
      const result = await cache.has('uncached', 'text-embedding-3-small');
      expect(result).toBe(false);
    });

    it('should return true for cached text', async () => {
      await cache.set('cached', 'text-embedding-3-small', [0.1]);
      const result = await cache.has('cached', 'text-embedding-3-small');
      expect(result).toBe(true);
    });
  });

  describe('invalidate()', () => {
    it('should remove cached embedding', async () => {
      await cache.set('to remove', 'text-embedding-3-small', [0.1]);
      expect(mockRedis.storage.size).toBe(1);

      const result = await cache.invalidate('to remove', 'text-embedding-3-small');
      expect(result).toBe(true);
      expect(mockRedis.storage.size).toBe(0);
    });

    it('should return false for non-existent entry', async () => {
      const result = await cache.invalidate('non-existent', 'text-embedding-3-small');
      expect(result).toBe(false);
    });
  });

  describe('invalidateModel()', () => {
    it('should remove all embeddings for a model', async () => {
      await cache.set('text1', 'model-a', [0.1]);
      await cache.set('text2', 'model-a', [0.2]);
      await cache.set('text3', 'model-b', [0.3]);

      const deleted = await cache.invalidateModel('model-a');

      expect(deleted).toBe(2);
      expect(mockRedis.storage.size).toBe(1);
    });

    it('should return 0 for model with no cached embeddings', async () => {
      const deleted = await cache.invalidateModel('non-existent-model');
      expect(deleted).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should track cache hits', async () => {
      await cache.set('text', 'model', [0.1]);
      await cache.get('text', 'model');
      await cache.get('text', 'model');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1);
    });

    it('should track cache misses', async () => {
      await cache.get('uncached1', 'model');
      await cache.get('uncached2', 'model');

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate hit rate correctly', async () => {
      await cache.set('text', 'model', [0.1]);
      await cache.get('text', 'model'); // hit
      await cache.get('text', 'model'); // hit
      await cache.get('uncached', 'model'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should reset stats', async () => {
      await cache.set('text', 'model', [0.1]);
      await cache.get('text', 'model');
      await cache.get('uncached', 'model');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should not track metrics when disabled', async () => {
      const noMetricsCache = new EmbeddingCacheRedis(mockRedis, { enableMetrics: false });
      await noMetricsCache.set('text', 'model', [0.1]);
      await noMetricsCache.get('text', 'model');

      const stats = noMetricsCache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('factory function', () => {
    it('should create cache instance with default config', () => {
      const cache = createEmbeddingCacheRedis(mockRedis);
      expect(cache).toBeInstanceOf(EmbeddingCacheRedis);
      expect(cache.getTTL()).toBe(28800);
    });

    it('should create cache instance with custom config', () => {
      const cache = createEmbeddingCacheRedis(mockRedis, {
        ttlSeconds: 7200,
        keyPrefix: 'test',
      });
      expect(cache.getTTL()).toBe(7200);
      expect(cache.getKeyPrefix()).toBe('test');
    });
  });
});
