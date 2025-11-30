/**
 * @module architecture/domain/aggregate-root
 *
 * Aggregate Root Base Class
 * =========================
 *
 * Aggregate Roots are the entry points to aggregates.
 * They enforce invariants and emit domain events.
 */

import { Entity, InvalidEntityError } from './entity.js';
import type {
  AggregateRoot as IAggregateRoot,
  DomainEvent,
  EventMetadata,
} from '../layers/contracts.js';

// ============================================================================
// AGGREGATE ROOT BASE CLASS
// ============================================================================

/**
 * Abstract base class for all aggregate roots
 *
 * @template TId - The type of the aggregate's identifier
 * @template TEvent - The type of domain events this aggregate emits
 */
export abstract class AggregateRoot<TId, TEvent extends DomainEvent = DomainEvent>
  extends Entity<TId>
  implements IAggregateRoot<TId, TEvent>
{
  private _version: number;
  private _uncommittedEvents: TEvent[] = [];
  private _deletedAt?: Date;
  private _isDeleted = false;

  constructor(id: TId, version = 0) {
    super(id);
    this._version = version;
  }

  /**
   * Get the current version (for optimistic concurrency)
   */
  get version(): number {
    return this._version;
  }

  /**
   * Get uncommitted events (events raised but not yet persisted)
   */
  get uncommittedEvents(): readonly TEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Check if the aggregate has been soft-deleted
   */
  get isDeleted(): boolean {
    return this._isDeleted;
  }

  /**
   * Get the deletion timestamp
   */
  get deletedAt(): Date | undefined {
    return this._deletedAt;
  }

  /**
   * Raise a domain event
   * The event is added to uncommittedEvents and applied to state
   */
  protected raise(event: TEvent): void {
    this._uncommittedEvents.push(event);
    this.apply(event);
    this._version++;
  }

  /**
   * Apply an event to update aggregate state
   * Override this to handle specific event types
   */
  protected abstract apply(event: TEvent): void;

  /**
   * Clear uncommitted events (after persistence)
   */
  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Load aggregate from event history (event sourcing)
   */
  loadFromHistory(events: TEvent[]): void {
    for (const event of events) {
      this.apply(event);
      this._version = event.version;
    }
  }

  /**
   * Soft delete the aggregate
   */
  protected markAsDeleted(): void {
    this._isDeleted = true;
    this._deletedAt = new Date();
  }

  /**
   * Restore a soft-deleted aggregate
   */
  protected restore(): void {
    this._isDeleted = false;
    this._deletedAt = undefined;
  }

  /**
   * Create an event with standard metadata
   */
  protected createEvent<TPayload>(
    eventType: string,
    payload: TPayload,
    metadata: Partial<EventMetadata>
  ): TEvent {
    return {
      __layer: 'domain',
      eventId: crypto.randomUUID(),
      eventType,
      aggregateId: String(this.id),
      aggregateType: this.constructor.name,
      version: this._version + 1,
      occurredAt: new Date(),
      payload,
      metadata: {
        correlationId: metadata.correlationId ?? crypto.randomUUID(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        tenantId: metadata.tenantId,
        source: metadata.source ?? this.constructor.name,
        timestamp: new Date().toISOString(),
      },
    } as TEvent;
  }

  /**
   * Validate that the aggregate can be modified
   */
  protected ensureNotDeleted(): void {
    if (this._isDeleted) {
      throw new AggregateDeletedError(this.constructor.name, this.id);
    }
  }

  /**
   * Validate expected version (for optimistic concurrency)
   */
  validateVersion(expectedVersion: number): void {
    if (this._version !== expectedVersion) {
      throw new ConcurrencyError(
        `Expected version ${expectedVersion} but aggregate is at version ${this._version}`,
        this.constructor.name,
        this.id,
        expectedVersion,
        this._version
      );
    }
  }
}

// ============================================================================
// AGGREGATE ERRORS
// ============================================================================

/**
 * Error thrown when attempting to modify a deleted aggregate
 */
export class AggregateDeletedError extends Error {
  readonly code = 'AGGREGATE_DELETED';
  readonly aggregateType: string;
  readonly aggregateId: unknown;

  constructor(aggregateType: string, aggregateId: unknown) {
    super(`${aggregateType} with ID ${String(aggregateId)} has been deleted`);
    this.name = 'AggregateDeletedError';
    this.aggregateType = aggregateType;
    this.aggregateId = aggregateId;
  }
}

/**
 * Error thrown when there is a version conflict
 */
export class ConcurrencyError extends Error {
  readonly code = 'CONCURRENCY_ERROR';
  readonly aggregateType: string;
  readonly aggregateId: unknown;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(
    message: string,
    aggregateType: string,
    aggregateId: unknown,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(message);
    this.name = 'ConcurrencyError';
    this.aggregateType = aggregateType;
    this.aggregateId = aggregateId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Error thrown when an invariant is violated
 */
export class InvariantViolationError extends Error {
  readonly code = 'INVARIANT_VIOLATION';
  readonly aggregateType: string;
  readonly invariant: string;

  constructor(aggregateType: string, invariant: string, message: string) {
    super(`${aggregateType} invariant violation [${invariant}]: ${message}`);
    this.name = 'InvariantViolationError';
    this.aggregateType = aggregateType;
    this.invariant = invariant;
  }
}

// ============================================================================
// AGGREGATE FACTORY
// ============================================================================

/**
 * Factory for creating aggregates with proper initialization
 */
export interface AggregateFactory<
  TAggregate extends AggregateRoot<TId, TEvent>,
  TId,
  TEvent extends DomainEvent,
  TCreateParams,
> {
  create(params: TCreateParams): TAggregate;
  reconstitute(id: TId, events: TEvent[]): TAggregate;
}

/**
 * Base implementation of aggregate factory
 */
export abstract class BaseAggregateFactory<
  TAggregate extends AggregateRoot<TId, TEvent>,
  TId,
  TEvent extends DomainEvent,
  TCreateParams,
> implements AggregateFactory<TAggregate, TId, TEvent, TCreateParams> {
  /**
   * Create a new aggregate from parameters
   */
  abstract create(params: TCreateParams): TAggregate;

  /**
   * Reconstitute an aggregate from event history
   */
  reconstitute(id: TId, events: TEvent[]): TAggregate {
    const aggregate = this.createEmpty(id);
    aggregate.loadFromHistory(events);
    return aggregate;
  }

  /**
   * Create an empty aggregate for reconstitution
   */
  protected abstract createEmpty(id: TId): TAggregate;
}

// ============================================================================
// AGGREGATE INVARIANTS
// ============================================================================

/**
 * Decorator for invariant checks
 */
export function Invariant(name: string, check: (instance: unknown) => boolean, message: string) {
  return function <T extends new (...args: unknown[]) => AggregateRoot<unknown>>(
    constructor: T
  ): T {
    const original = constructor;

    const decorated = class extends original {
      constructor(...args: unknown[]) {
        super(...args);
        this.checkInvariant(name, check, message);
      }

      private checkInvariant(
        invariantName: string,
        checker: (instance: unknown) => boolean,
        errorMessage: string
      ): void {
        if (!checker(this)) {
          throw new InvariantViolationError(this.constructor.name, invariantName, errorMessage);
        }
      }
    };

    return decorated as T;
  };
}

/**
 * Check an invariant at runtime
 */
export function checkInvariant(
  condition: boolean,
  aggregateType: string,
  invariantName: string,
  message: string
): asserts condition {
  if (!condition) {
    throw new InvariantViolationError(aggregateType, invariantName, message);
  }
}

// ============================================================================
// AGGREGATE UTILITIES
// ============================================================================

/**
 * Snapshot of an aggregate's state
 */
export interface AggregateSnapshot<TState> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: TState;
  readonly createdAt: string;
}

/**
 * Mixin for adding snapshot support to aggregates
 */
export interface Snapshottable<TState> {
  toSnapshot(): AggregateSnapshot<TState>;
  fromSnapshot(snapshot: AggregateSnapshot<TState>): void;
}

/**
 * Create a snapshot from an aggregate
 */
export function createSnapshot<TId, TEvent extends DomainEvent, TState>(
  aggregate: AggregateRoot<TId, TEvent> & { getState(): TState }
): AggregateSnapshot<TState> {
  return {
    aggregateId: String(aggregate.id),
    aggregateType: aggregate.constructor.name,
    version: aggregate.version,
    state: aggregate.getState(),
    createdAt: new Date().toISOString(),
  };
}
