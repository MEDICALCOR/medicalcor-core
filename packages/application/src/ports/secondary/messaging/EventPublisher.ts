/**
 * @fileoverview Secondary Port - EventPublisher
 *
 * Defines what the application needs for event publishing (driven side).
 * This is a hexagonal architecture SECONDARY PORT for messaging infrastructure.
 *
 * @module application/ports/secondary/messaging/EventPublisher
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * This port abstracts away the messaging infrastructure (Kafka, RabbitMQ, etc.).
 * Infrastructure adapters implement this interface for specific message brokers.
 */

/**
 * SECONDARY PORT: Event publishing infrastructure
 *
 * This interface defines how the application publishes domain events
 * to external systems. Supports both single and batch publishing.
 *
 * @example
 * ```typescript
 * // Kafka Adapter implementing this port
 * class KafkaEventPublisher implements EventPublisher {
 *   constructor(private kafka: Kafka) {}
 *
 *   async publish(event: DomainEvent): Promise<void> {
 *     const producer = this.kafka.producer();
 *     await producer.send({
 *       topic: `case.${event.eventType}`,
 *       messages: [{ value: JSON.stringify(event) }]
 *     });
 *   }
 * }
 * ```
 */
export interface EventPublisher {
  /**
   * Publish a single domain event
   *
   * @param event - The domain event to publish
   * @throws EventPublishError if publishing fails
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple domain events in a batch
   *
   * Events are published atomically when possible.
   *
   * @param events - Array of domain events to publish
   * @throws EventPublishError if publishing fails
   */
  publishBatch(events: DomainEvent[]): Promise<void>;

  /**
   * Publish an event to a specific topic/channel
   *
   * @param topic - Target topic name
   * @param event - The domain event to publish
   */
  publishTo(topic: string, event: DomainEvent): Promise<void>;

  /**
   * Schedule an event for future publishing
   *
   * @param event - The domain event to schedule
   * @param publishAt - When to publish the event
   * @returns Scheduled event ID for tracking
   */
  schedule(event: DomainEvent, publishAt: Date): Promise<string>;

  /**
   * Cancel a scheduled event
   *
   * @param scheduledEventId - ID of the scheduled event
   * @returns True if cancelled, false if not found
   */
  cancelScheduled(scheduledEventId: string): Promise<boolean>;
}

/**
 * Domain Event Structure
 *
 * Standard event envelope for all domain events.
 * Follows CloudEvents specification patterns.
 */
export interface DomainEvent {
  /** Event type identifier (e.g., 'case.created') */
  eventType: string;

  /** Aggregate/Entity ID that produced the event */
  aggregateId: string;

  /** Aggregate/Entity type */
  aggregateType: string;

  /** Version of the aggregate after this event */
  aggregateVersion: number;

  /** Event-specific data payload */
  eventData: unknown;

  /** Correlation ID for distributed tracing */
  correlationId: string;

  /** ID of the event that caused this event */
  causationId: string | null;

  /** ID of the actor (user/service) that triggered this event */
  actorId: string;

  /** Timestamp when the event occurred */
  occurredAt: Date;

  /** Event schema version for evolution */
  schemaVersion?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Event publishing options
 */
export interface PublishOptions {
  /** Whether to wait for acknowledgment */
  waitForAck?: boolean;

  /** Timeout for acknowledgment (ms) */
  ackTimeoutMs?: number;

  /** Priority level */
  priority?: 'low' | 'normal' | 'high';

  /** Time-to-live in milliseconds */
  ttlMs?: number;

  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Event subscriber interface for receiving events
 */
export interface EventSubscriber {
  /**
   * Subscribe to events of a specific type
   *
   * @param eventType - Event type to subscribe to (supports wildcards)
   * @param handler - Handler function for received events
   * @returns Subscription ID for unsubscribing
   */
  subscribe(
    eventType: string,
    handler: (event: DomainEvent) => Promise<void>
  ): Promise<string>;

  /**
   * Unsubscribe from events
   *
   * @param subscriptionId - ID of the subscription to cancel
   */
  unsubscribe(subscriptionId: string): Promise<void>;
}

/**
 * Factory function for creating domain events
 */
export function createDomainEvent(
  eventType: string,
  aggregateId: string,
  aggregateType: string,
  aggregateVersion: number,
  eventData: unknown,
  correlationId: string,
  actorId: string,
  causationId?: string | null
): DomainEvent {
  return {
    eventType,
    aggregateId,
    aggregateType,
    aggregateVersion,
    eventData,
    correlationId,
    causationId: causationId ?? null,
    actorId,
    occurredAt: new Date(),
  };
}
