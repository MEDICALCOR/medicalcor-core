/**
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
        snapshotUsed,
        durationMs: result.durationMs,
      },
      'State reconstruction completed'
    );

    return result;
  }

  /**
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
