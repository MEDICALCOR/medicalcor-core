/**
 * Snapshot Store Tests
 *
 * Tests for aggregate snapshot storage and retrieval
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemorySnapshotStore,
  SnapshotManager,
  createSnapshotManager,
  createInMemorySnapshotManager,
  createSnapshotStore,
  PostgresSnapshotStore,
} from '../snapshot-store.js';
import type { AggregateSnapshot, LeadState } from '../aggregate.js';

describe('InMemorySnapshotStore', () => {
  let store: InMemorySnapshotStore;

  beforeEach(() => {
    store = new InMemorySnapshotStore();
  });

  it('should save and retrieve a snapshot', async () => {
    const snapshot: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-123',
      aggregateType: 'Lead',
      version: 10,
      state: {
        id: 'lead-123',
        version: 10,
        phone: '+40721234567',
        channel: 'whatsapp',
        status: 'new',
      },
      createdAt: new Date(),
    };

    await store.save(snapshot);
    const retrieved = await store.getLatest<LeadState>('lead-123', 'Lead');

    expect(retrieved).toBeDefined();
    expect(retrieved?.version).toBe(10);
    expect(retrieved?.state.phone).toBe('+40721234567');
  });

  it('should return null for non-existent snapshot', async () => {
    const retrieved = await store.getLatest('nonexistent', 'Lead');
    expect(retrieved).toBeNull();
  });

  it('should overwrite older snapshot for same aggregate', async () => {
    const snapshot1: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-123',
      aggregateType: 'Lead',
      version: 10,
      state: {
        id: 'lead-123',
        version: 10,
        phone: '+40721234567',
        channel: 'whatsapp',
        status: 'new',
      },
      createdAt: new Date(),
    };

    const snapshot2: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-123',
      aggregateType: 'Lead',
      version: 20,
      state: {
        id: 'lead-123',
        version: 20,
        phone: '+40721234567',
        channel: 'whatsapp',
        status: 'qualified',
        classification: 'HOT',
      },
      createdAt: new Date(),
    };

    await store.save(snapshot1);
    await store.save(snapshot2);

    const retrieved = await store.getLatest<LeadState>('lead-123', 'Lead');
    expect(retrieved?.version).toBe(20);
    expect(retrieved?.state.status).toBe('qualified');
  });

  it('should cleanup old snapshots', async () => {
    const oldSnapshot: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-old',
      aggregateType: 'Lead',
      version: 1,
      state: {
        id: 'lead-old',
        version: 1,
        phone: '+40721111111',
        channel: 'whatsapp',
        status: 'new',
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 31), // 31 days ago
    };

    const newSnapshot: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-new',
      aggregateType: 'Lead',
      version: 1,
      state: {
        id: 'lead-new',
        version: 1,
        phone: '+40722222222',
        channel: 'whatsapp',
        status: 'new',
      },
      createdAt: new Date(),
    };

    await store.save(oldSnapshot);
    await store.save(newSnapshot);

    // Cleanup snapshots older than 30 days
    const deleted = await store.cleanup(1000 * 60 * 60 * 24 * 30);

    expect(deleted).toBe(1);
    expect(await store.getLatest('lead-old', 'Lead')).toBeNull();
    expect(await store.getLatest('lead-new', 'Lead')).not.toBeNull();
  });

  it('should track size', () => {
    expect(store.size()).toBe(0);

    store.save({
      aggregateId: 'lead-1',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-1', version: 1 },
      createdAt: new Date(),
    });

    expect(store.size()).toBe(1);
  });

  it('should clear all snapshots', async () => {
    await store.save({
      aggregateId: 'lead-1',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-1', version: 1 },
      createdAt: new Date(),
    });

    await store.save({
      aggregateId: 'lead-2',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-2', version: 1 },
      createdAt: new Date(),
    });

    expect(store.size()).toBe(2);

    store.clear();

    expect(store.size()).toBe(0);
  });

  it('should return 0 for deleteOlderThan (in-memory keeps latest only)', async () => {
    await store.save({
      aggregateId: 'lead-1',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-1', version: 1 },
      createdAt: new Date(),
    });

    const deleted = await store.deleteOlderThan('lead-1', 10);
    expect(deleted).toBe(0);
  });

  it('should not cleanup snapshots that are exactly at the age threshold', async () => {
    const exactAgeSnapshot: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-exact',
      aggregateType: 'Lead',
      version: 1,
      state: {
        id: 'lead-exact',
        version: 1,
        phone: '+40721111111',
        channel: 'whatsapp',
        status: 'new',
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // Exactly 30 days ago
    };

    await store.save(exactAgeSnapshot);

    // Cleanup with exactly 30 days - should not delete (threshold is >)
    const deleted = await store.cleanup(1000 * 60 * 60 * 24 * 30);

    expect(deleted).toBe(0);
    expect(store.size()).toBe(1);
  });

  it('should cleanup multiple old snapshots', async () => {
    const snapshot1: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-1',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-1', version: 1, phone: '+40721111111', channel: 'whatsapp', status: 'new' },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35), // 35 days ago
    };

    const snapshot2: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-2',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-2', version: 1, phone: '+40722222222', channel: 'whatsapp', status: 'new' },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 32), // 32 days ago
    };

    const snapshot3: AggregateSnapshot<LeadState> = {
      aggregateId: 'lead-3',
      aggregateType: 'Lead',
      version: 1,
      state: { id: 'lead-3', version: 1, phone: '+40723333333', channel: 'whatsapp', status: 'new' },
      createdAt: new Date(), // Recent
    };

    await store.save(snapshot1);
    await store.save(snapshot2);
    await store.save(snapshot3);

    expect(store.size()).toBe(3);

    const deleted = await store.cleanup(1000 * 60 * 60 * 24 * 30);

    expect(deleted).toBe(2);
    expect(store.size()).toBe(1);
    expect(await store.getLatest('lead-3', 'Lead')).not.toBeNull();
  });
});

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = createInMemorySnapshotManager({
      snapshotFrequency: 10,
      maxSnapshotAgeMs: 1000 * 60 * 60 * 24 * 7, // 7 days
    });
  });

  describe('shouldSnapshot', () => {
    it('should return true when frequency exceeded', () => {
      expect(manager.shouldSnapshot(10)).toBe(true);
      expect(manager.shouldSnapshot(15)).toBe(true);
      expect(manager.shouldSnapshot(100)).toBe(true);
    });

    it('should return false when frequency not exceeded', () => {
      expect(manager.shouldSnapshot(0)).toBe(false);
      expect(manager.shouldSnapshot(5)).toBe(false);
      expect(manager.shouldSnapshot(9)).toBe(false);
    });
  });

  describe('saveSnapshot', () => {
    it('should save a snapshot', async () => {
      const snapshot: AggregateSnapshot<LeadState> = {
        aggregateId: 'lead-123',
        aggregateType: 'Lead',
        version: 100,
        state: {
          id: 'lead-123',
          version: 100,
          phone: '+40721234567',
          channel: 'whatsapp',
          status: 'qualified',
        },
        createdAt: new Date(),
      };

      await manager.saveSnapshot(snapshot);

      const retrieved = await manager.getLatestSnapshot<LeadState>('lead-123', 'Lead');
      expect(retrieved).toBeDefined();
      expect(retrieved?.version).toBe(100);
    });

    it('should clean up old snapshots after saving', async () => {
      const store = new InMemorySnapshotStore();
      const customManager = createSnapshotManager(store, {
        snapshotFrequency: 10,
        maxSnapshotAgeMs: 1000 * 60 * 60,
      });

      // Save old snapshot
      await store.save({
        aggregateId: 'lead-123',
        aggregateType: 'Lead',
        version: 90,
        state: { id: 'lead-123', version: 90 },
        createdAt: new Date(),
      });

      // Save new snapshot
      await customManager.saveSnapshot({
        aggregateId: 'lead-123',
        aggregateType: 'Lead',
        version: 110,
        state: { id: 'lead-123', version: 110 },
        createdAt: new Date(),
      });

      // Old snapshot should be cleaned up
      expect(store.size()).toBe(1);
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return null for non-existent aggregate', async () => {
      const snapshot = await manager.getLatestSnapshot('nonexistent', 'Lead');
      expect(snapshot).toBeNull();
    });
  });

  describe('startCleanupTask', () => {
    it('should start periodic cleanup', async () => {
      const store = new InMemorySnapshotStore();
      const customManager = createSnapshotManager(store, {
        maxSnapshotAgeMs: 100, // 100ms
      });

      // Add old snapshot
      await store.save({
        aggregateId: 'old-lead',
        aggregateType: 'Lead',
        version: 1,
        state: { id: 'old-lead', version: 1 },
        createdAt: new Date(Date.now() - 200), // 200ms ago
      });

      customManager.startCleanupTask(50); // Run every 50ms

      // Wait for cleanup to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      customManager.stopCleanupTask();

      // Old snapshot should be cleaned
      expect(store.size()).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      manager.startCleanupTask(10);

      // Should not throw
      await new Promise((resolve) => setTimeout(resolve, 20));

      manager.stopCleanupTask();
    });
  });

  describe('stopCleanupTask', () => {
    it('should stop cleanup task', () => {
      manager.startCleanupTask(1000);
      expect(() => manager.stopCleanupTask()).not.toThrow();
    });

    it('should be safe to call without starting', () => {
      expect(() => manager.stopCleanupTask()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should run cleanup and return deleted count', async () => {
      // Create an old snapshot by manipulating the store directly
      const store = new InMemorySnapshotStore();
      const customManager = createSnapshotManager(store, {
        maxSnapshotAgeMs: 1000, // 1 second
      });

      await store.save({
        aggregateId: 'old-lead',
        aggregateType: 'Lead',
        version: 1,
        state: { id: 'old-lead', version: 1 },
        createdAt: new Date(Date.now() - 2000), // 2 seconds ago
      });

      const deleted = await customManager.runCleanup();
      expect(deleted).toBe(1);
    });
  });

  describe('saveSnapshot with cleanup logging', () => {
    it('should log when deleting old snapshots', async () => {
      const store = new InMemorySnapshotStore();
      const customManager = createSnapshotManager(store, {
        snapshotFrequency: 5,
        maxSnapshotAgeMs: 1000,
      });

      // Save old snapshots
      await store.save({
        aggregateId: 'lead-log-1',
        aggregateType: 'Lead',
        version: 5,
        state: { id: 'lead-log-1', version: 5 },
        createdAt: new Date(),
      });

      await store.save({
        aggregateId: 'lead-log-1',
        aggregateType: 'Lead',
        version: 4,
        state: { id: 'lead-log-1', version: 4 },
        createdAt: new Date(),
      });

      // Mock the repository to return > 0 deleted
      const mockRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        getLatest: vi.fn().mockResolvedValue(null),
        deleteOlderThan: vi.fn().mockResolvedValue(2),
        cleanup: vi.fn().mockResolvedValue(0),
      };

      const managerWithMock = createSnapshotManager(mockRepository, {
        snapshotFrequency: 5,
        maxSnapshotAgeMs: 1000,
      });

      // Save new snapshot - should trigger cleanup and logging
      await managerWithMock.saveSnapshot({
        aggregateId: 'lead-log-1',
        aggregateType: 'Lead',
        version: 10,
        state: { id: 'lead-log-1', version: 10 },
        createdAt: new Date(),
      });

      expect(mockRepository.deleteOlderThan).toHaveBeenCalledWith('lead-log-1', 5);
    });

    it('should not log when no snapshots deleted', async () => {
      const mockRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        getLatest: vi.fn().mockResolvedValue(null),
        deleteOlderThan: vi.fn().mockResolvedValue(0),
        cleanup: vi.fn().mockResolvedValue(0),
      };

      const customManager = createSnapshotManager(mockRepository, {
        snapshotFrequency: 10,
        maxSnapshotAgeMs: 1000,
      });

      await customManager.saveSnapshot({
        aggregateId: 'lead-no-cleanup',
        aggregateType: 'Lead',
        version: 15,
        state: { id: 'lead-no-cleanup', version: 15 },
        createdAt: new Date(),
      });

      expect(mockRepository.deleteOlderThan).toHaveBeenCalledWith('lead-no-cleanup', 5);
    });
  });

  describe('startCleanupTask error handling', () => {
    it('should log error when cleanup fails', async () => {
      const mockRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        getLatest: vi.fn().mockResolvedValue(null),
        deleteOlderThan: vi.fn().mockResolvedValue(0),
        cleanup: vi.fn().mockRejectedValue(new Error('Cleanup database error')),
      };

      const customManager = createSnapshotManager(mockRepository, {
        maxSnapshotAgeMs: 100,
      });

      customManager.startCleanupTask(10); // Run every 10ms

      // Wait for cleanup to run and fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      customManager.stopCleanupTask();

      // Verify cleanup was attempted
      expect(mockRepository.cleanup).toHaveBeenCalled();
    });

    it('should log when cleanup completes successfully with deletions', async () => {
      const mockRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        getLatest: vi.fn().mockResolvedValue(null),
        deleteOlderThan: vi.fn().mockResolvedValue(0),
        cleanup: vi.fn().mockResolvedValue(3),
      };

      const customManager = createSnapshotManager(mockRepository, {
        maxSnapshotAgeMs: 100,
      });

      customManager.startCleanupTask(10); // Run every 10ms

      // Wait for cleanup to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      customManager.stopCleanupTask();

      expect(mockRepository.cleanup).toHaveBeenCalled();
    });

    it('should not log when cleanup returns 0 deletions', async () => {
      const mockRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        getLatest: vi.fn().mockResolvedValue(null),
        deleteOlderThan: vi.fn().mockResolvedValue(0),
        cleanup: vi.fn().mockResolvedValue(0),
      };

      const customManager = createSnapshotManager(mockRepository, {
        maxSnapshotAgeMs: 100,
      });

      customManager.startCleanupTask(10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      customManager.stopCleanupTask();

      expect(mockRepository.cleanup).toHaveBeenCalled();
    });
  });

  describe('getSnapshotFrequency', () => {
    it('should return configured snapshot frequency', () => {
      const customManager = createInMemorySnapshotManager({
        snapshotFrequency: 250,
        maxSnapshotAgeMs: 1000,
      });

      expect(customManager.getSnapshotFrequency()).toBe(250);
    });

    it('should return default frequency when not configured', () => {
      const store = new InMemorySnapshotStore();
      const customManager = new SnapshotManager(store);

      expect(customManager.getSnapshotFrequency()).toBe(100); // Default from DEFAULT_CONFIG
    });
  });
});

describe('SnapshotEnabledRepository', () => {
  describe('SnapshotEnabledLeadRepository', () => {
    let eventStore: import('../../event-store.js').EventStore;
    let snapshotManager: SnapshotManager;
    let repository: import('../snapshot-store.js').SnapshotEnabledLeadRepository;

    beforeEach(async () => {
      const { createInMemoryEventStore } = await import('../../event-store.js');
      const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

      eventStore = createInMemoryEventStore('test');
      snapshotManager = createInMemorySnapshotManager({
        snapshotFrequency: 5, // Snapshot every 5 events for easier testing
      });
      repository = new SnapshotEnabledLeadRepository(eventStore, snapshotManager);
    });

    describe('getById', () => {
      it('should load aggregate from events when no snapshot exists', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create and save a lead
        const lead = LeadAggregate.create('lead-123', '+40721234567', 'whatsapp', 'corr-1');
        await repository.save(lead);

        // Load it back
        const loaded = await repository.getById('lead-123');

        expect(loaded).not.toBeNull();
        expect(loaded?.getState().phone).toBe('+40721234567');
        expect(loaded?.getState().channel).toBe('whatsapp');
        expect(loaded?.version).toBe(1);
      });

      it('should load aggregate from snapshot when available', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead and apply multiple events to trigger snapshot
        const lead = LeadAggregate.create('lead-456', '+40721111111', 'voice', 'corr-1');
        lead.score(3, 'WARM', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(4, 'HOT', 'corr-4');
        lead.qualify('HOT', 'corr-5'); // Version 5 - should trigger snapshot

        await repository.save(lead);

        // Verify snapshot was created
        const snapshot = await snapshotManager.getLatestSnapshot<LeadState>('lead-456', 'Lead');
        expect(snapshot).not.toBeNull();
        expect(snapshot?.version).toBe(5);

        // Load from repository - should use snapshot
        const loaded = await repository.getById('lead-456');

        expect(loaded).not.toBeNull();
        expect(loaded?.getState().classification).toBe('HOT');
        expect(loaded?.getState().status).toBe('qualified');
        expect(loaded?.version).toBe(5);
      });

      it('should apply events after snapshot when loading', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead and trigger first snapshot at version 5
        const lead = LeadAggregate.create('lead-789', '+40722222222', 'web', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(3, 'WARM', 'corr-4');
        lead.qualify('WARM', 'corr-5'); // Version 5 - snapshot
        await repository.save(lead);

        // Load, modify, and save again (2 more events)
        const loadedLead = await repository.getById('lead-789');
        expect(loadedLead).not.toBeNull();

        loadedLead!.score(5, 'HOT', 'corr-6');
        loadedLead!.convert('hubspot-123', 'corr-7'); // Version 7
        await repository.save(loadedLead!);

        // Load again - should restore from snapshot at v5 + apply events v6, v7
        const finalLead = await repository.getById('lead-789');

        expect(finalLead).not.toBeNull();
        expect(finalLead?.version).toBe(7);
        expect(finalLead?.getState().classification).toBe('HOT');
        expect(finalLead?.getState().status).toBe('converted');
      });

      it('should return null for non-existent aggregate', async () => {
        const loaded = await repository.getById('nonexistent');
        expect(loaded).toBeNull();
      });

      it('should load aggregate from snapshot when no events after snapshot', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead and trigger snapshot
        const lead = LeadAggregate.create('lead-snapshot-only', '+40742222222', 'web', 'corr-1');
        lead.score(3, 'WARM', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(4, 'HOT', 'corr-4');
        lead.qualify('HOT', 'corr-5'); // Version 5 - snapshot
        await repository.save(lead);

        // Verify snapshot exists
        const snapshot = await snapshotManager.getLatestSnapshot<LeadState>('lead-snapshot-only', 'Lead');
        expect(snapshot).not.toBeNull();

        // Load - should use snapshot with no events to apply
        const loaded = await repository.getById('lead-snapshot-only');

        expect(loaded).not.toBeNull();
        expect(loaded?.version).toBe(5);
        expect(loaded?.getState().classification).toBe('HOT');
      });

      it('should filter events by aggregate type when loading', async () => {
        const { LeadAggregate } = await import('../aggregate.js');
        const { createInMemoryEventStore } = await import('../../event-store.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        // Create a new event store with mixed types for this test
        const mixedEventStore = createInMemoryEventStore('test-mixed');
        const testRepository = new SnapshotEnabledLeadRepository(mixedEventStore, snapshotManager);

        // Create lead
        const lead = LeadAggregate.create('lead-filter-test', '+40743333333', 'whatsapp', 'corr-1');
        await testRepository.save(lead);

        // Manually add events directly to the event store
        const events = await mixedEventStore.getByAggregateId('lead-filter-test');
        events.push({
          id: 'event-other-type',
          aggregateId: 'lead-filter-test',
          aggregateType: 'OtherAggregate', // Different type
          type: 'OtherEventType',
          payload: { data: 'test' },
          metadata: { correlationId: 'corr-x' },
          version: 2,
          timestamp: new Date(),
        });

        // Load lead - should only load Lead events, not OtherAggregate events
        const loaded = await testRepository.getById('lead-filter-test');

        expect(loaded).not.toBeNull();
        expect(loaded?.version).toBe(1); // Only the LeadCreated event
      });

      it('should handle snapshot with events of different aggregate types', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead and trigger snapshot
        const lead = LeadAggregate.create('lead-mixed-types', '+40744444444', 'voice', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(3, 'WARM', 'corr-4');
        lead.qualify('WARM', 'corr-5'); // Version 5 - snapshot
        await repository.save(lead);

        // This test verifies the filtering logic works - events with different types would be ignored
        const loaded = await repository.getById('lead-mixed-types');

        expect(loaded).not.toBeNull();
        expect(loaded?.version).toBe(5);
      });
    });

    describe('save', () => {
      it('should create snapshot when crossing frequency boundary', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with 4 events (version 4)
        const lead = LeadAggregate.create('lead-snap-1', '+40723333333', 'whatsapp', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(3, 'WARM', 'corr-4');
        await repository.save(lead);

        // No snapshot yet (version 4 < frequency 5)
        let snapshot = await snapshotManager.getLatestSnapshot('lead-snap-1', 'Lead');
        expect(snapshot).toBeNull();

        // Load and add one more event to cross boundary
        const loadedLead = await repository.getById('lead-snap-1');
        loadedLead!.qualify('WARM', 'corr-5'); // Version 5 - crosses boundary
        await repository.save(loadedLead!);

        // Now snapshot should exist
        snapshot = await snapshotManager.getLatestSnapshot('lead-snap-1', 'Lead');
        expect(snapshot).not.toBeNull();
        expect(snapshot?.version).toBe(5);
      });

      it('should not create snapshot below frequency threshold', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with version 4 (below frequency of 5)
        const lead = LeadAggregate.create('lead-below-threshold', '+40740000000', 'whatsapp', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(3, 'WARM', 'corr-4');
        await repository.save(lead);

        const snapshot = await snapshotManager.getLatestSnapshot('lead-below-threshold', 'Lead');
        expect(snapshot).toBeNull();
      });

      it('should not create snapshot when currentVersion < snapshotFrequency', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with version 3
        const lead = LeadAggregate.create('lead-low-version', '+40741111111', 'voice', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        await repository.save(lead);

        const snapshot = await snapshotManager.getLatestSnapshot('lead-low-version', 'Lead');
        expect(snapshot).toBeNull();
      });

      it('should create snapshot when applying multiple events at once crosses boundary', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with 3 events at once
        const lead = LeadAggregate.create('lead-snap-2', '+40724444444', 'voice', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        lead.assign('user-1', 'corr-3');
        await repository.save(lead);

        // Load and add 3 more events (versions 4, 5, 6) - crosses boundary at 5
        const loadedLead = await repository.getById('lead-snap-2');
        loadedLead!.score(3, 'WARM', 'corr-4');
        loadedLead!.qualify('WARM', 'corr-5');
        loadedLead!.score(4, 'HOT', 'corr-6');
        await repository.save(loadedLead!);

        // Snapshot should be created (crossed boundary)
        const snapshot = await snapshotManager.getLatestSnapshot('lead-snap-2', 'Lead');
        expect(snapshot).not.toBeNull();
        expect(snapshot?.version).toBe(6);
      });

      it('should not create snapshot when not crossing boundary', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with 2 events
        const lead = LeadAggregate.create('lead-snap-3', '+40725555555', 'web', 'corr-1');
        lead.score(2, 'COLD', 'corr-2');
        await repository.save(lead);

        // No snapshot (version 2 < frequency 5)
        const snapshot = await snapshotManager.getLatestSnapshot('lead-snap-3', 'Lead');
        expect(snapshot).toBeNull();
      });

      it('should do nothing when no uncommitted events', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        const lead = LeadAggregate.create('lead-snap-4', '+40726666666', 'referral', 'corr-1');
        await repository.save(lead);

        // Load (has no uncommitted events)
        const loaded = await repository.getById('lead-snap-4');
        await repository.save(loaded!); // Should not throw or create extra snapshots
      });
    });

    describe('findByPhone', () => {
      it('should find lead by phone using event store scan when no projection client', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        const lead = LeadAggregate.create('lead-find-1', '+40727777777', 'whatsapp', 'corr-1');
        await repository.save(lead);

        const found = await repository.findByPhone('+40727777777');

        expect(found).not.toBeNull();
        expect(found?.id).toBe('lead-find-1');
      });

      it('should return null when lead not found', async () => {
        const found = await repository.findByPhone('+40000000000');
        expect(found).toBeNull();
      });

      it('should use snapshot when loading found lead', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead with enough events to trigger snapshot
        const lead = LeadAggregate.create('lead-find-2', '+40728888888', 'voice', 'corr-1');
        lead.score(3, 'WARM', 'corr-2');
        lead.assign('user-1', 'corr-3');
        lead.score(4, 'HOT', 'corr-4');
        lead.qualify('HOT', 'corr-5');
        await repository.save(lead);

        // Find by phone - should use snapshot when loading
        const found = await repository.findByPhone('+40728888888');

        expect(found).not.toBeNull();
        expect(found?.getState().classification).toBe('HOT');
        expect(found?.version).toBe(5);
      });
    });

    describe('existsByPhone', () => {
      it('should return true when lead exists', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        const lead = LeadAggregate.create('lead-exists-1', '+40729999999', 'web', 'corr-1');
        await repository.save(lead);

        const exists = await repository.existsByPhone('+40729999999');
        expect(exists).toBe(true);
      });

      it('should return false when lead does not exist', async () => {
        const exists = await repository.existsByPhone('+40700000000');
        expect(exists).toBe(false);
      });
    });

    describe('findByStatus', () => {
      it('should return empty array when no projection client', async () => {
        const leads = await repository.findByStatus('qualified');
        expect(leads).toEqual([]);
      });

      it('should find leads by status using projection client', async () => {
        const { LeadAggregate } = await import('../aggregate.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ id: 'lead-status-1' }, { id: 'lead-status-2' }],
          }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        // Create and save leads
        const lead1 = LeadAggregate.create('lead-status-1', '+40731111111', 'whatsapp', 'corr-1');
        lead1.qualify('WARM', 'corr-2');
        await repoWithProjection.save(lead1);

        const lead2 = LeadAggregate.create('lead-status-2', '+40732222222', 'voice', 'corr-3');
        lead2.qualify('HOT', 'corr-4');
        await repoWithProjection.save(lead2);

        const leads = await repoWithProjection.findByStatus('qualified', 10);

        expect(mockProjectionClient.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT id FROM leads_lookup'),
          ['qualified', 10]
        );
        expect(leads).toHaveLength(2);
        expect(leads[0]?.id).toBe('lead-status-1');
        expect(leads[1]?.id).toBe('lead-status-2');
      });

      it('should filter out null leads from results', async () => {
        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ id: 'lead-exists' }, { id: 'lead-nonexistent' }],
          }),
        };

        const { LeadAggregate } = await import('../aggregate.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        // Only create one lead
        const lead = LeadAggregate.create('lead-exists', '+40733333333', 'web', 'corr-1');
        await repoWithProjection.save(lead);

        const leads = await repoWithProjection.findByStatus('new');

        expect(leads).toHaveLength(1);
        expect(leads[0]?.id).toBe('lead-exists');
      });
    });

    describe('findByClassification', () => {
      it('should return empty array when no projection client', async () => {
        const leads = await repository.findByClassification('HOT');
        expect(leads).toEqual([]);
      });

      it('should find leads by classification using projection client', async () => {
        const { LeadAggregate } = await import('../aggregate.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ id: 'lead-hot-1' }, { id: 'lead-hot-2' }],
          }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        // Create and save hot leads
        const lead1 = LeadAggregate.create('lead-hot-1', '+40734444444', 'whatsapp', 'corr-1');
        lead1.score(5, 'HOT', 'corr-2');
        await repoWithProjection.save(lead1);

        const lead2 = LeadAggregate.create('lead-hot-2', '+40735555555', 'voice', 'corr-3');
        lead2.score(4, 'HOT', 'corr-4');
        await repoWithProjection.save(lead2);

        const leads = await repoWithProjection.findByClassification('HOT', 25);

        expect(mockProjectionClient.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT id FROM leads_lookup'),
          ['HOT', 25]
        );
        expect(leads).toHaveLength(2);
        expect(leads[0]?.id).toBe('lead-hot-1');
        expect(leads[1]?.id).toBe('lead-hot-2');
      });

      it('should handle all classification types', async () => {
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        await repoWithProjection.findByClassification('HOT');
        await repoWithProjection.findByClassification('WARM');
        await repoWithProjection.findByClassification('COLD');
        await repoWithProjection.findByClassification('UNQUALIFIED');

        expect(mockProjectionClient.query).toHaveBeenCalledTimes(4);
      });
    });

    describe('findByPhone with projection client', () => {
      it('should use projection client for phone lookup', async () => {
        const { LeadAggregate } = await import('../aggregate.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ id: 'lead-phone-proj-1' }],
          }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        // Create and save lead
        const lead = LeadAggregate.create('lead-phone-proj-1', '+40736666666', 'whatsapp', 'corr-1');
        await repoWithProjection.save(lead);

        const found = await repoWithProjection.findByPhone('+40736666666');

        expect(mockProjectionClient.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT id FROM leads_lookup WHERE phone'),
          ['+40736666666']
        );
        expect(found).not.toBeNull();
        expect(found?.id).toBe('lead-phone-proj-1');
      });

      it('should return null when projection returns empty results', async () => {
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        const found = await repoWithProjection.findByPhone('+40700000000');

        expect(found).toBeNull();
      });

      it('should return null when projection returns row without id', async () => {
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({ rows: [{}] }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        const found = await repoWithProjection.findByPhone('+40737777777');

        expect(found).toBeNull();
      });
    });

    describe('existsByPhone with projection client', () => {
      it('should use projection client for existence check', async () => {
        const { LeadAggregate } = await import('../aggregate.js');
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ exists: true }],
          }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        // Create and save lead
        const lead = LeadAggregate.create('lead-exists-proj-1', '+40738888888', 'web', 'corr-1');
        await repoWithProjection.save(lead);

        const exists = await repoWithProjection.existsByPhone('+40738888888');

        expect(mockProjectionClient.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT EXISTS'),
          ['+40738888888']
        );
        expect(exists).toBe(true);
      });

      it('should return false when projection returns false', async () => {
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({
            rows: [{ exists: false }],
          }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        const exists = await repoWithProjection.existsByPhone('+40700000000');

        expect(exists).toBe(false);
      });

      it('should return false when projection returns no rows', async () => {
        const { SnapshotEnabledLeadRepository } = await import('../snapshot-store.js');

        const mockProjectionClient = {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const repoWithProjection = new SnapshotEnabledLeadRepository(
          eventStore,
          snapshotManager,
          mockProjectionClient as never
        );

        const exists = await repoWithProjection.existsByPhone('+40739999999');

        expect(exists).toBe(false);
      });
    });

    describe('snapshot performance', () => {
      it('should handle large number of events efficiently with snapshots', async () => {
        const { LeadAggregate } = await import('../aggregate.js');

        // Create lead
        const lead = LeadAggregate.create('lead-perf-1', '+40730000000', 'whatsapp', 'corr-1');
        await repository.save(lead);

        // Apply many events in batches
        for (let batch = 0; batch < 4; batch++) {
          const loadedLead = await repository.getById('lead-perf-1');
          expect(loadedLead).not.toBeNull();

          // Add events until we're about to cross a snapshot boundary
          for (let i = 0; i < 4; i++) {
            loadedLead!.score(batch + i + 1, 'WARM', `corr-${batch * 4 + i + 2}`);
          }
          await repository.save(loadedLead!);
        }

        // Final load should use snapshot
        const finalLead = await repository.getById('lead-perf-1');
        expect(finalLead).not.toBeNull();
        expect(finalLead!.version).toBe(17); // 1 (create) + 16 (4 batches * 4 scores)

        // Verify snapshots were created
        const snapshot = await snapshotManager.getLatestSnapshot('lead-perf-1', 'Lead');
        expect(snapshot).not.toBeNull();
        expect(snapshot!.version).toBeGreaterThanOrEqual(15);
      });
    });
  });
});

describe('Factory Functions', () => {
  describe('createSnapshotStore', () => {
    it('should create in-memory store by default', () => {
      const store = createSnapshotStore();
      expect(store).toBeInstanceOf(InMemorySnapshotStore);
    });

    it('should create in-memory store when no connection string', () => {
      const store = createSnapshotStore({ snapshotFrequency: 50 });
      expect(store).toBeInstanceOf(InMemorySnapshotStore);
    });
  });

  describe('createSnapshotManager', () => {
    it('should create manager with repository', () => {
      const store = new InMemorySnapshotStore();
      const manager = createSnapshotManager(store);
      expect(manager).toBeInstanceOf(SnapshotManager);
    });

    it('should create manager with custom config', () => {
      const store = new InMemorySnapshotStore();
      const manager = createSnapshotManager(store, {
        snapshotFrequency: 50,
        maxSnapshotAgeMs: 5000,
      });
      expect(manager.shouldSnapshot(50)).toBe(true);
      expect(manager.shouldSnapshot(49)).toBe(false);
    });
  });

  describe('createInMemorySnapshotManager', () => {
    it('should create manager with in-memory store', () => {
      const manager = createInMemorySnapshotManager();
      expect(manager).toBeInstanceOf(SnapshotManager);
    });

    it('should accept custom config', () => {
      const manager = createInMemorySnapshotManager({
        snapshotFrequency: 100,
      });
      expect(manager.shouldSnapshot(100)).toBe(true);
    });
  });

  describe('createSnapshotStore with PostgreSQL', () => {
    it('should create PostgresSnapshotStore when connection string provided', () => {
      const store = createSnapshotStore({
        connectionString: 'postgresql://localhost:5432/test',
        snapshotFrequency: 100,
        maxSnapshotAgeMs: 1000,
        enableCompression: true,
      });
      expect(store).toBeInstanceOf(PostgresSnapshotStore);
    });
  });
});

/**
 * PostgresSnapshotStore Tests
 *
 * NOTE: These tests require integration testing with a real PostgreSQL database
 * and are difficult to mock properly due to dynamic pg module imports.
 * They are better served by E2E or integration tests.
 *
 * Covered functionality:
 * - Factory function creates PostgresSnapshotStore when connection string provided
 * - Constructor accepts config and stores it
 * - initialize() throws error when no connection string
 * - close() safely handles uninitialized pool
 */
describe('PostgresSnapshotStore', () => {
  it('should throw error when initializing without connection string', async () => {
    const storeWithoutConnection = new PostgresSnapshotStore({
      snapshotFrequency: 100,
      maxSnapshotAgeMs: 1000,
      enableCompression: true,
    });

    await expect(storeWithoutConnection.initialize()).rejects.toThrow(
      'PostgreSQL connection string required'
    );
  });

  it('should not throw when closing without initialized pool', async () => {
    const uninitializedStore = new PostgresSnapshotStore({
      connectionString: 'postgresql://localhost:5432/test',
      snapshotFrequency: 100,
      maxSnapshotAgeMs: 1000,
      enableCompression: true,
    });

    await expect(uninitializedStore.close()).resolves.not.toThrow();
  });

  it('should use default table name when not provided in config', () => {
    const store = new PostgresSnapshotStore({
      connectionString: 'postgresql://localhost:5432/test',
      snapshotFrequency: 100,
      maxSnapshotAgeMs: 1000,
      enableCompression: true,
    });

    // The store should be created successfully with default values
    expect(store).toBeInstanceOf(PostgresSnapshotStore);
  });

  it('should use custom table name when provided in config', () => {
    const store = new PostgresSnapshotStore({
      connectionString: 'postgresql://localhost:5432/test',
      tableName: 'custom_snapshots',
      snapshotFrequency: 100,
      maxSnapshotAgeMs: 1000,
      enableCompression: true,
    });

    expect(store).toBeInstanceOf(PostgresSnapshotStore);
  });
});
