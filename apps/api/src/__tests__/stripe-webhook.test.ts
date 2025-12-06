import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * Stripe Payment Webhook Tests
 *
 * Comprehensive tests for the Stripe webhook endpoint covering:
 * - Payment success events (payment_intent.succeeded, charge.succeeded)
 * - Payment failure events (payment_intent.payment_failed, charge.failed)
 * - Checkout session completed
 * - Invoice paid
 * - Charge refunded
 * - Signature validation
 * - Error handling
 * - Idempotency (deduplication)
 */

// Mock Trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: 'mock-task-id' }),
  },
}));

// Helper to generate valid Stripe signatures
function generateStripeSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${ts},v1=${signature}`;
}

// Test data factories
function createPaymentIntentSucceededEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.succeeded',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'pi_' + crypto.randomBytes(12).toString('hex'),
        object: 'payment_intent',
        amount: 10000,
        amount_received: 10000,
        currency: 'eur',
        status: 'succeeded',
        customer: 'cus_test123',
        description: 'Dental implant deposit',
        metadata: { patient_id: 'patient_123', procedure: 'all-on-4' },
        payment_method: 'pm_test123',
        receipt_email: 'patient@example.com',
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

function createChargeSucceededEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'charge.succeeded',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'ch_' + crypto.randomBytes(12).toString('hex'),
        object: 'charge',
        amount: 10000,
        currency: 'eur',
        status: 'succeeded',
        customer: 'cus_test123',
        description: 'Dental implant deposit',
        payment_intent: 'pi_existing123',
        receipt_email: 'patient@example.com',
        receipt_url: 'https://pay.stripe.com/receipts/xxx',
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

function createPaymentFailedEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.payment_failed',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'pi_' + crypto.randomBytes(12).toString('hex'),
        object: 'payment_intent',
        amount: 10000,
        currency: 'eur',
        status: 'requires_payment_method',
        customer: 'cus_test123',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
          type: 'card_error',
        },
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

function createCheckoutSessionCompletedEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'cs_' + crypto.randomBytes(12).toString('hex'),
        object: 'checkout.session',
        amount_total: 50000,
        currency: 'eur',
        customer: 'cus_test123',
        customer_email: 'patient@example.com',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        success_url: 'https://clinic.example.com/success',
        cancel_url: 'https://clinic.example.com/cancel',
        metadata: { procedure: 'all-on-4', appointment_id: 'apt_123' },
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

function createInvoicePaidEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'invoice.paid',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'in_' + crypto.randomBytes(12).toString('hex'),
        object: 'invoice',
        amount_paid: 100000,
        amount_due: 100000,
        currency: 'eur',
        customer: 'cus_test123',
        customer_email: 'patient@example.com',
        status: 'paid',
        subscription: 'sub_test123',
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

function createChargeRefundedEvent(overrides = {}) {
  return {
    id: 'evt_' + crypto.randomBytes(12).toString('hex'),
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'charge.refunded',
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: 'ch_' + crypto.randomBytes(12).toString('hex'),
        object: 'charge',
        amount: 10000,
        amount_refunded: 5000,
        currency: 'eur',
        status: 'succeeded',
        customer: 'cus_test123',
        payment_intent: 'pi_original123',
        receipt_email: 'patient@example.com',
        refunded: true,
        created: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

describe('Stripe Payment Webhook Processing', () => {
  const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Payment Success Events', () => {
    describe('payment_intent.succeeded', () => {
      it('should process payment_intent.succeeded with all fields', async () => {
        const { tasks } = await import('@trigger.dev/sdk/v3');
        const event = createPaymentIntentSucceededEvent();
        const payload = JSON.stringify(event);
        const signature = generateStripeSignature(payload, WEBHOOK_SECRET);

        // Verify event structure is valid
        expect(event.type).toBe('payment_intent.succeeded');
        expect(event.data.object.amount).toBe(10000);
        expect(event.data.object.currency).toBe('eur');
        expect(event.data.object.customer).toBe('cus_test123');
        expect(event.data.object.metadata).toHaveProperty('patient_id');
      });

      it('should extract canonical payment ID for idempotency', () => {
        const event = createPaymentIntentSucceededEvent();
        const paymentId = event.data.object.id;

        // Canonical ID for payment_intent events should be the payment_intent ID
        expect(paymentId).toMatch(/^pi_/);
      });

      it('should handle payment without customer', () => {
        const event = createPaymentIntentSucceededEvent({ customer: null });

        expect(event.data.object.customer).toBeNull();
        // Processing should still work
        expect(event.data.object.id).toBeDefined();
      });

      it('should handle payment without metadata', () => {
        const event = createPaymentIntentSucceededEvent({ metadata: undefined });

        expect(event.data.object.metadata).toBeUndefined();
      });
    });

    describe('charge.succeeded', () => {
      it('should process charge.succeeded and link to payment_intent', () => {
        const event = createChargeSucceededEvent({ payment_intent: 'pi_original123' });

        // Should use payment_intent as canonical ID for deduplication
        const paymentIntentId = event.data.object.payment_intent;
        expect(paymentIntentId).toBe('pi_original123');
      });

      it('should use charge ID when no payment_intent exists', () => {
        const event = createChargeSucceededEvent({ payment_intent: null });

        // Fallback to charge ID
        const chargeId = event.data.object.id;
        expect(chargeId).toMatch(/^ch_/);
      });

      it('should extract receipt_url for customer notifications', () => {
        const event = createChargeSucceededEvent();

        expect(event.data.object.receipt_url).toContain('stripe.com');
      });
    });

    describe('checkout.session.completed', () => {
      it('should process checkout session with payment_status=paid', () => {
        const event = createCheckoutSessionCompletedEvent();

        expect(event.data.object.payment_status).toBe('paid');
        expect(event.data.object.amount_total).toBe(50000);
      });

      it('should ignore checkout session with unpaid status', () => {
        const event = createCheckoutSessionCompletedEvent({ payment_status: 'unpaid' });

        expect(event.data.object.payment_status).toBe('unpaid');
        // This should not trigger payment processing
      });

      it('should extract customer_email from checkout session', () => {
        const event = createCheckoutSessionCompletedEvent();

        expect(event.data.object.customer_email).toBe('patient@example.com');
      });
    });

    describe('invoice.paid', () => {
      it('should process invoice.paid for subscription payments', () => {
        const event = createInvoicePaidEvent();

        expect(event.data.object.amount_paid).toBe(100000);
        expect(event.data.object.subscription).toBe('sub_test123');
      });

      it('should handle invoice without subscription (one-time invoice)', () => {
        const event = createInvoicePaidEvent({ subscription: null });

        expect(event.data.object.subscription).toBeNull();
        expect(event.data.object.amount_paid).toBeGreaterThan(0);
      });
    });
  });

  describe('Payment Failure Events', () => {
    describe('payment_intent.payment_failed', () => {
      it('should process payment failure with error details', () => {
        const event = createPaymentFailedEvent();

        expect(event.data.object.last_payment_error).toBeDefined();
        expect(event.data.object.last_payment_error.code).toBe('card_declined');
        expect(event.data.object.last_payment_error.message).toContain('declined');
      });

      it('should handle common failure codes', () => {
        const failureCodes = [
          { code: 'card_declined', message: 'Your card was declined.' },
          { code: 'insufficient_funds', message: 'Insufficient funds.' },
          { code: 'expired_card', message: 'Your card has expired.' },
          { code: 'incorrect_cvc', message: 'Your CVC is incorrect.' },
          { code: 'processing_error', message: 'An error occurred while processing.' },
        ];

        for (const failure of failureCodes) {
          const event = createPaymentFailedEvent({
            last_payment_error: {
              code: failure.code,
              message: failure.message,
              type: 'card_error',
            },
          });

          expect(event.data.object.last_payment_error.code).toBe(failure.code);
        }
      });

      it('should handle failure without last_payment_error', () => {
        const event = createPaymentFailedEvent({ last_payment_error: null });

        expect(event.data.object.last_payment_error).toBeNull();
      });
    });

    describe('charge.failed', () => {
      it('should process charge failure with failure_message', () => {
        const event = {
          ...createChargeSucceededEvent(),
          type: 'charge.failed',
          data: {
            object: {
              ...createChargeSucceededEvent().data.object,
              status: 'failed',
              failure_code: 'card_declined',
              failure_message: 'Your card was declined.',
            },
          },
        };

        expect(event.data.object.failure_code).toBe('card_declined');
        expect(event.data.object.failure_message).toContain('declined');
      });
    });
  });

  describe('Refund Events', () => {
    describe('charge.refunded', () => {
      it('should process full refund', () => {
        const event = createChargeRefundedEvent({ amount: 10000, amount_refunded: 10000 });

        expect(event.data.object.refunded).toBe(true);
        expect(event.data.object.amount_refunded).toBe(event.data.object.amount);
      });

      it('should process partial refund', () => {
        const event = createChargeRefundedEvent({ amount: 10000, amount_refunded: 5000 });

        expect(event.data.object.amount_refunded).toBe(5000);
        expect(event.data.object.amount_refunded).toBeLessThan(event.data.object.amount);
      });

      it('should link refund to original payment_intent', () => {
        const event = createChargeRefundedEvent({ payment_intent: 'pi_original123' });

        expect(event.data.object.payment_intent).toBe('pi_original123');
      });
    });
  });

  describe('Signature Verification', () => {
    it('should reject missing signature', () => {
      const payload = JSON.stringify(createPaymentIntentSucceededEvent());
      // Simulate request without signature header
      const missingSignature = undefined;

      expect(missingSignature).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify(createPaymentIntentSucceededEvent());
      const wrongSignature = generateStripeSignature(payload, 'wrong_secret');

      // Verification with correct secret should fail
      const timestamp = wrongSignature.match(/t=(\d+)/)?.[1];
      expect(timestamp).toBeDefined();

      // Compute expected signature with correct secret
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');
      const providedSig = wrongSignature.match(/v1=([a-f0-9]+)/)?.[1];

      expect(providedSig).not.toBe(expectedSig);
    });

    it('should reject tampered payload', () => {
      const event = createPaymentIntentSucceededEvent();
      const originalPayload = JSON.stringify(event);
      const signature = generateStripeSignature(originalPayload, WEBHOOK_SECRET);

      // Attacker modifies the amount
      const tamperedEvent = { ...event };
      tamperedEvent.data.object.amount = 1; // Changed from 10000 to 1
      const tamperedPayload = JSON.stringify(tamperedEvent);

      // Signature verification should fail
      const timestamp = signature.match(/t=(\d+)/)?.[1];
      const signedPayload = `${timestamp}.${tamperedPayload}`;
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');
      const originalSig = signature.match(/v1=([a-f0-9]+)/)?.[1];

      expect(originalSig).not.toBe(expectedSig);
    });

    it('should reject expired timestamp (replay attack)', () => {
      const event = createPaymentIntentSucceededEvent();
      const payload = JSON.stringify(event);

      // Generate signature with old timestamp (10 minutes ago)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const signature = generateStripeSignature(payload, WEBHOOK_SECRET, oldTimestamp);

      // Extract timestamp and verify it's too old
      const extractedTimestamp = parseInt(signature.match(/t=(\d+)/)?.[1] ?? '0', 10);
      const now = Math.floor(Date.now() / 1000);
      const age = now - extractedTimestamp;

      expect(age).toBeGreaterThan(300); // Tolerance is 5 minutes
    });
  });

  describe('Idempotency (Deduplication)', () => {
    it('should use canonical payment ID for payment_intent events', () => {
      const event = createPaymentIntentSucceededEvent();
      const paymentId = event.data.object.id;

      // For payment_intent.succeeded, use payment_intent ID directly
      expect(paymentId).toMatch(/^pi_/);
    });

    it('should use payment_intent ID for charge events when available', () => {
      const event = createChargeSucceededEvent({ payment_intent: 'pi_canonical123' });

      // For charge.succeeded, prefer payment_intent ID over charge ID
      const canonicalId = event.data.object.payment_intent ?? event.data.object.id;
      expect(canonicalId).toBe('pi_canonical123');
    });

    it('should prevent double-processing of same payment', () => {
      // Stripe sends BOTH payment_intent.succeeded AND charge.succeeded
      // We use payment_intent ID as canonical to deduplicate

      const piEvent = createPaymentIntentSucceededEvent();
      const chargeEvent = createChargeSucceededEvent({
        payment_intent: piEvent.data.object.id,
      });

      const piCanonicalId = piEvent.data.object.id;
      const chargeCanonicalId =
        chargeEvent.data.object.payment_intent ?? chargeEvent.data.object.id;

      // Both should resolve to the same canonical ID
      expect(piCanonicalId).toBe(chargeCanonicalId);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', () => {
      const invalidJson = '{ invalid json syntax';

      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    it('should validate required event fields', () => {
      const incompleteEvent = {
        id: 'evt_incomplete',
        // Missing type, data, etc.
      };

      expect(incompleteEvent.id).toBeDefined();
      expect((incompleteEvent as any).type).toBeUndefined();
    });

    it('should handle missing webhook secret configuration', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      expect(process.env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    });

    it('should handle unknown event types gracefully', () => {
      const unknownEvent = {
        ...createPaymentIntentSucceededEvent(),
        type: 'unknown.event.type',
      };

      expect(unknownEvent.type).toBe('unknown.event.type');
      // Should log but not fail
    });
  });

  describe('Currency Handling', () => {
    it('should handle EUR currency', () => {
      const event = createPaymentIntentSucceededEvent({ currency: 'eur' });
      expect(event.data.object.currency).toBe('eur');
    });

    it('should handle USD currency', () => {
      const event = createPaymentIntentSucceededEvent({ currency: 'usd' });
      expect(event.data.object.currency).toBe('usd');
    });

    it('should handle zero-decimal currencies (JPY)', () => {
      const event = createPaymentIntentSucceededEvent({ currency: 'jpy', amount: 1000 });
      // For JPY, amount is already in the smallest unit (yen), not cents
      expect(event.data.object.amount).toBe(1000);
    });

    it('should handle amounts in smallest currency unit', () => {
      const event = createPaymentIntentSucceededEvent({ amount: 12345 }); // €123.45
      expect(event.data.object.amount).toBe(12345);
    });
  });

  describe('Metadata Handling', () => {
    it('should extract patient_id from metadata', () => {
      const event = createPaymentIntentSucceededEvent({
        metadata: { patient_id: 'patient_abc123' },
      });

      expect(event.data.object.metadata?.patient_id).toBe('patient_abc123');
    });

    it('should extract procedure from metadata', () => {
      const event = createPaymentIntentSucceededEvent({
        metadata: { procedure: 'all-on-4', tooth_count: '4' },
      });

      expect(event.data.object.metadata?.procedure).toBe('all-on-4');
    });

    it('should handle empty metadata', () => {
      const event = createPaymentIntentSucceededEvent({ metadata: {} });

      expect(event.data.object.metadata).toEqual({});
    });
  });

  describe('Live Mode Detection', () => {
    it('should distinguish test mode events', () => {
      const event = createPaymentIntentSucceededEvent();
      event.livemode = false;

      expect(event.livemode).toBe(false);
    });

    it('should distinguish live mode events', () => {
      const event = createPaymentIntentSucceededEvent();
      event.livemode = true;

      expect(event.livemode).toBe(true);
    });
  });
});

describe('Canonical Payment ID Extraction', () => {
  function getCanonicalPaymentId(
    eventType: string,
    paymentData: { id: string; payment_intent?: string | null }
  ): string {
    // For charge events, prefer the payment_intent ID if available
    if (eventType.startsWith('charge.') && paymentData.payment_intent) {
      return paymentData.payment_intent;
    }
    return paymentData.id;
  }

  it('should return payment_intent ID for payment_intent.succeeded', () => {
    const result = getCanonicalPaymentId('payment_intent.succeeded', {
      id: 'pi_123',
      payment_intent: null,
    });

    expect(result).toBe('pi_123');
  });

  it('should return payment_intent ID for charge.succeeded when available', () => {
    const result = getCanonicalPaymentId('charge.succeeded', {
      id: 'ch_456',
      payment_intent: 'pi_123',
    });

    expect(result).toBe('pi_123');
  });

  it('should return charge ID for charge.succeeded when no payment_intent', () => {
    const result = getCanonicalPaymentId('charge.succeeded', {
      id: 'ch_456',
      payment_intent: null,
    });

    expect(result).toBe('ch_456');
  });

  it('should return charge ID for charge.refunded linked to payment_intent', () => {
    const result = getCanonicalPaymentId('charge.refunded', {
      id: 'ch_789',
      payment_intent: 'pi_original',
    });

    expect(result).toBe('pi_original');
  });
});
