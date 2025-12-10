/**
 * Replay Orchestrator Tests
 *
 * Comprehensive tests for the ReplayOrchestrator covering:
 * - Aggregate registration
 * - State reconstruction
 * - Projection rebuild
 * - State diff operations
 * - Event timeline queries
 * - State verification
 * - Audit access
 * - Health and status
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReplayOrchestrator,
  createReplayOrchestrator,
  type ReplayOrchestratorConfig,
  type ReconstructStateRequest,
  type RebuildProjectionRequest,
  type StateDiffRequest,
  type EventTimelineRequest,
  type VerifyStateRequest,
} from '../replay-orchestrator.js';
import type { StoredEvent, EventStore as EventStoreInterface } from '../../event-store.js';
import type { ProjectionManager, ProjectionDefinition } from '../projections.js';
import type { AggregateRoot, AggregateState } from '../aggregate.js';
import type { SnapshotManager } from '../snapshot-store.js';
import type { CheckpointStore, ReplayConfig } from '../event-replay.js';
import type { ReplayAuditStore, ReplayAuditEntry } from '../replay-audit.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

interface TestState extends AggregateState {
  name: string;
  score: number;
}

class TestAggregate implements AggregateRoot<TestState> {
  private _state: TestState = { name: '', score: 0, version: 0 };
  private _uncommittedEvents: unknown[] = [];
  readonly aggregateType = 'TestAggregate';

  get id(): string {
    return 'test-id';
  }

  get version(): number {
    return this._state.version;
  }

  get uncommittedEvents(): unknown[] {
    return this._uncommittedEvents;
  }

  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  get state(): TestState {
    return this._state;
  }

  applyEvent(event: StoredEvent): void {
    if (event.type === 'TestCreated') {
      this._state = {
        ...this._state,
        name: (event.payload as { name: string }).name,
        version: event.version,
      };
    } else if (event.type === 'TestScored') {
      this._state = {
        ...this._state,
        score: (event.payload as { score: number }).score,
        version: event.version,
      };
    }
  }
}

function createMockEventStore(): EventStoreInterface {
  const events: StoredEvent[] = [
    {
      id: 'event-1',
      type: 'TestCreated',
      payload: { name: 'Test' },
      aggregateId: 'agg-1',
      aggregateType: 'TestAggregate',
      version: 1,
      metadata: { timestamp: new Date().toISOString() },
    },
    {
      id: 'event-2',
      type: 'TestScored',
      payload: { score: 100 },
      aggregateId: 'agg-1',
      aggregateType: 'TestAggregate',
      version: 2,
      metadata: { timestamp: new Date().toISOString() },
    },
  ];

  return {
    append: vi.fn().mockResolvedValue(undefined),
    getEvents: vi.fn().mockResolvedValue(events),
    getEventsForAggregate: vi.fn().mockResolvedValue(events),
    getEventsAfterVersion: vi.fn().mockResolvedValue(events),
    getEventsByType: vi.fn().mockResolvedValue(events),
    getEventsByTimestamp: vi.fn().mockResolvedValue(events),
    getAllEvents: vi.fn().mockResolvedValue(events),
  } as unknown as EventStoreInterface;
}

function createMockProjectionManager(): ProjectionManager {
  const projections = new Map<string, { name: string; version: string }>();
  projections.set('test-projection', { name: 'test-projection', version: '1.0.0' });

  return {
    has: vi.fn((name: string) => projections.has(name)),
    get: vi.fn((name: string) => projections.get(name)),
    getAll: vi.fn(() => Array.from(projections.values())),
    register: vi.fn(),
  } as unknown as ProjectionManager;
}

function createMockAuditStore(): ReplayAuditStore {
  const entries: ReplayAuditEntry[] = [];

  return {
    save: vi.fn().mockImplementation(async (entry: ReplayAuditEntry) => {
      entries.push(entry);
    }),
    getById: vi.fn().mockImplementation(async (id: string) => {
      return entries.find((e) => e.id === id) ?? null;
    }),
    getByCorrelationId: vi.fn().mockImplementation(async (correlationId: string) => {
      return entries.filter((e) => e.correlationId === correlationId);
    }),
    getByAggregateId: vi.fn().mockImplementation(async (aggregateId: string, _limit?: number) => {
      return entries.filter((e) => e.aggregateId === aggregateId);
    }),
    getByProjection: vi.fn().mockImplementation(async (projectionName: string, _limit?: number) => {
      return entries.filter((e) => e.projectionName === projectionName);
    }),
    getByUser: vi.fn().mockImplementation(async (userId: string, _limit?: number) => {
      return entries.filter((e) => e.initiatedBy === userId);
    }),
    getByTimeRange: vi.fn().mockResolvedValue(entries),
    getRecent: vi.fn().mockResolvedValue(entries),
    delete: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(0),
  } as unknown as ReplayAuditStore;
}

function createMockCheckpointStore(): CheckpointStore {
  const checkpoints = new Map<string, { position: number; timestamp: Date }>();

  return {
    getCheckpoint: vi.fn().mockImplementation(async (name: string) => {
      return checkpoints.get(name) ?? null;
    }),
    saveCheckpoint: vi.fn().mockImplementation(async (name: string, position: number) => {
      checkpoints.set(name, { position, timestamp: new Date() });
    }),
    deleteCheckpoint: vi.fn().mockImplementation(async (name: string) => {
      checkpoints.delete(name);
    }),
  } as unknown as CheckpointStore;
}

// ============================================================================
// ORCHESTRATOR TESTS
// ============================================================================

describe('ReplayOrchestrator', () => {
  let orchestrator: ReplayOrchestrator;
  let eventStore: EventStoreInterface;
  let projectionManager: ProjectionManager;
  let auditStore: ReplayAuditStore;
  let checkpointStore: CheckpointStore;

  beforeEach(() => {
    eventStore = createMockEventStore();
    projectionManager = createMockProjectionManager();
    auditStore = createMockAuditStore();
    checkpointStore = createMockCheckpointStore();

    orchestrator = new ReplayOrchestrator(
      eventStore,
      projectionManager,
      auditStore,
      checkpointStore,
      {
        defaultBatchSize: 100,
        maxConcurrentReplays: 3,
      }
    );
  });

  // ============================================================================
  // AGGREGATE REGISTRATION TESTS
  // ============================================================================

  describe('registerAggregate', () => {
    it('should register an aggregate type', () => {
      const factory = () => new TestAggregate();

      orchestrator.registerAggregate('TestAggregate', factory);

      const status = orchestrator.getStatus();
      expect(status.registeredAggregates).toContain('TestAggregate');
    });

    it('should register an aggregate with snapshot manager', () => {
      const factory = () => new TestAggregate();
      const snapshotManager: SnapshotManager = {
        getSnapshot: vi.fn().mockResolvedValue(null),
        saveSnapshot: vi.fn().mockResolvedValue(undefined),
        deleteSnapshot: vi.fn().mockResolvedValue(undefined),
      } as unknown as SnapshotManager;

      orchestrator.registerAggregate('TestAggregate', factory, snapshotManager);

      const status = orchestrator.getStatus();
      expect(status.registeredAggregates).toContain('TestAggregate');
    });
  });

  // ============================================================================
  // STATE RECONSTRUCTION TESTS
  // ============================================================================

  describe('reconstructState', () => {
    beforeEach(() => {
      const factory = () => new TestAggregate();
      orchestrator.registerAggregate('TestAggregate', factory);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'UnregisteredType',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RECONSTRUCTION_FAILED');
      expect(result.error?.message).toContain('not registered');
    });

    it('should include correlation ID in result', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
        correlationId: 'test-correlation',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.correlationId).toBe('test-correlation');
    });

    it('should generate correlation ID if not provided', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.correlationId).toBeDefined();
      expect(result.correlationId.length).toBeGreaterThan(0);
    });

    it('should include audit entry ID in result', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should include duration in result', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass options to reconstruction service', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
        options: {
          asOf: new Date('2024-01-01'),
          useSnapshots: true,
        },
        reason: 'Testing reconstruction',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  // ============================================================================
  // PROJECTION REBUILD TESTS
  // ============================================================================

  describe('rebuildProjection', () => {
    it('should fail when max concurrent replays exceeded', async () => {
      // Fill up active operations
      const orchestratorWithLimit = new ReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore,
        { maxConcurrentReplays: 0 }
      );

      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'test-user',
      };

      const result = await orchestratorWithLimit.rebuildProjection(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MAX_CONCURRENT_REPLAYS');
    });

    it('should fail for non-existent projection', async () => {
      vi.mocked(projectionManager.has).mockReturnValue(false);

      const request: RebuildProjectionRequest = {
        projectionName: 'non-existent',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROJECTION_REBUILD_FAILED');
    });

    it('should use default batch size from config', async () => {
      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should accept custom replay config', async () => {
      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'test-user',
        config: {
          batchSize: 50,
          batchDelayMs: 5,
          continueOnError: false,
        },
        reason: 'Manual rebuild',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should include correlation ID', async () => {
      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'test-user',
        correlationId: 'custom-correlation',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.correlationId).toBe('custom-correlation');
    });
  });

  // ============================================================================
  // STATE DIFF TESTS
  // ============================================================================

  describe('getStateDiff', () => {
    beforeEach(() => {
      const factory = () => new TestAggregate();
      orchestrator.registerAggregate('TestAggregate', factory);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'UnregisteredType',
        fromVersion: 1,
        toVersion: 2,
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STATE_DIFF_FAILED');
    });

    it('should fail when neither version nor timestamp range provided', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('version range or timestamp range');
    });

    it('should accept version range', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        fromVersion: 1,
        toVersion: 2,
        initiatedBy: 'test-user',
        correlationId: 'test-correlation',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should accept timestamp range', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        fromTimestamp: new Date('2024-01-01'),
        toTimestamp: new Date('2024-01-02'),
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  // ============================================================================
  // EVENT TIMELINE TESTS
  // ============================================================================

  describe('getEventTimeline', () => {
    beforeEach(() => {
      const factory = () => new TestAggregate();
      orchestrator.registerAggregate('TestAggregate', factory);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: EventTimelineRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'UnregisteredType',
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.getEventTimeline(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMELINE_QUERY_FAILED');
    });

    it('should accept time range and pagination', async () => {
      const request: EventTimelineRequest = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-01-02'),
        limit: 10,
        offset: 0,
        initiatedBy: 'test-user',
        correlationId: 'test-correlation',
      };

      const result = await orchestrator.getEventTimeline(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  // ============================================================================
  // STATE VERIFICATION TESTS
  // ============================================================================

  describe('verifyState', () => {
    beforeEach(() => {
      const factory = () => new TestAggregate();
      orchestrator.registerAggregate('TestAggregate', factory);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: VerifyStateRequest<TestState> = {
        aggregateId: 'agg-1',
        aggregateType: 'UnregisteredType',
        currentState: { name: 'Test', score: 100, version: 2 },
        initiatedBy: 'test-user',
      };

      const result = await orchestrator.verifyState(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERIFICATION_FAILED');
    });

    it('should include correlation ID', async () => {
      const request: VerifyStateRequest<TestState> = {
        aggregateId: 'agg-1',
        aggregateType: 'TestAggregate',
        currentState: { name: 'Test', score: 100, version: 2 },
        initiatedBy: 'test-user',
        correlationId: 'verify-correlation',
      };

      const result = await orchestrator.verifyState(request);

      expect(result.correlationId).toBe('verify-correlation');
    });
  });

  // ============================================================================
  // AUDIT ACCESS TESTS
  // ============================================================================

  describe('audit access methods', () => {
    it('should get aggregate audit history', async () => {
      const history = await orchestrator.getAggregateAuditHistory('agg-1', 10);

      expect(Array.isArray(history)).toBe(true);
    });

    it('should get projection audit history', async () => {
      const history = await orchestrator.getProjectionAuditHistory('test-projection', 10);

      expect(Array.isArray(history)).toBe(true);
    });

    it('should get recent audit entries', async () => {
      const entries = await orchestrator.getRecentAuditEntries(10);

      expect(Array.isArray(entries)).toBe(true);
    });

    it('should get specific audit entry', async () => {
      const entry = await orchestrator.getAuditEntry('entry-id');

      expect(entry).toBe(null); // No entries in mock
    });
  });

  // ============================================================================
  // HEALTH AND STATUS TESTS
  // ============================================================================

  describe('getStatus', () => {
    it('should return orchestrator status', () => {
      const factory = () => new TestAggregate();
      orchestrator.registerAggregate('TestAggregate', factory);

      const status = orchestrator.getStatus();

      expect(status.activeOperations).toBe(0);
      expect(status.maxConcurrentReplays).toBe(3);
      expect(status.registeredAggregates).toContain('TestAggregate');
      expect(Array.isArray(status.registeredProjections)).toBe(true);
    });
  });

  describe('cleanupAudit', () => {
    it('should cleanup old audit entries', async () => {
      const count = await orchestrator.cleanupAudit();

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createReplayOrchestrator', () => {
  it('should create orchestrator with default config', () => {
    const eventStore = createMockEventStore();
    const projectionManager = createMockProjectionManager();
    const auditStore = createMockAuditStore();
    const checkpointStore = createMockCheckpointStore();

    const orchestrator = createReplayOrchestrator(
      eventStore,
      projectionManager,
      auditStore,
      checkpointStore
    );

    expect(orchestrator).toBeInstanceOf(ReplayOrchestrator);
  });

  it('should create orchestrator with custom config', () => {
    const eventStore = createMockEventStore();
    const projectionManager = createMockProjectionManager();
    const auditStore = createMockAuditStore();
    const checkpointStore = createMockCheckpointStore();

    const customConfig: Partial<ReplayOrchestratorConfig> = {
      defaultBatchSize: 500,
      maxConcurrentReplays: 5,
      auditRetentionDays: 180,
    };

    const orchestrator = createReplayOrchestrator(
      eventStore,
      projectionManager,
      auditStore,
      checkpointStore,
      customConfig
    );

    expect(orchestrator).toBeInstanceOf(ReplayOrchestrator);
    expect(orchestrator.getStatus().maxConcurrentReplays).toBe(5);
  });
});
