/**
 * Comprehensive tests for Pipedrive CRM Adapter
 * Tests crm/pipedrive.adapter.ts
 * Target: 95%+ branch coverage for medical/banking platinum standard
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PipedriveAdapter } from '../pipedrive.adapter.js';
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
    delete process.env.PIPEDRIVE_FIELD_GCLID;
    delete process.env.PIPEDRIVE_FIELD_FBCLID;
    delete process.env.PIPEDRIVE_FIELD_FBP;
    delete process.env.PIPEDRIVE_FIELD_TTCLID;
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
    delete process.env.PIPEDRIVE_FIELD_GCLID;
    delete process.env.PIPEDRIVE_FIELD_FBCLID;
    delete process.env.PIPEDRIVE_FIELD_FBP;
    delete process.env.PIPEDRIVE_FIELD_TTCLID;
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

      it('should handle boolean false custom fields', () => {
        const payload = {
          data: {
            id: 8881,
            phone: '+40700123456',
            gdpr_consent: false,
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.gdprConsent).toBe(false);
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

      it('should skip custom field with empty label', () => {
        const payload = {
          data: {
            id: 6661,
            phone: '+40700123456',
            language: { id: 1, label: '  ' }, // Empty after trim
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.language).toBe('ro'); // Falls back to default
      });

      it('should skip custom field with empty value property', () => {
        const payload = {
          data: {
            id: 7771,
            phone: '+40700123456',
            utm_source: { value: '  ' }, // Empty after trim
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('pipedrive_webhook'); // Falls back to default
      });

      it('should handle object without label or value properties', () => {
        const payload = {
          data: {
            id: 7772,
            phone: '+40700123456',
            utm_source: { id: 5, name: 'test' }, // No label or value
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.source).toBe('pipedrive_webhook'); // Falls back to default
      });
    });

    describe('ads attribution click IDs', () => {
      it('should extract gclid (Google Ads)', () => {
        const payload = {
          data: {
            id: 1234,
            phone: '+40700123456',
            gclid: 'gclid_abc123',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.gclid).toBe('gclid_abc123');
      });

      it('should extract fbclid (Facebook Ads)', () => {
        const payload = {
          data: {
            id: 1235,
            phone: '+40700123456',
            fbclid: 'fbclid_xyz789',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.fbclid).toBe('fbclid_xyz789');
      });

      it('should extract fbp (Facebook Browser ID)', () => {
        const payload = {
          data: {
            id: 1236,
            phone: '+40700123456',
            fbp: 'fb.1.123456789.987654321',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.fbp).toBe('fb.1.123456789.987654321');
      });

      it('should extract ttclid (TikTok Ads)', () => {
        const payload = {
          data: {
            id: 1237,
            phone: '+40700123456',
            ttclid: 'ttclid_tiktok123',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.ttclid).toBe('ttclid_tiktok123');
      });

      it('should extract all click IDs together', () => {
        const payload = {
          data: {
            id: 1238,
            phone: '+40700123456',
            gclid: 'gclid_abc',
            fbclid: 'fbclid_xyz',
            fbp: 'fb.1.123',
            ttclid: 'ttclid_tt',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.gclid).toBe('gclid_abc');
        expect(result?.metadata?.fbclid).toBe('fbclid_xyz');
        expect(result?.metadata?.fbp).toBe('fb.1.123');
        expect(result?.metadata?.ttclid).toBe('ttclid_tt');
      });

      it('should use environment variables for click ID field mapping', () => {
        process.env.PIPEDRIVE_FIELD_GCLID = 'custom_gclid';
        process.env.PIPEDRIVE_FIELD_FBCLID = 'custom_fbclid';

        const payload = {
          data: {
            id: 1239,
            phone: '+40700123456',
            custom_gclid: 'google_click',
            custom_fbclid: 'facebook_click',
          },
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.metadata?.gclid).toBe('google_click');
        expect(result?.metadata?.fbclid).toBe('facebook_click');
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

      it('should return null when phone array has non-object elements', () => {
        const payload = {
          data: { id: 123, phone: ['not-an-object'] },
        };
        expect(adapter.parseContactWebhook(payload)).toBeNull();
      });

      it('should return null when phone object has empty value', () => {
        const payload = {
          data: { id: 123, phone: [{ value: '  ' }] },
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

      it('should handle email array with non-object first element', () => {
        const payload = {
          data: { id: 123, phone: '+40700123456', email: ['not-an-object'] },
        };
        const result = adapter.parseContactWebhook(payload);
        expect(result?.email).toBeUndefined();
      });

      it('should handle email object with whitespace value', () => {
        const payload = {
          data: { id: 123, phone: '+40700123456', email: [{ value: '  ' }] },
        };
        const result = adapter.parseContactWebhook(payload);
        // toSafeString doesn't trim, so '  ' is kept as-is and is truthy
        expect(result?.email).toBe('  ');
      });

      it('should parse from root level payload without current or data', () => {
        const payload = {
          id: 5555,
          phone: '+40700123456',
          name: 'Test User',
        };

        const result = adapter.parseContactWebhook(payload);

        expect(result?.externalContactId).toBe('5555');
        expect(result?.phone).toBe('+40700123456');
        expect(result?.fullName).toBe('Test User');
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

      it('should use unknown for null stage_id', () => {
        const payload = {
          data: { id: 1, person_id: 2, stage_id: null },
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

      it('should return null when person_id object has null value', () => {
        const payload = {
          data: { id: 123, person_id: { value: null } },
        };
        expect(adapter.parseDealWebhook(payload)).toBeNull();
      });

      it('should return null when person_id object has undefined value', () => {
        const payload = {
          data: { id: 123, person_id: { value: undefined } },
        };
        expect(adapter.parseDealWebhook(payload)).toBeNull();
      });

      it('should handle user_id object with null id', () => {
        const payload = {
          data: { id: 123, person_id: 456, user_id: { id: null } },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.doctorExternalUserId).toBeUndefined();
      });

      it('should handle user_id object with undefined id', () => {
        const payload = {
          data: { id: 123, person_id: 456, user_id: { id: undefined } },
        };
        const result = adapter.parseDealWebhook(payload);
        expect(result?.doctorExternalUserId).toBeUndefined();
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

      it('should parse from root level payload without current or data', () => {
        const payload = {
          id: 9876,
          person_id: 5432,
          title: 'Root Deal',
        };

        const result = adapter.parseDealWebhook(payload);

        expect(result?.externalDealId).toBe('9876');
        expect(result?.leadExternalId).toBe('5432');
        expect(result?.name).toBe('Root Deal');
      });
    });
  });

  describe('extractDealConversionData', () => {
    describe('happy path', () => {
      it('should extract conversion data from won deal with all fields', () => {
        const payload = {
          current: {
            id: 7890,
            person_id: { value: 1234 },
            title: 'All-on-X Treatment',
            value: 15000,
            currency: 'EUR',
            status: 'won',
            won_time: '2024-02-20T14:30:00Z',
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          dealId: '7890',
          personId: '1234',
          value: 15000,
          currency: 'EUR',
          dealTitle: 'All-on-X Treatment',
        });
        expect(result?.wonAt).toBeInstanceOf(Date);
        expect(result?.wonAt.toISOString()).toBe('2024-02-20T14:30:00.000Z');
      });

      it('should extract conversion data with person_id as direct value', () => {
        const payload = {
          data: {
            id: 8888,
            person_id: 9999,
            status: 'won',
            value: 8000,
            won_time: '2024-03-01T09:00:00Z',
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result).toMatchObject({
          dealId: '8888',
          personId: '9999',
          value: 8000,
          currency: 'EUR',
        });
      });

      it('should use current date when won_time is missing', () => {
        const payload = {
          data: {
            id: 7777,
            person_id: 6666,
            status: 'won',
            value: 5000,
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result?.wonAt).toBeInstanceOf(Date);
        // Should be very close to current time (within 1 second)
        const now = new Date();
        const diff = Math.abs(now.getTime() - result!.wonAt.getTime());
        expect(diff).toBeLessThan(1000);
      });

      it('should handle missing title', () => {
        const payload = {
          data: {
            id: 5555,
            person_id: 4444,
            status: 'won',
            value: 3000,
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result?.dealTitle).toBeUndefined();
      });

      it('should handle missing value', () => {
        const payload = {
          data: {
            id: 3333,
            person_id: 2222,
            status: 'won',
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result?.value).toBe(0);
      });

      it('should handle null value', () => {
        const payload = {
          data: {
            id: 1111,
            person_id: 2222,
            status: 'won',
            value: null,
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result?.value).toBe(0);
      });

      it('should use custom currency when provided', () => {
        const payload = {
          data: {
            id: 9090,
            person_id: 8080,
            status: 'won',
            value: 10000,
            currency: 'USD',
          },
        };

        const result = adapter.extractDealConversionData(payload);

        expect(result?.currency).toBe('USD');
      });
    });

    describe('edge cases and error handling', () => {
      it('should return null for non-won deal', () => {
        const payload = {
          data: {
            id: 123,
            person_id: 456,
            status: 'open',
            value: 5000,
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null for lost deal', () => {
        const payload = {
          data: {
            id: 123,
            person_id: 456,
            status: 'lost',
            value: 5000,
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null for null payload', () => {
        expect(adapter.extractDealConversionData(null)).toBeNull();
      });

      it('should return null for undefined payload', () => {
        expect(adapter.extractDealConversionData(undefined)).toBeNull();
      });

      it('should return null for non-object payload', () => {
        expect(adapter.extractDealConversionData('string')).toBeNull();
        expect(adapter.extractDealConversionData(123)).toBeNull();
      });

      it('should return null for empty object', () => {
        expect(adapter.extractDealConversionData({})).toBeNull();
      });

      it('should return null when dealId is missing', () => {
        const payload = {
          data: {
            person_id: 456,
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null when dealId is null', () => {
        const payload = {
          data: {
            id: null,
            person_id: 456,
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null when person_id is missing', () => {
        const payload = {
          data: {
            id: 123,
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null when person_id object has null value', () => {
        const payload = {
          data: {
            id: 123,
            person_id: { value: null },
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null when person_id object has undefined value', () => {
        const payload = {
          data: {
            id: 123,
            person_id: { value: undefined },
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });

      it('should return null when person_id is empty object', () => {
        const payload = {
          data: {
            id: 123,
            person_id: {},
            status: 'won',
          },
        };

        expect(adapter.extractDealConversionData(payload)).toBeNull();
      });
    });
  });

  describe('extractAdsAttributionData', () => {
    describe('happy path', () => {
      it('should extract all ads attribution data', () => {
        const payload = {
          data: {
            id: 1234,
            name: 'John Doe',
            email: [{ value: 'john@example.com' }],
            phone: [{ value: '+40700123456' }],
            gclid: 'gclid_abc123',
            fbclid: 'fbclid_xyz789',
            fbp: 'fb.1.123456789.987654321',
            ttclid: 'ttclid_tiktok456',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result).toMatchObject({
          gclid: 'gclid_abc123',
          fbclid: 'fbclid_xyz789',
          fbp: 'fb.1.123456789.987654321',
          ttclid: 'ttclid_tiktok456',
          email: 'john@example.com',
          phone: '+40700123456',
          firstName: 'John',
          lastName: 'Doe',
        });
      });

      it('should extract with email as string', () => {
        const payload = {
          data: {
            id: 1235,
            email: 'test@example.com',
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.email).toBe('test@example.com');
        expect(result?.gclid).toBe('gclid_test');
      });

      it('should extract with phone as string', () => {
        const payload = {
          data: {
            id: 1236,
            phone: '+40700999888',
            fbclid: 'fbclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.phone).toBe('+40700999888');
        expect(result?.fbclid).toBe('fbclid_test');
      });

      it('should parse single-word name', () => {
        const payload = {
          data: {
            id: 1237,
            name: 'Madonna',
            gclid: 'gclid_single',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.firstName).toBe('Madonna');
        expect(result?.lastName).toBeUndefined();
      });

      it('should parse multi-word name with middle names', () => {
        const payload = {
          data: {
            id: 1238,
            name: 'John Paul Smith Jr.',
            fbclid: 'fbclid_multi',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Paul Smith Jr.');
      });

      it('should handle name with extra whitespace', () => {
        const payload = {
          data: {
            id: 1239,
            name: '  John   Doe  ',
            gclid: 'gclid_space',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.firstName).toBe('John');
        expect(result?.lastName).toBe('Doe');
      });

      it('should extract only gclid', () => {
        const payload = {
          data: {
            id: 1240,
            gclid: 'gclid_only',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.gclid).toBe('gclid_only');
        expect(result?.fbclid).toBeUndefined();
        expect(result?.fbp).toBeUndefined();
        expect(result?.ttclid).toBeUndefined();
      });

      it('should extract only email without click IDs', () => {
        const payload = {
          data: {
            id: 1241,
            email: 'user@example.com',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.email).toBe('user@example.com');
        expect(result?.gclid).toBeUndefined();
      });

      it('should extract only phone without click IDs', () => {
        const payload = {
          data: {
            id: 1242,
            phone: '+40700111222',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.phone).toBe('+40700111222');
        expect(result?.gclid).toBeUndefined();
      });

      it('should extract from current object', () => {
        const payload = {
          current: {
            id: 1243,
            gclid: 'gclid_current',
            email: 'current@example.com',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.gclid).toBe('gclid_current');
        expect(result?.email).toBe('current@example.com');
      });
    });

    describe('edge cases and error handling', () => {
      it('should return null when no attribution data is present', () => {
        const payload = {
          data: {
            id: 1234,
            name: 'John Doe',
          },
        };

        expect(adapter.extractAdsAttributionData(payload)).toBeNull();
      });

      it('should return null for null payload', () => {
        expect(adapter.extractAdsAttributionData(null)).toBeNull();
      });

      it('should return null for undefined payload', () => {
        expect(adapter.extractAdsAttributionData(undefined)).toBeNull();
      });

      it('should return null for non-object payload', () => {
        expect(adapter.extractAdsAttributionData('string')).toBeNull();
        expect(adapter.extractAdsAttributionData(123)).toBeNull();
      });

      it('should return null for empty object', () => {
        expect(adapter.extractAdsAttributionData({})).toBeNull();
      });

      it('should handle empty email array', () => {
        const payload = {
          data: {
            id: 1244,
            email: [],
            gclid: 'gclid_empty_email',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.email).toBeUndefined();
        expect(result?.gclid).toBe('gclid_empty_email');
      });

      it('should handle empty phone array', () => {
        const payload = {
          data: {
            id: 1245,
            phone: [],
            fbclid: 'fbclid_empty_phone',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.phone).toBeUndefined();
        expect(result?.fbclid).toBe('fbclid_empty_phone');
      });

      it('should handle email array with non-object element', () => {
        const payload = {
          data: {
            id: 1246,
            email: ['not-an-object'],
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.email).toBeUndefined();
        expect(result?.gclid).toBe('gclid_test');
      });

      it('should handle phone array with non-object element', () => {
        const payload = {
          data: {
            id: 1247,
            phone: ['not-an-object'],
            fbclid: 'fbclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.phone).toBeUndefined();
        expect(result?.fbclid).toBe('fbclid_test');
      });

      it('should handle email object with whitespace value', () => {
        const payload = {
          data: {
            id: 1248,
            email: [{ value: '  ' }],
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        // toSafeString doesn't trim, so '  ' is kept as-is and is truthy
        expect(result?.email).toBe('  ');
        expect(result?.gclid).toBe('gclid_test');
      });

      it('should handle phone object with whitespace value', () => {
        const payload = {
          data: {
            id: 1249,
            phone: [{ value: '  ' }],
            fbclid: 'fbclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        // toSafeString doesn't trim, so '  ' is kept as-is and is truthy
        expect(result?.phone).toBe('  ');
        expect(result?.fbclid).toBe('fbclid_test');
      });

      it('should handle empty name string', () => {
        const payload = {
          data: {
            id: 1250,
            name: '   ',
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        // Empty name after trim().split() creates empty string for firstName
        expect(result?.firstName).toBe('');
        expect(result?.lastName).toBeUndefined();
      });

      it('should handle missing name', () => {
        const payload = {
          data: {
            id: 1251,
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        expect(result?.firstName).toBeUndefined();
        expect(result?.lastName).toBeUndefined();
      });

      it('should handle non-string name (object)', () => {
        const payload = {
          data: {
            id: 1252,
            name: { first: 'John', last: 'Doe' },
            gclid: 'gclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        // Non-string name is skipped
        expect(result?.firstName).toBeUndefined();
        expect(result?.lastName).toBeUndefined();
        expect(result?.gclid).toBe('gclid_test');
      });

      it('should handle non-string name (number)', () => {
        const payload = {
          data: {
            id: 1253,
            name: 12345,
            fbclid: 'fbclid_test',
          },
        };

        const result = adapter.extractAdsAttributionData(payload);

        // Non-string name is skipped
        expect(result?.firstName).toBeUndefined();
        expect(result?.lastName).toBeUndefined();
        expect(result?.fbclid).toBe('fbclid_test');
      });
    });
  });

  describe('toSafeString edge cases (internal function tested via public API)', () => {
    it('should handle object values in custom fields', () => {
      const payload = {
        data: {
          id: 9999,
          phone: '+40700123456',
          // Pass an object that doesn't have label or value properties
          utm_source: { foo: 'bar', baz: 123 },
        },
      };

      const result = adapter.parseContactWebhook(payload);

      // Object without label/value returns empty from toSafeString, falls back to default
      expect(result?.source).toBe('pipedrive_webhook');
    });

    it('should handle array values in custom fields', () => {
      const payload = {
        data: {
          id: 9998,
          phone: '+40700123456',
          language: ['en', 'fr'], // Array value
        },
      };

      const result = adapter.parseContactWebhook(payload);

      // Array is treated as object, no label/value, falls back to default
      expect(result?.language).toBe('ro');
    });

    it('should handle object with non-string label in custom fields', () => {
      const payload = {
        data: {
          id: 9997,
          phone: '+40700123456',
          // Object with label that is not a string
          utm_source: { label: 123 },
        },
      };

      const result = adapter.parseContactWebhook(payload);

      // Non-string label falls through, returns empty from toSafeString
      expect(result?.source).toBe('pipedrive_webhook');
    });

    it('should handle object with non-string value in custom fields', () => {
      const payload = {
        data: {
          id: 9996,
          phone: '+40700123456',
          // Object with value that is not a string
          language: { value: ['en', 'fr'] },
        },
      };

      const result = adapter.parseContactWebhook(payload);

      // Non-string value falls through, returns empty from toSafeString
      expect(result?.language).toBe('ro');
    });

    it('should handle null id gracefully', () => {
      const payload = {
        data: {
          id: null,
          phone: '+40700123456',
        },
      };

      const result = adapter.parseContactWebhook(payload);

      // null id should cause parseContactWebhook to return null
      expect(result).toBeNull();
    });
  });
});
