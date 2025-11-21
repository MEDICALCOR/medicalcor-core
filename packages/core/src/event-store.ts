import { v4 as uuidv4 } from 'uuid';
import { createLogger, type Logger } from './logger.js';

/**
 * Event Store - Durable event persistence and publishing
 * Provides event sourcing capabilities for domain events
 */

export interface EventStoreConfig {
  connectionString: string | undefined;
  tableName: string | undefined;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export interface EventStoreRepository {
  append(event: StoredEvent): Promise<void>;
  getByCorrelationId(correlationId: string): Promise<StoredEvent[]>;
  getByAggregateId(aggregateId: string, afterVersion?: number): Promise<StoredEvent[]>;
  getByType(type: string, limit?: number): Promise<StoredEvent[]>;
}

export interface StoredEventMetadata {
  correlationId: string;
  causationId: string | undefined;
  idempotencyKey: string;
  timestamp: string;
  source: string;
}

export interface StoredEvent {
  id: string;
  type: string;
  aggregateId: string | undefined;
  aggregateType: string | undefined;
  version: number | undefined;
  payload: Record<string, unknown>;
  metadata: StoredEventMetadata;
}

export interface EventPublisher {
  publish(event: StoredEvent): Promise<void>;
}

/**
 * In-memory event store implementation (for development/testing)
 */
export class InMemoryEventStore implements EventStoreRepository {
  private events: StoredEvent[] = [];

  async append(event: StoredEvent): Promise<void> {
    this.events.push(event);
  }

  async getByCorrelationId(correlationId: string): Promise<StoredEvent[]> {
    return this.events.filter(e => e.metadata.correlationId === correlationId);
  }

  async getByAggregateId(aggregateId: string, afterVersion?: number): Promise<StoredEvent[]> {
    return this.events
      .filter(e => e.aggregateId === aggregateId)
      .filter(e => afterVersion === undefined || (e.version ?? 0) > afterVersion)
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
  }

  async getByType(type: string, limit = 100): Promise<StoredEvent[]> {
    return this.events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  // For testing
  getAll(): StoredEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * PostgreSQL event store implementation
 */
export class PostgresEventStore implements EventStoreRepository {
  private config: EventStoreConfig;
  private logger: Logger;
  private pool: unknown; // pg.Pool - imported dynamically

  constructor(config: EventStoreConfig) {
    this.config = config;
    this.logger = createLogger({ name: 'event-store' });
  }

  private get tableName(): string {
    return this.config.tableName ?? 'domain_events';
  }

  async initialize(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error('PostgreSQL connection string required');
    }

    // Dynamic import to avoid requiring pg in environments that don't need it
    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString: this.config.connectionString,
      max: 10,
    });

    // Create table if not exists
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();
    try {
      await (client as { query: (sql: string) => Promise<void> }).query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY,
          type VARCHAR(255) NOT NULL,
          aggregate_id VARCHAR(255),
          aggregate_type VARCHAR(255),
          version INTEGER,
          payload JSONB NOT NULL,
          correlation_id VARCHAR(255) NOT NULL,
          causation_id VARCHAR(255),
          idempotency_key VARCHAR(255) UNIQUE NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON ${this.tableName} (correlation_id);
        CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON ${this.tableName} (aggregate_id);
        CREATE INDEX IF NOT EXISTS idx_events_type ON ${this.tableName} (type);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON ${this.tableName} (timestamp);
      `);
    } finally {
      (client as { release: () => void }).release();
    }

    this.logger.info('Event store initialized');
  }

  async append(event: StoredEvent): Promise<void> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      await (client as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
        `INSERT INTO ${this.tableName}
         (id, type, aggregate_id, aggregate_type, version, payload, correlation_id, causation_id, idempotency_key, timestamp, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          event.id,
          event.type,
          event.aggregateId,
          event.aggregateType,
          event.version,
          JSON.stringify(event.payload),
          event.metadata.correlationId,
          event.metadata.causationId,
          event.metadata.idempotencyKey,
          event.metadata.timestamp,
          event.metadata.source,
        ]
      );
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByCorrelationId(correlationId: string): Promise<StoredEvent[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
        `SELECT * FROM ${this.tableName} WHERE correlation_id = $1 ORDER BY timestamp ASC`,
        [correlationId]
      );
      return result.rows.map((row) => this.rowToEvent(row as Record<string, unknown>));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByAggregateId(aggregateId: string, afterVersion?: number): Promise<StoredEvent[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const params: unknown[] = [aggregateId];
      let sql = `SELECT * FROM ${this.tableName} WHERE aggregate_id = $1`;

      if (afterVersion !== undefined) {
        sql += ` AND version > $2`;
        params.push(afterVersion);
      }

      sql += ` ORDER BY version ASC`;

      const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(sql, params);
      return result.rows.map((row) => this.rowToEvent(row as Record<string, unknown>));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  async getByType(type: string, limit = 100): Promise<StoredEvent[]> {
    const client = await (this.pool as { connect: () => Promise<unknown> }).connect();

    try {
      const result = await (client as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
        `SELECT * FROM ${this.tableName} WHERE type = $1 ORDER BY timestamp DESC LIMIT $2`,
        [type, limit]
      );
      return result.rows.map((row) => this.rowToEvent(row as Record<string, unknown>));
    } finally {
      (client as { release: () => void }).release();
    }
  }

  private rowToEvent(row: Record<string, unknown>): StoredEvent {
    const causationId = row['causation_id'];
    return {
      id: row['id'] as string,
      type: row['type'] as string,
      aggregateId: (row['aggregate_id'] as string | null) ?? undefined,
      aggregateType: (row['aggregate_type'] as string | null) ?? undefined,
      version: (row['version'] as number | null) ?? undefined,
      payload: row['payload'] as Record<string, unknown>,
      metadata: {
        correlationId: row['correlation_id'] as string,
        causationId: typeof causationId === 'string' ? causationId : undefined,
        idempotencyKey: row['idempotency_key'] as string,
        timestamp: (row['timestamp'] as Date).toISOString(),
        source: row['source'] as string,
      },
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
    }
  }
}

/**
 * Event Store Service - Main interface for event operations
 */
export class EventStore {
  private repository: EventStoreRepository;
  private publishers: EventPublisher[] = [];
  private logger: Logger;
  private source: string;

  constructor(
    repository: EventStoreRepository,
    options: { source: string }
  ) {
    this.repository = repository;
    this.source = options.source;
    this.logger = createLogger({ name: 'event-store' });
  }

  /**
   * Add an event publisher (for real-time event distribution)
   */
  addPublisher(publisher: EventPublisher): void {
    this.publishers.push(publisher);
  }

  /**
   * Emit a domain event
   */
  async emit<T extends Record<string, unknown>>(input: {
    type: string;
    correlationId: string;
    payload: T;
    aggregateId?: string;
    aggregateType?: string;
    version?: number;
    causationId?: string;
    idempotencyKey?: string;
  }): Promise<StoredEvent> {
    const event: StoredEvent = {
      id: uuidv4(),
      type: input.type,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      version: input.version,
      payload: input.payload,
      metadata: {
        correlationId: input.correlationId,
        causationId: input.causationId,
        idempotencyKey: input.idempotencyKey ?? `${input.type}:${input.correlationId}:${Date.now()}`,
        timestamp: new Date().toISOString(),
        source: this.source,
      },
    };

    // Persist event
    await this.repository.append(event);
    this.logger.debug({ eventId: event.id, type: event.type }, 'Event stored');

    // Publish to all publishers (fire and forget)
    for (const publisher of this.publishers) {
      publisher.publish(event).catch(err => {
        this.logger.error({ err, eventId: event.id }, 'Failed to publish event');
      });
    }

    return event;
  }

  /**
   * Get events by correlation ID
   */
  async getByCorrelationId(correlationId: string): Promise<StoredEvent[]> {
    return this.repository.getByCorrelationId(correlationId);
  }

  /**
   * Get events by aggregate ID
   */
  async getByAggregateId(aggregateId: string, afterVersion?: number): Promise<StoredEvent[]> {
    return this.repository.getByAggregateId(aggregateId, afterVersion);
  }

  /**
   * Get events by type
   */
  async getByType(type: string, limit?: number): Promise<StoredEvent[]> {
    return this.repository.getByType(type, limit);
  }
}

/**
 * Create an event store with the appropriate repository
 */
export function createEventStore(options: {
  source: string;
  connectionString?: string;
  tableName?: string;
}): EventStore {
  const repository = options.connectionString
    ? new PostgresEventStore({
        connectionString: options.connectionString,
        tableName: options.tableName,
      })
    : new InMemoryEventStore();

  return new EventStore(repository, { source: options.source });
}

/**
 * Create an in-memory event store (for testing)
 */
export function createInMemoryEventStore(source: string): EventStore {
  return new EventStore(new InMemoryEventStore(), { source });
}
