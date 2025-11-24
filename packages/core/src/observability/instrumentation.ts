/**
 * Auto-Instrumentation utilities
 *
 * Provides automatic tracing and metrics for:
 * - HTTP requests/responses
 * - Database queries
 * - External service calls
 * - Command/Query execution
 */

import { getTracer, withSpan, SpanKind, addSpanAttributes } from '../telemetry.js';
import {
  httpRequestsTotal,
  httpRequestDuration,
  externalServiceRequests,
  externalServiceDuration,
} from './metrics.js';

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

    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
    const traceId = (request.headers['x-trace-id'] as string) ?? crypto.randomUUID();

    request.observability = {
      correlationId,
      traceId,
      spanId: crypto.randomUUID().slice(0, 16),
      startTime: performance.now(),
      path: request.url.split('?')[0],
      method: request.method,
    };

    // Add tracing attributes
    addSpanAttributes({
      'http.method': request.method,
      'http.url': request.url,
      'http.route': request.routeOptions?.url ?? request.url,
      'http.user_agent': request.headers['user-agent'] ?? '',
      'correlation_id': correlationId,
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

    // Add span attributes
    addSpanAttributes({
      'http.status_code': reply.statusCode,
      'http.response_time_ms': duration * 1000,
    });
  });

  // Error hook - record errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.addHook('onError', async (request: any, _reply: any, error: Error) => {
    if (!request.observability) return;

    addSpanAttributes({
      'error': true,
      'error.type': error.name,
      'error.message': error.message,
    });
  });
}

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
  const tracer = getTracer('external-services');

  return async (...args: TArgs): Promise<TResult> => {
    const timer = externalServiceDuration.startTimer({
      service: options.service,
      operation: options.operation,
    });

    try {
      const result = await withSpan(
        tracer,
        `${options.service}.${options.operation}`,
        async (span) => {
          span.setAttribute('external.service', options.service);
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
        { kind: SpanKind.CLIENT }
      );

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
export function instrumentDatabase<T extends DatabaseClient>(
  client: T,
  dbName = 'postgres'
): T {
  const tracer = getTracer('database');

  const originalQuery = client.query.bind(client);

  client.query = async (sql: string, params?: unknown[]): Promise<unknown> => {
    const operation = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? 'QUERY';

    return withSpan(
      tracer,
      `db.${operation}`,
      async (span) => {
        span.setAttribute('db.system', dbName);
        span.setAttribute('db.operation', operation);
        span.setAttribute('db.statement', sql.slice(0, 100)); // Truncate for safety

        const result = await originalQuery(sql, params);
        return result;
      },
      { kind: SpanKind.CLIENT }
    );
  };

  return client;
}

// ============================================================================
// COMMAND/QUERY INSTRUMENTATION MIDDLEWARE
// ============================================================================

import type { CommandMiddleware, Command, CommandResult, CommandContext } from '../cqrs/command-bus.js';
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
