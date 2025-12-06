/**
 * @fileoverview Email Channel Adapter
 *
 * Production-ready email notification channel adapter supporting multiple
 * email service providers (SendGrid, SES, Mailgun, Resend, Postmark, SMTP).
 *
 * Features:
 * - Multi-provider support with unified interface
 * - HTML and plain text email support
 * - Template-based emails
 * - Attachments support
 * - CC/BCC recipients
 * - HIPAA-compliant PII sanitization
 * - Structured logging with correlation IDs
 * - Health checks and statistics
 *
 * @module integrations/adapters/email-channel
 */

import { logger as baseLogger, generateCorrelationId } from '@medicalcor/core';
import { ok, err, type Result } from '../lib/index.js';
import type {
  INotificationChannel,
  SendNotificationOptions,
  SendNotificationResult,
  ChannelStats,
  ChannelHealthStatus,
  EmailChannelConfig,
} from './notification-channel.js';

// ============================================
// Constants
// ============================================

const DEFAULT_TIMEOUT_MS = 30000;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// ============================================
// Types
// ============================================

/**
 * Email-specific send options
 */
export interface EmailSendOptions extends SendNotificationOptions {
  /** Email subject (required for email) */
  subject: string;
  /** Plain text body */
  textBody?: string;
  /** HTML body */
  htmlBody?: string;
  /** From email override */
  from?: string;
  /** From name override */
  fromName?: string;
}

/**
 * Internal tracking for statistics
 */
interface EmailStats {
  sent: number;
  failed: number;
  totalLatencyMs: number;
  lastHourTimestamps: number[];
}

// ============================================
// Implementation
// ============================================

const logger = baseLogger.child({ service: 'email-channel-adapter' });

/**
 * Email Channel Adapter
 *
 * Provides a unified interface for sending emails through various providers.
 */
export class EmailChannelAdapter implements INotificationChannel {
  readonly channelType = 'email' as const;

  private readonly config: Required<
    Pick<EmailChannelConfig, 'provider' | 'apiKey' | 'fromEmail' | 'timeoutMs'>
  > &
    Omit<EmailChannelConfig, 'provider' | 'apiKey' | 'fromEmail' | 'timeoutMs'>;

  private stats: EmailStats = {
    sent: 0,
    failed: 0,
    totalLatencyMs: 0,
    lastHourTimestamps: [],
  };

  private lastSuccessAt?: Date;
  private lastErrorAt?: Date;
  private lastError?: string;

  constructor(config: EmailChannelConfig) {
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    logger.info(
      {
        provider: this.config.provider,
        fromEmail: this.config.fromEmail,
        sandbox: this.config.sandbox ?? false,
      },
      'Email channel adapter initialized'
    );
  }

  /**
   * Send an email notification
   */
  async send(options: SendNotificationOptions): Promise<Result<SendNotificationResult, Error>> {
    const correlationId = options.correlationId ?? generateCorrelationId();
    const startTime = Date.now();

    // Validate recipient
    if (!this.validateRecipient(options.recipient)) {
      return err(new Error(`Invalid email recipient: ${options.recipient}`));
    }

    // Build the email payload based on provider
    const subject = options.title ?? 'Notification';
    const textBody = options.body;
    const htmlBody = options.htmlBody ?? this.textToHtml(options.body);

    logger.debug(
      {
        correlationId,
        provider: this.config.provider,
        to: this.maskEmail(options.recipient),
        subject,
        hasHtml: Boolean(options.htmlBody),
        hasAttachments: Boolean(options.attachments?.length),
      },
      'Sending email notification'
    );

    try {
      const result = await this.sendViaProvider({
        ...options,
        subject,
        textBody,
        htmlBody,
        correlationId,
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess(latencyMs);

      logger.info(
        {
          correlationId,
          messageId: result.messageId,
          latencyMs,
        },
        'Email sent successfully'
      );

      return ok(result);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.recordError(errorMessage);

      logger.error(
        {
          correlationId,
          error: errorMessage,
          latencyMs,
          provider: this.config.provider,
        },
        'Failed to send email'
      );

      return err(error instanceof Error ? error : new Error(errorMessage));
    }
  }

  /**
   * Check if the adapter is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.fromEmail && this.config.provider);
  }

  /**
   * Get health status
   */
  getHealth(): Promise<ChannelHealthStatus> {
    const healthy = this.isConfigured();

    return Promise.resolve({
      healthy,
      message: healthy
        ? `Email channel (${this.config.provider}) is operational`
        : 'Email channel is not configured',
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
    });
  }

  /**
   * Get channel statistics
   */
  getStats(): Promise<ChannelStats> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Clean up old timestamps
    this.stats.lastHourTimestamps = this.stats.lastHourTimestamps.filter((t) => t > oneHourAgo);

    const total = this.stats.sent + this.stats.failed;

    return Promise.resolve({
      sent: this.stats.sent,
      failed: this.stats.failed,
      avgLatencyMs: this.stats.sent > 0 ? this.stats.totalLatencyMs / this.stats.sent : 0,
      lastHourCount: this.stats.lastHourTimestamps.length,
      successRate: total > 0 ? this.stats.sent / total : 1,
    });
  }

  /**
   * Validate email recipient format
   */
  validateRecipient(recipient: string): boolean {
    return EMAIL_REGEX.test(recipient);
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Send email via the configured provider
   */
  private async sendViaProvider(
    options: EmailSendOptions & { correlationId: string }
  ): Promise<SendNotificationResult> {
    const { provider, serviceUrl, apiKey, timeoutMs, sandbox } = this.config;

    // Build common request payload
    const payload = this.buildProviderPayload(options);

    // Determine endpoint and headers based on provider
    const { url, headers, body } = this.getProviderRequest(
      provider,
      serviceUrl,
      apiKey,
      payload,
      options.correlationId
    );

    if (sandbox) {
      logger.info(
        { correlationId: options.correlationId, payload },
        'Sandbox mode - email not actually sent'
      );
      return {
        success: true,
        messageId: `sandbox-${Date.now()}`,
        acceptedAt: new Date(),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      const isRetryable = response.status >= 500 || response.status === 429;

      throw new EmailSendError(
        `Email provider error: ${response.status} ${response.statusText} - ${errorBody}`,
        response.status.toString(),
        isRetryable
      );
    }

    const responseData = await response.json().catch(() => ({}));

    return {
      success: true,
      messageId: this.extractMessageId(provider, responseData),
      acceptedAt: new Date(),
      providerResponse: responseData as Record<string, unknown>,
    };
  }

  /**
   * Build provider-specific payload
   */
  private buildProviderPayload(options: EmailSendOptions): ProviderPayload {
    const { fromEmail, fromName, replyToEmail } = this.config;

    return {
      to: options.recipient,
      cc: options.cc,
      bcc: options.bcc,
      from: options.from ?? fromEmail,
      fromName: options.fromName ?? fromName,
      replyTo: options.replyTo ?? replyToEmail,
      subject: options.subject,
      text: options.textBody ?? options.body,
      html: options.htmlBody,
      templateId: options.templateId,
      templateVars: options.templateVars,
      attachments: options.attachments,
      headers: options.headers,
      priority: options.priority,
    };
  }

  /**
   * Get provider-specific request configuration
   */
  private getProviderRequest(
    provider: EmailChannelConfig['provider'],
    serviceUrl: string | undefined,
    apiKey: string,
    payload: ProviderPayload,
    correlationId: string
  ): { url: string; headers: Record<string, string>; body: unknown } {
    switch (provider) {
      case 'sendgrid':
        return {
          url: 'https://api.sendgrid.com/v3/mail/send',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Correlation-ID': correlationId,
          },
          body: this.buildSendGridPayload(payload),
        };

      case 'resend':
        return {
          url: 'https://api.resend.com/emails',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Correlation-ID': correlationId,
          },
          body: this.buildResendPayload(payload),
        };

      case 'postmark':
        return {
          url: 'https://api.postmarkapp.com/email',
          headers: {
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': apiKey,
            'X-Correlation-ID': correlationId,
          },
          body: this.buildPostmarkPayload(payload),
        };

      case 'mailgun':
        return {
          url: serviceUrl ?? 'https://api.mailgun.net/v3/messages',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          body: this.buildMailgunPayload(payload),
        };

      case 'ses':
        return {
          url: serviceUrl ?? 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails',
          headers: {
            'Content-Type': 'application/json',
            'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
            'X-Correlation-ID': correlationId,
            Authorization: `Bearer ${apiKey}`,
          },
          body: this.buildSESPayload(payload),
        };

      case 'smtp':
        return {
          url: serviceUrl ?? 'http://localhost:8025/send',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Correlation-ID': correlationId,
          },
          body: this.buildGenericPayload(payload),
        };
    }
  }

  /**
   * Build SendGrid-specific payload
   */
  private buildSendGridPayload(payload: ProviderPayload): unknown {
    interface Personalization {
      to: { email: string }[];
      cc?: { email: string }[];
      bcc?: { email: string }[];
      dynamic_template_data?: Record<string, string>;
    }

    const personalizations: Personalization[] = [
      {
        to: [{ email: payload.to }],
      },
    ];

    if (payload.cc?.length) {
      personalizations[0].cc = payload.cc.map((email) => ({ email }));
    }
    if (payload.bcc?.length) {
      personalizations[0].bcc = payload.bcc.map((email) => ({ email }));
    }

    const content = [];
    if (payload.text) {
      content.push({ type: 'text/plain', value: payload.text });
    }
    if (payload.html) {
      content.push({ type: 'text/html', value: payload.html });
    }

    const result: Record<string, unknown> = {
      personalizations,
      from: {
        email: payload.from,
        ...(payload.fromName && { name: payload.fromName }),
      },
      subject: payload.subject,
      content,
    };

    if (payload.replyTo) {
      result.reply_to = { email: payload.replyTo };
    }

    if (payload.templateId) {
      result.template_id = payload.templateId;
      if (payload.templateVars) {
        personalizations[0].dynamic_template_data = payload.templateVars;
      }
    }

    if (payload.attachments?.length) {
      result.attachments = payload.attachments.map((att) => ({
        content: att.content,
        filename: att.filename,
        type: att.contentType,
      }));
    }

    return result;
  }

  /**
   * Build Resend-specific payload
   */
  private buildResendPayload(payload: ProviderPayload): unknown {
    const from = payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from;

    const result: Record<string, unknown> = {
      from,
      to: payload.to,
      subject: payload.subject,
    };

    if (payload.text) result.text = payload.text;
    if (payload.html) result.html = payload.html;
    if (payload.cc) result.cc = payload.cc;
    if (payload.bcc) result.bcc = payload.bcc;
    if (payload.replyTo) result.reply_to = payload.replyTo;

    if (payload.attachments?.length) {
      result.attachments = payload.attachments.map((att) => ({
        content: att.content,
        filename: att.filename,
      }));
    }

    return result;
  }

  /**
   * Build Postmark-specific payload
   */
  private buildPostmarkPayload(payload: ProviderPayload): unknown {
    const result: Record<string, unknown> = {
      From: payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from,
      To: payload.to,
      Subject: payload.subject,
    };

    if (payload.text) result.TextBody = payload.text;
    if (payload.html) result.HtmlBody = payload.html;
    if (payload.cc) result.Cc = payload.cc.join(',');
    if (payload.bcc) result.Bcc = payload.bcc.join(',');
    if (payload.replyTo) result.ReplyTo = payload.replyTo;
    if (payload.templateId) result.TemplateId = payload.templateId;
    if (payload.templateVars) result.TemplateModel = payload.templateVars;

    if (payload.attachments?.length) {
      result.Attachments = payload.attachments.map((att) => ({
        Name: att.filename,
        Content: att.content,
        ContentType: att.contentType,
      }));
    }

    return result;
  }

  /**
   * Build Mailgun-specific payload
   */
  private buildMailgunPayload(payload: ProviderPayload): unknown {
    const from = payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from;

    const result: Record<string, unknown> = {
      from,
      to: payload.to,
      subject: payload.subject,
    };

    if (payload.text) result.text = payload.text;
    if (payload.html) result.html = payload.html;
    if (payload.cc) result.cc = payload.cc.join(',');
    if (payload.bcc) result.bcc = payload.bcc.join(',');
    if (payload.replyTo) result['h:Reply-To'] = payload.replyTo;
    if (payload.templateId) result.template = payload.templateId;
    if (payload.templateVars)
      result['h:X-Mailgun-Variables'] = JSON.stringify(payload.templateVars);

    return result;
  }

  /**
   * Build AWS SES-specific payload
   */
  private buildSESPayload(payload: ProviderPayload): unknown {
    const result: Record<string, unknown> = {
      FromEmailAddress: payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from,
      Destination: {
        ToAddresses: [payload.to],
        ...(payload.cc?.length && { CcAddresses: payload.cc }),
        ...(payload.bcc?.length && { BccAddresses: payload.bcc }),
      },
      Content: {
        Simple: {
          Subject: { Data: payload.subject },
          Body: {
            ...(payload.text && { Text: { Data: payload.text } }),
            ...(payload.html && { Html: { Data: payload.html } }),
          },
        },
      },
    };

    if (payload.replyTo) {
      result.ReplyToAddresses = [payload.replyTo];
    }

    return result;
  }

  /**
   * Build generic email service payload
   */
  private buildGenericPayload(payload: ProviderPayload): unknown {
    return {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      from: payload.from,
      fromName: payload.fromName,
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      templateId: payload.templateId,
      templateVars: payload.templateVars,
      attachments: payload.attachments,
      headers: payload.headers,
    };
  }

  /**
   * Extract message ID from provider response
   */
  private extractMessageId(
    provider: EmailChannelConfig['provider'],
    response: Record<string, unknown>
  ): string | undefined {
    switch (provider) {
      case 'sendgrid':
        return response['x-message-id'] as string | undefined;
      case 'resend':
        return response.id as string | undefined;
      case 'postmark':
        return response.MessageID as string | undefined;
      case 'mailgun':
        return response.id as string | undefined;
      case 'ses':
        return response.MessageId as string | undefined;
      case 'smtp':
        return (response.messageId ?? response.id) as string | undefined;
    }
  }

  /**
   * Convert plain text to simple HTML
   */
  private textToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">${escaped.replace(/\n/g, '<br>')}</div>`;
  }

  /**
   * Mask email for logging (HIPAA compliance)
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';

    const maskedLocal =
      local.length > 2 ? `${local.slice(0, 2)}${'*'.repeat(local.length - 2)}` : '***';

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Record successful send
   */
  private recordSuccess(latencyMs: number): void {
    this.stats.sent++;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.lastHourTimestamps.push(Date.now());
    this.lastSuccessAt = new Date();
  }

  /**
   * Record failed send
   */
  private recordError(error: string): void {
    this.stats.failed++;
    this.lastErrorAt = new Date();
    this.lastError = error;
  }
}

// ============================================
// Helper Types
// ============================================

interface ProviderPayload {
  to: string;
  cc?: string[];
  bcc?: string[];
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
  attachments?: {
    filename: string;
    contentType: string;
    content: string;
  }[];
  headers?: Record<string, string>;
  priority?: string;
}

// ============================================
// Error Types
// ============================================

/**
 * Email-specific send error
 */
export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an email channel adapter
 *
 * @param config - Email channel configuration
 * @returns Configured email channel adapter
 *
 * @example
 * ```typescript
 * const emailAdapter = createEmailChannelAdapter({
 *   provider: 'sendgrid',
 *   apiKey: process.env.SENDGRID_API_KEY,
 *   fromEmail: 'notifications@medicalcor.com',
 *   fromName: 'MedicalCor Notifications',
 * });
 *
 * const result = await emailAdapter.send({
 *   recipient: 'doctor@clinic.com',
 *   title: 'Urgent: Patient Escalation',
 *   body: 'A patient case has been escalated and requires your attention.',
 *   priority: 'high',
 * });
 * ```
 */
export function createEmailChannelAdapter(config: EmailChannelConfig): EmailChannelAdapter {
  return new EmailChannelAdapter(config);
}
