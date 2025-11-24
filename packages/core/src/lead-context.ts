/**
 * LeadContext Builder
 *
 * Provides a fluent API for constructing LeadContext objects from various
 * input sources (WhatsApp, Voice, Web forms, etc.)
 *
 * Features:
 * - Phone number normalization (Romanian E.164)
 * - First-touch timestamp tracking
 * - Message history management
 * - UTM parameter extraction
 * - Channel-specific data handling
 *
 * @example
 * ```typescript
 * const context = LeadContextBuilder
 *   .fromWhatsApp({
 *     from: '0712345678',
 *     message: { id: '123', body: 'Hello' },
 *     contact: { name: 'John' },
 *     timestamp: '1699999999',
 *   })
 *   .withUTM({ utm_source: 'facebook', utm_campaign: 'dental_implants' })
 *   .withHubSpotContact('hubspot-123')
 *   .build();
 * ```
 */

import { normalizeRomanianPhone } from './utils.js';

/**
 * Lead channel types supported by the builder
 */
export type LeadChannel = 'whatsapp' | 'voice' | 'web' | 'referral';

/**
 * Message role in conversation history
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Supported languages
 */
export type SupportedLanguage = 'ro' | 'en' | 'de';

/**
 * UTM parameters for tracking lead source
 */
export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
}

/**
 * Message entry in conversation history
 */
export interface MessageEntry {
  role: MessageRole;
  content: string;
  timestamp: string;
}

/**
 * Complete LeadContext structure for scoring and routing
 */
export interface LeadContext {
  /** Normalized E.164 phone number */
  phone: string;
  /** Original phone number before normalization */
  originalPhone?: string;
  /** Whether phone validation passed */
  phoneIsValid: boolean;
  /** Contact name if available */
  name?: string;
  /** Lead source channel */
  channel: LeadChannel;
  /** ISO timestamp of first contact */
  firstTouchTimestamp: string;
  /** Detected or specified language */
  language?: SupportedLanguage;
  /** Conversation history for AI scoring */
  messageHistory: MessageEntry[];
  /** UTM tracking parameters */
  utm?: UTMParams;
  /** HubSpot contact ID if synced */
  hubspotContactId?: string;
  /** HubSpot deal ID if created */
  hubspotDealId?: string;
  /** Email address if provided */
  email?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * WhatsApp-specific input for the builder
 */
export interface WhatsAppInput {
  from: string;
  message: {
    id: string;
    body?: string;
    type?: string;
    timestamp?: string;
  };
  contact?: {
    name?: string;
    wa_id?: string;
  };
  timestamp?: string;
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
}

/**
 * Voice call input for the builder
 */
export interface VoiceCallInput {
  from: string;
  to?: string;
  callSid: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  timestamp?: string;
  callerName?: string;
}

/**
 * Web form input for the builder
 */
export interface WebFormInput {
  phone: string;
  name?: string;
  email?: string;
  message?: string;
  timestamp?: string;
  pageUrl?: string;
  referrer?: string;
}

/**
 * Referral input for the builder
 */
export interface ReferralInput {
  phone: string;
  name?: string;
  referredBy: string;
  referralCode?: string;
  timestamp?: string;
}

/**
 * Maximum number of messages to keep in history
 * Prevents unbounded memory growth and keeps AI prompts focused
 */
const MAX_MESSAGE_HISTORY = 20;

/**
 * LeadContext Builder
 *
 * Fluent builder for creating LeadContext objects with consistent
 * normalization and validation across all channels.
 */
export class LeadContextBuilder {
  private context: LeadContext;

  private constructor(phone: string, channel: LeadChannel) {
    const phoneResult = normalizeRomanianPhone(phone);

    const baseContext: LeadContext = {
      phone: phoneResult.normalized,
      phoneIsValid: phoneResult.isValid,
      channel,
      firstTouchTimestamp: new Date().toISOString(),
      messageHistory: [],
      metadata: {},
    };

    // Only set originalPhone if different from normalized
    if (phoneResult.original !== phoneResult.normalized) {
      baseContext.originalPhone = phoneResult.original;
    }

    this.context = baseContext;
  }

  /**
   * Create builder from WhatsApp webhook data
   */
  static fromWhatsApp(input: WhatsAppInput): LeadContextBuilder {
    const builder = new LeadContextBuilder(input.from, 'whatsapp');

    // Set timestamp
    const timestamp = input.message.timestamp ?? input.timestamp;
    if (timestamp) {
      builder.context.firstTouchTimestamp = parseTimestamp(timestamp);
    }

    // Set contact name
    if (input.contact?.name) {
      builder.context.name = input.contact.name;
    }

    // Add initial message to history if text content exists
    if (input.message.body) {
      builder.context.messageHistory.push({
        role: 'user',
        content: input.message.body,
        timestamp: builder.context.firstTouchTimestamp,
      });
    }

    // Store WhatsApp-specific metadata
    builder.context.metadata = {
      ...builder.context.metadata,
      whatsapp: {
        messageId: input.message.id,
        messageType: input.message.type ?? 'text',
        wa_id: input.contact?.wa_id,
        phoneNumberId: input.metadata?.phone_number_id,
        displayPhoneNumber: input.metadata?.display_phone_number,
      },
    };

    return builder;
  }

  /**
   * Create builder from Voice call data
   */
  static fromVoiceCall(input: VoiceCallInput): LeadContextBuilder {
    const builder = new LeadContextBuilder(input.from, 'voice');

    if (input.timestamp) {
      builder.context.firstTouchTimestamp = parseTimestamp(input.timestamp);
    }

    if (input.callerName) {
      builder.context.name = input.callerName;
    }

    // Store voice-specific metadata
    builder.context.metadata = {
      ...builder.context.metadata,
      voice: {
        callSid: input.callSid,
        to: input.to,
        direction: input.direction,
      },
    };

    return builder;
  }

  /**
   * Create builder from Web form submission
   */
  static fromWebForm(input: WebFormInput): LeadContextBuilder {
    const builder = new LeadContextBuilder(input.phone, 'web');

    if (input.timestamp) {
      builder.context.firstTouchTimestamp = parseTimestamp(input.timestamp);
    }

    if (input.name) {
      builder.context.name = input.name;
    }

    if (input.email) {
      builder.context.email = input.email;
    }

    // Add form message as initial history
    if (input.message) {
      builder.context.messageHistory.push({
        role: 'user',
        content: input.message,
        timestamp: builder.context.firstTouchTimestamp,
      });
    }

    // Store web-specific metadata
    builder.context.metadata = {
      ...builder.context.metadata,
      web: {
        pageUrl: input.pageUrl,
        referrer: input.referrer,
      },
    };

    return builder;
  }

  /**
   * Create builder from referral
   */
  static fromReferral(input: ReferralInput): LeadContextBuilder {
    const builder = new LeadContextBuilder(input.phone, 'referral');

    if (input.timestamp) {
      builder.context.firstTouchTimestamp = parseTimestamp(input.timestamp);
    }

    if (input.name) {
      builder.context.name = input.name;
    }

    // Store referral-specific metadata
    builder.context.metadata = {
      ...builder.context.metadata,
      referral: {
        referredBy: input.referredBy,
        referralCode: input.referralCode,
      },
    };

    return builder;
  }

  /**
   * Create builder with minimal phone + channel
   */
  static create(phone: string, channel: LeadChannel): LeadContextBuilder {
    return new LeadContextBuilder(phone, channel);
  }

  /**
   * Set the contact name
   */
  withName(name: string): this {
    this.context.name = name;
    return this;
  }

  /**
   * Set the email address
   */
  withEmail(email: string): this {
    this.context.email = email;
    return this;
  }

  /**
   * Set the language
   */
  withLanguage(language: SupportedLanguage): this {
    this.context.language = language;
    return this;
  }

  /**
   * Detect and set language from text content
   * Uses simple heuristics - for production, integrate with language service
   */
  withAutoDetectedLanguage(): this {
    const lastMessage = this.context.messageHistory[this.context.messageHistory.length - 1]?.content ?? '';
    this.context.language = detectLanguage(lastMessage);
    return this;
  }

  /**
   * Set UTM parameters from URL or direct object
   */
  withUTM(utm: UTMParams | string): this {
    if (typeof utm === 'string') {
      this.context.utm = parseUTMFromUrl(utm);
    } else {
      this.context.utm = utm;
    }
    return this;
  }

  /**
   * Set HubSpot contact ID
   */
  withHubSpotContact(contactId: string): this {
    this.context.hubspotContactId = contactId;
    return this;
  }

  /**
   * Set HubSpot deal ID
   */
  withHubSpotDeal(dealId: string): this {
    this.context.hubspotDealId = dealId;
    return this;
  }

  /**
   * Set correlation ID for request tracing
   */
  withCorrelationId(correlationId: string): this {
    this.context.correlationId = correlationId;
    return this;
  }

  /**
   * Add a message to the conversation history
   * Automatically caps history to MAX_MESSAGE_HISTORY (keeping most recent)
   */
  addMessage(role: MessageRole, content: string, timestamp?: string): this {
    this.context.messageHistory.push({
      role,
      content,
      timestamp: timestamp ?? new Date().toISOString(),
    });

    // Cap the array to prevent unbounded growth
    if (this.context.messageHistory.length > MAX_MESSAGE_HISTORY) {
      this.context.messageHistory = this.context.messageHistory.slice(-MAX_MESSAGE_HISTORY);
    }

    return this;
  }

  /**
   * Set entire message history at once
   * Automatically caps to MAX_MESSAGE_HISTORY (keeping most recent)
   */
  withMessageHistory(messages: MessageEntry[]): this {
    // Cap the array to prevent unbounded growth
    this.context.messageHistory =
      messages.length > MAX_MESSAGE_HISTORY
        ? messages.slice(-MAX_MESSAGE_HISTORY)
        : messages;
    return this;
  }

  /**
   * Override first-touch timestamp
   */
  withFirstTouchTimestamp(timestamp: string | Date): this {
    this.context.firstTouchTimestamp =
      timestamp instanceof Date ? timestamp.toISOString() : parseTimestamp(timestamp);
    return this;
  }

  /**
   * Add custom metadata
   */
  withMetadata(key: string, value: unknown): this {
    this.context.metadata[key] = value;
    return this;
  }

  /**
   * Merge multiple metadata objects
   */
  withMetadataObject(metadata: Record<string, unknown>): this {
    this.context.metadata = { ...this.context.metadata, ...metadata };
    return this;
  }

  /**
   * Build the final LeadContext object
   */
  build(): LeadContext {
    // Auto-detect language if not set and we have message content
    if (!this.context.language && this.context.messageHistory.length > 0) {
      this.withAutoDetectedLanguage();
    }

    // Default language to Romanian if still not set
    this.context.language ??= 'ro';

    return { ...this.context };
  }

  /**
   * Build and return LeadContext compatible with scoring service
   * (Uses the simpler structure from lead.schema.ts)
   */
  buildForScoring(): {
    phone: string;
    name?: string;
    channel: LeadChannel;
    firstTouchTimestamp: string;
    language?: SupportedLanguage;
    messageHistory?: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
    utm?: UTMParams;
    hubspotContactId?: string;
  } {
    const ctx = this.build();

    // Build result object, only including defined optional properties
    const result: {
      phone: string;
      name?: string;
      channel: LeadChannel;
      firstTouchTimestamp: string;
      language?: SupportedLanguage;
      messageHistory?: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
      utm?: UTMParams;
      hubspotContactId?: string;
    } = {
      phone: ctx.phone,
      channel: ctx.channel,
      firstTouchTimestamp: ctx.firstTouchTimestamp,
    };

    if (ctx.name) {
      result.name = ctx.name;
    }
    if (ctx.language) {
      result.language = ctx.language;
    }
    if (ctx.messageHistory.length > 0) {
      result.messageHistory = ctx.messageHistory;
    }
    if (ctx.utm) {
      result.utm = ctx.utm;
    }
    if (ctx.hubspotContactId) {
      result.hubspotContactId = ctx.hubspotContactId;
    }

    return result;
  }
}

/**
 * Parse a timestamp string to ISO format
 * Handles Unix timestamps (seconds or milliseconds) and ISO strings
 */
function parseTimestamp(timestamp: string): string {
  // Already ISO format
  if (timestamp.includes('T') || timestamp.includes('-')) {
    return timestamp;
  }

  // Unix timestamp (seconds or milliseconds)
  const numeric = parseInt(timestamp, 10);
  if (!isNaN(numeric)) {
    // If less than year 2001 in seconds, likely milliseconds
    const ms = numeric < 1000000000000 ? numeric * 1000 : numeric;
    return new Date(ms).toISOString();
  }

  // Fallback to current time
  return new Date().toISOString();
}

/**
 * Parse UTM parameters from a URL string
 */
function parseUTMFromUrl(url: string): UTMParams {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    const result: UTMParams = {};

    const utmSource = params.get('utm_source');
    if (utmSource) result.utm_source = utmSource;

    const utmMedium = params.get('utm_medium');
    if (utmMedium) result.utm_medium = utmMedium;

    const utmCampaign = params.get('utm_campaign');
    if (utmCampaign) result.utm_campaign = utmCampaign;

    const utmTerm = params.get('utm_term');
    if (utmTerm) result.utm_term = utmTerm;

    const utmContent = params.get('utm_content');
    if (utmContent) result.utm_content = utmContent;

    const gclid = params.get('gclid');
    if (gclid) result.gclid = gclid;

    const fbclid = params.get('fbclid');
    if (fbclid) result.fbclid = fbclid;

    return result;
  } catch {
    return {};
  }
}

/**
 * Simple language detection based on common patterns
 * For production use, integrate with proper language detection service
 */
function detectLanguage(text: string): SupportedLanguage {
  const lowerText = text.toLowerCase();

  // Romanian indicators
  const romanianPatterns = [
    'bună',
    'salut',
    'sunt',
    'vreau',
    'aș vrea',
    'mulțumesc',
    'vă rog',
    'dinte',
    'dinți',
    'implant',
    'durere',
    'programare',
    'cât costă',
    'preț',
    'clinică',
    'doctor',
    'tratament',
    'și',
    'că',
    'să',
    'este',
    'sunt',
    'ați',
    'mă',
    'îmi',
    'dumneavoastră',
  ];

  // German indicators
  const germanPatterns = [
    'guten tag',
    'hallo',
    'ich möchte',
    'ich brauche',
    'wie viel',
    'danke',
    'bitte',
    'termin',
    'zahn',
    'zähne',
    'schmerz',
    'behandlung',
    'und',
    'ist',
    'mit',
    'für',
    'haben',
  ];

  // English indicators
  const englishPatterns = [
    'hello',
    'hi',
    'i want',
    'i need',
    'how much',
    'thank you',
    'please',
    'appointment',
    'tooth',
    'teeth',
    'pain',
    'treatment',
    'price',
    'cost',
    'clinic',
    'dentist',
    'the',
    'is',
    'are',
    'would',
    'could',
  ];

  // Count matches
  let roCount = 0;
  let deCount = 0;
  let enCount = 0;

  for (const pattern of romanianPatterns) {
    if (lowerText.includes(pattern)) roCount++;
  }
  for (const pattern of germanPatterns) {
    if (lowerText.includes(pattern)) deCount++;
  }
  for (const pattern of englishPatterns) {
    if (lowerText.includes(pattern)) enCount++;
  }

  // Determine winner with Romanian as default
  if (deCount > roCount && deCount > enCount) return 'de';
  if (enCount > roCount && enCount > deCount) return 'en';
  return 'ro';
}

/**
 * Convenience function to create LeadContext from WhatsApp data
 */
export function buildLeadContextFromWhatsApp(
  input: WhatsAppInput,
  options?: {
    utm?: UTMParams | string;
    correlationId?: string;
    hubspotContactId?: string;
    language?: SupportedLanguage;
  }
): LeadContext {
  let builder = LeadContextBuilder.fromWhatsApp(input);

  if (options?.utm) {
    builder = builder.withUTM(options.utm);
  }
  if (options?.correlationId) {
    builder = builder.withCorrelationId(options.correlationId);
  }
  if (options?.hubspotContactId) {
    builder = builder.withHubSpotContact(options.hubspotContactId);
  }
  if (options?.language) {
    builder = builder.withLanguage(options.language);
  }

  return builder.build();
}

/**
 * Convenience function to create LeadContext from Voice call data
 */
export function buildLeadContextFromVoiceCall(
  input: VoiceCallInput,
  options?: {
    correlationId?: string;
    hubspotContactId?: string;
    language?: SupportedLanguage;
  }
): LeadContext {
  let builder = LeadContextBuilder.fromVoiceCall(input);

  if (options?.correlationId) {
    builder = builder.withCorrelationId(options.correlationId);
  }
  if (options?.hubspotContactId) {
    builder = builder.withHubSpotContact(options.hubspotContactId);
  }
  if (options?.language) {
    builder = builder.withLanguage(options.language);
  }

  return builder.build();
}

/**
 * Convenience function to create LeadContext from web form data
 */
export function buildLeadContextFromWebForm(
  input: WebFormInput,
  options?: {
    utm?: UTMParams | string;
    correlationId?: string;
    language?: SupportedLanguage;
  }
): LeadContext {
  let builder = LeadContextBuilder.fromWebForm(input);

  if (options?.utm) {
    builder = builder.withUTM(options.utm);
  }
  if (options?.correlationId) {
    builder = builder.withCorrelationId(options.correlationId);
  }
  if (options?.language) {
    builder = builder.withLanguage(options.language);
  }

  return builder.build();
}
