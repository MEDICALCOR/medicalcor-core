/**
 * Tests for EmbeddingMigrationOrchestrator
 *
 * Tests embedding model migration lifecycle including job management,
 * batch processing, and rollback support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingMigrationOrchestrator,
  createEmbeddingMigrationOrchestrator,
  MigrationJobConfigSchema,
  MigrationJobStatusSchema,
  MigrationEntryStatusSchema,
  type MigrationJobConfig,
  type MigrationJob,
  type EmbeddingGenerator,
} from '../embedding-migration-orchestrator.js';
import type { Pool, PoolClient } from 'pg';
import type { EmbeddingModelRegistry } from '../embedding-model-registry.js';

// Mock Pool
const createMockPool = (): Pool => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
  } as unknown as Pool;
};

// Mock Registry
const createMockRegistry = (): EmbeddingModelRegistry =>
  ({
    getModel: vi.fn().mockReturnValue({
      id: 'text-embedding-3-small',
      dimensions: 1536,
      qualityScore: 90,
      status: 'active',
      costPer1MTokens: 0.02,
    }),
    getCurrentModel: vi.fn().mockReturnValue({
      id: 'text-embedding-3-small',
      dimensions: 1536,
      qualityScore: 90,
      status: 'active',
    }),
    getAllModels: vi.fn().mockReturnValue([
      { id: 'text-embedding-3-small', dimensions: 1536, qualityScore: 90 },
      { id: 'text-embedding-ada-002', dimensions: 1536, qualityScore: 85 },
    ]),
  }) as unknown as EmbeddingModelRegistry;

// Mock Embedding Generator
const createMockEmbeddingGenerator = (): EmbeddingGenerator => ({
  embed: vi.fn().mockResolvedValue({
    embedding: Array(1536).fill(0.1),
    tokensUsed: 100,
  }),
  embedBatch: vi.fn().mockResolvedValue({
    embeddings: [Array(1536).fill(0.1)],
    totalTokensUsed: 100,
  }),
  getModelInfo: vi.fn().mockReturnValue({
    model: 'text-embedding-3-small',
    dimensions: 1536,
  }),
});

// Helper to create mock job row
const createMockJobRow = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  id: 'job-123',
  job_name: 'migration_ada_to_3small_123456',
  from_model: 'text-embedding-ada-002',
  to_model: 'text-embedding-3-small',
  target_table: 'knowledge_base',
  status: 'pending',
  priority: 5,
  total_entries: 100,
  processed_entries: 0,
  failed_entries: 0,
  skipped_entries: 0,
  batch_size: 50,
  concurrency: 1,
  delay_between_batches_ms: 100,
  max_retries: 3,
  retry_count: 0,
  last_error: null,
  error_count: 0,
  started_at: null,
  completed_at: null,
  paused_at: null,
  estimated_completion_at: null,
  last_processed_id: null,
  checkpoint_data: {},
  created_by: 'user-1',
  correlation_id: 'corr-123',
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('EmbeddingMigrationOrchestrator', () => {
  let mockPool: Pool;
  let mockRegistry: EmbeddingModelRegistry;
  let mockGenerator: EmbeddingGenerator;
  let orchestrator: EmbeddingMigrationOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    mockRegistry = createMockRegistry();
    mockGenerator = createMockEmbeddingGenerator();
    orchestrator = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry, mockGenerator);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should create instance with default registry', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should create instance with custom registry', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should create instance with embedding generator', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry, mockGenerator);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });
  });

  describe('setEmbeddingGenerator', () => {
    it('should set embedding generator', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool);
      orch.setEmbeddingGenerator(mockGenerator);
      // No direct way to verify, but should not throw
    });
  });

  describe('createJob', () => {
    beforeEach(() => {
      // Mock count query
      vi.mocked(mockPool.query).mockImplementation((query: unknown) => {
        const queryStr = String(query);
        if (queryStr.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '100' }] });
        }
        if (queryStr.includes('INSERT')) {
          return Promise.resolve({ rows: [createMockJobRow()] });
        }
        if (queryStr.includes('SELECT')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should create a migration job', async () => {
      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        targetTable: 'knowledge_base',
        batchSize: 50,
        concurrency: 1,
        delayBetweenBatchesMs: 100,
        maxRetries: 3,
        priority: 5,
        createdBy: 'user-1',
      };

      const job = await orchestrator.createJob(config);

      expect(job).toBeDefined();
      expect(job.id).toBe('job-123');
      expect(job.fromModel).toBe('text-embedding-ada-002');
      expect(job.toModel).toBe('text-embedding-3-small');
    });

    it('should fail if source model not in registry', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValueOnce(undefined);

      const config: MigrationJobConfig = {
        fromModel: 'unknown-model',
        toModel: 'text-embedding-3-small',
      };

      await expect(orchestrator.createJob(config)).rejects.toThrow('Source model');
    });

    it('should fail if target model not in registry', async () => {
      vi.mocked(mockRegistry.getModel)
        .mockReturnValueOnce({ id: 'source', dimensions: 1536 } as never)
        .mockReturnValueOnce(undefined);

      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'unknown-target',
      };

      await expect(orchestrator.createJob(config)).rejects.toThrow('Target model');
    });

    it('should fail if active job already exists', async () => {
      vi.mocked(mockPool.query).mockImplementation((query: unknown) => {
        const queryStr = String(query);
        if (queryStr.includes('status IN')) {
          return Promise.resolve({ rows: [createMockJobRow({ status: 'running' })] });
        }
        return Promise.resolve({ rows: [] });
      });

      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
      };

      await expect(orchestrator.createJob(config)).rejects.toThrow('Active migration job');
    });

    it('should create job with custom correlation ID', async () => {
      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        correlationId: 'custom-correlation',
      };

      const job = await orchestrator.createJob(config);

      expect(job.correlationId).toBe('corr-123'); // From mock
    });

    it('should create job with metadata', async () => {
      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        metadata: { reason: 'upgrade', requestedBy: 'admin' },
      };

      const job = await orchestrator.createJob(config);

      expect(job).toBeDefined();
    });
  });

  describe('startJob', () => {
    it('should fail if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] });

      await expect(orchestrator.startJob('non-existent')).rejects.toThrow('not found');
    });

    it('should fail if job already running', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'running' })],
      });

      await expect(orchestrator.startJob('job-123')).rejects.toThrow('already running');
    });

    it('should fail if job already completed', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'completed' })],
      });

      await expect(orchestrator.startJob('job-123')).rejects.toThrow('already completed');
    });

    it('should fail if no embedding generator configured', async () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry);

      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'pending' })],
      });

      await expect(orch.startJob('job-123')).rejects.toThrow('Embedding generator');
    });
  });

  describe('pauseJob', () => {
    it('should fail if job not running', async () => {
      await expect(orchestrator.pauseJob('job-123')).rejects.toThrow('not running');
    });
  });

  describe('cancelJob', () => {
    it('should cancel a non-running job', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] });

      await orchestrator.cancelJob('job-123');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] });

      const job = await orchestrator.getJob('non-existent');

      expect(job).toBeNull();
    });

    it('should return job if found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow()],
      });

      const job = await orchestrator.getJob('job-123');

      expect(job).toBeDefined();
      expect(job?.id).toBe('job-123');
    });
  });

  describe('getJobProgress', () => {
    it('should return null if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] });

      const progress = await orchestrator.getJobProgress('non-existent');

      expect(progress).toBeNull();
    });

    it('should return progress for existing job', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [
            {
              job_id: 'job-123',
              status: 'running',
              progress_percent: '50',
              entries_per_second: '10',
              estimated_time_remaining_seconds: '300',
              error_rate: '0.01',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [createMockJobRow({ status: 'running', processed_entries: 50 })],
        });

      const progress = await orchestrator.getJobProgress('job-123');

      expect(progress).toBeDefined();
      expect(progress?.progressPercent).toBe(50);
      expect(progress?.entriesPerSecond).toBe(10);
    });
  });

  describe('listJobs', () => {
    it('should list jobs without filters', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({
          rows: [createMockJobRow(), createMockJobRow({ id: 'job-456' })],
        });

      const result = await orchestrator.listJobs();

      expect(result.total).toBe(2);
      expect(result.jobs.length).toBe(2);
    });

    it('should list jobs with status filter', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [createMockJobRow({ status: 'completed' })],
        });

      const result = await orchestrator.listJobs({ status: 'completed' });

      expect(result.total).toBe(1);
    });

    it('should list jobs with model filters', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [createMockJobRow()],
        });

      const result = await orchestrator.listJobs({
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
      });

      expect(result.total).toBe(1);
    });

    it('should respect pagination', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({
          rows: [createMockJobRow()],
        });

      const result = await orchestrator.listJobs({ limit: 10, offset: 20 });

      expect(result.total).toBe(100);
    });
  });

  describe('rollbackJob', () => {
    it('should fail if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] });

      await expect(orchestrator.rollbackJob('non-existent')).rejects.toThrow('not found');
    });

    it('should fail if job is running', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'running' })],
      });

      await expect(orchestrator.rollbackJob('job-123')).rejects.toThrow('running job');
    });

    it('should rollback completed job', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [createMockJobRow({ status: 'completed' })],
        })
        .mockResolvedValue({ rows: [] });

      const result = await orchestrator.rollbackJob('job-123');

      expect(result.rolledBack).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should rollback with limit', async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [createMockJobRow({ status: 'failed' })],
        })
        .mockResolvedValue({ rows: [] });

      const result = await orchestrator.rollbackJob('job-123', { limit: 500 });

      expect(result).toBeDefined();
    });
  });

  describe('getModelDistribution', () => {
    it('should get distribution for knowledge_base', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            model: 'text-embedding-3-small',
            entry_count: '1000',
            percentage: '80',
            avg_version: '1.5',
            oldest_embedding: new Date(),
            newest_embedding: new Date(),
          },
        ],
      });

      const distribution = await orchestrator.getModelDistribution('knowledge_base');

      expect(distribution.length).toBe(1);
      expect(distribution[0]?.entryCount).toBe(1000);
    });

    it('should get distribution for message_embeddings', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
      });

      const distribution = await orchestrator.getModelDistribution('message_embeddings');

      expect(Array.isArray(distribution)).toBe(true);
    });
  });

  describe('countEntriesForMigration', () => {
    it('should count entries for knowledge_base', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '500' }],
      });

      const count = await orchestrator.countEntriesForMigration(
        'text-embedding-ada-002',
        'knowledge_base'
      );

      expect(count).toBe(500);
    });

    it('should count entries for message_embeddings', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '1000' }],
      });

      const count = await orchestrator.countEntriesForMigration(
        'text-embedding-ada-002',
        'message_embeddings'
      );

      expect(count).toBe(1000);
    });
  });

  describe('estimateMigrationCost', () => {
    beforeEach(() => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '10000' }],
      });
    });

    it('should estimate migration cost', async () => {
      const estimate = await orchestrator.estimateMigrationCost(
        'text-embedding-ada-002',
        'text-embedding-3-small'
      );

      expect(estimate.entryCount).toBe(10000);
      expect(estimate.estimatedTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
      expect(estimate.estimatedDurationMinutes).toBeGreaterThan(0);
    });

    it('should estimate for message_embeddings', async () => {
      const estimate = await orchestrator.estimateMigrationCost(
        'text-embedding-ada-002',
        'text-embedding-3-small',
        'message_embeddings'
      );

      expect(estimate).toBeDefined();
    });

    it('should handle unknown model cost', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValue(undefined);

      const estimate = await orchestrator.estimateMigrationCost(
        'text-embedding-ada-002',
        'unknown-model'
      );

      expect(estimate.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Schema validations', () => {
    it('should validate job status values', () => {
      const statuses = [
        'pending',
        'running',
        'paused',
        'completed',
        'failed',
        'cancelled',
        'rolling_back',
      ];

      for (const status of statuses) {
        expect(MigrationJobStatusSchema.parse(status)).toBe(status);
      }
    });

    it('should reject invalid job status', () => {
      expect(() => MigrationJobStatusSchema.parse('invalid')).toThrow();
    });

    it('should validate entry status values', () => {
      const statuses = ['success', 'failed', 'skipped', 'rolled_back'];

      for (const status of statuses) {
        expect(MigrationEntryStatusSchema.parse(status)).toBe(status);
      }
    });

    it('should validate job config with defaults', () => {
      const config = MigrationJobConfigSchema.parse({
        fromModel: 'model-a',
        toModel: 'model-b',
      });

      expect(config.targetTable).toBe('knowledge_base');
      expect(config.batchSize).toBe(50);
      expect(config.concurrency).toBe(1);
      expect(config.delayBetweenBatchesMs).toBe(100);
      expect(config.maxRetries).toBe(3);
      expect(config.priority).toBe(5);
    });

    it('should validate job config with custom values', () => {
      const config = MigrationJobConfigSchema.parse({
        fromModel: 'model-a',
        toModel: 'model-b',
        targetTable: 'message_embeddings',
        batchSize: 100,
        concurrency: 5,
        delayBetweenBatchesMs: 200,
        maxRetries: 5,
        priority: 10,
        createdBy: 'admin',
        correlationId: 'corr-123',
        metadata: { reason: 'upgrade' },
      });

      expect(config.targetTable).toBe('message_embeddings');
      expect(config.batchSize).toBe(100);
    });

    it('should reject invalid batch size', () => {
      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          batchSize: 0,
        })
      ).toThrow();

      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          batchSize: 1000,
        })
      ).toThrow();
    });

    it('should reject invalid concurrency', () => {
      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          concurrency: 0,
        })
      ).toThrow();

      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          concurrency: 20,
        })
      ).toThrow();
    });

    it('should reject invalid priority', () => {
      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          priority: 0,
        })
      ).toThrow();

      expect(() =>
        MigrationJobConfigSchema.parse({
          fromModel: 'a',
          toModel: 'b',
          priority: 11,
        })
      ).toThrow();
    });
  });

  describe('createEmbeddingMigrationOrchestrator factory', () => {
    it('should create instance with defaults', () => {
      const orch = createEmbeddingMigrationOrchestrator(mockPool);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should create instance with registry', () => {
      const orch = createEmbeddingMigrationOrchestrator(mockPool, mockRegistry);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should create instance with generator', () => {
      const orch = createEmbeddingMigrationOrchestrator(mockPool, mockRegistry, mockGenerator);
      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });
  });
});
