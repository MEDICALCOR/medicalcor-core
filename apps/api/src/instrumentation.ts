/**
 * OpenTelemetry Instrumentation Entry Point
 *
 * This file must be loaded BEFORE any other imports to ensure
 * proper instrumentation of all libraries (http, pg, etc.)
 *
 * Load via: node --import ./dist/instrumentation.js ./dist/index.js
 * Or in development: NODE_OPTIONS='--import ./src/instrumentation.ts' pnpm dev
 */

// Note: initTelemetry/shutdownTelemetry from @medicalcor/core/telemetry are for manual setup
// This file uses OpenTelemetry NodeSDK directly for auto-instrumentation
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'medicalcor-api';
const serviceVersion = process.env.npm_package_version ?? '0.1.0';
const environment = process.env.NODE_ENV ?? 'development';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const isDisabled = process.env.OTEL_ENABLED === 'false';

if (!isDisabled) {
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  const exporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  // Note: Using type assertion to handle OpenTelemetry version mismatches
  // between different packages in the dependency tree

  const sdk = new NodeSDK({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    resource: resource as any,
    // Note: Type assertion needed due to OpenTelemetry version mismatches between packages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
    spanProcessor: new BatchSpanProcessor(exporter as any) as any,
    textMapPropagator: new W3CTraceContextPropagator(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => {
            // Ignore health checks
            const url = request.url ?? '';
            return url.includes('/health') || url.includes('/live') || url.includes('/ready');
          },
        },
        // Enable Fastify instrumentation
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        // Enable PostgreSQL instrumentation for DB tracing
        '@opentelemetry/instrumentation-pg': { enabled: true },
        // Note: redis-4 instrumentation not available in current config map
      }),
    ],
  });

  sdk.start();

  console.info(`[OpenTelemetry] Initialized for ${serviceName} -> ${otlpEndpoint}`);

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown();

      console.info('[OpenTelemetry] SDK shut down successfully');
    } catch (error) {
      console.error('[OpenTelemetry] Error shutting down SDK:', error);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Re-export telemetry utilities for consumers
export { initTelemetry, shutdownTelemetry } from '@medicalcor/core/telemetry';
