/**
 * Revenue Forecast API Routes
 *
 * REST API endpoints for ML-powered revenue forecasting using the Strategy Pattern.
 * Implements the Revenue Intelligence Engine specification.
 *
 * ENDPOINTS:
 * - GET  /revenue/forecast/:clinicId         - Generate forecast for a clinic
 * - GET  /revenue/forecast/:clinicId/summary - Get dashboard summary
 * - POST /revenue/forecast/batch             - Generate batch forecasts
 * - POST /revenue/forecast/compare           - Compare forecast to actuals
 * - POST /revenue/forecast/:clinicId/invalidate - Invalidate cached forecast
 */
/* eslint-disable max-lines-per-function */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import {
  generateCorrelationId,
  toSafeErrorResponse,
} from '@medicalcor/core';
import {
  createRevenueForecastingUseCase,
  type RevenueForecastingUseCase,
} from '@medicalcor/application';
import {
  createPostgresRevenueSnapshotRepository,
  type PostgresRevenueSnapshotRepository,
} from '@medicalcor/infrastructure';
import {
  SecurityContext,
  SecurityPrincipalType,
  Permission,
  type SecurityPrincipal,
} from '@medicalcor/application';

// =============================================================================
// Request Schemas
// =============================================================================

const ForecastQuerySchema = z.object({
  method: z.enum(['moving_average', 'exponential_smoothing', 'linear_regression', 'ensemble']).optional(),
  periods: z.coerce.number().int().min(1).max(24).optional(),
  confidence: z.coerce.number().min(0.8).max(0.99).optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional(),
  seasonality: z.coerce.boolean().optional(),
  forceRefresh: z.coerce.boolean().optional(),
});

const ClinicIdParamSchema = z.object({
  clinicId: z.string().uuid(),
});

const BatchForecastBodySchema = z.object({
  clinicIds: z.array(z.string().uuid()).min(1).max(100),
  method: z.enum(['moving_average', 'exponential_smoothing', 'linear_regression', 'ensemble']).optional(),
  periods: z.coerce.number().int().min(1).max(24).optional(),
  continueOnError: z.boolean().optional().default(true),
});

const CompareForecastBodySchema = z.object({
  clinicId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  forecastedRevenue: z.number().nonnegative(),
  forecastedInterval: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number(),
  }),
  actualRevenue: z.number().nonnegative(),
});

// =============================================================================
// Dependencies Interface
// =============================================================================

export interface RevenueForecastRouteDependencies {
  pool: Pool;
}

// =============================================================================
// OpenAPI Schemas
// =============================================================================

const ForecastResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    clinicId: { type: 'string', format: 'uuid' },
    method: { type: 'string', enum: ['moving_average', 'exponential_smoothing', 'linear_regression', 'ensemble'] },
    confidenceLevel: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    totalPredictedRevenue: { type: 'number' },
    modelFit: {
      type: 'object',
      properties: {
        rSquared: { type: 'number' },
        mae: { type: 'number' },
        mape: { type: 'number' },
        rmse: { type: 'number' },
        dataPointsUsed: { type: 'number' },
      },
    },
    trendAnalysis: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['GROWING', 'STABLE', 'DECLINING', 'VOLATILE'] },
        monthlyGrowthRate: { type: 'number' },
        annualizedGrowthRate: { type: 'number' },
        isSignificant: { type: 'boolean' },
        volatility: { type: 'number' },
      },
    },
    summary: { type: 'string' },
    recommendedActions: { type: 'array', items: { type: 'string' } },
    calculatedAt: { type: 'string', format: 'date-time' },
    fromCache: { type: 'boolean' },
    correlationId: { type: 'string' },
  },
} as const;

const DashboardSummarySchema = {
  type: 'object',
  properties: {
    clinicId: { type: 'string', format: 'uuid' },
    currentPeriod: { type: 'string' },
    nextPeriodForecast: { type: 'number' },
    sixMonthForecast: { type: 'number' },
    trend: { type: 'string', enum: ['GROWING', 'STABLE', 'DECLINING', 'VOLATILE'] },
    yoyGrowth: { type: 'number' },
    confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    insights: { type: 'array', items: { type: 'string' } },
    lastUpdated: { type: 'string', format: 'date-time' },
    correlationId: { type: 'string' },
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

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create revenue forecast routes with injected dependencies
 */
export function createRevenueForecastRoutes(deps: RevenueForecastRouteDependencies): FastifyPluginAsync {
  // Initialize repository and use case
  const revenueSnapshotRepository: PostgresRevenueSnapshotRepository = createPostgresRevenueSnapshotRepository({
    connectionString: process.env.DATABASE_URL ?? '',
  });

  const forecastingUseCase: RevenueForecastingUseCase = createRevenueForecastingUseCase(
    revenueSnapshotRepository,
    {
      defaultMethod: 'ensemble',
      defaultForecastPeriods: 6,
      cacheTtlSeconds: 3600, // 1 hour cache
    }
  );

  const revenueForecastRoutes: FastifyPluginAsync = async (fastify) => {
    // ========================================================================
    // Helper: Create Security Context from Request
    // ========================================================================

    function createSecurityContext(request: FastifyRequest, correlationId: string): SecurityContext {
      // In production, this would extract from JWT/session
      // For now, create a system context with full permissions
      const principal: SecurityPrincipal = {
        id: (request.headers['x-user-id'] as string) ?? 'api-user',
        type: SecurityPrincipalType.USER,
        roles: ['ADMIN'],
        permissions: [Permission.REPORT_VIEW, Permission.REPORT_CREATE, Permission.ADMIN_SYSTEM_CONFIG],
        organizationId: request.headers['x-organization-id'] as string | undefined,
        metadata: {
          mfaVerified: true,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          authMethod: 'api_key',
        },
      };

      return SecurityContext.create(principal, correlationId);
    }

    // ========================================================================
    // GET /revenue/forecast/:clinicId
    // Generate revenue forecast for a clinic
    // ========================================================================

    fastify.get(
      '/revenue/forecast/:clinicId',
      {
        schema: {
          description: 'Generate ML-powered revenue forecast for a clinic using Strategy Pattern algorithms',
          tags: ['Revenue Intelligence'],
          params: {
            type: 'object',
            required: ['clinicId'],
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
            },
          },
          querystring: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: ['moving_average', 'exponential_smoothing', 'linear_regression', 'ensemble'] },
              periods: { type: 'number', minimum: 1, maximum: 24 },
              confidence: { type: 'number', minimum: 0.8, maximum: 0.99 },
              granularity: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly'] },
              seasonality: { type: 'boolean' },
              forceRefresh: { type: 'boolean' },
            },
          },
          response: {
            200: ForecastResponseSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { clinicId: string };
          Querystring: {
            method?: string;
            periods?: number;
            confidence?: number;
            granularity?: string;
            seasonality?: boolean;
            forceRefresh?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          // Validate params
          const paramsResult = ClinicIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid clinic ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          // Validate query
          const queryResult = ForecastQuerySchema.safeParse(request.query);
          if (!queryResult.success) {
            return await reply.status(400).send({
              error: 'Invalid query parameters',
              details: queryResult.error.flatten(),
              correlationId,
            });
          }

          const { clinicId } = paramsResult.data;
          const query = queryResult.data;

          // Create security context
          const context = createSecurityContext(request, correlationId);

          // Generate forecast
          const result = await forecastingUseCase.generateForecast(
            {
              clinicId,
              correlationId,
              historicalData: [], // Fetched by use case
              granularity: query.granularity ?? 'monthly',
              method: query.method,
              forecastPeriods: query.periods,
              confidenceLevel: query.confidence,
              applySeasonality: query.seasonality,
              forceRefresh: query.forceRefresh,
            },
            context
          );

          if (result._tag === 'Err') {
            const statusCode = result.error.code.includes('not_found') ? 404 : 400;
            return await reply.status(statusCode).send({
              error: result.error.code,
              message: result.error.message,
              correlationId,
            });
          }

          return await reply.send({
            ...result.value,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Generate forecast error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // GET /revenue/forecast/:clinicId/summary
    // Get dashboard summary for a clinic
    // ========================================================================

    fastify.get(
      '/revenue/forecast/:clinicId/summary',
      {
        schema: {
          description: 'Get simplified forecast summary for dashboard display',
          tags: ['Revenue Intelligence'],
          params: {
            type: 'object',
            required: ['clinicId'],
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: DashboardSummarySchema,
            400: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{ Params: { clinicId: string } }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ClinicIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid clinic ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const { clinicId } = paramsResult.data;
          const context = createSecurityContext(request, correlationId);

          const result = await forecastingUseCase.getForecastSummary(clinicId, context);

          if (result._tag === 'Err') {
            return await reply.status(400).send({
              error: result.error.code,
              message: result.error.message,
              correlationId,
            });
          }

          return await reply.send({
            ...result.value,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get forecast summary error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /revenue/forecast/batch
    // Generate batch forecasts for multiple clinics
    // ========================================================================

    fastify.post(
      '/revenue/forecast/batch',
      {
        schema: {
          description: 'Generate forecasts for multiple clinics in parallel',
          tags: ['Revenue Intelligence'],
          body: {
            type: 'object',
            required: ['clinicIds'],
            properties: {
              clinicIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 100 },
              method: { type: 'string', enum: ['moving_average', 'exponential_smoothing', 'linear_regression', 'ensemble'] },
              periods: { type: 'number', minimum: 1, maximum: 24 },
              continueOnError: { type: 'boolean', default: true },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                succeeded: { type: 'number' },
                failed: { type: 'number' },
                results: { type: 'array' },
                aggregateStats: {
                  type: 'object',
                  properties: {
                    totalPredictedRevenue: { type: 'number' },
                    averageGrowthRate: { type: 'number' },
                    growingClinics: { type: 'number' },
                    decliningClinics: { type: 'number' },
                  },
                },
                durationMs: { type: 'number' },
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
            clinicIds: string[];
            method?: string;
            periods?: number;
            continueOnError?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const bodyResult = BatchForecastBodySchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid request body',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          const body = bodyResult.data;
          const context = createSecurityContext(request, correlationId);

          const result = await forecastingUseCase.generateBatchForecast(
            {
              clinicIds: body.clinicIds,
              correlationId,
              method: body.method as 'moving_average' | 'exponential_smoothing' | 'linear_regression' | 'ensemble' | undefined,
              forecastPeriods: body.periods,
              continueOnError: body.continueOnError,
            },
            context
          );

          if (result._tag === 'Err') {
            return await reply.status(400).send({
              error: result.error.code,
              message: result.error.message,
              correlationId,
            });
          }

          return await reply.send({
            ...result.value,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Batch forecast error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /revenue/forecast/compare
    // Compare forecast to actual revenue
    // ========================================================================

    fastify.post(
      '/revenue/forecast/compare',
      {
        schema: {
          description: 'Compare forecasted revenue to actual results for model accuracy assessment',
          tags: ['Revenue Intelligence'],
          body: {
            type: 'object',
            required: ['clinicId', 'periodStart', 'periodEnd', 'forecastedRevenue', 'forecastedInterval', 'actualRevenue'],
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
              periodStart: { type: 'string', format: 'date-time' },
              periodEnd: { type: 'string', format: 'date-time' },
              forecastedRevenue: { type: 'number' },
              forecastedInterval: {
                type: 'object',
                properties: {
                  lower: { type: 'number' },
                  upper: { type: 'number' },
                  level: { type: 'number' },
                },
              },
              actualRevenue: { type: 'number' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                clinicId: { type: 'string' },
                absoluteError: { type: 'number' },
                percentageError: { type: 'number' },
                withinConfidenceInterval: { type: 'boolean' },
                bias: { type: 'number' },
                needsRecalibration: { type: 'boolean' },
                assessment: { type: 'string', enum: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'] },
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
            clinicId: string;
            periodStart: string;
            periodEnd: string;
            forecastedRevenue: number;
            forecastedInterval: { lower: number; upper: number; level: number };
            actualRevenue: number;
          };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const bodyResult = CompareForecastBodySchema.safeParse(request.body);
          if (!bodyResult.success) {
            return await reply.status(400).send({
              error: 'Invalid request body',
              details: bodyResult.error.flatten(),
              correlationId,
            });
          }

          const body = bodyResult.data;
          const context = createSecurityContext(request, correlationId);

          const result = await forecastingUseCase.compareForecastToActual(
            {
              clinicId: body.clinicId,
              correlationId,
              periodStart: new Date(body.periodStart),
              periodEnd: new Date(body.periodEnd),
              forecastedRevenue: body.forecastedRevenue,
              forecastedInterval: body.forecastedInterval,
              actualRevenue: body.actualRevenue,
            },
            context
          );

          if (result._tag === 'Err') {
            return await reply.status(400).send({
              error: result.error.code,
              message: result.error.message,
              correlationId,
            });
          }

          return await reply.send({
            ...result.value,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Compare forecast error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // POST /revenue/forecast/:clinicId/invalidate
    // Invalidate cached forecast
    // ========================================================================

    fastify.post(
      '/revenue/forecast/:clinicId/invalidate',
      {
        schema: {
          description: 'Invalidate cached forecast for a clinic (admin only)',
          tags: ['Revenue Intelligence'],
          security: [{ ApiKeyAuth: [] }],
          params: {
            type: 'object',
            required: ['clinicId'],
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                correlationId: { type: 'string' },
              },
            },
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (
        request: FastifyRequest<{ Params: { clinicId: string } }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ClinicIdParamSchema.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid clinic ID',
              details: paramsResult.error.flatten(),
              correlationId,
            });
          }

          const { clinicId } = paramsResult.data;
          const context = createSecurityContext(request, correlationId);

          const result = await forecastingUseCase.invalidateForecast(clinicId, context);

          if (result._tag === 'Err') {
            const statusCode = result.error.code.includes('permission') ? 401 : 400;
            return await reply.status(statusCode).send({
              error: result.error.code,
              message: result.error.message,
              correlationId,
            });
          }

          return await reply.send({
            success: true,
            message: `Forecast cache invalidated for clinic ${clinicId}`,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Invalidate forecast error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // GET /revenue/forecast/:clinicId/strategies
    // Get available forecasting strategies (for UI selection)
    // ========================================================================

    fastify.get(
      '/revenue/forecast/strategies',
      {
        schema: {
          description: 'Get available forecasting strategies and their descriptions',
          tags: ['Revenue Intelligence'],
          response: {
            200: {
              type: 'object',
              properties: {
                strategies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      displayName: { type: 'string' },
                      description: { type: 'string' },
                      bestFor: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        return await reply.send({
          strategies: [
            {
              name: 'moving_average',
              displayName: 'Moving Average',
              description: 'Simple baseline using average of recent periods',
              bestFor: 'Stable revenue patterns with low volatility',
            },
            {
              name: 'exponential_smoothing',
              displayName: 'Exponential Smoothing',
              description: 'Weights recent data more heavily than older data',
              bestFor: 'Revenue with recent trend changes',
            },
            {
              name: 'linear_regression',
              displayName: 'Linear Regression',
              description: 'Trend-based forecasting with confidence intervals',
              bestFor: 'Consistent growth or decline patterns',
            },
            {
              name: 'ensemble',
              displayName: 'Ensemble (Recommended)',
              description: 'Combines all strategies weighted by model fit (R²)',
              bestFor: 'Most scenarios - automatically adapts to data patterns',
            },
          ],
        });
      }
    );
  };

  return revenueForecastRoutes;
}

/**
 * Default revenue forecast routes plugin (for auto-registration)
 */
export const revenueForecastRoutes: FastifyPluginAsync<{ pool: Pool }> = async (fastify, opts) => {
  const routes = createRevenueForecastRoutes({ pool: opts.pool });
  await fastify.register(routes);
};
