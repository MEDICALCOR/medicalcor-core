/**
 * Schema-Validated Event Store
 *
 * Wraps the base EventStore to provide:
 * - Event payload validation before storage
 * - Automatic event version tagging
 * - Event upcasting during replay
 * - Schema violation tracking
 *
 * This ensures data integrity by preventing malformed events from
 * entering the event store and corrupting projections.
 */

import type { StoredEvent, EventStore, EventPublisher } from '../event-store.js';
import { type EventSchemaRegistry, eventSchemaRegistry } from './event-schema-registry.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SchemaValidatedEventStoreConfig {
  /** Fail on schema validation errors (default: true) */
  strictValidation: boolean;
  /** Enable automatic event version tagging (default: true) */
  autoVersionTag: boolean;
  /** Enable event upcasting during getByAggregateId (default: true) */
  upcastOnRead: boolean;
  /** Log schema violations (default: true) */
  logViolations: boolean;
}

export interface SchemaViolation {
  eventId: string;
  eventType: string;
  version: number;
  error: string;
  timestamp: Date;
  payload: unknown;
}

const DEFAULT_CONFIG: SchemaValidatedEventStoreConfig = {
  strictValidation: true,
  autoVersionTag: true,
  upcastOnRead: true,
  logViolations: true,
};

// ============================================================================
// SCHEMA-VALIDATED EVENT STORE
// ============================================================================

export class SchemaValidatedEventStore {
  private readonly eventStore: EventStore;
  private readonly registry: EventSchemaRegistry;
  private readonly config: SchemaValidatedEventStoreConfig;
  private readonly logger: Logger;
  private readonly violations: SchemaViolation[] = [];

  constructor(
    eventStore: EventStore,
    registry: EventSchemaRegistry = eventSchemaRegistry,
    config: Partial<SchemaValidatedEventStoreConfig> = {}
  ) {
    this.eventStore = eventStore;
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger({ name: 'schema-validated-event-store' });
  }

  /**
   * Add an event publisher (delegates to underlying store)
   */
  addPublisher(publisher: EventPublisher): void {
    this.eventStore.addPublisher(publisher);
  }

  /**
   * Emit a domain event with schema validation
   */
  async emit(input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
    version?: number;
    causationId?: string;
    idempotencyKey?: string;
  }): Promise<StoredEvent> {
    const eventType = input.type;
    const schemaVersion = this.registry.getLatestVersion(eventType);

    // Validate payload against schema
    const validation = this.registry.validate(eventType, schemaVersion, input.payload);

    if (!validation.valid) {
      this.recordViolation({
        eventId: '', // Not yet assigned
        eventType,
        version: schemaVersion,
        error: validation.error ?? 'Unknown validation error',
        timestamp: new Date(),
        payload: input.payload,
      });

      if (this.config.strictValidation) {
        throw new EventSchemaValidationError(
          `Schema validation failed for event "${eventType}" v${schemaVersion}: ${validation.error}`,
          eventType,
          schemaVersion,
          validation.error ?? 'Unknown error'
        );
      }
    }

    // Add schema version to payload metadata if auto-versioning enabled
    const enrichedPayload = this.config.autoVersionTag
      ? {
          ...input.payload,
          __schemaVersion: schemaVersion,
        }
      : input.payload;

    return this.eventStore.emit({
      ...input,
      payload: enrichedPayload,
    });
  }

  /**
   * Get events by correlation ID
   */
  async getByCorrelationId(correlationId: string): Promise<StoredEvent[]> {
    const events = await this.eventStore.getByCorrelationId(correlationId);
    return this.config.upcastOnRead ? this.upcastEvents(events) : events;
  }

  /**
   * Get events by aggregate ID with optional upcasting
   */
  async getByAggregateId(aggregateId: string, afterVersion?: number): Promise<StoredEvent[]> {
    const events = await this.eventStore.getByAggregateId(aggregateId, afterVersion);
    return this.config.upcastOnRead ? this.upcastEvents(events) : events;
  }

  /**
   * Get events by type
   */
  async getByType(type: string, limit?: number): Promise<StoredEvent[]> {
    const events = await this.eventStore.getByType(type, limit);
    return this.config.upcastOnRead ? this.upcastEvents(events) : events;
  }

  /**
   * Upcast events to their latest schema versions
   */
  private upcastEvents(events: StoredEvent[]): StoredEvent[] {
    return events.map((event) => this.upcastEvent(event));
  }

  /**
   * Upcast a single event to its latest schema version
   */
  private upcastEvent(event: StoredEvent): StoredEvent {
    const eventType = event.type;

    // Determine event's schema version
    const payloadVersion = (event.payload as { __schemaVersion?: number }).__schemaVersion ?? 1;
    const latestVersion = this.registry.getLatestVersion(eventType);

    // No migration needed if already at latest
    if (payloadVersion >= latestVersion) {
      return event;
    }

    // Migrate payload
    const migration = this.registry.migrate(
      eventType,
      payloadVersion,
      latestVersion,
      event.payload
    );

    if (!migration.success) {
      this.logger.warn(
        {
          eventId: event.id,
          eventType,
          fromVersion: payloadVersion,
          toVersion: latestVersion,
          error: migration.error,
        },
        'Event migration failed, returning original payload'
      );
      return event;
    }

    // Return event with migrated payload
    return {
      ...event,
      payload: {
        ...(migration.payload as Record<string, unknown>),
        __schemaVersion: latestVersion,
        __migratedFrom: payloadVersion,
      },
    };
  }

  /**
   * Record a schema violation
   */
  private recordViolation(violation: SchemaViolation): void {
    this.violations.push(violation);

    // Keep only last 1000 violations
    if (this.violations.length > 1000) {
      this.violations.shift();
    }

    if (this.config.logViolations) {
      this.logger.warn(
        {
          eventType: violation.eventType,
          version: violation.version,
          error: violation.error,
        },
        'Schema validation violation'
      );
    }
  }

  /**
   * Get recorded schema violations
   */
  getViolations(): SchemaViolation[] {
    return [...this.violations];
  }

  /**
   * Clear recorded violations
   */
  clearViolations(): void {
    this.violations.length = 0;
  }

  /**
   * Get the underlying event store
   */
  getUnderlyingStore(): EventStore {
    return this.eventStore;
  }

  /**
   * Get the schema registry
   */
  getRegistry(): EventSchemaRegistry {
    return this.registry;
  }
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

export class EventSchemaValidationError extends Error {
  public readonly code = 'EVENT_SCHEMA_VALIDATION_ERROR';
  public readonly eventType: string;
  public readonly schemaVersion: number;
  public readonly validationError: string;

  constructor(message: string, eventType: string, schemaVersion: number, validationError: string) {
    super(message);
    this.name = 'EventSchemaValidationError';
    this.eventType = eventType;
    this.schemaVersion = schemaVersion;
    this.validationError = validationError;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a schema-validated event store
 */
export function createSchemaValidatedEventStore(
  eventStore: EventStore,
  registry?: EventSchemaRegistry,
  config?: Partial<SchemaValidatedEventStoreConfig>
): SchemaValidatedEventStore {
  return new SchemaValidatedEventStore(eventStore, registry, config);
}

/**
 * Wrap an existing event store with schema validation
 */
export function withSchemaValidation(
  eventStore: EventStore,
  options?: {
    registry?: EventSchemaRegistry;
    strictValidation?: boolean;
    upcastOnRead?: boolean;
  }
): SchemaValidatedEventStore {
  return new SchemaValidatedEventStore(eventStore, options?.registry, {
    strictValidation: options?.strictValidation ?? true,
    upcastOnRead: options?.upcastOnRead ?? true,
  });
}
