/**
 * API Authentication Plugin
 * Provides API key authentication for protected endpoints
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

export interface ApiAuthConfig {
  /**
   * API keys that are allowed to access protected endpoints
   * In production, these should come from a database or secrets manager
   */
  apiKeys: string[];

  /**
   * Header name for the API key
   * @default 'x-api-key'
   */
  headerName?: string;

  /**
   * Paths that should be protected
   * @default ['/workflows']
   */
  protectedPaths?: string[];
}

/**
 * Timing-safe API key comparison
 */
function verifyApiKey(providedKey: string, validKeys: string[]): boolean {
  for (const validKey of validKeys) {
    try {
      if (
        providedKey.length === validKey.length &&
        crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(validKey))
      ) {
        return true;
      }
    } catch {
      // Length mismatch or other error - continue to next key
      continue;
    }
  }
  return false;
}

/**
 * API Authentication Plugin
 * Adds API key authentication to protected routes
 */
export const apiAuthPlugin: FastifyPluginAsync<ApiAuthConfig> = async (fastify, options) => {
  const headerName = options.headerName ?? 'x-api-key';
  const protectedPaths = options.protectedPaths ?? ['/workflows'];

  // Get API keys from config or environment
  let apiKeys = options.apiKeys;
  if (!apiKeys.length) {
    const envKey = process.env.API_SECRET_KEY;
    if (envKey) {
      apiKeys = [envKey];
    }
  }

  // Error if no API keys configured (REQUIRED in all environments)
  if (apiKeys.length === 0) {
    fastify.log.error(
      'CRITICAL: API_SECRET_KEY not configured - workflow endpoints will reject all requests!'
    );
  }

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if this path should be protected
    const isProtected = protectedPaths.some((path) => request.url.startsWith(path));

    if (!isProtected) {
      return; // Not a protected path, allow through
    }

    // API key is REQUIRED in all environments - no bypass allowed
    if (apiKeys.length === 0) {
      fastify.log.error(
        { url: request.url },
        'CRITICAL: API_SECRET_KEY not configured - rejecting request'
      );
      return reply.status(500).send({ error: 'Server configuration error' });
    }

    // Get API key from header
    const providedKey = request.headers[headerName];

    if (!providedKey || typeof providedKey !== 'string') {
      fastify.log.warn({ url: request.url }, 'Missing API key');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'API key required',
      });
    }

    // Verify API key
    if (!verifyApiKey(providedKey, apiKeys)) {
      fastify.log.warn({ url: request.url }, 'Invalid API key');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    // API key is valid - request will proceed
  });

  return Promise.resolve();
};

export default apiAuthPlugin;
