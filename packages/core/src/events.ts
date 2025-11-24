/**
 * Domain Event helpers for event-driven architecture
 */

import { randomUUID } from 'node:crypto';

/**
 * Event metadata included with every domain event
 */
export interface EventMetadata {
  /** Unique event ID */
  eventId: string;
  /** Event timestamp */
  timestamp: Date;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID (ID of event that caused this one) */
  causationId?: string;
  /** Service that emitted the event */
  source: string;
  /** Event schema version */
  version: number;
}

/**
 * Base domain event structure
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  /** Event type identifier */
  type: TType;
  /** Event payload */
  payload: TPayload;
  /** Event metadata */
  metadata: EventMetadata;
}

/**
 * Options for creating a domain event
 */
export interface CreateEventOptions {
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID (ID of event that caused this one) */
  causationId?: string;
  /** Service name (defaults to SERVCE_NAME env var) */
  source?: string;
  /** Schema version (defaults to 1) */
  version?: number;
}

/**
 * Create a domain event with proper metadata
 *
 * @param type - Event type identifier
 * @param payload - Event payload data
 * @param options - Additional event options
 * @returns Complete domain event with metadata
 */
export function createDomainEvent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  options: CreateEventOptions = {}
): DomainEvent<TType, TPayload> {
  const {
    correlationId,
    causationId,
    source = process.env.SERVICE_NAME ?? 'medicalcor',
    version = 1,
  } = options;

  const metadata: EventMetadata = {
    eventId: randomUUID(),
    timestamp: new Date(),
    source,
    version,
  };

  // Only add optional fields if they have values (exactOptionalPropertyTypes compliance)
  if (correlationId !== undefined) {
    metadata.correlationId = correlationId;
  }
  if (causationId !== undefined) {
    metadata.causationId = causationId;
  }

  return {
    type,
    payload,
    metadata,
  };
}
