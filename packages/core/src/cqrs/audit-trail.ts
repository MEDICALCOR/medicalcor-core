/**
 * CQRS Audit Trail Service
 *
 * Provides comprehensive audit logging for event-sourced systems with:
 * - Full audit trail for compliance (HIPAA, GDPR)
 * - Actor tracking (who performed the action)
 * - Reason/justification logging
 * - Temporal queries for audit reviews
 * - Integration with event store
 */

import type { StoredEvent } from '../event-store.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// AUDIT TYPES
// ============================================================================

/**
 * Actor information - who performed the action
 */
export interface AuditActor {
  /** User ID or system identifier */
  id: string;
  /** Actor type: user, system, api, integration */
  type: 'user' | 'system' | 'api' | 'integration' | 'cron';
  /** Display name for audit logs */
  name?: string;
  /** Email for user actors */
  email?: string;
  /** IP address for security tracking */
  ipAddress?: string;
  /** User agent for web requests */
  userAgent?: string;
  /** Clinic/organization context */
  clinicId?: string;
}

/**
 * Audit entry for a single action
 */
export interface AuditEntry {
  /** Unique audit entry ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Event type that was audited */
  eventType: string;
  /** Event ID from event store */
  eventId: string;
  /** Aggregate being modified */
  aggregateId: string;
  /** Aggregate type (Lead, Patient, etc.) */
  aggregateType: string;
  /** Who performed this action */
  actor: AuditActor;
  /** Action category for filtering */
  action: AuditAction;
  /** Optional reason/justification for the action */
  reason?: string;
  /** Previous state before the action (for sensitive changes) */
  previousState?: unknown;
  /** New state after the action */
  newState?: unknown;
  /** Fields that were changed */
  changedFields?: string[];
  /** Correlation ID for tracing */
  correlationId: string;
  /** Causation ID (parent event that caused this) */
  causationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Compliance tags (HIPAA, GDPR, PCI, etc.) */
  complianceTags?: string[];
  /** Severity level for alerts */
  severity: AuditSeverity;
}

/**
 * Audit action categories
 */
export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'import'
  | 'access'
  | 'consent'
  | 'authenticate'
  | 'authorize'
  | 'score'
  | 'assign'
  | 'transfer'
  | 'schedule'
  | 'cancel'
  | 'complete'
  | 'escalate'
  | 'archive'
  | 'restore';

/**
 * Severity levels for audit entries
 */
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Audit query filters
 */
export interface AuditQueryOptions {
  /** Filter by aggregate ID */
  aggregateId?: string;
  /** Filter by aggregate type */
  aggregateType?: string;
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by actor type */
  actorType?: AuditActor['type'];
  /** Filter by action type */
  action?: AuditAction;
  /** Filter by severity */
  severity?: AuditSeverity;
  /** Filter by compliance tags */
  complianceTags?: string[];
  /** Filter by event types */
  eventTypes?: string[];
  /** Start timestamp (inclusive) */
  startTime?: Date;
  /** End timestamp (inclusive) */
  endTime?: Date;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit query result
 */
export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
  queryTime: Date;
}

/**
 * Audit summary for dashboards
 */
export interface AuditSummary {
  period: {
    start: Date;
    end: Date;
  };
  totals: {
    totalEntries: number;
    byAction: Record<AuditAction, number>;
    bySeverity: Record<AuditSeverity, number>;
    byActorType: Record<AuditActor['type'], number>;
    byAggregateType: Record<string, number>;
  };
  topActors: {
    actorId: string;
    actorName?: string;
    count: number;
  }[];
  topAggregates: {
    aggregateId: string;
    aggregateType: string;
    count: number;
  }[];
  complianceAlerts: {
    tag: string;
    count: number;
    lastOccurrence: Date;
  }[];
}

// ============================================================================
// AUDIT STORE INTERFACE
// ============================================================================

/**
 * Persistence interface for audit entries
 */
export interface AuditStore {
  /** Save an audit entry */
  save(entry: AuditEntry): Promise<void>;
  /** Save multiple audit entries in batch */
  saveBatch(entries: AuditEntry[]): Promise<void>;
  /** Query audit entries */
  query(options: AuditQueryOptions): Promise<AuditQueryResult>;
  /** Get audit summary for a time period */
  getSummary(startTime: Date, endTime: Date): Promise<AuditSummary>;
  /** Get audit trail for a specific aggregate */
  getAggregateAuditTrail(aggregateId: string, aggregateType: string): Promise<AuditEntry[]>;
  /** Get audit entries for a specific actor */
  getActorAuditTrail(actorId: string): Promise<AuditEntry[]>;
  /** Export audit entries (for compliance reports) */
  exportToJson(options: AuditQueryOptions): Promise<string>;
}

// ============================================================================
// IN-MEMORY AUDIT STORE
// ============================================================================

/**
 * In-memory implementation for development and testing
 */
export class InMemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'in-memory-audit-store' });
  }

  save(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    this.logger.debug({ entryId: entry.id, eventType: entry.eventType }, 'Audit entry saved');
    return Promise.resolve();
  }

  saveBatch(entries: AuditEntry[]): Promise<void> {
    this.entries.push(...entries);
    this.logger.debug({ count: entries.length }, 'Audit entries batch saved');
    return Promise.resolve();
  }

  query(options: AuditQueryOptions): Promise<AuditQueryResult> {
    let filtered = [...this.entries];

    // Apply filters
    if (options.aggregateId) {
      filtered = filtered.filter((e) => e.aggregateId === options.aggregateId);
    }
    if (options.aggregateType) {
      filtered = filtered.filter((e) => e.aggregateType === options.aggregateType);
    }
    if (options.actorId) {
      filtered = filtered.filter((e) => e.actor.id === options.actorId);
    }
    if (options.actorType) {
      filtered = filtered.filter((e) => e.actor.type === options.actorType);
    }
    if (options.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }
    if (options.severity) {
      filtered = filtered.filter((e) => e.severity === options.severity);
    }
    if (options.complianceTags && options.complianceTags.length > 0) {
      filtered = filtered.filter(
        (e) =>
          e.complianceTags && options.complianceTags!.some((tag) => e.complianceTags!.includes(tag))
      );
    }
    if (options.eventTypes && options.eventTypes.length > 0) {
      filtered = filtered.filter((e) => options.eventTypes!.includes(e.eventType));
    }
    if (options.startTime) {
      filtered = filtered.filter((e) => new Date(e.timestamp) >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter((e) => new Date(e.timestamp) <= options.endTime!);
    }
    if (options.correlationId) {
      filtered = filtered.filter((e) => e.correlationId === options.correlationId);
    }

    // Sort
    filtered.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return options.sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });

    // Paginate
    const total = filtered.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return Promise.resolve({
      entries: paginated,
      total,
      hasMore: offset + limit < total,
      queryTime: new Date(),
    });
  }

  getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    const filtered = this.entries.filter((e) => {
      const time = new Date(e.timestamp);
      return time >= startTime && time <= endTime;
    });

    const byAction: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byActorType: Record<string, number> = {};
    const byAggregateType: Record<string, number> = {};
    const actorCounts = new Map<string, { name?: string; count: number }>();
    const aggregateCounts = new Map<string, { type: string; count: number }>();
    const complianceTagCounts = new Map<string, { count: number; lastOccurrence: Date }>();

    for (const entry of filtered) {
      // Count by action
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;

      // Count by severity
      bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;

      // Count by actor type
      byActorType[entry.actor.type] = (byActorType[entry.actor.type] ?? 0) + 1;

      // Count by aggregate type
      byAggregateType[entry.aggregateType] = (byAggregateType[entry.aggregateType] ?? 0) + 1;

      // Track top actors
      const actorEntry = actorCounts.get(entry.actor.id) ?? { name: entry.actor.name, count: 0 };
      actorEntry.count++;
      actorCounts.set(entry.actor.id, actorEntry);

      // Track top aggregates
      const aggEntry = aggregateCounts.get(entry.aggregateId) ?? {
        type: entry.aggregateType,
        count: 0,
      };
      aggEntry.count++;
      aggregateCounts.set(entry.aggregateId, aggEntry);

      // Track compliance tags
      if (entry.complianceTags) {
        for (const tag of entry.complianceTags) {
          const tagEntry = complianceTagCounts.get(tag) ?? {
            count: 0,
            lastOccurrence: new Date(entry.timestamp),
          };
          tagEntry.count++;
          const entryTime = new Date(entry.timestamp);
          if (entryTime > tagEntry.lastOccurrence) {
            tagEntry.lastOccurrence = entryTime;
          }
          complianceTagCounts.set(tag, tagEntry);
        }
      }
    }

    // Get top actors (limit to 10)
    const topActors = Array.from(actorCounts.entries())
      .map(([actorId, data]) => ({ actorId, actorName: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get top aggregates (limit to 10)
    const topAggregates = Array.from(aggregateCounts.entries())
      .map(([aggregateId, data]) => ({
        aggregateId,
        aggregateType: data.type,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get compliance alerts
    const complianceAlerts = Array.from(complianceTagCounts.entries())
      .map(([tag, data]) => ({ tag, count: data.count, lastOccurrence: data.lastOccurrence }))
      .sort((a, b) => b.count - a.count);

    return Promise.resolve({
      period: { start: startTime, end: endTime },
      totals: {
        totalEntries: filtered.length,
        byAction: byAction as Record<AuditAction, number>,
        bySeverity: bySeverity as Record<AuditSeverity, number>,
        byActorType: byActorType as Record<AuditActor['type'], number>,
        byAggregateType,
      },
      topActors,
      topAggregates,
      complianceAlerts,
    });
  }

  getAggregateAuditTrail(aggregateId: string, aggregateType: string): Promise<AuditEntry[]> {
    const result = this.entries
      .filter((e) => e.aggregateId === aggregateId && e.aggregateType === aggregateType)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return Promise.resolve(result);
  }

  getActorAuditTrail(actorId: string): Promise<AuditEntry[]> {
    const result = this.entries
      .filter((e) => e.actor.id === actorId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return Promise.resolve(result);
  }

  async exportToJson(options: AuditQueryOptions): Promise<string> {
    const result = await this.query({ ...options, limit: 10000 });
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        query: options,
        totalEntries: result.total,
        entries: result.entries,
      },
      null,
      2
    );
  }

  // For testing
  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}

// ============================================================================
// POSTGRES AUDIT STORE
// ============================================================================

/**
 * PostgreSQL implementation for production use
 */
export class PostgresAuditStore implements AuditStore {
  private pool: unknown;
  private logger: Logger;
  private tableName: string;

  constructor(connectionString: string, tableName = 'audit_log') {
    this.tableName = tableName;
    this.logger = createLogger({ name: 'postgres-audit-store' });
    void this.initializePool(connectionString);
  }

  private async initializePool(connectionString: string): Promise<void> {
    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString,
      max: 10,
    });
  }

  async save(entry: AuditEntry): Promise<void> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
        `INSERT INTO ${this.tableName} (
          id, timestamp, event_type, event_id, aggregate_id, aggregate_type,
          actor_id, actor_type, actor_name, actor_email, actor_ip_address, actor_user_agent, actor_clinic_id,
          action, reason, previous_state, new_state, changed_fields,
          correlation_id, causation_id, metadata, compliance_tags, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          entry.id,
          entry.timestamp,
          entry.eventType,
          entry.eventId,
          entry.aggregateId,
          entry.aggregateType,
          entry.actor.id,
          entry.actor.type,
          entry.actor.name,
          entry.actor.email,
          entry.actor.ipAddress,
          entry.actor.userAgent,
          entry.actor.clinicId,
          entry.action,
          entry.reason,
          entry.previousState ? JSON.stringify(entry.previousState) : null,
          entry.newState ? JSON.stringify(entry.newState) : null,
          entry.changedFields,
          entry.correlationId,
          entry.causationId,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.complianceTags,
          entry.severity,
        ]
      );
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async saveBatch(entries: AuditEntry[]): Promise<void> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string) => Promise<void> }).query('BEGIN');

      for (const entry of entries) {
        await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
          `INSERT INTO ${this.tableName} (
            id, timestamp, event_type, event_id, aggregate_id, aggregate_type,
            actor_id, actor_type, actor_name, actor_email, actor_ip_address, actor_user_agent, actor_clinic_id,
            action, reason, previous_state, new_state, changed_fields,
            correlation_id, causation_id, metadata, compliance_tags, severity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            entry.id,
            entry.timestamp,
            entry.eventType,
            entry.eventId,
            entry.aggregateId,
            entry.aggregateType,
            entry.actor.id,
            entry.actor.type,
            entry.actor.name,
            entry.actor.email,
            entry.actor.ipAddress,
            entry.actor.userAgent,
            entry.actor.clinicId,
            entry.action,
            entry.reason,
            entry.previousState ? JSON.stringify(entry.previousState) : null,
            entry.newState ? JSON.stringify(entry.newState) : null,
            entry.changedFields,
            entry.correlationId,
            entry.causationId,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.complianceTags,
            entry.severity,
          ]
        );
      }

      await (client as { query: (sql: string) => Promise<void> }).query('COMMIT');
      this.logger.debug({ count: entries.length }, 'Audit batch saved');
    } catch (error) {
      await (client as { query: (sql: string) => Promise<void> }).query('ROLLBACK');
      throw error;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async query(options: AuditQueryOptions): Promise<AuditQueryResult> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (options.aggregateId) {
        conditions.push(`aggregate_id = $${paramIndex++}`);
        params.push(options.aggregateId);
      }
      if (options.aggregateType) {
        conditions.push(`aggregate_type = $${paramIndex++}`);
        params.push(options.aggregateType);
      }
      if (options.actorId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        params.push(options.actorId);
      }
      if (options.actorType) {
        conditions.push(`actor_type = $${paramIndex++}`);
        params.push(options.actorType);
      }
      if (options.action) {
        conditions.push(`action = $${paramIndex++}`);
        params.push(options.action);
      }
      if (options.severity) {
        conditions.push(`severity = $${paramIndex++}`);
        params.push(options.severity);
      }
      if (options.startTime) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(options.startTime.toISOString());
      }
      if (options.endTime) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(options.endTime.toISOString());
      }
      if (options.correlationId) {
        conditions.push(`correlation_id = $${paramIndex++}`);
        params.push(options.correlationId);
      }
      if (options.complianceTags && options.complianceTags.length > 0) {
        conditions.push(`compliance_tags && $${paramIndex++}`);
        params.push(options.complianceTags);
      }
      if (options.eventTypes && options.eventTypes.length > 0) {
        conditions.push(`event_type = ANY($${paramIndex++})`);
        params.push(options.eventTypes);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const limit = options.limit ?? 100;
      const offset = options.offset ?? 0;

      // Get total count
      const countResult = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: { count: string }[] }>;
        }
      ).query(`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`, params);

      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      // Get entries
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }
      ).query(
        `SELECT * FROM ${this.tableName} ${whereClause}
         ORDER BY timestamp ${sortOrder}
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      const entries = result.rows.map((row) => this.rowToEntry(row));

      return {
        entries,
        total,
        hasMore: offset + limit < total,
        queryTime: new Date(),
      };
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      // Total count and breakdowns
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }
      ).query(
        `SELECT
          COUNT(*) as total,
          action,
          severity,
          actor_type,
          aggregate_type
         FROM ${this.tableName}
         WHERE timestamp >= $1 AND timestamp <= $2
         GROUP BY action, severity, actor_type, aggregate_type`,
        [startTime.toISOString(), endTime.toISOString()]
      );

      // Aggregate the results
      let totalEntries = 0;
      const byAction: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const byActorType: Record<string, number> = {};
      const byAggregateType: Record<string, number> = {};

      for (const row of result.rows) {
        const count = parseInt(row.total as string, 10);
        totalEntries += count;

        const action = row.action as string;
        byAction[action] = (byAction[action] ?? 0) + count;

        const severity = row.severity as string;
        bySeverity[severity] = (bySeverity[severity] ?? 0) + count;

        const actorType = row.actor_type as string;
        byActorType[actorType] = (byActorType[actorType] ?? 0) + count;

        const aggregateType = row.aggregate_type as string;
        byAggregateType[aggregateType] = (byAggregateType[aggregateType] ?? 0) + count;
      }

      // Get top actors
      const topActorsResult = await (
        client as {
          query: (
            sql: string,
            params: unknown[]
          ) => Promise<{ rows: { actor_id: string; actor_name: string; count: string }[] }>;
        }
      ).query(
        `SELECT actor_id, actor_name, COUNT(*) as count
         FROM ${this.tableName}
         WHERE timestamp >= $1 AND timestamp <= $2
         GROUP BY actor_id, actor_name
         ORDER BY count DESC
         LIMIT 10`,
        [startTime.toISOString(), endTime.toISOString()]
      );

      const topActors = topActorsResult.rows.map((row) => ({
        actorId: row.actor_id,
        actorName: row.actor_name,
        count: parseInt(row.count, 10),
      }));

      // Get top aggregates
      const topAggregatesResult = await (
        client as {
          query: (
            sql: string,
            params: unknown[]
          ) => Promise<{ rows: { aggregate_id: string; aggregate_type: string; count: string }[] }>;
        }
      ).query(
        `SELECT aggregate_id, aggregate_type, COUNT(*) as count
         FROM ${this.tableName}
         WHERE timestamp >= $1 AND timestamp <= $2
         GROUP BY aggregate_id, aggregate_type
         ORDER BY count DESC
         LIMIT 10`,
        [startTime.toISOString(), endTime.toISOString()]
      );

      const topAggregates = topAggregatesResult.rows.map((row) => ({
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        count: parseInt(row.count, 10),
      }));

      return {
        period: { start: startTime, end: endTime },
        totals: {
          totalEntries,
          byAction: byAction as Record<AuditAction, number>,
          bySeverity: bySeverity as Record<AuditSeverity, number>,
          byActorType: byActorType as Record<AuditActor['type'], number>,
          byAggregateType,
        },
        topActors,
        topAggregates,
        complianceAlerts: [], // Would need separate query with UNNEST
      };
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getAggregateAuditTrail(aggregateId: string, aggregateType: string): Promise<AuditEntry[]> {
    const result = await this.query({
      aggregateId,
      aggregateType,
      sortOrder: 'asc',
      limit: 10000,
    });
    return result.entries;
  }

  async getActorAuditTrail(actorId: string): Promise<AuditEntry[]> {
    const result = await this.query({
      actorId,
      sortOrder: 'desc',
      limit: 10000,
    });
    return result.entries;
  }

  async exportToJson(options: AuditQueryOptions): Promise<string> {
    const result = await this.query({ ...options, limit: 10000 });
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        query: options,
        totalEntries: result.total,
        entries: result.entries,
      },
      null,
      2
    );
  }

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      eventType: row.event_type as string,
      eventId: row.event_id as string,
      aggregateId: row.aggregate_id as string,
      aggregateType: row.aggregate_type as string,
      actor: {
        id: row.actor_id as string,
        type: row.actor_type as AuditActor['type'],
        name: row.actor_name as string | undefined,
        email: row.actor_email as string | undefined,
        ipAddress: row.actor_ip_address as string | undefined,
        userAgent: row.actor_user_agent as string | undefined,
        clinicId: row.actor_clinic_id as string | undefined,
      },
      action: row.action as AuditAction,
      reason: row.reason as string | undefined,
      previousState: row.previous_state,
      newState: row.new_state,
      changedFields: row.changed_fields as string[] | undefined,
      correlationId: row.correlation_id as string,
      causationId: row.causation_id as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      complianceTags: row.compliance_tags as string[] | undefined,
      severity: row.severity as AuditSeverity,
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
    }
  }
}

// ============================================================================
// AUDIT TRAIL SERVICE
// ============================================================================

/**
 * Event to action mapping
 */
const EVENT_ACTION_MAP: Record<string, AuditAction> = {
  LeadCreated: 'create',
  LeadScored: 'score',
  LeadQualified: 'update',
  LeadAssigned: 'assign',
  LeadConverted: 'update',
  LeadLost: 'update',
  PatientCreated: 'create',
  PatientUpdated: 'update',
  PatientMerged: 'update',
  AppointmentScheduled: 'schedule',
  AppointmentRescheduled: 'update',
  AppointmentCancelled: 'cancel',
  AppointmentCompleted: 'complete',
  ConsentGranted: 'consent',
  ConsentWithdrawn: 'consent',
  MessageSent: 'create',
  MessageReceived: 'create',
  DataExported: 'export',
  DataImported: 'import',
  UserLoggedIn: 'authenticate',
  UserLoggedOut: 'authenticate',
  PermissionGranted: 'authorize',
  PermissionRevoked: 'authorize',
};

/**
 * Event to severity mapping
 */
const EVENT_SEVERITY_MAP: Record<string, AuditSeverity> = {
  LeadCreated: 'low',
  LeadScored: 'low',
  LeadQualified: 'medium',
  LeadConverted: 'medium',
  LeadLost: 'low',
  PatientCreated: 'medium',
  PatientUpdated: 'medium',
  PatientMerged: 'high',
  ConsentGranted: 'high',
  ConsentWithdrawn: 'critical',
  DataExported: 'high',
  UserLoggedIn: 'low',
  PermissionGranted: 'high',
  PermissionRevoked: 'high',
};

/**
 * Event to compliance tags mapping
 */
const EVENT_COMPLIANCE_MAP: Record<string, string[]> = {
  PatientCreated: ['HIPAA', 'GDPR'],
  PatientUpdated: ['HIPAA', 'GDPR'],
  PatientMerged: ['HIPAA', 'GDPR'],
  ConsentGranted: ['GDPR', 'HIPAA'],
  ConsentWithdrawn: ['GDPR', 'HIPAA'],
  DataExported: ['GDPR', 'HIPAA'],
  MessageSent: ['HIPAA'],
  MessageReceived: ['HIPAA'],
};

/**
 * Main audit trail service
 */
export class AuditTrailService {
  private store: AuditStore;
  private logger: Logger;
  private defaultActor: AuditActor;

  constructor(store: AuditStore, defaultActor?: Partial<AuditActor>) {
    this.store = store;
    this.logger = createLogger({ name: 'audit-trail-service' });
    this.defaultActor = {
      id: 'system',
      type: 'system',
      name: 'System',
      ...defaultActor,
    };
  }

  /**
   * Record an audit entry from a stored event
   */
  async recordFromEvent(
    event: StoredEvent,
    actor?: Partial<AuditActor>,
    options?: {
      reason?: string;
      previousState?: unknown;
      newState?: unknown;
      changedFields?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEntry> {
    const entry = this.createEntryFromEvent(event, actor, options);
    await this.store.save(entry);
    this.logger.debug(
      { entryId: entry.id, eventType: event.type, aggregateId: event.aggregateId },
      'Audit entry recorded'
    );
    return entry;
  }

  /**
   * Record multiple audit entries from events
   */
  async recordBatchFromEvents(
    events: StoredEvent[],
    actor?: Partial<AuditActor>,
    options?: {
      reason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AuditEntry[]> {
    const entries = events.map((event) => this.createEntryFromEvent(event, actor, options));
    await this.store.saveBatch(entries);
    this.logger.debug({ count: entries.length }, 'Audit entries batch recorded');
    return entries;
  }

  /**
   * Create an audit entry (without saving)
   */
  createEntryFromEvent(
    event: StoredEvent,
    actor?: Partial<AuditActor>,
    options?: {
      reason?: string;
      previousState?: unknown;
      newState?: unknown;
      changedFields?: string[];
      metadata?: Record<string, unknown>;
    }
  ): AuditEntry {
    const action = EVENT_ACTION_MAP[event.type] ?? 'update';
    const severity = EVENT_SEVERITY_MAP[event.type] ?? 'low';
    const complianceTags = EVENT_COMPLIANCE_MAP[event.type];

    return {
      id: crypto.randomUUID(),
      timestamp: event.metadata.timestamp,
      eventType: event.type,
      eventId: event.id,
      aggregateId: event.aggregateId ?? '',
      aggregateType: event.aggregateType ?? '',
      actor: { ...this.defaultActor, ...actor },
      action,
      reason: options?.reason,
      previousState: options?.previousState,
      newState: options?.newState ?? event.payload,
      changedFields: options?.changedFields,
      correlationId: event.metadata.correlationId,
      causationId: event.metadata.causationId,
      metadata: options?.metadata,
      complianceTags,
      severity,
    };
  }

  /**
   * Query audit entries
   */
  async query(options: AuditQueryOptions): Promise<AuditQueryResult> {
    return this.store.query(options);
  }

  /**
   * Get summary for a time period
   */
  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    return this.store.getSummary(startTime, endTime);
  }

  /**
   * Get complete audit trail for an aggregate
   */
  async getAggregateAuditTrail(aggregateId: string, aggregateType: string): Promise<AuditEntry[]> {
    return this.store.getAggregateAuditTrail(aggregateId, aggregateType);
  }

  /**
   * Get audit trail for an actor
   */
  async getActorAuditTrail(actorId: string): Promise<AuditEntry[]> {
    return this.store.getActorAuditTrail(actorId);
  }

  /**
   * Export audit entries to JSON (for compliance reports)
   */
  async exportToJson(options: AuditQueryOptions): Promise<string> {
    return this.store.exportToJson(options);
  }

  /**
   * Generate compliance report for a time period
   */
  async generateComplianceReport(
    startTime: Date,
    endTime: Date,
    complianceTags?: string[]
  ): Promise<{
    summary: AuditSummary;
    entries: AuditEntry[];
    generatedAt: Date;
    period: { start: Date; end: Date };
  }> {
    const summary = await this.getSummary(startTime, endTime);
    const result = await this.query({
      startTime,
      endTime,
      complianceTags,
      sortOrder: 'asc',
      limit: 10000,
    });

    return {
      summary,
      entries: result.entries,
      generatedAt: new Date(),
      period: { start: startTime, end: endTime },
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createAuditTrailService(
  store?: AuditStore,
  defaultActor?: Partial<AuditActor>
): AuditTrailService {
  return new AuditTrailService(store ?? new InMemoryAuditStore(), defaultActor);
}

export function createInMemoryAuditStore(): InMemoryAuditStore {
  return new InMemoryAuditStore();
}

export function createPostgresAuditStore(
  connectionString: string,
  tableName?: string
): PostgresAuditStore {
  return new PostgresAuditStore(connectionString, tableName);
}
