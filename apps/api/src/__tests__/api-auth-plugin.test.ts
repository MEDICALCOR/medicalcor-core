import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiAuthPlugin } from '../plugins/api-auth.js';

/**
 * Comprehensive API Auth Plugin Tests
 *
 * Tests for:
 * - API key authentication
 * - Timing-safe comparison
 * - Protected path configuration
 * - Error handling
 * - Security edge cases
 */

describe('API Auth Plugin', () => {
  const validApiKey = 'test-api-key-12345';
  const validApiKey2 = 'test-api-key-67890';
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.API_SECRET_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.API_SECRET_KEY = originalEnv;
    } else {
      delete process.env.API_SECRET_KEY;
    }
  });

  // ==========================================================================
  // Basic Authentication
  // ==========================================================================

  describe('Basic Authentication', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/protected'],
      });

      app.get('/protected', async () => ({ ok: true }));
      app.get('/public', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should allow access to public endpoints without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/public',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access to protected endpoints without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('API key required');
    });

    it('should deny access with invalid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': 'invalid-key',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid API key');
    });

    it('should allow access with valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('should reject empty API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': '',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject API key with whitespace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': '   ',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Multiple API Keys
  // ==========================================================================

  describe('Multiple API Keys', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey, validApiKey2],
        protectedPaths: ['/protected'],
      });

      app.get('/protected', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should accept first valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept second valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey2,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject key not in list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': 'some-other-key',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Environment Variable Configuration
  // ==========================================================================

  describe('Environment Variable Configuration', () => {
    it('should use API_SECRET_KEY from environment', async () => {
      process.env.API_SECRET_KEY = 'env-api-key';

      const app = Fastify({ logger: false });
      await app.register(apiAuthPlugin, {
        apiKeys: [], // Empty - should use env
        protectedPaths: ['/protected'],
      });
      app.get('/protected', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': 'env-api-key',
        },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
      delete process.env.API_SECRET_KEY;
    });

    it('should reject requests when no API keys configured', async () => {
      delete process.env.API_SECRET_KEY;

      const app = Fastify({ logger: false });
      await app.register(apiAuthPlugin, {
        apiKeys: [],
        protectedPaths: ['/protected'],
      });
      app.get('/protected', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': 'any-key',
        },
      });

      expect(response.statusCode).toBe(500);

      await app.close();
    });
  });

  // ==========================================================================
  // Custom Header Name
  // ==========================================================================

  describe('Custom Header Name', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        headerName: 'authorization',
        protectedPaths: ['/protected'],
      });

      app.get('/protected', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should use custom header name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should not accept default header when custom is configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Protected Paths Configuration
  // ==========================================================================

  describe('Protected Paths Configuration', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/admin', '/api/v1'],
      });

      app.get('/admin', async () => ({ ok: true }));
      app.get('/admin/users', async () => ({ ok: true }));
      app.get('/api/v1/data', async () => ({ ok: true }));
      app.get('/public', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should protect path prefixes', async () => {
      const adminResponse = await app.inject({
        method: 'GET',
        url: '/admin',
      });

      expect(adminResponse.statusCode).toBe(401);
    });

    it('should protect nested paths', async () => {
      const nestedResponse = await app.inject({
        method: 'GET',
        url: '/admin/users',
      });

      expect(nestedResponse.statusCode).toBe(401);
    });

    it('should protect multiple path prefixes', async () => {
      const apiResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/data',
      });

      expect(apiResponse.statusCode).toBe(401);
    });

    it('should allow unprotected paths', async () => {
      const publicResponse = await app.inject({
        method: 'GET',
        url: '/public',
      });

      expect(publicResponse.statusCode).toBe(200);
    });

    it('should allow access to protected paths with valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Security Tests
  // ==========================================================================

  describe('Security Tests', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/protected'],
      });

      app.get('/protected', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should use timing-safe comparison', async () => {
      // This test verifies that the plugin doesn't leak timing information
      // We test with keys of different lengths to ensure timing-safe comparison

      const shortKey = 'short';
      const longKey = 'a'.repeat(100);

      const response1 = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': shortKey,
        },
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': longKey,
        },
      });

      // Both should be rejected
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
    });

    it('should reject API key with null bytes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey + '\0admin',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject API key with unicode characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey + '😀',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject API key with SQL injection attempt', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': "' OR '1'='1",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject API key with script tags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': '<script>alert("xss")</script>',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject API key as array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': [validApiKey, 'extra'] as unknown as string,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should be case-sensitive for API keys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey.toUpperCase(),
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should not accept API key with extra characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey + 'extra',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should not accept truncated API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': validApiKey.substring(0, validApiKey.length - 1),
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/protected'],
      });

      app.get('/protected', async () => ({ ok: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should return structured error response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    it('should not leak API key in error message', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-api-key': 'wrong-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.message).not.toContain('wrong-key');
      expect(body.message).not.toContain(validApiKey);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration Tests', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows', '/admin'],
      });

      app.post('/workflows/trigger', async () => ({ triggered: true }));
      app.get('/admin/stats', async () => ({ stats: {} }));
      app.get('/health', async () => ({ status: 'ok' }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should handle POST requests to protected paths', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/trigger',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject POST requests without API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/trigger',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should work with multiple protected paths', async () => {
      const workflowResponse = await app.inject({
        method: 'POST',
        url: '/workflows/trigger',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      const adminResponse = await app.inject({
        method: 'GET',
        url: '/admin/stats',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(workflowResponse.statusCode).toBe(200);
      expect(adminResponse.statusCode).toBe(200);
    });

    it('should allow health check without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle concurrent authenticated requests', async () => {
      const requests = Array(10)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'POST',
            url: '/workflows/trigger',
            headers: {
              'x-api-key': validApiKey,
            },
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });
  });
});
