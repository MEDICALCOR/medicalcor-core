import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiDocsRoutes } from '../routes/api-docs.js';

/**
 * API Docs Routes Tests
 *
 * Tests for API Documentation Portal:
 * - GET /api-docs - Landing page
 * - GET /api-docs/openapi.json - OpenAPI spec in JSON
 * - GET /api-docs/openapi.yaml - OpenAPI spec in YAML
 * - GET /api-docs/postman - Postman collection
 * - GET /api-docs/stats - API statistics
 */

describe('API Docs Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(apiDocsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /api-docs
  // ==========================================================================

  describe('GET /api-docs', () => {
    it('should return HTML landing page', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should include API title in page', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.body).toContain('MedicalCor');
    });

    it('should include links to download formats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.body).toContain('openapi.json');
      expect(response.body).toContain('openapi.yaml');
      expect(response.body).toContain('postman');
    });

    it('should include authentication information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.body).toContain('Authentication');
      expect(response.body).toContain('X-API-Key');
    });

    it('should include endpoint statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.body).toContain('Endpoints');
    });
  });

  // ==========================================================================
  // GET /api-docs/openapi.json
  // ==========================================================================

  describe('GET /api-docs/openapi.json', () => {
    it('should return 200 with JSON content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return parseable JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.json',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('should set Content-Disposition header for download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.json',
      });

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('medicalcor-openapi.json');
    });
  });

  // ==========================================================================
  // GET /api-docs/openapi.yaml
  // ==========================================================================

  describe('GET /api-docs/openapi.yaml', () => {
    it('should return YAML content', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/yaml');
    });

    it('should include OpenAPI specification header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.body).toContain('# OpenAPI Specification');
    });

    it('should include version comment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.body).toContain('# Version:');
    });

    it('should include generated timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.body).toContain('# Generated:');
    });

    it('should set Content-Disposition header for download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('medicalcor-openapi.yaml');
    });

    it('should contain valid YAML structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      // Basic YAML structure checks
      expect(response.body).toContain('openapi:');
      expect(response.body).toContain('info:');
      expect(response.body).toContain('paths:');
    });
  });

  // ==========================================================================
  // GET /api-docs/postman
  // ==========================================================================

  describe('GET /api-docs/postman', () => {
    it('should return 200 with JSON content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/postman',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return parseable JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/postman',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('should set Content-Disposition header for download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/postman',
      });

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('medicalcor-postman.json');
    });
  });

  // ==========================================================================
  // GET /api-docs/stats
  // ==========================================================================

  describe('GET /api-docs/stats', () => {
    it('should return API statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/stats',
      });

      expect(response.statusCode).toBe(200);
      const stats = JSON.parse(response.body);
      expect(stats).toHaveProperty('title');
      expect(stats).toHaveProperty('version');
      expect(stats).toHaveProperty('endpointCount');
      expect(stats).toHaveProperty('tagCount');
    });

    it('should include method breakdown', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/stats',
      });

      const stats = JSON.parse(response.body);
      expect(stats).toHaveProperty('methods');
      expect(typeof stats.methods).toBe('object');
    });

    it('should include tags list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/stats',
      });

      const stats = JSON.parse(response.body);
      expect(stats).toHaveProperty('tags');
      expect(Array.isArray(stats.tags)).toBe(true);
    });

    it('should return numeric endpoint count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/stats',
      });

      const stats = JSON.parse(response.body);
      expect(typeof stats.endpointCount).toBe('number');
      expect(stats.endpointCount).toBeGreaterThanOrEqual(0);
    });

    it('should return numeric tag count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/stats',
      });

      const stats = JSON.parse(response.body);
      expect(typeof stats.tagCount).toBe('number');
      expect(stats.tagCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Content Type Tests
  // ==========================================================================

  describe('Content Types', () => {
    it('should return correct content type for HTML', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs',
      });

      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('should return correct content type for JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.json',
      });

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return correct content type for YAML', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-docs/openapi.yaml',
      });

      expect(response.headers['content-type']).toMatch(/text\/yaml/);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should handle concurrent requests to all endpoints', async () => {
      const endpoints = [
        '/api-docs',
        '/api-docs/openapi.json',
        '/api-docs/openapi.yaml',
        '/api-docs/postman',
        '/api-docs/stats',
      ];

      const requests = endpoints.map((url) =>
        app.inject({
          method: 'GET',
          url,
        })
      );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should return 200 for all documentation endpoints', async () => {
      const endpoints = [
        '/api-docs',
        '/api-docs/openapi.json',
        '/api-docs/openapi.yaml',
        '/api-docs/postman',
        '/api-docs/stats',
      ];

      for (const url of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url,
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });
});
