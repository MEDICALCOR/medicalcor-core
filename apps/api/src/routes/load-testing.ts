/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateLoadTestResultSchema,
  type CreateLoadTestResult,
  type LoadTestResult,
  type LoadTestDashboardData,
  type LoadTestSummaryStats,
  type LoadTestTrendPoint,
  type ScenarioBreakdown,
  type EnvironmentComparison,
} from '@medicalcor/types';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'load-testing-routes' });

/**
 * Load Testing Routes
 *
 * Provides endpoints for:
 * - Storing K6 load test results (POST /load-tests)
 * - Retrieving load test results (GET /load-tests)
 * - Dashboard data aggregation (GET /load-tests/dashboard)
 * - Individual result lookup (GET /load-tests/:id)
 *
 * SECURITY: Write endpoints require API key authentication via X-API-Key header.
 * Read endpoints are open for dashboard access.
 */

// In-memory storage for demo/development (replace with database in production)
const loadTestResults: LoadTestResult[] = [];
let _nextId = 1;

/**
 * Calculate status based on thresholds and metrics
 */
function calculateStatus(
  thresholdsPassed: boolean,
  successRate: number,
  p95Duration: number
): 'passed' | 'failed' | 'degraded' {
  if (!thresholdsPassed) return 'failed';
  if (successRate < 95 || p95Duration > 1000) return 'degraded';
  return 'passed';
}

/**
 * Calculate summary stats from results
 */
function calculateSummaryStats(results: LoadTestResult[]): LoadTestSummaryStats {
  if (results.length === 0) {
    return {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      degradedRuns: 0,
      avgP95Duration: 0,
      avgSuccessRate: 0,
      lastRunAt: null,
    };
  }

  const passedRuns = results.filter((r) => r.status === 'passed').length;
  const failedRuns = results.filter((r) => r.status === 'failed').length;
  const degradedRuns = results.filter((r) => r.status === 'degraded').length;
  const avgP95Duration = results.reduce((sum, r) => sum + r.p95Duration, 0) / results.length;
  const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;

  const sortedByDate = [...results].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return {
    totalRuns: results.length,
    passedRuns,
    failedRuns,
    degradedRuns,
    avgP95Duration: Math.round(avgP95Duration * 100) / 100,
    avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
    lastRunAt: sortedByDate[0]?.startedAt ?? null,
  };
}

/**
 * Generate trend data from results
 */
function generateTrends(results: LoadTestResult[]): LoadTestTrendPoint[] {
  return results
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .map((r) => ({
      date: r.startedAt.split('T')[0] ?? r.startedAt,
      p95Duration: r.p95Duration,
      p99Duration: r.p99Duration,
      avgDuration: r.avgDuration,
      successRate: r.successRate,
      totalRequests: r.totalRequests,
      scenario: r.scenario,
      status: r.status,
    }));
}

/**
 * Generate scenario breakdown
 */
function generateScenarioBreakdown(results: LoadTestResult[]): ScenarioBreakdown[] {
  const scenarios = ['smoke', 'load', 'stress', 'soak', 'custom'] as const;
  return scenarios
    .map((scenario) => {
      const scenarioResults = results.filter((r) => r.scenario === scenario);
      if (scenarioResults.length === 0) return null;

      const avgP95 =
        scenarioResults.reduce((sum, r) => sum + r.p95Duration, 0) / scenarioResults.length;
      const passRate =
        (scenarioResults.filter((r) => r.status === 'passed').length / scenarioResults.length) *
        100;

      return {
        scenario,
        count: scenarioResults.length,
        avgP95: Math.round(avgP95 * 100) / 100,
        passRate: Math.round(passRate * 100) / 100,
      };
    })
    .filter((s): s is ScenarioBreakdown => s !== null);
}

/**
 * Generate environment comparison
 */
function generateEnvironmentComparison(results: LoadTestResult[]): EnvironmentComparison[] {
  const environments = [...new Set(results.map((r) => r.environment))];
  return environments.map((environment) => {
    const envResults = results.filter((r) => r.environment === environment);
    const avgP95 = envResults.reduce((sum, r) => sum + r.p95Duration, 0) / envResults.length;
    const avgP99 = envResults.reduce((sum, r) => sum + r.p99Duration, 0) / envResults.length;
    const avgSuccessRate =
      envResults.reduce((sum, r) => sum + r.successRate, 0) / envResults.length;

    return {
      environment,
      avgP95: Math.round(avgP95 * 100) / 100,
      avgP99: Math.round(avgP99 * 100) / 100,
      avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      totalRuns: envResults.length,
    };
  });
}

/**
 * Filter results by time range
 */
function filterByTimeRange(results: LoadTestResult[], timeRange: string): LoadTestResult[] {
  const now = new Date();
  let cutoff: Date;

  switch (timeRange) {
    case '7d':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '6m':
      cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return results.filter((r) => new Date(r.startedAt) >= cutoff);
}

export const loadTestingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /load-tests
   *
   * Store a new load test result from K6
   * SECURITY: Requires API key authentication (X-API-Key header)
   */
  fastify.post<{ Body: CreateLoadTestResult }>('/load-tests', {
    schema: {
      body: {
        type: 'object',
        required: ['scenario', 'baseUrl', 'metrics'],
        properties: {
          runId: { type: 'string', format: 'uuid' },
          scenario: { type: 'string', enum: ['smoke', 'load', 'stress', 'soak', 'custom'] },
          environment: { type: 'string', maxLength: 50 },
          baseUrl: { type: 'string', format: 'uri' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time' },
          durationSeconds: { type: 'number', minimum: 0 },
          metrics: {
            type: 'object',
            required: ['totalRequests', 'successRate', 'avgDuration', 'p95Duration', 'p99Duration'],
          },
          thresholds: { type: 'object' },
          thresholdsPassed: { type: 'boolean' },
          endpoints: { type: 'array' },
          tags: { type: 'object' },
          metadata: { type: 'object' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: CreateLoadTestResult }>, reply: FastifyReply) => {
      try {
        const validation = CreateLoadTestResultSchema.safeParse(request.body);
        if (!validation.success) {
          logger.warn({ errors: validation.error.errors }, 'Invalid load test result payload');
          return reply.status(400).send({
            success: false,
            message: 'Invalid payload',
            errors: validation.error.errors,
          });
        }

        const data = validation.data;
        const now = new Date().toISOString();

        const thresholdsPassed = data.thresholdsPassed ?? true;
        const status = calculateStatus(
          thresholdsPassed,
          data.metrics.successRate,
          data.metrics.p95Duration
        );

        const result: LoadTestResult = {
          id: crypto.randomUUID(),
          runId: data.runId ?? crypto.randomUUID(),
          scenario: data.scenario,
          environment: data.environment ?? 'local',
          baseUrl: data.baseUrl,

          startedAt: data.startedAt ?? now,
          endedAt: data.endedAt ?? now,
          durationSeconds: data.durationSeconds ?? null,

          status,

          totalRequests: data.metrics.totalRequests,
          successfulRequests: data.metrics.successfulRequests ?? data.metrics.totalRequests,
          failedRequests: data.metrics.failedRequests ?? 0,
          successRate: data.metrics.successRate,
          errorRate: data.metrics.errorRate ?? 100 - data.metrics.successRate,

          vusMax: data.metrics.vusMax ?? 0,
          iterations: data.metrics.iterations ?? 0,

          avgDuration: data.metrics.avgDuration,
          minDuration: data.metrics.minDuration ?? 0,
          maxDuration: data.metrics.maxDuration ?? 0,
          p50Duration: data.metrics.p50Duration ?? 0,
          p90Duration: data.metrics.p90Duration ?? 0,
          p95Duration: data.metrics.p95Duration,
          p99Duration: data.metrics.p99Duration,

          requestsPerSecond: data.metrics.requestsPerSecond ?? 0,
          dataReceivedBytes: data.metrics.dataReceivedBytes ?? 0,
          dataSentBytes: data.metrics.dataSentBytes ?? 0,

          thresholds: data.thresholds ?? null,
          thresholdsPassed,

          tags: data.tags ?? null,
          metadata: data.metadata ?? null,

          createdAt: now,
          createdBy: 'k6-runner',
        };

        loadTestResults.push(result);
        nextId++;

        logger.info(
          { id: result.id, scenario: result.scenario, status: result.status },
          'Load test result stored'
        );

        return reply.status(201).send({
          success: true,
          id: result.id,
          message: 'Load test result stored successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to store load test result');
        return reply.status(500).send({
          success: false,
          message: 'Internal server error',
        });
      }
    },
  });

  /**
   * GET /load-tests
   *
   * Retrieve load test results with optional filtering
   */
  fastify.get<{
    Querystring: {
      timeRange?: string;
      scenario?: string;
      environment?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>('/load-tests', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            enum: ['7d', '30d', '90d', '6m', '1y'],
            default: '30d',
          },
          scenario: { type: 'string', enum: ['smoke', 'load', 'stress', 'soak', 'custom'] },
          environment: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'failed', 'degraded'] },
          limit: { type: 'string', default: '20' },
          offset: { type: 'string', default: '0' },
        },
      },
    },
    handler: async (request, reply) => {
      const { timeRange, scenario, environment, status, limit, offset } = request.query;

      let results = [...loadTestResults];

      // Apply time range filter
      if (timeRange) {
        results = filterByTimeRange(results, timeRange);
      }

      // Apply additional filters
      if (scenario) {
        results = results.filter((r) => r.scenario === scenario);
      }
      if (environment) {
        results = results.filter((r) => r.environment === environment);
      }
      if (status) {
        results = results.filter((r) => r.status === status);
      }

      // Sort by date descending
      results.sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );

      // Apply pagination with NaN validation
      const parsedLimit = parseInt(limit ?? '20', 10);
      const parsedOffset = parseInt(offset ?? '0', 10);
      const limitNum = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 100);
      const offsetNum = Number.isNaN(parsedOffset) ? 0 : parsedOffset;
      const paginatedResults = results.slice(offsetNum, offsetNum + limitNum);

      return reply.send({
        results: paginatedResults,
        total: results.length,
        limit: limitNum,
        offset: offsetNum,
      });
    },
  });

  /**
   * GET /load-tests/dashboard
   *
   * Get aggregated dashboard data for load testing trends
   */
  fastify.get<{
    Querystring: {
      timeRange?: string;
      environment?: string;
    };
  }>('/load-tests/dashboard', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            enum: ['7d', '30d', '90d', '6m', '1y'],
            default: '30d',
          },
          environment: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { timeRange, environment } = request.query;

      let results = [...loadTestResults];

      // Apply time range filter
      if (timeRange) {
        results = filterByTimeRange(results, timeRange);
      }

      // Apply environment filter
      if (environment) {
        results = results.filter((r) => r.environment === environment);
      }

      const dashboardData: LoadTestDashboardData = {
        stats: calculateSummaryStats(results),
        trends: generateTrends(results),
        scenarioBreakdown: generateScenarioBreakdown(results),
        environmentComparison: generateEnvironmentComparison(results),
        recentRuns: results
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          .slice(0, 10),
      };

      return reply.send(dashboardData);
    },
  });

  /**
   * GET /load-tests/:id
   *
   * Retrieve a specific load test result by ID
   */
  fastify.get<{ Params: { id: string } }>('/load-tests/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const result = loadTestResults.find((r) => r.id === id);

      if (!result) {
        return reply.status(404).send({
          success: false,
          message: `Load test result '${id}' not found`,
        });
      }

      return reply.send(result);
    },
  });

  /**
   * DELETE /load-tests/:id
   *
   * Delete a specific load test result
   * SECURITY: Requires API key authentication (X-API-Key header)
   */
  fastify.delete<{ Params: { id: string } }>('/load-tests/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const index = loadTestResults.findIndex((r) => r.id === id);

      if (index === -1) {
        return reply.status(404).send({
          success: false,
          message: `Load test result '${id}' not found`,
        });
      }

      loadTestResults.splice(index, 1);

      logger.info({ id }, 'Load test result deleted');

      return reply.send({
        success: true,
        message: 'Load test result deleted successfully',
      });
    },
  });

  /**
   * GET /load-tests/environments
   *
   * Get list of unique environments
   */
  fastify.get('/load-tests/environments', async (_request, reply) => {
    const environments = [...new Set(loadTestResults.map((r) => r.environment))];
    return reply.send({ environments });
  });
};
