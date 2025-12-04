/**
 * OpenTelemetry Instrumentation for Trigger.dev
 *
 * Provides distributed tracing for Trigger.dev tasks and workflows.
 * Trace context is propagated from the API via task payloads.
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer, Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const propagator = new W3CTraceContextPropagator();

/**
 * Trace context carrier interface
 * Used to propagate trace context in task payloads
 */
export interface TraceContext {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Extract trace context from a carrier object (task payload)
 */
export function extractTraceContext(carrier: TraceContext): Context {
  return propagator.extract(context.active(), carrier, {
    get: (_carrier, key) => {
      const typedCarrier = _carrier as TraceContext;
      return typedCarrier[key as keyof TraceContext];
    },
    keys: (_carrier) => {
      const typedCarrier = _carrier as TraceContext;
      return Object.keys(typedCarrier) as (keyof TraceContext)[];
    },
  });
}

/**
 * Inject trace context into a carrier object
 * Use this when triggering tasks from the API
 */
export function injectTraceContext(carrier: TraceContext = {}): TraceContext {
  propagator.inject(context.active(), carrier, {
    set: (_carrier, key, value) => {
      const typedCarrier = _carrier as TraceContext;
      if (key === 'traceparent' || key === 'tracestate') {
        typedCarrier[key] = value;
      }
    },
  });
  return carrier;
}

/**
 * Get a tracer for Trigger.dev tasks
 */
export function getTriggerTracer(taskName?: string): Tracer {
  return trace.getTracer(`trigger.${taskName ?? 'default'}`, '0.1.0');
}

/**
 * Execute a task function within a traced span
 * Automatically extracts trace context from the payload if available
 */
export async function withTaskSpan<T>(
  taskName: string,
  payload: TraceContext,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = getTriggerTracer(taskName);
  const parentContext = extractTraceContext(payload);

  return context.with(parentContext, async () => {
    const span = tracer.startSpan(
      `trigger.task.${taskName}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'trigger.task.name': taskName,
          'trigger.task.type': 'task',
        },
      },
      parentContext
    );

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Execute a workflow step within a traced span
 */
export async function withWorkflowSpan<T>(
  workflowName: string,
  stepName: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span
): Promise<T> {
  const tracer = getTriggerTracer(workflowName);

  const parentContext = parentSpan
    ? trace.setSpan(context.active(), parentSpan)
    : context.active();

  const span = tracer.startSpan(
    `trigger.workflow.${workflowName}.${stepName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'trigger.workflow.name': workflowName,
        'trigger.workflow.step': stepName,
      },
    },
    parentContext
  );

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
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
  attributes: Record<string, string | number | boolean>
): void {
  span.setAttributes(attributes);
}

/**
 * MedicalCor-specific span attributes for Trigger tasks
 */
export const TriggerSpanAttributes = {
  // Lead attributes
  LEAD_PHONE: 'medicalcor.lead.phone',
  LEAD_CLASSIFICATION: 'medicalcor.lead.classification',
  LEAD_SCORE: 'medicalcor.lead.score',

  // Task attributes
  TASK_RUN_ID: 'trigger.task.run_id',
  TASK_ATTEMPT: 'trigger.task.attempt',
  TASK_QUEUE: 'trigger.task.queue',

  // Workflow attributes
  WORKFLOW_RUN_ID: 'trigger.workflow.run_id',
  WORKFLOW_STEP_INDEX: 'trigger.workflow.step_index',

  // Integration attributes
  HUBSPOT_CONTACT_ID: 'medicalcor.hubspot.contact_id',
  WHATSAPP_MESSAGE_ID: 'medicalcor.whatsapp.message_id',

  // Correlation
  CORRELATION_ID: 'medicalcor.correlation_id',
} as const;

export { SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span, Tracer, Context } from '@opentelemetry/api';
