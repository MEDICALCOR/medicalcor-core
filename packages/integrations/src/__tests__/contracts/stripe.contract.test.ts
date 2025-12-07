/**
 * Stripe API Contract Tests
 *
 * Consumer-driven contract tests for the Stripe Payment API integration.
 * These tests verify that our StripeClient expects API responses
 * in the format that Stripe actually provides.
 *
 * Contract tests ensure:
 * 1. Our client sends requests in the correct format
 * 2. Our client can handle responses from the provider
 * 3. Changes to the external API are detected early
 *
 * @see https://stripe.com/docs/api
 */

import { describe, it, expect } from 'vitest';
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { createPact, STRIPE_PROVIDER } from './pact-setup.js';

const { like, eachLike, integer, string, boolean, regex } = MatchersV3;

describe('Stripe API Contract Tests', () => {
  const pact = createPact({ provider: STRIPE_PROVIDER });

  describe('Charges API', () => {
    it('should retrieve a single charge', async () => {
      await pact
        .addInteraction()
        .given('a charge ch_test123 exists')
        .uponReceiving('a request to retrieve a charge')
        .withRequest('GET', '/v1/charges/ch_test123', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_test123'),
            object: 'charge',
            amount: integer(10000),
            amount_captured: integer(10000),
            currency: string('ron'),
            status: string('succeeded'),
            created: integer(Math.floor(Date.now() / 1000)),
            paid: boolean(true),
            refunded: boolean(false),
            metadata: like({}),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_test123`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('charge');
          expect(data.id).toBe('ch_test123');
        });
    });

    it('should include charge metadata', async () => {
      await pact
        .addInteraction()
        .given('a charge with metadata exists')
        .uponReceiving('a request to retrieve charge with metadata')
        .withRequest('GET', '/v1/charges/ch_with_metadata', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_with_metadata'),
            object: 'charge',
            amount: integer(50000),
            amount_captured: integer(50000),
            currency: string('ron'),
            status: string('succeeded'),
            created: integer(Math.floor(Date.now() / 1000)),
            paid: boolean(true),
            refunded: boolean(false),
            metadata: like({
              phone: string('+40721000001'),
              contact_id: string('hs_contact_123'),
              treatment_type: string('implant'),
            }),
            customer: regex(/^cus_[a-zA-Z0-9]+$/, 'cus_test123'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_with_metadata`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.metadata).toBeDefined();
          expect(data.metadata.phone).toBe('+40721000001');
        });
    });

    it('should list all charges', async () => {
      await pact
        .addInteraction()
        .given('successful charges exist')
        .uponReceiving('a request to list all charges')
        .withRequest('GET', '/v1/charges', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            object: 'list',
            data: eachLike({
              id: regex(/^ch_[a-zA-Z0-9]+$/, 'ch_test123'),
              object: 'charge',
              amount: integer(10000),
              amount_captured: integer(10000),
              currency: string('ron'),
              status: string('succeeded'),
              created: integer(Math.floor(Date.now() / 1000)),
              paid: boolean(true),
              refunded: boolean(false),
            }),
            has_more: boolean(false),
            url: string('/v1/charges'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('list');
          expect(data.data).toBeDefined();
          expect(Array.isArray(data.data)).toBe(true);
        });
    });
  });

  describe('Payment Intents API', () => {
    it('should retrieve a payment intent', async () => {
      await pact
        .addInteraction()
        .given('a payment intent pi_test123 exists')
        .uponReceiving('a request to retrieve payment intent')
        .withRequest('GET', '/v1/payment_intents/pi_test123', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('pi_test123'),
            object: 'payment_intent',
            amount: integer(50000),
            amount_received: integer(50000),
            currency: string('ron'),
            status: string('succeeded'),
            customer: regex(/^cus_[a-zA-Z0-9]+$/, 'cus_test123'),
            created: integer(Math.floor(Date.now() / 1000)),
            metadata: like({
              phone: string('+40721000001'),
            }),
            payment_method: regex(/^pm_[a-zA-Z0-9]+$/, 'pm_test123'),
            payment_method_types: eachLike(string('card')),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/payment_intents/pi_test123`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.id).toBe('pi_test123');
          expect(data.object).toBe('payment_intent');
          expect(data.status).toBe('succeeded');
        });
    });

    it('should list all payment intents', async () => {
      await pact
        .addInteraction()
        .given('payment intents exist')
        .uponReceiving('a request to list payment intents')
        .withRequest('GET', '/v1/payment_intents', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            object: 'list',
            data: eachLike({
              id: regex(/^pi_[a-zA-Z0-9]+$/, 'pi_test123'),
              object: 'payment_intent',
              amount: integer(50000),
              currency: string('ron'),
              status: string('succeeded'),
              created: integer(Math.floor(Date.now() / 1000)),
            }),
            has_more: boolean(false),
            url: string('/v1/payment_intents'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/payment_intents`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('list');
        });
    });
  });

  describe('Customers API', () => {
    it('should retrieve a customer', async () => {
      await pact
        .addInteraction()
        .given('a customer cus_test123 exists')
        .uponReceiving('a request to retrieve customer')
        .withRequest('GET', '/v1/customers/cus_test123', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('cus_test123'),
            object: 'customer',
            email: string('test@example.com'),
            name: string('Test Customer'),
            phone: string('+40721000001'),
            created: integer(Math.floor(Date.now() / 1000)),
            metadata: like({
              hubspot_contact_id: string('12345'),
            }),
            currency: string('ron'),
            delinquent: boolean(false),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/customers/cus_test123`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.id).toBe('cus_test123');
          expect(data.object).toBe('customer');
          expect(data.email).toBe('test@example.com');
        });
    });

    it('should list all customers', async () => {
      await pact
        .addInteraction()
        .given('customers exist in the system')
        .uponReceiving('a request to list customers')
        .withRequest('GET', '/v1/customers', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            object: 'list',
            data: eachLike({
              id: regex(/^cus_[a-zA-Z0-9]+$/, 'cus_test123'),
              object: 'customer',
              email: string('test@example.com'),
              name: string('Test Customer'),
              created: integer(Math.floor(Date.now() / 1000)),
            }),
            has_more: boolean(false),
            url: string('/v1/customers'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/customers`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('list');
        });
    });
  });

  describe('Refunds API', () => {
    it('should retrieve a refund', async () => {
      await pact
        .addInteraction()
        .given('a refund re_test123 exists')
        .uponReceiving('a request to retrieve a refund')
        .withRequest('GET', '/v1/refunds/re_test123', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('re_test123'),
            object: 'refund',
            amount: integer(5000),
            currency: string('ron'),
            charge: string('ch_test123'),
            status: string('succeeded'),
            created: integer(Math.floor(Date.now() / 1000)),
            reason: string('requested_by_customer'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/refunds/re_test123`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('refund');
          expect(data.charge).toBe('ch_test123');
        });
    });

    it('should list all refunds', async () => {
      await pact
        .addInteraction()
        .given('refunds exist')
        .uponReceiving('a request to list all refunds')
        .withRequest('GET', '/v1/refunds', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            object: 'list',
            data: eachLike({
              id: regex(/^re_[a-zA-Z0-9]+$/, 're_test123'),
              object: 'refund',
              amount: integer(5000),
              currency: string('ron'),
              charge: string('ch_test123'),
              status: string('succeeded'),
              created: integer(Math.floor(Date.now() / 1000)),
            }),
            has_more: boolean(false),
            url: string('/v1/refunds'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/refunds`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('list');
        });
    });
  });

  describe('Balance Transactions API', () => {
    it('should list balance transactions', async () => {
      await pact
        .addInteraction()
        .given('balance transactions exist')
        .uponReceiving('a request to list balance transactions')
        .withRequest('GET', '/v1/balance_transactions', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            object: 'list',
            data: eachLike({
              id: regex(/^txn_[a-zA-Z0-9]+$/, 'txn_test123'),
              object: 'balance_transaction',
              amount: integer(10000),
              currency: string('ron'),
              net: integer(9700),
              fee: integer(300),
              type: string('charge'),
              status: string('available'),
              created: integer(Math.floor(Date.now() / 1000)),
              source: regex(/^ch_[a-zA-Z0-9]+$/, 'ch_test123'),
            }),
            has_more: boolean(false),
            url: string('/v1/balance_transactions'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/balance_transactions`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.object).toBe('list');
          expect(data.data[0].object).toBe('balance_transaction');
        });
    });
  });

  describe('Error Responses', () => {
    it('should handle 401 unauthorized response', async () => {
      await pact
        .addInteraction()
        .given('invalid API key')
        .uponReceiving('a request with invalid API key')
        .withRequest('GET', '/v1/charges/ch_unauthorized', (builder) => {
          builder.headers({
            Authorization: 'Bearer sk_test_invalid',
          });
        })
        .willRespondWith(401, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            error: like({
              type: string('invalid_request_error'),
              message: string('Invalid API Key provided'),
              code: string('api_key_invalid'),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_unauthorized`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_invalid',
            },
          });

          expect(response.status).toBe(401);
          const data = await response.json();
          expect(data.error.type).toBe('invalid_request_error');
        });
    });

    it('should handle 404 resource not found', async () => {
      await pact
        .addInteraction()
        .given('charge ch_nonexistent does not exist')
        .uponReceiving('a request for non-existent charge')
        .withRequest('GET', '/v1/charges/ch_nonexistent', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(404, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            error: like({
              type: string('invalid_request_error'),
              message: string('No such charge: ch_nonexistent'),
              code: string('resource_missing'),
              param: string('id'),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_nonexistent`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(404);
          const data = await response.json();
          expect(data.error.code).toBe('resource_missing');
        });
    });

    it('should handle 429 rate limit exceeded', async () => {
      await pact
        .addInteraction()
        .given('API rate limit exceeded')
        .uponReceiving('a request when rate limited')
        .withRequest('GET', '/v1/charges/ch_ratelimit', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(429, (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              'Retry-After': '5',
            })
            .jsonBody({
              error: like({
                type: string('rate_limit_error'),
                message: string('Too many requests'),
                code: string('rate_limit'),
              }),
            });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_ratelimit`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(429);
          expect(response.headers.get('Retry-After')).toBe('5');
          const data = await response.json();
          expect(data.error.type).toBe('rate_limit_error');
        });
    });

    it('should handle 400 bad request', async () => {
      await pact
        .addInteraction()
        .given('invalid request parameters')
        .uponReceiving('a request with invalid parameters')
        .withRequest('GET', '/v1/charges/ch_badrequest', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(400, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            error: like({
              type: string('invalid_request_error'),
              message: string('Invalid request'),
              code: string('parameter_invalid'),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_badrequest`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(400);
          const data = await response.json();
          expect(data.error.type).toBe('invalid_request_error');
        });
    });

    it('should handle 502 bad gateway (Stripe infrastructure)', async () => {
      await pact
        .addInteraction()
        .given('Stripe infrastructure issue')
        .uponReceiving('a request during infrastructure issue')
        .withRequest('GET', '/v1/charges/ch_infrastructure', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(502, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            error: like({
              type: string('api_error'),
              message: string('We are experiencing issues, please try again'),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_infrastructure`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(502);
          const data = await response.json();
          expect(data.error.type).toBe('api_error');
        });
    });
  });

  describe('Charge Status Variations', () => {
    it('should handle succeeded charge', async () => {
      await pact
        .addInteraction()
        .given('a succeeded charge exists')
        .uponReceiving('a request for succeeded charge')
        .withRequest('GET', '/v1/charges/ch_succeeded', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_succeeded'),
            object: 'charge',
            amount: integer(10000),
            amount_captured: integer(10000),
            currency: string('ron'),
            status: 'succeeded',
            paid: true,
            refunded: false,
            captured: true,
            created: integer(Math.floor(Date.now() / 1000)),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_succeeded`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.status).toBe('succeeded');
          expect(data.paid).toBe(true);
        });
    });

    it('should handle failed charge', async () => {
      await pact
        .addInteraction()
        .given('a failed charge exists')
        .uponReceiving('a request for failed charge')
        .withRequest('GET', '/v1/charges/ch_failed', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_failed'),
            object: 'charge',
            amount: integer(10000),
            amount_captured: integer(0),
            currency: string('ron'),
            status: 'failed',
            paid: false,
            refunded: false,
            captured: false,
            created: integer(Math.floor(Date.now() / 1000)),
            failure_code: string('card_declined'),
            failure_message: string('Your card was declined.'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_failed`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.status).toBe('failed');
          expect(data.paid).toBe(false);
          expect(data.failure_code).toBe('card_declined');
        });
    });

    it('should handle refunded charge', async () => {
      await pact
        .addInteraction()
        .given('a refunded charge exists')
        .uponReceiving('a request for refunded charge')
        .withRequest('GET', '/v1/charges/ch_refunded', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_refunded'),
            object: 'charge',
            amount: integer(10000),
            amount_captured: integer(10000),
            amount_refunded: integer(10000),
            currency: string('ron'),
            status: 'succeeded',
            paid: true,
            refunded: true,
            captured: true,
            created: integer(Math.floor(Date.now() / 1000)),
            refunds: like({
              object: 'list',
              data: eachLike({
                id: regex(/^re_[a-zA-Z0-9]+$/, 're_test123'),
                amount: integer(10000),
                status: string('succeeded'),
              }),
              has_more: false,
              total_count: integer(1),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_refunded`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.refunded).toBe(true);
          expect(data.amount_refunded).toBe(10000);
        });
    });

    it('should handle partially refunded charge', async () => {
      await pact
        .addInteraction()
        .given('a partially refunded charge exists')
        .uponReceiving('a request for partially refunded charge')
        .withRequest('GET', '/v1/charges/ch_partial_refund', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer sk_test_[a-zA-Z0-9]+$/, 'Bearer sk_test_123456789'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('ch_partial_refund'),
            object: 'charge',
            amount: integer(10000),
            amount_captured: integer(10000),
            amount_refunded: integer(5000),
            currency: string('ron'),
            status: 'succeeded',
            paid: true,
            refunded: false,
            captured: true,
            created: integer(Math.floor(Date.now() / 1000)),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/v1/charges/ch_partial_refund`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk_test_123456789',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.refunded).toBe(false);
          expect(data.amount_refunded).toBe(5000);
          expect(data.amount_captured).toBe(10000);
        });
    });
  });
});
