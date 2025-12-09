/**
 * Event emission for WhatsApp handler
 *
 * Uses loosely typed event store interface to avoid tight coupling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { logger } from '@trigger.dev/sdk/v3';
import type { ScoreResult } from './types.js';

/**
 * Event store client type (loosely typed to avoid coupling)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventStoreClient = any;

/**
 * Emit domain event for received WhatsApp message
 */
export async function emitMessageReceivedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    messageId: string;
    normalizedPhone: string;
    phoneNumberId: string;
    messageType: string;
    contactName: string | undefined;
    scoreResult: ScoreResult;
    hubspotContactId: string | undefined;
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'whatsapp.message.received',
      correlationId,
      aggregateId: payload.normalizedPhone,
      aggregateType: 'lead',
      payload: {
        messageId: payload.messageId,
        from: payload.normalizedPhone,
        phoneNumberId: payload.phoneNumberId,
        messageType: payload.messageType,
        contactName: payload.contactName,
        score: payload.scoreResult.score,
        classification: payload.scoreResult.classification,
        hubspotContactId: payload.hubspotContactId,
      },
    });
    logger.info('Domain event emitted', { type: 'whatsapp.message.received', correlationId });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}

/**
 * Emit domain event for WhatsApp status update
 */
export async function emitStatusUpdatedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    messageId: string;
    status: string;
    recipientId: string;
    timestamp: string;
    errors?: { code: number; title: string }[];
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'whatsapp.status.updated',
      correlationId,
      aggregateId: payload.recipientId,
      aggregateType: 'message',
      payload: {
        messageId: payload.messageId,
        status: payload.status,
        recipientId: payload.recipientId,
        timestamp: payload.timestamp,
        errors: payload.errors,
      },
    });
  } catch (err) {
    logger.error('Failed to emit status event', { err, correlationId });
  }
}
