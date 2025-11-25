/**
 * CQRS Event Replay Utilities
 *
 * Provides utilities for:
 * - Rebuilding projections from event history
 * - Event stream replay with filters
 * - Projection versioning and migration
 * - Consistent rebuild with checkpointing
 */

import type { StoredEvent, EventStore } from '../event-store.js';
import type { ProjectionManager, ProjectionDefinition } from './projections.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// REPLAY CONFIGURATION
// ============================================================================

export interface ReplayConfig {
  /** Batch size for event processing */
  batchSize: number;
  /** Delay between batches in milliseconds */
  batchDelayMs: number;
  /** Enable progress logging */
  logProgress: boolean;
  /** Progress log interval (every N events) */
  progressInterval: number;
  /** Continue on error or stop */
  continueOnError: boolean;
  /** Event type filter (only replay these types) */
  eventTypeFilter?: string[];
  /** Start from this timestamp */
  startFromTimestamp?: Date;
  /** End at this timestamp */
  endAtTimestamp?: Date;
}

const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  batchSize: 1000,
  batchDelayMs: 10,
  logProgress: true,
  progressInterval: 10000,
  continueOnError: true,
};

// ============================================================================
// REPLAY RESULT
// ============================================================================

export interface ReplayResult {
  success: boolean;
  projectionName: string;
  eventsProcessed: number;
  eventsSkipped: number;
  errors: Array<{
    eventId: string;
    eventType: string;
    error: string;
  }>;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  checkpoints: Array<{
    eventId: string;
    timestamp: Date;
    eventsProcessed: number;
  }>;
}

// ============================================================================
// CHECKPOINT STORE
// ============================================================================

export interface CheckpointData {
  projectionName: string;
  projectionVersion: number;
  lastEventId: string;
  lastEventTimestamp: Date;
  eventsProcessed: number;
  state: unknown;
  createdAt: Date;
}

export interface CheckpointStore {
  save(checkpoint: CheckpointData): Promise<void>;
  getLatest(projectionName: string, version: number): Promise<CheckpointData | null>;
  delete(projectionName: string): Promise<void>;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private checkpoints = new Map<string, CheckpointData>();

  private getKey(name: string, version: number): string {
    return `${name}:v${version}`;
  }

  save(checkpoint: CheckpointData): Promise<void> {
    const key = this.getKey(checkpoint.projectionName, checkpoint.projectionVersion);
    this.checkpoints.set(key, checkpoint);
    return Promise.resolve();
  }

  getLatest(projectionName: string, version: number): Promise<CheckpointData | null> {
    const key = this.getKey(projectionName, version);
    return Promise.resolve(this.checkpoints.get(key) ?? null);
  }

  delete(projectionName: string): Promise<void> {
    for (const key of this.checkpoints.keys()) {
      if (key.startsWith(`${projectionName}:`)) {
        this.checkpoints.delete(key);
      }
    }
    return Promise.resolve();
  }

  clear(): void {
    this.checkpoints.clear();
  }
}

// ============================================================================
// EVENT REPLAY SERVICE
// ============================================================================

export class EventReplayService {
  private logger: Logger;
  private checkpointStore: CheckpointStore;

  constructor(checkpointStore?: CheckpointStore) {
    this.logger = createLogger({ name: 'event-replay' });
    this.checkpointStore = checkpointStore ?? new InMemoryCheckpointStore();
  }

  /**
   * Rebuild a single projection from event history
   */
  async rebuildProjection<TState>(
    projectionName: string,
    projectionDef: ProjectionDefinition<TState>,
    eventStore: EventStore,
    config: Partial<ReplayConfig> = {}
  ): Promise<ReplayResult> {
    const fullConfig = { ...DEFAULT_REPLAY_CONFIG, ...config };
    const startTime = new Date();
    const result: ReplayResult = {
      success: true,
      projectionName,
      eventsProcessed: 0,
      eventsSkipped: 0,
      errors: [],
      startTime,
      endTime: startTime,
      durationMs: 0,
      checkpoints: [],
    };

    this.logger.info(
      { projectionName, version: projectionDef.version },
      'Starting projection rebuild'
    );

    // Try to resume from checkpoint
    let state = projectionDef.initialState;
    let lastEventId: string | undefined;

    const checkpoint = await this.checkpointStore.getLatest(projectionName, projectionDef.version);
    if (checkpoint) {
      this.logger.info(
        { projectionName, eventsProcessed: checkpoint.eventsProcessed },
        'Resuming from checkpoint'
      );
      state = checkpoint.state as TState;
      lastEventId = checkpoint.lastEventId;
      result.eventsProcessed = checkpoint.eventsProcessed;
    }

    // Get all event types this projection handles
    const handledEventTypes = Array.from(projectionDef.handlers.keys());
    const eventTypeFilter = fullConfig.eventTypeFilter ?? handledEventTypes;

    // Process events in batches
    for (const eventType of eventTypeFilter) {
      if (!projectionDef.handlers.has(eventType)) {
        continue;
      }

      const events = await eventStore.getByType(eventType, 10000);
      const handler = projectionDef.handlers.get(eventType)!;

      for (const event of events) {
        // Skip events before checkpoint
        if (lastEventId && event.id <= lastEventId) {
          result.eventsSkipped++;
          continue;
        }

        // Apply timestamp filters
        const eventTime = new Date(event.metadata.timestamp);
        if (fullConfig.startFromTimestamp && eventTime < fullConfig.startFromTimestamp) {
          result.eventsSkipped++;
          continue;
        }
        if (fullConfig.endAtTimestamp && eventTime > fullConfig.endAtTimestamp) {
          result.eventsSkipped++;
          continue;
        }

        try {
          state = handler(state, event);
          result.eventsProcessed++;

          // Log progress
          if (fullConfig.logProgress && result.eventsProcessed % fullConfig.progressInterval === 0) {
            this.logger.info(
              {
                projectionName,
                eventsProcessed: result.eventsProcessed,
                currentEventType: eventType,
              },
              'Replay progress'
            );
          }

          // Save checkpoint periodically
          if (result.eventsProcessed % fullConfig.batchSize === 0) {
            await this.checkpointStore.save({
              projectionName,
              projectionVersion: projectionDef.version,
              lastEventId: event.id,
              lastEventTimestamp: eventTime,
              eventsProcessed: result.eventsProcessed,
              state,
              createdAt: new Date(),
            });

            result.checkpoints.push({
              eventId: event.id,
              timestamp: eventTime,
              eventsProcessed: result.eventsProcessed,
            });

            // Small delay between batches
            if (fullConfig.batchDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, fullConfig.batchDelayMs));
            }
          }
        } catch (error) {
          result.errors.push({
            eventId: event.id,
            eventType: event.type,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          if (!fullConfig.continueOnError) {
            result.success = false;
            break;
          }
        }
      }

      if (!result.success) break;
    }

    // Final checkpoint
    const lastEvent = result.checkpoints[result.checkpoints.length - 1];
    if (lastEvent || result.eventsProcessed > 0) {
      await this.checkpointStore.save({
        projectionName,
        projectionVersion: projectionDef.version,
        lastEventId: lastEvent?.eventId ?? 'initial',
        lastEventTimestamp: lastEvent?.timestamp ?? new Date(),
        eventsProcessed: result.eventsProcessed,
        state,
        createdAt: new Date(),
      });
    }

    result.endTime = new Date();
    result.durationMs = result.endTime.getTime() - startTime.getTime();

    this.logger.info(
      {
        projectionName,
        eventsProcessed: result.eventsProcessed,
        eventsSkipped: result.eventsSkipped,
        errors: result.errors.length,
        durationMs: result.durationMs,
      },
      'Projection rebuild completed'
    );

    return result;
  }

  /**
   * Rebuild all projections in a projection manager
   */
  async rebuildAllProjections(
    projectionManager: ProjectionManager,
    eventStore: EventStore,
    config: Partial<ReplayConfig> = {}
  ): Promise<Map<string, ReplayResult>> {
    const results = new Map<string, ReplayResult>();
    const projections = projectionManager.getAll();

    this.logger.info(
      { projectionCount: projections.length },
      'Starting rebuild of all projections'
    );

    for (const projection of projections) {
      // Get the projection definition
      // Note: This requires access to the internal definition, which may need adjustment
      const result = await this.rebuildProjection(
        projection.name,
        {
          name: projection.name,
          version: projection.version,
          initialState: {},
          handlers: new Map(), // Would need actual handlers
        } as ProjectionDefinition<unknown>,
        eventStore,
        config
      );

      results.set(projection.name, result);
    }

    return results;
  }

  /**
   * Clear checkpoint for a projection (force full rebuild)
   */
  async clearCheckpoint(projectionName: string): Promise<void> {
    await this.checkpointStore.delete(projectionName);
    this.logger.info({ projectionName }, 'Checkpoint cleared');
  }
}

// ============================================================================
// PROJECTION MIGRATOR
// ============================================================================

export interface MigrationStep<TOldState, TNewState> {
  fromVersion: number;
  toVersion: number;
  migrate: (oldState: TOldState) => TNewState;
}

export class ProjectionMigrator {
  private migrations = new Map<string, MigrationStep<unknown, unknown>[]>();
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'projection-migrator' });
  }

  /**
   * Register a migration step
   */
  registerMigration<TOldState, TNewState>(
    projectionName: string,
    migration: MigrationStep<TOldState, TNewState>
  ): void {
    const existing = this.migrations.get(projectionName) ?? [];
    existing.push(migration as MigrationStep<unknown, unknown>);
    existing.sort((a, b) => a.fromVersion - b.fromVersion);
    this.migrations.set(projectionName, existing);
  }

  /**
   * Migrate a projection state from one version to another
   */
  async migrateState<TState>(
    projectionName: string,
    currentState: unknown,
    fromVersion: number,
    toVersion: number
  ): Promise<TState> {
    const migrations = this.migrations.get(projectionName);
    if (!migrations) {
      this.logger.warn(
        { projectionName, fromVersion, toVersion },
        'No migrations registered'
      );
      return currentState as TState;
    }

    let state = currentState;
    let currentVersion = fromVersion;

    for (const migration of migrations) {
      if (migration.fromVersion >= currentVersion && migration.toVersion <= toVersion) {
        this.logger.info(
          {
            projectionName,
            fromVersion: migration.fromVersion,
            toVersion: migration.toVersion,
          },
          'Applying migration'
        );

        state = migration.migrate(state);
        currentVersion = migration.toVersion;
      }
    }

    return state as TState;
  }

  /**
   * Check if migration is needed
   */
  needsMigration(projectionName: string, currentVersion: number, targetVersion: number): boolean {
    const migrations = this.migrations.get(projectionName);
    if (!migrations) return false;

    return migrations.some(
      (m) => m.fromVersion >= currentVersion && m.toVersion <= targetVersion
    );
  }
}

// ============================================================================
// LIVE PROJECTION SUBSCRIBER
// ============================================================================

export interface EventSubscriber {
  subscribe(handler: (event: StoredEvent) => Promise<void>): () => void;
}

export class LiveProjectionUpdater {
  private logger: Logger;
  private subscriptions: (() => void)[] = [];

  constructor() {
    this.logger = createLogger({ name: 'live-projection-updater' });
  }

  /**
   * Start live updates for projections
   */
  startLiveUpdates(
    projectionManager: ProjectionManager,
    eventSubscriber: EventSubscriber
  ): () => void {
    const unsubscribe = eventSubscriber.subscribe(async (event) => {
      try {
        projectionManager.apply(event);
        this.logger.debug(
          { eventType: event.type, eventId: event.id },
          'Applied event to projections'
        );
      } catch (error) {
        this.logger.error(
          { eventType: event.type, eventId: event.id, error },
          'Failed to apply event to projections'
        );
      }
    });

    this.subscriptions.push(unsubscribe);
    this.logger.info('Started live projection updates');

    return () => {
      unsubscribe();
      const index = this.subscriptions.indexOf(unsubscribe);
      if (index >= 0) {
        this.subscriptions.splice(index, 1);
      }
    };
  }

  /**
   * Stop all live updates
   */
  stopAll(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.logger.info('Stopped all live projection updates');
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createEventReplayService(checkpointStore?: CheckpointStore): EventReplayService {
  return new EventReplayService(checkpointStore);
}

export function createInMemoryCheckpointStore(): InMemoryCheckpointStore {
  return new InMemoryCheckpointStore();
}

export function createProjectionMigrator(): ProjectionMigrator {
  return new ProjectionMigrator();
}

export function createLiveProjectionUpdater(): LiveProjectionUpdater {
  return new LiveProjectionUpdater();
}
