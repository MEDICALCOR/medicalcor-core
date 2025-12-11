/**
 * OpenTelemetry Instrumentation for Trigger.dev
 *
 * Provides distributed tracing for Trigger.dev tasks and workflows.
 * Trace context is propagated from the API via task payloads.
 *
 * DISTRIBUTED TRACING IMPLEMENTATION:
 * - Continues traces from API webhooks
 * - Tracks task execution with P95 latency metrics
 * - Error traces immediately queryable
 * - Workflow step tracking
 */

import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  propagation,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import type { Span, Tracer, Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import {
  W3CTraceContextPropagator,
  CompositePropagator,
  W3CBaggagePropagator,
} from '@opentelemetry/core';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

// =============================================================================
// SDK Initialization for Trigger.dev Worker
// =============================================================================

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'medicalcor-trigger';
const serviceVersion = process.env.npm_package_version ?? '0.1.0';
const environment = process.env.NODE_ENV ?? 'development';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const isDisabled = process.env.OTEL_ENABLED === 'false';
const debugMode = process.env.OTEL_DEBUG === 'true';

let sdk: NodeSDK | null = null;

if (!isDisabled) {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.namespace': 'medicalcor',
    'service.instance.id': process.env.HOSTNAME ?? `${serviceName}-${process.pid}`,
  });

  const exporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  const spanProcessor = debugMode
    ? new SimpleSpanProcessor(exporter as any)
    : new BatchSpanProcessor(exporter as any, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
        maxQueueSize: 2048,
      });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  sdk = new NodeSDK({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    resource: resource as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    spanProcessor: spanProcessor as any,
    textMapPropagator: propagator,
  });

  sdk.start();
  console.info(`[OpenTelemetry] Trigger.dev worker initialized: ${serviceName} -> ${otlpEndpoint}`);

  // Graceful shutdown
  const shutdown = async () => {
    if (sdk) {
      try {
        await sdk.shutdown();
        console.info('[OpenTelemetry] Trigger.dev worker shutdown complete');
      } catch (error) {
        console.error('[OpenTelemetry] Shutdown error:', error);
      }
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// =============================================================================
// Trace Context Propagation
// =============================================================================

/**
 * Trace context carrier interface
 * Used to propagate trace context in task payloads
 */
export interface TraceContext {
  traceparent?: string;
  tracestate?: string;
  correlationId?: string;
  'x-correlation-id'?: string;
}

const textMapGetter: TextMapGetter<TraceContext> = {
  get(carrier, key) {
    return carrier[key as keyof TraceContext];
  },
  keys(carrier) {
    return Object.keys(carrier) as (keyof TraceContext)[];
  },
};

const textMapSetter: TextMapSetter<TraceContext> = {
  set(carrier, key, value) {
    carrier[key as keyof TraceContext] = value;
  },
};

/**
 * Extract trace context from a carrier object (task payload)
 */
export function extractTraceContext(carrier: TraceContext): Context {
  return propagation.extract(ROOT_CONTEXT, carrier, textMapGetter);
}

/**
 * Inject trace context into a carrier object
 * Use this when triggering tasks from the API
 */
export function injectTraceContext(carrier: TraceContext = {}): TraceContext {
  propagation.inject(context.active(), carrier, textMapSetter);
  return carrier;
}

/**
 * Get current trace ID
 */
export function getCurrentTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

/**
 * Get current span ID
 */
export function getCurrentSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}

// =============================================================================
// Tracer Management
// =============================================================================

const tracerCache = new Map<string, Tracer>();

/**
 * Get a tracer for Trigger.dev tasks
 */
export function getTriggerTracer(taskName?: string): Tracer {
  const name = `trigger.${taskName ?? 'default'}`;
  let tracer = tracerCache.get(name);
  if (!tracer) {
    tracer = trace.getTracer(name, serviceVersion);
    tracerCache.set(name, tracer);
  }
  return tracer;
}

// =============================================================================
// Task Span Helpers
// =============================================================================

/**
 * Execute a task function within a traced span
 * Automatically extracts trace context from the payload if available
 *
 * @example
 * ```typescript
 * export const myTask = task({
 *   id: 'my-task',
 *   run: async (payload) => {
 *     return withTaskSpan('my-task', payload, async (span) => {
 *       span.setAttribute('custom.attribute', 'value');
 *       // Task logic here
 *     });
 *   },
 * });
 * ```
 */
export async function withTaskSpan<T>(
  taskName: string,
  payload: TraceContext & Record<string, unknown>,
  fn: (span: Span) => Promise<T>,
  options: {
    taskRunId?: string;
    attempt?: number;
    queue?: string;
  } = {}
): Promise<T> {
  const tracer = getTriggerTracer(taskName);
  const parentContext = extractTraceContext(payload);

  // Extract correlation ID from payload
  const correlationId = payload.correlationId ?? payload['x-correlation-id'];

  return context.with(parentContext, async () => {
    const span = tracer.startSpan(
      `trigger.task.${taskName}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          [TriggerSpanAttributes.TASK_NAME]: taskName,
          'trigger.task.type': 'task',
          ...(correlationId && { [TriggerSpanAttributes.CORRELATION_ID]: correlationId }),
          ...(options.taskRunId && { [TriggerSpanAttributes.TASK_RUN_ID]: options.taskRunId }),
          ...(options.attempt && { [TriggerSpanAttributes.TASK_ATTEMPT]: options.attempt }),
          ...(options.queue && { [TriggerSpanAttributes.TASK_QUEUE]: options.queue }),
        },
      },
      parentContext
    );

    const startTime = Date.now();

    try {
      const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('task.duration_ms', Date.now() - startTime);
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setAttribute('task.duration_ms', Date.now() - startTime);
      span.setAttribute('error', true);
      span.setAttribute('error.type', error instanceof Error ? error.name : 'Unknown');
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Execute a workflow step within a traced span
 *
 * @example
 * ```typescript
 * await withWorkflowSpan('lead-scoring', 'fetch-data', async (span) => {
 *   span.setAttribute('lead.id', leadId);
 *   return await fetchLeadData(leadId);
 * }, parentSpan);
 * ```
 */
export async function withWorkflowSpan<T>(
  workflowName: string,
  stepName: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span,
  options: {
    stepIndex?: number;
    workflowRunId?: string;
  } = {}
): Promise<T> {
  const tracer = getTriggerTracer(workflowName);
  const parentContext = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();

  const span = tracer.startSpan(
    `trigger.workflow.${workflowName}.${stepName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        [TriggerSpanAttributes.WORKFLOW_NAME]: workflowName,
        [TriggerSpanAttributes.WORKFLOW_STEP]: stepName,
        ...(options.stepIndex !== undefined && {
          [TriggerSpanAttributes.WORKFLOW_STEP_INDEX]: options.stepIndex,
        }),
        ...(options.workflowRunId && {
          [TriggerSpanAttributes.WORKFLOW_RUN_ID]: options.workflowRunId,
        }),
      },
    },
    parentContext
  );

  const startTime = Date.now();

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute('step.duration_ms', Date.now() - startTime);
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    span.setAttribute('step.duration_ms', Date.now() - startTime);
    span.setAttribute('error', true);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add domain-specific attributes to the current span
 */
export function addTriggerAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean | undefined>
): void {
  const filteredAttributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      filteredAttributes[key] = value;
    }
  }
  span.setAttributes(filteredAttributes);
}

/**
 * Record an error on a span
 */
export function recordTaskError(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.setAttribute('error', true);
  span.setAttribute('error.type', err.name);
  span.setAttribute('error.message', err.message);
}

/**
 * Add an event to a span
 */
export function addTaskEvent(
  span: Span,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  span.addEvent(name, attributes);
}

// =============================================================================
// Span Attributes Constants
// =============================================================================

/**
 * MedicalCor-specific span attributes for Trigger tasks
 */
export const TriggerSpanAttributes = {
  // Task attributes
  TASK_NAME: 'trigger.task.name',
  TASK_RUN_ID: 'trigger.task.run_id',
  TASK_ATTEMPT: 'trigger.task.attempt',
  TASK_QUEUE: 'trigger.task.queue',

  // Workflow attributes
  WORKFLOW_NAME: 'trigger.workflow.name',
  WORKFLOW_STEP: 'trigger.workflow.step',
  WORKFLOW_RUN_ID: 'trigger.workflow.run_id',
  WORKFLOW_STEP_INDEX: 'trigger.workflow.step_index',

  // Lead attributes
  LEAD_ID: 'medicalcor.lead.id',
  LEAD_PHONE: 'medicalcor.lead.phone',
  LEAD_CLASSIFICATION: 'medicalcor.lead.classification',
  LEAD_SCORE: 'medicalcor.lead.score',
  LEAD_CHANNEL: 'medicalcor.lead.channel',

  // Patient attributes
  PATIENT_ID: 'medicalcor.patient.id',

  // Integration attributes
  HUBSPOT_CONTACT_ID: 'medicalcor.hubspot.contact_id',
  HUBSPOT_OPERATION: 'medicalcor.hubspot.operation',
  WHATSAPP_MESSAGE_ID: 'medicalcor.whatsapp.message_id',
  WHATSAPP_PHONE_NUMBER_ID: 'medicalcor.whatsapp.phone_number_id',
  OPENAI_MODEL: 'medicalcor.openai.model',
  OPENAI_TOKENS_INPUT: 'medicalcor.openai.tokens.input',
  OPENAI_TOKENS_OUTPUT: 'medicalcor.openai.tokens.output',

  // Correlation
  CORRELATION_ID: 'medicalcor.correlation_id',
  IDEMPOTENCY_KEY: 'medicalcor.idempotency_key',
} as const;

// =============================================================================
// Exports
// =============================================================================

export { SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span, Tracer, Context } from '@opentelemetry/api';
