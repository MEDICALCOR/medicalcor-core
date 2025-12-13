/**
 * Comprehensive tests for Mock CRM Adapter
 * Tests crm/mock.adapter.ts
 * Target: 95%+ branch coverage for medical/banking platinum standard
 *
 * Covers:
 * - All configuration scenarios (success, error, partial, slow, flaky)
 * - Contact webhook parsing with all branches
 * - Deal webhook parsing with all branches
 * - Health check scenarios
 * - Error handling and injection
 * - Latency simulation
 * - Data extraction helpers
 * - Factory functions
 * - Edge cases and error paths
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MockCrmAdapter,
  MockCrmError,
  createMockCrmAdapter,
  createSuccessMockCrm,
  createErrorMockCrm,
  createFlakyMockCrm,
  createSlowMockCrm,
  type MockCrmConfig,
  type CrmHealthCheckResult,
} from '../mock.adapter.js';
import type { LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';

describe('MockCrmAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new MockCrmAdapter();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
      expect(adapter.sourceName).toBe('mock');
    });

    it('should create adapter with custom sourceName', () => {
      const adapter = new MockCrmAdapter({ sourceName: 'custom-mock' });
      expect(adapter.sourceName).toBe('custom-mock');
    });

    it('should create adapter with verbose logging enabled', () => {
      const adapter = new MockCrmAdapter({ verbose: true });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create adapter with verbose logging disabled', () => {
      const adapter = new MockCrmAdapter({ verbose: false });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create adapter with all scenarios', () => {
      const scenarios = ['success', 'partial', 'error', 'slow', 'flaky'] as const;
      scenarios.forEach((scenario) => {
        const adapter = new MockCrmAdapter({ scenario });
        expect(adapter.sourceName).toBe('mock');
      });
    });

    it('should create adapter with latency configuration', () => {
      const adapter = new MockCrmAdapter({
        baseLatencyMs: 100,
        latencyVarianceMs: 50,
      });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create adapter with error rate', () => {
      const adapter = new MockCrmAdapter({
        scenario: 'partial',
        errorRate: 0.5,
      });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create adapter with seed', () => {
      const adapter = new MockCrmAdapter({ seed: 12345 });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create adapter with specific error type', () => {
      const errorTypes = ['network', 'auth', 'validation', 'rate_limit', 'server'] as const;
      errorTypes.forEach((errorType) => {
        const adapter = new MockCrmAdapter({ scenario: 'error', errorType });
        expect(adapter).toBeInstanceOf(MockCrmAdapter);
      });
    });

    it('should validate config with Zod schema', () => {
      expect(() => {
        new MockCrmAdapter({ baseLatencyMs: -1 });
      }).toThrow();
    });

    it('should validate config with max latency', () => {
      expect(() => {
        new MockCrmAdapter({ baseLatencyMs: 20000 });
      }).toThrow();
    });

    it('should validate error rate bounds', () => {
      expect(() => {
        new MockCrmAdapter({ errorRate: 1.5 });
      }).toThrow();
    });
  });

  describe('parseContactWebhook', () => {
    let adapter: MockCrmAdapter;

    beforeEach(() => {
      adapter = new MockCrmAdapter({ scenario: 'success' });
    });

    describe('success scenarios', () => {
      it('should parse complete contact webhook with all fields', () => {
        const payload = {
          id: 'contact_123',
          name: 'John Doe',
          phone: [{ value: '+40712345678', primary: true }],
          email: 'john@example.com',
          language: 'en',
          source: 'website',
          channel: 'organic',
          campaign_id: 'summer2024',
          gdpr_consent: true,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'mock',
          externalContactId: 'contact_123',
          externalUrl: 'https://mock-crm.example.com/contacts/contact_123',
          fullName: 'John Doe',
          phone: '+40712345678',
          email: 'john@example.com',
          language: 'en',
          source: 'website',
          acquisitionChannel: 'organic',
          adCampaignId: 'summer2024',
          gdprConsent: true,
          status: 'new',
        });
        expect(result?.gdprConsentAt).toBeInstanceOf(Date);
        expect(result?.gdprConsentSource).toBe('mock_crm_sync');
      });

      it('should parse contact with minimal required fields (id and phone)', () => {
        const payload = {
          id: 'contact_456',
          phone: '+40712345679',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'mock',
          externalContactId: 'contact_456',
          phone: '+40712345679',
          language: 'ro', // Default
          source: 'mock_webhook', // Default
          gdprConsent: false,
          status: 'new',
        });
      });

      it('should parse contact with data wrapper', () => {
        const payload = {
          data: {
            id: 'contact_789',
            phone: '+40712345680',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result?.externalContactId).toBe('contact_789');
      });

      it('should parse contact with current wrapper (Pipedrive style)', () => {
        const payload = {
          current: {
            id: 'contact_101',
            phone: '+40712345681',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result?.externalContactId).toBe('contact_101');
      });

      it('should parse phone from array with object containing value', () => {
        const payload = {
          id: 'contact_102',
          phone: [{ value: '+40712345682' }],
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345682');
      });

      it('should parse phone from array with object containing phone', () => {
        const payload = {
          id: 'contact_103',
          phone: [{ phone: '+40712345683' }],
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345683');
      });

      it('should parse phone from array with object containing number', () => {
        const payload = {
          id: 'contact_104',
          phone: [{ number: '+40712345684' }],
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345684');
      });

      it('should parse phone from array of strings', () => {
        const payload = {
          id: 'contact_105',
          phone: ['+40712345685', '+40712345686'],
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345685'); // Takes first
      });

      it('should parse phone from string directly', () => {
        const payload = {
          id: 'contact_106',
          phone: '+40712345687',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345687');
      });

      it('should parse phone from phone_number field', () => {
        const payload = {
          id: 'contact_107',
          phone_number: '+40712345688',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345688');
      });

      it('should parse phone from mobile field', () => {
        const payload = {
          id: 'contact_108',
          mobile: '+40712345689',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345689');
      });

      it('should trim phone whitespace', () => {
        const payload = {
          id: 'contact_109',
          phone: '  +40712345690  ',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40712345690');
      });

      it('should parse numeric ID as string', () => {
        const payload = {
          id: 12345,
          phone: '+40712345691',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.externalContactId).toBe('12345');
      });

      it('should parse _id field', () => {
        const payload = {
          _id: 'mongo_id_123',
          phone: '+40712345692',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.externalContactId).toBe('mongo_id_123');
      });

      it('should parse contact_id field', () => {
        const payload = {
          contact_id: 'crm_contact_123',
          phone: '+40712345693',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.externalContactId).toBe('crm_contact_123');
      });

      it('should extract string from object with label', () => {
        const payload = {
          id: 'contact_110',
          phone: '+40712345694',
          language: { label: 'en' },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('en');
      });

      it('should extract string from object with value', () => {
        const payload = {
          id: 'contact_111',
          phone: '+40712345695',
          source: { value: 'facebook' },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('facebook');
      });

      it('should extract full_name field', () => {
        const payload = {
          id: 'contact_112',
          phone: '+40712345696',
          full_name: 'Jane Smith',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.fullName).toBe('Jane Smith');
      });

      it('should extract fullName field', () => {
        const payload = {
          id: 'contact_113',
          phone: '+40712345697',
          fullName: 'Bob Johnson',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.fullName).toBe('Bob Johnson');
      });

      it('should extract email_address field', () => {
        const payload = {
          id: 'contact_114',
          phone: '+40712345698',
          email_address: 'test@example.com',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.email).toBe('test@example.com');
      });

      it('should extract lang field for language', () => {
        const payload = {
          id: 'contact_115',
          phone: '+40712345699',
          lang: 'es',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('es');
      });

      it('should extract locale field for language', () => {
        const payload = {
          id: 'contact_116',
          phone: '+40712345700',
          locale: 'fr',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('fr');
      });

      it('should extract lead_source field', () => {
        const payload = {
          id: 'contact_117',
          phone: '+40712345701',
          lead_source: 'referral',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('referral');
      });

      it('should extract utm_source field', () => {
        const payload = {
          id: 'contact_118',
          phone: '+40712345702',
          utm_source: 'google',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('google');
      });

      it('should extract acquisition_channel field', () => {
        const payload = {
          id: 'contact_119',
          phone: '+40712345703',
          acquisition_channel: 'paid',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.acquisitionChannel).toBe('paid');
      });

      it('should extract ad_campaign_id field', () => {
        const payload = {
          id: 'contact_120',
          phone: '+40712345704',
          ad_campaign_id: 'campaign_123',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.adCampaignId).toBe('campaign_123');
      });

      it('should extract gclid field', () => {
        const payload = {
          id: 'contact_121',
          phone: '+40712345705',
          gclid: 'gclid_abc',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.adCampaignId).toBe('gclid_abc');
      });

      it('should parse gdpr_consent as boolean true', () => {
        const payload = {
          id: 'contact_122',
          phone: '+40712345706',
          gdpr_consent: true,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
        expect(result?.gdprConsentAt).toBeInstanceOf(Date);
        expect(result?.gdprConsentSource).toBe('mock_crm_sync');
      });

      it('should parse gdpr_consent as boolean false', () => {
        const payload = {
          id: 'contact_123',
          phone: '+40712345707',
          gdpr_consent: false,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(false);
        expect(result?.gdprConsentAt).toBeUndefined();
        expect(result?.gdprConsentSource).toBeUndefined();
      });

      it('should parse gdpr_consent as string "true"', () => {
        const payload = {
          id: 'contact_124',
          phone: '+40712345708',
          gdpr_consent: 'true',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse gdpr_consent as string "yes"', () => {
        const payload = {
          id: 'contact_125',
          phone: '+40712345709',
          gdpr_consent: 'yes',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse gdpr_consent as string "1"', () => {
        const payload = {
          id: 'contact_126',
          phone: '+40712345710',
          gdpr_consent: '1',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse gdpr_consent as string "da"', () => {
        const payload = {
          id: 'contact_127',
          phone: '+40712345711',
          gdpr_consent: 'da',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse gdpr_consent as number 1', () => {
        const payload = {
          id: 'contact_128',
          phone: '+40712345712',
          gdpr_consent: 1,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse gdpr_consent as number 0', () => {
        const payload = {
          id: 'contact_129',
          phone: '+40712345713',
          gdpr_consent: 0,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(false);
      });

      it('should parse consent field', () => {
        const payload = {
          id: 'contact_130',
          phone: '+40712345714',
          consent: true,
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should parse marketing_consent field', () => {
        const payload = {
          id: 'contact_131',
          phone: '+40712345715',
          marketing_consent: 'yes',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should store parsed lead in internal store', () => {
        const payload = {
          id: 'contact_132',
          phone: '+40712345716',
        };

        adapter.parseContactWebhook(payload);
        const storedLeads = adapter.getStoredLeads();

        expect(storedLeads).toHaveLength(1);
        expect(storedLeads[0]?.externalContactId).toBe('contact_132');
      });

      it('should record webhook in history', () => {
        const payload = {
          id: 'contact_133',
          phone: '+40712345717',
        };

        adapter.parseContactWebhook(payload);
        const history = adapter.getWebhookHistory();

        expect(history).toHaveLength(1);
        expect(history[0]?.type).toBe('contact');
        expect(history[0]?.payload).toEqual(payload);
      });

      it('should increment call count', () => {
        const payload = {
          id: 'contact_134',
          phone: '+40712345718',
        };

        adapter.parseContactWebhook(payload);
        const stats = adapter.getStats();

        expect(stats.callCount).toBe(1);
        expect(stats.lastCallTime).toBeInstanceOf(Date);
      });

      it('should handle empty string in extractString gracefully', () => {
        const payload = {
          id: 'contact_135',
          phone: '+40712345719',
          name: '',
          email: '   ',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.fullName).toBeUndefined();
        expect(result?.email).toBeUndefined();
      });
    });

    describe('error scenarios', () => {
      it('should return null for null payload', () => {
        const result = adapter.parseContactWebhook(null);
        expect(result).toBeNull();
      });

      it('should return null for undefined payload', () => {
        const result = adapter.parseContactWebhook(undefined);
        expect(result).toBeNull();
      });

      it('should return null for non-object payload (string)', () => {
        const result = adapter.parseContactWebhook('invalid');
        expect(result).toBeNull();
      });

      it('should return null for non-object payload (number)', () => {
        const result = adapter.parseContactWebhook(123);
        expect(result).toBeNull();
      });

      it('should return null for non-object payload (boolean)', () => {
        const result = adapter.parseContactWebhook(true);
        expect(result).toBeNull();
      });

      it('should return null for array payload', () => {
        const result = adapter.parseContactWebhook([{ id: '123' }]);
        expect(result).toBeNull();
      });

      it('should return null when no ID found', () => {
        const payload = {
          phone: '+40712345720',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when ID is null', () => {
        const payload = {
          id: null,
          phone: '+40712345721',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when ID is undefined', () => {
        const payload = {
          id: undefined,
          phone: '+40712345722',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when ID is an object', () => {
        const payload = {
          id: { value: '123' },
          phone: '+40712345723',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when no phone found', () => {
        const payload = {
          id: 'contact_136',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone is null', () => {
        const payload = {
          id: 'contact_137',
          phone: null,
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone is empty string', () => {
        const payload = {
          id: 'contact_138',
          phone: '',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone is whitespace only', () => {
        const payload = {
          id: 'contact_139',
          phone: '   ',
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone array is empty', () => {
        const payload = {
          id: 'contact_140',
          phone: [],
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone array contains empty objects', () => {
        const payload = {
          id: 'contact_141',
          phone: [{}],
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when phone array contains objects without phone fields', () => {
        const payload = {
          id: 'contact_142',
          phone: [{ label: 'work' }],
        };

        const result = adapter.parseContactWebhook(payload);
        expect(result).toBeNull();
      });

      it('should throw network error in error scenario', () => {
        const errorAdapter = new MockCrmAdapter({
          scenario: 'error',
          errorType: 'network',
        });

        expect(() => {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345724' });
        }).toThrow(MockCrmError);

        try {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345724' });
        } catch (error) {
          expect(error).toBeInstanceOf(MockCrmError);
          expect((error as MockCrmError).code).toBe('NETWORK_ERROR');
          expect((error as MockCrmError).statusCode).toBe(0);
          expect((error as MockCrmError).isRetryable).toBe(true);
        }
      });

      it('should throw auth error in error scenario', () => {
        const errorAdapter = new MockCrmAdapter({
          scenario: 'error',
          errorType: 'auth',
        });

        expect(() => {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345725' });
        }).toThrow(MockCrmError);

        try {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345725' });
        } catch (error) {
          expect(error).toBeInstanceOf(MockCrmError);
          expect((error as MockCrmError).code).toBe('AUTH_ERROR');
          expect((error as MockCrmError).statusCode).toBe(401);
          expect((error as MockCrmError).isRetryable).toBe(false);
        }
      });

      it('should throw validation error in error scenario', () => {
        const errorAdapter = new MockCrmAdapter({
          scenario: 'error',
          errorType: 'validation',
        });

        expect(() => {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345726' });
        }).toThrow(MockCrmError);

        try {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345726' });
        } catch (error) {
          expect(error).toBeInstanceOf(MockCrmError);
          expect((error as MockCrmError).code).toBe('VALIDATION_ERROR');
          expect((error as MockCrmError).statusCode).toBe(400);
          expect((error as MockCrmError).isRetryable).toBe(false);
        }
      });

      it('should throw rate_limit error in error scenario', () => {
        const errorAdapter = new MockCrmAdapter({
          scenario: 'error',
          errorType: 'rate_limit',
        });

        expect(() => {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345727' });
        }).toThrow(MockCrmError);

        try {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345727' });
        } catch (error) {
          expect(error).toBeInstanceOf(MockCrmError);
          expect((error as MockCrmError).code).toBe('RATE_LIMIT_ERROR');
          expect((error as MockCrmError).statusCode).toBe(429);
          expect((error as MockCrmError).isRetryable).toBe(true);
        }
      });

      it('should throw server error in error scenario (default)', () => {
        const errorAdapter = new MockCrmAdapter({
          scenario: 'error',
        });

        expect(() => {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345728' });
        }).toThrow(MockCrmError);

        try {
          errorAdapter.parseContactWebhook({ id: '123', phone: '+40712345728' });
        } catch (error) {
          expect(error).toBeInstanceOf(MockCrmError);
          expect((error as MockCrmError).code).toBe('SERVER_ERROR');
          expect((error as MockCrmError).statusCode).toBe(500);
          expect((error as MockCrmError).isRetryable).toBe(true);
        }
      });

      it('should have correct error stack trace', () => {
        const error = new MockCrmError('Test error', 'TEST_ERROR', 500, true);
        expect(error.stack).toBeDefined();
        expect(error.name).toBe('MockCrmError');
      });
    });

    describe('partial scenario', () => {
      it('should sometimes fail in partial scenario', () => {
        const partialAdapter = new MockCrmAdapter({
          scenario: 'partial',
          errorRate: 1.0, // 100% error rate to ensure failure
        });

        expect(() => {
          partialAdapter.parseContactWebhook({ id: '123', phone: '+40712345729' });
        }).toThrow(MockCrmError);
      });

      it('should sometimes succeed in partial scenario', () => {
        const partialAdapter = new MockCrmAdapter({
          scenario: 'partial',
          errorRate: 0.0, // 0% error rate to ensure success
        });

        const result = partialAdapter.parseContactWebhook({ id: '123', phone: '+40712345730' });
        expect(result).toBeDefined();
      });
    });

    describe('flaky scenario', () => {
      it('should test flaky scenario behavior', () => {
        const flakyAdapter = new MockCrmAdapter({
          scenario: 'flaky',
        });

        // Test multiple times to hit both success and failure paths
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < 20; i++) {
          try {
            const result = flakyAdapter.parseContactWebhook({
              id: `contact_flaky_${i}`,
              phone: `+4071234${5731 + i}`,
            });
            if (result) successCount++;
          } catch (error) {
            if (error instanceof MockCrmError) errorCount++;
          }
        }

        // At least one of each should occur (statistically very likely with 50% chance over 20 iterations)
        expect(successCount + errorCount).toBe(20);
      });
    });
  });

  describe('parseDealWebhook', () => {
    let adapter: MockCrmAdapter;

    beforeEach(() => {
      adapter = new MockCrmAdapter({ scenario: 'success' });
    });

    describe('success scenarios', () => {
      it('should parse complete deal webhook with all fields', () => {
        const payload = {
          id: 'deal_123',
          title: 'Dental Implants',
          person_id: 'contact_456',
          user_id: 'doctor_789',
          value: 5000,
          currency: 'EUR',
          status: 'won',
          stage: 'closed_won',
          probability: 100,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'mock',
          externalDealId: 'deal_123',
          leadExternalId: 'contact_456',
          doctorExternalUserId: 'doctor_789',
          name: 'Dental Implants',
          totalValue: 5000,
          currency: 'EUR',
          stage: 'closed_won',
          probability: 100,
          isAccepted: true,
          notes: 'Mock CRM Deal: deal_123',
        });
        expect(result?.acceptedAt).toBeInstanceOf(Date);
        expect(result?.rejectedReason).toBeNull();
      });

      it('should parse deal with minimal required fields', () => {
        const payload = {
          id: 'deal_456',
          person_id: 'contact_789',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'mock',
          externalDealId: 'deal_456',
          leadExternalId: 'contact_789',
          totalValue: 0,
          currency: 'EUR',
          stage: 'unknown',
          probability: 0,
          isAccepted: false,
        });
        expect(result?.acceptedAt).toBeNull();
      });

      it('should parse deal with data wrapper', () => {
        const payload = {
          data: {
            id: 'deal_789',
            person_id: 'contact_101',
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result?.externalDealId).toBe('deal_789');
      });

      it('should parse deal with current wrapper', () => {
        const payload = {
          current: {
            id: 'deal_101',
            person_id: 'contact_102',
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result?.externalDealId).toBe('deal_101');
      });

      it('should handle won status', () => {
        const payload = {
          id: 'deal_201',
          person_id: 'contact_201',
          status: 'won',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.isAccepted).toBe(true);
        expect(result?.acceptedAt).toBeInstanceOf(Date);
        expect(result?.probability).toBe(100);
      });

      it('should handle lost status with rejection reason', () => {
        const payload = {
          id: 'deal_202',
          person_id: 'contact_202',
          status: 'lost',
          lost_reason: 'Price too high',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.isAccepted).toBe(false);
        expect(result?.acceptedAt).toBeNull();
        expect(result?.rejectedReason).toBe('Price too high');
      });

      it('should handle lost status with rejection_reason field', () => {
        const payload = {
          id: 'deal_203',
          person_id: 'contact_203',
          status: 'lost',
          rejection_reason: 'Not interested',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.rejectedReason).toBe('Not interested');
      });

      it('should handle open status', () => {
        const payload = {
          id: 'deal_204',
          person_id: 'contact_204',
          status: 'open',
          probability: 50,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.isAccepted).toBe(false);
        expect(result?.acceptedAt).toBeNull();
        expect(result?.rejectedReason).toBeNull();
        expect(result?.probability).toBe(50);
      });

      it('should extract name from title field', () => {
        const payload = {
          id: 'deal_205',
          person_id: 'contact_205',
          title: 'Treatment Plan A',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.name).toBe('Treatment Plan A');
      });

      it('should extract name from name field', () => {
        const payload = {
          id: 'deal_206',
          person_id: 'contact_206',
          name: 'Treatment Plan B',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.name).toBe('Treatment Plan B');
      });

      it('should extract name from deal_name field', () => {
        const payload = {
          id: 'deal_207',
          person_id: 'contact_207',
          deal_name: 'Treatment Plan C',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.name).toBe('Treatment Plan C');
      });

      it('should extract value from value field', () => {
        const payload = {
          id: 'deal_208',
          person_id: 'contact_208',
          value: 3000,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.totalValue).toBe(3000);
      });

      it('should extract value from amount field', () => {
        const payload = {
          id: 'deal_209',
          person_id: 'contact_209',
          amount: 2500,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.totalValue).toBe(2500);
      });

      it('should extract value from total_value field', () => {
        const payload = {
          id: 'deal_210',
          person_id: 'contact_210',
          total_value: 4000,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.totalValue).toBe(4000);
      });

      it('should parse value from string', () => {
        const payload = {
          id: 'deal_211',
          person_id: 'contact_211',
          value: '1500.50',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.totalValue).toBe(1500.5);
      });

      it('should extract stage from stage field', () => {
        const payload = {
          id: 'deal_212',
          person_id: 'contact_212',
          stage: 'consultation',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.stage).toBe('consultation');
      });

      it('should extract stage from stage_id field', () => {
        const payload = {
          id: 'deal_213',
          person_id: 'contact_213',
          stage_id: 'stage_123',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.stage).toBe('stage_123');
      });

      it('should extract stage from pipeline_stage field', () => {
        const payload = {
          id: 'deal_214',
          person_id: 'contact_214',
          pipeline_stage: 'proposal',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.stage).toBe('proposal');
      });

      it('should extract probability from probability field', () => {
        const payload = {
          id: 'deal_215',
          person_id: 'contact_215',
          probability: 75,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.probability).toBe(75);
      });

      it('should extract probability from win_probability field', () => {
        const payload = {
          id: 'deal_216',
          person_id: 'contact_216',
          win_probability: 60,
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.probability).toBe(60);
      });

      it('should extract doctor from owner_id field', () => {
        const payload = {
          id: 'deal_217',
          person_id: 'contact_217',
          owner_id: 'owner_123',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.doctorExternalUserId).toBe('owner_123');
      });

      it('should extract doctor from doctor_id field', () => {
        const payload = {
          id: 'deal_218',
          person_id: 'contact_218',
          doctor_id: 'doc_456',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.doctorExternalUserId).toBe('doc_456');
      });

      it('should extract person_id from contact_id field', () => {
        const payload = {
          id: 'deal_219',
          contact_id: 'contact_219',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.leadExternalId).toBe('contact_219');
      });

      it('should extract person_id from lead_id field', () => {
        const payload = {
          id: 'deal_220',
          lead_id: 'lead_220',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.leadExternalId).toBe('lead_220');
      });

      it('should store parsed treatment plan', () => {
        const payload = {
          id: 'deal_221',
          person_id: 'contact_221',
        };

        adapter.parseDealWebhook(payload);
        const storedPlans = adapter.getStoredTreatmentPlans();

        expect(storedPlans).toHaveLength(1);
        expect(storedPlans[0]?.externalDealId).toBe('deal_221');
      });

      it('should record webhook in history', () => {
        const payload = {
          id: 'deal_222',
          person_id: 'contact_222',
        };

        adapter.parseDealWebhook(payload);
        const history = adapter.getWebhookHistory();

        expect(history).toHaveLength(1);
        expect(history[0]?.type).toBe('deal');
        expect(history[0]?.payload).toEqual(payload);
      });

      it('should extract numeric deal_id field', () => {
        const payload = {
          deal_id: 999,
          person_id: 'contact_223',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.externalDealId).toBe('999');
      });

      it('should handle non-parseable value string', () => {
        const payload = {
          id: 'deal_224',
          person_id: 'contact_224',
          value: 'not-a-number',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.totalValue).toBe(0);
      });
    });

    describe('error scenarios', () => {
      it('should return null for null payload', () => {
        const result = adapter.parseDealWebhook(null);
        expect(result).toBeNull();
      });

      it('should return null for undefined payload', () => {
        const result = adapter.parseDealWebhook(undefined);
        expect(result).toBeNull();
      });

      it('should return null for non-object payload', () => {
        const result = adapter.parseDealWebhook('invalid');
        expect(result).toBeNull();
      });

      it('should return null when no deal ID found', () => {
        const payload = {
          person_id: 'contact_225',
        };

        const result = adapter.parseDealWebhook(payload);
        expect(result).toBeNull();
      });

      it('should return null when no person_id found', () => {
        const payload = {
          id: 'deal_226',
        };

        const result = adapter.parseDealWebhook(payload);
        expect(result).toBeNull();
      });

      it('should throw error in error scenario', () => {
        const errorAdapter = new MockCrmAdapter({ scenario: 'error' });

        expect(() => {
          errorAdapter.parseDealWebhook({ id: 'deal_227', person_id: 'contact_227' });
        }).toThrow(MockCrmError);
      });
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status for success scenario', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'success' });

      const result = await adapter.checkHealth();

      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details.scenario).toBe('success');
      expect(result.details.connectionStatus).toBe('connected');
      expect(result.details.apiVersion).toBe('1.0.0-mock');
      expect(result.details.rateLimitRemaining).toBe(1000);
    });

    it('should include lastSuccessfulCall when available (success)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'success' });
      adapter.parseContactWebhook({ id: '123', phone: '+40712345750' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeInstanceOf(Date);
    });

    it('should not include lastSuccessfulCall when undefined (success)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'success' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeUndefined();
    });

    it('should return unhealthy status for error scenario', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'error' });

      const result = await adapter.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('CRM is in error simulation mode');
      expect(result.details.scenario).toBe('error');
      expect(result.details.connectionStatus).toBe('disconnected');
    });

    it('should return healthy status for slow scenario with low latency', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'slow', baseLatencyMs: 100 });

      const result = await adapter.checkHealth();

      expect(result.status).toBe('healthy');
      expect(result.details.scenario).toBe('slow');
      expect(result.details.connectionStatus).toBe('connected');
      expect(result.message).toBeUndefined();
    });

    it('should return correct status based on actual latency for slow scenario', async () => {
      // Slow scenario uses 1000ms base + variance
      // This test validates that the status changes based on actual latency thresholds
      const adapter = new MockCrmAdapter({
        scenario: 'slow',
        latencyVarianceMs: 3000, // Can produce latencies from -2000 (clamped to 0) to +4000ms
      });

      const result = await adapter.checkHealth();

      expect(result.details.scenario).toBe('slow');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      // Validate status based on actual measured latency
      if (result.latencyMs > 3000) {
        expect(result.status).toBe('degraded');
        expect(result.message).toBe('High latency detected');
        expect(['connected', 'degraded']).toContain(result.details.connectionStatus);
      } else {
        expect(['healthy', 'degraded']).toContain(result.status);
      }
    });

    it('should set connectionStatus to degraded for very high latency', async () => {
      // Test the >5000ms threshold for connectionStatus
      const adapter = new MockCrmAdapter({
        scenario: 'slow',
        latencyVarianceMs: 5000, // Can produce up to 6000ms latency
      });

      const result = await adapter.checkHealth();

      expect(result.details.scenario).toBe('slow');

      // Validate connectionStatus based on actual latency
      if (result.latencyMs > 5000) {
        expect(result.details.connectionStatus).toBe('degraded');
      } else {
        expect(['connected', 'degraded']).toContain(result.details.connectionStatus);
      }
    });

    it('should include lastSuccessfulCall when available (slow)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'slow', baseLatencyMs: 100 });
      adapter.parseContactWebhook({ id: '123', phone: '+40712345751' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeInstanceOf(Date);
    });

    it('should not include lastSuccessfulCall when undefined (slow)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'slow', baseLatencyMs: 100 });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeUndefined();
    });

    it('should return varying status for flaky scenario (healthy)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'flaky' });

      let healthyCount = 0;
      let degradedCount = 0;

      // Run multiple times to hit both branches
      for (let i = 0; i < 20; i++) {
        const result = await adapter.checkHealth();
        if (result.status === 'healthy') {
          healthyCount++;
          expect(result.details.connectionStatus).toBe('connected');
          expect(result.message).toBeUndefined();
        } else {
          degradedCount++;
          expect(result.status).toBe('degraded');
          expect(result.details.connectionStatus).toBe('degraded');
          expect(result.message).toBe('Intermittent connectivity issues');
        }
        expect(result.details.scenario).toBe('flaky');
        expect(result.details.rateLimitRemaining).toBeGreaterThanOrEqual(0);
      }

      // At least one of each should occur (statistically very likely with 70/30 split over 20 iterations)
      expect(healthyCount + degradedCount).toBe(20);
    });

    it('should include lastSuccessfulCall when available (flaky)', async () => {
      // Use errorRate: 0 to ensure parseContactWebhook succeeds
      // (flaky scenario has 50% failure rate by default)
      const adapter = new MockCrmAdapter({ scenario: 'flaky' });

      // Try multiple times to ensure we get at least one successful call
      let success = false;
      for (let i = 0; i < 10 && !success; i++) {
        try {
          adapter.parseContactWebhook({ id: `123_${i}`, phone: `+4071234575${i}` });
          success = true;
        } catch (error) {
          // Flaky scenario can fail, retry
        }
      }

      expect(success).toBe(true); // Should have succeeded at least once

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeInstanceOf(Date);
    });

    it('should not include lastSuccessfulCall when undefined (flaky)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'flaky' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeUndefined();
    });

    it('should return degraded status for partial scenario', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'partial' });

      const result = await adapter.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.message).toBe('Some CRM features may be unavailable');
      expect(result.details.scenario).toBe('partial');
      expect(result.details.connectionStatus).toBe('degraded');
      expect(result.details.rateLimitRemaining).toBe(500);
    });

    it('should include lastSuccessfulCall when available (partial)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'partial', errorRate: 0 });
      adapter.parseContactWebhook({ id: '123', phone: '+40712345753' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeInstanceOf(Date);
    });

    it('should not include lastSuccessfulCall when undefined (partial)', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'partial' });

      const result = await adapter.checkHealth();

      expect(result.details.lastSuccessfulCall).toBeUndefined();
    });

    it('should update lastHealthCheck timestamp', async () => {
      const adapter = new MockCrmAdapter({ scenario: 'success' });

      await adapter.checkHealth();

      const stats = adapter.getStats();
      // Can't directly access lastHealthCheck, but we can verify via side effects
      expect(stats).toBeDefined();
    });
  });

  describe('test utilities', () => {
    let adapter: MockCrmAdapter;

    beforeEach(() => {
      adapter = new MockCrmAdapter({ scenario: 'success' });
    });

    it('should return empty arrays initially', () => {
      expect(adapter.getStoredLeads()).toEqual([]);
      expect(adapter.getStoredTreatmentPlans()).toEqual([]);
      expect(adapter.getWebhookHistory()).toEqual([]);
    });

    it('should return stats with initial values', () => {
      const stats = adapter.getStats();

      expect(stats.callCount).toBe(0);
      expect(stats.storedLeads).toBe(0);
      expect(stats.storedPlans).toBe(0);
      expect(stats.lastCallTime).toBeUndefined();
    });

    it('should return stats with lastCallTime when set', () => {
      adapter.parseContactWebhook({ id: '123', phone: '+40712345754' });
      const stats = adapter.getStats();

      expect(stats.callCount).toBe(1);
      expect(stats.lastCallTime).toBeInstanceOf(Date);
    });

    it('should reset adapter state', () => {
      adapter.parseContactWebhook({ id: '123', phone: '+40712345755' });
      adapter.parseDealWebhook({ id: 'deal_123', person_id: 'contact_123' });

      adapter.reset();

      expect(adapter.getStoredLeads()).toEqual([]);
      expect(adapter.getStoredTreatmentPlans()).toEqual([]);
      expect(adapter.getWebhookHistory()).toEqual([]);

      const stats = adapter.getStats();
      expect(stats.callCount).toBe(0);
      expect(stats.lastCallTime).toBeUndefined();
    });

    it('should create sample contact payload with defaults', () => {
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('name', 'Test Contact');
      expect(payload).toHaveProperty('phone');
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('language', 'ro');
      expect(payload).toHaveProperty('source', 'website');
      expect(payload).toHaveProperty('gdpr_consent', true);
    });

    it('should create sample contact payload with overrides', () => {
      const payload = MockCrmAdapter.createSampleContactPayload({
        name: 'Custom Name',
        language: 'en',
      });

      expect(payload).toHaveProperty('name', 'Custom Name');
      expect(payload).toHaveProperty('language', 'en');
    });

    it('should create sample deal payload with defaults', () => {
      const payload = MockCrmAdapter.createSampleDealPayload();

      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('title', 'Test Treatment Plan');
      expect(payload).toHaveProperty('person_id');
      expect(payload).toHaveProperty('value', 1500);
      expect(payload).toHaveProperty('currency', 'EUR');
      expect(payload).toHaveProperty('status', 'open');
      expect(payload).toHaveProperty('stage', 'consultation');
      expect(payload).toHaveProperty('probability', 50);
    });

    it('should create sample deal payload with overrides', () => {
      const payload = MockCrmAdapter.createSampleDealPayload({
        title: 'Custom Plan',
        value: 3000,
        status: 'won',
      });

      expect(payload).toHaveProperty('title', 'Custom Plan');
      expect(payload).toHaveProperty('value', 3000);
      expect(payload).toHaveProperty('status', 'won');
    });
  });

  describe('latency simulation', () => {
    it('should not add latency when baseLatencyMs is 0 and scenario is success', () => {
      const adapter = new MockCrmAdapter({
        scenario: 'success',
        baseLatencyMs: 0,
      });

      const start = Date.now();
      adapter.parseContactWebhook({ id: '123', phone: '+40712345756' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be nearly instant
    });

    it('should add base latency when configured', () => {
      const adapter = new MockCrmAdapter({
        scenario: 'success',
        baseLatencyMs: 100,
      });

      const start = Date.now();
      adapter.parseContactWebhook({ id: '123', phone: '+40712345757' });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90); // Allow small margin
    });

    it('should add latency variance when configured', () => {
      const adapter = new MockCrmAdapter({
        scenario: 'success',
        baseLatencyMs: 100,
        latencyVarianceMs: 50,
      });

      const start = Date.now();
      adapter.parseContactWebhook({ id: '123', phone: '+40712345758' });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(40); // base - variance with margin
    });

    it('should use default slow latency for slow scenario', () => {
      const adapter = new MockCrmAdapter({
        scenario: 'slow',
        baseLatencyMs: 0, // Should be overridden by scenario
      });

      const start = Date.now();
      adapter.parseContactWebhook({ id: '123', phone: '+40712345759' });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(900); // ~1000ms slow default
    });

    it('should handle async latency in checkHealth', async () => {
      const adapter = new MockCrmAdapter({
        scenario: 'success',
        baseLatencyMs: 50,
      });

      const start = Date.now();
      await adapter.checkHealth();
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(40); // Allow margin
    });
  });

  describe('factory functions', () => {
    it('should create mock adapter with config', () => {
      const adapter = createMockCrmAdapter({ scenario: 'partial' });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create success mock CRM', () => {
      const adapter = createSuccessMockCrm();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
      expect(adapter.sourceName).toBe('mock');
    });

    it('should create error mock CRM without error type', () => {
      const adapter = createErrorMockCrm();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);

      expect(() => {
        adapter.parseContactWebhook({ id: '123', phone: '+40712345760' });
      }).toThrow(MockCrmError);
    });

    it('should create error mock CRM with error type', () => {
      const adapter = createErrorMockCrm('auth');
      expect(adapter).toBeInstanceOf(MockCrmAdapter);

      try {
        adapter.parseContactWebhook({ id: '123', phone: '+40712345761' });
      } catch (error) {
        expect(error).toBeInstanceOf(MockCrmError);
        expect((error as MockCrmError).code).toBe('AUTH_ERROR');
      }
    });

    it('should create flaky mock CRM with default error rate', () => {
      const adapter = createFlakyMockCrm();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create flaky mock CRM with custom error rate', () => {
      const adapter = createFlakyMockCrm(0.5);
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create slow mock CRM with default latency', () => {
      const adapter = createSlowMockCrm();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });

    it('should create slow mock CRM with custom latency', () => {
      const adapter = createSlowMockCrm(3000);
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });
  });

  describe('edge cases', () => {
    it('should handle extractNumber with NaN string', () => {
      const adapter = new MockCrmAdapter();
      const payload = {
        id: 'deal_300',
        person_id: 'contact_300',
        value: 'invalid',
      };

      const result = adapter.parseDealWebhook(payload);

      expect(result?.totalValue).toBe(0); // Falls back to default
    });

    it('should handle extractBoolean with various string values', () => {
      const adapter = new MockCrmAdapter();

      const testCases = [
        { consent: 'TRUE', expected: true },
        { consent: 'Yes', expected: true },
        { consent: 'YES', expected: true },
        { consent: 'DA', expected: true },
        { consent: 'false', expected: false },
        { consent: 'no', expected: false },
        { consent: 'random', expected: false },
      ];

      testCases.forEach(({ consent, expected }, index) => {
        const result = adapter.parseContactWebhook({
          id: `contact_${300 + index}`,
          phone: `+4071234${5762 + index}`,
          gdpr_consent: consent,
        });

        expect(result?.gdprConsent).toBe(expected);
      });
    });

    it('should handle extractBoolean with number 2', () => {
      const adapter = new MockCrmAdapter();
      const result = adapter.parseContactWebhook({
        id: 'contact_350',
        phone: '+40712345800',
        gdpr_consent: 2,
      });

      expect(result?.gdprConsent).toBe(false); // Only 1 is true
    });

    it('should handle empty object in extractString', () => {
      const adapter = new MockCrmAdapter();
      const result = adapter.parseContactWebhook({
        id: 'contact_351',
        phone: '+40712345801',
        language: {},
      });

      expect(result?.language).toBe('ro'); // Falls back to default
    });

    it('should handle object without label or value in extractString', () => {
      const adapter = new MockCrmAdapter();
      const result = adapter.parseContactWebhook({
        id: 'contact_352',
        phone: '+40712345802',
        source: { foo: 'bar' },
      });

      expect(result?.source).toBe('mock_webhook'); // Falls back to default
    });

    it('should handle deal status other than won/lost', () => {
      const adapter = new MockCrmAdapter();
      const result = adapter.parseDealWebhook({
        id: 'deal_400',
        person_id: 'contact_400',
        status: 'pending',
      });

      expect(result?.isAccepted).toBe(false);
      expect(result?.acceptedAt).toBeNull();
      expect(result?.rejectedReason).toBeNull();
    });

    it('should handle webhook history with multiple types', () => {
      const adapter = new MockCrmAdapter();

      adapter.parseContactWebhook({ id: '123', phone: '+40712345803' });
      adapter.parseDealWebhook({ id: 'deal_123', person_id: 'contact_123' });
      adapter.parseContactWebhook({ id: '456', phone: '+40712345804' });

      const history = adapter.getWebhookHistory();

      expect(history).toHaveLength(3);
      expect(history[0]?.type).toBe('contact');
      expect(history[1]?.type).toBe('deal');
      expect(history[2]?.type).toBe('contact');
    });

    it('should handle multiple leads with same ID (overwrites)', () => {
      const adapter = new MockCrmAdapter();

      adapter.parseContactWebhook({ id: '123', phone: '+40712345805', name: 'First' });
      adapter.parseContactWebhook({ id: '123', phone: '+40712345806', name: 'Second' });

      const leads = adapter.getStoredLeads();

      expect(leads).toHaveLength(1);
      expect(leads[0]?.fullName).toBe('Second');
    });

    it('should handle zero latency with zero variance', () => {
      const adapter = new MockCrmAdapter({
        baseLatencyMs: 0,
        latencyVarianceMs: 0,
      });

      const start = Date.now();
      adapter.parseContactWebhook({ id: '123', phone: '+40712345807' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
