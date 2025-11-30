/**
 * CQRS Projections
 *
 * Read models built from event streams with:
 * - Event handlers for projection updates
 * - Rebuild capability from event history
 * - PostgreSQL storage for read models
 */

import type { StoredEvent } from '../event-store.js';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Projection<TState = unknown> {
  name: string;
  version: number;
  state: TState;
  lastEventId?: string | undefined;
  lastEventTimestamp?: Date | undefined;
  updatedAt: Date;
}

export type ProjectionHandler<TState> = (state: TState, event: StoredEvent) => TState;

export interface ProjectionDefinition<TState> {
  name: string;
  version: number;
  initialState: TState;
  handlers: Map<string, ProjectionHandler<TState>>;
}

// ============================================================================
// PROJECTION BUILDER
// ============================================================================

export class ProjectionBuilder<TState> {
  private handlers = new Map<string, ProjectionHandler<TState>>();

  constructor(
    private name: string,
    private version: number,
    private initialState: TState
  ) {}

  /**
   * Register handler for an event type
   */
  on(eventType: string, handler: ProjectionHandler<TState>): this {
    this.handlers.set(eventType, handler);
    return this;
  }

  /**
   * Build the projection definition
   */
  build(): ProjectionDefinition<TState> {
    return {
      name: this.name,
      version: this.version,
      initialState: this.initialState,
      handlers: this.handlers,
    };
  }
}

/**
 * Create a new projection builder
 */
export function defineProjection<TState>(
  name: string,
  version: number,
  initialState: TState
): ProjectionBuilder<TState> {
  return new ProjectionBuilder(name, version, initialState);
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

/**
 * Serializable projection state for JSON persistence
 */
export interface SerializedProjection {
  name: string;
  version: number;
  state: unknown;
  lastEventId?: string | undefined;
  lastEventTimestamp?: string | undefined;
  updatedAt: string;
}

/**
 * Custom JSON replacer that handles Map objects
 * Converts Map to { __type: 'Map', entries: [...] } for JSON serialization
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    };
  }
  if (value instanceof Date) {
    return {
      __type: 'Date',
      value: value.toISOString(),
    };
  }
  return value;
}

/**
 * Custom JSON reviver that reconstructs Map and Date objects
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (obj.__type === 'Map' && Array.isArray(obj.entries)) {
      return new Map(obj.entries as [unknown, unknown][]);
    }
    if (obj.__type === 'Date' && typeof obj.value === 'string') {
      return new Date(obj.value);
    }
  }
  return value;
}

/**
 * Serialize a projection state to JSON-safe format
 */
export function serializeProjectionState(state: unknown): string {
  return JSON.stringify(state, jsonReplacer);
}

/**
 * Deserialize a projection state from JSON
 */
export function deserializeProjectionState(json: string): unknown {
  return JSON.parse(json, jsonReviver);
}

// ============================================================================
// PROJECTION MANAGER
// ============================================================================

export class ProjectionManager {
  private projections = new Map<string, ProjectionDefinition<unknown>>();
  private states = new Map<string, Projection>();

  /**
   * Register a projection
   */
  register<TState>(definition: ProjectionDefinition<TState>): void {
    this.projections.set(definition.name, definition as ProjectionDefinition<unknown>);
    this.states.set(definition.name, {
      name: definition.name,
      version: definition.version,
      state: definition.initialState,
      updatedAt: new Date(),
    });
  }

  /**
   * Apply an event to all projections
   */
  apply(event: StoredEvent): void {
    for (const [name, definition] of this.projections) {
      const handler = definition.handlers.get(event.type);
      if (handler) {
        const projection = this.states.get(name);
        if (!projection) continue;
        projection.state = handler(projection.state, event);
        projection.lastEventId = event.id;
        projection.lastEventTimestamp = new Date(event.metadata.timestamp);
        projection.updatedAt = new Date();
      }
    }
  }

  /**
   * Rebuild a projection from events
   */
  rebuild(projectionName: string, events: StoredEvent[]): void {
    const definition = this.projections.get(projectionName);
    if (!definition) {
      throw new Error(`Projection '${projectionName}' not found`);
    }

    // Reset to initial state
    const projection: Projection = {
      name: projectionName,
      version: definition.version,
      state: definition.initialState,
      updatedAt: new Date(),
    };

    // Apply all events
    for (const event of events) {
      const handler = definition.handlers.get(event.type);
      if (handler) {
        projection.state = handler(projection.state, event);
        projection.lastEventId = event.id;
        projection.lastEventTimestamp = new Date(event.metadata.timestamp);
      }
    }

    projection.updatedAt = new Date();
    this.states.set(projectionName, projection);
  }

  /**
   * Get projection state
   */
  get<TState>(projectionName: string): Projection<TState> | undefined {
    return this.states.get(projectionName) as Projection<TState> | undefined;
  }

  /**
   * Get all projections
   */
  getAll(): Projection[] {
    return Array.from(this.states.values());
  }

  /**
   * Check if projection exists
   */
  has(projectionName: string): boolean {
    return this.projections.has(projectionName);
  }

  /**
   * Serialize all projections to JSON-safe format
   * Handles Map and Date objects automatically
   * @returns Array of serialized projections for storage
   */
  toJSON(): SerializedProjection[] {
    return Array.from(this.states.values()).map((projection) => ({
      name: projection.name,
      version: projection.version,
      state: JSON.parse(serializeProjectionState(projection.state)) as unknown,
      lastEventId: projection.lastEventId,
      lastEventTimestamp: projection.lastEventTimestamp?.toISOString(),
      updatedAt: projection.updatedAt.toISOString(),
    }));
  }

  /**
   * Restore projections from serialized JSON data
   * @param data - Array of serialized projections
   */
  fromJSON(data: SerializedProjection[]): void {
    for (const serialized of data) {
      // Only restore if we have a registered definition for this projection
      if (!this.projections.has(serialized.name)) {
        continue;
      }

      // Deserialize the state (handles Map and Date restoration)
      const deserializedState = deserializeProjectionState(JSON.stringify(serialized.state));

      const projection: Projection = {
        name: serialized.name,
        version: serialized.version,
        state: deserializedState,
        lastEventId: serialized.lastEventId,
        lastEventTimestamp: serialized.lastEventTimestamp
          ? new Date(serialized.lastEventTimestamp)
          : undefined,
        updatedAt: new Date(serialized.updatedAt),
      };

      this.states.set(serialized.name, projection);
    }
  }

  /**
   * Serialize a single projection to JSON string
   * Useful for storing individual projection snapshots
   * @param projectionName - Name of the projection to serialize
   * @returns JSON string or null if projection not found
   */
  serializeProjection(projectionName: string): string | null {
    const projection = this.states.get(projectionName);
    if (!projection) return null;

    return serializeProjectionState({
      name: projection.name,
      version: projection.version,
      state: projection.state,
      lastEventId: projection.lastEventId,
      lastEventTimestamp: projection.lastEventTimestamp,
      updatedAt: projection.updatedAt,
    });
  }

  /**
   * Restore a single projection from JSON string
   * @param projectionName - Name of the projection to restore
   * @param json - Serialized projection data
   */
  deserializeProjection(projectionName: string, json: string): void {
    if (!this.projections.has(projectionName)) {
      throw new Error(`Projection '${projectionName}' not registered`);
    }

    const deserialized = deserializeProjectionState<Projection>(json);
    this.states.set(projectionName, deserialized);
  }
}

// ============================================================================
// EXAMPLE PROJECTIONS
// ============================================================================

/**
 * Lead Statistics Projection
 */
export interface LeadStatsState {
  totalLeads: number;
  leadsByChannel: Record<string, number>;
  leadsByClassification: Record<string, number>;
  leadsByStatus: Record<string, number>;
  averageScore: number;
  totalScore: number;
  scoredLeads: number;
  conversionRate: number;
  convertedLeads: number;
}

export const LeadStatsProjection = defineProjection<LeadStatsState>('lead-stats', 1, {
  totalLeads: 0,
  leadsByChannel: {},
  leadsByClassification: {},
  leadsByStatus: {},
  averageScore: 0,
  totalScore: 0,
  scoredLeads: 0,
  conversionRate: 0,
  convertedLeads: 0,
})
  .on('LeadCreated', (state, event) => {
    const payload = event.payload as { channel: string };
    const channel = payload.channel;
    return {
      ...state,
      totalLeads: state.totalLeads + 1,
      leadsByChannel: {
        ...state.leadsByChannel,
        [channel]: (state.leadsByChannel[channel] ?? 0) + 1,
      },
      leadsByStatus: {
        ...state.leadsByStatus,
        new: (state.leadsByStatus.new ?? 0) + 1,
      },
    };
  })
  .on('LeadScored', (state, event) => {
    const payload = event.payload as { score: number; classification: string };
    const classification = payload.classification;
    const newTotalScore = state.totalScore + payload.score;
    const newScoredLeads = state.scoredLeads + 1;
    return {
      ...state,
      totalScore: newTotalScore,
      scoredLeads: newScoredLeads,
      averageScore: newTotalScore / newScoredLeads,
      leadsByClassification: {
        ...state.leadsByClassification,
        [classification]: (state.leadsByClassification[classification] ?? 0) + 1,
      },
    };
  })
  .on('LeadQualified', (state, event) => {
    const payload = event.payload as { classification: string };
    const classification = payload.classification;
    return {
      ...state,
      leadsByStatus: {
        ...state.leadsByStatus,
        new: Math.max(0, (state.leadsByStatus.new ?? 0) - 1),
        qualified: (state.leadsByStatus.qualified ?? 0) + 1,
      },
      leadsByClassification: {
        ...state.leadsByClassification,
        [classification]: (state.leadsByClassification[classification] ?? 0) + 1,
      },
    };
  })
  .on('LeadConverted', (state) => {
    const newConverted = state.convertedLeads + 1;
    return {
      ...state,
      convertedLeads: newConverted,
      conversionRate: state.totalLeads > 0 ? newConverted / state.totalLeads : 0,
      leadsByStatus: {
        ...state.leadsByStatus,
        qualified: Math.max(0, (state.leadsByStatus.qualified ?? 0) - 1),
        converted: (state.leadsByStatus.converted ?? 0) + 1,
      },
    };
  })
  .on('LeadLost', (state) => ({
    ...state,
    leadsByStatus: {
      ...state.leadsByStatus,
      lost: (state.leadsByStatus.lost ?? 0) + 1,
    },
  }))
  .build();

/**
 * Patient Activity Projection
 */
export interface PatientActivityState {
  recentActivities: {
    patientId: string;
    type: string;
    timestamp: Date;
    details: unknown;
  }[];
  appointmentsScheduled: number;
  appointmentsCancelled: number;
  messagesReceived: number;
  messagesSent: number;
}

export const PatientActivityProjection = defineProjection<PatientActivityState>(
  'patient-activity',
  1,
  {
    recentActivities: [],
    appointmentsScheduled: 0,
    appointmentsCancelled: 0,
    messagesReceived: 0,
    messagesSent: 0,
  }
)
  .on('AppointmentScheduled', (state, event) => ({
    ...state,
    appointmentsScheduled: state.appointmentsScheduled + 1,
    recentActivities: [
      {
        patientId: event.aggregateId ?? '',
        type: 'appointment_scheduled',
        timestamp: new Date(event.metadata.timestamp),
        details: event.payload,
      },
      ...state.recentActivities.slice(0, 99), // Keep last 100
    ],
  }))
  .on('AppointmentCancelled', (state, event) => ({
    ...state,
    appointmentsCancelled: state.appointmentsCancelled + 1,
    recentActivities: [
      {
        patientId: event.aggregateId ?? '',
        type: 'appointment_cancelled',
        timestamp: new Date(event.metadata.timestamp),
        details: event.payload,
      },
      ...state.recentActivities.slice(0, 99),
    ],
  }))
  .on('WhatsAppMessageReceived', (state, event) => ({
    ...state,
    messagesReceived: state.messagesReceived + 1,
    recentActivities: [
      {
        patientId: event.aggregateId ?? '',
        type: 'message_received',
        timestamp: new Date(event.metadata.timestamp),
        details: event.payload,
      },
      ...state.recentActivities.slice(0, 99),
    ],
  }))
  .on('WhatsAppMessageSent', (state, event) => ({
    ...state,
    messagesSent: state.messagesSent + 1,
    recentActivities: [
      {
        patientId: event.aggregateId ?? '',
        type: 'message_sent',
        timestamp: new Date(event.metadata.timestamp),
        details: event.payload,
      },
      ...state.recentActivities.slice(0, 99),
    ],
  }))
  .build();

/**
 * Daily Metrics Projection
 */
export interface DailyMetricsState {
  metrics: Map<
    string,
    {
      date: string;
      newLeads: number;
      qualifiedLeads: number;
      convertedLeads: number;
      appointmentsScheduled: number;
      messagesReceived: number;
      messagesSent: number;
    }
  >;
}

function getDateKey(timestamp: Date): string {
  const datePart = timestamp.toISOString().split('T')[0];
  if (!datePart) throw new Error('Invalid timestamp');
  return datePart;
}

function ensureMetricEntry(
  state: DailyMetricsState,
  date: string
): DailyMetricsState['metrics'] extends Map<string, infer V> ? V : never {
  const existing = state.metrics.get(date);
  if (!existing) {
    return {
      date,
      newLeads: 0,
      qualifiedLeads: 0,
      convertedLeads: 0,
      appointmentsScheduled: 0,
      messagesReceived: 0,
      messagesSent: 0,
    };
  }
  return existing;
}

export const DailyMetricsProjection = defineProjection<DailyMetricsState>('daily-metrics', 1, {
  metrics: new Map(),
})
  .on('LeadCreated', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, newLeads: entry.newLeads + 1 });
    return { ...state, metrics };
  })
  .on('LeadQualified', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, qualifiedLeads: entry.qualifiedLeads + 1 });
    return { ...state, metrics };
  })
  .on('LeadConverted', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, convertedLeads: entry.convertedLeads + 1 });
    return { ...state, metrics };
  })
  .on('AppointmentScheduled', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, appointmentsScheduled: entry.appointmentsScheduled + 1 });
    return { ...state, metrics };
  })
  .on('WhatsAppMessageReceived', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, messagesReceived: entry.messagesReceived + 1 });
    return { ...state, metrics };
  })
  .on('WhatsAppMessageSent', (state, event) => {
    const date = getDateKey(new Date(event.metadata.timestamp));
    const metrics = new Map(state.metrics);
    const entry = ensureMetricEntry(state, date);
    metrics.set(date, { ...entry, messagesSent: entry.messagesSent + 1 });
    return { ...state, metrics };
  })
  .build();

// ============================================================================
// FACTORY
// ============================================================================

export function createProjectionManager(): ProjectionManager {
  const manager = new ProjectionManager();

  // Register default projections
  manager.register(LeadStatsProjection);
  manager.register(PatientActivityProjection);
  manager.register(DailyMetricsProjection);

  return manager;
}
