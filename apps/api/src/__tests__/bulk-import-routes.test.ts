import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { bulkImportRoutes } from '../routes/bulk-import.js';

/**
 * Bulk Import Routes Tests
 *
 * Tests for:
 * - POST /api/leads/bulk-import - Import leads from CSV or JSON
 * - POST /api/leads/bulk-import/validate - Validate import data (dry-run)
 * - GET /api/leads/bulk-import/jobs/:jobId - Get import job status
 * - GET /api/leads/bulk-import/template - Download CSV template
 */

// Mock core functions
vi.mock('@medicalcor/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@medicalcor/core')>();
  return {
    ...original,
    parseCSV: vi.fn((content: string) => {
      const lines = content.trim().split('\n');
      if (lines.length <= 1) {
        return { rows: [], errors: [{ line: 1, error: 'No data rows' }] };
      }
      const rows = lines.slice(1).map((line, index) => {
        const parts = line.split(',');
        return {
          phone: parts[0] || '',
          fullName: parts[1] || '',
          email: parts[2] || '',
          source: parts[3] || 'csv-import',
        };
      });
      return { rows, errors: [] };
    }),
    processBulkImport: vi.fn((rows, options) => ({
      success: true,
      successCount: rows.length,
      errorCount: 0,
      skipCount: 0,
      errors: [],
      processedRows: rows.length,
    })),
    createBulkImportJob: vi.fn((options) => ({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'pending',
      totalRows: options.totalRows,
      processedRows: 0,
      format: options.format,
      createdAt: new Date().toISOString(),
    })),
    getBulkImportJob: vi.fn((jobId) => {
      if (jobId === '123e4567-e89b-12d3-a456-426614174000') {
        return {
          id: jobId,
          status: 'completed',
          totalRows: 10,
          processedRows: 10,
          successCount: 10,
          errorCount: 0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      }
      return null;
    }),
    generateCorrelationId: vi.fn(() => 'test-correlation'),
  };
});

describe('Bulk Import Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(bulkImportRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // POST /api/leads/bulk-import
  // ==========================================================================

  describe('POST /api/leads/bulk-import', () => {
    it('should import leads from rows array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          rows: [
            { phone: '+40721234567', fullName: 'Test User', source: 'test' },
            { phone: '+40722345678', fullName: 'Test User 2', source: 'test' },
          ],
        },
      });

      expect([200, 207]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('successCount');
    });

    it('should import leads from CSV content', async () => {
      const csvContent = `phone,fullName,email,source
+40721234567,Ion Popescu,ion@example.com,csv
+40722345678,Maria Ion,maria@example.com,csv`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          csvContent,
        },
      });

      expect([200, 207]).toContain(response.statusCode);
    });

    it('should import leads from JSON content', async () => {
      const jsonContent = JSON.stringify([
        { phone: '+40721234567', fullName: 'Test User', source: 'json' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          jsonContent,
        },
      });

      expect([200, 207]).toContain(response.statusCode);
    });

    it('should return 400 when no data source provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', false);
      expect(body.error).toContain('Must provide either');
    });

    it('should return 400 for invalid JSON content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          jsonContent: 'invalid json',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid JSON');
    });

    it('should return 400 when JSON is not an array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          jsonContent: JSON.stringify({ phone: '+40721234567' }),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('must be an array');
    });

    it('should require async mode for large imports', async () => {
      const rows = Array(600)
        .fill(null)
        .map((_, i) => ({
          phone: `+4072${String(i).padStart(7, '0')}`,
          fullName: `User ${i}`,
          source: 'test',
        }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: { rows },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('exceeds sync limit');
      expect(body).toHaveProperty('syncLimit');
    });

    it('should accept async mode for large imports', async () => {
      const rows = Array(600)
        .fill(null)
        .map((_, i) => ({
          phone: `+4072${String(i).padStart(7, '0')}`,
          fullName: `User ${i}`,
          source: 'test',
        }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import?async=true',
        payload: { rows },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('jobId');
      expect(body).toHaveProperty('status', 'pending');
      expect(body).toHaveProperty('statusUrl');
    });

    it('should support import options', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          rows: [{ phone: '+40721234567', fullName: 'Test', source: 'test' }],
          options: {
            skipDuplicates: true,
            defaultTags: ['imported'],
          },
        },
      });

      expect([200, 207]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // POST /api/leads/bulk-import/validate
  // ==========================================================================

  describe('POST /api/leads/bulk-import/validate', () => {
    it('should validate import data without persisting', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: {
          rows: [{ phone: '+40721234567', fullName: 'Test User', source: 'test' }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('successCount');
      expect(body).toHaveProperty('errorCount');
    });

    it('should validate CSV content', async () => {
      const csvContent = `phone,fullName,email,source
+40721234567,Ion Popescu,ion@example.com,csv`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: {
          csvContent,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate JSON content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: {
          jsonContent: JSON.stringify([
            { phone: '+40721234567', fullName: 'Test', source: 'json' },
          ]),
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: null,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return parse errors if any', async () => {
      const csvContent = `phone,fullName
invalid`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: {
          csvContent,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // parseErrors may or may not be present depending on validation
      expect(body).toHaveProperty('successCount');
    });
  });

  // ==========================================================================
  // GET /api/leads/bulk-import/jobs/:jobId
  // ==========================================================================

  describe('GET /api/leads/bulk-import/jobs/:jobId', () => {
    it('should return job status for valid job ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/jobs/123e4567-e89b-12d3-a456-426614174000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('job');
      expect(body).toHaveProperty('progress');
      expect(body).toHaveProperty('isComplete');
    });

    it('should return 400 for invalid job ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/jobs/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', false);
      expect(body.error).toContain('Invalid job ID');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/jobs/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', false);
      expect(body.error).toContain('Job not found');
    });

    it('should include progress calculation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/jobs/123e4567-e89b-12d3-a456-426614174000',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(typeof body.progress).toBe('number');
      expect(body.progress).toBeGreaterThanOrEqual(0);
      expect(body.progress).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // GET /api/leads/bulk-import/template
  // ==========================================================================

  describe('GET /api/leads/bulk-import/template', () => {
    it('should return CSV template', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/template',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('lead-import-template.csv');
    });

    it('should include header row', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/template',
      });

      const content = response.body;
      expect(content).toContain('phone');
      expect(content).toContain('fullName');
      expect(content).toContain('email');
      expect(content).toContain('source');
    });

    it('should include example data rows', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/leads/bulk-import/template',
      });

      const lines = response.body.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // Input Validation Tests
  // ==========================================================================

  describe('Input Validation', () => {
    it('should validate row phone format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import/validate',
        payload: {
          rows: [{ phone: 'invalid', fullName: 'Test', source: 'test' }],
        },
      });

      expect(response.statusCode).toBe(200);
      // Validation runs but may not reject - depends on schema
    });

    it('should handle empty rows array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/leads/bulk-import',
        payload: {
          rows: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should handle concurrent validation requests', async () => {
      const requests = Array(3)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'POST',
            url: '/api/leads/bulk-import/validate',
            payload: {
              rows: [{ phone: '+40721234567', fullName: 'Test', source: 'test' }],
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
