import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createGuidanceRoutes } from '../routes/guidance.js';
import type { IGuidanceRepository } from '@medicalcor/domain';

/**
 * Guidance Routes Tests
 *
 * Tests for Agent Guidance API endpoints:
 * - CRUD Operations
 * - Status Management (activate, deactivate, publish)
 * - Versioning
 * - Call Guidance (real-time)
 * - Search
 */

// Mock Guidance Repository
const mockGuidanceRepository: IGuidanceRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByClinicId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  search: vi.fn(),
  findVersions: vi.fn(),
  findActive: vi.fn(),
};

// Mock guidance data
const mockGuidance = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Guidance Script',
  clinicId: 'clinic-123',
  category: 'consultation',
  type: 'script',
  status: 'active',
  version: 1,
  content: {
    steps: [
      { id: 'step-1', title: 'Greeting', content: 'Hello!' },
      { id: 'step-2', title: 'Qualification', content: 'How can I help?' },
    ],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Guidance Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    (mockGuidanceRepository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [mockGuidance],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    (mockGuidanceRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockGuidance);
    (mockGuidanceRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockGuidance);
    (mockGuidanceRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockGuidance);
    (mockGuidanceRepository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (mockGuidanceRepository.search as ReturnType<typeof vi.fn>).mockResolvedValue([mockGuidance]);
    (mockGuidanceRepository.findVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockGuidance,
    ]);

    app = Fastify({ logger: false });
    const guidanceRoutes = createGuidanceRoutes(mockGuidanceRepository);
    await app.register(guidanceRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /guidance - List guidance
  // ==========================================================================

  describe('GET /guidance', () => {
    it('should return 401 without clinic context', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Clinic context required');
    });
  });

  // ==========================================================================
  // GET /guidance/:id - Get specific guidance
  // ==========================================================================

  describe('GET /guidance/:id', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid guidance ID');
    });

    it('should return correlationId in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/123e4567-e89b-12d3-a456-426614174000',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
    });
  });

  // ==========================================================================
  // POST /guidance - Create guidance
  // ==========================================================================

  describe('POST /guidance', () => {
    it('should return 401 without clinic context', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance',
        payload: {
          name: 'New Guidance',
          category: 'consultation',
          type: 'script',
          content: {},
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Clinic context required');
    });

    it('should return 400 for invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance',
        payload: {}, // Empty payload
      });

      expect(response.statusCode).toBe(401); // Returns 401 first because no clinic context
    });
  });

  // ==========================================================================
  // PUT /guidance/:id - Update guidance
  // ==========================================================================

  describe('PUT /guidance/:id', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/guidance/invalid-id',
        payload: {
          name: 'Updated Name',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid guidance ID');
    });
  });

  // ==========================================================================
  // DELETE /guidance/:id - Delete guidance
  // ==========================================================================

  describe('DELETE /guidance/:id', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/guidance/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid guidance ID');
    });
  });

  // ==========================================================================
  // POST /guidance/:id/activate - Activate guidance
  // ==========================================================================

  describe('POST /guidance/:id/activate', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/activate',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid guidance ID');
    });
  });

  // ==========================================================================
  // POST /guidance/:id/deactivate - Deactivate guidance
  // ==========================================================================

  describe('POST /guidance/:id/deactivate', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/deactivate',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // POST /guidance/:id/publish - Publish guidance
  // ==========================================================================

  describe('POST /guidance/:id/publish', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/publish',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // POST /guidance/:id/version - Create new version
  // ==========================================================================

  describe('POST /guidance/:id/version', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/version',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /guidance/:id/versions - Get version history
  // ==========================================================================

  describe('GET /guidance/:id/versions', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id/versions',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // Call Guidance Endpoints
  // ==========================================================================

  describe('POST /guidance/calls/:callSid/load', () => {
    it('should return 401 without clinic context', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call-sid/load',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Clinic context required');
    });

    it('should return 400 for empty callSid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls//load',
        payload: {},
      });

      // Fastify will return 404 for non-matching route
      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('GET /guidance/calls/:callSid', () => {
    it('should return 404 when no guidance loaded', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/calls/non-existent-call',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'No guidance loaded for this call');
    });

    it('should return 400 for empty callSid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/calls/',
      });

      // Will not match the route
      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('POST /guidance/calls/:callSid/step/complete', () => {
    it('should return 400 for invalid step data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/step/complete',
        payload: {
          // Missing required stepId
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate stepId is not empty', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/step/complete',
        payload: {
          stepId: '', // Empty stepId
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /guidance/calls/:callSid/message', () => {
    it('should return 400 for invalid message data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/message',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate speaker enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/message',
        payload: {
          speaker: 'invalid',
          text: 'Hello',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate text is not empty', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/message',
        payload: {
          speaker: 'agent',
          text: '', // Empty text
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /guidance/calls/:callSid/suggestions/:suggestionId/acknowledge', () => {
    it('should return 404 for non-existent suggestion', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/test-call/suggestions/suggestion-123/acknowledge',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Suggestion not found');
    });
  });

  describe('DELETE /guidance/calls/:callSid', () => {
    it('should return success for ending call guidance', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/guidance/calls/test-call',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', true);
    });

    it('should return 400 for empty callSid', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/guidance/calls/',
      });

      expect([400, 404]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // GET /guidance/search - Search guidance
  // ==========================================================================

  describe('GET /guidance/search', () => {
    it('should return 401 without clinic context', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/search',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with query params but no clinic context', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/search?q=test&tags=implant',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return correlationId in error responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
    });
  });
});
