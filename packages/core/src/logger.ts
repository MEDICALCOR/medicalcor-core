import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Medical-grade logger with PII redaction
 * Prevents raw PII from reaching logs per GDPR/HIPAA requirements
 */

// PII patterns to redact
const PII_PATTERNS = {
  // Romanian phone formats: 07xx, +40, 0040
  phone: /(\+?40|0040|0)?[0-9]{9,10}/g,
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Google Click ID
  gclid: /gclid=[a-zA-Z0-9_-]+/gi,
  // Facebook Click ID
  fbclid: /fbclid=[a-zA-Z0-9_-]+/gi,
};

// Fields to completely redact
const REDACTED_FIELDS = [
  'phone',
  'email',
  'name',
  'firstName',
  'lastName',
  'transcript',
  'messageBody',
  'message',
  'text',
  'body',
  'gclid',
  'fbclid',
];

/**
 * Recursively redact PII from an object
 */
function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    let result = obj;
    for (const pattern of Object.values(PII_PATTERNS)) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (REDACTED_FIELDS.includes(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Create a redaction function for Pino
 */
function createRedactor() {
  return {
    paths: REDACTED_FIELDS.map((field) => `*.${field}`),
    censor: '[REDACTED]',
  };
}

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  correlationId?: string;
}

/**
 * Create a logger instance with PII redaction
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, level = process.env['LOG_LEVEL'] ?? 'info', correlationId } = options;

  const loggerOptions: LoggerOptions = {
    name,
    level,
    redact: createRedactor(),
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: correlationId ? { correlationId } : undefined,
    serializers: {
      err: pino.stdSerializers.err,
      req: (req) => redactObject({
        method: req.method,
        url: req.url,
        headers: req.headers,
      }),
      res: pino.stdSerializers.res,
    },
  };

  return pino(loggerOptions);
}

/**
 * Create a child logger with correlation ID
 */
export function withCorrelationId(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Default logger instance
export const logger = createLogger({ name: 'medicalcor' });

export type { Logger };
