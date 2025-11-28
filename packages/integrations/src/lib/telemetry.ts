/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ENTERPRISE OBSERVABILITY & TELEMETRY                       ║
 * ║                                                                               ║
 * ║  OpenTelemetry-compatible instrumentation for distributed tracing,           ║
 * ║  metrics collection, and structured logging across integrations.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { CorrelationId } from './branded-types.js';
import { correlationId as createCorrelationId } from './branded-types.js';

// =============================================================================
// Span & Trace Types (OpenTelemetry Compatible)
// =============================================================================

/**
 * Span status codes aligned with OpenTelemetry
 */
export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';

/**
 * Span kind for categorization
 */
export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

/**
 * Span attributes for context
 */
export type SpanAttributes = Readonly<
  Record<string, string | number | boolean | readonly string[] | undefined>
>;

/**
 * Span event for timeline tracking
 */
export interface SpanEvent {
  readonly name: string;
  readonly timestamp: number;
  readonly attributes?: SpanAttributes | undefined;
}

/**
 * Span link for cross-trace correlation
 */
export interface SpanLink {
  readonly traceId: string;
  readonly spanId: string;
  readonly attributes?: SpanAttributes;
}

/**
 * Complete span data structure
 */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: number;
  endTime?: number;
  readonly status: { code: SpanStatusCode; message?: string | undefined };
  readonly attributes: SpanAttributes;
  readonly events: SpanEvent[];
  readonly links: SpanLink[];
}

/**
 * Trace context for propagation
 */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
  readonly correlationId: CorrelationId;
}

// =============================================================================
// Metrics Types
// =============================================================================

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Metric labels
 */
export type MetricLabels = Readonly<Record<string, string>>;

/**
 * Metric data point
 */
export interface MetricDataPoint {
  readonly name: string;
  readonly type: MetricType;
  readonly value: number;
  readonly labels: MetricLabels;
  readonly timestamp: number;
  readonly unit?: string | undefined;
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  readonly le: number; // Less than or equal
  readonly count: number;
}

/**
 * Histogram data
 */
export interface HistogramData {
  readonly sum: number;
  readonly count: number;
  readonly buckets: readonly HistogramBucket[];
}

// =============================================================================
// Integration-Specific Metrics
// =============================================================================

/**
 * Standard metric names for integrations
 */
export const IntegrationMetrics = {
  // Request metrics
  REQUEST_TOTAL: 'integration_requests_total',
  REQUEST_DURATION_MS: 'integration_request_duration_milliseconds',
  REQUEST_SIZE_BYTES: 'integration_request_size_bytes',
  RESPONSE_SIZE_BYTES: 'integration_response_size_bytes',

  // Error metrics
  ERROR_TOTAL: 'integration_errors_total',
  RETRY_TOTAL: 'integration_retries_total',
  TIMEOUT_TOTAL: 'integration_timeouts_total',

  // Circuit breaker metrics
  CIRCUIT_STATE: 'integration_circuit_state',
  CIRCUIT_OPEN_TOTAL: 'integration_circuit_open_total',
  CIRCUIT_HALF_OPEN_TOTAL: 'integration_circuit_half_open_total',

  // Rate limiting metrics
  RATE_LIMIT_HIT_TOTAL: 'integration_rate_limit_hit_total',
  RATE_LIMIT_REMAINING: 'integration_rate_limit_remaining',

  // Connection metrics
  CONNECTION_POOL_SIZE: 'integration_connection_pool_size',
  CONNECTION_ACTIVE: 'integration_connection_active',
  CONNECTION_IDLE: 'integration_connection_idle',

  // Business metrics
  WEBHOOK_RECEIVED_TOTAL: 'integration_webhook_received_total',
  WEBHOOK_PROCESSING_DURATION_MS: 'integration_webhook_processing_duration_milliseconds',
  MESSAGE_SENT_TOTAL: 'integration_message_sent_total',
  API_CALL_COST: 'integration_api_call_cost',
} as const;

/**
 * Standard labels for integration metrics
 */
export const IntegrationLabels = {
  SERVICE: 'service',
  OPERATION: 'operation',
  STATUS: 'status',
  ERROR_TYPE: 'error_type',
  HTTP_STATUS_CODE: 'http_status_code',
  HTTP_METHOD: 'http_method',
  CIRCUIT_STATE: 'circuit_state',
  RETRY_ATTEMPT: 'retry_attempt',
  LANGUAGE: 'language',
  TEMPLATE_NAME: 'template_name',
  CHANNEL: 'channel',
} as const;

// =============================================================================
// Telemetry Context
// =============================================================================

/**
 * Telemetry context that flows through the system
 */
export interface TelemetryContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly correlationId: CorrelationId;
  readonly service: string;
  readonly operation: string;
  readonly startTime: number;
  readonly attributes: SpanAttributes;
  readonly baggage: Map<string, string>;
}

/**
 * Create a new telemetry context
 */
export function createTelemetryContext(options: {
  service: string;
  operation: string;
  parentContext?: TelemetryContext;
  attributes?: SpanAttributes;
}): TelemetryContext {
  const traceId = options.parentContext?.traceId ?? generateTraceId();
  const spanId = generateSpanId();
  const corrId = options.parentContext?.correlationId ?? createCorrelationId();

  return {
    traceId,
    spanId,
    correlationId: corrId,
    service: options.service,
    operation: options.operation,
    startTime: Date.now(),
    attributes: {
      ...options.parentContext?.attributes,
      ...options.attributes,
      'service.name': options.service,
      'operation.name': options.operation,
    },
    baggage: new Map(options.parentContext?.baggage),
  };
}

// =============================================================================
// Telemetry Collector Interface
// =============================================================================

/**
 * Abstract telemetry collector interface
 * Implement this to send telemetry to your observability platform
 */
export interface TelemetryCollector {
  /**
   * Record a span
   */
  recordSpan(span: Span): void;

  /**
   * Record a metric
   */
  recordMetric(metric: MetricDataPoint): void;

  /**
   * Record multiple metrics
   */
  recordMetrics(metrics: MetricDataPoint[]): void;

  /**
   * Flush pending telemetry
   */
  flush(): Promise<void>;

  /**
   * Shutdown the collector
   */
  shutdown(): Promise<void>;
}

// =============================================================================
// In-Memory Telemetry Collector (for development/testing)
// =============================================================================

/**
 * In-memory telemetry collector for development and testing
 */
export class InMemoryTelemetryCollector implements TelemetryCollector {
  private spans: Span[] = [];
  private metrics: MetricDataPoint[] = [];
  private maxSpans: number;
  private maxMetrics: number;

  constructor(options: { maxSpans?: number; maxMetrics?: number } = {}) {
    this.maxSpans = options.maxSpans ?? 10000;
    this.maxMetrics = options.maxMetrics ?? 100000;
  }

  recordSpan(span: Span): void {
    if (this.spans.length >= this.maxSpans) {
      // FIFO eviction
      this.spans.shift();
    }
    this.spans.push(span);
  }

  recordMetric(metric: MetricDataPoint): void {
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
    }
    this.metrics.push(metric);
  }

  recordMetrics(metrics: MetricDataPoint[]): void {
    for (const metric of metrics) {
      this.recordMetric(metric);
    }
  }

  async flush(): Promise<void> {
    // No-op for in-memory collector
  }

  shutdown(): Promise<void> {
    this.spans = [];
    this.metrics = [];
    return Promise.resolve();
  }

  /**
   * Get all recorded spans
   */
  getSpans(): readonly Span[] {
    return [...this.spans];
  }

  /**
   * Get spans for a specific trace
   */
  getSpansByTraceId(traceId: string): readonly Span[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): readonly MetricDataPoint[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): readonly MetricDataPoint[] {
    return this.metrics.filter((m) => m.name === name);
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, { count: number; sum: number; avg: number }> {
    const summary: Record<string, { count: number; sum: number; avg: number }> = {};

    for (const metric of this.metrics) {
      let entry = summary[metric.name];
      if (!entry) {
        entry = { count: 0, sum: 0, avg: 0 };
        summary[metric.name] = entry;
      }
      entry.count++;
      entry.sum += metric.value;
      entry.avg = entry.sum / entry.count;
    }

    return summary;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.spans = [];
    this.metrics = [];
  }
}

// =============================================================================
// Telemetry Registry (Singleton)
// =============================================================================

/**
 * Global telemetry registry
 */
class TelemetryRegistry {
  private static instance: TelemetryRegistry;
  private collector: TelemetryCollector;
  private contextStack: TelemetryContext[] = [];

  private constructor() {
    this.collector = new InMemoryTelemetryCollector();
  }

  static getInstance(): TelemetryRegistry {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- singleton pattern: instance is undefined on first call
    if (!TelemetryRegistry.instance) {
      TelemetryRegistry.instance = new TelemetryRegistry();
    }
    return TelemetryRegistry.instance;
  }

  /**
   * Set the telemetry collector
   */
  setCollector(collector: TelemetryCollector): void {
    this.collector = collector;
  }

  /**
   * Get the current collector
   */
  getCollector(): TelemetryCollector {
    return this.collector;
  }

  /**
   * Push context onto stack
   */
  pushContext(context: TelemetryContext): void {
    this.contextStack.push(context);
  }

  /**
   * Pop context from stack
   */
  popContext(): TelemetryContext | undefined {
    return this.contextStack.pop();
  }

  /**
   * Get current context
   */
  getCurrentContext(): TelemetryContext | undefined {
    return this.contextStack[this.contextStack.length - 1];
  }
}

// =============================================================================
// Instrumentation Functions
// =============================================================================

/**
 * Create and start a new span
 */
export function startSpan(
  name: string,
  options: {
    kind?: SpanKind | undefined;
    attributes?: SpanAttributes | undefined;
    links?: SpanLink[];
    parentContext?: TelemetryContext;
  } = {}
): Span {
  const parentContext =
    options.parentContext ?? TelemetryRegistry.getInstance().getCurrentContext();

  const span: Span = {
    traceId: parentContext?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parentContext?.spanId,
    name,
    kind: options.kind ?? 'INTERNAL',
    startTime: Date.now(),
    status: { code: 'UNSET' },
    attributes: {
      ...parentContext?.attributes,
      ...options.attributes,
    },
    events: [],
    links: options.links ?? [],
  };

  return span;
}

/**
 * End a span and record it
 */
export function endSpan(
  span: Span,
  options: {
    status?: SpanStatusCode;
    message?: string;
    attributes?: SpanAttributes;
  } = {}
): Span {
  const completedSpan: Span = {
    ...span,
    endTime: Date.now(),
    status: {
      code: options.status ?? 'OK',
      message: options.message,
    },
    attributes: {
      ...span.attributes,
      ...options.attributes,
      'span.duration_ms': Date.now() - span.startTime,
    },
  };

  TelemetryRegistry.getInstance().getCollector().recordSpan(completedSpan);
  return completedSpan;
}

/**
 * Add an event to a span
 */
export function addSpanEvent(span: Span, name: string, attributes?: SpanAttributes): Span {
  const event: SpanEvent = {
    name,
    timestamp: Date.now(),
    attributes,
  };

  return {
    ...span,
    events: [...span.events, event],
  };
}

/**
 * Set span attributes
 */
export function setSpanAttributes(span: Span, attributes: SpanAttributes): Span {
  return {
    ...span,
    attributes: {
      ...span.attributes,
      ...attributes,
    },
  };
}

/**
 * Record a metric
 */
export function recordMetric(
  name: string,
  value: number,
  options: {
    type?: MetricType;
    labels?: MetricLabels | undefined;
    unit?: string | undefined;
  } = {}
): void {
  const metric: MetricDataPoint = {
    name,
    type: options.type ?? 'gauge',
    value,
    labels: options.labels ?? {},
    timestamp: Date.now(),
    unit: options.unit,
  };

  TelemetryRegistry.getInstance().getCollector().recordMetric(metric);
}

/**
 * Increment a counter
 */
export function incrementCounter(name: string, labels?: MetricLabels, delta = 1): void {
  recordMetric(name, delta, { type: 'counter', labels });
}

/**
 * Set a gauge value
 */
export function setGauge(name: string, value: number, labels?: MetricLabels): void {
  recordMetric(name, value, { type: 'gauge', labels });
}

/**
 * Record a histogram observation
 */
export function observeHistogram(
  name: string,
  value: number,
  labels?: MetricLabels,
  unit?: string
): void {
  recordMetric(name, value, { type: 'histogram', labels, unit });
}

// =============================================================================
// Instrumented Operation Wrapper
// =============================================================================

/**
 * Options for instrumented operations
 */
export interface InstrumentOptions {
  service: string;
  operation: string;
  kind?: SpanKind;
  attributes?: SpanAttributes;
  recordDuration?: boolean;
  recordSuccess?: boolean;
  recordError?: boolean;
}

/**
 * Wrap an async operation with telemetry instrumentation
 *
 * @example
 * ```typescript
 * const result = await instrument(
 *   { service: 'hubspot', operation: 'syncContact' },
 *   async (ctx) => {
 *     // Your operation here
 *     return hubspot.syncContact(data);
 *   }
 * );
 * ```
 */
export async function instrument<T>(
  options: InstrumentOptions,
  operation: (context: TelemetryContext) => Promise<T>
): Promise<T> {
  const {
    service,
    operation: opName,
    kind = 'CLIENT',
    attributes = {},
    recordDuration = true,
    recordSuccess = true,
    recordError = true,
  } = options;

  const context = createTelemetryContext({
    service,
    operation: opName,
    attributes,
  });

  const span = startSpan(`${service}.${opName}`, {
    kind,
    attributes: {
      [IntegrationLabels.SERVICE]: service,
      [IntegrationLabels.OPERATION]: opName,
      ...attributes,
    },
  });

  const registry = TelemetryRegistry.getInstance();
  registry.pushContext(context);

  const startTime = Date.now();

  try {
    const result = await operation(context);

    const duration = Date.now() - startTime;

    if (recordDuration) {
      observeHistogram(IntegrationMetrics.REQUEST_DURATION_MS, duration, {
        [IntegrationLabels.SERVICE]: service,
        [IntegrationLabels.OPERATION]: opName,
        [IntegrationLabels.STATUS]: 'success',
      });
    }

    if (recordSuccess) {
      incrementCounter(IntegrationMetrics.REQUEST_TOTAL, {
        [IntegrationLabels.SERVICE]: service,
        [IntegrationLabels.OPERATION]: opName,
        [IntegrationLabels.STATUS]: 'success',
      });
    }

    endSpan(span, {
      status: 'OK',
      attributes: { 'operation.duration_ms': duration },
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    if (recordError) {
      incrementCounter(IntegrationMetrics.ERROR_TOTAL, {
        [IntegrationLabels.SERVICE]: service,
        [IntegrationLabels.OPERATION]: opName,
        [IntegrationLabels.ERROR_TYPE]: error instanceof Error ? error.constructor.name : 'Unknown',
      });
    }

    if (recordDuration) {
      observeHistogram(IntegrationMetrics.REQUEST_DURATION_MS, duration, {
        [IntegrationLabels.SERVICE]: service,
        [IntegrationLabels.OPERATION]: opName,
        [IntegrationLabels.STATUS]: 'error',
      });
    }

    endSpan(span, {
      status: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
      attributes: {
        'operation.duration_ms': duration,
        'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
        'error.message': error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  } finally {
    registry.popContext();
  }
}

/**
 * Wrap a sync operation with telemetry
 */
export function instrumentSync<T>(options: InstrumentOptions, operation: () => T): T {
  const span = startSpan(`${options.service}.${options.operation}`, {
    kind: options.kind,
    attributes: options.attributes,
  });

  const startTime = Date.now();

  try {
    const result = operation();
    const duration = Date.now() - startTime;

    endSpan(span, {
      status: 'OK',
      attributes: { 'operation.duration_ms': duration },
    });

    return result;
  } catch (error) {
    endSpan(span, {
      status: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a trace ID (128-bit hex string)
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a span ID (64-bit hex string)
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get the telemetry registry instance
 */
export function getTelemetryRegistry(): TelemetryRegistry {
  return TelemetryRegistry.getInstance();
}

/**
 * Configure the telemetry collector
 */
export function configureTelemetry(collector: TelemetryCollector): void {
  TelemetryRegistry.getInstance().setCollector(collector);
}

// =============================================================================
// Timer Utility
// =============================================================================

/**
 * Simple timer for measuring durations
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start the timer
   */
  static start(): Timer {
    return new Timer();
  }

  /**
   * Stop the timer and return duration in ms
   */
  stop(): number {
    this.endTime = Date.now();
    return this.endTime - this.startTime;
  }

  /**
   * Get elapsed time without stopping
   */
  elapsed(): number {
    return (this.endTime ?? Date.now()) - this.startTime;
  }

  /**
   * Record the duration as a metric
   */
  record(metricName: string, labels?: MetricLabels): number {
    const duration = this.stop();
    observeHistogram(metricName, duration, labels, 'ms');
    return duration;
  }
}
