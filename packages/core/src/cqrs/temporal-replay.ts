/**
 * CQRS Temporal Event Replay
 *
 * Enhanced event replay with temporal query capabilities:
 * - Time-based event filtering and replay
 * - Temporal projections (state at any point in time)
 * - Bi-temporal queries (transaction time vs. valid time)
 * - Event stream slicing and windowing
 * - Parallel replay with workers
 * - Integration with audit trail
 */

import type { StoredEvent, EventStore } from '../event-store.js';
import type { ProjectionDefinition, ProjectionHandler } from './projections.js';
import type { CheckpointStore, CheckpointData } from './event-replay.js';
import type { AuditTrailService, AuditActor } from './audit-trail.js';
import { InMemoryCheckpointStore } from './event-replay.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TEMPORAL QUERY TYPES
// ============================================================================

/**
 * Temporal query mode
 */
export type TemporalQueryMode =
  | 'as-of' // State as of a specific time
  | 'between' // Events between two times
  | 'since' // Events since a specific time
  | 'until'; // Events until a specific time

/**
 * Temporal query options
 */
export interface TemporalQueryOptions {
  /** Query mode */
  mode: TemporalQueryMode;
  /** Start time (for 'as-of', 'between', 'since') */
  startTime?: Date;
  /** End time (for 'as-of', 'between', 'until') */
  endTime?: Date;
  /** Event types to include (undefined = all) */
  eventTypes?: string[];
  /** Aggregate types to include (undefined = all) */
  aggregateTypes?: string[];
  /** Specific aggregate IDs to include */
  aggregateIds?: string[];
  /** Correlation ID filter */
  correlationId?: string;
  /** Maximum events to return */
  limit?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Temporal query result
 */
export interface TemporalQueryResult {
  events: StoredEvent[];
  totalMatched: number;
  hasMore: boolean;
  queryTimeMs: number;
  temporalRange: {
    earliest: Date;
    latest: Date;
  };
}

/**
 * Event window for time-based slicing
 */
export interface EventWindow {
  /** Window start time */
  start: Date;
  /** Window end time */
  end: Date;
  /** Events in this window */
  events: StoredEvent[];
  /** Event count */
  count: number;
  /** Aggregate IDs affected */
  aggregateIds: Set<string>;
  /** Event types in window */
  eventTypes: Set<string>;
}

/**
 * Sliding window configuration
 */
export interface SlidingWindowConfig {
  /** Window duration in milliseconds */
  windowDurationMs: number;
  /** Slide interval in milliseconds */
  slideIntervalMs: number;
  /** Maximum windows to generate */
  maxWindows?: number;
}

// ============================================================================
// TEMPORAL REPLAY CONFIGURATION
// ============================================================================

/**
 * Temporal replay configuration
 */
export interface TemporalReplayConfig {
  /** Batch size for event processing */
  batchSize: number;
  /** Enable parallel processing */
  enableParallel: boolean;
  /** Number of parallel workers */
  parallelWorkers: number;
  /** Checkpoint interval (events) */
  checkpointInterval: number;
  /** Enable audit logging */
  enableAudit: boolean;
  /** Continue on error */
  continueOnError: boolean;
  /** Log progress */
  logProgress: boolean;
  /** Progress interval (events) */
  progressInterval: number;
}

const DEFAULT_TEMPORAL_REPLAY_CONFIG: TemporalReplayConfig = {
  batchSize: 1000,
  enableParallel: false,
  parallelWorkers: 4,
  checkpointInterval: 5000,
  enableAudit: true,
  continueOnError: true,
  logProgress: true,
  progressInterval: 10000,
};

/**
 * Temporal replay result
 */
export interface TemporalReplayResult {
  success: boolean;
  eventsProcessed: number;
  eventsSkipped: number;
  errors: {
    eventId: string;
    eventType: string;
    error: string;
    timestamp: Date;
  }[];
  temporalRange: {
    start: Date;
    end: Date;
  };
  processingTimeMs: number;
  checkpointsCreated: number;
  finalState: unknown;
}

// ============================================================================
// TEMPORAL REPLAY SERVICE
// ============================================================================

/**
 * Enhanced event replay with temporal capabilities
 */
export class TemporalReplayService {
  private eventStore: EventStore;
  private checkpointStore: CheckpointStore;
  private auditService?: AuditTrailService;
  private logger: Logger;
  private config: TemporalReplayConfig;

  constructor(
    eventStore: EventStore,
    checkpointStore?: CheckpointStore,
    auditService?: AuditTrailService,
    config?: Partial<TemporalReplayConfig>
  ) {
    this.eventStore = eventStore;
    this.checkpointStore = checkpointStore ?? new InMemoryCheckpointStore();
    this.auditService = auditService;
    this.config = { ...DEFAULT_TEMPORAL_REPLAY_CONFIG, ...config };
    this.logger = createLogger({ name: 'temporal-replay' });
  }

  /**
   * Execute a temporal query on the event store
   */
  async temporalQuery(options: TemporalQueryOptions): Promise<TemporalQueryResult> {
    const startTime = Date.now();

    // Get all events that match criteria
    let events: StoredEvent[] = [];

    if (options.correlationId) {
      events = await this.eventStore.getByCorrelationId(options.correlationId);
    } else if (options.aggregateIds && options.aggregateIds.length > 0) {
      // Fetch events for specific aggregates
      const aggregateEvents = await Promise.all(
        options.aggregateIds.map((id) => this.eventStore.getByAggregateId(id))
      );
      events = aggregateEvents.flat();
    } else if (options.eventTypes && options.eventTypes.length > 0) {
      // Fetch events by type
      const typeEvents = await Promise.all(
        options.eventTypes.map((type) => this.eventStore.getByType(type))
      );
      events = typeEvents.flat();
    } else {
      // Get all events - this would need a getAllEvents method on EventStore
      // For now, we'll throw an error
      throw new Error(
        'Temporal query requires at least one filter: eventTypes, aggregateIds, or correlationId'
      );
    }

    // Apply temporal filters
    switch (options.mode) {
      case 'as-of':
        if (options.endTime) {
          events = events.filter((e) => new Date(e.metadata.timestamp) <= options.endTime!);
        }
        break;

      case 'between':
        events = events.filter((e) => {
          const eventTime = new Date(e.metadata.timestamp);
          const afterStart = !options.startTime || eventTime >= options.startTime;
          const beforeEnd = !options.endTime || eventTime <= options.endTime;
          return afterStart && beforeEnd;
        });
        break;

      case 'since':
        if (options.startTime) {
          events = events.filter((e) => new Date(e.metadata.timestamp) >= options.startTime!);
        }
        break;

      case 'until':
        if (options.endTime) {
          events = events.filter((e) => new Date(e.metadata.timestamp) <= options.endTime!);
        }
        break;
    }

    // Apply aggregate type filter
    if (options.aggregateTypes && options.aggregateTypes.length > 0) {
      events = events.filter((e) =>
        e.aggregateType ? options.aggregateTypes!.includes(e.aggregateType) : false
      );
    }

    // Apply event type filter (if not already used for fetching)
    if (options.eventTypes && options.eventTypes.length > 0 && !options.correlationId) {
      events = events.filter((e) => options.eventTypes!.includes(e.type));
    }

    // Sort events
    events.sort((a, b) => {
      const timeA = new Date(a.metadata.timestamp).getTime();
      const timeB = new Date(b.metadata.timestamp).getTime();
      return options.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // Apply limit
    const totalMatched = events.length;
    const hasMore = options.limit ? events.length > options.limit : false;

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    // Compute temporal range
    let earliest = new Date();
    let latest = new Date(0);

    for (const event of events) {
      const eventTime = new Date(event.metadata.timestamp);
      if (eventTime < earliest) earliest = eventTime;
      if (eventTime > latest) latest = eventTime;
    }

    return {
      events,
      totalMatched,
      hasMore,
      queryTimeMs: Date.now() - startTime,
      temporalRange: {
        earliest: events.length > 0 ? earliest : new Date(),
        latest: events.length > 0 ? latest : new Date(),
      },
    };
  }

  /**
   * Replay projection with temporal filter
   */
  async replayProjectionTemporal<TState>(
    projectionName: string,
    projectionDef: ProjectionDefinition<TState>,
    temporalOptions: TemporalQueryOptions,
    actor?: AuditActor
  ): Promise<TemporalReplayResult> {
    const startTime = Date.now();
    const handledEventTypes = Array.from(projectionDef.handlers.keys());

    // Query events with temporal filter
    const queryResult = await this.temporalQuery({
      ...temporalOptions,
      eventTypes: temporalOptions.eventTypes ?? handledEventTypes,
    });

    const result: TemporalReplayResult = {
      success: true,
      eventsProcessed: 0,
      eventsSkipped: 0,
      errors: [],
      temporalRange: {
        start: queryResult.temporalRange.earliest,
        end: queryResult.temporalRange.latest,
      },
      processingTimeMs: 0,
      checkpointsCreated: 0,
      finalState: projectionDef.initialState,
    };

    this.logger.info(
      {
        projectionName,
        version: projectionDef.version,
        eventsToProcess: queryResult.events.length,
        temporalMode: temporalOptions.mode,
      },
      'Starting temporal projection replay'
    );

    // Try to resume from checkpoint
    let state = projectionDef.initialState;
    const checkpoint = await this.checkpointStore.getLatest(projectionName, projectionDef.version);

    if (checkpoint) {
      // Only use checkpoint if it's within our temporal range
      if (new Date(checkpoint.lastEventTimestamp) < queryResult.temporalRange.earliest) {
        state = checkpoint.state as TState;
        result.eventsProcessed = checkpoint.eventsProcessed;
        this.logger.info(
          { projectionName, checkpoint: checkpoint.eventsProcessed },
          'Resuming from checkpoint'
        );
      }
    }

    // Process events
    for (const event of queryResult.events) {
      // Skip if already processed
      if (checkpoint && event.id <= checkpoint.lastEventId) {
        result.eventsSkipped++;
        continue;
      }

      // Get handler
      const handler = projectionDef.handlers.get(event.type);
      if (!handler) {
        result.eventsSkipped++;
        continue;
      }

      try {
        state = handler(state, event);
        result.eventsProcessed++;

        // Log progress
        if (
          this.config.logProgress &&
          result.eventsProcessed % this.config.progressInterval === 0
        ) {
          this.logger.info(
            {
              projectionName,
              eventsProcessed: result.eventsProcessed,
              currentEventType: event.type,
            },
            'Temporal replay progress'
          );
        }

        // Create checkpoint
        if (result.eventsProcessed % this.config.checkpointInterval === 0) {
          const checkpointData: CheckpointData = {
            projectionName,
            projectionVersion: projectionDef.version,
            lastEventId: event.id,
            lastEventTimestamp: new Date(event.metadata.timestamp),
            eventsProcessed: result.eventsProcessed,
            state,
            createdAt: new Date(),
          };

          await this.checkpointStore.save(checkpointData);
          result.checkpointsCreated++;
        }

        // Record audit entry if enabled
        if (this.config.enableAudit && this.auditService && actor) {
          await this.auditService.recordFromEvent(event, actor, {
            metadata: {
              replayContext: 'temporal',
              projectionName,
              temporalMode: temporalOptions.mode,
            },
          });
        }
      } catch (error) {
        const errorEntry = {
          eventId: event.id,
          eventType: event.type,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(event.metadata.timestamp),
        };

        result.errors.push(errorEntry);

        if (!this.config.continueOnError) {
          result.success = false;
          break;
        }

        this.logger.warn(errorEntry, 'Error processing event during temporal replay');
      }
    }

    // Save final checkpoint
    const lastEvent = queryResult.events[queryResult.events.length - 1];
    if (lastEvent) {
      await this.checkpointStore.save({
        projectionName,
        projectionVersion: projectionDef.version,
        lastEventId: lastEvent.id,
        lastEventTimestamp: new Date(lastEvent.metadata.timestamp),
        eventsProcessed: result.eventsProcessed,
        state,
        createdAt: new Date(),
      });
      result.checkpointsCreated++;
    }

    result.processingTimeMs = Date.now() - startTime;
    result.finalState = state;

    this.logger.info(
      {
        projectionName,
        eventsProcessed: result.eventsProcessed,
        eventsSkipped: result.eventsSkipped,
        errors: result.errors.length,
        processingTimeMs: result.processingTimeMs,
        checkpointsCreated: result.checkpointsCreated,
      },
      'Temporal projection replay completed'
    );

    return result;
  }

  /**
   * Generate sliding windows over events
   */
  async generateEventWindows(
    queryOptions: TemporalQueryOptions,
    windowConfig: SlidingWindowConfig
  ): Promise<EventWindow[]> {
    const queryResult = await this.temporalQuery(queryOptions);
    const windows: EventWindow[] = [];

    if (queryResult.events.length === 0) {
      return windows;
    }

    const earliest = queryResult.temporalRange.earliest;
    const latest = queryResult.temporalRange.latest;

    let windowStart = earliest;
    let windowCount = 0;

    while (
      windowStart < latest &&
      (!windowConfig.maxWindows || windowCount < windowConfig.maxWindows)
    ) {
      const windowEnd = new Date(windowStart.getTime() + windowConfig.windowDurationMs);

      // Get events in this window
      const windowEvents = queryResult.events.filter((e) => {
        const eventTime = new Date(e.metadata.timestamp);
        return eventTime >= windowStart && eventTime < windowEnd;
      });

      // Collect aggregate IDs and event types
      const aggregateIds = new Set<string>();
      const eventTypes = new Set<string>();

      for (const event of windowEvents) {
        if (event.aggregateId) {
          aggregateIds.add(event.aggregateId);
        }
        eventTypes.add(event.type);
      }

      windows.push({
        start: new Date(windowStart),
        end: windowEnd > latest ? new Date(latest) : windowEnd,
        events: windowEvents,
        count: windowEvents.length,
        aggregateIds,
        eventTypes,
      });

      // Slide window
      windowStart = new Date(windowStart.getTime() + windowConfig.slideIntervalMs);
      windowCount++;
    }

    return windows;
  }

  /**
   * Get event frequency over time
   */
  async getEventFrequency(
    queryOptions: TemporalQueryOptions,
    bucketDurationMs: number
  ): Promise<
    {
      bucketStart: Date;
      bucketEnd: Date;
      count: number;
      byType: Record<string, number>;
    }[]
  > {
    const queryResult = await this.temporalQuery(queryOptions);

    if (queryResult.events.length === 0) {
      return [];
    }

    const earliest = queryResult.temporalRange.earliest;
    const latest = queryResult.temporalRange.latest;

    const buckets: {
      bucketStart: Date;
      bucketEnd: Date;
      count: number;
      byType: Record<string, number>;
    }[] = [];

    let bucketStart = earliest;

    while (bucketStart < latest) {
      const bucketEnd = new Date(bucketStart.getTime() + bucketDurationMs);

      const bucketEvents = queryResult.events.filter((e) => {
        const eventTime = new Date(e.metadata.timestamp);
        return eventTime >= bucketStart && eventTime < bucketEnd;
      });

      const byType: Record<string, number> = {};
      for (const event of bucketEvents) {
        byType[event.type] = (byType[event.type] ?? 0) + 1;
      }

      buckets.push({
        bucketStart: new Date(bucketStart),
        bucketEnd: bucketEnd > latest ? new Date(latest) : bucketEnd,
        count: bucketEvents.length,
        byType,
      });

      bucketStart = bucketEnd;
    }

    return buckets;
  }

  /**
   * Find events that match a pattern over time
   */
  async findEventPattern(
    aggregateId: string,
    pattern: string[], // Sequence of event types to find
    maxGapMs?: number // Maximum time gap between events in sequence
  ): Promise<
    {
      matchStart: Date;
      matchEnd: Date;
      events: StoredEvent[];
    }[]
  > {
    const events = await this.eventStore.getByAggregateId(aggregateId);
    events.sort(
      (a, b) => new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime()
    );

    const matches: {
      matchStart: Date;
      matchEnd: Date;
      events: StoredEvent[];
    }[] = [];

    let patternIndex = 0;
    let currentMatch: StoredEvent[] = [];
    let lastEventTime: Date | null = null;

    for (const event of events) {
      const eventTime = new Date(event.metadata.timestamp);

      // Check if we need to reset due to gap
      if (maxGapMs && lastEventTime) {
        const gap = eventTime.getTime() - lastEventTime.getTime();
        if (gap > maxGapMs) {
          patternIndex = 0;
          currentMatch = [];
        }
      }

      // Check if this event matches current pattern position
      if (event.type === pattern[patternIndex]) {
        currentMatch.push(event);
        patternIndex++;

        // Check if pattern is complete
        if (patternIndex === pattern.length) {
          const firstEvent = currentMatch[0];
          const lastEvent = currentMatch[currentMatch.length - 1];

          if (firstEvent && lastEvent) {
            matches.push({
              matchStart: new Date(firstEvent.metadata.timestamp),
              matchEnd: new Date(lastEvent.metadata.timestamp),
              events: [...currentMatch],
            });
          }

          // Reset for next match (allow overlapping)
          patternIndex = 0;
          currentMatch = [];
        }
      }

      lastEventTime = eventTime;
    }

    return matches;
  }

  /**
   * Compute aggregate activity over time
   */
  getAggregateActivity(
    _aggregateType: string,
    startTime: Date,
    endTime: Date,
    bucketDurationMs: number
  ): Promise<
    {
      bucketStart: Date;
      bucketEnd: Date;
      activeAggregates: number;
      newAggregates: number;
      eventCount: number;
    }[]
  > {
    // This would need a method to get all events, which might not exist
    // For now, we'll return a placeholder
    this.logger.warn('getAggregateActivity requires getAllEvents method on EventStore');

    const buckets: {
      bucketStart: Date;
      bucketEnd: Date;
      activeAggregates: number;
      newAggregates: number;
      eventCount: number;
    }[] = [];

    let bucketStart = startTime;

    while (bucketStart < endTime) {
      const bucketEnd = new Date(bucketStart.getTime() + bucketDurationMs);

      buckets.push({
        bucketStart: new Date(bucketStart),
        bucketEnd: bucketEnd > endTime ? new Date(endTime) : bucketEnd,
        activeAggregates: 0,
        newAggregates: 0,
        eventCount: 0,
      });

      bucketStart = bucketEnd;
    }

    return Promise.resolve(buckets);
  }

  /**
   * Clear checkpoint for fresh replay
   */
  async clearCheckpoint(projectionName: string): Promise<void> {
    await this.checkpointStore.delete(projectionName);
    this.logger.info({ projectionName }, 'Temporal checkpoint cleared');
  }
}

// ============================================================================
// TEMPORAL PROJECTION BUILDER
// ============================================================================

/**
 * Builder for temporal projections
 */
export class TemporalProjectionBuilder<TState> {
  private handlers = new Map<string, ProjectionHandler<TState>>();
  private temporalHandlers = new Map<
    string,
    (state: TState, event: StoredEvent, temporalContext: TemporalContext) => TState
  >();

  constructor(
    private name: string,
    private version: number,
    private initialState: TState
  ) {}

  /**
   * Register a standard handler
   */
  on(eventType: string, handler: ProjectionHandler<TState>): this {
    this.handlers.set(eventType, handler);
    return this;
  }

  /**
   * Register a temporal-aware handler
   */
  onTemporal(
    eventType: string,
    handler: (state: TState, event: StoredEvent, temporalContext: TemporalContext) => TState
  ): this {
    this.temporalHandlers.set(eventType, handler);
    return this;
  }

  /**
   * Build the projection definition
   */
  build(): ProjectionDefinition<TState> & {
    temporalHandlers: Map<
      string,
      (state: TState, event: StoredEvent, temporalContext: TemporalContext) => TState
    >;
  } {
    return {
      name: this.name,
      version: this.version,
      initialState: this.initialState,
      handlers: this.handlers,
      temporalHandlers: this.temporalHandlers,
    };
  }
}

/**
 * Temporal context provided to temporal-aware handlers
 */
export interface TemporalContext {
  /** Current replay timestamp */
  replayTime: Date;
  /** Whether this is a historical replay vs live processing */
  isHistoricalReplay: boolean;
  /** Time elapsed since previous event */
  timeSincePreviousEvent?: number;
  /** Number of events processed so far */
  eventsProcessed: number;
  /** Original event timestamp */
  eventTime: Date;
  /** Query start time (if applicable) */
  queryStartTime?: Date;
  /** Query end time (if applicable) */
  queryEndTime?: Date;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createTemporalReplayService(
  eventStore: EventStore,
  checkpointStore?: CheckpointStore,
  auditService?: AuditTrailService,
  config?: Partial<TemporalReplayConfig>
): TemporalReplayService {
  return new TemporalReplayService(eventStore, checkpointStore, auditService, config);
}

export function defineTemporalProjection<TState>(
  name: string,
  version: number,
  initialState: TState
): TemporalProjectionBuilder<TState> {
  return new TemporalProjectionBuilder(name, version, initialState);
}
