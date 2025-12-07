/**
 * Replay Audit Trail (M6/H7)
 *
 * Provides comprehensive audit logging for:
 * - State reconstruction operations
 * - Projection replays
 * - Event timeline queries
 * - Compliance and security auditing
 */

import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of replay operations that can be audited
 */
export type ReplayOperationType =
  | 'state_reconstruction'
  | 'projection_rebuild'
  | 'event_timeline_query'
  | 'state_verification'
  | 'state_diff'
  | 'full_replay'
  | 'partial_replay';

/**
 * Status of a replay operation
 */
export type ReplayOperationStatus =
  | 'started'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Replay operation audit entry
 */
export interface ReplayAuditEntry {
  /** Unique ID for this audit entry */
  id: string;
  /** Type of replay operation */
  operationType: ReplayOperationType;
  /** Current status */
  status: ReplayOperationStatus;
  /** Target aggregate ID (if applicable) */
  aggregateId?: string;
  /** Target aggregate type (if applicable) */
  aggregateType?: string;
  /** Target projection name (if applicable) */
  projectionName?: string;
  /** User who initiated the operation */
  initiatedBy: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
  /** Correlation ID for tracing */
  correlationId: string;
  /** Operation parameters */
  parameters: ReplayParameters;
  /** Operation results */
  result?: ReplayResult;
  /** Error details if failed */
  error?: ReplayError;
  /** Operation timestamps */
  timestamps: {
    started: Date;
    completed?: Date;
    lastProgress?: Date;
  };
  /** Progress information */
  progress?: ReplayProgress;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Parameters for a replay operation
 */
export interface ReplayParameters {
  /** Point-in-time reconstruction timestamp */
  asOf?: Date;
  /** Version to reconstruct until */
  untilVersion?: number;
  /** Event ID to reconstruct until */
  untilEventId?: string;
  /** Start timestamp for range replay */
  startTimestamp?: Date;
  /** End timestamp for range replay */
  endTimestamp?: Date;
  /** Event type filters */
  eventTypeFilter?: string[];
  /** Batch size for processing */
  batchSize?: number;
  /** Whether snapshots were used */
  useSnapshots?: boolean;
  /** Reason for the operation */
  reason?: string;
}

/**
 * Result of a replay operation
 */
export interface ReplayResult {
  /** Total events processed */
  eventsProcessed: number;
  /** Events skipped */
  eventsSkipped: number;
  /** Errors encountered */
  errorCount: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Final version after replay */
  finalVersion?: number;
  /** Final state hash for verification */
  stateHash?: string;
  /** Whether operation was successful */
  success: boolean;
  /** Summary message */
  summary: string;
}

/**
 * Error details for failed operations
 */
export interface ReplayError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  eventId?: string;
  eventType?: string;
  stack?: string;
}

/**
 * Progress information for long-running operations
 */
export interface ReplayProgress {
  /** Current phase */
  phase: 'initializing' | 'loading_snapshot' | 'replaying_events' | 'finalizing';
  /** Events processed so far */
  eventsProcessed: number;
  /** Total events to process (if known) */
  totalEvents?: number;
  /** Current event being processed */
  currentEventId?: string;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemainingMs?: number;
}

/**
 * Replay audit store interface
 */
export interface ReplayAuditStore {
  save(entry: ReplayAuditEntry): Promise<void>;
  getById(id: string): Promise<ReplayAuditEntry | null>;
  getByCorrelationId(correlationId: string): Promise<ReplayAuditEntry[]>;
  getByAggregateId(aggregateId: string, limit?: number): Promise<ReplayAuditEntry[]>;
  getByProjection(projectionName: string, limit?: number): Promise<ReplayAuditEntry[]>;
  getByUser(userId: string, limit?: number): Promise<ReplayAuditEntry[]>;
  getByTimeRange(start: Date, end: Date, limit?: number): Promise<ReplayAuditEntry[]>;
  getRecent(limit?: number): Promise<ReplayAuditEntry[]>;
  delete(id: string): Promise<boolean>;
  cleanup(olderThan: Date): Promise<number>;
}

// ============================================================================
// IN-MEMORY AUDIT STORE
// ============================================================================

export class InMemoryReplayAuditStore implements ReplayAuditStore {
  private entries = new Map<string, ReplayAuditEntry>();

  save(entry: ReplayAuditEntry): Promise<void> {
    this.entries.set(entry.id, { ...entry });
    return Promise.resolve();
  }

  getById(id: string): Promise<ReplayAuditEntry | null> {
    return Promise.resolve(this.entries.get(id) ?? null);
  }

  getByCorrelationId(correlationId: string): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .filter((e) => e.correlationId === correlationId)
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime());
    return Promise.resolve(result);
  }

  getByAggregateId(aggregateId: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .filter((e) => e.aggregateId === aggregateId)
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  getByProjection(projectionName: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .filter((e) => e.projectionName === projectionName)
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  getByUser(userId: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .filter((e) => e.initiatedBy === userId)
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  getByTimeRange(start: Date, end: Date, limit = 100): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .filter((e) => e.timestamps.started >= start && e.timestamps.started <= end)
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  getRecent(limit = 100): Promise<ReplayAuditEntry[]> {
    const result = Array.from(this.entries.values())
      .sort((a, b) => b.timestamps.started.getTime() - a.timestamps.started.getTime())
      .slice(0, limit);
    return Promise.resolve(result);
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(id));
  }

  cleanup(olderThan: Date): Promise<number> {
    let deleted = 0;
    for (const [id, entry] of this.entries) {
      if (entry.timestamps.started < olderThan) {
        this.entries.delete(id);
        deleted++;
      }
    }
    return Promise.resolve(deleted);
  }

  // For testing
  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

// ============================================================================
// POSTGRESQL AUDIT STORE
// ============================================================================

interface PostgresAuditRow {
  id: string;
  operation_type: ReplayOperationType;
  status: ReplayOperationStatus;
  aggregate_id: string | null;
  aggregate_type: string | null;
  projection_name: string | null;
  initiated_by: string;
  tenant_id: string | null;
  correlation_id: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  started_at: Date;
  completed_at: Date | null;
  last_progress_at: Date | null;
  progress: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export class PostgresReplayAuditStore implements ReplayAuditStore {
  private pool: unknown;
  private tableName: string;
  private logger: Logger;

  constructor(
    private connectionString: string,
    // Note: Uses replay_audit_log_view for backward compatibility after M1 consolidation
    tableName = 'replay_audit_log_view'
  ) {
    this.tableName = tableName;
    this.logger = createLogger({ name: 'replay-audit-store' });
  }

  async initialize(): Promise<void> {
    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString: this.connectionString,
      max: 5,
    });

    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string) => Promise<void> }).query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY,
          operation_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          aggregate_id VARCHAR(255),
          aggregate_type VARCHAR(255),
          projection_name VARCHAR(255),
          initiated_by VARCHAR(255) NOT NULL,
          tenant_id VARCHAR(255),
          correlation_id VARCHAR(255) NOT NULL,
          parameters JSONB NOT NULL DEFAULT '{}',
          result JSONB,
          error JSONB,
          started_at TIMESTAMPTZ NOT NULL,
          completed_at TIMESTAMPTZ,
          last_progress_at TIMESTAMPTZ,
          progress JSONB,
          metadata JSONB NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_replay_audit_aggregate
        ON ${this.tableName} (aggregate_id, started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_replay_audit_projection
        ON ${this.tableName} (projection_name, started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_replay_audit_user
        ON ${this.tableName} (initiated_by, started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_replay_audit_correlation
        ON ${this.tableName} (correlation_id);

        CREATE INDEX IF NOT EXISTS idx_replay_audit_time
        ON ${this.tableName} (started_at DESC);
      `);

      this.logger.info('Replay audit store initialized');
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async save(entry: ReplayAuditEntry): Promise<void> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
        `INSERT INTO ${this.tableName}
         (id, operation_type, status, aggregate_id, aggregate_type, projection_name,
          initiated_by, tenant_id, correlation_id, parameters, result, error,
          started_at, completed_at, last_progress_at, progress, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO UPDATE SET
           status = $3,
           result = $11,
           error = $12,
           completed_at = $14,
           last_progress_at = $15,
           progress = $16,
           metadata = $17`,
        [
          entry.id,
          entry.operationType,
          entry.status,
          entry.aggregateId ?? null,
          entry.aggregateType ?? null,
          entry.projectionName ?? null,
          entry.initiatedBy,
          entry.tenantId ?? null,
          entry.correlationId,
          JSON.stringify(entry.parameters),
          entry.result ? JSON.stringify(entry.result) : null,
          entry.error ? JSON.stringify(entry.error) : null,
          entry.timestamps.started,
          entry.timestamps.completed ?? null,
          entry.timestamps.lastProgress ?? null,
          entry.progress ? JSON.stringify(entry.progress) : null,
          JSON.stringify(entry.metadata),
        ]
      );
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getById(id: string): Promise<ReplayAuditEntry | null> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(`SELECT * FROM ${this.tableName} WHERE id = $1`, [id]);

      const row = result.rows[0];
      return row ? this.rowToEntry(row) : null;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByCorrelationId(correlationId: string): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE correlation_id = $1
         ORDER BY started_at DESC`,
        [correlationId]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByAggregateId(aggregateId: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE aggregate_id = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [aggregateId, limit]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByProjection(projectionName: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE projection_name = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [projectionName, limit]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByUser(userId: string, limit = 100): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE initiated_by = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByTimeRange(start: Date, end: Date, limit = 100): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         WHERE started_at >= $1 AND started_at <= $2
         ORDER BY started_at DESC
         LIMIT $3`,
        [start, end, limit]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getRecent(limit = 100): Promise<ReplayAuditEntry[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: PostgresAuditRow[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName}
         ORDER BY started_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }> }
      ).query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);

      return result.rowCount > 0;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async cleanup(olderThan: Date): Promise<number> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (
        client as { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }> }
      ).query(`DELETE FROM ${this.tableName} WHERE started_at < $1`, [olderThan]);

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

  private rowToEntry(row: PostgresAuditRow): ReplayAuditEntry {
    const entry: ReplayAuditEntry = {
      id: row.id,
      operationType: row.operation_type,
      status: row.status,
      initiatedBy: row.initiated_by,
      correlationId: row.correlation_id,
      parameters: row.parameters as ReplayParameters,
      timestamps: {
        started: row.started_at,
      },
      metadata: row.metadata,
    };

    if (row.aggregate_id) entry.aggregateId = row.aggregate_id;
    if (row.aggregate_type) entry.aggregateType = row.aggregate_type;
    if (row.projection_name) entry.projectionName = row.projection_name;
    if (row.tenant_id) entry.tenantId = row.tenant_id;
    if (row.result) entry.result = row.result as unknown as ReplayResult;
    if (row.error) entry.error = row.error as unknown as ReplayError;
    if (row.completed_at) entry.timestamps.completed = row.completed_at;
    if (row.last_progress_at) entry.timestamps.lastProgress = row.last_progress_at;
    if (row.progress) entry.progress = row.progress as unknown as ReplayProgress;

    return entry;
  }
}

// ============================================================================
// REPLAY AUDIT SERVICE
// ============================================================================

import { v4 as uuidv4 } from 'uuid';

export class ReplayAuditService {
  private logger: Logger;

  constructor(private readonly store: ReplayAuditStore) {
    this.logger = createLogger({ name: 'replay-audit' });
  }

  /**
   * Start a new audit entry for a replay operation
   */
  async startOperation(params: {
    operationType: ReplayOperationType;
    initiatedBy: string;
    correlationId: string;
    aggregateId?: string;
    aggregateType?: string;
    projectionName?: string;
    tenantId?: string;
    parameters?: ReplayParameters;
    reason?: string;
  }): Promise<ReplayAuditEntry> {
    const entry: ReplayAuditEntry = {
      id: uuidv4(),
      operationType: params.operationType,
      status: 'started',
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      projectionName: params.projectionName,
      initiatedBy: params.initiatedBy,
      tenantId: params.tenantId,
      correlationId: params.correlationId,
      parameters: {
        ...params.parameters,
        reason: params.reason,
      },
      timestamps: {
        started: new Date(),
      },
      metadata: {},
    };

    await this.store.save(entry);

    this.logger.info(
      {
        auditId: entry.id,
        operationType: params.operationType,
        aggregateId: params.aggregateId,
        projectionName: params.projectionName,
        initiatedBy: params.initiatedBy,
      },
      'Replay operation started'
    );

    return entry;
  }

  /**
   * Update progress of an ongoing operation
   */
  async updateProgress(entryId: string, progress: ReplayProgress): Promise<void> {
    const entry = await this.store.getById(entryId);
    if (!entry) {
      this.logger.warn({ entryId }, 'Audit entry not found for progress update');
      return;
    }

    entry.status = 'in_progress';
    entry.progress = progress;
    entry.timestamps.lastProgress = new Date();

    await this.store.save(entry);
  }

  /**
   * Complete an operation successfully
   */
  async completeOperation(entryId: string, result: ReplayResult): Promise<void> {
    const entry = await this.store.getById(entryId);
    if (!entry) {
      this.logger.warn({ entryId }, 'Audit entry not found for completion');
      return;
    }

    entry.status = 'completed';
    entry.result = result;
    entry.timestamps.completed = new Date();

    await this.store.save(entry);

    this.logger.info(
      {
        auditId: entryId,
        operationType: entry.operationType,
        eventsProcessed: result.eventsProcessed,
        durationMs: result.durationMs,
        success: result.success,
      },
      'Replay operation completed'
    );
  }

  /**
   * Mark an operation as failed
   */
  async failOperation(entryId: string, error: ReplayError): Promise<void> {
    const entry = await this.store.getById(entryId);
    if (!entry) {
      this.logger.warn({ entryId }, 'Audit entry not found for failure');
      return;
    }

    entry.status = 'failed';
    entry.error = error;
    entry.timestamps.completed = new Date();

    await this.store.save(entry);

    this.logger.error(
      {
        auditId: entryId,
        operationType: entry.operationType,
        errorCode: error.code,
        errorMessage: error.message,
      },
      'Replay operation failed'
    );
  }

  /**
   * Cancel an operation
   */
  async cancelOperation(entryId: string, reason: string): Promise<void> {
    const entry = await this.store.getById(entryId);
    if (!entry) {
      this.logger.warn({ entryId }, 'Audit entry not found for cancellation');
      return;
    }

    entry.status = 'cancelled';
    entry.timestamps.completed = new Date();
    entry.metadata.cancellationReason = reason;

    await this.store.save(entry);

    this.logger.info({ auditId: entryId, reason }, 'Replay operation cancelled');
  }

  /**
   * Get audit entries for an aggregate
   */
  async getAggregateHistory(aggregateId: string, limit?: number): Promise<ReplayAuditEntry[]> {
    return this.store.getByAggregateId(aggregateId, limit);
  }

  /**
   * Get audit entries for a projection
   */
  async getProjectionHistory(projectionName: string, limit?: number): Promise<ReplayAuditEntry[]> {
    return this.store.getByProjection(projectionName, limit);
  }

  /**
   * Get recent audit entries
   */
  async getRecentOperations(limit?: number): Promise<ReplayAuditEntry[]> {
    return this.store.getRecent(limit);
  }

  /**
   * Get audit entry by ID
   */
  async getOperation(id: string): Promise<ReplayAuditEntry | null> {
    return this.store.getById(id);
  }

  /**
   * Clean up old audit entries
   */
  async cleanup(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const deleted = await this.store.cleanup(cutoff);

    if (deleted > 0) {
      this.logger.info({ deleted, retentionDays }, 'Cleaned up old audit entries');
    }

    return deleted;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createReplayAuditStore(connectionString?: string): ReplayAuditStore {
  if (connectionString) {
    return new PostgresReplayAuditStore(connectionString);
  }
  return new InMemoryReplayAuditStore();
}

export function createReplayAuditService(store: ReplayAuditStore): ReplayAuditService {
  return new ReplayAuditService(store);
}

export function createInMemoryReplayAuditService(): ReplayAuditService {
  return new ReplayAuditService(new InMemoryReplayAuditStore());
}
