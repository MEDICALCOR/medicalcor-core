/**
 * @fileoverview PostgreSQL Vector Search Service
 *
 * Infrastructure adapter for pgvector-based semantic search.
 * Provides vector storage and similarity search for clinical embeddings.
 *
 * @module infrastructure/ai/vector-search/PgVectorService
 *
 * REQUIREMENTS:
 * - PostgreSQL with pgvector extension
 * - OpenAI text-embedding-ada-002 compatible embeddings (1536 dimensions)
 */

import { Pool } from 'pg';

/**
 * HNSW index configuration
 */
export interface HNSWConfig {
  /** Max connections per node (M parameter). Higher = more accurate, slower build. Default: 24 */
  m?: number;
  /** Candidate list size during construction. Higher = better recall. Default: 200 */
  efConstruction?: number;
  /** Default candidate list size during search. Default: 100 */
  efSearchDefault?: number;
}

/**
 * Search profile for adaptive ef_search tuning
 */
export type SearchProfile = 'fast' | 'balanced' | 'accurate' | 'exact';

/**
 * ef_search values by profile for optimal performance/accuracy tradeoff
 */
export const EF_SEARCH_BY_PROFILE: Record<SearchProfile, number> = {
  fast: 40, // ~90% recall, lowest latency
  balanced: 100, // ~95% recall, good balance
  accurate: 200, // ~98% recall, for scoring
  exact: 400, // ~99.5% recall, near-exact
};

/**
 * Configuration for PgVectorService
 */
export interface PgVectorConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum pool size */
  maxPoolSize?: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMs?: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs?: number;
  /** HNSW index configuration */
  hnsw?: HNSWConfig;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Embedding record ID */
  id: string;
  /** Associated case ID */
  caseId: string;
  /** Original content */
  content: string;
  /** Content type */
  contentType: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Search filters
 */
export interface VectorSearchFilters {
  /** Filter by specific case IDs */
  caseIds?: string[];
  /** Filter by content types */
  contentTypes?: string[];
  /** Filter by metadata fields */
  metadata?: Record<string, unknown>;
}

/**
 * Advanced search options for performance tuning
 */
export interface VectorSearchOptions {
  /** Search profile for accuracy/speed tradeoff. Default: 'balanced' */
  profile?: SearchProfile;
  /** Override ef_search directly (takes precedence over profile) */
  efSearch?: number;
}

/**
 * PostgreSQL Vector Service
 *
 * Provides semantic search capabilities using pgvector.
 * Implements HNSW indexing for fast approximate nearest neighbor search.
 *
 * @example
 * ```typescript
 * const vectorService = new PgVectorService({
 *   connectionString: process.env.DATABASE_URL
 * });
 *
 * await vectorService.initialize();
 *
 * // Store embedding
 * const id = await vectorService.storeEmbedding(
 *   caseId,
 *   'Patient presents with...',
 *   'clinical_notes',
 *   embedding,
 *   { riskClass: 'GREEN' }
 * );
 *
 * // Search similar content
 * const results = await vectorService.semanticSearch(
 *   queryEmbedding,
 *   5,
 *   0.7
 * );
 * ```
 */
export class PgVectorService {
  private pool: Pool;
  private initialized = false;
  private hnswConfig: Required<HNSWConfig>;

  constructor(config: PgVectorConfig | string) {
    const connectionConfig = typeof config === 'string' ? { connectionString: config } : config;

    this.pool = new Pool({
      connectionString: connectionConfig.connectionString,
      max: connectionConfig.maxPoolSize ?? 10,
      idleTimeoutMillis: connectionConfig.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: connectionConfig.connectionTimeoutMs ?? 5000,
    });

    // HNSW defaults optimized for medical knowledge base (~10K-100K vectors)
    this.hnswConfig = {
      m: connectionConfig.hnsw?.m ?? 24,
      efConstruction: connectionConfig.hnsw?.efConstruction ?? 200,
      efSearchDefault: connectionConfig.hnsw?.efSearchDefault ?? 100,
    };
  }

  /**
   * Get the connection pool for advanced operations
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Initialize the vector service
   *
   * Creates necessary tables and indexes if they don't exist.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create embeddings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS clinical_embeddings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          case_id UUID NOT NULL,
          content TEXT NOT NULL,
          content_type VARCHAR(50) NOT NULL,
          embedding vector(1536),
          model_version VARCHAR(50) NOT NULL DEFAULT 'text-embedding-ada-002',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB,
          CONSTRAINT unique_case_content UNIQUE (case_id, content_type, content)
        )
      `);

      // Create HNSW index for fast similarity search
      // Parameters tuned for medical knowledge base workload
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_vector
        ON clinical_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = ${this.hnswConfig.m}, ef_construction = ${this.hnswConfig.efConstruction})
      `);

      // Create index for case lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_case
        ON clinical_embeddings(case_id)
      `);

      // Create index for content type filtering
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_content_type
        ON clinical_embeddings(content_type)
      `);

      // Create GIN index for metadata JSONB queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_metadata
        ON clinical_embeddings USING gin(metadata)
      `);

      this.initialized = true;
    } finally {
      client.release();
    }
  }

  /**
   * Store an embedding
   *
   * @param caseId - Associated case ID
   * @param content - Original text content
   * @param contentType - Type of content (e.g., 'clinical_notes')
   * @param embedding - Vector embedding (1536 dimensions)
   * @param metadata - Additional metadata
   * @returns Generated embedding record ID
   */
  async storeEmbedding(
    caseId: string,
    content: string,
    contentType: string,
    embedding: number[],
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536-dimensional embedding, got ${embedding.length}`);
    }

    const client = await this.pool.connect();
    try {
      // Use upsert to handle duplicates
      const result = await client.query<{ id: string }>(
        `INSERT INTO clinical_embeddings
          (case_id, content, content_type, embedding, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)
         ON CONFLICT (case_id, content_type, content)
         DO UPDATE SET
           embedding = EXCLUDED.embedding,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING id`,
        [
          caseId,
          content,
          contentType,
          `[${embedding.join(',')}]`,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      const insertedRow = result.rows[0];
      if (!insertedRow) {
        throw new Error('Failed to insert embedding - no row returned');
      }
      return insertedRow.id;
    } finally {
      client.release();
    }
  }

  /**
   * Compute ef_search value based on options and defaults
   */
  private computeEfSearch(limit: number, options?: VectorSearchOptions): number {
    // Direct ef_search override takes precedence
    if (options?.efSearch) {
      return options.efSearch;
    }

    // Use profile-based ef_search
    const profile = options?.profile ?? 'balanced';
    const baseEfSearch = EF_SEARCH_BY_PROFILE[profile];

    // ef_search should be at least 2x limit for good recall
    return Math.max(baseEfSearch, limit * 2);
  }

  /**
   * Perform semantic search
   *
   * @param queryEmbedding - Query vector embedding
   * @param limit - Maximum number of results
   * @param threshold - Minimum similarity threshold (0-1)
   * @param filters - Optional filters
   * @param options - Performance tuning options
   * @returns Sorted array of search results
   */
  async semanticSearch(
    queryEmbedding: number[],
    limit = 10,
    threshold = 0.7,
    filters?: VectorSearchFilters,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (queryEmbedding.length !== 1536) {
      throw new Error(`Expected 1536-dimensional embedding, got ${queryEmbedding.length}`);
    }

    const client = await this.pool.connect();
    try {
      // Set ef_search for this query based on profile/options
      const efSearch = this.computeEfSearch(limit, options);
      await client.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);

      // Build query with filters
      let query = `
        SELECT
          id,
          case_id,
          content,
          content_type,
          1 - (embedding <=> $1::vector) as similarity,
          metadata
        FROM clinical_embeddings
        WHERE 1=1
      `;

      const params: unknown[] = [`[${queryEmbedding.join(',')}]`];
      let paramIndex = 2;

      // Add case ID filter
      if (filters?.caseIds && filters.caseIds.length > 0) {
        query += ` AND case_id = ANY($${paramIndex}::uuid[])`;
        params.push(filters.caseIds);
        paramIndex++;
      }

      // Add content type filter
      if (filters?.contentTypes && filters.contentTypes.length > 0) {
        query += ` AND content_type = ANY($${paramIndex}::varchar[])`;
        params.push(filters.contentTypes);
        paramIndex++;
      }

      // Add metadata filters
      if (filters?.metadata) {
        for (const [key, value] of Object.entries(filters.metadata)) {
          query += ` AND metadata->>'${key}' = $${paramIndex}`;
          params.push(String(value));
          paramIndex++;
        }
      }

      // Add similarity threshold and ordering
      query += `
        AND (1 - (embedding <=> $1::vector)) > $${paramIndex}
        ORDER BY embedding <=> $1::vector
        LIMIT $${paramIndex + 1}
      `;
      params.push(threshold, limit);

      const result = await client.query<{
        id: string;
        case_id: string;
        content: string;
        content_type: string;
        similarity: string;
        metadata: Record<string, unknown> | null;
      }>(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        content: row.content,
        contentType: row.content_type,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata ?? {},
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Find similar cases based on case content
   *
   * @param caseId - Source case ID
   * @param limit - Maximum number of similar cases
   * @param threshold - Minimum similarity threshold
   * @returns Similar cases (excluding the source case)
   */
  async findSimilarCases(
    caseId: string,
    limit = 5,
    threshold = 0.7
  ): Promise<VectorSearchResult[]> {
    const client = await this.pool.connect();
    try {
      // Get embeddings for the source case
      const sourceResult = await client.query<{ embedding: string }>(
        `SELECT embedding FROM clinical_embeddings
         WHERE case_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [caseId]
      );

      const sourceRow = sourceResult.rows[0];
      if (!sourceRow) {
        return [];
      }

      // Parse the embedding
      const embeddingStr = sourceRow.embedding;
      const embedding = JSON.parse(
        embeddingStr.replace(/^\[/, '[').replace(/\]$/, ']')
      ) as number[];

      // Search for similar, excluding the source case
      const results = await this.semanticSearch(
        embedding,
        limit + 1, // Get one extra in case source is included
        threshold
      );

      // Filter out the source case
      return results.filter((r) => r.caseId !== caseId).slice(0, limit);
    } finally {
      client.release();
    }
  }

  /**
   * Delete embeddings for a case
   *
   * @param caseId - Case ID to delete embeddings for
   * @returns Number of deleted records
   */
  async deleteEmbeddingsForCase(caseId: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM clinical_embeddings WHERE case_id = $1', [
      caseId,
    ]);
    return result.rowCount ?? 0;
  }

  /**
   * Get embedding statistics
   */
  async getStatistics(): Promise<{
    totalEmbeddings: number;
    uniqueCases: number;
    contentTypes: Record<string, number>;
    averageSimilarity: number;
  }> {
    const client = await this.pool.connect();
    try {
      const [countResult, casesResult, typesResult] = await Promise.all([
        client.query<{ count: string }>('SELECT COUNT(*) as count FROM clinical_embeddings'),
        client.query<{ count: string }>(
          'SELECT COUNT(DISTINCT case_id) as count FROM clinical_embeddings'
        ),
        client.query<{ content_type: string; count: string }>(
          'SELECT content_type, COUNT(*) as count FROM clinical_embeddings GROUP BY content_type'
        ),
      ]);

      const contentTypes: Record<string, number> = {};
      for (const row of typesResult.rows) {
        contentTypes[row.content_type] = parseInt(row.count, 10);
      }

      return {
        totalEmbeddings: parseInt(countResult.rows[0]?.count ?? '0', 10),
        uniqueCases: parseInt(casesResult.rows[0]?.count ?? '0', 10),
        contentTypes,
        averageSimilarity: 0, // Would need pairwise computation
      };
    } finally {
      client.release();
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latencyMs: number;
    details?: string;
  }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.initialized = false;
  }
}
