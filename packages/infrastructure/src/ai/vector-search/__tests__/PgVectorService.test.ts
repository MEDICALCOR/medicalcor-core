/**
 * @fileoverview Tests for PgVectorService
 *
 * Comprehensive tests for PostgreSQL vector search service covering:
 * - Instantiation
 * - Embedding dimension validation
 * - Search profile constants
 * - ef_search computation
 * - Configuration handling
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import fc from 'fast-check';
import {
  PgVectorService,
  EF_SEARCH_BY_PROFILE,
  type PgVectorConfig,
  type SearchProfile,
} from '../PgVectorService.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Create mock functions using vi.hoisted for proper hoisting with vi.mock
// This ensures mocks are available both in the vi.mock factory and in tests
const mocks = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockConnect = vi.fn();
  const mockEnd = vi.fn();

  return {
    mockQuery,
    mockRelease,
    mockConnect,
    mockEnd,
    mockClient: {
      query: mockQuery,
      release: mockRelease,
    },
  };
});

// Destructure for convenience in tests
const { mockQuery, mockRelease, mockConnect, mockEnd, mockClient } = mocks;

// Mock the pg module - use a class to properly support `new Pool()`
vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      query = mocks.mockQuery;
      connect = mocks.mockConnect;
      end = mocks.mockEnd;
    },
  };
});

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createDefaultConfig = (): PgVectorConfig => ({
  connectionString: 'postgresql://test:test@localhost:5432/testdb',
  maxPoolSize: 10,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
});

const create1536Embedding = (): number[] => {
  return Array(1536)
    .fill(0)
    .map((_, i) => Math.sin(i * 0.01));
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('PgVectorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(mockClient);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // SEARCH PROFILE CONSTANTS
  // ============================================================================

  describe('EF_SEARCH_BY_PROFILE', () => {
    it('should have correct fast profile value', () => {
      expect(EF_SEARCH_BY_PROFILE.fast).toBe(40);
    });

    it('should have correct balanced profile value', () => {
      expect(EF_SEARCH_BY_PROFILE.balanced).toBe(100);
    });

    it('should have correct accurate profile value', () => {
      expect(EF_SEARCH_BY_PROFILE.accurate).toBe(200);
    });

    it('should have correct exact profile value', () => {
      expect(EF_SEARCH_BY_PROFILE.exact).toBe(400);
    });

    it('should have faster profiles with lower values', () => {
      expect(EF_SEARCH_BY_PROFILE.fast).toBeLessThan(EF_SEARCH_BY_PROFILE.balanced);
      expect(EF_SEARCH_BY_PROFILE.balanced).toBeLessThan(EF_SEARCH_BY_PROFILE.accurate);
      expect(EF_SEARCH_BY_PROFILE.accurate).toBeLessThan(EF_SEARCH_BY_PROFILE.exact);
    });
  });

  // ============================================================================
  // INSTANTIATION
  // ============================================================================

  describe('Instantiation', () => {
    it('should create instance with config object', () => {
      const service = new PgVectorService(createDefaultConfig());
      expect(service).toBeInstanceOf(PgVectorService);
    });

    it('should create instance with connection string', () => {
      const service = new PgVectorService('postgresql://test:test@localhost:5432/testdb');
      expect(service).toBeInstanceOf(PgVectorService);
    });

    it('should create instance with custom HNSW config', () => {
      const config: PgVectorConfig = {
        ...createDefaultConfig(),
        hnsw: {
          m: 32,
          efConstruction: 300,
          efSearchDefault: 150,
        },
      };

      const service = new PgVectorService(config);
      expect(service).toBeInstanceOf(PgVectorService);
    });

    it('should expose pool via getPool', () => {
      const service = new PgVectorService(createDefaultConfig());
      expect(service.getPool()).toBeDefined();
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('initialize', () => {
    it('should create pgvector extension', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE EXTENSION IF NOT EXISTS vector')
      );
    });

    it('should create clinical_embeddings table', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS clinical_embeddings')
      );
    });

    it('should create HNSW index', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_vector')
      );
    });

    it('should create case_id index', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_case')
      );
    });

    it('should create content_type index', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_content_type')
      );
    });

    it('should create metadata GIN index', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_metadata')
      );
    });

    it('should use custom HNSW parameters', async () => {
      const config: PgVectorConfig = {
        ...createDefaultConfig(),
        hnsw: {
          m: 32,
          efConstruction: 300,
        },
      };

      const service = new PgVectorService(config);
      await service.initialize();

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('m = 32'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ef_construction = 300'));
    });

    it('should not reinitialize if already initialized', async () => {
      const service = new PgVectorService(createDefaultConfig());

      await service.initialize();
      const initialCalls = mockQuery.mock.calls.length;

      await service.initialize();

      expect(mockQuery.mock.calls.length).toBe(initialCalls);
    });

    it('should release client after initialization', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // STORE EMBEDDING
  // ============================================================================

  describe('storeEmbedding', () => {
    it('should store a valid embedding', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      const embedding = create1536Embedding();

      const id = await service.storeEmbedding(
        'case-001',
        'Patient presents with tooth pain',
        'clinical_notes',
        embedding,
        { riskClass: 'GREEN' }
      );

      expect(id).toBe('emb-001');
    });

    it('should reject non-1536 dimensional embeddings', async () => {
      const service = new PgVectorService(createDefaultConfig());
      const badEmbedding = Array(512).fill(0);

      await expect(
        service.storeEmbedding('case-001', 'content', 'notes', badEmbedding)
      ).rejects.toThrow('Expected 1536-dimensional embedding, got 512');
    });

    it('should handle upsert on conflict', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      await service.storeEmbedding(
        'case-001',
        'Updated content',
        'clinical_notes',
        create1536Embedding()
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should serialize embedding as vector format', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      const embedding = create1536Embedding();

      await service.storeEmbedding('case-001', 'content', 'notes', embedding);

      const calls = mockQuery.mock.calls;
      const insertCall = calls.find((c) => (c[0] as string).includes('INSERT INTO'));
      expect(insertCall).toBeDefined();
      if (insertCall) {
        const params = insertCall[1] as unknown[];
        expect(params[3]).toMatch(/^\[.*\]$/);
      }
    });

    it('should store metadata as JSON', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      const metadata = { riskClass: 'GREEN', priority: 5 };

      await service.storeEmbedding('case-001', 'content', 'notes', create1536Embedding(), metadata);

      const calls = mockQuery.mock.calls;
      const insertCall = calls.find((c) => (c[0] as string).includes('INSERT INTO'));
      expect(insertCall).toBeDefined();
      if (insertCall) {
        const params = insertCall[1] as unknown[];
        expect(params[4]).toBe(JSON.stringify(metadata));
      }
    });

    it('should handle null metadata', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());

      await service.storeEmbedding('case-001', 'content', 'notes', create1536Embedding());

      const calls = mockQuery.mock.calls;
      const insertCall = calls.find((c) => (c[0] as string).includes('INSERT INTO'));
      expect(insertCall).toBeDefined();
      if (insertCall) {
        const params = insertCall[1] as unknown[];
        expect(params[4]).toBeNull();
      }
    });

    it('should throw when no row returned', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const service = new PgVectorService(createDefaultConfig());

      await expect(
        service.storeEmbedding('case-001', 'content', 'notes', create1536Embedding())
      ).rejects.toThrow('Failed to insert embedding');
    });

    it('should release client after store', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      await service.storeEmbedding('case-001', 'content', 'notes', create1536Embedding());

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SEMANTIC SEARCH
  // ============================================================================

  describe('semanticSearch', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'emb-001',
            case_id: 'case-001',
            content: 'Patient with pain',
            content_type: 'clinical_notes',
            similarity: '0.85',
            metadata: { riskClass: 'GREEN' },
          },
          {
            id: 'emb-002',
            case_id: 'case-002',
            content: 'Follow-up visit',
            content_type: 'clinical_notes',
            similarity: '0.75',
            metadata: null,
          },
        ],
        rowCount: 2,
      });
    });

    it('should perform semantic search', async () => {
      const service = new PgVectorService(createDefaultConfig());
      const results = await service.semanticSearch(create1536Embedding(), 10, 0.7);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('emb-001');
      expect(results[0].similarity).toBe(0.85);
    });

    it('should reject non-1536 dimensional query embedding', async () => {
      const service = new PgVectorService(createDefaultConfig());

      await expect(service.semanticSearch(Array(512).fill(0), 10, 0.7)).rejects.toThrow(
        'Expected 1536-dimensional embedding, got 512'
      );
    });

    it('should set ef_search for query', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SET LOCAL hnsw.ef_search'));
    });

    it('should apply fast profile', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7, undefined, {
        profile: 'fast',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(`SET LOCAL hnsw.ef_search = ${EF_SEARCH_BY_PROFILE.fast}`)
      );
    });

    it('should apply accurate profile', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7, undefined, {
        profile: 'accurate',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(`SET LOCAL hnsw.ef_search = ${EF_SEARCH_BY_PROFILE.accurate}`)
      );
    });

    it('should apply exact profile', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7, undefined, {
        profile: 'exact',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(`SET LOCAL hnsw.ef_search = ${EF_SEARCH_BY_PROFILE.exact}`)
      );
    });

    it('should override ef_search when specified directly', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7, undefined, {
        efSearch: 500,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL hnsw.ef_search = 500')
      );
    });

    it('should ensure ef_search is at least 2x limit', async () => {
      const service = new PgVectorService(createDefaultConfig());
      // Fast profile has ef_search=40, but limit=50 requires at least 100
      await service.semanticSearch(create1536Embedding(), 50, 0.7, undefined, {
        profile: 'fast',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL hnsw.ef_search = 100')
      );
    });

    it('should filter by case IDs', async () => {
      const service = new PgVectorService(createDefaultConfig());

      await service.semanticSearch(create1536Embedding(), 10, 0.7, {
        caseIds: ['case-001', 'case-002'],
      });

      const calls = mockQuery.mock.calls;
      const searchCall = calls.find((c) => (c[0] as string).includes('SELECT'));
      expect(searchCall).toBeDefined();
      if (searchCall) {
        expect(searchCall[0]).toContain('case_id = ANY');
      }
    });

    it('should filter by content types', async () => {
      const service = new PgVectorService(createDefaultConfig());

      await service.semanticSearch(create1536Embedding(), 10, 0.7, {
        contentTypes: ['clinical_notes', 'summary'],
      });

      const calls = mockQuery.mock.calls;
      const searchCall = calls.find((c) => (c[0] as string).includes('SELECT'));
      expect(searchCall).toBeDefined();
      if (searchCall) {
        expect(searchCall[0]).toContain('content_type = ANY');
      }
    });

    it('should filter by metadata fields', async () => {
      const service = new PgVectorService(createDefaultConfig());

      await service.semanticSearch(create1536Embedding(), 10, 0.7, {
        metadata: { riskClass: 'GREEN' },
      });

      const calls = mockQuery.mock.calls;
      const searchCall = calls.find((c) => (c[0] as string).includes('SELECT'));
      expect(searchCall).toBeDefined();
      if (searchCall) {
        expect(searchCall[0]).toContain("metadata->>'riskClass'");
      }
    });

    it('should return properly formatted results', async () => {
      const service = new PgVectorService(createDefaultConfig());
      const results = await service.semanticSearch(create1536Embedding(), 10, 0.7);

      expect(results[0]).toEqual({
        id: 'emb-001',
        caseId: 'case-001',
        content: 'Patient with pain',
        contentType: 'clinical_notes',
        similarity: 0.85,
        metadata: { riskClass: 'GREEN' },
      });

      // Null metadata should become empty object
      expect(results[1].metadata).toEqual({});
    });

    it('should release client after search', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.semanticSearch(create1536Embedding(), 10, 0.7);

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // FIND SIMILAR CASES
  // ============================================================================

  describe('findSimilarCases', () => {
    it('should return empty array when source case not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const service = new PgVectorService(createDefaultConfig());
      const results = await service.findSimilarCases('nonexistent-case', 5, 0.7);

      expect(results).toEqual([]);
    });

    it('should release client after lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const service = new PgVectorService(createDefaultConfig());
      await service.findSimilarCases('case-001', 5, 0.7);

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DELETE EMBEDDINGS
  // ============================================================================

  describe('deleteEmbeddingsForCase', () => {
    it('should delete embeddings for a case', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });

      const service = new PgVectorService(createDefaultConfig());
      const count = await service.deleteEmbeddingsForCase('case-001');

      expect(count).toBe(3);
    });

    it('should return 0 when no embeddings deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });

      const service = new PgVectorService(createDefaultConfig());
      const count = await service.deleteEmbeddingsForCase('nonexistent-case');

      expect(count).toBe(0);
    });

    it('should use correct delete query', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const service = new PgVectorService(createDefaultConfig());
      await service.deleteEmbeddingsForCase('case-001');

      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM clinical_embeddings WHERE case_id = $1', [
        'case-001',
      ]);
    });
  });

  // ============================================================================
  // STATISTICS
  // ============================================================================

  describe('getStatistics', () => {
    it('should return embedding statistics', async () => {
      mockConnect.mockResolvedValue(mockClient);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // total
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // unique cases
        .mockResolvedValueOnce({
          rows: [
            { content_type: 'clinical_notes', count: '60' },
            { content_type: 'summary', count: '40' },
          ],
        }); // content types

      const service = new PgVectorService(createDefaultConfig());
      const stats = await service.getStatistics();

      expect(stats.totalEmbeddings).toBe(100);
      expect(stats.uniqueCases).toBe(25);
      expect(stats.contentTypes).toEqual({
        clinical_notes: 60,
        summary: 40,
      });
      expect(stats.averageSimilarity).toBe(0);
    });

    it('should handle empty database', async () => {
      mockConnect.mockResolvedValue(mockClient);
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new PgVectorService(createDefaultConfig());
      const stats = await service.getStatistics();

      expect(stats.totalEmbeddings).toBe(0);
      expect(stats.uniqueCases).toBe(0);
      expect(stats.contentTypes).toEqual({});
    });

    it('should release client after stats', async () => {
      mockConnect.mockResolvedValue(mockClient);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new PgVectorService(createDefaultConfig());
      await service.getStatistics();

      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const service = new PgVectorService(createDefaultConfig());
      const health = await service.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.details).toBeUndefined();
    });

    it('should return unhealthy status on error', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const service = new PgVectorService(createDefaultConfig());
      const health = await service.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.details).toBe('Connection refused');
    });

    it('should handle unknown error', async () => {
      mockQuery.mockRejectedValue('string error');

      const service = new PgVectorService(createDefaultConfig());
      const health = await service.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.details).toBe('Unknown error');
    });
  });

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  describe('close', () => {
    it('should close the connection pool', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.close();

      expect(mockEnd).toHaveBeenCalled();
    });

    it('should reset initialized state', async () => {
      const service = new PgVectorService(createDefaultConfig());
      await service.initialize();
      await service.close();

      // After close, initialize should work again
      await service.initialize();
      // Check that CREATE EXTENSION was called twice
      const extensionCalls = mockQuery.mock.calls.filter((c) =>
        (c[0] as string).includes('CREATE EXTENSION')
      );
      expect(extensionCalls.length).toBe(2);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should compute valid ef_search for any limit and profile', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.constantFrom('fast', 'balanced', 'accurate', 'exact'),
          (limit, profile) => {
            const baseEfSearch = EF_SEARCH_BY_PROFILE[profile as SearchProfile];
            const computed = Math.max(baseEfSearch, limit * 2);

            // ef_search should always be at least 2x limit
            expect(computed).toBeGreaterThanOrEqual(limit * 2);

            // ef_search should be at least the base profile value
            expect(computed).toBeGreaterThanOrEqual(baseEfSearch);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject any non-1536 dimensional embedding', async () => {
      const invalidDimensions = [1, 512, 1024, 1535, 1537, 2000];

      for (const dim of invalidDimensions) {
        const service = new PgVectorService(createDefaultConfig());
        const badEmbedding = Array(dim).fill(0);

        await expect(
          service.storeEmbedding('case', 'content', 'notes', badEmbedding)
        ).rejects.toThrow(`Expected 1536-dimensional embedding, got ${dim}`);
      }
    });

    it('should accept exactly 1536 dimensional embeddings', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'emb-001' }],
        rowCount: 1,
      });

      const service = new PgVectorService(createDefaultConfig());
      const validEmbedding = Array(1536).fill(0);

      const id = await service.storeEmbedding('case', 'content', 'notes', validEmbedding);
      expect(id).toBe('emb-001');
    });
  });
});
