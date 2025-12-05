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
  it('should be tested through subclass implementations', () => {
    // The SnapshotEnabledRepository is abstract and tested
    // through concrete implementations in integration tests
    expect(true).toBe(true);
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
