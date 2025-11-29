/**
 * Medical-grade Pino logger with PII redaction
 *
 * Features:
 * - Automatic PII redaction in production
 * - Correlation ID support for distributed tracing
 * - Pretty printing in development
 * - Structured JSON logging in production
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

import { createCensor, REDACTION_PATHS, redactString } from './redaction.js';

export { REDACTION_PATHS, redactString, maskPhone, maskEmail, maskName } from './redaction.js';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level (default: based on NODE_ENV) */
  level?: string;
  /** Service name for log identification */
  serviceName?: string;
  /** Enable pretty printing (default: true in development) */
  pretty?: boolean;
  /** Disable PII redaction (NOT recommended in production) */
  disableRedaction?: boolean;
  /** Additional redaction paths */
  additionalRedactionPaths?: string[];
}

/**
 * Context that can be attached to log entries
 */
export interface LogContext {
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** Request ID */
  requestId?: string;
  /** Lead ID being processed */
  leadId?: string;
  /** HubSpot contact ID */
  hubspotContactId?: string;
  /** Channel (whatsapp, voice, etc.) */
  channel?: string;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Get default log level based on environment
 */
function getDefaultLevel(): string {
  const env = process.env.NODE_ENV;
  const envLevel = process.env.LOG_LEVEL;

  if (envLevel) {
    return envLevel;
  }

  switch (env) {
    case 'production':
      return 'info';
    case 'test':
      return 'silent';
    default:
      return 'debug';
  }
}

/**
 * Check if running in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
}

/**
 * Create the logger configuration
 */
function createLoggerOptions(config: LoggerConfig = {}): LoggerOptions {
  const {
    level = getDefaultLevel(),
    serviceName = 'medicalcor',
    disableRedaction = false,
    additionalRedactionPaths = [],
  } = config;

  const allRedactionPaths = [...REDACTION_PATHS, ...additionalRedactionPaths];

  // Build options object conditionally for exactOptionalPropertyTypes compliance
  const options: LoggerOptions = {
    level,
    name: serviceName,
    timestamp: pino.stdTimeFunctions.isoTime,

    // Base bindings
    base: {
      service: serviceName,
      env: process.env.NODE_ENV ?? 'development',
    },

    // Format options
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        service: bindings.service as string,
        env: bindings.env as string,
        pid: bindings.pid as number,
        hostname: bindings.hostname as string,
      }),
    },

    // Message key for the log message
    messageKey: 'msg',
  };

  // Only add redaction if enabled (exactOptionalPropertyTypes compliance)
  if (!disableRedaction) {
    options.redact = {
      paths: allRedactionPaths,
      censor: createCensor,
    };
  }

  return options;
}

/**
 * Create a child logger with context
 */
export function createChildLogger(parent: Logger, context: LogContext): Logger {
  return parent.child(context);
}

/**
 * Create the main logger instance
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const options = createLoggerOptions(config);
  const pretty = config.pretty ?? isDevelopment();

  if (pretty) {
    // Use pino-pretty for development
    const transport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
        singleLine: false,
      },
    }) as pino.DestinationStream;
    return pino(options, transport);
  }

  return pino(options);
}

/**
 * Default logger instance
 * Can be used directly or replaced with a custom configuration
 */
export const logger: Logger = createLogger({
  serviceName: process.env.SERVICE_NAME ?? 'medicalcor',
});

/**
 * Create a correlation-aware logger for request handling
 */
export function withCorrelation(
  correlationId: string,
  context: Omit<LogContext, 'correlationId'> = {}
): Logger {
  return createChildLogger(logger, { correlationId, ...context });
}

/**
 * Utility to safely log objects that might contain PII
 * Applies string-level redaction for dynamic content
 */
export function safeLog(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redactString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = safeLog(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Re-export pino types for convenience
export type { Logger, LoggerOptions } from 'pino';
