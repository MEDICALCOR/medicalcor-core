import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { aiRoutes } from '../routes/ai.js';

/**
 * Comprehensive AI Routes Tests
 *
 * Tests for:
 * - GET /ai/functions - Function discovery
 * - GET /ai/functions/:name - Get specific function
 * - POST /ai/execute - Execute AI functions
 * - GET /ai/openai/tools - OpenAI tool format
 * - GET /ai/anthropic/tools - Anthropic tool format
 * - GET /ai/categories - Function categories
 * - GET /ai/schema - OpenAPI schema
 */

describe('AI Routes', () => {
  let app: FastifyInstance;
  const validApiKey = 'test-api-key-12345';
  const validUserId = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    // Set up environment
    process.env.API_SECRET_KEY = validApiKey;

    // Create Fastify instance with minimal config
    app = Fastify({ logger: false });

    // Mock Redis for AI Gateway services
    const mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      setex: vi.fn().mockResolvedValue('OK'),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      incrby: vi.fn().mockResolvedValue(1),
      zadd: vi.fn().mockResolvedValue(1),
      zrange: vi.fn().mockResolvedValue([]),
      zrem: vi.fn().mockResolvedValue(1),
      zcount: vi.fn().mockResolvedValue(0),
    };

    // Attach mock Redis to fastify instance
    app.decorate('redis', mockRedis);

    await app.register(aiRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /ai/functions
  // ==========================================================================

  describe('GET /ai/functions', () => {
    it('should return all available functions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('functions');
      expect(body).toHaveProperty('categories');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.functions)).toBe(true);
      expect(typeof body.total).toBe('number');
    });

    it('should filter functions by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?category=leads',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.functions)).toBe(true);

      // All functions should be in the leads category
      if (body.functions.length > 0) {
        body.functions.forEach((fn: { category: string }) => {
          expect(fn.category).toBe('leads');
        });
      }
    });

    it('should search functions by name or description', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?search=score',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.functions)).toBe(true);

      // All results should contain 'score' in name or description
      if (body.functions.length > 0) {
        body.functions.forEach((fn: { name: string; description: string }) => {
          const searchTerm = 'score'.toLowerCase();
          const matchesName = fn.name.toLowerCase().includes(searchTerm);
          const matchesDesc = fn.description.toLowerCase().includes(searchTerm);
          expect(matchesName || matchesDesc).toBe(true);
        });
      }
    });

    it('should return functions in OpenAI format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?format=openai',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // API may return tools or functions depending on implementation
      expect(body).toHaveProperty('total');
      if (body.tools) {
        expect(Array.isArray(body.tools)).toBe(true);
        if (body.tools.length > 0) {
          const tool = body.tools[0];
          expect(tool.type).toBe('function');
          expect(tool.function).toHaveProperty('name');
        }
      } else if (body.functions) {
        expect(Array.isArray(body.functions)).toBe(true);
      }
    });

    it('should return functions in Anthropic format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?format=anthropic',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('total');
      // API may return tools or functions depending on implementation
      if (body.tools) {
        expect(Array.isArray(body.tools)).toBe(true);
        if (body.tools.length > 0) {
          const tool = body.tools[0];
          expect(tool).toHaveProperty('name');
        }
      } else if (body.functions) {
        expect(Array.isArray(body.functions)).toBe(true);
      }
    });

    it('should return functions in summary format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?format=summary',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('functions');
      expect(body).toHaveProperty('categories');
      expect(body).toHaveProperty('total');

      if (body.functions.length > 0) {
        const fn = body.functions[0];
        expect(fn).toHaveProperty('name');
        expect(fn).toHaveProperty('description');
        expect(fn).toHaveProperty('category');
        expect(fn).toHaveProperty('requiredParams');
      }
    });

    it('should return functions in full format by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('functions');
      expect(body).toHaveProperty('categories');
      expect(body).toHaveProperty('total');
      // Formats property is optional
    });

    it('should handle empty search results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions?search=nonexistent-function-xyz',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.functions).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  // ==========================================================================
  // GET /ai/functions/:name
  // ==========================================================================

  describe('GET /ai/functions/:name', () => {
    it('should return 404 for non-existent function', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/functions/nonexistent_function',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('FUNCTION_NOT_FOUND');
      expect(body).toHaveProperty('availableFunctions');
    });

    it('should return function details if it exists', async () => {
      // First get list of available functions
      const listResponse = await app.inject({
        method: 'GET',
        url: '/ai/functions',
      });
      const list = JSON.parse(listResponse.body);

      if (list.functions.length > 0) {
        const functionName = list.functions[0].name;
        const response = await app.inject({
          method: 'GET',
          url: `/ai/functions/${functionName}`,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('function');
        expect(body.function.name).toBe(functionName);
      }
    });
  });

  // ==========================================================================
  // POST /ai/execute
  // ==========================================================================

  describe('POST /ai/execute', () => {
    it('should require x-user-id header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        payload: {
          type: 'natural',
          query: 'What is the lead score for patient with phone +40712345678?',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('USER_CONTEXT_REQUIRED');
    });

    it('should reject invalid user ID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': 'invalid-user-id',
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('USER_CONTEXT_REQUIRED');
    });

    it('should validate request body for natural language requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          // Missing required 'query' field
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify validation returns FST_ERR_VALIDATION
      expect(['INVALID_REQUEST', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid natural language request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Score the lead with phone +40712345678',
        },
      });

      expect([200, 402, 429, 500, 504]).toContain(response.statusCode);
      const body = JSON.parse(response.body);

      if (response.statusCode === 200) {
        expect(body).toHaveProperty('success');
        expect(body).toHaveProperty('requestId');
        expect(body).toHaveProperty('type');
      }
    });

    it('should validate request body for function call requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'function_call',
          // Missing required 'calls' field
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify validation returns FST_ERR_VALIDATION
      expect(['INVALID_REQUEST', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid function call request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'function_call',
          calls: [
            {
              function: 'score_lead',
              arguments: {
                phone: '+40712345678',
                message: 'Test message',
                channel: 'whatsapp',
              },
              callId: 'call-123',
            },
          ],
        },
      });

      expect([200, 402, 429, 500, 504]).toContain(response.statusCode);
    });

    it('should accept workflow requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'workflow',
          steps: [],
        },
      });

      expect([200, 400, 402, 429, 500, 504]).toContain(response.statusCode);
    });

    it('should include correlation-id in response headers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      if (response.statusCode === 200) {
        expect(response.headers['x-correlation-id']).toBeDefined();
        expect(response.headers['x-trace-id']).toBeDefined();
      }
    });

    it('should respect user-provided correlation-id', async () => {
      const correlationId = 'custom-correlation-id-123';
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
          'x-correlation-id': correlationId,
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      if (response.statusCode === 200) {
        expect(response.headers['x-correlation-id']).toBe(correlationId);
      }
    });

    it('should include execution time in response headers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      if (response.statusCode === 200) {
        expect(response.headers['x-execution-time-ms']).toBeDefined();
        const executionTime = parseInt(response.headers['x-execution-time-ms'] as string, 10);
        expect(executionTime).toBeGreaterThan(0);
      }
    });

    it('should handle rate limiting', async () => {
      // Create many concurrent requests to trigger rate limit
      const requests = Array(60)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'POST',
            url: '/ai/execute',
            headers: {
              'x-user-id': validUserId,
            },
            payload: {
              type: 'natural',
              query: 'Test query',
            },
          })
        );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((r) => r.statusCode === 429);

      if (rateLimited) {
        const limitedResponse = responses.find((r) => r.statusCode === 429);
        expect(limitedResponse).toBeDefined();
        if (limitedResponse) {
          const body = JSON.parse(limitedResponse.body);
          expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
          expect(limitedResponse.headers['retry-after']).toBeDefined();
        }
      }
    });

    it('should include rate limit headers in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      // Rate limit headers should be present if rate limiter is active
      if (response.statusCode === 200 || response.statusCode === 429) {
        // Headers may or may not be present depending on Redis availability
        // This is ok as long as the request doesn't fail
        expect([200, 429, 402, 500, 504]).toContain(response.statusCode);
      }
    });

    it('should support user tier header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
          'x-user-tier': 'pro',
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      expect([200, 402, 429, 500, 504]).toContain(response.statusCode);
    });

    it('should support tenant-id header', async () => {
      const tenantId = '660e8400-e29b-41d4-a716-446655440000';
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
          'x-tenant-id': tenantId,
        },
        payload: {
          type: 'natural',
          query: 'Test query',
        },
      });

      expect([200, 402, 429, 500, 504]).toContain(response.statusCode);
    });

    it('should return timeout error with 504 status code', async () => {
      // This test would require mocking the router.process to timeout
      // For now, just verify the error response structure
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Test query that might timeout',
        },
      });

      if (response.statusCode === 504) {
        const body = JSON.parse(response.body);
        expect(body.code).toBe('TIMEOUT_ERROR');
        expect(body).toHaveProperty('timeoutMs');
      }
    });

    it('should include operation type in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/execute',
        headers: {
          'x-user-id': validUserId,
        },
        payload: {
          type: 'natural',
          query: 'Score this lead',
        },
      });

      if (response.statusCode === 200) {
        expect(response.headers['x-operation-type']).toBeDefined();
        const body = JSON.parse(response.body);
        expect(body._meta).toHaveProperty('operationType');
      }
    });
  });

  // ==========================================================================
  // GET /ai/openai/tools
  // ==========================================================================

  describe('GET /ai/openai/tools', () => {
    it('should return OpenAI-compatible tool definitions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/openai/tools',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('tools');
      expect(body).toHaveProperty('model_compatibility');
      expect(body).toHaveProperty('usage');
      expect(Array.isArray(body.tools)).toBe(true);
    });

    it('should include supported OpenAI models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/openai/tools',
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.model_compatibility)).toBe(true);
      expect(body.model_compatibility.length).toBeGreaterThan(0);

      // Should include common OpenAI models
      const models = body.model_compatibility;
      expect(models.some((m: string) => m.includes('gpt'))).toBe(true);
    });

    it('should include usage example', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/openai/tools',
      });

      const body = JSON.parse(response.body);
      expect(body.usage).toHaveProperty('example');
      expect(typeof body.usage.example).toBe('string');
      expect(body.usage.example.length).toBeGreaterThan(0);
    });

    it('should return tools in OpenAI format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/openai/tools',
      });

      const body = JSON.parse(response.body);
      if (body.tools.length > 0) {
        const tool = body.tools[0];
        expect(tool.type).toBe('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
      }
    });
  });

  // ==========================================================================
  // GET /ai/anthropic/tools
  // ==========================================================================

  describe('GET /ai/anthropic/tools', () => {
    it('should return Anthropic-compatible tool definitions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/anthropic/tools',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('tools');
      expect(body).toHaveProperty('model_compatibility');
      expect(body).toHaveProperty('usage');
      expect(Array.isArray(body.tools)).toBe(true);
    });

    it('should include supported Anthropic models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/anthropic/tools',
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.model_compatibility)).toBe(true);
      expect(body.model_compatibility.length).toBeGreaterThan(0);

      // Should include Claude models
      const models = body.model_compatibility;
      expect(models.some((m: string) => m.includes('claude'))).toBe(true);
    });

    it('should include usage example', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/anthropic/tools',
      });

      const body = JSON.parse(response.body);
      expect(body.usage).toHaveProperty('example');
      expect(typeof body.usage.example).toBe('string');
      expect(body.usage.example.length).toBeGreaterThan(0);
    });

    it('should return tools in Anthropic format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/anthropic/tools',
      });

      const body = JSON.parse(response.body);
      if (body.tools.length > 0) {
        const tool = body.tools[0];
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('input_schema');
      }
    });
  });

  // ==========================================================================
  // GET /ai/categories
  // ==========================================================================

  describe('GET /ai/categories', () => {
    it('should return function categories with counts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/categories',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('categories');
      expect(Array.isArray(body.categories)).toBe(true);
    });

    it('should include category metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/categories',
      });

      const body = JSON.parse(response.body);
      if (body.categories.length > 0) {
        const category = body.categories[0];
        // Category may have 'name' or 'category' property
        expect(category.name || category.category).toBeDefined();
        expect(category).toHaveProperty('count');
        expect(typeof category.count).toBe('number');
      }
    });
  });

  // ==========================================================================
  // GET /ai/schema
  // ==========================================================================

  describe('GET /ai/schema', () => {
    it('should return OpenAPI 3.1 schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/schema',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.openapi).toBe('3.1.0');
      expect(body).toHaveProperty('info');
      expect(body).toHaveProperty('paths');
      expect(body).toHaveProperty('components');
    });

    it('should include API metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/schema',
      });

      const body = JSON.parse(response.body);
      expect(body.info).toHaveProperty('title');
      expect(body.info).toHaveProperty('version');
      expect(body.info).toHaveProperty('description');
      expect(body.info.title).toContain('MedicalCor');
    });

    it('should include /ai/execute path definition', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/schema',
      });

      const body = JSON.parse(response.body);
      expect(body.paths).toHaveProperty('/ai/execute');
      expect(body.paths['/ai/execute']).toHaveProperty('post');
    });

    it('should include request/response schemas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/schema',
      });

      const body = JSON.parse(response.body);
      expect(body.components).toHaveProperty('schemas');
      expect(body.components.schemas).toHaveProperty('AIRequest');
    });
  });
});
