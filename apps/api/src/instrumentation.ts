/**
 * OpenTelemetry Instrumentation Entry Point
 *
 * This file must be loaded BEFORE any other imports to ensure
 * proper instrumentation of all libraries (http, pg, redis, etc.)
 *
 * Load via: node --import ./dist/instrumentation.js ./dist/index.js
 * Or in development: NODE_OPTIONS='--import ./src/instrumentation.ts' pnpm dev
 *
 * DISTRIBUTED TRACING IMPLEMENTATION:
 * - End-to-end trace visibility from webhook to response
 * - P95 latency visible per operation
 * - Error traces immediately queryable
 * - Supports Jaeger/OTLP export
 */

// Note: initTelemetry/shutdownTelemetry from @medicalcor/core/telemetry are for manual setup
// This file uses OpenTelemetry NodeSDK directly for auto-instrumentation
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  W3CTraceContextPropagator,
  CompositePropagator,
  W3CBaggagePropagator,
} from '@opentelemetry/core';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

// =============================================================================
// Configuration
// =============================================================================

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'medicalcor-api';
const serviceVersion = process.env.npm_package_version ?? '0.1.0';
const environment = process.env.NODE_ENV ?? 'development';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const isDisabled = process.env.OTEL_ENABLED === 'false';

// Performance configuration
const batchExportConfig = {
  // Maximum batch size before forcing export
  maxExportBatchSize: parseInt(process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE ?? '512', 10),
  // Maximum time to wait before exporting (ms)
  scheduledDelayMillis: parseInt(process.env.OTEL_BSP_SCHEDULE_DELAY_MILLIS ?? '5000', 10),
  // Maximum time to wait for export (ms)
  exportTimeoutMillis: parseInt(process.env.OTEL_BSP_EXPORT_TIMEOUT_MILLIS ?? '30000', 10),
  // Maximum queue size before dropping spans
  maxQueueSize: parseInt(process.env.OTEL_BSP_MAX_QUEUE_SIZE ?? '2048', 10),
};

// Debug mode for development
const debugMode = process.env.OTEL_DEBUG === 'true';

// =============================================================================
// SDK Initialization
// =============================================================================

if (!isDisabled) {
  // Create resource with comprehensive attributes
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.namespace': 'medicalcor',
    'service.instance.id': process.env.HOSTNAME ?? `${serviceName}-${process.pid}`,
  });

  // Create OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? (JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) as Record<string, string>)
      : undefined,
  });

  // Use BatchSpanProcessor for production, SimpleSpanProcessor for debug
  // Note: Type assertions needed due to OpenTelemetry version mismatches between packages
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  const spanProcessor = debugMode
    ? new SimpleSpanProcessor(exporter as any)
    : new BatchSpanProcessor(exporter as any, batchExportConfig);
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

  // Composite propagator for trace context and baggage
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  const sdk = new NodeSDK({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    resource: resource as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    spanProcessor: spanProcessor as any,
    textMapPropagator: propagator,
    instrumentations: [
      getNodeAutoInstrumentations({
        // =================================================================
        // Disabled instrumentations (too noisy or not needed)
        // =================================================================
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },

        // =================================================================
        // HTTP Instrumentation (incoming requests)
        // =================================================================
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => {
            const url = request.url ?? '';
            // Ignore health checks and metrics endpoints
            return (
              url.includes('/health') ||
              url.includes('/live') ||
              url.includes('/ready') ||
              url.includes('/metrics')
            );
          },
          // Add custom attributes to HTTP spans
          requestHook: (span, request) => {
            // Type guard for IncomingMessage (has headers)
            if ('headers' in request && request.headers) {
              // Add correlation ID if present
              const correlationId = request.headers['x-correlation-id'];
              if (typeof correlationId === 'string') {
                span.setAttribute('medicalcor.correlation_id', correlationId);
              }
              // Add client IP for audit
              const forwardedFor = request.headers['x-forwarded-for'];
              const clientIp =
                (typeof forwardedFor === 'string' ? forwardedFor : undefined) ??
                request.socket?.remoteAddress;
              if (typeof clientIp === 'string') {
                span.setAttribute('http.client_ip', clientIp.split(',')[0]?.trim() ?? clientIp);
              }
            }
          },
        },

        // =================================================================
        // Fastify Instrumentation
        // =================================================================
        '@opentelemetry/instrumentation-fastify': {
          enabled: true,
          // Capture request and response hooks
          requestHook: (span, info) => {
            // Type assertion needed as Fastify request types vary
            const request = info.request as { routeOptions?: { url?: string } };
            // Add route information
            if (request.routeOptions?.url) {
              span.setAttribute('http.route', request.routeOptions.url);
            }
          },
        },

        // =================================================================
        // PostgreSQL Instrumentation
        // =================================================================
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
          // Include query text for debugging (truncated for safety)
          enhancedDatabaseReporting: true,
          // Add response hook for row count
          responseHook: (span, responseInfo) => {
            const rowCount = responseInfo.data?.rowCount;
            if (rowCount !== undefined && rowCount !== null) {
              span.setAttribute('db.rows_affected', rowCount);
            }
          },
        },

        // =================================================================
        // Redis/IORedis Instrumentation
        // =================================================================
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
          // Include command arguments for debugging
          dbStatementSerializer: (cmdName, cmdArgs) => {
            // Redact sensitive keys (tokens, secrets)
            const redactedArgs = cmdArgs.map((arg, index) => {
              if (typeof arg !== 'string') return String(arg);
              // Redact values for sensitive commands
              if (['SET', 'SETEX', 'SETNX', 'HSET', 'HMSET'].includes(cmdName) && index > 0) {
                return arg.length > 50 ? '[REDACTED]' : arg;
              }
              return arg;
            });
            return `${cmdName} ${redactedArgs.join(' ')}`.slice(0, 200);
          },
          // Response hook for cache metrics
          responseHook: (span, cmdName, _cmdArgs, response) => {
            // Track cache hits/misses for GET commands
            if (cmdName === 'GET') {
              span.setAttribute('redis.cache_hit', response !== null);
            }
            // Track deleted key count
            if (cmdName === 'DEL' && typeof response === 'number') {
              span.setAttribute('redis.keys_affected', response);
            }
          },
        },

        // =================================================================
        // gRPC Instrumentation (for future use)
        // =================================================================
        '@opentelemetry/instrumentation-grpc': { enabled: false },

        // =================================================================
        // Express Instrumentation (disabled, using Fastify)
        // =================================================================
        '@opentelemetry/instrumentation-express': { enabled: false },
      }),
    ],
  });

  sdk.start();

  console.info(
    `[OpenTelemetry] Initialized for ${serviceName}@${serviceVersion} (${environment}) -> ${otlpEndpoint}`
  );
  if (debugMode) {
    console.info('[OpenTelemetry] Debug mode enabled - using SimpleSpanProcessor');
  }

  // Graceful shutdown handler
  const shutdown = async () => {
    try {
      console.info('[OpenTelemetry] Shutting down...');
      await sdk.shutdown();
      console.info('[OpenTelemetry] SDK shut down successfully');
    } catch (error) {
      console.error('[OpenTelemetry] Error shutting down SDK:', error);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('beforeExit', shutdown);
} else {
  console.info('[OpenTelemetry] Disabled via OTEL_ENABLED=false');
}

// =============================================================================
// Re-exports
// =============================================================================

// Re-export telemetry utilities for consumers
// Note: Direct import from telemetry submodule to avoid Edge Runtime issues
export { initTelemetry, shutdownTelemetry } from '@medicalcor/core/telemetry';

// Re-export tracing utilities
export {
  extractTraceContext,
  injectTraceContext,
  createWebhookTraceContext,
  getTracer,
  withSpan,
  TracingAttributes,
  type TraceContextCarrier,
} from '@medicalcor/core/observability/tracing';
