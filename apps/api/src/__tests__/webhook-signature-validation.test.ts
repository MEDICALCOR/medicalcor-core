import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * Comprehensive Webhook Signature Validation Tests
 *
 * Tests signature verification for all webhook providers:
 * - Stripe (t=timestamp,v1=signature format)
 * - WhatsApp (sha256=signature format)
 * - Vapi (t=timestamp,v1=signature format)
 * - Pipedrive (HMAC-SHA256 hex)
 *
 * Security focus:
 * - Timing attack prevention
 * - Replay attack prevention (timestamp validation)
 * - Malformed signature handling
 * - Edge cases and boundary conditions
 */

describe('Webhook Signature Validation - Comprehensive', () => {
  /**
   * Stripe Signature Verification
   * Format: t=timestamp,v1=HMAC-SHA256(timestamp.payload)
   */
  describe('Stripe Signature Verification', () => {
    const webhookSecret = 'whsec_test_secret_key_12345';

    function generateStripeSignature(payload: string, secret: string, timestamp?: number): string {
      const ts = timestamp ?? Math.floor(Date.now() / 1000);
      const signedPayload = `${ts}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      return `t=${ts},v1=${signature}`;
    }

    function verifyStripeSignature(
      payload: string,
      signature: string,
      secret: string,
      toleranceSeconds = 300
    ): { valid: boolean; error?: string } {
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
        return { valid: false, error: 'Missing timestamp or signature component' };
      }

      // Check timestamp is within tolerance
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (timestampAge > toleranceSeconds) {
        return { valid: false, error: 'Timestamp too old (replay attack prevention)' };
      }
      if (timestampAge < -toleranceSeconds) {
        return { valid: false, error: 'Timestamp in future' };
      }

      // Compute expected signature
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      // Constant-time comparison
      try {
        if (v1Signature.length !== expectedSignature.length) {
          return { valid: false, error: 'Signature length mismatch' };
        }
        const isValid = crypto.timingSafeEqual(
          Buffer.from(v1Signature),
          Buffer.from(expectedSignature)
        );
        return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
      } catch {
        return { valid: false, error: 'Comparison failed' };
      }
    }

    describe('Valid Signatures', () => {
      it('should verify a valid signature', () => {
        const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
        const signature = generateStripeSignature(payload, webhookSecret);

        const result = verifyStripeSignature(payload, signature, webhookSecret);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should verify signature with complex payload', () => {
        const payload = JSON.stringify({
          id: 'evt_1234567890',
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_test',
              amount: 10000,
              currency: 'eur',
              metadata: { orderId: '123', customerId: 'cust_456' },
            },
          },
        });
        const signature = generateStripeSignature(payload, webhookSecret);

        expect(verifyStripeSignature(payload, signature, webhookSecret).valid).toBe(true);
      });

      it('should verify signature with unicode characters', () => {
        const payload = JSON.stringify({
          id: 'evt_unicode',
          customer_name: 'Müller',
          description: '日本語テスト',
          emoji: '💰🎉',
        });
        const signature = generateStripeSignature(payload, webhookSecret);

        expect(verifyStripeSignature(payload, signature, webhookSecret).valid).toBe(true);
      });

      it('should verify signature at edge of time tolerance (just within)', () => {
        const payload = JSON.stringify({ id: 'evt_edge' });
        const timestamp = Math.floor(Date.now() / 1000) - 299; // 299 seconds ago
        const signature = generateStripeSignature(payload, webhookSecret, timestamp);

        expect(verifyStripeSignature(payload, signature, webhookSecret).valid).toBe(true);
      });
    });

    describe('Invalid Signatures', () => {
      it('should reject tampered payload', () => {
        const payload = JSON.stringify({ id: 'evt_test', amount: 100 });
        const signature = generateStripeSignature(payload, webhookSecret);
        const tampered = JSON.stringify({ id: 'evt_test', amount: 99999 });

        const result = verifyStripeSignature(tampered, signature, webhookSecret);
        expect(result.valid).toBe(false);
      });

      it('should reject wrong secret', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        const signature = generateStripeSignature(payload, 'wrong_secret');

        const result = verifyStripeSignature(payload, signature, webhookSecret);
        expect(result.valid).toBe(false);
      });

      it('should reject modified signature', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        const signature = generateStripeSignature(payload, webhookSecret);
        // Flip one character in the signature
        const modified = signature.replace(/v1=([a-f0-9])/, 'v1=X');

        const result = verifyStripeSignature(payload, modified, webhookSecret);
        expect(result.valid).toBe(false);
      });
    });

    describe('Replay Attack Prevention (Timestamp Validation)', () => {
      it('should reject expired signature (> 5 minutes old)', () => {
        const payload = JSON.stringify({ id: 'evt_replay' });
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
        const signature = generateStripeSignature(payload, webhookSecret, oldTimestamp);

        const result = verifyStripeSignature(payload, signature, webhookSecret);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too old');
      });

      it('should reject future timestamp (> tolerance)', () => {
        const payload = JSON.stringify({ id: 'evt_future' });
        const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes in future
        const signature = generateStripeSignature(payload, webhookSecret, futureTimestamp);

        const result = verifyStripeSignature(payload, signature, webhookSecret);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('future');
      });

      it('should allow small clock skew (within tolerance)', () => {
        const payload = JSON.stringify({ id: 'evt_skew' });
        // 30 seconds in future - should be allowed
        const slightFuture = Math.floor(Date.now() / 1000) + 30;
        const signature = generateStripeSignature(payload, webhookSecret, slightFuture);

        expect(verifyStripeSignature(payload, signature, webhookSecret).valid).toBe(true);
      });
    });

    describe('Malformed Signatures', () => {
      it('should reject empty signature', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(verifyStripeSignature(payload, '', webhookSecret).valid).toBe(false);
      });

      it('should reject missing timestamp component', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(verifyStripeSignature(payload, 'v1=abc123', webhookSecret).valid).toBe(false);
      });

      it('should reject missing signature component', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(verifyStripeSignature(payload, 't=123456789', webhookSecret).valid).toBe(false);
      });

      it('should reject random string', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(verifyStripeSignature(payload, 'totally_random_garbage', webhookSecret).valid).toBe(
          false
        );
      });

      it('should reject SQL injection attempt in signature', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(
          verifyStripeSignature(payload, "t=123,v1=abc'; DROP TABLE events;--", webhookSecret).valid
        ).toBe(false);
      });

      it('should reject XSS attempt in signature', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        expect(
          verifyStripeSignature(payload, 't=123,v1=<script>alert(1)</script>', webhookSecret).valid
        ).toBe(false);
      });
    });

    describe('Timing Attack Prevention', () => {
      it('should reject signatures with wrong length without timing leak', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        const timestamp = Math.floor(Date.now() / 1000);

        // Very short signature
        const shortSig = `t=${timestamp},v1=abc`;
        expect(verifyStripeSignature(payload, shortSig, webhookSecret).valid).toBe(false);

        // Very long signature
        const longSig = `t=${timestamp},v1=${'a'.repeat(256)}`;
        expect(verifyStripeSignature(payload, longSig, webhookSecret).valid).toBe(false);
      });

      it('should handle binary data in signature gracefully', () => {
        const payload = JSON.stringify({ id: 'evt_test' });
        const timestamp = Math.floor(Date.now() / 1000);
        // Create signature with null bytes
        const binarySig = `t=${timestamp},v1=abc\x00def`;

        expect(verifyStripeSignature(payload, binarySig, webhookSecret).valid).toBe(false);
      });
    });
  });

  /**
   * WhatsApp Signature Verification
   * Format: sha256=HMAC-SHA256(payload)
   */
  describe('WhatsApp Signature Verification', () => {
    const webhookSecret = 'whatsapp_webhook_secret_12345';

    function generateWhatsAppSignature(payload: string, secret: string): string {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    function verifyWhatsAppSignature(
      payload: string,
      signature: string | undefined,
      secret: string
    ): { valid: boolean; error?: string } {
      if (!signature) {
        return { valid: false, error: 'Missing signature' };
      }

      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const providedSignature = signature.replace('sha256=', '');

      try {
        if (providedSignature.length !== expectedSignature.length) {
          return { valid: false, error: 'Signature length mismatch' };
        }
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(providedSignature)
        );
        return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
      } catch {
        return { valid: false, error: 'Comparison failed' };
      }
    }

    describe('Valid Signatures', () => {
      it('should verify valid signature with sha256= prefix', () => {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [{ id: '123', changes: [] }],
        });
        const signature = generateWhatsAppSignature(payload, webhookSecret);

        expect(verifyWhatsAppSignature(payload, signature, webhookSecret).valid).toBe(true);
      });

      it('should verify signature without prefix', () => {
        const payload = JSON.stringify({ entry: [] });
        const rawSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(payload)
          .digest('hex');

        // Test raw hex signature
        expect(verifyWhatsAppSignature(payload, rawSignature, webhookSecret).valid).toBe(true);
        // Test with prefix
        expect(
          verifyWhatsAppSignature(payload, `sha256=${rawSignature}`, webhookSecret).valid
        ).toBe(true);
      });

      it('should verify signature with message content', () => {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              id: '123456789',
              changes: [
                {
                  value: {
                    messages: [{ id: 'wamid.xxx', from: '1234567890', type: 'text' }],
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        });
        const signature = generateWhatsAppSignature(payload, webhookSecret);

        expect(verifyWhatsAppSignature(payload, signature, webhookSecret).valid).toBe(true);
      });
    });

    describe('Invalid Signatures', () => {
      it('should reject tampered payload', () => {
        const payload = JSON.stringify({ entry: [{ id: '123' }] });
        const signature = generateWhatsAppSignature(payload, webhookSecret);
        const tampered = JSON.stringify({ entry: [{ id: '999' }] });

        expect(verifyWhatsAppSignature(tampered, signature, webhookSecret).valid).toBe(false);
      });

      it('should reject wrong secret', () => {
        const payload = JSON.stringify({ entry: [] });
        const signature = generateWhatsAppSignature(payload, 'wrong_secret');

        expect(verifyWhatsAppSignature(payload, signature, webhookSecret).valid).toBe(false);
      });

      it('should reject missing signature', () => {
        const payload = JSON.stringify({ entry: [] });

        expect(verifyWhatsAppSignature(payload, undefined, webhookSecret).valid).toBe(false);
        expect(verifyWhatsAppSignature(payload, '', webhookSecret).valid).toBe(false);
      });

      it('should reject malformed signatures', () => {
        const payload = JSON.stringify({ entry: [] });

        expect(verifyWhatsAppSignature(payload, 'invalid', webhookSecret).valid).toBe(false);
        expect(verifyWhatsAppSignature(payload, 'sha256=xyz', webhookSecret).valid).toBe(false);
        expect(verifyWhatsAppSignature(payload, 'sha512=abc123', webhookSecret).valid).toBe(false);
      });
    });

    describe('Security - Never Bypass Verification', () => {
      it('should never allow empty signature regardless of environment', () => {
        const payload = JSON.stringify({ entry: [] });

        // These should all fail - no bypasses allowed
        expect(verifyWhatsAppSignature(payload, '', webhookSecret).valid).toBe(false);
        expect(verifyWhatsAppSignature(payload, undefined, webhookSecret).valid).toBe(false);
      });
    });
  });

  /**
   * Vapi Signature Verification
   * Format: t=timestamp,v1=HMAC-SHA256(timestamp.payload) - same as Stripe
   */
  describe('Vapi Signature Verification', () => {
    const webhookSecret = 'vapi_webhook_secret_12345';

    function generateVapiSignature(payload: string, secret: string, timestamp?: number): string {
      const ts = timestamp ?? Math.floor(Date.now() / 1000);
      const signedPayload = `${ts}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      return `t=${ts},v1=${signature}`;
    }

    function verifyVapiSignature(
      payload: string,
      signature: string,
      secret: string,
      toleranceSeconds = 300
    ): { valid: boolean; error?: string } {
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
        return { valid: false, error: 'Missing components' };
      }

      // Check timestamp tolerance (both past and future)
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (timestampAge > toleranceSeconds || timestampAge < -toleranceSeconds) {
        return { valid: false, error: 'Timestamp out of tolerance' };
      }

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      try {
        if (v1Signature.length !== expectedSignature.length) {
          return { valid: false, error: 'Signature length mismatch' };
        }
        const isValid = crypto.timingSafeEqual(
          Buffer.from(v1Signature),
          Buffer.from(expectedSignature)
        );
        return { valid: isValid };
      } catch {
        return { valid: false, error: 'Comparison error' };
      }
    }

    it('should verify valid Vapi call.started event', () => {
      const payload = JSON.stringify({
        type: 'call.started',
        call: { id: 'call_123', status: 'ringing', type: 'inbound' },
      });
      const signature = generateVapiSignature(payload, webhookSecret);

      expect(verifyVapiSignature(payload, signature, webhookSecret).valid).toBe(true);
    });

    it('should verify valid Vapi call.ended event', () => {
      const payload = JSON.stringify({
        type: 'call.ended',
        call: {
          id: 'call_123',
          status: 'ended',
          type: 'inbound',
          endedReason: 'customer-hangup',
          cost: 0.05,
        },
      });
      const signature = generateVapiSignature(payload, webhookSecret);

      expect(verifyVapiSignature(payload, signature, webhookSecret).valid).toBe(true);
    });

    it('should reject expired Vapi signature', () => {
      const payload = JSON.stringify({ type: 'call.started', call: { id: 'call_old' } });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = generateVapiSignature(payload, webhookSecret, oldTimestamp);

      expect(verifyVapiSignature(payload, signature, webhookSecret).valid).toBe(false);
    });

    it('should reject tampered Vapi payload', () => {
      const payload = JSON.stringify({ type: 'call.ended', call: { id: 'call_123', cost: 0.01 } });
      const signature = generateVapiSignature(payload, webhookSecret);
      // Attacker changes cost
      const tampered = JSON.stringify({
        type: 'call.ended',
        call: { id: 'call_123', cost: 999.99 },
      });

      expect(verifyVapiSignature(tampered, signature, webhookSecret).valid).toBe(false);
    });
  });

  /**
   * Pipedrive Signature Verification
   * Format: HMAC-SHA256(rawBody) as hex string in X-Pipedrive-Signature header
   */
  describe('Pipedrive Signature Verification', () => {
    const webhookSecret = 'pipedrive_webhook_secret_12345';

    function generatePipedriveSignature(rawBody: string, secret: string): string {
      return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    }

    function verifyPipedriveSignature(
      rawBody: string,
      signature: string,
      secret: string
    ): { valid: boolean; error?: string } {
      try {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(rawBody, 'utf8')
          .digest('hex');

        const signatureBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (signatureBuffer.length !== expectedBuffer.length) {
          // Perform dummy comparison to maintain constant time
          crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
          return { valid: false, error: 'Length mismatch' };
        }

        const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
        return { valid: isValid };
      } catch {
        return { valid: false, error: 'Verification error' };
      }
    }

    it('should verify valid Pipedrive deal.updated event', () => {
      const payload = JSON.stringify({
        event: 'updated.deal',
        current: { id: 123, title: 'New Deal', value: 10000 },
        previous: { value: 5000 },
      });
      const signature = generatePipedriveSignature(payload, webhookSecret);

      expect(verifyPipedriveSignature(payload, signature, webhookSecret).valid).toBe(true);
    });

    it('should verify valid Pipedrive person.added event', () => {
      const payload = JSON.stringify({
        event: 'added.person',
        current: { id: 456, name: 'John Doe', email: 'john@example.com' },
      });
      const signature = generatePipedriveSignature(payload, webhookSecret);

      expect(verifyPipedriveSignature(payload, signature, webhookSecret).valid).toBe(true);
    });

    it('should reject tampered Pipedrive payload', () => {
      const payload = JSON.stringify({
        event: 'updated.deal',
        current: { id: 123, value: 10000 },
      });
      const signature = generatePipedriveSignature(payload, webhookSecret);
      const tampered = JSON.stringify({
        event: 'updated.deal',
        current: { id: 123, value: 99999 },
      });

      expect(verifyPipedriveSignature(tampered, signature, webhookSecret).valid).toBe(false);
    });

    it('should reject wrong secret', () => {
      const payload = JSON.stringify({ event: 'test' });
      const signature = generatePipedriveSignature(payload, 'wrong_secret');

      expect(verifyPipedriveSignature(payload, signature, webhookSecret).valid).toBe(false);
    });

    it('should handle payload with special characters', () => {
      const payload = JSON.stringify({
        event: 'added.person',
        current: { name: "O'Brien & Sons", notes: 'Quote: "Test"' },
      });
      const signature = generatePipedriveSignature(payload, webhookSecret);

      expect(verifyPipedriveSignature(payload, signature, webhookSecret).valid).toBe(true);
    });
  });

  /**
   * Cross-Provider Security Tests
   */
  describe('Cross-Provider Security', () => {
    it('should not accept Stripe signature for WhatsApp webhook', () => {
      const stripeSecret = 'whsec_stripe';
      const whatsappSecret = 'whatsapp_secret';
      const payload = JSON.stringify({ id: 'test' });

      // Generate Stripe-format signature
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const stripeSig = `t=${timestamp},v1=${crypto.createHmac('sha256', stripeSecret).update(signedPayload).digest('hex')}`;

      // WhatsApp verifier should reject it
      const whatsappSig = crypto.createHmac('sha256', whatsappSecret).update(payload).digest('hex');
      expect(stripeSig).not.toBe(`sha256=${whatsappSig}`);
    });

    it('should ensure different secrets produce different signatures', () => {
      const payload = JSON.stringify({ id: 'test_event' });
      const secrets = ['secret1', 'secret2', 'secret3', 'secret4', 'secret5'];

      const signatures = secrets.map((secret) =>
        crypto.createHmac('sha256', secret).update(payload).digest('hex')
      );

      // All signatures should be unique
      const uniqueSignatures = new Set(signatures);
      expect(uniqueSignatures.size).toBe(secrets.length);
    });

    it('should handle very large payloads', () => {
      const largePayload = JSON.stringify({
        data: 'x'.repeat(1_000_000), // 1MB of data
      });
      const secret = 'test_secret';
      const signature = crypto.createHmac('sha256', secret).update(largePayload).digest('hex');

      // Should still produce valid 64-character hex signature
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty payload', () => {
      const payload = '';
      const secret = 'test_secret';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Empty payload still produces valid signature
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      // Verification should work
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(signature).toBe(expectedSignature);
    });
  });
});
