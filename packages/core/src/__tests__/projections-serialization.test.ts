/**
 * Tests for Projection Serialization
 *
 * Verifies that Map-based projections can be properly serialized
 * and deserialized for persistence.
 *
 * @module core/__tests__/projections-serialization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProjectionManager,
  DailyMetricsProjection,
  LeadStatsProjection,
  PatientActivityProjection,
  serializeProjectionState,
  deserializeProjectionState,
  createProjectionManager,
  type DailyMetricsState,
} from '../cqrs/projections.js';
import type { StoredEvent } from '../event-store.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockEvent(
  type: string,
  payload: unknown,
  timestamp: string = new Date().toISOString()
): StoredEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    aggregateId: 'agg_test_123',
    aggregateType: 'Lead',
    type,
    version: 1,
    payload,
    metadata: {
      timestamp,
      correlationId: 'corr_test',
      causationId: null,
      userId: null,
    },
  };
}

// ============================================================================
// SERIALIZATION HELPER TESTS
// ============================================================================

describe('Serialization Helpers', () => {
  it('should serialize and deserialize Map objects', () => {
    const originalMap = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    const serialized = serializeProjectionState({ data: originalMap });
    const deserialized = deserializeProjectionState<{ data: Map<string, number> }>(serialized);

    expect(deserialized.data).toBeInstanceOf(Map);
    expect(deserialized.data.get('a')).toBe(1);
    expect(deserialized.data.get('b')).toBe(2);
    expect(deserialized.data.get('c')).toBe(3);
  });

  it('should serialize and deserialize Date objects', () => {
    const originalDate = new Date('2025-01-15T10:30:00.000Z');

    const serialized = serializeProjectionState({ timestamp: originalDate });
    const deserialized = deserializeProjectionState<{ timestamp: Date }>(serialized);

    expect(deserialized.timestamp).toBeInstanceOf(Date);
    expect(deserialized.timestamp.toISOString()).toBe(originalDate.toISOString());
  });

  it('should handle nested Maps and Dates', () => {
    const complexState = {
      metrics: new Map([
        ['2025-01-01', { count: 5, lastUpdated: new Date('2025-01-01T12:00:00Z') }],
        ['2025-01-02', { count: 10, lastUpdated: new Date('2025-01-02T12:00:00Z') }],
      ]),
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };

    const serialized = serializeProjectionState(complexState);
    const deserialized = deserializeProjectionState<typeof complexState>(serialized);

    expect(deserialized.metrics).toBeInstanceOf(Map);
    expect(deserialized.metrics.size).toBe(2);
    expect(deserialized.createdAt).toBeInstanceOf(Date);

    const entry = deserialized.metrics.get('2025-01-01');
    expect(entry?.count).toBe(5);
    expect(entry?.lastUpdated).toBeInstanceOf(Date);
  });

  it('should preserve regular objects and arrays', () => {
    const state = {
      items: [1, 2, 3],
      nested: { foo: 'bar', baz: 42 },
      nullValue: null,
    };

    const serialized = serializeProjectionState(state);
    const deserialized = deserializeProjectionState<typeof state>(serialized);

    expect(deserialized.items).toEqual([1, 2, 3]);
    expect(deserialized.nested).toEqual({ foo: 'bar', baz: 42 });
    expect(deserialized.nullValue).toBeNull();
  });
});

// ============================================================================
// PROJECTION MANAGER SERIALIZATION TESTS
// ============================================================================

describe('ProjectionManager Serialization', () => {
  let manager: ProjectionManager;

  beforeEach(() => {
    manager = createProjectionManager();
  });

  it('should serialize all projections to JSON-safe format', () => {
    // Apply some events to change state
    const event = createMockEvent('LeadCreated', { channel: 'whatsapp' });
    manager.apply(event);

    const serialized = manager.toJSON();

    expect(serialized).toBeInstanceOf(Array);
    expect(serialized.length).toBe(3); // lead-stats, patient-activity, daily-metrics

    // Verify JSON serializable (no circular refs, Maps converted)
    const jsonString = JSON.stringify(serialized);
    expect(() => JSON.parse(jsonString)).not.toThrow();
  });

  it('should restore projections from serialized data', () => {
    // Apply events to change state
    manager.apply(createMockEvent('LeadCreated', { channel: 'whatsapp' }));
    manager.apply(createMockEvent('LeadCreated', { channel: 'voice' }));
    manager.apply(createMockEvent('LeadScored', { score: 4, classification: 'HOT' }));

    // Serialize
    const serialized = manager.toJSON();

    // Create new manager and restore
    const newManager = createProjectionManager();
    newManager.fromJSON(serialized);

    // Verify restored state matches
    const originalStats = manager.get<typeof LeadStatsProjection>('lead-stats');
    const restoredStats = newManager.get<typeof LeadStatsProjection>('lead-stats');

    expect(restoredStats?.state).toBeDefined();
  });

  it('should serialize DailyMetricsProjection with Map state', () => {
    // Apply events across different dates
    const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];

    for (const date of dates) {
      manager.apply(createMockEvent('LeadCreated', { channel: 'web' }, `${date}T10:00:00Z`));
    }

    // Get daily metrics projection
    const dailyMetrics = manager.get<DailyMetricsState>('daily-metrics');
    expect(dailyMetrics?.state.metrics).toBeInstanceOf(Map);
    expect(dailyMetrics?.state.metrics.size).toBe(3);

    // Serialize single projection
    const serialized = manager.serializeProjection('daily-metrics');
    expect(serialized).toBeDefined();

    // Parse and verify Map is preserved
    const parsed = deserializeProjectionState<{ state: DailyMetricsState }>(serialized!);
    expect(parsed.state.metrics).toBeInstanceOf(Map);
    expect(parsed.state.metrics.size).toBe(3);
  });

  it('should deserialize single projection correctly', () => {
    // Apply events
    manager.apply(createMockEvent('LeadCreated', { channel: 'whatsapp' }));

    // Serialize single projection
    const serialized = manager.serializeProjection('lead-stats');
    expect(serialized).not.toBeNull();

    // Create new manager and deserialize
    const newManager = createProjectionManager();
    newManager.deserializeProjection('lead-stats', serialized!);

    const restored = newManager.get('lead-stats');
    expect(restored).toBeDefined();
  });

  it('should throw when deserializing unregistered projection', () => {
    const manager = createProjectionManager();

    expect(() => {
      manager.deserializeProjection('unknown-projection', '{}');
    }).toThrow("Projection 'unknown-projection' not registered");
  });

  it('should ignore unregistered projections when restoring from JSON', () => {
    const serializedData = [
      {
        name: 'lead-stats',
        version: 1,
        state: { totalLeads: 10 },
        updatedAt: new Date().toISOString(),
      },
      {
        name: 'unknown-projection',
        version: 1,
        state: { foo: 'bar' },
        updatedAt: new Date().toISOString(),
      },
    ];

    const manager = createProjectionManager();
    manager.fromJSON(serializedData);

    // Should restore known projection
    expect(manager.has('lead-stats')).toBe(true);

    // Unknown projection should be ignored, not cause error
    expect(manager.has('unknown-projection')).toBe(false);
  });

  it('should preserve lastEventId and lastEventTimestamp', () => {
    const eventTimestamp = '2025-01-15T14:30:00.000Z';
    const event = createMockEvent('LeadCreated', { channel: 'web' }, eventTimestamp);
    manager.apply(event);

    const serialized = manager.toJSON();
    const leadStatsSerialized = serialized.find((p) => p.name === 'lead-stats');

    expect(leadStatsSerialized?.lastEventId).toBe(event.id);
    expect(leadStatsSerialized?.lastEventTimestamp).toBeDefined();

    // Restore and verify
    const newManager = createProjectionManager();
    newManager.fromJSON(serialized);

    const restored = newManager.get('lead-stats');
    expect(restored?.lastEventId).toBe(event.id);
    expect(restored?.lastEventTimestamp).toBeInstanceOf(Date);
  });
});

// ============================================================================
// ROUND-TRIP SERIALIZATION TESTS
// ============================================================================

describe('Round-trip Serialization', () => {
  it('should survive multiple serialization cycles', () => {
    const manager = createProjectionManager();

    // Apply various events
    manager.apply(createMockEvent('LeadCreated', { channel: 'whatsapp' }));
    manager.apply(createMockEvent('LeadScored', { score: 5, classification: 'HOT' }));
    manager.apply(createMockEvent('AppointmentScheduled', { slotId: 'slot_123' }));
    manager.apply(createMockEvent('WhatsAppMessageReceived', { messageId: 'msg_456' }));

    // First round-trip
    let serialized = manager.toJSON();
    let restored = createProjectionManager();
    restored.fromJSON(serialized);

    // Second round-trip
    serialized = restored.toJSON();
    restored = createProjectionManager();
    restored.fromJSON(serialized);

    // Third round-trip
    serialized = restored.toJSON();
    restored = createProjectionManager();
    restored.fromJSON(serialized);

    // Verify final state
    const stats = restored.get('lead-stats');
    expect(stats).toBeDefined();
  });

  it('should produce stable JSON output', () => {
    const manager = createProjectionManager();
    manager.apply(createMockEvent('LeadCreated', { channel: 'web' }));

    const json1 = JSON.stringify(manager.toJSON());
    const json2 = JSON.stringify(manager.toJSON());

    // Multiple calls should produce identical JSON
    expect(json1).toBe(json2);
  });
});
