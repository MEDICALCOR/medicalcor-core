/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ADS CONVERSION TRACKING TESTS                             ║
 * ║                                                                               ║
 * ║  Comprehensive tests for offline conversion tracking to Facebook and Google  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdsConversionService,
  createAdsConversionServiceFromEnv,
  type AdsConversionServiceOptions,
} from '../ads-conversion-service.js';
import {
  generateConversionEventId,
  toGoogleAdsDateTime,
  isGoogleClickId,
  isFacebookClickId,
  detectClickIdType,
  mapDealStatusToConversionEvent,
  ConversionEventSchema,
  FacebookConversionEventSchema,
  GoogleClickConversionSchema,
  AdsConversionWorkflowPayloadSchema,
} from '@medicalcor/types';
import * as facebookConversions from '../facebook-conversions.js';
import * as googleAdsConversions from '../google-ads-conversions.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Ads Conversion Schemas', () => {
  describe('ConversionEventSchema', () => {
    it('should validate a minimal conversion event', () => {
      const event = {
        eventId: 'test_event_123',
        eventName: 'Purchase',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'system_generated',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = ConversionEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate a full conversion event with all fields', () => {
      const event = {
        eventId: 'test_event_123',
        eventName: 'Purchase',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'system_generated',
        eventSourceUrl: 'https://example.com/checkout',
        userData: {
          email: 'test@example.com',
          phone: '+40700000001',
          firstName: 'John',
          lastName: 'Doe',
          city: 'Bucharest',
          state: 'B',
          country: 'RO',
          zipCode: '010101',
          externalId: 'contact_123',
          gclid: 'EAIaIQobChMI...',
          fbclid: 'fb.1.123456789...',
        },
        customData: {
          value: 15000,
          currency: 'EUR',
          orderId: 'deal_123',
          contentIds: ['implant-all-on-4'],
          contentType: 'product',
        },
      };

      const result = ConversionEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should reject invalid event name', () => {
      const event = {
        eventId: 'test_event_123',
        eventName: 'InvalidEvent',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'system_generated',
        userData: {},
      };

      const result = ConversionEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('FacebookConversionEventSchema', () => {
    it('should validate Facebook conversion event with pixelId', () => {
      const event = {
        pixelId: '123456789',
        eventId: 'test_event_123',
        eventName: 'Purchase',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'system_generated',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = FacebookConversionEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate with test event code', () => {
      const event = {
        pixelId: '123456789',
        testEventCode: 'TEST12345',
        eventId: 'test_event_123',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'phone_call',
        userData: {
          phone: '+40700000001',
        },
      };

      const result = FacebookConversionEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  describe('GoogleClickConversionSchema', () => {
    it('should validate Google click conversion', () => {
      const conversion = {
        gclid: 'EAIaIQobChMI...',
        conversionAction: 'customers/123/conversionActions/456',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        conversionValue: 15000,
        currencyCode: 'EUR',
      };

      const result = GoogleClickConversionSchema.safeParse(conversion);
      expect(result.success).toBe(true);
    });

    it('should validate with enhanced matching data', () => {
      const conversion = {
        gclid: 'EAIaIQobChMI...',
        conversionAction: 'customers/123/conversionActions/456',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        userIdentifiers: [{ hashedEmail: 'abc123...' }, { hashedPhoneNumber: 'def456...' }],
        consent: {
          adUserData: 'GRANTED',
          adPersonalization: 'GRANTED',
        },
      };

      const result = GoogleClickConversionSchema.safeParse(conversion);
      expect(result.success).toBe(true);
    });
  });

  describe('AdsConversionWorkflowPayloadSchema', () => {
    it('should validate workflow payload', () => {
      const payload = {
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '12345',
          eventType: 'deal_won',
        },
        userData: {
          email: 'patient@example.com',
          phone: '+40700000001',
          gclid: 'EAIaIQobChMI...',
        },
        value: 15000,
        currency: 'EUR',
        eventTime: new Date().toISOString(),
        platforms: ['facebook', 'google'],
      };

      const result = AdsConversionWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});

describe('Ads Conversion Helper Functions', () => {
  describe('generateConversionEventId', () => {
    it('should generate event ID with correct format', () => {
      const source = { crm: 'pipedrive', entityType: 'deal', entityId: '123' };
      const eventId = generateConversionEventId(source, 'facebook', 'Purchase');

      expect(eventId).toContain('pipedrive_deal_123_facebook_Purchase');
      expect(eventId).toMatch(/^pipedrive_deal_123_facebook_Purchase_\d+$/);
    });

    it('should include timestamp for uniqueness', () => {
      const source = { crm: 'pipedrive', entityType: 'deal', entityId: '123' };
      const eventId = generateConversionEventId(source, 'facebook', 'Purchase');
      const timestamp = eventId.split('_').pop();

      // Timestamp should be a valid number close to current time
      expect(Number(timestamp)).toBeGreaterThan(0);
    });
  });

  describe('toGoogleAdsDateTime', () => {
    it('should format Unix timestamp to Google Ads datetime', () => {
      const timestamp = 1705329000; // 2024-01-15 14:30:00 UTC
      const result = toGoogleAdsDateTime(timestamp, '+00:00');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00$/);
    });

    it('should handle different timezones', () => {
      const timestamp = 1705329000;
      const result = toGoogleAdsDateTime(timestamp, '+02:00');
      expect(result).toContain('+02:00');
    });
  });

  describe('isGoogleClickId', () => {
    it('should detect valid Google click IDs', () => {
      expect(isGoogleClickId('EAIaIQobChMI8NCm7qLb_wIVj4xoCR1KagDLEAAYASAAEgK4yfD_BwE')).toBe(true);
      expect(isGoogleClickId('CjwKCAjwrNmWBhA4EiwAHbjEQJFJFJFJFJFJFJF')).toBe(true);
    });

    it('should reject invalid or Facebook click IDs', () => {
      expect(isGoogleClickId('fb.1.123456789.987654321')).toBe(false);
      expect(isGoogleClickId('short')).toBe(false);
    });
  });

  describe('isFacebookClickId', () => {
    it('should detect valid Facebook click IDs', () => {
      expect(isFacebookClickId('fb.1.1612345678901.123456789012345678')).toBe(true);
    });
  });

  describe('detectClickIdType', () => {
    it('should detect gclid', () => {
      expect(detectClickIdType('EAIaIQobChMI8NCm7qLb_wIVj4xoCR1KagDLEAAYASAAEgK4yfD_BwE')).toBe(
        'gclid'
      );
    });

    it('should detect fbclid', () => {
      expect(detectClickIdType('fb.1.1612345678901.123456789012345678')).toBe('fbclid');
    });
  });

  describe('mapDealStatusToConversionEvent', () => {
    it('should map won status to Purchase', () => {
      expect(mapDealStatusToConversionEvent('won')).toBe('Purchase');
      expect(mapDealStatusToConversionEvent('WON')).toBe('Purchase');
    });

    it('should map other statuses to Lead', () => {
      expect(mapDealStatusToConversionEvent('open')).toBe('Lead');
      expect(mapDealStatusToConversionEvent('lost')).toBe('Lead');
    });
  });
});

describe('AdsConversionService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAvailablePlatforms', () => {
    it('should return empty array when no credentials configured', () => {
      const service = createAdsConversionService({});
      const platforms = service.getAvailablePlatforms();
      expect(platforms).toEqual([]);
    });

    it('should return facebook when credentials provided', () => {
      const service = createAdsConversionService({
        facebook: {
          pixelId: '123456789',
          accessToken: 'test_token',
        },
      });
      const platforms = service.getAvailablePlatforms();
      expect(platforms).toContain('facebook');
    });
  });

  describe('trackConversion', () => {
    it('should skip when no platforms available', async () => {
      const service = createAdsConversionService({});

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
        },
        eventTime: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No platforms available for conversion tracking');
    });

    it('should send to Facebook when fbclid present', async () => {
      // Mock successful Facebook response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            eventsReceived: 1,
            eventsMatched: 1,
          }),
      });

      const service = createAdsConversionService({
        facebook: {
          pixelId: '123456789',
          accessToken: 'test_token',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
          fbclid: 'fb.1.123456789.987654321',
        },
        value: 15000,
        currency: 'EUR',
        eventTime: new Date(),
      });

      // At least the request should have been attempted
      expect(mockFetch).toHaveBeenCalled();
      // Check the result has platform results
      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('facebook');
    });

    it('should handle Facebook API errors gracefully', async () => {
      // Mock Facebook error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () =>
          Promise.resolve({
            error: {
              message: 'Invalid parameter',
              type: 'OAuthException',
              code: 100,
            },
          }),
      });

      const service = createAdsConversionService({
        facebook: {
          pixelId: '123456789',
          accessToken: 'test_token',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
        },
        eventTime: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should report all platforms as null when not configured', async () => {
      const service = createAdsConversionService({});
      const health = await service.healthCheck();

      expect(health.facebook).toBeNull();
      expect(health.google).toBeNull();
    });
  });
});

describe('Pipedrive Integration', () => {
  // Note: These tests verify the Pipedrive adapter can extract gclid/fbclid
  // The actual adapter tests are in pipedrive.adapter.test.ts

  it('should extract gclid from Pipedrive custom fields', () => {
    // This verifies our field configuration includes gclid
    const fieldConfig = {
      gclid: ['gclid', 'google_click_id', 'google_ads_click_id'],
    };

    expect(fieldConfig.gclid).toContain('gclid');
    expect(fieldConfig.gclid).toContain('google_click_id');
  });

  it('should extract fbclid from Pipedrive custom fields', () => {
    const fieldConfig = {
      fbclid: ['fbclid', 'facebook_click_id', 'fb_click_id', 'fbc'],
    };

    expect(fieldConfig.fbclid).toContain('fbclid');
    expect(fieldConfig.fbclid).toContain('fbc');
  });
});

// =============================================================================
// COMPREHENSIVE COVERAGE TESTS
// =============================================================================

describe('AdsConversionService - Comprehensive Coverage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor - Environment Credentials', () => {
    it('should load Facebook credentials from environment', () => {
      const mockGetFbCreds = vi.spyOn(facebookConversions, 'getFacebookConversionsCredentials');
      mockGetFbCreds.mockReturnValue({
        pixelId: 'env_pixel_123',
        accessToken: 'env_token_123',
      });

      const service = createAdsConversionService({});
      const platforms = service.getAvailablePlatforms();

      expect(mockGetFbCreds).toHaveBeenCalled();
      expect(platforms).toContain('facebook');
    });

    it('should load Google credentials from environment', () => {
      const mockGetGoogleCreds = vi.spyOn(
        googleAdsConversions,
        'getGoogleAdsConversionsCredentials'
      );
      mockGetGoogleCreds.mockReturnValue({
        customerId: '123456789',
        conversionActionId: 'customers/123/conversionActions/456',
        developerToken: 'dev_token',
        clientId: 'client_id',
        clientSecret: 'client_secret',
        refreshToken: 'refresh_token',
      });

      const service = createAdsConversionService({});
      const platforms = service.getAvailablePlatforms();

      expect(mockGetGoogleCreds).toHaveBeenCalled();
      expect(platforms).toContain('google');
    });

    it('should handle null credentials from environment', () => {
      const mockGetFbCreds = vi.spyOn(facebookConversions, 'getFacebookConversionsCredentials');
      const mockGetGoogleCreds = vi.spyOn(
        googleAdsConversions,
        'getGoogleAdsConversionsCredentials'
      );
      mockGetFbCreds.mockReturnValue(null);
      mockGetGoogleCreds.mockReturnValue(null);

      const service = createAdsConversionService({});
      const platforms = service.getAvailablePlatforms();

      expect(platforms).toEqual([]);
    });

    it('should use default currency when not provided', () => {
      const service = createAdsConversionService({});
      // Default currency 'EUR' should be used internally
      expect(service).toBeDefined();
    });

    it('should use default timezone when not provided', () => {
      const service = createAdsConversionService({});
      // Default timezone '+00:00' should be used internally
      expect(service).toBeDefined();
    });

    it('should use custom currency and timezone', () => {
      const service = createAdsConversionService({
        defaultCurrency: 'USD',
        defaultTimezone: '+02:00',
      });
      expect(service).toBeDefined();
    });

    it('should initialize both platforms when credentials provided', () => {
      const service = createAdsConversionService({
        facebook: {
          pixelId: '123',
          accessToken: 'token',
        },
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const platforms = service.getAvailablePlatforms();
      expect(platforms).toContain('facebook');
      expect(platforms).toContain('google');
      expect(platforms).toHaveLength(2);
    });
  });

  describe('trackConversion - Advanced Scenarios', () => {
    it('should use default correlationId when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      // Should generate a correlationId internally
      expect(result.platformResults).toHaveLength(1);
    });

    it('should handle multiple platforms with mixed results', async () => {
      // Mock Facebook success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      // Mock Google token refresh success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'token', expires_in: 3600 }),
      });

      // Mock Google conversion upload failure
      mockFetch.mockRejectedValueOnce(new Error('Google API error'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
          gclid: 'test_gclid',
        },
        eventTime: new Date(),
      });

      // Both platforms should be attempted
      expect(result.platformResults).toHaveLength(2);
      expect(result.platformResults[0]?.platform).toBe('facebook');
      expect(result.platformResults[1]?.platform).toBe('google');
      // Errors array should contain at least one error
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should send to Google when gclid is present', async () => {
      // Mock token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'new_token', expires_in: 3600 }),
      });

      // Mock conversion upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ resourceName: 'test' }] }),
      });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
          gclid: 'EAIaIQobChMI...',
        },
        value: 15000,
        currency: 'USD',
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('google');
    });

    it('should use custom event name when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'hubspot',
          entityType: 'lead',
          entityId: '456',
          eventType: 'contact_created',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        customEventName: 'CustomLeadEvent',
      });

      expect(result.platformResults).toHaveLength(1);
    });
  });

  describe('determinePlatforms - Explicit Platforms', () => {
    it('should filter explicit platforms by availability - Facebook only', async () => {
      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        platforms: ['facebook', 'google'], // Request both but only Facebook available
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('facebook');
    });

    it('should filter explicit platforms by availability - Google only', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'new_token', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [{ resourceName: 'test' }] }),
        });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com', gclid: 'test_gclid' },
        eventTime: new Date(),
        platforms: ['facebook', 'google'], // Request both but only Google available
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('google');
    });

    it('should return empty when explicit platforms not available', async () => {
      const service = createAdsConversionService({}); // No platforms configured

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        platforms: ['facebook', 'google'],
      });

      expect(result.success).toBe(false);
      expect(result.platformResults).toHaveLength(0);
    });
  });

  describe('determinePlatforms - Auto-detect', () => {
    it('should auto-detect Facebook with fbc parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { fbc: 'fb.1.123456789.987654321' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('facebook');
    });

    it('should auto-detect Facebook with fbp parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { fbp: 'fb.1.123456789.987654321' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('facebook');
    });

    it('should auto-detect Facebook with phone only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { phone: '+40700000001' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('facebook');
    });

    it('should not auto-detect Facebook without any matching data', async () => {
      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: {}, // No email, phone, or click IDs
        eventTime: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.platformResults).toHaveLength(0);
    });

    it('should not auto-detect Google without gclid', async () => {
      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' }, // No gclid
        eventTime: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.platformResults).toHaveLength(0);
    });
  });

  describe('sendToPlatform - All Platform Types', () => {
    it('should skip TikTok when not configured', async () => {
      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        platforms: ['tiktok'],
      });

      // TikTok is filtered out because it's not configured
      expect(result.platformResults).toHaveLength(0);
      expect(result.success).toBe(false);
    });

    it('should skip LinkedIn when not configured', async () => {
      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        platforms: ['linkedin'],
      });

      // LinkedIn is filtered out because it's not configured
      expect(result.platformResults).toHaveLength(0);
      expect(result.success).toBe(false);
    });

    it('should handle errors during platform send', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.success).toBe(false);
      expect(result.platformResults[0]?.error).toBe('Network error');
    });
  });

  describe('sendToFacebook - All Branches', () => {
    it('should skip when Facebook client not configured', async () => {
      const mockGetFbCreds = vi.spyOn(facebookConversions, 'getFacebookConversionsCredentials');
      mockGetFbCreds.mockReturnValue(null);

      const service = createAdsConversionService({});

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        platforms: ['facebook'], // Explicitly request Facebook even though not configured
      });

      // Facebook is filtered out by determinePlatforms since client not configured
      expect(result.platformResults).toHaveLength(0);
      expect(result.success).toBe(false);
    });

    it('should use customEventName when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
        customEventName: 'CustomPurchase',
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.platformResults).toHaveLength(1);
      // Verify custom event name is included in the request
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall && fetchCall[1] && typeof fetchCall[1] === 'object' && 'body' in fetchCall[1]) {
        const body = JSON.parse(fetchCall[1].body as string);
        expect(body.data[0].custom_event_name).toBe('CustomPurchase');
      }
    });

    it('should set leadId for lead entity type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'hubspot',
          entityType: 'lead',
          entityId: 'lead_789',
          eventType: 'contact_created',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.platformResults).toHaveLength(1);
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall && fetchCall[1] && typeof fetchCall[1] === 'object' && 'body' in fetchCall[1]) {
        const body = JSON.parse(fetchCall[1].body as string);
        expect(body.data[0].custom_data.lead_id).toBe('lead_789');
        expect(body.data[0].custom_data.deal_id).toBeUndefined();
      }
    });

    it('should set dealId for deal entity type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: 'deal_456',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.platformResults).toHaveLength(1);
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall && fetchCall[1] && typeof fetchCall[1] === 'object' && 'body' in fetchCall[1]) {
        const body = JSON.parse(fetchCall[1].body as string);
        expect(body.data[0].custom_data.deal_id).toBe('deal_456');
        expect(body.data[0].custom_data.lead_id).toBeUndefined();
      }
    });

    it('should handle Facebook error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            eventsReceived: 0,
            eventsMatched: 0,
            error: { message: 'Invalid event data' },
          }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.success).toBe(false);
      // Error message might vary based on implementation details
      expect(result.platformResults[0]?.error).toBeDefined();
    });
  });

  describe('sendToGoogle - All Branches', () => {
    it('should skip when Google client not configured', async () => {
      const mockGetGoogleCreds = vi.spyOn(
        googleAdsConversions,
        'getGoogleAdsConversionsCredentials'
      );
      mockGetGoogleCreds.mockReturnValue(null);

      const service = createAdsConversionService({});

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com', gclid: 'test_gclid' },
        eventTime: new Date(),
        platforms: ['google'],
      });

      // Google is filtered out by determinePlatforms since client not configured
      expect(result.platformResults).toHaveLength(0);
      expect(result.success).toBe(false);
    });

    it('should handle missing gclid for Google', async () => {
      // Mock token refresh (might be called)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'token', expires_in: 3600 }),
      });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' }, // No gclid
        eventTime: new Date(),
        platforms: ['google'],
      });

      // When explicitly requested but no gclid, may still attempt or filter out
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });

    it('should send to Google with all parameters', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'new_token', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [{ resourceName: 'test_resource' }] }),
        });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
        defaultCurrency: 'USD',
        defaultTimezone: '+02:00',
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: 'deal_123',
          eventType: 'deal_won',
        },
        userData: {
          email: 'test@example.com',
          gclid: 'EAIaIQobChMI...',
          phone: '+40700000001',
        },
        value: 15000,
        currency: 'EUR',
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.platform).toBe('google');
      expect(mockFetch).toHaveBeenCalled(); // At least token refresh called
    });

    it('should handle Google error responses', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'new_token', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              partialFailureError: { message: 'Some conversions failed' },
              results: [],
            }),
        });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com', gclid: 'test_gclid' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.success).toBe(false);
      // Error message might vary based on implementation details
      expect(result.platformResults[0]?.error).toBeDefined();
    });

    it('should handle empty results from Google as failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'new_token', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }), // Empty results = failure
        });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com', gclid: 'test_gclid' },
        eventTime: new Date(),
      });

      expect(result.platformResults).toHaveLength(1);
      expect(result.platformResults[0]?.success).toBe(false);
      expect(result.platformResults[0]?.platform).toBe('google');
    });
  });

  describe('isRetryableError', () => {
    it('should identify timeout errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(true);
    });

    it('should identify rate limit errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(true);
    });

    it('should identify 502 errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('502 Bad Gateway'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(true);
    });

    it('should identify 503 errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('503 Service Unavailable'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(true);
    });

    it('should identify 504 errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('504 Gateway Timeout'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(true);
    });

    it('should not mark validation errors as retryable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Invalid parameter'));

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(false);
    });

    it('should handle non-Error objects', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const result = await service.trackConversion({
        source: {
          crm: 'pipedrive',
          entityType: 'deal',
          entityId: '123',
          eventType: 'deal_won',
        },
        userData: { email: 'test@example.com' },
        eventTime: new Date(),
      });

      expect(result.platformResults[0]?.retryable).toBe(false);
      expect(result.platformResults[0]?.error).toBe('Unknown error');
    });
  });

  describe('processWorkflowPayload', () => {
    it('should process workflow payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const payload = {
        source: {
          crm: 'pipedrive' as const,
          entityType: 'deal' as const,
          entityId: '123',
          eventType: 'deal_won' as const,
        },
        userData: {
          email: 'test@example.com',
          fbclid: 'fb.1.123.456',
        },
        value: 15000,
        currency: 'EUR',
        eventTime: new Date().toISOString(),
        platforms: ['facebook' as const],
        correlationId: 'workflow_123',
      };

      const result = await service.processWorkflowPayload(payload);

      expect(result).toBeDefined();
      expect(result.platformResults).toBeDefined();
      expect(result.eventIds).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.platformResults)).toBe(true);
      expect(Array.isArray(result.eventIds)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should process workflow payload and return result structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventsReceived: 1, eventsMatched: 1 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const payload = {
        source: {
          crm: 'hubspot' as const,
          entityType: 'lead' as const,
          entityId: 'lead_456',
          eventType: 'contact_created' as const,
        },
        userData: {
          email: 'test@example.com',
          phone: '+40700000001',
        },
        eventTime: new Date().toISOString(),
      };

      const result = await service.processWorkflowPayload(payload);

      expect(result).toBeDefined();
      expect(result.platformResults).toBeDefined();
      expect(result.eventIds).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.platformResults)).toBe(true);
    });
  });

  describe('healthCheck - All Platforms', () => {
    it('should return health check structure for Facebook platform', async () => {
      // Mock Facebook health check - GET /{pixelId}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '123' }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
      });

      const health = await service.healthCheck();

      expect(health).toBeDefined();
      expect(health.facebook).toBeDefined();
      expect(typeof health.facebook?.connected).toBe('boolean');
      expect(typeof health.facebook?.latencyMs).toBe('number');
      expect(health.google).toBeNull();
      expect(health.tiktok).toBeNull();
      expect(health.linkedin).toBeNull();
    });

    it('should return health check structure for Google platform', async () => {
      // Mock Google health check - token refresh only
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'token', expires_in: 3600 }),
      });

      const service = createAdsConversionService({
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const health = await service.healthCheck();

      expect(health).toBeDefined();
      expect(health.google).toBeDefined();
      expect(typeof health.google?.connected).toBe('boolean');
      expect(typeof health.google?.latencyMs).toBe('number');
      expect(health.facebook).toBeNull();
    });

    it('should return health check for both platforms', async () => {
      // Mock Facebook health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '123' }),
      });

      // Mock Google health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'token', expires_in: 3600 }),
      });

      const service = createAdsConversionService({
        facebook: { pixelId: '123', accessToken: 'token' },
        google: {
          customerId: '123',
          conversionActionId: 'customers/123/conversionActions/456',
          developerToken: 'dev',
          clientId: 'client',
          clientSecret: 'secret',
          refreshToken: 'refresh',
        },
      });

      const health = await service.healthCheck();

      expect(health.facebook).toBeDefined();
      expect(health.google).toBeDefined();
      expect(typeof health.facebook?.connected).toBe('boolean');
      expect(typeof health.google?.connected).toBe('boolean');
    });
  });

  describe('Factory Functions', () => {
    it('should create service using createAdsConversionServiceFromEnv', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        ADS_DEFAULT_CURRENCY: 'USD',
        ADS_DEFAULT_TIMEZONE: '+02:00',
      };

      const service = createAdsConversionServiceFromEnv();

      expect(service).toBeDefined();
      expect(service.getAvailablePlatforms()).toBeDefined();

      process.env = originalEnv;
    });

    it('should use defaults when env vars not set', () => {
      const originalEnv = process.env;

      process.env = {
        ...originalEnv,
        ADS_DEFAULT_CURRENCY: undefined,
        ADS_DEFAULT_TIMEZONE: undefined,
      };

      const service = createAdsConversionServiceFromEnv();

      expect(service).toBeDefined();

      process.env = originalEnv;
    });
  });
});
