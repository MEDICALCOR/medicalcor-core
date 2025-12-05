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
  type PatientStatus,
  type CommunicationChannel,
  type ConversationStatus,
} from '../../app/actions/shared/mappers';

describe('Mappers', () => {
  describe('mapHubSpotStageToStatus', () => {
    it('should map customer to active', () => {
      expect(mapHubSpotStageToStatus('customer')).toBe('active');
      expect(mapHubSpotStageToStatus('CUSTOMER')).toBe('active');
    });

    it('should map evangelist to active', () => {
      expect(mapHubSpotStageToStatus('evangelist')).toBe('active');
      expect(mapHubSpotStageToStatus('EVANGELIST')).toBe('active');
    });

    it('should map lead stages to lead', () => {
      expect(mapHubSpotStageToStatus('lead')).toBe('lead');
      expect(mapHubSpotStageToStatus('subscriber')).toBe('lead');
      expect(mapHubSpotStageToStatus('marketingqualifiedlead')).toBe('lead');
      expect(mapHubSpotStageToStatus('salesqualifiedlead')).toBe('lead');
      expect(mapHubSpotStageToStatus('opportunity')).toBe('lead');
    });

    it('should map other to inactive', () => {
      expect(mapHubSpotStageToStatus('other')).toBe('inactive');
      expect(mapHubSpotStageToStatus('OTHER')).toBe('inactive');
    });

    it('should default to lead for unknown stages', () => {
      expect(mapHubSpotStageToStatus('unknown')).toBe('lead');
      expect(mapHubSpotStageToStatus('')).toBe('lead');
    });

    it('should default to lead for undefined', () => {
      expect(mapHubSpotStageToStatus(undefined)).toBe('lead');
    });
  });

  describe('mapScoreToClassification', () => {
    it('should map score >= 4 to HOT', () => {
      expect(mapScoreToClassification('4')).toBe('HOT');
      expect(mapScoreToClassification('5')).toBe('HOT');
    });

    it('should map score >= 2 to WARM', () => {
      expect(mapScoreToClassification('2')).toBe('WARM');
      expect(mapScoreToClassification('3')).toBe('WARM');
    });

    it('should map score < 2 to COLD', () => {
      expect(mapScoreToClassification('0')).toBe('COLD');
      expect(mapScoreToClassification('1')).toBe('COLD');
    });

    it('should default to COLD for undefined', () => {
      expect(mapScoreToClassification(undefined)).toBe('COLD');
    });

    it('should default to COLD for invalid numbers', () => {
      expect(mapScoreToClassification('')).toBe('COLD');
      expect(mapScoreToClassification('invalid')).toBe('COLD');
    });

    it('should use threshold constants correctly', () => {
      expect(mapScoreToClassification(String(LEAD_SCORE_THRESHOLDS.HOT))).toBe('HOT');
      expect(mapScoreToClassification(String(LEAD_SCORE_THRESHOLDS.WARM))).toBe('WARM');
    });
  });

  describe('mapLeadSource', () => {
    it('should map whatsapp sources to whatsapp', () => {
      expect(mapLeadSource('whatsapp')).toBe('whatsapp');
      expect(mapLeadSource('360dialog')).toBe('whatsapp');
      expect(mapLeadSource('WHATSAPP')).toBe('whatsapp');
    });

    it('should map voice sources to voice', () => {
      expect(mapLeadSource('voice')).toBe('voice');
      expect(mapLeadSource('phone')).toBe('voice');
      expect(mapLeadSource('twilio')).toBe('voice');
    });

    it('should map facebook sources to facebook', () => {
      expect(mapLeadSource('facebook')).toBe('facebook');
      expect(mapLeadSource('facebook_ads')).toBe('facebook');
    });

    it('should map google sources to google', () => {
      expect(mapLeadSource('google')).toBe('google');
      expect(mapLeadSource('google_ads')).toBe('google');
    });

    it('should map referral to referral', () => {
      expect(mapLeadSource('referral')).toBe('referral');
    });

    it('should map web sources to web_form', () => {
      expect(mapLeadSource('web')).toBe('web_form');
      expect(mapLeadSource('website')).toBe('web_form');
      expect(mapLeadSource('form')).toBe('web_form');
    });

    it('should default to manual for unknown sources', () => {
      expect(mapLeadSource('unknown')).toBe('manual');
      expect(mapLeadSource('')).toBe('manual');
    });

    it('should default to manual for undefined', () => {
      expect(mapLeadSource(undefined)).toBe('manual');
    });
  });

  describe('maskPhone', () => {
    it('should mask middle digits of phone number', () => {
      expect(maskPhone('+40721234567')).toBe('+40721***567');
    });

    it('should not mask short phone numbers', () => {
      expect(maskPhone('1234567')).toBe('1234567');
      expect(maskPhone('123')).toBe('123');
    });

    it('should preserve prefix and suffix', () => {
      const masked = maskPhone('+40721234567');
      expect(masked.startsWith('+40721')).toBe(true);
      expect(masked.endsWith('567')).toBe(true);
    });

    it('should mask international numbers correctly', () => {
      expect(maskPhone('+14155551234')).toBe('+14155***234');
    });

    it('should handle minimum length edge case', () => {
      expect(maskPhone('12345678')).toBe('123456***678');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Mock the current date to a fixed value
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "acum" for time less than 1 minute ago', () => {
      const date = new Date(Date.now() - 30000).toISOString(); // 30 seconds ago
      expect(formatRelativeTime(date)).toBe('acum');
    });

    it('should return minutes for time less than 1 hour ago', () => {
      const date = new Date(Date.now() - 30 * 60000).toISOString(); // 30 minutes ago
      expect(formatRelativeTime(date)).toBe('acum 30 min');
    });

    it('should return hours for time less than 24 hours ago', () => {
      const date = new Date(Date.now() - 3 * 3600000).toISOString(); // 3 hours ago
      expect(formatRelativeTime(date)).toBe('acum 3 ore');
    });

    it('should return "ieri" for exactly 1 day ago', () => {
      const date = new Date(Date.now() - 24 * 3600000).toISOString();
      expect(formatRelativeTime(date)).toBe('ieri');
    });

    it('should return days for time less than 7 days ago', () => {
      const date = new Date(Date.now() - 3 * 86400000).toISOString(); // 3 days ago
      expect(formatRelativeTime(date)).toBe('acum 3 zile');
    });

    it('should return formatted date for time more than 7 days ago', () => {
      const date = new Date(Date.now() - 10 * 86400000).toISOString(); // 10 days ago
      const result = formatRelativeTime(date);
      expect(result).toBeDefined();
      // Just verify it's a date string (locale-specific format)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('parseProcedureInterest', () => {
    it('should parse comma-separated procedures', () => {
      expect(parseProcedureInterest('implant, whitening')).toEqual(['implant', 'whitening']);
    });

    it('should trim whitespace from procedures', () => {
      expect(parseProcedureInterest('implant , whitening , cleaning')).toEqual([
        'implant',
        'whitening',
        'cleaning',
      ]);
    });

    it('should filter out empty strings', () => {
      expect(parseProcedureInterest('implant, , whitening')).toEqual(['implant', 'whitening']);
    });

    it('should return undefined for empty string', () => {
      expect(parseProcedureInterest('')).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(parseProcedureInterest(undefined)).toBeUndefined();
    });

    it('should handle single procedure', () => {
      expect(parseProcedureInterest('implant')).toEqual(['implant']);
    });

    it('should return undefined for string with only commas', () => {
      expect(parseProcedureInterest(',,,,')).toBeUndefined();
    });
  });

  describe('detectChannel', () => {
    it('should detect whatsapp channel', () => {
      expect(detectChannel('whatsapp')).toBe('whatsapp');
      expect(detectChannel('WhatsApp Business')).toBe('whatsapp');
    });

    it('should detect sms channel', () => {
      expect(detectChannel('sms')).toBe('sms');
      expect(detectChannel('SMS Campaign')).toBe('sms');
    });

    it('should default to email channel', () => {
      expect(detectChannel('website')).toBe('email');
      expect(detectChannel('facebook')).toBe('email');
      expect(detectChannel('')).toBe('email');
    });

    it('should default to email for undefined', () => {
      expect(detectChannel(undefined)).toBe('email');
    });
  });

  describe('mapConversationStatus', () => {
    it('should map active status', () => {
      expect(mapConversationStatus('active')).toBe('active');
      expect(mapConversationStatus('new')).toBe('active');
      expect(mapConversationStatus('Active Lead')).toBe('active');
    });

    it('should map waiting status', () => {
      expect(mapConversationStatus('waiting')).toBe('waiting');
      expect(mapConversationStatus('pending')).toBe('waiting');
      expect(mapConversationStatus('Pending Response')).toBe('waiting');
    });

    it('should map resolved status', () => {
      expect(mapConversationStatus('resolved')).toBe('resolved');
      expect(mapConversationStatus('closed')).toBe('resolved');
      expect(mapConversationStatus('Closed Won')).toBe('resolved');
    });

    it('should default to active for unknown status', () => {
      expect(mapConversationStatus('unknown')).toBe('active');
      expect(mapConversationStatus('')).toBe('active');
    });

    it('should default to active for undefined', () => {
      expect(mapConversationStatus(undefined)).toBe('active');
    });
  });
});
