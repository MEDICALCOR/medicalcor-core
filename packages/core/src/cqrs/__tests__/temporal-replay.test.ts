/**
 * Temporal Replay Service Tests
 *
 * Tests for:
 * - Temporal queries on event store
 * - Time-based event filtering
 * - Sliding window generation
 * - Event frequency analysis
 * - Pattern matching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TemporalReplayService,
  TemporalProjectionBuilder,
  createTemporalReplayService,
  defineTemporalProjection,
  type TemporalQueryOptions,
} from '../temporal-replay.js';
import { InMemoryEventStore, EventStore } from '../../event-store.js';
import { InMemoryCheckpointStore } from '../event-replay.js';
import { defineProjection } from '../projections.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('TemporalReplayService', () => {
  let eventStore: EventStore;
  let repository: InMemoryEventStore;
  let service: TemporalReplayService;
  let leadId: string;
  let correlationId: string;

  beforeEach(async () => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
    service = createTemporalReplayService(eventStore);
    leadId = crypto.randomUUID();
    correlationId = crypto.randomUUID();

    const baseTime = new Date('2024-01-01T10:00:00Z').getTime();

    // Create a sequence of events over time
    // Using repository.append directly to control timestamps for testing
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadCreated',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 1,
      payload: { phone: '+1234567890', channel: 'whatsapp' },
      metadata: {
        correlationId,
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime).toISOString(),
        source: 'test',
      },
    });

    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadScored',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 2,
      payload: { score: 3, classification: 'WARM' },
      metadata: {
        correlationId,
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 3600000).toISOString(), // +1 hour
        source: 'test',
      },
    });

    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadQualified',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 3,
      payload: { classification: 'HOT' },
      metadata: {
        correlationId,
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 7200000).toISOString(), // +2 hours
        source: 'test',
      },
    });

    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadConverted',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 4,
      payload: { hubspotContactId: 'hs-123' },
      metadata: {
        correlationId,
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 10800000).toISOString(), // +3 hours
        source: 'test',
      },
    });
  });

  describe('temporalQuery', () => {
    describe('as-of mode', () => {
      it('should return events up to a specific time', async () => {
        const result = await service.temporalQuery({
          mode: 'as-of',
          endTime: new Date('2024-01-01T11:30:00Z'),
          aggregateIds: [leadId],
        });

        expect(result.events.length).toBe(2);
        expect(
          result.events.every((e) => e.type === 'LeadCreated' || e.type === 'LeadScored')
        ).toBe(true);
      });
    });

    describe('between mode', () => {
      it('should return events between two times', async () => {
        const result = await service.temporalQuery({
          mode: 'between',
          startTime: new Date('2024-01-01T10:30:00Z'),
          endTime: new Date('2024-01-01T12:30:00Z'),
          aggregateIds: [leadId],
        });

        expect(result.events.length).toBe(2);
        expect(result.events.some((e) => e.type === 'LeadScored')).toBe(true);
        expect(result.events.some((e) => e.type === 'LeadQualified')).toBe(true);
      });
    });

    describe('since mode', () => {
      it('should return events since a specific time', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T12:00:00Z'),
          aggregateIds: [leadId],
        });

        expect(result.events.length).toBe(2);
        expect(result.events.some((e) => e.type === 'LeadQualified')).toBe(true);
        expect(result.events.some((e) => e.type === 'LeadConverted')).toBe(true);
      });
    });

    describe('until mode', () => {
      it('should return events until a specific time', async () => {
        const result = await service.temporalQuery({
          mode: 'until',
          endTime: new Date('2024-01-01T11:00:00Z'),
          aggregateIds: [leadId],
        });

        expect(result.events.length).toBe(2);
      });
    });

    describe('filters', () => {
      it('should filter by correlation ID', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          correlationId,
        });

        expect(result.events.length).toBe(4);
      });

      it('should filter by event types', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          eventTypes: ['LeadCreated', 'LeadConverted'],
          aggregateIds: [leadId],
        });

        expect(result.events.length).toBe(2);
      });

      it('should apply limit', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
          limit: 2,
        });

        expect(result.events.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });

      it('should sort ascending', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
          sortOrder: 'asc',
        });

        expect(result.events[0]?.type).toBe('LeadCreated');
      });

      it('should sort descending', async () => {
        const result = await service.temporalQuery({
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
          sortOrder: 'desc',
        });

        expect(result.events[0]?.type).toBe('LeadConverted');
      });
    });

    it('should compute temporal range', async () => {
      const result = await service.temporalQuery({
        mode: 'since',
        startTime: new Date('2024-01-01T00:00:00Z'),
        aggregateIds: [leadId],
      });

      expect(result.temporalRange.earliest).toEqual(new Date('2024-01-01T10:00:00.000Z'));
      expect(result.temporalRange.latest).toEqual(new Date('2024-01-01T13:00:00.000Z'));
    });

    it('should include query time metric', async () => {
      const result = await service.temporalQuery({
        mode: 'since',
        startTime: new Date('2024-01-01T00:00:00Z'),
        aggregateIds: [leadId],
      });

      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('replayProjectionTemporal', () => {
    it('should replay projection with temporal filter', async () => {
      const counterProjection = defineProjection('event-counter', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ count: state.count + 1 }))
        .on('LeadScored', (state) => ({ count: state.count + 1 }))
        .on('LeadQualified', (state) => ({ count: state.count + 1 }))
        .on('LeadConverted', (state) => ({ count: state.count + 1 }))
        .build();

      const result = await service.replayProjectionTemporal('event-counter', counterProjection, {
        mode: 'between',
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T12:00:00Z'),
        aggregateIds: [leadId],
      });

      // Between 10:00 and 12:00 inclusive: LeadCreated(10:00), LeadScored(11:00), LeadQualified(12:00)
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(3);
      expect((result.finalState as { count: number }).count).toBe(3);
    });

    it('should track errors during replay', async () => {
      const badProjection = defineProjection('bad-projection', 1, {})
        .on('LeadCreated', () => {
          throw new Error('Intentional error');
        })
        .build();

      const result = await service.replayProjectionTemporal('bad-projection', badProjection, {
        mode: 'since',
        startTime: new Date('2024-01-01T00:00:00Z'),
        aggregateIds: [leadId],
      });

      expect(result.success).toBe(true); // continueOnError is true by default
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should create checkpoints during replay', async () => {
      const counterProjection = defineProjection('checkpoint-test', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ count: state.count + 1 }))
        .on('LeadScored', (state) => ({ count: state.count + 1 }))
        .on('LeadQualified', (state) => ({ count: state.count + 1 }))
        .on('LeadConverted', (state) => ({ count: state.count + 1 }))
        .build();

      const checkpointStore = new InMemoryCheckpointStore();
      const serviceWithCheckpoints = createTemporalReplayService(eventStore, checkpointStore);

      const result = await serviceWithCheckpoints.replayProjectionTemporal(
        'checkpoint-test',
        counterProjection,
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        }
      );

      expect(result.checkpointsCreated).toBeGreaterThan(0);
    });
  });

  describe('generateEventWindows', () => {
    it('should generate sliding windows', async () => {
      const windows = await service.generateEventWindows(
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        },
        {
          windowDurationMs: 2 * 3600000, // 2 hours
          slideIntervalMs: 1 * 3600000, // 1 hour slide
        }
      );

      expect(windows.length).toBeGreaterThan(0);
    });

    it('should include events in each window', async () => {
      const windows = await service.generateEventWindows(
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        },
        {
          windowDurationMs: 2 * 3600000,
          slideIntervalMs: 3600000,
        }
      );

      // Each window should have event metadata
      for (const window of windows) {
        expect(window.start).toBeInstanceOf(Date);
        expect(window.end).toBeInstanceOf(Date);
        expect(window.aggregateIds).toBeInstanceOf(Set);
        expect(window.eventTypes).toBeInstanceOf(Set);
      }
    });

    it('should respect max windows limit', async () => {
      const windows = await service.generateEventWindows(
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        },
        {
          windowDurationMs: 3600000, // 1 hour
          slideIntervalMs: 1800000, // 30 min
          maxWindows: 3,
        }
      );

      expect(windows.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getEventFrequency', () => {
    it('should compute event frequency in buckets', async () => {
      const buckets = await service.getEventFrequency(
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        },
        3600000 // 1 hour buckets
      );

      expect(buckets.length).toBeGreaterThan(0);

      // Check bucket structure
      for (const bucket of buckets) {
        expect(bucket.bucketStart).toBeInstanceOf(Date);
        expect(bucket.bucketEnd).toBeInstanceOf(Date);
        expect(typeof bucket.count).toBe('number');
        expect(typeof bucket.byType).toBe('object');
      }
    });

    it('should count events by type in each bucket', async () => {
      const buckets = await service.getEventFrequency(
        {
          mode: 'since',
          startTime: new Date('2024-01-01T00:00:00Z'),
          aggregateIds: [leadId],
        },
        3600000
      );

      // Find bucket with LeadCreated
      const firstBucket = buckets[0];
      expect(firstBucket?.byType.LeadCreated).toBe(1);
    });
  });

  describe('findEventPattern', () => {
    it('should find event sequence pattern', async () => {
      const matches = await service.findEventPattern(leadId, [
        'LeadCreated',
        'LeadScored',
        'LeadQualified',
      ]);

      expect(matches.length).toBe(1);
      expect(matches[0]?.events.length).toBe(3);
    });

    it('should return empty array if pattern not found', async () => {
      const matches = await service.findEventPattern(leadId, [
        'LeadCreated',
        'LeadLost', // This doesn't exist
      ]);

      expect(matches.length).toBe(0);
    });

    it('should respect max gap constraint', async () => {
      // With a 30-minute gap limit, the pattern should not match
      // because our events are 1 hour apart
      const matches = await service.findEventPattern(
        leadId,
        ['LeadCreated', 'LeadScored'],
        1800000 // 30 minutes
      );

      expect(matches.length).toBe(0);
    });

    it('should match with sufficient gap time', async () => {
      // With a 2-hour gap limit, the pattern should match
      const matches = await service.findEventPattern(
        leadId,
        ['LeadCreated', 'LeadScored'],
        7200000 // 2 hours
      );

      expect(matches.length).toBe(1);
    });
  });

  describe('clearCheckpoint', () => {
    it('should clear checkpoint for fresh replay', async () => {
      const checkpointStore = new InMemoryCheckpointStore();
      const serviceWithCheckpoints = createTemporalReplayService(eventStore, checkpointStore);

      // Create a checkpoint
      await checkpointStore.save({
        projectionName: 'test-projection',
        projectionVersion: 1,
        lastEventId: 'event-123',
        lastEventTimestamp: new Date(),
        eventsProcessed: 100,
        state: {},
        createdAt: new Date(),
      });

      // Clear it
      await serviceWithCheckpoints.clearCheckpoint('test-projection');

      // Verify it's cleared
      const checkpoint = await checkpointStore.getLatest('test-projection', 1);
      expect(checkpoint).toBeNull();
    });
  });
});

// ============================================================================
// TEMPORAL PROJECTION BUILDER TESTS
// ============================================================================

describe('TemporalProjectionBuilder', () => {
  it('should build projection with standard handlers', () => {
    const projection = defineTemporalProjection('test', 1, { count: 0 })
      .on('TestEvent', (state) => ({ count: state.count + 1 }))
      .build();

    expect(projection.name).toBe('test');
    expect(projection.version).toBe(1);
    expect(projection.handlers.size).toBe(1);
  });

  it('should build projection with temporal handlers', () => {
    const projection = defineTemporalProjection('test', 1, { count: 0, lastEventTime: null })
      .onTemporal('TestEvent', (state, event, context) => ({
        count: state.count + 1,
        lastEventTime: context.eventTime,
      }))
      .build();

    expect(projection.temporalHandlers.size).toBe(1);
  });

  it('should support mixed handlers', () => {
    const projection = defineTemporalProjection('test', 1, { a: 0, b: 0 })
      .on('EventA', (state) => ({ ...state, a: state.a + 1 }))
      .onTemporal('EventB', (state, _event, _context) => ({ ...state, b: state.b + 1 }))
      .build();

    expect(projection.handlers.size).toBe(1);
    expect(projection.temporalHandlers.size).toBe(1);
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createTemporalReplayService', () => {
  it('should create service with default config', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const service = createTemporalReplayService(eventStore);

    expect(service).toBeInstanceOf(TemporalReplayService);
  });

  it('should create service with custom config', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const checkpointStore = new InMemoryCheckpointStore();

    const service = createTemporalReplayService(eventStore, checkpointStore, undefined, {
      batchSize: 500,
      enableParallel: true,
      parallelWorkers: 8,
    });

    expect(service).toBeInstanceOf(TemporalReplayService);
  });
});
