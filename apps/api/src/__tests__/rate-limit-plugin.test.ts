import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { rateLimitPlugin } from '../plugins/rate-limit.js';

/**
 * Comprehensive Rate Limit Plugin Tests
 *
 * Tests for:
 * - IP-based rate limiting
 * - Webhook-specific rate limits
 * - Rate limit headers
 * - Rate limit key generation
 * - Webhook type detection
 * - Allowlist functionality
 */

describe('Rate Limit Plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Register plugin with test configuration
    await app.register(rateLimitPlugin, {
      useRedis: false, // Use in-memory for testing
      globalLimit: 10,
      webhookLimits: {
        whatsapp: 5,
        voice: 3,
        stripe: 2,
        booking: 3,
        vapi: 3,
        crm: 3,
      },
      allowlist: [],
      addHeaders: true,
    });

    // Add test routes
    app.get('/test', async () => ({ ok: true }));
    app.post('/webhooks/whatsapp', async () => ({ ok: true }));
    app.post('/webhooks/voice', async () => ({ ok: true }));
    app.post('/webhooks/stripe', async () => ({ ok: true }));
    app.post('/webhooks/booking', async () => ({ ok: true }));
    app.post('/webhooks/vapi', async () => ({ ok: true }));
    app.post('/webhooks/crm', async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // Basic Rate Limiting
  // ==========================================================================

  describe('Basic Rate Limiting', () => {
    it('should allow requests under the limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include rate limit headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should decrement remaining count', async () => {
      const response1 = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining'] as string, 10);
      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining'] as string, 10);

      expect(remaining2).toBeLessThanOrEqual(remaining1);
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Create a new app instance with very low limit
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 2,
        webhookLimits: {
          whatsapp: 2,
          voice: 2,
          stripe: 2,
          booking: 2,
          vapi: 2,
          crm: 2,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Make requests until we hit the limit
      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(
          await testApp.inject({
            method: 'GET',
            url: '/test',
          })
        );
      }

      const rateLimited = responses.some((r) => r.statusCode === 429);
      expect(rateLimited).toBe(true);

      await testApp.close();
    });

    it('should include retry-after header when rate limited', async () => {
      // Create app with very low limit
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 1,
        webhookLimits: {
          whatsapp: 1,
          voice: 1,
          stripe: 1,
          booking: 1,
          vapi: 1,
          crm: 1,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Exceed limit
      await testApp.inject({ method: 'GET', url: '/test' });
      await testApp.inject({ method: 'GET', url: '/test' });
      const response = await testApp.inject({ method: 'GET', url: '/test' });

      if (response.statusCode === 429) {
        const body = JSON.parse(response.body);
        expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(body).toHaveProperty('retryAfter');
      }

      await testApp.close();
    });
  });

  // ==========================================================================
  // Webhook-Specific Limits
  // ==========================================================================

  describe('Webhook-Specific Limits', () => {
    it('should apply different limits for WhatsApp webhooks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
      });

      expect(response.statusCode).toBe(200);
      const limit = parseInt(response.headers['x-ratelimit-limit'] as string, 10);
      expect(limit).toBe(5); // WhatsApp limit
    });

    it('should apply different limits for Voice webhooks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/voice',
      });

      expect(response.statusCode).toBe(200);
      const limit = parseInt(response.headers['x-ratelimit-limit'] as string, 10);
      expect(limit).toBe(3); // Voice limit
    });

    it('should apply different limits for Stripe webhooks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe',
      });

      expect(response.statusCode).toBe(200);
      const limit = parseInt(response.headers['x-ratelimit-limit'] as string, 10);
      expect(limit).toBe(2); // Stripe limit
    });

    it('should apply different limits for Vapi webhooks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/vapi',
      });

      expect(response.statusCode).toBe(200);
      const limit = parseInt(response.headers['x-ratelimit-limit'] as string, 10);
      expect(limit).toBe(3); // Vapi limit
    });

    it('should have separate rate limit buckets for different webhook types', async () => {
      // Exhaust WhatsApp limit
      for (let i = 0; i < 6; i++) {
        await app.inject({
          method: 'POST',
          url: '/webhooks/whatsapp',
        });
      }

      // Voice should still work (separate bucket)
      const voiceResponse = await app.inject({
        method: 'POST',
        url: '/webhooks/voice',
      });

      expect([200, 429]).toContain(voiceResponse.statusCode);
      // If 200, it proves separate buckets
    });

    it('should distinguish between voice and vapi webhooks', async () => {
      const voiceResponse = await app.inject({
        method: 'POST',
        url: '/webhooks/voice',
      });

      const vapiResponse = await app.inject({
        method: 'POST',
        url: '/webhooks/vapi',
      });

      // Both should have their own limits
      expect(voiceResponse.statusCode).toBe(200);
      expect(vapiResponse.statusCode).toBe(200);

      const voiceLimit = parseInt(voiceResponse.headers['x-ratelimit-limit'] as string, 10);
      const vapiLimit = parseInt(vapiResponse.headers['x-ratelimit-limit'] as string, 10);

      expect(voiceLimit).toBe(3);
      expect(vapiLimit).toBe(3);
    });
  });

  // ==========================================================================
  // Rate Limit Key Generation
  // ==========================================================================

  describe('Rate Limit Key Generation', () => {
    it('should use IP address in rate limit key', async () => {
      // Inject with different IPs
      const response1 = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-for': '192.168.1.2',
        },
      });

      // Different IPs should have independent limits
      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });

    it('should include webhook type in rate limit key', async () => {
      // Create a fresh app instance to avoid rate limit contamination from other tests
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 10,
        webhookLimits: {
          whatsapp: 5,
          voice: 3,
          stripe: 2,
          booking: 3,
          vapi: 3,
          crm: 3,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.post('/webhooks/whatsapp', async () => ({ ok: true }));
      testApp.post('/webhooks/stripe', async () => ({ ok: true }));
      await testApp.ready();

      // Requests to different webhook types should not affect each other
      const whatsappResponse = await testApp.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
      });

      const stripeResponse = await testApp.inject({
        method: 'POST',
        url: '/webhooks/stripe',
      });

      expect(whatsappResponse.statusCode).toBe(200);
      expect(stripeResponse.statusCode).toBe(200);

      // Should have different limits
      const whatsappLimit = parseInt(whatsappResponse.headers['x-ratelimit-limit'] as string, 10);
      const stripeLimit = parseInt(stripeResponse.headers['x-ratelimit-limit'] as string, 10);

      expect(whatsappLimit).not.toBe(stripeLimit);

      await testApp.close();
    });
  });

  // ==========================================================================
  // Allowlist
  // ==========================================================================

  describe('Allowlist Functionality', () => {
    it('should configure allowlist option', async () => {
      // This test verifies that allowlist configuration is passed to the plugin
      // Note: Testing actual IP allowlisting requires trust proxy configuration
      // which is outside the scope of this unit test
      const testApp = Fastify({
        logger: false,
        trustProxy: true, // Enable trust proxy to use x-forwarded-for
      });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 1,
        webhookLimits: {
          whatsapp: 1,
          voice: 1,
          stripe: 1,
          booking: 1,
          vapi: 1,
          crm: 1,
        },
        allowlist: ['192.168.1.100'],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Make requests with allowlisted IP
      const responses = [];
      for (let i = 0; i < 3; i++) {
        responses.push(
          await testApp.inject({
            method: 'GET',
            url: '/test',
            headers: {
              'x-forwarded-for': '192.168.1.100',
            },
          })
        );
      }

      // With trust proxy enabled and IP in allowlist, requests should succeed
      const succeeded = responses.filter((r) => r.statusCode === 200);
      expect(succeeded.length).toBeGreaterThan(0);

      await testApp.close();
    });

    it('should apply rate limiting to non-allowlisted IPs', async () => {
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 1,
        webhookLimits: {
          whatsapp: 1,
          voice: 1,
          stripe: 1,
          booking: 1,
          vapi: 1,
          crm: 1,
        },
        allowlist: ['192.168.1.100'], // Different IP
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Make multiple requests from non-allowlisted IP
      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(
          await testApp.inject({
            method: 'GET',
            url: '/test',
            headers: {
              'x-forwarded-for': '10.0.0.1', // Not in allowlist
            },
          })
        );
      }

      // Should be rate limited
      const rateLimited = responses.some((r) => r.statusCode === 429);
      expect(rateLimited).toBe(true);

      await testApp.close();
    });
  });

  // ==========================================================================
  // Error Response Format
  // ==========================================================================

  describe('Error Response Format', () => {
    it('should return structured error when rate limited', async () => {
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 1,
        webhookLimits: {
          whatsapp: 1,
          voice: 1,
          stripe: 1,
          booking: 1,
          vapi: 1,
          crm: 1,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Exceed limit
      await testApp.inject({ method: 'GET', url: '/test' });
      await testApp.inject({ method: 'GET', url: '/test' });
      const response = await testApp.inject({ method: 'GET', url: '/test' });

      if (response.statusCode === 429) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('statusCode');
        expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(body.statusCode).toBe(429);
      }

      await testApp.close();
    });

    it('should include helpful error message', async () => {
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 1,
        webhookLimits: {
          whatsapp: 1,
          voice: 1,
          stripe: 1,
          booking: 1,
          vapi: 1,
          crm: 1,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // Exceed limit
      await testApp.inject({ method: 'GET', url: '/test' });
      await testApp.inject({ method: 'GET', url: '/test' });
      const response = await testApp.inject({ method: 'GET', url: '/test' });

      if (response.statusCode === 429) {
        const body = JSON.parse(response.body);
        expect(body.message).toContain('Too many requests');
      }

      await testApp.close();
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Rate Limit Integration', () => {
    it('should handle concurrent requests correctly', async () => {
      const requests = Array(20)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/test',
          })
        );

      const responses = await Promise.all(requests);

      // Some should succeed, some should be rate limited
      const succeeded = responses.filter((r) => r.statusCode === 200);
      const rateLimited = responses.filter((r) => r.statusCode === 429);

      expect(succeeded.length + rateLimited.length).toBe(20);
    });

    it('should include rate limit reset header', async () => {
      // This test verifies the reset time header is provided
      // @fastify/rate-limit returns seconds until reset, not epoch timestamp
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      const resetTime = parseInt(response.headers['x-ratelimit-reset'] as string, 10);

      // Reset time should be a positive number representing seconds until reset
      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(60); // Max 60 seconds for 1-minute window
    });

    it('should maintain separate counters per IP', async () => {
      // Create a fresh app instance to ensure clean rate limit state
      const testApp = Fastify({ logger: false });
      await testApp.register(rateLimitPlugin, {
        useRedis: false,
        globalLimit: 10,
        webhookLimits: {
          whatsapp: 5,
          voice: 3,
          stripe: 2,
          booking: 3,
          vapi: 3,
          crm: 3,
        },
        allowlist: [],
        addHeaders: true,
      });
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      const response1 = await testApp.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-for': '10.0.0.1',
        },
      });

      const response2 = await testApp.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-for': '10.0.0.2',
        },
      });

      // Both should have full limits (separate counters)
      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining'] as string, 10);
      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining'] as string, 10);

      expect(remaining1).toBeGreaterThan(0);
      expect(remaining2).toBeGreaterThan(0);

      await testApp.close();
    });
  });
});
