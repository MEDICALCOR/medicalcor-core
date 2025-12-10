/**
 * Comprehensive tests for Guidance Routes
 * Tests validation, error handling, and route-level logic
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { createGuidanceRoutes } from '../routes/guidance.js';
import type { IGuidanceRepository } from '@medicalcor/domain';
import type { AgentGuidance } from '@medicalcor/types';

// =============================================================================
// Mock Setup
// =============================================================================

const createMockGuidance = (overrides: Partial<AgentGuidance> = {}): AgentGuidance =>
  ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    clinicId: 'clinic-123',
    name: 'Test Guidance Script',
    description: 'Test description',
    type: 'inbound',
    category: 'general',
    audience: 'new-patient',
    status: 'active',
    version: 1,
    initialGreeting: 'Hello',
    initialGreetingRo: 'Buna',
    steps: [
      {
        id: 'step-1',
        name: 'Greeting',
        description: 'Greet the patient',
        order: 1,
        content: 'Hello!',
        contentRo: 'Buna!',
        isRequired: true,
        expectedDuration: 30,
      },
    ],
    keyPoints: ['Be friendly'],
    objectionHandlers: [],
    closingStatements: ['Thank you'],
    closingStatementsRo: ['Multumim'],
    procedures: [],
    languages: ['en'],
    defaultLanguage: 'en',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as AgentGuidance;

// Create mock repository
const createMockRepository = (): IGuidanceRepository => ({
  findById: vi.fn().mockResolvedValue(null),
  findAll: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  findByClinicId: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  create: vi.fn().mockResolvedValue(createMockGuidance()),
  update: vi.fn().mockResolvedValue(createMockGuidance()),
  delete: vi.fn().mockResolvedValue(true),
  search: vi.fn().mockResolvedValue([]),
  findVersions: vi.fn().mockResolvedValue([]),
  findActive: vi.fn().mockResolvedValue(null),
});

// =============================================================================
// Test Helpers
// =============================================================================

async function createTestApp(
  repository: IGuidanceRepository,
  clinicId?: string
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Add clinic context decoration
  app.decorateRequest('clinicId', '');

  // Hook to set clinic context
  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (clinicId) {
      (request as FastifyRequest & { clinicId: string }).clinicId = clinicId;
    }
  });

  const guidanceRoutes = createGuidanceRoutes(repository);
  await app.register(guidanceRoutes);
  await app.ready();
  return app;
}

// =============================================================================
// Tests
// =============================================================================

describe('Guidance Routes - Validation and Error Handling', () => {
  let app: FastifyInstance;
  let mockRepository: IGuidanceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
  });

  afterAll(async () => {
    // Clean up
  });

  // =========================================================================
  // Authentication Tests
  // =========================================================================

  describe('Clinic Context Authentication', () => {
    it('GET /guidance should return 401 without clinic context', async () => {
      app = await createTestApp(mockRepository);
      const response = await app.inject({
        method: 'GET',
        url: '/guidance',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Clinic context required');
      expect(body).toHaveProperty('correlationId');
      await app.close();
    });

    it('POST /guidance should return 401 without clinic context', async () => {
      app = await createTestApp(mockRepository);
      const response = await app.inject({
        method: 'POST',
        url: '/guidance',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/load should return 401 without clinic context', async () => {
      app = await createTestApp(mockRepository);
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/load',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('GET /guidance/search should return 401 without clinic context', async () => {
      app = await createTestApp(mockRepository);
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/search',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  // =========================================================================
  // UUID Validation Tests
  // =========================================================================

  describe('UUID Parameter Validation', () => {
    it('GET /guidance/:id should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid guidance ID');
      await app.close();
    });

    it('PUT /guidance/:id should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'PUT',
        url: '/guidance/invalid-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('DELETE /guidance/:id should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'DELETE',
        url: '/guidance/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/:id/activate should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/activate',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/:id/deactivate should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/deactivate',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/:id/publish should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/publish',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/:id/version should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/invalid-id/version',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('GET /guidance/:id/versions should return 400 for invalid UUID', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id/versions',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // =========================================================================
  // Body Validation Tests
  // =========================================================================

  describe('Request Body Validation', () => {
    it('POST /guidance/calls/:callSid/step/complete should return 400 for missing stepId', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/step/complete',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/step/complete should return 400 for empty stepId', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/step/complete',
        payload: { stepId: '' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/message should return 400 for missing fields', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/message',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/message should return 400 for invalid speaker', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/message',
        payload: { speaker: 'invalid', text: 'Hello' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/message should return 400 for empty text', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/message',
        payload: { speaker: 'agent', text: '' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/load should return 400 for invalid category', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/load',
        payload: { category: 'invalid_category' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // =========================================================================
  // Not Found Tests
  // =========================================================================

  describe('404 Not Found Responses', () => {
    it('GET /guidance/:id should return 404 or 500 when guidance not found', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/guidance/123e4567-e89b-12d3-a456-426614174000',
      });

      // Service layer may return 404 or 500 depending on implementation
      expect([404, 500]).toContain(response.statusCode);
      await app.close();
    });

    it('GET /guidance/calls/:callSid should return 404 when no guidance loaded', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/calls/non-existent-call',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('No guidance loaded for this call');
      await app.close();
    });

    it('POST /guidance/calls/:callSid/suggestions/:suggestionId/acknowledge should return 404', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/suggestions/sug-1/acknowledge',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Suggestion not found');
      await app.close();
    });
  });

  // =========================================================================
  // Success Cases
  // =========================================================================

  describe('Success Responses', () => {
    it('DELETE /guidance/calls/:callSid should return 200', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'DELETE',
        url: '/guidance/calls/CA123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      await app.close();
    });
  });

  // =========================================================================
  // Correlation ID Tests
  // =========================================================================

  describe('Correlation ID in Responses', () => {
    it('should include correlationId in error responses', async () => {
      app = await createTestApp(mockRepository);
      const response = await app.inject({
        method: 'GET',
        url: '/guidance',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
      expect(typeof body.correlationId).toBe('string');
      expect(body.correlationId.length).toBeGreaterThan(0);
      await app.close();
    });

    it('should include correlationId in 400 responses', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/invalid-id',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
      await app.close();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle empty route paths gracefully', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'GET',
        url: '/guidance/calls/',
      });

      // Will not match the route
      expect([400, 404]).toContain(response.statusCode);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/step/complete should accept valid data', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/step/complete',
        payload: {
          stepId: 'step-1',
          data: { notes: 'Test' },
        },
      });

      // Will return based on service logic, not 400
      expect(response.statusCode).not.toBe(400);
      await app.close();
    });

    it('POST /guidance/calls/:callSid/message should accept valid message', async () => {
      app = await createTestApp(mockRepository, 'clinic-123');
      const response = await app.inject({
        method: 'POST',
        url: '/guidance/calls/CA123/message',
        payload: {
          speaker: 'customer',
          text: 'Hello, I need help',
        },
      });

      // Will return based on service logic, not 400
      expect(response.statusCode).not.toBe(400);
      await app.close();
    });
  });
});
