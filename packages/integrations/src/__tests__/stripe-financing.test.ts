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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StripeFinancingClient,
  MockStripeFinancingClient,
  createStripeFinancingClient,
  createMockStripeFinancingClient,
  getStripeFinancingCredentials,
  type StripeFinancingClientConfig,
} from '../stripe-financing.js';
import type { FinancingApplicant } from '@medicalcor/types';

// Use importOriginal to get actual exports and only mock the logger
vi.mock('@medicalcor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@medicalcor/core')>();

  const mockChildLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue(mockChildLogger),
  };

  return {
    ...actual,
    createLogger: () => mockLogger,
  };
});

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

describe('StripeFinancingClient API methods', () => {
  let client: StripeFinancingClient;
  let originalFetch: typeof globalThis.fetch;

  const config: StripeFinancingClientConfig = {
    secretKey: 'sk_test_api_123',
    webhookSecret: 'whsec_test_456',
    timeoutMs: 1000,
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 10,
    },
    financing: {
      defaultProvider: 'stripe_financing',
      minAmount: 50000,
      maxAmount: 10000000,
      defaultCurrency: 'RON',
      availableTerms: ['6', '12', '18', '24'],
    },
  };

  const testApplicant: FinancingApplicant = {
    leadId: '550e8400-e29b-41d4-a716-446655440000',
    firstName: 'Maria',
    lastName: 'Popescu',
    email: 'maria.popescu@example.com',
    phone: '+40712345678',
    country: 'RO',
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = createStripeFinancingClient(config);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('checkEligibility', () => {
    it('should return eligibility result from API', async () => {
      // Stripe API returns snake_case format with Unix timestamps
      const validUntilTimestamp = Math.floor((Date.now() + 86400000) / 1000);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'chk_123', // Stripe uses 'id' which maps to checkId
            eligible: true,
            pre_qualified_amount_max: 500000,
            available_terms: ['6', '12'],
            available_plan_types: ['installment'],
            valid_until: validUntilTimestamp, // Unix timestamp
          }),
      });

      const result = await client.checkEligibility({
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        requestedAmountMin: 100000,
        requestedAmountMax: 300000,
        currency: 'RON',
        applicant: testApplicant,
        correlationId: 'corr-123',
      });

      expect(result.eligible).toBe(true);
      expect(result.checkId).toBe('chk_123');
    });

    it('should handle API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      await expect(
        client.checkEligibility({
          leadId: 'lead-123',
          clinicId: 'clinic-456',
          requestedAmountMin: 100000,
          requestedAmountMax: 300000,
          currency: 'RON',
          applicant: testApplicant,
          correlationId: 'corr-123',
        })
      ).rejects.toThrow();
    });

    it('should handle network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(
        client.checkEligibility({
          leadId: 'lead-123',
          clinicId: 'clinic-456',
          requestedAmountMin: 100000,
          requestedAmountMax: 300000,
          currency: 'RON',
          applicant: testApplicant,
          correlationId: 'corr-123',
        })
      ).rejects.toThrow();
    });
  });

  describe('createApplication', () => {
    it('should create application via API', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'app_internal_123',
            externalId: 'fin_app_123',
            caseId: 'case-123',
            clinicId: 'clinic-456',
            status: 'approved',
            decisionCode: 'approved',
            requestedAmount: 250000,
            currency: 'RON',
            offers: [
              {
                offerId: 'off_123',
                termMonths: 12,
                apr: 15.99,
                monthlyPayment: 22000,
                totalRepayment: 264000,
                financeCharge: 14000,
              },
            ],
            applicant: testApplicant,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
      });

      const result = await client.createApplication({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        applicant: testApplicant,
        requestedAmount: 250000,
        currency: 'RON',
        correlationId: 'corr-789',
      });

      expect(result.status).toBe('approved');
      expect(result.offers).toHaveLength(1);
    });

    it('should handle API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid request' }),
      });

      await expect(
        client.createApplication({
          caseId: 'case-123',
          clinicId: 'clinic-456',
          applicant: testApplicant,
          requestedAmount: 250000,
          currency: 'RON',
          correlationId: 'corr-789',
        })
      ).rejects.toThrow();
    });
  });

  describe('acceptOffer', () => {
    it('should accept offer via API', async () => {
      // Stripe API returns the application in snake_case format with Unix timestamps
      const now = Math.floor(Date.now() / 1000);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'fin_app_123',
            object: 'financing.application',
            status: 'accepted',
            requested_amount: 250000,
            currency: 'RON',
            accepted_offer_id: 'off_123',
            accepted_at: now,
            applicant: {
              first_name: 'Maria',
              last_name: 'Popescu',
              email: 'maria.popescu@example.com',
              phone: '+40712345678',
              address: { country: 'RO' },
            },
            metadata: {
              case_id: 'case-123',
              clinic_id: 'clinic-456',
              lead_id: 'lead-123',
            },
            created: now - 3600,
            updated: now,
          }),
      });

      const result = await client.acceptOffer({
        applicationId: 'app_123',
        offerId: 'off_123',
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(true);
      expect(result.application.status).toBe('accepted');
    });

    it('should handle API error gracefully', async () => {
      // acceptOffer catches errors and returns success: false instead of throwing
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await client.acceptOffer({
        applicationId: 'nonexistent',
        offerId: 'off_123',
        signatureConsent: true,
        correlationId: 'corr-accept',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });
  });

  describe('getApplication', () => {
    it('should get application via API', async () => {
      // Stripe API returns snake_case format with Unix timestamps
      const now = Math.floor(Date.now() / 1000);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'fin_app_123', // This becomes externalId
            object: 'financing.application',
            status: 'approved',
            requested_amount: 250000,
            currency: 'RON',
            offers: [],
            applicant: {
              first_name: 'Maria',
              last_name: 'Popescu',
              email: 'maria.popescu@example.com',
              phone: '+40712345678',
              address: { country: 'RO' },
            },
            metadata: {
              case_id: 'case-123',
              clinic_id: 'clinic-456',
              lead_id: 'lead-123',
            },
            created: now - 3600,
            updated: now,
          }),
      });

      const result = await client.getApplication(
        'fin_app_123',
        { caseId: 'case-123', clinicId: 'clinic-456', leadId: 'lead-123' },
        'corr-get'
      );

      expect(result.externalId).toBe('fin_app_123');
    });

    it('should handle not found error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      await expect(
        client.getApplication(
          'nonexistent',
          { caseId: 'case-123', clinicId: 'clinic-456', leadId: 'lead-123' },
          'corr-get'
        )
      ).rejects.toThrow();
    });
  });
});

describe('getStripeFinancingCredentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return credentials from environment', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_FINANCING_WEBHOOK_SECRET = 'whsec_test_456';
    process.env.STRIPE_CONNECTED_ACCOUNT_ID = 'acct_123';

    const credentials = getStripeFinancingCredentials();

    expect(credentials.secretKey).toBe('sk_test_123');
    expect(credentials.webhookSecret).toBe('whsec_test_456');
    expect(credentials.connectedAccountId).toBe('acct_123');
  });

  it('should throw when STRIPE_SECRET_KEY is not set', () => {
    delete process.env.STRIPE_SECRET_KEY;

    expect(() => getStripeFinancingCredentials()).toThrow(
      'STRIPE_SECRET_KEY environment variable is required'
    );
  });

  it('should return undefined for optional webhook secret when not set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    delete process.env.STRIPE_FINANCING_WEBHOOK_SECRET;

    const credentials = getStripeFinancingCredentials();

    expect(credentials.secretKey).toBe('sk_test_123');
    expect(credentials.webhookSecret).toBeUndefined();
  });
});

describe('StripeFinancingClient listApplications', () => {
  let client: StripeFinancingClient;
  let originalFetch: typeof globalThis.fetch;

  const config: StripeFinancingClientConfig = {
    secretKey: 'sk_test_list_123',
    timeoutMs: 5000,
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 10,
    },
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = createStripeFinancingClient(config);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should list applications with status filter', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [
            {
              id: 'fin_app_1',
              object: 'financing.application',
              status: 'approved',
              requested_amount: 250000,
              currency: 'RON',
              applicant: {
                first_name: 'Maria',
                last_name: 'Popescu',
                email: 'maria@example.com',
                phone: '+40712345678',
              },
              metadata: { case_id: 'case-1', clinic_id: 'clinic-123', lead_id: 'lead-1' },
              created: now,
              updated: now,
            },
          ],
          has_more: false,
        }),
    });

    const result = await client.listApplications('clinic-123', {
      status: 'approved',
      correlationId: 'corr-list',
    });

    expect(result.applications).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=approved'),
      expect.any(Object)
    );
  });

  it('should list applications with pagination', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [
            {
              id: 'fin_app_2',
              object: 'financing.application',
              status: 'pending',
              requested_amount: 300000,
              currency: 'RON',
              applicant: {
                first_name: 'Ion',
                last_name: 'Ionescu',
                email: 'ion@example.com',
                phone: '+40787654321',
              },
              metadata: { case_id: 'case-2', clinic_id: 'clinic-123', lead_id: 'lead-2' },
              created: now,
              updated: now,
            },
          ],
          has_more: true,
        }),
    });

    const result = await client.listApplications('clinic-123', {
      limit: 5,
      startingAfter: 'fin_app_1',
      correlationId: 'corr-list-page2',
    });

    expect(result.applications).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('starting_after=fin_app_1'),
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=5'),
      expect.any(Object)
    );
  });

  it('should use default limit when not specified', async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [],
          has_more: false,
        }),
    });

    await client.listApplications('clinic-123', {
      correlationId: 'corr-list-default',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      expect.any(Object)
    );
  });
});

describe('StripeFinancingClient retry logic', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should retry on rate limit error', async () => {
    const client = createStripeFinancingClient({
      secretKey: 'sk_test_retry_123',
      timeoutMs: 5000,
      retryConfig: {
        maxRetries: 2,
        baseDelayMs: 10,
      },
    });

    let callCount = 0;
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '1']]),
          text: () => Promise.resolve('Rate limited'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'chk_after_retry',
            eligible: true,
            valid_until: now + 3600,
          }),
      });
    });

    const result = await client.checkEligibility({
      leadId: 'lead-123',
      clinicId: 'clinic-456',
      requestedAmountMin: 100000,
      requestedAmountMax: 300000,
      currency: 'RON',
      applicant: {
        leadId: 'lead-123',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+40712345678',
        country: 'RO',
      },
      correlationId: 'corr-retry',
    });

    expect(callCount).toBe(2);
    expect(result.checkId).toBe('chk_after_retry');
  });

  it('should retry on 502 error', async () => {
    const client = createStripeFinancingClient({
      secretKey: 'sk_test_502_123',
      timeoutMs: 5000,
      retryConfig: {
        maxRetries: 2,
        baseDelayMs: 10,
      },
    });

    let callCount = 0;
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 502,
          text: () => Promise.resolve('Bad Gateway'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'chk_after_502',
            eligible: true,
            valid_until: now + 3600,
          }),
      });
    });

    const result = await client.checkEligibility({
      leadId: 'lead-123',
      clinicId: 'clinic-456',
      requestedAmountMin: 100000,
      requestedAmountMax: 300000,
      currency: 'RON',
      applicant: {
        leadId: 'lead-123',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+40712345678',
        country: 'RO',
      },
      correlationId: 'corr-502',
    });

    expect(callCount).toBe(2);
    expect(result.checkId).toBe('chk_after_502');
  });

  it('should retry on 503 error', async () => {
    const client = createStripeFinancingClient({
      secretKey: 'sk_test_503_123',
      timeoutMs: 5000,
      retryConfig: {
        maxRetries: 2,
        baseDelayMs: 10,
      },
    });

    let callCount = 0;
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'chk_after_503',
            eligible: true,
            valid_until: now + 3600,
          }),
      });
    });

    const result = await client.checkEligibility({
      leadId: 'lead-123',
      clinicId: 'clinic-456',
      requestedAmountMin: 100000,
      requestedAmountMax: 300000,
      currency: 'RON',
      applicant: {
        leadId: 'lead-123',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+40712345678',
        country: 'RO',
      },
      correlationId: 'corr-503',
    });

    expect(callCount).toBe(2);
    expect(result.checkId).toBe('chk_after_503');
  });

  it('should handle connected account header', async () => {
    const client = createStripeFinancingClient({
      secretKey: 'sk_test_connected_123',
      connectedAccountId: 'acct_connected_456',
      timeoutMs: 5000,
    });

    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'chk_connected',
          eligible: true,
          valid_until: now + 3600,
        }),
    });

    await client.checkEligibility({
      leadId: 'lead-123',
      clinicId: 'clinic-456',
      requestedAmountMin: 100000,
      requestedAmountMax: 300000,
      currency: 'RON',
      applicant: {
        leadId: 'lead-123',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+40712345678',
        country: 'RO',
      },
      correlationId: 'corr-connected',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Stripe-Account': 'acct_connected_456',
        }),
      })
    );
  });
});

describe('StripeFinancingClient createApplication with optional fields', () => {
  let client: StripeFinancingClient;
  let originalFetch: typeof globalThis.fetch;

  const config: StripeFinancingClientConfig = {
    secretKey: 'sk_test_create_app_123',
    timeoutMs: 5000,
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 10,
    },
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = createStripeFinancingClient(config);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should include all optional applicant address fields', async () => {
    const now = Math.floor(Date.now() / 1000);
    let capturedBody = '';
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = options?.body?.toString() ?? '';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'fin_app_full',
            object: 'financing.application',
            status: 'pending',
            requested_amount: 250000,
            currency: 'RON',
            applicant: {
              first_name: 'Maria',
              last_name: 'Popescu',
              email: 'maria@example.com',
              phone: '+40712345678',
              date_of_birth: '1990-01-15',
              address: {
                line1: 'Strada Victoriei 123',
                line2: 'Ap. 45',
                city: 'Bucharest',
                state: 'Bucuresti',
                postal_code: '010101',
                country: 'RO',
              },
            },
            metadata: { case_id: 'case-full', clinic_id: 'clinic-full', lead_id: 'lead-full' },
            created: now,
            updated: now,
          }),
      });
    });

    await client.createApplication({
      caseId: 'case-full',
      clinicId: 'clinic-full',
      applicant: {
        leadId: 'lead-full',
        firstName: 'Maria',
        lastName: 'Popescu',
        email: 'maria@example.com',
        phone: '+40712345678',
        dateOfBirth: new Date('1990-01-15'),
        addressLine1: 'Strada Victoriei 123',
        addressLine2: 'Ap. 45',
        city: 'Bucharest',
        state: 'Bucuresti',
        postalCode: '010101',
        country: 'RO',
      },
      requestedAmount: 250000,
      currency: 'RON',
      treatmentDescription: 'Full-arch dental implants',
      treatmentCategory: 'implants',
      preferredPlanType: 'installment',
      preferredTerm: '24',
      metadata: { custom_field: 'custom_value' },
      correlationId: 'corr-full-app',
    });

    // Verify all optional fields were included in the request
    expect(capturedBody).toContain('applicant%5Bdate_of_birth%5D=1990-01-15');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bline1%5D');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bline2%5D');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bcity%5D');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bstate%5D');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bpostal_code%5D');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bcountry%5D');
    expect(capturedBody).toContain('metadata%5Btreatment_description%5D');
    expect(capturedBody).toContain('metadata%5Btreatment_category%5D');
    expect(capturedBody).toContain('preferred_plan_type=installment');
    expect(capturedBody).toContain('preferred_term=24');
    expect(capturedBody).toContain('metadata%5Bcustom_field%5D');
  });

  it('should include optional eligibility check fields', async () => {
    const now = Math.floor(Date.now() / 1000);
    let capturedBody = '';
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = options?.body?.toString() ?? '';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'chk_with_dob',
            eligible: true,
            valid_until: now + 3600,
          }),
      });
    });

    await client.checkEligibility({
      leadId: 'lead-dob',
      clinicId: 'clinic-dob',
      requestedAmountMin: 100000,
      requestedAmountMax: 300000,
      currency: 'RON',
      applicant: {
        leadId: 'lead-dob',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+40712345678',
        dateOfBirth: new Date('1985-06-20'),
        postalCode: '020202',
        country: 'RO',
      },
      correlationId: 'corr-dob',
    });

    expect(capturedBody).toContain('applicant%5Bdate_of_birth%5D=1985-06-20');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bpostal_code%5D=020202');
    expect(capturedBody).toContain('applicant%5Baddress%5D%5Bcountry%5D=RO');
  });

  it('should include IP address in accept offer request', async () => {
    const now = Math.floor(Date.now() / 1000);
    let capturedBody = '';
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      capturedBody = options?.body?.toString() ?? '';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'fin_app_accept',
            object: 'financing.application',
            status: 'accepted',
            requested_amount: 250000,
            currency: 'RON',
            accepted_offer_id: 'off_123',
            applicant: {
              first_name: 'Test',
              last_name: 'User',
              email: 'test@example.com',
              phone: '+40712345678',
            },
            metadata: { case_id: 'case-ip', clinic_id: 'clinic-ip', lead_id: 'lead-ip' },
            created: now,
            updated: now,
          }),
      });
    });

    await client.acceptOffer({
      applicationId: 'app_with_ip',
      offerId: 'off_123',
      signatureConsent: true,
      ipAddress: '192.168.1.100',
      correlationId: 'corr-ip',
    });

    expect(capturedBody).toContain('ip_address=192.168.1.100');
  });
});
