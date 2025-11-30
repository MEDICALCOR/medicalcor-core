/**
 * @module architecture/events/event-sourcing
 *
 * Event Sourcing Infrastructure
 * =============================
 *
 * Store and replay domain events for aggregate reconstruction.
 */

import type { DomainEvent, EventMetadata } from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// EVENT STORE TYPES
// ============================================================================

/**
 * Stored event with persistence metadata
 */
export interface StoredEvent extends DomainEvent {
  readonly sequenceNumber: number;
  readonly storedAt: Date;
}

/**
 * Event stream
 */
export interface EventStream {
  readonly streamId: string;
  readonly aggregateType: string;
  readonly events: StoredEvent[];
  readonly version: number;
}

/**
 * Event store interface
 */
export interface EventStore {
  /**
   * Append events to a stream
   */
  append(
    streamId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<Result<StoredEvent[], EventStoreError>>;

  /**
   * Read events from a stream
   */
  readStream(
    streamId: string,
    options?: ReadStreamOptions
  ): Promise<Result<EventStream, EventStoreError>>;

  /**
   * Read all events (for projections)
   */
  readAll(options?: ReadAllOptions): Promise<StoredEvent[]>;

  /**
   * Subscribe to events
   */
  subscribe(
    handler: (event: StoredEvent) => Promise<void>,
    options?: SubscribeOptions
  ): EventStoreSubscription;

  /**
   * Get the current position in the event store
   */
  getCurrentPosition(): Promise<number>;
}

export interface ReadStreamOptions {
  readonly fromVersion?: number;
  readonly toVersion?: number;
  readonly maxCount?: number;
}

export interface ReadAllOptions {
  readonly fromPosition?: number;
  readonly maxCount?: number;
  readonly eventTypes?: string[];
  readonly aggregateTypes?: string[];
}

export interface SubscribeOptions {
  readonly fromPosition?: number | 'start' | 'end';
  readonly eventTypes?: string[];
  readonly aggregateTypes?: string[];
  readonly batchSize?: number;
}

export interface EventStoreSubscription {
  readonly id: string;
  readonly position: number;
  stop(): void;
}

export interface EventStoreError {
  readonly code: string;
  readonly message: string;
  readonly streamId?: string;
}

// ============================================================================
// IN-MEMORY EVENT STORE
// ============================================================================

/**
 * In-memory event store implementation
 */
export class InMemoryEventStore implements EventStore {
  private streams = new Map<string, StoredEvent[]>();
  private allEvents: StoredEvent[] = [];
  private sequenceNumber = 0;
  private subscriptions = new Map<
    string,
    {
      handler: (event: StoredEvent) => Promise<void>;
      options: SubscribeOptions;
      running: boolean;
    }
  >();

  async append(
    streamId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<Result<StoredEvent[], EventStoreError>> {
    const stream = this.streams.get(streamId) ?? [];

    // Check version
    const currentVersion = stream.length > 0 ? stream[stream.length - 1]!.version : 0;

    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      return Err({
        code: 'CONCURRENCY_ERROR',
        message: `Expected version ${expectedVersion}, but stream is at version ${currentVersion}`,
        streamId,
      });
    }

    const storedEvents: StoredEvent[] = [];

    for (const event of events) {
      this.sequenceNumber++;
      const storedEvent: StoredEvent = {
        ...event,
        sequenceNumber: this.sequenceNumber,
        storedAt: new Date(),
      };
      storedEvents.push(storedEvent);
      stream.push(storedEvent);
      this.allEvents.push(storedEvent);
    }

    this.streams.set(streamId, stream);

    // Notify subscriptions
    for (const [, subscription] of this.subscriptions) {
      if (subscription.running) {
        for (const event of storedEvents) {
          if (this.matchesSubscription(event, subscription.options)) {
            await subscription.handler(event);
          }
        }
      }
    }

    return Ok(storedEvents);
  }

  async readStream(
    streamId: string,
    options: ReadStreamOptions = {}
  ): Promise<Result<EventStream, EventStoreError>> {
    const stream = this.streams.get(streamId);

    if (!stream || stream.length === 0) {
      return Err({
        code: 'STREAM_NOT_FOUND',
        message: `Stream ${streamId} not found`,
        streamId,
      });
    }

    let events = [...stream];

    if (options.fromVersion !== undefined) {
      events = events.filter((e) => e.version >= options.fromVersion!);
    }

    if (options.toVersion !== undefined) {
      events = events.filter((e) => e.version <= options.toVersion!);
    }

    if (options.maxCount !== undefined) {
      events = events.slice(0, options.maxCount);
    }

    const lastEvent = stream[stream.length - 1];

    return Ok({
      streamId,
      aggregateType: lastEvent?.aggregateType ?? '',
      events,
      version: lastEvent?.version ?? 0,
    });
  }

  async readAll(options: ReadAllOptions = {}): Promise<StoredEvent[]> {
    let events = [...this.allEvents];

    if (options.fromPosition !== undefined) {
      events = events.filter((e) => e.sequenceNumber >= options.fromPosition!);
    }

    if (options.eventTypes?.length) {
      events = events.filter((e) => options.eventTypes!.includes(e.eventType));
    }

    if (options.aggregateTypes?.length) {
      events = events.filter((e) => options.aggregateTypes!.includes(e.aggregateType));
    }

    if (options.maxCount !== undefined) {
      events = events.slice(0, options.maxCount);
    }

    return events;
  }

  subscribe(
    handler: (event: StoredEvent) => Promise<void>,
    options: SubscribeOptions = {}
  ): EventStoreSubscription {
    const id = crypto.randomUUID();
    let position = 0;

    if (options.fromPosition === 'start') {
      position = 0;
    } else if (options.fromPosition === 'end') {
      position = this.sequenceNumber;
    } else if (typeof options.fromPosition === 'number') {
      position = options.fromPosition;
    }

    this.subscriptions.set(id, { handler, options, running: true });

    return {
      id,
      position,
      stop: () => {
        const sub = this.subscriptions.get(id);
        if (sub) {
          sub.running = false;
        }
        this.subscriptions.delete(id);
      },
    };
  }

  async getCurrentPosition(): Promise<number> {
    return this.sequenceNumber;
  }

  private matchesSubscription(event: StoredEvent, options: SubscribeOptions): boolean {
    if (options.eventTypes?.length && !options.eventTypes.includes(event.eventType)) {
      return false;
    }
    if (options.aggregateTypes?.length && !options.aggregateTypes.includes(event.aggregateType)) {
      return false;
    }
    return true;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.streams.clear();
    this.allEvents = [];
    this.sequenceNumber = 0;
  }
}

// ============================================================================
// AGGREGATE RECONSTITUTION
// ============================================================================

/**
 * Reconstitute an aggregate from events
 */
export interface AggregateRehydrator<TState, TEvent extends DomainEvent> {
  /**
   * Get initial state
   */
  getInitialState(): TState;

  /**
   * Apply an event to state
   */
  apply(state: TState, event: TEvent): TState;
}

/**
 * Reconstitute aggregate state from event history
 */
export function reconstitute<TState, TEvent extends DomainEvent>(
  events: TEvent[],
  rehydrator: AggregateRehydrator<TState, TEvent>
): TState {
  return events.reduce(
    (state, event) => rehydrator.apply(state, event),
    rehydrator.getInitialState()
  );
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * Aggregate snapshot
 */
export interface AggregateSnapshot<TState> {
  readonly snapshotId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: TState;
  readonly createdAt: Date;
}

/**
 * Snapshot store interface
 */
export interface SnapshotStore<TState> {
  /**
   * Save a snapshot
   */
  save(snapshot: AggregateSnapshot<TState>): Promise<void>;

  /**
   * Get latest snapshot for an aggregate
   */
  getLatest(aggregateId: string): Promise<AggregateSnapshot<TState> | null>;

  /**
   * Delete snapshots older than version
   */
  deleteOlderThan(aggregateId: string, version: number): Promise<void>;
}

/**
 * In-memory snapshot store
 */
export class InMemorySnapshotStore<TState> implements SnapshotStore<TState> {
  private snapshots = new Map<string, AggregateSnapshot<TState>[]>();

  async save(snapshot: AggregateSnapshot<TState>): Promise<void> {
    const existing = this.snapshots.get(snapshot.aggregateId) ?? [];
    existing.push(snapshot);
    this.snapshots.set(snapshot.aggregateId, existing);
  }

  async getLatest(aggregateId: string): Promise<AggregateSnapshot<TState> | null> {
    const snapshots = this.snapshots.get(aggregateId);
    if (!snapshots || snapshots.length === 0) return null;

    return snapshots.reduce((latest, current) =>
      current.version > latest.version ? current : latest
    );
  }

  async deleteOlderThan(aggregateId: string, version: number): Promise<void> {
    const snapshots = this.snapshots.get(aggregateId);
    if (snapshots) {
      this.snapshots.set(
        aggregateId,
        snapshots.filter((s) => s.version >= version)
      );
    }
  }

  clear(): void {
    this.snapshots.clear();
  }
}

// ============================================================================
// EVENT SOURCED REPOSITORY
// ============================================================================

/**
 * Event-sourced repository
 */
export class EventSourcedRepository<
  TAggregate extends { id: string; version: number },
  TState,
  TEvent extends DomainEvent,
> {
  constructor(
    private eventStore: EventStore,
    private rehydrator: AggregateRehydrator<TState, TEvent>,
    private aggregateFactory: (id: string, state: TState, version: number) => TAggregate,
    private snapshotStore?: SnapshotStore<TState>,
    private snapshotFrequency = 100
  ) {}

  /**
   * Load an aggregate
   */
  async load(aggregateId: string): Promise<TAggregate | null> {
    let state = this.rehydrator.getInitialState();
    let fromVersion = 0;

    // Try to load from snapshot
    if (this.snapshotStore) {
      const snapshot = await this.snapshotStore.getLatest(aggregateId);
      if (snapshot) {
        state = snapshot.state;
        fromVersion = snapshot.version;
      }
    }

    // Load events after snapshot
    const result = await this.eventStore.readStream(aggregateId, {
      fromVersion: fromVersion + 1,
    });

    if (result.isErr) {
      if (result.error.code === 'STREAM_NOT_FOUND' && fromVersion === 0) {
        return null;
      }
      throw new Error(result.error.message);
    }

    // Apply events
    for (const event of result.value.events) {
      state = this.rehydrator.apply(state, event as unknown as TEvent);
    }

    return this.aggregateFactory(aggregateId, state, result.value.version);
  }

  /**
   * Save an aggregate
   */
  async save(aggregateId: string, events: TEvent[], expectedVersion: number): Promise<void> {
    const result = await this.eventStore.append(aggregateId, events, expectedVersion);

    if (result.isErr) {
      throw new Error(result.error.message);
    }

    // Create snapshot if needed
    if (this.snapshotStore && result.value.length > 0) {
      const lastEvent = result.value[result.value.length - 1]!;
      if (lastEvent.version % this.snapshotFrequency === 0) {
        const streamResult = await this.eventStore.readStream(aggregateId);
        if (streamResult.isOk) {
          const state = reconstitute(
            streamResult.value.events as unknown as TEvent[],
            this.rehydrator
          );
          await this.snapshotStore.save({
            snapshotId: crypto.randomUUID(),
            aggregateId,
            aggregateType: lastEvent.aggregateType,
            version: lastEvent.version,
            state,
            createdAt: new Date(),
          });
        }
      }
    }
  }
}

// Singleton event store
export const eventStore = new InMemoryEventStore();
