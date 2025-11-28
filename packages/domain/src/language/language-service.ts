/**
 * Language Detection Service - State-of-the-Art Implementation
 *
 * Detects language from text and manages translation preferences
 * for Romanian, English, and German dental clinic communications.
 *
 * Architecture Highlights:
 * - Const assertions for exhaustive type checking
 * - Template literal types for localization
 * - Immutable data structures throughout
 * - Type-safe pattern matching
 * - Functional composition patterns
 *
 * @module domain/language
 */

import { type SupportedLanguage, type DetectionMethod, SUPPORTED_LANGUAGES } from '../types.js';

// Simple logger interface
interface Logger {
  debug(data: Record<string, unknown>, msg: string): void;
}

function createLogger(_opts: { name: string }): Logger {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    debug: () => {},
  };
}

// ============================================================================
// INTERFACES - Immutable by default
// ============================================================================

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  readonly detected: SupportedLanguage;
  readonly confidence: number;
  readonly alternatives: readonly LanguageAlternative[];
  readonly method: DetectionMethod;
}

/**
 * Alternative language detection
 */
export interface LanguageAlternative {
  readonly language: SupportedLanguage;
  readonly confidence: number;
}

/**
 * Language preference for a contact
 */
export interface LanguagePreference {
  readonly contactId: string;
  readonly preferredLanguage: SupportedLanguage;
  readonly detectedLanguages: readonly SupportedLanguage[];
  readonly lastMessageLanguage: SupportedLanguage | null;
  readonly updatedAt: string;
}

/**
 * Translation request
 */
export interface TranslationRequest {
  readonly text: string;
  readonly fromLanguage: SupportedLanguage;
  readonly toLanguage: SupportedLanguage;
  readonly context?: TranslationContext;
}

/**
 * Translation context types
 */
export type TranslationContext = 'medical' | 'appointment' | 'marketing' | 'general';

/**
 * Translation result
 */
export interface TranslationResult {
  readonly original: string;
  readonly translated: string;
  readonly fromLanguage: SupportedLanguage;
  readonly toLanguage: SupportedLanguage;
  readonly confidence: number;
}

/**
 * Translation preparation result
 */
export interface TranslationPreparation {
  readonly shouldTranslate: boolean;
  readonly request: TranslationRequest;
  readonly medicalTerms: readonly string[];
}

/**
 * Service options
 */
export interface LanguageServiceOptions {
  readonly defaultLanguage?: SupportedLanguage;
}

// ============================================================================
// LANGUAGE MARKERS - Const assertions for type safety
// ============================================================================

/**
 * Common words for rule-based detection
 */
const LANGUAGE_MARKERS = Object.freeze({
  ro: Object.freeze([
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
  ] as const),
  en: Object.freeze([
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
  ] as const),
  de: Object.freeze([
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
  ] as const),
} as const);

/**
 * Language-specific character patterns
 */
const LANGUAGE_PATTERNS = Object.freeze({
  ro: Object.freeze([
    /[ăâîșț]/i, // Romanian diacritics
    /\b(și|că|în|pe)\b/i, // Common short words
  ] as const),
  en: Object.freeze([
    /\b(the|is|are|was|were|have|has|had)\b/i, // Articles and auxiliaries
    /\b(would|could|should)\b/i,
  ] as const),
  de: Object.freeze([
    /[äöüß]/i, // German umlauts and eszett
    /\b(ich|sie|wir|ihr)\b/i, // Pronouns
    /\b(der|die|das|den|dem)\b/i, // Articles
  ] as const),
} as const);

/**
 * Language preference detection patterns
 */
const LANGUAGE_PREFERENCE_PATTERNS = Object.freeze({
  ro: Object.freeze([
    /\b(română|romaneste|romanian)\b/i,
    /\b(vorbesc|vreau|prefer).*(română|romaneste)\b/i,
  ] as const),
  en: Object.freeze([/\b(english|engleza)\b/i, /\b(speak|want|prefer).*english\b/i] as const),
  de: Object.freeze([/\b(german|germana|deutsch)\b/i, /\b(spreche|möchte).*deutsch\b/i] as const),
} as const);

/**
 * Medical term patterns for extraction
 */
const MEDICAL_TERM_PATTERNS = Object.freeze([
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
] as const);

// ============================================================================
// TEMPLATE KEYS - Type-safe template system
// ============================================================================

/**
 * Available template keys
 */
export const TEMPLATE_KEYS = [
  'greeting',
  'appointment_confirm',
  'appointment_reminder',
  'language_selection',
  'out_of_hours',
  'transfer_to_human',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/**
 * Localized message templates
 */
const TEMPLATES: Readonly<Record<TemplateKey, Readonly<Record<SupportedLanguage, string>>>> =
  Object.freeze({
    greeting: Object.freeze({
      ro: 'Bună ziua! Bine ați venit la clinica noastră. Cu ce vă putem ajuta?',
      en: 'Hello! Welcome to our clinic. How can we help you?',
      de: 'Guten Tag! Willkommen in unserer Klinik. Wie können wir Ihnen helfen?',
    }),
    appointment_confirm: Object.freeze({
      ro: 'Programarea dumneavoastră pentru {{date}} la {{time}} a fost confirmată.',
      en: 'Your appointment for {{date}} at {{time}} has been confirmed.',
      de: 'Ihr Termin am {{date}} um {{time}} wurde bestätigt.',
    }),
    appointment_reminder: Object.freeze({
      ro: '⏰ Vă reamintim: Aveți o programare mâine, {{date}} la ora {{time}}.',
      en: '⏰ Reminder: You have an appointment tomorrow, {{date}} at {{time}}.',
      de: '⏰ Erinnerung: Sie haben morgen, {{date}} um {{time}}, einen Termin.',
    }),
    language_selection: Object.freeze({
      ro: 'Selectați limba preferată:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
      en: 'Select your preferred language:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
      de: 'Wählen Sie Ihre bevorzugte Sprache:\n1. 🇷🇴 Română\n2. 🇬🇧 English\n3. 🇩🇪 Deutsch',
    }),
    out_of_hours: Object.freeze({
      ro: 'Ne pare rău, suntem în afara programului. Vă vom contacta în cel mai scurt timp.',
      en: 'Sorry, we are currently outside working hours. We will contact you shortly.',
      de: 'Es tut uns leid, wir sind derzeit außerhalb der Geschäftszeiten. Wir werden uns in Kürze bei Ihnen melden.',
    }),
    transfer_to_human: Object.freeze({
      ro: 'Vă transfer către un coleg. Vă rugăm așteptați.',
      en: 'I am transferring you to a colleague. Please wait.',
      de: 'Ich verbinde Sie mit einem Kollegen. Bitte warten Sie.',
    }),
  });

/**
 * Language display names
 */
const LANGUAGE_NAMES: Readonly<
  Record<SupportedLanguage, Readonly<Record<SupportedLanguage, string>>>
> = Object.freeze({
  ro: Object.freeze({ ro: 'Română', en: 'Romanian', de: 'Rumänisch' }),
  en: Object.freeze({ ro: 'Engleză', en: 'English', de: 'Englisch' }),
  de: Object.freeze({ ro: 'Germană', en: 'German', de: 'Deutsch' }),
});

// ============================================================================
// LANGUAGE SERVICE
// ============================================================================

/**
 * LanguageService - Multi-language detection and preference management
 *
 * @example
 * ```typescript
 * const service = new LanguageService({ defaultLanguage: 'ro' });
 *
 * // Detect language from text
 * const detection = service.detectLanguage('Bună ziua, vreau o programare');
 * console.log(detection.detected); // 'ro'
 * console.log(detection.confidence); // 0.85
 *
 * // Get localized template
 * const greeting = service.getLocalizedTemplate('greeting', 'de');
 * ```
 */
export class LanguageService {
  private readonly preferences = new Map<string, LanguagePreference>();
  private readonly logger: Logger;
  private readonly defaultLanguage: SupportedLanguage;

  constructor(options?: LanguageServiceOptions) {
    this.defaultLanguage = options?.defaultLanguage ?? 'ro';
    this.logger = createLogger({ name: 'language-service' });
  }

  // ==========================================================================
  // DETECTION OPERATIONS
  // ==========================================================================

  /**
   * Detect language from text using rule-based approach
   *
   * Uses a combination of:
   * - Word matching against language markers
   * - Character pattern recognition (diacritics, special chars)
   * - Confidence scoring
   */
  detectLanguage(text: string): LanguageDetectionResult {
    const normalizedText = this.normalizeText(text);
    const words = normalizedText.split(/\s+/).filter((w) => w.length > 1);

    if (words.length === 0) {
      return this.createDefaultResult();
    }

    const scores = this.calculateLanguageScores(words, normalizedText);
    return this.buildDetectionResult(scores);
  }

  // ==========================================================================
  // PREFERENCE OPERATIONS
  // ==========================================================================

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

    const preference: LanguagePreference = Object.freeze({
      contactId,
      preferredLanguage: setAsPreferred
        ? detectedLanguage
        : (existing?.preferredLanguage ?? detectedLanguage),
      detectedLanguages: Object.freeze(
        existing
          ? [...new Set([...existing.detectedLanguages, detectedLanguage])]
          : [detectedLanguage]
      ),
      lastMessageLanguage: detectedLanguage,
      updatedAt: now,
    });

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

  // ==========================================================================
  // TRANSLATION OPERATIONS
  // ==========================================================================

  /**
   * Prepare text for translation
   */
  prepareForTranslation(request: TranslationRequest): TranslationPreparation {
    // Don't translate if same language
    if (request.fromLanguage === request.toLanguage) {
      return Object.freeze({
        shouldTranslate: false,
        request,
        medicalTerms: Object.freeze([]),
      });
    }

    // Extract medical terms that need special handling
    const medicalTerms = this.extractMedicalTerms(request.text);

    return Object.freeze({
      shouldTranslate: true,
      request: Object.freeze({
        ...request,
        context: request.context ?? 'medical',
      }),
      medicalTerms: Object.freeze(medicalTerms),
    });
  }

  // ==========================================================================
  // TEMPLATE OPERATIONS
  // ==========================================================================

  /**
   * Get localized response template with variable substitution
   *
   * @example
   * ```typescript
   * const message = service.getLocalizedTemplate(
   *   'appointment_confirm',
   *   'ro',
   *   { date: '15 Decembrie', time: '14:00' }
   * );
   * ```
   */
  getLocalizedTemplate(
    templateKey: TemplateKey,
    language: SupportedLanguage,
    variables?: Record<string, string>
  ): string {
    const templateGroup = TEMPLATES[templateKey] as Record<SupportedLanguage, string> | undefined;
    const template = templateGroup?.[language] ?? templateGroup?.ro ?? '';

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

    for (const lang of SUPPORTED_LANGUAGES) {
      const patterns = LANGUAGE_PREFERENCE_PATTERNS[lang];
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
    return LANGUAGE_NAMES[lang][inLanguage];
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

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
   * Calculate scores for each language
   */
  private calculateLanguageScores(
    words: string[],
    normalizedText: string
  ): Record<SupportedLanguage, number> {
    const scores: Record<SupportedLanguage, number> = { ro: 0, en: 0, de: 0 };

    // Score based on word matches
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      for (const lang of SUPPORTED_LANGUAGES) {
        const markers = LANGUAGE_MARKERS[lang];
        if (markers.some((marker) => lowerWord === marker || lowerWord.includes(marker))) {
          scores[lang] += 1;
        }
      }
    }

    // Score based on character patterns (higher weight)
    for (const lang of SUPPORTED_LANGUAGES) {
      const patterns = LANGUAGE_PATTERNS[lang];
      for (const pattern of patterns) {
        if (pattern.test(normalizedText)) {
          scores[lang] += 2;
        }
      }
    }

    return scores;
  }

  /**
   * Build detection result from scores
   */
  private buildDetectionResult(scores: Record<SupportedLanguage, number>): LanguageDetectionResult {
    const maxScore = Math.max(...Object.values(scores));
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    const results = SUPPORTED_LANGUAGES.map((language) => ({
      language,
      confidence: totalScore > 0 ? scores[language] / totalScore : 0,
      rawScore: scores[language],
    })).sort((a, b) => b.rawScore - a.rawScore);

    const detected = results[0]?.language ?? this.defaultLanguage;
    const confidence = results[0]?.confidence ?? 0;

    // If confidence is very low, default to Romanian
    if (maxScore < 2 || confidence < 0.3) {
      return Object.freeze({
        detected: this.defaultLanguage,
        confidence: 0.3,
        alternatives: Object.freeze(
          results
            .filter((r) => r.language !== this.defaultLanguage)
            .map((r) => Object.freeze({ language: r.language, confidence: r.confidence }))
        ),
        method: 'rule_based' as const,
      });
    }

    return Object.freeze({
      detected,
      confidence,
      alternatives: Object.freeze(
        results
          .slice(1)
          .map((r) => Object.freeze({ language: r.language, confidence: r.confidence }))
      ),
      method: 'rule_based' as const,
    });
  }

  /**
   * Create default detection result
   */
  private createDefaultResult(): LanguageDetectionResult {
    return Object.freeze({
      detected: this.defaultLanguage,
      confidence: 0,
      alternatives: Object.freeze([]),
      method: 'rule_based' as const,
    });
  }

  /**
   * Extract medical terms from text
   */
  private extractMedicalTerms(text: string): string[] {
    const terms: string[] = [];

    for (const pattern of MEDICAL_TERM_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        terms.push(...matches);
      }
    }

    return [...new Set(terms)];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a language service instance
 *
 * @example
 * ```typescript
 * const service = createLanguageService({ defaultLanguage: 'ro' });
 * const detection = service.detectLanguage('Hello, I need an appointment');
 * ```
 */
export function createLanguageService(options?: LanguageServiceOptions): LanguageService {
  return new LanguageService(options);
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type { SupportedLanguage };
