import { withRetry, ExternalServiceError, WebhookSignatureError, RateLimitError } from '@medicalcor/core';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Input validation schemas for WhatsApp client
 */
const PhoneSchema = z.string().min(10).max(15).regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format');

const SendTextOptionsSchema = z.object({
  to: PhoneSchema,
  text: z.string().min(1).max(4096, 'Message text too long (max 4096 chars)'),
  previewUrl: z.boolean().optional(),
});

const TemplateComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  parameters: z.array(z.object({
    type: z.enum(['text', 'image', 'document', 'video']),
    text: z.string().optional(),
    image: z.object({ link: z.string().url() }).optional(),
    document: z.object({ link: z.string().url(), filename: z.string().optional() }).optional(),
    video: z.object({ link: z.string().url() }).optional(),
  })).optional(),
  sub_type: z.enum(['quick_reply', 'url']).optional(),
  index: z.string().optional(),
});

const SendTemplateOptionsSchema = z.object({
  to: PhoneSchema,
  templateName: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, 'Template name must be lowercase alphanumeric with underscores'),
  language: z.string().min(2).max(5).optional(),
  components: z.array(TemplateComponentSchema).optional(),
});

const WhatsAppClientConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
  businessAccountId: z.string().optional(),
  webhookSecret: z.string().optional(),
  baseUrl: z.string().url().optional(),
  retryConfig: z.object({
    maxRetries: z.number().int().min(0).max(10),
    baseDelayMs: z.number().int().min(100).max(30000),
  }).optional(),
});

/**
 * 360dialog WhatsApp Business API Client
 * Wrapper for sending messages and managing templates
 */

export interface WhatsAppClientConfig {
  apiKey: string;
  phoneNumberId: string;
  businessAccountId?: string;
  webhookSecret?: string;
  baseUrl?: string;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export interface SendTextOptions {
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: {
    type: 'text' | 'image' | 'document' | 'video';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
  }[];
  sub_type?: 'quick_reply' | 'url';
  index?: string;
}

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  language?: string;
  components?: TemplateComponent[];
}

export interface MessageResponse {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

export interface MediaUploadResponse {
  id: string;
}

export class WhatsAppClient {
  private config: WhatsAppClientConfig;
  private baseUrl: string;

  constructor(config: WhatsAppClientConfig) {
    // Validate config at construction time
    const validatedConfig = WhatsAppClientConfigSchema.parse(config);
    this.config = validatedConfig;
    this.baseUrl = validatedConfig.baseUrl ?? 'https://waba.360dialog.io/v1';
  }

  /**
   * Send a text message
   */
  async sendText(options: SendTextOptions): Promise<MessageResponse> {
    // Validate input
    const validated = SendTextOptionsSchema.parse(options);
    const { to, text, previewUrl = false } = validated;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'text',
        text: {
          preview_url: previewUrl,
          body: text,
        },
      }),
    });
  }

  /**
   * Send a template message
   */
  async sendTemplate(options: SendTemplateOptions): Promise<MessageResponse> {
    // Validate input
    const validated = SendTemplateOptionsSchema.parse(options);
    const { to, templateName, language = 'ro', components } = validated;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language,
          },
          components: components ?? [],
        },
      }),
    });
  }

  /**
   * Send an interactive button message
   */
  async sendInteractiveButtons(options: {
    to: string;
    bodyText: string;
    buttons: { id: string; title: string }[];
    headerText?: string;
    footerText?: string;
  }): Promise<MessageResponse> {
    const { to, bodyText, buttons, headerText, footerText } = options;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'interactive',
        interactive: {
          type: 'button',
          header: headerText ? { type: 'text', text: headerText } : undefined,
          body: { text: bodyText },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            buttons: buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      }),
    });
  }

  /**
   * Send an interactive list message
   */
  async sendInteractiveList(options: {
    to: string;
    bodyText: string;
    buttonText: string;
    sections: {
      title: string;
      rows: { id: string; title: string; description?: string }[];
    }[];
    headerText?: string;
    footerText?: string;
  }): Promise<MessageResponse> {
    const { to, bodyText, buttonText, sections, headerText, footerText } = options;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'interactive',
        interactive: {
          type: 'list',
          header: headerText ? { type: 'text', text: headerText } : undefined,
          body: { text: bodyText },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            button: buttonText,
            sections,
          },
        },
      }),
    });
  }

  /**
   * Send an image message
   */
  async sendImage(options: {
    to: string;
    imageUrl: string;
    caption?: string;
  }): Promise<MessageResponse> {
    const { to, imageUrl, caption } = options;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'image',
        image: {
          link: imageUrl,
          caption,
        },
      }),
    });
  }

  /**
   * Send a document message
   */
  async sendDocument(options: {
    to: string;
    documentUrl: string;
    filename?: string;
    caption?: string;
  }): Promise<MessageResponse> {
    const { to, documentUrl, filename, caption } = options;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          caption,
        },
      }),
    });
  }

  /**
   * Send a location message
   */
  async sendLocation(options: {
    to: string;
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  }): Promise<MessageResponse> {
    const { to, latitude, longitude, name, address } = options;

    return this.request<MessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'location',
        location: {
          latitude,
          longitude,
          name,
          address,
        },
      }),
    });
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  }

  /**
   * Verify webhook signature (HMAC)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
    } catch {
      return false;
    }
  }

  /**
   * Validate and verify incoming webhook
   */
  validateWebhook(payload: string, signature: string): void {
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new WebhookSignatureError('Invalid WhatsApp webhook signature');
    }
  }

  /**
   * Normalize phone number to WhatsApp format
   */
  private normalizePhone(phone: string): string {
    // Remove all non-numeric characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Remove leading + if present
    if (normalized.startsWith('+')) {
      normalized = normalized.substring(1);
    }

    // Handle Romanian numbers
    if (normalized.startsWith('0') && normalized.length === 10) {
      normalized = '40' + normalized.substring(1);
    }

    return normalized;
  }

  /**
   * Make HTTP request to WhatsApp API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = 30000; // 30 second timeout

    const makeRequest = async () => {
      const existingHeaders =
        options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : (options.headers as Record<string, string> | undefined);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'D360-API-KEY': this.config.apiKey,
            'Content-Type': 'application/json',
            ...existingHeaders,
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          throw new RateLimitError(60);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ExternalServiceError('WhatsApp', `${response.status}: ${errorBody}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('WhatsApp', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
        return false;
      },
    });
  }
}

/**
 * Create a configured WhatsApp client
 */
export function createWhatsAppClient(config: WhatsAppClientConfig): WhatsAppClient {
  return new WhatsAppClient(config);
}

/**
 * Template Catalog Service
 * Manages WhatsApp Business API templates with multi-language support
 */

export type SupportedLanguage = 'ro' | 'en' | 'de';

export interface TemplateDefinition {
  id: string;
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  languages: SupportedLanguage[];
  parameters: TemplateParameter[];
  description: string;
  requiresConsent: boolean;
  cooldownMinutes: number; // Minimum time between sends
}

export interface TemplateParameter {
  name: string;
  type: 'text' | 'date' | 'time' | 'currency' | 'url';
  required: boolean;
  maxLength?: number;
  format?: string; // e.g., 'DD.MM.YYYY' for dates
}

export interface TemplateMessage {
  templateId: string;
  language: SupportedLanguage;
  parameters: Record<string, string>;
}

export interface TemplateSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Full template catalog with multi-language support
 */
export const TEMPLATE_CATALOG: Record<string, TemplateDefinition> = {
  // Marketing templates
  hot_lead_acknowledgment: {
    id: 'hot_lead_acknowledgment',
    name: 'hot_lead_acknowledgment',
    category: 'marketing',
    languages: ['ro', 'en', 'de'],
    parameters: [{ name: 'name', type: 'text', required: true, maxLength: 50 }],
    description: 'Welcome message for high-priority leads',
    requiresConsent: true,
    cooldownMinutes: 60,
  },
  appointment_confirmation: {
    id: 'appointment_confirmation',
    name: 'appointment_confirmation',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'date', type: 'date', required: true, format: 'DD.MM.YYYY' },
      { name: 'time', type: 'time', required: true, format: 'HH:mm' },
      { name: 'location', type: 'text', required: true, maxLength: 100 },
    ],
    description: 'Appointment booking confirmation',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
  appointment_reminder_24h: {
    id: 'appointment_reminder_24h',
    name: 'appointment_reminder_24h',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'date', type: 'date', required: true, format: 'DD.MM.YYYY' },
      { name: 'time', type: 'time', required: true, format: 'HH:mm' },
      { name: 'location', type: 'text', required: true, maxLength: 100 },
    ],
    description: '24-hour appointment reminder',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
  appointment_reminder_2h: {
    id: 'appointment_reminder_2h',
    name: 'appointment_reminder_2h',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'time', type: 'time', required: true, format: 'HH:mm' },
      { name: 'location', type: 'text', required: true, maxLength: 100 },
    ],
    description: '2-hour appointment reminder',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
  payment_confirmation: {
    id: 'payment_confirmation',
    name: 'payment_confirmation',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'amount', type: 'currency', required: true },
      { name: 'date', type: 'date', required: false, format: 'DD.MM.YYYY' },
    ],
    description: 'Payment/deposit confirmation',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
  recall_reminder: {
    id: 'recall_reminder',
    name: 'recall_reminder',
    category: 'marketing',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'name', type: 'text', required: true, maxLength: 50 },
      { name: 'months', type: 'text', required: false },
    ],
    description: 'Periodic checkup/cleaning reminder',
    requiresConsent: true,
    cooldownMinutes: 1440, // 24 hours
  },
  consent_renewal: {
    id: 'consent_renewal',
    name: 'consent_renewal',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [],
    description: 'GDPR consent renewal request',
    requiresConsent: false, // Special case - asking for consent
    cooldownMinutes: 10080, // 7 days
  },
  treatment_follow_up: {
    id: 'treatment_follow_up',
    name: 'treatment_follow_up',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'name', type: 'text', required: true, maxLength: 50 },
      { name: 'procedure', type: 'text', required: true, maxLength: 100 },
    ],
    description: 'Post-treatment follow-up message',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
  consultation_offer: {
    id: 'consultation_offer',
    name: 'consultation_offer',
    category: 'marketing',
    languages: ['ro', 'en', 'de'],
    parameters: [
      { name: 'name', type: 'text', required: true, maxLength: 50 },
      { name: 'offer', type: 'text', required: false, maxLength: 200 },
    ],
    description: 'Free consultation offer for leads',
    requiresConsent: true,
    cooldownMinutes: 4320, // 3 days
  },
  welcome_first_contact: {
    id: 'welcome_first_contact',
    name: 'welcome_first_contact',
    category: 'utility',
    languages: ['ro', 'en', 'de'],
    parameters: [{ name: 'name', type: 'text', required: false, maxLength: 50 }],
    description: 'Welcome message for first-time contacts',
    requiresConsent: false,
    cooldownMinutes: 0,
  },
};

export type TemplateName = keyof typeof TEMPLATE_CATALOG;

/**
 * Template Catalog Service
 */
export class TemplateCatalogService {
  private sendHistory = new Map<string, Date>(); // contactId:templateId -> lastSent

  /**
   * Get template definition
   */
  getTemplate(templateId: string): TemplateDefinition | null {
    return TEMPLATE_CATALOG[templateId] ?? null;
  }

  /**
   * Get all templates
   */
  getAllTemplates(): TemplateDefinition[] {
    return Object.values(TEMPLATE_CATALOG);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: TemplateDefinition['category']): TemplateDefinition[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  /**
   * Get templates available in a specific language
   */
  getTemplatesForLanguage(language: SupportedLanguage): TemplateDefinition[] {
    return this.getAllTemplates().filter((t) => t.languages.includes(language));
  }

  /**
   * Validate template parameters
   */
  validateParameters(
    templateId: string,
    parameters: Record<string, string>
  ): { valid: boolean; errors: string[] } {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { valid: false, errors: [`Template not found: ${templateId}`] };
    }

    const errors: string[] = [];

    for (const param of template.parameters) {
      const value = parameters[param.name];

      // Check required parameters
      if (param.required && (!value || value.trim() === '')) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (!value) continue;

      // Check max length
      if (param.maxLength && value.length > param.maxLength) {
        errors.push(`Parameter ${param.name} exceeds max length of ${param.maxLength}`);
      }

      // Validate format based on type
      if (param.type === 'date' && param.format === 'DD.MM.YYYY') {
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
          errors.push(`Parameter ${param.name} must be in format DD.MM.YYYY`);
        }
      }

      if (param.type === 'time' && param.format === 'HH:mm') {
        if (!/^\d{2}:\d{2}$/.test(value)) {
          errors.push(`Parameter ${param.name} must be in format HH:mm`);
        }
      }

      if (param.type === 'currency') {
        if (!/^[\d.,]+\s*[A-Z]{0,3}$/.test(value)) {
          errors.push(`Parameter ${param.name} must be a valid currency amount`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if template can be sent (respects cooldown)
   */
  canSendTemplate(
    contactId: string,
    templateId: string
  ): { allowed: boolean; waitMinutes?: number } {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { allowed: false };
    }

    if (template.cooldownMinutes === 0) {
      return { allowed: true };
    }

    const key = `${contactId}:${templateId}`;
    const lastSent = this.sendHistory.get(key);

    if (!lastSent) {
      return { allowed: true };
    }

    const minutesSinceLastSend = (Date.now() - lastSent.getTime()) / 1000 / 60;
    if (minutesSinceLastSend >= template.cooldownMinutes) {
      return { allowed: true };
    }

    return {
      allowed: false,
      waitMinutes: Math.ceil(template.cooldownMinutes - minutesSinceLastSend),
    };
  }

  /**
   * Record template send
   */
  recordTemplateSend(contactId: string, templateId: string): void {
    const key = `${contactId}:${templateId}`;
    this.sendHistory.set(key, new Date());
  }

  /**
   * Build template components from parameters
   */
  buildTemplateComponents(
    templateId: string,
    parameters: Record<string, string>
  ): TemplateComponent[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      return [];
    }

    const bodyParams = template.parameters
      .filter((p): p is TemplateParameter & { name: string } => Boolean(parameters[p.name]))
      .map((p) => {
        const paramValue = parameters[p.name];
        return {
          type: 'text' as const,
          text: paramValue ?? '',
        };
      });

    if (bodyParams.length === 0) {
      return [];
    }

    return [
      {
        type: 'body',
        parameters: bodyParams,
      },
    ];
  }

  /**
   * Get template name for specific language
   * Templates are registered with language suffix in Meta Business Suite
   */
  getTemplateNameForLanguage(templateId: string, _language: SupportedLanguage): string {
    const template = this.getTemplate(templateId);
    if (!template) {
      return templateId;
    }

    // Return base name - Meta handles language internally via language code
    return template.name;
  }

  /**
   * Get language code for Meta API
   */
  getMetaLanguageCode(language: SupportedLanguage): string {
    const codes: Record<SupportedLanguage, string> = {
      ro: 'ro',
      en: 'en',
      de: 'de',
    };
    return codes[language];
  }

  /**
   * Format date for template
   */
  formatDateForTemplate(date: Date | string, language: SupportedLanguage = 'ro'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    // Romanian/German use DD.MM.YYYY, English uses MM/DD/YYYY
    if (language === 'en') {
      return `${month}/${day}/${year}`;
    }
    return `${day}.${month}.${year}`;
  }

  /**
   * Format time for template
   */
  formatTimeForTemplate(time: Date | string): string {
    if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
      return time;
    }
    const d = typeof time === 'string' ? new Date(time) : time;
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format currency for template
   */
  formatCurrencyForTemplate(
    amount: number,
    currency = 'EUR',
    language: SupportedLanguage = 'ro'
  ): string {
    const locales: Record<SupportedLanguage, string> = {
      ro: 'ro-RO',
      en: 'en-US',
      de: 'de-DE',
    };

    return new Intl.NumberFormat(locales[language], {
      style: 'currency',
      currency,
    }).format(amount);
  }
}

/**
 * Create template catalog service instance
 */
export function createTemplateCatalogService(): TemplateCatalogService {
  return new TemplateCatalogService();
}
