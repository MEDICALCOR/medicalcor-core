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
  lastEventId?: string;
  lastEventTimestamp?: Date;
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
        const projection = this.states.get(name)!;
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
  return timestamp.toISOString().split('T')[0]!;
}

function ensureMetricEntry(
  state: DailyMetricsState,
  date: string
): DailyMetricsState['metrics'] extends Map<string, infer V> ? V : never {
  if (!state.metrics.has(date)) {
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
  return state.metrics.get(date)!;
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
