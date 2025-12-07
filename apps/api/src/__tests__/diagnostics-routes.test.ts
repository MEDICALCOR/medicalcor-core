import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { diagnosticsRoutes } from '../routes/diagnostics.js';

/**
 * Diagnostics Routes Tests
 *
 * Tests for:
 * - GET /metrics - Prometheus metrics endpoint
 * - GET /metrics/json - JSON format metrics
 * - GET /diagnostics - Full diagnostic snapshot
 * - GET /diagnostics/quick - Quick health check
 * - GET /diagnostics/traces/:traceId - Trace lookup
 * - GET /diagnostics/traces - Search traces
 * - GET /diagnostics/health - Detailed health check
 * - GET /diagnostics/system - System resource information
 */

describe('Diagnostics Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(diagnosticsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /metrics
  // ==========================================================================

  describe('GET /metrics', () => {
    it('should return Prometheus-format metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should include version in content-type header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.headers['content-type']).toContain('version=0.0.4');
    });
  });

  // ==========================================================================
  // GET /metrics/json
  // ==========================================================================

  describe('GET /metrics/json', () => {
    it('should return metrics in JSON format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(typeof body).toBe('object');
    });
  });

  // ==========================================================================
  // GET /diagnostics
  // ==========================================================================

  describe('GET /diagnostics', () => {
    it('should return full diagnostic snapshot', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('_meta');
      expect(body._meta).toHaveProperty('executionTimeMs');
      expect(body._meta).toHaveProperty('target', '100ms');
      expect(body._meta).toHaveProperty('withinTarget');
    });

    it('should include timestamp in snapshot', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('timestamp');
    });

    it('should include health information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('health');
    });
  });

  // ==========================================================================
  // GET /diagnostics/quick
  // ==========================================================================

  describe('GET /diagnostics/quick', () => {
    it('should return quick health check', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/quick',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('executionTimeMs');
      expect(typeof body.executionTimeMs).toBe('number');
    });

    it('should be fast (under 50ms)', async () => {
      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/quick',
      });
      const duration = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(50);
    });
  });

  // ==========================================================================
  // GET /diagnostics/traces/:traceId
  // ==========================================================================

  describe('GET /diagnostics/traces/:traceId', () => {
    it('should return 404 for non-existent trace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces/non-existent-trace-id',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('code', 'TRACE_NOT_FOUND');
      expect(body).toHaveProperty('message');
    });

    it('should include trace ID in error message', async () => {
      const traceId = 'test-trace-123';
      const response = await app.inject({
        method: 'GET',
        url: `/diagnostics/traces/${traceId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain(traceId);
    });
  });

  // ==========================================================================
  // GET /diagnostics/traces
  // ==========================================================================

  describe('GET /diagnostics/traces', () => {
    it('should return traces array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traces');
      expect(Array.isArray(body.traces)).toBe(true);
      expect(body).toHaveProperty('count');
      expect(typeof body.count).toBe('number');
    });

    it('should support correlationId filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces?correlationId=test-correlation',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traces');
      expect(Array.isArray(body.traces)).toBe(true);
    });

    it('should support minDurationMs filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces?minDurationMs=100',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traces');
    });

    it('should support status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces?status=ok',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('traces');
    });

    it('should support limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/traces?limit=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.traces.length).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // GET /diagnostics/health
  // ==========================================================================

  describe('GET /diagnostics/health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/health',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    });

    it('should include health checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/health',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('checks');
    });

    it('should include timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/health',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('timestamp');
      const timestamp = new Date(body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should return 503 when unhealthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/health',
      });

      const body = JSON.parse(response.body);
      if (body.status === 'unhealthy') {
        expect(response.statusCode).toBe(503);
      }
    });
  });

  // ==========================================================================
  // GET /diagnostics/system
  // ==========================================================================

  describe('GET /diagnostics/system', () => {
    it('should return system information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/system',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('system');
      expect(body).toHaveProperty('uptimeMs');
      expect(body).toHaveProperty('timestamp');
    });

    it('should include uptime as number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/system',
      });

      const body = JSON.parse(response.body);
      expect(typeof body.uptimeMs).toBe('number');
      expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include valid timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/diagnostics/system',
      });

      const body = JSON.parse(response.body);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Diagnostics Integration', () => {
    it('should handle rapid concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/diagnostics/quick',
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should have consistent structure across endpoints', async () => {
      const endpoints = ['/diagnostics', '/diagnostics/health', '/diagnostics/system'];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
        });

        expect([200, 503]).toContain(response.statusCode);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('timestamp');
      }
    });
  });
});
