/**
 * Idempotency Key Management for Trigger.dev Tasks
 *
 * Provides utilities for generating deterministic idempotency keys
 * to prevent duplicate task executions.
 */

import crypto from 'crypto';

/**
 * Generate an idempotency key from components
 *
 * Creates a deterministic key by hashing the input components.
 * Same inputs will always produce the same key.
 *
 * @param components - String components to include in the key
 * @returns SHA-256 hash of the components
 */
export function createIdempotencyKey(...components: (string | number | undefined | null)[]): string {
  const filtered = components
    .filter((c): c is string | number => c !== undefined && c !== null)
    .map((c) => String(c));

  if (filtered.length === 0) {
    throw new Error('At least one non-null component is required for idempotency key');
  }

  const input = filtered.join(':');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/**
 * Generate an idempotency key with a namespace prefix
 *
 * Useful for separating keys across different task types.
 *
 * @param namespace - Namespace prefix (e.g., 'whatsapp', 'payment')
 * @param components - String components to include in the key
 * @returns Namespaced idempotency key
 */
export function createNamespacedIdempotencyKey(
  namespace: string,
  ...components: (string | number | undefined | null)[]
): string {
  return `${namespace}:${createIdempotencyKey(...components)}`;
}

/**
 * Idempotency key generators for common task types
 */
export const IdempotencyKeys = {
  /**
   * Generate key for WhatsApp message handling
   * Ensures same message is only processed once
   */
  whatsAppMessage: (messageId: string): string => {
    return createNamespacedIdempotencyKey('wa-msg', messageId);
  },

  /**
   * Generate key for WhatsApp status updates
   */
  whatsAppStatus: (messageId: string, status: string): string => {
    return createNamespacedIdempotencyKey('wa-status', messageId, status);
  },

  /**
   * Generate key for voice call handling
   */
  voiceCall: (callSid: string): string => {
    return createNamespacedIdempotencyKey('voice-call', callSid);
  },

  /**
   * Generate key for voice call completion
   */
  voiceCallCompleted: (callSid: string): string => {
    return createNamespacedIdempotencyKey('voice-completed', callSid);
  },

  /**
   * Generate key for payment processing
   */
  paymentSucceeded: (paymentId: string): string => {
    return createNamespacedIdempotencyKey('payment-success', paymentId);
  },

  /**
   * Generate key for failed payment handling
   */
  paymentFailed: (paymentId: string): string => {
    return createNamespacedIdempotencyKey('payment-failed', paymentId);
  },

  /**
   * Generate key for refund processing
   */
  refund: (refundId: string): string => {
    return createNamespacedIdempotencyKey('refund', refundId);
  },

  /**
   * Generate key for lead scoring workflow
   */
  leadScoring: (phone: string, channel: string, messageHash: string): string => {
    return createNamespacedIdempotencyKey('lead-score', phone, channel, messageHash);
  },

  /**
   * Generate key for patient journey workflow
   */
  patientJourney: (contactId: string, stage: string): string => {
    return createNamespacedIdempotencyKey('patient-journey', contactId, stage);
  },

  /**
   * Generate key for nurture sequence workflow
   */
  nurtureSequence: (contactId: string, sequenceId: string): string => {
    return createNamespacedIdempotencyKey('nurture', contactId, sequenceId);
  },

  /**
   * Generate key for booking workflow
   */
  bookingAgent: (contactId: string, appointmentId: string): string => {
    return createNamespacedIdempotencyKey('booking', contactId, appointmentId);
  },

  /**
   * Generate key for appointment reminder
   */
  appointmentReminder: (contactId: string, appointmentId: string, reminderType: string): string => {
    return createNamespacedIdempotencyKey('reminder', contactId, appointmentId, reminderType);
  },

  /**
   * Generate key for recall check
   */
  recallCheck: (contactId: string, date: string): string => {
    return createNamespacedIdempotencyKey('recall', contactId, date);
  },

  /**
   * Generate key for cron job run
   * Includes date to allow same job to run on different days
   */
  cronJob: (jobName: string, date: string): string => {
    return createNamespacedIdempotencyKey('cron', jobName, date);
  },

  /**
   * Generate key for cron job batch item
   */
  cronJobItem: (jobName: string, date: string, itemId: string): string => {
    return createNamespacedIdempotencyKey('cron-item', jobName, date, itemId);
  },

  /**
   * Generate key for voice transcription
   */
  voiceTranscription: (callSid: string): string => {
    return createNamespacedIdempotencyKey('transcription', callSid);
  },

  /**
   * Generate key for GDPR consent audit item
   */
  consentAudit: (contactId: string, date: string): string => {
    return createNamespacedIdempotencyKey('consent-audit', contactId, date);
  },

  /**
   * Generate key for stale lead cleanup item
   */
  staleLeadCleanup: (contactId: string, date: string): string => {
    return createNamespacedIdempotencyKey('stale-cleanup', contactId, date);
  },

  /**
   * Generate key for webhook event
   * Generic handler for webhook-triggered tasks
   */
  webhook: (source: string, eventId: string): string => {
    return createNamespacedIdempotencyKey('webhook', source, eventId);
  },

  /**
   * Generate key for Vapi webhook processing
   * Ensures same call is only processed once
   */
  vapiWebhook: (callId: string): string => {
    return createNamespacedIdempotencyKey('vapi-webhook', callId);
  },

  /**
   * Generate key for urgent case escalation
   * Prevents duplicate escalation for same case
   */
  urgentCase: (phone: string, correlationId: string): string => {
    return createNamespacedIdempotencyKey('urgent-case', phone, correlationId);
  },

  /**
   * Generate key for notification dispatch
   * Prevents duplicate notifications
   */
  notification: (type: string, recipientId: string, correlationId: string): string => {
    return createNamespacedIdempotencyKey('notification', type, recipientId, correlationId);
  },

  /**
   * Custom key generator for edge cases
   */
  custom: (prefix: string, ...parts: string[]): string => {
    return createNamespacedIdempotencyKey(prefix, ...parts);
  },
};

/**
 * Hash a message content for use in idempotency keys
 * Useful when the message content is part of deduplication
 */
export function hashMessageContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Get today's date string for idempotency keys (YYYY-MM-DD format)
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

/**
 * Get current hour string for hourly jobs (YYYY-MM-DD-HH format)
 */
export function getCurrentHourString(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const hour = now.getUTCHours().toString().padStart(2, '0');
  return `${date}-${hour}`;
}
