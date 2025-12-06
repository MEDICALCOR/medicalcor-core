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
 * State Reconstruction Service (M6/H7)
 *
 * Provides point-in-time state reconstruction for:
 * - Audit trail and compliance (HIPAA/GDPR Article 15)
 * - Debugging and incident investigation
 * - State verification and validation
 * - Historical reporting and analytics
 */

import type { StoredEvent, EventStore as EventStoreInterface } from '../event-store.js';
import type { AggregateRoot, AggregateState, AggregateSnapshot } from './aggregate.js';
import type { SnapshotManager } from './snapshot-store.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Point-in-time reconstruction options
 */
export interface ReconstructionOptions {
  /** Reconstruct state as of this timestamp */
  asOf?: Date;
  /** Reconstruct state as of this event ID */
  untilEventId?: string;
  /** Reconstruct state as of this version */
  untilVersion?: number;
  /** Include events in the result */
  includeEvents?: boolean;
  /** Use snapshots for optimization (default: true) */
  useSnapshots?: boolean;
}

/**
 * Result of a state reconstruction operation
 */
export interface ReconstructionResult<TState extends AggregateState> {
  /** The reconstructed aggregate state */
  state: TState;
  /** Aggregate ID */
  aggregateId: string;
  /** Aggregate type */
  aggregateType: string;
  /** Version at reconstruction point */
  version: number;
  /** Timestamp of reconstruction point */
  timestamp: Date;
  /** Events applied (if includeEvents was true) */
  events?: StoredEvent[];
  /** Total events in aggregate history */
  totalEvents: number;
  /** Events applied during reconstruction */
  eventsApplied: number;
  /** Whether a snapshot was used */
  snapshotUsed: boolean;
  /** Snapshot version if used */
  snapshotVersion?: number;
  /** Reconstruction duration in ms */
  durationMs: number;
  /** Metadata about the reconstruction */
  metadata: {
    reconstructedAt: Date;
    reconstructionMethod: 'full-replay' | 'snapshot-replay' | 'snapshot-only';
    options: ReconstructionOptions;
  };
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
  aggregateId: string;
  aggregateType: string;
  fromVersion: number;
  toVersion: number;
  fromTimestamp: Date;
  toTimestamp: Date;
  fromState: Partial<TState>;
  toState: Partial<TState>;
  changes: StateChange[];
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
 * Individual state change
 */
export interface StateChange {
  path: string;
  operation: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
  causedByEvent?: {
    id: string;
    type: string;
    timestamp: Date;
  };
}

/**
 * Aggregate factory function type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AggregateFactory<T extends AggregateRoot<any>> = (id: string) => T;

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
export class StateReconstructionService<
  T extends AggregateRoot<TState>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TState extends AggregateState = any,
> {
  private logger: Logger;

  constructor(
    private readonly eventStore: EventStoreInterface,
    private readonly aggregateType: string,
    private readonly aggregateFactory: AggregateFactory<T>,
    private readonly snapshotManager?: SnapshotManager
  ) {
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
  async reconstructAt(
    aggregateId: string,
    options: ReconstructionOptions = {}
  ): Promise<ReconstructionResult<TState> | null> {
    const startTime = Date.now();
    const useSnapshots = options.useSnapshots !== false;

    this.logger.info(
      { aggregateId, aggregateType: this.aggregateType, options },
      'Starting state reconstruction'
    );

    // Get all events for the aggregate
    const allEvents = await this.eventStore.getByAggregateId(aggregateId);
    const filteredEvents = allEvents.filter((e) => e.aggregateType === this.aggregateType);

    if (filteredEvents.length === 0) {
      this.logger.debug({ aggregateId }, 'No events found for aggregate');
      return null;
    }

    // Filter events based on reconstruction options
    const eventsToApply = this.filterEventsByOptions(filteredEvents, options);

    if (eventsToApply.length === 0) {
      this.logger.debug({ aggregateId, options }, 'No events within specified range');
      return null;
    }

    // Try to use snapshot for optimization
    let snapshot: AggregateSnapshot<TState> | null = null;
    let snapshotUsed = false;
    let eventsAfterSnapshot: StoredEvent[] = eventsToApply;

    if (useSnapshots && this.snapshotManager) {
      snapshot = await this.snapshotManager.getLatestSnapshot<TState>(
        aggregateId,
        this.aggregateType
      );

      if (snapshot) {
        // Check if snapshot is before our target point
        const snapshotIsValid = this.isSnapshotValidForOptions(snapshot, options);

        if (snapshotIsValid) {
          // Filter events to only those after the snapshot
          eventsAfterSnapshot = eventsToApply.filter((e) => (e.version ?? 0) > snapshot!.version);
          snapshotUsed = true;

          this.logger.debug(
            {
              aggregateId,
              snapshotVersion: snapshot.version,
              eventsToApply: eventsAfterSnapshot.length,
            },
            'Using snapshot for reconstruction'
          );
        }
      }
    }

    // Create aggregate and reconstruct state
    const aggregate = this.aggregateFactory(aggregateId);

    if (snapshotUsed && snapshot) {
      aggregate.loadFromSnapshot(snapshot);
    }

    if (eventsAfterSnapshot.length > 0) {
      aggregate.loadFromHistory(eventsAfterSnapshot);
    }

    const state = aggregate.getState() as TState;
    const lastEvent = eventsToApply[eventsToApply.length - 1];

    const result: ReconstructionResult<TState> = {
      state,
      aggregateId,
      aggregateType: this.aggregateType,
      version: aggregate.version,
      timestamp: lastEvent ? new Date(lastEvent.metadata.timestamp) : new Date(),
      totalEvents: filteredEvents.length,
      eventsApplied: eventsAfterSnapshot.length,
      snapshotUsed,
      snapshotVersion: snapshotUsed ? snapshot?.version : undefined,
      durationMs: Date.now() - startTime,
      metadata: {
        reconstructedAt: new Date(),
        reconstructionMethod: snapshotUsed
          ? eventsAfterSnapshot.length > 0
            ? 'snapshot-replay'
            : 'snapshot-only'
          : 'full-replay',
        options,
      },
    };

    if (options.includeEvents) {
      result.events = eventsToApply;
    }

    this.logger.info(
      {
        aggregateId,
        version: result.version,
        eventsApplied: result.eventsApplied,
        usedSnapshot,
        reconstructionTimeMs: result.reconstructionTimeMs,
      },
      'Point-in-time reconstruction complete'
        snapshotUsed,
        durationMs: result.durationMs,
      },
      'State reconstruction completed'
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
   * Reconstruct state at a specific version
   */
  async reconstructAtVersion(
    aggregateId: string,
    version: number,
    includeEvents = false
  ): Promise<ReconstructionResult<TState> | null> {
    return this.reconstructAt(aggregateId, {
      untilVersion: version,
      includeEvents,
    });
  }

  /**
   * Reconstruct state as of a specific timestamp
   */
  async reconstructAsOf(
    aggregateId: string,
    timestamp: Date,
    includeEvents = false
  ): Promise<ReconstructionResult<TState> | null> {
    return this.reconstructAt(aggregateId, {
      asOf: timestamp,
      includeEvents,
    });
  }

  /**
   * Get state diff between two versions
   */
  async getStateDiff(
    aggregateId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<StateDiff<TState> | null> {
    const fromResult = await this.reconstructAtVersion(aggregateId, fromVersion, true);
    const toResult = await this.reconstructAtVersion(aggregateId, toVersion, true);

    if (!fromResult || !toResult) {
      return null;
    }

    // Get events between versions
    const allEvents = toResult.events ?? [];
    const eventsBetween = allEvents.filter(
      (e) => (e.version ?? 0) > fromVersion && (e.version ?? 0) <= toVersion
    );

    // Calculate changes
    const changes = this.calculateStateChanges(fromResult.state, toResult.state, eventsBetween);

    return {
      aggregateId,
      aggregateType: this.aggregateType,
      fromVersion,
      toVersion,
      fromTimestamp: fromResult.timestamp,
      toTimestamp: toResult.timestamp,
      fromState: fromResult.state,
      toState: toResult.state,
      changes,
      eventsBetween,
    };
  }

  /**
   * Get state diff between two timestamps
   */
  async getStateDiffByTime(
    aggregateId: string,
    fromTimestamp: Date,
    toTimestamp: Date
  ): Promise<StateDiff<TState> | null> {
    const fromResult = await this.reconstructAsOf(aggregateId, fromTimestamp, true);
    const toResult = await this.reconstructAsOf(aggregateId, toTimestamp, true);

    if (!fromResult || !toResult) {
      return null;
    }

    // Get events between timestamps
    const allEvents = toResult.events ?? [];
    const eventsBetween = allEvents.filter((e) => {
      const eventTime = new Date(e.metadata.timestamp);
      return eventTime > fromTimestamp && eventTime <= toTimestamp;
    });

    const changes = this.calculateStateChanges(fromResult.state, toResult.state, eventsBetween);

    return {
      aggregateId,
      aggregateType: this.aggregateType,
      fromVersion: fromResult.version,
      toVersion: toResult.version,
      fromTimestamp,
      toTimestamp,
      fromState: fromResult.state,
      toState: toResult.state,
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
   * Get aggregate event timeline
   */
  async getEventTimeline(
    aggregateId: string,
    options: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    events: StoredEvent[];
    total: number;
    hasMore: boolean;
  }> {
    const allEvents = await this.eventStore.getByAggregateId(aggregateId);
    let filteredEvents = allEvents.filter((e) => e.aggregateType === this.aggregateType);

    // Apply time filters
    if (options.startTime) {
      filteredEvents = filteredEvents.filter(
        (e) => new Date(e.metadata.timestamp) >= options.startTime!
      );
    }
    if (options.endTime) {
      filteredEvents = filteredEvents.filter(
        (e) => new Date(e.metadata.timestamp) <= options.endTime!
      );
    }

    // Sort by version/timestamp
    filteredEvents.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    const total = filteredEvents.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;

    const paginatedEvents = filteredEvents.slice(offset, offset + limit);

    return {
      events: paginatedEvents,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Verify state consistency by comparing reconstructed vs current state
   */
  async verifyStateConsistency(
    aggregateId: string,
    currentState: TState
  ): Promise<{
    isConsistent: boolean;
    reconstructedState: TState;
    differences: StateChange[];
    recommendation: string;
  }> {
    const result = await this.reconstructAt(aggregateId, { includeEvents: true });

    if (!result) {
      return {
        isConsistent: false,
        reconstructedState: currentState,
        differences: [],
        recommendation: 'Aggregate not found in event store. State may be orphaned.',
      };
    }

    const differences = this.calculateStateChanges(result.state, currentState, []);

    const isConsistent = differences.length === 0;

    let recommendation = 'State is consistent with event history.';
    if (!isConsistent) {
      if (differences.some((d) => d.operation === 'removed')) {
        recommendation =
          'State drift detected: some fields exist in reconstructed state but not in current state. Consider replaying events.';
      } else if (differences.some((d) => d.operation === 'added')) {
        recommendation =
          'State drift detected: some fields exist in current state but not in event history. Check for direct state modifications.';
      } else {
        recommendation =
          'State drift detected: field values differ from event history. Consider replaying events to correct state.';
      }
    }

    return {
      isConsistent,
      reconstructedState: result.state,
      differences,
      recommendation,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private filterEventsByOptions(
    events: StoredEvent[],
    options: ReconstructionOptions
  ): StoredEvent[] {
    let filtered = [...events];

    // Sort by version to ensure correct order
    filtered.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

    if (options.asOf) {
      filtered = filtered.filter((e) => new Date(e.metadata.timestamp) <= options.asOf!);
    }

    if (options.untilEventId) {
      const index = filtered.findIndex((e) => e.id === options.untilEventId);
      if (index >= 0) {
        filtered = filtered.slice(0, index + 1);
      }
    }

    if (options.untilVersion !== undefined) {
      filtered = filtered.filter((e) => (e.version ?? 0) <= options.untilVersion!);
    }

    return filtered;
  }

  private isSnapshotValidForOptions(
    snapshot: AggregateSnapshot<TState>,
    options: ReconstructionOptions
  ): boolean {
    if (options.asOf && snapshot.createdAt > options.asOf) {
      return false;
    }

    if (options.untilVersion !== undefined && snapshot.version > options.untilVersion) {
      return false;
    }

    return true;
  }

  private calculateStateChanges(
    fromState: Partial<TState>,
    toState: Partial<TState>,
    eventsBetween: StoredEvent[]
  ): StateChange[] {
    const changes: StateChange[] = [];
    const allKeys = new Set([
      ...Object.keys(fromState as object),
      ...Object.keys(toState as object),
    ]);

    for (const key of allKeys) {
      const fromValue = (fromState as Record<string, unknown>)[key];
      const toValue = (toState as Record<string, unknown>)[key];

      if (fromValue === undefined && toValue !== undefined) {
        changes.push({
          path: key,
          operation: 'added',
          newValue: toValue,
          causedByEvent: this.findCausingEvent(key, eventsBetween),
        });
      } else if (fromValue !== undefined && toValue === undefined) {
        changes.push({
          path: key,
          operation: 'removed',
          oldValue: fromValue,
          causedByEvent: this.findCausingEvent(key, eventsBetween),
        });
      } else if (!this.deepEqual(fromValue, toValue)) {
        changes.push({
          path: key,
          operation: 'changed',
          oldValue: fromValue,
          newValue: toValue,
          causedByEvent: this.findCausingEvent(key, eventsBetween),
        });
      }
    }

    return changes;
  }

  private findCausingEvent(
    fieldPath: string,
    events: StoredEvent[]
  ): StateChange['causedByEvent'] | undefined {
    // Find the last event that likely changed this field
    // This is a heuristic - events that mention the field name in their payload
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!event) continue;
      const payloadStr = JSON.stringify(event.payload).toLowerCase();
      if (payloadStr.includes(fieldPath.toLowerCase())) {
        return {
          id: event.id,
          type: event.type,
          timestamp: new Date(event.metadata.timestamp),
        };
      }
    }
    return undefined;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (
          !this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
        ) {
          return false;
        }
      }

      return true;
    }

    return false;
  }
}

// ============================================================================
// FACTORY
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TState extends AggregateState = any,
>(
  eventStore: EventStoreInterface,
  aggregateType: string,
  aggregateFactory: AggregateFactory<T>,
  snapshotManager?: SnapshotManager
): StateReconstructionService<T, TState> {
  return new StateReconstructionService(
    eventStore,
    aggregateType,
    aggregateFactory,
    snapshotManager
  );
}
