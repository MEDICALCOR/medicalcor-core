/**
 * @module architecture/domain/domain-event
 *
 * Domain Event Infrastructure
 * ===========================
 *
 * Domain Events capture facts about things that happened in the domain.
 * They are immutable records that can be used for:
 * - Event Sourcing
 * - Integration between bounded contexts
 * - Audit trails
 */

import type { DomainEvent as IDomainEvent, EventMetadata } from '../layers/contracts.js';

// ============================================================================
// DOMAIN EVENT BASE CLASS
// ============================================================================

/**
 * Abstract base class for all domain events
 */
export abstract class DomainEventBase<TPayload = unknown> implements IDomainEvent {
  readonly __layer = 'domain' as const;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;

  constructor(params: {
    eventId?: string;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    version: number;
    occurredAt?: Date;
    payload: TPayload;
    metadata: Partial<EventMetadata>;
  }) {
    this.eventId = params.eventId ?? crypto.randomUUID();
    this.eventType = params.eventType;
    this.aggregateId = params.aggregateId;
    this.aggregateType = params.aggregateType;
    this.version = params.version;
    this.occurredAt = params.occurredAt ?? new Date();
    this.payload = Object.freeze(params.payload) as TPayload;
    this.metadata = Object.freeze({
      correlationId: params.metadata.correlationId ?? crypto.randomUUID(),
      causationId: params.metadata.causationId,
      userId: params.metadata.userId,
      tenantId: params.metadata.tenantId,
      source: params.metadata.source ?? 'unknown',
      timestamp: params.metadata.timestamp ?? new Date().toISOString(),
    });

    Object.freeze(this);
  }

  /**
   * Get a human-readable description of the event
   */
  abstract describe(): string;

  /**
   * JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      version: this.version,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.payload,
      metadata: this.metadata,
    };
  }

  /**
   * String representation
   */
  toString(): string {
    return `${this.eventType}[${this.eventId}] - ${this.describe()}`;
  }
}

// ============================================================================
// EVENT FACTORY
// ============================================================================

/**
 * Factory for creating domain events with proper metadata
 */
export class DomainEventFactory {
  private source: string;
  private defaultMetadata: Partial<EventMetadata>;

  constructor(source: string, defaultMetadata: Partial<EventMetadata> = {}) {
    this.source = source;
    this.defaultMetadata = defaultMetadata;
  }

  /**
   * Create an event with standard metadata
   */
  create<TPayload>(
    eventType: string,
    aggregateId: string,
    aggregateType: string,
    version: number,
    payload: TPayload,
    metadata: Partial<EventMetadata> = {}
  ): IDomainEvent {
    return {
      __layer: 'domain',
      eventId: crypto.randomUUID(),
      eventType,
      aggregateId,
      aggregateType,
      version,
      occurredAt: new Date(),
      payload,
      metadata: {
        correlationId:
          metadata.correlationId ?? this.defaultMetadata.correlationId ?? crypto.randomUUID(),
        causationId: metadata.causationId ?? this.defaultMetadata.causationId,
        userId: metadata.userId ?? this.defaultMetadata.userId,
        tenantId: metadata.tenantId ?? this.defaultMetadata.tenantId,
        source: this.source,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Create a follow-up event (causation chain)
   */
  createFollowUp<TPayload>(
    previousEvent: IDomainEvent,
    eventType: string,
    aggregateId: string,
    aggregateType: string,
    version: number,
    payload: TPayload
  ): IDomainEvent {
    return this.create(eventType, aggregateId, aggregateType, version, payload, {
      correlationId: previousEvent.metadata.correlationId,
      causationId: previousEvent.eventId,
      userId: previousEvent.metadata.userId,
      tenantId: previousEvent.metadata.tenantId,
    });
  }

  /**
   * Set context for all events created by this factory
   */
  withContext(metadata: Partial<EventMetadata>): DomainEventFactory {
    return new DomainEventFactory(this.source, {
      ...this.defaultMetadata,
      ...metadata,
    });
  }
}

// ============================================================================
// EVENT TYPE REGISTRY
// ============================================================================

/**
 * Registry for event types and their schemas
 */
export class EventTypeRegistry {
  private registry = new Map<string, EventTypeDefinition>();

  /**
   * Register an event type
   */
  register<TPayload>(eventType: string, definition: EventTypeDefinition<TPayload>): void {
    this.registry.set(eventType, definition as EventTypeDefinition);
  }

  /**
   * Get event type definition
   */
  get(eventType: string): EventTypeDefinition | undefined {
    return this.registry.get(eventType);
  }

  /**
   * Validate an event against its schema
   */
  validate(event: IDomainEvent): ValidationResult {
    const definition = this.registry.get(event.eventType);
    if (!definition) {
      return { valid: false, errors: [`Unknown event type: ${event.eventType}`] };
    }

    if (definition.validator) {
      return definition.validator(event.payload);
    }

    return { valid: true, errors: [] };
  }

  /**
   * Get all registered event types
   */
  getEventTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}

export interface EventTypeDefinition<TPayload = unknown> {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly description: string;
  readonly schemaVersion: number;
  readonly validator?: (payload: unknown) => ValidationResult;
  readonly upcaster?: (oldPayload: unknown, oldVersion: number) => TPayload;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

// Singleton registry
export const eventTypeRegistry = new EventTypeRegistry();

// ============================================================================
// EVENT UPCASTING
// ============================================================================

/**
 * Upcast an event from an older schema version to the current version
 */
export interface EventUpcaster<TOld, TNew> {
  readonly fromVersion: number;
  readonly toVersion: number;
  upcast(oldPayload: TOld): TNew;
}

/**
 * Chain of upcasters for progressive migration
 */
export class UpcasterChain<TPayload> {
  private upcasters: EventUpcaster<unknown, unknown>[] = [];

  add<TOld, TNew>(upcaster: EventUpcaster<TOld, TNew>): this {
    this.upcasters.push(upcaster as EventUpcaster<unknown, unknown>);
    this.upcasters.sort((a, b) => a.fromVersion - b.fromVersion);
    return this;
  }

  upcast(payload: unknown, fromVersion: number, toVersion: number): TPayload {
    let result = payload;
    let currentVersion = fromVersion;

    for (const upcaster of this.upcasters) {
      if (upcaster.fromVersion >= currentVersion && upcaster.toVersion <= toVersion) {
        result = upcaster.upcast(result);
        currentVersion = upcaster.toVersion;
      }
    }

    return result as TPayload;
  }
}

// ============================================================================
// EVENT ENVELOPE
// ============================================================================

/**
 * Envelope for serializing/deserializing events
 */
export interface EventEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly payload: string; // JSON serialized
  readonly metadata: string; // JSON serialized
  readonly schemaVersion: number;
}

/**
 * Serialize an event to envelope format
 */
export function serializeEvent(event: IDomainEvent, schemaVersion = 1): EventEnvelope {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    aggregateType: event.aggregateType,
    version: event.version,
    occurredAt: event.occurredAt.toISOString(),
    payload: JSON.stringify(event.payload),
    metadata: JSON.stringify(event.metadata),
    schemaVersion,
  };
}

/**
 * Deserialize an event from envelope format
 */
export function deserializeEvent(envelope: EventEnvelope): IDomainEvent {
  return {
    __layer: 'domain',
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    aggregateId: envelope.aggregateId,
    aggregateType: envelope.aggregateType,
    version: envelope.version,
    occurredAt: new Date(envelope.occurredAt),
    payload: JSON.parse(envelope.payload),
    metadata: JSON.parse(envelope.metadata),
  };
}

// ============================================================================
// EVENT UTILITIES
// ============================================================================

/**
 * Filter events by type
 */
export function filterByType<TEvent extends IDomainEvent>(
  events: IDomainEvent[],
  eventType: string
): TEvent[] {
  return events.filter((e) => e.eventType === eventType) as TEvent[];
}

/**
 * Filter events by aggregate
 */
export function filterByAggregate(events: IDomainEvent[], aggregateId: string): IDomainEvent[] {
  return events.filter((e) => e.aggregateId === aggregateId);
}

/**
 * Get the latest event for an aggregate
 */
export function getLatestEvent(
  events: IDomainEvent[],
  aggregateId: string
): IDomainEvent | undefined {
  const aggregateEvents = filterByAggregate(events, aggregateId);
  return aggregateEvents.reduce<IDomainEvent | undefined>(
    (latest, current) => (!latest || current.version > latest.version ? current : latest),
    undefined
  );
}

/**
 * Order events by version
 */
export function orderByVersion(events: IDomainEvent[]): IDomainEvent[] {
  return [...events].sort((a, b) => a.version - b.version);
}

/**
 * Order events by timestamp
 */
export function orderByTimestamp(events: IDomainEvent[]): IDomainEvent[] {
  return [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
