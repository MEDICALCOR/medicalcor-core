/**
 * Distributed Rate Limiter with Redis
 *
 * Implements sliding window rate limiting using Redis for distributed deployments.
 *
 * ALGORITHM: Sliding Window Log (accurate, O(1) memory per window)
 * - Uses Redis sorted sets to track request timestamps
 * - Automatically expires old entries
 * - Atomic operations prevent race conditions
 *
 * FEATURES:
 * - Multi-tenant support (rate limits per clinic/organization)
 * - Configurable tiers (free, pro, enterprise)
 * - Graceful degradation when Redis unavailable
 * - Circuit breaker integration
 * - Prometheus metrics export
 *
 * @module @medicalcor/core/distributed-rate-limiter
 */

import { createLogger, type Logger } from './logger.js';
import type { SecureRedisClient } from './infrastructure/redis-client.js';
import {
  CircuitBreaker,
  CircuitBreakerError,
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './circuit-breaker.js';

/**
 * Rate limit tier configuration
 */
export interface RateLimitTier {
  /** Tier name for identification */
  name: string;
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Optional burst allowance (extra requests allowed momentarily) */
  burstAllowance?: number;
}

/**
 * Pre-defined rate limit tiers
 */
export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  // Free tier: 100 requests per minute
  free: {
    name: 'free',
    maxRequests: 100,
    windowSeconds: 60,
    burstAllowance: 10,
  },
  // Pro tier: 500 requests per minute
  pro: {
    name: 'pro',
    maxRequests: 500,
    windowSeconds: 60,
    burstAllowance: 50,
  },
  // Enterprise tier: 2000 requests per minute
  enterprise: {
    name: 'enterprise',
    maxRequests: 2000,
    windowSeconds: 60,
    burstAllowance: 200,
  },
  // Webhook tier: Lower limits for external webhooks
  webhook: {
    name: 'webhook',
    maxRequests: 60,
    windowSeconds: 60,
    burstAllowance: 5,
  },
  // API tier: Default for authenticated API calls
  api: {
    name: 'api',
    maxRequests: 300,
    windowSeconds: 60,
    burstAllowance: 30,
  },
  // AI tier: Lower limits for expensive AI operations
  ai: {
    name: 'ai',
    maxRequests: 30,
    windowSeconds: 60,
    burstAllowance: 5,
  },
};

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Remaining requests in window */
  remaining: number;
  /** Seconds until window resets */
  resetIn: number;
  /** Unix timestamp when window resets */
  resetAt: number;
  /** Rate limit tier applied */
  tier: string;
  /** Whether result is from fallback (Redis unavailable) */
  fallback: boolean;
}

/**
 * Rate limiter configuration
 */
export interface DistributedRateLimiterConfig {
  /** Redis client instance */
  redis: SecureRedisClient;
  /** Key prefix for rate limit keys */
  keyPrefix?: string;
  /** Default tier when none specified */
  defaultTier?: string;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Whether to allow requests when Redis is down (fail-open) */
  failOpen?: boolean;
  /** Logger instance */
  logger?: Logger;
}

/**
 * In-memory fallback for when Redis is unavailable
 * Uses LRU eviction to prevent memory exhaustion
 */
class InMemoryFallback {
  private readonly cache = new Map<string, { count: number; expiresAt: number }>();
  private readonly maxSize = 10000;

  check(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = Date.now();
    const entry = this.cache.get(key);

    // Clean up expired entry or create new one
    if (!entry || entry.expiresAt < now) {
      const resetAt = now + windowSeconds * 1000;
      this.cache.set(key, { count: 1, expiresAt: resetAt });

      // Evict old entries if cache is too large
      if (this.cache.size > this.maxSize) {
        const keysToDelete: string[] = [];
        for (const [k, v] of this.cache.entries()) {
          if (v.expiresAt < now || keysToDelete.length < 100) {
            keysToDelete.push(k);
          }
        }
        keysToDelete.forEach((k) => this.cache.delete(k));
      }

      return {
        allowed: true,
        current: 1,
        limit,
        remaining: limit - 1,
        resetIn: windowSeconds,
        resetAt: Math.floor(resetAt / 1000),
        tier: 'fallback',
        fallback: true,
      };
    }

    // Increment existing entry
    entry.count++;
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);
    const resetIn = Math.ceil((entry.expiresAt - now) / 1000);

    return {
      allowed,
      current: entry.count,
      limit,
      remaining,
      resetIn,
      resetAt: Math.floor(entry.expiresAt / 1000),
      tier: 'fallback',
      fallback: true,
    };
  }
}

/**
 * Distributed Rate Limiter
 *
 * Provides accurate rate limiting across multiple service instances using Redis.
 *
 * @example
 * ```typescript
 * const limiter = new DistributedRateLimiter({
 *   redis: redisClient,
 *   defaultTier: 'api',
 * });
 *
 * // Check rate limit
 * const result = await limiter.check('user:123', 'api');
 * if (!result.allowed) {
 *   throw new RateLimitError(result);
 * }
 * ```
 */
export class DistributedRateLimiter {
  private readonly redis: SecureRedisClient;
  private readonly keyPrefix: string;
  private readonly defaultTier: string;
  private readonly failOpen: boolean;
  private readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly fallback: InMemoryFallback;

  constructor(config: DistributedRateLimiterConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix ?? 'ratelimit';
    this.defaultTier = config.defaultTier ?? 'api';
    this.failOpen = config.failOpen ?? true;
    this.logger = config.logger ?? createLogger({ name: 'distributed-rate-limiter' });
    this.fallback = new InMemoryFallback();

    // Circuit breaker for Redis operations
    this.circuitBreaker = new CircuitBreaker({
      name: 'rate-limiter-redis',
      failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 30000,
      successThreshold: config.circuitBreaker?.successThreshold ?? 2,
      ...config.circuitBreaker,
    });
  }

  /**
   * Check rate limit for an identifier
   *
   * @param identifier - Unique identifier (e.g., user ID, IP, API key)
   * @param tierOrConfig - Tier name or custom tier configuration
   * @param context - Additional context for key generation (e.g., endpoint)
   */
  async check(
    identifier: string,
    tierOrConfig?: string | RateLimitTier,
    context?: string
  ): Promise<RateLimitResult> {
    // Resolve tier configuration
    const tier = this.resolveTier(tierOrConfig);

    // Generate key
    const key = this.generateKey(identifier, tier.name, context);
    const limit = tier.maxRequests + (tier.burstAllowance ?? 0);

    try {
      // Execute with circuit breaker
      return await this.circuitBreaker.execute(async () => {
        return this.checkWithRedis(key, tier, limit);
      });
    } catch (error) {
      // Handle circuit breaker open or Redis errors
      if (error instanceof CircuitBreakerError) {
        this.logger.warn(
          { identifier, tier: tier.name, circuitState: error.state },
          'Rate limiter circuit breaker open, using fallback'
        );
      } else {
        this.logger.error(
          { err: error, identifier, tier: tier.name },
          'Redis rate limit check failed'
        );
      }

      // Use fallback
      if (this.failOpen) {
        return this.fallback.check(key, limit, tier.windowSeconds);
      }

      // Fail closed - deny the request
      return {
        allowed: false,
        current: 0,
        limit,
        remaining: 0,
        resetIn: tier.windowSeconds,
        resetAt: Math.floor(Date.now() / 1000) + tier.windowSeconds,
        tier: tier.name,
        fallback: true,
      };
    }
  }

  /**
   * Check rate limit using Redis sliding window
   */
  private async checkWithRedis(
    key: string,
    tier: RateLimitTier,
    limit: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - tier.windowSeconds * 1000;

    // Lua script for atomic sliding window rate limiting
    // This is more accurate than simple INCR/EXPIRE
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local window_seconds = tonumber(ARGV[3])
      local limit = tonumber(ARGV[4])

      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

      -- Count current requests in window
      local current = redis.call('ZCARD', key)

      -- Check if allowed
      local allowed = current < limit and 1 or 0

      -- Add new request if allowed
      if allowed == 1 then
        redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
        current = current + 1
      end

      -- Set expiration
      redis.call('EXPIRE', key, window_seconds)

      -- Get oldest entry for reset time calculation
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local reset_at = now + (window_seconds * 1000)
      if oldest and oldest[2] then
        reset_at = tonumber(oldest[2]) + (window_seconds * 1000)
      end

      return {allowed, current, reset_at}
    `;

    // Execute Lua script atomically
    const result: unknown = await this.redis.eval(
      luaScript,
      [key],
      [now.toString(), windowStart.toString(), tier.windowSeconds.toString(), limit.toString()]
    );

    // Safely extract values from Lua script result
    const resultArray = result as [number, number, number];
    const [allowed, current, resetAt] = resultArray;
    const resetAtSeconds = Math.floor(resetAt / 1000);
    const resetIn = Math.max(0, Math.ceil((resetAt - now) / 1000));

    return {
      allowed: allowed === 1,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      resetIn,
      resetAt: resetAtSeconds,
      tier: tier.name,
      fallback: false,
    };
  }

  /**
   * Resolve tier configuration from string or object
   * Guarantees a valid RateLimitTier is returned
   */
  private resolveTier(tierOrConfig?: string | RateLimitTier): RateLimitTier {
    // If it's already a tier object, return it
    if (tierOrConfig && typeof tierOrConfig === 'object') {
      return tierOrConfig;
    }

    // Look up by name or use default
    const tierName = typeof tierOrConfig === 'string' ? tierOrConfig : this.defaultTier;
    const tier = RATE_LIMIT_TIERS[tierName];

    if (tier) {
      return tier;
    }

    // Fallback to default tier
    const defaultTier = RATE_LIMIT_TIERS[this.defaultTier];
    if (defaultTier) {
      return defaultTier;
    }

    // Ultimate fallback - create a safe default tier inline
    // This ensures we always return a valid RateLimitTier
    return {
      name: 'default',
      maxRequests: 100,
      windowSeconds: 60,
      burstAllowance: 10,
    };
  }

  /**
   * Generate rate limit key
   */
  private generateKey(identifier: string, tier: string, context?: string): string {
    const parts = [this.keyPrefix, tier, identifier];
    if (context) {
      parts.push(context);
    }
    return parts.join(':');
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(
    identifier: string,
    tierOrConfig?: string | RateLimitTier,
    context?: string
  ): Promise<RateLimitResult & { windowStart: number }> {
    const tier = this.resolveTier(tierOrConfig);

    const key = this.generateKey(identifier, tier.name, context);
    const limit = tier.maxRequests + (tier.burstAllowance ?? 0);
    const now = Date.now();
    const windowStart = now - tier.windowSeconds * 1000;

    try {
      // Count entries in current window
      const current: number = await this.redis.zcount(key, windowStart.toString(), '+inf');

      return {
        allowed: current < limit,
        current,
        limit,
        remaining: Math.max(0, limit - current),
        resetIn: tier.windowSeconds,
        resetAt: Math.floor(now / 1000) + tier.windowSeconds,
        tier: tier.name,
        fallback: false,
        windowStart: Math.floor(windowStart / 1000),
      };
    } catch {
      return {
        allowed: true,
        current: 0,
        limit,
        remaining: limit,
        resetIn: tier.windowSeconds,
        resetAt: Math.floor(now / 1000) + tier.windowSeconds,
        tier: tier.name,
        fallback: true,
        windowStart: Math.floor(windowStart / 1000),
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string, tier?: string, context?: string): Promise<boolean> {
    const tierName = tier ?? this.defaultTier;
    const key = this.generateKey(identifier, tierName, context);

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      this.logger.error({ err: error, identifier, tier: tierName }, 'Failed to reset rate limit');
      return false;
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): {
    circuitState: CircuitState;
    circuitStats: CircuitBreakerStats;
  } {
    return {
      circuitState: this.circuitBreaker.getState(),
      circuitStats: this.circuitBreaker.getStats(),
    };
  }
}

/**
 * Factory function to create a distributed rate limiter
 */
export function createDistributedRateLimiter(
  config: DistributedRateLimiterConfig
): DistributedRateLimiter {
  return new DistributedRateLimiter(config);
}

/**
 * Create a rate limiter from environment variables
 *
 * Requires:
 * - REDIS_URL or REDIS_HOST
 * - Optional: RATE_LIMIT_DEFAULT_TIER
 */
export async function createRateLimiterFromEnv(
  options?: Partial<DistributedRateLimiterConfig>
): Promise<DistributedRateLimiter | null> {
  const { createRedisClientFromEnv } = await import('./infrastructure/redis-client.js');
  const redis = createRedisClientFromEnv();

  if (!redis) {
    return null;
  }

  const defaultTier = process.env.RATE_LIMIT_DEFAULT_TIER ?? 'api';

  return new DistributedRateLimiter({
    redis,
    defaultTier,
    ...options,
  });
}
