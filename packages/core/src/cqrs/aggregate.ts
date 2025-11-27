/**
 * CQRS Aggregate Root
 *
 * Base class for event-sourced aggregates with:
 * - Event application and replay
 * - Version tracking for optimistic concurrency
 * - Uncommitted event tracking
 */

import type { StoredEvent, EventStore as EventStoreInterface } from '../event-store.js';

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
  protected eventAppliers = new Map<string, EventApplier<TState, unknown>>();

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
  protected raise(
    type: string,
    payload: unknown,
    correlationId?: string,
    causationId?: string
  ): void {
    const event: DomainEvent = {
      type,
      payload,
      aggregateId: this.state.id,
      aggregateType: this.aggregateType,
      version: this.state.version + 1,
      timestamp: new Date(),
      ...(correlationId && { correlationId }),
      ...(causationId && { causationId }),
    };

    this.apply(event);
    this.uncommittedEvents.push(event);
  }

  /**
   * Register an event applier
   */
  protected on<TPayload>(eventType: string, applier: EventApplier<TState, TPayload>): void {
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
        aggregateId: storedEvent.aggregateId ?? '',
        aggregateType: storedEvent.aggregateType ?? '',
        version: storedEvent.version ?? 0,
        timestamp: new Date(storedEvent.metadata.timestamp),
        ...(storedEvent.metadata.correlationId && {
          correlationId: storedEvent.metadata.correlationId,
        }),
        ...(storedEvent.metadata.causationId && {
          causationId: storedEvent.metadata.causationId,
        }),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class EventSourcedRepository<T extends AggregateRoot<any>>
  implements AggregateRepository<T>
{
  constructor(
    protected readonly eventStore: EventStoreInterface,
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
      const emitParams: {
        type: string;
        aggregateId?: string;
        aggregateType?: string;
        version?: number;
        payload: Record<string, unknown>;
        correlationId: string;
        causationId?: string;
      } = {
        type: event.type,
        payload: event.payload as Record<string, unknown>,
        correlationId: event.correlationId ?? '',
      };

      if (event.aggregateId) emitParams.aggregateId = event.aggregateId;
      if (event.aggregateType) emitParams.aggregateType = event.aggregateType;
      if (typeof event.version === 'number') emitParams.version = event.version;
      if (event.causationId) emitParams.causationId = event.causationId;

      await this.eventStore.emit(emitParams);
    }

    aggregate.clearUncommittedEvents();
  }

  /**
   * Load aggregate from event store
   */
  async getById(id: string): Promise<T | null> {
    const events = await this.eventStore.getByAggregateId(id);

    if (events.length === 0) {
      return null;
    }

    // Filter by aggregate type
    const filteredEvents = events.filter((e) => e.aggregateType === this.aggregateType);

    if (filteredEvents.length === 0) {
      return null;
    }

    const aggregate = this.createEmpty(id);
    aggregate.loadFromHistory(filteredEvents);

    return aggregate;
  }

  /**
   * Check if aggregate exists
   */
  async exists(id: string): Promise<boolean> {
    const events = await this.eventStore.getByAggregateId(id);
    return events.filter((e) => e.aggregateType === this.aggregateType).length > 0;
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

    this.on(
      'LeadScored',
      (state, payload: { score: number; classification: string }): LeadState => {
        const newState: LeadState = {
          ...state,
          score: payload.score,
        };
        if (payload.classification) {
          newState.classification = payload.classification as
            | 'HOT'
            | 'WARM'
            | 'COLD'
            | 'UNQUALIFIED';
        }
        return newState;
      }
    );

    this.on('LeadQualified', (state, payload: { classification: string }): LeadState => {
      const newState: LeadState = {
        ...state,
        status: 'qualified' as const,
      };
      if (payload.classification) {
        newState.classification = payload.classification as 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
      }
      return newState;
    });

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
  score(score: number, classification: LeadState['classification'], correlationId?: string): void {
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
// LEAD READ MODEL (PROJECTION)
// ============================================================================

/**
 * Lead Read Model Entry - denormalized view for fast queries
 */
export interface LeadReadModelEntry {
  aggregateId: string;
  phone: string;
  channel: LeadState['channel'];
  status: LeadState['status'];
  classification?: LeadState['classification'] | undefined;
  score?: number | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lead Read Model Store Interface
 * Implementations can use in-memory (dev), Redis (distributed), or PostgreSQL (persistent)
 */
export interface LeadReadModelStore {
  /** Index a lead by phone number */
  indexByPhone(phone: string, aggregateId: string, entry: LeadReadModelEntry): Promise<void>;
  /** Lookup aggregate ID by phone number - O(1) operation */
  findAggregateIdByPhone(phone: string): Promise<string | null>;
  /** Get full read model entry by phone */
  getByPhone(phone: string): Promise<LeadReadModelEntry | null>;
  /** Get full read model entry by aggregate ID */
  getByAggregateId(aggregateId: string): Promise<LeadReadModelEntry | null>;
  /** Remove entry (for lead deletion) */
  remove(aggregateId: string): Promise<void>;
  /** Rebuild index from events (for recovery/migration) */
  rebuildFromEvents?(events: StoredEvent[]): Promise<void>;
}

/**
 * In-Memory Lead Read Model Store
 *
 * Fast O(1) lookups using dual-index Map structure.
 * Suitable for development, testing, and single-instance deployments.
 *
 * For production distributed systems, use Redis or PostgreSQL implementation.
 */
export class InMemoryLeadReadModelStore implements LeadReadModelStore {
  /** Phone → AggregateId index for O(1) phone lookup */
  private phoneIndex = new Map<string, string>();
  /** AggregateId → ReadModelEntry for full data access */
  private entriesById = new Map<string, LeadReadModelEntry>();

  indexByPhone(phone: string, aggregateId: string, entry: LeadReadModelEntry): Promise<void> {
    // Normalize phone for consistent lookups
    const normalizedPhone = this.normalizePhone(phone);

    // Update both indexes atomically
    this.phoneIndex.set(normalizedPhone, aggregateId);
    this.entriesById.set(aggregateId, { ...entry, phone: normalizedPhone });
    return Promise.resolve();
  }

  findAggregateIdByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = this.normalizePhone(phone);
    return Promise.resolve(this.phoneIndex.get(normalizedPhone) ?? null);
  }

  getByPhone(phone: string): Promise<LeadReadModelEntry | null> {
    const normalizedPhone = this.normalizePhone(phone);
    const aggregateId = this.phoneIndex.get(normalizedPhone);
    if (!aggregateId) return Promise.resolve(null);
    return Promise.resolve(this.entriesById.get(aggregateId) ?? null);
  }

  getByAggregateId(aggregateId: string): Promise<LeadReadModelEntry | null> {
    return Promise.resolve(this.entriesById.get(aggregateId) ?? null);
  }

  remove(aggregateId: string): Promise<void> {
    const entry = this.entriesById.get(aggregateId);
    if (entry) {
      this.phoneIndex.delete(entry.phone);
      this.entriesById.delete(aggregateId);
    }
    return Promise.resolve();
  }

  async rebuildFromEvents(events: StoredEvent[]): Promise<void> {
    // Clear existing indexes
    this.phoneIndex.clear();
    this.entriesById.clear();

    // Group events by aggregateId
    const eventsByAggregate = new Map<string, StoredEvent[]>();
    for (const event of events) {
      if (event.aggregateId && event.aggregateType === 'Lead') {
        const existing = eventsByAggregate.get(event.aggregateId) ?? [];
        existing.push(event);
        eventsByAggregate.set(event.aggregateId, existing);
      }
    }

    // Replay events to build read model
    for (const [aggregateId, aggregateEvents] of Array.from(eventsByAggregate.entries())) {
      // Sort by version
      const sortedEvents = aggregateEvents.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

      let entry: LeadReadModelEntry | null = null;

      for (const event of sortedEvents) {
        entry = this.applyEventToReadModel(entry, event);
      }

      if (entry) {
        await this.indexByPhone(entry.phone, aggregateId, entry);
      }
    }
  }

  private applyEventToReadModel(
    current: LeadReadModelEntry | null,
    event: StoredEvent
  ): LeadReadModelEntry | null {
    const timestamp = new Date(event.metadata.timestamp);

    switch (event.type) {
      case 'LeadCreated': {
        const payload = event.payload as { phone: string; channel: string };
        const aggregateId = event.aggregateId;
        if (!aggregateId) return null; // Safety check - should never happen
        return {
          aggregateId,
          phone: payload.phone,
          channel: payload.channel as LeadState['channel'],
          status: 'new',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }
      case 'LeadScored': {
        if (!current) return null;
        const payload = event.payload as { score: number; classification?: string };
        return {
          ...current,
          score: payload.score,
          classification: payload.classification as LeadState['classification'],
          updatedAt: timestamp,
        };
      }
      case 'LeadQualified': {
        if (!current) return null;
        const payload = event.payload as { classification?: string };
        return {
          ...current,
          status: 'qualified',
          classification: payload.classification as LeadState['classification'],
          updatedAt: timestamp,
        };
      }
      case 'LeadAssigned': {
        if (!current) return null;
        return { ...current, status: 'contacted', updatedAt: timestamp };
      }
      case 'LeadConverted': {
        if (!current) return null;
        return { ...current, status: 'converted', updatedAt: timestamp };
      }
      case 'LeadLost': {
        if (!current) return null;
        return { ...current, status: 'lost', updatedAt: timestamp };
      }
      default:
        return current;
    }
  }

  /**
   * Normalize phone number for consistent indexing
   * Removes formatting, ensures E.164-like format
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Remove leading + if present for consistent storage
    if (normalized.startsWith('+')) {
      normalized = normalized.substring(1);
    }

    // Handle Romanian numbers: convert 07xx to 407xx
    if (normalized.startsWith('0') && normalized.length === 10) {
      normalized = '40' + normalized.substring(1);
    }

    return normalized;
  }

  /** Get index size (for monitoring) */
  getSize(): { phoneIndex: number; entries: number } {
    return {
      phoneIndex: this.phoneIndex.size,
      entries: this.entriesById.size,
    };
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.phoneIndex.clear();
    this.entriesById.clear();
  }
}

// ============================================================================
// LEAD REPOSITORY WITH READ MODEL
// ============================================================================

export class LeadRepository extends EventSourcedRepository<LeadAggregate> {
  private readModel: LeadReadModelStore;
  private isReadModelInitialized = false;

  constructor(eventStore: EventStoreInterface, readModel?: LeadReadModelStore) {
    super(eventStore, 'Lead');
    // Use provided read model or create in-memory default
    this.readModel = readModel ?? new InMemoryLeadReadModelStore();
  }

  /**
   * Initialize read model from existing events
   * Call this on application startup for warm cache
   */
  async initializeReadModel(): Promise<void> {
    if (this.isReadModelInitialized) return;

    if (this.readModel.rebuildFromEvents) {
      const events = await this.eventStore.getByType('LeadCreated', 10000);
      // Get all lead events, not just LeadCreated
      const allLeadEvents: StoredEvent[] = [];

      for (const createEvent of events) {
        if (createEvent.aggregateId) {
          const aggregateEvents = await this.eventStore.getByAggregateId(createEvent.aggregateId);
          allLeadEvents.push(...aggregateEvents);
        }
      }

      await this.readModel.rebuildFromEvents(allLeadEvents);
    }

    this.isReadModelInitialized = true;
  }

  protected createEmpty(id: string): LeadAggregate {
    // Create with placeholder values - will be overwritten by event replay
    return new LeadAggregate(id, '', 'whatsapp');
  }

  /**
   * Override save to update read model on every event
   */
  override async save(aggregate: LeadAggregate): Promise<void> {
    const events = aggregate.getUncommittedEvents();

    // Save to event store first
    await super.save(aggregate);

    // Update read model with new events
    const state = aggregate.getState();
    const entry: LeadReadModelEntry = {
      aggregateId: state.id,
      phone: state.phone,
      channel: state.channel,
      status: state.status,
      classification: state.classification,
      score: state.score,
      createdAt: state.createdAt ?? new Date(),
      updatedAt: state.updatedAt ?? new Date(),
    };

    // Index in read model for O(1) future lookups
    if (events.length > 0) {
      await this.readModel.indexByPhone(state.phone, state.id, entry);
    }
  }

  /**
   * Find lead by phone number - O(1) lookup using read model
   *
   * This is the optimized version that uses the read model projection
   * instead of scanning all events. Provides constant-time lookup
   * regardless of the number of leads in the system.
   */
  async findByPhone(phone: string): Promise<LeadAggregate | null> {
    // O(1) lookup in read model
    const aggregateId = await this.readModel.findAggregateIdByPhone(phone);

    if (!aggregateId) {
      return null;
    }

    // Load full aggregate from event store
    return this.getById(aggregateId);
  }

  /**
   * Check if a lead exists with the given phone number - O(1)
   */
  async existsByPhone(phone: string): Promise<boolean> {
    const aggregateId = await this.readModel.findAggregateIdByPhone(phone);
    return aggregateId !== null;
  }

  /**
   * Get lead summary by phone without loading full aggregate
   * Useful for quick checks and list views
   */
  async getLeadSummaryByPhone(phone: string): Promise<LeadReadModelEntry | null> {
    return this.readModel.getByPhone(phone);
  }

  /**
   * Get the underlying read model store (for monitoring/testing)
   */
  getReadModel(): LeadReadModelStore {
    return this.readModel;
  }
}
