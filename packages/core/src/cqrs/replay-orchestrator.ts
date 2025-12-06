/**
 * Replay Orchestrator (M6/H7)
 *
 * Coordinates event sourcing replay operations:
 * - State reconstruction for aggregates
 * - Projection rebuild with checkpointing
 * - Audit trail for all operations
 * - CQRS integration with commands and queries
 */

import { v4 as uuidv4 } from 'uuid';
import type { StoredEvent, EventStore as EventStoreInterface } from '../event-store.js';
import type { ProjectionManager, ProjectionDefinition } from './projections.js';
import type { AggregateRoot, AggregateState } from './aggregate.js';
import type { SnapshotManager } from './snapshot-store.js';
import {
  EventReplayService,
  type CheckpointStore,
  type ReplayConfig,
  type ReplayResult,
} from './event-replay.js';
import {
  StateReconstructionService,
  type ReconstructionOptions,
  type ReconstructionResult,
  type StateDiff,
  type AggregateFactory,
} from './state-reconstruction.js';
import {
  ReplayAuditService,
  type ReplayAuditStore,
  type ReplayAuditEntry,
} from './replay-audit.js';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// ORCHESTRATOR CONFIG
// ============================================================================

export interface ReplayOrchestratorConfig {
  /** Default batch size for replay operations */
  defaultBatchSize: number;
  /** Default delay between batches in ms */
  defaultBatchDelayMs: number;
  /** Enable progress logging */
  enableProgressLogging: boolean;
  /** Progress log interval (every N events) */
  progressLogInterval: number;
  /** Maximum concurrent replay operations */
  maxConcurrentReplays: number;
  /** Continue on error by default */
  continueOnErrorDefault: boolean;
  /** Audit retention days */
  auditRetentionDays: number;
}

const DEFAULT_ORCHESTRATOR_CONFIG: ReplayOrchestratorConfig = {
  defaultBatchSize: 1000,
  defaultBatchDelayMs: 10,
  enableProgressLogging: true,
  progressLogInterval: 10000,
  maxConcurrentReplays: 3,
  continueOnErrorDefault: true,
  auditRetentionDays: 90,
};

// ============================================================================
// OPERATION TYPES
// ============================================================================

/**
 * Request for state reconstruction
 */
export interface ReconstructStateRequest {
  aggregateId: string;
  aggregateType: string;
  options?: ReconstructionOptions;
  initiatedBy: string;
  correlationId?: string;
  reason?: string;
}

/**
 * Request for projection rebuild
 */
export interface RebuildProjectionRequest {
  projectionName: string;
  config?: Partial<ReplayConfig>;
  initiatedBy: string;
  correlationId?: string;
  reason?: string;
}

/**
 * Request for state diff
 */
export interface StateDiffRequest {
  aggregateId: string;
  aggregateType: string;
  fromVersion?: number;
  toVersion?: number;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  initiatedBy: string;
  correlationId?: string;
}

/**
 * Request for event timeline
 */
export interface EventTimelineRequest {
  aggregateId: string;
  aggregateType: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  initiatedBy: string;
  correlationId?: string;
}

/**
 * Request for state verification
 */
export interface VerifyStateRequest<TState> {
  aggregateId: string;
  aggregateType: string;
  currentState: TState;
  initiatedBy: string;
  correlationId?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface OrchestratedReplayResult<T> {
  success: boolean;
  auditEntryId: string;
  correlationId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  durationMs: number;
}

// ============================================================================
// AGGREGATE REGISTRATION
// ============================================================================

interface RegisteredAggregate<
  T extends AggregateRoot<TState>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TState extends AggregateState = any,
> {
  aggregateType: string;
  factory: AggregateFactory<T>;
  snapshotManager?: SnapshotManager;
}

// ============================================================================
// REPLAY ORCHESTRATOR
// ============================================================================

export class ReplayOrchestrator {
  private logger: Logger;
  private config: ReplayOrchestratorConfig;
  private replayService: EventReplayService;
  private auditService: ReplayAuditService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aggregates = new Map<string, RegisteredAggregate<any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reconstructionServices = new Map<string, StateReconstructionService<any>>();
  private activeOperations = new Set<string>();

  constructor(
    private readonly eventStore: EventStoreInterface,
    private readonly projectionManager: ProjectionManager,
    auditStore: ReplayAuditStore,
    checkpointStore: CheckpointStore,
    config: Partial<ReplayOrchestratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.logger = createLogger({ name: 'replay-orchestrator' });
    this.replayService = new EventReplayService(checkpointStore);
    this.auditService = new ReplayAuditService(auditStore);
  }

  // ============================================================================
  // AGGREGATE REGISTRATION
  // ============================================================================

  /**
   * Register an aggregate type for state reconstruction
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAggregate<T extends AggregateRoot<TState>, TState extends AggregateState = any>(
    aggregateType: string,
    factory: AggregateFactory<T>,
    snapshotManager?: SnapshotManager
  ): void {
    this.aggregates.set(aggregateType, {
      aggregateType,
      factory,
      snapshotManager,
    });

    this.reconstructionServices.set(
      aggregateType,
      new StateReconstructionService(this.eventStore, aggregateType, factory, snapshotManager)
    );

    this.logger.info({ aggregateType }, 'Aggregate registered for replay');
  }

  // ============================================================================
  // STATE RECONSTRUCTION
  // ============================================================================

  /**
   * Reconstruct aggregate state at a point in time
   */
  async reconstructState<TState extends AggregateState>(
    request: ReconstructStateRequest
  ): Promise<OrchestratedReplayResult<ReconstructionResult<TState>>> {
    const startTime = Date.now();
    const correlationId = request.correlationId ?? uuidv4();

    // Start audit entry
    const auditEntry = await this.auditService.startOperation({
      operationType: 'state_reconstruction',
      initiatedBy: request.initiatedBy,
      correlationId,
      aggregateId: request.aggregateId,
      aggregateType: request.aggregateType,
      parameters: {
        asOf: request.options?.asOf,
        untilVersion: request.options?.untilVersion,
        untilEventId: request.options?.untilEventId,
        useSnapshots: request.options?.useSnapshots,
        reason: request.reason,
      },
      reason: request.reason,
    });

    try {
      // Get reconstruction service
      const service = this.reconstructionServices.get(request.aggregateType);
      if (!service) {
        throw new Error(`Aggregate type '${request.aggregateType}' not registered for replay`);
      }

      // Track active operation
      this.activeOperations.add(auditEntry.id);

      // Perform reconstruction
      const result = (await service.reconstructAt(
        request.aggregateId,
        request.options ?? {}
      )) as ReconstructionResult<TState> | null;

      if (!result) {
        await this.auditService.completeOperation(auditEntry.id, {
          eventsProcessed: 0,
          eventsSkipped: 0,
          errorCount: 0,
          durationMs: Date.now() - startTime,
          success: false,
          summary: 'Aggregate not found or no events within specified range',
        });

        return {
          success: false,
          auditEntryId: auditEntry.id,
          correlationId,
          error: {
            code: 'AGGREGATE_NOT_FOUND',
            message: 'Aggregate not found or no events within specified range',
          },
          durationMs: Date.now() - startTime,
        };
      }

      // Complete audit
      await this.auditService.completeOperation(auditEntry.id, {
        eventsProcessed: result.eventsApplied,
        eventsSkipped: result.totalEvents - result.eventsApplied,
        errorCount: 0,
        durationMs: result.durationMs,
        finalVersion: result.version,
        success: true,
        summary: `Reconstructed state at version ${result.version}`,
      });

      return {
        success: true,
        auditEntryId: auditEntry.id,
        correlationId,
        data: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.failOperation(auditEntry.id, {
        code: 'RECONSTRUCTION_FAILED',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        auditEntryId: auditEntry.id,
        correlationId,
        error: {
          code: 'RECONSTRUCTION_FAILED',
          message: errorMessage,
        },
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.activeOperations.delete(auditEntry.id);
    }
  }

  // ============================================================================
  // PROJECTION REBUILD
  // ============================================================================

  /**
   * Rebuild a projection from event history
   */
  async rebuildProjection(
    request: RebuildProjectionRequest
  ): Promise<OrchestratedReplayResult<ReplayResult>> {
    const startTime = Date.now();
    const correlationId = request.correlationId ?? uuidv4();

    // Check concurrent limit
    if (this.activeOperations.size >= this.config.maxConcurrentReplays) {
      return {
        success: false,
        auditEntryId: '',
        correlationId,
        error: {
          code: 'MAX_CONCURRENT_REPLAYS',
          message: `Maximum concurrent replays (${this.config.maxConcurrentReplays}) exceeded`,
        },
        durationMs: Date.now() - startTime,
      };
    }

    // Start audit entry
    const auditEntry = await this.auditService.startOperation({
      operationType: 'projection_rebuild',
      initiatedBy: request.initiatedBy,
      correlationId,
      projectionName: request.projectionName,
      parameters: {
        batchSize: request.config?.batchSize ?? this.config.defaultBatchSize,
        eventTypeFilter: request.config?.eventTypeFilter,
        startTimestamp: request.config?.startFromTimestamp,
        endTimestamp: request.config?.endAtTimestamp,
        reason: request.reason,
      },
      reason: request.reason,
    });

    try {
      // Check if projection exists
      if (!this.projectionManager.has(request.projectionName)) {
        throw new Error(`Projection '${request.projectionName}' not found`);
      }

      // Track active operation
      this.activeOperations.add(auditEntry.id);

      // Get projection definition - we need to access it properly
      const projection = this.projectionManager.get(request.projectionName);
      if (!projection) {
        throw new Error(`Projection '${request.projectionName}' not found`);
      }

      // Build replay config
      const replayConfig: Partial<ReplayConfig> = {
        batchSize: request.config?.batchSize ?? this.config.defaultBatchSize,
        batchDelayMs: request.config?.batchDelayMs ?? this.config.defaultBatchDelayMs,
        logProgress: this.config.enableProgressLogging,
        progressInterval: this.config.progressLogInterval,
        continueOnError: request.config?.continueOnError ?? this.config.continueOnErrorDefault,
        ...request.config,
      };

      // Create a minimal projection definition for rebuild
      // In a full implementation, we'd retrieve the actual handlers
      const projectionDef: ProjectionDefinition<unknown> = {
        name: projection.name,
        version: projection.version,
        initialState: {},
        handlers: new Map(),
      };

      // Perform rebuild
      const result = await this.replayService.rebuildProjection(
        request.projectionName,
        projectionDef,
        this.eventStore,
        replayConfig
      );

      // Complete audit
      await this.auditService.completeOperation(auditEntry.id, {
        eventsProcessed: result.eventsProcessed,
        eventsSkipped: result.eventsSkipped,
        errorCount: result.errors.length,
        durationMs: result.durationMs,
        success: result.success,
        summary: result.success
          ? `Rebuilt projection with ${result.eventsProcessed} events`
          : `Rebuild failed with ${result.errors.length} errors`,
      });

      return {
        success: result.success,
        auditEntryId: auditEntry.id,
        correlationId,
        data: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.failOperation(auditEntry.id, {
        code: 'PROJECTION_REBUILD_FAILED',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        auditEntryId: auditEntry.id,
        correlationId,
        error: {
          code: 'PROJECTION_REBUILD_FAILED',
          message: errorMessage,
        },
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.activeOperations.delete(auditEntry.id);
    }
  }

  // ============================================================================
  // STATE DIFF
  // ============================================================================

  /**
   * Get state diff between two points
   */
  async getStateDiff<TState extends AggregateState>(
    request: StateDiffRequest
  ): Promise<OrchestratedReplayResult<StateDiff<TState>>> {
    const startTime = Date.now();
    const correlationId = request.correlationId ?? uuidv4();

    const auditEntry = await this.auditService.startOperation({
      operationType: 'state_diff',
      initiatedBy: request.initiatedBy,
      correlationId,
      aggregateId: request.aggregateId,
      aggregateType: request.aggregateType,
      parameters: {
        untilVersion: request.fromVersion,
        startTimestamp: request.fromTimestamp,
        endTimestamp: request.toTimestamp,
      },
    });

    try {
      const service = this.reconstructionServices.get(request.aggregateType);
      if (!service) {
        throw new Error(`Aggregate type '${request.aggregateType}' not registered for replay`);
      }

      let diff: StateDiff<TState> | null;

      if (request.fromVersion !== undefined && request.toVersion !== undefined) {
        diff = (await service.getStateDiff(
          request.aggregateId,
          request.fromVersion,
          request.toVersion
        )) as StateDiff<TState> | null;
      } else if (request.fromTimestamp && request.toTimestamp) {
        diff = (await service.getStateDiffByTime(
          request.aggregateId,
          request.fromTimestamp,
          request.toTimestamp
        )) as StateDiff<TState> | null;
      } else {
        throw new Error('Either version range or timestamp range must be provided');
      }

      if (!diff) {
        await this.auditService.completeOperation(auditEntry.id, {
          eventsProcessed: 0,
          eventsSkipped: 0,
          errorCount: 0,
          durationMs: Date.now() - startTime,
          success: false,
          summary: 'Unable to compute state diff',
        });

        return {
          success: false,
          auditEntryId: auditEntry.id,
          correlationId,
          error: {
            code: 'DIFF_FAILED',
            message: 'Unable to compute state diff',
          },
          durationMs: Date.now() - startTime,
        };
      }

      await this.auditService.completeOperation(auditEntry.id, {
        eventsProcessed: diff.eventsBetween.length,
        eventsSkipped: 0,
        errorCount: 0,
        durationMs: Date.now() - startTime,
        success: true,
        summary: `Found ${diff.changes.length} changes between versions ${diff.fromVersion} and ${diff.toVersion}`,
      });

      return {
        success: true,
        auditEntryId: auditEntry.id,
        correlationId,
        data: diff,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.failOperation(auditEntry.id, {
        code: 'STATE_DIFF_FAILED',
        message: errorMessage,
      });

      return {
        success: false,
        auditEntryId: auditEntry.id,
        correlationId,
        error: {
          code: 'STATE_DIFF_FAILED',
          message: errorMessage,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // EVENT TIMELINE
  // ============================================================================

  /**
   * Get event timeline for an aggregate
   */
  async getEventTimeline(request: EventTimelineRequest): Promise<
    OrchestratedReplayResult<{
      events: StoredEvent[];
      total: number;
      hasMore: boolean;
    }>
  > {
    const startTime = Date.now();
    const correlationId = request.correlationId ?? uuidv4();

    const auditEntry = await this.auditService.startOperation({
      operationType: 'event_timeline_query',
      initiatedBy: request.initiatedBy,
      correlationId,
      aggregateId: request.aggregateId,
      aggregateType: request.aggregateType,
      parameters: {
        startTimestamp: request.startTime,
        endTimestamp: request.endTime,
      },
    });

    try {
      const service = this.reconstructionServices.get(request.aggregateType);
      if (!service) {
        throw new Error(`Aggregate type '${request.aggregateType}' not registered for replay`);
      }

      const timeline = await service.getEventTimeline(request.aggregateId, {
        startTime: request.startTime,
        endTime: request.endTime,
        limit: request.limit,
        offset: request.offset,
      });

      await this.auditService.completeOperation(auditEntry.id, {
        eventsProcessed: timeline.events.length,
        eventsSkipped: 0,
        errorCount: 0,
        durationMs: Date.now() - startTime,
        success: true,
        summary: `Retrieved ${timeline.events.length} of ${timeline.total} events`,
      });

      return {
        success: true,
        auditEntryId: auditEntry.id,
        correlationId,
        data: timeline,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.failOperation(auditEntry.id, {
        code: 'TIMELINE_QUERY_FAILED',
        message: errorMessage,
      });

      return {
        success: false,
        auditEntryId: auditEntry.id,
        correlationId,
        error: {
          code: 'TIMELINE_QUERY_FAILED',
          message: errorMessage,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // STATE VERIFICATION
  // ============================================================================

  /**
   * Verify current state consistency
   */
  async verifyState<TState extends AggregateState>(
    request: VerifyStateRequest<TState>
  ): Promise<
    OrchestratedReplayResult<{
      isConsistent: boolean;
      reconstructedState: TState;
      differences: { path: string; operation: string; oldValue?: unknown; newValue?: unknown }[];
      recommendation: string;
    }>
  > {
    const startTime = Date.now();
    const correlationId = request.correlationId ?? uuidv4();

    const auditEntry = await this.auditService.startOperation({
      operationType: 'state_verification',
      initiatedBy: request.initiatedBy,
      correlationId,
      aggregateId: request.aggregateId,
      aggregateType: request.aggregateType,
      parameters: {},
    });

    try {
      const service = this.reconstructionServices.get(request.aggregateType);
      if (!service) {
        throw new Error(`Aggregate type '${request.aggregateType}' not registered for replay`);
      }

      const verification = await service.verifyStateConsistency(
        request.aggregateId,
        request.currentState
      );

      await this.auditService.completeOperation(auditEntry.id, {
        eventsProcessed: 0,
        eventsSkipped: 0,
        errorCount: verification.isConsistent ? 0 : verification.differences.length,
        durationMs: Date.now() - startTime,
        success: true,
        summary: verification.isConsistent
          ? 'State is consistent'
          : `Found ${verification.differences.length} inconsistencies`,
      });

      return {
        success: true,
        auditEntryId: auditEntry.id,
        correlationId,
        data: verification,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.failOperation(auditEntry.id, {
        code: 'VERIFICATION_FAILED',
        message: errorMessage,
      });

      return {
        success: false,
        auditEntryId: auditEntry.id,
        correlationId,
        error: {
          code: 'VERIFICATION_FAILED',
          message: errorMessage,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // AUDIT ACCESS
  // ============================================================================

  /**
   * Get audit history for an aggregate
   */
  async getAggregateAuditHistory(aggregateId: string, limit?: number): Promise<ReplayAuditEntry[]> {
    return this.auditService.getAggregateHistory(aggregateId, limit);
  }

  /**
   * Get audit history for a projection
   */
  async getProjectionAuditHistory(
    projectionName: string,
    limit?: number
  ): Promise<ReplayAuditEntry[]> {
    return this.auditService.getProjectionHistory(projectionName, limit);
  }

  /**
   * Get recent audit entries
   */
  async getRecentAuditEntries(limit?: number): Promise<ReplayAuditEntry[]> {
    return this.auditService.getRecentOperations(limit);
  }

  /**
   * Get a specific audit entry
   */
  async getAuditEntry(id: string): Promise<ReplayAuditEntry | null> {
    return this.auditService.getOperation(id);
  }

  // ============================================================================
  // HEALTH & STATUS
  // ============================================================================

  /**
   * Get orchestrator status
   */
  getStatus(): {
    activeOperations: number;
    maxConcurrentReplays: number;
    registeredAggregates: string[];
    registeredProjections: string[];
  } {
    return {
      activeOperations: this.activeOperations.size,
      maxConcurrentReplays: this.config.maxConcurrentReplays,
      registeredAggregates: Array.from(this.aggregates.keys()),
      registeredProjections: this.projectionManager.getAll().map((p) => p.name),
    };
  }

  /**
   * Cleanup old audit entries
   */
  async cleanupAudit(): Promise<number> {
    return this.auditService.cleanup(this.config.auditRetentionDays);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createReplayOrchestrator(
  eventStore: EventStoreInterface,
  projectionManager: ProjectionManager,
  auditStore: ReplayAuditStore,
  checkpointStore: CheckpointStore,
  config?: Partial<ReplayOrchestratorConfig>
): ReplayOrchestrator {
  return new ReplayOrchestrator(eventStore, projectionManager, auditStore, checkpointStore, config);
}
