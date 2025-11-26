import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Medical-grade logger with PII redaction
 * Prevents raw PII from reaching logs per GDPR/HIPAA requirements
 *
 * Compliant with:
 * - GDPR Article 5 (data minimization)
 * - HIPAA Privacy Rule (PHI protection)
 * - Romanian ANSPDCP guidelines
 */

// PII patterns to redact
const PII_PATTERNS = {
  // Romanian phone formats: 07xx, +40, 0040
  phone: /(\+?40|0040|0)?[0-9]{9,10}/g,
  // International phone format (E.164)
  phoneE164: /\+[1-9]\d{1,14}/g,
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Romanian CNP (national ID) - 13 digits starting with 1-8
  cnp: /\b[1-8]\d{12}\b/g,
  // Credit card numbers (basic pattern)
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // IBAN (Romanian format)
  iban: /\bRO\d{2}[A-Z]{4}\d{16}\b/gi,
  // IPv4 addresses
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  // IPv6 addresses (simplified)
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
  // Google Click ID
  gclid: /gclid=[a-zA-Z0-9_-]+/gi,
  // Facebook Click ID
  fbclid: /fbclid=[a-zA-Z0-9_-]+/gi,
  // JWT tokens
  jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  // Bearer tokens
  bearer: /Bearer\s+[a-zA-Z0-9_-]+/gi,
};

// Fields to completely redact (case-insensitive matching)
const REDACTED_FIELDS = [
  'phone',
  'phonenumber',
  'email',
  'name',
  'firstname',
  'lastname',
  'fullname',
  'transcript',
  'messagebody',
  'message',
  'text',
  'body',
  'content',
  'gclid',
  'fbclid',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'session',
  'cnp',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'iban',
  'ip',
  'ipaddress',
  'userip',
  'clientip',
  'remoteaddress',
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
      const keyLower = key.toLowerCase();
      // Check if key matches any redacted field pattern
      const shouldRedact = REDACTED_FIELDS.some(
        (field) => keyLower === field || keyLower.includes(field)
      );
      if (shouldRedact) {
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
  const { name, level = process.env.LOG_LEVEL ?? 'info', correlationId } = options;

  const loggerOptions: LoggerOptions = {
    name,
    level,
    redact: createRedactor(),
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Use null to omit base, or provide correlationId if present
    base: correlationId ? { correlationId } : null,
    serializers: {
      err: pino.stdSerializers.err,
      req: (req: { method?: string; url?: string; headers?: Record<string, string> }) =>
        redactObject({
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
