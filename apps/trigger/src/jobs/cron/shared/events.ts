/**
 * Event emission utilities for cron jobs
 */

import { logger } from '@trigger.dev/sdk/v3';
import type { EventStoreEmitter } from './types.js';
import { generateCorrelationId } from './date-helpers.js';

/**
 * Emit job completion event
 */
export async function emitJobEvent(
  eventStore: EventStoreEmitter,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || generateCorrelationId();
  try {
    await eventStore.emit({
      type,
      correlationId,
      payload,
      aggregateType: 'cron',
    });
  } catch (error) {
    logger.warn('Failed to emit job event', { type, error });
  }
}
