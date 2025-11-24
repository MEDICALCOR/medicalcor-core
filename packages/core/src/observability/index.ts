/**
 * Observability-First Module (Edge Runtime Compatible)
 *
 * Provides comprehensive observability with:
 * - Prometheus-compatible metrics (Edge Runtime compatible)
 * - Auto-instrumentation for HTTP, DB, external services (server-side only)
 * - 100ms diagnostics for fast debugging (server-side only)
 * - Grafana dashboard support
 *
 * NOTE: Only metrics are exported from this index (Edge Runtime compatible).
 * Instrumentation and Diagnostics use Node.js APIs and must be imported directly:
 * - './instrumentation.js' for instrumentFastify, instrumentExternalCall, etc.
 * - './diagnostics.js' for DiagnosticsCollector, getPrometheusMetrics, etc.
 */

// Metrics (Edge Runtime Compatible)
export {
  // Core classes
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  // Global registry
  globalMetrics,
  // Pre-defined metrics
  httpRequestsTotal,
  httpRequestDuration,
  leadsCreated,
  leadsScored,
  leadsConverted,
  leadScoringDuration,
  appointmentsScheduled,
  appointmentsCancelled,
  messagesReceived,
  messagesSent,
  externalServiceRequests,
  externalServiceDuration,
  eventsAppended,
  eventStoreLatency,
  commandsExecuted,
  commandDuration,
  queriesExecuted,
  queryDuration,
  activeConnections,
  queueSize,
  aiFunctionCalls,
  aiFunctionDuration,
  aiIntentDetections,
  // Types
  type MetricLabel,
  type MetricValue,
  type MetricType,
  type MetricDefinition,
} from './metrics.js';

// NOTE: Instrumentation and Diagnostics exports REMOVED to avoid Edge Runtime issues
// - Instrumentation uses OpenTelemetry SDK (not Edge Runtime compatible)
// - Diagnostics uses Node.js APIs (process.platform, process.memoryUsage, etc.)
//
// Import directly from:
// - '@medicalcor/core/observability/instrumentation' (server-side only)
// - '@medicalcor/core/observability/diagnostics' (server-side only)
