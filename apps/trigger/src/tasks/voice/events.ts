/**
 * Domain events for voice handler
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { logger } from '@trigger.dev/sdk/v3';
import type { EventStoreClient, VoiceEventPayload } from './types.js';

/**
 * Emit voice call initiated or completed event
 */
export async function emitVoiceCallEvent(
  eventStore: EventStoreClient,
  eventType: 'voice.call.initiated' | 'voice.call.completed',
  correlationId: string,
  aggregateId: string,
  payload: VoiceEventPayload
): Promise<void> {
  try {
    await eventStore.emit({
      type: eventType,
      correlationId,
      aggregateId,
      aggregateType: 'lead',
      payload,
    });
    logger.info('Domain event emitted', { type: eventType, correlationId });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}

/**
 * Emit voice call processed event (after completion handling)
 */
export async function emitVoiceProcessedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  aggregateId: string,
  payload: VoiceEventPayload
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'voice.call.processed',
      correlationId,
      aggregateId,
      aggregateType: 'lead',
      payload,
    });
    logger.info('Domain event emitted', { type: 'voice.call.processed', correlationId });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}
