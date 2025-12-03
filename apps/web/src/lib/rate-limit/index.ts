/**
 * Rate Limiting Module
 *
 * Exports rate limiting utilities for server actions and API routes.
 */

export {
  checkRateLimit,
  withRateLimit,
  getRateLimitHeaders,
  RateLimitError,
  DEFAULT_RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
} from './redis-rate-limiter';
