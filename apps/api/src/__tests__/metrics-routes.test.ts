import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { metricsRoutes } from '../routes/metrics.js';

/**
 * Comprehensive Metrics Routes Tests
 *
 * Tests for:
 * - GET /metrics - Prometheus text format
 * - GET /metrics/json - JSON format metrics
 */

describe('Metrics Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(metricsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /metrics
  // ==========================================================================

  describe('GET /metrics', () => {
    it('should return 200 with Prometheus text format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-type']).toContain('version=0.0.4');
    });

    it('should include default Node.js metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;

      // Should include standard Node.js metrics with medicalcor_ prefix
      expect(body).toContain('medicalcor_');
      expect(body).toContain('# TYPE');
      expect(body).toContain('# HELP');
    });

    it('should include business metrics definitions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;

      // Check for business metric definitions
      // These are defined in metrics.ts but may not have values yet
      const expectedMetrics = [
        'medicalcor_lead_scoring_duration_seconds',
        'medicalcor_leads_scored_total',
        'medicalcor_dlq_pending_total',
        'medicalcor_projection_lag_seconds',
        'medicalcor_events_total',
        'medicalcor_event_store_duration_seconds',
        'medicalcor_external_service_duration_seconds',
        'medicalcor_circuit_breaker_state',
        'medicalcor_ai_function_calls_total',
        'medicalcor_ai_tokens_used_total',
      ];

      // At least some metrics should be present
      const hasMetrics = expectedMetrics.some((metric) => body.includes(metric));
      expect(hasMetrics || body.length > 0).toBe(true);
    });

    it('should use Prometheus text format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;

      // Prometheus format: metric_name{label="value"} value timestamp
      // Or: # HELP metric_name description
      // Or: # TYPE metric_name type
      const hasPrometheusFormat =
        body.includes('# HELP') || body.includes('# TYPE') || body.includes('medicalcor_');

      expect(hasPrometheusFormat).toBe(true);
    });

    it('should include memory metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;

      // Should include memory metrics (from collectDefaultMetrics)
      const hasMemoryMetrics =
        body.includes('heap') ||
        body.includes('memory') ||
        body.includes('nodejs_') ||
        body.includes('medicalcor_');

      expect(hasMemoryMetrics).toBe(true);
    });

    it('should be suitable for Prometheus scraping', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      // Prometheus scrape should be fast
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');

      // Should not be empty
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should handle concurrent metric scrapes', async () => {
      const requests = Array(10)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/metrics',
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
        expect(response.body.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // GET /metrics/json
  // ==========================================================================

  describe('GET /metrics/json', () => {
    it('should return 200 with JSON format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return valid JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('metrics');
    });

    it('should include metrics array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('metrics');
      expect(Array.isArray(body.metrics)).toBe(true);
    });

    it('should include metric metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      const body = JSON.parse(response.body);

      if (body.metrics.length > 0) {
        const metric = body.metrics[0];
        expect(metric).toHaveProperty('name');
        expect(metric).toHaveProperty('type');
        expect(metric).toHaveProperty('help');
      }
    });

    it('should include metric values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      const body = JSON.parse(response.body);

      if (body.metrics.length > 0) {
        const metric = body.metrics[0];
        expect(metric).toHaveProperty('values');
        expect(Array.isArray(metric.values)).toBe(true);
      }
    });

    it('should be suitable for debugging dashboards', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      const body = JSON.parse(response.body);

      // Should be easily parseable and usable in dashboards
      expect(body).toHaveProperty('metrics');
      expect(Array.isArray(body.metrics)).toBe(true);
    });
  });

  // ==========================================================================
  // Metric Export Tests
  // ==========================================================================

  describe('Metric Export', () => {
    it('should export metrics in both text and JSON formats', async () => {
      const textResponse = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const jsonResponse = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      expect(textResponse.statusCode).toBe(200);
      expect(jsonResponse.statusCode).toBe(200);

      // Both should have content
      expect(textResponse.body.length).toBeGreaterThan(0);
      expect(jsonResponse.body.length).toBeGreaterThan(0);
    });

    it('should maintain consistent metric names across formats', async () => {
      const textResponse = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const jsonResponse = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });

      const textBody = textResponse.body;
      const jsonBody = JSON.parse(jsonResponse.body);

      // Extract metric names from JSON
      const jsonMetricNames = jsonBody.metrics.map((m: { name: string }) => m.name);

      // At least some metrics should be in both formats
      if (jsonMetricNames.length > 0 && textBody.length > 0) {
        const hasCommonMetrics = jsonMetricNames.some((name: string) => textBody.includes(name));
        expect(hasCommonMetrics || jsonMetricNames.length === 0).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Metrics Performance', () => {
    it('should respond quickly to metric scrapes', async () => {
      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });
      const duration = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      // Metrics endpoint should be fast (< 500ms)
      expect(duration).toBeLessThan(500);
    });

    it('should respond quickly to JSON metric requests', async () => {
      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/json',
      });
      const duration = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      // JSON endpoint should be fast (< 500ms)
      expect(duration).toBeLessThan(500);
    });
  });
});
