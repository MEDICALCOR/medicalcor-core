/**
 * Cognitive Memory API Routes
 *
 * Phase 4: API endpoints for cognitive memory dashboard
 * ADR-004: Episodic Memory System
 *
 * Provides endpoints for:
 * - Subject analysis (full cognitive profile)
 * - Churn risk assessment
 * - Behavioral pattern detection
 * - Memory queries
 * - At-risk subject lists
 */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/return-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import {
  createCognitiveSystem,
  SubjectTypeSchema,
  SourceChannelSchema,
  type CognitiveAnalyzer,
  type PatternDetector,
  type SubjectType,
  type SourceChannel,
} from '@medicalcor/core';
import { createEmbeddingService, createOpenAIClient } from '@medicalcor/integrations';

// =============================================================================
// Request/Response Schemas
// =============================================================================

const SubjectParamsSchema = z.object({
  type: SubjectTypeSchema,
  id: z.string().uuid(),
});

const MemoryQuerySchema = z.object({
  semanticQuery: z.string().optional(),
  channels: z.array(SourceChannelSchema).optional(),
  limit: z.coerce.number().min(1).max(50).optional().default(10),
  daysBack: z.coerce.number().min(1).max(365).optional(),
});

const ChurnRiskListQuerySchema = z.object({
  type: SubjectTypeSchema.optional(),
  minRiskScore: z.coerce.number().min(0).max(1).optional().default(0.5),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

// =============================================================================
// Database Pool Singleton
// =============================================================================

let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    poolInstance = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return poolInstance;
}

// =============================================================================
// Cognitive System Factory
// =============================================================================

interface CognitiveClients {
  cognitive: ReturnType<typeof createCognitiveSystem>;
  analyzer: CognitiveAnalyzer;
  patternDetector: PatternDetector;
}

let cognitiveClients: CognitiveClients | null = null;

function getCognitiveClients(): CognitiveClients | null {
  if (cognitiveClients) {
    return cognitiveClients;
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!openaiApiKey || !databaseUrl) {
    return null;
  }

  const pool = getPool();
  const openai = createOpenAIClient({ apiKey: openaiApiKey });
  const embeddings = createEmbeddingService({
    apiKey: openaiApiKey,
    model: 'text-embedding-3-small',
  });

  const cognitive = createCognitiveSystem({
    pool,
    openai,
    embeddings,
  });

  cognitiveClients = {
    cognitive,
    analyzer: cognitive.analyzer,
    patternDetector: cognitive.patternDetector,
  };

  return cognitiveClients;
}

// =============================================================================
// Routes
// =============================================================================

export const cognitiveRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /cognitive/subjects/:type/:id/analysis
   *
   * Get full cognitive analysis for a subject including:
   * - Memory summary
   * - Churn risk assessment
   * - Behavioral patterns
   * - AI-generated insights
   */
  fastify.get<{
    Params: { type: string; id: string };
  }>('/cognitive/subjects/:type/:id/analysis', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['type', 'id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            analysis: { type: 'object' },
          },
        },
        503: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const params = SubjectParamsSchema.parse(request.params);
      const { analyzer } = clients;

      try {
        const analysis = await analyzer.analyzeSubject(params.type, params.id);

        return reply.send({
          success: true,
          analysis: {
            subjectType: analysis.subjectType,
            subjectId: analysis.subjectId,
            summary: {
              totalEvents: analysis.summary.totalEvents,
              firstInteraction: analysis.summary.firstInteraction?.toISOString() ?? null,
              lastInteraction: analysis.summary.lastInteraction?.toISOString() ?? null,
              channelBreakdown: analysis.summary.channelBreakdown,
              sentimentTrend: analysis.summary.sentimentTrend,
              sentimentCounts: analysis.summary.sentimentCounts,
              recentSummary: analysis.summary.recentSummary,
            },
            riskScore: analysis.riskScore,
            opportunityScore: analysis.opportunityScore,
            patterns: analysis.patterns.map((p) => ({
              id: p.id,
              patternType: p.patternType,
              patternDescription: p.patternDescription,
              confidence: p.confidence,
              occurrenceCount: p.occurrenceCount,
              firstObservedAt: p.firstObservedAt.toISOString(),
              lastObservedAt: p.lastObservedAt.toISOString(),
            })),
            insights: analysis.insights.map((i) => ({
              type: i.type,
              confidence: i.confidence,
              description: i.description,
              recommendedAction: i.recommendedAction,
            })),
            analysisTimestamp: analysis.analysisTimestamp.toISOString(),
          },
        });
      } catch (error) {
        request.log.error({ error, params }, 'Failed to analyze subject');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/subjects/:type/:id/churn-risk
   *
   * Get churn risk assessment for a specific subject
   */
  fastify.get<{
    Params: { type: string; id: string };
  }>('/cognitive/subjects/:type/:id/churn-risk', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['type', 'id'],
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const params = SubjectParamsSchema.parse(request.params);
      const { analyzer } = clients;

      try {
        const assessment = await analyzer.assessChurnRisk(params.type, params.id);

        return reply.send({
          success: true,
          churnRisk: {
            subjectType: params.type,
            subjectId: params.id,
            riskScore: assessment.riskScore,
            riskLevel: assessment.riskLevel,
            factors: assessment.factors,
            recommendedActions: assessment.recommendedActions,
            supportingEventIds: assessment.supportingEventIds,
            assessedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        request.log.error({ error, params }, 'Failed to assess churn risk');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/subjects/:type/:id/patterns
   *
   * Get behavioral patterns detected for a subject
   */
  fastify.get<{
    Params: { type: string; id: string };
  }>('/cognitive/subjects/:type/:id/patterns', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['type', 'id'],
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const params = SubjectParamsSchema.parse(request.params);
      const { patternDetector } = clients;

      try {
        const patterns = await patternDetector.detectPatterns(params.type, params.id);

        return reply.send({
          success: true,
          patterns: patterns.map((p) => ({
            id: p.id,
            patternType: p.patternType,
            patternDescription: p.patternDescription,
            confidence: p.confidence,
            occurrenceCount: p.occurrenceCount,
            supportingEventIds: p.supportingEventIds,
            firstObservedAt: p.firstObservedAt.toISOString(),
            lastObservedAt: p.lastObservedAt.toISOString(),
            metadata: p.metadata,
          })),
          count: patterns.length,
        });
      } catch (error) {
        request.log.error({ error, params }, 'Failed to detect patterns');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/subjects/:type/:id/memories
   *
   * Query episodic memories for a subject with optional semantic search
   */
  fastify.get<{
    Params: { type: string; id: string };
    Querystring: {
      semanticQuery?: string;
      channels?: string;
      limit?: string;
      daysBack?: string;
    };
  }>('/cognitive/subjects/:type/:id/memories', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['type', 'id'],
      },
      querystring: {
        type: 'object',
        properties: {
          semanticQuery: { type: 'string', description: 'Semantic search query' },
          channels: { type: 'string', description: 'Comma-separated channels filter' },
          limit: { type: 'string', description: 'Max results (1-50)' },
          daysBack: { type: 'string', description: 'Filter to last N days' },
        },
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const params = SubjectParamsSchema.parse(request.params);

      // Parse channels from comma-separated string
      const channelsRaw = request.query.channels;
      const channelsArray = channelsRaw ? channelsRaw.split(',').filter(Boolean) : undefined;
      let validChannels: SourceChannel[] | undefined;

      if (channelsArray) {
        const validValues = ['whatsapp', 'voice', 'web', 'email', 'crm', 'system'] as const;
        validChannels = channelsArray.filter((c): c is SourceChannel =>
          validValues.includes(c as SourceChannel)
        );
      }

      const query = MemoryQuerySchema.parse({
        ...request.query,
        channels: validChannels,
      });

      const { cognitive } = clients;

      try {
        const fromDate = query.daysBack
          ? new Date(Date.now() - query.daysBack * 24 * 60 * 60 * 1000)
          : undefined;

        const memories = await cognitive.memoryRetrieval.query({
          subjectId: params.id,
          subjectType: params.type,
          semanticQuery: query.semanticQuery,
          channels: query.channels,
          limit: query.limit,
          fromDate,
        });

        return reply.send({
          success: true,
          memories: memories.map((m) => ({
            id: m.id,
            eventType: m.eventType,
            eventCategory: m.eventCategory,
            sourceChannel: m.sourceChannel,
            summary: m.summary,
            sentiment: m.sentiment,
            intent: m.intent,
            keyEntities: m.keyEntities,
            occurredAt: m.occurredAt.toISOString(),
          })),
          count: memories.length,
          query: {
            subjectType: params.type,
            subjectId: params.id,
            semanticQuery: query.semanticQuery,
            channels: query.channels,
            limit: query.limit,
            daysBack: query.daysBack,
          },
        });
      } catch (error) {
        request.log.error({ error, params, query }, 'Failed to query memories');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/subjects/:type/:id/summary
   *
   * Get memory summary for a subject
   */
  fastify.get<{
    Params: { type: string; id: string };
  }>('/cognitive/subjects/:type/:id/summary', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          id: { type: 'string', format: 'uuid' },
        },
        required: ['type', 'id'],
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const params = SubjectParamsSchema.parse(request.params);
      const { cognitive } = clients;

      try {
        const summary = await cognitive.memoryRetrieval.getSubjectSummary(params.type, params.id);

        return reply.send({
          success: true,
          summary: {
            subjectType: summary.subjectType,
            subjectId: summary.subjectId,
            totalEvents: summary.totalEvents,
            firstInteraction: summary.firstInteraction?.toISOString() ?? null,
            lastInteraction: summary.lastInteraction?.toISOString() ?? null,
            channelBreakdown: summary.channelBreakdown,
            sentimentTrend: summary.sentimentTrend,
            sentimentCounts: summary.sentimentCounts,
            recentSummary: summary.recentSummary,
            patterns: summary.patterns.map((p) => ({
              patternType: p.patternType,
              patternDescription: p.patternDescription,
              confidence: p.confidence,
            })),
          },
        });
      } catch (error) {
        request.log.error({ error, params }, 'Failed to get subject summary');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/churn-risks
   *
   * List subjects at risk of churn for dashboard
   */
  fastify.get<{
    Querystring: {
      type?: string;
      minRiskScore?: string;
      limit?: string;
    };
  }>('/cognitive/churn-risks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['lead', 'patient', 'contact'] },
          minRiskScore: { type: 'string', description: 'Minimum risk score (0-1)' },
          limit: { type: 'string', description: 'Max results (1-100)' },
        },
      },
    },
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const query = ChurnRiskListQuerySchema.parse(request.query);
      const { analyzer } = clients;

      try {
        // Get at-risk subjects for specified type or all types
        const subjectTypes: SubjectType[] = query.type
          ? [query.type]
          : ['lead', 'patient', 'contact'];

        interface ChurnRiskWithSubject {
          subjectType: SubjectType;
          subjectId: string;
          riskScore: number;
          riskLevel: string;
          factors: string[];
          recommendedActions: string[];
          supportingEventIds: string[];
        }

        const allRisks: ChurnRiskWithSubject[] = [];
        const pool = getPool();

        for (const subjectType of subjectTypes) {
          // Get candidate subjects with potential churn indicators
          const candidateResult = await pool.query<{ subject_id: string }>(
            `WITH subject_stats AS (
              SELECT
                subject_id,
                MAX(occurred_at) as last_interaction,
                COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count,
                COUNT(*) as total_count
              FROM episodic_events
              WHERE subject_type = $1 AND deleted_at IS NULL
              GROUP BY subject_id
              HAVING COUNT(*) >= 3
            )
            SELECT subject_id
            FROM subject_stats
            WHERE
              last_interaction < NOW() - INTERVAL '30 days'
              OR (negative_count::float / NULLIF(total_count, 0) > 0.3)
            ORDER BY last_interaction ASC
            LIMIT $2`,
            [subjectType, query.limit * 2]
          );

          // Assess each candidate
          for (const row of candidateResult.rows) {
            const assessment = await analyzer.assessChurnRisk(subjectType, row.subject_id);
            if (assessment.riskScore >= query.minRiskScore) {
              allRisks.push({
                subjectType,
                subjectId: row.subject_id,
                riskScore: assessment.riskScore,
                riskLevel: assessment.riskLevel,
                factors: assessment.factors,
                recommendedActions: assessment.recommendedActions,
                supportingEventIds: assessment.supportingEventIds,
              });
            }
            if (allRisks.length >= query.limit) break;
          }
          if (allRisks.length >= query.limit) break;
        }

        // Sort by risk score descending and apply limit
        allRisks.sort((a, b) => b.riskScore - a.riskScore);
        const limitedRisks = allRisks.slice(0, query.limit);

        return reply.send({
          success: true,
          churnRisks: limitedRisks.map((r) => ({
            subjectType: r.subjectType,
            subjectId: r.subjectId,
            riskScore: r.riskScore,
            riskLevel: r.riskLevel,
            factors: r.factors,
            recommendedActions: r.recommendedActions,
            assessedAt: new Date().toISOString(),
          })),
          count: limitedRisks.length,
          query: {
            type: query.type,
            minRiskScore: query.minRiskScore,
            limit: query.limit,
          },
        });
      } catch (error) {
        request.log.error({ error, query }, 'Failed to get churn risk list');
        throw error;
      }
    },
  });

  /**
   * GET /cognitive/stats
   *
   * Get cognitive system statistics for monitoring
   */
  fastify.get('/cognitive/stats', {
    handler: async (request, reply) => {
      const clients = getCognitiveClients();
      if (!clients) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cognitive system not configured',
        });
      }

      const pool = getPool();

      try {
        // Get event counts by type
        const eventCountsResult = await pool.query<{ subject_type: string; count: string }>(`
          SELECT subject_type, COUNT(*) as count
          FROM episodic_events
          GROUP BY subject_type
        `);

        const eventCounts: Record<string, number> = {};
        for (const row of eventCountsResult.rows) {
          eventCounts[row.subject_type] = parseInt(row.count, 10);
        }

        // Get pattern counts
        const patternCountsResult = await pool.query<{ pattern_type: string; count: string }>(`
          SELECT pattern_type, COUNT(*) as count
          FROM behavioral_patterns
          GROUP BY pattern_type
          ORDER BY count DESC
          LIMIT 10
        `);

        const patternCounts: Record<string, number> = {};
        for (const row of patternCountsResult.rows) {
          patternCounts[row.pattern_type] = parseInt(row.count, 10);
        }

        // Get recent activity
        const recentActivityResult = await pool.query<{ count: string }>(`
          SELECT COUNT(*) as count
          FROM episodic_events
          WHERE occurred_at > NOW() - INTERVAL '24 hours'
        `);

        const last24hEvents = parseInt(recentActivityResult.rows[0]?.count ?? '0', 10);

        return reply.send({
          success: true,
          stats: {
            eventsBySubjectType: eventCounts,
            topPatterns: patternCounts,
            last24hEvents,
            systemStatus: 'operational',
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to get cognitive stats');

        // Return minimal stats on error
        return reply.send({
          success: true,
          stats: {
            eventsBySubjectType: {},
            topPatterns: {},
            last24hEvents: 0,
            systemStatus: 'degraded',
            error: 'Failed to fetch stats',
          },
        });
      }
    },
  });
};
