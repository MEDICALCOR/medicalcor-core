/**
 * AI Response Cache Tests
 *
 * Tests for Redis-based caching of AI responses with semantic similarity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AIResponseCache,
  createAIResponseCache,
  createContextHash,
  type CachedAIResponse,
} from '../ai-response-cache.js';
import type { SecureRedisClient } from '../../infrastructure/redis-client.js';

describe('AIResponseCache', () => {
  let mockRedis: SecureRedisClient;
  let cache: AIResponseCache;

  beforeEach(() => {
    // Mock Redis client
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(0),
      sadd: vi.fn().mockResolvedValue(1),
      smembers: vi.fn().mockResolvedValue([]),
      srem: vi.fn().mockResolvedValue(1),
      incrbyWithExpire: vi.fn().mockResolvedValue(1),
    } as unknown as SecureRedisClient;

    cache = new AIResponseCache(mockRedis);
  });

  describe('configuration', () => {
    it('should initialize with default config', () => {
      const config = cache.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultTTLSeconds).toBe(3600);
      expect(config.keyPrefix).toBe('ai:cache:');
      expect(config.maxResponseSize).toBe(50000);
    });

    it('should accept custom configuration', () => {
      const customCache = new AIResponseCache(mockRedis, {
        defaultTTLSeconds: 7200,
        keyPrefix: 'custom:',
        maxResponseSize: 100000,
      });

      const config = customCache.getConfig();
      expect(config.defaultTTLSeconds).toBe(7200);
      expect(config.keyPrefix).toBe('custom:');
      expect(config.maxResponseSize).toBe(100000);
    });

    it('should validate configuration schema', () => {
      expect(() => {
        new AIResponseCache(mockRedis, {
          defaultTTLSeconds: 10, // Below minimum of 60
        });
      }).toThrow();
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      const disabledCache = new AIResponseCache(mockRedis, { enabled: false });

      const result = await disabledCache.get('test query', {
        responseType: 'scoring',
      });

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return null on cache miss', async () => {
      vi.mocked(mockRedis.get).mockResolvedValue(null);

      const result = await cache.get('test query', {
        responseType: 'scoring',
      });

      expect(result).toBeNull();
    });

    it('should return cached response on hit', async () => {
      const cachedResponse: CachedAIResponse = {
        query: 'test query',
        queryHash: 'hash123',
        response: 'cached response',
        metadata: {
          model: 'gpt-4o',
          temperature: 0.7,
          tokensUsed: 100,
          responseType: 'scoring',
        },
        createdAt: new Date().toISOString(),
        hitCount: 0,
        lastAccessedAt: new Date().toISOString(),
      };

      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await cache.get('test query', {
        responseType: 'scoring',
        model: 'gpt-4o',
      });

      expect(result).toBeDefined();
      expect(result?.response).toBe('cached response');
    });

    it('should update hit count when tracking enabled', async () => {
      const cachedResponse: CachedAIResponse = {
        query: 'test query',
        queryHash: 'hash123',
        response: 'cached response',
        metadata: {
          model: 'gpt-4o',
          temperature: 0.7,
          responseType: 'scoring',
        },
        createdAt: new Date().toISOString(),
        hitCount: 5,
        lastAccessedAt: new Date().toISOString(),
      };

      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(cachedResponse));

      await cache.get('test query', { responseType: 'scoring' });

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should not update hit count when tracking disabled', async () => {
      const noTrackCache = new AIResponseCache(mockRedis, { trackHits: false });

      const cachedResponse: CachedAIResponse = {
        query: 'test query',
        queryHash: 'hash123',
        response: 'cached response',
        metadata: {
          model: 'gpt-4o',
          temperature: 0.7,
          responseType: 'scoring',
        },
        createdAt: new Date().toISOString(),
        hitCount: 0,
        lastAccessedAt: new Date().toISOString(),
      };

      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(cachedResponse));

      await noTrackCache.get('test query', { responseType: 'scoring' });

      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should isolate cache by clinic ID', async () => {
      const isolatedCache = new AIResponseCache(mockRedis, { isolateByClinic: true });

      await isolatedCache.get('test query', {
        responseType: 'scoring',
        clinicId: 'clinic-123',
      });

      const callArg = vi.mocked(mockRedis.get).mock.calls[0]?.[0];
      expect(callArg).toContain('clinic-123');
    });

    it('should handle cache errors gracefully', async () => {
      vi.mocked(mockRedis.get).mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('test query', { responseType: 'scoring' });

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should not cache when disabled', async () => {
      const disabledCache = new AIResponseCache(mockRedis, { enabled: false });

      const result = await disabledCache.set('query', 'response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });

      expect(result).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should cache response successfully', async () => {
      vi.mocked(mockRedis.set).mockResolvedValue('OK');

      const result = await cache.set('test query', 'test response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
        tokensUsed: 100,
      });

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should not cache response exceeding size limit', async () => {
      const largeResponse = 'x'.repeat(100000);

      const result = await cache.set('query', largeResponse, {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });

      expect(result).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should use correct TTL by response type', async () => {
      await cache.set('query', 'response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });

      const setCall = vi.mocked(mockRedis.set).mock.calls[0];
      expect(setCall?.[2]).toHaveProperty('ttlSeconds');
    });

    it('should add to clinic index when isolation enabled', async () => {
      const isolatedCache = new AIResponseCache(mockRedis, { isolateByClinic: true });

      await isolatedCache.set('query', 'response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
        clinicId: 'clinic-123',
      });

      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should handle optional metadata', async () => {
      const result = await cache.set('query', 'response', {
        responseType: 'reply',
        model: 'gpt-4o',
        temperature: 0.7,
        language: 'ro',
        confidence: 0.95,
      });

      expect(result).toBe(true);
    });

    it('should handle cache errors gracefully', async () => {
      vi.mocked(mockRedis.set).mockRejectedValue(new Error('Redis error'));

      const result = await cache.set('query', 'response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });

      expect(result).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should invalidate cache entry', async () => {
      vi.mocked(mockRedis.del).mockResolvedValue(1);

      const result = await cache.invalidate('test query', {
        responseType: 'scoring',
      });

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should return false when entry does not exist', async () => {
      vi.mocked(mockRedis.del).mockResolvedValue(0);

      const result = await cache.invalidate('nonexistent', {
        responseType: 'scoring',
      });

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockRedis.del).mockRejectedValue(new Error('Redis error'));

      const result = await cache.invalidate('query', {
        responseType: 'scoring',
      });

      expect(result).toBe(false);
    });
  });

  describe('invalidateClinic', () => {
    it('should invalidate all entries for clinic', async () => {
      vi.mocked(mockRedis.smembers).mockResolvedValue(['key1', 'key2', 'key3']);
      vi.mocked(mockRedis.del).mockResolvedValue(3);

      const count = await cache.invalidateClinic('clinic-123');

      expect(count).toBe(3);
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should return 0 when no entries found', async () => {
      vi.mocked(mockRedis.smembers).mockResolvedValue([]);

      const count = await cache.invalidateClinic('clinic-123');

      expect(count).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockRedis.smembers).mockRejectedValue(new Error('Redis error'));

      const count = await cache.invalidateClinic('clinic-123');

      expect(count).toBe(0);
    });
  });

  describe('invalidateByType', () => {
    it('should invalidate all entries of type', async () => {
      vi.mocked(mockRedis.keys).mockResolvedValue(['key1', 'key2']);
      vi.mocked(mockRedis.del).mockResolvedValue(2);

      const count = await cache.invalidateByType('scoring');

      expect(count).toBe(2);
    });

    it('should return 0 when no keys found', async () => {
      vi.mocked(mockRedis.keys).mockResolvedValue([]);

      const count = await cache.invalidateByType('scoring');

      expect(count).toBe(0);
    });
  });

  describe('invalidatePatient', () => {
    it('should invalidate patient context entries', async () => {
      vi.mocked(mockRedis.keys).mockResolvedValue(['key1']);
      vi.mocked(mockRedis.del).mockResolvedValue(1);

      const count = await cache.invalidatePatient('context-hash');

      expect(count).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track cache hits and misses', async () => {
      vi.mocked(mockRedis.get).mockResolvedValue(null);
      await cache.get('query1', { responseType: 'scoring' });

      const cachedResponse: CachedAIResponse = {
        query: 'query2',
        queryHash: 'hash',
        response: 'response',
        metadata: {
          model: 'gpt-4o',
          temperature: 0.7,
          responseType: 'scoring',
        },
        createdAt: new Date().toISOString(),
        hitCount: 0,
        lastAccessedAt: new Date().toISOString(),
      };
      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify(cachedResponse));
      await cache.get('query2', { responseType: 'scoring' });

      const stats = await cache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should calculate hit rate', async () => {
      vi.mocked(mockRedis.get).mockResolvedValue(null);
      await cache.get('miss', { responseType: 'scoring' });

      const stats = await cache.getStats();
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(100);
    });

    it('should track average response size', async () => {
      await cache.set('query1', 'response1', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });

      const stats = await cache.getStats();
      expect(stats.avgResponseSize).toBeGreaterThan(0);
    });

    it('should get entries by type', async () => {
      vi.mocked(mockRedis.keys).mockResolvedValue(['key1', 'key2']);

      const stats = await cache.getStats();
      expect(stats.entriesByType).toBeDefined();
    });

    it('should reset statistics', () => {
      cache.resetStats();
      expect(cache.getStats()).resolves.toMatchObject({
        hits: 0,
        misses: 0,
      });
    });
  });

  describe('warmUp', () => {
    it('should warm up cache with queries', async () => {
      const queries = [
        {
          query: 'query1',
          response: 'response1',
          options: {
            responseType: 'scoring' as const,
            model: 'gpt-4o',
            temperature: 0.7,
          },
        },
        {
          query: 'query2',
          response: 'response2',
          options: {
            responseType: 'reply' as const,
            model: 'gpt-4o',
            temperature: 0.7,
          },
        },
      ];

      const cached = await cache.warmUp(queries);

      expect(cached).toBe(2);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures', async () => {
      vi.mocked(mockRedis.set)
        .mockResolvedValueOnce('OK')
        .mockRejectedValueOnce(new Error('Failed'));

      const queries = [
        {
          query: 'query1',
          response: 'response1',
          options: {
            responseType: 'scoring' as const,
            model: 'gpt-4o',
            temperature: 0.7,
          },
        },
        {
          query: 'query2',
          response: 'response2',
          options: {
            responseType: 'reply' as const,
            model: 'gpt-4o',
            temperature: 0.7,
          },
        },
      ];

      const cached = await cache.warmUp(queries);

      expect(cached).toBe(1);
    });
  });

  describe('has', () => {
    it('should check if query is cached', async () => {
      vi.mocked(mockRedis.exists).mockResolvedValue(1);

      const exists = await cache.has('test query', {
        responseType: 'scoring',
      });

      expect(exists).toBe(true);
    });

    it('should return false when not cached', async () => {
      vi.mocked(mockRedis.exists).mockResolvedValue(0);

      const exists = await cache.has('test query', {
        responseType: 'scoring',
      });

      expect(exists).toBe(false);
    });
  });

  describe('configuration management', () => {
    it('should get configuration', () => {
      const config = cache.getConfig();
      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
    });

    it('should update configuration', () => {
      cache.updateConfig({ defaultTTLSeconds: 7200 });
      const config = cache.getConfig();
      expect(config.defaultTTLSeconds).toBe(7200);
    });

    it('should check if enabled', () => {
      expect(cache.isEnabled()).toBe(true);
    });

    it('should enable/disable caching', () => {
      cache.setEnabled(false);
      expect(cache.isEnabled()).toBe(false);

      cache.setEnabled(true);
      expect(cache.isEnabled()).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('should create context hash', () => {
      const hash = createContextHash({
        phone: '+40721234567',
        contactId: 'contact-123',
        procedureInterest: 'implant',
        leadScore: 4,
      });

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16);
    });

    it('should create consistent context hashes', () => {
      const data = {
        phone: '+40721234567',
        contactId: 'contact-123',
      };

      const hash1 = createContextHash(data);
      const hash2 = createContextHash(data);

      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different data', () => {
      const hash1 = createContextHash({ phone: '+40721234567' });
      const hash2 = createContextHash({ phone: '+40729999999' });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('factory function', () => {
    it('should create cache with factory', () => {
      const created = createAIResponseCache(mockRedis);
      expect(created).toBeInstanceOf(AIResponseCache);
    });

    it('should accept config in factory', () => {
      const created = createAIResponseCache(mockRedis, {
        defaultTTLSeconds: 7200,
      });
      expect(created.getConfig().defaultTTLSeconds).toBe(7200);
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', async () => {
      await cache.get('', { responseType: 'scoring' });
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should handle very long query', async () => {
      const longQuery = 'a'.repeat(10000);
      await cache.set(longQuery, 'response', {
        responseType: 'scoring',
        model: 'gpt-4o',
        temperature: 0.7,
      });
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle special characters in query', async () => {
      const specialQuery = 'Query with special chars: @#$%^&*()';
      await cache.get(specialQuery, { responseType: 'scoring' });
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should handle concurrent operations', async () => {
      const promises = [
        cache.get('query1', { responseType: 'scoring' }),
        cache.get('query2', { responseType: 'reply' }),
        cache.set('query3', 'response3', {
          responseType: 'summary',
          model: 'gpt-4o',
          temperature: 0.7,
        }),
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });
});
