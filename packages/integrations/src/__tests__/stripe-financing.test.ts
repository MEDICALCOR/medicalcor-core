/**
 * @fileoverview Stripe Financing Client Tests
 *
 * L2 Feature: Third-party financing integration tests.
 * Tests eligibility checks, application creation, offer acceptance,
 * and webhook verification.
 *
 * Note: Real API client tests requiring network mocking are skipped.
 * Use MockStripeFinancingClient for development and testing.
 * Integration tests with real Stripe API should be in e2e tests.
 *
 * @module integrations/__tests__/stripe-financing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StripeFinancingClient,
  MockStripeFinancingClient,
  createStripeFinancingClient,
  createMockStripeFinancingClient,
  type StripeFinancingClientConfig,
} from '../stripe-financing.js';
import type { FinancingApplicant } from '@medicalcor/types';

describe('StripeFinancingClient', () => {
  const config: StripeFinancingClientConfig = {
    secretKey: 'sk_test_123',
    webhookSecret: 'whsec_test_456',
    timeoutMs: 5000,
    retryConfig: {
      maxRetries: 1,
      baseDelayMs: 100,
    },
    financing: {
      defaultProvider: 'stripe_financing',
      minAmount: 50000,
      maxAmount: 10000000,
      defaultCurrency: 'RON',
      availableTerms: ['6', '12', '18', '24'],
    },
  };

  let client: StripeFinancingClient;

  beforeEach(() => {
    client = createStripeFinancingClient(config);
  });

  describe('configuration', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(StripeFinancingClient);
    });

    it('should validate config schema', () => {
      expect(() => {
        createStripeFinancingClient({ secretKey: '' });
      }).toThrow();
    });

    it('should accept minimal config', () => {
      const minimalClient = createStripeFinancingClient({
        secretKey: 'sk_test_minimal',
      });
      expect(minimalClient).toBeInstanceOf(StripeFinancingClient);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const payload = '{"type":"financing.application.approved"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;

      // Compute expected signature using the same algorithm
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${expectedSignature}`;

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"type":"financing.application.approved"}';
      const signatureHeader = 't=1234567890,v1=invalid_signature';

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const payload = '{"type":"financing.application.approved"}';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signedPayload = `${oldTimestamp}.${payload}`;

      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${oldTimestamp},v1=${expectedSignature}`;

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(false);
    });

    it('should reject malformed signature header', () => {
      const payload = '{"type":"financing.application.approved"}';

      expect(client.verifyWebhookSignature(payload, '')).toBe(false);
      expect(client.verifyWebhookSignature(payload, 'invalid')).toBe(false);
      expect(client.verifyWebhookSignature(payload, 't=123')).toBe(false);
      expect(client.verifyWebhookSignature(payload, 'v1=abc')).toBe(false);
    });

    it('should throw when webhook secret is not configured', () => {
      const clientWithoutSecret = createStripeFinancingClient({
        secretKey: 'sk_test_123',
      });

      expect(() => {
        clientWithoutSecret.verifyWebhookSignature('payload', 'header');
      }).toThrow('Webhook secret not configured');
    });

    it('should use timing-safe comparison', () => {
      const payload = '{"type":"financing.application.approved"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;

      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      // Signature with different length should not cause timing leak
      const wrongLengthSignature = `t=${timestamp},v1=${expectedSignature}extra`;

      const isValid = client.verifyWebhookSignature(payload, wrongLengthSignature);
      expect(isValid).toBe(false);
    });
  });

  describe('validateWebhook', () => {
    it('should not throw for valid webhook', () => {
      const payload = '{"type":"financing.application.approved"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;

      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${expectedSignature}`;

      expect(() => {
        client.validateWebhook(payload, signatureHeader);
      }).not.toThrow();
    });

    it('should throw WebhookSignatureError for invalid webhook', () => {
      const payload = '{"type":"financing.application.approved"}';
      const signatureHeader = 't=1234567890,v1=invalid_signature';

      expect(() => {
        client.validateWebhook(payload, signatureHeader);
      }).toThrow('Invalid Stripe financing webhook signature');
    });
  });
});

describe('MockStripeFinancingClient', () => {
  let mockClient: MockStripeFinancingClient;

  const testApplicant: FinancingApplicant = {
    leadId: '550e8400-e29b-41d4-a716-446655440000',
    firstName: 'Maria',
    lastName: 'Popescu',
    email: 'maria.popescu@example.com',
    phone: '+40712345678',
    country: 'RO',
  };

  beforeEach(() => {
    mockClient = createMockStripeFinancingClient();
  });

  describe('checkEligibility', () => {
    it('should return eligible for amounts under limit', async () => {
      const result = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-123',
      });

      expect(result.eligible).toBe(true);
      expect(result.preQualifiedAmountMax).toBeLessThanOrEqual(5000000);
      expect(result.availableTerms).toContain('12');
      expect(result.availablePlanTypes).toContain('installment');
    });

    it('should return ineligible for amounts over limit', async () => {
      const result = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 1000000,
        requestedAmountMax: 10000000, // Over 50,000 RON limit
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-123',
      });

      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toBe('Amount exceeds maximum financing limit');
      expect(result.availableTerms).toHaveLength(0);
    });

    it('should generate unique check IDs', async () => {
      const result1 = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-1',
      });

      const result2 = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-2',
      });

      expect(result1.checkId).not.toBe(result2.checkId);
    });

    it('should provide valid until date in future', async () => {
      const result = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-123',
      });

      expect(result.validUntil.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('createApplication', () => {
    it('should create mock application with offers', async () => {
      const result = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        preferredTerm: '12',
        correlationId: 'corr-789',
      });

      expect(result.status).toBe('approved');
      expect(result.decisionCode).toBe('approved');
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0]?.termMonths).toBe(12);
      expect(result.offers[0]?.monthlyPayment).toBeGreaterThan(0);
    });

    it('should calculate realistic monthly payments', async () => {
      const result = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 350000, // 3500 RON
        currency: 'RON',
        preferredTerm: '12',
        correlationId: 'corr-789',
      });

      const offer = result.offers[0];
      expect(offer).toBeDefined();

      // Monthly payment should be roughly principal/12 + interest
      // At ~15% APR, monthly payment for 3500 RON over 12 months should be ~315 RON
      expect(offer!.monthlyPayment).toBeGreaterThan(30000); // > 300 RON
      expect(offer!.monthlyPayment).toBeLessThan(35000); // < 350 RON

      // Total repayment should be higher than principal
      expect(offer!.totalRepayment).toBeGreaterThan(result.requestedAmount);

      // Finance charge should be positive
      expect(offer!.financeCharge).toBeGreaterThan(0);
    });

    it('should use default term if not specified', async () => {
      const result = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      // Default term should be 12 months
      expect(result.offers[0]?.termMonths).toBe(12);
    });

    it('should store application metadata', async () => {
      const result = await mockClient.createApplication({
        caseId: 'case-abc',
        clinicId: 'clinic-xyz',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        treatmentDescription: 'Dental implants',
        treatmentCategory: 'implants',
        correlationId: 'corr-789',
      });

      expect(result.caseId).toBe('case-abc');
      expect(result.clinicId).toBe('clinic-xyz');
      expect(result.treatmentDescription).toBe('Dental implants');
      expect(result.treatmentCategory).toBe('implants');
    });
  });

  describe('acceptOffer', () => {
    it('should accept mock offer and return success', async () => {
      // First create an application
      const app = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      // Then accept the offer
      const result = await mockClient.acceptOffer({
        applicationId: app.id,
        offerId: app.offers[0]!.offerId,
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe('accepted');
      expect(result.application.acceptedOfferId).toBe(app.offers[0]!.offerId);
      expect(result.contractUrl).toBe('https://example.com/contract.pdf');
      expect(result.expectedFundingDate).toBeInstanceOf(Date);
      expect(result.error).toBeNull();
    });

    it('should update application timestamps on acceptance', async () => {
      const app = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      const originalUpdatedAt = app.updatedAt;

      const result = await mockClient.acceptOffer({
        applicationId: app.id,
        offerId: app.offers[0]!.offerId,
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.application.acceptedAt).toBeInstanceOf(Date);
      expect(result.application.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });

    it('should fail when application not found', async () => {
      const result = await mockClient.acceptOffer({
        applicationId: 'nonexistent',
        offerId: 'offer-123',
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Application not found');
    });

    it('should allow accepting by external ID', async () => {
      const app = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      // Accept using external ID
      const result = await mockClient.acceptOffer({
        applicationId: app.externalId,
        offerId: app.offers[0]!.offerId,
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getApplication', () => {
    it('should retrieve created application', async () => {
      const app = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      const retrieved = await mockClient.getApplication(
        app.externalId,
        { caseId: 'case-123', clinicId: 'clinic-456', leadId: testApplicant.leadId },
        'corr-get'
      );

      expect(retrieved.id).toBe(app.id);
      expect(retrieved.status).toBe(app.status);
    });

    it('should throw error for non-existent application', async () => {
      await expect(
        mockClient.getApplication(
          'nonexistent',
          { caseId: 'case-123', clinicId: 'clinic-456', leadId: 'lead-123' },
          'corr-get'
        )
      ).rejects.toThrow('Application not found');
    });
  });

  describe('webhook verification', () => {
    it('should always return true for mock client', () => {
      const isValid = mockClient.verifyWebhookSignature('any', 'signature');
      expect(isValid).toBe(true);
    });

    it('should not throw on validateWebhook', () => {
      expect(() => {
        mockClient.validateWebhook('any', 'signature');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all stored applications', async () => {
      // Create an application
      const app = await mockClient.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      // Clear the client
      mockClient.clear();

      // Try to accept offer - should fail
      const result = await mockClient.acceptOffer({
        applicationId: app.id,
        offerId: 'offer-123',
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(false);
    });

    it('should reset check counter', async () => {
      // Create a check
      await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-1',
      });

      // Clear
      mockClient.clear();

      // New check should have counter reset
      const result = await mockClient.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-2',
      });

      expect(result.checkId).toBe('mock_check_1');
    });
  });
});
