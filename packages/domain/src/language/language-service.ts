/**
 * Language Detection Service
 * Detects language from text and manages translation preferences
 * Supports Romanian, English, and German for dental clinic communications
 */

import { createLogger, type Logger } from '@medicalcor/core';

export type SupportedLanguage = 'ro' | 'en' | 'de';

export interface LanguageDetectionResult {
  detected: SupportedLanguage;
  confidence: number; // 0-1 confidence score
  alternatives: {
    language: SupportedLanguage;
    confidence: number;
  }[];
  method: 'rule_based' | 'ai' | 'user_preference';
}

export interface LanguagePreference {
  contactId: string;
  preferredLanguage: SupportedLanguage;
  detectedLanguages: SupportedLanguage[];
  lastMessageLanguage: SupportedLanguage | null;
  updatedAt: string;
}

export interface TranslationRequest {
  text: string;
  fromLanguage: SupportedLanguage;
  toLanguage: SupportedLanguage;
  context?: 'medical' | 'appointment' | 'marketing' | 'general';
}

export interface TranslationResult {
  original: string;
  translated: string;
  fromLanguage: SupportedLanguage;
  toLanguage: SupportedLanguage;
  confidence: number;
}

// Common words for rule-based detection
const LANGUAGE_MARKERS: Record<SupportedLanguage, string[]> = {
  ro: [
    // Common Romanian words
    'bună',
    'salut',
    'mulțumesc',
    'pentru',
    'este',
    'sunt',
    'vreau',
    'aș',
    'dori',
    'programare',
    'dentist',
    'clinică',
    'dinți',
    'durere',
    'consultație',
    'ziua',
    'mâine',
    'astăzi',
    'săptămâna',
    'lună',
    'dimineață',
    'după-amiază',
    'da',
    'nu',
    'poate',
    'când',
    'unde',
    'cum',
    'cât',
    'care',
    'și',
    'sau',
    'dar',
    'deci',
    'că',
    'în',
    'la',
    'de',
    'pe',
    'cu',
    // Medical terms in Romanian
    'implant',
    'extracție',
    'curățare',
    'albire',
    'aparat',
    'ortodonție',
  ],
  en: [
    // Common English words
    'hello',
    'hi',
    'thanks',
    'thank',
    'you',
    'please',
    'want',
    'would',
    'like',
    'appointment',
    'dentist',
    'clinic',
    'teeth',
    'tooth',
    'pain',
    'consultation',
    'today',
    'tomorrow',
    'week',
    'month',
    'morning',
    'afternoon',
    'evening',
    'yes',
    'no',
    'maybe',
    'when',
    'where',
    'how',
    'what',
    'which',
    'and',
    'or',
    'but',
    'the',
    'is',
    'are',
    'have',
    'has',
    'can',
    // Medical terms in English
    'implant',
    'extraction',
    'cleaning',
    'whitening',
    'braces',
    'orthodontics',
  ],
  de: [
    // Common German words
    'hallo',
    'guten',
    'tag',
    'danke',
    'bitte',
    'möchte',
    'wollen',
    'haben',
    'termin',
    'zahnarzt',
    'klinik',
    'zähne',
    'zahn',
    'schmerz',
    'beratung',
    'heute',
    'morgen',
    'woche',
    'monat',
    'vormittag',
    'nachmittag',
    'abend',
    'ja',
    'nein',
    'vielleicht',
    'wann',
    'wo',
    'wie',
    'was',
    'welche',
    'und',
    'oder',
    'aber',
    'ist',
    'sind',
    'haben',
    'kann',
    'ich',
    'sie',
    // Medical terms in German
    'implantat',
    'extraktion',
    'reinigung',
    'bleaching',
    'zahnspange',
    'kieferorthopädie',
  ],
};

// Language-specific character patterns
const LANGUAGE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  ro: [
    /[ăâîșț]/i, // Romanian diacritics
    /\b(și|că|în|pe)\b/i, // Common short words
  ],
  en: [
    /\b(the|is|are|was|were|have|has|had)\b/i, // Articles and auxiliaries
    /\b(would|could|should)\b/i,
  ],
  de: [
    /[äöüß]/i, // German umlauts and eszett
    /\b(ich|sie|wir|ihr)\b/i, // Pronouns
    /\b(der|die|das|den|dem)\b/i, // Articles
  ],
};

export class LanguageService {
  private preferences = new Map<string, LanguagePreference>();
  private logger: Logger;
  private defaultLanguage: SupportedLanguage;

  constructor(options?: { defaultLanguage?: SupportedLanguage }) {
    this.defaultLanguage = options?.defaultLanguage ?? 'ro';
    this.logger = createLogger({ name: 'language-service' });
  }

  /**
   * Detect language from text using rule-based approach
   */
  detectLanguage(text: string): LanguageDetectionResult {
    const normalizedText = this.normalizeText(text);
    const words = normalizedText.split(/\s+/).filter((w) => w.length > 1);

    if (words.length === 0) {
      return {
        detected: this.defaultLanguage,
        confidence: 0,
        alternatives: [],
        method: 'rule_based',
      };
    }

    const scores: Record<SupportedLanguage, number> = { ro: 0, en: 0, de: 0 };

    // Score based on word matches
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS) as [
        SupportedLanguage,
        string[],
      ][]) {
        if (markers.some((marker) => lowerWord === marker || lowerWord.includes(marker))) {
          scores[lang] += 1;
        }
      }
    }

    // Score based on character patterns
    for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS) as [
      SupportedLanguage,
      RegExp[],
    ][]) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedText)) {
          scores[lang] += 2; // Higher weight for character patterns
        }
      }
    }

    // Calculate confidence scores
    const maxScore = Math.max(...Object.values(scores));
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    const results = (Object.entries(scores) as [SupportedLanguage, number][])
      .map(([language, score]) => ({
        language,
        confidence: totalScore > 0 ? score / totalScore : 0,
        rawScore: score,
      }))
      .sort((a, b) => b.rawScore - a.rawScore);

    const detected = results[0]?.language ?? this.defaultLanguage;
    const confidence = results[0]?.confidence ?? 0;

    // If confidence is very low, default to Romanian
    if (maxScore < 2 || confidence < 0.3) {
      return {
        detected: this.defaultLanguage,
        confidence: 0.3,
        alternatives: results
          .filter((r) => r.language !== this.defaultLanguage)
          .map((r) => ({ language: r.language, confidence: r.confidence })),
        method: 'rule_based',
      };
    }

    return {
      detected,
      confidence,
      alternatives: results
        .slice(1)
        .map((r) => ({ language: r.language, confidence: r.confidence })),
      method: 'rule_based',
    };
  }

  /**
   * Update language preference for a contact
   */
  updatePreference(
    contactId: string,
    detectedLanguage: SupportedLanguage,
    setAsPreferred = false
  ): LanguagePreference {
    const existing = this.preferences.get(contactId);
    const now = new Date().toISOString();

    const preference: LanguagePreference = {
      contactId,
      preferredLanguage: setAsPreferred
        ? detectedLanguage
        : (existing?.preferredLanguage ?? detectedLanguage),
      detectedLanguages: existing
        ? [...new Set([...existing.detectedLanguages, detectedLanguage])]
        : [detectedLanguage],
      lastMessageLanguage: detectedLanguage,
      updatedAt: now,
    };

    this.preferences.set(contactId, preference);

    this.logger.debug(
      { contactId, detectedLanguage, preferredLanguage: preference.preferredLanguage },
      'Language preference updated'
    );

    return preference;
  }

  /**
   * Get language preference for a contact
   */
  getPreference(contactId: string): LanguagePreference | null {
    return this.preferences.get(contactId) ?? null;
  }

  /**
   * Get the best language to use for a contact
   */
  getLanguageForContact(contactId: string, messageText?: string): SupportedLanguage {
    const preference = this.getPreference(contactId);

    // If user has set a preferred language, use it
    if (preference?.preferredLanguage) {
      return preference.preferredLanguage;
    }

    // If message text provided, detect and use that
    if (messageText) {
      const detection = this.detectLanguage(messageText);
      if (detection.confidence > 0.5) {
        this.updatePreference(contactId, detection.detected);
        return detection.detected;
      }
    }

    // Fall back to last detected or default
    return preference?.lastMessageLanguage ?? this.defaultLanguage;
  }

  /**
   * Prepare text for translation (placeholder for AI translation)
   */
  prepareForTranslation(request: TranslationRequest): {
    shouldTranslate: boolean;
    request: TranslationRequest;
    medicalTerms: string[];
  } {
    // Don't translate if same language
    if (request.fromLanguage === request.toLanguage) {
      return {
        shouldTranslate: false,
        request,
        medicalTerms: [],
      };
    }

    // Extract medical terms that need special handling
    const medicalTerms = this.extractMedicalTerms(request.text);

    return {
      shouldTranslate: true,
      request: {
        ...request,
        context: request.context ?? 'medical',
      },
      medicalTerms,
    };
  }

  /**
   * Get localized response template
   */
  getLocalizedTemplate(
    templateKey: string,
    language: SupportedLanguage,
    variables?: Record<string, string>
  ): string {
    const template = TEMPLATES[templateKey]?.[language] ?? TEMPLATES[templateKey]?.ro ?? '';

    if (!variables) return template;

    return Object.entries(variables).reduce(
      (text, [key, value]) => text.replace(new RegExp(`{{${key}}}`, 'g'), value),
      template
    );
  }

  /**
   * Parse language preference from user message
   */
  parseLanguagePreference(message: string): SupportedLanguage | null {
    const normalizedMessage = message.toLowerCase().trim();

    // Check for explicit language requests
    const languagePatterns: Record<SupportedLanguage, RegExp[]> = {
      ro: [/\b(română|romaneste|romanian)\b/i, /\b(vorbesc|vreau|prefer).*(română|romaneste)\b/i],
      en: [/\b(english|engleza)\b/i, /\b(speak|want|prefer).*english\b/i],
      de: [/\b(german|germana|deutsch)\b/i, /\b(spreche|möchte).*deutsch\b/i],
    };

    for (const [lang, patterns] of Object.entries(languagePatterns) as [
      SupportedLanguage,
      RegExp[],
    ][]) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedMessage)) {
          return lang;
        }
      }
    }

    return null;
  }

  /**
   * Get language display name
   */
  getLanguageDisplayName(lang: SupportedLanguage, inLanguage: SupportedLanguage = lang): string {
    const names: Record<SupportedLanguage, Record<SupportedLanguage, string>> = {
      ro: { ro: 'Română', en: 'Romanian', de: 'Rumänisch' },
      en: { ro: 'Engleză', en: 'English', de: 'Englisch' },
      de: { ro: 'Germană', en: 'German', de: 'Deutsch' },
    };

    return names[lang][inLanguage];
  }

  /**
   * Normalize text for processing
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\săâîșțäöüß]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract medical terms from text
   */
  private extractMedicalTerms(text: string): string[] {
    const medicalTermPatterns = [
      /\b(implant|implantat)\w*\b/gi,
      /\b(extrac[țt]ie|extraction)\w*\b/gi,
      /\b(ortodon[țt]ie|orthodontic|kieferorthopädie)\w*\b/gi,
      /\b(curăț[are]+|cleaning|reinigung)\w*\b/gi,
      /\b(albire|whitening|bleaching)\w*\b/gi,
      /\b(consultaț[ie]+|consultation|beratung)\w*\b/gi,
      /\b(protez[ae]|denture|zahnprothese)\w*\b/gi,
      /\b(coroană|crown|krone)\w*\b/gi,
      /\b(canal|root\s*canal|wurzelkanal)\w*\b/gi,
      /\b(gingivită|gingivitis)\w*\b/gi,
    ];

    const terms: string[] = [];
    for (const pattern of medicalTermPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        terms.push(...matches);
      }
    }

    return [...new Set(terms)];
  }
}

// Localized message templates
const TEMPLATES: Record<string, Record<SupportedLanguage, string>> = {
  greeting: {
    ro: 'Bună ziua! Bine ați venit la clinica noastră. Cu ce vă putem ajuta?',
    en: 'Hello! Welcome to our clinic. How can we help you?',
    de: 'Guten Tag! Willkommen in unserer Klinik. Wie können wir Ihnen helfen?',
  },
  appointment_confirm: {
    ro: 'Programarea dumneavoastră pentru {{date}} la {{time}} a fost confirmată.',
    en: 'Your appointment for {{date}} at {{time}} has been confirmed.',
    de: 'Ihr Termin am {{date}} um {{time}} wurde bestätigt.',
  },
  appointment_reminder: {
    ro: '⏰ Vă reamintim: Aveți o programare mâine, {{date}} la ora {{time}}.',
    en: '⏰ Reminder: You have an appointment tomorrow, {{date}} at {{time}}.',
    de: '⏰ Erinnerung: Sie haben morgen, {{date}} um {{time}}, einen Termin.',
  },
  language_selection: {
    ro: 'Selectați limba preferată:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
    en: 'Select your preferred language:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
    de: 'Wählen Sie Ihre bevorzugte Sprache:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
  },
  out_of_hours: {
    ro: 'Ne pare rău, suntem în afara programului. Vă vom contacta în cel mai scurt timp.',
    en: 'Sorry, we are currently outside working hours. We will contact you shortly.',
    de: 'Es tut uns leid, wir sind derzeit außerhalb der Geschäftszeiten. Wir werden uns in Kürze bei Ihnen melden.',
  },
  transfer_to_human: {
    ro: 'Vă transfer către un coleg. Vă rugăm așteptați.',
    en: 'I am transferring you to a colleague. Please wait.',
    de: 'Ich verbinde Sie mit einem Kollegen. Bitte warten Sie.',
  },
};

/**
 * Create a language service instance
 */
export function createLanguageService(options?: {
  defaultLanguage?: SupportedLanguage;
}): LanguageService {
  return new LanguageService(options);
}
