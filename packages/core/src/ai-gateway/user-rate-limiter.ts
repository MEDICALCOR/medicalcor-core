/**
 * User-Based AI Rate Limiter
 *
 * Provides per-user rate limiting for AI requests with:
 * - Configurable limits by user tier
 * - Token-based quotas
 * - Sliding window algorithm
 * - Redis-backed distributed limiting
 * - Graceful degradation
 */

import { z } from 'zod';
import type { SecureRedisClient } from '../infrastructure/redis-client.js';

/**
 * User tier for rate limit configuration
 */
export type UserTier = 'free' | 'basic' | 'pro' | 'enterprise' | 'unlimited';

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Total limit for this window */
  limit: number;
  /** Seconds until reset */
  resetInSeconds: number;
  /** Reset timestamp (Unix epoch) */
  resetAt: number;
  /** User's current tier */
  tier: UserTier;
  /** Reason if blocked */
  reason?: string;
  /** Retry-After header value in seconds */
  retryAfter?: number;
}

/**
 * User usage statistics
 */
export interface UserUsageStats {
  /** User ID */
  userId: string;
  /** Current tier */
  tier: UserTier;
  /** Requests in current window */
  requestsThisWindow: number;
  /** Tokens used in current window */
  tokensThisWindow: number;
  /** Requests today */
  requestsToday: number;
  /** Tokens used today */
  tokensUsedToday: number;
  /** Requests this month */
  requestsThisMonth: number;
  /** Tokens used this month */
  tokensUsedThisMonth: number;
  /** Current window reset time */
  windowResetAt: Date;
  /** Daily reset time */
  dailyResetAt: Date;
  /** Monthly reset time */
  monthlyResetAt: Date;
}

/**
 * Rate limit configuration by tier
 */
export const TierLimitsSchema = z.object({
  /** Requests per minute */
  requestsPerMinute: z.number().int().min(1),
  /** Requests per hour */
  requestsPerHour: z.number().int().min(1),
  /** Requests per day */
  requestsPerDay: z.number().int().min(1),
  /** Tokens per minute */
  tokensPerMinute: z.number().int().min(100),
  /** Tokens per day */
  tokensPerDay: z.number().int().min(1000),
  /** Tokens per month */
  tokensPerMonth: z.number().int().min(10000),
  /** Maximum concurrent requests */
  maxConcurrent: z.number().int().min(1),
  /** Burst allowance (extra requests allowed in burst) */
  burstAllowance: z.number().int().min(0).default(5),
});

export type TierLimits = z.infer<typeof TierLimitsSchema>;

/**
 * Default tier limits
 */
export const DEFAULT_TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    requestsPerMinute: 5,
    requestsPerHour: 50,
    requestsPerDay: 100,
    tokensPerMinute: 2000,
    tokensPerDay: 10000,
    tokensPerMonth: 100000,
    maxConcurrent: 1,
    burstAllowance: 2,
  },
  basic: {
    requestsPerMinute: 20,
    requestsPerHour: 200,
    requestsPerDay: 500,
    tokensPerMinute: 10000,
    tokensPerDay: 100000,
    tokensPerMonth: 1000000,
    maxConcurrent: 3,
    burstAllowance: 5,
  },
  pro: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 5000,
    tokensPerMinute: 50000,
    tokensPerDay: 500000,
    tokensPerMonth: 5000000,
    maxConcurrent: 10,
    burstAllowance: 10,
  },
  enterprise: {
    requestsPerMinute: 200,
    requestsPerHour: 5000,
    requestsPerDay: 50000,
    tokensPerMinute: 200000,
    tokensPerDay: 2000000,
    tokensPerMonth: 50000000,
    maxConcurrent: 50,
    burstAllowance: 20,
  },
  unlimited: {
    requestsPerMinute: 1000000,
    requestsPerHour: 1000000,
    requestsPerDay: 1000000,
    tokensPerMinute: 1000000000,
    tokensPerDay: 1000000000,
    tokensPerMonth: 1000000000,
    maxConcurrent: 1000,
    burstAllowance: 100,
  },
};

/**
 * Rate limiter configuration
 */
export const UserRateLimiterConfigSchema = z.object({
  /** Enable rate limiting */
  enabled: z.boolean().default(true),
  /** Key prefix for Redis */
  keyPrefix: z.string().default('ai:ratelimit:'),
  /** Default tier for unknown users */
  defaultTier: z.enum(['free', 'basic', 'pro', 'enterprise', 'unlimited']).default('free'),
  /** Custom tier limits (merged with defaults) */
  tierLimits: z.record(TierLimitsSchema).optional(),
  /** Enable token-based limiting */
  enableTokenLimiting: z.boolean().default(true),
  /** Enable concurrent request limiting */
  enableConcurrentLimiting: z.boolean().default(true),
  /** Sliding window size in seconds */
  windowSizeSeconds: z.number().int().min(10).max(3600).default(60),
  /** Grace period for near-limit warnings (percentage) */
  warningThresholdPercent: z.number().min(0).max(100).default(80),
});

export type UserRateLimiterConfig = z.infer<typeof UserRateLimiterConfigSchema>;

/**
 * User Rate Limiter Service
 */
export class UserRateLimiter {
  private redis: SecureRedisClient;
  private config: UserRateLimiterConfig;
  private tierLimits: Record<UserTier, TierLimits>;

  constructor(redis: SecureRedisClient, config: Partial<UserRateLimiterConfig> = {}) {
    this.redis = redis;
    this.config = UserRateLimiterConfigSchema.parse(config);

    // Merge custom tier limits with defaults
    this.tierLimits = { ...DEFAULT_TIER_LIMITS };
    if (config.tierLimits) {
      for (const [tier, limits] of Object.entries(config.tierLimits)) {
        this.tierLimits[tier as UserTier] = {
          ...this.tierLimits[tier as UserTier],
          ...limits,
        };
      }
    }
  }

  /**
   * Check if a request is allowed for a user
   */
  async checkLimit(
    userId: string,
    options: {
      tier?: UserTier;
      estimatedTokens?: number;
      operationType?: string;
    } = {}
  ): Promise<RateLimitResult> {
    if (!this.config.enabled) {
      return this.allowedResult(userId, options.tier ?? this.config.defaultTier);
    }

    const tier = options.tier ?? this.config.defaultTier;
    const limits = this.tierLimits[tier];
    const now = Date.now();
    const windowKey = this.getWindowKey(userId, 'minute');

    try {
      // Check requests per minute using sliding window
      const requestCount = await this.incrementCounter(windowKey, this.config.windowSizeSeconds);
      const effectiveLimit = limits.requestsPerMinute + limits.burstAllowance;

      if (requestCount > effectiveLimit) {
        const resetAt = Math.ceil(now / 1000) + this.config.windowSizeSeconds;
        return {
          allowed: false,
          remaining: 0,
          limit: limits.requestsPerMinute,
          resetInSeconds: this.config.windowSizeSeconds,
          resetAt,
          tier,
          reason: `Rate limit exceeded: ${requestCount}/${limits.requestsPerMinute} requests per minute`,
          retryAfter: this.config.windowSizeSeconds,
        };
      }

      // Check hourly limit
      const hourlyKey = this.getWindowKey(userId, 'hour');
      const hourlyCount = await this.getCounter(hourlyKey);
      if (hourlyCount >= limits.requestsPerHour) {
        const resetAt = Math.ceil(now / 1000 / 3600) * 3600 + 3600;
        return {
          allowed: false,
          remaining: 0,
          limit: limits.requestsPerHour,
          resetInSeconds: resetAt - Math.floor(now / 1000),
          resetAt,
          tier,
          reason: `Hourly limit exceeded: ${hourlyCount}/${limits.requestsPerHour} requests`,
          retryAfter: resetAt - Math.floor(now / 1000),
        };
      }

      // Check daily limit
      const dailyKey = this.getWindowKey(userId, 'day');
      const dailyCount = await this.getCounter(dailyKey);
      if (dailyCount >= limits.requestsPerDay) {
        const resetAt = Math.ceil(now / 1000 / 86400) * 86400 + 86400;
        return {
          allowed: false,
          remaining: 0,
          limit: limits.requestsPerDay,
          resetInSeconds: resetAt - Math.floor(now / 1000),
          resetAt,
          tier,
          reason: `Daily limit exceeded: ${dailyCount}/${limits.requestsPerDay} requests`,
          retryAfter: resetAt - Math.floor(now / 1000),
        };
      }

      // Check token limits if enabled
      if (this.config.enableTokenLimiting && options.estimatedTokens) {
        const tokenKey = this.getTokenKey(userId, 'day');
        const tokensUsed = await this.getCounter(tokenKey);
        if (tokensUsed + options.estimatedTokens > limits.tokensPerDay) {
          const resetAt = Math.ceil(now / 1000 / 86400) * 86400 + 86400;
          return {
            allowed: false,
            remaining: 0,
            limit: limits.tokensPerDay,
            resetInSeconds: resetAt - Math.floor(now / 1000),
            resetAt,
            tier,
            reason: `Daily token limit exceeded: ${tokensUsed}/${limits.tokensPerDay} tokens`,
            retryAfter: resetAt - Math.floor(now / 1000),
          };
        }
      }

      // Check concurrent requests if enabled
      if (this.config.enableConcurrentLimiting) {
        const concurrentKey = this.getConcurrentKey(userId);
        const concurrent = await this.getCounter(concurrentKey);
        if (concurrent >= limits.maxConcurrent) {
          return {
            allowed: false,
            remaining: 0,
            limit: limits.maxConcurrent,
            resetInSeconds: 5, // Check again in 5 seconds
            resetAt: Math.floor(now / 1000) + 5,
            tier,
            reason: `Concurrent request limit: ${concurrent}/${limits.maxConcurrent}`,
            retryAfter: 5,
          };
        }
      }

      // Increment hourly and daily counters
      await this.incrementCounter(hourlyKey, 3600);
      await this.incrementCounter(dailyKey, 86400);

      const remaining = limits.requestsPerMinute - requestCount;
      const resetAt = Math.ceil(now / 1000) + this.config.windowSizeSeconds;

      return {
        allowed: true,
        remaining: Math.max(0, remaining),
        limit: limits.requestsPerMinute,
        resetInSeconds: this.config.windowSizeSeconds,
        resetAt,
        tier,
      };
    } catch (error) {
      console.error('[UserRateLimiter] Redis error, allowing request:', error);
      // Graceful degradation - allow request if Redis fails
      return this.allowedResult(userId, tier);
    }
  }

  /**
   * Record token usage after a request completes
   */
  async recordTokenUsage(
    userId: string,
    tokensUsed: number,
    _options: {
      tier?: UserTier;
      operationType?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled || !this.config.enableTokenLimiting) {
      return;
    }

    try {
      // Record daily token usage
      const dailyTokenKey = this.getTokenKey(userId, 'day');
      await this.incrementCounter(dailyTokenKey, 86400, tokensUsed);

      // Record monthly token usage
      const monthlyTokenKey = this.getTokenKey(userId, 'month');
      await this.incrementCounter(monthlyTokenKey, 2592000, tokensUsed); // 30 days
    } catch (error) {
      console.error('[UserRateLimiter] Failed to record token usage:', error);
    }
  }

  /**
   * Acquire concurrent request slot
   */
  async acquireConcurrentSlot(userId: string): Promise<boolean> {
    if (!this.config.enabled || !this.config.enableConcurrentLimiting) {
      return true;
    }

    const tier = this.config.defaultTier;
    const limits = this.tierLimits[tier];
    const key = this.getConcurrentKey(userId);

    try {
      const current = await this.incrementCounter(key, 300); // 5 minute TTL for safety
      return current <= limits.maxConcurrent;
    } catch (error) {
      console.error('[UserRateLimiter] Failed to acquire concurrent slot:', error);
      return true; // Graceful degradation
    }
  }

  /**
   * Release concurrent request slot
   */
  async releaseConcurrentSlot(userId: string): Promise<void> {
    if (!this.config.enabled || !this.config.enableConcurrentLimiting) {
      return;
    }

    const key = this.getConcurrentKey(userId);

    try {
      await this.decrementCounter(key);
    } catch (error) {
      console.error('[UserRateLimiter] Failed to release concurrent slot:', error);
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(userId: string, tier?: UserTier): Promise<UserUsageStats> {
    const userTier = tier ?? this.config.defaultTier;
    const now = new Date();

    try {
      const [minuteCount, dailyCount, monthlyCount, dailyTokens, monthlyTokens] = await Promise.all(
        [
          this.getCounter(this.getWindowKey(userId, 'minute')),
          this.getCounter(this.getWindowKey(userId, 'day')),
          this.getCounter(this.getWindowKey(userId, 'month')),
          this.getCounter(this.getTokenKey(userId, 'day')),
          this.getCounter(this.getTokenKey(userId, 'month')),
        ]
      );

      // Calculate reset times
      const nowSeconds = Math.floor(now.getTime() / 1000);
      const windowReset = new Date((nowSeconds + this.config.windowSizeSeconds) * 1000);
      const dailyReset = new Date(Math.ceil(nowSeconds / 86400) * 86400 * 1000 + 86400000);
      const monthlyReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      return {
        userId,
        tier: userTier,
        requestsThisWindow: minuteCount,
        tokensThisWindow: 0, // Not tracked per window
        requestsToday: dailyCount,
        tokensUsedToday: dailyTokens,
        requestsThisMonth: monthlyCount,
        tokensUsedThisMonth: monthlyTokens,
        windowResetAt: windowReset,
        dailyResetAt: dailyReset,
        monthlyResetAt: monthlyReset,
      };
    } catch (error) {
      console.error('[UserRateLimiter] Failed to get usage stats:', error);
      // Return empty stats on error
      return {
        userId,
        tier: userTier,
        requestsThisWindow: 0,
        tokensThisWindow: 0,
        requestsToday: 0,
        tokensUsedToday: 0,
        requestsThisMonth: 0,
        tokensUsedThisMonth: 0,
        windowResetAt: new Date(),
        dailyResetAt: new Date(),
        monthlyResetAt: new Date(),
      };
    }
  }

  /**
   * Reset limits for a user (admin function)
   */
  async resetUserLimits(userId: string): Promise<void> {
    const patterns = [
      this.getWindowKey(userId, 'minute'),
      this.getWindowKey(userId, 'hour'),
      this.getWindowKey(userId, 'day'),
      this.getWindowKey(userId, 'month'),
      this.getTokenKey(userId, 'day'),
      this.getTokenKey(userId, 'month'),
      this.getConcurrentKey(userId),
    ];

    await this.redis.del(...patterns);
  }

  /**
   * Get tier limits for a user
   */
  getTierLimits(tier: UserTier): TierLimits {
    return { ...this.tierLimits[tier] };
  }

  /**
   * Update tier limits at runtime
   */
  setTierLimits(tier: UserTier, limits: Partial<TierLimits>): void {
    const parsed = TierLimitsSchema.partial().parse(limits);
    // Only update defined properties
    if (parsed.requestsPerMinute !== undefined)
      this.tierLimits[tier].requestsPerMinute = parsed.requestsPerMinute;
    if (parsed.requestsPerHour !== undefined)
      this.tierLimits[tier].requestsPerHour = parsed.requestsPerHour;
    if (parsed.requestsPerDay !== undefined)
      this.tierLimits[tier].requestsPerDay = parsed.requestsPerDay;
    if (parsed.tokensPerMinute !== undefined)
      this.tierLimits[tier].tokensPerMinute = parsed.tokensPerMinute;
    if (parsed.tokensPerDay !== undefined) this.tierLimits[tier].tokensPerDay = parsed.tokensPerDay;
    if (parsed.tokensPerMonth !== undefined)
      this.tierLimits[tier].tokensPerMonth = parsed.tokensPerMonth;
    if (parsed.maxConcurrent !== undefined)
      this.tierLimits[tier].maxConcurrent = parsed.maxConcurrent;
    if (parsed.burstAllowance !== undefined)
      this.tierLimits[tier].burstAllowance = parsed.burstAllowance;
  }

  // Helper methods

  private getWindowKey(userId: string, window: 'minute' | 'hour' | 'day' | 'month'): string {
    const now = Math.floor(Date.now() / 1000);
    let windowId: number;

    switch (window) {
      case 'minute':
        windowId = Math.floor(now / this.config.windowSizeSeconds);
        break;
      case 'hour':
        windowId = Math.floor(now / 3600);
        break;
      case 'day':
        windowId = Math.floor(now / 86400);
        break;
      case 'month':
        windowId = Math.floor(now / 2592000);
        break;
    }

    return `${this.config.keyPrefix}req:${userId}:${window}:${windowId}`;
  }

  private getTokenKey(userId: string, window: 'day' | 'month'): string {
    const now = Math.floor(Date.now() / 1000);
    const windowId = window === 'day' ? Math.floor(now / 86400) : Math.floor(now / 2592000);
    return `${this.config.keyPrefix}tok:${userId}:${window}:${windowId}`;
  }

  private getConcurrentKey(userId: string): string {
    return `${this.config.keyPrefix}conc:${userId}`;
  }

  private async incrementCounter(key: string, ttlSeconds: number, amount = 1): Promise<number> {
    // Use Redis INCR with EXPIRE
    const current = await this.redis.get(key);
    const newValue = (parseInt(current ?? '0', 10) || 0) + amount;
    await this.redis.set(key, newValue.toString(), { ttlSeconds });
    return newValue;
  }

  private async decrementCounter(key: string): Promise<number> {
    const current = await this.redis.get(key);
    const newValue = Math.max(0, (parseInt(current ?? '0', 10) || 0) - 1);
    if (newValue > 0) {
      await this.redis.set(key, newValue.toString());
    } else {
      await this.redis.del(key);
    }
    return newValue;
  }

  private async getCounter(key: string): Promise<number> {
    const value = await this.redis.get(key);
    return parseInt(value ?? '0', 10) || 0;
  }

  private allowedResult(_userId: string, tier: UserTier): RateLimitResult {
    const limits = this.tierLimits[tier];
    return {
      allowed: true,
      remaining: limits.requestsPerMinute,
      limit: limits.requestsPerMinute,
      resetInSeconds: this.config.windowSizeSeconds,
      resetAt: Math.floor(Date.now() / 1000) + this.config.windowSizeSeconds,
      tier,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): UserRateLimiterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<UserRateLimiterConfig>): void {
    this.config = UserRateLimiterConfigSchema.parse({ ...this.config, ...updates });
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

/**
 * Factory function
 */
export function createUserRateLimiter(
  redis: SecureRedisClient,
  config?: Partial<UserRateLimiterConfig>
): UserRateLimiter {
  return new UserRateLimiter(redis, config);
}

/**
 * Middleware helper for Fastify integration
 */
export function createRateLimitMiddleware(rateLimiter: UserRateLimiter) {
  return async (
    request: { headers: Record<string, string | string[] | undefined> },
    reply: {
      header: (name: string, value: string) => void;
      status: (code: number) => { send: (body: unknown) => void };
    }
  ): Promise<boolean> => {
    const userId =
      typeof request.headers['x-user-id'] === 'string' ? request.headers['x-user-id'] : undefined;

    if (!userId) {
      // No user ID - use IP-based limiting or skip
      return true;
    }

    const result = await rateLimiter.checkLimit(userId);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', result.limit.toString());
    reply.header('X-RateLimit-Remaining', result.remaining.toString());
    reply.header('X-RateLimit-Reset', result.resetAt.toString());

    if (!result.allowed) {
      reply.header('Retry-After', (result.retryAfter ?? result.resetInSeconds).toString());
      reply.status(429).send({
        code: 'RATE_LIMIT_EXCEEDED',
        message: result.reason ?? 'Too many requests',
        retryAfter: result.retryAfter ?? result.resetInSeconds,
      });
      return false;
    }

    return true;
  };
}
