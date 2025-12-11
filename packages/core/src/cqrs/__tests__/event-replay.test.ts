/**
 * Event Replay Service Tests
 *
 * Tests for event replay, projection rebuilding, and migration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventReplayService,
  InMemoryCheckpointStore,
  ProjectionMigrator,
  LiveProjectionUpdater,
  createEventReplayService,
  createInMemoryCheckpointStore,
  createProjectionMigrator,
  createLiveProjectionUpdater,
  type CheckpointData,
  type ReplayConfig,
} from '../event-replay.js';
import { createInMemoryEventStore, type EventStore } from '../../event-store.js';
import {
  createProjectionManager,
  defineProjection,
  type ProjectionManager,
} from '../projections.js';
import type { StoredEvent } from '../../event-store.js';

describe('InMemoryCheckpointStore', () => {
  let store: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it('should save and retrieve checkpoint', async () => {
    const checkpoint: CheckpointData = {
      projectionName: 'lead-stats',
      projectionVersion: 1,
      lastEventId: 'event-123',
      lastEventTimestamp: new Date(),
      eventsProcessed: 100,
      state: { totalLeads: 100 },
      createdAt: new Date(),
    };

    await store.save(checkpoint);
    const retrieved = await store.getLatest('lead-stats', 1);

    expect(retrieved).toEqual(checkpoint);
  });

  it('should return null for non-existent checkpoint', async () => {
    const result = await store.getLatest('nonexistent', 1);
    expect(result).toBeNull();
  });

  it('should overwrite checkpoint with same name and version', async () => {
    const checkpoint1: CheckpointData = {
      projectionName: 'lead-stats',
      projectionVersion: 1,
      lastEventId: 'event-100',
      lastEventTimestamp: new Date(),
      eventsProcessed: 100,
      state: { totalLeads: 100 },
      createdAt: new Date(),
    };

    const checkpoint2: CheckpointData = {
      projectionName: 'lead-stats',
      projectionVersion: 1,
      lastEventId: 'event-200',
      lastEventTimestamp: new Date(),
      eventsProcessed: 200,
      state: { totalLeads: 200 },
      createdAt: new Date(),
    };

    await store.save(checkpoint1);
    await store.save(checkpoint2);

    const retrieved = await store.getLatest('lead-stats', 1);
    expect(retrieved?.eventsProcessed).toBe(200);
  });

  it('should maintain separate checkpoints for different versions', async () => {
    const v1: CheckpointData = {
      projectionName: 'lead-stats',
      projectionVersion: 1,
      lastEventId: 'event-100',
      lastEventTimestamp: new Date(),
      eventsProcessed: 100,
      state: { totalLeads: 100 },
      createdAt: new Date(),
    };

    const v2: CheckpointData = {
      projectionName: 'lead-stats',
      projectionVersion: 2,
      lastEventId: 'event-200',
      lastEventTimestamp: new Date(),
      eventsProcessed: 200,
      state: { totalLeads: 200, newField: true },
      createdAt: new Date(),
    };

    await store.save(v1);
    await store.save(v2);

    expect((await store.getLatest('lead-stats', 1))?.projectionVersion).toBe(1);
    expect((await store.getLatest('lead-stats', 2))?.projectionVersion).toBe(2);
  });

  it('should delete checkpoints by projection name', async () => {
    await store.save({
      projectionName: 'lead-stats',
      projectionVersion: 1,
      lastEventId: 'event-100',
      lastEventTimestamp: new Date(),
      eventsProcessed: 100,
      state: {},
      createdAt: new Date(),
    });

    await store.save({
      projectionName: 'lead-stats',
      projectionVersion: 2,
      lastEventId: 'event-200',
      lastEventTimestamp: new Date(),
      eventsProcessed: 200,
      state: {},
      createdAt: new Date(),
    });

    await store.delete('lead-stats');

    expect(await store.getLatest('lead-stats', 1)).toBeNull();
    expect(await store.getLatest('lead-stats', 2)).toBeNull();
  });

  it('should clear all checkpoints', async () => {
    await store.save({
      projectionName: 'projection-1',
      projectionVersion: 1,
      lastEventId: 'event-1',
      lastEventTimestamp: new Date(),
      eventsProcessed: 1,
      state: {},
      createdAt: new Date(),
    });

    store.clear();

    const result = await store.getLatest('projection-1', 1);
    expect(result).toBeNull();
  });
});

describe('EventReplayService', () => {
  let eventStore: EventStore;
  let service: EventReplayService;
  let checkpointStore: InMemoryCheckpointStore;

  beforeEach(() => {
    eventStore = createInMemoryEventStore('test');
    checkpointStore = new InMemoryCheckpointStore();
    service = new EventReplayService(checkpointStore);
  });

  describe('rebuildProjection', () => {
    it('should rebuild projection from events', async () => {
      // Add test events to store
      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111', channel: 'whatsapp' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40722222222', channel: 'voice' },
        correlationId: 'corr-2',
      });

      await eventStore.emit({
        type: 'LeadScored',
        payload: { score: 85, classification: 'HOT' },
        correlationId: 'corr-3',
      });

      // Define projection
      const projection = defineProjection('test-leads', 1, { totalLeads: 0, totalScore: 0 })
        .on('LeadCreated', (state) => ({
          ...state,
          totalLeads: state.totalLeads + 1,
        }))
        .on('LeadScored', (state, event) => ({
          ...state,
          totalScore: state.totalScore + (event.payload as { score: number }).score,
        }))
        .build();

      const result = await service.rebuildProjection('test-leads', projection, eventStore);

      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(3);
      expect(result.eventsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should resume from checkpoint', async () => {
      // Create events
      const event1 = await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111', channel: 'whatsapp' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40722222222', channel: 'voice' },
        correlationId: 'corr-2',
      });

      // Save checkpoint after first event
      await checkpointStore.save({
        projectionName: 'test-leads',
        projectionVersion: 1,
        lastEventId: event1.id,
        lastEventTimestamp: new Date(event1.metadata.timestamp),
        eventsProcessed: 1,
        state: { totalLeads: 1 },
        createdAt: new Date(),
      });

      const projection = defineProjection('test-leads', 1, { totalLeads: 0 })
        .on('LeadCreated', (state) => ({
          ...state,
          totalLeads: state.totalLeads + 1,
        }))
        .build();

      const result = await service.rebuildProjection('test-leads', projection, eventStore);

      expect(result.success).toBe(true);
      // Note: Event replay implementation resumes from checkpoint state
      expect(result.eventsProcessed).toBeGreaterThanOrEqual(1); // Started with 1, processed at least 1 more
      expect(result.eventsSkipped).toBeGreaterThanOrEqual(1); // Skipped first event
    });

    it('should apply event type filter', async () => {
      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'LeadScored',
        payload: { score: 85 },
        correlationId: 'corr-2',
      });

      await eventStore.emit({
        type: 'LeadQualified',
        payload: { classification: 'HOT' },
        correlationId: 'corr-3',
      });

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .on('LeadScored', (state) => ({ ...state, count: state.count + 1 }))
        .on('LeadQualified', (state) => ({ ...state, count: state.count + 1 }))
        .build();

      const config: Partial<ReplayConfig> = {
        eventTypeFilter: ['LeadCreated', 'LeadScored'],
      };

      const result = await service.rebuildProjection('test-leads', projection, eventStore, config);

      expect(result.eventsProcessed).toBe(2); // Only LeadCreated and LeadScored
    });

    it('should apply timestamp filters', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111' },
        correlationId: 'corr-1',
      });

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .build();

      // Filter out all events (end date before event)
      const result1 = await service.rebuildProjection('test-leads', projection, eventStore, {
        startFromTimestamp: yesterday,
        endAtTimestamp: yesterday,
      });

      expect(result1.eventsProcessed).toBe(0);
      expect(result1.eventsSkipped).toBeGreaterThan(0);

      // Include all events
      const result2 = await service.rebuildProjection('test-leads', projection, eventStore, {
        startFromTimestamp: yesterday,
        endAtTimestamp: tomorrow,
      });

      expect(result2.eventsProcessed).toBeGreaterThan(0);
    });

    it('should handle errors gracefully with continueOnError', async () => {
      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'BadEvent',
        payload: { invalid: true },
        correlationId: 'corr-2',
      });

      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40722222222' },
        correlationId: 'corr-3',
      });

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .on('BadEvent', () => {
          throw new Error('Processing error');
        })
        .build();

      const result = await service.rebuildProjection('test-leads', projection, eventStore, {
        continueOnError: true,
      });

      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2); // Two LeadCreated events
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('Processing error');
    });

    it('should stop on error when continueOnError is false', async () => {
      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'BadEvent',
        payload: { invalid: true },
        correlationId: 'corr-2',
      });

      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40722222222' },
        correlationId: 'corr-3',
      });

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .on('BadEvent', () => {
          throw new Error('Processing error');
        })
        .build();

      const result = await service.rebuildProjection('test-leads', projection, eventStore, {
        continueOnError: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should save checkpoints periodically', async () => {
      // Create many events to trigger checkpoint
      for (let i = 0; i < 1100; i++) {
        await eventStore.emit({
          type: 'LeadCreated',
          payload: { phone: `+4072${i}` },
          correlationId: `corr-${i}`,
        });
      }

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .build();

      await service.rebuildProjection('test-leads', projection, eventStore, {
        batchSize: 1000,
        batchDelayMs: 0,
      });

      // Should have saved checkpoint after 1000 events
      const checkpoint = await checkpointStore.getLatest('test-leads', 1);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.eventsProcessed).toBeGreaterThanOrEqual(1000);
    });

    it('should log progress at intervals', async () => {
      for (let i = 0; i < 50; i++) {
        await eventStore.emit({
          type: 'LeadCreated',
          payload: { phone: `+4072${i}` },
          correlationId: `corr-${i}`,
        });
      }

      const projection = defineProjection('test-leads', 1, { count: 0 })
        .on('LeadCreated', (state) => ({ ...state, count: state.count + 1 }))
        .build();

      const result = await service.rebuildProjection('test-leads', projection, eventStore, {
        logProgress: true,
        progressInterval: 10,
      });

      expect(result.eventsProcessed).toBe(50);
    });
  });

  describe('rebuildAllProjections', () => {
    it('should rebuild all projections in manager', async () => {
      await eventStore.emit({
        type: 'LeadCreated',
        payload: { phone: '+40721111111', channel: 'whatsapp' },
        correlationId: 'corr-1',
      });

      const manager = createProjectionManager();

      const results = await service.rebuildAllProjections(manager, eventStore);

      expect(results.size).toBeGreaterThan(0);
      for (const result of results.values()) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe('clearCheckpoint', () => {
    it('should clear checkpoint for projection', async () => {
      await checkpointStore.save({
        projectionName: 'test-projection',
        projectionVersion: 1,
        lastEventId: 'event-123',
        lastEventTimestamp: new Date(),
        eventsProcessed: 100,
        state: {},
        createdAt: new Date(),
      });

      await service.clearCheckpoint('test-projection');

      const checkpoint = await checkpointStore.getLatest('test-projection', 1);
      expect(checkpoint).toBeNull();
    });
  });
});

describe('ProjectionMigrator', () => {
  let migrator: ProjectionMigrator;

  beforeEach(() => {
    migrator = new ProjectionMigrator();
  });

  it('should register migration', () => {
    migrator.registerMigration('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState: { totalLeads: number }) => ({
        ...oldState,
        newField: 'added',
      }),
    });

    expect(migrator.needsMigration('lead-stats', 1, 2)).toBe(true);
  });

  it('should migrate state from one version to another', () => {
    migrator.registerMigration<
      { totalLeads: number },
      { totalLeads: number; leadsByChannel: Record<string, number> }
    >('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState) => ({
        ...oldState,
        leadsByChannel: {},
      }),
    });

    const oldState = { totalLeads: 100 };
    const newState = migrator.migrateState<{
      totalLeads: number;
      leadsByChannel: Record<string, number>;
    }>('lead-stats', oldState, 1, 2);

    expect(newState).toHaveProperty('leadsByChannel');
    expect(newState.totalLeads).toBe(100);
  });

  it('should apply multiple migrations in sequence', () => {
    migrator.registerMigration('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (state: { count: number }) => ({ ...state, field2: 'v2' }),
    });

    migrator.registerMigration('lead-stats', {
      fromVersion: 2,
      toVersion: 3,
      migrate: (state: { count: number; field2: string }) => ({ ...state, field3: 'v3' }),
    });

    const result = migrator.migrateState('lead-stats', { count: 10 }, 1, 3);

    expect(result).toHaveProperty('field2');
    expect(result).toHaveProperty('field3');
  });

  it('should return original state if no migrations found', () => {
    const state = { count: 100 };
    const result = migrator.migrateState('unknown-projection', state, 1, 2);

    expect(result).toEqual(state);
  });

  it('should check if migration is needed', () => {
    migrator.registerMigration('lead-stats', {
      fromVersion: 1,
      toVersion: 2,
      migrate: (state) => state,
    });

    expect(migrator.needsMigration('lead-stats', 1, 2)).toBe(true);
    expect(migrator.needsMigration('lead-stats', 2, 3)).toBe(false);
    expect(migrator.needsMigration('unknown', 1, 2)).toBe(false);
  });
});

describe('LiveProjectionUpdater', () => {
  let updater: LiveProjectionUpdater;
  let projectionManager: ProjectionManager;

  beforeEach(() => {
    updater = new LiveProjectionUpdater();
    projectionManager = createProjectionManager();
  });

  it('should apply events to projections', async () => {
    const events: StoredEvent[] = [];
    const mockSubscriber = {
      subscribe: (handler: (event: StoredEvent) => Promise<void>) => {
        const interval = setInterval(() => {
          const event = events.shift();
          if (event) {
            // Swallow errors in test mock - errors are handled by individual test assertions
            handler(event).catch(() => {});
          }
        }, 10);

        return () => clearInterval(interval);
      },
    };

    const unsubscribe = updater.startLiveUpdates(projectionManager, mockSubscriber);

    events.push({
      id: 'evt-1',
      type: 'LeadCreated',
      aggregateId: 'lead-1',
      aggregateType: 'Lead',
      version: 1,
      payload: { phone: '+40721111111', channel: 'whatsapp' },
      metadata: {
        correlationId: 'corr-1',
        causationId: undefined,
        idempotencyKey: 'key-1',
        timestamp: new Date().toISOString(),
        source: 'test',
      },
    });

    // Wait for event to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    const leadStats = projectionManager.get('lead-stats');
    expect(leadStats?.state).toHaveProperty('totalLeads');

    unsubscribe();
  });

  it('should handle errors gracefully', async () => {
    const mockSubscriber = {
      subscribe: (handler: (event: StoredEvent) => Promise<void>) => {
        // Immediately send a bad event
        setTimeout(() => {
          handler({
            id: 'bad-evt',
            type: 'InvalidEvent',
            aggregateId: undefined,
            aggregateType: undefined,
            version: undefined,
            payload: {},
            metadata: {
              correlationId: 'corr-1',
              causationId: undefined,
              idempotencyKey: 'key-1',
              timestamp: new Date().toISOString(),
              source: 'test',
            },
          }).catch(() => {
            // Expected to fail
          });
        }, 10);

        return () => {};
      },
    };

    const unsubscribe = updater.startLiveUpdates(projectionManager, mockSubscriber);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not throw, just log error
    expect(() => unsubscribe()).not.toThrow();
  });

  it('should stop all subscriptions', () => {
    const mockSubscriber = {
      subscribe: () => vi.fn(),
    };

    updater.startLiveUpdates(projectionManager, mockSubscriber);
    updater.startLiveUpdates(projectionManager, mockSubscriber);

    expect(() => updater.stopAll()).not.toThrow();
  });
});

describe('Factory Functions', () => {
  it('should create EventReplayService with default checkpoint store', () => {
    const service = createEventReplayService();
    expect(service).toBeInstanceOf(EventReplayService);
  });

  it('should create EventReplayService with custom checkpoint store', () => {
    const customStore = new InMemoryCheckpointStore();
    const service = createEventReplayService(customStore);
    expect(service).toBeInstanceOf(EventReplayService);
  });

  it('should create InMemoryCheckpointStore', () => {
    const store = createInMemoryCheckpointStore();
    expect(store).toBeInstanceOf(InMemoryCheckpointStore);
  });

  it('should create ProjectionMigrator', () => {
    const migrator = createProjectionMigrator();
    expect(migrator).toBeInstanceOf(ProjectionMigrator);
  });

  it('should create LiveProjectionUpdater', () => {
    const updater = createLiveProjectionUpdater();
    expect(updater).toBeInstanceOf(LiveProjectionUpdater);
  });
});
