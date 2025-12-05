import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Notification Dispatcher Task
 * Multi-channel notification dispatch for real-time alerts
 *
 * Channels:
 * - SSE broadcast to supervisor dashboard
 * - WhatsApp template messages to patients
 * - Email for escalations and summaries
 * - Push notifications for mobile supervisors
 *
 * Features:
 * - Channel preference validation
 * - Retry logic per channel
 * - Delivery tracking
 * - GDPR-compliant PII masking
 */

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

export const NotificationChannel = z.enum(['sse', 'whatsapp', 'email', 'push']);
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

          default:
            return {
              channel,
              success: false,
              error: `Unknown channel: ${channel}`,
            };
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
        };
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
    messageId = result.messageId;
  } else {
    // Send text message
    const messageText = content.shortBody ?? content.body;
    const result = await whatsapp.sendText({
      to: recipients.patientPhone,
      text: messageText,
    });
    messageId = result.messageId;
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
  const { content, metadata, options, recipients } = ctx;

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
  const { content, metadata, recipients } = ctx;

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
