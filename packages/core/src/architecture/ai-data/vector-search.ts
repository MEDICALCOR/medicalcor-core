/**
 * @module architecture/ai-data/vector-search
 *
 * Vector Search Infrastructure
 * ============================
 *
 * Semantic search with embeddings and similarity.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// VECTOR TYPES
// ============================================================================

export interface Vector {
  readonly id: string;
  readonly values: number[];
  readonly dimension: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ScoredVector extends Vector {
  readonly score: number;
}

export interface VectorIndexConfig {
  readonly name: string;
  readonly dimension: number;
  readonly metric: DistanceMetric;
  readonly indexType: IndexType;
}

export type DistanceMetric = 'cosine' | 'euclidean' | 'dotproduct';
export type IndexType = 'flat' | 'hnsw' | 'ivfflat';

export interface VectorQuery {
  readonly vector: number[];
  readonly topK: number;
  readonly filter?: VectorFilter;
  readonly namespace?: string;
}

export interface VectorFilter {
  readonly conditions: FilterCondition[];
}

export interface FilterCondition {
  readonly field: string;
  readonly operator: 'eq' | 'ne' | 'gt' | 'lt' | 'in';
  readonly value: unknown;
}

export interface VectorSearchResult {
  readonly matches: ScoredVector[];
  readonly namespace: string;
}

// ============================================================================
// VECTOR STORE ERROR
// ============================================================================

export class VectorStoreError extends Error {
  constructor(
    message: string,
    readonly code: VectorStoreErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}

export type VectorStoreErrorCode =
  | 'INDEX_NOT_FOUND'
  | 'INDEX_ALREADY_EXISTS'
  | 'DIMENSION_MISMATCH'
  | 'INVALID_VECTOR'
  | 'INTERNAL_ERROR';

// ============================================================================
// VECTOR STORE SERVICE
// ============================================================================

export interface VectorStoreService {
  createIndex(config: VectorIndexConfig): Promise<Result<void, VectorStoreError>>;
  deleteIndex(name: string): Promise<Result<void, VectorStoreError>>;
  upsert(
    index: string,
    vectors: Vector[],
    namespace?: string
  ): Promise<Result<{ upsertedCount: number }, VectorStoreError>>;
  query(index: string, query: VectorQuery): Promise<Result<VectorSearchResult, VectorStoreError>>;
  delete(
    index: string,
    ids: string[],
    namespace?: string
  ): Promise<Result<number, VectorStoreError>>;
}

// ============================================================================
// IN-MEMORY VECTOR STORE
// ============================================================================

interface IndexData {
  config: VectorIndexConfig;
  vectors: Map<string, Map<string, Vector>>;
}

export class InMemoryVectorStore implements VectorStoreService {
  private indexes = new Map<string, IndexData>();

  createIndex(config: VectorIndexConfig): Promise<Result<void, VectorStoreError>> {
    if (this.indexes.has(config.name)) {
      return Promise.resolve(
        Err(new VectorStoreError('Index already exists', 'INDEX_ALREADY_EXISTS'))
      );
    }
    const defaultNs = new Map<string, Vector>();
    const vectors = new Map<string, Map<string, Vector>>();
    vectors.set('default', defaultNs);
    this.indexes.set(config.name, { config, vectors });
    return Promise.resolve(Ok(undefined));
  }

  deleteIndex(name: string): Promise<Result<void, VectorStoreError>> {
    if (!this.indexes.has(name)) {
      return Promise.resolve(Err(new VectorStoreError('Index not found', 'INDEX_NOT_FOUND')));
    }
    this.indexes.delete(name);
    return Promise.resolve(Ok(undefined));
  }

  upsert(
    indexName: string,
    vectors: Vector[],
    namespace = 'default'
  ): Promise<Result<{ upsertedCount: number }, VectorStoreError>> {
    const index = this.indexes.get(indexName);
    if (!index) {
      return Promise.resolve(Err(new VectorStoreError('Index not found', 'INDEX_NOT_FOUND')));
    }

    let nsVectors = index.vectors.get(namespace);
    if (!nsVectors) {
      nsVectors = new Map();
      index.vectors.set(namespace, nsVectors);
    }

    for (const vector of vectors) {
      if (vector.values.length !== index.config.dimension) {
        return Promise.resolve(
          Err(
            new VectorStoreError(
              `Dimension mismatch: expected ${index.config.dimension}, got ${vector.values.length}`,
              'DIMENSION_MISMATCH'
            )
          )
        );
      }
      nsVectors.set(vector.id, vector);
    }

    return Promise.resolve(Ok({ upsertedCount: vectors.length }));
  }

  query(
    indexName: string,
    query: VectorQuery
  ): Promise<Result<VectorSearchResult, VectorStoreError>> {
    const index = this.indexes.get(indexName);
    if (!index) {
      return Promise.resolve(Err(new VectorStoreError('Index not found', 'INDEX_NOT_FOUND')));
    }

    const namespace = query.namespace ?? 'default';
    const nsVectors = index.vectors.get(namespace);
    if (!nsVectors) {
      return Promise.resolve(Ok({ matches: [], namespace }));
    }

    const scored: ScoredVector[] = [];
    for (const vector of nsVectors.values()) {
      const score = this.cosineSimilarity(query.vector, vector.values);
      scored.push({ ...vector, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return Promise.resolve(Ok({ matches: scored.slice(0, query.topK), namespace }));
  }

  delete(
    indexName: string,
    ids: string[],
    namespace = 'default'
  ): Promise<Result<number, VectorStoreError>> {
    const index = this.indexes.get(indexName);
    if (!index) {
      return Promise.resolve(Err(new VectorStoreError('Index not found', 'INDEX_NOT_FOUND')));
    }

    const nsVectors = index.vectors.get(namespace);
    if (!nsVectors) {
      return Promise.resolve(Ok(0));
    }

    let deleted = 0;
    for (const id of ids) {
      if (nsVectors.delete(id)) deleted++;
    }
    return Promise.resolve(Ok(deleted));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      magA = 0,
      magB = 0;
    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dot += aVal * bVal;
      magA += aVal * aVal;
      magB += bVal * bVal;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}
