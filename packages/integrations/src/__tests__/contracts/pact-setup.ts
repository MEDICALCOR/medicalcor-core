/**
 * Pact Contract Testing Setup
 *
 * Configuration and utilities for consumer-driven contract testing
 * using Pact for external service integrations (HubSpot, Stripe).
 *
 * Contract tests verify that our integration clients expect API responses
 * that match what the external providers actually return.
 *
 * @see https://docs.pact.io/
 */

import { PactV4, MatchersV3, LogLevel } from '@pact-foundation/pact';
import path from 'path';

/**
 * Pact matchers for common patterns
 */
export const Matchers = MatchersV3;

/**
 * Directory where Pact contracts (JSON files) will be stored
 */
export const PACT_DIR = path.resolve(__dirname, '../../../pacts');

/**
 * Consumer name - identifies our application in the contracts
 */
export const CONSUMER_NAME = 'medicalcor-integrations';

/**
 * Common Pact configuration for all providers
 */
export interface PactProviderConfig {
  provider: string;
  logLevel?: LogLevel;
}

/**
 * Create a new Pact instance for a provider
 */
export function createPact(config: PactProviderConfig): PactV4 {
  return new PactV4({
    consumer: CONSUMER_NAME,
    provider: config.provider,
    dir: PACT_DIR,
    logLevel: config.logLevel ?? 'warn',
  });
}

/**
 * HubSpot Provider Configuration
 */
export const HUBSPOT_PROVIDER = 'hubspot-api';

/**
 * Stripe Provider Configuration
 */
export const STRIPE_PROVIDER = 'stripe-api';

/**
 * Common response matchers for HubSpot
 */
export const HubSpotMatchers = {
  /**
   * Match a HubSpot contact object
   */
  contact: () =>
    Matchers.like({
      id: Matchers.string('12345'),
      properties: Matchers.like({
        phone: Matchers.string('+40721000001'),
        email: Matchers.string('test@example.com'),
        firstname: Matchers.string('Test'),
        lastname: Matchers.string('User'),
      }),
      createdAt: Matchers.datetime(),
      updatedAt: Matchers.datetime(),
    }),

  /**
   * Match a HubSpot search response
   */
  searchResponse: (total: number = 1) =>
    Matchers.like({
      total: Matchers.integer(total),
      results: Matchers.eachLike(HubSpotMatchers.contact()),
    }),

  /**
   * Match an empty search response
   */
  emptySearchResponse: () => ({
    total: 0,
    results: [],
  }),

  /**
   * Match a HubSpot task object
   */
  task: () =>
    Matchers.like({
      id: Matchers.string('task_123'),
      properties: Matchers.like({
        hs_task_subject: Matchers.string('Follow up'),
        hs_task_priority: Matchers.string('MEDIUM'),
      }),
      createdAt: Matchers.datetime(),
    }),

  /**
   * Match a HubSpot note object
   */
  note: () =>
    Matchers.like({
      id: Matchers.string('note_123'),
      properties: Matchers.like({}),
      createdAt: Matchers.datetime(),
    }),
};

/**
 * Common response matchers for Stripe
 */
export const StripeMatchers = {
  /**
   * Match a Stripe charge object
   */
  charge: () =>
    Matchers.like({
      id: Matchers.regex(/^ch_[a-zA-Z0-9]+$/, 'ch_test123'),
      object: 'charge',
      amount: Matchers.integer(10000),
      amount_captured: Matchers.integer(10000),
      currency: Matchers.string('ron'),
      status: Matchers.string('succeeded'),
      created: Matchers.integer(Math.floor(Date.now() / 1000)),
      paid: Matchers.boolean(true),
      refunded: Matchers.boolean(false),
    }),

  /**
   * Match a Stripe charge list response
   */
  chargeListResponse: (hasMore: boolean = false) =>
    Matchers.like({
      object: 'list',
      data: Matchers.eachLike(StripeMatchers.charge()),
      has_more: Matchers.boolean(hasMore),
    }),

  /**
   * Match an empty charge list response
   */
  emptyChargeListResponse: () => ({
    object: 'list',
    data: [],
    has_more: false,
  }),

  /**
   * Match a Stripe payment intent object
   */
  paymentIntent: () =>
    Matchers.like({
      id: Matchers.regex(/^pi_[a-zA-Z0-9]+$/, 'pi_test123'),
      object: 'payment_intent',
      amount: Matchers.integer(50000),
      currency: Matchers.string('ron'),
      status: Matchers.string('succeeded'),
      customer: Matchers.regex(/^cus_[a-zA-Z0-9]+$/, 'cus_test123'),
    }),

  /**
   * Match a Stripe customer object
   */
  customer: () =>
    Matchers.like({
      id: Matchers.regex(/^cus_[a-zA-Z0-9]+$/, 'cus_test123'),
      object: 'customer',
      email: Matchers.string('test@example.com'),
      name: Matchers.string('Test Customer'),
    }),
};

/**
 * Common HTTP headers for HubSpot API
 */
export const hubspotHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer test-access-token',
};

/**
 * Common HTTP headers for Stripe API
 */
export const stripeHeaders = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Authorization: 'Bearer sk_test_123456789',
};

/**
 * Helper to create a minimal HubSpot client config for testing
 */
export function createTestHubSpotConfig(port: number) {
  return {
    accessToken: 'test-access-token',
    portalId: 'test-portal',
    // Note: In real tests, we override the base URL to point to Pact mock server
    // HubSpot client normally blocks custom URLs for SSRF prevention
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 100,
    },
  };
}

/**
 * Helper to create a minimal Stripe client config for testing
 */
export function createTestStripeConfig(port: number) {
  return {
    secretKey: 'sk_test_123456789',
    webhookSecret: 'whsec_test_secret',
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 100,
    },
    timeoutMs: 5000,
  };
}
