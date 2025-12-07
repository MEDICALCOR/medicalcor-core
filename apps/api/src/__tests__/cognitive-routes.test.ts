import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createCognitiveRoutes, type CognitiveRouteDependencies } from '../routes/cognitive.js';

/**
 * Cognitive Routes Tests
 *
 * Tests for Cognitive Memory API endpoints:
 * - GET /cognitive/patterns/:subjectType/:subjectId - Get behavioral patterns
 * - POST /cognitive/patterns/:subjectType/:subjectId/detect - Trigger detection
 * - GET /cognitive/insights/:subjectType/:subjectId - Get insights
 * - GET /cognitive/insights/:subjectId - Simplified insights endpoint
 * - GET /cognitive/memory/:subjectType/:subjectId - Get episodic memory
 * - GET /cognitive/memory/:subjectType/:subjectId/summary - Get memory summary
 * - GET /cognitive/memory/:subjectType/:subjectId/similar - Find similar interactions
 * - GET /cognitive/stats/patterns - Get pattern statistics
 */

// Mock dependencies
const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

const mockEmbeddings = {
  generate: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
};

// Mock pattern detector and memory retrieval
vi.mock('@medicalcor/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@medicalcor/core')>();
  return {
    ...original,
    createPatternDetector: vi.fn(() => ({
      getStoredPatterns: vi.fn().mockResolvedValue([
        {
          id: 'pattern-1',
          patternType: 'engagement',
          confidence: 0.85,
          data: {},
        },
      ]),
      detectPatterns: vi.fn().mockResolvedValue([
        {
          id: 'pattern-2',
          patternType: 'preference',
          confidence: 0.9,
          data: {},
        },
      ]),
      generateInsights: vi.fn().mockResolvedValue([
        {
          id: 'insight-1',
          type: 'recommendation',
          content: 'Test insight',
        },
      ]),
      getPatternStats: vi.fn().mockResolvedValue({
        totalPatterns: 10,
        byType: { engagement: 5, preference: 3, behavior: 2 },
      }),
    })),
    createMemoryRetrievalService: vi.fn(() => ({
      query: vi.fn().mockResolvedValue([
        {
          id: 'event-1',
          type: 'message',
          timestamp: new Date().toISOString(),
        },
      ]),
      getSubjectSummary: vi.fn().mockResolvedValue({
        totalEvents: 50,
        firstInteraction: new Date().toISOString(),
        lastInteraction: new Date().toISOString(),
        channels: ['whatsapp', 'web'],
      }),
      findSimilarInteractions: vi.fn().mockResolvedValue([
        {
          id: 'similar-1',
          similarity: 0.92,
          event: {},
        },
      ]),
    })),
    generateCorrelationId: vi.fn(() => 'test-correlation-id'),
    ValidationError: original.ValidationError,
    toSafeErrorResponse: original.toSafeErrorResponse,
    SubjectTypeSchema: original.SubjectTypeSchema,
  };
});

describe('Cognitive Routes', () => {
  let app: FastifyInstance;
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  beforeAll(async () => {
    const deps: CognitiveRouteDependencies = {
      pool: mockPool as unknown as CognitiveRouteDependencies['pool'],
      openai: mockOpenAI as unknown as CognitiveRouteDependencies['openai'],
      embeddings: mockEmbeddings as unknown as CognitiveRouteDependencies['embeddings'],
    };

    app = Fastify({ logger: false });
    const cognitiveRoutes = createCognitiveRoutes(deps);
    await app.register(cognitiveRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /cognitive/patterns/:subjectType/:subjectId
  // ==========================================================================

  describe('GET /cognitive/patterns/:subjectType/:subjectId', () => {
    it('should return patterns for valid subject', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/patterns/lead/${validUUID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('patterns');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('correlationId');
      expect(Array.isArray(body.patterns)).toBe(true);
    });

    it('should return 400 for invalid subjectType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/patterns/invalid/${validUUID}`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid subject parameters');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cognitive/patterns/lead/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Invalid subject parameters');
    });

    it('should support minConfidence filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/patterns/lead/${validUUID}?minConfidence=0.8`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support patternTypes filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/patterns/lead/${validUUID}?patternTypes=engagement,preference`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid subjectTypes: lead, patient, contact', async () => {
      const subjectTypes = ['lead', 'patient', 'contact'];

      for (const subjectType of subjectTypes) {
        const response = await app.inject({
          method: 'GET',
          url: `/cognitive/patterns/${subjectType}/${validUUID}`,
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  // ==========================================================================
  // POST /cognitive/patterns/:subjectType/:subjectId/detect
  // ==========================================================================

  describe('POST /cognitive/patterns/:subjectType/:subjectId/detect', () => {
    it('should trigger pattern detection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/cognitive/patterns/lead/${validUUID}/detect`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('patterns');
      expect(body).toHaveProperty('patternsDetected');
    });

    it('should return 400 for invalid subjectType', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/cognitive/patterns/invalid/${validUUID}/detect`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept enableLLMPatterns option', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/cognitive/patterns/lead/${validUUID}/detect`,
        payload: {
          enableLLMPatterns: true,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // GET /cognitive/insights/:subjectType/:subjectId
  // ==========================================================================

  describe('GET /cognitive/insights/:subjectType/:subjectId', () => {
    it('should return insights for valid subject', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/lead/${validUUID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('insights');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 400 for invalid subjectType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/invalid/${validUUID}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should support types filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/lead/${validUUID}?types=recommendation,warning`,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // GET /cognitive/insights/:subjectId (simplified)
  // ==========================================================================

  describe('GET /cognitive/insights/:subjectId', () => {
    it('should return insights with default subjectType (lead)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/${validUUID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('subjectId', validUUID);
      expect(body).toHaveProperty('subjectType', 'lead');
      expect(body).toHaveProperty('insights');
      expect(body).toHaveProperty('total');
    });

    it('should accept subjectType in query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/${validUUID}?subjectType=patient`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.subjectType).toBe('patient');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cognitive/insights/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid subjectId');
    });

    it('should return 400 for invalid subjectType in query', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/insights/${validUUID}?subjectType=invalid`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /cognitive/memory/:subjectType/:subjectId
  // ==========================================================================

  describe('GET /cognitive/memory/:subjectType/:subjectId', () => {
    it('should return memory events for valid subject', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 400 for invalid subjectType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/invalid/${validUUID}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should support semanticQuery filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?semanticQuery=implant consultation`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support eventTypes filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?eventTypes=message,call`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support channels filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?channels=whatsapp,web`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support date range filters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?fromDate=2024-01-01T00:00:00Z&toDate=2024-12-31T23:59:59Z`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support limit filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?limit=10`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate limit range', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}?limit=200`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /cognitive/memory/:subjectType/:subjectId/summary
  // ==========================================================================

  describe('GET /cognitive/memory/:subjectType/:subjectId/summary', () => {
    it('should return memory summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}/summary`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 400 for invalid subjectType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/invalid/${validUUID}/summary`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /cognitive/memory/:subjectType/:subjectId/similar
  // ==========================================================================

  describe('GET /cognitive/memory/:subjectType/:subjectId/similar', () => {
    it('should return similar interactions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}/similar?query=implant consultation`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('similar');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 400 when query is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}/similar`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Query parameter is required');
    });

    it('should support limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}/similar?query=test&limit=10`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support minSimilarity parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/memory/lead/${validUUID}/similar?query=test&minSimilarity=0.8`,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // GET /cognitive/stats/patterns
  // ==========================================================================

  describe('GET /cognitive/stats/patterns', () => {
    it('should return pattern statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cognitive/stats/patterns',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('stats');
      expect(body).toHaveProperty('correlationId');
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should include correlationId in all responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/cognitive/patterns/lead/${validUUID}`,
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
    });

    it('should include correlationId in error responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cognitive/patterns/invalid/not-uuid',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('correlationId');
    });
  });
});
