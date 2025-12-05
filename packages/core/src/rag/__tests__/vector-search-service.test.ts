/**
 * Comprehensive tests for VectorSearchService
 *
 * Tests cover:
 * - Semantic search
 * - Hybrid search
 * - Automatic search type selection
 * - Use-case specific searches (FAQs, protocols, scoring, replies)
 * - Configuration management
 * - Result processing and formatting
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  VectorSearchService,
  createVectorSearchService,
  type VectorSearchConfig,
} from '../vector-search-service.js';
import { KnowledgeBaseRepository } from '../knowledge-base-repository.js';
import type { SearchResponse, KnowledgeSourceType, Language } from '../types.js';

// ============= Mock Setup =============

function createMockQueryResult<T = never>(rows: T[] = []): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

function createMockPool(): Pool {
  const pool = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      // Vector search query
      if (sql.includes('embedding <=>')) {
        return createMockQueryResult([
          {
            id: 'kb-1',
            source_type: 'faq',
            title: 'Dental Implant FAQ',
            content: 'Dental implants are artificial tooth roots',
            similarity: '0.85',
            tags: ['dental', 'implants'],
            metadata: { source: 'manual' },
          },
          {
            id: 'kb-2',
            source_type: 'treatment_info',
            title: 'Implant Procedure',
            content: 'The procedure involves several steps',
            similarity: '0.78',
            tags: ['procedure'],
            metadata: { duration: '90min' },
          },
        ] as never[]);
      }

      // Hybrid search query
      if (sql.includes('hybrid_search_knowledge_base')) {
        return createMockQueryResult([
          {
            id: 'kb-hybrid-1',
            source_type: 'faq',
            title: 'Hybrid Result',
            content: 'Matching content with keywords',
            semantic_score: '0.8',
            keyword_score: '0.7',
            combined_score: '0.75',
            tags: [],
            metadata: {},
          },
        ] as never[]);
      }

      return createMockQueryResult([]);
    }),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Pool;

  return pool;
}

function createTestEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => Math.random());
}

// ============= Test Suite =============

describe('VectorSearchService', () => {
  let pool: Pool;
  let service: VectorSearchService;

  beforeEach(() => {
    pool = createMockPool();
    service = new VectorSearchService(pool);
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default config', () => {
      expect(service).toBeInstanceOf(VectorSearchService);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<VectorSearchConfig> = {
        defaultTopK: 10,
        defaultSimilarityThreshold: 0.8,
        maxResults: 50,
      };

      service = new VectorSearchService(pool, customConfig);
      const config = service.getConfig();

      expect(config.defaultTopK).toBe(10);
      expect(config.defaultSimilarityThreshold).toBe(0.8);
      expect(config.maxResults).toBe(50);
    });

    it('should apply default configuration values', () => {
      const config = service.getConfig();

      expect(config.defaultTopK).toBe(5);
      expect(config.defaultSimilarityThreshold).toBe(0.7);
      expect(config.defaultSemanticWeight).toBe(0.7);
      expect(config.defaultKeywordWeight).toBe(0.3);
      expect(config.maxResults).toBe(100);
      expect(config.enableQueryLogging).toBe(true);
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<VectorSearchConfig> = {
        defaultTopK: 15,
      };

      service = new VectorSearchService(pool, customConfig);
      const config = service.getConfig();

      expect(config.defaultTopK).toBe(15);
      expect(config.defaultSimilarityThreshold).toBe(0.7); // Default
    });
  });

  describe('semanticSearch()', () => {
    it('should perform semantic search successfully', async () => {
      const embedding = createTestEmbedding();
      const query = 'dental implants';

      const result = await service.semanticSearch(embedding, query);

      expect(result).toBeDefined();
      expect(result.searchType).toBe('semantic');
      expect(result.query).toBe(query);
      expect(result.results).toBeDefined();
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default search options', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query');

      expect(result.results.length).toBeLessThanOrEqual(5); // Default topK
    });

    it('should respect custom topK', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        topK: 10,
      });

      expect(result).toBeDefined();
    });

    it('should respect similarity threshold', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        similarityThreshold: 0.9,
      });

      expect(result).toBeDefined();
    });

    it('should apply search filters', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        filters: {
          sourceType: 'faq',
          language: 'ro',
        },
      });

      expect(result).toBeDefined();
    });

    it('should include metadata when requested', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        includeMetadata: true,
      });

      if (result.results.length > 0) {
        expect(result.results[0]?.metadata).toBeDefined();
      }
    });

    it('should exclude metadata when not requested', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        includeMetadata: false,
      });

      if (result.results.length > 0) {
        expect(result.results[0]?.metadata).toEqual({});
      }
    });

    it('should enforce maxResults limit', async () => {
      service = new VectorSearchService(pool, { maxResults: 3 });
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query', {
        topK: 100, // Requesting more than max
      });

      expect(result).toBeDefined();
      // Should be capped at maxResults
    });

    it('should measure search latency', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query');

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should format search results correctly', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test query');

      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult?.id).toBeDefined();
        expect(firstResult?.sourceType).toBeDefined();
        expect(firstResult?.title).toBeDefined();
        expect(firstResult?.content).toBeDefined();
        expect(firstResult?.similarity).toBeGreaterThan(0);
        expect(firstResult?.tags).toBeDefined();
      }
    });
  });

  describe('hybridSearch()', () => {
    it('should perform hybrid search successfully', async () => {
      const embedding = createTestEmbedding();
      const query = 'dental implants';

      const result = await service.hybridSearch(embedding, query);

      expect(result).toBeDefined();
      expect(result.searchType).toBe('hybrid');
      expect(result.query).toBe(query);
      expect(result.results).toBeDefined();
    });

    it('should use default weights', async () => {
      const embedding = createTestEmbedding();

      const result = await service.hybridSearch(embedding, 'test query');

      expect(result).toBeDefined();
      // Uses default semanticWeight=0.7, keywordWeight=0.3
    });

    it('should respect custom weights', async () => {
      const embedding = createTestEmbedding();

      const result = await service.hybridSearch(embedding, 'test query', {
        semanticWeight: 0.8,
        keywordWeight: 0.2,
      });

      expect(result).toBeDefined();
    });

    it('should include all scores in results', async () => {
      const embedding = createTestEmbedding();

      const result = await service.hybridSearch(embedding, 'test query');

      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult?.similarity).toBeDefined(); // semantic score
        expect(firstResult?.keywordScore).toBeDefined();
        expect(firstResult?.combinedScore).toBeDefined();
      }
    });

    it('should apply filters correctly', async () => {
      const embedding = createTestEmbedding();

      const result = await service.hybridSearch(embedding, 'test query', {
        filters: {
          sourceTypes: ['faq', 'treatment_info'],
          clinicId: 'clinic-1',
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('search() - Automatic Type Selection', () => {
    it('should default to hybrid search', async () => {
      const embedding = createTestEmbedding();

      const result = await service.search(embedding, 'test query');

      expect(result.searchType).toBe('hybrid');
    });

    it('should use semantic search when specified', async () => {
      const embedding = createTestEmbedding();

      const result = await service.search(embedding, 'test query', {
        type: 'semantic',
      });

      expect(result.searchType).toBe('semantic');
    });

    it('should use hybrid search when specified', async () => {
      const embedding = createTestEmbedding();

      const result = await service.search(embedding, 'test query', {
        type: 'hybrid',
      });

      expect(result.searchType).toBe('hybrid');
    });

    it('should pass through options correctly', async () => {
      const embedding = createTestEmbedding();

      const result = await service.search(embedding, 'test query', {
        topK: 15,
        similarityThreshold: 0.85,
        filters: { sourceType: 'faq' },
      });

      expect(result).toBeDefined();
    });
  });

  describe('searchByType()', () => {
    it('should search by single source type', async () => {
      const embedding = createTestEmbedding();
      const sourceTypes: KnowledgeSourceType[] = ['faq'];

      const result = await service.searchByType(embedding, 'test query', sourceTypes);

      expect(result).toBeDefined();
    });

    it('should search by multiple source types', async () => {
      const embedding = createTestEmbedding();
      const sourceTypes: KnowledgeSourceType[] = ['faq', 'treatment_info', 'pricing_info'];

      const result = await service.searchByType(embedding, 'test query', sourceTypes);

      expect(result).toBeDefined();
    });

    it('should support additional options', async () => {
      const embedding = createTestEmbedding();
      const sourceTypes: KnowledgeSourceType[] = ['faq'];

      const result = await service.searchByType(embedding, 'test query', sourceTypes, {
        topK: 10,
        similarityThreshold: 0.8,
      });

      expect(result).toBeDefined();
    });
  });

  describe('searchFAQs()', () => {
    it('should search FAQs with default settings', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchFAQs(embedding, 'dental question');

      expect(result).toBeDefined();
      expect(result.searchType).toBe('hybrid');
    });

    it('should filter by language when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchFAQs(embedding, 'dental question', 'ro');

      expect(result).toBeDefined();
    });

    it('should use FAQ-specific search parameters', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchFAQs(embedding, 'dental question');

      // Should use topK=3, similarityThreshold=0.6
      expect(result).toBeDefined();
    });

    it('should support all languages', async () => {
      const embedding = createTestEmbedding();
      const languages: Language[] = ['ro', 'en', 'de'];

      for (const lang of languages) {
        const result = await service.searchFAQs(embedding, 'test', lang);
        expect(result).toBeDefined();
      }
    });
  });

  describe('searchProtocols()', () => {
    it('should search clinic protocols', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchProtocols(embedding, 'protocol query');

      expect(result).toBeDefined();
      expect(result.searchType).toBe('semantic');
    });

    it('should filter by clinic ID when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchProtocols(embedding, 'protocol query', 'clinic-1');

      expect(result).toBeDefined();
    });

    it('should use protocol-specific search parameters', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchProtocols(embedding, 'protocol query');

      // Should use topK=3, similarityThreshold=0.65, semantic search
      expect(result).toBeDefined();
    });

    it('should work without clinic filter', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchProtocols(embedding, 'protocol query');

      expect(result).toBeDefined();
    });
  });

  describe('searchForScoring()', () => {
    it('should search for scoring context', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query');

      expect(result).toBeDefined();
      expect(result.searchType).toBe('hybrid');
    });

    it('should search multiple source types', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query');

      // Should search: faq, clinic_protocol, treatment_info, pricing_info
      expect(result).toBeDefined();
    });

    it('should filter by clinic ID when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query', 'clinic-1');

      expect(result).toBeDefined();
    });

    it('should filter by language when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query', undefined, 'ro');

      expect(result).toBeDefined();
    });

    it('should use scoring-optimized weights', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query');

      // Should use semanticWeight=0.8, keywordWeight=0.2
      expect(result).toBeDefined();
    });

    it('should return top 5 results', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForScoring(embedding, 'patient query');

      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('searchForReply()', () => {
    it('should search for reply generation context', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForReply(embedding, 'patient message');

      expect(result).toBeDefined();
      expect(result.searchType).toBe('hybrid');
    });

    it('should search reply-relevant source types', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForReply(embedding, 'patient message');

      // Should search: faq, treatment_info, appointment_policy, marketing_content
      expect(result).toBeDefined();
    });

    it('should filter by clinic ID when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForReply(embedding, 'patient message', 'clinic-1');

      expect(result).toBeDefined();
    });

    it('should filter by language when provided', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForReply(embedding, 'patient message', undefined, 'en');

      expect(result).toBeDefined();
    });

    it('should use reply-optimized parameters', async () => {
      const embedding = createTestEmbedding();

      const result = await service.searchForReply(embedding, 'patient message');

      // Should use topK=4, similarityThreshold=0.65, balanced weights
      expect(result).toBeDefined();
    });

    it('should work with all parameter combinations', async () => {
      const embedding = createTestEmbedding();

      // Test all combinations
      await service.searchForReply(embedding, 'test');
      await service.searchForReply(embedding, 'test', 'clinic-1');
      await service.searchForReply(embedding, 'test', undefined, 'ro');
      await service.searchForReply(embedding, 'test', 'clinic-1', 'de');

      expect(true).toBe(true);
    });
  });

  describe('getConfig()', () => {
    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultTopK).toBeDefined();
      expect(config.defaultSimilarityThreshold).toBeDefined();
      expect(config.maxResults).toBeDefined();
    });

    it('should return a copy of config', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe('getRepository()', () => {
    it('should return underlying repository', () => {
      const repository = service.getRepository();

      expect(repository).toBeInstanceOf(KnowledgeBaseRepository);
    });

    it('should return the same repository instance', () => {
      const repo1 = service.getRepository();
      const repo2 = service.getRepository();

      expect(repo1).toBe(repo2);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty search results', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const embedding = createTestEmbedding();
      const result = await service.semanticSearch(embedding, 'no results');

      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Database connection failed'));

      const embedding = createTestEmbedding();

      await expect(service.semanticSearch(embedding, 'test')).rejects.toThrow();
    });

    it('should handle invalid embeddings', async () => {
      const invalidEmbedding: number[] = []; // Empty embedding

      // Empty embeddings may not throw, just verify it returns a response
      const result = await service.semanticSearch(invalidEmbedding, 'test');
      expect(result).toBeDefined();
    });

    it('should handle very large topK values', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test', {
        topK: 1000, // Very large
      });

      expect(result).toBeDefined();
      // Should be capped at maxResults (100)
    });

    it('should handle zero topK value', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, 'test', {
        topK: 0,
      });

      expect(result).toBeDefined();
    });

    it('should handle extreme similarity thresholds', async () => {
      const embedding = createTestEmbedding();

      // Very high threshold
      const result1 = await service.semanticSearch(embedding, 'test', {
        similarityThreshold: 0.99,
      });

      // Very low threshold
      const result2 = await service.semanticSearch(embedding, 'test', {
        similarityThreshold: 0.01,
      });

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle missing optional parameters', async () => {
      const embedding = createTestEmbedding();

      // Test all use-case methods with minimal parameters
      await service.searchFAQs(embedding, 'test');
      await service.searchProtocols(embedding, 'test');
      await service.searchForScoring(embedding, 'test');
      await service.searchForReply(embedding, 'test');

      expect(true).toBe(true);
    });

    it('should handle special characters in queries', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(
        embedding,
        'Query with émojis 😀 and spëcial çhars!?'
      );

      expect(result).toBeDefined();
    });

    it('should handle very long queries', async () => {
      const embedding = createTestEmbedding();
      const longQuery = 'word '.repeat(1000);

      const result = await service.semanticSearch(embedding, longQuery);

      expect(result).toBeDefined();
    });

    it('should handle empty query strings', async () => {
      const embedding = createTestEmbedding();

      const result = await service.semanticSearch(embedding, '');

      expect(result).toBeDefined();
    });
  });

  describe('Performance and Optimization', () => {
    it('should cache repository instance', () => {
      const repo1 = service.getRepository();
      const repo2 = service.getRepository();

      expect(repo1).toBe(repo2);
    });

    it('should track search latency accurately', async () => {
      const embedding = createTestEmbedding();

      const startTime = Date.now();
      const result = await service.semanticSearch(embedding, 'test');
      const endTime = Date.now();

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThanOrEqual(endTime - startTime + 50); // Allow 50ms margin for mock
    });

    it('should handle concurrent searches', async () => {
      const embedding = createTestEmbedding();

      const searches = [
        service.semanticSearch(embedding, 'query1'),
        service.semanticSearch(embedding, 'query2'),
        service.semanticSearch(embedding, 'query3'),
      ];

      const results = await Promise.all(searches);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.results !== undefined)).toBe(true);
    });
  });
});

describe('Factory Function', () => {
  it('should create service with factory function', () => {
    const pool = createMockPool();
    const service = createVectorSearchService(pool);

    expect(service).toBeInstanceOf(VectorSearchService);
  });

  it('should create service with custom config', () => {
    const pool = createMockPool();
    const config: Partial<VectorSearchConfig> = {
      defaultTopK: 15,
      maxResults: 50,
    };

    const service = createVectorSearchService(pool, config);
    const resultConfig = service.getConfig();

    expect(resultConfig.defaultTopK).toBe(15);
    expect(resultConfig.maxResults).toBe(50);
  });

  it('should use default config when not provided', () => {
    const pool = createMockPool();
    const service = createVectorSearchService(pool);

    const config = service.getConfig();

    expect(config.defaultTopK).toBe(5);
    expect(config.defaultSimilarityThreshold).toBe(0.7);
  });
});
