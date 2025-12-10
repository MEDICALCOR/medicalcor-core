/**
 * Embedding Migration Orchestrator Tests
 *
 * Comprehensive tests for migration job lifecycle:
 * - Job creation and validation
 * - Job execution (start, pause, cancel)
 * - Batch processing
 * - Rollback support
 * - Statistics and monitoring
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  EmbeddingMigrationOrchestrator,
  createEmbeddingMigrationOrchestrator,
  MigrationJobConfigSchema,
  type MigrationJobConfig,
  type MigrationJob,
  type MigrationJobStatus,
  type EmbeddingGenerator,
} from '../embedding-migration-orchestrator.js';
import type { Pool, PoolClient, QueryResult } from 'pg';
import {
  EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
} from '../embedding-model-registry.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPoolClient(): PoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function createMockPool(): Pool {
  const client = createMockPoolClient();
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn(),
  } as unknown as Pool;
}

function createMockEmbeddingGenerator(): EmbeddingGenerator {
  return {
    embed: vi.fn().mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      tokensUsed: 100,
    }),
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [new Array(1536).fill(0.1), new Array(1536).fill(0.2)],
      totalTokensUsed: 200,
    }),
    getModelInfo: vi.fn().mockReturnValue({
      model: 'text-embedding-3-small',
      dimensions: 1536,
    }),
  };
}

function createMockJobRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: 'job-123',
    job_name: 'migration_test',
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
    created_by: 'test-user',
    correlation_id: 'corr-123',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('MigrationJobConfigSchema', () => {
  it('should validate a complete config', () => {
    const config: MigrationJobConfig = {
      fromModel: 'text-embedding-ada-002',
      toModel: 'text-embedding-3-small',
      targetTable: 'knowledge_base',
      batchSize: 50,
      concurrency: 1,
      delayBetweenBatchesMs: 100,
      maxRetries: 3,
      priority: 5,
      createdBy: 'test-user',
      correlationId: 'corr-123',
      metadata: { reason: 'test' },
    };

    const result = MigrationJobConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  it('should apply defaults for optional fields', () => {
    const config = {
      fromModel: 'text-embedding-ada-002',
      toModel: 'text-embedding-3-small',
    };

    const result = MigrationJobConfigSchema.parse(config);

    expect(result.targetTable).toBe('knowledge_base');
    expect(result.batchSize).toBe(50);
    expect(result.concurrency).toBe(1);
    expect(result.delayBetweenBatchesMs).toBe(100);
    expect(result.maxRetries).toBe(3);
    expect(result.priority).toBe(5);
  });

  it('should reject invalid batch size', () => {
    const config = {
      fromModel: 'text-embedding-ada-002',
      toModel: 'text-embedding-3-small',
      batchSize: 1000, // Max is 500
    };

    const result = MigrationJobConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject invalid concurrency', () => {
    const config = {
      fromModel: 'text-embedding-ada-002',
      toModel: 'text-embedding-3-small',
      concurrency: 20, // Max is 10
    };

    const result = MigrationJobConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject invalid priority', () => {
    const config = {
      fromModel: 'text-embedding-ada-002',
      toModel: 'text-embedding-3-small',
      priority: 15, // Max is 10
    };

    const result = MigrationJobConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ORCHESTRATOR TESTS
// ============================================================================

describe('EmbeddingMigrationOrchestrator', () => {
  let orchestrator: EmbeddingMigrationOrchestrator;
  let mockPool: Pool;
  let mockRegistry: EmbeddingModelRegistry;
  let mockGenerator: EmbeddingGenerator;

  beforeEach(() => {
    mockPool = createMockPool();
    mockRegistry = createEmbeddingModelRegistry();
    mockGenerator = createMockEmbeddingGenerator();
    orchestrator = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry, mockGenerator);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // CONSTRUCTOR AND SETUP TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create orchestrator with all dependencies', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry, mockGenerator);

      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should create orchestrator with default registry', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool);

      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });

    it('should allow setting embedding generator later', () => {
      const orch = new EmbeddingMigrationOrchestrator(mockPool);
      orch.setEmbeddingGenerator(mockGenerator);

      expect(orch).toBeInstanceOf(EmbeddingMigrationOrchestrator);
    });
  });

  // ============================================================================
  // JOB CREATION TESTS
  // ============================================================================

  describe('createJob', () => {
    beforeEach(() => {
      // Mock count query
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('SELECT COUNT')) {
          return { rows: [{ count: '100' }], rowCount: 1 } as QueryResult<{ count: string }>;
        }
        if (typeof query === 'string' && query.includes('INSERT INTO embedding_migration_jobs')) {
          return {
            rows: [createMockJobRow()],
            rowCount: 1,
          } as QueryResult<Record<string, unknown>>;
        }
        if (
          typeof query === 'string' &&
          query.includes("status IN ('pending', 'running', 'paused')")
        ) {
          return { rows: [], rowCount: 0 } as QueryResult<unknown>;
        }
        return { rows: [], rowCount: 0 } as QueryResult<unknown>;
      });
    });

    it('should create a new migration job', async () => {
      const config: MigrationJobConfig = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        targetTable: 'knowledge_base',
        batchSize: 50,
        concurrency: 1,
        delayBetweenBatchesMs: 100,
        maxRetries: 3,
        priority: 5,
        createdBy: 'test-user',
      };

      const job = await orchestrator.createJob(config);

      expect(job).toBeDefined();
      expect(job.id).toBe('job-123');
      expect(job.fromModel).toBe('text-embedding-ada-002');
      expect(job.toModel).toBe('text-embedding-3-small');
    });

    it('should throw error for invalid source model', async () => {
      const config = {
        fromModel: 'invalid-model' as unknown as string,
        toModel: 'text-embedding-3-small',
      };

      await expect(orchestrator.createJob(config as MigrationJobConfig)).rejects.toThrow(
        'Source model invalid-model not found in registry'
      );
    });

    it('should throw error for invalid target model', async () => {
      const config = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'invalid-model' as unknown as string,
      };

      await expect(orchestrator.createJob(config as MigrationJobConfig)).rejects.toThrow(
        'Target model invalid-model not found in registry'
      );
    });

    it('should throw error if active job already exists', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (
          typeof query === 'string' &&
          query.includes("status IN ('pending', 'running', 'paused')")
        ) {
          return {
            rows: [createMockJobRow({ status: 'running' })],
            rowCount: 1,
          } as QueryResult<Record<string, unknown>>;
        }
        return { rows: [], rowCount: 0 } as QueryResult<unknown>;
      });

      const config = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
      };

      await expect(orchestrator.createJob(config as MigrationJobConfig)).rejects.toThrow(
        'Active migration job already exists'
      );
    });
  });

  // ============================================================================
  // JOB EXECUTION TESTS
  // ============================================================================

  describe('startJob', () => {
    it('should throw error if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<unknown>);

      await expect(orchestrator.startJob('non-existent')).rejects.toThrow(
        'Job non-existent not found'
      );
    });

    it('should throw error if job is already running', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'running' })],
        rowCount: 1,
      } as QueryResult<Record<string, unknown>>);

      await expect(orchestrator.startJob('job-123')).rejects.toThrow(
        'Job job-123 is already running'
      );
    });

    it('should throw error if job is already completed', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'completed' })],
        rowCount: 1,
      } as QueryResult<Record<string, unknown>>);

      await expect(orchestrator.startJob('job-123')).rejects.toThrow(
        'Job job-123 is already completed'
      );
    });

    it('should throw error if embedding generator not configured', async () => {
      const orchWithoutGenerator = new EmbeddingMigrationOrchestrator(mockPool, mockRegistry);

      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'pending' })],
        rowCount: 1,
      } as QueryResult<Record<string, unknown>>);

      await expect(orchWithoutGenerator.startJob('job-123')).rejects.toThrow(
        'Embedding generator not configured'
      );
    });
  });

  describe('pauseJob', () => {
    it('should throw error if job is not running', async () => {
      await expect(orchestrator.pauseJob('non-running')).rejects.toThrow(
        'Job non-running is not running'
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel a job that is not running', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<unknown>);

      await orchestrator.cancelJob('job-123');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // JOB RETRIEVAL TESTS
  // ============================================================================

  describe('getJob', () => {
    it('should return null for non-existent job', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<unknown>);

      const job = await orchestrator.getJob('non-existent');

      expect(job).toBeNull();
    });

    it('should return job when found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow()],
        rowCount: 1,
      } as QueryResult<Record<string, unknown>>);

      const job = await orchestrator.getJob('job-123');

      expect(job).not.toBeNull();
      expect(job?.id).toBe('job-123');
    });
  });

  describe('getJobProgress', () => {
    it('should return null if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<unknown>);

      const progress = await orchestrator.getJobProgress('non-existent');

      expect(progress).toBeNull();
    });

    it('should return progress when job exists', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('get_migration_job_progress')) {
          return {
            rows: [
              {
                job_id: 'job-123',
                status: 'running',
                progress_percent: '50.00',
                entries_per_second: '10.5',
                estimated_time_remaining_seconds: '300',
                error_rate: '0.01',
              },
            ],
            rowCount: 1,
          } as QueryResult<{
            job_id: string;
            status: string;
            progress_percent: string;
            entries_per_second: string;
            estimated_time_remaining_seconds: string;
            error_rate: string;
          }>;
        }
        return {
          rows: [
            createMockJobRow({ status: 'running', processed_entries: 50, total_entries: 100 }),
          ],
          rowCount: 1,
        } as QueryResult<Record<string, unknown>>;
      });

      const progress = await orchestrator.getJobProgress('job-123');

      expect(progress).not.toBeNull();
      expect(progress?.jobId).toBe('job-123');
      expect(progress?.progressPercent).toBe(50);
      expect(progress?.entriesPerSecond).toBe(10.5);
      expect(progress?.estimatedTimeRemainingSeconds).toBe(300);
    });

    it('should handle null estimated time remaining', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('get_migration_job_progress')) {
          return {
            rows: [
              {
                job_id: 'job-123',
                status: 'running',
                progress_percent: '50.00',
                entries_per_second: '10.5',
                estimated_time_remaining_seconds: null,
                error_rate: '0.01',
              },
            ],
            rowCount: 1,
          } as QueryResult<{
            job_id: string;
            status: string;
            progress_percent: string;
            entries_per_second: string;
            estimated_time_remaining_seconds: string | null;
            error_rate: string;
          }>;
        }
        return {
          rows: [createMockJobRow({ status: 'running' })],
          rowCount: 1,
        } as QueryResult<Record<string, unknown>>;
      });

      const progress = await orchestrator.getJobProgress('job-123');

      expect(progress?.estimatedTimeRemainingSeconds).toBeNull();
    });
  });

  describe('listJobs', () => {
    it('should list all jobs with default options', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('SELECT COUNT')) {
          return { rows: [{ count: '2' }], rowCount: 1 } as QueryResult<{ count: string }>;
        }
        return {
          rows: [createMockJobRow({ id: 'job-1' }), createMockJobRow({ id: 'job-2' })],
          rowCount: 2,
        } as QueryResult<Record<string, unknown>>;
      });

      const result = await orchestrator.listJobs();

      expect(result.jobs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('SELECT COUNT')) {
          return { rows: [{ count: '1' }], rowCount: 1 } as QueryResult<{ count: string }>;
        }
        return {
          rows: [createMockJobRow({ status: 'running' })],
          rowCount: 1,
        } as QueryResult<Record<string, unknown>>;
      });

      const result = await orchestrator.listJobs({ status: 'running' });

      expect(result.jobs).toHaveLength(1);
    });

    it('should filter by fromModel and toModel', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('SELECT COUNT')) {
          return { rows: [{ count: '1' }], rowCount: 1 } as QueryResult<{ count: string }>;
        }
        return {
          rows: [createMockJobRow()],
          rowCount: 1,
        } as QueryResult<Record<string, unknown>>;
      });

      const result = await orchestrator.listJobs({
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
      });

      expect(result.jobs).toHaveLength(1);
    });

    it('should apply pagination', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (typeof query === 'string' && query.includes('SELECT COUNT')) {
          return { rows: [{ count: '10' }], rowCount: 1 } as QueryResult<{ count: string }>;
        }
        return {
          rows: [createMockJobRow()],
          rowCount: 1,
        } as QueryResult<Record<string, unknown>>;
      });

      const result = await orchestrator.listJobs({ limit: 5, offset: 5 });

      expect(result.total).toBe(10);
    });
  });

  // ============================================================================
  // ROLLBACK TESTS
  // ============================================================================

  describe('rollbackJob', () => {
    it('should throw error if job not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<unknown>);

      await expect(orchestrator.rollbackJob('non-existent')).rejects.toThrow(
        'Job non-existent not found'
      );
    });

    it('should throw error if job is running', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [createMockJobRow({ status: 'running' })],
        rowCount: 1,
      } as QueryResult<Record<string, unknown>>);

      await expect(orchestrator.rollbackJob('job-123')).rejects.toThrow(
        'Cannot rollback a running job'
      );
    });

    it('should rollback a completed job', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (
          typeof query === 'string' &&
          query.includes('SELECT * FROM embedding_migration_jobs WHERE id')
        ) {
          return {
            rows: [createMockJobRow({ status: 'completed' })],
            rowCount: 1,
          } as QueryResult<Record<string, unknown>>;
        }
        if (typeof query === 'string' && query.includes('embedding_migration_history')) {
          return {
            rows: [
              {
                entry_id: 'entry-1',
                entry_table: 'knowledge_base',
                from_model: 'text-embedding-ada-002',
              },
            ],
            rowCount: 1,
          } as QueryResult<{ entry_id: string; entry_table: string; from_model: string }>;
        }
        return { rows: [], rowCount: 0 } as QueryResult<unknown>;
      });

      const result = await orchestrator.rollbackJob('job-123');

      expect(result.rolledBack).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
    });

    it('should respect rollback limit', async () => {
      vi.mocked(mockPool.query).mockImplementation(async (query: string, _values?: unknown[]) => {
        if (
          typeof query === 'string' &&
          query.includes('SELECT * FROM embedding_migration_jobs WHERE id')
        ) {
          return {
            rows: [createMockJobRow({ status: 'failed' })],
            rowCount: 1,
          } as QueryResult<Record<string, unknown>>;
        }
        return { rows: [], rowCount: 0 } as QueryResult<unknown>;
      });

      const result = await orchestrator.rollbackJob('job-123', { limit: 500 });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // STATISTICS TESTS
  // ============================================================================

  describe('getModelDistribution', () => {
    it('should return model distribution for knowledge_base', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            model: 'text-embedding-3-small',
            entry_count: '500',
            percentage: '80.00',
            avg_version: '2.5',
            oldest_embedding: new Date('2024-01-01'),
            newest_embedding: new Date('2024-06-01'),
          },
          {
            model: 'text-embedding-ada-002',
            entry_count: '125',
            percentage: '20.00',
            avg_version: '1.0',
            oldest_embedding: new Date('2023-01-01'),
            newest_embedding: new Date('2023-12-01'),
          },
        ],
        rowCount: 2,
      } as QueryResult<{
        model: string;
        entry_count: string;
        percentage: string;
        avg_version: string;
        oldest_embedding: Date | null;
        newest_embedding: Date | null;
      }>);

      const distribution = await orchestrator.getModelDistribution('knowledge_base');

      expect(distribution).toHaveLength(2);
      expect(distribution[0]?.model).toBe('text-embedding-3-small');
      expect(distribution[0]?.entryCount).toBe(500);
      expect(distribution[0]?.percentage).toBe(80);
    });

    it('should return model distribution for message_embeddings', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<{
        model: string;
        entry_count: string;
        percentage: string;
        avg_version: string;
        oldest_embedding: Date | null;
        newest_embedding: Date | null;
      }>);

      const distribution = await orchestrator.getModelDistribution('message_embeddings');

      expect(Array.isArray(distribution)).toBe(true);
    });
  });

  describe('countEntriesForMigration', () => {
    it('should count entries needing migration', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '100' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const count = await orchestrator.countEntriesForMigration(
        'text-embedding-ada-002',
        'knowledge_base'
      );

      expect(count).toBe(100);
    });
  });

  describe('estimateMigrationCost', () => {
    it('should estimate migration cost', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '1000' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const estimate = await orchestrator.estimateMigrationCost(
        'text-embedding-ada-002',
        'text-embedding-3-small',
        'knowledge_base'
      );

      expect(estimate.entryCount).toBe(1000);
      expect(estimate.estimatedTokens).toBe(250000); // 1000 * 250 avg tokens
      expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
      expect(estimate.estimatedDurationMinutes).toBeGreaterThan(0);
    });

    it('should use default cost when model config not found', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ count: '500' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const estimate = await orchestrator.estimateMigrationCost(
        'text-embedding-ada-002',
        'text-embedding-3-small',
        'message_embeddings'
      );

      expect(estimate.entryCount).toBe(500);
      expect(estimate.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createEmbeddingMigrationOrchestrator', () => {
  it('should create orchestrator with pool only', () => {
    const mockPool = createMockPool();
    const orchestrator = createEmbeddingMigrationOrchestrator(mockPool);

    expect(orchestrator).toBeInstanceOf(EmbeddingMigrationOrchestrator);
  });

  it('should create orchestrator with all parameters', () => {
    const mockPool = createMockPool();
    const mockRegistry = createEmbeddingModelRegistry();
    const mockGenerator = createMockEmbeddingGenerator();

    const orchestrator = createEmbeddingMigrationOrchestrator(
      mockPool,
      mockRegistry,
      mockGenerator
    );

    expect(orchestrator).toBeInstanceOf(EmbeddingMigrationOrchestrator);
  });
});
