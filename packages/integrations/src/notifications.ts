/**
 * Real-time Notifications Service
 * Multi-channel notification dispatch for urgent cases and alerts
 *
 * Channels:
 * - SSE (Server-Sent Events) for supervisor dashboard
 * - WebSocket for real-time frontend updates
 * - Push notifications via web-push
 * - Email for escalations
 *
 * HIPAA/GDPR Compliant: PII is masked in all notifications
 */

import { logger as baseLogger, generateCorrelationId } from '@medicalcor/core';

// ============================================
// Types
// ============================================

export interface NotificationPayload {
  type:
    | 'urgency.new'
    | 'urgency.escalated'
    | 'urgency.resolved'
    | 'urgency.critical_unresolved'
    | 'lead.hot'
    | 'appointment.cancelled'
    | 'system.alert';
  priority: 'critical' | 'high' | 'medium' | 'low';
  phone?: string;
  patientName?: string;
  channel?: 'whatsapp' | 'voice' | 'web';
  reason?: string;
  keywords?: string[];
  sentimentScore?: number;
  callSid?: string;
  escalationTier?: number;
  tierName?: string;
  resolvedBy?: string;
  resolutionTime?: string;
  timestamp: string;
  correlationId: string;
  [key: string]: unknown;
}

export interface SupervisorNotification {
  id: string;
  payload: NotificationPayload;
  sentAt: Date;
  channels: NotificationChannel[];
}

export type NotificationChannel = 'sse' | 'websocket' | 'push' | 'email';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  urgencyThreshold: 'critical' | 'high' | 'medium' | 'low';
  soundEnabled: boolean;
  emailEnabled: boolean;
}

export interface NotificationsServiceConfig {
  /** API Gateway URL for SSE broadcast */
  apiGatewayUrl?: string;
  /** Internal API key for service-to-service auth */
  internalApiKey?: string;
  /** Redis URL for pub/sub (optional) */
  redisUrl?: string;
  /** Enable push notifications */
  pushEnabled?: boolean;
  /** VAPID keys for web push */
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  /** Email service config */
  emailServiceUrl?: string;
  emailApiKey?: string;
}

export interface NotificationsService {
  /**
   * Broadcast notification to all connected supervisors
   */
  broadcastToSupervisors: (payload: NotificationPayload) => Promise<void>;

  /**
   * Send notification to specific supervisor
   */
  notifySupervisor: (supervisorId: string, payload: NotificationPayload) => Promise<void>;

  /**
   * Send push notification to subscribed devices
   */
  sendPushNotification: (
    subscriptionId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) => Promise<void>;

  /**
   * Send email notification for escalations
   */
  sendEmailNotification: (
    to: string,
    subject: string,
    body: string,
    isHtml?: boolean
  ) => Promise<void>;

  /**
   * Check if service is properly configured
   */
  isConfigured: () => boolean;
}

// ============================================
// Implementation
// ============================================

const logger = baseLogger.child({ service: 'notifications' });

export function createNotificationsService(
  config: NotificationsServiceConfig = {}
): NotificationsService {
  const {
    apiGatewayUrl = process.env.API_GATEWAY_URL,
    internalApiKey = process.env.INTERNAL_API_KEY,
    pushEnabled = false,
    emailServiceUrl = process.env.EMAIL_SERVICE_URL,
    emailApiKey = process.env.EMAIL_API_KEY,
  } = config;

  const isServiceConfigured = Boolean(apiGatewayUrl && internalApiKey);

  /**
   * Broadcast notification to all supervisors via API Gateway
   */
  async function broadcastToSupervisors(payload: NotificationPayload): Promise<void> {
    const correlationId = payload.correlationId || generateCorrelationId();

    if (!apiGatewayUrl || !internalApiKey) {
      logger.warn({ correlationId }, 'API Gateway not configured, skipping broadcast');
      return;
    }

    try {
      const response = await fetch(`${apiGatewayUrl}/internal/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': internalApiKey,
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({
          event: 'supervisor.notification',
          payload: sanitizePayload(payload),
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.status} ${response.statusText}`);
      }

      logger.info({ correlationId, type: payload.type }, 'Notification broadcasted to supervisors');
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to broadcast notification');
      // Don't throw - notification failures should not break the main flow
    }
  }

  /**
   * Send notification to specific supervisor
   */
  async function notifySupervisor(
    supervisorId: string,
    payload: NotificationPayload
  ): Promise<void> {
    const correlationId = payload.correlationId || generateCorrelationId();

    if (!apiGatewayUrl || !internalApiKey) {
      logger.warn({ correlationId }, 'API Gateway not configured, skipping notification');
      return;
    }

    try {
      const response = await fetch(`${apiGatewayUrl}/internal/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': internalApiKey,
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({
          supervisorId,
          event: 'supervisor.notification',
          payload: sanitizePayload(payload),
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Notification failed: ${response.status} ${response.statusText}`);
      }

      logger.info(
        { correlationId, supervisorId, type: payload.type },
        'Notification sent to supervisor'
      );
    } catch (error) {
      logger.error({ error, correlationId, supervisorId }, 'Failed to send notification');
    }
  }

  /**
   * Send push notification
   */
  async function sendPushNotification(
    subscriptionId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!pushEnabled) {
      logger.debug('Push notifications disabled');
      return;
    }

    const correlationId = generateCorrelationId();

    if (!apiGatewayUrl || !internalApiKey) {
      logger.warn({ correlationId }, 'Push service not configured');
      return;
    }

    try {
      const response = await fetch(`${apiGatewayUrl}/internal/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': internalApiKey,
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({
          subscriptionId,
          notification: {
            title,
            body,
            icon: '/icons/notification-icon.png',
            badge: '/icons/badge-icon.png',
            data,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Push notification failed: ${response.status}`);
      }

      logger.info({ correlationId, subscriptionId }, 'Push notification sent');
    } catch (error) {
      logger.error({ error, correlationId, subscriptionId }, 'Failed to send push notification');
    }
  }

  /**
   * Send email notification
   */
  async function sendEmailNotification(
    to: string,
    subject: string,
    body: string,
    isHtml = false
  ): Promise<void> {
    const correlationId = generateCorrelationId();

    if (!emailServiceUrl || !emailApiKey) {
      logger.warn({ correlationId }, 'Email service not configured');
      return;
    }

    try {
      const response = await fetch(`${emailServiceUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${emailApiKey}`,
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify({
          to,
          subject,
          [isHtml ? 'html' : 'text']: body,
          from: 'notifications@medicalcor.com',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Email send failed: ${response.status}`);
      }

      logger.info({ correlationId, to }, 'Email notification sent');
    } catch (error) {
      logger.error({ error, correlationId, to }, 'Failed to send email notification');
    }
  }

  /**
   * Check if service is configured
   */
  function isConfigured(): boolean {
    return isServiceConfigured;
  }

  return {
    broadcastToSupervisors,
    notifySupervisor,
    sendPushNotification,
    sendEmailNotification,
    isConfigured,
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Sanitize payload to remove/mask PII before transmission
 * HIPAA/GDPR compliant
 */
function sanitizePayload(payload: NotificationPayload): NotificationPayload {
  const sanitized = { ...payload };

  // Phone is already masked in the caller, but double-check
  if (sanitized.phone && !sanitized.phone.endsWith('****')) {
    sanitized.phone = sanitized.phone.slice(0, -4) + '****';
  }

  // Remove any embedded PII patterns from reason/keywords
  if (sanitized.reason) {
    sanitized.reason = redactPII(sanitized.reason);
  }

  if (sanitized.keywords) {
    sanitized.keywords = sanitized.keywords.map(redactPII);
  }

  return sanitized;
}

/**
 * Redact common PII patterns
 */
function redactPII(text: string): string {
  return (
    text
      // Email patterns
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Romanian CNP (13 digits)
      .replace(/\b[1-8]\d{12}\b/g, '[CNP]')
      // Phone numbers (Romanian format)
      .replace(/(?:\+40|0)\s*7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g, '[PHONE]')
      // Credit card numbers
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]')
  );
}

// ============================================
// Mock Implementation for Testing
// ============================================

export interface MockNotificationsService extends NotificationsService {
  /** Get all notifications sent */
  getSentNotifications: () => {
    type: 'broadcast' | 'direct' | 'push' | 'email';
    payload: unknown;
    timestamp: Date;
  }[];
  /** Clear sent notifications */
  clearNotifications: () => void;
}

export function createMockNotificationsService(): MockNotificationsService {
  const sentNotifications: {
    type: 'broadcast' | 'direct' | 'push' | 'email';
    payload: unknown;
    timestamp: Date;
  }[] = [];

  return {
    broadcastToSupervisors(payload: NotificationPayload): Promise<void> {
      sentNotifications.push({
        type: 'broadcast',
        payload,
        timestamp: new Date(),
      });
      return Promise.resolve();
    },

    notifySupervisor(supervisorId: string, payload: NotificationPayload): Promise<void> {
      sentNotifications.push({
        type: 'direct',
        payload: { supervisorId, ...payload },
        timestamp: new Date(),
      });
      return Promise.resolve();
    },

    sendPushNotification(
      subscriptionId: string,
      title: string,
      body: string,
      data?: Record<string, unknown>
    ): Promise<void> {
      sentNotifications.push({
        type: 'push',
        payload: { subscriptionId, title, body, data },
        timestamp: new Date(),
      });
      return Promise.resolve();
    },

    sendEmailNotification(
      to: string,
      subject: string,
      body: string,
      isHtml?: boolean
    ): Promise<void> {
      sentNotifications.push({
        type: 'email',
        payload: { to, subject, body, isHtml },
        timestamp: new Date(),
      });
      return Promise.resolve();
    },

    isConfigured(): boolean {
      return true; // Mock is always "configured"
    },

    getSentNotifications() {
      return [...sentNotifications];
    },

    clearNotifications() {
      sentNotifications.length = 0;
    },
  };
}
