/**
 * CQRS Aggregate Root
 *
 * Base class for event-sourced aggregates with:
 * - Event application and replay
 * - Version tracking for optimistic concurrency
 * - Uncommitted event tracking
 */

import type { StoredEvent } from '../event-store.js';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface DomainEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: Date;
  correlationId?: string;
  causationId?: string;
}

export interface AggregateState {
  id: string;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EventApplier<TState, TEvent> = (state: TState, event: TEvent) => TState;

// ============================================================================
// AGGREGATE ROOT BASE CLASS
// ============================================================================

export abstract class AggregateRoot<TState extends AggregateState = AggregateState> {
  protected state: TState;
  protected uncommittedEvents: DomainEvent[] = [];
  protected eventAppliers: Map<string, EventApplier<TState, unknown>> = new Map();

  constructor(
    protected readonly aggregateType: string,
    initialState: TState
  ) {
    this.state = initialState;
  }

  /**
   * Get aggregate ID
   */
  get id(): string {
    return this.state.id;
  }

  /**
   * Get current version
   */
  get version(): number {
    return this.state.version;
  }

  /**
   * Get current state (readonly)
   */
  getState(): Readonly<TState> {
    return this.state;
  }

  /**
   * Get uncommitted events
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Clear uncommitted events after persistence
   */
  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Apply an event to the aggregate state
   */
  protected apply<TPayload>(event: DomainEvent<TPayload>): void {
    const applier = this.eventAppliers.get(event.type);
    if (applier) {
      this.state = applier(this.state, event.payload);
    }
    this.state.version = event.version;
    this.state.updatedAt = event.timestamp;
  }

  /**
   * Raise a new domain event
   */
  protected raise<TPayload>(
    type: string,
    payload: TPayload,
    correlationId?: string,
    causationId?: string
  ): void {
    const event: DomainEvent<TPayload> = {
      type,
      payload,
      aggregateId: this.state.id,
      aggregateType: this.aggregateType,
      version: this.state.version + 1,
      timestamp: new Date(),
      correlationId,
      causationId,
    };

    this.apply(event);
    this.uncommittedEvents.push(event);
  }

  /**
   * Register an event applier
   */
  protected on<TPayload>(
    eventType: string,
    applier: EventApplier<TState, TPayload>
  ): void {
    this.eventAppliers.set(eventType, applier as EventApplier<TState, unknown>);
  }

  /**
   * Replay events to rebuild state
   */
  loadFromHistory(events: StoredEvent[]): void {
    for (const storedEvent of events) {
      const event: DomainEvent = {
        type: storedEvent.type,
        payload: storedEvent.payload,
        aggregateId: storedEvent.aggregateId,
        aggregateType: storedEvent.aggregateType,
        version: storedEvent.version,
        timestamp: storedEvent.timestamp,
        correlationId: storedEvent.correlationId,
        causationId: storedEvent.causationId,
      };
      this.apply(event);
    }
  }

  /**
   * Create a snapshot of current state
   */
  createSnapshot(): AggregateSnapshot<TState> {
    return {
      aggregateId: this.state.id,
      aggregateType: this.aggregateType,
      version: this.state.version,
      state: { ...this.state },
      createdAt: new Date(),
    };
  }

  /**
   * Restore from a snapshot
   */
  loadFromSnapshot(snapshot: AggregateSnapshot<TState>): void {
    this.state = { ...snapshot.state };
  }
}

export interface AggregateSnapshot<TState> {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: TState;
  createdAt: Date;
}

// ============================================================================
// AGGREGATE REPOSITORY
// ============================================================================

export interface AggregateRepository<T extends AggregateRoot> {
  save(aggregate: T): Promise<void>;
  getById(id: string): Promise<T | null>;
  exists(id: string): Promise<boolean>;
}

export abstract class EventSourcedRepository<T extends AggregateRoot>
  implements AggregateRepository<T>
{
  constructor(
    protected readonly eventStore: import('../event-store.js').EventStore,
    protected readonly aggregateType: string
  ) {}

  /**
   * Save aggregate to event store
   */
  async save(aggregate: T): Promise<void> {
    const events = aggregate.getUncommittedEvents();

    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      await this.eventStore.append({
        type: event.type,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        version: event.version,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId,
        timestamp: event.timestamp,
        source: 'aggregate',
      });
    }

    aggregate.clearUncommittedEvents();
  }

  /**
   * Load aggregate from event store
   */
  async getById(id: string): Promise<T | null> {
    const events = await this.eventStore.getByAggregate(id, this.aggregateType);

    if (events.length === 0) {
      return null;
    }

    const aggregate = this.createEmpty(id);
    aggregate.loadFromHistory(events);

    return aggregate;
  }

  /**
   * Check if aggregate exists
   */
  async exists(id: string): Promise<boolean> {
    const events = await this.eventStore.getByAggregate(id, this.aggregateType);
    return events.length > 0;
  }

  /**
   * Create an empty aggregate instance
   * Subclasses must implement this
   */
  protected abstract createEmpty(id: string): T;
}

// ============================================================================
// EXAMPLE: LEAD AGGREGATE
// ============================================================================

export interface LeadState extends AggregateState {
  phone: string;
  channel: 'whatsapp' | 'voice' | 'web' | 'referral';
  classification?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  score?: number;
  hubspotContactId?: string;
  assignedTo?: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
}

export class LeadAggregate extends AggregateRoot<LeadState> {
  constructor(id: string, phone: string, channel: LeadState['channel']) {
    super('Lead', {
      id,
      version: 0,
      phone,
      channel,
      status: 'new',
      createdAt: new Date(),
    });

    // Register event appliers
    this.on('LeadCreated', (state, payload: { phone: string; channel: string }) => ({
      ...state,
      phone: payload.phone,
      channel: payload.channel as LeadState['channel'],
      status: 'new' as const,
    }));

    this.on('LeadScored', (state, payload: { score: number; classification: string }) => ({
      ...state,
      score: payload.score,
      classification: payload.classification as LeadState['classification'],
    }));

    this.on('LeadQualified', (state, payload: { classification: string }) => ({
      ...state,
      classification: payload.classification as LeadState['classification'],
      status: 'qualified' as const,
    }));

    this.on('LeadAssigned', (state, payload: { assignedTo: string }) => ({
      ...state,
      assignedTo: payload.assignedTo,
      status: 'contacted' as const,
    }));

    this.on('LeadConverted', (state, _payload: { hubspotContactId: string }) => ({
      ...state,
      status: 'converted' as const,
    }));

    this.on('LeadLost', (state, _payload: { reason: string }) => ({
      ...state,
      status: 'lost' as const,
    }));
  }

  /**
   * Create a new lead
   */
  static create(
    id: string,
    phone: string,
    channel: LeadState['channel'],
    correlationId?: string
  ): LeadAggregate {
    const lead = new LeadAggregate(id, phone, channel);
    lead.raise('LeadCreated', { phone, channel }, correlationId);
    return lead;
  }

  /**
   * Score the lead
   */
  score(
    score: number,
    classification: LeadState['classification'],
    correlationId?: string
  ): void {
    if (this.state.status === 'lost' || this.state.status === 'converted') {
      throw new Error('Cannot score a closed lead');
    }

    this.raise('LeadScored', { score, classification }, correlationId);
  }

  /**
   * Qualify the lead
   */
  qualify(classification: LeadState['classification'], correlationId?: string): void {
    if (this.state.status === 'lost' || this.state.status === 'converted') {
      throw new Error('Cannot qualify a closed lead');
    }

    this.raise('LeadQualified', { classification }, correlationId);
  }

  /**
   * Assign lead to a user
   */
  assign(userId: string, correlationId?: string): void {
    if (this.state.status === 'lost' || this.state.status === 'converted') {
      throw new Error('Cannot assign a closed lead');
    }

    this.raise('LeadAssigned', { assignedTo: userId }, correlationId);
  }

  /**
   * Mark lead as converted
   */
  convert(hubspotContactId: string, correlationId?: string): void {
    if (this.state.status === 'converted') {
      throw new Error('Lead is already converted');
    }
    if (this.state.status === 'lost') {
      throw new Error('Cannot convert a lost lead');
    }

    this.raise('LeadConverted', { hubspotContactId }, correlationId);
  }

  /**
   * Mark lead as lost
   */
  markLost(reason: string, correlationId?: string): void {
    if (this.state.status === 'lost') {
      throw new Error('Lead is already lost');
    }
    if (this.state.status === 'converted') {
      throw new Error('Cannot lose a converted lead');
    }

    this.raise('LeadLost', { reason }, correlationId);
  }
}

// ============================================================================
// LEAD REPOSITORY
// ============================================================================

export class LeadRepository extends EventSourcedRepository<LeadAggregate> {
  constructor(eventStore: import('../event-store.js').EventStore) {
    super(eventStore, 'Lead');
  }

  protected createEmpty(id: string): LeadAggregate {
    // Create with placeholder values - will be overwritten by event replay
    return new LeadAggregate(id, '', 'whatsapp');
  }

  /**
   * Find lead by phone number
   */
  async findByPhone(phone: string): Promise<LeadAggregate | null> {
    // This would need a projection/read model in production
    // For now, we'd need to search all leads
    const events = await this.eventStore.getByType('LeadCreated');

    for (const event of events) {
      if ((event.payload as { phone: string }).phone === phone) {
        return this.getById(event.aggregateId);
      }
    }

    return null;
  }
}
