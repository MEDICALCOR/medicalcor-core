/**
 * @fileoverview Prometheus Metrics Endpoint
 *
 * Provides Prometheus-compatible metrics endpoint for monitoring and alerting.
 * Exposes both system metrics (CPU, memory, event loop) and business metrics
 * (lead scoring, DLQ status, projection health).
 *
 * @module routes/metrics
 * @security This endpoint requires API key authentication (configured in app.ts).
 *           The '/metrics' path is included in the protectedPaths list, ensuring
 *           only authorized monitoring systems can access sensitive metrics.
 *           Additional network-level security (firewall/ingress rules) should
 *           be configured to restrict access to Prometheus instances only.
 */

import type { FastifyPluginAsync } from 'fastify';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a new registry for this application
const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: 'medicalcor_',
});

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/**
 * Lead scoring operation duration and success rate
 * Labels: classification (HOT/WARM/COLD), channel (whatsapp/voice/web)
 */
export const leadScoringLatency = new Histogram({
  name: 'medicalcor_lead_scoring_duration_seconds',
  help: 'Lead scoring operation duration in seconds',
  labelNames: ['classification', 'channel', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/**
 * Total number of leads scored
 * Labels: classification, channel
 */
export const leadsScored = new Counter({
  name: 'medicalcor_leads_scored_total',
  help: 'Total number of leads scored',
  labelNames: ['classification', 'channel'],
  registers: [register],
});

/**
 * Dead Letter Queue pending entries
 * Labels: webhook_type (whatsapp/voice/stripe/vapi)
 */
export const dlqPendingGauge = new Gauge({
  name: 'medicalcor_dlq_pending_total',
  help: 'Number of pending DLQ entries by webhook type',
  labelNames: ['webhook_type'],
  registers: [register],
});

/**
 * Projection lag in seconds
 * Labels: projection_name (lead_stats/patient_activity/daily_metrics)
 */
export const projectionLagGauge = new Gauge({
  name: 'medicalcor_projection_lag_seconds',
  help: 'Seconds since last processed event per projection',
  labelNames: ['projection_name'],
  registers: [register],
});

/**
 * Domain events emitted
 * Labels: event_type
 */
export const eventStoreEventsTotal = new Counter({
  name: 'medicalcor_events_total',
  help: 'Total domain events emitted',
  labelNames: ['event_type'],
  registers: [register],
});

/**
 * Event store append latency
 */
export const eventStoreLatency = new Histogram({
  name: 'medicalcor_event_store_duration_seconds',
  help: 'Event store append operation duration',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register],
});

/**
 * External service call duration
 * Labels: service (hubspot/openai/whatsapp/vapi), operation
 */
export const externalServiceLatency = new Histogram({
  name: 'medicalcor_external_service_duration_seconds',
  help: 'External service call duration',
  labelNames: ['service', 'operation', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

/**
 * Circuit breaker state
 * Labels: service
 */
export const circuitBreakerState = new Gauge({
  name: 'medicalcor_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
  registers: [register],
});

/**
 * AI function calls
 * Labels: function_name, status (success/failure)
 */
export const aiFunctionCalls = new Counter({
  name: 'medicalcor_ai_function_calls_total',
  help: 'Total AI function calls',
  labelNames: ['function_name', 'status'],
  registers: [register],
});

/**
 * AI token usage
 * Labels: model (gpt-4o/gpt-3.5-turbo)
 */
export const aiTokensUsed = new Counter({
  name: 'medicalcor_ai_tokens_used_total',
  help: 'Total AI tokens consumed',
  labelNames: ['model', 'type'],
  registers: [register],
});

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Metrics route plugin
 * Exposes Prometheus-compatible metrics on GET /metrics
 */
// eslint-disable-next-line @typescript-eslint/require-await
export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /metrics
   * Returns Prometheus-formatted metrics
   *
   * @example
   * curl http://localhost:3000/metrics
   */
  fastify.get('/metrics', (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return register.metrics();
  });

  /**
   * GET /metrics/json
   * Returns metrics in JSON format (for debugging/dashboards)
   */
  fastify.get('/metrics/json', async (_request, reply) => {
    const metrics = await register.getMetricsAsJSON();
    reply.type('application/json');
    return { metrics };
  });
};
