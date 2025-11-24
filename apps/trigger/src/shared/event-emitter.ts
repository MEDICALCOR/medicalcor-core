import { logger } from '@trigger.dev/sdk/v3';
import { generateCorrelationId } from './date-helpers';

/**
 * Event store interface for emitting domain events
 */
export interface EventStore {
  emit: (input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateType?: string;
  }) => Promise<unknown>;
}

/**
 * Emit job completion event to the event store
 *
 * @param eventStore - Event store instance
 * @param type - Event type (e.g., 'cron.daily_recall_check.completed')
 * @param payload - Event payload data
 */
export async function emitJobEvent(
  eventStore: EventStore,
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
