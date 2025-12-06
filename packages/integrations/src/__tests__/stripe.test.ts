/**
 * Stripe Integration Tests
 * Comprehensive coverage for Stripe client and webhook verification
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import {
  StripeClient,
  MockStripeClient,
  createStripeClient,
  createMockStripeClient,
  type StripeClientConfig,
  type DailyRevenueResult,
} from '../stripe.js';

// Store original fetch
const originalFetch = global.fetch;

describe('StripeClient', () => {
  let client: StripeClient;
  const mockConfig: StripeClientConfig = {
    secretKey: 'sk_test_123456789',
    webhookSecret: 'whsec_test_secret',
    retryConfig: {
      maxRetries: 1,
      baseDelayMs: 10,
    },
    timeoutMs: 5000,
  };

  beforeEach(() => {
    client = new StripeClient(mockConfig);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create client with config', () => {
      expect(client).toBeInstanceOf(StripeClient);
    });

    it('should accept minimal config', () => {
      const minimalClient = new StripeClient({ secretKey: 'sk_test_min' });
      expect(minimalClient).toBeInstanceOf(StripeClient);
    });

    it('should accept custom retry config', () => {
      const customClient = new StripeClient({
        secretKey: 'sk_test_custom',
        retryConfig: { maxRetries: 5, baseDelayMs: 2000 },
      });
      expect(customClient).toBeInstanceOf(StripeClient);
    });
  });

  describe('formatAmount', () => {
    it('should format amount in bani to RON', () => {
      const formatted = client.formatAmount(150000, 'ron');
      // Should be 1500.00 RON formatted for Romanian locale
      expect(formatted).toContain('1.500');
      expect(formatted.toLowerCase()).toContain('ron');
    });

    it('should handle zero amount', () => {
      const formatted = client.formatAmount(0, 'ron');
      expect(formatted).toContain('0');
    });

    it('should handle small amounts', () => {
      const formatted = client.formatAmount(50, 'ron');
      expect(formatted).toContain('0,50');
    });

    it('should default to RON currency', () => {
      const formatted = client.formatAmount(10000);
      expect(formatted.toLowerCase()).toContain('ron');
    });

    it('should format EUR correctly', () => {
      const formatted = client.formatAmount(5000, 'eur');
      expect(formatted).toContain('50');
    });

    it('should format USD correctly', () => {
      const formatted = client.formatAmount(9999, 'usd');
      expect(formatted).toContain('99');
    });
  });

  describe('toMajorUnits', () => {
    it('should convert bani to RON', () => {
      expect(client.toMajorUnits(150000)).toBe(1500);
    });

    it('should round correctly', () => {
      expect(client.toMajorUnits(199)).toBe(2);
      expect(client.toMajorUnits(150)).toBe(2);
      expect(client.toMajorUnits(149)).toBe(1);
    });

    it('should handle zero', () => {
      expect(client.toMajorUnits(0)).toBe(0);
    });

    it('should handle exact amounts', () => {
      expect(client.toMajorUnits(100)).toBe(1);
      expect(client.toMajorUnits(1000)).toBe(10);
      expect(client.toMajorUnits(10000)).toBe(100);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const header = `t=${timestamp},v1=${signature}`;

      // Set the current time to match timestamp
      vi.setSystemTime(timestamp * 1000);

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const header = `t=${timestamp},v1=invalidsignature`;

      vi.setSystemTime(timestamp * 1000);

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const header = `t=${oldTimestamp},v1=${signature}`;

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(false);
    });

    it('should reject future timestamp outside tolerance', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes in future
      const signedPayload = `${futureTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const header = `t=${futureTimestamp},v1=${signature}`;

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(false);
    });

    it('should accept timestamp within tolerance window', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000) - 200; // 3+ minutes ago (within 5 min tolerance)
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const header = `t=${timestamp},v1=${signature}`;

      vi.setSystemTime(timestamp * 1000 + 200 * 1000); // Move time forward 200 seconds

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(true);
    });

    it('should throw if webhook secret not configured', () => {
      const clientWithoutSecret = new StripeClient({ secretKey: 'sk_test' });

      expect(() => {
        clientWithoutSecret.verifyWebhookSignature('{}', 't=123,v1=abc');
      }).toThrow('Webhook secret not configured');
    });

    it('should reject malformed header - missing timestamp', () => {
      const result = client.verifyWebhookSignature('{}', 'v1=signature');
      expect(result).toBe(false);
    });

    it('should reject malformed header - missing signature', () => {
      const result = client.verifyWebhookSignature('{}', 't=123456');
      expect(result).toBe(false);
    });

    it('should reject empty header', () => {
      const result = client.verifyWebhookSignature('{}', '');
      expect(result).toBe(false);
    });

    it('should handle multiple v1 signatures (take last)', () => {
      const payload = '{"test":true}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const validSignature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      // Multiple v1 signatures - implementation takes the last one
      // So put the valid signature last
      const header = `t=${timestamp},v1=oldsignature,v1=${validSignature}`;

      vi.setSystemTime(timestamp * 1000);

      const result = client.verifyWebhookSignature(payload, header);
      expect(result).toBe(true);
    });
  });

  describe('validateWebhook', () => {
    it('should not throw for valid signature', () => {
      const payload = '{"type":"charge.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', mockConfig.webhookSecret!)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const header = `t=${timestamp},v1=${signature}`;
      vi.setSystemTime(timestamp * 1000);

      expect(() => {
        client.validateWebhook(payload, header);
      }).not.toThrow();
    });

    it('should throw WebhookSignatureError for invalid signature', () => {
      expect(() => {
        client.validateWebhook('{}', 't=123,v1=invalid');
      }).toThrow('Invalid Stripe webhook signature');
    });
  });
});

describe('MockStripeClient', () => {
  let mockClient: MockStripeClient;

  beforeEach(() => {
    mockClient = new MockStripeClient();
  });

  describe('getDailyRevenue', () => {
    it('should return mock daily revenue', async () => {
      const result = await mockClient.getDailyRevenue();

      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('transactionCount');
      expect(result).toHaveProperty('periodStart');
      expect(result).toHaveProperty('periodEnd');
    });

    it('should have amount greater than or equal to base amount', async () => {
      const result = await mockClient.getDailyRevenue();
      expect(result.amount).toBeGreaterThanOrEqual(250000);
    });

    it('should return RON currency', async () => {
      const result = await mockClient.getDailyRevenue();
      expect(result.currency).toBe('ron');
    });

    it('should have transaction count between 3 and 10', async () => {
      const result = await mockClient.getDailyRevenue();
      expect(result.transactionCount).toBeGreaterThanOrEqual(3);
      expect(result.transactionCount).toBeLessThanOrEqual(10);
    });

    it('should have valid period dates', async () => {
      const result = await mockClient.getDailyRevenue();
      expect(result.periodStart).toBeInstanceOf(Date);
      expect(result.periodEnd).toBeInstanceOf(Date);
      expect(result.periodEnd.getTime()).toBeGreaterThan(result.periodStart.getTime());
    });
  });

  describe('getRevenueForPeriod', () => {
    it('should return mock revenue for period', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-07');

      const result = await mockClient.getRevenueForPeriod(start, end);

      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency');
      expect(result.periodStart).toEqual(start);
      expect(result.periodEnd).toEqual(end);
    });

    it('should scale amount based on period length', async () => {
      const start = new Date('2024-01-01');
      const end1Day = new Date('2024-01-02');
      const end7Days = new Date('2024-01-08');

      const result1Day = await mockClient.getRevenueForPeriod(start, end1Day);
      const result7Days = await mockClient.getRevenueForPeriod(start, end7Days);

      // 7 days should have roughly 7x the base amount (with some variance)
      expect(result7Days.amount).toBeGreaterThan(result1Day.amount);
    });

    it('should have transaction count proportional to days', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-08'); // 7 days

      const result = await mockClient.getRevenueForPeriod(start, end);
      expect(result.transactionCount).toBe(35); // 7 days * 5 per day
    });
  });

  describe('formatAmount', () => {
    it('should format amount correctly', () => {
      const formatted = mockClient.formatAmount(150000, 'ron');
      expect(formatted).toContain('1.500');
    });

    it('should default to RON', () => {
      const formatted = mockClient.formatAmount(10000);
      expect(formatted.toLowerCase()).toContain('ron');
    });
  });

  describe('toMajorUnits', () => {
    it('should convert correctly', () => {
      expect(mockClient.toMajorUnits(150000)).toBe(1500);
      expect(mockClient.toMajorUnits(100)).toBe(1);
      expect(mockClient.toMajorUnits(0)).toBe(0);
    });
  });
});

describe('createStripeClient', () => {
  it('should create StripeClient instance', () => {
    const client = createStripeClient({ secretKey: 'sk_test_factory' });
    expect(client).toBeInstanceOf(StripeClient);
  });

  it('should accept full config', () => {
    const client = createStripeClient({
      secretKey: 'sk_test_full',
      webhookSecret: 'whsec_test',
      retryConfig: { maxRetries: 3, baseDelayMs: 500 },
      timeoutMs: 10000,
    });
    expect(client).toBeInstanceOf(StripeClient);
  });
});

describe('createMockStripeClient', () => {
  it('should create MockStripeClient instance', () => {
    const client = createMockStripeClient();
    expect(client).toBeInstanceOf(MockStripeClient);
  });
});

describe('Property-based tests for Stripe', () => {
  describe('formatAmount', () => {
    it('should always format to currency string', () => {
      const client = new StripeClient({ secretKey: 'sk_test' });

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000000000 }), (amount) => {
          const formatted = client.formatAmount(amount, 'ron');
          return typeof formatted === 'string' && formatted.length > 0;
        })
      );
    });
  });

  describe('toMajorUnits', () => {
    it('should always return non-negative integer', () => {
      const client = new StripeClient({ secretKey: 'sk_test' });

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000000000 }), (amount) => {
          const major = client.toMajorUnits(amount);
          return Number.isInteger(major) && major >= 0;
        })
      );
    });

    it('should divide by 100 and round', () => {
      const client = new StripeClient({ secretKey: 'sk_test' });

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000000000 }), (amount) => {
          const major = client.toMajorUnits(amount);
          return major === Math.round(amount / 100);
        })
      );
    });
  });

  describe('webhook signature', () => {
    it('should verify its own generated signatures', () => {
      const client = new StripeClient({
        secretKey: 'sk_test',
        webhookSecret: 'whsec_property_test',
      });

      fc.assert(
        fc.property(fc.json(), (payload) => {
          const payloadStr = JSON.stringify(payload);
          const timestamp = Math.floor(Date.now() / 1000);
          const signedPayload = `${timestamp}.${payloadStr}`;
          const signature = crypto
            .createHmac('sha256', 'whsec_property_test')
            .update(signedPayload, 'utf8')
            .digest('hex');

          const header = `t=${timestamp},v1=${signature}`;

          return client.verifyWebhookSignature(payloadStr, header);
        }),
        { numRuns: 20 }
      );
    });
  });
});

describe('Webhook signature edge cases', () => {
  const config: StripeClientConfig = {
    secretKey: 'sk_test',
    webhookSecret: 'whsec_edge_cases',
  };
  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle payload with special characters', () => {
    const payload = '{"emoji":"🎉","quote":"\\"test\\"","newline":"\\n"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', config.webhookSecret!)
      .update(signedPayload, 'utf8')
      .digest('hex');

    vi.setSystemTime(timestamp * 1000);

    const result = client.verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`);
    expect(result).toBe(true);
  });

  it('should handle large payload', () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(100000) });
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${largePayload}`;
    const signature = crypto
      .createHmac('sha256', config.webhookSecret!)
      .update(signedPayload, 'utf8')
      .digest('hex');

    vi.setSystemTime(timestamp * 1000);

    const result = client.verifyWebhookSignature(largePayload, `t=${timestamp},v1=${signature}`);
    expect(result).toBe(true);
  });

  it('should reject tampered payload', () => {
    const originalPayload = '{"amount":100}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${originalPayload}`;
    const signature = crypto
      .createHmac('sha256', config.webhookSecret!)
      .update(signedPayload, 'utf8')
      .digest('hex');

    vi.setSystemTime(timestamp * 1000);

    // Tamper with the payload
    const tamperedPayload = '{"amount":999999}';
    const result = client.verifyWebhookSignature(tamperedPayload, `t=${timestamp},v1=${signature}`);
    expect(result).toBe(false);
  });

  it('should reject signature with wrong secret', () => {
    const payload = '{"test":true}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const wrongSignature = crypto
      .createHmac('sha256', 'wrong_secret')
      .update(signedPayload, 'utf8')
      .digest('hex');

    vi.setSystemTime(timestamp * 1000);

    const result = client.verifyWebhookSignature(payload, `t=${timestamp},v1=${wrongSignature}`);
    expect(result).toBe(false);
  });

  it('should handle exactly at tolerance boundary (300 seconds)', () => {
    const payload = '{"test":true}';
    const now = 1700000000000; // Fixed timestamp
    vi.setSystemTime(now);

    const timestamp = Math.floor(now / 1000) - 300; // Exactly at boundary
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', config.webhookSecret!)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const result = client.verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`);
    expect(result).toBe(true);
  });

  it('should reject just past tolerance (301 seconds)', () => {
    const payload = '{"test":true}';
    const now = 1700000000000; // Fixed timestamp
    vi.setSystemTime(now);

    const timestamp = Math.floor(now / 1000) - 301; // Just past boundary
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', config.webhookSecret!)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const result = client.verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`);
    expect(result).toBe(false);
  });
});

describe('StripeClient - getDailyRevenue', () => {
  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient({
      secretKey: 'sk_test_123',
      retryConfig: { maxRetries: 0, baseDelayMs: 10 },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should fetch daily revenue for successful charges', async () => {
    const mockResponse = {
      object: 'list',
      data: [
        {
          id: 'ch_1',
          amount: 10000,
          amount_captured: 10000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(Date.now() / 1000),
          paid: true,
          refunded: false,
        },
        {
          id: 'ch_2',
          amount: 20000,
          amount_captured: 20000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(Date.now() / 1000),
          paid: true,
          refunded: false,
        },
      ],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getDailyRevenue();

    expect(result.amount).toBe(30000);
    expect(result.currency).toBe('ron');
    expect(result.transactionCount).toBe(2);
  });

  it('should exclude failed charges', async () => {
    const mockResponse = {
      object: 'list',
      data: [
        {
          id: 'ch_1',
          amount: 10000,
          amount_captured: 10000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(Date.now() / 1000),
          paid: true,
          refunded: false,
        },
        {
          id: 'ch_2',
          amount: 20000,
          amount_captured: 0,
          currency: 'ron',
          status: 'failed' as const,
          created: Math.floor(Date.now() / 1000),
          paid: false,
          refunded: false,
        },
      ],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getDailyRevenue();

    expect(result.amount).toBe(10000);
    expect(result.transactionCount).toBe(1);
  });

  it('should exclude refunded charges', async () => {
    const mockResponse = {
      object: 'list',
      data: [
        {
          id: 'ch_1',
          amount: 10000,
          amount_captured: 10000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(Date.now() / 1000),
          paid: true,
          refunded: true,
        },
      ],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getDailyRevenue();

    expect(result.amount).toBe(0);
    expect(result.transactionCount).toBe(0);
  });

  it('should handle pagination', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            object: 'list',
            data: [
              {
                id: 'ch_1',
                amount: 10000,
                amount_captured: 10000,
                currency: 'ron',
                status: 'succeeded' as const,
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: true,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          object: 'list',
          data: [
            {
              id: 'ch_2',
              amount: 20000,
              amount_captured: 20000,
              currency: 'ron',
              status: 'succeeded' as const,
              created: Math.floor(Date.now() / 1000),
              paid: true,
              refunded: false,
            },
          ],
          has_more: false,
        }),
      } as Response);
    });

    const result = await client.getDailyRevenue();

    expect(result.amount).toBe(30000);
    expect(result.transactionCount).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should use amount_captured when available', async () => {
    const mockResponse = {
      object: 'list',
      data: [
        {
          id: 'ch_1',
          amount: 10000,
          amount_captured: 8000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(Date.now() / 1000),
          paid: true,
          refunded: false,
        },
      ],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getDailyRevenue();

    expect(result.amount).toBe(8000);
  });

  it('should handle custom timezone', async () => {
    const mockResponse = {
      object: 'list',
      data: [],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getDailyRevenue('America/New_York');

    expect(result).toBeDefined();
    expect(result.periodStart).toBeInstanceOf(Date);
    expect(result.periodEnd).toBeInstanceOf(Date);
  });
});

describe('StripeClient - error handling', () => {
  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient({
      secretKey: 'sk_test_123',
      retryConfig: { maxRetries: 1, baseDelayMs: 10 },
      timeoutMs: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should convert AbortError to ExternalServiceError', async () => {
    // Simulate an abort error (timeout)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    global.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(client.getDailyRevenue()).rejects.toThrow('timeout');
  });

  it('should retry on rate limit errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({ error: { message: 'Rate limited' } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          object: 'list',
          data: [],
          has_more: false,
        }),
      } as Response);
    });

    const result = await client.getDailyRevenue();
    expect(result.amount).toBe(0);
    expect(callCount).toBe(2);
  });

  it('should retry on 502 errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 502,
          headers: new Headers(),
          json: async () => ({ error: { message: 'Bad Gateway' } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          object: 'list',
          data: [],
          has_more: false,
        }),
      } as Response);
    });

    const result = await client.getDailyRevenue();
    expect(result.amount).toBe(0);
    expect(callCount).toBe(2);
  });

  it('should retry on 503 errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ error: { message: 'Service Unavailable' } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          object: 'list',
          data: [],
          has_more: false,
        }),
      } as Response);
    });

    const result = await client.getDailyRevenue();
    expect(result.amount).toBe(0);
    expect(callCount).toBe(2);
  });

  it('should not retry on 400 errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ error: { message: 'Bad Request' } }),
    } as Response);

    await expect(client.getDailyRevenue()).rejects.toThrow('Request failed with status 400');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('StripeClient - getRevenueForPeriod', () => {
  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient({
      secretKey: 'sk_test_123',
      retryConfig: { maxRetries: 0, baseDelayMs: 10 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should fetch revenue for date range', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-07');

    const mockResponse = {
      object: 'list',
      data: [
        {
          id: 'ch_1',
          amount: 50000,
          amount_captured: 50000,
          currency: 'ron',
          status: 'succeeded' as const,
          created: Math.floor(startDate.getTime() / 1000),
          paid: true,
          refunded: false,
        },
      ],
      has_more: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockResponse,
    } as Response);

    const result = await client.getRevenueForPeriod(startDate, endDate);

    expect(result.amount).toBe(50000);
    expect(result.periodStart).toEqual(startDate);
    expect(result.periodEnd).toEqual(endDate);
  });

  it('should handle pagination in period query', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-07');

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            object: 'list',
            data: [
              {
                id: 'ch_1',
                amount: 25000,
                amount_captured: 25000,
                currency: 'ron',
                status: 'succeeded' as const,
                created: Math.floor(startDate.getTime() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: true,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          object: 'list',
          data: [
            {
              id: 'ch_2',
              amount: 25000,
              amount_captured: 25000,
              currency: 'ron',
              status: 'succeeded' as const,
              created: Math.floor(startDate.getTime() / 1000) + 3600,
              paid: true,
              refunded: false,
            },
          ],
          has_more: false,
        }),
      } as Response);
    });

    const result = await client.getRevenueForPeriod(startDate, endDate);

    expect(result.amount).toBe(50000);
    expect(result.transactionCount).toBe(2);
  });
});
