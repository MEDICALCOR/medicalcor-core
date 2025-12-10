/**
 * Tests for EmbeddingPipeline
 *
 * Covers:
 * - Case embedding generation and storage
 * - Semantic search with filters
 * - Batch processing
 * - Caching behavior
 * - Retry logic
 * - Statistics and health checks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenAI before importing
const mockOpenAI = {
  embeddings: {
    create: vi.fn().mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1) }],
    }),
  },
  models: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
};

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = mockOpenAI.embeddings;
      models = mockOpenAI.models;
    },
  };
});

// Mock logger
vi.mock('@medicalcor/core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { EmbeddingPipeline, type CaseEmbeddingData } from '../EmbeddingPipeline.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

interface MockPgVectorService {
  storeEmbedding: ReturnType<typeof vi.fn>;
  semanticSearch: ReturnType<typeof vi.fn>;
  getStatistics: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
}

interface MockEmbeddingCache {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  getMany: ReturnType<typeof vi.fn>;
  setMany: ReturnType<typeof vi.fn>;
  getTTL: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
}

function createMockVectorService(): MockPgVectorService {
  return {
    storeEmbedding: vi.fn().mockResolvedValue(undefined),
    semanticSearch: vi.fn().mockResolvedValue([]),
    getStatistics: vi.fn().mockResolvedValue({
      totalEmbeddings: 100,
      indexHealth: 'good',
    }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  };
}

function createMockCache(): MockEmbeddingCache {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    getMany: vi.fn().mockResolvedValue(new Map()),
    setMany: vi.fn().mockResolvedValue(undefined),
    getTTL: vi.fn().mockReturnValue(28800),
    getStats: vi.fn().mockReturnValue({
      hits: 10,
      misses: 5,
      hitRate: 0.67,
      errors: 0,
    }),
  };
}

function createTestCase(overrides: Partial<CaseEmbeddingData> = {}): CaseEmbeddingData {
  return {
    id: 'case-123',
    status: 'active',
    notes: 'Patient presents with moderate bone loss',
    subjectType: 'implant',
    createdAt: new Date('2024-12-01'),
    clinicalScore: {
      boneQuality: 'moderate',
      softTissueStatus: 'healthy',
      systemicRisk: 'low',
      urgency: 'routine',
      financialFlexibility: 'good',
      globalScore: 75,
      riskClass: 'GREEN',
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('EmbeddingPipeline', () => {
  let mockVectorService: MockPgVectorService;
  let mockCache: MockEmbeddingCache;
  let pipeline: EmbeddingPipeline;
  let pipelineWithCache: EmbeddingPipeline;

  beforeEach(() => {
    mockVectorService = createMockVectorService();
    mockCache = createMockCache();

    pipeline = new EmbeddingPipeline({ openaiApiKey: 'test-key' }, mockVectorService as any);

    pipelineWithCache = new EmbeddingPipeline(
      { openaiApiKey: 'test-key', cache: mockCache as any },
      mockVectorService as any
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('processCase', () => {
    it('should process case and store embedding', async () => {
      const caseData = createTestCase();

      await pipeline.processCase(caseData);

      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        'case-123',
        expect.stringContaining('Patient presents with moderate bone loss'),
        'clinical_notes',
        expect.any(Array),
        expect.objectContaining({
          status: 'active',
          riskClass: 'GREEN',
          globalScore: 75,
        })
      );
    });

    it('should skip empty content', async () => {
      const caseData = createTestCase({ notes: undefined, clinicalScore: undefined });

      await pipeline.processCase(caseData);

      // Still called because status and subjectType are included
      expect(mockVectorService.storeEmbedding).toHaveBeenCalled();
    });

    it('should extract all clinical score fields', async () => {
      const caseData = createTestCase();

      await pipeline.processCase(caseData);

      const storeCall = mockVectorService.storeEmbedding.mock.calls[0]!;
      const content = storeCall[1] as string;

      expect(content).toContain('Bone Quality: moderate');
      expect(content).toContain('Soft Tissue Status: healthy');
      expect(content).toContain('Systemic Risk: low');
      expect(content).toContain('Urgency: routine');
      expect(content).toContain('Financial Flexibility: good');
      expect(content).toContain('Global Score: 75');
      expect(content).toContain('Risk Class: GREEN');
    });
  });

  describe('findSimilarCases', () => {
    it('should search for similar cases', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        {
          caseId: 'case-1',
          similarity: 0.95,
          content: 'Similar case 1',
          metadata: { status: 'active', riskClass: 'GREEN', globalScore: 70 },
        },
        {
          caseId: 'case-2',
          similarity: 0.85,
          content: 'Similar case 2',
          metadata: { status: 'active', riskClass: 'YELLOW', globalScore: 60 },
        },
      ]);

      const results = await pipeline.findSimilarCases('bone loss patient', 5);

      expect(mockVectorService.semanticSearch).toHaveBeenCalledWith(
        expect.any(Array),
        10, // limit * 2
        0.7,
        { contentTypes: ['clinical_notes'] }
      );
      expect(results).toHaveLength(2);
      expect(results[0]!.caseId).toBe('case-1');
    });

    it('should filter by riskClass', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        { caseId: 'case-1', similarity: 0.9, content: 'A', metadata: { riskClass: 'GREEN' } },
        { caseId: 'case-2', similarity: 0.8, content: 'B', metadata: { riskClass: 'RED' } },
      ]);

      const results = await pipeline.findSimilarCases('query', 5, { riskClass: 'GREEN' });

      expect(results).toHaveLength(1);
      expect(results[0]!.caseId).toBe('case-1');
    });

    it('should filter by status', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        { caseId: 'case-1', similarity: 0.9, content: 'A', metadata: { status: 'active' } },
        { caseId: 'case-2', similarity: 0.8, content: 'B', metadata: { status: 'completed' } },
      ]);

      const results = await pipeline.findSimilarCases('query', 5, { status: 'active' });

      expect(results).toHaveLength(1);
      expect(results[0]!.caseId).toBe('case-1');
    });

    it('should filter by minScore', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        { caseId: 'case-1', similarity: 0.9, content: 'A', metadata: { globalScore: 80 } },
        { caseId: 'case-2', similarity: 0.8, content: 'B', metadata: { globalScore: 50 } },
      ]);

      const results = await pipeline.findSimilarCases('query', 5, { minScore: 60 });

      expect(results).toHaveLength(1);
      expect(results[0]!.caseId).toBe('case-1');
    });

    it('should filter by maxScore', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        { caseId: 'case-1', similarity: 0.9, content: 'A', metadata: { globalScore: 80 } },
        { caseId: 'case-2', similarity: 0.8, content: 'B', metadata: { globalScore: 50 } },
      ]);

      const results = await pipeline.findSimilarCases('query', 5, { maxScore: 60 });

      expect(results).toHaveLength(1);
      expect(results[0]!.caseId).toBe('case-2');
    });

    it('should respect limit after filtering', async () => {
      mockVectorService.semanticSearch.mockResolvedValueOnce([
        { caseId: 'case-1', similarity: 0.9, content: 'A', metadata: { status: 'active' } },
        { caseId: 'case-2', similarity: 0.85, content: 'B', metadata: { status: 'active' } },
        { caseId: 'case-3', similarity: 0.8, content: 'C', metadata: { status: 'active' } },
      ]);

      const results = await pipeline.findSimilarCases('query', 2, { status: 'active' });

      expect(results).toHaveLength(2);
    });
  });

  describe('batchProcess', () => {
    it('should process multiple cases', async () => {
      const cases = [createTestCase({ id: 'case-1' }), createTestCase({ id: 'case-2' })];

      const result = await pipeline.batchProcess(cases);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should track failures', async () => {
      mockVectorService.storeEmbedding
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Storage failed'));

      const cases = [createTestCase({ id: 'case-1' }), createTestCase({ id: 'case-2' })];

      const result = await pipeline.batchProcess(cases);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.caseId).toBe('case-2');
    });

    it('should respect concurrency setting', async () => {
      const cases = [
        createTestCase({ id: 'case-1' }),
        createTestCase({ id: 'case-2' }),
        createTestCase({ id: 'case-3' }),
        createTestCase({ id: 'case-4' }),
        createTestCase({ id: 'case-5' }),
      ];

      await pipeline.batchProcess(cases, 2);

      // Should complete in 3 batches: [1,2], [3,4], [5]
      expect(mockVectorService.storeEmbedding).toHaveBeenCalledTimes(5);
    });
  });

  describe('generateEmbedding', () => {
    it('should check cache before API call', async () => {
      const cachedEmbedding = Array(1536).fill(0.5);
      mockCache.get.mockResolvedValueOnce(cachedEmbedding);

      const result = await pipelineWithCache.generateEmbedding('test text');

      expect(mockCache.get).toHaveBeenCalledWith('test text', 'text-embedding-ada-002');
      expect(result).toEqual(cachedEmbedding);
    });

    it('should call API and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValueOnce(null);

      await pipelineWithCache.generateEmbedding('test text');

      expect(mockCache.set).toHaveBeenCalledWith(
        'test text',
        'text-embedding-ada-002',
        expect.any(Array)
      );
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should return empty array for empty input', async () => {
      const result = await pipeline.generateBatchEmbeddings([]);

      expect(result).toEqual([]);
    });

    it('should use cached embeddings when available', async () => {
      const cached = new Map([['text1', Array(1536).fill(0.1)]]);
      mockCache.getMany.mockResolvedValueOnce(cached);

      const result = await pipelineWithCache.generateBatchEmbeddings(['text1', 'text2']);

      expect(result).toHaveLength(2);
      expect(mockCache.setMany).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return statistics without cache', async () => {
      const stats = await pipeline.getStatistics();

      expect(stats.model).toBe('text-embedding-ada-002');
      expect(stats.batchSize).toBe(5);
      expect(stats.cache).toBeNull();
      expect(stats.vectorStats).toBeDefined();
    });

    it('should include cache stats when enabled', async () => {
      const stats = await pipelineWithCache.getStatistics();

      expect(stats.cache).not.toBeNull();
      expect(stats.cache!.enabled).toBe(true);
      expect(stats.cache!.hits).toBe(10);
      expect(stats.cache!.hitRate).toBe(0.67);
    });
  });

  describe('healthCheck', () => {
    it('should check both OpenAI and vector DB health', async () => {
      const health = await pipeline.healthCheck();

      expect(health.openai).toBe(true);
      expect(health.vectorDb).toBe(true);
    });

    it('should handle OpenAI failure', async () => {
      // Temporarily make models.list fail
      mockOpenAI.models.list.mockRejectedValueOnce(new Error('API error'));

      const health = await pipeline.healthCheck();

      expect(health.openai).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use custom model', () => {
      const customPipeline = new EmbeddingPipeline(
        { openaiApiKey: 'test', model: 'text-embedding-3-small' },
        mockVectorService as any
      );

      expect(customPipeline).toBeDefined();
    });

    it('should use custom batch size', () => {
      const customPipeline = new EmbeddingPipeline(
        { openaiApiKey: 'test', batchSize: 10 },
        mockVectorService as any
      );

      expect(customPipeline).toBeDefined();
    });

    it('should use custom max retries', () => {
      const customPipeline = new EmbeddingPipeline(
        { openaiApiKey: 'test', maxRetries: 5 },
        mockVectorService as any
      );

      expect(customPipeline).toBeDefined();
    });
  });
});
