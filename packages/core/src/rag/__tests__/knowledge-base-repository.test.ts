/**
 * @fileoverview Tests for Knowledge Base Repository
 *
 * Tests CRUD operations, search functionality, and pgvector operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KnowledgeBaseRepository,
  createKnowledgeBaseRepository,
  type ListOptions,
  type SearchQueryOptions,
  type HybridSearchOptions,
} from '../knowledge-base-repository.js';
import type { CreateKnowledgeEntry, KnowledgeEntry, Language } from '../types.js';

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

function createMockEntry(overrides: Partial<CreateKnowledgeEntry> = {}): CreateKnowledgeEntry {
  return {
    sourceType: 'faq',
    title: 'Test FAQ',
    content: 'This is test content for the knowledge base',
    chunkIndex: 0,
    chunkTotal: 1,
    language: 'ro' as Language,
    tags: ['test', 'faq'],
    metadata: { category: 'test' },
    version: 1,
    isActive: true,
    ...overrides,
  };
}

function createMockDbRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: 'kb-123',
    source_type: 'faq',
    source_id: null,
    title: 'Test FAQ',
    content: 'Test content',
    content_hash: 'abc123hash',
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
    created_by: null,
    ...overrides,
  };
}

// ============================================================================
// REPOSITORY TESTS
// ============================================================================

describe('KnowledgeBaseRepository', () => {
  let repository: KnowledgeBaseRepository;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = new KnowledgeBaseRepository(mockPool as unknown as import('pg').Pool);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new knowledge entry', async () => {
      const mockRow = createMockDbRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const entry = createMockEntry();
      const result = await repository.create(entry);

      expect(result).toBeDefined();
      expect(result.id).toBe('kb-123');
      expect(result.sourceType).toBe('faq');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should handle entry with embedding', async () => {
      const mockRow = createMockDbRow({ embedding: '[0.1,0.2,0.3]' });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const entry = createMockEntry({ embedding: [0.1, 0.2, 0.3] });
      const result = await repository.create(entry);

      expect(result).toBeDefined();
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle entry without optional fields', async () => {
      const mockRow = createMockDbRow({
        source_id: null,
        clinic_id: null,
        parent_id: null,
        created_by: null,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const entry = createMockEntry();
      const result = await repository.create(entry);

      // Optional fields are null in DB but may be returned as-is or undefined
      expect(result.sourceId == null).toBe(true);
      expect(result.clinicId == null).toBe(true);
    });
  });

  describe('createBatch', () => {
    it('should create multiple entries in a transaction', async () => {
      const mockClient = mockPool._mockClient;
      const mockRow1 = createMockDbRow({ id: 'kb-1' });
      const mockRow2 = createMockDbRow({ id: 'kb-2' });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRow1] })
        .mockResolvedValueOnce({ rows: [mockRow2] })
        .mockResolvedValueOnce({}); // COMMIT

      const entries = [
        createMockEntry({ title: 'Entry 1' }),
        createMockEntry({ title: 'Entry 2' }),
      ];

      const results = await repository.createBatch(entries);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('kb-1');
      expect(results[1].id).toBe('kb-2');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on error', async () => {
      const mockClient = mockPool._mockClient;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed'));

      const entries = [createMockEntry()];

      await expect(repository.createBatch(entries)).rejects.toThrow('Insert failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find entry by ID', async () => {
      const mockRow = createMockDbRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findById('kb-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('kb-123');
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByContentHash', () => {
    it('should find entry by content hash', async () => {
      const mockRow = createMockDbRow({ content_hash: 'hash123' });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findByContentHash('hash123');

      expect(result).toBeDefined();
      expect(result?.contentHash).toBe('hash123');
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findByContentHash('unknown-hash');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update an existing entry', async () => {
      const mockRow = createMockDbRow({ title: 'Updated Title' });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.update('kb-123', { title: 'Updated Title' });

      expect(result).toBeDefined();
      expect(result?.title).toBe('Updated Title');
    });

    it('should return entry unchanged when no updates provided', async () => {
      const mockRow = createMockDbRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.update('kb-123', {});

      expect(result).toBeDefined();
    });

    it('should update content hash when content changes', async () => {
      const mockRow = createMockDbRow({ content: 'New content' });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.update('kb-123', { content: 'New content' });

      expect(result).toBeDefined();
    });

    it('should return null when entry not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.update('non-existent', { title: 'New Title' });

      expect(result).toBeNull();
    });

    it('should handle updating multiple fields', async () => {
      const mockRow = createMockDbRow({
        title: 'New Title',
        source_type: 'clinic_protocol',
        language: 'en',
      });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.update('kb-123', {
        title: 'New Title',
        sourceType: 'clinic_protocol',
        language: 'en' as Language,
        tags: ['updated'],
        metadata: { updated: true },
        isActive: false,
        version: 2,
      });

      expect(result).toBeDefined();
    });
  });

  describe('updateEmbedding', () => {
    it('should update embedding for an entry', async () => {
      mockPool.query.mockResolvedValueOnce({});

      await repository.updateEmbedding('kb-123', [0.1, 0.2, 0.3]);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['[0.1,0.2,0.3]', 'kb-123']);
    });
  });

  describe('updateEmbeddingsBatch', () => {
    it('should update multiple embeddings in a transaction', async () => {
      const mockClient = mockPool._mockClient;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const updates = [
        { id: 'kb-1', embedding: [0.1, 0.2] },
        { id: 'kb-2', embedding: [0.3, 0.4] },
      ];

      await repository.updateEmbeddingsBatch(updates);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on error', async () => {
      const mockClient = mockPool._mockClient;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Update failed'));

      const updates = [{ id: 'kb-1', embedding: [0.1, 0.2] }];

      await expect(repository.updateEmbeddingsBatch(updates)).rejects.toThrow('Update failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('delete', () => {
    it('should delete an entry', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await repository.delete('kb-123');

      expect(result).toBe(true);
    });

    it('should return false when entry not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('softDelete', () => {
    it('should soft delete an entry', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await repository.softDelete('kb-123');

      expect(result).toBe(true);
    });

    it('should return false when entry not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repository.softDelete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should list entries with pagination', async () => {
      const mockRows = [createMockDbRow({ id: 'kb-1' }), createMockDbRow({ id: 'kb-2' })];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // count query
        .mockResolvedValueOnce({ rows: mockRows }); // list query

      const result = await repository.list({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by sourceType', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [createMockDbRow()] });

      await repository.list({ sourceType: 'faq' });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should filter by clinicId', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [createMockDbRow()] });

      await repository.list({ clinicId: 'clinic-123' });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should filter by language', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [createMockDbRow()] });

      await repository.list({ language: 'en' });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should filter by isActive', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [createMockDbRow()] });

      await repository.list({ isActive: false });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should order by different fields', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [createMockDbRow()] });

      await repository.list({ orderBy: 'title', orderDirection: 'asc' });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should use default options when not provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await repository.list();

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('findWithoutEmbeddings', () => {
    it('should find entries without embeddings', async () => {
      const mockRows = [
        createMockDbRow({ id: 'kb-1', embedding: null }),
        createMockDbRow({ id: 'kb-2', embedding: null }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findWithoutEmbeddings(100);

      expect(result).toHaveLength(2);
    });

    it('should use default limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.findWithoutEmbeddings();

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [100]);
    });
  });

  describe('search', () => {
    it('should perform semantic search', async () => {
      const mockRows = [
        { ...createMockDbRow({ id: 'kb-1' }), similarity: '0.85' },
        { ...createMockDbRow({ id: 'kb-2' }), similarity: '0.75' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.search([0.1, 0.2, 0.3], { topK: 5 });

      expect(result).toHaveLength(2);
      expect(result[0].similarity).toBe(0.85);
    });

    it('should use default options', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.search([0.1, 0.2, 0.3]);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.search([0.1, 0.2, 0.3], {
        filters: {
          sourceType: 'faq',
          sourceTypes: ['faq', 'clinic_protocol'],
          clinicId: 'clinic-123',
          language: 'ro',
          tags: ['test'],
          excludeIds: ['kb-exclude'],
        },
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('hybridSearch', () => {
    it('should perform hybrid search', async () => {
      const mockRows = [
        {
          id: 'kb-1',
          source_type: 'faq',
          source_id: null,
          title: 'Test',
          content: 'Content',
          clinic_id: null,
          metadata: {},
          semantic_score: '0.85',
          keyword_score: '0.65',
          combined_score: '0.79',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.hybridSearch([0.1, 0.2, 0.3], 'test query', { topK: 5 });

      expect(result).toHaveLength(1);
      expect(result[0].semanticScore).toBe(0.85);
      expect(result[0].keywordScore).toBe(0.65);
      expect(result[0].combinedScore).toBe(0.79);
    });

    it('should filter by similarity threshold', async () => {
      const mockRows = [
        {
          id: 'kb-1',
          source_type: 'faq',
          source_id: null,
          title: 'Test',
          content: 'Content',
          clinic_id: null,
          metadata: {},
          semantic_score: '0.4', // Below default threshold
          keyword_score: '0.65',
          combined_score: '0.49',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.hybridSearch([0.1, 0.2, 0.3], 'test query', {
        similarityThreshold: 0.5,
      });

      expect(result).toHaveLength(0);
    });

    it('should use custom weights', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.hybridSearch([0.1, 0.2, 0.3], 'test query', {
        semanticWeight: 0.8,
        keywordWeight: 0.2,
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.hybridSearch([0.1, 0.2, 0.3], 'test query', {
        filters: {
          sourceType: 'clinic_protocol',
          clinicId: 'clinic-456',
        },
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createKnowledgeBaseRepository', () => {
  it('should create a repository instance', () => {
    const mockPool = createMockPool();
    const repository = createKnowledgeBaseRepository(mockPool as unknown as import('pg').Pool);

    expect(repository).toBeInstanceOf(KnowledgeBaseRepository);
  });
});
