import { withRetry, ExternalServiceError, WebhookSignatureError } from '@medicalcor/core';
import crypto from 'crypto';

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
  parameters?: Array<{
    type: 'text' | 'image' | 'document' | 'video';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
  }>;
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
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MediaUploadResponse {
  id: string;
}

export class WhatsAppClient {
  private config: WhatsAppClientConfig;
  private baseUrl: string;

  constructor(config: WhatsAppClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://waba.360dialog.io/v1';
  }

  /**
   * Send a text message
   */
  async sendText(options: SendTextOptions): Promise<MessageResponse> {
    const { to, text, previewUrl = false } = options;

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
    const { to, templateName, language = 'ro', components } = options;

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
    buttons: Array<{ id: string; title: string }>;
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
            buttons: buttons.map(b => ({
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
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
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
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(providedSignature)
      );
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

    const makeRequest = async () => {
      const response = await fetch(url, {
        ...options,
        headers: {
          'D360-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.status === 429) {
        throw new RateLimitError(60);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ExternalServiceError('WhatsApp', `${response.status}: ${errorBody}`);
      }

      return response.json() as Promise<T>;
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

class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter} seconds`);
    this.name = 'RateLimitError';
  }
}

/**
 * Create a configured WhatsApp client
 */
export function createWhatsAppClient(config: WhatsAppClientConfig): WhatsAppClient {
  return new WhatsAppClient(config);
}

/**
 * Template catalog with parameter validation
 */
export const TEMPLATE_CATALOG = {
  hot_lead_acknowledgment: {
    name: 'hot_lead_acknowledgment',
    language: 'ro',
    parameters: ['name'] as const,
  },
  appointment_confirmation: {
    name: 'appointment_confirmation',
    language: 'ro',
    parameters: ['date', 'time', 'location'] as const,
  },
  appointment_reminder_24h: {
    name: 'appointment_reminder_24h',
    language: 'ro',
    parameters: ['date', 'time', 'location'] as const,
  },
  appointment_reminder_2h: {
    name: 'appointment_reminder_2h',
    language: 'ro',
    parameters: ['time', 'location'] as const,
  },
  payment_confirmation: {
    name: 'payment_confirmation',
    language: 'ro',
    parameters: ['amount'] as const,
  },
  recall_reminder: {
    name: 'recall_reminder',
    language: 'ro',
    parameters: ['name'] as const,
  },
  consent_renewal: {
    name: 'consent_renewal',
    language: 'ro',
    parameters: [] as const,
  },
} as const;

export type TemplateName = keyof typeof TEMPLATE_CATALOG;
