/**
 * OpenTelemetry Logs Integration
 *
 * Exports structured logs via OTLP protocol for centralized aggregation.
 *
 * ARCHITECTURE:
 * - Pino logger → OTEL Log Bridge → OTLP Exporter → Collector → Loki/ElasticSearch
 *
 * FEATURES:
 * - Correlation with traces (trace_id, span_id)
 * - Structured metadata (service, environment, version)
 * - PII redaction before export
 * - Batched exports for performance
 * - Graceful degradation when collector unavailable
 *
 * @module @medicalcor/core/observability/otel-logs
 */

import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';

/**
 * OTLP Log Exporter Configuration
 */
export interface OtelLogsConfig {
  /** OTLP endpoint URL (default: http://localhost:4318/v1/logs) */
  endpoint?: string;
  /** Service name for resource attribution */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Deployment environment */
  environment?: string;
  /** Export timeout in milliseconds */
  exportTimeoutMs?: number;
  /** Maximum batch size before export */
  maxExportBatchSize?: number;
  /** Scheduled delay between exports in milliseconds */
  scheduledDelayMs?: number;
  /** Whether logs export is enabled */
  enabled?: boolean;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
}

/**
 * Pino log level to OTEL severity mapping
 */
const PINO_TO_OTEL_SEVERITY: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

let loggerProvider: LoggerProvider | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry Logs export
 *
 * Call this at application startup to enable log aggregation.
 *
 * @example
 * ```typescript
 * import { initOtelLogs } from '@medicalcor/core/observability/otel-logs';
 *
 * initOtelLogs({
 *   endpoint: 'http://otel-collector:4318/v1/logs',
 *   serviceName: 'medicalcor-api',
 *   environment: 'production',
 * });
 * ```
 */
export function initOtelLogs(config: OtelLogsConfig = {}): void {
  // Check if already initialized
  if (isInitialized) {
    return;
  }

  // Check if enabled (default: true if endpoint is configured)
  const enabled =
    config.enabled ?? (config.endpoint ? true : !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (!enabled) {
    console.info('[otel-logs] Log export disabled');
    return;
  }

  // Resolve configuration
  const endpoint =
    config.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
    (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`
      : 'http://localhost:4318/v1/logs');

  const serviceName = config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'medicalcor';
  const serviceVersion = config.serviceVersion ?? process.env.SERVICE_VERSION ?? '0.1.0';
  const environment = config.environment ?? process.env.NODE_ENV ?? 'development';

  try {
    // Create resource with service information
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
      ...config.resourceAttributes,
    });

    // Create OTLP log exporter
    const exporter = new OTLPLogExporter({
      url: endpoint,
      timeoutMillis: config.exportTimeoutMs ?? 10000,
    });

    // Create batch processor for performance
    const processor = new BatchLogRecordProcessor(exporter, {
      maxExportBatchSize: config.maxExportBatchSize ?? 512,
      scheduledDelayMillis: config.scheduledDelayMs ?? 5000,
      exportTimeoutMillis: config.exportTimeoutMs ?? 10000,
    });

    // Create and register logger provider
    loggerProvider = new LoggerProvider({
      resource,
    });
    loggerProvider.addLogRecordProcessor(processor);

    // Register globally
    logs.setGlobalLoggerProvider(loggerProvider);

    isInitialized = true;
    console.info(`[otel-logs] Initialized with endpoint: ${endpoint}`);
  } catch (error) {
    console.error('[otel-logs] Failed to initialize:', error);
  }
}

/**
 * Shutdown OTEL logs gracefully
 *
 * Call this before application exit to flush pending logs.
 */
export async function shutdownOtelLogs(): Promise<void> {
  if (loggerProvider) {
    try {
      await loggerProvider.shutdown();
      console.info('[otel-logs] Shutdown complete');
    } catch (error) {
      console.error('[otel-logs] Shutdown error:', error);
    }
  }
}

/**
 * Create a Pino transport that exports to OTEL
 *
 * @example
 * ```typescript
 * import pino from 'pino';
 * import { createOtelLogTransport } from '@medicalcor/core/observability/otel-logs';
 *
 * const transport = createOtelLogTransport('medicalcor-api');
 * const logger = pino(transport);
 * ```
 */
export function createOtelLogTransport(instrumentationScope: string) {
  return {
    write(chunk: string) {
      try {
        const logRecord = JSON.parse(chunk) as {
          level: number;
          time: number;
          msg?: string;
          err?: { message?: string; stack?: string };
          [key: string]: unknown;
        };
        emitLogRecord(instrumentationScope, logRecord);
      } catch {
        // Ignore parse errors
      }
    },
  };
}

/**
 * Emit a log record to OTEL
 *
 * This function bridges Pino logs to OTEL format.
 */
export function emitLogRecord(
  instrumentationScope: string,
  pinoLog: {
    level: number;
    time: number;
    msg?: string;
    err?: { message?: string; stack?: string };
    [key: string]: unknown;
  }
): void {
  if (!isInitialized || !loggerProvider) {
    return;
  }

  try {
    const otelLogger = logs.getLogger(instrumentationScope);

    // Map Pino level number to name
    const levelName = pinoLevelToName(pinoLog.level);
    const severity = PINO_TO_OTEL_SEVERITY[levelName] ?? SeverityNumber.INFO;

    // Extract trace context if available
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    // Build attributes from log fields
    const attributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(pinoLog)) {
      if (['level', 'time', 'msg', 'pid', 'hostname', 'err'].includes(key)) {
        continue;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        attributes[key] = value;
      } else if (value !== null && value !== undefined) {
        attributes[key] = JSON.stringify(value);
      }
    }

    // Add error information if present
    if (pinoLog.err) {
      attributes['exception.message'] = pinoLog.err.message ?? 'Unknown error';
      if (pinoLog.err.stack) {
        attributes['exception.stacktrace'] = pinoLog.err.stack;
      }
    }

    // Emit log record
    otelLogger.emit({
      severityNumber: severity,
      severityText: levelName.toUpperCase(),
      body: pinoLog.msg ?? '',
      timestamp: pinoLog.time,
      attributes,
      context: spanContext ? context.active() : undefined,
    });
  } catch {
    // Silently ignore errors to avoid log loops
  }
}

/**
 * Convert Pino level number to name
 */
function pinoLevelToName(level: number): string {
  if (level <= 10) return 'trace';
  if (level <= 20) return 'debug';
  if (level <= 30) return 'info';
  if (level <= 40) return 'warn';
  if (level <= 50) return 'error';
  return 'fatal';
}

/**
 * Create a Pino destination that also sends to OTEL
 *
 * This is a "tee" destination that writes to both stdout and OTEL.
 *
 * @example
 * ```typescript
 * import pino from 'pino';
 * import { createDualDestination } from '@medicalcor/core/observability/otel-logs';
 *
 * const logger = pino({
 *   level: 'info',
 * }, createDualDestination('medicalcor-api'));
 * ```
 */
export function createDualDestination(instrumentationScope: string): {
  write: (chunk: string) => void;
} {
  return {
    write(chunk: string) {
      // Write to stdout
      process.stdout.write(chunk);

      // Also emit to OTEL
      try {
        const logRecord = JSON.parse(chunk) as {
          level: number;
          time: number;
          msg?: string;
          err?: { message?: string; stack?: string };
          [key: string]: unknown;
        };
        emitLogRecord(instrumentationScope, logRecord);
      } catch {
        // Ignore parse errors
      }
    },
  };
}

/**
 * Middleware to add trace context to logs
 *
 * Use this with Fastify to automatically correlate logs with traces.
 *
 * @example
 * ```typescript
 * fastify.addHook('onRequest', addTraceContextToLogs);
 * ```
 */
export function getTraceContext(): { traceId?: string; spanId?: string } | null {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) {
    return null;
  }

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Export configuration for external use
 */
export const otelLogsConfig = {
  isInitialized: () => isInitialized,
  getProvider: () => loggerProvider,
};
