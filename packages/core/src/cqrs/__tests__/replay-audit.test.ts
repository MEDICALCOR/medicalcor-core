/**
 * @fileoverview Tests for Replay Audit Trail
 *
 * Tests the InMemoryReplayAuditStore, ReplayAuditService, and factory functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InMemoryReplayAuditStore,
  PostgresReplayAuditStore,
  ReplayAuditService,
  createReplayAuditStore,
  createReplayAuditService,
  createInMemoryReplayAuditService,
  type ReplayAuditEntry,
  type ReplayOperationType,
  type ReplayProgress,
  type ReplayResult,
  type ReplayError,
} from '../replay-audit.js';

// Mock the logger
vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(7)),
}));

// Mock pg module
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  end: vi.fn().mockResolvedValue(undefined),
};

// Create a proper constructor mock
class MockPool {
  connect = mockPool.connect;
  end = mockPool.end;
}

vi.mock('pg', () => ({
  default: {
    Pool: MockPool,
  },
}));

describe('Replay Audit Trail', () => {
  describe('InMemoryReplayAuditStore', () => {
    let store: InMemoryReplayAuditStore;

    const createEntry = (overrides: Partial<ReplayAuditEntry> = {}): ReplayAuditEntry => ({
      id: 'entry-' + Math.random().toString(36).substring(7),
      operationType: 'state_reconstruction' as ReplayOperationType,
      status: 'started',
      initiatedBy: 'user-123',
      correlationId: 'corr-123',
      parameters: {},
      timestamps: {
        started: new Date(),
      },
      metadata: {},
      ...overrides,
    });

    beforeEach(() => {
      store = new InMemoryReplayAuditStore();
    });

    describe('save', () => {
      it('should save an entry', async () => {
        const entry = createEntry({ id: 'entry-1' });

        await store.save(entry);

        const result = await store.getById('entry-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('entry-1');
      });

      it('should create a copy of the entry', async () => {
        const entry = createEntry({ id: 'entry-1' });

        await store.save(entry);
        entry.status = 'completed'; // Modify original

        const result = await store.getById('entry-1');
        expect(result?.status).toBe('started'); // Should be unaffected
      });

      it('should overwrite existing entry with same ID', async () => {
        const entry1 = createEntry({ id: 'entry-1', status: 'started' });
        const entry2 = createEntry({ id: 'entry-1', status: 'completed' });

        await store.save(entry1);
        await store.save(entry2);

        const result = await store.getById('entry-1');
        expect(result?.status).toBe('completed');
      });
    });

    describe('getById', () => {
      it('should return entry by ID', async () => {
        const entry = createEntry({ id: 'entry-1' });
        await store.save(entry);

        const result = await store.getById('entry-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('entry-1');
      });

      it('should return null for non-existent ID', async () => {
        const result = await store.getById('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getByCorrelationId', () => {
      it('should return entries by correlation ID', async () => {
        await store.save(createEntry({ id: '1', correlationId: 'corr-1' }));
        await store.save(createEntry({ id: '2', correlationId: 'corr-1' }));
        await store.save(createEntry({ id: '3', correlationId: 'corr-2' }));

        const result = await store.getByCorrelationId('corr-1');

        expect(result).toHaveLength(2);
        expect(result.every((e) => e.correlationId === 'corr-1')).toBe(true);
      });

      it('should sort by started timestamp descending', async () => {
        const date1 = new Date('2024-01-01');
        const date2 = new Date('2024-01-02');
        await store.save(
          createEntry({ id: '1', correlationId: 'corr-1', timestamps: { started: date1 } })
        );
        await store.save(
          createEntry({ id: '2', correlationId: 'corr-1', timestamps: { started: date2 } })
        );

        const result = await store.getByCorrelationId('corr-1');

        expect(result[0]?.id).toBe('2'); // Most recent first
        expect(result[1]?.id).toBe('1');
      });

      it('should return empty array when no matches', async () => {
        const result = await store.getByCorrelationId('non-existent');

        expect(result).toHaveLength(0);
      });
    });

    describe('getByAggregateId', () => {
      it('should return entries by aggregate ID', async () => {
        await store.save(createEntry({ id: '1', aggregateId: 'agg-1' }));
        await store.save(createEntry({ id: '2', aggregateId: 'agg-1' }));
        await store.save(createEntry({ id: '3', aggregateId: 'agg-2' }));

        const result = await store.getByAggregateId('agg-1');

        expect(result).toHaveLength(2);
        expect(result.every((e) => e.aggregateId === 'agg-1')).toBe(true);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await store.save(createEntry({ id: `entry-${i}`, aggregateId: 'agg-1' }));
        }

        const result = await store.getByAggregateId('agg-1', 5);

        expect(result).toHaveLength(5);
      });

      it('should use default limit of 100', async () => {
        for (let i = 0; i < 150; i++) {
          await store.save(
            createEntry({
              id: `entry-${i}`,
              aggregateId: 'agg-1',
              timestamps: { started: new Date(Date.now() - i) },
            })
          );
        }

        const result = await store.getByAggregateId('agg-1');

        expect(result).toHaveLength(100);
      });
    });

    describe('getByProjection', () => {
      it('should return entries by projection name', async () => {
        await store.save(createEntry({ id: '1', projectionName: 'lead-summary' }));
        await store.save(createEntry({ id: '2', projectionName: 'lead-summary' }));
        await store.save(createEntry({ id: '3', projectionName: 'patient-summary' }));

        const result = await store.getByProjection('lead-summary');

        expect(result).toHaveLength(2);
        expect(result.every((e) => e.projectionName === 'lead-summary')).toBe(true);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await store.save(createEntry({ id: `entry-${i}`, projectionName: 'projection' }));
        }

        const result = await store.getByProjection('projection', 3);

        expect(result).toHaveLength(3);
      });
    });

    describe('getByUser', () => {
      it('should return entries by user ID', async () => {
        await store.save(createEntry({ id: '1', initiatedBy: 'user-1' }));
        await store.save(createEntry({ id: '2', initiatedBy: 'user-1' }));
        await store.save(createEntry({ id: '3', initiatedBy: 'user-2' }));

        const result = await store.getByUser('user-1');

        expect(result).toHaveLength(2);
        expect(result.every((e) => e.initiatedBy === 'user-1')).toBe(true);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await store.save(createEntry({ id: `entry-${i}`, initiatedBy: 'user-1' }));
        }

        const result = await store.getByUser('user-1', 4);

        expect(result).toHaveLength(4);
      });
    });

    describe('getByTimeRange', () => {
      it('should return entries within time range', async () => {
        const date1 = new Date('2024-01-01');
        const date2 = new Date('2024-01-15');
        const date3 = new Date('2024-02-01');

        await store.save(createEntry({ id: '1', timestamps: { started: date1 } }));
        await store.save(createEntry({ id: '2', timestamps: { started: date2 } }));
        await store.save(createEntry({ id: '3', timestamps: { started: date3 } }));

        const result = await store.getByTimeRange(new Date('2024-01-01'), new Date('2024-01-31'));

        expect(result).toHaveLength(2);
      });

      it('should include entries at exact boundaries', async () => {
        const start = new Date('2024-01-01T00:00:00Z');
        const end = new Date('2024-01-31T23:59:59Z');

        await store.save(createEntry({ id: '1', timestamps: { started: start } }));
        await store.save(createEntry({ id: '2', timestamps: { started: end } }));

        const result = await store.getByTimeRange(start, end);

        expect(result).toHaveLength(2);
      });

      it('should respect limit parameter', async () => {
        const baseDate = new Date('2024-01-15');
        for (let i = 0; i < 10; i++) {
          await store.save(
            createEntry({
              id: `entry-${i}`,
              timestamps: { started: new Date(baseDate.getTime() + i * 1000) },
            })
          );
        }

        const result = await store.getByTimeRange(
          new Date('2024-01-01'),
          new Date('2024-01-31'),
          5
        );

        expect(result).toHaveLength(5);
      });
    });

    describe('getRecent', () => {
      it('should return most recent entries', async () => {
        for (let i = 0; i < 5; i++) {
          await store.save(
            createEntry({
              id: `entry-${i}`,
              timestamps: { started: new Date(Date.now() - i * 1000) },
            })
          );
        }

        const result = await store.getRecent(3);

        expect(result).toHaveLength(3);
        expect(result[0]?.id).toBe('entry-0'); // Most recent
      });

      it('should use default limit of 100', async () => {
        for (let i = 0; i < 150; i++) {
          await store.save(createEntry({ id: `entry-${i}` }));
        }

        const result = await store.getRecent();

        expect(result).toHaveLength(100);
      });
    });

    describe('delete', () => {
      it('should delete an entry', async () => {
        await store.save(createEntry({ id: 'entry-1' }));

        const deleted = await store.delete('entry-1');

        expect(deleted).toBe(true);
        expect(await store.getById('entry-1')).toBeNull();
      });

      it('should return false for non-existent entry', async () => {
        const deleted = await store.delete('non-existent');

        expect(deleted).toBe(false);
      });
    });

    describe('cleanup', () => {
      it('should delete entries older than cutoff date', async () => {
        const oldDate = new Date('2024-01-01');
        const newDate = new Date('2024-06-01');
        const cutoff = new Date('2024-03-01');

        await store.save(createEntry({ id: '1', timestamps: { started: oldDate } }));
        await store.save(createEntry({ id: '2', timestamps: { started: newDate } }));

        const deleted = await store.cleanup(cutoff);

        expect(deleted).toBe(1);
        expect(await store.getById('1')).toBeNull();
        expect(await store.getById('2')).not.toBeNull();
      });

      it('should return 0 when nothing to delete', async () => {
        const newDate = new Date();
        await store.save(createEntry({ id: '1', timestamps: { started: newDate } }));

        const cutoff = new Date('2020-01-01');
        const deleted = await store.cleanup(cutoff);

        expect(deleted).toBe(0);
      });
    });

    describe('clear', () => {
      it('should remove all entries', async () => {
        await store.save(createEntry({ id: '1' }));
        await store.save(createEntry({ id: '2' }));

        store.clear();

        expect(store.size()).toBe(0);
      });
    });

    describe('size', () => {
      it('should return number of entries', async () => {
        expect(store.size()).toBe(0);

        await store.save(createEntry({ id: '1' }));
        await store.save(createEntry({ id: '2' }));

        expect(store.size()).toBe(2);
      });
    });
  });

  describe('ReplayAuditService', () => {
    let store: InMemoryReplayAuditStore;
    let service: ReplayAuditService;

    beforeEach(() => {
      store = new InMemoryReplayAuditStore();
      service = new ReplayAuditService(store);
    });

    describe('startOperation', () => {
      it('should create and save a new audit entry', async () => {
        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
          aggregateId: 'agg-1',
          aggregateType: 'Lead',
          reason: 'Testing',
        });

        expect(entry.id).toBeDefined();
        expect(entry.operationType).toBe('state_reconstruction');
        expect(entry.status).toBe('started');
        expect(entry.initiatedBy).toBe('user-123');
        expect(entry.aggregateId).toBe('agg-1');
        expect(entry.aggregateType).toBe('Lead');
        expect(entry.parameters.reason).toBe('Testing');
        expect(entry.timestamps.started).toBeInstanceOf(Date);

        // Verify saved
        const saved = await store.getById(entry.id);
        expect(saved).not.toBeNull();
      });

      it('should set projection name when provided', async () => {
        const entry = await service.startOperation({
          operationType: 'projection_rebuild',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
          projectionName: 'lead-summary',
        });

        expect(entry.projectionName).toBe('lead-summary');
      });

      it('should set tenant ID when provided', async () => {
        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
          tenantId: 'tenant-1',
        });

        expect(entry.tenantId).toBe('tenant-1');
      });

      it('should merge custom parameters', async () => {
        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
          parameters: {
            asOf: new Date('2024-01-01'),
            batchSize: 100,
          },
        });

        expect(entry.parameters.asOf).toEqual(new Date('2024-01-01'));
        expect(entry.parameters.batchSize).toBe(100);
      });
    });

    describe('updateProgress', () => {
      it('should update progress on existing entry', async () => {
        const entry = await service.startOperation({
          operationType: 'projection_rebuild',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
        });

        const progress: ReplayProgress = {
          phase: 'replaying_events',
          eventsProcessed: 50,
          totalEvents: 100,
          percentComplete: 50,
        };

        await service.updateProgress(entry.id, progress);

        const updated = await store.getById(entry.id);
        expect(updated?.status).toBe('in_progress');
        expect(updated?.progress?.eventsProcessed).toBe(50);
        expect(updated?.progress?.percentComplete).toBe(50);
        expect(updated?.timestamps.lastProgress).toBeInstanceOf(Date);
      });

      it('should handle non-existent entry gracefully', async () => {
        // Should not throw
        await service.updateProgress('non-existent', {
          phase: 'initializing',
          eventsProcessed: 0,
          percentComplete: 0,
        });
      });
    });

    describe('completeOperation', () => {
      it('should mark operation as completed', async () => {
        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
        });

        const result: ReplayResult = {
          eventsProcessed: 100,
          eventsSkipped: 5,
          errorCount: 0,
          durationMs: 500,
          finalVersion: 100,
          success: true,
          summary: 'Reconstruction completed successfully',
        };

        await service.completeOperation(entry.id, result);

        const updated = await store.getById(entry.id);
        expect(updated?.status).toBe('completed');
        expect(updated?.result?.eventsProcessed).toBe(100);
        expect(updated?.result?.success).toBe(true);
        expect(updated?.timestamps.completed).toBeInstanceOf(Date);
      });

      it('should handle non-existent entry gracefully', async () => {
        await service.completeOperation('non-existent', {
          eventsProcessed: 0,
          eventsSkipped: 0,
          errorCount: 0,
          durationMs: 0,
          success: true,
          summary: 'N/A',
        });
      });
    });

    describe('failOperation', () => {
      it('should mark operation as failed', async () => {
        const entry = await service.startOperation({
          operationType: 'projection_rebuild',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
        });

        const error: ReplayError = {
          code: 'EVENT_NOT_FOUND',
          message: 'Event 123 not found in stream',
          eventId: '123',
        };

        await service.failOperation(entry.id, error);

        const updated = await store.getById(entry.id);
        expect(updated?.status).toBe('failed');
        expect(updated?.error?.code).toBe('EVENT_NOT_FOUND');
        expect(updated?.error?.message).toBe('Event 123 not found in stream');
        expect(updated?.timestamps.completed).toBeInstanceOf(Date);
      });

      it('should handle non-existent entry gracefully', async () => {
        await service.failOperation('non-existent', {
          code: 'ERROR',
          message: 'Error',
        });
      });
    });

    describe('cancelOperation', () => {
      it('should mark operation as cancelled', async () => {
        const entry = await service.startOperation({
          operationType: 'full_replay',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
        });

        await service.cancelOperation(entry.id, 'User requested cancellation');

        const updated = await store.getById(entry.id);
        expect(updated?.status).toBe('cancelled');
        expect(updated?.metadata.cancellationReason).toBe('User requested cancellation');
        expect(updated?.timestamps.completed).toBeInstanceOf(Date);
      });

      it('should handle non-existent entry gracefully', async () => {
        await service.cancelOperation('non-existent', 'Reason');
      });
    });

    describe('getAggregateHistory', () => {
      it('should return history for aggregate', async () => {
        await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
          aggregateId: 'agg-1',
        });
        await service.startOperation({
          operationType: 'state_verification',
          initiatedBy: 'user-2',
          correlationId: 'corr-2',
          aggregateId: 'agg-1',
        });

        const history = await service.getAggregateHistory('agg-1');

        expect(history).toHaveLength(2);
      });

      it('should pass limit to store', async () => {
        for (let i = 0; i < 10; i++) {
          await service.startOperation({
            operationType: 'state_reconstruction',
            initiatedBy: 'user-1',
            correlationId: `corr-${i}`,
            aggregateId: 'agg-1',
          });
        }

        const history = await service.getAggregateHistory('agg-1', 5);

        expect(history).toHaveLength(5);
      });
    });

    describe('getProjectionHistory', () => {
      it('should return history for projection', async () => {
        await service.startOperation({
          operationType: 'projection_rebuild',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
          projectionName: 'lead-summary',
        });

        const history = await service.getProjectionHistory('lead-summary');

        expect(history).toHaveLength(1);
      });
    });

    describe('getRecentOperations', () => {
      it('should return recent operations', async () => {
        await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
        });
        await service.startOperation({
          operationType: 'projection_rebuild',
          initiatedBy: 'user-2',
          correlationId: 'corr-2',
        });

        const recent = await service.getRecentOperations();

        expect(recent).toHaveLength(2);
      });
    });

    describe('getOperation', () => {
      it('should return operation by ID', async () => {
        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
        });

        const result = await service.getOperation(entry.id);

        expect(result).not.toBeNull();
        expect(result?.id).toBe(entry.id);
      });

      it('should return null for non-existent ID', async () => {
        const result = await service.getOperation('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('cleanup', () => {
      it('should clean up old entries', async () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 100);

        // Manually add old entry to store
        await store.save({
          id: 'old-entry',
          operationType: 'state_reconstruction',
          status: 'completed',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
          parameters: {},
          timestamps: { started: oldDate },
          metadata: {},
        });

        await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-2',
          correlationId: 'corr-2',
        });

        const deleted = await service.cleanup(30);

        expect(deleted).toBe(1);
        expect(await store.getById('old-entry')).toBeNull();
      });

      it('should return 0 when nothing to clean up', async () => {
        await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
        });

        const deleted = await service.cleanup(30);

        expect(deleted).toBe(0);
      });
    });
  });

  describe('PostgresReplayAuditStore', () => {
    let store: PostgresReplayAuditStore;

    const createMockRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'entry-1',
      operation_type: 'state_reconstruction',
      status: 'started',
      aggregate_id: 'agg-1',
      aggregate_type: 'Lead',
      projection_name: null,
      initiated_by: 'user-123',
      tenant_id: 'tenant-1',
      correlation_id: 'corr-123',
      parameters: {},
      result: null,
      error: null,
      started_at: new Date('2024-01-01'),
      completed_at: null,
      last_progress_at: null,
      progress: null,
      metadata: {},
      ...overrides,
    });

    beforeEach(() => {
      vi.clearAllMocks();
      store = new PostgresReplayAuditStore('postgresql://localhost:5432/test');
    });

    describe('initialize', () => {
      it('should create table and indexes', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        await store.initialize();

        expect(mockPool.connect).toHaveBeenCalled();
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('CREATE TABLE IF NOT EXISTS')
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should use custom table name', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });
        const customStore = new PostgresReplayAuditStore(
          'postgresql://localhost:5432/test',
          'custom_audit_table'
        );

        await customStore.initialize();

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('custom_audit_table')
        );
      });
    });

    describe('save', () => {
      it('should save entry with upsert', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });
        await store.initialize();

        const entry: ReplayAuditEntry = {
          id: 'entry-1',
          operationType: 'state_reconstruction',
          status: 'started',
          aggregateId: 'agg-1',
          aggregateType: 'Lead',
          initiatedBy: 'user-123',
          tenantId: 'tenant-1',
          correlationId: 'corr-123',
          parameters: { batchSize: 100 },
          timestamps: { started: new Date() },
          metadata: { custom: 'data' },
        };

        await store.save(entry);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          expect.arrayContaining([entry.id, entry.operationType])
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should handle optional fields as null', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });
        await store.initialize();

        const entry: ReplayAuditEntry = {
          id: 'entry-1',
          operationType: 'state_reconstruction',
          status: 'started',
          initiatedBy: 'user-123',
          correlationId: 'corr-123',
          parameters: {},
          timestamps: { started: new Date() },
          metadata: {},
        };

        await store.save(entry);

        // Verify null is passed for optional fields
        const saveCall = mockClient.query.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO')
        );
        expect(saveCall).toBeDefined();
        const params = saveCall?.[1] as unknown[];
        expect(params).toContain(null); // aggregateId, aggregateType, etc.
      });
    });

    describe('getById', () => {
      it('should return entry by ID', async () => {
        const mockRow = createMockRow();
        mockClient.query.mockResolvedValue({ rows: [mockRow] });
        await store.initialize();

        const result = await store.getById('entry-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('entry-1');
        expect(result?.operationType).toBe('state_reconstruction');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should return null when not found', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });
        await store.initialize();

        const result = await store.getById('non-existent');

        expect(result).toBeNull();
      });

      it('should map optional fields correctly', async () => {
        const mockRow = createMockRow({
          result: { success: true, eventsProcessed: 100 },
          error: null,
          completed_at: new Date('2024-01-02'),
          progress: { phase: 'finalizing', percentComplete: 100 },
        });
        mockClient.query.mockResolvedValue({ rows: [mockRow] });
        await store.initialize();

        const result = await store.getById('entry-1');

        expect(result?.result?.success).toBe(true);
        expect(result?.timestamps.completed).toBeInstanceOf(Date);
        expect(result?.progress?.phase).toBe('finalizing');
      });
    });

    describe('getByCorrelationId', () => {
      it('should return entries by correlation ID', async () => {
        const mockRows = [
          createMockRow({ id: '1', correlation_id: 'corr-1' }),
          createMockRow({ id: '2', correlation_id: 'corr-1' }),
        ];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const result = await store.getByCorrelationId('corr-1');

        expect(result).toHaveLength(2);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('correlation_id = $1'),
          ['corr-1']
        );
      });
    });

    describe('getByAggregateId', () => {
      it('should return entries by aggregate ID with limit', async () => {
        const mockRows = [createMockRow()];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const result = await store.getByAggregateId('agg-1', 50);

        expect(result).toHaveLength(1);
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), [
          'agg-1',
          50,
        ]);
      });
    });

    describe('getByProjection', () => {
      it('should return entries by projection name', async () => {
        const mockRows = [createMockRow({ projection_name: 'lead-summary' })];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const result = await store.getByProjection('lead-summary', 25);

        expect(result).toHaveLength(1);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('projection_name = $1'),
          ['lead-summary', 25]
        );
      });
    });

    describe('getByUser', () => {
      it('should return entries by user ID', async () => {
        const mockRows = [createMockRow({ initiated_by: 'user-123' })];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const result = await store.getByUser('user-123', 10);

        expect(result).toHaveLength(1);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('initiated_by = $1'),
          ['user-123', 10]
        );
      });
    });

    describe('getByTimeRange', () => {
      it('should return entries within time range', async () => {
        const mockRows = [createMockRow()];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const start = new Date('2024-01-01');
        const end = new Date('2024-01-31');
        const result = await store.getByTimeRange(start, end, 50);

        expect(result).toHaveLength(1);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('started_at >= $1 AND started_at <= $2'),
          [start, end, 50]
        );
      });
    });

    describe('getRecent', () => {
      it('should return recent entries', async () => {
        const mockRows = [createMockRow()];
        mockClient.query.mockResolvedValue({ rows: mockRows });
        await store.initialize();

        const result = await store.getRecent(20);

        expect(result).toHaveLength(1);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY started_at DESC'),
          [20]
        );
      });
    });

    describe('delete', () => {
      it('should delete entry and return true', async () => {
        mockClient.query.mockResolvedValue({ rowCount: 1 });
        await store.initialize();

        const result = await store.delete('entry-1');

        expect(result).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), [
          'entry-1',
        ]);
      });

      it('should return false when entry not found', async () => {
        mockClient.query.mockResolvedValue({ rowCount: 0 });
        await store.initialize();

        const result = await store.delete('non-existent');

        expect(result).toBe(false);
      });
    });

    describe('cleanup', () => {
      it('should delete old entries and return count', async () => {
        mockClient.query.mockResolvedValue({ rowCount: 5 });
        await store.initialize();

        const cutoff = new Date('2024-01-01');
        const result = await store.cleanup(cutoff);

        expect(result).toBe(5);
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('started_at < $1'), [
          cutoff,
        ]);
      });
    });

    describe('close', () => {
      it('should close the pool', async () => {
        await store.initialize();

        await store.close();

        expect(mockPool.end).toHaveBeenCalled();
      });
    });
  });

  describe('Factory Functions', () => {
    describe('createReplayAuditStore', () => {
      it('should create InMemoryReplayAuditStore when no connection string provided', () => {
        const store = createReplayAuditStore();

        expect(store).toBeInstanceOf(InMemoryReplayAuditStore);
      });

      it('should create InMemoryReplayAuditStore when undefined provided', () => {
        const store = createReplayAuditStore(undefined);

        expect(store).toBeInstanceOf(InMemoryReplayAuditStore);
      });

      it('should create PostgresReplayAuditStore when connection string provided', () => {
        const store = createReplayAuditStore('postgresql://localhost:5432/test');

        expect(store).toBeInstanceOf(PostgresReplayAuditStore);
      });
    });

    describe('createReplayAuditService', () => {
      it('should create service with provided store', () => {
        const store = new InMemoryReplayAuditStore();
        const service = createReplayAuditService(store);

        expect(service).toBeInstanceOf(ReplayAuditService);
      });
    });

    describe('createInMemoryReplayAuditService', () => {
      it('should create service with in-memory store', () => {
        const service = createInMemoryReplayAuditService();

        expect(service).toBeInstanceOf(ReplayAuditService);
      });

      it('should return functional service', async () => {
        const service = createInMemoryReplayAuditService();

        const entry = await service.startOperation({
          operationType: 'state_reconstruction',
          initiatedBy: 'user-1',
          correlationId: 'corr-1',
        });

        expect(entry.id).toBeDefined();

        const retrieved = await service.getOperation(entry.id);
        expect(retrieved).not.toBeNull();
      });
    });
  });
});
