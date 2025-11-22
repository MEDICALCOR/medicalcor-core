import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'rate-limit' });

/**
 * Rate Limiting Plugin for Webhook Endpoints
 *
 * Provides IP-based rate limiting with different tiers:
 * - Strict: For sensitive webhook endpoints (payments, auth)
 * - Standard: For regular webhook traffic (WhatsApp, voice)
 * - Lenient: For verification endpoints (WhatsApp verification)
 */

// =============================================================================
// Configuration
// =============================================================================

export interface RateLimitConfig {
  /** Enable Redis-based distributed rate limiting */
  useRedis: boolean;
  /** Redis connection URL */
  redisUrl?: string | undefined;
  /** Global rate limit (requests per minute) */
  globalLimit: number;
  /** Webhook-specific limits */
  webhookLimits: {
    /** WhatsApp webhook limit per minute */
    whatsapp: number;
    /** Voice webhook limit per minute */
    voice: number;
    /** Stripe webhook limit per minute */
    stripe: number;
    /** Booking webhook limit per minute */
    booking: number;
    /** Vapi webhook limit per minute */
    vapi: number;
  };
  /** List of IPs to allowlist (bypass rate limiting) */
  allowlist: string[];
  /** Enable rate limit headers in response */
  addHeaders: boolean;
}

const defaultConfig: RateLimitConfig = {
  useRedis: false,
  globalLimit: 1000, // 1000 requests per minute globally
  webhookLimits: {
    whatsapp: 200, // WhatsApp can send bursts
    voice: 100, // Voice calls are less frequent
    stripe: 50, // Stripe webhooks are infrequent
    booking: 100, // Booking confirmations
    vapi: 100, // Vapi voice AI calls
  },
  allowlist: [],
  addHeaders: true,
};

// =============================================================================
// Rate Limit Key Generators
// =============================================================================

/**
 * Generate rate limit key based on IP and webhook type
 */
function generateKey(request: FastifyRequest): string {
  const ip = request.ip;
  const path = request.routeOptions.url ?? request.url;

  // Determine webhook type from path
  let webhookType = 'default';
  if (path.includes('/webhooks/whatsapp')) webhookType = 'whatsapp';
  else if (path.includes('/webhooks/voice') || path.includes('/webhooks/vapi'))
    webhookType = 'voice';
  else if (path.includes('/webhooks/stripe')) webhookType = 'stripe';
  else if (path.includes('/webhooks/booking')) webhookType = 'booking';

  return `ratelimit:${webhookType}:${ip}`;
}

/**
 * Get limit based on webhook type
 */
function getLimit(request: FastifyRequest, config: RateLimitConfig): number {
  const path = request.routeOptions.url ?? request.url;

  if (path.includes('/webhooks/whatsapp')) return config.webhookLimits.whatsapp;
  if (path.includes('/webhooks/voice') || path.includes('/webhooks/vapi'))
    return config.webhookLimits.vapi;
  if (path.includes('/webhooks/stripe')) return config.webhookLimits.stripe;
  if (path.includes('/webhooks/booking')) return config.webhookLimits.booking;

  return config.globalLimit;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

const rateLimitPluginAsync: FastifyPluginAsync<Partial<RateLimitConfig>> = async (
  fastify,
  options
) => {
  const config: RateLimitConfig = {
    ...defaultConfig,
    ...options,
    webhookLimits: {
      ...defaultConfig.webhookLimits,
      ...options.webhookLimits,
    },
  };

  // Log configuration
  logger.info(
    {
      useRedis: config.useRedis,
      globalLimit: config.globalLimit,
      webhookLimits: config.webhookLimits,
      allowlistCount: config.allowlist.length,
    },
    'Initializing rate limiting'
  );

  // Build rate limit options
  interface RateLimitOptions {
    global: boolean;
    max: (request: FastifyRequest) => number;
    timeWindow: string;
    keyGenerator: (request: FastifyRequest) => string;
    allowList: string[];
    addHeaders?: {
      'x-ratelimit-limit': boolean;
      'x-ratelimit-remaining': boolean;
      'x-ratelimit-reset': boolean;
    };
    addHeadersOnExceeding?: {
      'x-ratelimit-limit': boolean;
      'x-ratelimit-remaining': boolean;
      'x-ratelimit-reset': boolean;
    };
    onExceeding: (request: FastifyRequest) => void;
    onExceeded: (request: FastifyRequest, key: string) => void;
    errorResponseBuilder: (
      request: FastifyRequest,
      context: { max: number; ttl: number; after: string }
    ) => { code: string; message: string; statusCode: number; retryAfter: string };
    redis?: unknown;
  }

  const rateLimitOptions: RateLimitOptions = {
    global: true,
    max: (request: FastifyRequest) => getLimit(request, config),
    timeWindow: '1 minute',
    keyGenerator: generateKey,
    allowList: config.allowlist,
    onExceeding: (request: FastifyRequest) => {
      const correlationId = request.headers['x-correlation-id'];
      logger.debug(
        {
          correlationId,
          ip: request.ip,
          path: request.url,
        },
        'Approaching rate limit'
      );
    },
    onExceeded: (_request: FastifyRequest, key: string) => {
      logger.debug({ key }, 'Rate limit key exhausted');
    },
    errorResponseBuilder: (_request, context) => {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        statusCode: 429,
        retryAfter: context.after,
      };
    },
  };

  // Add headers if enabled
  if (config.addHeaders) {
    rateLimitOptions.addHeaders = {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    };
    rateLimitOptions.addHeadersOnExceeding = {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    };
  }

  // Use Redis if configured
  if (config.useRedis && config.redisUrl) {
    try {
      // Dynamic import to avoid requiring redis in development
      const { default: Redis } = await import('ioredis');

      const redis = new (Redis as unknown as new (url: string) => { ping: () => Promise<string> })(
        config.redisUrl
      );

      // Test connection
      await redis.ping();
      logger.info('Redis connected for distributed rate limiting');

      rateLimitOptions.redis = redis;
    } catch (err) {
      logger.warn({ err }, 'Failed to connect to Redis, falling back to in-memory rate limiting');
    }
  } else {
    logger.info('Using in-memory rate limiting (not suitable for multi-instance deployments)');
  }

  // Register the rate limit plugin
  await fastify.register(rateLimit, rateLimitOptions as Parameters<typeof rateLimit>[1]);
};

// =============================================================================
// Route-Specific Rate Limiters
// =============================================================================

/**
 * Create a strict rate limiter for sensitive endpoints
 * Use for payment webhooks or auth endpoints
 */
export function createStrictRateLimiter(max = 30): {
  config: { rateLimit: { max: number; timeWindow: string } };
} {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
      },
    },
  };
}

/**
 * Create a lenient rate limiter for verification endpoints
 * Use for WhatsApp verification or health checks
 */
export function createLenientRateLimiter(max = 300): {
  config: { rateLimit: { max: number; timeWindow: string } };
} {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
      },
    },
  };
}

/**
 * Skip rate limiting for specific routes
 */
export function skipRateLimit(): { config: { rateLimit: false } } {
  return {
    config: {
      rateLimit: false,
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export const rateLimitPlugin = fp(rateLimitPluginAsync, {
  name: 'rate-limit',
  fastify: '5.x',
});
