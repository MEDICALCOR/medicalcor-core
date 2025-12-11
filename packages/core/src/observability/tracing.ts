/**
 * Distributed Tracing Module
 *
 * Comprehensive OpenTelemetry tracing for MedicalCor platform:
 * - End-to-end trace visibility from webhook to response
 * - P95 latency visible per operation
 * - Error traces immediately queryable
 * - Redis, HTTP, PostgreSQL, and external service instrumentation
 *
 * @module @medicalcor/core/observability/tracing
 */

import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  propagation,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import type {
  Span,
  Tracer,
  SpanOptions,
  Context,
  TextMapGetter,
  TextMapSetter,
} from '@opentelemetry/api';

// =============================================================================
// Constants & Configuration
// =============================================================================

/**
 * MedicalCor-specific span attribute names
 * Following OpenTelemetry semantic conventions with medical domain extensions
 */
export const TracingAttributes = {
  // Service identification
  SERVICE_NAME: 'service.name',
  SERVICE_VERSION: 'service.version',
  DEPLOYMENT_ENVIRONMENT: 'deployment.environment',

  // HTTP attributes
  HTTP_METHOD: 'http.method',
  HTTP_URL: 'http.url',
  HTTP_ROUTE: 'http.route',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_REQUEST_CONTENT_LENGTH: 'http.request_content_length',
  HTTP_RESPONSE_CONTENT_LENGTH: 'http.response_content_length',
  HTTP_USER_AGENT: 'http.user_agent',
  HTTP_CLIENT_IP: 'http.client_ip',

  // Database attributes
  DB_SYSTEM: 'db.system',
  DB_NAME: 'db.name',
  DB_OPERATION: 'db.operation',
  DB_STATEMENT: 'db.statement',
  DB_CONNECTION_STRING: 'db.connection_string',
  DB_ROWS_AFFECTED: 'db.rows_affected',

  // Redis attributes
  DB_REDIS_DATABASE_INDEX: 'db.redis.database_index',
  REDIS_COMMAND: 'redis.command',
  REDIS_KEY: 'redis.key',

  // Messaging attributes
  MESSAGING_SYSTEM: 'messaging.system',
  MESSAGING_DESTINATION: 'messaging.destination',
  MESSAGING_DESTINATION_KIND: 'messaging.destination_kind',
  MESSAGING_MESSAGE_ID: 'messaging.message_id',
  MESSAGING_OPERATION: 'messaging.operation',

  // MedicalCor domain attributes
  MEDICALCOR_LEAD_ID: 'medicalcor.lead.id',
  MEDICALCOR_LEAD_PHONE: 'medicalcor.lead.phone',
  MEDICALCOR_LEAD_SCORE: 'medicalcor.lead.score',
  MEDICALCOR_LEAD_CLASSIFICATION: 'medicalcor.lead.classification',
  MEDICALCOR_LEAD_CHANNEL: 'medicalcor.lead.channel',

  // Patient attributes
  MEDICALCOR_PATIENT_ID: 'medicalcor.patient.id',

  // Integration attributes
  MEDICALCOR_HUBSPOT_CONTACT_ID: 'medicalcor.hubspot.contact_id',
  MEDICALCOR_HUBSPOT_OPERATION: 'medicalcor.hubspot.operation',
  MEDICALCOR_WHATSAPP_MESSAGE_ID: 'medicalcor.whatsapp.message_id',
  MEDICALCOR_WHATSAPP_PHONE_NUMBER_ID: 'medicalcor.whatsapp.phone_number_id',
  MEDICALCOR_WHATSAPP_TEMPLATE: 'medicalcor.whatsapp.template',
  MEDICALCOR_OPENAI_MODEL: 'medicalcor.openai.model',
  MEDICALCOR_OPENAI_TOKENS_INPUT: 'medicalcor.openai.tokens.input',
  MEDICALCOR_OPENAI_TOKENS_OUTPUT: 'medicalcor.openai.tokens.output',

  // Workflow/Task attributes
  MEDICALCOR_WORKFLOW_ID: 'medicalcor.workflow.id',
  MEDICALCOR_WORKFLOW_NAME: 'medicalcor.workflow.name',
  MEDICALCOR_WORKFLOW_STEP: 'medicalcor.workflow.step',
  MEDICALCOR_TASK_ID: 'medicalcor.task.id',
  MEDICALCOR_TASK_NAME: 'medicalcor.task.name',
  MEDICALCOR_TASK_ATTEMPT: 'medicalcor.task.attempt',

  // Correlation
  MEDICALCOR_CORRELATION_ID: 'medicalcor.correlation_id',
  MEDICALCOR_IDEMPOTENCY_KEY: 'medicalcor.idempotency_key',

  // Error attributes
  ERROR: 'error',
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'error.message',
  ERROR_STACK: 'error.stack',

  // Performance attributes
  DURATION_MS: 'duration_ms',
} as const;

// =============================================================================
// Trace Context Propagation
// =============================================================================

/**
 * Trace context carrier for propagation between services
 */
export interface TraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
  'x-correlation-id'?: string;
}

/**
 * Text map getter for extracting trace context
 */
const textMapGetter: TextMapGetter<TraceContextCarrier> = {
  get(carrier, key) {
    return carrier[key as keyof TraceContextCarrier];
  },
  keys(carrier) {
    return Object.keys(carrier) as (keyof TraceContextCarrier)[];
  },
};

/**
 * Text map setter for injecting trace context
 */
const textMapSetter: TextMapSetter<TraceContextCarrier> = {
  set(carrier, key, value) {
    carrier[key as keyof TraceContextCarrier] = value;
  },
};

/**
 * Extract trace context from a carrier object
 * Used when receiving requests from external services
 *
 * @example
 * ```typescript
 * const parentContext = extractTraceContext(request.headers);
 * await context.with(parentContext, async () => {
 *   // Operations here will be part of the parent trace
 * });
 * ```
 */
export function extractTraceContext(carrier: TraceContextCarrier): Context {
  return propagation.extract(ROOT_CONTEXT, carrier, textMapGetter);
}

/**
 * Inject trace context into a carrier object
 * Used when sending requests to external services or triggering tasks
 *
 * @example
 * ```typescript
 * const carrier: TraceContextCarrier = {};
 * injectTraceContext(carrier);
 * // Now pass carrier to task payload or HTTP headers
 * ```
 */
export function injectTraceContext(carrier: TraceContextCarrier = {}): TraceContextCarrier {
  propagation.inject(context.active(), carrier, textMapSetter);
  return carrier;
}

/**
 * Get current trace ID if available
 */
export function getCurrentTraceId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().traceId;
}

/**
 * Get current span ID if available
 */
export function getCurrentSpanId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().spanId;
}

/**
 * Get trace context for logging correlation
 */
export function getTraceContextForLogging(): {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
} {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return {};
  }
  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

// =============================================================================
// Tracer Management
// =============================================================================

const tracerCache = new Map<string, Tracer>();

/**
 * Get a tracer for a specific component
 * Uses caching for efficiency
 *
 * @example
 * ```typescript
 * const tracer = getTracer('whatsapp-handler');
 * ```
 */
export function getTracer(name: string, version = '0.1.0'): Tracer {
  const cacheKey = `${name}@${version}`;
  let tracer = tracerCache.get(cacheKey);
  if (!tracer) {
    tracer = trace.getTracer(name, version);
    tracerCache.set(cacheKey, tracer);
  }
  return tracer;
}

/**
 * Get the currently active span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get the current context
 */
export function getCurrentContext(): Context {
  return context.active();
}

// =============================================================================
// Span Creation & Management
// =============================================================================

/**
 * Options for creating spans
 */
export interface CreateSpanOptions extends Omit<SpanOptions, 'kind'> {
  kind?: SpanKind;
  correlationId?: string;
  parentContext?: Context;
}

/**
 * Create a new span
 *
 * @example
 * ```typescript
 * const span = createSpan(tracer, 'process-message', {
 *   kind: SpanKind.INTERNAL,
 *   attributes: { 'message.type': 'text' },
 *   correlationId: 'abc-123',
 * });
 * ```
 */
export function createSpan(tracer: Tracer, name: string, options: CreateSpanOptions = {}): Span {
  const { correlationId, parentContext, kind = SpanKind.INTERNAL, ...spanOptions } = options;

  const ctx = parentContext ?? context.active();
  const span = tracer.startSpan(name, { kind, ...spanOptions }, ctx);

  if (correlationId) {
    span.setAttribute(TracingAttributes.MEDICALCOR_CORRELATION_ID, correlationId);
  }

  return span;
}

/**
 * End a span with status
 */
export function endSpan(span: Span, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
  if (status === 'error') {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage ?? 'Unknown error',
    });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Record an error on a span
 */
export function recordSpanError(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));

  span.recordException(err);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err.message,
  });
  span.setAttributes({
    [TracingAttributes.ERROR]: true,
    [TracingAttributes.ERROR_TYPE]: err.name,
    [TracingAttributes.ERROR_MESSAGE]: err.message,
    ...(err.stack && { [TracingAttributes.ERROR_STACK]: err.stack.slice(0, 2000) }),
  });
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(
  attributes: Record<string, string | number | boolean | undefined>
): void {
  const span = getActiveSpan();
  if (span) {
    // Filter out undefined values
    const filteredAttributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        filteredAttributes[key] = value;
      }
    }
    span.setAttributes(filteredAttributes);
  }
}

/**
 * Add an event to the current active span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// =============================================================================
// Span Execution Wrappers
// =============================================================================

/**
 * Execute an async function within a traced span
 *
 * @example
 * ```typescript
 * const result = await withSpan(tracer, 'fetch-lead', async (span) => {
 *   span.setAttribute('lead.id', leadId);
 *   return await fetchLead(leadId);
 * });
 * ```
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  options: CreateSpanOptions = {}
): Promise<T> {
  const span = createSpan(tracer, name, options);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute a sync function within a traced span
 */
export function withSpanSync<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => T,
  options: CreateSpanOptions = {}
): T {
  const span = createSpan(tracer, name, options);

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => {
      return fn(span);
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute within a parent context
 * Useful for continuing a trace from extracted context
 */
export async function withContext<T>(parentContext: Context, fn: () => Promise<T>): Promise<T> {
  return context.with(parentContext, fn);
}

// =============================================================================
// Specialized Span Helpers
// =============================================================================

/**
 * Create a span for HTTP server requests
 */
export function createServerSpan(
  tracer: Tracer,
  method: string,
  url: string,
  options: CreateSpanOptions = {}
): Span {
  return createSpan(tracer, `${method} ${url}`, {
    kind: SpanKind.SERVER,
    attributes: {
      [TracingAttributes.HTTP_METHOD]: method,
      [TracingAttributes.HTTP_URL]: url,
    },
    ...options,
  });
}

/**
 * Create a span for HTTP client requests
 */
export function createClientSpan(
  tracer: Tracer,
  method: string,
  url: string,
  serviceName: string,
  options: CreateSpanOptions = {}
): Span {
  return createSpan(tracer, `${serviceName} ${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [TracingAttributes.HTTP_METHOD]: method,
      [TracingAttributes.HTTP_URL]: url,
      [TracingAttributes.SERVICE_NAME]: serviceName,
    },
    ...options,
  });
}

/**
 * Create a span for database operations
 */
export function createDatabaseSpan(
  tracer: Tracer,
  operation: string,
  statement?: string,
  options: CreateSpanOptions = {}
): Span {
  const truncatedStatement = statement ? statement.slice(0, 500) : undefined;
  return createSpan(tracer, `db.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [TracingAttributes.DB_SYSTEM]: 'postgresql',
      [TracingAttributes.DB_OPERATION]: operation,
      ...(truncatedStatement && { [TracingAttributes.DB_STATEMENT]: truncatedStatement }),
    },
    ...options,
  });
}

/**
 * Create a span for Redis operations
 */
export function createRedisSpan(
  tracer: Tracer,
  command: string,
  key?: string,
  options: CreateSpanOptions = {}
): Span {
  return createSpan(tracer, `redis.${command.toLowerCase()}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [TracingAttributes.DB_SYSTEM]: 'redis',
      [TracingAttributes.REDIS_COMMAND]: command,
      ...(key && { [TracingAttributes.REDIS_KEY]: key }),
    },
    ...options,
  });
}

/**
 * Create a span for message consumers (webhooks, task handlers)
 */
export function createConsumerSpan(
  tracer: Tracer,
  messagingSystem: string,
  destination: string,
  messageId?: string,
  options: CreateSpanOptions = {}
): Span {
  return createSpan(tracer, `${messagingSystem}.${destination} receive`, {
    kind: SpanKind.CONSUMER,
    attributes: {
      [TracingAttributes.MESSAGING_SYSTEM]: messagingSystem,
      [TracingAttributes.MESSAGING_DESTINATION]: destination,
      [TracingAttributes.MESSAGING_OPERATION]: 'receive',
      ...(messageId && { [TracingAttributes.MESSAGING_MESSAGE_ID]: messageId }),
    },
    ...options,
  });
}

/**
 * Create a span for message producers (triggering tasks, sending webhooks)
 */
export function createProducerSpan(
  tracer: Tracer,
  messagingSystem: string,
  destination: string,
  messageId?: string,
  options: CreateSpanOptions = {}
): Span {
  return createSpan(tracer, `${messagingSystem}.${destination} send`, {
    kind: SpanKind.PRODUCER,
    attributes: {
      [TracingAttributes.MESSAGING_SYSTEM]: messagingSystem,
      [TracingAttributes.MESSAGING_DESTINATION]: destination,
      [TracingAttributes.MESSAGING_OPERATION]: 'send',
      ...(messageId && { [TracingAttributes.MESSAGING_MESSAGE_ID]: messageId }),
    },
    ...options,
  });
}

// =============================================================================
// Instrumentation Wrappers
// =============================================================================

/**
 * Options for instrumenting async functions
 */
export interface InstrumentOptions {
  tracer?: Tracer;
  tracerName?: string;
  spanName?: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  correlationId?: string;
}

/**
 * Wrap an async function with tracing instrumentation
 *
 * @example
 * ```typescript
 * const tracedFetch = instrument(
 *   async (leadId: string) => fetchLead(leadId),
 *   { tracerName: 'lead-service', spanName: 'fetchLead' }
 * );
 * ```
 */
export function instrument<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: InstrumentOptions
): (...args: TArgs) => Promise<TResult> {
  const {
    tracer: providedTracer,
    tracerName = 'medicalcor',
    spanName = fn.name || 'anonymous',
    kind = SpanKind.INTERNAL,
    attributes = {},
    correlationId,
  } = options;

  return async (...args: TArgs): Promise<TResult> => {
    const tracer = providedTracer ?? getTracer(tracerName);

    return withSpan(
      tracer,
      spanName,
      async (span) => {
        span.setAttributes(attributes);
        return fn(...args);
      },
      { kind, correlationId }
    );
  };
}

/**
 * Decorator for tracing class methods
 *
 * @example
 * ```typescript
 * class LeadService {
 *   @TracedMethod('lead-service')
 *   async scoreLead(leadId: string): Promise<number> {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function TracedMethod(tracerName: string, spanName?: string) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const name = spanName ?? propertyKey;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      const tracer = getTracer(tracerName);
      return withSpan(tracer, name, async () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

// =============================================================================
// Redis Instrumentation
// =============================================================================

/**
 * Instrumented Redis command wrapper
 * Provides tracing for Redis operations
 *
 * @example
 * ```typescript
 * const result = await instrumentRedisCommand(
 *   redis,
 *   'GET',
 *   'user:123',
 *   () => redis.get('user:123')
 * );
 * ```
 */
export async function instrumentRedisCommand<T>(
  command: string,
  key: string | undefined,
  operation: () => Promise<T>,
  options: { tracer?: Tracer; correlationId?: string } = {}
): Promise<T> {
  const tracer = options.tracer ?? getTracer('redis');
  const span = createRedisSpan(tracer, command, key, {
    correlationId: options.correlationId,
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), operation);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create an instrumented Redis client wrapper
 * Wraps common Redis operations with tracing
 */
export function createInstrumentedRedisWrapper<T extends object>(
  client: T,
  options: { tracerName?: string } = {}
): T {
  const tracer = getTracer(options.tracerName ?? 'redis');

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Only wrap functions
      if (typeof value !== 'function') {
        return value;
      }

      // Skip internal methods
      const propStr = String(prop);
      if (propStr.startsWith('_') || propStr === 'constructor') {
        return value;
      }

      // Wrap the method with tracing
      return async function (...args: unknown[]) {
        const command = propStr.toUpperCase();
        const key = typeof args[0] === 'string' ? args[0] : undefined;
        const span = createRedisSpan(tracer, command, key);

        try {
          const result = await context.with(trace.setSpan(context.active(), span), () =>
            (value as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          );
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          recordSpanError(span, error);
          throw error;
        } finally {
          span.end();
        }
      };
    },
  });
}

// =============================================================================
// Webhook Tracing Helpers
// =============================================================================

/**
 * Create trace context for webhook-triggered tasks
 * Includes both W3C trace context and correlation ID
 *
 * @example
 * ```typescript
 * const traceContext = createWebhookTraceContext(correlationId);
 * await tasks.trigger('handler', { ...payload, ...traceContext });
 * ```
 */
export function createWebhookTraceContext(
  correlationId?: string
): TraceContextCarrier & { correlationId?: string } {
  const carrier: TraceContextCarrier = {};
  injectTraceContext(carrier);

  return {
    ...carrier,
    ...(correlationId && { correlationId }),
    ...(correlationId && { 'x-correlation-id': correlationId }),
  };
}

/**
 * Start a webhook handler span
 * Extracts parent context from carrier and creates a consumer span
 */
export function startWebhookSpan(
  tracer: Tracer,
  webhookType: string,
  carrier: TraceContextCarrier,
  attributes?: Record<string, string | number | boolean>
): { span: Span; context: Context } {
  const parentContext = extractTraceContext(carrier);
  const span = tracer.startSpan(
    `webhook.${webhookType}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        [TracingAttributes.MESSAGING_SYSTEM]: 'webhook',
        [TracingAttributes.MESSAGING_DESTINATION]: webhookType,
        [TracingAttributes.MESSAGING_OPERATION]: 'receive',
        ...attributes,
      },
    },
    parentContext
  );

  const newContext = trace.setSpan(parentContext, span);
  return { span, context: newContext };
}

/**
 * Start a task handler span
 * Continues the trace from the task payload
 */
export function startTaskSpan(
  tracer: Tracer,
  taskName: string,
  payload: TraceContextCarrier & { correlationId?: string },
  attributes?: Record<string, string | number | boolean>
): { span: Span; context: Context } {
  const parentContext = extractTraceContext(payload);
  const span = tracer.startSpan(
    `task.${taskName}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        [TracingAttributes.MEDICALCOR_TASK_NAME]: taskName,
        ...(payload.correlationId && {
          [TracingAttributes.MEDICALCOR_CORRELATION_ID]: payload.correlationId,
        }),
        ...attributes,
      },
    },
    parentContext
  );

  const newContext = trace.setSpan(parentContext, span);
  return { span, context: newContext };
}

// =============================================================================
// Exports
// =============================================================================

export { SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span, Tracer, SpanOptions, Context } from '@opentelemetry/api';
