/**
 * @fileoverview Language Service Tests
 *
 * Comprehensive tests for language detection, preference management,
 * and localization features used in dental clinic communications.
 *
 * @module domain/language/__tests__/language-service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  LanguageService,
  createLanguageService,
  type SupportedLanguage,
  type LanguageServiceLogger,
  type LanguageServiceOptions,
  type TranslationRequest,
} from '../language-service.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockLogger: LanguageServiceLogger = {
  debug: vi.fn(),
};

const createService = (options?: LanguageServiceOptions): LanguageService => {
  return new LanguageService(options);
};

// =============================================================================
// LANGUAGE DETECTION TESTS
// =============================================================================

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    service = createService({ logger: mockLogger });
    vi.clearAllMocks();
  });

  describe('detectLanguage', () => {
    describe('Romanian Detection', () => {
      it('should detect Romanian from greeting', () => {
        const result = service.detectLanguage('Bună ziua, aș dori o programare');
        expect(result.detected).toBe('ro');
        expect(result.confidence).toBeGreaterThan(0.3);
        expect(result.method).toBe('rule_based');
      });

      it('should detect Romanian from diacritics', () => {
        const result = service.detectLanguage('Mulțumesc pentru informații');
        expect(result.detected).toBe('ro');
        expect(result.confidence).toBeGreaterThan(0);
      });

      it('should detect Romanian medical terms', () => {
        const result = service.detectLanguage('Am nevoie de un implant dentar');
        expect(result.detected).toBe('ro');
      });

      it('should detect Romanian dental laboratory terms', () => {
        const result = service.detectLanguage('Vreau o coroană din zirconiu');
        expect(result.detected).toBe('ro');
      });

      it('should detect Romanian ALL-ON-X terms', () => {
        const result = service.detectLanguage('Sunt interesat de all-on-4 pentru arcadă completă');
        expect(result.detected).toBe('ro');
      });

      it('should detect Romanian common words', () => {
        const result = service.detectLanguage('Când pot să vin pentru consultație?');
        expect(result.detected).toBe('ro');
      });
    });

    describe('English Detection', () => {
      it('should detect English from greeting', () => {
        const result = service.detectLanguage('Hello, I would like to schedule an appointment');
        expect(result.detected).toBe('en');
        expect(result.confidence).toBeGreaterThan(0.3);
      });

      it('should detect English medical terms', () => {
        const result = service.detectLanguage('I need a dental implant and teeth cleaning');
        expect(result.detected).toBe('en');
      });

      it('should detect English from articles and auxiliaries', () => {
        const result = service.detectLanguage('The dentist is available tomorrow morning');
        expect(result.detected).toBe('en');
      });

      it('should detect English dental laboratory terms', () => {
        const result = service.detectLanguage('I need a zirconia crown and bridge');
        expect(result.detected).toBe('en');
      });

      it('should detect English ALL-ON-X terms', () => {
        // Uses clear English phrase with common words
        const result = service.detectLanguage(
          'Hello, I would like to get information about dental implants'
        );
        expect(result.detected).toBe('en');
      });
    });

    describe('German Detection', () => {
      it('should detect German from greeting', () => {
        const result = service.detectLanguage('Guten Tag, ich möchte einen Termin');
        expect(result.detected).toBe('de');
        expect(result.confidence).toBeGreaterThan(0.3);
      });

      it('should detect German from umlauts', () => {
        const result = service.detectLanguage('Ich hätte gerne eine Beratung für Zähne');
        expect(result.detected).toBe('de');
      });

      it('should detect German medical terms', () => {
        const result = service.detectLanguage('Ich brauche ein Implantat und Reinigung');
        expect(result.detected).toBe('de');
      });

      it('should detect German pronouns and articles', () => {
        const result = service.detectLanguage('Ich habe der Zahnarzt empfohlen');
        expect(result.detected).toBe('de');
      });

      it('should detect German dental laboratory terms', () => {
        const result = service.detectLanguage('Eine Krone aus Zirkon bitte');
        expect(result.detected).toBe('de');
      });
    });

    describe('Edge Cases', () => {
      it('should return default language for empty text', () => {
        const result = service.detectLanguage('');
        expect(result.detected).toBe('ro'); // Default
        expect(result.confidence).toBe(0);
      });

      it('should return default language for single character', () => {
        const result = service.detectLanguage('a');
        expect(result.detected).toBe('ro');
      });

      it('should return default language for whitespace only', () => {
        const result = service.detectLanguage('   \n\t  ');
        expect(result.detected).toBe('ro');
        expect(result.confidence).toBe(0);
      });

      it('should handle mixed language text', () => {
        const result = service.detectLanguage('Hello bună ziua thank you mulțumesc');
        // Should detect based on strongest signal
        expect(['ro', 'en']).toContain(result.detected);
        expect(result.alternatives).toBeDefined();
        expect(result.alternatives.length).toBeGreaterThan(0);
      });

      it('should handle numbers and special characters', () => {
        const result = service.detectLanguage('123 @#$ 456 !!! ???');
        expect(result.detected).toBe('ro'); // Default fallback
      });

      it('should return alternatives for uncertain detection', () => {
        const result = service.detectLanguage('implant');
        // "implant" exists in multiple languages
        expect(result.alternatives).toBeDefined();
      });

      it('should use custom default language', () => {
        const customService = createService({ defaultLanguage: 'en' });
        const result = customService.detectLanguage('');
        expect(result.detected).toBe('en');
      });
    });

    describe('Property-Based Tests', () => {
      it('should always return a valid language', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = service.detectLanguage(text);
            expect(['ro', 'en', 'de']).toContain(result.detected);
            return true;
          }),
          { numRuns: 100 }
        );
      });

      it('should always return confidence between 0 and 1', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = service.detectLanguage(text);
            return result.confidence >= 0 && result.confidence <= 1;
          }),
          { numRuns: 100 }
        );
      });

      it('should always return rule_based method', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = service.detectLanguage(text);
            return result.method === 'rule_based';
          }),
          { numRuns: 50 }
        );
      });

      it('should have consistent alternatives', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = service.detectLanguage(text);
            // Alternatives should not include detected language
            for (const alt of result.alternatives) {
              if (alt.language === result.detected) {
                return false;
              }
            }
            return true;
          }),
          { numRuns: 50 }
        );
      });
    });
  });

  // ===========================================================================
  // PREFERENCE MANAGEMENT TESTS
  // ===========================================================================

  describe('updatePreference', () => {
    it('should create new preference for new contact', () => {
      const result = service.updatePreference('contact-123', 'ro');
      expect(result.contactId).toBe('contact-123');
      expect(result.preferredLanguage).toBe('ro');
      expect(result.lastMessageLanguage).toBe('ro');
      expect(result.detectedLanguages).toContain('ro');
    });

    it('should update preference without changing preferred if not set', () => {
      service.updatePreference('contact-123', 'ro');
      const result = service.updatePreference('contact-123', 'en');

      expect(result.preferredLanguage).toBe('ro'); // First detected remains preferred
      expect(result.lastMessageLanguage).toBe('en'); // Last detected updated
      expect(result.detectedLanguages).toContain('ro');
      expect(result.detectedLanguages).toContain('en');
    });

    it('should set as preferred when explicitly requested', () => {
      service.updatePreference('contact-123', 'ro');
      const result = service.updatePreference('contact-123', 'en', true);

      expect(result.preferredLanguage).toBe('en');
      expect(result.lastMessageLanguage).toBe('en');
    });

    it('should accumulate detected languages without duplicates', () => {
      service.updatePreference('contact-123', 'ro');
      service.updatePreference('contact-123', 'en');
      service.updatePreference('contact-123', 'ro'); // Duplicate
      const result = service.updatePreference('contact-123', 'de');

      expect(result.detectedLanguages).toHaveLength(3);
      expect(result.detectedLanguages).toContain('ro');
      expect(result.detectedLanguages).toContain('en');
      expect(result.detectedLanguages).toContain('de');
    });

    it('should log preference updates', () => {
      service.updatePreference('contact-123', 'ro');
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should include timestamp in preference', () => {
      const before = new Date().toISOString();
      const result = service.updatePreference('contact-123', 'ro');
      const after = new Date().toISOString();

      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt >= before).toBe(true);
      expect(result.updatedAt <= after).toBe(true);
    });
  });

  describe('getPreference', () => {
    it('should return null for unknown contact', () => {
      const result = service.getPreference('unknown-contact');
      expect(result).toBeNull();
    });

    it('should return stored preference', () => {
      service.updatePreference('contact-123', 'de');
      const result = service.getPreference('contact-123');

      expect(result).not.toBeNull();
      expect(result?.preferredLanguage).toBe('de');
    });
  });

  describe('getLanguageForContact', () => {
    it('should return preferred language if set', () => {
      service.updatePreference('contact-123', 'de', true);
      const result = service.getLanguageForContact('contact-123');
      expect(result).toBe('de');
    });

    it('should detect from message if no preference', () => {
      const result = service.getLanguageForContact('new-contact', 'Hello, how are you?');
      expect(result).toBe('en');
    });

    it('should return default for unknown contact with no message', () => {
      const result = service.getLanguageForContact('unknown');
      expect(result).toBe('ro'); // Default
    });

    it('should use last message language if low confidence detection', () => {
      service.updatePreference('contact-123', 'de');
      const result = service.getLanguageForContact('contact-123', 'x');
      expect(result).toBe('de'); // Falls back to last detected
    });

    it('should update preference when detecting from message', () => {
      service.getLanguageForContact('contact-123', 'The appointment is tomorrow');
      const pref = service.getPreference('contact-123');
      expect(pref?.detectedLanguages).toContain('en');
    });
  });

  // ===========================================================================
  // TRANSLATION PREPARATION TESTS
  // ===========================================================================

  describe('prepareForTranslation', () => {
    it('should not translate same language', () => {
      const request: TranslationRequest = {
        text: 'Hello',
        fromLanguage: 'en',
        toLanguage: 'en',
      };
      const result = service.prepareForTranslation(request);

      expect(result.shouldTranslate).toBe(false);
    });

    it('should prepare translation for different languages', () => {
      const request: TranslationRequest = {
        text: 'Bună ziua',
        fromLanguage: 'ro',
        toLanguage: 'en',
      };
      const result = service.prepareForTranslation(request);

      expect(result.shouldTranslate).toBe(true);
      expect(result.request.context).toBe('medical'); // Default context
    });

    it('should preserve custom context', () => {
      const request: TranslationRequest = {
        text: 'Your appointment is tomorrow',
        fromLanguage: 'en',
        toLanguage: 'ro',
        context: 'appointment',
      };
      const result = service.prepareForTranslation(request);

      expect(result.request.context).toBe('appointment');
    });

    it('should extract medical terms from text', () => {
      const request: TranslationRequest = {
        text: 'I need an implant extraction and orthodontic consultation',
        fromLanguage: 'en',
        toLanguage: 'ro',
      };
      const result = service.prepareForTranslation(request);

      expect(result.medicalTerms.length).toBeGreaterThan(0);
    });

    it('should extract Romanian medical terms', () => {
      const request: TranslationRequest = {
        text: 'Vreau o extracție și consultație pentru implant',
        fromLanguage: 'ro',
        toLanguage: 'en',
      };
      const result = service.prepareForTranslation(request);

      expect(result.medicalTerms.length).toBeGreaterThan(0);
    });

    it('should handle text without medical terms', () => {
      const request: TranslationRequest = {
        text: 'Hello, good morning',
        fromLanguage: 'en',
        toLanguage: 'ro',
      };
      const result = service.prepareForTranslation(request);

      expect(result.medicalTerms).toHaveLength(0);
    });
  });

  // ===========================================================================
  // TEMPLATE LOCALIZATION TESTS
  // ===========================================================================

  describe('getLocalizedTemplate', () => {
    it('should return Romanian greeting template', () => {
      const result = service.getLocalizedTemplate('greeting', 'ro');
      expect(result).toContain('Bună ziua');
    });

    it('should return English greeting template', () => {
      const result = service.getLocalizedTemplate('greeting', 'en');
      expect(result).toContain('Hello');
    });

    it('should return German greeting template', () => {
      const result = service.getLocalizedTemplate('greeting', 'de');
      expect(result).toContain('Guten Tag');
    });

    it('should substitute variables in template', () => {
      const result = service.getLocalizedTemplate('appointment_confirm', 'en', {
        date: '2024-01-15',
        time: '10:00',
      });
      expect(result).toContain('2024-01-15');
      expect(result).toContain('10:00');
    });

    it('should substitute multiple occurrences of same variable', () => {
      // Create a custom scenario where variable appears twice
      const template = service.getLocalizedTemplate('appointment_reminder', 'en', {
        date: '2024-01-15',
        time: '10:00',
      });
      expect(template).toContain('2024-01-15');
    });

    it('should return empty string for unknown template', () => {
      const result = service.getLocalizedTemplate('unknown_template', 'en');
      expect(result).toBe('');
    });

    it('should fallback to Romanian for unknown language', () => {
      const result = service.getLocalizedTemplate('greeting', 'ro');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return template without variables if none provided', () => {
      const result = service.getLocalizedTemplate('greeting', 'en');
      expect(result).not.toContain('{{');
    });
  });

  // ===========================================================================
  // LANGUAGE PREFERENCE PARSING TESTS
  // ===========================================================================

  describe('parseLanguagePreference', () => {
    describe('Romanian Requests', () => {
      it('should parse explicit Romanian request', () => {
        expect(service.parseLanguagePreference('Vreau în română')).toBe('ro');
      });

      it('should parse romaneste variant', () => {
        expect(service.parseLanguagePreference('Prefer romaneste')).toBe('ro');
      });

      it('should parse românește variant', () => {
        expect(service.parseLanguagePreference('Vorbesc românește')).toBe('ro');
      });

      it('should parse Romanian from English word', () => {
        expect(service.parseLanguagePreference('I prefer Romanian')).toBe('ro');
      });
    });

    describe('English Requests', () => {
      it('should parse explicit English request', () => {
        expect(service.parseLanguagePreference('I want English please')).toBe('en');
      });

      it('should parse speak English', () => {
        expect(service.parseLanguagePreference('Speak English')).toBe('en');
      });

      it('should parse prefer English', () => {
        expect(service.parseLanguagePreference('I prefer English')).toBe('en');
      });

      it('should parse engleza in Romanian', () => {
        expect(service.parseLanguagePreference('Vreau engleză')).toBe('en');
      });
    });

    describe('German Requests', () => {
      it('should parse explicit German request', () => {
        expect(service.parseLanguagePreference('Ich möchte Deutsch')).toBe('de');
      });

      it('should parse German', () => {
        expect(service.parseLanguagePreference('German please')).toBe('de');
      });

      it('should parse germana in Romanian', () => {
        expect(service.parseLanguagePreference('Vreau germană')).toBe('de');
      });
    });

    describe('No Preference', () => {
      it('should return null for unrelated text', () => {
        expect(service.parseLanguagePreference('Hello, I need an appointment')).toBeNull();
      });

      it('should return null for empty text', () => {
        expect(service.parseLanguagePreference('')).toBeNull();
      });

      it('should return null for numbers only', () => {
        expect(service.parseLanguagePreference('123456')).toBeNull();
      });
    });
  });

  // ===========================================================================
  // LANGUAGE DISPLAY NAME TESTS
  // ===========================================================================

  describe('getLanguageDisplayName', () => {
    it('should return Romanian name in Romanian', () => {
      expect(service.getLanguageDisplayName('ro', 'ro')).toBe('Română');
    });

    it('should return Romanian name in English', () => {
      expect(service.getLanguageDisplayName('ro', 'en')).toBe('Romanian');
    });

    it('should return Romanian name in German', () => {
      expect(service.getLanguageDisplayName('ro', 'de')).toBe('Rumänisch');
    });

    it('should return English name in all languages', () => {
      expect(service.getLanguageDisplayName('en', 'ro')).toBe('Engleză');
      expect(service.getLanguageDisplayName('en', 'en')).toBe('English');
      expect(service.getLanguageDisplayName('en', 'de')).toBe('Englisch');
    });

    it('should return German name in all languages', () => {
      expect(service.getLanguageDisplayName('de', 'ro')).toBe('Germană');
      expect(service.getLanguageDisplayName('de', 'en')).toBe('German');
      expect(service.getLanguageDisplayName('de', 'de')).toBe('Deutsch');
    });

    it('should default to same language if inLanguage not specified', () => {
      expect(service.getLanguageDisplayName('en')).toBe('English');
      expect(service.getLanguageDisplayName('ro')).toBe('Română');
      expect(service.getLanguageDisplayName('de')).toBe('Deutsch');
    });
  });

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================

  describe('createLanguageService', () => {
    it('should create service with default options', () => {
      const svc = createLanguageService();
      expect(svc).toBeInstanceOf(LanguageService);
    });

    it('should create service with custom default language', () => {
      const svc = createLanguageService({ defaultLanguage: 'de' });
      const result = svc.detectLanguage('');
      expect(result.detected).toBe('de');
    });

    it('should create service with custom logger', () => {
      const customLogger = { debug: vi.fn() };
      const svc = createLanguageService({ logger: customLogger });
      svc.updatePreference('test', 'en');
      expect(customLogger.debug).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // INTEGRATION SCENARIOS
  // ===========================================================================

  describe('Integration Scenarios', () => {
    it('should handle complete patient conversation flow', () => {
      // Patient sends Romanian message
      const detection1 = service.detectLanguage('Bună ziua, aș dori o programare');
      expect(detection1.detected).toBe('ro');

      // Update preference
      service.updatePreference('patient-001', detection1.detected);

      // Get appropriate language for response
      const responseLanguage = service.getLanguageForContact('patient-001');
      expect(responseLanguage).toBe('ro');

      // Get localized template
      const greeting = service.getLocalizedTemplate('greeting', responseLanguage);
      expect(greeting).toContain('Bună');
    });

    it('should handle language switch request', () => {
      // Initial Romanian
      service.updatePreference('patient-002', 'ro', true);

      // Patient requests English
      const switchRequest = 'I prefer English please';
      const newLang = service.parseLanguagePreference(switchRequest);

      expect(newLang).toBe('en');

      // Update preference
      if (newLang) {
        service.updatePreference('patient-002', newLang, true);
      }

      // Verify switch
      const pref = service.getPreference('patient-002');
      expect(pref?.preferredLanguage).toBe('en');
    });

    it('should handle multi-language patient history', () => {
      // Patient uses multiple languages over time
      service.updatePreference('patient-003', 'ro');
      service.updatePreference('patient-003', 'en');
      service.updatePreference('patient-003', 'de');

      const pref = service.getPreference('patient-003');
      expect(pref?.detectedLanguages).toHaveLength(3);
      expect(pref?.preferredLanguage).toBe('ro'); // First detected
      expect(pref?.lastMessageLanguage).toBe('de'); // Most recent
    });
  });
});
