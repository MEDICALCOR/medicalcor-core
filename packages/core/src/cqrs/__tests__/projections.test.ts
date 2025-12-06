/**
 * CQRS Projections Tests
 *
 * Comprehensive tests for projection system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProjectionBuilder,
  ProjectionManager,
  defineProjection,
  serializeProjectionState,
  deserializeProjectionState,
  LeadStatsProjection,
  PatientActivityProjection,
  DailyMetricsProjection,
  createProjectionManager,
  type Projection,
  type LeadStatsState,
  type PatientActivityState,
  type DailyMetricsState,
} from '../projections.js';
import type { StoredEvent } from '../../event-store.js';

describe('CQRS Projections', () => {
  const createEvent = (type: string, payload: Record<string, unknown> = {}): StoredEvent => ({
    id: crypto.randomUUID(),
    type,
    payload,
    aggregateId: 'test-aggregate-id',
    aggregateType: 'test',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    },
  });

  describe('ProjectionBuilder', () => {
    it('should create a projection with name and version', () => {
      const projection = new ProjectionBuilder('test', 1, { count: 0 }).build();

      expect(projection.name).toBe('test');
      expect(projection.version).toBe(1);
      expect(projection.initialState).toEqual({ count: 0 });
    });

    it('should register event handlers', () => {
      const projection = new ProjectionBuilder('test', 1, { count: 0 })
        .on('Increment', (state) => ({ count: state.count + 1 }))
        .on('Decrement', (state) => ({ count: state.count - 1 }))
        .build();

      expect(projection.handlers.size).toBe(2);
      expect(projection.handlers.has('Increment')).toBe(true);
      expect(projection.handlers.has('Decrement')).toBe(true);
    });

    it('should allow chaining of handlers', () => {
      const builder = new ProjectionBuilder('test', 1, { value: '' });

      const result = builder
        .on('EventA', (state) => ({ ...state, value: 'a' }))
        .on('EventB', (state) => ({ ...state, value: 'b' }));

      expect(result).toBe(builder);
    });
  });

  describe('defineProjection', () => {
    it('should create a ProjectionBuilder', () => {
      const builder = defineProjection('my-projection', 2, { data: null });

      expect(builder).toBeInstanceOf(ProjectionBuilder);

      const projection = builder.build();
      expect(projection.name).toBe('my-projection');
      expect(projection.version).toBe(2);
    });
  });

  describe('serializeProjectionState / deserializeProjectionState', () => {
    it('should serialize and deserialize simple objects', () => {
      const state = { count: 5, name: 'test' };
      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized).toEqual(state);
    });

    it('should handle Map objects', () => {
      const state = {
        items: new Map([
          ['a', 1],
          ['b', 2],
        ]),
      };

      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized.items).toBeInstanceOf(Map);
      expect(deserialized.items.get('a')).toBe(1);
      expect(deserialized.items.get('b')).toBe(2);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-12-05T10:00:00Z');
      const state = { createdAt: date };

      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized.createdAt).toBeInstanceOf(Date);
      expect(deserialized.createdAt.toISOString()).toBe(date.toISOString());
    });

    it('should handle nested structures with Maps and Dates', () => {
      const state = {
        metrics: new Map([['2024-01-01', { count: 5, timestamp: new Date('2024-01-01') }]]),
        updatedAt: new Date('2024-12-05'),
      };

      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized.metrics).toBeInstanceOf(Map);
      expect(deserialized.updatedAt).toBeInstanceOf(Date);
    });

    it('should handle arrays', () => {
      const state = { items: [1, 2, 3] };
      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized.items).toEqual([1, 2, 3]);
    });

    it('should handle null and undefined', () => {
      const state = { nullable: null, optional: undefined };
      const serialized = serializeProjectionState(state);
      const deserialized = deserializeProjectionState<typeof state>(serialized);

      expect(deserialized.nullable).toBeNull();
      // undefined becomes undefined after JSON parse
      expect('optional' in deserialized).toBe(false);
    });
  });

  describe('ProjectionManager', () => {
    let manager: ProjectionManager;

    beforeEach(() => {
      manager = new ProjectionManager();
    });

    describe('register', () => {
      it('should register a projection', () => {
        const definition = defineProjection('test', 1, { count: 0 }).build();
        manager.register(definition);

        expect(manager.has('test')).toBe(true);
      });

      it('should initialize state with initial value', () => {
        const definition = defineProjection('test', 1, { count: 10 }).build();
        manager.register(definition);

        const projection = manager.get<{ count: number }>('test');
        expect(projection?.state.count).toBe(10);
      });
    });

    describe('apply', () => {
      it('should apply event to matching projection', () => {
        const definition = defineProjection('counter', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);
        manager.apply(createEvent('Increment'));

        const projection = manager.get<{ count: number }>('counter');
        expect(projection?.state.count).toBe(1);
      });

      it('should apply event to multiple projections', () => {
        const counter1 = defineProjection('counter1', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        const counter2 = defineProjection('counter2', 1, { count: 100 })
          .on('Increment', (state) => ({ count: state.count + 10 }))
          .build();

        manager.register(counter1);
        manager.register(counter2);
        manager.apply(createEvent('Increment'));

        expect(manager.get<{ count: number }>('counter1')?.state.count).toBe(1);
        expect(manager.get<{ count: number }>('counter2')?.state.count).toBe(110);
      });

      it('should update lastEventId and lastEventTimestamp', () => {
        const definition = defineProjection('test', 1, { value: 0 })
          .on('Update', (state) => ({ value: state.value + 1 }))
          .build();

        manager.register(definition);
        const event = createEvent('Update');
        manager.apply(event);

        const projection = manager.get('test');
        expect(projection?.lastEventId).toBe(event.id);
        expect(projection?.lastEventTimestamp).toBeInstanceOf(Date);
      });

      it('should ignore events without handlers', () => {
        const definition = defineProjection('test', 1, { count: 0 })
          .on('Known', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);
        manager.apply(createEvent('Unknown'));

        const projection = manager.get<{ count: number }>('test');
        expect(projection?.state.count).toBe(0);
      });
    });

    describe('rebuild', () => {
      it('should rebuild projection from events', () => {
        const definition = defineProjection('counter', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);

        const events = [
          createEvent('Increment'),
          createEvent('Increment'),
          createEvent('Increment'),
        ];

        manager.rebuild('counter', events);

        const projection = manager.get<{ count: number }>('counter');
        expect(projection?.state.count).toBe(3);
      });

      it('should reset to initial state before rebuilding', () => {
        const definition = defineProjection('counter', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);

        // Apply some events first
        manager.apply(createEvent('Increment'));
        manager.apply(createEvent('Increment'));

        // Rebuild with only one event
        manager.rebuild('counter', [createEvent('Increment')]);

        const projection = manager.get<{ count: number }>('counter');
        expect(projection?.state.count).toBe(1);
      });

      it('should throw for non-existent projection', () => {
        expect(() => manager.rebuild('non-existent', [])).toThrow(
          "Projection 'non-existent' not found"
        );
      });

      it('should update lastEventId from last event', () => {
        const definition = defineProjection('test', 1, { value: 0 })
          .on('Update', (state) => ({ value: state.value + 1 }))
          .build();

        manager.register(definition);

        const events = [createEvent('Update'), createEvent('Update')];
        manager.rebuild('test', events);

        const projection = manager.get('test');
        expect(projection?.lastEventId).toBe(events[1]?.id);
      });
    });

    describe('get', () => {
      it('should return projection by name', () => {
        const definition = defineProjection('my-projection', 1, { data: 'test' }).build();
        manager.register(definition);

        const projection = manager.get<{ data: string }>('my-projection');
        expect(projection?.name).toBe('my-projection');
        expect(projection?.state.data).toBe('test');
      });

      it('should return undefined for non-existent projection', () => {
        expect(manager.get('non-existent')).toBeUndefined();
      });
    });

    describe('getAll', () => {
      it('should return all projections', () => {
        manager.register(defineProjection('a', 1, {}).build());
        manager.register(defineProjection('b', 1, {}).build());
        manager.register(defineProjection('c', 1, {}).build());

        const all = manager.getAll();
        expect(all).toHaveLength(3);
      });

      it('should return empty array when no projections', () => {
        expect(manager.getAll()).toEqual([]);
      });
    });

    describe('has', () => {
      it('should return true for registered projections', () => {
        manager.register(defineProjection('test', 1, {}).build());
        expect(manager.has('test')).toBe(true);
      });

      it('should return false for non-existent projections', () => {
        expect(manager.has('non-existent')).toBe(false);
      });
    });

    describe('toJSON / fromJSON', () => {
      it('should serialize and restore projections', () => {
        const definition = defineProjection('counter', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);
        manager.apply(createEvent('Increment'));
        manager.apply(createEvent('Increment'));

        const json = manager.toJSON();

        const newManager = new ProjectionManager();
        newManager.register(definition);
        newManager.fromJSON(json);

        const restored = newManager.get<{ count: number }>('counter');
        expect(restored?.state.count).toBe(2);
      });

      it('should handle Maps in state during serialization', () => {
        const definition = defineProjection<{ data: Map<string, number> }>('map-test', 1, {
          data: new Map(),
        })
          .on('Add', (state, event) => {
            const newData = new Map(state.data);
            const payload = event.payload as { key: string; value: number };
            newData.set(payload.key, payload.value);
            return { data: newData };
          })
          .build();

        manager.register(definition);
        manager.apply(createEvent('Add', { key: 'a', value: 1 }));
        manager.apply(createEvent('Add', { key: 'b', value: 2 }));

        const json = manager.toJSON();

        const newManager = new ProjectionManager();
        newManager.register(definition);
        newManager.fromJSON(json);

        const restored = newManager.get<{ data: Map<string, number> }>('map-test');
        expect(restored?.state.data.get('a')).toBe(1);
        expect(restored?.state.data.get('b')).toBe(2);
      });

      it('should skip unregistered projections during fromJSON', () => {
        const definition = defineProjection('known', 1, { value: 0 }).build();
        manager.register(definition);

        const json = [
          { name: 'known', version: 1, state: { value: 5 }, updatedAt: new Date().toISOString() },
          {
            name: 'unknown',
            version: 1,
            state: { value: 10 },
            updatedAt: new Date().toISOString(),
          },
        ];

        manager.fromJSON(json);

        expect(manager.get<{ value: number }>('known')?.state.value).toBe(5);
        expect(manager.has('unknown')).toBe(false);
      });

      it('should restore timestamps correctly', () => {
        const definition = defineProjection('test', 1, {}).build();
        manager.register(definition);

        const timestamp = new Date('2024-12-05T10:00:00Z');
        const json = [
          {
            name: 'test',
            version: 1,
            state: {},
            lastEventId: 'event-123',
            lastEventTimestamp: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
          },
        ];

        manager.fromJSON(json);

        const restored = manager.get('test');
        expect(restored?.lastEventId).toBe('event-123');
        expect(restored?.lastEventTimestamp).toBeInstanceOf(Date);
        expect(restored?.updatedAt).toBeInstanceOf(Date);
      });
    });

    describe('serializeProjection / deserializeProjection', () => {
      it('should serialize a single projection', () => {
        const definition = defineProjection('test', 1, { count: 0 })
          .on('Increment', (state) => ({ count: state.count + 1 }))
          .build();

        manager.register(definition);
        manager.apply(createEvent('Increment'));

        const json = manager.serializeProjection('test');
        expect(json).toBeDefined();
        expect(typeof json).toBe('string');

        const parsed = JSON.parse(json!);
        expect(parsed.name).toBe('test');
      });

      it('should return null for non-existent projection', () => {
        expect(manager.serializeProjection('non-existent')).toBeNull();
      });

      it('should deserialize a single projection', () => {
        const definition = defineProjection('test', 1, { count: 0 }).build();
        manager.register(definition);

        const json = JSON.stringify({
          name: 'test',
          version: 1,
          state: { count: 42 },
          updatedAt: new Date().toISOString(),
        });

        manager.deserializeProjection('test', json);

        const projection = manager.get<{ count: number }>('test');
        expect(projection?.state.count).toBe(42);
      });

      it('should throw when deserializing to unregistered projection', () => {
        const json = JSON.stringify({ name: 'unknown', version: 1, state: {} });
        expect(() => manager.deserializeProjection('unknown', json)).toThrow(
          "Projection 'unknown' not registered"
        );
      });
    });
  });

  describe('LeadStatsProjection', () => {
    let manager: ProjectionManager;

    beforeEach(() => {
      manager = new ProjectionManager();
      manager.register(LeadStatsProjection);
    });

    it('should track lead creation', () => {
      manager.apply(createEvent('LeadCreated', { channel: 'whatsapp' }));
      manager.apply(createEvent('LeadCreated', { channel: 'voice' }));
      manager.apply(createEvent('LeadCreated', { channel: 'whatsapp' }));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.totalLeads).toBe(3);
      expect(stats?.state.leadsByChannel.whatsapp).toBe(2);
      expect(stats?.state.leadsByChannel.voice).toBe(1);
      expect(stats?.state.leadsByStatus.new).toBe(3);
    });

    it('should track lead scoring', () => {
      manager.apply(createEvent('LeadScored', { score: 80, classification: 'HOT' }));
      manager.apply(createEvent('LeadScored', { score: 60, classification: 'WARM' }));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.scoredLeads).toBe(2);
      expect(stats?.state.totalScore).toBe(140);
      expect(stats?.state.averageScore).toBe(70);
      expect(stats?.state.leadsByClassification.HOT).toBe(1);
      expect(stats?.state.leadsByClassification.WARM).toBe(1);
    });

    it('should track lead qualification', () => {
      manager.apply(createEvent('LeadCreated', { channel: 'web' }));
      manager.apply(createEvent('LeadQualified', { classification: 'HOT' }));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.leadsByStatus.new).toBe(0);
      expect(stats?.state.leadsByStatus.qualified).toBe(1);
      expect(stats?.state.leadsByClassification.HOT).toBe(1);
    });

    it('should track lead conversion', () => {
      manager.apply(createEvent('LeadCreated', { channel: 'web' }));
      manager.apply(createEvent('LeadQualified', { classification: 'HOT' }));
      manager.apply(createEvent('LeadConverted', {}));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.convertedLeads).toBe(1);
      expect(stats?.state.conversionRate).toBe(1);
      expect(stats?.state.leadsByStatus.qualified).toBe(0);
      expect(stats?.state.leadsByStatus.converted).toBe(1);
    });

    it('should track lost leads', () => {
      manager.apply(createEvent('LeadLost', {}));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.leadsByStatus.lost).toBe(1);
    });

    it('should not go below 0 for status counts', () => {
      manager.apply(createEvent('LeadQualified', { classification: 'HOT' }));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.leadsByStatus.new).toBe(0);
    });

    it('should calculate conversion rate correctly', () => {
      manager.apply(createEvent('LeadCreated', { channel: 'web' }));
      manager.apply(createEvent('LeadCreated', { channel: 'web' }));
      manager.apply(createEvent('LeadConverted', {}));

      const stats = manager.get<LeadStatsState>('lead-stats');
      expect(stats?.state.conversionRate).toBe(0.5);
    });
  });

  describe('PatientActivityProjection', () => {
    let manager: ProjectionManager;

    beforeEach(() => {
      manager = new ProjectionManager();
      manager.register(PatientActivityProjection);
    });

    it('should track scheduled appointments', () => {
      manager.apply(createEvent('AppointmentScheduled', { date: '2024-12-10' }));

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.appointmentsScheduled).toBe(1);
      expect(activity?.state.recentActivities).toHaveLength(1);
      expect(activity?.state.recentActivities[0]?.type).toBe('appointment_scheduled');
    });

    it('should track cancelled appointments', () => {
      manager.apply(createEvent('AppointmentCancelled', { reason: 'patient request' }));

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.appointmentsCancelled).toBe(1);
    });

    it('should track received messages', () => {
      manager.apply(createEvent('WhatsAppMessageReceived', { from: '+40712345678' }));

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.messagesReceived).toBe(1);
    });

    it('should track sent messages', () => {
      manager.apply(createEvent('WhatsAppMessageSent', { to: '+40712345678' }));

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.messagesSent).toBe(1);
    });

    it('should limit recent activities to 100', () => {
      for (let i = 0; i < 105; i++) {
        manager.apply(createEvent('AppointmentScheduled', { index: i }));
      }

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.recentActivities.length).toBeLessThanOrEqual(100);
    });
  });

  describe('DailyMetricsProjection', () => {
    let manager: ProjectionManager;

    beforeEach(() => {
      manager = new ProjectionManager();
      manager.register(DailyMetricsProjection);
    });

    it('should track daily lead creation', () => {
      const event = createEvent('LeadCreated', { channel: 'web' });
      manager.apply(event);

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      const today = new Date().toISOString().split('T')[0]!;
      const todayMetrics = metrics?.state.metrics.get(today);

      expect(todayMetrics?.newLeads).toBe(1);
    });

    it('should track daily qualified leads', () => {
      manager.apply(createEvent('LeadQualified', { classification: 'HOT' }));

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      const today = new Date().toISOString().split('T')[0]!;

      expect(metrics?.state.metrics.get(today)?.qualifiedLeads).toBe(1);
    });

    it('should track daily converted leads', () => {
      manager.apply(createEvent('LeadConverted', {}));

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      const today = new Date().toISOString().split('T')[0]!;

      expect(metrics?.state.metrics.get(today)?.convertedLeads).toBe(1);
    });

    it('should track daily scheduled appointments', () => {
      manager.apply(createEvent('AppointmentScheduled', {}));

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      const today = new Date().toISOString().split('T')[0]!;

      expect(metrics?.state.metrics.get(today)?.appointmentsScheduled).toBe(1);
    });

    it('should track daily messages', () => {
      manager.apply(createEvent('WhatsAppMessageReceived', {}));
      manager.apply(createEvent('WhatsAppMessageSent', {}));

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      const today = new Date().toISOString().split('T')[0]!;
      const todayMetrics = metrics?.state.metrics.get(today);

      expect(todayMetrics?.messagesReceived).toBe(1);
      expect(todayMetrics?.messagesSent).toBe(1);
    });

    it('should group events by date', () => {
      // Apply events with different timestamps
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const event1: StoredEvent = {
        ...createEvent('LeadCreated', {}),
        metadata: {
          timestamp: yesterday.toISOString(),
          correlationId: 'test',
        },
      };

      const event2 = createEvent('LeadCreated', {});

      manager.apply(event1);
      manager.apply(event2);

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      expect(metrics?.state.metrics.size).toBe(2);
    });
  });

  describe('createProjectionManager', () => {
    it('should create manager with default projections', () => {
      const manager = createProjectionManager();

      expect(manager.has('lead-stats')).toBe(true);
      expect(manager.has('patient-activity')).toBe(true);
      expect(manager.has('daily-metrics')).toBe(true);
    });

    it('should have correct initial states', () => {
      const manager = createProjectionManager();

      const leadStats = manager.get<LeadStatsState>('lead-stats');
      expect(leadStats?.state.totalLeads).toBe(0);

      const activity = manager.get<PatientActivityState>('patient-activity');
      expect(activity?.state.appointmentsScheduled).toBe(0);

      const metrics = manager.get<DailyMetricsState>('daily-metrics');
      expect(metrics?.state.metrics.size).toBe(0);
    });
  });
});
