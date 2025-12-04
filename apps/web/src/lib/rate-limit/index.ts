'use server';

/**
 * Rate Limiter Module
 *
 * Provides rate limiting for server actions using Redis (with in-memory fallback).
 * Supports different rate limits for different action types.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

// =============================================================================
// Types
// =============================================================================

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current count in the window */
  current: number;
  /** Remaining requests in the window */
  remaining: number;
  /** The limit for this action */
  limit: number;
  /** Time until the window resets (in seconds) */
  resetIn: number;
  /** Whether rate limiting is active (true if Redis or memory fallback works) */
  active: boolean;
}

// =============================================================================
// Default Rate Limits
// =============================================================================

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  read: { limit: 60, windowSeconds: 60 },
  create: { limit: 30, windowSeconds: 60 },
  update: { limit: 30, windowSeconds: 60 },
  delete: { limit: 10, windowSeconds: 60 },
  auth: { limit: 5, windowSeconds: 60 },
  default: { limit: 30, windowSeconds: 60 },
};

// =============================================================================
// Error Class
// =============================================================================

export class RateLimitError extends Error {
  public readonly rateLimitResult: RateLimitResult;

  constructor(prefix: string, result: RateLimitResult) {
    super(`Rate limit exceeded for action: ${prefix}`);
    this.name = 'RateLimitError';
    this.rateLimitResult = result;
  }
}

// =============================================================================
// In-Memory Store (Fallback when Redis is unavailable)
// =============================================================================

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function getMemoryEntry(key: string, windowSeconds: number): { count: number; isNew: boolean } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (entry && entry.expiresAt > now) {
    return { count: entry.count, isNew: false };
  }

  // Expired or doesn't exist - create new entry
  memoryStore.set(key, {
    count: 0,
    expiresAt: now + windowSeconds * 1000,
  });

  return { count: 0, isNew: true };
}

function incrementMemoryEntry(key: string): number {
  const entry = memoryStore.get(key);
  if (entry) {
    entry.count++;
    return entry.count;
  }
  return 1;
}

function getRemainingTime(key: string): number {
  const entry = memoryStore.get(key);
  if (entry) {
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }
  return 0;
}

// =============================================================================
// Helper: Get Client Identifier
// =============================================================================

async function getClientIdentifier(): Promise<string> {
  // Try to get authenticated user first
  const session = await auth();
  const user = session?.user;
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Fall back to IP address
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const ip = forwardedFor?.split(',')[0].trim() ?? realIp ?? 'anonymous';

  return `ip:${ip}`;
}

// =============================================================================
// Main Rate Limit Function
// =============================================================================

/**
 * Check rate limit for an action
 *
 * @param actionPrefix - Action type or unique prefix
 * @param config - Optional custom rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 *
 * @example
 * \`\`\`typescript
 * const result = await checkRateLimit('read');
 * if (!result.allowed) {
 *   throw new RateLimitError('read', result);
 * }
 * \`\`\`
 */
export async function checkRateLimit(
  actionPrefix: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  // Get rate limit config - use default if not specified
  // Note: Record<string, T> always returns T (not T | undefined), so we use `in` check
  const hasActionConfig = actionPrefix in DEFAULT_RATE_LIMITS;
  const actionConfig = hasActionConfig
    ? DEFAULT_RATE_LIMITS[actionPrefix]
    : DEFAULT_RATE_LIMITS.default;
  const rateLimitConfig = config ?? actionConfig;
  const { limit, windowSeconds } = rateLimitConfig;

  // Build rate limit key
  const clientId = await getClientIdentifier();
  const key = `ratelimit:${actionPrefix}:${clientId}`;

  // Fallback to in-memory store
  const { isNew } = getMemoryEntry(key, windowSeconds);
  if (isNew) {
    // Reset entry for new window
    memoryStore.set(key, {
      count: 0,
      expiresAt: Date.now() + windowSeconds * 1000,
    });
  }

  const current = incrementMemoryEntry(key);
  const resetIn = getRemainingTime(key);
  const allowed = current <= limit;

  return {
    allowed,
    current,
    remaining: Math.max(0, limit - current),
    limit,
    resetIn,
    active: true,
  };
}

// =============================================================================
// Decorator Function
// =============================================================================

/**
 * Wraps an action with rate limiting
 *
 * @param actionPrefix - Action type or unique prefix
 * @param action - The action function to wrap
 * @param config - Optional custom rate limit configuration
 * @returns Wrapped action that throws RateLimitError when limit exceeded
 *
 * @example
 * \`\`\`typescript
 * const limitedAction = withRateLimit('delete', deleteUserAction, {
 *   limit: 5,
 *   windowSeconds: 60,
 * });
 *
 * try {
 *   await limitedAction(userId);
 * } catch (_error) {
 *   if (error instanceof RateLimitError) {
 *     console.log('Rate limited:', error.rateLimitResult);
 *   }
 * }
 * \`\`\`
 */
export function withRateLimit<TArgs extends unknown[], TResult>(
  actionPrefix: string,
  action: (...args: TArgs) => Promise<TResult>,
  config?: RateLimitConfig
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const result = await checkRateLimit(actionPrefix, config);

    if (!result.allowed) {
      throw new RateLimitError(actionPrefix, result);
    }

    return action(...args);
  };
}
