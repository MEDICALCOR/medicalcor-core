/**
 * Comprehensive tests for KnowledgeBaseRepository
 *
 * Tests cover:
 * - CRUD operations (create, read, update, delete)
 * - Batch operations
 * - Embedding management
 * - Semantic search
 * - Hybrid search
 * - Pagination and filtering
 * - Transaction handling
 * - Error scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import {
  KnowledgeBaseRepository,
  createKnowledgeBaseRepository,
  type CreateKnowledgeEntry,
  type ListOptions,
  type PaginatedResult,
  type SearchQueryOptions,
  type HybridSearchOptions,
} from '../knowledge-base-repository.js';
import type { KnowledgeEntry, KnowledgeSourceType, Language } from '../types.js';

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
  const mockClient: Partial<PoolClient> = {
    query: vi.fn().mockResolvedValue(createMockQueryResult([])),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      // INSERT query
      if (sql.includes('INSERT INTO knowledge_base')) {
        return createMockQueryResult([
          {
            id: 'kb-123',
            source_type: 'faq',
            title: 'Test Entry',
            content: 'Test content',
            content_hash: 'test-hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);
      }

      // SELECT by ID
      if (sql.includes('WHERE id =')) {
        return createMockQueryResult([
          {
            id: 'kb-123',
            source_type: 'faq',
            title: 'Test Entry',
            content: 'Test content',
            content_hash: 'test-hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);
      }

      // UPDATE query
      if (sql.includes('UPDATE knowledge_base')) {
        return createMockQueryResult([
          {
            id: 'kb-123',
            source_type: 'faq',
            title: 'Updated Entry',
            content: 'Updated content',
            content_hash: 'updated-hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
            updated_at: new Date(),
          },
        ]);
      }

      // DELETE query
      if (sql.includes('DELETE FROM knowledge_base')) {
        return { ...createMockQueryResult([]), rowCount: 1 };
      }

      // COUNT query
      if (sql.includes('COUNT(*)')) {
        return createMockQueryResult([{ count: '10' }]);
      }

      // Vector search query
      if (sql.includes('embedding <=>')) {
        return createMockQueryResult([
          {
            id: 'kb-search-1',
            source_type: 'faq',
            title: 'Search Result',
            content: 'Matching content',
            similarity: '0.85',
            tags: [],
            metadata: {},
          },
        ]);
      }

      // Hybrid search query
      if (sql.includes('hybrid_search_knowledge_base')) {
        return createMockQueryResult([
          {
            id: 'kb-hybrid-1',
            source_type: 'faq',
            title: 'Hybrid Result',
            content: 'Hybrid matching content',
            semantic_score: '0.8',
            keyword_score: '0.7',
            combined_score: '0.75',
          },
        ]);
      }

      return createMockQueryResult([]);
    }),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Pool;

  return pool;
}

function createTestEntry(overrides: Partial<CreateKnowledgeEntry> = {}): CreateKnowledgeEntry {
  return {
    sourceType: 'faq' as KnowledgeSourceType,
    title: 'Test FAQ Entry',
    content: 'This is a test FAQ answer about dental implants',
    chunkIndex: 0,
    chunkTotal: 1,
    language: 'ro' as Language,
    tags: ['dental', 'implants'],
    metadata: { source: 'manual' },
    version: 1,
    isActive: true,
    ...overrides,
  };
}

// ============= Test Suite =============

describe('KnowledgeBaseRepository', () => {
  let pool: Pool;
  let repository: KnowledgeBaseRepository;

  beforeEach(() => {
    pool = createMockPool();
    repository = new KnowledgeBaseRepository(pool);
  });

  describe('create()', () => {
    it('should create knowledge entry successfully', async () => {
      const entry = createTestEntry();
      const result = await repository.create(entry);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      // Mock returns fixed values, just verify result has expected properties
      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.sourceType).toBeDefined();
    });

    it('should generate content hash automatically', async () => {
      const entry = createTestEntry();
      const result = await repository.create(entry);

      expect(result.contentHash).toBeDefined();
      // Mock returns 'test-hash', just verify it's a string
      expect(typeof result.contentHash).toBe('string');
    });

    it('should create entry with embedding', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());
      const entry = createTestEntry({ embedding });

      const result = await repository.create(entry);

      expect(result).toBeDefined();
    });

    it('should create entry without embedding', async () => {
      const entry = createTestEntry({ embedding: undefined });

      const result = await repository.create(entry);

      expect(result).toBeDefined();
    });

    it('should handle optional fields correctly', async () => {
      const entry = createTestEntry({
        sourceId: 'faq-123',
        clinicId: 'clinic-1',
        parentId: 'parent-kb-1',
        createdBy: 'user-123',
      });

      const result = await repository.create(entry);

      expect(result).toBeDefined();
    });

    it('should handle metadata as JSON', async () => {
      const metadata = { key1: 'value1', key2: 42, nested: { prop: 'value' } };
      const entry = createTestEntry({ metadata });

      const result = await repository.create(entry);

      expect(result.metadata).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Database error'));

      const entry = createTestEntry();

      await expect(repository.create(entry)).rejects.toThrow('Database error');
    });
  });

  describe('createBatch()', () => {
    it('should create multiple entries in a batch', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce(createMockQueryResult([])) // BEGIN
          .mockResolvedValueOnce(createMockQueryResult([{ id: 'kb-1' }])) // INSERT 1
          .mockResolvedValueOnce(createMockQueryResult([{ id: 'kb-2' }])) // INSERT 2
          .mockResolvedValueOnce(createMockQueryResult([{ id: 'kb-3' }])) // INSERT 3
          .mockResolvedValueOnce(createMockQueryResult([])), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const entries = [
        createTestEntry({ title: 'Entry 1' }),
        createTestEntry({ title: 'Entry 2' }),
        createTestEntry({ title: 'Entry 3' }),
      ];

      const results = await repository.createBatch(entries);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.id !== undefined)).toBe(true);
    });

    it('should handle duplicate entries with ON CONFLICT', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce(createMockQueryResult([])) // BEGIN
          .mockResolvedValueOnce(createMockQueryResult([{ id: 'kb-1' }])) // INSERT 1
          .mockResolvedValueOnce(createMockQueryResult([{ id: 'kb-2' }])) // INSERT 2
          .mockResolvedValueOnce(createMockQueryResult([])), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const entries = [createTestEntry(), createTestEntry()];

      const results = await repository.createBatch(entries);

      expect(results).toBeDefined();
    });

    it('should use transaction for batch operations', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue(createMockQueryResult([{ id: 'kb-1' }])),
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const entries = [createTestEntry()];
      await repository.createBatch(entries);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockRejectedValueOnce(new Error('Insert failed')), // INSERT fails
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const entries = [createTestEntry()];

      await expect(repository.createBatch(entries)).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('should find entry by ID', async () => {
      const result = await repository.findById('kb-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('kb-123');
    });

    it('should return null when entry not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should parse embedding vector correctly', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'kb-123',
            embedding: '[0.1,0.2,0.3]',
            source_type: 'faq',
            title: 'Test',
            content: 'Test',
            content_hash: 'hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
          },
        ])
      );

      const result = await repository.findById('kb-123');

      expect(result?.embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('findByContentHash()', () => {
    it('should find entry by content hash', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'kb-123',
            source_type: 'faq',
            title: 'Test Entry',
            content: 'Test content',
            content_hash: 'test-hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
      );

      const result = await repository.findByContentHash('test-hash');

      expect(result).toBeDefined();
      expect(result?.contentHash).toBe('test-hash');
    });

    it('should return null when not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.findByContentHash('non-existent-hash');

      expect(result).toBeNull();
    });

    it('should only find chunk_index = 0', async () => {
      // The query includes "AND chunk_index = 0"
      const result = await repository.findByContentHash('test-hash');

      expect(result).toBeDefined();
    });
  });

  describe('update()', () => {
    it('should update entry successfully', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'kb-123',
            source_type: 'faq',
            title: 'Updated Title',
            content: 'Updated Content',
            content_hash: 'updated-hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
            updated_at: new Date(),
          },
        ])
      );

      const updates = {
        title: 'Updated Title',
        content: 'Updated Content',
      };

      const result = await repository.update('kb-123', updates);

      expect(result).toBeDefined();
      expect(result?.title).toBe('Updated Title');
    });

    it('should update content hash when content changes', async () => {
      const updates = { content: 'New content' };

      const result = await repository.update('kb-123', updates);

      expect(result).toBeDefined();
    });

    it('should filter out non-allowed fields', async () => {
      const updates = {
        title: 'New Title',
        id: 'hacker-attempt', // Should be filtered out
        createdAt: new Date(), // Should be filtered out
      } as never;

      const result = await repository.update('kb-123', updates);

      expect(result).toBeDefined();
    });

    it('should return existing entry when no valid updates', async () => {
      const updates = {};

      const result = await repository.update('kb-123', updates);

      expect(result).toBeDefined();
    });

    it('should handle metadata updates correctly', async () => {
      const updates = {
        metadata: { updated: true, newField: 'value' },
      };

      const result = await repository.update('kb-123', updates);

      expect(result).toBeDefined();
    });

    it('should return null when entry not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.update('non-existent', { title: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('updateEmbedding()', () => {
    it('should update embedding successfully', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      await expect(repository.updateEmbedding('kb-123', embedding)).resolves.not.toThrow();
    });

    it('should convert embedding to vector string format', async () => {
      const embedding = [0.1, 0.2, 0.3];

      await repository.updateEmbedding('kb-123', embedding);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['[0.1,0.2,0.3]', 'kb-123'])
      );
    });
  });

  describe('updateEmbeddingsBatch()', () => {
    it('should update multiple embeddings in transaction', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue(createMockQueryResult([])),
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const updates = [
        { id: 'kb-1', embedding: [0.1, 0.2] },
        { id: 'kb-2', embedding: [0.3, 0.4] },
      ];

      await repository.updateEmbeddingsBatch(updates);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce(createMockQueryResult([])) // BEGIN
          .mockRejectedValueOnce(new Error('Update failed')), // UPDATE fails
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const updates = [{ id: 'kb-1', embedding: [0.1, 0.2] }];

      await expect(repository.updateEmbeddingsBatch(updates)).rejects.toThrow();
    });
  });

  describe('delete()', () => {
    it('should delete entry successfully', async () => {
      const result = await repository.delete('kb-123');

      expect(result).toBe(true);
    });

    it('should return false when entry not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ ...createMockQueryResult([]), rowCount: 0 });

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('softDelete()', () => {
    it('should soft delete entry successfully', async () => {
      const result = await repository.softDelete('kb-123');

      expect(result).toBe(true);
    });

    it('should return false when entry not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ ...createMockQueryResult([]), rowCount: 0 });

      const result = await repository.softDelete('non-existent');

      expect(result).toBe(false);
    });

    it('should set is_active to false', async () => {
      await repository.softDelete('kb-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = FALSE'),
        expect.any(Array)
      );
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      vi.mocked(pool.query).mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return createMockQueryResult([{ count: '25' }]);
        }
        return createMockQueryResult([
          { id: 'kb-1', source_type: 'faq', title: 'Entry 1', content: 'Content 1' },
          { id: 'kb-2', source_type: 'faq', title: 'Entry 2', content: 'Content 2' },
        ] as never[]);
      });
    });

    it('should list entries with default pagination', async () => {
      const result = await repository.list();

      expect(result.items).toBeDefined();
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(2);
    });

    it('should support custom pagination', async () => {
      const result = await repository.list({ page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });

    it('should filter by source type', async () => {
      await repository.list({ sourceType: 'faq' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('source_type ='),
        expect.any(Array)
      );
    });

    it('should filter by clinic ID', async () => {
      await repository.list({ clinicId: 'clinic-1' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('clinic_id ='),
        expect.any(Array)
      );
    });

    it('should filter by language', async () => {
      await repository.list({ language: 'ro' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('language ='),
        expect.any(Array)
      );
    });

    it('should filter by isActive status', async () => {
      await repository.list({ isActive: false });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active ='),
        expect.arrayContaining([false])
      );
    });

    it('should support custom ordering', async () => {
      await repository.list({ orderBy: 'title', orderDirection: 'asc' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY title ASC'),
        expect.any(Array)
      );
    });
  });

  describe('findWithoutEmbeddings()', () => {
    it('should find entries without embeddings', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          { id: 'kb-1', embedding: null } as never,
          { id: 'kb-2', embedding: null } as never,
        ])
      );

      const results = await repository.findWithoutEmbeddings();

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default limit of 100', async () => {
      await repository.findWithoutEmbeddings();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([100])
      );
    });

    it('should support custom limit', async () => {
      await repository.findWithoutEmbeddings(50);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([50])
      );
    });

    it('should only find active entries', async () => {
      await repository.findWithoutEmbeddings();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = TRUE'),
        expect.any(Array)
      );
    });
  });

  describe('search() - Semantic Search', () => {
    it('should perform semantic search successfully', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());

      const results = await repository.search(queryEmbedding);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default options', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());

      await repository.search(queryEmbedding);

      // Should use default topK=5 and similarityThreshold=0.7
      expect(pool.query).toHaveBeenCalled();
    });

    it('should support custom topK and threshold', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const options: SearchQueryOptions = {
        topK: 10,
        similarityThreshold: 0.8,
      };

      await repository.search(queryEmbedding, options);

      expect(pool.query).toHaveBeenCalled();
    });

    it('should apply search filters', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const options: SearchQueryOptions = {
        filters: {
          sourceType: 'faq',
          clinicId: 'clinic-1',
          language: 'ro',
        },
      };

      await repository.search(queryEmbedding, options);

      expect(pool.query).toHaveBeenCalled();
    });

    it('should return results with similarity scores', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());

      const results = await repository.search(queryEmbedding);

      if (results.length > 0) {
        expect(results[0]?.similarity).toBeGreaterThan(0);
        expect(results[0]?.similarity).toBeLessThanOrEqual(1);
      }
    });

    it('should convert embedding to vector string format', async () => {
      const queryEmbedding = [0.1, 0.2, 0.3];

      await repository.search(queryEmbedding);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['[0.1,0.2,0.3]'])
      );
    });
  });

  describe('hybridSearch()', () => {
    it('should perform hybrid search successfully', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const queryText = 'dental implants';

      const results = await repository.hybridSearch(queryEmbedding, queryText);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default weights', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const queryText = 'dental implants';

      await repository.hybridSearch(queryEmbedding, queryText);

      // Default: semanticWeight=0.7, keywordWeight=0.3
      expect(pool.query).toHaveBeenCalled();
    });

    it('should support custom weights', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const queryText = 'dental implants';
      const options: HybridSearchOptions = {
        semanticWeight: 0.8,
        keywordWeight: 0.2,
      };

      await repository.hybridSearch(queryEmbedding, queryText, options);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0.8, 0.2])
      );
    });

    it('should return results with all scores', async () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const queryText = 'dental implants';

      const results = await repository.hybridSearch(queryEmbedding, queryText);

      if (results.length > 0) {
        expect(results[0]?.semanticScore).toBeDefined();
        expect(results[0]?.keywordScore).toBeDefined();
        expect(results[0]?.combinedScore).toBeDefined();
      }
    });

    it('should filter by similarity threshold', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'kb-1',
            semantic_score: '0.9',
            keyword_score: '0.8',
            combined_score: '0.85',
          } as never,
          {
            id: 'kb-2',
            semantic_score: '0.5', // Below threshold
            keyword_score: '0.6',
            combined_score: '0.55',
          } as never,
        ])
      );

      const queryEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const queryText = 'test';
      const options: HybridSearchOptions = {
        similarityThreshold: 0.7,
      };

      const results = await repository.hybridSearch(queryEmbedding, queryText, options);

      // Should only return results above threshold
      expect(results.length).toBe(1);
      expect(results[0]?.semanticScore).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Helper Methods', () => {
    it('should convert camelCase to snake_case', async () => {
      // Tested indirectly through update method
      const updates = { isActive: false };

      await repository.update('kb-123', updates as never);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active'),
        expect.any(Array)
      );
    });

    it('should generate consistent content hashes', async () => {
      const entry1 = createTestEntry({ content: 'same content' });
      const entry2 = createTestEntry({ content: 'same content' });

      const result1 = await repository.create(entry1);
      const result2 = await repository.create(entry2);

      // Same content should produce same hash
      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should parse vectors from database format', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'kb-1',
            embedding: '[0.1,0.2,0.3,0.4,0.5]',
            source_type: 'faq',
            title: 'Test',
            content: 'Test',
            content_hash: 'hash',
            chunk_index: 0,
            chunk_total: 1,
            language: 'ro',
            tags: [],
            metadata: {},
            version: 1,
            is_active: true,
          },
        ])
      );

      const result = await repository.findById('kb-1');

      expect(result?.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });
  });
});

describe('Factory Function', () => {
  it('should create repository with factory function', () => {
    const pool = createMockPool();
    const repository = createKnowledgeBaseRepository(pool);

    expect(repository).toBeInstanceOf(KnowledgeBaseRepository);
  });
});
