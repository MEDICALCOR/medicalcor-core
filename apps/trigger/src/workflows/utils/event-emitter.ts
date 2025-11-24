import crypto from 'crypto';

/**
 * Event Emitter - Utility for emitting domain events from workflows
 */

/**
 * Event store interface for emitting domain events
 */
export interface WorkflowEventStore {
  emit: (input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  }) => Promise<unknown>;
}

/**
 * Helper to emit domain events from workflows
 *
 * @param eventStore - Event store instance
 * @param type - Event type (e.g., 'lead.engaged', 'appointment.scheduled')
 * @param aggregateId - ID of the aggregate (e.g., contact ID, appointment ID)
 * @param payload - Event payload data (should include correlationId)
 */
export async function emitEvent(
  eventStore: WorkflowEventStore,
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || crypto.randomUUID();
  const aggregateType = type.split('.')[0];
  const input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  } = {
    type,
    correlationId,
    payload,
    aggregateId,
  };
  if (aggregateType) {
    input.aggregateType = aggregateType;
  }
  await eventStore.emit(input);
}
