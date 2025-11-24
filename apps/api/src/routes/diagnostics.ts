import type { FastifyPluginAsync } from 'fastify';
import {
  diagnostics,
  getPrometheusMetrics,
  getMetricsJSON,
  lookupTrace,
  searchTraces,
  createHealthIndicator,
} from '@medicalcor/core';

/**
 * Diagnostics Routes
 *
 * Provides observability endpoints for:
 * - Prometheus metrics scraping (/metrics)
 * - Diagnostic snapshots (/diagnostics)
 * - Trace lookup (/diagnostics/traces)
 * - Health checks (/diagnostics/health)
 */

// Register default health indicators
diagnostics.registerHealthIndicator(
  createHealthIndicator('database', async () => {
    // In production, this would check actual DB connection
    return { connected: true };
  })
);

diagnostics.registerHealthIndicator(
  createHealthIndicator('redis', async () => {
    // In production, this would check Redis connection
    return { connected: process.env.REDIS_URL ? true : false };
  })
);

diagnostics.registerHealthIndicator(
  createHealthIndicator('trigger_dev', async () => {
    // In production, this would check Trigger.dev connection
    return { configured: !!process.env.TRIGGER_SECRET_KEY };
  })
);

export const diagnosticsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /metrics
   *
   * Prometheus-compatible metrics endpoint
   */
  fastify.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['Diagnostics'],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus text format metrics',
        },
      },
    },
    handler: async (_request, reply) => {
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return reply.send(getPrometheusMetrics());
    },
  });

  /**
   * GET /metrics/json
   *
   * JSON format metrics for debugging
   */
  fastify.get('/metrics/json', {
    schema: {
      description: 'Metrics in JSON format',
      tags: ['Diagnostics'],
    },
    handler: async (_request, reply) => {
      return reply.send(getMetricsJSON());
    },
  });

  /**
   * GET /diagnostics
   *
   * Full diagnostic snapshot (target: <100ms)
   */
  fastify.get('/diagnostics', {
    schema: {
      description: 'Get diagnostic snapshot for debugging',
      tags: ['Diagnostics'],
    },
    handler: async (_request, reply) => {
      const startTime = performance.now();
      const snapshot = await diagnostics.getSnapshot();
      const executionTimeMs = performance.now() - startTime;

      return reply.send({
        ...snapshot,
        _meta: {
          executionTimeMs,
          target: '100ms',
          withinTarget: executionTimeMs < 100,
        },
      });
    },
  });

  /**
   * GET /diagnostics/quick
   *
   * Quick health check (target: <10ms)
   */
  fastify.get('/diagnostics/quick', {
    schema: {
      description: 'Quick health check for load balancers',
      tags: ['Diagnostics'],
    },
    handler: async (_request, reply) => {
      const startTime = performance.now();
      const health = diagnostics.getQuickHealth();
      const executionTimeMs = performance.now() - startTime;

      return reply.send({
        ...health,
        executionTimeMs,
      });
    },
  });

  /**
   * GET /diagnostics/traces/:traceId
   *
   * Lookup a specific trace
   */
  fastify.get<{ Params: { traceId: string } }>('/diagnostics/traces/:traceId', {
    schema: {
      description: 'Lookup a specific trace by ID',
      tags: ['Diagnostics'],
      params: {
        type: 'object',
        properties: {
          traceId: { type: 'string', description: 'Trace ID to lookup' },
        },
        required: ['traceId'],
      },
    },
    handler: async (request, reply) => {
      const { traceId } = request.params;
      const trace = lookupTrace(traceId);

      if (!trace) {
        return reply.status(404).send({
          code: 'TRACE_NOT_FOUND',
          message: `Trace '${traceId}' not found in buffer`,
        });
      }

      return reply.send(trace);
    },
  });

  /**
   * GET /diagnostics/traces
   *
   * Search traces with filters
   */
  fastify.get<{
    Querystring: {
      correlationId?: string;
      minDurationMs?: string;
      status?: 'ok' | 'error';
      limit?: string;
    };
  }>('/diagnostics/traces', {
    schema: {
      description: 'Search traces with filters',
      tags: ['Diagnostics'],
      querystring: {
        type: 'object',
        properties: {
          correlationId: { type: 'string', description: 'Filter by correlation ID' },
          minDurationMs: { type: 'string', description: 'Minimum duration in ms' },
          status: { type: 'string', enum: ['ok', 'error'], description: 'Filter by status' },
          limit: { type: 'string', description: 'Max results (default: 100)' },
        },
      },
    },
    handler: async (request, reply) => {
      const { correlationId, minDurationMs, status, limit } = request.query;

      const traces = searchTraces(
        {
          correlationId,
          minDurationMs: minDurationMs ? parseInt(minDurationMs, 10) : undefined,
          status,
        },
        limit ? parseInt(limit, 10) : 100
      );

      return reply.send({
        traces,
        count: traces.length,
      });
    },
  });

  /**
   * GET /diagnostics/health
   *
   * Detailed health check with all indicators
   */
  fastify.get('/diagnostics/health', {
    schema: {
      description: 'Detailed health check',
      tags: ['Diagnostics'],
    },
    handler: async (_request, reply) => {
      const snapshot = await diagnostics.getSnapshot();
      const health = snapshot.health;

      const statusCode = health.overall === 'healthy' ? 200 : health.overall === 'degraded' ? 200 : 503;

      return reply.status(statusCode).send({
        status: health.overall,
        checks: health.checks,
        timestamp: snapshot.timestamp,
      });
    },
  });

  /**
   * GET /diagnostics/system
   *
   * System resource information
   */
  fastify.get('/diagnostics/system', {
    schema: {
      description: 'System resource information',
      tags: ['Diagnostics'],
    },
    handler: async (_request, reply) => {
      const snapshot = await diagnostics.getSnapshot();

      return reply.send({
        system: snapshot.system,
        uptimeMs: snapshot.uptimeMs,
        timestamp: snapshot.timestamp,
      });
    },
  });
};
