/**
 * CQRS Snapshot Store
 *
 * Provides efficient aggregate state reconstruction by:
 * - Storing periodic snapshots of aggregate state
 * - Loading from snapshot + subsequent events (vs full replay)
 * - Configurable snapshot frequency
 * - PostgreSQL persistence with TTL cleanup
 */

import type { AggregateSnapshot, AggregateState } from './aggregate.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// SNAPSHOT STORE INTERFACES
// ============================================================================

export interface SnapshotStoreConfig {
  /** PostgreSQL connection string */
  connectionString?: string;
  /** Table name for snapshots */
  tableName?: string;
  /** Default snapshot frequency (every N events) */
  snapshotFrequency: number;
  /** Max age for snapshots in milliseconds (for cleanup) */
  maxSnapshotAgeMs: number;
  /** Enable compression for snapshot data */
  enableCompression: boolean;
}

export interface SnapshotStoreRepository {
  save<TState extends AggregateState>(snapshot: AggregateSnapshot<TState>): Promise<void>;
  getLatest<TState extends AggregateState>(
    aggregateId: string,
    aggregateType: string
  ): Promise<AggregateSnapshot<TState> | null>;
  deleteOlderThan(aggregateId: string, version: number): Promise<number>;
  cleanup(maxAgeMs: number): Promise<number>;
}

const DEFAULT_CONFIG: SnapshotStoreConfig = {
  snapshotFrequency: 100, // Snapshot every 100 events
  maxSnapshotAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  enableCompression: true,
};

// ============================================================================
// IN-MEMORY SNAPSHOT STORE
// ============================================================================

export class InMemorySnapshotStore implements SnapshotStoreRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private snapshots = new Map<string, AggregateSnapshot<any>>();

  private getKey(aggregateId: string, aggregateType: string): string {
    return `${aggregateType}:${aggregateId}`;
  }

  save<TState extends AggregateState>(snapshot: AggregateSnapshot<TState>): Promise<void> {
    const key = this.getKey(snapshot.aggregateId, snapshot.aggregateType);
    this.snapshots.set(key, snapshot);
    return Promise.resolve();
  }

  getLatest<TState extends AggregateState>(
    aggregateId: string,
    aggregateType: string
  ): Promise<AggregateSnapshot<TState> | null> {
    const key = this.getKey(aggregateId, aggregateType);
    return Promise.resolve(this.snapshots.get(key) ?? null);
  }

  deleteOlderThan(_aggregateId: string, _version: number): Promise<number> {
    // In-memory store only keeps latest, so nothing to delete
    return Promise.resolve(0);
  }

  cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let deleted = 0;

    for (const [key, snapshot] of this.snapshots) {
      if (now - snapshot.createdAt.getTime() > maxAgeMs) {
        this.snapshots.delete(key);
        deleted++;
      }
    }

    return Promise.resolve(deleted);
  }

  // For testing
  clear(): void {
    this.snapshots.clear();
  }

  size(): number {
    return this.snapshots.size;
  }
}

// ============================================================================
// POSTGRESQL SNAPSHOT STORE
// ============================================================================

interface PostgresSnapshotRow {
  id: string;
  aggregate_id: string;
  aggregate_type: string;
  version: number;
  state: Record<string, unknown>;
  created_at: Date;
}

export class PostgresSnapshotStore implements SnapshotStoreRepository {
  private pool: unknown;
  private logger: Logger;
  private tableName: string;
  private config: SnapshotStoreConfig;

  constructor(config: SnapshotStoreConfig) {
    this.config = config;
    this.tableName = config.tableName ?? 'aggregate_snapshots';
    this.logger = createLogger({ name: 'snapshot-store' });
  }

  async initialize(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error('PostgreSQL connection string required');
    }

    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString: this.config.connectionString,
      max: 5,
    });

    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string) => Promise<void> }).query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          aggregate_id VARCHAR(255) NOT NULL,
          aggregate_type VARCHAR(255) NOT NULL,
          version INTEGER NOT NULL,
          state JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (aggregate_id, aggregate_type, version)
        );

        CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate
        ON ${this.tableName} (aggregate_id, aggregate_type, version DESC);

        CREATE INDEX IF NOT EXISTS idx_snapshots_created_at
        ON ${this.tableName} (created_at);
      `);

      this.logger.info('Snapshot store initialized');
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async save<TState extends AggregateState>(snapshot: AggregateSnapshot<TState>): Promise<void> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
        `INSERT INTO ${this.tableName}
         (aggregate_id, aggregate_type, version, state, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (aggregate_id, aggregate_type, version) DO UPDATE
         SET state = $4, created_at = $5`,
        [
          snapshot.aggregateId,
          snapshot.aggregateType,
          snapshot.version,
          JSON.stringify(snapshot.state),
          snapshot.createdAt,
        ]
      );
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getLatest<TState extends AggregateState>(
    aggregateId: string,
    aggregateType: string
  ): Promise<AggregateSnapshot<TState> | null> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresSnapshotRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE aggregate_id = $1 AND aggregate_type = $2
         ORDER BY version DESC
         LIMIT 1`,
        [aggregateId, aggregateType]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        version: row.version,
        state: row.state as TState,
        createdAt: row.created_at,
      };
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async deleteOlderThan(aggregateId: string, version: number): Promise<number> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }> }
      ).query(
        `DELETE FROM ${this.tableName}
         WHERE aggregate_id = $1 AND version < $2`,
        [aggregateId, version]
      );

      return result.rowCount;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    const cutoff = new Date(Date.now() - maxAgeMs);

    try {
      const result = await (
        client as { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }> }
      ).query(
        `DELETE FROM ${this.tableName}
         WHERE created_at < $1
         AND (aggregate_id, version) NOT IN (
           SELECT aggregate_id, MAX(version)
           FROM ${this.tableName}
           GROUP BY aggregate_id, aggregate_type
         )`,
        [cutoff]
      );

      return result.rowCount;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
    }
  }
}

// ============================================================================
// SNAPSHOT MANAGER
// ============================================================================

export class SnapshotManager {
  private repository: SnapshotStoreRepository;
  private config: SnapshotStoreConfig;
  private logger: Logger;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(repository: SnapshotStoreRepository, config: Partial<SnapshotStoreConfig> = {}) {
    this.repository = repository;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger({ name: 'snapshot-manager' });
  }

  /**
   * Check if a snapshot should be taken for the given aggregate
   */
  shouldSnapshot(eventsSinceLastSnapshot: number): boolean {
    return eventsSinceLastSnapshot >= this.config.snapshotFrequency;
  }

  /**
   * Save a snapshot of the aggregate
   */
  async saveSnapshot<TState extends AggregateState>(
    snapshot: AggregateSnapshot<TState>
  ): Promise<void> {
    await this.repository.save(snapshot);

    // Clean up old snapshots for this aggregate
    const deleted = await this.repository.deleteOlderThan(
      snapshot.aggregateId,
      snapshot.version - this.config.snapshotFrequency
    );

    if (deleted > 0) {
      this.logger.debug({ aggregateId: snapshot.aggregateId, deleted }, 'Cleaned up old snapshots');
    }
  }

  /**
   * Get the latest snapshot for an aggregate
   */
  async getLatestSnapshot<TState extends AggregateState>(
    aggregateId: string,
    aggregateType: string
  ): Promise<AggregateSnapshot<TState> | null> {
    return this.repository.getLatest(aggregateId, aggregateType);
  }

  /**
   * Start periodic cleanup task
   */
  startCleanupTask(intervalMs: number = 24 * 60 * 60 * 1000): void {
    // Default: run cleanup daily
    this.cleanupInterval = setInterval(async () => {
      try {
        const deleted = await this.repository.cleanup(this.config.maxSnapshotAgeMs);
        if (deleted > 0) {
          this.logger.info({ deleted }, 'Snapshot cleanup completed');
        }
      } catch (error) {
        this.logger.error({ error }, 'Snapshot cleanup failed');
      }
    }, intervalMs);

    this.cleanupInterval.unref();
  }

  /**
   * Stop cleanup task
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<number> {
    return this.repository.cleanup(this.config.maxSnapshotAgeMs);
  }
}

// ============================================================================
// ENHANCED REPOSITORY WITH SNAPSHOTS
// ============================================================================

import type { EventStore } from '../event-store.js';
import type { AggregateRoot } from './aggregate.js';
import { EventSourcedRepository } from './aggregate.js';

export abstract class SnapshotEnabledRepository<
  T extends AggregateRoot<TState>,
  TState extends AggregateState,
> extends EventSourcedRepository<T> {
  protected snapshotManager: SnapshotManager;

  constructor(eventStore: EventStore, aggregateType: string, snapshotManager: SnapshotManager) {
    super(eventStore, aggregateType);
    this.snapshotManager = snapshotManager;
  }

  /**
   * Load aggregate from event store with snapshot optimization
   */
  override async getById(id: string): Promise<T | null> {
    // Try to get latest snapshot first
    const snapshot = await this.snapshotManager.getLatestSnapshot<TState>(id, this.aggregateType);

    // Get events after snapshot (or all events if no snapshot)
    const afterVersion = snapshot?.version ?? -1;
    const events = await this.eventStore.getByAggregateId(id, afterVersion);

    // Filter by aggregate type
    const filteredEvents = events.filter((e) => e.aggregateType === this.aggregateType);

    // No snapshot and no events = aggregate doesn't exist
    if (!snapshot && filteredEvents.length === 0) {
      return null;
    }

    // Create aggregate and restore state
    const aggregate = this.createEmpty(id);

    // Load from snapshot if available
    if (snapshot) {
      aggregate.loadFromSnapshot(snapshot);
    }

    // Apply events since snapshot
    if (filteredEvents.length > 0) {
      aggregate.loadFromHistory(filteredEvents);
    }

    return aggregate;
  }

  /**
   * Save aggregate and optionally take a snapshot
   */
  override async save(aggregate: T): Promise<void> {
    const events = aggregate.getUncommittedEvents();

    if (events.length === 0) {
      return;
    }

    // Save events first
    await super.save(aggregate);

    // Check if we should take a snapshot
    // Access config via public method pattern - config is internal
    const eventsSinceLastSnapshot =
      aggregate.version %
      (this.snapshotManager as unknown as { config: SnapshotStoreConfig }).config.snapshotFrequency;
    if (this.snapshotManager.shouldSnapshot(eventsSinceLastSnapshot + events.length)) {
      const snapshot = aggregate.createSnapshot();
      await this.snapshotManager.saveSnapshot(snapshot);
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createSnapshotStore(
  config: Partial<SnapshotStoreConfig> = {}
): SnapshotStoreRepository {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (fullConfig.connectionString) {
    return new PostgresSnapshotStore(fullConfig);
  }

  return new InMemorySnapshotStore();
}

export function createSnapshotManager(
  repository: SnapshotStoreRepository,
  config?: Partial<SnapshotStoreConfig>
): SnapshotManager {
  return new SnapshotManager(repository, config);
}

export function createInMemorySnapshotManager(
  config?: Partial<SnapshotStoreConfig>
): SnapshotManager {
  return new SnapshotManager(new InMemorySnapshotStore(), config);
}
