/**
 * Event Store Concurrency Tests
 *
 * Tests to verify that the event store correctly handles concurrent writes
 * to the same aggregate with the same version, throwing ConcurrencyError
 * when duplicates are detected.
 *
 * This is CRITICAL for event sourcing integrity - without proper version
 * conflict detection, concurrent operations could corrupt aggregate state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryEventStore,
  EventStore,
  ConcurrencyError,
  type StoredEvent,
} from '../event-store.js';

describe('Event Store Concurrency', () => {
  let repository: InMemoryEventStore;
  let eventStore: EventStore;

  beforeEach(() => {
    repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'concurrency-test' });
  });

  /**
   * Helper to create an event with specific aggregate and version
   */
  function createEvent(
    aggregateId: string,
    version: number,
    type: string = 'TestEvent'
  ): StoredEvent {
    return {
      id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type,
      aggregateId,
      aggregateType: 'TestAggregate',
      version,
      payload: { test: true },
      metadata: {
        correlationId: `corr-${Date.now()}`,
        causationId: undefined,
        idempotencyKey: `idem-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString(),
        source: 'test',
      },
    };
  }

  describe('Version Conflict Detection', () => {
    it('should allow sequential events with different versions for the same aggregate', async () => {
      const aggregateId = 'test-aggregate-1';

      // First event - version 1
      const event1 = createEvent(aggregateId, 1);
      await repository.append(event1);

      // Second event - version 2
      const event2 = createEvent(aggregateId, 2);
      await repository.append(event2);

      // Both should succeed
      const events = await repository.getByAggregateId(aggregateId);
      expect(events).toHaveLength(2);
      expect(events[0]?.version).toBe(1);
      expect(events[1]?.version).toBe(2);
    });

    it('should reject duplicate events with same aggregate_id and version', async () => {
      const aggregateId = 'test-aggregate-2';
      const version = 1;

      // First event - version 1
      const event1 = createEvent(aggregateId, version);
      await repository.append(event1);

      // Second event - same aggregate_id and version (should fail!)
      const event2 = createEvent(aggregateId, version);

      // Wrap in async function to properly catch the rejection
      await expect(async () => {
        await repository.append(event2);
      }).rejects.toThrow(ConcurrencyError);
    });

    it('should throw ConcurrencyError with correct properties', async () => {
      const aggregateId = 'test-aggregate-3';
      const version = 5;

      // First event
      const event1 = createEvent(aggregateId, version);
      await repository.append(event1);

      // Try to append duplicate
      const event2 = createEvent(aggregateId, version);

      try {
        await repository.append(event2);
        expect.fail('Should have thrown ConcurrencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConcurrencyError);
        const concurrencyError = error as ConcurrencyError;
        expect(concurrencyError.code).toBe('CONCURRENCY_ERROR');
        expect(concurrencyError.aggregateId).toBe(aggregateId);
        expect(concurrencyError.expectedVersion).toBe(version);
        expect(concurrencyError.message).toContain('version conflict');
        expect(concurrencyError.message).toContain(aggregateId);
      }
    });

    it('should allow same version for different aggregates', async () => {
      const version = 1;

      // Event for aggregate A - version 1
      const eventA = createEvent('aggregate-a', version);
      await repository.append(eventA);

      // Event for aggregate B - also version 1 (should succeed)
      const eventB = createEvent('aggregate-b', version);
      await repository.append(eventB);

      // Both should exist
      const eventsA = await repository.getByAggregateId('aggregate-a');
      const eventsB = await repository.getByAggregateId('aggregate-b');

      expect(eventsA).toHaveLength(1);
      expect(eventsB).toHaveLength(1);
    });

    it('should handle concurrent version conflicts in EventStore.emit()', async () => {
      const aggregateId = 'concurrent-aggregate';
      const version = 1;

      // First emit succeeds
      await eventStore.emit({
        type: 'FirstEvent',
        correlationId: 'corr-1',
        aggregateId,
        aggregateType: 'ConcurrentTest',
        version,
        payload: { operation: 'first' },
      });

      // Second emit with same version should fail
      await expect(
        eventStore.emit({
          type: 'SecondEvent',
          correlationId: 'corr-2',
          aggregateId,
          aggregateType: 'ConcurrentTest',
          version,
          payload: { operation: 'second' },
        })
      ).rejects.toThrow(ConcurrencyError);

      // Verify only first event was stored
      const events = await eventStore.getByAggregateId(aggregateId);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('FirstEvent');
    });

    it('should handle simultaneous concurrent writes', async () => {
      const aggregateId = 'simultaneous-aggregate';
      const version = 1;

      // Create two events with same aggregate and version
      const promises = [
        eventStore.emit({
          type: 'RaceEvent1',
          correlationId: 'race-corr-1',
          aggregateId,
          aggregateType: 'RaceTest',
          version,
          payload: { racer: 1 },
        }),
        eventStore.emit({
          type: 'RaceEvent2',
          correlationId: 'race-corr-2',
          aggregateId,
          aggregateType: 'RaceTest',
          version,
          payload: { racer: 2 },
        }),
      ];

      // One should succeed, one should fail
      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // The rejection should be a ConcurrencyError
      const rejectedResult = rejected[0] as PromiseRejectedResult;
      expect(rejectedResult.reason).toBeInstanceOf(ConcurrencyError);

      // Only one event should be stored
      const events = await eventStore.getByAggregateId(aggregateId);
      expect(events).toHaveLength(1);
      expect(events[0]?.version).toBe(version);
    });

    it('should not check version for events without aggregateId', async () => {
      // Events without aggregateId (system events) should not trigger version checks
      const event1: StoredEvent = {
        id: 'sys-event-1',
        type: 'SystemEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { data: 'system1' },
        metadata: {
          correlationId: 'sys-corr-1',
          causationId: undefined,
          idempotencyKey: 'sys-idem-1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      const event2: StoredEvent = {
        id: 'sys-event-2',
        type: 'SystemEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { data: 'system2' },
        metadata: {
          correlationId: 'sys-corr-2',
          causationId: undefined,
          idempotencyKey: 'sys-idem-2',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      // Both should succeed (no version conflict check)
      await repository.append(event1);
      await repository.append(event2);

      const allEvents = repository.getAll();
      const systemEvents = allEvents.filter((e) => e.type === 'SystemEvent');
      expect(systemEvents).toHaveLength(2);
    });
  });

  describe('Idempotency', () => {
    it('should silently skip events with duplicate idempotency keys', async () => {
      const idempotencyKey = 'unique-idem-key';

      const event1: StoredEvent = {
        id: 'event-1',
        type: 'TestEvent',
        aggregateId: 'agg-1',
        aggregateType: 'Test',
        version: 1,
        payload: { attempt: 1 },
        metadata: {
          correlationId: 'corr-1',
          causationId: undefined,
          idempotencyKey,
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      const event2: StoredEvent = {
        id: 'event-2',
        type: 'TestEvent',
        aggregateId: 'agg-1',
        aggregateType: 'Test',
        version: 2, // Different version, but same idempotency key
        payload: { attempt: 2 },
        metadata: {
          correlationId: 'corr-2',
          causationId: undefined,
          idempotencyKey, // Same idempotency key!
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      // First should succeed
      await repository.append(event1);

      // Second should be silently skipped (no error)
      await repository.append(event2);

      // Only first event should be stored
      const events = repository.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.attempt).toBe(1);
    });
  });
});
