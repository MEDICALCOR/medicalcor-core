/**
 * Embedding Cache Service
 *
 * Redis-based caching for text embeddings to:
 * - Reduce OpenAI API costs (~70% reduction for repeated content)
 * - Decrease latency for cached embeddings
 * - Support cache invalidation when models change
 *
 * Cache key format: embedding:{model}:{sha256(text)}
 * TTL: 7 days by default (configurable)
 *
 * @module @medicalcor/integrations/embedding-cache
 */

import { createHash } from 'crypto';
import { createLogger, type Logger } from '@medicalcor/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Redis client interface (compatible with ioredis)
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  pipeline(): RedisPipeline;
  exists(...keys: string[]): Promise<number>;
}

export interface RedisPipeline {
  setex(key: string, seconds: number, value: string): RedisPipeline;
  exec(): Promise<unknown[]>;
}

/**
 * Cached embedding data
 */
export interface CachedEmbedding {
  embedding: number[];
  model: string;
  dimensions: number;
  cachedAt: string;
  contentHash: string;
}

/**
 * Cache configuration
 */
export interface EmbeddingCacheConfig {
  /** TTL in seconds (default: 7 days) */
  ttlSeconds?: number;
  /** Key prefix (default: 'embedding') */
  keyPrefix?: string;
  /** Enable compression for large embeddings (default: false) */
  compress?: boolean;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Cache statistics
 */
export interface EmbeddingCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  avgLatencyMs: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Required<EmbeddingCacheConfig> = {
  ttlSeconds: 86400 * 7, // 7 days
  keyPrefix: 'embedding',
  compress: false,
  enableMetrics: true,
};

// ============================================================================
// EMBEDDING CACHE CLASS
// ============================================================================

/**
 * Redis-based embedding cache
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const cache = new EmbeddingCache(redis);
 *
 * // Check cache before calling OpenAI
 * let embedding = await cache.get(text, 'text-embedding-3-small');
 * if (!embedding) {
 *   embedding = await openai.embed(text);
 *   await cache.set(text, 'text-embedding-3-small', embedding);
 * }
 * ```
 */
export class EmbeddingCache {
  private readonly config: Required<EmbeddingCacheConfig>;
  private readonly logger: Logger;

  // Metrics
  private hits = 0;
  private misses = 0;
  private totalLatencyMs = 0;
  private requestCount = 0;

  constructor(
    private readonly redis: RedisClient,
    config: EmbeddingCacheConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger({ name: 'embedding-cache' });
  }

  /**
   * Generate cache key for a text/model combination
   */
  private getKey(text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `${this.config.keyPrefix}:${model}:${hash}`;
  }

  /**
   * Get cached embedding for text
   *
   * @returns Embedding array if cached, null otherwise
   */
  async get(text: string, model: string): Promise<number[] | null> {
    const startTime = Date.now();
    const key = this.getKey(text, model);

    try {
      const cached = await this.redis.get(key);

      if (cached) {
        const data = JSON.parse(cached) as CachedEmbedding;
        this.recordHit(Date.now() - startTime);
        return data.embedding;
      }

      this.recordMiss(Date.now() - startTime);
      return null;
    } catch (error) {
      this.logger.warn({ error, key }, 'Failed to get cached embedding');
      this.recordMiss(Date.now() - startTime);
      return null;
    }
  }

  /**
   * Get multiple cached embeddings at once
   *
   * @returns Map of text to embedding (only includes cached entries)
   */
  async getMany(texts: string[], model: string): Promise<Map<string, number[]>> {
    if (texts.length === 0) {
      return new Map();
    }

    const startTime = Date.now();
    const keys = texts.map((text) => this.getKey(text, model));
    const results = new Map<string, number[]>();

    try {
      const cached = await this.redis.mget(...keys);

      for (let i = 0; i < texts.length; i++) {
        const value = cached[i];
        if (value) {
          const data = JSON.parse(value) as CachedEmbedding;
          results.set(texts[i] ?? '', data.embedding);
          this.recordHit(0);
        } else {
          this.recordMiss(0);
        }
      }

      this.totalLatencyMs += Date.now() - startTime;
      this.requestCount++;
    } catch (error) {
      this.logger.warn({ error }, 'Failed to get cached embeddings batch');
    }

    return results;
  }

  /**
   * Cache an embedding
   */
  async set(text: string, model: string, embedding: number[], dimensions?: number): Promise<void> {
    const key = this.getKey(text, model);
    const contentHash = createHash('sha256').update(text).digest('hex');

    const data: CachedEmbedding = {
      embedding,
      model,
      dimensions: dimensions ?? embedding.length,
      cachedAt: new Date().toISOString(),
      contentHash,
    };

    try {
      await this.redis.setex(key, this.config.ttlSeconds, JSON.stringify(data));
    } catch (error) {
      this.logger.warn({ error, key }, 'Failed to cache embedding');
    }
  }

  /**
   * Cache multiple embeddings at once
   */
  async setMany(entries: { text: string; embedding: number[] }[], model: string): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const key = this.getKey(entry.text, model);
        const contentHash = createHash('sha256').update(entry.text).digest('hex');

        const data: CachedEmbedding = {
          embedding: entry.embedding,
          model,
          dimensions: entry.embedding.length,
          cachedAt: new Date().toISOString(),
          contentHash,
        };

        pipeline.setex(key, this.config.ttlSeconds, JSON.stringify(data));
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.warn({ error }, 'Failed to cache embeddings batch');
    }
  }

  /**
   * Check if an embedding is cached
   */
  async has(text: string, model: string): Promise<boolean> {
    const key = this.getKey(text, model);
    try {
      const exists = await this.redis.exists(key);
      return exists > 0;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate cached embedding for a specific text
   */
  async invalidate(text: string, model: string): Promise<boolean> {
    const key = this.getKey(text, model);
    try {
      const deleted = await this.redis.del(key);
      return deleted > 0;
    } catch (error) {
      this.logger.warn({ error, key }, 'Failed to invalidate cached embedding');
      return false;
    }
  }

  /**
   * Invalidate all cached embeddings for a model
   */
  async invalidateModel(model: string): Promise<number> {
    const pattern = `${this.config.keyPrefix}:${model}:*`;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      this.logger.info({ model, deleted }, 'Invalidated cached embeddings for model');
      return deleted;
    } catch (error) {
      this.logger.warn({ error, model }, 'Failed to invalidate model cache');
      return 0;
    }
  }

  /**
   * Invalidate embeddings matching a content pattern
   * Note: This requires scanning keys, use sparingly
   */
  async invalidateByPattern(hashPattern: string): Promise<number> {
    const pattern = `${this.config.keyPrefix}:*:${hashPattern}*`;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      this.logger.info({ pattern, deleted }, 'Invalidated cached embeddings');
      return deleted;
    } catch (error) {
      this.logger.warn({ error, pattern }, 'Failed to invalidate by pattern');
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): EmbeddingCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: total,
      avgLatencyMs: this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.totalLatencyMs = 0;
    this.requestCount = 0;
  }

  /**
   * Get cache key prefix
   */
  getKeyPrefix(): string {
    return this.config.keyPrefix;
  }

  /**
   * Get TTL in seconds
   */
  getTTL(): number {
    return this.config.ttlSeconds;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private recordHit(latencyMs: number): void {
    if (this.config.enableMetrics) {
      this.hits++;
      this.totalLatencyMs += latencyMs;
      this.requestCount++;
    }
  }

  private recordMiss(latencyMs: number): void {
    if (this.config.enableMetrics) {
      this.misses++;
      this.totalLatencyMs += latencyMs;
      this.requestCount++;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an embedding cache instance
 */
export function createEmbeddingCache(
  redis: RedisClient,
  config?: EmbeddingCacheConfig
): EmbeddingCache {
  return new EmbeddingCache(redis, config);
}

// ============================================================================
// CACHED EMBEDDING SERVICE WRAPPER
// ============================================================================

/**
 * Configuration for cached embedding service
 */
export interface CachedEmbeddingServiceConfig {
  cache: EmbeddingCache;
  /** Underlying embedding function */
  embedFn: (text: string) => Promise<number[]>;
  /** Batch embedding function */
  embedBatchFn?: (texts: string[]) => Promise<number[][]>;
  /** Model name for cache keys */
  model: string;
}

/**
 * Wrapper that adds caching to any embedding service
 *
 * @example
 * ```typescript
 * const cachedService = new CachedEmbeddingService({
 *   cache: embeddingCache,
 *   embedFn: (text) => embeddingService.embed(text).then(r => r.embedding),
 *   embedBatchFn: (texts) => embeddingService.embedBatch(texts).then(r => r.embeddings.map(e => e.embedding)),
 *   model: 'text-embedding-3-small',
 * });
 *
 * // Automatically uses cache
 * const embedding = await cachedService.embed("Hello world");
 * ```
 */
export class CachedEmbeddingService {
  private readonly logger: Logger;

  constructor(private readonly config: CachedEmbeddingServiceConfig) {
    this.logger = createLogger({ name: 'cached-embedding-service' });
  }

  /**
   * Get embedding with cache support
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = await this.config.cache.get(text, this.config.model);
    if (cached) {
      return cached;
    }

    // Generate new embedding
    const embedding = await this.config.embedFn(text);

    // Cache for future use
    await this.config.cache.set(text, this.config.model, embedding);

    return embedding;
  }

  /**
   * Get embeddings for multiple texts with cache support
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Check cache for all texts
    const cachedMap = await this.config.cache.getMany(texts, this.config.model);

    // Find texts that need embedding
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text && !cachedMap.has(text)) {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    // Generate embeddings for uncached texts
    let newEmbeddings: number[][] = [];
    if (uncachedTexts.length > 0) {
      if (this.config.embedBatchFn) {
        newEmbeddings = await this.config.embedBatchFn(uncachedTexts);
      } else {
        // Fallback to sequential embedding
        newEmbeddings = await Promise.all(uncachedTexts.map((text) => this.config.embedFn(text)));
      }

      // Cache new embeddings
      const cacheEntries = uncachedTexts
        .map((text, i) => {
          const embedding = newEmbeddings[i];
          return embedding ? { text, embedding } : null;
        })
        .filter((entry): entry is { text: string; embedding: number[] } => entry !== null);
      await this.config.cache.setMany(cacheEntries, this.config.model);
    }

    // Assemble results in original order
    const results: number[][] = new Array<number[]>(texts.length);

    // Add cached embeddings
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text) {
        const cached = cachedMap.get(text);
        if (cached) {
          results[i] = cached;
        }
      }
    }

    // Add new embeddings
    for (let i = 0; i < uncachedIndices.length; i++) {
      const idx = uncachedIndices[i];
      const embedding = newEmbeddings[i];
      if (idx !== undefined && embedding) {
        results[idx] = embedding;
      }
    }

    this.logger.debug(
      {
        total: texts.length,
        cached: texts.length - uncachedTexts.length,
        generated: uncachedTexts.length,
      },
      'Batch embedding completed'
    );

    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): EmbeddingCacheStats {
    return this.config.cache.getStats();
  }
}

/**
 * Create a cached embedding service
 */
export function createCachedEmbeddingService(
  config: CachedEmbeddingServiceConfig
): CachedEmbeddingService {
  return new CachedEmbeddingService(config);
}
