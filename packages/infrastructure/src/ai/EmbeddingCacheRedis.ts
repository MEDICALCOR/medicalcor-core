/**
 * @fileoverview Redis-based Embedding Cache
 *
 * Caches text embeddings in Redis to reduce redundant OpenAI API calls.
 * Uses content-based hashing (SHA-256) for cache keys.
 *
 * Key features:
 * - 8-hour TTL by default (configurable)
 * - SHA-256 content hashing for cache keys
 * - Batch operations for efficiency
 * - Metrics collection for monitoring
 * - Graceful degradation on Redis failures
 *
 * @module infrastructure/ai/EmbeddingCacheRedis
 */

import { createHash } from 'crypto';
import { createLogger, type Logger } from '@medicalcor/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Redis client interface for embedding cache
 * Compatible with SecureRedisClient from @medicalcor/core
 */
export interface EmbeddingRedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { ttlSeconds?: number; nx?: boolean }
  ): Promise<boolean>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

/**
 * Cached embedding entry
 */
export interface CachedEmbeddingEntry {
  /** The embedding vector */
  embedding: number[];
  /** Model used to generate the embedding */
  model: string;
  /** Embedding dimensions */
  dimensions: number;
  /** ISO timestamp when cached */
  cachedAt: string;
  /** SHA-256 hash of the input text */
  contentHash: string;
}

/**
 * Cache configuration
 */
export interface EmbeddingCacheRedisConfig {
  /** TTL in seconds (default: 8 hours = 28800) */
  ttlSeconds?: number;
  /** Key prefix (default: 'emb') */
  keyPrefix?: string;
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
  errors: number;
  avgLatencyMs: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default TTL: 8 hours in seconds */
const DEFAULT_TTL_SECONDS = 28800;

/** Default key prefix */
const DEFAULT_KEY_PREFIX = 'emb';

// ============================================================================
// EMBEDDING CACHE CLASS
// ============================================================================

/**
 * Redis-based embedding cache
 *
 * Reduces redundant OpenAI API calls by caching embeddings based on
 * content hash. Uses SHA-256 hashing for deterministic cache keys.
 *
 * @example
 * ```typescript
 * const redis = await createRedisClientFromEnv();
 * await redis.connect();
 *
 * const cache = new EmbeddingCacheRedis(redis, { ttlSeconds: 28800 });
 *
 * // Check cache before calling OpenAI
 * let embedding = await cache.get('Patient has severe bone loss', 'text-embedding-3-small');
 * if (!embedding) {
 *   embedding = await openai.embeddings.create({ ... });
 *   await cache.set('Patient has severe bone loss', 'text-embedding-3-small', embedding);
 * }
 * ```
 */
export class EmbeddingCacheRedis {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;
  private readonly enableMetrics: boolean;
  private readonly logger: Logger;

  // Metrics
  private hits = 0;
  private misses = 0;
  private errors = 0;
  private totalLatencyMs = 0;
  private requestCount = 0;

  constructor(
    private readonly redis: EmbeddingRedisClient,
    config: EmbeddingCacheRedisConfig = {}
  ) {
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.keyPrefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.enableMetrics = config.enableMetrics ?? true;
    this.logger = createLogger({ name: 'embedding-cache-redis' });
  }

  /**
   * Generate cache key from text and model
   *
   * Format: {prefix}:{model}:{sha256(text)}
   */
  private getKey(text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `${this.keyPrefix}:${model}:${hash}`;
  }

  /**
   * Get cached embedding for text
   *
   * @param text - Input text
   * @param model - Embedding model name
   * @returns Embedding array if cached, null otherwise
   */
  async get(text: string, model: string): Promise<number[] | null> {
    const startTime = Date.now();
    const key = this.getKey(text, model);

    try {
      const cached = await this.redis.get(key);

      if (cached) {
        const data = JSON.parse(cached) as CachedEmbeddingEntry;
        this.recordHit(Date.now() - startTime);
        this.logger.debug({ model, cacheKey: key.slice(0, 50) }, 'Cache hit');
        return data.embedding;
      }

      this.recordMiss(Date.now() - startTime);
      return null;
    } catch (error) {
      this.recordError();
      this.logger.warn({ error, key }, 'Failed to get cached embedding');
      return null;
    }
  }

  /**
   * Get multiple cached embeddings at once
   *
   * @param texts - Array of input texts
   * @param model - Embedding model name
   * @returns Map of text to embedding (only includes cached entries)
   */
  async getMany(texts: string[], model: string): Promise<Map<string, number[]>> {
    if (texts.length === 0) {
      return new Map();
    }

    const startTime = Date.now();
    const results = new Map<string, number[]>();

    // Fetch each text individually (could be optimized with mget if Redis client supports it)
    for (const text of texts) {
      try {
        const embedding = await this.get(text, model);
        if (embedding) {
          results.set(text, embedding);
        }
      } catch {
        // Already logged in get()
      }
    }

    const latency = Date.now() - startTime;
    this.logger.debug(
      {
        total: texts.length,
        cached: results.size,
        latencyMs: latency,
      },
      'Batch cache lookup completed'
    );

    return results;
  }

  /**
   * Cache an embedding
   *
   * @param text - Input text
   * @param model - Embedding model name
   * @param embedding - Embedding vector
   * @param dimensions - Optional explicit dimensions
   */
  async set(text: string, model: string, embedding: number[], dimensions?: number): Promise<void> {
    const key = this.getKey(text, model);
    const contentHash = createHash('sha256').update(text).digest('hex');

    const data: CachedEmbeddingEntry = {
      embedding,
      model,
      dimensions: dimensions ?? embedding.length,
      cachedAt: new Date().toISOString(),
      contentHash,
    };

    try {
      await this.redis.set(key, JSON.stringify(data), {
        ttlSeconds: this.ttlSeconds,
      });
      this.logger.debug({ model, cacheKey: key.slice(0, 50) }, 'Cached embedding');
    } catch (error) {
      this.recordError();
      this.logger.warn({ error, key }, 'Failed to cache embedding');
    }
  }

  /**
   * Cache multiple embeddings at once
   *
   * @param entries - Array of text/embedding pairs
   * @param model - Embedding model name
   */
  async setMany(entries: { text: string; embedding: number[] }[], model: string): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const startTime = Date.now();
    let successCount = 0;

    for (const entry of entries) {
      try {
        await this.set(entry.text, model, entry.embedding);
        successCount++;
      } catch {
        // Already logged in set()
      }
    }

    const latency = Date.now() - startTime;
    this.logger.debug(
      {
        total: entries.length,
        successful: successCount,
        latencyMs: latency,
      },
      'Batch cache write completed'
    );
  }

  /**
   * Check if an embedding is cached
   *
   * @param text - Input text
   * @param model - Embedding model name
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
   *
   * @param text - Input text
   * @param model - Embedding model name
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
   *
   * @param model - Embedding model name
   */
  async invalidateModel(model: string): Promise<number> {
    const pattern = `${this.keyPrefix}:${model}:*`;

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
   * Get cache statistics
   */
  getStats(): EmbeddingCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      errors: this.errors,
      avgLatencyMs: this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;
    this.totalLatencyMs = 0;
    this.requestCount = 0;
  }

  /**
   * Get configured TTL in seconds
   */
  getTTL(): number {
    return this.ttlSeconds;
  }

  /**
   * Get key prefix
   */
  getKeyPrefix(): string {
    return this.keyPrefix;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private recordHit(latencyMs: number): void {
    if (this.enableMetrics) {
      this.hits++;
      this.totalLatencyMs += latencyMs;
      this.requestCount++;
    }
  }

  private recordMiss(latencyMs: number): void {
    if (this.enableMetrics) {
      this.misses++;
      this.totalLatencyMs += latencyMs;
      this.requestCount++;
    }
  }

  private recordError(): void {
    if (this.enableMetrics) {
      this.errors++;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an embedding cache instance
 *
 * @param redis - Redis client instance
 * @param config - Cache configuration
 */
export function createEmbeddingCacheRedis(
  redis: EmbeddingRedisClient,
  config?: EmbeddingCacheRedisConfig
): EmbeddingCacheRedis {
  return new EmbeddingCacheRedis(redis, config);
}
