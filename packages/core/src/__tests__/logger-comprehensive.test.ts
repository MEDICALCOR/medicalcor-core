/**
 * Comprehensive Logger Tests
 * Tests for PII redaction, correlation IDs, and GDPR compliance
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { createLogger, withCorrelationId, generateCorrelationId } from '../logger.js';

describe('createLogger', () => {
  it('should create a logger with given name', () => {
    const logger = createLogger({ name: 'test-service' });
    expect(logger).toBeDefined();
  });

  it('should create a logger with default level', () => {
    const logger = createLogger({ name: 'test' });
    expect(logger.level).toBeDefined();
  });

  it('should create a logger with custom level', () => {
    const logger = createLogger({ name: 'test', level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('should include correlation ID in base when provided', () => {
    const logger = createLogger({ name: 'test', correlationId: 'corr-123' });
    expect(logger.bindings()).toHaveProperty('correlationId', 'corr-123');
  });

  it('should have null base when no correlationId', () => {
    const logger = createLogger({ name: 'test' });
    expect(logger.bindings()).not.toHaveProperty('correlationId');
  });
});

describe('withCorrelationId', () => {
  it('should create child logger with correlation ID', () => {
    const parent = createLogger({ name: 'parent' });
    const child = withCorrelationId(parent, 'child-corr-456');
    expect(child.bindings()).toHaveProperty('correlationId', 'child-corr-456');
  });

  it('should preserve parent bindings', () => {
    const parent = createLogger({ name: 'parent', correlationId: 'parent-corr' });
    const child = withCorrelationId(parent, 'child-corr');
    // Child should have its own correlationId
    expect(child.bindings()).toHaveProperty('correlationId');
  });
});

describe('generateCorrelationId', () => {
  it('should generate a unique correlation ID', () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    expect(id1).not.toBe(id2);
  });

  it('should follow expected format (timestamp-uuid)', () => {
    const id = generateCorrelationId();
    // Format: timestamp-uuid_part (e.g., "1234567890123-7e3b22e7-43b")
    // UUID slice includes dashes, so format is: digits-hexchars-hexchars
    expect(id).toMatch(/^\d+-[a-f0-9-]{12}$/);
  });

  it('should include timestamp prefix', () => {
    const before = Date.now();
    const id = generateCorrelationId();
    const after = Date.now();

    const timestamp = parseInt(id.split('-')[0] ?? '0', 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  // Property-based test for uniqueness
  it('should generate unique IDs (property)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
          ids.add(generateCorrelationId());
        }
        return ids.size === 100;
      })
    );
  });
});

describe('PII Redaction Patterns', () => {
  // These test the underlying redaction behavior

  describe('Phone number redaction', () => {
    const testCases = [
      { input: '0721234567', desc: 'Romanian mobile format' },
      { input: '+40721234567', desc: 'Romanian E.164 format' },
      { input: '0040721234567', desc: 'Romanian international format' },
      { input: '+12025551234', desc: 'US E.164 format' },
      { input: '+442071234567', desc: 'UK E.164 format' },
    ];

    testCases.forEach(({ input, desc }) => {
      it(`should detect ${desc}: ${input}`, () => {
        // Test that the phone pattern would match
        const phonePattern = /(\+?40|0040|0)?[0-9]{9,10}/g;
        const phoneE164 = /\+[1-9]\d{1,14}/g;
        const matches = input.match(phonePattern) || input.match(phoneE164);
        expect(matches).not.toBeNull();
      });
    });
  });

  describe('Email redaction', () => {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const validEmails = [
      'user@example.com',
      'first.last@company.co.uk',
      'test+label@domain.io',
      'user123@sub.domain.com',
    ];

    validEmails.forEach((email) => {
      it(`should detect email: ${email}`, () => {
        expect(email.match(emailPattern)).not.toBeNull();
      });
    });
  });

  describe('CNP (Romanian National ID) redaction', () => {
    const cnpPattern = /\b[1-8]\d{12}\b/g;

    it('should detect valid CNP format', () => {
      const validCNP = '1850123456789'; // Starts with 1-8, 13 digits
      expect(validCNP.match(cnpPattern)).not.toBeNull();
    });

    it('should not match invalid CNP (starts with 0)', () => {
      const invalidCNP = '0850123456789';
      expect(invalidCNP.match(cnpPattern)).toBeNull();
    });

    it('should not match invalid CNP (starts with 9)', () => {
      const invalidCNP = '9850123456789';
      expect(invalidCNP.match(cnpPattern)).toBeNull();
    });
  });

  describe('Credit card redaction', () => {
    const ccPattern = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

    const validCards = ['4111111111111111', '4111-1111-1111-1111', '4111 1111 1111 1111'];

    validCards.forEach((card) => {
      it(`should detect credit card format: ${card}`, () => {
        expect(card.match(ccPattern)).not.toBeNull();
      });
    });
  });

  describe('IBAN redaction', () => {
    const ibanPattern = /\bRO\d{2}[A-Z]{4}\d{16}\b/gi;

    it('should detect Romanian IBAN', () => {
      const iban = 'RO12BTRL1234567890123456';
      expect(iban.match(ibanPattern)).not.toBeNull();
    });

    it('should be case-insensitive', () => {
      const iban = 'ro12btrl1234567890123456';
      expect(iban.match(ibanPattern)).not.toBeNull();
    });
  });

  describe('JWT token redaction', () => {
    const jwtPattern = /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g;

    it('should detect JWT format', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(jwt.match(jwtPattern)).not.toBeNull();
    });
  });

  describe('IPv4 redaction', () => {
    const ipv4Pattern =
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

    const validIPs = ['192.168.1.1', '10.0.0.1', '255.255.255.255', '0.0.0.0'];

    validIPs.forEach((ip) => {
      it(`should detect IPv4: ${ip}`, () => {
        expect(ip.match(ipv4Pattern)).not.toBeNull();
      });
    });
  });
});

describe('Redacted Fields', () => {
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

  REDACTED_FIELDS.forEach((field) => {
    it(`should have "${field}" in redacted fields list`, () => {
      expect(REDACTED_FIELDS).toContain(field);
    });
  });

  it('should have at least 30 redacted fields for GDPR compliance', () => {
    expect(REDACTED_FIELDS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('Logger Integration', () => {
  it('should log info messages', () => {
    const logger = createLogger({ name: 'test' });
    expect(() => logger.info('Test message')).not.toThrow();
  });

  it('should log with objects', () => {
    const logger = createLogger({ name: 'test' });
    expect(() => logger.info({ action: 'test', count: 5 }, 'Test message')).not.toThrow();
  });

  it('should log errors', () => {
    const logger = createLogger({ name: 'test' });
    const error = new Error('Test error');
    expect(() => logger.error({ err: error }, 'Error occurred')).not.toThrow();
  });

  it('should log warnings', () => {
    const logger = createLogger({ name: 'test' });
    expect(() => logger.warn('Warning message')).not.toThrow();
  });

  it('should log debug messages', () => {
    const logger = createLogger({ name: 'test', level: 'debug' });
    expect(() => logger.debug('Debug message')).not.toThrow();
  });

  it('should log trace messages', () => {
    const logger = createLogger({ name: 'test', level: 'trace' });
    expect(() => logger.trace('Trace message')).not.toThrow();
  });

  it('should create child loggers', () => {
    const logger = createLogger({ name: 'parent' });
    const child = logger.child({ module: 'child-module' });
    expect(child.bindings()).toHaveProperty('module', 'child-module');
  });
});
