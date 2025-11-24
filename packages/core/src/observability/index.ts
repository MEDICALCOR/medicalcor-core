/**
 * Observability-First Module
 *
 * Provides comprehensive observability with:
 * - Prometheus-compatible metrics
 * - Auto-instrumentation for HTTP, DB, external services
 * - 100ms diagnostics for fast debugging
 * - Grafana dashboard support
 */

// Metrics
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

// Instrumentation
export {
  instrumentFastify,
  instrumentExternalCall,
  instrumentDatabase,
  createCommandMetricsMiddleware,
  createQueryMetricsMiddleware,
  createHealthIndicator,
  type InstrumentationOptions,
  type ExternalCallOptions,
  type RequestContext,
  type HealthIndicator,
  type HealthCheckResult,
  type DatabaseClient,
} from './instrumentation.js';

// Diagnostics
export {
  DiagnosticsCollector,
  diagnostics,
  recordTrace,
  lookupTrace,
  searchTraces,
  getPrometheusMetrics,
  getMetricsJSON,
  type DiagnosticSnapshot,
  type SystemSnapshot,
  type HttpSnapshot,
  type BusinessSnapshot,
  type PerformanceSnapshot,
  type HealthSnapshot,
  type TraceLookup,
  type TraceSpan,
} from './diagnostics.js';
