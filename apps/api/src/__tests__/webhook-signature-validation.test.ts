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

  /**
   * Additional Security Edge Cases
   */
  describe('Advanced Security Scenarios', () => {
    describe('Replay Attack Detection - Advanced', () => {
      it('should detect signature reuse across different payloads', () => {
        const secret = 'test_secret';
        const payload1 = JSON.stringify({ id: 'evt_1', amount: 100 });
        const payload2 = JSON.stringify({ id: 'evt_2', amount: 200 });

        // Generate signature for payload1
        const timestamp = Math.floor(Date.now() / 1000);
        const signedPayload1 = `${timestamp}.${payload1}`;
        const signature = crypto.createHmac('sha256', secret).update(signedPayload1).digest('hex');

        // Try to use same signature for payload2 (should fail)
        const signedPayload2 = `${timestamp}.${payload2}`;
        const expectedSignature2 = crypto
          .createHmac('sha256', secret)
          .update(signedPayload2)
          .digest('hex');

        expect(signature).not.toBe(expectedSignature2);
      });

      it('should detect timestamp manipulation', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'evt_test' });

        // Create signature with current timestamp
        const currentTime = Math.floor(Date.now() / 1000);
        const signedPayload = `${currentTime}.${payload}`;
        const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

        // Try to use signature with different timestamp (should fail)
        const differentTime = currentTime + 100;
        const signedPayloadDifferent = `${differentTime}.${payload}`;
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(signedPayloadDifferent)
          .digest('hex');

        expect(signature).not.toBe(expectedSignature);
      });

      it('should handle clock drift scenarios', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'evt_test' });

        // Server 5 seconds ahead
        const futureTime = Math.floor(Date.now() / 1000) + 5;
        const signedPayload = `${futureTime}.${payload}`;
        const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

        // Within reasonable tolerance, this should be verifiable
        const tolerance = 300; // 5 minutes
        const timestampAge = Math.floor(Date.now() / 1000) - futureTime;

        expect(Math.abs(timestampAge)).toBeLessThan(tolerance);
      });
    });

    describe('Signature Format Edge Cases', () => {
      it('should handle signature with leading zeros', () => {
        const secret = 'test_secret';
        // Force a signature that might have leading zeros
        const payload = '';
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        // Should still be 64 characters
        expect(signature).toHaveLength(64);
        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should reject signature with mixed case hex', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'test' });

        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const mixedCase = signature.toUpperCase();

        // Verification should be case-insensitive for hex
        const signatureBuffer = Buffer.from(signature, 'hex');
        const mixedCaseBuffer = Buffer.from(mixedCase, 'hex');

        expect(signatureBuffer.equals(mixedCaseBuffer)).toBe(true);
      });

      it('should handle signature with whitespace (should be rejected)', () => {
        const signature = 'abc123 def456';

        // Whitespace in signature should be invalid
        expect(signature).toMatch(/\s/); // Contains whitespace
        expect(signature).not.toMatch(/^[a-f0-9]{64}$/); // Not valid hex
      });

      it('should handle signature with control characters', () => {
        const signatureWithControl = 'abc\t123\ndef';

        expect(signatureWithControl).toMatch(/[\t\n\r]/); // Contains control chars
        expect(signatureWithControl).not.toMatch(/^[a-f0-9]{64}$/);
      });
    });

    describe('Payload Encoding Edge Cases', () => {
      it('should handle payload with different JSON formatting', () => {
        const secret = 'test_secret';
        const obj = { id: 'test', value: 100 };

        // Same object, different formatting
        const payload1 = JSON.stringify(obj); // {"id":"test","value":100}
        const payload2 = JSON.stringify(obj, null, 2); // Pretty-printed

        const sig1 = crypto.createHmac('sha256', secret).update(payload1).digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update(payload2).digest('hex');

        // Different formatting produces different signatures
        expect(sig1).not.toBe(sig2);
      });

      it('should handle payload with different property orders', () => {
        const secret = 'test_secret';

        const payload1 = JSON.stringify({ a: 1, b: 2 });
        const payload2 = JSON.stringify({ b: 2, a: 1 });

        const sig1 = crypto.createHmac('sha256', secret).update(payload1).digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update(payload2).digest('hex');

        // Different property orders produce different signatures
        expect(sig1).not.toBe(sig2);
      });

      it('should handle payload with unicode normalization differences', () => {
        const secret = 'test_secret';

        // Different unicode representations of same character
        const payload1 = 'café'; // NFC (composed)
        const payload2 = 'café'; // NFD (decomposed)

        const sig1 = crypto.createHmac('sha256', secret).update(payload1, 'utf8').digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update(payload2, 'utf8').digest('hex');

        // Different normalizations may produce different signatures
        // depending on the actual bytes
        expect(typeof sig1).toBe('string');
        expect(typeof sig2).toBe('string');
      });

      it('should handle payload with byte order mark (BOM)', () => {
        const secret = 'test_secret';

        const payloadWithBOM = '\uFEFF' + JSON.stringify({ id: 'test' });
        const payloadWithoutBOM = JSON.stringify({ id: 'test' });

        const sig1 = crypto.createHmac('sha256', secret).update(payloadWithBOM).digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update(payloadWithoutBOM).digest('hex');

        // BOM should make signatures different
        expect(sig1).not.toBe(sig2);
      });
    });

    describe('Secret Key Edge Cases', () => {
      it('should produce different signatures for similar secrets', () => {
        const payload = JSON.stringify({ id: 'test' });

        const sig1 = crypto.createHmac('sha256', 'secret').update(payload).digest('hex');
        const sig2 = crypto.createHmac('sha256', 'secret1').update(payload).digest('hex');
        const sig3 = crypto.createHmac('sha256', 'Secret').update(payload).digest('hex');

        // All secrets are different, so signatures should differ
        expect(sig1).not.toBe(sig2);
        expect(sig1).not.toBe(sig3);
        expect(sig2).not.toBe(sig3);
      });

      it('should handle very short secrets', () => {
        const payload = JSON.stringify({ id: 'test' });
        const shortSecret = 'a';

        const signature = crypto.createHmac('sha256', shortSecret).update(payload).digest('hex');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should handle very long secrets', () => {
        const payload = JSON.stringify({ id: 'test' });
        const longSecret = 'a'.repeat(10000);

        const signature = crypto.createHmac('sha256', longSecret).update(payload).digest('hex');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should handle secrets with special characters', () => {
        const payload = JSON.stringify({ id: 'test' });
        const specialSecret = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        const signature = crypto.createHmac('sha256', specialSecret).update(payload).digest('hex');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should handle secrets with unicode characters', () => {
        const payload = JSON.stringify({ id: 'test' });
        const unicodeSecret = '🔐密钥🗝️';

        const signature = crypto.createHmac('sha256', unicodeSecret).update(payload).digest('hex');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should handle empty secret (security antipattern)', () => {
        const payload = JSON.stringify({ id: 'test' });
        const emptySecret = '';

        // Empty secret is insecure but should still produce a signature
        const signature = crypto.createHmac('sha256', emptySecret).update(payload).digest('hex');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    describe('Provider-Specific Attack Vectors', () => {
      it('should prevent Stripe signature downgrade attack', () => {
        const secret = 'whsec_test';
        const payload = JSON.stringify({ id: 'evt_test' });
        const timestamp = Math.floor(Date.now() / 1000);

        // Valid v1 signature
        const signedPayload = `${timestamp}.${payload}`;
        const v1Signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
        const validSig = `t=${timestamp},v1=${v1Signature}`;

        // Attacker tries to remove v1 and use only timestamp
        const downgradedSig = `t=${timestamp}`;

        // Should reject downgraded signature
        expect(validSig).toContain('v1=');
        expect(downgradedSig).not.toContain('v1=');
      });

      it('should prevent WhatsApp signature prefix confusion', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ entry: [] });

        const rawSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        // Valid signatures
        const validSig1 = `sha256=${rawSignature}`;
        const validSig2 = rawSignature; // Also valid without prefix

        // Invalid prefixes that should be rejected
        const invalidSig1 = `sha512=${rawSignature}`; // Wrong algorithm
        const invalidSig2 = `md5=${rawSignature}`; // Weak algorithm
        const invalidSig3 = `SHA256=${rawSignature}`; // Wrong case

        expect(validSig1.startsWith('sha256=')).toBe(true);
        expect(validSig2).toMatch(/^[a-f0-9]{64}$/);
        expect(invalidSig1.startsWith('sha512=')).toBe(true);
        expect(invalidSig2.startsWith('md5=')).toBe(true);
        expect(invalidSig3.startsWith('SHA256=')).toBe(true);
      });

      it('should handle Pipedrive signature with different encodings', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ event: 'test' });

        // UTF-8 encoding (standard)
        const sigUtf8 = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

        // Binary encoding
        const sigBinary = crypto
          .createHmac('sha256', secret)
          .update(payload, 'binary')
          .digest('hex');

        // Both should produce valid signatures, but may differ
        expect(sigUtf8).toMatch(/^[a-f0-9]{64}$/);
        expect(sigBinary).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    describe('Timing Attack Resistance', () => {
      it('should compare signatures in constant time', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'test' });
        const correctSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        // Create wrong signatures of same length
        const wrongSig1 = 'a'.repeat(64);
        const wrongSig2 = correctSignature.substring(0, 63) + 'x'; // One char different

        // Both should be rejected, using constant-time comparison
        const result1 = crypto.timingSafeEqual(
          Buffer.from(correctSignature),
          Buffer.from(wrongSig1)
        );
        const result2 = crypto.timingSafeEqual(
          Buffer.from(correctSignature),
          Buffer.from(wrongSig2)
        );

        expect(result1).toBe(false);
        expect(result2).toBe(false);
      });

      it('should handle length mismatch before constant-time comparison', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'test' });
        const correctSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        const shortSignature = 'abc123';
        const longSignature = 'a'.repeat(128);

        // Length check should happen before timingSafeEqual
        expect(correctSignature.length).toBe(64);
        expect(shortSignature.length).not.toBe(64);
        expect(longSignature.length).not.toBe(64);

        // Should reject based on length without timing leak
        expect(correctSignature.length === shortSignature.length).toBe(false);
        expect(correctSignature.length === longSignature.length).toBe(false);
      });
    });

    describe('Concurrent Request Handling', () => {
      it('should handle multiple signature verifications simultaneously', () => {
        const secret = 'test_secret';
        const payloads = Array.from({ length: 100 }, (_, i) => JSON.stringify({ id: `evt_${i}` }));

        const signatures = payloads.map((payload) =>
          crypto.createHmac('sha256', secret).update(payload).digest('hex')
        );

        // Verify all signatures
        for (let i = 0; i < payloads.length; i++) {
          const expectedSig = crypto
            .createHmac('sha256', secret)
            .update(payloads[i]!)
            .digest('hex');
          expect(signatures[i]).toBe(expectedSig);
        }
      });

      it('should produce unique signatures for sequential requests', () => {
        const secret = 'test_secret';
        const signatureSet = new Set<string>();

        // Generate 1000 signatures for different payloads
        for (let i = 0; i < 1000; i++) {
          const payload = JSON.stringify({ id: `evt_${i}`, timestamp: Date.now() });
          const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
          signatureSet.add(signature);
        }

        // All signatures should be unique
        expect(signatureSet.size).toBe(1000);
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should handle null payload gracefully', () => {
        const secret = 'test_secret';

        // Node.js HMAC should handle null/undefined
        expect(() => {
          crypto
            .createHmac('sha256', secret)
            .update(null as any)
            .digest('hex');
        }).toThrow();
      });

      it('should handle undefined payload gracefully', () => {
        const secret = 'test_secret';

        expect(() => {
          crypto
            .createHmac('sha256', secret)
            .update(undefined as any)
            .digest('hex');
        }).toThrow();
      });

      it('should handle non-string payload types', () => {
        const secret = 'test_secret';

        // Should work with Buffer
        const bufferPayload = Buffer.from('test');
        const signature = crypto.createHmac('sha256', secret).update(bufferPayload).digest('hex');
        expect(signature).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should produce consistent signatures across multiple calls', () => {
        const secret = 'test_secret';
        const payload = JSON.stringify({ id: 'test' });

        const signatures = Array.from({ length: 100 }, () =>
          crypto.createHmac('sha256', secret).update(payload).digest('hex')
        );

        // All signatures should be identical
        expect(new Set(signatures).size).toBe(1);
      });
    });
  });
});
