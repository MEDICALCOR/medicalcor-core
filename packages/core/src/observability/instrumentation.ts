/**
 * Auto-Instrumentation utilities
 *
 * Provides automatic tracing and metrics for:
 * - HTTP requests/responses
 * - Database queries
 * - External service calls
 * - Command/Query execution
 *
 * NOTE: Telemetry imports are lazy-loaded to avoid Edge Runtime issues.
 * The instrumentation functions will work in both Edge and Node.js environments.
 */

import type { Tracer, SpanKind } from '../telemetry.js';
import {
  httpRequestsTotal,
  httpRequestDuration,
  externalServiceRequests,
  externalServiceDuration,
} from './metrics.js';
import { createLogger } from '../logger.js';

const logger = createLogger({ name: 'instrumentation' });

// ============================================================================
// LAZY TELEMETRY IMPORTS (Edge Runtime Compatible)
// ============================================================================

/**
 * Lazy-load telemetry functions to avoid Edge Runtime errors
 * These are only loaded when actually called, not at module initialization
 */
import type * as TelemetryModule from '../telemetry.js';

let telemetryModule: typeof TelemetryModule | null = null;

async function getTelemetryModule() {
  telemetryModule ??= await import('../telemetry.js');
  return telemetryModule;
}

/**
 * Get a tracer with lazy loading
 */
async function getTracerLazy(name: string, version?: string): Promise<Tracer> {
  const telemetry = await getTelemetryModule();
  return telemetry.getTracer(name, version);
}

/**
 * Add span attributes with lazy loading
 */
async function addSpanAttributesLazy(
  attributes: Record<string, string | number | boolean>
): Promise<void> {
  const telemetry = await getTelemetryModule();
  return telemetry.addSpanAttributes(attributes);
}

/**
 * Execute within span with lazy loading
 */
async function withSpanLazy<T>(
  tracer: Tracer,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Span type varies across OpenTelemetry versions
  fn: (span: any) => Promise<T>,
  options?: { kind?: SpanKind }
): Promise<T> {
  const telemetry = await getTelemetryModule();
  return telemetry.withSpan(tracer, name, fn, options);
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

export interface RequestContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  startTime: number;
  path: string;
  method: string;
}

// ============================================================================
// HTTP INSTRUMENTATION
// ============================================================================

export interface InstrumentationOptions {
  serviceName?: string | undefined;
  ignorePaths?: string[] | undefined;
  collectRequestBody?: boolean | undefined;
  collectResponseBody?: boolean | undefined;
}

const DEFAULT_OPTIONS: Required<InstrumentationOptions> = {
  serviceName: 'medicalcor-api',
  ignorePaths: ['/health', '/live', '/ready', '/metrics'],
  collectRequestBody: false,
  collectResponseBody: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastifyLike = any;

/**
 * Instrument a Fastify instance with tracing and metrics
 * Uses generic types to avoid requiring Fastify as a dependency
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */
export function instrumentFastify(
  fastify: FastifyLike,
  options: InstrumentationOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Pre-request hook - start timing and create span
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.addHook('onRequest', async (request: any, _reply: any) => {
    // Skip ignored paths
    if (opts.ignorePaths?.some((p: string) => request.url.startsWith(p))) {
      return;
    }

    const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
    const traceId = (request.headers['x-trace-id'] as string) ?? crypto.randomUUID();

    request.observability = {
      correlationId,
      traceId,
      spanId: crypto.randomUUID().slice(0, 16),
      startTime: performance.now(),
      path: request.url.split('?')[0],
      method: request.method,
    };

    // Add tracing attributes (lazy loaded)
    await addSpanAttributesLazy({
      'http.method': request.method,
      'http.url': request.url,
      'http.route': request.routeOptions?.url ?? request.url,
      'http.user_agent': request.headers['user-agent'] ?? '',
      correlation_id: correlationId,
    }).catch((error: unknown) => {
      logger.debug({ error }, 'Telemetry unavailable in Edge Runtime - span attributes not set');
    });
  });

  // Post-response hook - record metrics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.addHook('onResponse', async (request: any, reply: any) => {
    if (!request.observability) return;

    const { method, path, startTime } = request.observability as RequestContext;
    const duration = (performance.now() - startTime) / 1000;
    const status = String(reply.statusCode);

    // Record HTTP metrics
    httpRequestsTotal.inc({ method, path, status });
    httpRequestDuration.observe(duration, { method, path });

    // Add span attributes (lazy loaded)
    await addSpanAttributesLazy({
      'http.status_code': reply.statusCode,
      'http.response_time_ms': duration * 1000,
    }).catch((error: unknown) => {
      logger.debug({ error }, 'Telemetry unavailable in Edge Runtime - response attributes not set');
    });
  });

  // Error hook - record errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.addHook('onError', async (request: any, _reply: any, error: Error) => {
    if (!request.observability) return;

    await addSpanAttributesLazy({
      error: true,
      'error.type': error.name,
      'error.message': error.message,
    }).catch((telemetryError: unknown) => {
      logger.debug({ error: telemetryError }, 'Telemetry unavailable in Edge Runtime - error attributes not set');
    });
  });
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

// ============================================================================
// EXTERNAL SERVICE WRAPPER
// ============================================================================

export interface ExternalCallOptions {
  service: string;
  operation: string;
  timeout?: number;
}

/**
 * Wrap an external service call with tracing and metrics
 */
export function instrumentExternalCall<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: ExternalCallOptions
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const timer = externalServiceDuration.startTimer({
      service: options.service,
      operation: options.operation,
    });

    try {
      // Try to load telemetry for tracing, but continue without it if unavailable
      let result: TResult;

      try {
        const tracer = await getTracerLazy('external-services');
        result = await withSpanLazy(
          tracer,
          `${options.service}.${options.operation}`,
          async (span) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            span.setAttribute('external.service', options.service);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            span.setAttribute('external.operation', options.operation);

            if (options.timeout) {
              return Promise.race([
                fn(...args),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout')), options.timeout)
                ),
              ]);
            }

            return fn(...args);
          },
          { kind: (await getTelemetryModule()).SpanKind.CLIENT }
        );
      } catch {
        // Telemetry not available (e.g., Edge Runtime), execute without tracing
        if (options.timeout) {
          result = await Promise.race([
            fn(...args),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), options.timeout)
            ),
          ]);
        } else {
          result = await fn(...args);
        }
      }

      externalServiceRequests.inc({
        service: options.service,
        operation: options.operation,
        status: 'success',
      });

      return result;
    } catch (error) {
      externalServiceRequests.inc({
        service: options.service,
        operation: options.operation,
        status: 'error',
      });
      throw error;
    } finally {
      timer();
    }
  };
}

// ============================================================================
// DATABASE INSTRUMENTATION
// ============================================================================

export interface DatabaseClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Wrap database client with tracing
 */
export function instrumentDatabase<T extends DatabaseClient>(client: T, dbName = 'postgres'): T {
  const originalQuery = client.query.bind(client);

  client.query = async (sql: string, params?: unknown[]): Promise<unknown> => {
    const operation = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? 'QUERY';

    try {
      // Try to use telemetry if available
      const tracer = await getTracerLazy('database');
      return await withSpanLazy(
        tracer,
        `db.${operation}`,
        async (span) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          span.setAttribute('db.system', dbName);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          span.setAttribute('db.operation', operation);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          span.setAttribute('db.statement', sql.slice(0, 100)); // Truncate for safety

          const result = await originalQuery(sql, params);
          return result;
        },
        { kind: (await getTelemetryModule()).SpanKind.CLIENT }
      );
    } catch {
      // Telemetry not available, execute query without tracing
      return originalQuery(sql, params);
    }
  };

  return client;
}

// ============================================================================
// COMMAND/QUERY INSTRUMENTATION MIDDLEWARE
// ============================================================================

import type {
  CommandMiddleware,
  Command,
  CommandResult,
  CommandContext,
} from '../cqrs/command-bus.js';
import type { QueryMiddleware, Query, QueryResult, QueryContext } from '../cqrs/query-bus.js';
import { commandsExecuted, commandDuration, queriesExecuted, queryDuration } from './metrics.js';

/**
 * Create metrics middleware for command bus
 */
export function createCommandMetricsMiddleware(): CommandMiddleware {
  return async (
    command: Command,
    _context: CommandContext,
    next: () => Promise<CommandResult>
  ): Promise<CommandResult> => {
    const timer = commandDuration.startTimer({ type: command.type });

    try {
      const result = await next();

      commandsExecuted.inc({
        type: command.type,
        status: result.success ? 'success' : 'error',
      });

      return result;
    } finally {
      timer();
    }
  };
}

/**
 * Create metrics middleware for query bus
 */
export function createQueryMetricsMiddleware(): QueryMiddleware {
  return async (
    query: Query,
    _context: QueryContext,
    next: () => Promise<QueryResult>
  ): Promise<QueryResult> => {
    const timer = queryDuration.startTimer({ type: query.type });

    try {
      const result = await next();

      queriesExecuted.inc({
        type: query.type,
        cached: result.cached ? 'true' : 'false',
      });

      return result;
    } finally {
      timer();
    }
  };
}

// ============================================================================
// HEALTH INDICATOR
// ============================================================================

export interface HealthIndicator {
  name: string;
  check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details?: Record<string, unknown> | undefined;
  error?: string | undefined;
}

/**
 * Create a health indicator with timeout
 */
export function createHealthIndicator(
  name: string,
  check: () => Promise<boolean | Record<string, unknown>>,
  timeoutMs = 5000
): HealthIndicator {
  return {
    name,
    check: async (): Promise<HealthCheckResult> => {
      const start = performance.now();

      try {
        const result = await Promise.race([
          check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
          ),
        ]);

        const latencyMs = performance.now() - start;

        return {
          status: latencyMs > timeoutMs / 2 ? 'degraded' : 'healthy',
          latencyMs,
          details: typeof result === 'object' ? result : undefined,
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          latencyMs: performance.now() - start,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}
