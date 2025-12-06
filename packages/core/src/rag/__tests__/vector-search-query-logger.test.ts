/**
 * @fileoverview Tests for Vector Search Query Logger
 *
 * M4: Tests for query logging, error tracking, and performance monitoring
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VectorSearchQueryLogger,
  QueryTimer,
  createVectorSearchQueryLogger,
  type VectorSearchQueryLogEntry,
  type VectorSearchQueryLoggerConfig,
} from '../vector-search-query-logger.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool() {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ id: 'test-query-id' }] }),
  };
  return mockPool;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function createSampleLogEntry(
  overrides: Partial<VectorSearchQueryLogEntry> = {}
): VectorSearchQueryLogEntry {
  return {
    queryText: 'test query about dental implants',
    searchType: 'hybrid',
    topK: 5,
    similarityThreshold: 0.7,
    filters: {
      clinicId: 'clinic-123',
      language: 'ro',
    },
    resultCount: 3,
    resultIds: ['doc-1', 'doc-2', 'doc-3'],
    resultScores: [0.92, 0.87, 0.75],
    embeddingLatencyMs: 50,
    searchLatencyMs: 25,
    totalLatencyMs: 80,
    correlationId: 'corr-123',
    useCase: 'scoring',
    ...overrides,
  };
}

// ============================================================================
// VECTOR SEARCH QUERY LOGGER TESTS
// ============================================================================

describe('VectorSearchQueryLogger', () => {
  let logger: VectorSearchQueryLogger;
  let mockPool: ReturnType<typeof createMockPool>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockPool = createMockPool();
    mockLogger = createMockLogger();
    logger = new VectorSearchQueryLogger(
      mockPool as unknown as import('pg').Pool,
      {},
      mockLogger as unknown as import('pino').Logger
    );
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      const config = logger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.logLevel).toBe('info');
      expect(config.persistToDatabase).toBe(true);
      expect(config.logToConsole).toBe(true);
      expect(config.includeEmbeddings).toBe(false);
      expect(config.slowQueryThresholdMs).toBe(500);
      expect(config.errorSamplingRate).toBe(1.0);
    });

    it('should create logger with custom config', () => {
      const customConfig: Partial<VectorSearchQueryLoggerConfig> = {
        slowQueryThresholdMs: 1000,
        includeEmbeddings: true,
        errorSamplingRate: 0.5,
      };

      const customLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        customConfig,
        mockLogger as unknown as import('pino').Logger
      );
      const config = customLogger.getConfig();

      expect(config.slowQueryThresholdMs).toBe(1000);
      expect(config.includeEmbeddings).toBe(true);
      expect(config.errorSamplingRate).toBe(0.5);
    });
  });

  describe('logQuery', () => {
    it('should log a successful query', async () => {
      const entry = createSampleLogEntry();

      const queryId = await logger.logQuery(entry);

      expect(queryId).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should return null when logging is disabled', async () => {
      const disabledLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { enabled: false },
        mockLogger as unknown as import('pino').Logger
      );

      const queryId = await disabledLogger.logQuery(createSampleLogEntry());

      expect(queryId).toBeNull();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should not persist to database when persistToDatabase is false', async () => {
      const consoleOnlyLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { persistToDatabase: false },
        mockLogger as unknown as import('pino').Logger
      );

      await consoleOnlyLogger.logQuery(createSampleLogEntry());

      expect(mockPool.query).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should not log to console when logToConsole is false', async () => {
      const dbOnlyLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { logToConsole: false },
        mockLogger as unknown as import('pino').Logger
      );

      await dbOnlyLogger.logQuery(createSampleLogEntry());

      expect(mockPool.query).toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should calculate result statistics', async () => {
      const entry = createSampleLogEntry({
        resultScores: [0.9, 0.8, 0.7],
      });

      await logger.logQuery(entry);

      // The entry should be enriched with stats before persistence
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should detect slow queries', async () => {
      const slowEntry = createSampleLogEntry({
        totalLatencyMs: 600, // Above default 500ms threshold
      });

      await logger.logQuery(slowEntry);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const queryId = await logger.logQuery(createSampleLogEntry());

      // Should still return a query ID
      expect(queryId).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('logError', () => {
    it('should log search errors', async () => {
      const error = new Error('Timeout during embedding generation');

      await logger.logError('test query', error, {
        searchType: 'semantic',
        topK: 5,
        correlationId: 'corr-456',
      });

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should not log errors when disabled', async () => {
      const disabledLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { enabled: false },
        mockLogger as unknown as import('pino').Logger
      );

      await disabledLogger.logError('test query', new Error('test'), {});

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should classify errors correctly', async () => {
      const timeoutError = new Error('Connection timeout exceeded');
      await logger.logError('query1', timeoutError, {});

      const embeddingError = new Error('Failed to generate embedding');
      await logger.logError('query2', embeddingError, {});

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should apply error sampling rate', async () => {
      const sampledLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { errorSamplingRate: 0 }, // Never sample
        mockLogger as unknown as import('pino').Logger
      );

      await sampledLogger.logError('test query', new Error('test'), {});

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('logSlowQuery', () => {
    it('should log slow queries above threshold', () => {
      const slowEntry = createSampleLogEntry({
        totalLatencyMs: 600,
      });

      logger.logSlowQuery(slowEntry);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should not log queries below threshold', () => {
      const fastEntry = createSampleLogEntry({
        totalLatencyMs: 100,
      });

      logger.logSlowQuery(fastEntry);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should respect custom threshold', () => {
      const customLogger = new VectorSearchQueryLogger(
        mockPool as unknown as import('pg').Pool,
        { slowQueryThresholdMs: 200 },
        mockLogger as unknown as import('pino').Logger
      );

      customLogger.logSlowQuery(createSampleLogEntry({ totalLatencyMs: 250 }));

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('createQueryTimer', () => {
    it('should create a new QueryTimer', () => {
      const timer = logger.createQueryTimer();

      expect(timer).toBeInstanceOf(QueryTimer);
    });
  });

  describe('calculateQueryComplexity', () => {
    it('should calculate complexity for simple query', () => {
      const complexity = logger.calculateQueryComplexity('dental implants', {}, 'semantic');

      expect(complexity.wordCount).toBe(2);
      expect(complexity.tokenCount).toBeGreaterThan(0);
      expect(complexity.hasFilters).toBe(false);
      expect(complexity.filterCount).toBe(0);
      expect(complexity.isHybrid).toBe(false);
    });

    it('should calculate complexity for hybrid query with filters', () => {
      const complexity = logger.calculateQueryComplexity(
        'all-on-4 dental implant procedure cost',
        {
          clinicId: 'clinic-1',
          language: 'ro',
          sourceTypes: ['faq', 'pricing_info'],
        },
        'hybrid'
      );

      expect(complexity.wordCount).toBe(5);
      expect(complexity.hasFilters).toBe(true);
      expect(complexity.filterCount).toBe(3);
      expect(complexity.isHybrid).toBe(true);
    });
  });

  describe('calculateResultStats', () => {
    it('should calculate stats for results', () => {
      const stats = logger.calculateResultStats([0.9, 0.8, 0.7, 0.6, 0.5]);

      expect(stats.avg).toBeCloseTo(0.7, 5);
      expect(stats.min).toBe(0.5);
      expect(stats.max).toBe(0.9);
    });

    it('should handle empty results', () => {
      const stats = logger.calculateResultStats([]);

      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('should handle single result', () => {
      const stats = logger.calculateResultStats([0.85]);

      expect(stats.avg).toBe(0.85);
      expect(stats.min).toBe(0.85);
      expect(stats.max).toBe(0.85);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      logger.updateConfig({ slowQueryThresholdMs: 1000 });

      const config = logger.getConfig();
      expect(config.slowQueryThresholdMs).toBe(1000);
    });

    it('should merge with existing config', () => {
      logger.updateConfig({ slowQueryThresholdMs: 1000 });
      logger.updateConfig({ errorSamplingRate: 0.5 });

      const config = logger.getConfig();
      expect(config.slowQueryThresholdMs).toBe(1000);
      expect(config.errorSamplingRate).toBe(0.5);
    });
  });
});

// ============================================================================
// QUERY TIMER TESTS
// ============================================================================

describe('QueryTimer', () => {
  it('should track total latency', async () => {
    const timer = new QueryTimer();

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 10));

    const metrics = timer.getMetrics();
    expect(metrics.totalLatencyMs).toBeGreaterThan(0);
  });

  it('should track embedding latency', async () => {
    const timer = new QueryTimer();

    timer.startEmbedding();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.endEmbedding();

    const metrics = timer.getMetrics();
    expect(metrics.embeddingLatencyMs).toBeGreaterThan(0);
  });

  it('should track search latency', async () => {
    const timer = new QueryTimer();

    timer.startSearch();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.endSearch();

    const metrics = timer.getMetrics();
    expect(metrics.searchLatencyMs).toBeGreaterThan(0);
  });

  it('should return undefined for untracked phases', () => {
    const timer = new QueryTimer();

    const metrics = timer.getMetrics();
    expect(metrics.embeddingLatencyMs).toBeUndefined();
    expect(metrics.searchLatencyMs).toBeUndefined();
  });

  it('should track all phases together', async () => {
    const timer = new QueryTimer();

    timer.startEmbedding();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.endEmbedding();

    timer.startSearch();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.endSearch();

    const metrics = timer.getMetrics();
    expect(metrics.embeddingLatencyMs).toBeGreaterThan(0);
    expect(metrics.searchLatencyMs).toBeGreaterThan(0);
    expect(metrics.totalLatencyMs).toBeGreaterThanOrEqual(
      (metrics.embeddingLatencyMs ?? 0) + (metrics.searchLatencyMs ?? 0)
    );
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createVectorSearchQueryLogger', () => {
  it('should create a logger with default config', () => {
    const mockPool = createMockPool();
    const logger = createVectorSearchQueryLogger(mockPool as unknown as import('pg').Pool);

    expect(logger).toBeInstanceOf(VectorSearchQueryLogger);
    expect(logger.getConfig().enabled).toBe(true);
  });

  it('should create a logger with custom config', () => {
    const mockPool = createMockPool();
    const logger = createVectorSearchQueryLogger(mockPool as unknown as import('pg').Pool, {
      slowQueryThresholdMs: 200,
    });

    expect(logger.getConfig().slowQueryThresholdMs).toBe(200);
  });
});
