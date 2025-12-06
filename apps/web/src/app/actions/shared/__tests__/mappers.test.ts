/**
 * Mappers Utility Tests
 *
 * Comprehensive tests for data transformation utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mapHubSpotStageToStatus,
  mapScoreToClassification,
  mapLeadSource,
  maskPhone,
  formatRelativeTime,
  parseProcedureInterest,
  detectChannel,
  mapConversationStatus,
  LEAD_SCORE_THRESHOLDS,
} from '../mappers.js';

describe('Mappers Utilities', () => {
  describe('mapHubSpotStageToStatus', () => {
    it('should return "active" for customer and evangelist stages', () => {
      expect(mapHubSpotStageToStatus('customer')).toBe('active');
      expect(mapHubSpotStageToStatus('Customer')).toBe('active');
      expect(mapHubSpotStageToStatus('CUSTOMER')).toBe('active');
      expect(mapHubSpotStageToStatus('evangelist')).toBe('active');
      expect(mapHubSpotStageToStatus('Evangelist')).toBe('active');
    });

    it('should return "lead" for lead-related stages', () => {
      expect(mapHubSpotStageToStatus('lead')).toBe('lead');
      expect(mapHubSpotStageToStatus('Lead')).toBe('lead');
      expect(mapHubSpotStageToStatus('subscriber')).toBe('lead');
      expect(mapHubSpotStageToStatus('marketingqualifiedlead')).toBe('lead');
      expect(mapHubSpotStageToStatus('salesqualifiedlead')).toBe('lead');
      expect(mapHubSpotStageToStatus('opportunity')).toBe('lead');
    });

    it('should return "inactive" for "other" stage', () => {
      expect(mapHubSpotStageToStatus('other')).toBe('inactive');
      expect(mapHubSpotStageToStatus('Other')).toBe('inactive');
      expect(mapHubSpotStageToStatus('OTHER')).toBe('inactive');
    });

    it('should return "lead" for undefined stage', () => {
      expect(mapHubSpotStageToStatus(undefined)).toBe('lead');
    });

    it('should return "lead" for unknown stages', () => {
      expect(mapHubSpotStageToStatus('unknown')).toBe('lead');
      expect(mapHubSpotStageToStatus('random')).toBe('lead');
      expect(mapHubSpotStageToStatus('')).toBe('lead');
    });
  });

  describe('mapScoreToClassification', () => {
    it('should return HOT for scores >= 4', () => {
      expect(mapScoreToClassification('4')).toBe('HOT');
      expect(mapScoreToClassification('5')).toBe('HOT');
      expect(mapScoreToClassification('10')).toBe('HOT');
    });

    it('should return WARM for scores 2-3', () => {
      expect(mapScoreToClassification('2')).toBe('WARM');
      expect(mapScoreToClassification('3')).toBe('WARM');
    });

    it('should return COLD for scores 0-1', () => {
      expect(mapScoreToClassification('0')).toBe('COLD');
      expect(mapScoreToClassification('1')).toBe('COLD');
    });

    it('should return COLD for undefined', () => {
      expect(mapScoreToClassification(undefined)).toBe('COLD');
    });

    it('should return COLD for invalid strings', () => {
      expect(mapScoreToClassification('invalid')).toBe('COLD');
      expect(mapScoreToClassification('')).toBe('COLD');
      expect(mapScoreToClassification('abc')).toBe('COLD');
    });

    it('should handle negative scores', () => {
      expect(mapScoreToClassification('-1')).toBe('COLD');
      expect(mapScoreToClassification('-5')).toBe('COLD');
    });

    it('should use correct thresholds', () => {
      expect(LEAD_SCORE_THRESHOLDS.HOT).toBe(4);
      expect(LEAD_SCORE_THRESHOLDS.WARM).toBe(2);
    });
  });

  describe('mapLeadSource', () => {
    it('should map WhatsApp sources', () => {
      expect(mapLeadSource('whatsapp')).toBe('whatsapp');
      expect(mapLeadSource('WhatsApp')).toBe('whatsapp');
      expect(mapLeadSource('360dialog')).toBe('whatsapp');
    });

    it('should map voice sources', () => {
      expect(mapLeadSource('voice')).toBe('voice');
      expect(mapLeadSource('phone')).toBe('voice');
      expect(mapLeadSource('twilio')).toBe('voice');
      expect(mapLeadSource('Phone')).toBe('voice');
    });

    it('should map Facebook sources', () => {
      expect(mapLeadSource('facebook')).toBe('facebook');
      expect(mapLeadSource('facebook_ads')).toBe('facebook');
      expect(mapLeadSource('Facebook')).toBe('facebook');
    });

    it('should map Google sources', () => {
      expect(mapLeadSource('google')).toBe('google');
      expect(mapLeadSource('google_ads')).toBe('google');
      expect(mapLeadSource('Google')).toBe('google');
    });

    it('should map referral source', () => {
      expect(mapLeadSource('referral')).toBe('referral');
      expect(mapLeadSource('Referral')).toBe('referral');
    });

    it('should map web form sources', () => {
      expect(mapLeadSource('web')).toBe('web_form');
      expect(mapLeadSource('website')).toBe('web_form');
      expect(mapLeadSource('form')).toBe('web_form');
      expect(mapLeadSource('Web')).toBe('web_form');
    });

    it('should return manual for unknown sources', () => {
      expect(mapLeadSource('unknown')).toBe('manual');
      expect(mapLeadSource('random')).toBe('manual');
    });

    it('should return manual for undefined', () => {
      expect(mapLeadSource(undefined)).toBe('manual');
    });

    it('should return manual for empty string', () => {
      expect(mapLeadSource('')).toBe('manual');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone numbers correctly', () => {
      expect(maskPhone('+40721234567')).toBe('+40721***567');
    });

    it('should return unchanged for short numbers', () => {
      expect(maskPhone('1234567')).toBe('1234567');
      expect(maskPhone('123456')).toBe('123456');
      expect(maskPhone('12345')).toBe('12345');
    });

    it('should mask exactly 8 character numbers', () => {
      expect(maskPhone('12345678')).toBe('123456***678');
    });

    it('should handle longer international numbers', () => {
      expect(maskPhone('+40721234567890')).toBe('+40721******890');
    });

    it('should handle numbers with leading zeros', () => {
      expect(maskPhone('0721234567')).toBe('072123***567');
    });

    it('should use minimum mask length of 3', () => {
      // For an 8-char number: 8 - 6 - 3 = -1, so mask should be 3
      const result = maskPhone('12345678');
      expect(result).toContain('***');
    });

    it('should handle empty string', () => {
      expect(maskPhone('')).toBe('');
    });

    it('should handle phone with special characters', () => {
      // Phone: '+1 (555) 123-4567' has 17 chars
      // Visible prefix: 6, suffix: 3, masked = 17-6-3 = 8 chars
      const result = maskPhone('+1 (555) 123-4567');
      expect(result).toBe('+1 (55********567');
    });
  });

  describe('formatRelativeTime', () => {
    let realDate: typeof Date;

    beforeEach(() => {
      realDate = global.Date;
      // Mock Date.now to return a fixed timestamp
      const fixedDate = new Date('2024-12-06T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);
    });

    afterEach(() => {
      vi.useRealTimers();
      global.Date = realDate;
    });

    it('should return "acum" for now', () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe('acum');
    });

    it('should return minutes for times less than an hour ago', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(formatRelativeTime(thirtyMinutesAgo)).toBe('acum 30 min');
    });

    it('should return hours for times less than a day ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo)).toBe('acum 2 ore');
    });

    it('should return "ieri" for yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(yesterday)).toBe('ieri');
    });

    it('should return days for 2-6 days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo)).toBe('acum 3 zile');
    });

    it('should return formatted date for 7+ days ago', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(tenDaysAgo);
      // Should return a date string in Romanian format
      expect(result).not.toContain('acum');
      expect(result).not.toBe('ieri');
    });

    it('should handle 1 minute ago', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      expect(formatRelativeTime(oneMinuteAgo)).toBe('acum 1 min');
    });

    it('should handle exactly 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(oneHourAgo)).toBe('acum 1 ore');
    });

    it('should handle 59 minutes ago', () => {
      const fiftyNineMinutesAgo = new Date(Date.now() - 59 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiftyNineMinutesAgo)).toBe('acum 59 min');
    });

    it('should handle 23 hours ago', () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(twentyThreeHoursAgo)).toBe('acum 23 ore');
    });

    it('should handle 6 days ago (boundary)', () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(sixDaysAgo)).toBe('acum 6 zile');
    });
  });

  describe('parseProcedureInterest', () => {
    it('should parse comma-separated procedures', () => {
      expect(parseProcedureInterest('implant, whitening')).toEqual(['implant', 'whitening']);
    });

    it('should trim whitespace', () => {
      expect(parseProcedureInterest('  implant  ,  whitening  ')).toEqual(['implant', 'whitening']);
    });

    it('should return undefined for empty string', () => {
      expect(parseProcedureInterest('')).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(parseProcedureInterest(undefined)).toBeUndefined();
    });

    it('should handle single procedure', () => {
      expect(parseProcedureInterest('implant')).toEqual(['implant']);
    });

    it('should handle multiple commas with empty values', () => {
      expect(parseProcedureInterest('implant,,whitening')).toEqual(['implant', 'whitening']);
    });

    it('should return undefined for only commas', () => {
      expect(parseProcedureInterest(',,,')).toBeUndefined();
    });

    it('should return undefined for only whitespace', () => {
      expect(parseProcedureInterest('   ')).toBeUndefined();
    });

    it('should handle many procedures', () => {
      const result = parseProcedureInterest('a, b, c, d, e');
      expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('should filter empty strings after splitting', () => {
      expect(parseProcedureInterest(', implant, , whitening, ')).toEqual(['implant', 'whitening']);
    });
  });

  describe('detectChannel', () => {
    it('should detect WhatsApp channel', () => {
      expect(detectChannel('whatsapp')).toBe('whatsapp');
      expect(detectChannel('WhatsApp')).toBe('whatsapp');
      expect(detectChannel('via_whatsapp')).toBe('whatsapp');
      expect(detectChannel('whatsapp_campaign')).toBe('whatsapp');
    });

    it('should detect SMS channel', () => {
      expect(detectChannel('sms')).toBe('sms');
      expect(detectChannel('SMS')).toBe('sms');
      expect(detectChannel('sms_campaign')).toBe('sms');
      expect(detectChannel('via_sms')).toBe('sms');
    });

    it('should default to email for other sources', () => {
      expect(detectChannel('website')).toBe('email');
      expect(detectChannel('google')).toBe('email');
      expect(detectChannel('facebook')).toBe('email');
      expect(detectChannel('referral')).toBe('email');
    });

    it('should default to email for undefined', () => {
      expect(detectChannel(undefined)).toBe('email');
    });

    it('should default to email for empty string', () => {
      expect(detectChannel('')).toBe('email');
    });
  });

  describe('mapConversationStatus', () => {
    it('should map active statuses', () => {
      expect(mapConversationStatus('active')).toBe('active');
      expect(mapConversationStatus('new')).toBe('active');
      expect(mapConversationStatus('is_active')).toBe('active');
      expect(mapConversationStatus('brand_new')).toBe('active');
    });

    it('should map waiting statuses', () => {
      expect(mapConversationStatus('waiting')).toBe('waiting');
      expect(mapConversationStatus('pending')).toBe('waiting');
      expect(mapConversationStatus('is_waiting')).toBe('waiting');
      expect(mapConversationStatus('response_pending')).toBe('waiting');
    });

    it('should map resolved statuses', () => {
      expect(mapConversationStatus('resolved')).toBe('resolved');
      expect(mapConversationStatus('closed')).toBe('resolved');
      expect(mapConversationStatus('is_resolved')).toBe('resolved');
      expect(mapConversationStatus('case_closed')).toBe('resolved');
    });

    it('should default to active for unknown statuses', () => {
      expect(mapConversationStatus('unknown')).toBe('active');
      expect(mapConversationStatus('random')).toBe('active');
    });

    it('should default to active for undefined', () => {
      expect(mapConversationStatus(undefined)).toBe('active');
    });

    it('should default to active for empty string', () => {
      expect(mapConversationStatus('')).toBe('active');
    });

    it('should be case-insensitive', () => {
      expect(mapConversationStatus('ACTIVE')).toBe('active');
      expect(mapConversationStatus('Active')).toBe('active');
      expect(mapConversationStatus('PENDING')).toBe('waiting');
      expect(mapConversationStatus('Pending')).toBe('waiting');
      expect(mapConversationStatus('CLOSED')).toBe('resolved');
      expect(mapConversationStatus('Closed')).toBe('resolved');
    });
  });
});
