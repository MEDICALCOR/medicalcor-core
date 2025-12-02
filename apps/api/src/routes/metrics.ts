/**
 * Prometheus Metrics Endpoint
 *
 * Provides Prometheus-compatible metrics for:
 * - Business metrics (lead scoring, appointments, messages)
 * - Infrastructure metrics (DLQ, projections, circuit breakers)
 * - Default Node.js metrics (memory, CPU, event loop)
 *
 * Protected by API key authentication (configured in app.ts)
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  type Metric,
} from 'prom-client';

// ============================================================================
// METRICS REGISTRY
// ============================================================================

const register = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop lag, etc.)
collectDefaultMetrics({ register });

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/** Lead scoring operation duration */
export const leadScoringDuration = new Histogram({
  name: 'medicalcor_lead_scoring_duration_seconds',
  help: 'Duration of lead scoring operations',
  labelNames: ['classification', 'channel'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** Total leads created by channel */
export const leadsCreatedTotal = new Counter({
  name: 'medicalcor_leads_created_total',
  help: 'Total number of leads created',
  labelNames: ['channel'] as const,
  registers: [register],
});

/** Total leads scored by classification */
export const leadsScoredTotal = new Counter({
  name: 'medicalcor_leads_scored_total',
  help: 'Total number of leads scored',
  labelNames: ['classification'] as const,
  registers: [register],
});

/** Total appointments by status */
export const appointmentsTotal = new Counter({
  name: 'medicalcor_appointments_total',
  help: 'Total number of appointments',
  labelNames: ['status'] as const,
  registers: [register],
});

/** Total messages by direction and channel */
export const messagesTotal = new Counter({
  name: 'medicalcor_messages_total',
  help: 'Total number of messages',
  labelNames: ['direction', 'channel'] as const,
  registers: [register],
});

/** AI operations duration */
export const aiOperationDuration = new Histogram({
  name: 'medicalcor_ai_operation_duration_seconds',
  help: 'Duration of AI operations (scoring, reply generation, embeddings)',
  labelNames: ['operation', 'provider'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

/** AI token usage */
export const aiTokensUsed = new Counter({
  name: 'medicalcor_ai_tokens_total',
  help: 'Total AI tokens used',
  labelNames: ['operation', 'provider', 'type'] as const,
  registers: [register],
});

// ============================================================================
// INFRASTRUCTURE METRICS
// ============================================================================

/** Dead letter queue pending entries */
export const dlqPendingGauge = new Gauge({
  name: 'medicalcor_dlq_pending_total',
  help: 'Number of pending entries in dead letter queue',
  labelNames: ['webhook_type'] as const,
  registers: [register],
});

/** DLQ retry attempts */
export const dlqRetriesTotal = new Counter({
  name: 'medicalcor_dlq_retries_total',
  help: 'Total DLQ retry attempts',
  labelNames: ['webhook_type', 'result'] as const,
  registers: [register],
});

/** Projection lag in seconds */
export const projectionLagGauge = new Gauge({
  name: 'medicalcor_projection_lag_seconds',
  help: 'Seconds since last processed event per projection',
  labelNames: ['projection_name'] as const,
  registers: [register],
});

/** Projection events behind */
export const projectionEventsBehind = new Gauge({
  name: 'medicalcor_projection_events_behind',
  help: 'Number of events behind for each projection',
  labelNames: ['projection_name'] as const,
  registers: [register],
});

/** Projection status (1=running, 0=not running) */
export const projectionStatusGauge = new Gauge({
  name: 'medicalcor_projection_status',
  help: 'Projection status (1=running, 0=paused/error)',
  labelNames: ['projection_name', 'status'] as const,
  registers: [register],
});

/** Event store events total */
export const eventStoreEventsTotal = new Counter({
  name: 'medicalcor_events_total',
  help: 'Total domain events emitted',
  labelNames: ['event_type'] as const,
  registers: [register],
});

/** Circuit breaker state (1=open, 0=closed/half-open) */
export const circuitBreakerState = new Gauge({
  name: 'medicalcor_circuit_breaker_state',
  help: 'Circuit breaker state (1=open, 0=closed)',
  labelNames: ['service'] as const,
  registers: [register],
});

/** Circuit breaker failure count */
export const circuitBreakerFailures = new Counter({
  name: 'medicalcor_circuit_breaker_failures_total',
  help: 'Total circuit breaker failures',
  labelNames: ['service'] as const,
  registers: [register],
});

// ============================================================================
// HTTP METRICS
// ============================================================================

/** HTTP request duration */
export const httpRequestDuration = new Histogram({
  name: 'medicalcor_http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/** HTTP requests total */
export const httpRequestsTotal = new Counter({
  name: 'medicalcor_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a metric by name from the registry
 */
export function getMetric(name: string): Metric | undefined {
  return register.getSingleMetric(name);
}

/**
 * Get the metrics registry (for testing)
 */
export function getRegistry(): Registry {
  return register;
}

// ============================================================================
// ROUTES
// ============================================================================

export const metricsRoutes: FastifyPluginAsync = (fastify) => {
  /**
   * GET /metrics
   *
   * Returns Prometheus-formatted metrics.
   * Protected by API key authentication.
   *
   * @tags Metrics
   * @security ApiKeyAuth
   */
  fastify.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['Metrics'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics in text format',
        },
        500: {
          type: 'string',
          description: 'Internal server error',
        },
      },
    },
    handler: async (_request, reply) => {
      try {
        // Update projection metrics before returning
        await updateProjectionMetrics(fastify);

        // Update circuit breaker metrics
        updateCircuitBreakerMetrics();

        const metrics = await register.metrics();
        reply.header('Content-Type', register.contentType);
        return metrics;
      } catch (error) {
        fastify.log.error({ error }, 'Failed to collect metrics');
        return reply.status(500).send('Failed to collect metrics');
      }
    },
  });

  /**
   * GET /metrics/json
   *
   * Returns metrics in JSON format for debugging.
   * Protected by API key authentication.
   *
   * @tags Metrics
   * @security ApiKeyAuth
   */
  fastify.get('/metrics/json', {
    schema: {
      description: 'Metrics in JSON format',
      tags: ['Metrics'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'object',
          description: 'Metrics as JSON',
        },
        500: {
          type: 'object',
          description: 'Internal server error',
        },
      },
    },
    handler: async (_request, reply) => {
      try {
        const metricsJson = await register.getMetricsAsJSON();
        return await reply.send(metricsJson);
      } catch (error) {
        fastify.log.error({ error }, 'Failed to collect metrics');
        return await reply.status(500).send({ error: 'Failed to collect metrics' });
      }
    },
  });

  return Promise.resolve();
};

// ============================================================================
// METRIC UPDATERS
// ============================================================================

/**
 * Update projection metrics from database
 */
async function updateProjectionMetrics(fastify: {
  log: { warn: (obj: object, msg: string) => void };
}): Promise<void> {
  try {
    // Dynamic import to avoid requiring pg at module load time
    const pg = await import('pg').catch(() => null);
    if (!pg) return;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    const client = new pg.default.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 3000,
    });

    try {
      await client.connect();

      const result = await client.query<{
        projection_name: string;
        status: string;
        lag_seconds: string | null;
        events_behind: string;
      }>(`
        SELECT
          pc.projection_name,
          pc.status,
          EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp))::BIGINT as lag_seconds,
          COALESCE(
            (SELECT COUNT(*) FROM domain_events WHERE created_at > COALESCE(pc.last_event_timestamp, '1970-01-01')),
            0
          ) as events_behind
        FROM projection_checkpoints pc
      `);

      for (const row of result.rows) {
        const lagSeconds = row.lag_seconds !== null ? Number(row.lag_seconds) : 0;
        const eventsBehind = Number(row.events_behind);

        projectionLagGauge.set({ projection_name: row.projection_name }, lagSeconds);
        projectionEventsBehind.set({ projection_name: row.projection_name }, eventsBehind);
        projectionStatusGauge.set(
          { projection_name: row.projection_name, status: row.status },
          row.status === 'running' ? 1 : 0
        );
      }

      await client.end();
    } catch {
      // Ignore query errors, just ensure client is closed
      await client.end().catch(() => {
        /* ignore close errors */
      });
    }
  } catch (error) {
    // Silently ignore - metrics will just not be updated
    fastify.log.warn({ error }, 'Failed to update projection metrics');
  }
}

/**
 * Update circuit breaker metrics
 * Note: Uses the imported globalCircuitBreakerRegistry from @medicalcor/core
 */
function updateCircuitBreakerMetrics(): void {
  try {
    // Import directly since prom-client is already loaded
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('@medicalcor/core') as {
      globalCircuitBreakerRegistry: {
        getAllStats: () => { name: string; state: string; totalFailures: number }[];
      };
    };
    const stats = core.globalCircuitBreakerRegistry.getAllStats();

    for (const stat of stats) {
      circuitBreakerState.set({ service: stat.name }, stat.state === 'OPEN' ? 1 : 0);
    }
  } catch {
    // Silently ignore if circuit breaker registry not available
  }
}

export default metricsRoutes;
