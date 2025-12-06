/**
 * @fileoverview Notification Channel Adapter Interface
 *
 * Defines the contract for multi-channel notification delivery adapters
 * following hexagonal architecture patterns.
 *
 * @module integrations/adapters/notification-channel
 */

import type { Result } from '../lib/index.js';

// ============================================
// Types
// ============================================

/**
 * Supported notification channel types
 */
export type NotificationChannelType = 'email' | 'sms' | 'push' | 'whatsapp' | 'voice' | 'slack';

/**
 * Priority levels for notifications
 */
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Options for sending a notification through a channel
 */
export interface SendNotificationOptions {
  /** Recipient identifier (email, phone, user ID, etc.) */
  recipient: string;
  /** Notification title (optional for some channels) */
  title?: string;
  /** Main notification content */
  body: string;
  /** HTML content for channels that support it */
  htmlBody?: string;
  /** Channel-specific metadata */
  data?: Record<string, unknown>;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Priority level */
  priority?: NotificationPriority;
  /** Optional template ID for templated notifications */
  templateId?: string;
  /** Template variables for substitution */
  templateVars?: Record<string, string>;
  /** Reply-to address (for email) */
  replyTo?: string;
  /** CC recipients (for email) */
  cc?: string[];
  /** BCC recipients (for email) */
  bcc?: string[];
  /** Attachments (for channels that support them) */
  attachments?: NotificationAttachment[];
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Attachment for notifications
 */
export interface NotificationAttachment {
  /** File name */
  filename: string;
  /** MIME content type */
  contentType: string;
  /** Base64-encoded content or URL */
  content: string;
  /** Whether content is a URL */
  isUrl?: boolean;
}

/**
 * Result of sending a notification
 */
export interface SendNotificationResult {
  /** Whether the send was successful */
  success: boolean;
  /** Provider's message ID */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Error code from provider */
  errorCode?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Timestamp when notification was accepted */
  acceptedAt?: Date;
  /** Estimated delivery time */
  estimatedDeliveryAt?: Date;
  /** Provider-specific response data */
  providerResponse?: Record<string, unknown>;
}

/**
 * Channel statistics
 */
export interface ChannelStats {
  /** Total notifications sent */
  sent: number;
  /** Total failed notifications */
  failed: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Notifications in the last hour */
  lastHourCount: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Channel health status
 */
export interface ChannelHealthStatus {
  /** Whether the channel is healthy */
  healthy: boolean;
  /** Status message */
  message: string;
  /** Last successful send timestamp */
  lastSuccessAt?: Date;
  /** Last error timestamp */
  lastErrorAt?: Date;
  /** Last error message */
  lastError?: string;
}

// ============================================
// Interface
// ============================================

/**
 * Base interface for notification channel adapters
 *
 * Implementations should handle:
 * - Authentication with the provider
 * - Rate limiting
 * - Retry logic
 * - Error mapping
 * - Observability (logging, metrics)
 */
export interface INotificationChannel {
  /**
   * Channel type identifier
   */
  readonly channelType: NotificationChannelType;

  /**
   * Send a notification through this channel
   *
   * @param options - Notification options
   * @returns Result with send status
   */
  send(options: SendNotificationOptions): Promise<Result<SendNotificationResult, Error>>;

  /**
   * Check if the channel is properly configured and ready
   *
   * @returns True if the channel can accept notifications
   */
  isConfigured(): boolean;

  /**
   * Get channel health status
   *
   * @returns Health status information
   */
  getHealth(): Promise<ChannelHealthStatus>;

  /**
   * Get channel statistics (optional)
   *
   * @returns Channel statistics
   */
  getStats?(): Promise<ChannelStats>;

  /**
   * Validate a recipient identifier
   *
   * @param recipient - Recipient to validate
   * @returns True if the recipient format is valid for this channel
   */
  validateRecipient?(recipient: string): boolean;
}

// ============================================
// Factory Types
// ============================================

/**
 * Configuration for notification channel factory
 */
export interface ChannelFactoryConfig {
  email?: EmailChannelConfig;
  sms?: SMSChannelConfig;
  push?: PushChannelConfig;
  slack?: SlackChannelConfig;
}

/**
 * Email channel configuration
 */
export interface EmailChannelConfig {
  /** Email service provider type */
  provider: 'sendgrid' | 'ses' | 'mailgun' | 'smtp' | 'resend' | 'postmark';
  /** API key or credentials */
  apiKey: string;
  /** Service URL (for generic HTTP-based providers) */
  serviceUrl?: string;
  /** Default sender email */
  fromEmail: string;
  /** Default sender name */
  fromName?: string;
  /** Default reply-to email */
  replyToEmail?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Enable sandbox mode (for testing) */
  sandbox?: boolean;
}

/**
 * SMS channel configuration
 */
export interface SMSChannelConfig {
  provider: 'twilio' | 'vonage' | 'messagebird';
  apiKey: string;
  apiSecret?: string;
  fromNumber: string;
  timeoutMs?: number;
}

/**
 * Push notification channel configuration
 */
export interface PushChannelConfig {
  provider: 'firebase' | 'apns' | 'web-push';
  apiKey?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  timeoutMs?: number;
}

/**
 * Slack channel configuration
 */
export interface SlackChannelConfig {
  webhookUrl: string;
  defaultChannel?: string;
  username?: string;
  iconEmoji?: string;
  timeoutMs?: number;
}
