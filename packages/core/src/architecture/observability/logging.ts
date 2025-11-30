/**
 * @module architecture/observability/logging
 *
 * Structured Logging Infrastructure
 * =================================
 *
 * JSON-structured logging with correlation and context.
 */

// ============================================================================
// LOG TYPES
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext;
  readonly data?: Record<string, unknown>;
  readonly error?: LogError;
}

export interface LogContext {
  readonly service: string;
  readonly environment: string;
  readonly version: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly requestId?: string;
}

export interface LogError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly cause?: LogError;
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

export interface Logger {
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;

  child(context: Partial<LogContext>): Logger;
  withCorrelationId(correlationId: string): Logger;
  withUserId(userId: string): Logger;
  withTenantId(tenantId: string): Logger;
}

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================

export class StructuredLogger implements Logger {
  private context: LogContext;
  private minLevel: LogLevel;
  private transports: LogTransport[];
  private redactor: LogRedactor;

  constructor(options: LoggerOptions) {
    this.context = {
      service: options.service,
      environment: options.environment ?? 'development',
      version: options.version ?? '0.0.0',
    };
    this.minLevel = options.minLevel ?? 'info';
    this.transports = options.transports ?? [new ConsoleTransport()];
    this.redactor = options.redactor ?? new DefaultLogRedactor();
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('fatal', message, data, error);
  }

  child(context: Partial<LogContext>): Logger {
    const childLogger = new StructuredLogger({
      service: this.context.service,
      environment: this.context.environment,
      version: this.context.version,
      minLevel: this.minLevel,
      transports: this.transports,
      redactor: this.redactor,
    });
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  withCorrelationId(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  withUserId(userId: string): Logger {
    return this.child({ userId });
  }

  withTenantId(tenantId: string): Logger {
    return this.child({ tenantId });
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data: data ? this.redactor.redact(data) : undefined,
      error: error ? this.formatError(error) : undefined,
    };

    for (const transport of this.transports) {
      transport.write(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatError(error: Error): LogError {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as { code?: string }).code,
      cause: error.cause instanceof Error ? this.formatError(error.cause) : undefined,
    };
  }
}

export interface LoggerOptions {
  service: string;
  environment?: string;
  version?: string;
  minLevel?: LogLevel;
  transports?: LogTransport[];
  redactor?: LogRedactor;
}

// ============================================================================
// LOG TRANSPORT
// ============================================================================

export interface LogTransport {
  write(entry: LogEntry): void;
}

export class ConsoleTransport implements LogTransport {
  write(entry: LogEntry): void {
    const json = JSON.stringify(entry);
    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(json);
        break;
      case 'info':
        console.info(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      case 'error':
      case 'fatal':
        console.error(json);
        break;
    }
  }
}

export class PrettyConsoleTransport implements LogTransport {
  private colors: Record<LogLevel, string> = {
    trace: '\x1b[90m',
    debug: '\x1b[36m',
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    fatal: '\x1b[35m',
  };
  private reset = '\x1b[0m';

  write(entry: LogEntry): void {
    const color = this.colors[entry.level];
    const time = entry.timestamp.split('T')[1]?.split('.')[0] ?? '';
    const level = entry.level.toUpperCase().padEnd(5);
    const correlationId = entry.context.correlationId
      ? ` [${entry.context.correlationId.slice(0, 8)}]`
      : '';

    let message = `${color}${time} ${level}${this.reset}${correlationId} ${entry.message}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ` ${JSON.stringify(entry.data)}`;
    }

    if (entry.error) {
      message += `\n${color}${entry.error.stack ?? entry.error.message}${this.reset}`;
    }

    console.log(message);
  }
}

// ============================================================================
// LOG REDACTION
// ============================================================================

export interface LogRedactor {
  redact(data: Record<string, unknown>): Record<string, unknown>;
}

export class DefaultLogRedactor implements LogRedactor {
  private sensitiveFields = new Set([
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'ssn',
    'creditCard',
    'credit_card',
    'cvv',
    'pin',
  ]);

  redact(data: Record<string, unknown>): Record<string, unknown> {
    return this.redactObject(data);
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitive(key)) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          item && typeof item === 'object'
            ? this.redactObject(item as Record<string, unknown>)
            : item
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private isSensitive(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return (
      this.sensitiveFields.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('key')
    );
  }
}

// ============================================================================
// ASYNC LOCAL STORAGE CONTEXT
// ============================================================================

import { AsyncLocalStorage } from 'async_hooks';

const logContextStorage = new AsyncLocalStorage<Partial<LogContext>>();

/**
 * Run code with log context
 */
export function runWithLogContext<T>(context: Partial<LogContext>, fn: () => T): T {
  return logContextStorage.run(context, fn);
}

/**
 * Get current log context
 */
export function getLogContext(): Partial<LogContext> | undefined {
  return logContextStorage.getStore();
}

// ============================================================================
// DEFAULT LOGGER
// ============================================================================

export function createLogger(options: LoggerOptions): Logger {
  return new StructuredLogger(options);
}

// Singleton logger
export const logger = new StructuredLogger({
  service: 'medicalcor',
  environment: process.env.NODE_ENV ?? 'development',
  minLevel: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
  transports: [
    process.env.NODE_ENV === 'production' ? new ConsoleTransport() : new PrettyConsoleTransport(),
  ],
});
