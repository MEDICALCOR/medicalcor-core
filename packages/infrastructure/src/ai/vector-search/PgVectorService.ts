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

import { Pool, type PoolClient } from 'pg';

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
  private initialized: boolean = false;

  constructor(config: PgVectorConfig | string) {
    const connectionConfig = typeof config === 'string'
      ? { connectionString: config }
      : config;

    this.pool = new Pool({
      connectionString: connectionConfig.connectionString,
      max: connectionConfig.maxPoolSize ?? 10,
      idleTimeoutMillis: connectionConfig.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: connectionConfig.connectionTimeoutMs ?? 5000,
    });
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
        CREATE TABLE IF NOT EXISTS osax_clinical_embeddings (
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
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_osax_clinical_embeddings_vector
        ON osax_clinical_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);

      // Create index for case lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_osax_clinical_embeddings_case
        ON osax_clinical_embeddings(case_id)
      `);

      // Create index for content type filtering
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_osax_clinical_embeddings_content_type
        ON osax_clinical_embeddings(content_type)
      `);

      // Create GIN index for metadata JSONB queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_osax_clinical_embeddings_metadata
        ON osax_clinical_embeddings USING gin(metadata)
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
        `INSERT INTO osax_clinical_embeddings
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

      return result.rows[0]!.id;
    } finally {
      client.release();
    }
  }

  /**
   * Perform semantic search
   *
   * @param queryEmbedding - Query vector embedding
   * @param limit - Maximum number of results
   * @param threshold - Minimum similarity threshold (0-1)
   * @param filters - Optional filters
   * @returns Sorted array of search results
   */
  async semanticSearch(
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.7,
    filters?: VectorSearchFilters
  ): Promise<VectorSearchResult[]> {
    if (queryEmbedding.length !== 1536) {
      throw new Error(`Expected 1536-dimensional embedding, got ${queryEmbedding.length}`);
    }

    const client = await this.pool.connect();
    try {
      // Build query with filters
      let query = `
        SELECT
          id,
          case_id,
          content,
          content_type,
          1 - (embedding <=> $1::vector) as similarity,
          metadata
        FROM osax_clinical_embeddings
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

      return result.rows.map(row => ({
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
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    const client = await this.pool.connect();
    try {
      // Get embeddings for the source case
      const sourceResult = await client.query<{ embedding: string }>(
        `SELECT embedding FROM osax_clinical_embeddings
         WHERE case_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [caseId]
      );

      if (sourceResult.rows.length === 0) {
        return [];
      }

      // Parse the embedding
      const embeddingStr = sourceResult.rows[0]!.embedding;
      const embedding = JSON.parse(embeddingStr.replace(/^\[/, '[').replace(/\]$/, ']')) as number[];

      // Search for similar, excluding the source case
      const results = await this.semanticSearch(
        embedding,
        limit + 1, // Get one extra in case source is included
        threshold
      );

      // Filter out the source case
      return results.filter(r => r.caseId !== caseId).slice(0, limit);
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
    const result = await this.pool.query(
      'DELETE FROM osax_clinical_embeddings WHERE case_id = $1',
      [caseId]
    );
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
        client.query<{ count: string }>('SELECT COUNT(*) as count FROM osax_clinical_embeddings'),
        client.query<{ count: string }>('SELECT COUNT(DISTINCT case_id) as count FROM osax_clinical_embeddings'),
        client.query<{ content_type: string; count: string }>(
          'SELECT content_type, COUNT(*) as count FROM osax_clinical_embeddings GROUP BY content_type'
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
