/**
 * Orchestration API Routes
 *
 * REST API endpoints for multi-agent orchestration management.
 * Implements the Orchestration Use Case specification.
 *
 * ENDPOINTS:
 * - POST /orchestration/sessions          - Create new orchestration session
 * - GET  /orchestration/sessions/:id      - Get session by ID
 * - POST /orchestration/sessions/:id/analyze   - Analyze task
 * - POST /orchestration/sessions/:id/dispatch  - Dispatch agents
 * - POST /orchestration/sessions/:id/reports   - Record agent report
 * - POST /orchestration/sessions/:id/gates     - Record quality gate result
 * - POST /orchestration/sessions/:id/complete  - Complete session
 * - GET  /orchestration/sessions/:id/report    - Get orchestration report
 * - GET  /orchestration/stats             - Get orchestration statistics
 */
/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateCorrelationId, toSafeErrorResponse } from '@medicalcor/core';
import {
  createOrchestrationUseCase,
  type IStreamingOrchestrationUseCase,
} from '@medicalcor/application';
import {
  createInMemoryOrchestrationRepository,
  type InMemoryOrchestrationRepository,
} from '@medicalcor/infrastructure';
import {
  CreateOrchestrationSessionSchema,
  AgentReportSchema,
  QualityGateResultSchema,
} from '@medicalcor/types';

// =============================================================================
// Request Schemas
// =============================================================================

const SessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// =============================================================================
// OpenAPI Schemas
// =============================================================================

const SessionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    correlationId: { type: 'string' },
    status: { type: 'string' },
    request: { type: 'string' },
    priority: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const ErrorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    message: { type: 'string' },
    correlationId: { type: 'string' },
  },
} as const;

const StatsResponseSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    active: { type: 'number' },
    completed: { type: 'number' },
    failed: { type: 'number' },
    avgDurationMs: { type: 'number' },
    avgGatePassRate: { type: 'number' },
    correlationId: { type: 'string' },
  },
} as const;

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create orchestration routes with injected dependencies
 */
export function createOrchestrationRoutes(): FastifyPluginAsync {
  // Initialize repository and use case (in-memory for now)
  const orchestrationRepository =
    createInMemoryOrchestrationRepository() as InMemoryOrchestrationRepository;

  const orchestrationUseCase = createOrchestrationUseCase(orchestrationRepository, {
    enableParallelExecution: true,
    maxConcurrentAgents: 5,
    qualityGateTimeoutMs: 300000,
    sessionTimeoutMs: 3600000,
  }) as IStreamingOrchestrationUseCase;

  const orchestrationRoutes: FastifyPluginAsync = async (fastify) => {
    // ========================================================================
    // POST /orchestration/sessions
    // Create new orchestration session
    // ========================================================================

    fastify.post(
      '/orchestration/sessions',
      {
        schema: {
          description: 'Create a new multi-agent orchestration session',
          tags: ['Orchestration'],
          body: {
            type: 'object',
            required: ['request'],
            properties: {
              request: { type: 'string', minLength: 10, maxLength: 10000 },
              priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              deadline: { type: 'string', format: 'date-time' },
              initiatedBy: { type: 'string' },
              idempotencyKey: { type: 'string' },
              context: {
                type: 'object',
                properties: {
                  branch: { type: 'string' },
                  relatedIssues: { type: 'array', items: { type: 'string' } },
                  environment: { type: 'string', enum: ['development', 'staging', 'production'] },
                },
              },
            },
          },
          response: {
            201: SessionResponseSchema,
            400: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            request: string;
            priority?: string;
            deadline?: string;
            initiatedBy?: string;
            idempotencyKey?: string;
            context?: {
              branch?: string;
              relatedIssues?: string[];
              environment?: 'development' | 'staging' | 'production';
            };
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const bodyResult = CreateOrchestrationSessionSchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid request body',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.createSession(bodyResult.data);

          if (!result.success) {
            return await reply.status(400).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Failed to create session',
              correlationId,
            });
          }

          return await reply.status(201).send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Create session error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // GET /orchestration/sessions/:id
    // Get session by ID
    // ========================================================================

    fastify.get(
      '/orchestration/sessions/:id',
      {
        schema: {
          description: 'Get orchestration session by ID',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: SessionResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.getSession(paramsResult.data.id);

          if (!result.success) {
            return await reply.status(404).send({
              error: result.error?.code ?? 'not_found',
              message: result.error?.message ?? 'Session not found',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get session error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/sessions/:id/analyze
    // Analyze task
    // ========================================================================

    fastify.post(
      '/orchestration/sessions/:id/analyze',
      {
        schema: {
          description: 'Analyze the task for an orchestration session',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                complexity: { type: 'string' },
                requiredAgents: { type: 'array', items: { type: 'string' } },
                parallelizable: { type: 'boolean' },
                estimatedRisk: { type: 'string' },
                complianceRequired: { type: 'boolean' },
                securityReview: { type: 'boolean' },
                correlationId: { type: 'string' },
              },
            },
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.analyzeTask(paramsResult.data.id);

          if (!result.success) {
            const statusCode = result.error?.code === 'session_not_found' ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Analysis failed',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Analyze task error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/sessions/:id/dispatch
    // Dispatch agents
    // ========================================================================

    fastify.post(
      '/orchestration/sessions/:id/dispatch',
      {
        schema: {
          description: 'Dispatch agents for an orchestration session',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                directives: { type: 'array' },
                correlationId: { type: 'string' },
              },
            },
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.dispatchAgents(paramsResult.data.id);

          if (!result.success) {
            const statusCode = result.error?.code === 'session_not_found' ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Dispatch failed',
              correlationId,
            });
          }

          return await reply.send({
            directives: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Dispatch agents error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/sessions/:id/reports
    // Record agent report
    // ========================================================================

    fastify.post(
      '/orchestration/sessions/:id/reports',
      {
        schema: {
          description: 'Record an agent report for an orchestration session',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          body: {
            type: 'object',
            required: ['agent', 'task', 'status'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              directiveId: { type: 'string', format: 'uuid' },
              sessionId: { type: 'string', format: 'uuid' },
              agent: { type: 'string' },
              task: { type: 'string' },
              status: { type: 'string' },
              findings: { type: 'array' },
              recommendations: { type: 'array' },
              blockers: { type: 'array' },
              nextSteps: { type: 'array', items: { type: 'string' } },
            },
          },
          response: {
            200: SessionResponseSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: unknown;
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const bodyResult = AgentReportSchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid report body',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.recordAgentReport(
            paramsResult.data.id,
            bodyResult.data
          );

          if (!result.success) {
            const statusCode = result.error?.code === 'session_not_found' ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Failed to record report',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Record report error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/sessions/:id/gates
    // Record quality gate result
    // ========================================================================

    fastify.post(
      '/orchestration/sessions/:id/gates',
      {
        schema: {
          description: 'Record a quality gate result for an orchestration session',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          body: {
            type: 'object',
            required: ['gate', 'status', 'checkedAt', 'checkedBy', 'durationMs'],
            properties: {
              gate: { type: 'string' },
              status: { type: 'string' },
              checkedAt: { type: 'string', format: 'date-time' },
              checkedBy: { type: 'string' },
              durationMs: { type: 'number' },
              notes: { type: 'string' },
              errors: { type: 'array', items: { type: 'string' } },
            },
          },
          response: {
            200: SessionResponseSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: unknown;
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const bodyResult = QualityGateResultSchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid quality gate result',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.recordQualityGate(
            paramsResult.data.id,
            bodyResult.data
          );

          if (!result.success) {
            const statusCode = result.error?.code === 'session_not_found' ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Failed to record quality gate',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Record quality gate error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/sessions/:id/complete
    // Complete session
    // ========================================================================

    fastify.post(
      '/orchestration/sessions/:id/complete',
      {
        schema: {
          description: 'Complete an orchestration session and generate final report',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                finalStatus: { type: 'string' },
                summary: { type: 'string' },
                correlationId: { type: 'string' },
              },
            },
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.completeSession(paramsResult.data.id);

          if (!result.success) {
            const statusCode = result.error?.code === 'session_not_found' ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Completion failed',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Complete session error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // GET /orchestration/sessions/:id/report
    // Get orchestration report
    // ========================================================================

    fastify.get(
      '/orchestration/sessions/:id/report',
      {
        schema: {
          description: 'Get the orchestration report for a session',
          tags: ['Orchestration'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                summary: { type: 'string' },
                correlationId: { type: 'string' },
              },
            },
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = SessionIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid session ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const result = await orchestrationUseCase.getReport(paramsResult.data.id);

          if (!result.success) {
            return await reply.status(404).send({
              error: result.error?.code ?? 'not_found',
              message: result.error?.message ?? 'Report not found',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get report error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // GET /orchestration/stats
    // Get orchestration statistics
    // ========================================================================

    fastify.get(
      '/orchestration/stats',
      {
        schema: {
          description: 'Get orchestration session statistics',
          tags: ['Orchestration'],
          querystring: {
            type: 'object',
            properties: {
              since: { type: 'string', format: 'date-time' },
            },
          },
          response: {
            200: StatsResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest<{ Querystring: { since?: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const since = request.query.since ? new Date(request.query.since) : undefined;
          const stats = await orchestrationRepository.getStats(since);

          return await reply.send({
            ...stats,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get stats error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /orchestration/execute
    // Execute full orchestration with progress streaming
    // ========================================================================

    fastify.post(
      '/orchestration/execute',
      {
        schema: {
          description: 'Execute a full orchestration workflow with progress updates',
          tags: ['Orchestration'],
          body: {
            type: 'object',
            required: ['request'],
            properties: {
              request: { type: 'string', minLength: 10, maxLength: 10000 },
              priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              deadline: { type: 'string', format: 'date-time' },
              initiatedBy: { type: 'string' },
              idempotencyKey: { type: 'string' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', format: 'uuid' },
                status: { type: 'string' },
                summary: { type: 'string' },
                correlationId: { type: 'string' },
              },
            },
            400: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            request: string;
            priority?: string;
            deadline?: string;
            initiatedBy?: string;
            idempotencyKey?: string;
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const bodyResult = CreateOrchestrationSessionSchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid request body',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          // Execute with progress callback (for now just log)
          const result = await orchestrationUseCase.executeWithProgress(
            bodyResult.data,
            (progress) => {
              fastify.log.info(
                {
                  sessionId: progress.sessionId,
                  phase: progress.phase,
                  progress: progress.progress,
                },
                'Orchestration progress'
              );
            }
          );

          if (!result.success) {
            return await reply.status(400).send({
              error: result.error?.code ?? 'unknown',
              message: result.error?.message ?? 'Orchestration failed',
              correlationId,
            });
          }

          return await reply.send({
            ...result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Execute orchestration error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );
  };

  return orchestrationRoutes;
}

/**
 * Default orchestration routes plugin (for auto-registration)
 */
export const orchestrationRoutes: FastifyPluginAsync = async (fastify) => {
  const routes = createOrchestrationRoutes();
  await fastify.register(routes);
};
