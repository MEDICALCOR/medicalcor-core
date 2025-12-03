/**
 * Event Sourcing Integration Tests
 *
 * Tests the complete event sourcing flow including:
 * - Event store operations (append, query)
 * - Event replay and projection rebuilding
 * - Concurrency handling (version conflicts)
 * - Idempotency guarantees
 * - Checkpoint persistence and resume
 *
 * @module core/cqrs/__tests__/event-sourcing-integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InMemoryEventStore,
  EventStore,
  ConcurrencyError,
  type StoredEvent,
} from '../../event-store.js';
import {
  EventReplayService,
  InMemoryCheckpointStore,
  ProjectionMigrator,
  type ProjectionDefinition,
} from '../event-replay.js';
import { ProjectionManager, defineProjection, type Projection } from '../projections.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

interface LeadStatsState {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  convertedLeads: number;
}

const initialLeadStats: LeadStatsState = {
  totalLeads: 0,
  hotLeads: 0,
  warmLeads: 0,
  coldLeads: 0,
  convertedLeads: 0,
};

const leadStatsProjectionDef: ProjectionDefinition<LeadStatsState> = {
  name: 'lead-stats',
  version: 1,
  initialState: initialLeadStats,
  handlers: new Map([
    [
      'lead.created',
      (state: LeadStatsState, event: StoredEvent): LeadStatsState => {
        const score = (event.payload.score as number) ?? 3;
        return {
          ...state,
          totalLeads: state.totalLeads + 1,
          hotLeads: state.hotLeads + (score >= 4 ? 1 : 0),
          warmLeads: state.warmLeads + (score === 3 ? 1 : 0),
          coldLeads: state.coldLeads + (score <= 2 ? 1 : 0),
        };
      },
    ],
    [
      'lead.scored',
      (state: LeadStatsState, event: StoredEvent): LeadStatsState => {
        const oldScore = (event.payload.previousScore as number) ?? 3;
        const newScore = (event.payload.newScore as number) ?? 3;

        let delta = { hotLeads: 0, warmLeads: 0, coldLeads: 0 };

        // Remove from old category
        if (oldScore >= 4) delta.hotLeads--;
        else if (oldScore === 3) delta.warmLeads--;
        else delta.coldLeads--;

        // Add to new category
        if (newScore >= 4) delta.hotLeads++;
        else if (newScore === 3) delta.warmLeads++;
        else delta.coldLeads++;

        return {
          ...state,
          hotLeads: state.hotLeads + delta.hotLeads,
          warmLeads: state.warmLeads + delta.warmLeads,
          coldLeads: state.coldLeads + delta.coldLeads,
        };
      },
    ],
    [
      'lead.converted',
      (state: LeadStatsState): LeadStatsState => ({
        ...state,
        convertedLeads: state.convertedLeads + 1,
      }),
    ],
  ]),
};

function createTestEvent(
  type: string,
  payload: Record<string, unknown>,
  options: Partial<{
    aggregateId: string;
    version: number;
    correlationId: string;
  }> = {}
): StoredEvent {
  return {
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    aggregateId: options.aggregateId,
    aggregateType: options.aggregateId ? 'lead' : undefined,
    version: options.version,
    payload,
    metadata: {
      correlationId: options.correlationId ?? `corr_${Date.now()}`,
      causationId: undefined,
      idempotencyKey: `${type}:${Date.now()}:${Math.random()}`,
      timestamp: new Date().toISOString(),
      source: 'test',
    },
  };
}

// ============================================================================
// EVENT STORE TESTS
// ============================================================================

describe('Event Store Integration', () => {
  let repository: InMemoryEventStore;
  let eventStore: EventStore;

  beforeEach(() => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
  });

  describe('Event Append and Query', () => {
    it('should append and retrieve events by correlation ID', async () => {
      const correlationId = 'test-correlation-123';

      await eventStore.emit({
        type: 'lead.created',
        correlationId,
        payload: { leadId: 'lead-1', score: 4 },
      });

      await eventStore.emit({
        type: 'lead.scored',
        correlationId,
        payload: { leadId: 'lead-1', newScore: 5 },
      });

      const events = await eventStore.getByCorrelationId(correlationId);

      expect(events).toHaveLength(2);
      expect(events[0]?.type).toBe('lead.created');
      expect(events[1]?.type).toBe('lead.scored');
    });

    it('should append and retrieve events by aggregate ID', async () => {
      const aggregateId = 'lead-aggregate-1';

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        aggregateId,
        aggregateType: 'lead',
        version: 1,
        payload: { name: 'Test Lead' },
      });

      await eventStore.emit({
        type: 'lead.updated',
        correlationId: 'corr-2',
        aggregateId,
        aggregateType: 'lead',
        version: 2,
        payload: { name: 'Updated Lead' },
      });

      const events = await eventStore.getByAggregateId(aggregateId);

      expect(events).toHaveLength(2);
      expect(events[0]?.version).toBe(1);
      expect(events[1]?.version).toBe(2);
    });

    it('should retrieve events by type', async () => {
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1' },
      });

      await eventStore.emit({
        type: 'lead.scored',
        correlationId: 'corr-2',
        payload: { leadId: 'lead-1', score: 4 },
      });

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-3',
        payload: { leadId: 'lead-2' },
      });

      const createdEvents = await eventStore.getByType('lead.created');

      expect(createdEvents).toHaveLength(2);
      expect(createdEvents.every((e) => e.type === 'lead.created')).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate events with same idempotency key', async () => {
      const idempotencyKey = 'unique-key-123';

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1' },
        idempotencyKey,
      });

      // Second emit with same idempotency key should be silently ignored
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1', different: true },
        idempotencyKey,
      });

      const events = await eventStore.getByType('lead.created');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.different).toBeUndefined();
    });

    it('should allow events with different idempotency keys', async () => {
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1' },
        idempotencyKey: 'key-1',
      });

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-2' },
        idempotencyKey: 'key-2',
      });

      const events = await eventStore.getByType('lead.created');
      expect(events).toHaveLength(2);
    });
  });

  describe('Concurrency Control', () => {
    it('should throw ConcurrencyError on version conflict', async () => {
      const aggregateId = 'lead-1';

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        aggregateId,
        aggregateType: 'lead',
        version: 1,
        payload: {},
      });

      // Attempt to write same version should fail
      await expect(
        eventStore.emit({
          type: 'lead.updated',
          correlationId: 'corr-2',
          aggregateId,
          aggregateType: 'lead',
          version: 1, // Same version = conflict
          payload: {},
          idempotencyKey: 'different-key', // Different idempotency key
        })
      ).rejects.toThrow(ConcurrencyError);
    });

    it('should allow sequential version increments', async () => {
      const aggregateId = 'lead-1';

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        aggregateId,
        aggregateType: 'lead',
        version: 1,
        payload: {},
      });

      await eventStore.emit({
        type: 'lead.updated',
        correlationId: 'corr-2',
        aggregateId,
        aggregateType: 'lead',
        version: 2,
        payload: {},
      });

      const events = await eventStore.getByAggregateId(aggregateId);
      expect(events).toHaveLength(2);
    });

    it('should allow events after a specific version', async () => {
      const aggregateId = 'lead-1';

      for (let v = 1; v <= 5; v++) {
        await eventStore.emit({
          type: 'lead.updated',
          correlationId: `corr-${v}`,
          aggregateId,
          aggregateType: 'lead',
          version: v,
          payload: { version: v },
        });
      }

      const eventsAfter2 = await eventStore.getByAggregateId(aggregateId, 2);
      expect(eventsAfter2).toHaveLength(3); // versions 3, 4, 5
      expect(eventsAfter2.map((e) => e.version)).toEqual([3, 4, 5]);
    });
  });

  describe('Event Publishers', () => {
    it('should notify publishers when events are emitted', async () => {
      const publishedEvents: StoredEvent[] = [];
      const publisher = {
        publish: vi.fn(async (event: StoredEvent) => {
          publishedEvents.push(event);
        }),
      };

      eventStore.addPublisher(publisher);

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1' },
      });

      expect(publisher.publish).toHaveBeenCalledOnce();
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]?.type).toBe('lead.created');
    });
  });
});

// ============================================================================
// EVENT REPLAY TESTS
// ============================================================================

describe('Event Replay Integration', () => {
  let repository: InMemoryEventStore;
  let eventStore: EventStore;
  let checkpointStore: InMemoryCheckpointStore;
  let replayService: EventReplayService;

  beforeEach(() => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
    checkpointStore = new InMemoryCheckpointStore();
    replayService = new EventReplayService(checkpointStore);
  });

  describe('Projection Rebuild', () => {
    it('should rebuild projection from event history', async () => {
      // Emit some test events
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1', score: 5 }, // Hot lead
      });

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-2',
        payload: { leadId: 'lead-2', score: 3 }, // Warm lead
      });

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-3',
        payload: { leadId: 'lead-3', score: 1 }, // Cold lead
      });

      await eventStore.emit({
        type: 'lead.converted',
        correlationId: 'corr-4',
        payload: { leadId: 'lead-1' },
      });

      // Rebuild projection
      const result = await replayService.rebuildProjection(
        'lead-stats',
        leadStatsProjectionDef,
        eventStore,
        { logProgress: false }
      );

      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(4);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle errors during replay with continueOnError', async () => {
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1', score: 4 },
      });

      // Create a projection with a handler that throws
      const faultyProjection: ProjectionDefinition<LeadStatsState> = {
        name: 'faulty-projection',
        version: 1,
        initialState: initialLeadStats,
        handlers: new Map([
          [
            'lead.created',
            (): LeadStatsState => {
              throw new Error('Simulated handler error');
            },
          ],
        ]),
      };

      const result = await replayService.rebuildProjection(
        'faulty-projection',
        faultyProjection,
        eventStore,
        { continueOnError: true, logProgress: false }
      );

      expect(result.success).toBe(true); // Success because continueOnError is true
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('Simulated handler error');
    });

    it('should stop on error when continueOnError is false', async () => {
      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-1',
        payload: { leadId: 'lead-1', score: 4 },
      });

      await eventStore.emit({
        type: 'lead.created',
        correlationId: 'corr-2',
        payload: { leadId: 'lead-2', score: 3 },
      });

      const faultyProjection: ProjectionDefinition<LeadStatsState> = {
        name: 'faulty-projection',
        version: 1,
        initialState: initialLeadStats,
        handlers: new Map([
          [
            'lead.created',
            (): LeadStatsState => {
              throw new Error('Simulated error');
            },
          ],
        ]),
      };

      const result = await replayService.rebuildProjection(
        'faulty-projection',
        faultyProjection,
        eventStore,
        { continueOnError: false, logProgress: false }
      );

      expect(result.success).toBe(false);
      expect(result.eventsProcessed).toBe(0);
    });
  });

  describe('Checkpoint Persistence', () => {
    it('should save checkpoints during replay', async () => {
      // Create enough events to trigger checkpoint saves
      for (let i = 0; i < 15; i++) {
        await eventStore.emit({
          type: 'lead.created',
          correlationId: `corr-${i}`,
          payload: { leadId: `lead-${i}`, score: 3 },
        });
      }

      const result = await replayService.rebuildProjection(
        'lead-stats',
        leadStatsProjectionDef,
        eventStore,
        { batchSize: 5, logProgress: false, batchDelayMs: 0 }
      );

      expect(result.checkpoints.length).toBeGreaterThanOrEqual(2);

      // Verify checkpoint was saved
      const checkpoint = await checkpointStore.getLatest('lead-stats', 1);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.eventsProcessed).toBe(result.eventsProcessed);
    });

    it('should resume from checkpoint on subsequent rebuild', async () => {
      // Create initial events
      for (let i = 0; i < 10; i++) {
        await eventStore.emit({
          type: 'lead.created',
          correlationId: `corr-${i}`,
          payload: { leadId: `lead-${i}`, score: 3 },
        });
      }

      // First rebuild
      const firstResult = await replayService.rebuildProjection(
        'lead-stats',
        leadStatsProjectionDef,
        eventStore,
        { batchSize: 5, logProgress: false, batchDelayMs: 0 }
      );

      // Add more events after first rebuild
      for (let i = 10; i < 15; i++) {
        await eventStore.emit({
          type: 'lead.created',
          correlationId: `corr-${i}`,
          payload: { leadId: `lead-${i}`, score: 4 },
        });
      }

      // Second rebuild should resume from checkpoint
      const secondResult = await replayService.rebuildProjection(
        'lead-stats',
        leadStatsProjectionDef,
        eventStore,
        { batchSize: 5, logProgress: false, batchDelayMs: 0 }
      );

      // Second rebuild should process only new events
      expect(secondResult.eventsSkipped).toBeGreaterThan(0);
      expect(secondResult.eventsProcessed + secondResult.eventsSkipped).toBeGreaterThanOrEqual(
        firstResult.eventsProcessed
      );
    });

    it('should allow clearing checkpoint for full rebuild', async () => {
      for (let i = 0; i < 5; i++) {
        await eventStore.emit({
          type: 'lead.created',
          correlationId: `corr-${i}`,
          payload: { leadId: `lead-${i}`, score: 3 },
        });
      }

      // First rebuild creates checkpoint
      await replayService.rebuildProjection('lead-stats', leadStatsProjectionDef, eventStore, {
        logProgress: false,
      });

      // Clear checkpoint
      await replayService.clearCheckpoint('lead-stats');

      // Verify checkpoint is cleared
      const checkpoint = await checkpointStore.getLatest('lead-stats', 1);
      expect(checkpoint).toBeNull();
    });
  });
});

// ============================================================================
// PROJECTION MIGRATION TESTS
// ============================================================================

describe('Projection Migration', () => {
  let migrator: ProjectionMigrator;

  beforeEach(() => {
    migrator = new ProjectionMigrator();
  });

  interface V1State {
    totalLeads: number;
  }

  interface V2State {
    totalLeads: number;
    hotLeads: number;
    coldLeads: number;
  }

  interface V3State {
    totalLeads: number;
    hotLeads: number;
    coldLeads: number;
    conversionRate: number;
  }

  it('should migrate state from v1 to v2', () => {
    migrator.registerMigration<V1State, V2State>('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState) => ({
        ...oldState,
        hotLeads: 0,
        coldLeads: 0,
      }),
    });

    const oldState: V1State = { totalLeads: 100 };
    const newState = migrator.migrateState<V2State>('lead-stats', oldState, 1, 2);

    expect(newState.totalLeads).toBe(100);
    expect(newState.hotLeads).toBe(0);
    expect(newState.coldLeads).toBe(0);
  });

  it('should chain multiple migrations', () => {
    migrator.registerMigration<V1State, V2State>('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState) => ({
        ...oldState,
        hotLeads: 0,
        coldLeads: 0,
      }),
    });

    migrator.registerMigration<V2State, V3State>('lead-stats', {
      fromVersion: 2,
      toVersion: 3,
      migrate: (oldState) => ({
        ...oldState,
        conversionRate: 0,
      }),
    });

    const oldState: V1State = { totalLeads: 100 };
    const newState = migrator.migrateState<V3State>('lead-stats', oldState, 1, 3);

    expect(newState.totalLeads).toBe(100);
    expect(newState.hotLeads).toBe(0);
    expect(newState.coldLeads).toBe(0);
    expect(newState.conversionRate).toBe(0);
  });

  it('should detect when migration is needed', () => {
    migrator.registerMigration<V1State, V2State>('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState) => ({ ...oldState, hotLeads: 0, coldLeads: 0 }),
    });

    expect(migrator.needsMigration('lead-stats', 1, 2)).toBe(true);
    expect(migrator.needsMigration('lead-stats', 2, 3)).toBe(false);
    expect(migrator.needsMigration('other-projection', 1, 2)).toBe(false);
  });
});

// ============================================================================
// PROJECTION MANAGER TESTS
// ============================================================================

describe('Projection Manager Integration', () => {
  let projectionManager: ProjectionManager;

  beforeEach(() => {
    projectionManager = new ProjectionManager();
  });

  it('should register and apply events to projections', () => {
    const leadStatsProjection = defineProjection<LeadStatsState>({
      name: 'lead-stats',
      version: 1,
      initialState: initialLeadStats,
      handlers: leadStatsProjectionDef.handlers,
    });

    const projection = projectionManager.register(leadStatsProjection);

    // Apply events
    const createEvent = createTestEvent('lead.created', { leadId: 'lead-1', score: 5 });
    projectionManager.apply(createEvent);

    expect(projection.getState().totalLeads).toBe(1);
    expect(projection.getState().hotLeads).toBe(1);
  });

  it('should handle multiple projections', () => {
    interface AppointmentStatsState {
      totalAppointments: number;
      confirmedAppointments: number;
      cancelledAppointments: number;
    }

    const appointmentProjection = defineProjection<AppointmentStatsState>({
      name: 'appointment-stats',
      version: 1,
      initialState: {
        totalAppointments: 0,
        confirmedAppointments: 0,
        cancelledAppointments: 0,
      },
      handlers: new Map([
        [
          'appointment.created',
          (state): AppointmentStatsState => ({
            ...state,
            totalAppointments: state.totalAppointments + 1,
          }),
        ],
        [
          'appointment.confirmed',
          (state): AppointmentStatsState => ({
            ...state,
            confirmedAppointments: state.confirmedAppointments + 1,
          }),
        ],
      ]),
    });

    const leadStats = projectionManager.register(
      defineProjection({
        ...leadStatsProjectionDef,
      })
    );

    const appointmentStats = projectionManager.register(appointmentProjection);

    // Apply lead event
    projectionManager.apply(createTestEvent('lead.created', { score: 4 }));

    // Apply appointment event
    projectionManager.apply(createTestEvent('appointment.created', {}));
    projectionManager.apply(createTestEvent('appointment.confirmed', {}));

    expect(leadStats.getState().totalLeads).toBe(1);
    expect(appointmentStats.getState().totalAppointments).toBe(1);
    expect(appointmentStats.getState().confirmedAppointments).toBe(1);
  });

  it('should reset projection state', () => {
    const leadStatsProjection = defineProjection<LeadStatsState>({
      name: 'lead-stats',
      version: 1,
      initialState: initialLeadStats,
      handlers: leadStatsProjectionDef.handlers,
    });

    const projection = projectionManager.register(leadStatsProjection);

    // Apply some events
    projectionManager.apply(createTestEvent('lead.created', { score: 4 }));
    projectionManager.apply(createTestEvent('lead.created', { score: 2 }));

    expect(projection.getState().totalLeads).toBe(2);

    // Reset
    projection.reset();

    expect(projection.getState().totalLeads).toBe(0);
    expect(projection.getState().hotLeads).toBe(0);
    expect(projection.getState().coldLeads).toBe(0);
  });
});
