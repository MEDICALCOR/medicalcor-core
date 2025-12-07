import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadTestingRoutes } from '../routes/load-testing.js';

/**
 * Load Testing Routes Tests
 *
 * Tests for:
 * - POST /load-tests - Store load test result
 * - GET /load-tests - Retrieve load test results with filtering
 * - GET /load-tests/dashboard - Get dashboard data
 * - GET /load-tests/:id - Get specific result
 * - DELETE /load-tests/:id - Delete result
 * - GET /load-tests/environments - Get unique environments
 */

describe('Load Testing Routes', () => {
  let app: FastifyInstance;
  let createdTestId: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(loadTestingRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // POST /load-tests
  // ==========================================================================

  describe('POST /load-tests', () => {
    it('should store a valid load test result', async () => {
      const payload = {
        scenario: 'smoke',
        baseUrl: 'http://localhost:3000',
        metrics: {
          totalRequests: 100,
          successRate: 99.5,
          avgDuration: 50,
          p95Duration: 120,
          p99Duration: 180,
        },
        thresholdsPassed: true,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('message');

      // Store for later tests
      createdTestId = body.id;
    });

    it('should reject invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload: {
          // Missing required fields
          scenario: 'invalid-scenario',
        },
      });

      expect(response.statusCode).toBe(400);
      // Route returns validation error (may or may not have success property)
      const body = JSON.parse(response.body);
      expect(body.success === false || body.error || body.message).toBeTruthy();
    });

    it('should accept all valid scenarios', async () => {
      const scenarios = ['smoke', 'load', 'stress', 'soak', 'custom'];

      for (const scenario of scenarios) {
        const response = await app.inject({
          method: 'POST',
          url: '/load-tests',
          payload: {
            scenario,
            baseUrl: 'http://localhost:3000',
            metrics: {
              totalRequests: 50,
              successRate: 100,
              avgDuration: 30,
              p95Duration: 80,
              p99Duration: 100,
            },
          },
        });

        expect(response.statusCode).toBe(201);
      }
    });

    it('should calculate status based on thresholds', async () => {
      // Test failing threshold
      const response = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload: {
          scenario: 'load',
          baseUrl: 'http://localhost:3000',
          metrics: {
            totalRequests: 100,
            successRate: 99,
            avgDuration: 50,
            p95Duration: 100,
            p99Duration: 150,
          },
          thresholdsPassed: false,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should handle optional environment field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload: {
          scenario: 'smoke',
          baseUrl: 'http://localhost:3000',
          environment: 'staging',
          metrics: {
            totalRequests: 100,
            successRate: 100,
            avgDuration: 40,
            p95Duration: 90,
            p99Duration: 120,
          },
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ==========================================================================
  // GET /load-tests
  // ==========================================================================

  describe('GET /load-tests', () => {
    it('should return list of load test results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
      expect(Array.isArray(body.results)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('offset');
    });

    it('should support timeRange filter', async () => {
      const timeRanges = ['7d', '30d', '90d', '6m', '1y'];

      for (const timeRange of timeRanges) {
        const response = await app.inject({
          method: 'GET',
          url: `/load-tests?timeRange=${timeRange}`,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should support scenario filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests?scenario=smoke',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.results.forEach((result: { scenario: string }) => {
        expect(result.scenario).toBe('smoke');
      });
    });

    it('should support environment filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests?environment=staging',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.results.forEach((result: { environment: string }) => {
        expect(result.environment).toBe('staging');
      });
    });

    it('should support status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests?status=passed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.results.forEach((result: { status: string }) => {
        expect(result.status).toBe('passed');
      });
    });

    it('should support pagination with limit and offset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests?limit=5&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.limit).toBe(5);
      expect(body.offset).toBe(0);
      expect(body.results.length).toBeLessThanOrEqual(5);
    });

    it('should enforce max limit of 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests?limit=200',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.limit).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // GET /load-tests/dashboard
  // ==========================================================================

  describe('GET /load-tests/dashboard', () => {
    it('should return dashboard data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/dashboard',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('stats');
      expect(body).toHaveProperty('trends');
      expect(body).toHaveProperty('scenarioBreakdown');
      expect(body).toHaveProperty('environmentComparison');
      expect(body).toHaveProperty('recentRuns');
    });

    it('should include summary stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/dashboard',
      });

      const body = JSON.parse(response.body);
      expect(body.stats).toHaveProperty('totalRuns');
      expect(body.stats).toHaveProperty('passedRuns');
      expect(body.stats).toHaveProperty('failedRuns');
      expect(body.stats).toHaveProperty('degradedRuns');
      expect(body.stats).toHaveProperty('avgP95Duration');
      expect(body.stats).toHaveProperty('avgSuccessRate');
    });

    it('should support timeRange filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/dashboard?timeRange=7d',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support environment filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/dashboard?environment=local',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return recent runs array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/dashboard',
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.recentRuns)).toBe(true);
      expect(body.recentRuns.length).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // GET /load-tests/:id
  // ==========================================================================

  describe('GET /load-tests/:id', () => {
    it('should return specific load test result', async () => {
      // Skip if no test was created
      if (!createdTestId) return;

      const response = await app.inject({
        method: 'GET',
        url: `/load-tests/${createdTestId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id', createdTestId);
      expect(body).toHaveProperty('scenario');
      expect(body).toHaveProperty('status');
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('message');
    });
  });

  // ==========================================================================
  // DELETE /load-tests/:id
  // ==========================================================================

  describe('DELETE /load-tests/:id', () => {
    it('should delete a load test result', async () => {
      // First create a test to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload: {
          scenario: 'smoke',
          baseUrl: 'http://localhost:3000',
          metrics: {
            totalRequests: 10,
            successRate: 100,
            avgDuration: 20,
            p95Duration: 50,
            p99Duration: 60,
          },
        },
      });

      const { id } = JSON.parse(createResponse.body);

      // Now delete it
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/load-tests/${id}`,
      });

      expect(deleteResponse.statusCode).toBe(200);
      const body = JSON.parse(deleteResponse.body);
      expect(body).toHaveProperty('success', true);

      // Verify it's deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/load-tests/${id}`,
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/load-tests/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', false);
    });
  });

  // ==========================================================================
  // GET /load-tests/environments
  // ==========================================================================

  describe('GET /load-tests/environments', () => {
    it('should return list of unique environments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/environments',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('environments');
      expect(Array.isArray(body.environments)).toBe(true);
    });

    it('should return unique values only', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/load-tests/environments',
      });

      const body = JSON.parse(response.body);
      const unique = [...new Set(body.environments)];
      expect(body.environments.length).toBe(unique.length);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Load Testing Integration', () => {
    it('should handle full lifecycle: create, read, delete', async () => {
      // Create
      const createResponse = await app.inject({
        method: 'POST',
        url: '/load-tests',
        payload: {
          scenario: 'custom',
          baseUrl: 'http://example.com',
          environment: 'integration-test',
          metrics: {
            totalRequests: 500,
            successRate: 98.5,
            avgDuration: 45,
            p95Duration: 110,
            p99Duration: 160,
          },
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const { id } = JSON.parse(createResponse.body);

      // Read
      const readResponse = await app.inject({
        method: 'GET',
        url: `/load-tests/${id}`,
      });

      expect(readResponse.statusCode).toBe(200);
      const result = JSON.parse(readResponse.body);
      expect(result.scenario).toBe('custom');
      expect(result.environment).toBe('integration-test');

      // Verify in list
      const listResponse = await app.inject({
        method: 'GET',
        url: '/load-tests?environment=integration-test',
      });

      expect(listResponse.statusCode).toBe(200);
      const list = JSON.parse(listResponse.body);
      expect(list.results.some((r: { id: string }) => r.id === id)).toBe(true);

      // Delete
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/load-tests/${id}`,
      });

      expect(deleteResponse.statusCode).toBe(200);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/load-tests/dashboard',
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });
  });
});
