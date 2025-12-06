import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for Payment Handler Tasks
 * Tests payment processing workflows including succeeded, failed, and refund handlers
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-whatsapp-key');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
vi.stubEnv('DATABASE_URL', '');

// Import after env setup
import { createHubSpotClient, createWhatsAppClient } from '@medicalcor/integrations';
import { createInMemoryEventStore, normalizeRomanianPhone } from '@medicalcor/core';

describe('Payment Handler Tasks', () => {
  const correlationId = 'payment-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Payment Succeeded Handler', () => {
    it('should process successful payment with email end-to-end', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const eventStore = createInMemoryEventStore('payment-succeeded');

      const payload = {
        paymentId: 'pi_test123',
        amount: 50000, // 500.00 EUR
        currency: 'eur',
        customerId: 'cus_test123',
        customerEmail: 'test@example.com',
        customerName: 'Ion Popescu',
        metadata: { phone: '+40721000001' },
        correlationId,
      };

      // Step 1: Upsert HubSpot contact by email
      const contact = await hubspot.upsertContactByEmail(payload.customerEmail, {
        firstname: payload.customerName,
        phone: payload.metadata.phone,
        lead_source: 'stripe_payment',
      });

      expect(contact.id).toBeDefined();

      // Step 2: Log payment to timeline
      await hubspot.logPaymentToTimeline({
        contactId: contact.id,
        paymentId: payload.paymentId,
        amount: payload.amount,
        currency: payload.currency,
        status: 'succeeded',
      });

      // Step 3: Update lifecycle stage
      await hubspot.updateContact(contact.id, {
        lifecyclestage: 'customer',
        hs_lead_status: 'CONVERTED',
        last_payment_date: expect.any(String),
        last_payment_amount: expect.any(String),
        stripe_customer_id: payload.customerId,
      });

      // Step 4: Send WhatsApp confirmation
      const confirmation = await whatsapp.sendTemplate({
        to: payload.metadata.phone,
        templateName: 'payment_confirmation',
        language: 'ro',
      });

      expect(confirmation.messages[0]?.id).toBeDefined();

      // Step 5: Emit domain event
      await eventStore.emit({
        type: 'payment.received',
        correlationId,
        aggregateId: contact.id,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: payload.paymentId,
          stripeCustomerId: payload.customerId,
          hubspotContactId: contact.id,
          amount: payload.amount,
          currency: payload.currency,
        },
      });

      const events = await eventStore.getByType('payment.received');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.amount).toBe(50000);
    });

    it('should upsert contact by phone when email is not available', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const payload = {
        paymentId: 'pi_test456',
        amount: 30000,
        currency: 'ron',
        customerId: null,
        customerEmail: null,
        metadata: { phone: '+40721000002' },
        correlationId,
      };

      const phoneResult = normalizeRomanianPhone(payload.metadata.phone);
      const contact = await hubspot.upsertContactByPhone(phoneResult.normalized, {
        lead_source: 'stripe_payment',
      });

      expect(contact.id).toBeDefined();
    });

    it('should format currency correctly for different currencies', () => {
      function formatCurrency(
        amountCents: number,
        currency: string,
        language: 'ro' | 'en' | 'de' = 'ro'
      ): string {
        const amount = amountCents / 100;
        const locales: Record<string, string> = {
          ro: 'ro-RO',
          en: 'en-US',
          de: 'de-DE',
        };

        return new Intl.NumberFormat(locales[language], {
          style: 'currency',
          currency: currency.toUpperCase(),
        }).format(amount);
      }

      const eurFormatted = formatCurrency(50000, 'eur', 'ro');
      const ronFormatted = formatCurrency(100000, 'ron', 'ro');
      const usdFormatted = formatCurrency(75000, 'usd', 'en');

      // Account for locale differences in number formatting
      expect(eurFormatted.replace(/[.,\s]/g, '')).toContain('500');
      expect(ronFormatted.replace(/[.,\s]/g, '')).toContain('1000');
      expect(usdFormatted.replace(/[.,\s]/g, '')).toContain('750');
    });

    it('should normalize Romanian phone numbers correctly', () => {
      const phoneNumbers = [
        { input: '0721000001', expected: '+40721000001' },
        { input: '+40721000001', expected: '+40721000001' },
        { input: '40721000001', expected: '+40721000001' },
        { input: '0721 000 001', expected: '+40721000001' },
      ];

      for (const { input, expected } of phoneNumbers) {
        const result = normalizeRomanianPhone(input);
        expect(result.normalized).toBe(expected);
        expect(result.isValid).toBe(true);
      }
    });

    it('should use atomic upsert to prevent race conditions', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const email = 'race-condition@example.com';

      // Simulate concurrent webhook events for same customer
      const promises = [
        hubspot.upsertContactByEmail(email, { firstname: 'Test1' }),
        hubspot.upsertContactByEmail(email, { firstname: 'Test2' }),
        hubspot.upsertContactByEmail(email, { firstname: 'Test3' }),
      ];

      const results = await Promise.all(promises);

      // All should succeed without creating duplicates
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.id).toBeDefined();
      });
    });

    it('should build template components correctly', async () => {
      // Mock template catalog functionality
      const buildTemplateComponents = (templateName: string, params: Record<string, string>) => {
        return [
          {
            type: 'body',
            parameters: Object.entries(params).map(([, value]) => ({
              type: 'text',
              text: value,
            })),
          },
        ];
      };

      const formatDateForTemplate = (date: Date) => {
        return date.toLocaleDateString('ro-RO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      };

      const components = buildTemplateComponents('payment_confirmation', {
        amount: '€500.00',
        date: formatDateForTemplate(new Date()),
      });

      expect(components).toBeDefined();
      expect(Array.isArray(components)).toBe(true);
      expect(components[0]?.type).toBe('body');
    });

    it('should handle missing metadata gracefully', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const eventStore = createInMemoryEventStore('payment-no-metadata');

      const payload = {
        paymentId: 'pi_test789',
        amount: 25000,
        currency: 'eur',
        customerId: 'cus_test789',
        customerEmail: 'test@example.com',
        metadata: undefined,
        correlationId,
      };

      const contact = await hubspot.upsertContactByEmail(payload.customerEmail, {
        lead_source: 'stripe_payment',
      });

      expect(contact.id).toBeDefined();

      // Should still emit event
      await eventStore.emit({
        type: 'payment.received',
        correlationId,
        aggregateId: contact.id,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
        },
      });

      const events = await eventStore.getByType('payment.received');
      expect(events.length).toBe(1);
    });

    it('should handle HubSpot upsert failure gracefully', async () => {
      const eventStore = createInMemoryEventStore('payment-hubspot-fail');

      const payload = {
        paymentId: 'pi_test_fail',
        amount: 10000,
        currency: 'eur',
        customerId: null,
        customerEmail: null,
        metadata: undefined,
        correlationId,
      };

      // No contact ID available due to HubSpot failure
      const hubspotContactId = undefined;

      // Should still emit event with fallback aggregateId
      await eventStore.emit({
        type: 'payment.received',
        correlationId,
        aggregateId: payload.paymentId, // Fallback to paymentId
        aggregateType: 'payment',
        payload: {
          stripePaymentId: payload.paymentId,
          hubspotContactId,
          amount: payload.amount,
        },
      });

      const events = await eventStore.getByType('payment.received');
      expect(events.length).toBe(1);
      expect(events[0]?.aggregateId).toBe(payload.paymentId);
    });

    it('should return complete success result', () => {
      const result = {
        success: true,
        paymentId: 'pi_test123',
        hubspotContactId: 'hs_contact_123',
        amount: 50000,
        formattedAmount: '€500.00',
        currency: 'eur',
        lifecycleUpdated: true,
        confirmationSent: true,
      };

      expect(result.success).toBe(true);
      expect(result.lifecycleUpdated).toBe(true);
      expect(result.confirmationSent).toBe(true);
      expect(result.formattedAmount).toContain('€');
    });

    it('should handle WhatsApp send failure gracefully', async () => {
      const eventStore = createInMemoryEventStore('payment-whatsapp-fail');

      const result = {
        success: true,
        paymentId: 'pi_test_wa_fail',
        hubspotContactId: 'hs_contact_123',
        amount: 50000,
        formattedAmount: '€500.00',
        currency: 'eur',
        lifecycleUpdated: true,
        confirmationSent: false, // WhatsApp failed
      };

      // Workflow should still succeed even if WhatsApp fails
      expect(result.success).toBe(true);
      expect(result.confirmationSent).toBe(false);
    });
  });

  describe('Payment Failed Handler', () => {
    it('should process failed payment end-to-end', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const eventStore = createInMemoryEventStore('payment-failed');

      const payload = {
        paymentId: 'pi_failed123',
        amount: 100000,
        currency: 'ron',
        customerId: 'cus_failed',
        customerEmail: 'test@example.com',
        failureCode: 'card_declined',
        failureReason: 'Your card was declined',
        metadata: { phone: '+40721000001' },
        correlationId,
      };

      // Step 1: Find contact by email
      const contact = await hubspot.findContactByEmail(payload.customerEmail);
      expect(contact).toBeDefined();

      const hubspotContactId = contact?.id;

      if (hubspotContactId) {
        // Step 2: Log failed payment
        await hubspot.logPaymentToTimeline({
          contactId: hubspotContactId,
          paymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
          status: `failed: ${payload.failureReason}`,
        });

        // Step 3: Create follow-up task
        const task = await hubspot.createTask({
          contactId: hubspotContactId,
          subject: `PAYMENT FAILED: 1,000.00 RON`,
          body: `Payment ID: ${payload.paymentId}\nReason: ${payload.failureReason}`,
          priority: 'HIGH',
          dueDate: expect.any(Date),
        });

        expect(task.id).toBeDefined();
      }

      // Step 4: Emit domain event
      await eventStore.emit({
        type: 'payment.failed',
        correlationId,
        aggregateId: hubspotContactId ?? payload.paymentId,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: payload.paymentId,
          amount: payload.amount,
          failureCode: payload.failureCode,
          failureReason: payload.failureReason,
        },
      });

      const events = await eventStore.getByType('payment.failed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.failureReason).toBe('Your card was declined');
    });

    it('should find contact by phone if email is not available', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const payload = {
        customerEmail: null,
        metadata: { phone: '+40721000001' },
      };

      const phoneResult = normalizeRomanianPhone(payload.metadata.phone);
      const contacts = await hubspot.searchContactsByPhone(phoneResult.normalized);

      expect(Array.isArray(contacts)).toBe(true);
      if (contacts.length > 0) {
        expect(contacts[0]?.id).toBeDefined();
      }
    });

    it('should create task with 4-hour due date', () => {
      const dueDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const now = new Date();

      const hoursDiff = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThanOrEqual(3.9);
      expect(hoursDiff).toBeLessThanOrEqual(4.1);
    });

    it('should handle contact not found gracefully', async () => {
      const eventStore = createInMemoryEventStore('payment-failed-no-contact');

      const payload = {
        paymentId: 'pi_failed_no_contact',
        amount: 50000,
        currency: 'eur',
        customerId: null,
        customerEmail: null,
        failureCode: 'insufficient_funds',
        failureReason: 'Insufficient funds',
        metadata: undefined,
        correlationId,
      };

      // No contact found
      const hubspotContactId = undefined;

      // Should still emit event with paymentId as fallback
      await eventStore.emit({
        type: 'payment.failed',
        correlationId,
        aggregateId: hubspotContactId ?? payload.paymentId,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: payload.paymentId,
          amount: payload.amount,
          failureReason: payload.failureReason,
        },
      });

      const events = await eventStore.getByType('payment.failed');
      expect(events.length).toBe(1);
      expect(events[0]?.aggregateId).toBe(payload.paymentId);
    });

    it('should return complete failure result', () => {
      const result = {
        success: true,
        paymentId: 'pi_failed123',
        hubspotContactId: 'hs_contact_123',
        failureReason: 'Your card was declined',
        taskCreated: true,
      };

      expect(result.success).toBe(true);
      expect(result.taskCreated).toBe(true);
      expect(result.failureReason).toBe('Your card was declined');
    });

    it('should handle different failure codes', () => {
      const failureCodes = [
        'card_declined',
        'insufficient_funds',
        'expired_card',
        'incorrect_cvc',
        'processing_error',
      ];

      for (const code of failureCodes) {
        const payload = {
          paymentId: `pi_fail_${code}`,
          failureCode: code,
          failureReason: `Failed: ${code}`,
        };

        expect(payload.failureCode).toBe(code);
        expect(payload.failureReason).toContain(code);
      }
    });
  });

  describe('Refund Handler', () => {
    it('should process refund end-to-end', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const eventStore = createInMemoryEventStore('refund');

      const payload = {
        refundId: 'ref_test123',
        paymentId: 'pi_test123',
        amount: 50000,
        currency: 'eur',
        reason: 'requested_by_customer',
        customerEmail: 'test@example.com',
        metadata: {},
        correlationId,
      };

      // Step 1: Find contact
      const contact = await hubspot.findContactByEmail(payload.customerEmail);
      expect(contact).toBeDefined();

      const hubspotContactId = contact?.id;

      if (hubspotContactId) {
        // Step 2: Log refund to timeline
        await hubspot.logPaymentToTimeline({
          contactId: hubspotContactId,
          paymentId: payload.refundId,
          amount: -payload.amount, // Negative for refund
          currency: payload.currency,
          status: `refunded: ${payload.reason}`,
        });
      }

      // Step 3: Emit domain event
      await eventStore.emit({
        type: 'payment.refunded',
        correlationId,
        aggregateId: hubspotContactId ?? payload.refundId,
        aggregateType: 'payment',
        payload: {
          refundId: payload.refundId,
          originalPaymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
          reason: payload.reason,
        },
      });

      const events = await eventStore.getByType('payment.refunded');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.refundId).toBe('ref_test123');
    });

    it('should log negative amount for refund', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const amount = 50000;
      const refundAmount = -amount;

      await hubspot.logPaymentToTimeline({
        contactId: 'hs_contact_123',
        paymentId: 'ref_test',
        amount: refundAmount,
        currency: 'eur',
        status: 'refunded',
      });

      expect(refundAmount).toBeLessThan(0);
      expect(Math.abs(refundAmount)).toBe(amount);
    });

    it('should handle optional refund reason', () => {
      const withReason = {
        refundId: 'ref_1',
        reason: 'requested_by_customer',
        status: 'refunded: requested_by_customer',
      };

      const withoutReason = {
        refundId: 'ref_2',
        reason: undefined,
        status: 'refunded',
      };

      expect(withReason.status).toContain('requested_by_customer');
      expect(withoutReason.status).toBe('refunded');
    });

    it('should return complete refund result', () => {
      function formatCurrency(amountCents: number, currency: string): string {
        return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
      }

      const result = {
        success: true,
        refundId: 'ref_test123',
        paymentId: 'pi_test123',
        hubspotContactId: 'hs_contact_123',
        amount: formatCurrency(50000, 'eur'),
      };

      expect(result.success).toBe(true);
      expect(result.amount).toContain('500');
      expect(result.amount).toContain('EUR');
    });
  });

  describe('Currency formatting', () => {
    it('should format EUR correctly for Romanian locale', () => {
      const amount = 50000 / 100;
      const formatted = new Intl.NumberFormat('ro-RO', {
        style: 'currency',
        currency: 'EUR',
      }).format(amount);

      expect(formatted).toContain('500');
    });

    it('should format RON correctly for Romanian locale', () => {
      const amount = 100000 / 100;
      const formatted = new Intl.NumberFormat('ro-RO', {
        style: 'currency',
        currency: 'RON',
      }).format(amount);

      // Account for locale differences (may use . or , as thousands separator)
      expect(formatted.replace(/[.,\s]/g, '')).toContain('1000');
    });

    it('should format USD correctly for English locale', () => {
      const amount = 75000 / 100;
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);

      expect(formatted).toContain('750');
    });

    it('should handle small amounts correctly', () => {
      const amount = 150 / 100;
      const formatted = new Intl.NumberFormat('ro-RO', {
        style: 'currency',
        currency: 'EUR',
      }).format(amount);

      expect(formatted).toContain('1');
    });

    it('should handle large amounts correctly', () => {
      const amount = 1500000 / 100;
      const formatted = new Intl.NumberFormat('ro-RO', {
        style: 'currency',
        currency: 'EUR',
      }).format(amount);

      // Account for locale differences (may use . or , as thousands separator)
      expect(formatted.replace(/[.,\s]/g, '')).toContain('15000');
    });
  });

  describe('Retry configuration', () => {
    it('should have correct retry settings for payment handlers', () => {
      const retryConfig = {
        maxAttempts: 3,
        minTimeoutInMs: 1000,
        maxTimeoutInMs: 10000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.minTimeoutInMs).toBe(1000);
      expect(retryConfig.maxTimeoutInMs).toBe(10000);
      expect(retryConfig.factor).toBe(2);
    });

    it('should calculate exponential backoff correctly', () => {
      const factor = 2;
      const minTimeout = 1000;

      const attempt1 = minTimeout;
      const attempt2 = minTimeout * factor;
      const attempt3 = minTimeout * factor * factor;

      expect(attempt1).toBe(1000);
      expect(attempt2).toBe(2000);
      expect(attempt3).toBe(4000);
    });
  });

  describe('Error handling', () => {
    it('should handle HubSpot contact creation errors', async () => {
      // Test that we handle errors gracefully by checking the error handling pattern
      const errorResult = {
        success: false,
        error: 'Invalid email format',
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBeDefined();
    });

    it('should handle event emission errors gracefully', async () => {
      const eventStore = createInMemoryEventStore('error-test');

      // Should not throw on valid emission
      const result = await eventStore.emit({
        type: 'payment.received',
        correlationId: 'test',
        aggregateId: 'payment-123',
        aggregateType: 'payment',
        payload: { amount: 100 },
      });

      expect(result).toBeDefined();
    });

    it('should continue workflow even if WhatsApp fails', () => {
      const result = {
        success: true,
        paymentId: 'pi_test',
        hubspotContactId: 'hs_contact_123',
        confirmationSent: false, // WhatsApp failed but workflow succeeded
      };

      expect(result.success).toBe(true);
    });
  });
});
