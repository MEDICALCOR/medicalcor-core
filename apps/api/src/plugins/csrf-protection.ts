/**
 * CSRF Protection Plugin for Fastify
 *
 * Implements Double Submit Cookie pattern for CSRF protection on state-changing endpoints.
 *
 * SECURITY DESIGN:
 * 1. Generate cryptographically secure token on first request
 * 2. Store token in HTTP-only, Secure, SameSite=Strict cookie
 * 3. Require token in X-CSRF-Token header for state-changing requests
 * 4. Timing-safe comparison to prevent timing attacks
 *
 * IMPORTANT: This plugin protects against CSRF attacks where an attacker
 * tricks a user's browser into making unwanted requests. Webhooks are exempt
 * as they use signature verification instead.
 *
 * @module api/plugins/csrf-protection
 */

import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * CSRF Protection Configuration
 */
export interface CsrfProtectionConfig {
  /**
   * Cookie name for CSRF token
   * @default '__Host-csrf-token'
   */
  cookieName?: string;

  /**
   * Header name for CSRF token
   * @default 'x-csrf-token'
   */
  headerName?: string;

  /**
   * Token length in bytes (will be base64 encoded)
   * @default 32
   */
  tokenLength?: number;

  /**
   * Cookie max age in seconds
   * @default 86400 (24 hours)
   */
  maxAge?: number;

  /**
   * Paths to exclude from CSRF protection (e.g., webhooks with signature verification)
   * Supports glob patterns
   */
  excludePaths?: string[];

  /**
   * HTTP methods that require CSRF protection
   * @default ['POST', 'PUT', 'PATCH', 'DELETE']
   */
  protectedMethods?: string[];

  /**
   * Whether the app is running in production
   * Affects cookie security settings
   */
  isProduction?: boolean;

  /**
   * Custom logger (optional)
   */
  logger?: {
    warn: (msg: string, context?: Record<string, unknown>) => void;
    info: (msg: string, context?: Record<string, unknown>) => void;
  };
}

const DEFAULT_CONFIG: Required<Omit<CsrfProtectionConfig, 'logger'>> = {
  cookieName: '__Host-csrf-token',
  headerName: 'x-csrf-token',
  tokenLength: 32,
  maxAge: 86400,
  excludePaths: [
    // Webhooks use signature verification instead of CSRF
    '/webhooks/*',
    '/webhook/*',
    // Health checks are read-only
    '/health',
    '/health/*',
    '/live',
    '/ready',
    // Metrics endpoint is read-only
    '/metrics',
  ],
  protectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  isProduction: process.env.NODE_ENV === 'production',
};

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken(length: number): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Timing-safe token comparison to prevent timing attacks
 */
function verifyToken(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  try {
    const providedBuffer = Buffer.from(provided, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    // Length check with constant-time comparison
    if (providedBuffer.length !== expectedBuffer.length) {
      // Perform dummy comparison to maintain constant time
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Check if a path matches any of the exclude patterns
 */
function isExcludedPath(path: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (pattern.endsWith('/*')) {
      // Wildcard pattern: /webhooks/* matches /webhooks/anything
      const prefix = pattern.slice(0, -2);
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return true;
      }
    } else if (pattern === path) {
      // Exact match
      return true;
    }
  }
  return false;
}

/**
 * CSRF Protection Plugin
 *
 * Adds CSRF protection to state-changing endpoints using the Double Submit Cookie pattern.
 */
const csrfProtectionPlugin: FastifyPluginAsync<CsrfProtectionConfig> = (
  fastify: FastifyInstance,
  options: CsrfProtectionConfig
): Promise<void> => {
  const config = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  const logger = options.logger ?? {
    warn: (msg: string, ctx?: Record<string, unknown>) => fastify.log.warn(ctx, msg),
    info: (msg: string, ctx?: Record<string, unknown>) => fastify.log.info(ctx, msg),
  };

  // Cookie options
  const cookieOptions = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: config.maxAge,
  };

  // Decorate request with CSRF token getter
  fastify.decorateRequest('csrfToken', null);

  // Pre-handler hook for CSRF validation
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    const path = request.url.split('?')[0] ?? '/'; // Remove query string

    // Skip non-protected methods (GET, HEAD, OPTIONS)
    if (!config.protectedMethods.includes(method)) {
      return;
    }

    // Skip excluded paths (webhooks, health checks)
    if (isExcludedPath(path, config.excludePaths)) {
      return;
    }

    // Get token from cookie (type-safe access via @fastify/cookie)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookies = (request as any).cookies as Record<string, string | undefined> | undefined;
    const cookieToken: string | undefined = cookies?.[config.cookieName];

    // Get token from header
    const headerToken = request.headers[config.headerName.toLowerCase()] as string | undefined;

    // Validate CSRF token
    if (!cookieToken || !headerToken) {
      logger.warn('CSRF token missing', {
        path,
        method,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
        ip: request.ip,
      });

      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CSRF token missing. Include X-CSRF-Token header.',
        code: 'CSRF_TOKEN_MISSING',
      });
    }

    // Verify token matches (timing-safe)
    if (!verifyToken(headerToken, cookieToken)) {
      logger.warn('CSRF token mismatch', {
        path,
        method,
        ip: request.ip,
      });

      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CSRF token invalid.',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    // Token is valid - continue
  });

  // Route to get/refresh CSRF token
  fastify.get('/csrf-token', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check for existing token (type-safe access via @fastify/cookie)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookies = (request as any).cookies as Record<string, string | undefined> | undefined;
    const existingToken = cookies?.[config.cookieName];

    // Generate new token if none exists
    const token = existingToken ?? generateToken(config.tokenLength);

    // Set/refresh cookie
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
    void (reply as any).setCookie(config.cookieName, token, cookieOptions);

    // Return token in response (for SPA/API clients)
    return {
      token,
      headerName: config.headerName,
      expiresIn: config.maxAge,
    };
  });

  // Add helper to generate token for testing
  fastify.decorate('generateCsrfToken', () => generateToken(config.tokenLength));

  logger.info('CSRF protection enabled', {
    protectedMethods: config.protectedMethods,
    excludedPaths: config.excludePaths,
    cookieName: config.cookieName,
    headerName: config.headerName,
  });

  return Promise.resolve();
};

export default fp(csrfProtectionPlugin, {
  name: 'csrf-protection',
  fastify: '5.x',
  dependencies: ['@fastify/cookie'],
});

export { csrfProtectionPlugin };
