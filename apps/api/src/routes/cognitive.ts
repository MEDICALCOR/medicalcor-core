/**
 * Cognitive Memory API Routes
 * M5 Milestone: Pattern Detection for Cognitive Memory (Behavioral Insights)
 *
 * REST API endpoints for accessing behavioral patterns, cognitive insights,
 * and episodic memory data for leads and patients.
 */
/* eslint-disable max-lines-per-function */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import {
  ValidationError,
  toSafeErrorResponse,
  generateCorrelationId,
  createPatternDetector,
  createMemoryRetrievalService,
  SubjectTypeSchema,
  type IEmbeddingService,
  type IOpenAIClient,
  type SourceChannel,
} from '@medicalcor/core';

// =============================================================================
// Request Schemas
// =============================================================================

const SubjectParamsSchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string().uuid(),
});

const PatternsQuerySchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  patternTypes: z.string().optional(), // Comma-separated
});

const InsightsQuerySchema = z.object({
  types: z.string().optional(), // Comma-separated insight types
});

const MemoryQuerySchema = z.object({
  semanticQuery: z.string().optional(),
  eventTypes: z.string().optional(), // Comma-separated
  channels: z.string().optional(), // Comma-separated
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const TriggerDetectionSchema = z.object({
  enableLLMPatterns: z.boolean().optional().default(false),
});

// =============================================================================
// Dependencies Interface
// =============================================================================

export interface CognitiveRouteDependencies {
  pool: Pool;
  openai: IOpenAIClient;
  embeddings: IEmbeddingService;
}

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create cognitive routes with injected dependencies
 */
export function createCognitiveRoutes(deps: CognitiveRouteDependencies): FastifyPluginAsync {
  const patternDetector = createPatternDetector(deps.pool, deps.openai);
  const memoryRetrieval = createMemoryRetrievalService(deps.pool, deps.embeddings);

  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
  const cognitiveRoutes: FastifyPluginAsync = async (fastify) => {
    // ========================================================================
    // Behavioral Patterns Endpoints
    // ========================================================================

    /**
     * GET /cognitive/patterns/:subjectType/:subjectId
     * Get behavioral patterns for a specific subject
     */
    fastify.get(
      '/cognitive/patterns/:subjectType/:subjectId',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
          Querystring: { minConfidence?: string; patternTypes?: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const queryResult = PatternsQuerySchema.safeParse(request.query);
          if (!queryResult.success) {
            return await reply.status(400).send({
              error: 'Invalid query parameters',
              details: queryResult.error.flatten(),
              correlationId,
            });
          }

          const { subjectType, subjectId } = paramsResult.data;
          const { minConfidence, patternTypes } = queryResult.data;

          let patterns = await patternDetector.getStoredPatterns(subjectType, subjectId);

          // Apply filters
          if (minConfidence !== undefined) {
            patterns = patterns.filter((p) => p.confidence >= minConfidence);
          }

          if (patternTypes) {
            const types = patternTypes.split(',').map((t) => t.trim());
            patterns = patterns.filter((p) => types.includes(p.patternType));
          }

          return await reply.send({
            patterns,
            total: patterns.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get patterns error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /cognitive/patterns/:subjectType/:subjectId/detect
     * Trigger pattern detection for a subject (runs in background)
     */
    fastify.post(
      '/cognitive/patterns/:subjectType/:subjectId/detect',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
          Body: unknown;
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const bodyResult = TriggerDetectionSchema.safeParse(request.body ?? {});
          if (!bodyResult.success) {
            const error = new ValidationError(
              'Invalid detection options',
              bodyResult.error.flatten()
            );
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const { subjectType, subjectId } = paramsResult.data;
          // enableLLMPatterns is available via bodyResult.data.enableLLMPatterns for future use

          // Run pattern detection synchronously for immediate results
          // For long-running detection, use the Trigger.dev task instead
          const patterns = await patternDetector.detectPatterns(subjectType, subjectId);

          fastify.log.info(
            { correlationId, subjectId, patternsDetected: patterns.length },
            'Pattern detection completed'
          );

          return await reply.send({
            success: true,
            patterns,
            patternsDetected: patterns.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Pattern detection error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Cognitive Insights Endpoints
    // ========================================================================

    /**
     * GET /cognitive/insights/:subjectType/:subjectId
     * Get cognitive insights for a specific subject
     */
    fastify.get(
      '/cognitive/insights/:subjectType/:subjectId',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
          Querystring: { types?: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const queryResult = InsightsQuerySchema.safeParse(request.query);
          if (!queryResult.success) {
            return await reply.status(400).send({
              error: 'Invalid query parameters',
              details: queryResult.error.flatten(),
              correlationId,
            });
          }

          const { subjectType, subjectId } = paramsResult.data;
          const { types } = queryResult.data;

          let insights = await patternDetector.generateInsights(subjectType, subjectId);

          // Filter by types if specified
          if (types) {
            const typeList = types.split(',').map((t) => t.trim());
            insights = insights.filter((i) => typeList.includes(i.type));
          }

          return await reply.send({
            insights,
            total: insights.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get insights error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * GET /cognitive/insights/:subjectId
     * Simplified endpoint for dashboard - get cognitive insights with optional subject type
     * Defaults to 'lead' if subjectType not specified in query params
     */
    fastify.get(
      '/cognitive/insights/:subjectId',
      async (
        request: FastifyRequest<{
          Params: { subjectId: string };
          Querystring: { types?: string; subjectType?: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const { subjectId } = request.params;

          // Validate subjectId is a UUID
          const idResult = z.string().uuid().safeParse(subjectId);
          if (!idResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subjectId - must be a valid UUID',
              correlationId,
            });
          }

          const queryResult = InsightsQuerySchema.safeParse(request.query);
          if (!queryResult.success) {
            return await reply.status(400).send({
              error: 'Invalid query parameters',
              details: queryResult.error.flatten(),
              correlationId,
            });
          }

          // Default to 'lead' if subjectType not provided
          const subjectTypeRaw = request.query.subjectType ?? 'lead';
          const subjectTypeResult = SubjectTypeSchema.safeParse(subjectTypeRaw);
          if (!subjectTypeResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subjectType - must be lead, patient, or contact',
              correlationId,
            });
          }

          const subjectType = subjectTypeResult.data;
          const { types } = queryResult.data;

          let insights = await patternDetector.generateInsights(subjectType, subjectId);

          // Filter by types if specified
          if (types) {
            const typeList = types.split(',').map((t) => t.trim());
            insights = insights.filter((i) => typeList.includes(i.type));
          }

          return await reply.send({
            subjectId,
            subjectType,
            insights,
            total: insights.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get insights error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Memory Endpoints
    // ========================================================================

    /**
     * GET /cognitive/memory/:subjectType/:subjectId
     * Get episodic memory for a subject with optional semantic search
     */
    fastify.get(
      '/cognitive/memory/:subjectType/:subjectId',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
          Querystring: {
            semanticQuery?: string;
            eventTypes?: string;
            channels?: string;
            fromDate?: string;
            toDate?: string;
            limit?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const queryResult = MemoryQuerySchema.safeParse(request.query);
          if (!queryResult.success) {
            return await reply.status(400).send({
              error: 'Invalid query parameters',
              details: queryResult.error.flatten(),
              correlationId,
            });
          }

          const { subjectType, subjectId } = paramsResult.data;
          const { semanticQuery, eventTypes, channels, fromDate, toDate, limit } = queryResult.data;

          const events = await memoryRetrieval.query({
            subjectType,
            subjectId,
            semanticQuery,
            eventTypes: eventTypes?.split(',').map((t) => t.trim()),
            channels: channels?.split(',').map((c) => c.trim()) as SourceChannel[] | undefined,
            fromDate: fromDate ? new Date(fromDate) : undefined,
            toDate: toDate ? new Date(toDate) : undefined,
            limit,
          });

          return await reply.send({
            events,
            total: events.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get memory error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * GET /cognitive/memory/:subjectType/:subjectId/summary
     * Get comprehensive memory summary for a subject
     */
    fastify.get(
      '/cognitive/memory/:subjectType/:subjectId/summary',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const { subjectType, subjectId } = paramsResult.data;

          const summary = await memoryRetrieval.getSubjectSummary(subjectType, subjectId);

          return await reply.send({
            summary,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get memory summary error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * GET /cognitive/memory/:subjectType/:subjectId/similar
     * Find similar past interactions using semantic search
     */
    fastify.get(
      '/cognitive/memory/:subjectType/:subjectId/similar',
      async (
        request: FastifyRequest<{
          Params: { subjectType: string; subjectId: string };
          Querystring: { query: string; limit?: string; minSimilarity?: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SubjectParamsSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid subject parameters',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const { query, limit, minSimilarity } = request.query;
          if (!query) {
            return await reply.status(400).send({
              error: 'Query parameter is required',
              correlationId,
            });
          }

          const { subjectType, subjectId } = paramsResult.data;

          // Safe parsing with NaN validation
          const parsedLimit = limit ? parseInt(limit, 10) : 5;
          const parsedMinSimilarity = minSimilarity ? parseFloat(minSimilarity) : undefined;

          const similar = await memoryRetrieval.findSimilarInteractions(query, {
            subjectType,
            subjectId,
            limit: Number.isNaN(parsedLimit) ? 5 : parsedLimit,
            minSimilarity:
              parsedMinSimilarity !== undefined && Number.isNaN(parsedMinSimilarity)
                ? undefined
                : parsedMinSimilarity,
          });

          return await reply.send({
            similar,
            total: similar.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Find similar interactions error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Statistics & Dashboard Endpoints
    // ========================================================================

    /**
     * GET /cognitive/stats/patterns
     * Get pattern detection statistics for dashboard
     */
    fastify.get(
      '/cognitive/stats/patterns',
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const stats = await patternDetector.getPatternStats();

          return await reply.send({
            stats,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get pattern stats error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );
  };

  return cognitiveRoutes;
}

// Export a default factory that requires dependency injection
export { createCognitiveRoutes as cognitiveRoutes };
