import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';
import { createHash } from 'crypto';

/**
 * Notification Dispatcher Task
 * Multi-channel notification dispatch for real-time alerts
 *
 * Channels:
 * - SSE broadcast to supervisor dashboard
 * - WhatsApp template messages to patients
 * - Email for escalations and summaries
 * - Push notifications for mobile supervisors
 * - SMS for urgent patient notifications
 *
 * Features:
 * - Channel preference validation
 * - Retry logic per channel
 * - Delivery tracking
 * - GDPR-compliant PII masking
 * - Notification deduplication to prevent spam
 */

// ============================================
// Notification Deduplication
// ============================================

/**
 * In-memory LRU cache for notification deduplication
 * Prevents spam by tracking recently sent notifications
 */
class NotificationDeduplicator {
  private cache: Map<string, { sentAt: number; count: number }>;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly maxPerWindow: number;

  constructor(options?: { maxSize?: number; ttlMs?: number; maxPerWindow?: number }) {
    this.maxSize = options?.maxSize ?? 1000;
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
    this.maxPerWindow = options?.maxPerWindow ?? 3; // Max 3 same notifications per window
    this.cache = new Map();
  }

  /**
   * Generate a unique key for a notification
   */
  private generateKey(
    type: string,
    recipientPhone: string | undefined,
    recipientEmail: string | undefined,
    contentHash: string
  ): string {
    const recipient = recipientPhone ?? recipientEmail ?? 'broadcast';
    return `${type}:${recipient}:${contentHash}`;
  }

  /**
   * Generate content hash for deduplication
   */
  private hashContent(content: { title: string; body: string }): string {
    const hash = createHash('sha256');
    hash.update(`${content.title}:${content.body}`);
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Check if notification should be sent or deduplicated
   * Returns true if notification should be sent, false if it's a duplicate
   */
  shouldSend(
    type: string,
    recipientPhone: string | undefined,
    recipientEmail: string | undefined,
    content: { title: string; body: string }
  ): { allowed: boolean; reason?: string } {
    const contentHash = this.hashContent(content);
    const key = this.generateKey(type, recipientPhone, recipientEmail, contentHash);
    const now = Date.now();

    // Clean expired entries
    this.cleanup(now);

    const existing = this.cache.get(key);

    if (existing) {
      // Check if within TTL window
      if (now - existing.sentAt < this.ttlMs) {
        if (existing.count >= this.maxPerWindow) {
          return {
            allowed: false,
            reason: `Notification deduplicated: ${existing.count} similar notifications sent in last ${Math.round(this.ttlMs / 60000)} minutes`,
          };
        }
        // Increment count
        existing.count++;
        existing.sentAt = now;
        return { allowed: true };
      }
    }

    // New notification or expired
    this.cache.set(key, { sentAt: now, count: 1 });

    // Evict oldest if over max size
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    return { allowed: true };
  }

  /**
   * Record that a notification was sent (for external tracking)
   */
  recordSent(
    type: string,
    recipientPhone: string | undefined,
    recipientEmail: string | undefined,
    content: { title: string; body: string }
  ): void {
    const contentHash = this.hashContent(content);
    const key = this.generateKey(type, recipientPhone, recipientEmail, contentHash);
    const now = Date.now();

    const existing = this.cache.get(key);
    if (existing) {
      existing.count++;
      existing.sentAt = now;
    } else {
      this.cache.set(key, { sentAt: now, count: 1 });
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(now: number): void {
    for (const [key, value] of this.cache.entries()) {
      if (now - value.sentAt > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get current cache stats
   */
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton deduplicator instance
const notificationDeduplicator = new NotificationDeduplicator({
  maxSize: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  maxPerWindow: 3, // Max 3 same notifications per 5 minutes
});

// Initialize clients
function getClients() {
  return createIntegrationClients({
    source: 'notification-dispatcher',
    includeNotifications: true,
  });
}

// ============================================
// Schema Definitions
// ============================================

export const NotificationPriority = z.enum(['critical', 'high', 'medium', 'low']);
export type NotificationPriority = z.infer<typeof NotificationPriority>;

export const NotificationChannel = z.enum(['sse', 'whatsapp', 'email', 'push', 'sms']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const NotificationTypeSchema = z.enum([
  // Urgency notifications
  'urgency.new',
  'urgency.escalated',
  'urgency.resolved',
  'urgency.critical_unresolved',
  // Lead notifications
  'lead.hot',
  'lead.qualified',
  'lead.assigned',
  // Appointment notifications
  'appointment.created',
  'appointment.reminder',
  'appointment.cancelled',
  'appointment.rescheduled',
  // System notifications
  'system.alert',
  'system.maintenance',
  // Patient notifications
  'patient.welcome',
  'patient.followup',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationDispatchPayloadSchema = z.object({
  type: NotificationTypeSchema,
  priority: NotificationPriority,
  channels: z.array(NotificationChannel),
  recipients: z.object({
    supervisorIds: z.array(z.string()).optional(),
    patientPhone: z.string().optional(),
    patientEmail: z.string().optional(),
    pushSubscriptionIds: z.array(z.string()).optional(),
  }),
  content: z.object({
    title: z.string(),
    body: z.string(),
    shortBody: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    triggeredBy: z.string().optional(),
    sourceEvent: z.string().optional(),
    patientName: z.string().optional(),
    hubspotContactId: z.string().optional(),
  }),
  options: z
    .object({
      // SSE options
      broadcastToAll: z.boolean().optional(),
      // WhatsApp options
      templateName: z.string().optional(),
      templateLanguage: z.enum(['ro', 'en', 'de']).optional(),
      // Email options
      isHtml: z.boolean().optional(),
      // Push options
      requireInteraction: z.boolean().optional(),
      sound: z.boolean().optional(),
      // SMS options
      smsProvider: z.enum(['twilio', 'vonage', 'infobip']).optional(),
      smsFrom: z.string().optional(),
      // Deduplication options
      skipDeduplication: z.boolean().optional(),
    })
    .optional(),
});

export type NotificationDispatchPayload = z.infer<typeof NotificationDispatchPayloadSchema>;

export interface DispatchResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: string;
}

// ============================================
// Main Dispatcher Task
// ============================================

export const dispatchNotification = task({
  id: 'notification-dispatcher',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: NotificationDispatchPayload) => {
    const { type, priority, channels, recipients, content, metadata, options = {} } = payload;
    const { correlationId } = metadata;
    const { notifications, whatsapp, eventStore } = getClients();

    // Deduplication check - prevent spam
    if (!options.skipDeduplication) {
      const dedupeCheck = notificationDeduplicator.shouldSend(
        type,
        recipients.patientPhone,
        recipients.patientEmail,
        content
      );

      if (!dedupeCheck.allowed) {
        logger.warn('Notification deduplicated to prevent spam', {
          type,
          reason: dedupeCheck.reason,
          correlationId,
        });

        return {
          results: [
            {
              channel: 'deduplication',
              success: false,
              error: dedupeCheck.reason,
            },
          ],
          allSucceeded: false,
          someSucceeded: false,
          deduplicated: true,
          correlationId,
        };
      }
    }

    logger.info('Dispatching notification', {
      type,
      priority,
      channels,
      correlationId,
    });

    const results: DispatchResult[] = [];

    // Dispatch to each channel in parallel
    const channelPromises = channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'sse':
            return await dispatchSSE(notifications, {
              type,
              priority,
              content,
              metadata,
              options,
              recipients,
            });

          case 'whatsapp':
            return await dispatchWhatsApp(whatsapp, {
              type,
              priority,
              content,
              metadata,
              options,
              recipients,
            });

          case 'email':
            return await dispatchEmail(notifications, {
              type,
              priority,
              content,
              metadata,
              options,
              recipients,
            });

          case 'push':
            return await dispatchPush(notifications, {
              type,
              priority,
              content,
              metadata,
              options,
              recipients,
            });

          case 'sms':
            return await dispatchSMS(whatsapp, {
              type,
              priority,
              content,
              metadata,
              options,
              recipients,
            });

          default:
            // This should never happen as all channels are handled above
            return {
              channel,
              success: false,
              error: `Unknown channel: ${channel as string}`,
            } satisfies DispatchResult;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Channel dispatch failed', {
          channel,
          error: errorMessage,
          correlationId,
        });
        return {
          channel,
          success: false,
          error: errorMessage,
        } satisfies DispatchResult;
      }
    });

    const channelResults = await Promise.all(channelPromises);
    results.push(...channelResults);

    // Log results
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    logger.info('Notification dispatch completed', {
      type,
      totalChannels: channels.length,
      successCount,
      failCount,
      correlationId,
    });

    // Emit delivery event for tracking
    try {
      await eventStore.emit({
        type: 'notification.dispatched',
        correlationId,
        aggregateId: metadata.hubspotContactId ?? correlationId,
        aggregateType: 'notification',
        payload: {
          notificationType: type,
          priority,
          channels,
          results,
          successCount,
          failCount,
        },
      });
    } catch (err) {
      logger.error('Failed to emit notification event', { err, correlationId });
    }

    return {
      success: failCount === 0,
      partialSuccess: successCount > 0 && failCount > 0,
      results,
      correlationId,
    };
  },
});

// ============================================
// Channel-Specific Dispatch Functions
// ============================================

interface DispatchContext {
  type: NotificationType;
  priority: NotificationPriority;
  content: NotificationDispatchPayload['content'];
  metadata: NotificationDispatchPayload['metadata'];
  options: NonNullable<NotificationDispatchPayload['options']>;
  recipients: NotificationDispatchPayload['recipients'];
}

/**
 * Dispatch via SSE to supervisor dashboard
 */
async function dispatchSSE(
  notifications: ReturnType<typeof getClients>['notifications'],
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { type, priority, content, metadata, options, recipients } = ctx;

  if (!notifications) {
    return {
      channel: 'sse',
      success: false,
      error: 'Notifications service not configured',
    };
  }

  const payload = {
    type: type as 'urgency.new',
    priority,
    phone: undefined,
    patientName: metadata.patientName,
    reason: content.body,
    timestamp: new Date().toISOString(),
    correlationId: metadata.correlationId,
    title: content.title,
    data: content.data,
  };

  if (options.broadcastToAll || !recipients.supervisorIds?.length) {
    await notifications.broadcastToSupervisors(payload);
  } else {
    // Send to specific supervisors
    for (const supervisorId of recipients.supervisorIds ?? []) {
      await notifications.notifySupervisor(supervisorId, payload);
    }
  }

  return {
    channel: 'sse',
    success: true,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Dispatch via WhatsApp
 */
async function dispatchWhatsApp(
  whatsapp: ReturnType<typeof getClients>['whatsapp'],
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { content, metadata, options, recipients } = ctx;

  if (!whatsapp) {
    return {
      channel: 'whatsapp',
      success: false,
      error: 'WhatsApp client not configured',
    };
  }

  if (!recipients.patientPhone) {
    return {
      channel: 'whatsapp',
      success: false,
      error: 'No patient phone number provided',
    };
  }

  let messageId: string | undefined;

  if (options.templateName) {
    // Send template message
    const result = await whatsapp.sendTemplate({
      to: recipients.patientPhone,
      templateName: options.templateName,
      language: options.templateLanguage ?? 'ro',
    });
    messageId = result.messages[0]?.id;
  } else {
    // Send text message
    const messageText = content.shortBody ?? content.body;
    const result = await whatsapp.sendText({
      to: recipients.patientPhone,
      text: messageText,
    });
    messageId = result.messages[0]?.id;
  }

  logger.info('WhatsApp notification sent', {
    messageId,
    correlationId: metadata.correlationId,
  });

  return {
    channel: 'whatsapp',
    success: true,
    messageId,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Dispatch via Email
 */
async function dispatchEmail(
  notifications: ReturnType<typeof getClients>['notifications'],
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { content, options, recipients } = ctx;

  if (!notifications) {
    return {
      channel: 'email',
      success: false,
      error: 'Notifications service not configured',
    };
  }

  if (!recipients.patientEmail) {
    return {
      channel: 'email',
      success: false,
      error: 'No email address provided',
    };
  }

  await notifications.sendEmailNotification(
    recipients.patientEmail,
    content.title,
    content.body,
    options.isHtml ?? false
  );

  return {
    channel: 'email',
    success: true,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Dispatch via Push Notification
 */
async function dispatchPush(
  notifications: ReturnType<typeof getClients>['notifications'],
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { content, recipients } = ctx;

  if (!notifications) {
    return {
      channel: 'push',
      success: false,
      error: 'Notifications service not configured',
    };
  }

  if (!recipients.pushSubscriptionIds?.length) {
    return {
      channel: 'push',
      success: false,
      error: 'No push subscription IDs provided',
    };
  }

  // Send to all subscriptions
  for (const subscriptionId of recipients.pushSubscriptionIds) {
    await notifications.sendPushNotification(
      subscriptionId,
      content.title,
      content.shortBody ?? content.body,
      content.data
    );
  }

  return {
    channel: 'push',
    success: true,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Dispatch via SMS (Twilio/Vonage/Infobip)
 * Uses environment-configured SMS provider
 */
async function dispatchSMS(
  _whatsapp: ReturnType<typeof getClients>['whatsapp'],
  ctx: DispatchContext
): Promise<DispatchResult> {
  const { content, metadata, options, recipients } = ctx;

  if (!recipients.patientPhone) {
    return {
      channel: 'sms',
      success: false,
      error: 'No patient phone number provided',
    };
  }

  // Check for SMS provider configuration
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFromNumber = options.smsFrom ?? process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuthToken || !twilioFromNumber) {
    return {
      channel: 'sms',
      success: false,
      error: 'SMS provider (Twilio) not configured',
    };
  }

  try {
    // Use Twilio API directly for SMS
    const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
    const messageBody = content.shortBody ?? content.body;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: recipients.patientPhone,
          From: twilioFromNumber,
          Body: messageBody,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Twilio SMS failed: ${response.status} - ${errorData}`);
    }

    const result = (await response.json()) as { sid?: string };

    logger.info('SMS notification sent via Twilio', {
      messageSid: result.sid,
      correlationId: metadata.correlationId,
    });

    return {
      channel: 'sms',
      success: true,
      messageId: result.sid,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
    logger.error('Failed to send SMS notification', {
      error: errorMessage,
      correlationId: metadata.correlationId,
    });
    return {
      channel: 'sms',
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Convenience Wrapper Tasks
// ============================================

/**
 * Send Urgent Case Alert
 * Pre-configured for urgent case notifications
 */
export const UrgentAlertPayloadSchema = z.object({
  phone: z.string(),
  patientName: z.string().optional(),
  urgencyLevel: z.enum(['critical', 'high', 'medium']),
  reason: z.string(),
  hubspotContactId: z.string().optional(),
  correlationId: z.string(),
});

export type UrgentAlertPayload = z.infer<typeof UrgentAlertPayloadSchema>;

export const sendUrgentAlert = task({
  id: 'send-urgent-alert',
  run: async (payload: UrgentAlertPayload) => {
    const { phone, patientName, urgencyLevel, reason, hubspotContactId, correlationId } = payload;

    const priorityEmoji = {
      critical: '🚨',
      high: '⚠️',
      medium: '📢',
    };

    return dispatchNotification.triggerAndWait({
      type: 'urgency.new',
      priority: urgencyLevel,
      channels: ['sse', 'push'],
      recipients: {
        supervisorIds: [], // Broadcast to all
      },
      content: {
        title: `${priorityEmoji[urgencyLevel]} Urgent: ${patientName ?? 'Patient'}`,
        body: reason,
        shortBody: `${urgencyLevel.toUpperCase()}: ${reason.slice(0, 100)}`,
        data: {
          phone: phone.slice(0, -4) + '****',
          urgencyLevel,
        },
      },
      metadata: {
        correlationId,
        patientName,
        hubspotContactId,
        sourceEvent: 'urgent-case-handler',
      },
      options: {
        broadcastToAll: true,
        requireInteraction: urgencyLevel === 'critical',
        sound: urgencyLevel !== 'medium',
      },
    });
  },
});

/**
 * Send Appointment Reminder
 * Pre-configured for appointment reminder notifications
 */
export const AppointmentReminderPayloadSchema = z.object({
  patientPhone: z.string(),
  patientName: z.string(),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
  procedureType: z.string(),
  location: z.string().optional(),
  correlationId: z.string(),
});

export type AppointmentReminderPayload = z.infer<typeof AppointmentReminderPayloadSchema>;

export const sendAppointmentReminder = task({
  id: 'send-appointment-reminder',
  run: async (payload: AppointmentReminderPayload) => {
    const {
      patientPhone,
      patientName,
      appointmentDate,
      appointmentTime,
      procedureType,
      location,
      correlationId,
    } = payload;

    const body = `Bună ziua ${patientName}! Vă reamintim că aveți programare pentru ${procedureType} pe ${appointmentDate} la ora ${appointmentTime}${location ? ` la ${location}` : ''}. Vă așteptăm!`;

    return dispatchNotification.triggerAndWait({
      type: 'appointment.reminder',
      priority: 'medium',
      channels: ['whatsapp'],
      recipients: {
        patientPhone,
      },
      content: {
        title: 'Reminder Programare',
        body,
        shortBody: `Programare ${procedureType} - ${appointmentDate} ${appointmentTime}`,
      },
      metadata: {
        correlationId,
        patientName,
      },
      options: {
        templateName: 'appointment_reminder',
        templateLanguage: 'ro',
      },
    });
  },
});
