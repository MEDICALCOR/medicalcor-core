import crypto from 'crypto';
import type { Pool } from 'pg';
import type {
  KnowledgeEntry,
  CreateKnowledgeEntry,
  SearchFilters,
  KnowledgeSourceType,
  Language,
} from './types.js';

/**
 * Knowledge Base Repository
 *
 * Handles CRUD operations for the knowledge base with pgvector support
 */

// =============================================================================
// Repository Interface
// =============================================================================

export interface IKnowledgeBaseRepository {
  create(entry: CreateKnowledgeEntry): Promise<KnowledgeEntry>;
  createBatch(entries: CreateKnowledgeEntry[]): Promise<KnowledgeEntry[]>;
  findById(id: string): Promise<KnowledgeEntry | null>;
  findByContentHash(hash: string): Promise<KnowledgeEntry | null>;
  update(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | null>;
  updateEmbedding(id: string, embedding: number[]): Promise<void>;
  updateEmbeddingsBatch(updates: Array<{ id: string; embedding: number[] }>): Promise<void>;
  delete(id: string): Promise<boolean>;
  softDelete(id: string): Promise<boolean>;
  list(options?: ListOptions): Promise<PaginatedResult<KnowledgeEntry>>;
  findWithoutEmbeddings(limit?: number): Promise<KnowledgeEntry[]>;
  search(
    queryEmbedding: number[],
    options?: SearchQueryOptions
  ): Promise<Array<KnowledgeEntry & { similarity: number }>>;
  hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    options?: HybridSearchOptions
  ): Promise<Array<KnowledgeEntry & { semanticScore: number; keywordScore: number; combinedScore: number }>>;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  sourceType?: KnowledgeSourceType;
  clinicId?: string;
  language?: Language;
  isActive?: boolean;
  orderBy?: 'created_at' | 'updated_at' | 'title';
  orderDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SearchQueryOptions {
  topK?: number;
  similarityThreshold?: number;
  filters?: SearchFilters;
}

export interface HybridSearchOptions extends SearchQueryOptions {
  semanticWeight?: number;
  keywordWeight?: number;
}

// =============================================================================
// PostgreSQL Implementation
// =============================================================================

export class KnowledgeBaseRepository implements IKnowledgeBaseRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new knowledge entry
   */
  async create(entry: CreateKnowledgeEntry): Promise<KnowledgeEntry> {
    const contentHash = this.hashContent(entry.content);

    const query = `
      INSERT INTO knowledge_base (
        source_type, source_id, title, content, content_hash,
        chunk_index, chunk_total, parent_id, embedding,
        clinic_id, language, tags, metadata, version, is_active, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *
    `;

    const values = [
      entry.sourceType,
      entry.sourceId ?? null,
      entry.title,
      entry.content,
      contentHash,
      entry.chunkIndex ?? 0,
      entry.chunkTotal ?? 1,
      entry.parentId ?? null,
      entry.embedding ? this.vectorToString(entry.embedding) : null,
      entry.clinicId ?? null,
      entry.language ?? 'ro',
      entry.tags ?? [],
      JSON.stringify(entry.metadata ?? {}),
      entry.version ?? 1,
      entry.isActive ?? true,
      entry.createdBy ?? null,
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToEntry(result.rows[0]);
  }

  /**
   * Create multiple entries in a batch
   */
  async createBatch(entries: CreateKnowledgeEntry[]): Promise<KnowledgeEntry[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const results: KnowledgeEntry[] = [];

      for (const entry of entries) {
        const contentHash = this.hashContent(entry.content);

        const query = `
          INSERT INTO knowledge_base (
            source_type, source_id, title, content, content_hash,
            chunk_index, chunk_total, parent_id, embedding,
            clinic_id, language, tags, metadata, version, is_active, created_by
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (content_hash, chunk_index) DO UPDATE
          SET updated_at = NOW()
          RETURNING *
        `;

        const values = [
          entry.sourceType,
          entry.sourceId ?? null,
          entry.title,
          entry.content,
          contentHash,
          entry.chunkIndex ?? 0,
          entry.chunkTotal ?? 1,
          entry.parentId ?? null,
          entry.embedding ? this.vectorToString(entry.embedding) : null,
          entry.clinicId ?? null,
          entry.language ?? 'ro',
          entry.tags ?? [],
          JSON.stringify(entry.metadata ?? {}),
          entry.version ?? 1,
          entry.isActive ?? true,
          entry.createdBy ?? null,
        ];

        const result = await client.query(query, values);
        results.push(this.mapRowToEntry(result.rows[0]));
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find entry by ID
   */
  async findById(id: string): Promise<KnowledgeEntry | null> {
    const query = 'SELECT * FROM knowledge_base WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToEntry(result.rows[0]) : null;
  }

  /**
   * Find entry by content hash
   */
  async findByContentHash(hash: string): Promise<KnowledgeEntry | null> {
    const query = 'SELECT * FROM knowledge_base WHERE content_hash = $1 AND chunk_index = 0';
    const result = await this.pool.query(query, [hash]);
    return result.rows[0] ? this.mapRowToEntry(result.rows[0]) : null;
  }

  /**
   * Update an entry
   */
  async update(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | null> {
    const allowedFields = [
      'title',
      'content',
      'source_type',
      'source_id',
      'clinic_id',
      'language',
      'tags',
      'metadata',
      'is_active',
      'version',
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = this.camelToSnake(key);
      if (allowedFields.includes(snakeKey) && value !== undefined) {
        setClauses.push(`${snakeKey} = $${paramIndex}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updates.content) {
      setClauses.push(`content_hash = $${paramIndex}`);
      values.push(this.hashContent(updates.content));
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE knowledge_base
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.mapRowToEntry(result.rows[0]) : null;
  }

  /**
   * Update embedding for an entry
   */
  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const query = `
      UPDATE knowledge_base
      SET embedding = $1, updated_at = NOW()
      WHERE id = $2
    `;
    await this.pool.query(query, [this.vectorToString(embedding), id]);
  }

  /**
   * Batch update embeddings
   */
  async updateEmbeddingsBatch(updates: Array<{ id: string; embedding: number[] }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const { id, embedding } of updates) {
        await client.query(
          'UPDATE knowledge_base SET embedding = $1, updated_at = NOW() WHERE id = $2',
          [this.vectorToString(embedding), id]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Hard delete an entry
   */
  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM knowledge_base WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Soft delete (set is_active = false)
   */
  async softDelete(id: string): Promise<boolean> {
    const query = 'UPDATE knowledge_base SET is_active = FALSE, updated_at = NOW() WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List entries with pagination
   */
  async list(options: ListOptions = {}): Promise<PaginatedResult<KnowledgeEntry>> {
    const {
      page = 1,
      pageSize = 20,
      sourceType,
      clinicId,
      language,
      isActive = true,
      orderBy = 'created_at',
      orderDirection = 'desc',
    } = options;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (sourceType) {
      conditions.push(`source_type = $${paramIndex++}`);
      values.push(sourceType);
    }

    if (clinicId) {
      conditions.push(`(clinic_id = $${paramIndex++} OR clinic_id IS NULL)`);
      values.push(clinicId);
    }

    if (language) {
      conditions.push(`language = $${paramIndex++}`);
      values.push(language);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderColumn = this.camelToSnake(orderBy);
    const offset = (page - 1) * pageSize;

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM knowledge_base ${whereClause}`;
    const countResult = await this.pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get items
    const listQuery = `
      SELECT * FROM knowledge_base
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection.toUpperCase()}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const listResult = await this.pool.query(listQuery, [...values, pageSize, offset]);

    return {
      items: listResult.rows.map((row) => this.mapRowToEntry(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Find entries without embeddings (for batch processing)
   */
  async findWithoutEmbeddings(limit = 100): Promise<KnowledgeEntry[]> {
    const query = `
      SELECT * FROM knowledge_base
      WHERE embedding IS NULL AND is_active = TRUE
      ORDER BY created_at ASC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Semantic search using pgvector
   */
  async search(
    queryEmbedding: number[],
    options: SearchQueryOptions = {}
  ): Promise<Array<KnowledgeEntry & { similarity: number }>> {
    const { topK = 5, similarityThreshold = 0.7, filters = {} } = options;

    const query = `
      SELECT
        kb.*,
        (1 - (kb.embedding <=> $1)) AS similarity
      FROM knowledge_base kb
      WHERE
        kb.is_active = TRUE
        AND kb.embedding IS NOT NULL
        AND (1 - (kb.embedding <=> $1)) >= $2
        ${filters.sourceType ? 'AND kb.source_type = $4' : ''}
        ${filters.sourceTypes?.length ? `AND kb.source_type = ANY($${filters.sourceType ? 5 : 4})` : ''}
        ${filters.clinicId ? `AND (kb.clinic_id = $${this.getParamIndex(filters, 'clinicId')} OR kb.clinic_id IS NULL)` : ''}
        ${filters.language ? `AND kb.language = $${this.getParamIndex(filters, 'language')}` : ''}
        ${filters.tags?.length ? `AND kb.tags && $${this.getParamIndex(filters, 'tags')}` : ''}
        ${filters.excludeIds?.length ? `AND kb.id != ALL($${this.getParamIndex(filters, 'excludeIds')})` : ''}
      ORDER BY kb.embedding <=> $1
      LIMIT $3
    `;

    const values: unknown[] = [this.vectorToString(queryEmbedding), similarityThreshold, topK];

    if (filters.sourceType) values.push(filters.sourceType);
    if (filters.sourceTypes?.length) values.push(filters.sourceTypes);
    if (filters.clinicId) values.push(filters.clinicId);
    if (filters.language) values.push(filters.language);
    if (filters.tags?.length) values.push(filters.tags);
    if (filters.excludeIds?.length) values.push(filters.excludeIds);

    const result = await this.pool.query(query, values);

    return result.rows.map((row) => ({
      ...this.mapRowToEntry(row),
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    options: HybridSearchOptions = {}
  ): Promise<
    Array<KnowledgeEntry & { semanticScore: number; keywordScore: number; combinedScore: number }>
  > {
    const {
      topK = 5,
      similarityThreshold = 0.5,
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      filters = {},
    } = options;

    // Use the database hybrid search function
    const query = `
      SELECT * FROM hybrid_search_knowledge_base(
        $1::vector,
        $2::text,
        $3::decimal,
        $4::decimal,
        $5::integer,
        $6::varchar,
        $7::varchar
      )
    `;

    const values = [
      this.vectorToString(queryEmbedding),
      queryText,
      semanticWeight,
      keywordWeight,
      topK,
      filters.sourceType ?? null,
      filters.clinicId ?? null,
    ];

    const result = await this.pool.query(query, values);

    return result.rows
      .filter((row) => parseFloat(row.semantic_score) >= similarityThreshold)
      .map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.title,
        content: row.content,
        contentHash: '',
        chunkIndex: 0,
        chunkTotal: 1,
        embedding: undefined,
        clinicId: row.clinic_id,
        language: 'ro' as Language,
        tags: [],
        metadata: row.metadata ?? {},
        version: 1,
        isActive: true,
        semanticScore: parseFloat(row.semantic_score),
        keywordScore: parseFloat(row.keyword_score),
        combinedScore: parseFloat(row.combined_score),
      }));
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private vectorToString(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private getParamIndex(filters: SearchFilters, field: keyof SearchFilters): number {
    let index = 4; // Start after $1, $2, $3
    const order: (keyof SearchFilters)[] = [
      'sourceType',
      'sourceTypes',
      'clinicId',
      'language',
      'tags',
      'excludeIds',
    ];
    for (const f of order) {
      if (f === field) return index;
      if (filters[f] !== undefined) index++;
    }
    return index;
  }

  private mapRowToEntry(row: Record<string, unknown>): KnowledgeEntry {
    return {
      id: row.id as string,
      sourceType: row.source_type as KnowledgeSourceType,
      sourceId: row.source_id as string | undefined,
      title: row.title as string,
      content: row.content as string,
      contentHash: row.content_hash as string,
      chunkIndex: row.chunk_index as number,
      chunkTotal: row.chunk_total as number,
      parentId: row.parent_id as string | undefined,
      embedding: row.embedding ? this.parseVector(row.embedding as string) : undefined,
      clinicId: row.clinic_id as string | undefined,
      language: row.language as Language,
      tags: row.tags as string[],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      version: row.version as number,
      isActive: row.is_active as boolean,
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
      createdBy: row.created_by as string | undefined,
    };
  }

  private parseVector(vectorString: string): number[] {
    // pgvector returns vectors as '[1,2,3,...]'
    const cleaned = vectorString.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((n) => parseFloat(n));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createKnowledgeBaseRepository(pool: Pool): KnowledgeBaseRepository {
  return new KnowledgeBaseRepository(pool);
}
