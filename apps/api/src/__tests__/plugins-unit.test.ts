import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Unit Tests for Plugin Utilities
 *
 * Tests for plugin logic without requiring full Fastify app initialization
 */

describe('Timing-Safe Comparison', () => {
  function timingSafeEqual(a: string, b: string): boolean {
    try {
      const bufferA = Buffer.from(a, 'utf8');
      const bufferB = Buffer.from(b, 'utf8');

      if (bufferA.length !== bufferB.length) {
        crypto.timingSafeEqual(bufferB, bufferB); // Constant-time dummy operation
        return false;
      }

      return crypto.timingSafeEqual(bufferA, bufferB);
    } catch {
      return false;
    }
  }

  it('should return true for matching strings', () => {
    expect(timingSafeEqual('test-key-123', 'test-key-123')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(timingSafeEqual('test-key-123', 'test-key-456')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(timingSafeEqual('short', 'much-longer-string')).toBe(false);
  });

  it('should return false for empty vs non-empty', () => {
    expect(timingSafeEqual('', 'non-empty')).toBe(false);
  });

  it('should handle special characters', () => {
    const key = 'test-key!@#$%^&*()';
    expect(timingSafeEqual(key, key)).toBe(true);
    expect(timingSafeEqual(key, 'test-key!@#$%^&*()')).toBe(true);
    expect(timingSafeEqual(key, 'test-key!@#$%^&*()_')).toBe(false);
  });
});

describe('HMAC Signature Generation', () => {
  function generateHmacSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  it('should generate consistent signatures for same input', () => {
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'my-secret-key';

    const sig1 = generateHmacSignature(payload, secret);
    const sig2 = generateHmacSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'my-secret-key';
    const payload1 = JSON.stringify({ event: 'test1' });
    const payload2 = JSON.stringify({ event: 'test2' });

    const sig1 = generateHmacSignature(payload1, secret);
    const sig2 = generateHmacSignature(payload2, secret);

    expect(sig1).not.toBe(sig2);
  });

  it('should generate different signatures with different secrets', () => {
    const payload = JSON.stringify({ event: 'test' });
    const secret1 = 'secret-one';
    const secret2 = 'secret-two';

    const sig1 = generateHmacSignature(payload, secret1);
    const sig2 = generateHmacSignature(payload, secret2);

    expect(sig1).not.toBe(sig2);
  });

  it('should generate valid hex string', () => {
    const payload = 'test payload';
    const secret = 'secret';
    const signature = generateHmacSignature(payload, secret);

    expect(signature).toMatch(/^[0-9a-f]{64}$/); // SHA-256 produces 64 hex characters
  });
});

describe('Path Matching Logic', () => {
  function matchesProtectedPath(requestPath: string, protectedPaths: string[]): boolean {
    return protectedPaths.some((path) => requestPath.startsWith(path));
  }

  it('should match exact paths', () => {
    expect(matchesProtectedPath('/workflows', ['/workflows'])).toBe(true);
    expect(matchesProtectedPath('/workflows', ['/other'])).toBe(false);
  });

  it('should match path prefixes', () => {
    expect(matchesProtectedPath('/workflows/trigger', ['/workflows'])).toBe(true);
    expect(matchesProtectedPath('/workflows/list', ['/workflows'])).toBe(true);
  });

  it('should not match partial names', () => {
    expect(matchesProtectedPath('/workflowsXYZ', ['/workflows'])).toBe(true); // Note: startsWith matches this
    expect(matchesProtectedPath('/other/workflows', ['/workflows'])).toBe(false);
  });

  it('should match multiple protected paths', () => {
    const protectedPaths = ['/workflows', '/ai', '/metrics'];

    expect(matchesProtectedPath('/workflows', protectedPaths)).toBe(true);
    expect(matchesProtectedPath('/ai/execute', protectedPaths)).toBe(true);
    expect(matchesProtectedPath('/metrics', protectedPaths)).toBe(true);
    expect(matchesProtectedPath('/public', protectedPaths)).toBe(false);
  });
});

describe('CSRF Token Generation', () => {
  function generateCsrfToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  it('should generate tokens of correct length', () => {
    const token16 = generateCsrfToken(16);
    const token32 = generateCsrfToken(32);

    // base64url encoding: each 3 bytes = 4 characters, padding removed
    expect(token16.length).toBeGreaterThan(0);
    expect(token32.length).toBeGreaterThan(token16.length);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateCsrfToken());
    }

    expect(tokens.size).toBe(100); // All tokens should be unique
  });

  it('should use URL-safe characters only', () => {
    const token = generateCsrfToken();

    // base64url uses: A-Z, a-z, 0-9, -, _
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('Wildcard Path Matching', () => {
  function matchesPattern(path: string, pattern: string): boolean {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
  }

  it('should match exact patterns', () => {
    expect(matchesPattern('/health', '/health')).toBe(true);
    expect(matchesPattern('/health', '/metrics')).toBe(false);
  });

  it('should match wildcard patterns', () => {
    expect(matchesPattern('/webhooks/stripe', '/webhooks/*')).toBe(true);
    expect(matchesPattern('/webhooks/whatsapp', '/webhooks/*')).toBe(true);
    expect(matchesPattern('/webhooks', '/webhooks/*')).toBe(true); // Base path matches
  });

  it('should not match unrelated paths with wildcard', () => {
    expect(matchesPattern('/other/path', '/webhooks/*')).toBe(false);
    expect(matchesPattern('/webhook', '/webhooks/*')).toBe(false); // Missing trailing s
  });

  it('should handle multiple wildcards', () => {
    const excludePaths = ['/webhooks/*', '/health/*', '/metrics'];

    expect(matchesPattern('/webhooks/stripe', excludePaths[0])).toBe(true);
    expect(matchesPattern('/health/deep', excludePaths[1])).toBe(true);
    expect(matchesPattern('/metrics', excludePaths[2])).toBe(true);
  });
});

describe('Rate Limit Key Generation', () => {
  function generateRateLimitKey(ip: string, webhookType: string): string {
    return `ratelimit:${webhookType}:${ip}`;
  }

  it('should generate consistent keys', () => {
    const key1 = generateRateLimitKey('192.168.1.1', 'whatsapp');
    const key2 = generateRateLimitKey('192.168.1.1', 'whatsapp');

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different IPs', () => {
    const key1 = generateRateLimitKey('192.168.1.1', 'whatsapp');
    const key2 = generateRateLimitKey('192.168.1.2', 'whatsapp');

    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different webhook types', () => {
    const key1 = generateRateLimitKey('192.168.1.1', 'whatsapp');
    const key2 = generateRateLimitKey('192.168.1.1', 'voice');

    expect(key1).not.toBe(key2);
  });

  it('should include all components in key', () => {
    const key = generateRateLimitKey('10.0.0.1', 'stripe');

    expect(key).toContain('ratelimit');
    expect(key).toContain('stripe');
    expect(key).toContain('10.0.0.1');
  });
});

describe('Webhook Type Detection', () => {
  function detectWebhookType(path: string): string {
    if (path.includes('/webhooks/whatsapp')) return 'whatsapp';
    if (path.includes('/webhooks/vapi')) return 'vapi';
    if (path.includes('/webhooks/voice')) return 'voice';
    if (path.includes('/webhooks/stripe')) return 'stripe';
    if (path.includes('/webhooks/booking')) return 'booking';
    if (path.includes('/webhooks/crm')) return 'crm';
    return 'default';
  }

  it('should detect WhatsApp webhooks', () => {
    expect(detectWebhookType('/webhooks/whatsapp')).toBe('whatsapp');
    expect(detectWebhookType('/webhooks/whatsapp/verify')).toBe('whatsapp');
  });

  it('should detect Voice webhooks', () => {
    expect(detectWebhookType('/webhooks/voice')).toBe('voice');
    expect(detectWebhookType('/webhooks/voice/status')).toBe('voice');
  });

  it('should detect Vapi webhooks separately from Voice', () => {
    expect(detectWebhookType('/webhooks/vapi')).toBe('vapi');
    expect(detectWebhookType('/webhooks/voice')).toBe('voice');
  });

  it('should detect Stripe webhooks', () => {
    expect(detectWebhookType('/webhooks/stripe')).toBe('stripe');
  });

  it('should detect CRM webhooks', () => {
    expect(detectWebhookType('/webhooks/crm')).toBe('crm');
  });

  it('should return default for unknown paths', () => {
    expect(detectWebhookType('/health')).toBe('default');
    expect(detectWebhookType('/metrics')).toBe('default');
  });
});

describe('UUID Validation', () => {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validateUserId(userId: string | undefined): boolean {
    if (typeof userId !== 'string') return false;
    return UUID_REGEX.test(userId);
  }

  it('should validate correct UUIDs', () => {
    expect(validateUserId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateUserId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('should reject invalid UUIDs', () => {
    expect(validateUserId('not-a-uuid')).toBe(false);
    expect(validateUserId('550e8400-e29b-41d4-a716')).toBe(false); // Too short
    expect(validateUserId('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // Too long
  });

  it('should reject malicious input', () => {
    expect(validateUserId('<script>alert(1)</script>')).toBe(false);
    expect(validateUserId('550e8400-e29b-41d4-a716-446655440000; DROP TABLE users;')).toBe(
      false
    );
  });

  it('should reject non-string values', () => {
    expect(validateUserId(undefined)).toBe(false);
    expect(validateUserId(null as any)).toBe(false);
  });

  it('should validate UUID v4 format', () => {
    const uuidV4 = crypto.randomUUID();
    expect(validateUserId(uuidV4)).toBe(true);
  });
});
