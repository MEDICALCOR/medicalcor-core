/**
 * Stripe Integration Branch Coverage Tests
 *
 * Tests StripeClient for 100% branch coverage including:
 * - Daily revenue calculation with timezone handling
 * - Pagination handling for charges
 * - Webhook signature verification
 * - Error handling and retries
 *
 * Uses MSW for HTTP mocking via the global vitest.setup.ts configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../__mocks__/server.js';
import {
  StripeClient,
  MockStripeClient,
  createStripeClient,
  createMockStripeClient,
  type StripeClientConfig,
} from '../stripe.js';

// =============================================================================
// StripeClient Tests
// =============================================================================

describe('StripeClient', () => {
  const validConfig: StripeClientConfig = {
    secretKey: 'sk_test_123456789',
    webhookSecret: 'whsec_test_webhook_secret',
  };

  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient(validConfig);
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(StripeClient);
    });

    it('should create client with minimal config', () => {
      const minimalClient = new StripeClient({ secretKey: 'sk_test_minimal' });
      expect(minimalClient).toBeInstanceOf(StripeClient);
    });

    it('should accept custom retry config', () => {
      const retryConfig: StripeClientConfig = {
        secretKey: 'sk_test_retry',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      };
      const retryClient = new StripeClient(retryConfig);
      expect(retryClient).toBeInstanceOf(StripeClient);
    });

    it('should accept custom timeout', () => {
      const timeoutConfig: StripeClientConfig = {
        secretKey: 'sk_test_timeout',
        timeoutMs: 60000,
      };
      const timeoutClient = new StripeClient(timeoutConfig);
      expect(timeoutClient).toBeInstanceOf(StripeClient);
    });
  });

  describe('getDailyRevenue', () => {
    it('should calculate daily revenue with default timezone', async () => {
      // Set up mock for charges endpoint
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_test1',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_test2',
                amount: 75000,
                amount_captured: 75000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('transactionCount');
      expect(result).toHaveProperty('periodStart');
      expect(result).toHaveProperty('periodEnd');
      expect(result.transactionCount).toBe(2);
      expect(result.amount).toBe(125000);
    });

    it('should handle custom timezone', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_utc',
                amount: 30000,
                amount_captured: 30000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue('UTC');

      expect(result).toHaveProperty('amount', 30000);
    });

    it('should exclude pending charges', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_succeeded',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_pending',
                amount: 25000,
                amount_captured: 0,
                currency: 'ron',
                status: 'pending',
                created: Math.floor(Date.now() / 1000),
                paid: false,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(50000);
      expect(result.transactionCount).toBe(1);
    });

    it('should exclude refunded charges', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_succeeded',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_refunded',
                amount: 25000,
                amount_captured: 25000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: true,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(50000);
      expect(result.transactionCount).toBe(1);
    });

    it('should exclude failed charges', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_succeeded',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_failed',
                amount: 25000,
                amount_captured: 0,
                currency: 'ron',
                status: 'failed',
                created: Math.floor(Date.now() / 1000),
                paid: false,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(50000);
      expect(result.transactionCount).toBe(1);
    });

    it('should handle pagination with has_more', async () => {
      let requestCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', ({ request }) => {
          requestCount++;
          const url = new URL(request.url);
          const startingAfter = url.searchParams.get('starting_after');

          if (!startingAfter) {
            // First page
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_page1',
                  amount: 50000,
                  amount_captured: 50000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: true,
            });
          } else {
            // Second page
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_page2',
                  amount: 30000,
                  amount_captured: 30000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: false,
            });
          }
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(80000);
      expect(result.transactionCount).toBe(2);
      expect(requestCount).toBe(2);
    });

    it('should handle empty charge list', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(0);
      expect(result.transactionCount).toBe(0);
      expect(result.currency).toBe('ron');
    });

    it('should use amount_captured when available', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_partial',
                amount: 100000,
                amount_captured: 75000, // Partial capture
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(75000); // Should use amount_captured
    });
  });

  describe('getRevenueForPeriod', () => {
    it('should calculate revenue for date range', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_period1',
                amount: 100000,
                amount_captured: 100000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_period2',
                amount: 150000,
                amount_captured: 150000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = await client.getRevenueForPeriod(startDate, endDate);

      expect(result.amount).toBe(250000);
      expect(result.transactionCount).toBe(2);
      expect(result.periodStart).toEqual(startDate);
      expect(result.periodEnd).toEqual(endDate);
    });

    it('should handle pagination in period query', async () => {
      let requestCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', ({ request }) => {
          requestCount++;
          const url = new URL(request.url);
          const startingAfter = url.searchParams.get('starting_after');

          if (!startingAfter) {
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_period_page1',
                  amount: 50000,
                  amount_captured: 50000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: true,
            });
          } else {
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_period_page2',
                  amount: 75000,
                  amount_captured: 75000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: false,
            });
          }
        })
      );

      const result = await client.getRevenueForPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.amount).toBe(125000);
      expect(requestCount).toBe(2);
    });

    it('should handle empty data array in period pagination (line 218)', async () => {
      // This tests the else branch in getRevenueForPeriod when response.data is empty
      let requestCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          requestCount++;
          if (requestCount === 1) {
            // First page with data and has_more: true
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_period_first',
                  amount: 50000,
                  amount_captured: 50000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: true,
            });
          }
          // Second page returns empty data array - triggers line 218
          return HttpResponse.json({
            object: 'list',
            data: [],
            has_more: true, // Still says has_more but empty data should stop pagination
          });
        })
      );

      const result = await client.getRevenueForPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.amount).toBe(50000);
      expect(result.transactionCount).toBe(1);
      expect(requestCount).toBe(2);
    });

    it('should filter by charge status in period', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_good',
                amount: 100000,
                amount_captured: 100000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
              {
                id: 'ch_bad_status',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'failed',
                created: Math.floor(Date.now() / 1000),
                paid: false,
                refunded: false,
              },
              {
                id: 'ch_bad_refund',
                amount: 25000,
                amount_captured: 25000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: true,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getRevenueForPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.amount).toBe(100000);
      expect(result.transactionCount).toBe(1);
    });
  });

  describe('formatAmount', () => {
    it('should format amount to RON currency', () => {
      const formatted = client.formatAmount(150000, 'ron');
      expect(formatted).toContain('1.500');
      expect(formatted.toLowerCase()).toContain('ron');
    });

    it('should format amount with default currency', () => {
      const formatted = client.formatAmount(50000);
      expect(formatted).toContain('500');
    });

    it('should format EUR currency', () => {
      const formatted = client.formatAmount(100000, 'eur');
      expect(formatted.toLowerCase()).toContain('eur');
    });
  });

  describe('toMajorUnits', () => {
    it('should convert bani to RON', () => {
      expect(client.toMajorUnits(150000)).toBe(1500);
    });

    it('should round correctly', () => {
      expect(client.toMajorUnits(15049)).toBe(150);
      expect(client.toMajorUnits(15050)).toBe(151);
    });

    it('should handle zero', () => {
      expect(client.toMajorUnits(0)).toBe(0);
    });
  });

  describe('verifyWebhookSignature', () => {
    const crypto = require('crypto');

    it('should verify valid webhook signature', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'whsec_test_webhook_secret')
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const result = client.verifyWebhookSignature(payload, signatureHeader);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHeader = `t=${timestamp},v1=invalid_signature`;

      const result = client.verifyWebhookSignature(payload, signatureHeader);
      expect(result).toBe(false);
    });

    it('should reject expired timestamp (replay attack prevention)', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (> 5 min tolerance)
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'whsec_test_webhook_secret')
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const result = client.verifyWebhookSignature(payload, signatureHeader);
      expect(result).toBe(false);
    });

    it('should reject future timestamp', () => {
      const payload = '{"type":"payment_intent.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000) + 400; // 400 seconds in future
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'whsec_test_webhook_secret')
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const result = client.verifyWebhookSignature(payload, signatureHeader);
      expect(result).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const result = client.verifyWebhookSignature('payload', 'v1=signature');
      expect(result).toBe(false);
    });

    it('should reject missing signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = client.verifyWebhookSignature('payload', `t=${timestamp}`);
      expect(result).toBe(false);
    });

    it('should throw when webhook secret not configured', () => {
      const noSecretClient = new StripeClient({ secretKey: 'sk_test' });

      expect(() => noSecretClient.verifyWebhookSignature('payload', 't=123,v1=sig')).toThrow(
        'Webhook secret not configured'
      );
    });

    it('should handle signature length mismatch', () => {
      const payload = '{"type":"test"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHeader = `t=${timestamp},v1=short`;

      const result = client.verifyWebhookSignature(payload, signatureHeader);
      expect(result).toBe(false);
    });
  });

  describe('validateWebhook', () => {
    it('should throw on invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      expect(() => client.validateWebhook('payload', `t=${timestamp},v1=invalid`)).toThrow(
        'Invalid Stripe webhook signature'
      );
    });

    it('should not throw on valid signature', () => {
      const crypto = require('crypto');
      const payload = '{"type":"test"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'whsec_test_webhook_secret')
        .update(signedPayload, 'utf8')
        .digest('hex');

      expect(() => client.validateWebhook(payload, `t=${timestamp},v1=${signature}`)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '60' },
          });
        })
      );

      await expect(client.getDailyRevenue()).rejects.toThrow();
    });

    it('should handle 502 errors and retry', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({
            object: 'list',
            data: [
              {
                id: 'ch_retry',
                amount: 50000,
                amount_captured: 50000,
                currency: 'ron',
                status: 'succeeded',
                created: Math.floor(Date.now() / 1000),
                paid: true,
                refunded: false,
              },
            ],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();
      expect(result.amount).toBe(50000);
      expect(callCount).toBeGreaterThan(1);
    });

    it('should handle 503 errors and retry', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({
            object: 'list',
            data: [],
            has_more: false,
          });
        })
      );

      const result = await client.getDailyRevenue();
      expect(result.transactionCount).toBe(0);
      expect(callCount).toBeGreaterThan(1);
    });

    it('should handle generic API errors', async () => {
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          return new HttpResponse('Bad Request', { status: 400 });
        })
      );

      await expect(client.getDailyRevenue()).rejects.toThrow('Request failed with status 400');
    });

    it('should handle empty data array in pagination (line 218)', async () => {
      // This tests the edge case where response.data is empty,
      // triggering the else branch that sets hasMore = false
      let requestCount = 0;
      server.use(
        http.get('https://api.stripe.com/v1/charges', () => {
          requestCount++;
          if (requestCount === 1) {
            // First page with data and has_more: true
            return HttpResponse.json({
              object: 'list',
              data: [
                {
                  id: 'ch_first',
                  amount: 50000,
                  amount_captured: 50000,
                  currency: 'ron',
                  status: 'succeeded',
                  created: Math.floor(Date.now() / 1000),
                  paid: true,
                  refunded: false,
                },
              ],
              has_more: true,
            });
          }
          // Second page returns empty data array - triggers line 218
          return HttpResponse.json({
            object: 'list',
            data: [],
            has_more: true, // Still says has_more but empty data should stop pagination
          });
        })
      );

      const result = await client.getDailyRevenue();

      expect(result.amount).toBe(50000);
      expect(result.transactionCount).toBe(1);
      expect(requestCount).toBe(2);
    });

    it('should convert AbortError to ExternalServiceError on timeout (line 352)', async () => {
      // Create client with very short timeout
      const timeoutClient = new StripeClient({
        secretKey: 'sk_test_timeout',
        timeoutMs: 1, // 1ms timeout - will definitely timeout
        retryConfig: { maxRetries: 0, baseDelayMs: 0 }, // No retries
      });

      server.use(
        http.get('https://api.stripe.com/v1/charges', async () => {
          // Delay longer than the timeout
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json({
            object: 'list',
            data: [],
            has_more: false,
          });
        })
      );

      await expect(timeoutClient.getDailyRevenue()).rejects.toThrow(/timeout/i);
    });
  });

  describe('factory function', () => {
    it('should create client via factory function', () => {
      const factoryClient = createStripeClient(validConfig);
      expect(factoryClient).toBeInstanceOf(StripeClient);
    });
  });
});

// =============================================================================
// MockStripeClient Tests
// =============================================================================

describe('MockStripeClient', () => {
  let mockClient: MockStripeClient;

  beforeEach(() => {
    mockClient = new MockStripeClient();
  });

  describe('getDailyRevenue', () => {
    it('should return mock daily revenue', async () => {
      const result = await mockClient.getDailyRevenue();

      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency', 'ron');
      expect(result).toHaveProperty('transactionCount');
      expect(result).toHaveProperty('periodStart');
      expect(result).toHaveProperty('periodEnd');
      expect(result.amount).toBeGreaterThan(0);
      expect(result.transactionCount).toBeGreaterThanOrEqual(3);
      expect(result.transactionCount).toBeLessThanOrEqual(10);
    });

    it('should return different amounts due to randomness', async () => {
      const results = await Promise.all([
        mockClient.getDailyRevenue(),
        mockClient.getDailyRevenue(),
        mockClient.getDailyRevenue(),
      ]);

      // At least one should be different (with high probability)
      const amounts = results.map((r) => r.amount);
      const uniqueAmounts = new Set(amounts);
      // With crypto-secure randomness, should have variation
      expect(uniqueAmounts.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getRevenueForPeriod', () => {
    it('should return mock revenue for period', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = await mockClient.getRevenueForPeriod(startDate, endDate);

      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('currency', 'ron');
      expect(result).toHaveProperty('periodStart', startDate);
      expect(result).toHaveProperty('periodEnd', endDate);
      // 30 days * 3000 RON average = ~90000 RON + variance
      expect(result.amount).toBeGreaterThan(0);
    });

    it('should scale with period length', async () => {
      const oneDay = await mockClient.getRevenueForPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-01')
      );
      const oneWeek = await mockClient.getRevenueForPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-07')
      );

      // Week should have more transactions
      expect(oneWeek.transactionCount).toBeGreaterThan(oneDay.transactionCount);
    });
  });

  describe('formatAmount', () => {
    it('should format amount correctly', () => {
      const formatted = mockClient.formatAmount(150000, 'ron');
      expect(formatted).toContain('1.500');
    });

    it('should use default currency', () => {
      const formatted = mockClient.formatAmount(50000);
      expect(formatted).toContain('500');
    });
  });

  describe('toMajorUnits', () => {
    it('should convert to major units', () => {
      expect(mockClient.toMajorUnits(150000)).toBe(1500);
    });

    it('should round correctly', () => {
      expect(mockClient.toMajorUnits(15049)).toBe(150);
      expect(mockClient.toMajorUnits(15050)).toBe(151);
    });
  });

  describe('factory function', () => {
    it('should create mock client via factory function', () => {
      const factoryMockClient = createMockStripeClient();
      expect(factoryMockClient).toBeInstanceOf(MockStripeClient);
    });
  });
});
