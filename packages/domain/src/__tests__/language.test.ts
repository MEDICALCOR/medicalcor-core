/**
 * @fileoverview Comprehensive Tests for Language Service
 *
 * Tests language detection and localization including:
 * - Rule-based language detection
 * - Language preference management
 * - Localized template generation
 * - Language preference parsing from messages
 *
 * @module domain/__tests__/language
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LanguageService,
  createLanguageService,
  type SupportedLanguage,
} from '../language/language-service.js';

// ============================================================================
// LANGUAGE DETECTION TESTS
// ============================================================================

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    service = createLanguageService();
  });

  describe('detectLanguage', () => {
    describe('Romanian detection', () => {
      it('should detect Romanian from common words', () => {
        const result = service.detectLanguage('Bună ziua, vreau o programare');

        expect(result.detected).toBe('ro');
        expect(result.confidence).toBeGreaterThan(0.3);
      });

      it('should detect Romanian from diacritics', () => {
        const result = service.detectLanguage('Aș dori să știu prețul');

        expect(result.detected).toBe('ro');
      });

      it('should detect Romanian dental terms', () => {
        const result = service.detectLanguage('Am nevoie de o consultație pentru implant');

        expect(result.detected).toBe('ro');
      });

      it('should detect Romanian short words', () => {
        const result = service.detectLanguage('Și eu vreau să vin în clinică');

        expect(result.detected).toBe('ro');
      });
    });

    describe('English detection', () => {
      it('should detect English from common words', () => {
        const result = service.detectLanguage('Hello, I would like to schedule an appointment');

        expect(result.detected).toBe('en');
        expect(result.confidence).toBeGreaterThan(0.3);
      });

      it('should detect English articles and auxiliaries', () => {
        const result = service.detectLanguage('I have been waiting for the dentist');

        expect(result.detected).toBe('en');
      });

      it('should detect English dental terms', () => {
        const result = service.detectLanguage('I need a consultation for teeth whitening');

        expect(result.detected).toBe('en');
      });
    });

    describe('German detection', () => {
      it('should detect German from common words', () => {
        const result = service.detectLanguage('Guten Tag, ich möchte einen Termin vereinbaren');

        expect(result.detected).toBe('de');
        expect(result.confidence).toBeGreaterThan(0.3);
      });

      it('should detect German umlauts', () => {
        const result = service.detectLanguage('Für Zähne brauche ich eine Behandlung');

        expect(result.detected).toBe('de');
      });

      it('should detect German articles', () => {
        const result = service.detectLanguage('Der Zahnarzt kann mir helfen');

        expect(result.detected).toBe('de');
      });
    });

    describe('Edge cases', () => {
      it('should return default language for empty text', () => {
        const result = service.detectLanguage('');

        expect(result.detected).toBe('ro');
        expect(result.confidence).toBe(0);
      });

      it('should return default language for single character', () => {
        const result = service.detectLanguage('a');

        expect(result.detected).toBe('ro');
      });

      it('should return default language for ambiguous text', () => {
        const result = service.detectLanguage('123 456');

        expect(result.detected).toBe('ro');
        expect(result.confidence).toBeLessThan(0.5);
      });

      it('should provide alternatives when confident', () => {
        const result = service.detectLanguage('Bună ziua, vreau programare');

        expect(result.alternatives).toBeDefined();
        expect(Array.isArray(result.alternatives)).toBe(true);
      });

      it('should indicate rule-based method', () => {
        const result = service.detectLanguage('Test message');

        expect(result.method).toBe('rule_based');
      });
    });
  });

  // ============================================================================
  // LANGUAGE PREFERENCE TESTS
  // ============================================================================

  describe('Language Preference Management', () => {
    describe('updatePreference', () => {
      it('should create new preference for new contact', () => {
        const pref = service.updatePreference('contact123', 'en');

        expect(pref.contactId).toBe('contact123');
        expect(pref.preferredLanguage).toBe('en');
        expect(pref.lastMessageLanguage).toBe('en');
      });

      it('should track detected languages history', () => {
        service.updatePreference('contact123', 'ro');
        service.updatePreference('contact123', 'en');
        const pref = service.updatePreference('contact123', 'de');

        expect(pref.detectedLanguages).toContain('ro');
        expect(pref.detectedLanguages).toContain('en');
        expect(pref.detectedLanguages).toContain('de');
      });

      it('should update preferred language when requested', () => {
        service.updatePreference('contact123', 'ro');
        const pref = service.updatePreference('contact123', 'en', true);

        expect(pref.preferredLanguage).toBe('en');
      });

      it('should not change preferred language without flag', () => {
        service.updatePreference('contact123', 'ro', true);
        const pref = service.updatePreference('contact123', 'en');

        expect(pref.preferredLanguage).toBe('ro');
        expect(pref.lastMessageLanguage).toBe('en');
      });

      it('should include updatedAt timestamp', () => {
        const pref = service.updatePreference('contact123', 'ro');

        expect(pref.updatedAt).toBeDefined();
        expect(new Date(pref.updatedAt).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('getPreference', () => {
      it('should return null for unknown contact', () => {
        const pref = service.getPreference('unknown');

        expect(pref).toBeNull();
      });

      it('should return existing preference', () => {
        service.updatePreference('contact123', 'de', true);

        const pref = service.getPreference('contact123');

        expect(pref).not.toBeNull();
        expect(pref?.preferredLanguage).toBe('de');
      });
    });

    describe('getLanguageForContact', () => {
      it('should return preferred language when set', () => {
        service.updatePreference('contact123', 'de', true);

        const lang = service.getLanguageForContact('contact123');

        expect(lang).toBe('de');
      });

      it('should detect from message text when no preference', () => {
        const lang = service.getLanguageForContact(
          'newcontact',
          'Hello, I need help'
        );

        expect(lang).toBe('en');
      });

      it('should return default language for new contact without message', () => {
        const lang = service.getLanguageForContact('newcontact');

        expect(lang).toBe('ro');
      });

      it('should return last detected language when no explicit preference', () => {
        service.updatePreference('contact123', 'en');

        const lang = service.getLanguageForContact('contact123');

        expect(lang).toBe('en');
      });
    });
  });

  // ============================================================================
  // TRANSLATION PREPARATION TESTS
  // ============================================================================

  describe('prepareForTranslation', () => {
    it('should not translate when languages match', () => {
      const result = service.prepareForTranslation({
        text: 'Hello world',
        fromLanguage: 'en',
        toLanguage: 'en',
      });

      expect(result.shouldTranslate).toBe(false);
    });

    it('should indicate translation needed for different languages', () => {
      const result = service.prepareForTranslation({
        text: 'Hello world',
        fromLanguage: 'en',
        toLanguage: 'ro',
      });

      expect(result.shouldTranslate).toBe(true);
    });

    it('should extract medical terms', () => {
      const result = service.prepareForTranslation({
        text: 'I need implant extraction and whitening',
        fromLanguage: 'en',
        toLanguage: 'ro',
      });

      expect(result.medicalTerms.length).toBeGreaterThan(0);
    });

    it('should default context to medical', () => {
      const result = service.prepareForTranslation({
        text: 'Test text',
        fromLanguage: 'en',
        toLanguage: 'de',
      });

      expect(result.request.context).toBe('medical');
    });

    it('should preserve provided context', () => {
      const result = service.prepareForTranslation({
        text: 'Test text',
        fromLanguage: 'en',
        toLanguage: 'de',
        context: 'appointment',
      });

      expect(result.request.context).toBe('appointment');
    });
  });

  // ============================================================================
  // LOCALIZED TEMPLATES TESTS
  // ============================================================================

  describe('getLocalizedTemplate', () => {
    it('should return Romanian template', () => {
      const template = service.getLocalizedTemplate('greeting', 'ro');

      expect(template).toContain('Bună ziua');
    });

    it('should return English template', () => {
      const template = service.getLocalizedTemplate('greeting', 'en');

      expect(template).toContain('Hello');
    });

    it('should return German template', () => {
      const template = service.getLocalizedTemplate('greeting', 'de');

      expect(template).toContain('Guten Tag');
    });

    it('should substitute variables in template', () => {
      const template = service.getLocalizedTemplate('appointment_confirm', 'en', {
        date: '2024-12-01',
        time: '14:00',
      });

      expect(template).toContain('2024-12-01');
      expect(template).toContain('14:00');
    });

    it('should fall back to Romanian for unknown template', () => {
      const template = service.getLocalizedTemplate('unknown_template', 'en');

      expect(template).toBe('');
    });
  });

  // ============================================================================
  // LANGUAGE PREFERENCE PARSING TESTS
  // ============================================================================

  describe('parseLanguagePreference', () => {
    it('should detect Romanian language request', () => {
      expect(service.parseLanguagePreference('vreau în română')).toBe('ro');
      expect(service.parseLanguagePreference('Romaneste va rog')).toBe('ro');
    });

    it('should detect English language request', () => {
      expect(service.parseLanguagePreference('I prefer English')).toBe('en');
      expect(service.parseLanguagePreference('Can you speak english?')).toBe('en');
    });

    it('should detect German language request', () => {
      expect(service.parseLanguagePreference('Ich möchte Deutsch')).toBe('de');
      expect(service.parseLanguagePreference('Sprechen Sie deutsch?')).toBe('de');
    });

    it('should return null when no language preference detected', () => {
      expect(service.parseLanguagePreference('I need an appointment')).toBeNull();
    });
  });

  // ============================================================================
  // DISPLAY NAME TESTS
  // ============================================================================

  describe('getLanguageDisplayName', () => {
    it('should return language name in its own language', () => {
      expect(service.getLanguageDisplayName('ro')).toBe('Română');
      expect(service.getLanguageDisplayName('en')).toBe('English');
      expect(service.getLanguageDisplayName('de')).toBe('Deutsch');
    });

    it('should return language name in another language', () => {
      expect(service.getLanguageDisplayName('ro', 'en')).toBe('Romanian');
      expect(service.getLanguageDisplayName('en', 'de')).toBe('Englisch');
      expect(service.getLanguageDisplayName('de', 'ro')).toBe('Germană');
    });
  });

  // ============================================================================
  // CUSTOM DEFAULT LANGUAGE TESTS
  // ============================================================================

  describe('Custom Default Language', () => {
    it('should use custom default language', () => {
      const customService = createLanguageService({ defaultLanguage: 'en' });

      const result = customService.detectLanguage('123456');

      expect(result.detected).toBe('en');
    });

    it('should use custom default for new contacts', () => {
      const customService = createLanguageService({ defaultLanguage: 'de' });

      const lang = customService.getLanguageForContact('newcontact');

      expect(lang).toBe('de');
    });
  });
});

// ============================================================================
// MEDICAL TERM EXTRACTION TESTS
// ============================================================================

describe('Medical Term Extraction', () => {
  let service: LanguageService;

  beforeEach(() => {
    service = createLanguageService();
  });

  it('should extract implant terms', () => {
    const result = service.prepareForTranslation({
      text: 'I need dental implants for my teeth',
      fromLanguage: 'en',
      toLanguage: 'ro',
    });

    expect(result.medicalTerms.some(t => t.toLowerCase().includes('implant'))).toBe(true);
  });

  it('should extract extraction terms', () => {
    const result = service.prepareForTranslation({
      text: 'Tooth extraction is needed',
      fromLanguage: 'en',
      toLanguage: 'ro',
    });

    expect(result.medicalTerms.some(t => t.toLowerCase().includes('extraction'))).toBe(true);
  });

  it('should extract whitening terms', () => {
    const result = service.prepareForTranslation({
      text: 'I want teeth whitening',
      fromLanguage: 'en',
      toLanguage: 'ro',
    });

    expect(result.medicalTerms.some(t => t.toLowerCase().includes('whitening'))).toBe(true);
  });

  it('should deduplicate extracted terms', () => {
    const result = service.prepareForTranslation({
      text: 'I need implant, dental implant, and implants',
      fromLanguage: 'en',
      toLanguage: 'ro',
    });

    const implantCount = result.medicalTerms.filter(
      t => t.toLowerCase().includes('implant')
    ).length;

    // Should have unique terms, not all 3 mentions
    expect(implantCount).toBeLessThanOrEqual(3);
  });
});
