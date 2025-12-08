/**
 * M15: Lineage Store Implementations
 *
 * Provides in-memory and PostgreSQL implementations of the LineageStore interface.
 *
 * @module core/data-lineage/stores
 */

import { createLogger, type Logger } from '../logger.js';
import type {
  LineageEntry,
  LineageStore,
  LineageQueryOptions,
  LineageQueryResult,
  LineageGraph,
  LineageNode,
  LineageEdge,
} from './types.js';

// =============================================================================
// IN-MEMORY STORE (Testing/Development)
// =============================================================================

/**
 * In-memory lineage store for development and testing
 */

export class InMemoryLineageStore implements LineageStore {
  private entries: LineageEntry[] = [];
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'in-memory-lineage-store' });
  }

  async save(entry: LineageEntry): Promise<void> {
    this.entries.push(entry);
    this.logger.debug({ entryId: entry.id }, 'Lineage entry saved');
  }

  async saveBatch(entries: LineageEntry[]): Promise<void> {
    this.entries.push(...entries);
    this.logger.debug({ count: entries.length }, 'Lineage batch saved');
  }

  async query(options: LineageQueryOptions): Promise<LineageQueryResult> {
    let filtered = [...this.entries];

    // Apply filters
    if (options.aggregateId) {
      filtered = filtered.filter((e) => e.targetAggregateId === options.aggregateId);
    }
    if (options.aggregateType) {
      filtered = filtered.filter((e) => e.targetAggregateType === options.aggregateType);
    }
    if (options.transformationType) {
      filtered = filtered.filter((e) => e.transformationType === options.transformationType);
    }
    if (options.complianceFramework) {
      filtered = filtered.filter((e) =>
        e.compliance?.frameworks?.includes(options.complianceFramework!)
      );
    }
    if (options.correlationId) {
      filtered = filtered.filter((e) => e.correlationId === options.correlationId);
    }
    if (options.sourceAggregateId) {
      filtered = filtered.filter((e) =>
        e.sources.some((s) => s.aggregateId === options.sourceAggregateId)
      );
    }
    if (options.startTime) {
      filtered = filtered.filter((e) => new Date(e.createdAt) >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter((e) => new Date(e.createdAt) <= options.endTime!);
    }
    if (options.actorId) {
      filtered = filtered.filter((e) => e.actor?.id === options.actorId);
    }
    if (options.service) {
      filtered = filtered.filter((e) => e.processingContext?.service === options.service);
    }
    if (options.minConfidence !== undefined) {
      filtered = filtered.filter(
        (e) => e.quality?.confidence !== undefined && e.quality.confidence >= options.minConfidence!
      );
    }
    if (!options.includeErrors) {
      filtered = filtered.filter(
        (e) => !e.quality?.validationErrors || e.quality.validationErrors.length === 0
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return options.sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });

    // Paginate
    const total = filtered.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      entries: paginated,
      total,
      hasMore: offset + limit < total,
      queryTime: new Date(),
    };
  }

  async getByAggregateId(aggregateId: string, aggregateType: string): Promise<LineageEntry[]> {
    return this.entries.filter(
      (e) => e.targetAggregateId === aggregateId && e.targetAggregateType === aggregateType
    );
  }

  async getByEventId(eventId: string): Promise<LineageEntry[]> {
    return this.entries.filter((e) => e.triggerEventId === eventId);
  }

  async getByCorrelationId(correlationId: string): Promise<LineageEntry[]> {
    return this.entries.filter((e) => e.correlationId === correlationId);
  }

  async getUpstreamSources(aggregateId: string, maxDepth = 10): Promise<LineageGraph> {
    const nodesMap = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();

    await this.traverseUpstream(aggregateId, 0, maxDepth, nodesMap, edges, visited);

    const nodes = Array.from(nodesMap.values());
    return {
      nodes,
      edges,
      rootId: aggregateId,
      direction: 'upstream',
      depth: maxDepth,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        maxDepth,
        uniqueTransformations: new Set(edges.map((e) => e.transformationType)).size,
        uniqueAggregateTypes: new Set(nodes.map((n) => n.type)).size,
      },
    };
  }

  async getDownstreamImpacts(aggregateId: string, maxDepth = 10): Promise<LineageGraph> {
    const nodesMap = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();

    await this.traverseDownstream(aggregateId, 0, maxDepth, nodesMap, edges, visited);

    const nodes = Array.from(nodesMap.values());
    return {
      nodes,
      edges,
      rootId: aggregateId,
      direction: 'downstream',
      depth: maxDepth,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        maxDepth,
        uniqueTransformations: new Set(edges.map((e) => e.transformationType)).size,
        uniqueAggregateTypes: new Set(nodes.map((n) => n.type)).size,
      },
    };
  }

  async deleteByAggregateId(aggregateId: string): Promise<number> {
    const initialLength = this.entries.length;
    this.entries = this.entries.filter(
      (e) =>
        e.targetAggregateId !== aggregateId && !e.sources.some((s) => s.aggregateId === aggregateId)
    );
    const deletedCount = initialLength - this.entries.length;
    this.logger.info({ aggregateId, deletedCount }, 'Lineage entries deleted');
    return deletedCount;
  }

  // For testing
  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }

  private async traverseUpstream(
    aggregateId: string,
    currentDepth: number,
    maxDepth: number,
    nodesMap: Map<string, LineageNode>,
    edges: LineageEdge[],
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(aggregateId) || currentDepth >= maxDepth) return;
    visited.add(aggregateId);

    const entries = this.entries.filter((e) => e.targetAggregateId === aggregateId);

    for (const entry of entries) {
      // Add target node
      const targetKey = `${entry.targetAggregateType}:${entry.targetAggregateId}`;
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(targetKey, {
          id: entry.targetAggregateId,
          type: entry.targetAggregateType,
          label: `${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`,
          complianceTags: entry.compliance?.frameworks,
          sensitivity: entry.compliance?.sensitivity,
        });
      }

      for (const source of entry.sources) {
        const sourceKey = `${source.aggregateType}:${source.aggregateId}`;
        if (!nodesMap.has(sourceKey)) {
          nodesMap.set(sourceKey, {
            id: source.aggregateId,
            type: source.aggregateType,
            label: `${source.aggregateType}:${source.aggregateId.substring(0, 8)}`,
          });
        }

        edges.push({
          sourceId: source.aggregateId,
          targetId: entry.targetAggregateId,
          transformationType: entry.transformationType,
          eventId: entry.triggerEventId,
          eventType: entry.triggerEventType,
          timestamp: new Date(entry.createdAt),
        });

        await this.traverseUpstream(
          source.aggregateId,
          currentDepth + 1,
          maxDepth,
          nodesMap,
          edges,
          visited
        );
      }
    }
  }

  private async traverseDownstream(
    aggregateId: string,
    currentDepth: number,
    maxDepth: number,
    nodesMap: Map<string, LineageNode>,
    edges: LineageEdge[],
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(aggregateId) || currentDepth >= maxDepth) return;
    visited.add(aggregateId);

    const entries = this.entries.filter((e) =>
      e.sources.some((s) => s.aggregateId === aggregateId)
    );

    for (const entry of entries) {
      // Add source node
      for (const source of entry.sources) {
        if (source.aggregateId === aggregateId) {
          const sourceKey = `${source.aggregateType}:${source.aggregateId}`;
          if (!nodesMap.has(sourceKey)) {
            nodesMap.set(sourceKey, {
              id: source.aggregateId,
              type: source.aggregateType,
              label: `${source.aggregateType}:${source.aggregateId.substring(0, 8)}`,
            });
          }
        }
      }

      // Add target node
      const targetKey = `${entry.targetAggregateType}:${entry.targetAggregateId}`;
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(targetKey, {
          id: entry.targetAggregateId,
          type: entry.targetAggregateType,
          label: `${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`,
          complianceTags: entry.compliance?.frameworks,
          sensitivity: entry.compliance?.sensitivity,
        });
      }

      edges.push({
        sourceId: aggregateId,
        targetId: entry.targetAggregateId,
        transformationType: entry.transformationType,
        eventId: entry.triggerEventId,
        eventType: entry.triggerEventType,
        timestamp: new Date(entry.createdAt),
      });

      await this.traverseDownstream(
        entry.targetAggregateId,
        currentDepth + 1,
        maxDepth,
        nodesMap,
        edges,
        visited
      );
    }
  }
}

// =============================================================================
// POSTGRESQL STORE (Production)
// =============================================================================

/**
 * PostgreSQL-backed lineage store for production use
 */
export class PostgresLineageStore implements LineageStore {
  private pool: unknown;
  private logger: Logger;
  private tableName: string;
  private initialized = false;

  constructor(connectionString: string, tableName = 'data_lineage') {
    this.tableName = tableName;
    this.logger = createLogger({ name: 'postgres-lineage-store' });
    void this.initializePool(connectionString);
  }

  private async initializePool(connectionString: string): Promise<void> {
    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString,
      max: 10,
    });
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    while (!this.initialized) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async save(entry: LineageEntry): Promise<void> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
        `INSERT INTO ${this.tableName} (
          id, target_aggregate_id, target_aggregate_type,
          trigger_event_id, trigger_event_type,
          transformation_type, transformation_description,
          sources, quality, compliance, actor,
          correlation_id, causation_id,
          processing_context, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.targetAggregateId,
          entry.targetAggregateType,
          entry.triggerEventId,
          entry.triggerEventType,
          entry.transformationType,
          entry.transformationDescription,
          JSON.stringify(entry.sources),
          entry.quality ? JSON.stringify(entry.quality) : null,
          entry.compliance ? JSON.stringify(entry.compliance) : null,
          entry.actor ? JSON.stringify(entry.actor) : null,
          entry.correlationId,
          entry.causationId,
          entry.processingContext ? JSON.stringify(entry.processingContext) : null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.createdAt,
        ]
      );
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async saveBatch(entries: LineageEntry[]): Promise<void> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string) => Promise<void> }).query('BEGIN');

      for (const entry of entries) {
        await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
          `INSERT INTO ${this.tableName} (
            id, target_aggregate_id, target_aggregate_type,
            trigger_event_id, trigger_event_type,
            transformation_type, transformation_description,
            sources, quality, compliance, actor,
            correlation_id, causation_id,
            processing_context, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING`,
          [
            entry.id,
            entry.targetAggregateId,
            entry.targetAggregateType,
            entry.triggerEventId,
            entry.triggerEventType,
            entry.transformationType,
            entry.transformationDescription,
            JSON.stringify(entry.sources),
            entry.quality ? JSON.stringify(entry.quality) : null,
            entry.compliance ? JSON.stringify(entry.compliance) : null,
            entry.actor ? JSON.stringify(entry.actor) : null,
            entry.correlationId,
            entry.causationId,
            entry.processingContext ? JSON.stringify(entry.processingContext) : null,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.createdAt,
          ]
        );
      }

      await (client as { query: (sql: string) => Promise<void> }).query('COMMIT');
      this.logger.debug({ count: entries.length }, 'Lineage batch saved');
    } catch (error) {
      await (client as { query: (sql: string) => Promise<void> }).query('ROLLBACK');
      throw error;
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async query(options: LineageQueryOptions): Promise<LineageQueryResult> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (options.aggregateId) {
        conditions.push(`target_aggregate_id = $${paramIndex++}`);
        params.push(options.aggregateId);
      }
      if (options.aggregateType) {
        conditions.push(`target_aggregate_type = $${paramIndex++}`);
        params.push(options.aggregateType);
      }
      if (options.transformationType) {
        conditions.push(`transformation_type = $${paramIndex++}`);
        params.push(options.transformationType);
      }
      if (options.complianceFramework) {
        conditions.push(`compliance->'frameworks' ? $${paramIndex++}`);
        params.push(options.complianceFramework);
      }
      if (options.correlationId) {
        conditions.push(`correlation_id = $${paramIndex++}`);
        params.push(options.correlationId);
      }
      if (options.sourceAggregateId) {
        conditions.push(`sources @> $${paramIndex++}::jsonb`);
        params.push(JSON.stringify([{ aggregateId: options.sourceAggregateId }]));
      }
      if (options.startTime) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(options.startTime.toISOString());
      }
      if (options.endTime) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(options.endTime.toISOString());
      }
      if (options.actorId) {
        conditions.push(`actor->>'id' = $${paramIndex++}`);
        params.push(options.actorId);
      }
      if (options.service) {
        conditions.push(`processing_context->>'service' = $${paramIndex++}`);
        params.push(options.service);
      }
      if (options.minConfidence !== undefined) {
        conditions.push(`(quality->>'confidence')::float >= $${paramIndex++}`);
        params.push(options.minConfidence);
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
         ORDER BY created_at ${sortOrder}
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

  async getByAggregateId(aggregateId: string, aggregateType: string): Promise<LineageEntry[]> {
    const result = await this.query({
      aggregateId,
      aggregateType,
      sortOrder: 'asc',
      limit: 10000,
    });
    return result.entries;
  }

  async getByEventId(eventId: string): Promise<LineageEntry[]> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }
      ).query(`SELECT * FROM ${this.tableName} WHERE trigger_event_id = $1`, [eventId]);

      return result.rows.map((row) => this.rowToEntry(row));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByCorrelationId(correlationId: string): Promise<LineageEntry[]> {
    const result = await this.query({
      correlationId,
      sortOrder: 'asc',
      limit: 10000,
    });
    return result.entries;
  }

  async getUpstreamSources(aggregateId: string, maxDepth = 10): Promise<LineageGraph> {
    // Use recursive CTE for efficient traversal
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }
      ).query(
        `WITH RECURSIVE upstream AS (
          -- Base case: direct sources
          SELECT
            l.*,
            1 as depth,
            ARRAY[l.target_aggregate_id] as path
          FROM ${this.tableName} l
          WHERE l.target_aggregate_id = $1

          UNION ALL

          -- Recursive case: sources of sources
          SELECT
            l.*,
            u.depth + 1,
            u.path || l.target_aggregate_id
          FROM ${this.tableName} l
          INNER JOIN upstream u ON l.target_aggregate_id = ANY(
            SELECT (s->>'aggregateId')::text
            FROM jsonb_array_elements(u.sources) s
          )
          WHERE u.depth < $2
            AND NOT l.target_aggregate_id = ANY(u.path) -- Prevent cycles
        )
        SELECT DISTINCT * FROM upstream`,
        [aggregateId, maxDepth]
      );

      return this.buildGraphFromRows(result.rows, aggregateId, 'upstream', maxDepth);
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getDownstreamImpacts(aggregateId: string, maxDepth = 10): Promise<LineageGraph> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        }
      ).query(
        `WITH RECURSIVE downstream AS (
          -- Base case: entries where this aggregate is a source
          SELECT
            l.*,
            1 as depth,
            ARRAY[l.target_aggregate_id] as path
          FROM ${this.tableName} l
          WHERE l.sources @> $1::jsonb

          UNION ALL

          -- Recursive case: downstream of downstream
          SELECT
            l.*,
            d.depth + 1,
            d.path || l.target_aggregate_id
          FROM ${this.tableName} l
          INNER JOIN downstream d ON l.sources @> jsonb_build_array(jsonb_build_object('aggregateId', d.target_aggregate_id))
          WHERE d.depth < $2
            AND NOT l.target_aggregate_id = ANY(d.path) -- Prevent cycles
        )
        SELECT DISTINCT * FROM downstream`,
        [JSON.stringify([{ aggregateId }]), maxDepth]
      );

      return this.buildGraphFromRows(result.rows, aggregateId, 'downstream', maxDepth);
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async deleteByAggregateId(aggregateId: string): Promise<number> {
    await this.ensureInitialized();
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      const result = await (
        client as {
          query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }>;
        }
      ).query(
        `DELETE FROM ${this.tableName}
         WHERE target_aggregate_id = $1
           OR sources @> $2::jsonb`,
        [aggregateId, JSON.stringify([{ aggregateId }])]
      );

      this.logger.info({ aggregateId, deletedCount: result.rowCount }, 'Lineage entries deleted');
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

  private rowToEntry(row: Record<string, unknown>): LineageEntry {
    return {
      id: row.id as string,
      targetAggregateId: row.target_aggregate_id as string,
      targetAggregateType: row.target_aggregate_type as string,
      triggerEventId: row.trigger_event_id as string,
      triggerEventType: row.trigger_event_type as string,
      transformationType: row.transformation_type as LineageEntry['transformationType'],
      transformationDescription: row.transformation_description as string | undefined,
      sources: (row.sources as LineageEntry['sources'] | null) ?? [],
      quality: row.quality as LineageEntry['quality'],
      compliance: row.compliance as LineageEntry['compliance'],
      actor: row.actor as LineageEntry['actor'],
      correlationId: row.correlation_id as string,
      causationId: row.causation_id as string | undefined,
      processingContext: row.processing_context as LineageEntry['processingContext'],
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  private buildGraphFromRows(
    rows: Record<string, unknown>[],
    rootId: string,
    direction: 'upstream' | 'downstream',
    maxDepth: number
  ): LineageGraph {
    const nodesMap = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];

    for (const row of rows) {
      const entry = this.rowToEntry(row);

      // Add target node
      const targetKey = `${entry.targetAggregateType}:${entry.targetAggregateId}`;
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(targetKey, {
          id: entry.targetAggregateId,
          type: entry.targetAggregateType,
          label: `${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`,
          complianceTags: entry.compliance?.frameworks,
          sensitivity: entry.compliance?.sensitivity,
        });
      }

      // Add source nodes and edges
      for (const source of entry.sources) {
        const sourceKey = `${source.aggregateType}:${source.aggregateId}`;
        if (!nodesMap.has(sourceKey)) {
          nodesMap.set(sourceKey, {
            id: source.aggregateId,
            type: source.aggregateType,
            label: `${source.aggregateType}:${source.aggregateId.substring(0, 8)}`,
          });
        }

        edges.push({
          sourceId: source.aggregateId,
          targetId: entry.targetAggregateId,
          transformationType: entry.transformationType,
          eventId: entry.triggerEventId,
          eventType: entry.triggerEventType,
          timestamp: new Date(entry.createdAt),
        });
      }
    }

    const nodes = Array.from(nodesMap.values());

    return {
      nodes,
      edges,
      rootId,
      direction,
      depth: maxDepth,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        maxDepth,
        uniqueTransformations: new Set(edges.map((e) => e.transformationType)).size,
        uniqueAggregateTypes: new Set(nodes.map((n) => n.type)).size,
      },
    };
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an in-memory lineage store (for testing/development)
 */
export function createInMemoryLineageStore(): InMemoryLineageStore {
  return new InMemoryLineageStore();
}

/**
 * Create a PostgreSQL lineage store (for production)
 */
export function createPostgresLineageStore(
  connectionString: string,
  tableName?: string
): PostgresLineageStore {
  return new PostgresLineageStore(connectionString, tableName);
}

/**
 * Create a lineage store based on environment
 */
export function createLineageStore(options?: {
  connectionString?: string;
  tableName?: string;
}): LineageStore {
  if (options?.connectionString) {
    return createPostgresLineageStore(options.connectionString, options.tableName);
  }
  return createInMemoryLineageStore();
}
