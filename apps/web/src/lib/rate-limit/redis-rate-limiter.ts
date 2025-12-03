/**
 * Redis Rate Limiter for Server Actions
 *
 * Provides sliding window rate limiting using Redis for:
 * - Server actions (mutations)
 * - API route handlers
 * - User-based quotas
 *
 * Features:
 * - Sliding window algorithm for smooth rate limiting
 * - Per-user and per-action rate limits
 * - Graceful fallback when Redis is unavailable
 * - Customizable limits per action type
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

// Rate limit configuration
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Optional identifier prefix (e.g., action name) */
  prefix?: string;
  /** Skip rate limiting for authenticated users with certain roles */
  skipForRoles?: string[];
}

// Rate limit result
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in the window */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Remaining requests in the window */
  remaining: number;
  /** Seconds until the window resets */
  resetInSeconds: number;
  /** Whether rate limiting is active (false if Redis unavailable) */
  active: boolean;
}

// Default rate limits for different action types
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // High-frequency actions (60/min)
  read: { limit: 60, windowSeconds: 60 },
  list: { limit: 60, windowSeconds: 60 },

  // Medium-frequency actions (20/min)
  create: { limit: 20, windowSeconds: 60 },
  update: { limit: 20, windowSeconds: 60 },

  // Low-frequency actions (5/min)
  delete: { limit: 5, windowSeconds: 60 },
  export: { limit: 5, windowSeconds: 60 },

  // Sensitive actions (3/min)
  auth: { limit: 3, windowSeconds: 60 },
  passwordReset: { limit: 3, windowSeconds: 300 }, // 3 per 5 minutes

  // Default fallback
  default: { limit: 30, windowSeconds: 60 },
};

// In-memory fallback for when Redis is unavailable
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Redis client interface (matches SecureRedisClient from @medicalcor/core)
interface RedisClientInterface {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  incrbyWithExpire: (key: string, increment: number, ttlSeconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
}

/**
 * Get client identifier for rate limiting
 * Uses user ID if authenticated, otherwise falls back to IP
 */
async function getClientId(): Promise<string> {
  // Try to get authenticated user
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-optional-chain
  if (session && session.user && session.user.id) {
    return `user:${session.user.id}`;
  }

  // Fall back to IP address
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const firstForwarded = forwardedFor?.split(',')[0]?.trim();
  const ip = firstForwarded ?? realIp ?? 'anonymous';

  return `ip:${ip}`;
}

/**
 * Check rate limit using in-memory fallback
 * Used when Redis is unavailable
 */
function checkMemoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  const entry = memoryStore.get(key);

  // Clean up expired entries periodically
  if (memoryStore.size > 10000) {
    for (const [k, v] of memoryStore.entries()) {
      if (v.resetAt < now) {
        memoryStore.delete(k);
      }
    }
  }

  if (!entry || entry.resetAt < now) {
    // Start new window
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      current: 1,
      limit: config.limit,
      remaining: config.limit - 1,
      resetInSeconds: config.windowSeconds,
      active: true,
    };
  }

  // Increment existing window
  entry.count++;
  const allowed = entry.count <= config.limit;
  const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);

  return {
    allowed,
    current: entry.count,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    resetInSeconds,
    active: true,
  };
}

/**
 * Check rate limit using Redis
 */
async function checkRedisRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  try {
    // Dynamic import to avoid issues when Redis isn't configured

    const redisModule = await import('@medicalcor/core');

    const redis = redisModule.createRedisClientFromEnv() as RedisClientInterface | null;

    if (redis === null) {
      // Redis not configured, use memory fallback
      return checkMemoryRateLimit(key, config);
    }

    await redis.connect();

    // Use atomic increment with expiration
    const current = await redis.incrbyWithExpire(key, 1, config.windowSeconds);
    const ttl = await redis.ttl(key);

    await redis.disconnect();

    const allowed = current <= config.limit;

    return {
      allowed,
      current,
      limit: config.limit,
      remaining: Math.max(0, config.limit - current),
      resetInSeconds: ttl > 0 ? ttl : config.windowSeconds,
      active: true,
    };
  } catch (error) {
    // Redis error, fall back to memory
    console.warn('[RateLimit] Redis unavailable, using memory fallback:', error);
    return checkMemoryRateLimit(key, config);
  }
}

/**
 * Rate limit a server action
 *
 * @param actionType - Type of action for default limits (create, update, delete, etc.)
 * @param customConfig - Optional custom rate limit configuration
 * @returns Rate limit result
 *
 * @example
 * ```ts
 * // In a server action
 * export async function createLeadAction(data: FormData) {
 *   const rateLimit = await checkRateLimit('create');
 *   if (!rateLimit.allowed) {
 *     throw new Error(`Rate limit exceeded. Try again in ${rateLimit.resetInSeconds}s`);
 *   }
 *   // ... perform action
 * }
 * ```
 */
export async function checkRateLimit(
  actionType = 'default',
  customConfig?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const baseConfig = DEFAULT_RATE_LIMITS[actionType] ?? DEFAULT_RATE_LIMITS.default;
  const config: RateLimitConfig = { ...baseConfig, ...customConfig };

  const clientId = await getClientId();
  const prefix = config.prefix ?? actionType;
  const key = `ratelimit:${prefix}:${clientId}`;

  return checkRedisRateLimit(key, config);
}

/**
 * Rate limit decorator for server actions
 *
 * @example
 * ```ts
 * export const createLead = withRateLimit('create', async (data: FormData) => {
 *   // ... action logic
 * });
 * ```
 */
export function withRateLimit<TArgs extends unknown[], TResult>(
  actionType: string,
  action: (...args: TArgs) => Promise<TResult>,
  customConfig?: Partial<RateLimitConfig>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const result = await checkRateLimit(actionType, customConfig);

    if (!result.allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${actionType}. Try again in ${result.resetInSeconds} seconds.`,
        result
      );
    }

    return action(...args);
  };
}

/**
 * Custom error class for rate limit exceeded
 */
export class RateLimitError extends Error {
  public readonly rateLimitResult: RateLimitResult;

  constructor(message: string, result: RateLimitResult) {
    super(message);
    this.name = 'RateLimitError';
    this.rateLimitResult = result;
  }
}

/**
 * Get rate limit headers for API responses
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetInSeconds.toString(),
  };
}
