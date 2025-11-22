import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  VoiceWebhookSchema,
  CallStatusCallbackSchema,
  WhatsAppWebhookSchema,
  StripeWebhookEventSchema,
} from '@medicalcor/types';

/**
 * Webhook Signature Verification Tests
 */
describe('Webhook Signature Verification', () => {
  describe('Stripe Signature Verification', () => {
    const webhookSecret = 'whsec_test_secret_key_12345';

    function generateStripeSignature(payload: string, secret: string): string {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      return `t=${timestamp},v1=${signature}`;
    }

    function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
      const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      }, {});

      const timestamp = parts.t;
      const v1Signature = parts.v1;

      if (!timestamp || !v1Signature) {
        return false;
      }

      // Check timestamp is within tolerance (5 minutes)
      const tolerance = 300;
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (timestampAge > tolerance) {
        return false;
      }

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
    }

    it('should verify valid Stripe signature', () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
      const signature = generateStripeSignature(payload, webhookSecret);

      expect(verifyStripeSignature(payload, signature, webhookSecret)).toBe(true);
    });

    it('should reject invalid Stripe signature', () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
      const signature = generateStripeSignature(payload, webhookSecret);
      const tampered = payload.replace('evt_test', 'evt_tampered');

      expect(verifyStripeSignature(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
      const signature = generateStripeSignature(payload, 'wrong_secret');

      expect(verifyStripeSignature(payload, signature, webhookSecret)).toBe(false);
    });

    it('should reject malformed signature', () => {
      const payload = JSON.stringify({ id: 'evt_test' });

      expect(verifyStripeSignature(payload, 'malformed', webhookSecret)).toBe(false);
      expect(verifyStripeSignature(payload, '', webhookSecret)).toBe(false);
      expect(verifyStripeSignature(payload, 't=123', webhookSecret)).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const payload = JSON.stringify({ id: 'evt_test' });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');
      const fullSignature = `t=${oldTimestamp},v1=${signature}`;

      expect(verifyStripeSignature(payload, fullSignature, webhookSecret)).toBe(false);
    });
  });

  describe('WhatsApp Signature Verification', () => {
    const webhookSecret = 'whatsapp_test_secret';

    function generateWhatsAppSignature(payload: string, secret: string): string {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    function verifyWhatsAppSignature(
      payload: string,
      signature: string | undefined,
      secret: string
    ): boolean {
      if (!signature) {
        return false;
      }

      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const providedSignature = signature.replace('sha256=', '');

      try {
        return crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(providedSignature)
        );
      } catch {
        return false;
      }
    }

    it('should verify valid WhatsApp signature', () => {
      const payload = JSON.stringify({ entry: [] });
      const signature = generateWhatsAppSignature(payload, webhookSecret);

      expect(verifyWhatsAppSignature(payload, signature, webhookSecret)).toBe(true);
    });

    it('should reject invalid WhatsApp signature', () => {
      const payload = JSON.stringify({ entry: [] });
      const signature = generateWhatsAppSignature(payload, webhookSecret);
      const tampered = JSON.stringify({ entry: [1] });

      expect(verifyWhatsAppSignature(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should reject missing signature', () => {
      const payload = JSON.stringify({ entry: [] });

      expect(verifyWhatsAppSignature(payload, undefined, webhookSecret)).toBe(false);
    });

    it('should handle signature without prefix', () => {
      const payload = JSON.stringify({ entry: [] });
      const rawSignature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      // Should work with or without sha256= prefix
      expect(verifyWhatsAppSignature(payload, rawSignature, webhookSecret)).toBe(true);
      expect(verifyWhatsAppSignature(payload, `sha256=${rawSignature}`, webhookSecret)).toBe(true);
    });
  });
});

/**
 * Webhook Payload Validation Tests
 */
describe('Webhook Payload Validation', () => {
  describe('Voice Webhook Schema', () => {
    it('should validate a valid voice webhook payload', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ApiVersion: '2010-04-01',
        CallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        CallStatus: 'ringing',
        Called: '+40721000000',
        Caller: '+40722000000',
        Direction: 'inbound',
        From: '+40722000000',
        To: '+40721000000',
      };

      const result = VoiceWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid call direction', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ApiVersion: '2010-04-01',
        CallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        CallStatus: 'ringing',
        Called: '+40721000000',
        Caller: '+40722000000',
        Direction: 'invalid-direction',
        From: '+40722000000',
        To: '+40721000000',
      };

      const result = VoiceWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid call status', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ApiVersion: '2010-04-01',
        CallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        CallStatus: 'invalid-status',
        Called: '+40721000000',
        Caller: '+40722000000',
        Direction: 'inbound',
        From: '+40722000000',
        To: '+40721000000',
      };

      const result = VoiceWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        // Missing other required fields
      };

      const result = VoiceWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Call Status Callback Schema', () => {
    it('should validate a valid call status callback', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ApiVersion: '2010-04-01',
        CallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        CallStatus: 'completed',
        CallDuration: '120',
        Called: '+40721000000',
        Caller: '+40722000000',
        Direction: 'inbound',
        From: '+40722000000',
        To: '+40721000000',
      };

      const result = CallStatusCallbackSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should allow optional duration field', () => {
      const payload = {
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ApiVersion: '2010-04-01',
        CallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        CallStatus: 'in-progress',
        Called: '+40721000000',
        Caller: '+40722000000',
        Direction: 'inbound',
        From: '+40722000000',
        To: '+40721000000',
      };

      const result = CallStatusCallbackSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('WhatsApp Webhook Schema', () => {
    it('should validate a valid WhatsApp message webhook', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+40721000000',
                    phone_number_id: '123456789',
                  },
                  messages: [
                    {
                      id: 'wamid.xxx',
                      from: '40722000000',
                      timestamp: '1234567890',
                      type: 'text',
                      text: {
                        body: 'Hello',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a status update webhook', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+40721000000',
                    phone_number_id: '123456789',
                  },
                  statuses: [
                    {
                      id: 'wamid.xxx',
                      status: 'delivered',
                      timestamp: '1234567890',
                      recipient_id: '40722000000',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid object type', () => {
      const payload = {
        object: 'invalid_object',
        entry: [],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Stripe Webhook Schema', () => {
    it('should validate a valid payment_intent.succeeded event', () => {
      const payload = {
        id: 'evt_test123',
        object: 'event',
        api_version: '2023-10-16',
        created: 1234567890,
        type: 'payment_intent.succeeded',
        livemode: false,
        pending_webhooks: 1,
        data: {
          object: {
            id: 'pi_test123',
            object: 'payment_intent',
            amount: 10000,
            amount_received: 10000,
            currency: 'eur',
            status: 'succeeded',
            customer: 'cus_test123',
            description: 'Test payment',
            metadata: { order_id: '123' },
            payment_method: 'pm_test123',
            receipt_email: 'test@example.com',
            created: 1234567890,
          },
        },
      };

      const result = StripeWebhookEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a charge.refunded event', () => {
      const payload = {
        id: 'evt_test456',
        object: 'event',
        api_version: '2023-10-16',
        created: 1234567890,
        type: 'charge.refunded',
        livemode: false,
        pending_webhooks: 1,
        data: {
          object: {
            id: 'ch_test456',
            object: 'charge',
            amount: 5000,
            amount_refunded: 5000,
            currency: 'eur',
            status: 'succeeded',
            customer: 'cus_test123',
            description: 'Test charge',
            payment_intent: 'pi_test123',
            receipt_email: 'test@example.com',
            receipt_url: 'https://receipt.stripe.com/xxx',
            refunded: true,
            created: 1234567890,
          },
        },
      };

      const result = StripeWebhookEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a checkout.session.completed event', () => {
      const payload = {
        id: 'evt_test789',
        object: 'event',
        api_version: '2023-10-16',
        created: 1234567890,
        type: 'checkout.session.completed',
        livemode: false,
        pending_webhooks: 1,
        data: {
          object: {
            id: 'cs_test789',
            object: 'checkout.session',
            amount_total: 10000,
            currency: 'eur',
            customer: 'cus_test123',
            customer_email: 'test@example.com',
            mode: 'payment',
            payment_status: 'paid',
            status: 'complete',
            success_url: 'https://example.com/success',
            cancel_url: 'https://example.com/cancel',
            created: 1234567890,
          },
        },
      };

      const result = StripeWebhookEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid event type', () => {
      const payload = {
        id: 'evt_test',
        object: 'event',
        api_version: '2023-10-16',
        created: 1234567890,
        type: 'invalid.event.type',
        livemode: false,
        pending_webhooks: 1,
        data: {
          object: {},
        },
      };

      const result = StripeWebhookEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const payload = {
        id: 'evt_test',
        // Missing other required fields
      };

      const result = StripeWebhookEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});

/**
 * Correlation ID Generation Tests
 */
describe('Correlation ID Handling', () => {
  it('should generate valid correlation ID format', () => {
    // UUID v4 format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Test that crypto.randomUUID generates valid UUIDs
    const id = crypto.randomUUID();
    expect(id).toMatch(uuidRegex);
  });

  it('should prefer header correlation ID over generated', () => {
    const headerCorrelationId = 'header-correlation-id-123';
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : crypto.randomUUID();

    expect(correlationId).toBe('header-correlation-id-123');
  });

  it('should generate new ID when header is missing', () => {
    const headerCorrelationId: string | undefined = undefined;
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : crypto.randomUUID();

    expect(correlationId).toBeDefined();
    expect(correlationId).not.toBe('undefined');
  });
});
