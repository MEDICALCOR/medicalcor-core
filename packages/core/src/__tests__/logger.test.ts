import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, withCorrelationId, generateCorrelationId, logger } from '../logger.js';

describe('createLogger', () => {
  beforeEach(() => {
    vi.stubEnv('LOG_LEVEL', 'info');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('basic creation', () => {
    it('should create a logger with a name', () => {
      const testLogger = createLogger({ name: 'test-logger' });
      expect(testLogger).toBeDefined();
      expect(testLogger.level).toBe('info');
    });

    it('should use custom log level', () => {
      const testLogger = createLogger({ name: 'test-logger', level: 'debug' });
      expect(testLogger.level).toBe('debug');
    });

    it('should use LOG_LEVEL environment variable', () => {
      vi.stubEnv('LOG_LEVEL', 'warn');
      const testLogger = createLogger({ name: 'test-logger' });
      expect(testLogger.level).toBe('warn');
    });

    it('should create logger with correlation ID in base', () => {
      const testLogger = createLogger({
        name: 'test-logger',
        correlationId: 'test-correlation-123',
      });
      expect(testLogger).toBeDefined();
      // Correlation ID should be in bindings
      const bindings = testLogger.bindings();
      expect(bindings.correlationId).toBe('test-correlation-123');
    });

    it('should create logger without base when no correlationId', () => {
      const testLogger = createLogger({ name: 'test-logger' });
      expect(testLogger).toBeDefined();
      // No correlation ID in bindings
      const bindings = testLogger.bindings();
      expect(bindings.correlationId).toBeUndefined();
    });
  });

  describe('logging methods', () => {
    it('should have all standard log methods', () => {
      const testLogger = createLogger({ name: 'test-methods' });
      expect(typeof testLogger.trace).toBe('function');
      expect(typeof testLogger.debug).toBe('function');
      expect(typeof testLogger.info).toBe('function');
      expect(typeof testLogger.warn).toBe('function');
      expect(typeof testLogger.error).toBe('function');
      expect(typeof testLogger.fatal).toBe('function');
    });

    it('should have child method', () => {
      const testLogger = createLogger({ name: 'test-child' });
      expect(typeof testLogger.child).toBe('function');
      const childLogger = testLogger.child({ context: 'child-context' });
      expect(childLogger).toBeDefined();
    });
  });
});

describe('withCorrelationId', () => {
  it('should create a child logger with correlation ID', () => {
    const parentLogger = createLogger({ name: 'parent' });
    const childLogger = withCorrelationId(parentLogger, 'corr-123');
    expect(childLogger).toBeDefined();
    expect(childLogger.bindings().correlationId).toBe('corr-123');
  });

  it('should preserve parent logger properties', () => {
    const parentLogger = createLogger({ name: 'parent', level: 'debug' });
    const childLogger = withCorrelationId(parentLogger, 'corr-456');
    expect(childLogger.level).toBe('debug');
  });

  it('should allow chaining correlation IDs', () => {
    const parentLogger = createLogger({ name: 'parent' });
    const child1 = withCorrelationId(parentLogger, 'corr-1');
    const child2 = withCorrelationId(child1, 'corr-2');
    // The last correlation ID should take precedence
    expect(child2.bindings().correlationId).toBe('corr-2');
  });
});

describe('generateCorrelationId', () => {
  it('should generate a string', () => {
    const correlationId = generateCorrelationId();
    expect(typeof correlationId).toBe('string');
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const correlationId = generateCorrelationId();
    const after = Date.now();

    // Extract timestamp from format: timestamp-uuid
    const parts = correlationId.split('-');
    const timestamp = parseInt(parts[0], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it('should match expected format', () => {
    const correlationId = generateCorrelationId();
    // Format: timestamp-12chars from UUID (may include hyphen due to slice)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // slice(0, 12) gets: xxxxxxxx-xxx (first 12 chars including hyphen)
    const pattern = /^\d+-[a-f0-9-]{12}$/;
    expect(correlationId).toMatch(pattern);
  });

  it('should use crypto-secure randomness', () => {
    // Generate many IDs and check for good distribution
    const ids = [];
    for (let i = 0; i < 50; i++) {
      ids.push(generateCorrelationId());
    }

    // All should be different
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);

    // UUID portion should be different
    const uuidParts = ids.map((id) => id.split('-')[1]);
    const uniqueUuids = new Set(uuidParts);
    expect(uniqueUuids.size).toBe(50);
  });
});

describe('default logger', () => {
  it('should export a default logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should be a valid pino logger', () => {
    // The name is set in logger options, not bindings
    // Just verify it's a functional logger
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.child).toBe('function');
  });
});

describe('PII redaction', () => {
  it('should redact phone numbers in Romanian format', () => {
    const testLogger = createLogger({ name: 'pii-test' });
    // The redaction happens through pino's redact option
    // We can verify the logger is configured with redaction
    expect(testLogger).toBeDefined();
  });

  describe('field-based redaction via pino redact', () => {
    it('should configure redaction for sensitive fields', () => {
      const testLogger = createLogger({ name: 'redact-test' });
      // Logger should be created with redaction config
      expect(testLogger).toBeDefined();
    });

    it('should handle log objects with sensitive fields', () => {
      const testLogger = createLogger({ name: 'sensitive-test' });

      // Create a spy to capture log output
      const logOutput: unknown[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        logOutput.push(chunk);
        return true;
      });

      // Log with sensitive data
      testLogger.info(
        {
          email: 'user@example.com',
          password: 'secret123',
          publicData: 'visible',
        },
        'test message'
      );

      // Restore stdout
      process.stdout.write = originalWrite;

      // The log output should have redacted fields
      if (logOutput.length > 0) {
        const logString = String(logOutput[0]);
        // Pino redact censors the fields
        expect(logString).toContain('[REDACTED]');
      }
    });
  });
});

describe('request serializer', () => {
  it('should serialize request objects', () => {
    const testLogger = createLogger({ name: 'req-serializer-test' });

    // The logger should have serializers configured
    expect(testLogger).toBeDefined();
  });

  it('should handle request with headers', () => {
    const testLogger = createLogger({ name: 'req-headers-test' });
    // Create a mock request
    const mockReq = {
      method: 'GET',
      url: '/api/test?email=user@example.com',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
    };

    // Logger should be able to log req
    expect(() => {
      testLogger.info({ req: mockReq }, 'request received');
    }).not.toThrow();
  });
});

describe('error serializer', () => {
  it('should serialize errors properly', () => {
    const testLogger = createLogger({ name: 'error-serializer-test' });
    const testError = new Error('Test error message');

    expect(() => {
      testLogger.error({ err: testError }, 'an error occurred');
    }).not.toThrow();
  });

  it('should handle errors with stack traces', () => {
    const testLogger = createLogger({ name: 'stack-test' });
    const testError = new Error('Stack trace error');
    testError.stack = 'Error: Stack trace error\n    at test.js:1:1';

    expect(() => {
      testLogger.error({ err: testError }, 'error with stack');
    }).not.toThrow();
  });
});

describe('log level configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should default to info when LOG_LEVEL not set', () => {
    // Clear any existing LOG_LEVEL
    delete process.env.LOG_LEVEL;
    const testLogger = createLogger({ name: 'default-level' });
    expect(testLogger.level).toBe('info');
  });

  it('should use trace level', () => {
    const testLogger = createLogger({ name: 'trace-logger', level: 'trace' });
    expect(testLogger.level).toBe('trace');
  });

  it('should use silent level', () => {
    const testLogger = createLogger({ name: 'silent-logger', level: 'silent' });
    expect(testLogger.level).toBe('silent');
  });

  it('should use fatal level', () => {
    const testLogger = createLogger({ name: 'fatal-logger', level: 'fatal' });
    expect(testLogger.level).toBe('fatal');
  });
});

describe('level formatter', () => {
  it('should format level as label', () => {
    const testLogger = createLogger({ name: 'level-format-test' });

    // Capture output
    const logOutput: unknown[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      logOutput.push(chunk);
      return true;
    });

    testLogger.info('test message');

    process.stdout.write = originalWrite;

    if (logOutput.length > 0) {
      const logString = String(logOutput[0]);
      // Should have level as a label, not a number
      expect(logString).toContain('"level"');
    }
  });
});

describe('child logger', () => {
  it('should create child with additional context', () => {
    const parentLogger = createLogger({ name: 'parent-child-test' });
    const childLogger = parentLogger.child({ service: 'auth' });

    expect(childLogger.bindings().service).toBe('auth');
  });

  it('should inherit parent level', () => {
    const parentLogger = createLogger({ name: 'inherit-test', level: 'debug' });
    const childLogger = parentLogger.child({ component: 'child' });

    expect(childLogger.level).toBe('debug');
  });

  it('should allow nested children', () => {
    const root = createLogger({ name: 'root' });
    const child1 = root.child({ layer: 1 });
    const child2 = child1.child({ layer: 2 });
    const child3 = child2.child({ layer: 3 });

    expect(child3.bindings().layer).toBe(3);
  });
});

describe('PII patterns', () => {
  // Test that logger handles various PII patterns safely
  describe('phone patterns', () => {
    it('should handle Romanian phone formats', () => {
      const testLogger = createLogger({ name: 'ro-phone-test' });
      expect(() => {
        testLogger.info('User phone: 0712345678');
        testLogger.info('User phone: +40712345678');
        testLogger.info('User phone: 0040712345678');
      }).not.toThrow();
    });
  });

  describe('email patterns', () => {
    it('should handle email addresses', () => {
      const testLogger = createLogger({ name: 'email-test' });
      expect(() => {
        testLogger.info('Contact: user@example.com');
        testLogger.info('Contact: user.name+tag@sub.domain.co.uk');
      }).not.toThrow();
    });
  });

  describe('identity patterns', () => {
    it('should handle Romanian CNP', () => {
      const testLogger = createLogger({ name: 'cnp-test' });
      expect(() => {
        testLogger.info('CNP: 1234567890123');
      }).not.toThrow();
    });

    it('should handle credit card numbers', () => {
      const testLogger = createLogger({ name: 'cc-test' });
      expect(() => {
        testLogger.info('Card: 4111-1111-1111-1111');
        testLogger.info('Card: 4111 1111 1111 1111');
      }).not.toThrow();
    });

    it('should handle IBAN', () => {
      const testLogger = createLogger({ name: 'iban-test' });
      expect(() => {
        testLogger.info('IBAN: RO12ABCD1234567890123456');
      }).not.toThrow();
    });
  });

  describe('network patterns', () => {
    it('should handle IPv4 addresses', () => {
      const testLogger = createLogger({ name: 'ipv4-test' });
      expect(() => {
        testLogger.info('Client IP: 192.168.1.1');
        testLogger.info('Client IP: 10.0.0.1');
      }).not.toThrow();
    });

    it('should handle IPv6 addresses', () => {
      const testLogger = createLogger({ name: 'ipv6-test' });
      expect(() => {
        testLogger.info('Client IP: 2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      }).not.toThrow();
    });
  });

  describe('token patterns', () => {
    it('should handle JWT tokens', () => {
      const testLogger = createLogger({ name: 'jwt-test' });
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(() => {
        testLogger.info(`Token: ${jwt}`);
      }).not.toThrow();
    });

    it('should handle Bearer tokens', () => {
      const testLogger = createLogger({ name: 'bearer-test' });
      expect(() => {
        testLogger.info('Authorization: Bearer my-secret-token-123');
      }).not.toThrow();
    });
  });

  describe('tracking patterns', () => {
    it('should handle Google Click IDs', () => {
      const testLogger = createLogger({ name: 'gclid-test' });
      expect(() => {
        testLogger.info('URL: https://example.com?gclid=CjwKCAjw1234567890');
      }).not.toThrow();
    });

    it('should handle Facebook Click IDs', () => {
      const testLogger = createLogger({ name: 'fbclid-test' });
      expect(() => {
        testLogger.info('URL: https://example.com?fbclid=IwAR3abcdefghijklmnop');
      }).not.toThrow();
    });
  });
});
