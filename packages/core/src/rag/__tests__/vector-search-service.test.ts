/**
 * @fileoverview Tests for Vector Search Service
 *
 * Tests semantic search, hybrid search, and specialized search operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VectorSearchService,
  createVectorSearchService,
  type VectorSearchConfig,
} from '../vector-search-service.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool() {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    _mockClient: mockClient,
  };

  return mockPool;
}

function createMockSearchResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'kb-123',
    source_type: 'faq',
    source_id: null,
    title: 'Test FAQ',
    content: 'Test content for search',
    content_hash: 'abc123',
    chunk_index: 0,
    chunk_total: 1,
    parent_id: null,
    embedding: '[0.1,0.2,0.3]',
    clinic_id: null,
    language: 'ro',
    tags: ['test'],
    metadata: { category: 'test' },
    version: 1,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    similarity: '0.85',
    ...overrides,
  };
}

function createMockHybridResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'kb-123',
    source_type: 'faq',
    source_id: null,
    title: 'Test FAQ',
    content: 'Test content',
    clinic_id: null,
    metadata: { category: 'test' },
    semantic_score: '0.85',
    keyword_score: '0.65',
    combined_score: '0.79',
    ...overrides,
  };
}

// ============================================================================
// VECTOR SEARCH SERVICE TESTS
// ============================================================================

describe('VectorSearchService', () => {
  let service: VectorSearchService;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    mockPool = createMockPool();
    service = new VectorSearchService(mockPool as unknown as import('pg').Pool);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const config = service.getConfig();

      expect(config.defaultTopK).toBe(5);
      expect(config.defaultSimilarityThreshold).toBe(0.7);
      expect(config.defaultSemanticWeight).toBe(0.7);
      expect(config.defaultKeywordWeight).toBe(0.3);
      expect(config.maxResults).toBe(100);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<VectorSearchConfig> = {
        defaultTopK: 10,
        defaultSimilarityThreshold: 0.8,
        maxResults: 50,
      };

      const customService = new VectorSearchService(
        mockPool as unknown as import('pg').Pool,
        customConfig
      );
      const config = customService.getConfig();

      expect(config.defaultTopK).toBe(10);
      expect(config.defaultSimilarityThreshold).toBe(0.8);
      expect(config.maxResults).toBe(50);
    });
  });

  describe('semanticSearch', () => {
    it('should perform semantic search', async () => {
      const mockResults = [
        createMockSearchResult({ id: 'kb-1', similarity: '0.9' }),
        createMockSearchResult({ id: 'kb-2', similarity: '0.85' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockResults });

      const result = await service.semanticSearch([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('semantic');
      expect(result.results).toHaveLength(2);
      expect(result.query).toBe('test query');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use custom options', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.semanticSearch([0.1, 0.2, 0.3], 'test query', {
        topK: 10,
        similarityThreshold: 0.8,
        includeMetadata: false,
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.semanticSearch([0.1, 0.2, 0.3], 'test query', {
        filters: { sourceType: 'faq', clinicId: 'clinic-123' },
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should respect maxResults limit', async () => {
      const customService = new VectorSearchService(mockPool as unknown as import('pg').Pool, {
        maxResults: 10,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await customService.semanticSearch([0.1, 0.2, 0.3], 'test', {
        topK: 100, // Request more than maxResults
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('hybridSearch', () => {
    it('should perform hybrid search', async () => {
      const mockResults = [createMockHybridResult()];
      mockPool.query.mockResolvedValueOnce({ rows: mockResults });

      const result = await service.hybridSearch([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('hybrid');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].combinedScore).toBeDefined();
    });

    it('should use custom weights', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.hybridSearch([0.1, 0.2, 0.3], 'test query', {
        semanticWeight: 0.9,
        keywordWeight: 0.1,
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.hybridSearch([0.1, 0.2, 0.3], 'test query', {
        filters: { sourceType: 'clinic_protocol' },
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should default to hybrid search', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.search([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('hybrid');
    });

    it('should use semantic search when specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.search([0.1, 0.2, 0.3], 'test query', {
        type: 'semantic',
      });

      expect(result.searchType).toBe('semantic');
    });

    it('should use hybrid search when specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.search([0.1, 0.2, 0.3], 'test query', {
        type: 'hybrid',
      });

      expect(result.searchType).toBe('hybrid');
    });
  });

  describe('searchByType', () => {
    it('should search by source types', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchByType([0.1, 0.2, 0.3], 'test query', ['faq', 'clinic_protocol']);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should pass additional options', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchByType([0.1, 0.2, 0.3], 'test query', ['faq'], {
        topK: 3,
        similarityThreshold: 0.8,
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('searchFAQs', () => {
    it('should search FAQs specifically', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchFAQs([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('hybrid');
    });

    it('should filter by language', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchFAQs([0.1, 0.2, 0.3], 'test query', 'en');

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should work with Romanian language', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchFAQs([0.1, 0.2, 0.3], 'întrebare test', 'ro');

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should work with German language', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchFAQs([0.1, 0.2, 0.3], 'testfrage', 'de');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('searchProtocols', () => {
    it('should search clinic protocols', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchProtocols([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('semantic');
    });

    it('should filter by clinic ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchProtocols([0.1, 0.2, 0.3], 'test query', 'clinic-123');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('searchForScoring', () => {
    it('should search for scoring context', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchForScoring([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('hybrid');
    });

    it('should filter by clinic ID and language', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchForScoring([0.1, 0.2, 0.3], 'test query', 'clinic-456', 'ro');

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should work without optional parameters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchForScoring([0.1, 0.2, 0.3], 'test query', undefined, 'en');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('searchForReply', () => {
    it('should search for reply generation context', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchForReply([0.1, 0.2, 0.3], 'test query');

      expect(result.searchType).toBe('hybrid');
    });

    it('should filter by clinic ID and language', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.searchForReply([0.1, 0.2, 0.3], 'test query', 'clinic-789', 'de');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });

  describe('getRepository', () => {
    it('should return the underlying repository', () => {
      const repository = service.getRepository();

      expect(repository).toBeDefined();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createVectorSearchService', () => {
  it('should create a service with default config', () => {
    const mockPool = createMockPool();
    const service = createVectorSearchService(mockPool as unknown as import('pg').Pool);

    expect(service).toBeInstanceOf(VectorSearchService);
  });

  it('should create a service with custom config', () => {
    const mockPool = createMockPool();
    const service = createVectorSearchService(mockPool as unknown as import('pg').Pool, {
      defaultTopK: 20,
      maxResults: 200,
    });

    const config = service.getConfig();
    expect(config.defaultTopK).toBe(20);
    expect(config.maxResults).toBe(200);
  });
});
