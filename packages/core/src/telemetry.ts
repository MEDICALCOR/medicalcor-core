/**
 * OpenTelemetry Tracing Configuration
 *
 * Provides distributed tracing across the MedicalCor platform:
 * - API requests
 * - Trigger.dev tasks
 * - External service calls (HubSpot, WhatsApp, OpenAI)
 *
 * Configuration via environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint (default: http://localhost:4318)
 * - OTEL_SERVICE_NAME: Service name for traces
 * - OTEL_ENABLED: Enable/disable tracing (default: true in production)
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer, SpanOptions, Context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

import { createLogger } from './logger/index.js';

const logger = createLogger({ serviceName: 'telemetry' });

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  /** Service name for traces */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment (production, staging, development) */
  environment?: string;
  /** OTLP endpoint */
  otlpEndpoint?: string;
  /** Enable console exporter for debugging */
  debug?: boolean;
  /** Disable telemetry completely */
  disabled?: boolean;
}

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry SDK
 * Should be called once at application startup
 */
export function initTelemetry(config: TelemetryConfig): void {
  if (isInitialized) {
    logger.warn('Telemetry already initialized');
    return;
  }

  const {
    serviceName,
    serviceVersion = '0.1.0',
    environment = process.env.NODE_ENV ?? 'development',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    debug = false,
    disabled = process.env.OTEL_ENABLED === 'false',
  } = config;

  if (disabled) {
    logger.info('Telemetry disabled');
    isInitialized = true;
    return;
  }

  try {
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    });

    // Configure OTLP exporter
    const otlpExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    });

    // Use console exporter for debugging, OTLP for production
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exporter = debug ? new ConsoleSpanExporter() : otlpExporter;

    sdk = new NodeSDK({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      resource: resource as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      traceExporter: exporter as any,
    });

    sdk.start();
    isInitialized = true;

    logger.info({ serviceName, environment, otlpEndpoint, debug }, 'Telemetry initialized');

    // Graceful shutdown
    process.on('SIGTERM', () => {
      shutdownTelemetry().catch((err: unknown) => {
        logger.error({ err }, 'Error shutting down telemetry');
      });
    });
  } catch (error) {
    logger.error({ error }, 'Failed to initialize telemetry');
  }
}

/**
 * Shutdown telemetry SDK
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('Telemetry shut down');
  }
}

/**
 * Get a tracer for a specific component
 */
export function getTracer(name: string, version = '0.1.0'): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Span attributes for MedicalCor domain
 */
export const SpanAttributes = {
  // Lead attributes
  LEAD_PHONE: 'medicalcor.lead.phone',
  LEAD_CLASSIFICATION: 'medicalcor.lead.classification',
  LEAD_SCORE: 'medicalcor.lead.score',
  LEAD_CHANNEL: 'medicalcor.lead.channel',

  // HubSpot attributes
  HUBSPOT_CONTACT_ID: 'medicalcor.hubspot.contact_id',
  HUBSPOT_OPERATION: 'medicalcor.hubspot.operation',

  // WhatsApp attributes
  WHATSAPP_MESSAGE_ID: 'medicalcor.whatsapp.message_id',
  WHATSAPP_TEMPLATE: 'medicalcor.whatsapp.template',
  WHATSAPP_PHONE_NUMBER_ID: 'medicalcor.whatsapp.phone_number_id',

  // Workflow attributes
  WORKFLOW_ID: 'medicalcor.workflow.id',
  WORKFLOW_TASK_ID: 'medicalcor.workflow.task_id',
  WORKFLOW_STATUS: 'medicalcor.workflow.status',

  // Correlation
  CORRELATION_ID: 'medicalcor.correlation_id',
} as const;

/**
 * Create a span with common MedicalCor attributes
 */
export function createSpan(
  tracer: Tracer,
  name: string,
  options: SpanOptions & { correlationId?: string } = {}
): Span {
  const { correlationId, ...spanOptions } = options;
  const span = tracer.startSpan(name, spanOptions);

  if (correlationId) {
    span.setAttribute(SpanAttributes.CORRELATION_ID, correlationId);
  }

  return span;
}

/**
 * Execute a function within a span context
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  options: SpanOptions & { correlationId?: string } = {}
): Promise<T> {
  const span = createSpan(tracer, name, options);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });
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
 * Execute a sync function within a span context
 */
export function withSpanSync<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => T,
  options: SpanOptions & { correlationId?: string } = {}
): T {
  const span = createSpan(tracer, name, options);

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => {
      return fn(span);
    });
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
 * Get the current active span
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get the current context
 */
export function getCurrentContext(): Context {
  return context.active();
}

/**
 * Add attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an exception on the current span
 */
export function recordException(error: Error, attributes?: Record<string, string>): void {
  const span = getCurrentSpan();
  if (span) {
    span.recordException(error);
    if (attributes) {
      span.setAttributes(attributes);
    }
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

/**
 * Create a traced wrapper for external service calls
 */
export function traceExternalCall<TArgs extends unknown[], TResult>(
  tracer: Tracer,
  serviceName: string,
  operation: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withSpan(
      tracer,
      `${serviceName}.${operation}`,
      async (span) => {
        span.setAttribute('external.service', serviceName);
        span.setAttribute('external.operation', operation);
        return fn(...args);
      },
      { kind: SpanKind.CLIENT }
    );
  };
}

/**
 * Decorator for tracing class methods
 */
export function Traced(spanName?: string) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const name = spanName ?? propertyKey;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      const tracer = getTracer('medicalcor');
      return withSpan(tracer, name, async () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

// Re-export OpenTelemetry types
export { SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span, Tracer, SpanOptions, Context } from '@opentelemetry/api';
