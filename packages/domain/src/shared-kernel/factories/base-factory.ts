/**
 * @fileoverview Base Factory for Domain Aggregates
 *
 * Provides common factory patterns for creating and reconstituting aggregates.
 * Used by LeadFactory and PatientFactory to reduce duplication.
 *
 * @module domain/shared-kernel/factories/base-factory
 */

/**
 * Base interface for aggregate snapshots
 */
export interface BaseAggregateSnapshot<TState> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: TState;
  readonly createdAt: string;
}

/**
 * Base interface for domain events
 */
export interface BaseDomainEvent {
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

/**
 * Abstract base factory for domain aggregates
 *
 * @typeParam TAggregate - The aggregate root type
 * @typeParam TState - The aggregate state type
 * @typeParam TEvent - The domain event type
 * @typeParam TSnapshot - The snapshot type
 * @typeParam TSnapshotState - The serialized snapshot state type
 */
export abstract class BaseAggregateFactory<
  TAggregate,
  TState,
  TEvent extends BaseDomainEvent,
  TSnapshot extends BaseAggregateSnapshot<TSnapshotState>,
  TSnapshotState,
> {
  /**
   * The aggregate type name (e.g., 'Lead', 'Patient')
   */
  protected abstract readonly aggregateType: string;

  /**
   * The ID prefix for generated IDs (e.g., 'lead', 'patient')
   */
  protected abstract readonly idPrefix: string;

  /**
   * Reconstitute an aggregate from event history
   *
   * @param id - Aggregate ID
   * @param events - Domain events to replay
   * @returns Reconstituted aggregate
   */
  abstract reconstitute(id: string, events: TEvent[]): TAggregate;

  /**
   * Create an empty aggregate for reconstitution
   *
   * @param id - Aggregate ID
   * @returns Empty aggregate ready for event replay
   */
  abstract createEmpty(id: string): TAggregate;

  /**
   * Convert a snapshot to aggregate state
   *
   * @param snapshot - Aggregate snapshot
   * @returns Aggregate state
   */
  protected abstract snapshotToState(snapshot: TSnapshot): TState;

  /**
   * Reconstitute an aggregate from state
   *
   * @param state - Aggregate state
   * @returns Reconstituted aggregate
   */
  protected abstract reconstituteFromState(state: TState): TAggregate;

  /**
   * Load events into an aggregate's history
   *
   * @param aggregate - The aggregate to load events into
   * @param events - Events to load
   */
  protected abstract loadHistory(aggregate: TAggregate, events: TEvent[]): void;

  /**
   * Generate a unique aggregate ID
   *
   * @returns Generated ID with prefix, timestamp, and random suffix
   */
  protected generateId(): string {
    return `${this.idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Restore an aggregate from a snapshot
   *
   * @param snapshot - Aggregate snapshot
   * @param eventsSinceSnapshot - Events since the snapshot was taken
   * @returns Restored aggregate
   */
  fromSnapshot(snapshot: TSnapshot, eventsSinceSnapshot: TEvent[] = []): TAggregate {
    const state = this.snapshotToState(snapshot);
    const aggregate = this.reconstituteFromState(state);

    // Apply any events that occurred after the snapshot
    if (eventsSinceSnapshot.length > 0) {
      this.loadHistory(aggregate, eventsSinceSnapshot);
    }

    return aggregate;
  }
}

/**
 * Utility function to serialize a Date to ISO string or undefined
 */
export function serializeDate(date: Date | undefined): string | undefined {
  return date?.toISOString();
}

/**
 * Utility function to deserialize an ISO string to Date or undefined
 */
export function deserializeDate(isoString: string | undefined): Date | undefined {
  return isoString ? new Date(isoString) : undefined;
}

/**
 * Utility function to serialize an array of items with dates
 *
 * @param items - Array of items to serialize
 * @param dateFields - Field names that should be serialized as dates
 * @returns Serialized items
 */
export function serializeArrayWithDates<T extends Record<string, unknown>>(
  items: readonly T[],
  dateFields: (keyof T)[]
): Record<string, unknown>[] {
  return items.map((item) => {
    const serialized: Record<string, unknown> = { ...item };
    for (const field of dateFields) {
      const value = item[field];
      if (value instanceof Date) {
        serialized[field as string] = value.toISOString();
      }
    }
    return serialized;
  });
}

/**
 * Utility function to deserialize an array of items with dates
 *
 * @param items - Array of serialized items
 * @param dateFields - Field names that should be deserialized as dates
 * @returns Deserialized items
 */
export function deserializeArrayWithDates<T extends Record<string, unknown>>(
  items: readonly Record<string, unknown>[],
  dateFields: string[]
): T[] {
  return items.map((item) => {
    const deserialized: Record<string, unknown> = { ...item };
    for (const field of dateFields) {
      const value = item[field];
      if (typeof value === 'string') {
        deserialized[field] = new Date(value);
      }
    }
    return deserialized as T;
  });
}
