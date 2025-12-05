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

/* eslint-disable @typescript-eslint/no-explicit-any -- generic constraint requires any for ID type flexibility */
export abstract class EventSourcedRepository<
  T extends AggregateRoot<any>,
> implements AggregateRepository<T> {
  /* eslint-enable @typescript-eslint/no-explicit-any */
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
// LEAD REPOSITORY
// ============================================================================

/**
 * Lead lookup result from projection table
 */
export interface LeadLookup {
  id: string;
  phone: string;
  channel: LeadState['channel'];
  classification?: LeadState['classification'];
  score?: number;
  hubspotContactId?: string;
  assignedTo?: string;
  status: LeadState['status'];
}

/**
 * Database client interface for lead projections
 */
export interface LeadProjectionClient {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

export class LeadRepository extends EventSourcedRepository<LeadAggregate> {
  private projectionClient: LeadProjectionClient | null = null;

  constructor(eventStore: EventStoreInterface, projectionClient?: LeadProjectionClient) {
    super(eventStore, 'Lead');
    this.projectionClient = projectionClient ?? null;
  }

  protected createEmpty(id: string): LeadAggregate {
    // Create with placeholder values - will be overwritten by event replay
    return new LeadAggregate(id, '', 'whatsapp');
  }

  /**
   * Find lead by phone number using SQL projection (O(1) lookup)
   *
   * PERFORMANCE: Uses leads_lookup table instead of scanning Event Store.
   * Falls back to Event Store scan if projection client is not configured.
   */
  async findByPhone(phone: string): Promise<LeadAggregate | null> {
    // OPTIMIZED PATH: Use SQL projection for O(1) lookup
    if (this.projectionClient) {
      const result = await this.projectionClient.query<{ id: string }>(
        'SELECT id FROM leads_lookup WHERE phone = $1 LIMIT 1',
        [phone]
      );

      if (result.rows.length > 0 && result.rows[0]) {
        return this.getById(result.rows[0].id);
      }

      return null;
    }

    // FALLBACK: Event Store scan (O(N)) - only for development/testing
    // WARNING: This will be slow with large datasets
    const events = await this.eventStore.getByType('LeadCreated');

    for (const event of events) {
      if ((event.payload as { phone: string }).phone === phone && event.aggregateId) {
        return this.getById(event.aggregateId);
      }
    }

    return null;
  }

  /**
   * Find lead by phone using projection only (returns lookup data without hydrating aggregate)
   * Use this when you only need the lead metadata, not the full aggregate.
   */
  async findLookupByPhone(phone: string): Promise<LeadLookup | null> {
    if (!this.projectionClient) {
      return null;
    }

    const result = await this.projectionClient.query<{
      id: string;
      phone: string;
      channel: string;
      classification: string | null;
      score: number | null;
      hubspot_contact_id: string | null;
      assigned_to: string | null;
      status: string;
    }>(
      `SELECT id, phone, channel, classification, score, hubspot_contact_id, assigned_to, status
       FROM leads_lookup WHERE phone = $1 LIMIT 1`,
      [phone]
    );

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    const lookup: LeadLookup = {
      id: row.id,
      phone: row.phone,
      channel: row.channel as LeadState['channel'],
      status: row.status as LeadState['status'],
    };

    // Only add optional properties if defined (exactOptionalPropertyTypes compliance)
    // Note: DB query types have | null, not | undefined, so we only check for null
    if (row.classification !== null) {
      lookup.classification = row.classification as LeadState['classification'];
    }
    if (row.score !== null) {
      lookup.score = row.score;
    }
    if (row.hubspot_contact_id !== null) {
      lookup.hubspotContactId = row.hubspot_contact_id;
    }
    if (row.assigned_to !== null) {
      lookup.assignedTo = row.assigned_to;
    }

    return lookup;
  }

  /**
   * Check if a lead exists by phone (uses projection for efficiency)
   */
  async existsByPhone(phone: string): Promise<boolean> {
    if (this.projectionClient) {
      const result = await this.projectionClient.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM leads_lookup WHERE phone = $1) as exists',
        [phone]
      );
      return result.rows[0]?.exists ?? false;
    }

    // Fallback to event scan
    const lead = await this.findByPhone(phone);
    return lead !== null;
  }

  /**
   * Find leads by status using SQL projection (O(1) lookup with index)
   * Optimized for Triage Board queries.
   *
   * @param status - Lead status to filter by
   * @param limit - Maximum number of results (default: 50)
   * @returns Array of LeadAggregates hydrated from Event Store
   */
  async findByStatus(status: string, limit = 50): Promise<LeadAggregate[]> {
    if (!this.projectionClient) {
      // Fallback: No projection client, return empty array
      // In production, projectionClient should always be provided
      return [];
    }

    const result = await this.projectionClient.query<{ id: string }>(
      `SELECT id FROM leads_lookup
       WHERE status = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [status, limit]
    );

    // Hydrate aggregates from Event Store in parallel for consistency
    const leads = await Promise.all(result.rows.map((row) => this.getById(row.id)));

    return leads.filter((lead): lead is LeadAggregate => lead !== null);
  }

  /**
   * Find leads by classification using SQL projection
   * Useful for filtering HOT/WARM/COLD leads in the UI.
   *
   * @param classification - Lead classification to filter by
   * @param limit - Maximum number of results (default: 50)
   * @returns Array of LeadAggregates hydrated from Event Store
   */
  async findByClassification(
    classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED',
    limit = 50
  ): Promise<LeadAggregate[]> {
    if (!this.projectionClient) {
      return [];
    }

    const result = await this.projectionClient.query<{ id: string }>(
      `SELECT id FROM leads_lookup
       WHERE classification = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [classification, limit]
    );

    const leads = await Promise.all(result.rows.map((row) => this.getById(row.id)));

    return leads.filter((lead): lead is LeadAggregate => lead !== null);
  }
}
