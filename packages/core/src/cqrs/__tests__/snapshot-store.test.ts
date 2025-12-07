/**
 * Snapshot Store Tests
 *
 * Tests for aggregate snapshot storage and retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySnapshotStore,
  SnapshotManager,
  createSnapshotManager,
  createInMemorySnapshotManager,
  createSnapshotStore,
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
});
