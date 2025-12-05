/**
 * Comprehensive tests for Pipedrive CRM Adapter
 * Tests crm/pipedrive.adapter.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PipedriveAdapter } from '../crm/pipedrive.adapter.js';
import type { LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';

describe('PipedriveAdapter', () => {
  let adapter: PipedriveAdapter;

  beforeEach(() => {
    adapter = new PipedriveAdapter();
    // Reset environment variables
    delete process.env.PIPEDRIVE_FIELD_LANGUAGE;
    delete process.env.PIPEDRIVE_FIELD_UTM_SOURCE;
    delete process.env.PIPEDRIVE_FIELD_UTM_MEDIUM;
    delete process.env.PIPEDRIVE_FIELD_UTM_CAMPAIGN;
    delete process.env.PIPEDRIVE_FIELD_GDPR_CONSENT;
    delete process.env.PIPEDRIVE_FIELD_AD_CAMPAIGN_ID;
    delete process.env.PIPEDRIVE_FIELD_ACQUISITION_CHANNEL;
    delete process.env.PIPEDRIVE_COMPANY_DOMAIN;
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.PIPEDRIVE_FIELD_LANGUAGE;
    delete process.env.PIPEDRIVE_FIELD_UTM_SOURCE;
    delete process.env.PIPEDRIVE_FIELD_UTM_MEDIUM;
    delete process.env.PIPEDRIVE_FIELD_UTM_CAMPAIGN;
    delete process.env.PIPEDRIVE_FIELD_GDPR_CONSENT;
    delete process.env.PIPEDRIVE_FIELD_AD_CAMPAIGN_ID;
    delete process.env.PIPEDRIVE_FIELD_ACQUISITION_CHANNEL;
    delete process.env.PIPEDRIVE_COMPANY_DOMAIN;
  });

  describe('constructor', () => {
    it('should have correct sourceName', () => {
      expect(adapter.sourceName).toBe('pipedrive');
    });
  });

  describe('parseContactWebhook', () => {
    describe('happy path', () => {
      it('should parse complete person webhook with all fields', () => {
        const payload = {
          current: {
            id: 12345,
            name: 'John Doe',
            phone: [{ value: '+40700000001', label: 'work', primary: true }],
            email: [{ value: 'john@example.com', label: 'work', primary: true }],
            language: 'en',
            utm_source: 'google',
            utm_medium: 'cpc',
            utm_campaign: 'summer2024',
            gdpr_consent: 'true',
            ad_campaign_id: 'abc123',
            acquisition_channel: 'organic',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'pipedrive',
          externalContactId: '12345',
          externalUrl: 'https://medicalcor.pipedrive.com/person/12345',
          fullName: 'John Doe',
          phone: '+40700000001',
          email: 'john@example.com',
          language: 'en',
          source: 'google',
          acquisitionChannel: 'organic',
          adCampaignId: 'abc123',
          gdprConsent: true,
          status: 'new',
        });
        expect(result?.gdprConsentAt).toBeInstanceOf(Date);
        expect(result?.gdprConsentSource).toBe('pipedrive_sync');
        expect(result?.metadata).toMatchObject({
          raw_pipedrive_id: '12345',
          utm_medium: 'cpc',
          utm_campaign: 'summer2024',
        });
      });

      it('should parse person webhook with minimal required fields', () => {
        const payload = {
          data: {
            id: 999,
            phone: '+40700111222',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'pipedrive',
          externalContactId: '999',
          phone: '+40700111222',
          language: 'ro', // Default
          source: 'pipedrive_webhook', // Default
          gdprConsent: false,
          status: 'new',
        });
      });

      it('should parse phone from string format', () => {
        const payload = {
          data: {
            id: 111,
            phone: '+40700333444',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40700333444');
      });

      it('should parse phone from array format', () => {
        const payload = {
          data: {
            id: 222,
            phone: [
              { value: '+40700555666', primary: true },
              { value: '+40700777888', primary: false },
            ],
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.phone).toBe('+40700555666'); // Takes first
      });

      it('should parse email from string format', () => {
        const payload = {
          data: {
            id: 333,
            phone: '+40700123456',
            email: 'test@example.com',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.email).toBe('test@example.com');
      });

      it('should parse email from array format', () => {
        const payload = {
          data: {
            id: 444,
            phone: '+40700123456',
            email: [{ value: 'primary@example.com' }, { value: 'secondary@example.com' }],
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.email).toBe('primary@example.com'); // Takes first
      });
    });

    describe('custom field extraction', () => {
      it('should use environment variable for custom field mapping', () => {
        process.env.PIPEDRIVE_FIELD_LANGUAGE = 'abc123_language';
        process.env.PIPEDRIVE_FIELD_UTM_SOURCE = 'def456_source';

        const payload = {
          data: {
            id: 555,
            phone: '+40700123456',
            abc123_language: 'fr',
            def456_source: 'facebook',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('fr');
        expect(result?.source).toBe('facebook');
      });

      it('should extract custom field with label format', () => {
        const payload = {
          data: {
            id: 666,
            phone: '+40700123456',
            language: { id: 1, label: 'English', value: 'en' },
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('English');
      });

      it('should extract custom field with value property', () => {
        const payload = {
          data: {
            id: 777,
            phone: '+40700123456',
            utm_source: { value: 'linkedin' },
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('linkedin');
      });

      it('should handle boolean custom fields', () => {
        const payload = {
          data: {
            id: 888,
            phone: '+40700123456',
            gdpr_consent: true,
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(true);
      });

      it('should handle numeric custom fields', () => {
        const payload = {
          data: {
            id: 999,
            phone: '+40700123456',
            acquisition_channel: 123,
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.acquisitionChannel).toBe('123');
      });

      it('should use fallback field names', () => {
        const payload = {
          data: {
            id: 1111,
            phone: '+40700123456',
            limba: 'ro', // Romanian fallback
            lead_source: 'email',
            marketing_medium: 'newsletter',
            campaign: 'q1-2024',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('ro');
        expect(result?.source).toBe('email');
        expect(result?.metadata?.utm_medium).toBe('newsletter');
        expect(result?.metadata?.utm_campaign).toBe('q1-2024');
      });
    });

    describe('GDPR consent parsing', () => {
      it('should parse "true" as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'true' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "yes" as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'yes' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "da" (Romanian) as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'da' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "1" as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: '1' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "agreed" as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'agreed' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "consimtit" (Romanian) as consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'consimtit' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should parse "false" as no consent', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'false' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(false);
      });

      it('should handle missing consent field', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(false);
      });

      it('should be case insensitive', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'TRUE' },
        };
        expect(adapter.parseContactWebhook(payload)?.gdprConsent).toBe(true);
      });

      it('should set gdprConsentAt when consent is given', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'yes' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.gdprConsentAt).toBeInstanceOf(Date);
        expect(result?.gdprConsentSource).toBe('pipedrive_sync');
      });

      it('should not set gdprConsentAt when consent is not given', () => {
        const payload = {
          data: { id: 1, phone: '+40700123456', gdpr_consent: 'false' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.gdprConsentAt).toBeUndefined();
        expect(result?.gdprConsentSource).toBeUndefined();
      });
    });

    describe('company domain configuration', () => {
      it('should use default company domain', () => {
        const payload = {
          data: { id: 123, phone: '+40700123456' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.externalUrl).toBe('https://medicalcor.pipedrive.com/person/123');
      });

      it('should use custom company domain from env', () => {
        process.env.PIPEDRIVE_COMPANY_DOMAIN = 'custom-company';
        const payload = {
          data: { id: 456, phone: '+40700123456' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.externalUrl).toBe('https://custom-company.pipedrive.com/person/456');
      });
    });

    describe('edge cases and error handling', () => {
      it('should return null for null payload', () => {
        expect(adapter.parseContactWebhook(null)).toBeNull();
      });

      it('should return null for undefined payload', () => {
        expect(adapter.parseContactWebhook(undefined)).toBeNull();
      });

      it('should return null for non-object payload', () => {
        expect(adapter.parseContactWebhook('string')).toBeNull();
        expect(adapter.parseContactWebhook(123)).toBeNull();
        expect(adapter.parseContactWebhook(true)).toBeNull();
      });

      it('should return null for empty object', () => {
        expect(adapter.parseContactWebhook({})).toBeNull();
      });

      it('should return null when id is missing', () => {
        const payload = {
          data: { phone: '+40700123456' },
        };
        expect(adapter.parseContactWebhook(payload)).toBeNull();
      });

      it('should return null when phone is missing', () => {
        const payload = {
          data: { id: 123 },
        };
        expect(adapter.parseContactWebhook(payload)).toBeNull();
      });

      it('should return null when phone is empty string', () => {
        const payload = {
          data: { id: 123, phone: '' },
        };
        expect(adapter.parseContactWebhook(payload)).toBeNull();
      });

      it('should return null when phone array is empty', () => {
        const payload = {
          data: { id: 123, phone: [] },
        };
        expect(adapter.parseContactWebhook(payload)).toBeNull();
      });

      it('should trim whitespace from phone', () => {
        const payload = {
          data: { id: 123, phone: '  +40700123456  ' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.phone).toBe('+40700123456');
      });

      it('should handle numeric id', () => {
        const payload = {
          data: { id: 99999, phone: '+40700123456' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.externalContactId).toBe('99999');
      });

      it('should handle string id', () => {
        const payload = {
          data: { id: '88888', phone: '+40700123456' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.externalContactId).toBe('88888');
      });

      it('should skip empty custom field values', () => {
        const payload = {
          data: {
            id: 123,
            phone: '+40700123456',
            language: '  ',
            utm_source: '',
          },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.language).toBe('ro'); // Falls back to default
        expect(result?.source).toBe('pipedrive_webhook'); // Falls back to default
      });

      it('should handle missing name field', () => {
        const payload = {
          data: { id: 123, phone: '+40700123456' },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.fullName).toBeUndefined();
      });

      it('should handle email as empty array', () => {
        const payload = {
          data: { id: 123, phone: '+40700123456', email: [] },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.email).toBeUndefined();
      });
    });
  });

  describe('parseDealWebhook', () => {
    describe('happy path', () => {
      it('should parse complete deal webhook', () => {
        const payload = {
          current: {
            id: 5678,
            title: 'Dental Implant Treatment',
            person_id: { value: 12345 },
            user_id: { id: 99 },
            value: 5000,
            currency: 'EUR',
            stage_id: 3,
            probability: 75,
            status: 'open',
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'pipedrive',
          externalDealId: '5678',
          leadExternalId: '12345',
          doctorExternalUserId: '99',
          name: 'Dental Implant Treatment',
          totalValue: 5000,
          currency: 'EUR',
          stage: 'stage_3',
          probability: 75,
          isAccepted: false,
          acceptedAt: null,
          rejectedReason: null,
          notes: 'Pipedrive Deal: Dental Implant Treatment',
        });
      });

      it('should parse deal with minimal fields', () => {
        const payload = {
          data: {
            id: 1111,
            person_id: 2222,
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          externalSource: 'pipedrive',
          externalDealId: '1111',
          leadExternalId: '2222',
          totalValue: 0,
          currency: 'EUR',
          stage: 'unknown',
          probability: 0,
          isAccepted: false,
        });
      });

      it('should handle won deal', () => {
        const payload = {
          data: {
            id: 3333,
            person_id: 4444,
            status: 'won',
            won_time: '2024-01-15T10:30:00Z',
            probability: 100,
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.isAccepted).toBe(true);
        expect(result?.probability).toBe(100);
        expect(result?.acceptedAt).toBeInstanceOf(Date);
        expect(result?.acceptedAt?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
      });

      it('should handle lost deal', () => {
        const payload = {
          data: {
            id: 5555,
            person_id: 6666,
            status: 'lost',
            lost_reason: 'Price too high',
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.isAccepted).toBe(false);
        expect(result?.rejectedReason).toBe('Price too high');
      });

      it('should parse person_id from object format', () => {
        const payload = {
          data: {
            id: 7777,
            person_id: { value: 8888, name: 'John Doe' },
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.leadExternalId).toBe('8888');
      });

      it('should parse person_id from direct value', () => {
        const payload = {
          data: {
            id: 9999,
            person_id: 11111,
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.leadExternalId).toBe('11111');
      });

      it('should parse user_id from object format', () => {
        const payload = {
          data: {
            id: 1212,
            person_id: 3434,
            user_id: { id: 5656, name: 'Dr. Smith' },
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.doctorExternalUserId).toBe('5656');
      });

      it('should parse user_id from direct value', () => {
        const payload = {
          data: {
            id: 7878,
            person_id: 9090,
            user_id: 1234,
          },
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.doctorExternalUserId).toBe('1234');
      });
    });

    describe('currency handling', () => {
      it('should use default EUR currency', () => {
        const payload = {
          data: { id: 1, person_id: 2 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.currency).toBe('EUR');
      });

      it('should parse custom currency', () => {
        const payload = {
          data: { id: 1, person_id: 2, currency: 'USD' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.currency).toBe('USD');
      });

      it('should handle RON currency', () => {
        const payload = {
          data: { id: 1, person_id: 2, currency: 'RON' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.currency).toBe('RON');
      });
    });

    describe('value handling', () => {
      it('should handle missing value', () => {
        const payload = {
          data: { id: 1, person_id: 2 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.totalValue).toBe(0);
      });

      it('should handle null value', () => {
        const payload = {
          data: { id: 1, person_id: 2, value: null },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.totalValue).toBe(0);
      });

      it('should convert string value to number', () => {
        const payload = {
          data: { id: 1, person_id: 2, value: '1500.50' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.totalValue).toBe(1500.5);
      });

      it('should handle zero value', () => {
        const payload = {
          data: { id: 1, person_id: 2, value: 0 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.totalValue).toBe(0);
      });
    });

    describe('stage handling', () => {
      it('should create stage string from stage_id', () => {
        const payload = {
          data: { id: 1, person_id: 2, stage_id: 5 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.stage).toBe('stage_5');
      });

      it('should handle string stage_id', () => {
        const payload = {
          data: { id: 1, person_id: 2, stage_id: '10' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.stage).toBe('stage_10');
      });

      it('should use unknown for missing stage_id', () => {
        const payload = {
          data: { id: 1, person_id: 2 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.stage).toBe('unknown');
      });
    });

    describe('notes generation', () => {
      it('should generate notes with title', () => {
        const payload = {
          data: { id: 1, person_id: 2, title: 'Orthodontic Treatment' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.notes).toBe('Pipedrive Deal: Orthodontic Treatment');
      });

      it('should generate default notes without title', () => {
        const payload = {
          data: { id: 1, person_id: 2 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.notes).toBe('Pipedrive Deal');
      });
    });

    describe('edge cases and error handling', () => {
      it('should return null for null payload', () => {
        expect(adapter.parseDealWebhook(null)).toBeNull();
      });

      it('should return null for undefined payload', () => {
        expect(adapter.parseDealWebhook(undefined)).toBeNull();
      });

      it('should return null for non-object payload', () => {
        expect(adapter.parseDealWebhook('string')).toBeNull();
        expect(adapter.parseDealWebhook(123)).toBeNull();
      });

      it('should return null for empty object', () => {
        expect(adapter.parseDealWebhook({})).toBeNull();
      });

      it('should return null when id is missing', () => {
        const payload = {
          data: { person_id: 123 },
        };
        expect(adapter.parseDealWebhook(payload)).toBeNull();
      });

      it('should return null when person_id is missing', () => {
        const payload = {
          data: { id: 123 },
        };
        expect(adapter.parseDealWebhook(payload)).toBeNull();
      });

      it('should return null when person_id is empty object', () => {
        const payload = {
          data: { id: 123, person_id: {} },
        };
        expect(adapter.parseDealWebhook(payload)).toBeNull();
      });

      it('should handle won deal without won_time', () => {
        const payload = {
          data: { id: 1, person_id: 2, status: 'won' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.isAccepted).toBe(true);
        expect(result?.acceptedAt).toBeNull();
      });

      it('should handle lost deal without lost_reason', () => {
        const payload = {
          data: { id: 1, person_id: 2, status: 'lost' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.isAccepted).toBe(false);
        expect(result?.rejectedReason).toBeNull();
      });

      it('should handle open deal', () => {
        const payload = {
          data: { id: 1, person_id: 2, status: 'open', probability: 50 },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.isAccepted).toBe(false);
        expect(result?.probability).toBe(50);
      });

      it('should handle missing probability', () => {
        const payload = {
          data: { id: 1, person_id: 2, status: 'open' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.probability).toBe(0);
      });

      it('should use 100 probability for won deals without explicit probability', () => {
        const payload = {
          data: { id: 1, person_id: 2, status: 'won' },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.probability).toBe(100);
      });
    });
  });
});
