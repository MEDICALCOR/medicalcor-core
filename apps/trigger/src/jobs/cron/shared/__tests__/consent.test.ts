import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasValidConsent, logConsentDenied } from '../consent.js';
import type { HubSpotContactResult, ConsentType } from '../types.js';

// Mock trigger.dev logger
vi.mock('@trigger.dev/sdk/v3', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasValidConsent', () => {
    describe('marketing consent', () => {
      it('should return true when consent_marketing is true', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'true',
          },
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(true);
      });

      it('should return false when consent_marketing is false', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'false',
          },
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(false);
      });

      it('should return false when consent_marketing is not set', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {},
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(false);
      });
    });

    describe('appointment_reminders consent', () => {
      it('should return true when consent_appointment_reminders is true', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_appointment_reminders: 'true',
          },
        };
        expect(hasValidConsent(contact, 'appointment_reminders')).toBe(true);
      });

      it('should return true when consent_treatment_updates is true (fallback)', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_treatment_updates: 'true',
          },
        };
        expect(hasValidConsent(contact, 'appointment_reminders')).toBe(true);
      });

      it('should return false when neither consent is granted', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'true', // Marketing consent should NOT be used for appointments
          },
        };
        expect(hasValidConsent(contact, 'appointment_reminders')).toBe(false);
      });
    });

    describe('treatment_updates consent', () => {
      it('should return true when consent_treatment_updates is true', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_treatment_updates: 'true',
          },
        };
        expect(hasValidConsent(contact, 'treatment_updates')).toBe(true);
      });

      it('should return false when consent_treatment_updates is not true', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_treatment_updates: 'false',
          },
        };
        expect(hasValidConsent(contact, 'treatment_updates')).toBe(false);
      });
    });

    describe('data_processing consent', () => {
      it('should return true when consent_data_processing is true', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_data_processing: 'true',
          },
        };
        expect(hasValidConsent(contact, 'data_processing')).toBe(true);
      });

      it('should return false when consent_data_processing is not set', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {},
        };
        expect(hasValidConsent(contact, 'data_processing')).toBe(false);
      });
    });

    describe('GDPR compliance', () => {
      it('should NOT fall back to marketing consent for medical communications', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'true',
          },
        };
        // Marketing consent should not be valid for treatment updates
        expect(hasValidConsent(contact, 'treatment_updates')).toBe(false);
        // Marketing consent should not be valid for data processing
        expect(hasValidConsent(contact, 'data_processing')).toBe(false);
      });

      it('should require explicit consent for each type', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'true',
            consent_appointment_reminders: 'false',
            consent_treatment_updates: 'false',
            consent_data_processing: 'false',
          },
        };

        expect(hasValidConsent(contact, 'marketing')).toBe(true);
        expect(hasValidConsent(contact, 'appointment_reminders')).toBe(false);
        expect(hasValidConsent(contact, 'treatment_updates')).toBe(false);
        expect(hasValidConsent(contact, 'data_processing')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle undefined property values', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: undefined,
          },
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(false);
      });

      it('should handle empty string property values', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: '',
          },
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(false);
      });

      it('should be case-sensitive for consent values', () => {
        const contact: HubSpotContactResult = {
          id: 'contact-1',
          properties: {
            consent_marketing: 'TRUE', // Uppercase should NOT match
          },
        };
        expect(hasValidConsent(contact, 'marketing')).toBe(false);
      });
    });
  });

  describe('logConsentDenied', () => {
    it('should log consent denial with correct parameters', async () => {
      const { logger } = await import('@trigger.dev/sdk/v3');

      logConsentDenied('contact-123', 'marketing', 'corr-456');

      expect(logger.info).toHaveBeenCalledWith('Message not sent - consent not granted', {
        contactId: 'contact-123',
        consentType: 'marketing',
        correlationId: 'corr-456',
        reason: 'GDPR_CONSENT_MISSING',
      });
    });

    it('should log with different consent types', async () => {
      const { logger } = await import('@trigger.dev/sdk/v3');

      const consentTypes: ConsentType[] = [
        'marketing',
        'appointment_reminders',
        'treatment_updates',
        'data_processing',
      ];

      for (const consentType of consentTypes) {
        logConsentDenied('contact-1', consentType, 'corr-1');
        expect(logger.info).toHaveBeenCalledWith(
          'Message not sent - consent not granted',
          expect.objectContaining({
            consentType,
            reason: 'GDPR_CONSENT_MISSING',
          })
        );
      }
    });
  });
});
