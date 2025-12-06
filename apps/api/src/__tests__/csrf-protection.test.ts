/**
 * Comprehensive CSRF Protection Tests
 *
 * Tests for CSRF protection including:
 * - CSRF token generation
 * - CSRF token validation
 * - Missing token rejection
 * - Invalid token rejection
 * - Double Submit Cookie pattern
 * - Excluded paths (webhooks, health checks)
 * - Production security requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { csrfProtectionPlugin, type CsrfProtectionConfig } from '../plugins/csrf-protection.js';

describe('CSRF Protection Plugin', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    // CSRF plugin depends on cookie plugin
    await fastify.register(fastifyCookie);
  });

  afterEach(async () => {
    await fastify.close();
    vi.unstubAllEnvs();
  });

  describe('CSRF Token Generation', () => {
    it('should generate CSRF token on GET /csrf-token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBeGreaterThan(0);
      expect(body.headerName).toBe('x-csrf-token');
      expect(body.expiresIn).toBe(86400); // 24 hours default
    });

    it('should set CSRF token cookie on token generation', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      expect(response.statusCode).toBe(200);
      const cookies = response.cookies;
      expect(cookies).toBeDefined();
      expect(cookies.length).toBeGreaterThan(0);

      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie!.value).toBeDefined();
    });

    it('should generate unique tokens for each request', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response1 = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token1 = JSON.parse(response1.body).token;
      const token2 = JSON.parse(response2.body).token;

      expect(token1).not.toBe(token2);
    });

    it('should reuse existing token if cookie is present', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const firstResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(firstResponse.body).token;
      const cookies = firstResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Make second request with existing cookie
      const secondResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
        headers: {
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
      });

      const secondToken = JSON.parse(secondResponse.body).token;
      expect(secondToken).toBe(token); // Should reuse existing token
    });

    it('should use URL-safe base64 encoding for tokens', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(response.body).token;
      // base64url uses only: A-Z, a-z, 0-9, -, _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate tokens with configured length', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        tokenLength: 16, // 16 bytes
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(response.body).token;
      // 16 bytes base64url encoded is roughly 22 characters
      expect(token.length).toBeGreaterThan(20);
      expect(token.length).toBeLessThan(25);
    });
  });

  describe('CSRF Token Validation - Valid Requests', () => {
    it('should allow POST request with valid CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      // Get CSRF token
      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Make POST request with token
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': token,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
    });

    it('should allow PUT request with valid CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.put('/api/data/:id', async () => ({ updated: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/data/123',
        headers: {
          'x-csrf-token': token,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'updated' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow PATCH request with valid CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.patch('/api/data/:id', async () => ({ patched: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/data/123',
        headers: {
          'x-csrf-token': token,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { field: 'value' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow DELETE request with valid CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.delete('/api/data/:id', async () => ({ deleted: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/data/123',
        headers: {
          'x-csrf-token': token,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Missing CSRF Token Rejection', () => {
    it('should reject POST request without CSRF token in header', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Make POST request without header token (only cookie)
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('CSRF token missing');
      expect(body.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('should reject POST request without CSRF token in cookie', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      // Make POST request with header token but no cookie
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': 'some-token',
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('should reject POST request with empty CSRF token header', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': '', // Empty string
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Invalid CSRF Token Rejection', () => {
    it('should reject POST request with mismatched CSRF tokens', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Use different token in header vs cookie
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': 'different-token-12345',
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('CSRF token invalid');
      expect(body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should reject POST request with tampered CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Tamper with token by changing one character
      const tamperedToken = token.substring(0, token.length - 1) + 'X';

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': tamperedToken,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should reject POST request with SQL injection in CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': "'; DROP TABLE users;--",
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject POST request with XSS attempt in CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': '<script>alert(1)</script>',
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject POST request with null bytes in CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': 'token\x00malicious',
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Excluded Paths - No CSRF Protection', () => {
    it('should allow POST to webhook paths without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/webhooks/stripe', async () => ({ received: true }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhooks/stripe',
        payload: { event: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST to health check without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/health', async () => ({ status: 'ok' }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST to metrics without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/metrics', async () => ({ recorded: true }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST to webhook subpaths without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/webhooks/whatsapp/message', async () => ({ received: true }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/webhooks/whatsapp/message',
        payload: { message: 'test' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support custom excluded paths', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        excludePaths: ['/api/public/*', '/status'],
      });

      fastify.post('/api/public/subscribe', async () => ({ subscribed: true }));
      fastify.post('/status', async () => ({ status: 'ok' }));

      const response1 = await fastify.inject({
        method: 'POST',
        url: '/api/public/subscribe',
        payload: { email: 'test@example.com' },
      });
      expect(response1.statusCode).toBe(200);

      const response2 = await fastify.inject({
        method: 'POST',
        url: '/status',
      });
      expect(response2.statusCode).toBe(200);
    });
  });

  describe('Safe Methods - No CSRF Protection', () => {
    it('should allow GET requests without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.get('/api/data', async () => ({ data: 'test' }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/data',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow HEAD requests without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.head('/api/data', async () => undefined);

      const response = await fastify.inject({
        method: 'HEAD',
        url: '/api/data',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.options('/api/data', async () => undefined);

      const response = await fastify.inject({
        method: 'OPTIONS',
        url: '/api/data',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Cookie Security Settings', () => {
    it('should set secure cookie in production', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: true,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = response.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      expect(csrfCookie!.secure).toBe(true);
    });

    it('should set httpOnly cookie', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = response.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      expect(csrfCookie!.httpOnly).toBe(true);
    });

    it('should set SameSite=strict cookie', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = response.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      expect(csrfCookie!.sameSite).toBe('Strict');
    });

    it('should set cookie path to /', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = response.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      expect(csrfCookie!.path).toBe('/');
    });

    it('should set cookie maxAge from config', async () => {
      const maxAge = 3600; // 1 hour

      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        maxAge,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const body = JSON.parse(response.body);
      expect(body.expiresIn).toBe(maxAge);
    });
  });

  describe('Configuration Options', () => {
    it('should use custom cookie name', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        cookieName: 'custom-csrf-token',
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = response.cookies;
      const csrfCookie = cookies.find((c) => c.name === 'custom-csrf-token');

      expect(csrfCookie).toBeDefined();
    });

    it('should use custom header name', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        headerName: 'x-custom-csrf',
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const body = JSON.parse(response.body);
      expect(body.headerName).toBe('x-custom-csrf');
    });

    it('should protect custom HTTP methods', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
        protectedMethods: ['POST', 'PUT'], // Only POST and PUT
      });

      fastify.post('/api/data', async () => ({ success: true }));
      fastify.delete('/api/data/:id', async () => ({ deleted: true }));

      // POST should require CSRF
      const postResponse = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        payload: { data: 'test' },
      });
      expect(postResponse.statusCode).toBe(403);

      // DELETE should not require CSRF (not in protectedMethods)
      const deleteResponse = await fastify.inject({
        method: 'DELETE',
        url: '/api/data/123',
      });
      expect(deleteResponse.statusCode).toBe(200);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for token validation', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Test with tokens of different lengths
      const shortToken = 'abc';
      const longToken = 'a'.repeat(100);

      const response1 = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': shortToken,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      const response2 = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': longToken,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      // Both should be rejected with 403
      expect(response1.statusCode).toBe(403);
      expect(response2.statusCode).toBe(403);

      // Both should have same error code (no timing leak)
      expect(JSON.parse(response1.body).code).toBe('CSRF_TOKEN_INVALID');
      expect(JSON.parse(response2.body).code).toBe('CSRF_TOKEN_INVALID');
    });

    it('should handle length mismatches safely', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // Token with very different length
      const wrongLengthToken = token.substring(0, 5);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': wrongLengthToken,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Query Parameters and URL Fragments', () => {
    it('should handle URLs with query parameters', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data?filter=active&sort=name',
        headers: {
          'x-csrf-token': token,
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should match excluded paths ignoring query parameters', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/webhooks/stripe', async () => ({ received: true }));

      // Webhook with query params should still be excluded
      const response = await fastify.inject({
        method: 'POST',
        url: '/webhooks/stripe?event_type=payment',
        payload: { event: 'payment.succeeded' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing cookie header gracefully', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      // Request with header token but no cookies at all
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': 'some-token',
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).code).toBe('CSRF_TOKEN_MISSING');
    });

    it('should handle case-insensitive header name matching', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      // HTTP headers are case-insensitive
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'X-CSRF-TOKEN': token, // Uppercase
          cookie: `__Host-csrf-token=${csrfCookie!.value}`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle multiple cookie values', async () => {
      await fastify.register(csrfProtectionPlugin, {
        isProduction: false,
      });

      fastify.post('/api/data', async () => ({ success: true }));

      const tokenResponse = await fastify.inject({
        method: 'GET',
        url: '/csrf-token',
      });

      const token = JSON.parse(tokenResponse.body).token;
      const cookies = tokenResponse.cookies;
      const csrfCookie = cookies.find((c) => c.name === '__Host-csrf-token');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/data',
        headers: {
          'x-csrf-token': token,
          cookie: `session=abc123; __Host-csrf-token=${csrfCookie!.value}; other=value`,
        },
        payload: { data: 'test' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
