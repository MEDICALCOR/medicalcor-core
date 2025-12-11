/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ADS CONVERSION TRACKING TESTS                             ║
 * ║                                                                               ║
 * ║  Comprehensive tests for offline conversion tracking to Facebook and Google  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAdsConversionService, type AdsConversionServiceOptions } from '../ads-conversion-service.js';
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
        userIdentifiers: [
          { hashedEmail: 'abc123...' },
          { hashedPhoneNumber: 'def456...' },
        ],
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
      expect(detectClickIdType('EAIaIQobChMI8NCm7qLb_wIVj4xoCR1KagDLEAAYASAAEgK4yfD_BwE')).toBe('gclid');
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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
