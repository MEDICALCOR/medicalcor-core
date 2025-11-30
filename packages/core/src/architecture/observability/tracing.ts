/**
 * @module architecture/observability/tracing
 *
 * Distributed Tracing
 * ===================
 *
 * OpenTelemetry-compatible distributed tracing.
 */

// ============================================================================
// TRACE TYPES
// ============================================================================

export interface Trace {
  readonly traceId: string;
  readonly spans: Span[];
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly status: TraceStatus;
  readonly attributes: Record<string, unknown>;
}

export interface Span {
  readonly spanId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly status: SpanStatus;
  readonly attributes: Record<string, unknown>;
  readonly events: SpanEvent[];
  readonly links: SpanLink[];
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface SpanStatus {
  readonly code: StatusCode;
  readonly message?: string;
}

export type StatusCode = 'unset' | 'ok' | 'error';

export type TraceStatus = 'active' | 'completed' | 'error';

export interface SpanEvent {
  readonly name: string;
  readonly timestamp: Date;
  readonly attributes?: Record<string, unknown>;
}

export interface SpanLink {
  readonly traceId: string;
  readonly spanId: string;
  readonly attributes?: Record<string, unknown>;
}

// ============================================================================
// TRACER INTERFACE
// ============================================================================

export interface Tracer {
  /**
   * Start a new trace
   */
  startTrace(name: string, attributes?: Record<string, unknown>): TraceContext;

  /**
   * Start a new span
   */
  startSpan(name: string, options?: StartSpanOptions): SpanContext;

  /**
   * Get current span
   */
  getCurrentSpan(): SpanContext | undefined;

  /**
   * Get current trace ID
   */
  getCurrentTraceId(): string | undefined;

  /**
   * Inject trace context into carrier (for propagation)
   */
  inject(carrier: Record<string, string>): void;

  /**
   * Extract trace context from carrier
   */
  extract(carrier: Record<string, string>): TraceContext | undefined;
}

export interface StartSpanOptions {
  readonly kind?: SpanKind;
  readonly parent?: SpanContext;
  readonly attributes?: Record<string, unknown>;
  readonly links?: SpanLink[];
}

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  end(): void;
}

export interface SpanContext extends TraceContext {
  readonly name: string;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(code: StatusCode, message?: string): void;
  recordException(error: Error): void;
}

// ============================================================================
// IN-MEMORY TRACER
// ============================================================================

import { AsyncLocalStorage } from 'async_hooks';

const traceContextStorage = new AsyncLocalStorage<{ traceId: string; spanId: string }>();

export class InMemoryTracer implements Tracer {
  private traces = new Map<string, Trace>();
  private spans = new Map<string, Span>();

  startTrace(name: string, attributes?: Record<string, unknown>): TraceContext {
    const traceId = this.generateId();
    const spanId = this.generateId();

    const trace: Trace = {
      traceId,
      spans: [],
      startTime: new Date(),
      status: 'active',
      attributes: attributes ?? {},
    };

    this.traces.set(traceId, trace);

    const span = this.createSpan(traceId, spanId, name, 'internal', attributes);
    trace.spans.push(span);
    this.spans.set(spanId, span);

    return this.createSpanContext(traceId, spanId, span);
  }

  startSpan(name: string, options?: StartSpanOptions): SpanContext {
    const current = traceContextStorage.getStore();
    const traceId = options?.parent?.traceId ?? current?.traceId ?? this.generateId();
    const parentSpanId = options?.parent?.spanId ?? current?.spanId;
    const spanId = this.generateId();

    const span = this.createSpan(
      traceId,
      spanId,
      name,
      options?.kind ?? 'internal',
      options?.attributes,
      parentSpanId
    );

    const trace = this.traces.get(traceId);
    if (trace) {
      trace.spans.push(span);
    }

    this.spans.set(spanId, span);

    return this.createSpanContext(traceId, spanId, span);
  }

  getCurrentSpan(): SpanContext | undefined {
    const current = traceContextStorage.getStore();
    if (!current) return undefined;

    const span = this.spans.get(current.spanId);
    if (!span) return undefined;

    return this.createSpanContext(current.traceId, current.spanId, span);
  }

  getCurrentTraceId(): string | undefined {
    return traceContextStorage.getStore()?.traceId;
  }

  inject(carrier: Record<string, string>): void {
    const current = traceContextStorage.getStore();
    if (current) {
      carrier.traceparent = `00-${current.traceId}-${current.spanId}-01`;
    }
  }

  extract(carrier: Record<string, string>): TraceContext | undefined {
    const traceparent = carrier.traceparent;
    if (!traceparent) return undefined;

    const parts = traceparent.split('-');
    if (parts.length < 3) return undefined;

    const traceId = parts[1];
    const spanId = parts[2];
    if (!traceId || !spanId) return undefined;

    return {
      traceId,
      spanId,
      end: () => {},
    };
  }

  /**
   * Run function within trace context
   */
  runInContext<T>(traceId: string, spanId: string, fn: () => T): T {
    return traceContextStorage.run({ traceId, spanId }, fn);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Clear all traces (for testing)
   */
  clear(): void {
    this.traces.clear();
    this.spans.clear();
  }

  private generateId(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }

  private createSpan(
    traceId: string,
    spanId: string,
    name: string,
    kind: SpanKind,
    attributes?: Record<string, unknown>,
    parentSpanId?: string
  ): Span {
    return {
      spanId,
      traceId,
      parentSpanId,
      name,
      kind,
      startTime: new Date(),
      status: { code: 'unset' },
      attributes: attributes ?? {},
      events: [],
      links: [],
    };
  }

  private createSpanContext(traceId: string, spanId: string, span: Span): SpanContext {
    const self = this;

    return {
      traceId,
      spanId,
      name: span.name,

      setAttribute(key: string, value: unknown): void {
        span.attributes[key] = value;
      },

      addEvent(name: string, attributes?: Record<string, unknown>): void {
        span.events.push({
          name,
          timestamp: new Date(),
          attributes,
        });
      },

      setStatus(code: StatusCode, message?: string): void {
        (span as { status: SpanStatus }).status = { code, message };
      },

      recordException(error: Error): void {
        this.addEvent('exception', {
          'exception.type': error.name,
          'exception.message': error.message,
          'exception.stacktrace': error.stack,
        });
        this.setStatus('error', error.message);
      },

      end(): void {
        (span as { endTime?: Date }).endTime = new Date();

        const trace = self.traces.get(traceId);
        if (trace) {
          const allEnded = trace.spans.every((s) => s.endTime);
          if (allEnded) {
            (trace as { status: TraceStatus }).status = trace.spans.some(
              (s) => s.status.code === 'error'
            )
              ? 'error'
              : 'completed';
            (trace as { endTime?: Date }).endTime = new Date();
          }
        }
      },
    };
  }
}

// ============================================================================
// TRACING UTILITIES
// ============================================================================

/**
 * Wrap a function with tracing
 */
export function traced<T extends (...args: unknown[]) => unknown>(
  tracer: Tracer,
  name: string,
  fn: T,
  options?: { attributes?: Record<string, unknown> }
): T {
  return ((...args: unknown[]) => {
    const span = tracer.startSpan(name, { attributes: options?.attributes });
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.setStatus('ok');
            span.end();
            return value;
          })
          .catch((error) => {
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            span.end();
            throw error;
          });
      }
      span.setStatus('ok');
      span.end();
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.end();
      throw error;
    }
  }) as T;
}

/**
 * Decorator for tracing methods
 */
export function Traced(name?: string, options?: { attributes?: Record<string, unknown> }) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const spanName = name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const span = tracer.startSpan(spanName, { attributes: options?.attributes });
      try {
        const result = original.apply(this, args);
        if (result instanceof Promise) {
          return result
            .then((value) => {
              span.setStatus('ok');
              span.end();
              return value;
            })
            .catch((error) => {
              span.recordException(error instanceof Error ? error : new Error(String(error)));
              span.end();
              throw error;
            });
        }
        span.setStatus('ok');
        span.end();
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    };

    return descriptor;
  };
}

// Singleton tracer
export const tracer = new InMemoryTracer();
