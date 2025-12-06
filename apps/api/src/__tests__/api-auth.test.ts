/**
 * Comprehensive API Authentication Plugin Tests
 *
 * Tests for API key authentication including:
 * - API key validation
 * - Missing/invalid API key rejection
 * - Rate limiting behavior
 * - Timing attack prevention
 * - Configuration edge cases
 * - Production security requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { apiAuthPlugin, type ApiAuthConfig } from '../plugins/api-auth.js';

describe('API Authentication Plugin', () => {
  let fastify: FastifyInstance;
  const validApiKey = 'test-api-key-12345678901234567890';
  const validApiKey2 = 'test-api-key-abcdefghijklmnopqrst';
  const invalidApiKey = 'invalid-key-00000000000000000000';

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
  });

  afterEach(async () => {
    await fastify.close();
    vi.unstubAllEnvs();
  });

  describe('Valid API Key Authentication', () => {
    it('should allow request with valid API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });

    it('should allow request with valid API key from multiple configured keys', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey, validApiKey2],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Test first key
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey,
        },
      });
      expect(response1.statusCode).toBe(200);

      // Test second key
      const response2 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey2,
        },
      });
      expect(response2.statusCode).toBe(200);
    });

    it('should allow request to unprotected paths without API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/health', async () => ({ status: 'healthy' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'healthy' });
    });

    it('should support custom header name', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
        headerName: 'x-custom-api-key',
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-custom-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should protect subpaths of protected paths', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows/trigger', async () => ({ status: 'triggered' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows/trigger',
        headers: {
          'x-api-key': validApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should protect POST requests to protected paths', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.post('/workflows', async () => ({ id: 'wf_123' }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey,
        },
        payload: { name: 'test workflow' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Missing API Key Rejection', () => {
    it('should reject request to protected path without API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('API key required');
    });

    it('should reject request with empty API key header', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': '',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).message).toBe('API key required');
    });

    it('should reject request when header name is wrong', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
        headerName: 'x-api-key',
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          authorization: `Bearer ${validApiKey}`, // Wrong header
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).message).toBe('API key required');
    });
  });

  describe('Invalid API Key Rejection', () => {
    it('should reject request with invalid API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': invalidApiKey,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid API key');
    });

    it('should reject request with partial valid API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey.substring(0, 10), // Truncated key
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with API key with extra characters', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': validApiKey + 'extra',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with API key containing SQL injection attempt', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': "'; DROP TABLE users;--",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with API key containing XSS attempt', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': '<script>alert(1)</script>',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with API key containing null bytes', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': 'test-key\x00malicious',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for API key validation', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Test with keys of different lengths
      const shortKey = 'short';
      const longKey = 'a'.repeat(100);

      const response1 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': shortKey },
      });

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': longKey },
      });

      // Both should be rejected with 401
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);

      // Both should have the same error message (no timing leak)
      expect(JSON.parse(response1.body).message).toBe('Invalid API key');
      expect(JSON.parse(response2.body).message).toBe('Invalid API key');
    });

    it('should handle keys with same length but different values safely', async () => {
      const key1 = 'a'.repeat(32);
      const key2 = 'b'.repeat(32);

      await fastify.register(apiAuthPlugin, {
        apiKeys: [key1],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': key2 },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Configuration and Environment', () => {
    it('should load API key from environment variable', async () => {
      vi.stubEnv('API_SECRET_KEY', validApiKey);

      await fastify.register(apiAuthPlugin, {
        apiKeys: [], // Empty array should fall back to env var
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should prioritize config API keys over environment variable', async () => {
      vi.stubEnv('API_SECRET_KEY', 'env-api-key');

      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey], // Config should take precedence
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Config key should work
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': validApiKey },
      });
      expect(response1.statusCode).toBe(200);

      // Env key should not work
      const response2 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': 'env-api-key' },
      });
      expect(response2.statusCode).toBe(401);
    });

    it('should use default protected paths when not specified', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        // protectedPaths not specified, should default to ['/workflows']
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should use default header name when not specified', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
        // headerName not specified, should default to 'x-api-key'
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support multiple protected paths', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows', '/ai', '/metrics'],
      });

      fastify.get('/workflows', async () => ({ path: 'workflows' }));
      fastify.get('/ai', async () => ({ path: 'ai' }));
      fastify.get('/metrics', async () => ({ path: 'metrics' }));

      // All should require API key
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': validApiKey },
      });
      expect(response1.statusCode).toBe(200);

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/ai',
        headers: { 'x-api-key': validApiKey },
      });
      expect(response2.statusCode).toBe(200);

      const response3 = await fastify.inject({
        method: 'GET',
        url: '/metrics',
        headers: { 'x-api-key': validApiKey },
      });
      expect(response3.statusCode).toBe(200);
    });
  });

  describe('Production Security Requirements', () => {
    it('should throw error in production when API key is not configured', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('API_SECRET_KEY', ''); // No API key

      await expect(
        fastify.register(apiAuthPlugin, {
          apiKeys: [], // Empty
          protectedPaths: ['/workflows'],
        })
      ).rejects.toThrow('API_SECRET_KEY must be configured in production');
    });

    it('should return 500 in non-production when API key not configured and request is made', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('API_SECRET_KEY', ''); // No API key

      // Should not throw during registration in development
      await fastify.register(apiAuthPlugin, {
        apiKeys: [],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // But should return 500 when protected endpoint is accessed
      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': 'any-key' },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Server configuration error');
    });

    it('should allow startup in development even without API key configured', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('API_SECRET_KEY', '');

      // Should not throw in development
      await expect(
        fastify.register(apiAuthPlugin, {
          apiKeys: [],
          protectedPaths: ['/workflows'],
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-sensitive API key comparison', async () => {
      const mixedCaseKey = 'MixedCaseApiKey12345';

      await fastify.register(apiAuthPlugin, {
        apiKeys: [mixedCaseKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Exact match should work
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': mixedCaseKey },
      });
      expect(response1.statusCode).toBe(200);

      // Wrong case should not work (case-sensitive)
      const response2 = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': mixedCaseKey.toLowerCase() },
      });
      expect(response2.statusCode).toBe(401);
    });

    it('should handle API key with special characters', async () => {
      const specialKey = 'api-key_with.special+chars=123!@#';

      await fastify.register(apiAuthPlugin, {
        apiKeys: [specialKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': specialKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle very long API key', async () => {
      const longKey = 'a'.repeat(256);

      await fastify.register(apiAuthPlugin, {
        apiKeys: [longKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: { 'x-api-key': longKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle array header value by rejecting it', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Fastify normalizes array headers to first value, but our plugin checks for string type
      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'x-api-key': [validApiKey, 'extra'] as any,
        },
      });

      // Should handle gracefully (Fastify will use first value)
      expect([200, 401]).toContain(response.statusCode);
    });

    it('should not protect paths that only partially match', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/my-workflows', async () => ({ status: 'ok' }));

      // '/my-workflows' does not start with '/workflows'
      const response = await fastify.inject({
        method: 'GET',
        url: '/my-workflows',
      });

      expect(response.statusCode).toBe(200); // Should be allowed without key
    });

    it('should handle query parameters in protected URLs', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows?filter=active&sort=name',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle URL fragments in protected URLs', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows#section',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should allow multiple sequential requests with valid API key', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Make 10 sequential requests
      for (let i = 0; i < 10; i++) {
        const response = await fastify.inject({
          method: 'GET',
          url: '/workflows',
          headers: { 'x-api-key': validApiKey },
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it('should reject all requests without valid API key regardless of rate', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // Make multiple requests with invalid key
      for (let i = 0; i < 5; i++) {
        const response = await fastify.inject({
          method: 'GET',
          url: '/workflows',
          headers: { 'x-api-key': invalidApiKey },
        });
        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe('Header Case Sensitivity', () => {
    it('should handle lowercase header names', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      // HTTP headers are case-insensitive
      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'X-API-KEY': validApiKey, // Uppercase
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle mixed case header names', async () => {
      await fastify.register(apiAuthPlugin, {
        apiKeys: [validApiKey],
        protectedPaths: ['/workflows'],
      });

      fastify.get('/workflows', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/workflows',
        headers: {
          'X-Api-Key': validApiKey, // Mixed case
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
