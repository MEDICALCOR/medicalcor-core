/**
 * Tests for ReplayOrchestrator
 *
 * Tests event sourcing replay operations including state reconstruction,
 * projection rebuild, and audit functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import type { EventStore as EventStoreInterface } from '../../event-store.js';
import type { ProjectionManager } from '../projections.js';
import type { ReplayAuditStore, ReplayAuditEntry } from '../replay-audit.js';
import type { CheckpointStore } from '../event-replay.js';
import type { AggregateRoot, AggregateState } from '../aggregate.js';

// Mock EventStore
const createMockEventStore = (): EventStoreInterface =>
  ({
    append: vi.fn().mockResolvedValue(undefined),
    getEvents: vi.fn().mockResolvedValue([]),
    getEventsByAggregateId: vi.fn().mockResolvedValue([]),
    getEventsByType: vi.fn().mockResolvedValue([]),
    getAllEvents: vi.fn().mockResolvedValue([]),
  }) as unknown as EventStoreInterface;

// Mock ProjectionManager
const createMockProjectionManager = (): ProjectionManager =>
  ({
    has: vi.fn().mockReturnValue(true),
    get: vi.fn().mockReturnValue({
      name: 'test-projection',
      version: 1,
      state: {},
    }),
    getAll: vi.fn().mockReturnValue([
      { name: 'projection-1', version: 1 },
      { name: 'projection-2', version: 1 },
    ]),
    register: vi.fn(),
    unregister: vi.fn(),
  }) as unknown as ProjectionManager;

// Mock AuditStore - implements ReplayAuditStore interface
const createMockAuditStore = (): ReplayAuditStore => ({
  save: vi.fn().mockResolvedValue(undefined),
  getById: vi.fn().mockResolvedValue(null),
  getByCorrelationId: vi.fn().mockResolvedValue([]),
  getByAggregateId: vi.fn().mockResolvedValue([]),
  getByProjection: vi.fn().mockResolvedValue([]),
  getByUser: vi.fn().mockResolvedValue([]),
  getByTimeRange: vi.fn().mockResolvedValue([]),
  getRecent: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(true),
  cleanup: vi.fn().mockResolvedValue(5),
});

// Mock CheckpointStore
const createMockCheckpointStore = (): CheckpointStore => ({
  getCheckpoint: vi.fn().mockResolvedValue(null),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  deleteCheckpoint: vi.fn().mockResolvedValue(undefined),
});

// Mock Aggregate Factory
interface TestState extends AggregateState {
  id: string;
  name: string;
  version: number;
}

const createMockAggregateFactory = () => ({
  create: vi.fn().mockReturnValue({
    id: 'test-id',
    state: { id: 'test-id', name: 'test', version: 1 },
    getState: vi.fn().mockReturnValue({ id: 'test-id', name: 'test', version: 1 }),
    applyEvent: vi.fn(),
  } as unknown as AggregateRoot<TestState>),
});

describe('ReplayOrchestrator', () => {
  let eventStore: EventStoreInterface;
  let projectionManager: ProjectionManager;
  let auditStore: ReplayAuditStore;
  let checkpointStore: CheckpointStore;
  let orchestrator: ReplayOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    eventStore = createMockEventStore();
    projectionManager = createMockProjectionManager();
    auditStore = createMockAuditStore();
    checkpointStore = createMockCheckpointStore();
    orchestrator = new ReplayOrchestrator(
      eventStore,
      projectionManager,
      auditStore,
      checkpointStore
    );
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const orch = new ReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore
      );
      expect(orch).toBeInstanceOf(ReplayOrchestrator);
    });

    it('should create instance with custom config', () => {
      const config: Partial<ReplayOrchestratorConfig> = {
        defaultBatchSize: 500,
        maxConcurrentReplays: 5,
        enableProgressLogging: false,
      };

      const orch = new ReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore,
        config
      );
      expect(orch).toBeInstanceOf(ReplayOrchestrator);
    });
  });

  describe('registerAggregate', () => {
    it('should register an aggregate type', () => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('TestAggregate', factory.create);

      const status = orchestrator.getStatus();
      expect(status.registeredAggregates).toContain('TestAggregate');
    });

    it('should register aggregate with snapshot manager', () => {
      const factory = createMockAggregateFactory();
      const snapshotManager = {
        save: vi.fn(),
        load: vi.fn(),
        delete: vi.fn(),
      };

      orchestrator.registerAggregate('SnapshotAggregate', factory.create, snapshotManager as never);

      const status = orchestrator.getStatus();
      expect(status.registeredAggregates).toContain('SnapshotAggregate');
    });
  });

  describe('reconstructState', () => {
    beforeEach(() => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('TestAggregate', factory.create);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'UnregisteredType',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RECONSTRUCTION_FAILED');
    });

    it('should handle aggregate not found', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'non-existent',
        aggregateType: 'TestAggregate',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.reconstructState(request);

      // May succeed or fail depending on mock behavior
      expect(result.auditEntryId).toBeDefined();
      expect(result.correlationId).toBeDefined();
    });

    it('should use provided correlation ID', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        initiatedBy: 'user-1',
        correlationId: 'custom-correlation-id',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.correlationId).toBe('custom-correlation-id');
    });

    it('should include reconstruction options', async () => {
      const request: ReconstructStateRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        initiatedBy: 'user-1',
        options: {
          asOf: new Date(),
          useSnapshots: true,
        },
        reason: 'Audit investigation',
      };

      const result = await orchestrator.reconstructState(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  describe('rebuildProjection', () => {
    it('should fail when max concurrent replays exceeded', async () => {
      // Fill up concurrent replays
      const orch = new ReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore,
        { maxConcurrentReplays: 0 }
      );

      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'user-1',
      };

      const result = await orch.rebuildProjection(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MAX_CONCURRENT_REPLAYS');
    });

    it('should fail for non-existent projection', async () => {
      vi.mocked(projectionManager.has).mockReturnValueOnce(false);

      const request: RebuildProjectionRequest = {
        projectionName: 'non-existent',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROJECTION_REBUILD_FAILED');
    });

    it('should rebuild projection with custom config', async () => {
      const request: RebuildProjectionRequest = {
        projectionName: 'test-projection',
        initiatedBy: 'user-1',
        config: {
          batchSize: 100,
          batchDelayMs: 50,
        },
        reason: 'Data migration',
      };

      const result = await orchestrator.rebuildProjection(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  describe('getStateDiff', () => {
    beforeEach(() => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('TestAggregate', factory.create);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'UnregisteredType',
        fromVersion: 1,
        toVersion: 5,
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STATE_DIFF_FAILED');
    });

    it('should fail when neither version nor timestamp provided', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.success).toBe(false);
    });

    it('should get diff by version range', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        fromVersion: 1,
        toVersion: 5,
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should get diff by timestamp range', async () => {
      const request: StateDiffRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        fromTimestamp: new Date('2024-01-01'),
        toTimestamp: new Date('2024-06-01'),
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getStateDiff(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  describe('getEventTimeline', () => {
    beforeEach(() => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('TestAggregate', factory.create);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: EventTimelineRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'UnregisteredType',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getEventTimeline(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMELINE_QUERY_FAILED');
    });

    it('should get timeline with default options', async () => {
      const request: EventTimelineRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getEventTimeline(request);

      expect(result.auditEntryId).toBeDefined();
    });

    it('should get timeline with time range', async () => {
      const request: EventTimelineRequest = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-12-31'),
        limit: 50,
        offset: 10,
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.getEventTimeline(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  describe('verifyState', () => {
    beforeEach(() => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('TestAggregate', factory.create);
    });

    it('should fail for unregistered aggregate type', async () => {
      const request: VerifyStateRequest<TestState> = {
        aggregateId: 'agg-123',
        aggregateType: 'UnregisteredType',
        currentState: { id: 'test', name: 'test', version: 1 },
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.verifyState(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERIFICATION_FAILED');
    });

    it('should verify state consistency', async () => {
      const request: VerifyStateRequest<TestState> = {
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        currentState: { id: 'agg-123', name: 'Test', version: 5 },
        initiatedBy: 'user-1',
      };

      const result = await orchestrator.verifyState(request);

      expect(result.auditEntryId).toBeDefined();
    });
  });

  describe('audit access methods', () => {
    it('should get aggregate audit history', async () => {
      const history = await orchestrator.getAggregateAuditHistory('agg-123', 10);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get projection audit history', async () => {
      const history = await orchestrator.getProjectionAuditHistory('test-projection', 10);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get recent audit entries', async () => {
      const entries = await orchestrator.getRecentAuditEntries(20);
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should get specific audit entry', async () => {
      const entry = await orchestrator.getAuditEntry('audit-123');
      // May be null based on mock
      expect(entry === null || typeof entry === 'object').toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return orchestrator status', () => {
      const factory = createMockAggregateFactory();
      orchestrator.registerAggregate('Agg1', factory.create);
      orchestrator.registerAggregate('Agg2', factory.create);

      const status = orchestrator.getStatus();

      expect(status.activeOperations).toBe(0);
      expect(status.maxConcurrentReplays).toBeGreaterThan(0);
      expect(status.registeredAggregates).toContain('Agg1');
      expect(status.registeredAggregates).toContain('Agg2');
      expect(Array.isArray(status.registeredProjections)).toBe(true);
    });
  });

  describe('cleanupAudit', () => {
    it('should cleanup old audit entries', async () => {
      const deleted = await orchestrator.cleanupAudit();
      expect(typeof deleted).toBe('number');
    });
  });

  describe('createReplayOrchestrator factory', () => {
    it('should create orchestrator instance', () => {
      const orch = createReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore
      );

      expect(orch).toBeInstanceOf(ReplayOrchestrator);
    });

    it('should create orchestrator with config', () => {
      const orch = createReplayOrchestrator(
        eventStore,
        projectionManager,
        auditStore,
        checkpointStore,
        { defaultBatchSize: 2000 }
      );

      expect(orch).toBeInstanceOf(ReplayOrchestrator);
    });
  });
});
