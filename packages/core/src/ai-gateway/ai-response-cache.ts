/**
 * AI Response Cache Service
 *
 * Redis-based caching for AI responses with:
 * - Semantic similarity caching (cache hits for similar queries)
 * - TTL-based expiration
 * - Cache key management
 * - Hit rate monitoring
 * - Cache invalidation strategies
 */

import crypto from 'crypto';
import { z } from 'zod';
import type { SecureRedisClient } from '../infrastructure/redis-client.js';

/**
 * Cached AI response structure
 */
export interface CachedAIResponse {
  /** Original query that generated this response */
  query: string;
  /** Query hash for exact matching */
  queryHash: string;
  /** The cached AI response */
  response: string;
  /** Response metadata */
  metadata: {
    /** Model used to generate response */
    model: string;
    /** Temperature setting */
    temperature: number;
    /** Tokens used */
    tokensUsed?: number | undefined;
    /** Response type */
    responseType: 'scoring' | 'reply' | 'summary' | 'general';
    /** Language */
    language?: string | undefined;
    /** Confidence score if applicable */
    confidence?: number | undefined;
  };
  /** Patient context hash (if applicable) */
  contextHash?: string | undefined;
  /** Clinic ID for cache isolation */
  clinicId?: string | undefined;
  /** Creation timestamp */
  createdAt: string;
  /** Cache hit count */
  hitCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache entries */
  totalEntries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Average response size in bytes */
  avgResponseSize: number;
  /** Memory usage estimate */
  memoryUsageBytes: number;
  /** Entries by response type */
  entriesByType: Record<string, number>;
}

/**
 * Cache configuration
 */
export const AIResponseCacheConfigSchema = z.object({
  /** Enable caching */
  enabled: z.boolean().default(true),
  /** Default TTL in seconds */
  defaultTTLSeconds: z.number().int().min(60).max(86400).default(3600), // 1 hour
  /** TTL by response type */
  ttlByType: z
    .object({
      scoring: z.number().int().min(60).max(86400).default(1800), // 30 min (lead scores can change)
      reply: z.number().int().min(60).max(86400).default(3600), // 1 hour
      summary: z.number().int().min(60).max(86400).default(7200), // 2 hours
      general: z.number().int().min(60).max(86400).default(3600), // 1 hour
    })
    .default({}),
  /** Key prefix for all cache entries */
  keyPrefix: z.string().default('ai:cache:'),
  /** Maximum cached response size in bytes */
  maxResponseSize: z.number().int().min(100).max(1000000).default(50000), // 50KB
  /** Enable semantic similarity matching (requires embedding comparison) */
  enableSemanticMatching: z.boolean().default(false),
  /** Similarity threshold for semantic matching */
  semanticSimilarityThreshold: z.number().min(0.8).max(1.0).default(0.95),
  /** Isolate cache by clinic ID */
  isolateByClinic: z.boolean().default(true),
  /** Maximum entries per clinic (for memory management) */
  maxEntriesPerClinic: z.number().int().min(100).max(100000).default(10000),
  /** Enable cache hit counting */
  trackHits: z.boolean().default(true),
});

export type AIResponseCacheConfig = z.infer<typeof AIResponseCacheConfigSchema>;

/**
 * Cache key components for lookup
 */
interface CacheKeyComponents {
  queryHash: string;
  responseType: string;
  clinicId?: string | undefined;
  contextHash?: string | undefined;
  model?: string | undefined;
}

/**
 * AI Response Cache Service
 */
export class AIResponseCache {
  private redis: SecureRedisClient;
  private config: AIResponseCacheConfig;
  private stats: {
    hits: number;
    misses: number;
    totalResponseSize: number;
    responseCount: number;
  };

  constructor(redis: SecureRedisClient, config: Partial<AIResponseCacheConfig> = {}) {
    this.redis = redis;
    this.config = AIResponseCacheConfigSchema.parse(config);
    this.stats = {
      hits: 0,
      misses: 0,
      totalResponseSize: 0,
      responseCount: 0,
    };
  }

  /**
   * Get cached response for a query
   */
  async get(
    query: string,
    options: {
      responseType: 'scoring' | 'reply' | 'summary' | 'general';
      clinicId?: string;
      contextHash?: string;
      model?: string;
    }
  ): Promise<CachedAIResponse | null> {
    if (!this.config.enabled) {
      return null;
    }

    const queryHash = this.hashQuery(query);
    const cacheKey = this.buildCacheKey({
      queryHash,
      responseType: options.responseType,
      clinicId: this.config.isolateByClinic ? options.clinicId : undefined,
      contextHash: options.contextHash,
      model: options.model,
    });

    try {
      const cached = await this.redis.get(cacheKey);

      if (!cached) {
        this.stats.misses++;
        return null;
      }

      const response = JSON.parse(cached) as CachedAIResponse;

      // Update hit count if tracking enabled
      if (this.config.trackHits) {
        response.hitCount++;
        response.lastAccessedAt = new Date().toISOString();
        await this.redis.set(cacheKey, JSON.stringify(response), {
          ttlSeconds: this.getTTL(options.responseType),
        });
      }

      this.stats.hits++;
      return response;
    } catch {
      // Failed to get cached response - graceful degradation
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Cache an AI response
   */
  async set(
    query: string,
    response: string,
    options: {
      responseType: 'scoring' | 'reply' | 'summary' | 'general';
      clinicId?: string;
      contextHash?: string;
      model: string;
      temperature: number;
      tokensUsed?: number;
      language?: string;
      confidence?: number;
    }
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Check response size limit
    if (response.length > this.config.maxResponseSize) {
      // Response too large to cache - skip caching
      return false;
    }

    const queryHash = this.hashQuery(query);
    const cacheKey = this.buildCacheKey({
      queryHash,
      responseType: options.responseType,
      clinicId: this.config.isolateByClinic ? options.clinicId : undefined,
      contextHash: options.contextHash,
      model: options.model,
    });

    const cachedResponse: CachedAIResponse = {
      query,
      queryHash,
      response,
      metadata: {
        model: options.model,
        temperature: options.temperature,
        tokensUsed: options.tokensUsed,
        responseType: options.responseType,
        language: options.language,
        confidence: options.confidence,
      },
      contextHash: options.contextHash,
      clinicId: options.clinicId,
      createdAt: new Date().toISOString(),
      hitCount: 0,
      lastAccessedAt: new Date().toISOString(),
    };

    try {
      const ttl = this.getTTL(options.responseType);
      await this.redis.set(cacheKey, JSON.stringify(cachedResponse), { ttlSeconds: ttl });

      // Track index for clinic if isolation enabled
      if (this.config.isolateByClinic && options.clinicId) {
        await this.addToClinicIndex(options.clinicId, cacheKey);
      }

      // Update stats
      this.stats.totalResponseSize += response.length;
      this.stats.responseCount++;

      return true;
    } catch {
      // Failed to cache response - continue without caching
      return false;
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(
    query: string,
    options: {
      responseType: 'scoring' | 'reply' | 'summary' | 'general';
      clinicId?: string;
      contextHash?: string;
      model?: string;
    }
  ): Promise<boolean> {
    const queryHash = this.hashQuery(query);
    const cacheKey = this.buildCacheKey({
      queryHash,
      responseType: options.responseType,
      clinicId: this.config.isolateByClinic ? options.clinicId : undefined,
      contextHash: options.contextHash,
      model: options.model,
    });

    try {
      const deleted = await this.redis.del(cacheKey);
      return deleted > 0;
    } catch {
      // Failed to invalidate cache - continue
      return false;
    }
  }

  /**
   * Invalidate all cache entries for a clinic
   */
  async invalidateClinic(clinicId: string): Promise<number> {
    try {
      const indexKey = `${this.config.keyPrefix}clinic:${clinicId}:keys`;
      const keys = await this.redis.smembers(indexKey);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      await this.redis.del(indexKey);

      return deleted;
    } catch {
      // Failed to invalidate clinic cache - continue
      return 0;
    }
  }

  /**
   * Invalidate all cache entries by response type
   */
  async invalidateByType(
    responseType: 'scoring' | 'reply' | 'summary' | 'general'
  ): Promise<number> {
    try {
      // Use pattern matching to find all keys of this type
      const pattern = `${this.config.keyPrefix}*:${responseType}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      return await this.redis.del(...keys);
    } catch {
      // Failed to invalidate by type - continue
      return 0;
    }
  }

  /**
   * Invalidate all cache entries for a patient (by context hash)
   */
  async invalidatePatient(contextHash: string): Promise<number> {
    try {
      const pattern = `${this.config.keyPrefix}*:ctx:${contextHash}`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      return await this.redis.del(...keys);
    } catch {
      // Failed to invalidate patient cache - continue
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const avgResponseSize =
      this.stats.responseCount > 0 ? this.stats.totalResponseSize / this.stats.responseCount : 0;

    // Get entry count by type
    const entriesByType: Record<string, number> = {};
    const types = ['scoring', 'reply', 'summary', 'general'];

    for (const type of types) {
      const pattern = `${this.config.keyPrefix}*:${type}:*`;
      const keys = await this.redis.keys(pattern);
      entriesByType[type] = keys.length;
    }

    const totalEntries = Object.values(entriesByType).reduce((a, b) => a + b, 0);

    return {
      totalEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      avgResponseSize: Math.round(avgResponseSize),
      memoryUsageBytes: this.stats.totalResponseSize,
      entriesByType,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalResponseSize: 0,
      responseCount: 0,
    };
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(
    queries: {
      query: string;
      response: string;
      options: Parameters<AIResponseCache['set']>[2];
    }[]
  ): Promise<number> {
    let cached = 0;

    for (const item of queries) {
      const success = await this.set(item.query, item.response, item.options);
      if (success) cached++;
    }

    return cached;
  }

  /**
   * Check if a query is cached
   */
  async has(
    query: string,
    options: {
      responseType: 'scoring' | 'reply' | 'summary' | 'general';
      clinicId?: string;
      contextHash?: string;
      model?: string;
    }
  ): Promise<boolean> {
    const queryHash = this.hashQuery(query);
    const cacheKey = this.buildCacheKey({
      queryHash,
      responseType: options.responseType,
      clinicId: this.config.isolateByClinic ? options.clinicId : undefined,
      contextHash: options.contextHash,
      model: options.model,
    });

    const exists = await this.redis.exists(cacheKey);
    return exists > 0;
  }

  /**
   * Get TTL for response type
   */
  private getTTL(responseType: 'scoring' | 'reply' | 'summary' | 'general'): number {
    const typeTTLs = this.config.ttlByType as Record<string, number>;
    return typeTTLs[responseType] ?? this.config.defaultTTLSeconds;
  }

  /**
   * Build cache key from components
   */
  private buildCacheKey(components: CacheKeyComponents): string {
    const parts = [this.config.keyPrefix];

    if (components.clinicId) {
      parts.push(`c:${components.clinicId}`);
    }

    parts.push(components.responseType);
    parts.push(components.queryHash.substring(0, 16)); // Use first 16 chars of hash

    if (components.contextHash) {
      parts.push(`ctx:${components.contextHash.substring(0, 8)}`);
    }

    if (components.model) {
      parts.push(`m:${this.sanitizeModelName(components.model)}`);
    }

    return parts.join(':');
  }

  /**
   * Hash query for cache key
   */
  private hashQuery(query: string): string {
    // Normalize query before hashing
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Sanitize model name for cache key
   */
  private sanitizeModelName(model: string): string {
    return model.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20);
  }

  /**
   * Add cache key to clinic index
   */
  private async addToClinicIndex(clinicId: string, cacheKey: string): Promise<void> {
    const indexKey = `${this.config.keyPrefix}clinic:${clinicId}:keys`;

    // Add to set
    await this.redis.sadd(indexKey, cacheKey);

    // Check if we need to prune old entries
    const members = await this.redis.smembers(indexKey);
    if (members.length > this.config.maxEntriesPerClinic) {
      // Remove oldest entries (this is a simple FIFO approach)
      const toRemove = members.slice(0, members.length - this.config.maxEntriesPerClinic);
      if (toRemove.length > 0) {
        await this.redis.del(...toRemove);
        await this.redis.srem(indexKey, ...toRemove);
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): AIResponseCacheConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AIResponseCacheConfig>): void {
    this.config = AIResponseCacheConfigSchema.parse({ ...this.config, ...updates });
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable caching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

/**
 * Factory function
 */
export function createAIResponseCache(
  redis: SecureRedisClient,
  config?: Partial<AIResponseCacheConfig>
): AIResponseCache {
  return new AIResponseCache(redis, config);
}

/**
 * Helper: Create context hash from patient data
 */
export function createContextHash(patientData: {
  phone?: string;
  contactId?: string;
  procedureInterest?: string;
  leadScore?: number;
}): string {
  const normalized = JSON.stringify({
    phone: patientData.phone,
    contactId: patientData.contactId,
    procedureInterest: patientData.procedureInterest,
    leadScore: patientData.leadScore,
  });

  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
