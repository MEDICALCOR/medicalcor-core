/**
 * CQRS Point-in-Time State Reconstruction
 *
 * Provides temporal state reconstruction capabilities for event-sourced aggregates:
 * - Reconstruct aggregate state at any point in time
 * - Diff states between two points in time
 * - Timeline visualization of state changes
 * - Integration with snapshots for performance
 * - Audit trail integration
 */

import type { StoredEvent, EventStore } from '../event-store.js';
import type { AggregateRoot, AggregateState } from './aggregate.js';
import type { SnapshotStoreRepository } from './snapshot-store.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// STATE RECONSTRUCTION TYPES
// ============================================================================

/**
 * Point-in-time state reconstruction result
 */
export interface StateAtTime<TState> {
  /** The reconstructed state */
  state: TState;
  /** Version at this point in time */
  version: number;
  /** Timestamp of the last event applied */
  timestamp: Date;
  /** Number of events applied to reach this state */
  eventsApplied: number;
  /** Whether a snapshot was used */
  usedSnapshot: boolean;
  /** Snapshot version if used */
  snapshotVersion?: number;
  /** Last event ID applied */
  lastEventId: string;
  /** Total reconstruction time in milliseconds */
  reconstructionTimeMs: number;
}

/**
 * State diff between two points in time
 */
export interface StateDiff<TState> {
  /** State before */
  before: StateAtTime<TState>;
  /** State after */
  after: StateAtTime<TState>;
  /** Fields that changed */
  changedFields: string[];
  /** Field-level changes */
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
    changedAt: Date;
    eventType: string;
    eventId: string;
  }[];
  /** Events between the two points */
  eventsBetween: StoredEvent[];
}

/**
 * Timeline entry for state evolution
 */
export interface TimelineEntry<TState> {
  /** Timestamp of the change */
  timestamp: Date;
  /** Event that caused the change */
  event: StoredEvent;
  /** State after this event */
  stateAfter: TState;
  /** Version after this event */
  version: number;
  /** Fields that changed in this event */
  changedFields: string[];
  /** Previous values of changed fields */
  previousValues: Record<string, unknown>;
}

/**
 * Complete state timeline
 */
export interface StateTimeline<TState> {
  /** Aggregate ID */
  aggregateId: string;
  /** Aggregate type */
  aggregateType: string;
  /** Initial state */
  initialState: TState;
  /** Timeline entries */
  entries: TimelineEntry<TState>[];
  /** Current state (final state) */
  currentState: TState;
  /** Total events in timeline */
  totalEvents: number;
  /** Timeline period */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Reconstruction options
 */
export interface ReconstructionOptions {
  /** Use snapshots if available */
  useSnapshots?: boolean;
  /** Include the event at the exact timestamp (if false, state is just before) */
  inclusive?: boolean;
  /** Maximum events to process (for safety) */
  maxEvents?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

// ============================================================================
// STATE RECONSTRUCTION SERVICE
// ============================================================================

/**
 * Factory function for creating empty aggregates
 */
type AggregateFactory<T extends AggregateRoot<TState>, TState extends AggregateState> = (
  id: string
) => T;

/**
 * Main state reconstruction service
 */
export class StateReconstructionService<
  T extends AggregateRoot<TState>,
  TState extends AggregateState,
> {
  private eventStore: EventStore;
  private snapshotStore?: SnapshotStoreRepository;
  private aggregateFactory: AggregateFactory<T, TState>;
  private aggregateType: string;
  private logger: Logger;

  constructor(
    eventStore: EventStore,
    aggregateFactory: AggregateFactory<T, TState>,
    aggregateType: string,
    snapshotStore?: SnapshotStoreRepository
  ) {
    this.eventStore = eventStore;
    this.snapshotStore = snapshotStore;
    this.aggregateFactory = aggregateFactory;
    this.aggregateType = aggregateType;
    this.logger = createLogger({ name: 'state-reconstruction' });
  }

  /**
   * Reconstruct aggregate state at a specific point in time
   */
  async getStateAtTime(
    aggregateId: string,
    targetTime: Date,
    options: ReconstructionOptions = {}
  ): Promise<StateAtTime<TState> | null> {
    const startTime = Date.now();
    const { useSnapshots = true, inclusive = true, maxEvents = 100000 } = options;

    this.logger.debug(
      { aggregateId, targetTime, useSnapshots },
      'Starting point-in-time reconstruction'
    );

    // Get all events for this aggregate
    let events = await this.eventStore.getByAggregateId(aggregateId);

    // Filter by aggregate type
    events = events.filter((e) => e.aggregateType === this.aggregateType);

    if (events.length === 0) {
      return null;
    }

    // Filter events up to target time
    const eventsUpToTarget = events.filter((e) => {
      const eventTime = new Date(e.metadata.timestamp);
      return inclusive ? eventTime <= targetTime : eventTime < targetTime;
    });

    if (eventsUpToTarget.length === 0) {
      // No events before target time - aggregate didn't exist yet
      return null;
    }

    // Safety check
    if (eventsUpToTarget.length > maxEvents) {
      throw new Error(
        `Too many events (${eventsUpToTarget.length}) for reconstruction. Increase maxEvents if needed.`
      );
    }

    // Sort by version/timestamp
    eventsUpToTarget.sort((a, b) => {
      const versionA = a.version ?? 0;
      const versionB = b.version ?? 0;
      return versionA - versionB;
    });

    let aggregate: T;
    let usedSnapshot = false;
    let snapshotVersion: number | undefined;

    // Try to use snapshot if available
    if (useSnapshots && this.snapshotStore) {
      const snapshot = await this.snapshotStore.getLatest<TState>(aggregateId, this.aggregateType);

      if (snapshot && new Date(snapshot.createdAt) <= targetTime) {
        // Use snapshot as starting point
        aggregate = this.aggregateFactory(aggregateId);
        aggregate.loadFromSnapshot(snapshot);
        usedSnapshot = true;
        snapshotVersion = snapshot.version;

        // Filter events to only those after snapshot
        const eventsAfterSnapshot = eventsUpToTarget.filter((e) => {
          return (e.version ?? 0) > snapshot.version;
        });

        if (eventsAfterSnapshot.length > 0) {
          aggregate.loadFromHistory(eventsAfterSnapshot);
        }
      } else {
        // No usable snapshot, replay from beginning
        aggregate = this.aggregateFactory(aggregateId);
        aggregate.loadFromHistory(eventsUpToTarget);
      }
    } else {
      // No snapshot store configured, replay from beginning
      aggregate = this.aggregateFactory(aggregateId);
      aggregate.loadFromHistory(eventsUpToTarget);
    }

    const lastEvent = eventsUpToTarget[eventsUpToTarget.length - 1];
    if (!lastEvent) {
      return null;
    }

    const result: StateAtTime<TState> = {
      state: aggregate.getState() as TState,
      version: aggregate.version,
      timestamp: new Date(lastEvent.metadata.timestamp),
      eventsApplied: eventsUpToTarget.length,
      usedSnapshot,
      snapshotVersion,
      lastEventId: lastEvent.id,
      reconstructionTimeMs: Date.now() - startTime,
    };

    this.logger.debug(
      {
        aggregateId,
        version: result.version,
        eventsApplied: result.eventsApplied,
        usedSnapshot,
        reconstructionTimeMs: result.reconstructionTimeMs,
      },
      'Point-in-time reconstruction complete'
    );

    return result;
  }

  /**
   * Get state at a specific event version
   */
  async getStateAtVersion(
    aggregateId: string,
    targetVersion: number,
    options: ReconstructionOptions = {}
  ): Promise<StateAtTime<TState> | null> {
    const startTime = Date.now();
    const { useSnapshots = true, maxEvents = 100000 } = options;

    // Get all events for this aggregate
    let events = await this.eventStore.getByAggregateId(aggregateId);
    events = events.filter((e) => e.aggregateType === this.aggregateType);

    if (events.length === 0) {
      return null;
    }

    // Filter events up to target version
    const eventsUpToVersion = events.filter((e) => (e.version ?? 0) <= targetVersion);

    if (eventsUpToVersion.length === 0) {
      return null;
    }

    if (eventsUpToVersion.length > maxEvents) {
      throw new Error(`Too many events (${eventsUpToVersion.length}) for reconstruction.`);
    }

    eventsUpToVersion.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    let aggregate: T;
    let usedSnapshot = false;
    let snapshotVersion: number | undefined;

    // Try to use snapshot
    if (useSnapshots && this.snapshotStore) {
      const snapshot = await this.snapshotStore.getLatest<TState>(aggregateId, this.aggregateType);

      if (snapshot && snapshot.version <= targetVersion) {
        aggregate = this.aggregateFactory(aggregateId);
        aggregate.loadFromSnapshot(snapshot);
        usedSnapshot = true;
        snapshotVersion = snapshot.version;

        const eventsAfterSnapshot = eventsUpToVersion.filter(
          (e) => (e.version ?? 0) > snapshot.version
        );

        if (eventsAfterSnapshot.length > 0) {
          aggregate.loadFromHistory(eventsAfterSnapshot);
        }
      } else {
        aggregate = this.aggregateFactory(aggregateId);
        aggregate.loadFromHistory(eventsUpToVersion);
      }
    } else {
      aggregate = this.aggregateFactory(aggregateId);
      aggregate.loadFromHistory(eventsUpToVersion);
    }

    const lastEvent = eventsUpToVersion[eventsUpToVersion.length - 1];
    if (!lastEvent) {
      return null;
    }

    return {
      state: aggregate.getState() as TState,
      version: aggregate.version,
      timestamp: new Date(lastEvent.metadata.timestamp),
      eventsApplied: eventsUpToVersion.length,
      usedSnapshot,
      snapshotVersion,
      lastEventId: lastEvent.id,
      reconstructionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Compute diff between two points in time
   */
  async diffStates(
    aggregateId: string,
    fromTime: Date,
    toTime: Date,
    options: ReconstructionOptions = {}
  ): Promise<StateDiff<TState> | null> {
    // Get states at both points
    const [beforeState, afterState] = await Promise.all([
      this.getStateAtTime(aggregateId, fromTime, options),
      this.getStateAtTime(aggregateId, toTime, options),
    ]);

    if (!beforeState || !afterState) {
      return null;
    }

    // Get events between the two times
    let events = await this.eventStore.getByAggregateId(aggregateId);
    events = events.filter((e) => e.aggregateType === this.aggregateType);

    const eventsBetween = events
      .filter((e) => {
        const eventTime = new Date(e.metadata.timestamp);
        return eventTime > fromTime && eventTime <= toTime;
      })
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    // Compute field-level changes
    const changedFields: string[] = [];
    const changes: StateDiff<TState>['changes'] = [];

    // Track changes through events
    let currentState = { ...beforeState.state };

    for (const event of eventsBetween) {
      const previousState = { ...currentState };

      // Get state after this event
      const stateAfterEvent = await this.getStateAtTime(
        aggregateId,
        new Date(event.metadata.timestamp),
        options
      );

      if (stateAfterEvent) {
        currentState = stateAfterEvent.state;

        // Find changed fields
        for (const key of Object.keys(currentState)) {
          const oldVal = previousState[key as keyof TState];
          const newVal = currentState[key as keyof TState];

          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            if (!changedFields.includes(key)) {
              changedFields.push(key);
            }

            changes.push({
              field: key,
              oldValue: oldVal,
              newValue: newVal,
              changedAt: new Date(event.metadata.timestamp),
              eventType: event.type,
              eventId: event.id,
            });
          }
        }
      }
    }

    return {
      before: beforeState,
      after: afterState,
      changedFields,
      changes,
      eventsBetween,
    };
  }

  /**
   * Generate complete state timeline
   */
  async getStateTimeline(
    aggregateId: string,
    startTime?: Date,
    endTime?: Date,
    _options: ReconstructionOptions = {}
  ): Promise<StateTimeline<TState> | null> {
    // Get all events for this aggregate
    let events = await this.eventStore.getByAggregateId(aggregateId);
    events = events.filter((e) => e.aggregateType === this.aggregateType);

    if (events.length === 0) {
      return null;
    }

    // Filter by time range if provided
    if (startTime) {
      events = events.filter((e) => new Date(e.metadata.timestamp) >= startTime);
    }
    if (endTime) {
      events = events.filter((e) => new Date(e.metadata.timestamp) <= endTime);
    }

    if (events.length === 0) {
      return null;
    }

    // Sort events
    events.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    // Build timeline
    const entries: TimelineEntry<TState>[] = [];
    const aggregate = this.aggregateFactory(aggregateId);
    const initialState = aggregate.getState() as TState;

    let previousState = { ...initialState };

    for (const event of events) {
      // Apply event
      aggregate.loadFromHistory([event]);
      const currentState = aggregate.getState() as TState;

      // Find changed fields
      const changedFields: string[] = [];
      const previousValues: Record<string, unknown> = {};

      for (const key of Object.keys(currentState)) {
        const oldVal = previousState[key as keyof TState];
        const newVal = currentState[key as keyof TState];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields.push(key);
          previousValues[key] = oldVal;
        }
      }

      entries.push({
        timestamp: new Date(event.metadata.timestamp),
        event,
        stateAfter: { ...currentState },
        version: aggregate.version,
        changedFields,
        previousValues,
      });

      previousState = { ...currentState };
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    if (!firstEvent || !lastEvent) {
      return null;
    }

    return {
      aggregateId,
      aggregateType: this.aggregateType,
      initialState,
      entries,
      currentState: aggregate.getState() as TState,
      totalEvents: events.length,
      period: {
        start: new Date(firstEvent.metadata.timestamp),
        end: new Date(lastEvent.metadata.timestamp),
      },
    };
  }

  /**
   * Find when a specific field changed to a specific value
   */
  async findFieldChange(
    aggregateId: string,
    fieldName: string,
    targetValue: unknown,
    options: ReconstructionOptions = {}
  ): Promise<TimelineEntry<TState> | null> {
    const timeline = await this.getStateTimeline(aggregateId, undefined, undefined, options);

    if (!timeline) {
      return null;
    }

    for (const entry of timeline.entries) {
      if (entry.changedFields.includes(fieldName)) {
        const stateValue = entry.stateAfter[fieldName as keyof TState];
        if (JSON.stringify(stateValue) === JSON.stringify(targetValue)) {
          return entry;
        }
      }
    }

    return null;
  }

  /**
   * Get state changes for a specific field over time
   */
  async getFieldHistory(
    aggregateId: string,
    fieldName: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<
    {
      timestamp: Date;
      value: unknown;
      previousValue: unknown;
      eventType: string;
      eventId: string;
    }[]
  > {
    const timeline = await this.getStateTimeline(aggregateId, startTime, endTime);

    if (!timeline) {
      return [];
    }

    const history: {
      timestamp: Date;
      value: unknown;
      previousValue: unknown;
      eventType: string;
      eventId: string;
    }[] = [];

    for (const entry of timeline.entries) {
      if (entry.changedFields.includes(fieldName)) {
        history.push({
          timestamp: entry.timestamp,
          value: entry.stateAfter[fieldName as keyof TState],
          previousValue: entry.previousValues[fieldName],
          eventType: entry.event.type,
          eventId: entry.event.id,
        });
      }
    }

    return history;
  }

  /**
   * Compare current state with state at a specific time
   */
  async compareWithCurrent(
    aggregateId: string,
    compareTime: Date,
    options: ReconstructionOptions = {}
  ): Promise<StateDiff<TState> | null> {
    return this.diffStates(aggregateId, compareTime, new Date(), options);
  }

  /**
   * Verify aggregate state integrity
   * Checks that replaying all events produces consistent state
   */
  async verifyIntegrity(aggregateId: string): Promise<{
    valid: boolean;
    issues: string[];
    eventsProcessed: number;
    finalVersion: number;
  }> {
    const issues: string[] = [];

    // Get all events
    let events = await this.eventStore.getByAggregateId(aggregateId);
    events = events.filter((e) => e.aggregateType === this.aggregateType);

    if (events.length === 0) {
      return {
        valid: true,
        issues: [],
        eventsProcessed: 0,
        finalVersion: 0,
      };
    }

    // Sort by version
    events.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    // Check version continuity
    let expectedVersion = 1;
    for (const event of events) {
      const eventVersion = event.version ?? 0;
      if (eventVersion !== expectedVersion) {
        issues.push(`Version gap detected: expected ${expectedVersion}, got ${eventVersion}`);
      }
      expectedVersion = eventVersion + 1;
    }

    // Check timestamp ordering
    let lastTimestamp = new Date(0);
    for (const event of events) {
      const eventTime = new Date(event.metadata.timestamp);
      if (eventTime < lastTimestamp) {
        issues.push(
          `Timestamp ordering issue: event ${event.id} has timestamp before previous event`
        );
      }
      lastTimestamp = eventTime;
    }

    // Try to replay all events
    try {
      const aggregate = this.aggregateFactory(aggregateId);
      aggregate.loadFromHistory(events);

      return {
        valid: issues.length === 0,
        issues,
        eventsProcessed: events.length,
        finalVersion: aggregate.version,
      };
    } catch (error) {
      issues.push(`Replay failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        issues,
        eventsProcessed: 0,
        finalVersion: 0,
      };
    }
  }
}

// ============================================================================
// AGGREGATE HISTORY VIEWER
// ============================================================================

/**
 * History view for UI display
 */
export interface AggregateHistoryView<TState> {
  aggregateId: string;
  aggregateType: string;
  currentState: TState;
  currentVersion: number;
  createdAt: Date;
  lastModifiedAt: Date;
  eventCount: number;
  timeline: {
    timestamp: Date;
    eventType: string;
    eventId: string;
    changes: Record<string, { before: unknown; after: unknown }>;
    actor?: {
      id: string;
      type: string;
      name?: string;
    };
  }[];
}

/**
 * Build a user-friendly history view
 */
export async function buildAggregateHistoryView<
  T extends AggregateRoot<TState>,
  TState extends AggregateState,
>(
  service: StateReconstructionService<T, TState>,
  aggregateId: string
): Promise<AggregateHistoryView<TState> | null> {
  const timeline = await service.getStateTimeline(aggregateId);

  if (!timeline || timeline.entries.length === 0) {
    return null;
  }

  const firstEntry = timeline.entries[0];
  const lastEntry = timeline.entries[timeline.entries.length - 1];

  if (!firstEntry || !lastEntry) {
    return null;
  }

  return {
    aggregateId: timeline.aggregateId,
    aggregateType: timeline.aggregateType,
    currentState: timeline.currentState,
    currentVersion: lastEntry.version,
    createdAt: timeline.period.start,
    lastModifiedAt: timeline.period.end,
    eventCount: timeline.totalEvents,
    timeline: timeline.entries.map((entry) => {
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      for (const field of entry.changedFields) {
        changes[field] = {
          before: entry.previousValues[field],
          after: entry.stateAfter[field as keyof TState],
        };
      }

      // Extract actor info from metadata if available (extended metadata fields)
      const metadata = entry.event.metadata as unknown as Record<string, unknown>;
      const actorId = metadata.actorId as string | undefined;
      const actorType = (metadata.actorType as string | undefined) ?? 'unknown';
      const actorName = metadata.actorName as string | undefined;

      return {
        timestamp: entry.timestamp,
        eventType: entry.event.type,
        eventId: entry.event.id,
        changes,
        actor: actorId
          ? {
              id: actorId,
              type: actorType,
              name: actorName,
            }
          : undefined,
      };
    }),
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createStateReconstructionService<
  T extends AggregateRoot<TState>,
  TState extends AggregateState,
>(
  eventStore: EventStore,
  aggregateFactory: AggregateFactory<T, TState>,
  aggregateType: string,
  snapshotStore?: SnapshotStoreRepository
): StateReconstructionService<T, TState> {
  return new StateReconstructionService(eventStore, aggregateFactory, aggregateType, snapshotStore);
}
