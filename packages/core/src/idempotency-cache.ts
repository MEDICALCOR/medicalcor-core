/**
 * Redis-Backed Idempotency Cache
 *
 * Provides distributed idempotency checking for webhook handlers and
 * workflow triggers. Prevents duplicate processing across multiple
 * instances in production deployments.
 *
 * @module @medicalcor/core/idempotency-cache
 */

import type { SecureRedisClient } from './infrastructure/redis-client.js';
import { createLogger } from './logger.js';
import { createIdempotencyKey, createNamespacedIdempotencyKey } from './idempotency.js';

const logger = createLogger({ name: 'idempotency-cache' });

/**
 * Idempotency cache configuration
 */
export interface IdempotencyCacheConfig {
  /** Redis client for distributed storage */
  redis: SecureRedisClient;
  /** Default TTL for idempotency keys in seconds (default: 86400 = 24h) */
  defaultTTLSeconds?: number;
  /** Key prefix (default: 'idempotency:') */
  keyPrefix?: string;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Result of checking/acquiring idempotency
 */
export interface IdempotencyCheckResult {
  /** Whether this is the first time seeing this key (can proceed) */
  isNew: boolean;
  /** Whether the operation was previously completed */
  wasCompleted: boolean;
  /** When the key was first seen (if not new) */
  firstSeenAt?: Date;
  /** When the operation was completed (if completed) */
  completedAt?: Date;
  /** Stored result from previous completion (if any) */
  previousResult?: unknown;
}

/**
 * Idempotency entry stored in Redis
 */
interface IdempotencyEntry {
  firstSeenAt: string;
  status: 'processing' | 'completed' | 'failed';
  completedAt?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Cache statistics
 */
export interface IdempotencyCacheStats {
  hits: number;
  misses: number;
  duplicatesBlocked: number;
  completions: number;
  failures: number;
  hitRate: number;
}

/**
 * Redis-backed Idempotency Cache
 *
 * Ensures operations are only processed once, even across distributed
 * deployments. Uses atomic Redis operations to prevent race conditions.
 *
 * @example
 * ```typescript
 * const cache = createIdempotencyCache({ redis });
 *
 * // Check if message was already processed
 * const result = await cache.check(IdempotencyKeys.whatsAppMessage(messageId));
 *
 * if (!result.isNew) {
 *   logger.info('Duplicate message, skipping');
 *   return result.previousResult;
 * }
 *
 * try {
 *   const response = await processMessage(message);
 *   await cache.complete(IdempotencyKeys.whatsAppMessage(messageId), response);
 *   return response;
 * } catch (error) {
 *   await cache.fail(IdempotencyKeys.whatsAppMessage(messageId), error);
 *   throw error;
 * }
 * ```
 */
export class IdempotencyCache {
  private redis: SecureRedisClient;
  private config: Required<IdempotencyCacheConfig>;
  private stats: IdempotencyCacheStats = {
    hits: 0,
    misses: 0,
    duplicatesBlocked: 0,
    completions: 0,
    failures: 0,
    hitRate: 0,
  };

  constructor(config: IdempotencyCacheConfig) {
    this.redis = config.redis;
    this.config = {
      redis: config.redis,
      defaultTTLSeconds: config.defaultTTLSeconds ?? 86400, // 24 hours
      keyPrefix: config.keyPrefix ?? 'idempotency:',
      enableMetrics: config.enableMetrics ?? true,
    };

    logger.info(
      { ttlSeconds: this.config.defaultTTLSeconds, prefix: this.config.keyPrefix },
      'Idempotency cache initialized'
    );
  }

  /**
   * Check if an operation with this idempotency key has been seen before.
   * If not, atomically marks it as "processing" to prevent concurrent execution.
   *
   * @param key - Idempotency key (use IdempotencyKeys helpers to generate)
   * @param ttlSeconds - Optional custom TTL for this key
   * @returns Result indicating if this is a new operation or duplicate
   */
  async check(key: string, ttlSeconds?: number): Promise<IdempotencyCheckResult> {
    const fullKey = this.getFullKey(key);
    const ttl = ttlSeconds ?? this.config.defaultTTLSeconds;

    try {
      // Try to atomically set the key if it doesn't exist
      const entry: IdempotencyEntry = {
        firstSeenAt: new Date().toISOString(),
        status: 'processing',
      };

      const result = await this.redis.set(fullKey, JSON.stringify(entry), {
        ttlSeconds: ttl,
        // NX = only set if not exists (atomic check-and-set)
        nx: true,
      });

      if (result) {
        // Key was set - this is a new operation
        this.stats.misses++;
        this.updateHitRate();

        logger.debug({ key, ttl }, 'Idempotency key acquired');
        return { isNew: true, wasCompleted: false };
      }

      // Key already exists - fetch the current state
      this.stats.hits++;
      this.stats.duplicatesBlocked++;
      this.updateHitRate();

      const existing = await this.redis.get(fullKey);
      if (!existing) {
        // Edge case: key expired between check and get
        // Retry once
        return await this.check(key, ttlSeconds);
      }

      const existingEntry = JSON.parse(existing) as IdempotencyEntry;

      logger.debug({ key, status: existingEntry.status }, 'Duplicate idempotency key detected');

      return {
        isNew: false,
        wasCompleted: existingEntry.status === 'completed',
        firstSeenAt: new Date(existingEntry.firstSeenAt),
        completedAt: existingEntry.completedAt ? new Date(existingEntry.completedAt) : undefined,
        previousResult: existingEntry.result,
      };
    } catch (error) {
      logger.error({ error, key }, 'Idempotency check failed');
      // On Redis failure, allow the operation to proceed (fail-open)
      // This prevents Redis outages from blocking all operations
      return { isNew: true, wasCompleted: false };
    }
  }

  /**
   * Mark an operation as successfully completed and optionally store its result.
   *
   * @param key - Idempotency key
   * @param result - Optional result to store for future duplicate checks
   * @param ttlSeconds - Optional custom TTL (extends from now)
   */
  async complete(key: string, result?: unknown, ttlSeconds?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const ttl = ttlSeconds ?? this.config.defaultTTLSeconds;

    try {
      const existing = await this.redis.get(fullKey);
      if (!existing) {
        // Key expired or never existed - create new completed entry
        const entry: IdempotencyEntry = {
          firstSeenAt: new Date().toISOString(),
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: this.sanitizeResult(result),
        };

        await this.redis.set(fullKey, JSON.stringify(entry), { ttlSeconds: ttl });
      } else {
        // Update existing entry to completed
        const entry = JSON.parse(existing) as IdempotencyEntry;
        entry.status = 'completed';
        entry.completedAt = new Date().toISOString();
        entry.result = this.sanitizeResult(result);

        await this.redis.set(fullKey, JSON.stringify(entry), { ttlSeconds: ttl });
      }

      this.stats.completions++;
      logger.debug({ key }, 'Idempotency key marked as completed');
    } catch (error) {
      logger.error({ error, key }, 'Failed to mark idempotency key as completed');
      // Non-fatal - the operation already succeeded
    }
  }

  /**
   * Mark an operation as failed. This allows retries by removing the lock
   * or keeping a failure record depending on configuration.
   *
   * @param key - Idempotency key
   * @param error - Optional error to store
   * @param allowRetry - Whether to allow retry (removes the key if true)
   */
  async fail(key: string, error?: unknown, allowRetry = true): Promise<void> {
    const fullKey = this.getFullKey(key);

    try {
      if (allowRetry) {
        // Remove the key to allow retry
        await this.redis.del(fullKey);
        logger.debug({ key }, 'Idempotency key removed (retry allowed)');
      } else {
        // Mark as permanently failed
        const existing = await this.redis.get(fullKey);
        const entry: IdempotencyEntry = existing
          ? (JSON.parse(existing) as IdempotencyEntry)
          : { firstSeenAt: new Date().toISOString(), status: 'failed' };

        entry.status = 'failed';
        entry.completedAt = new Date().toISOString();
        entry.metadata = {
          ...entry.metadata,
          error: error instanceof Error ? error.message : String(error),
        };

        await this.redis.set(fullKey, JSON.stringify(entry), {
          ttlSeconds: this.config.defaultTTLSeconds,
        });
        logger.debug({ key }, 'Idempotency key marked as failed (no retry)');
      }

      this.stats.failures++;
    } catch (redisError) {
      logger.error({ error: redisError, key }, 'Failed to mark idempotency key as failed');
    }
  }

  /**
   * Execute a function with idempotency protection.
   * Combines check, execute, and complete/fail in one call.
   *
   * @param key - Idempotency key
   * @param fn - Function to execute if this is a new operation
   * @param options - Optional configuration
   * @returns Result of the function, or previous result if duplicate
   */
  async withIdempotency<T>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      ttlSeconds?: number;
      allowRetryOnFailure?: boolean;
      returnPreviousResult?: boolean;
    }
  ): Promise<T | undefined> {
    const { ttlSeconds, allowRetryOnFailure = true, returnPreviousResult = true } = options ?? {};

    const checkResult = await this.check(key, ttlSeconds);

    if (!checkResult.isNew) {
      if (
        checkResult.wasCompleted &&
        returnPreviousResult &&
        checkResult.previousResult !== undefined
      ) {
        return checkResult.previousResult as T;
      }
      // Duplicate but either not completed or no result stored
      return undefined;
    }

    try {
      const result = await fn();
      await this.complete(key, result, ttlSeconds);
      return result;
    } catch (error) {
      await this.fail(key, error, allowRetryOnFailure);
      throw error;
    }
  }

  /**
   * Check if a key exists without acquiring it
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    try {
      const count = await this.redis.exists(fullKey);
      return count > 0;
    } catch (error) {
      logger.error({ error, key }, 'Idempotency exists check failed');
      return false;
    }
  }

  /**
   * Manually remove an idempotency key (use with caution)
   */
  async remove(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    try {
      const deleted = await this.redis.del(fullKey);
      return deleted > 0;
    } catch (error) {
      logger.error({ error, key }, 'Idempotency key removal failed');
      return false;
    }
  }

  /**
   * Get current cache statistics
   */
  getStats(): IdempotencyCacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      duplicatesBlocked: 0,
      completions: 0,
      failures: 0,
      hitRate: 0,
    };
  }

  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private sanitizeResult(result: unknown): unknown {
    if (result === undefined || result === null) {
      return result;
    }

    try {
      // Ensure result is JSON-serializable and not too large
      const serialized = JSON.stringify(result);
      if (serialized.length > 10000) {
        // Don't store very large results
        logger.warn('Idempotency result too large to store, truncating');
        return { _truncated: true, _size: serialized.length };
      }
      return result;
    } catch {
      // Result is not serializable
      return { _type: typeof result, _serializable: false };
    }
  }
}

/**
 * Create a new idempotency cache instance
 */
export function createIdempotencyCache(config: IdempotencyCacheConfig): IdempotencyCache {
  return new IdempotencyCache(config);
}

/**
 * Create idempotency cache from environment configuration
 * Returns null if Redis is not configured
 */
export function createIdempotencyCacheFromEnv(
  redis: SecureRedisClient | null
): IdempotencyCache | null {
  if (!redis) {
    logger.warn('Redis not configured, idempotency cache disabled');
    return null;
  }

  const ttl = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS ?? '86400', 10);
  const prefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? 'idempotency:';

  return createIdempotencyCache({
    redis,
    defaultTTLSeconds: ttl,
    keyPrefix: prefix,
  });
}

// Re-export key generation utilities for convenience
export { createIdempotencyKey, createNamespacedIdempotencyKey };
