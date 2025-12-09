/**
 * Domain events for payment handler
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { logger } from '@trigger.dev/sdk/v3';
import type { EventStoreClient, PaymentEventPayload, RefundEventPayload } from './types.js';

/**
 * Emit payment received event
 */
export async function emitPaymentReceivedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  aggregateId: string,
  payload: PaymentEventPayload
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'payment.received',
      correlationId,
      aggregateId,
      aggregateType: 'payment',
      payload,
    });
    logger.info('Domain event emitted', { type: 'payment.received', correlationId });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}

/**
 * Emit payment failed event
 */
export async function emitPaymentFailedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  aggregateId: string,
  payload: PaymentEventPayload
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'payment.failed',
      correlationId,
      aggregateId,
      aggregateType: 'payment',
      payload,
    });
    logger.info('Domain event emitted', { type: 'payment.failed', correlationId });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}

/**
 * Emit payment refunded event
 */
export async function emitPaymentRefundedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  aggregateId: string,
  payload: RefundEventPayload
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'payment.refunded',
      correlationId,
      aggregateId,
      aggregateType: 'payment',
      payload,
    });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}
