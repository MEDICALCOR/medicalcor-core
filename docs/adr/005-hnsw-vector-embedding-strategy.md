# ADR-005: HNSW Vector Embedding Strategy and Model Migration

## Status

**IMPLEMENTED** - 2025-12-07

## Context

MedicalCor uses vector embeddings for semantic search across multiple domains:

- **Knowledge Base**: FAQ, treatment info, pricing documentation
- **Episodic Memory**: Patient interaction history and patterns
- **Clinical Embeddings**: Case notes and clinical documentation
- **Message Embeddings**: Conversation context for RAG

The system relies on:

- **OpenAI text-embedding-ada-002**: 1536-dimensional embeddings
- **pgvector (PostgreSQL extension)**: Vector storage and similarity search
- **HNSW indexes**: Approximate Nearest Neighbor (ANN) search

### Challenges

1. **Model Evolution**: OpenAI and other providers release new embedding models with different dimensions
2. **Index Rebuilding**: HNSW indexes are dimension-specific and must be rebuilt for new dimensions
3. **Migration Downtime**: Reindexing millions of vectors can take hours
4. **Performance Tuning**: HNSW parameters must be tuned for dataset size and query patterns

## Decision

Implement a documented, repeatable strategy for vector embedding model changes with:

1. **Standardized HNSW parameters** optimized for medical knowledge workloads
2. **Zero-downtime migration procedure** using shadow indexes
3. **Performance benchmarking tools** for validation
4. **Rollback procedures** for failed migrations

---

## Current Implementation

### Embedding Configuration

| Component           | Model                  | Dimensions | Notes                   |
| ------------------- | ---------------------- | ---------- | ----------------------- |
| Knowledge Base      | text-embedding-ada-002 | 1536       | Primary semantic search |
| Episodic Events     | text-embedding-ada-002 | 1536       | Memory retrieval        |
| Clinical Embeddings | text-embedding-ada-002 | 1536       | Case similarity         |
| Message Embeddings  | text-embedding-ada-002 | 1536       | Conversation context    |

### HNSW Parameters

| Parameter               | Value | Rationale                                                                                  |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------ |
| **M**                   | 24    | Connections per node. Higher = better recall, more memory. 24 optimal for 10K-100K vectors |
| **ef_construction**     | 200   | Build-time candidate list. Higher = better index quality, longer build time                |
| **ef_search** (default) | 100   | Runtime candidate list. Adaptive based on query profile                                    |

### Adaptive ef_search Profiles

```sql
-- Profile configurations for different use cases
CASE query_profile
    WHEN 'fast' THEN 40      -- ~90% recall, lowest latency (real-time suggestions)
    WHEN 'balanced' THEN 100 -- ~95% recall, good balance (default queries)
    WHEN 'accurate' THEN 200 -- ~98% recall (scoring, important decisions)
    WHEN 'exact' THEN 400    -- ~99.5% recall (critical operations)
END
```

### Index Definitions

```sql
-- Optimized HNSW indexes
CREATE INDEX idx_knowledge_base_embedding_hnsw_v2
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 200);

-- Partial indexes for common filter patterns
CREATE INDEX idx_kb_embedding_active_only
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 200)
    WHERE is_active = TRUE AND embedding IS NOT NULL;
```

---

## Embedding Model Migration Procedure

### Phase 1: Preparation (Before Migration)

1. **Analyze Current State**

   ```sql
   -- Get vector statistics
   SELECT
     COUNT(*) as total_vectors,
     COUNT(*) FILTER (WHERE embedding IS NULL) as null_embeddings,
     pg_size_pretty(pg_relation_size('knowledge_base')) as table_size
   FROM knowledge_base;
   ```

2. **Add Shadow Column**

   ```sql
   -- Add new dimension column (example: 3072 for text-embedding-3-large)
   ALTER TABLE knowledge_base
   ADD COLUMN embedding_v2 vector(3072);
   ```

3. **Estimate Migration Time**
   - OpenAI API: ~100 embeddings/second with rate limiting
   - Database writes: ~1000 vectors/second
   - For 100K records: ~20 minutes embedding + ~2 minutes writing

### Phase 2: Dual-Write Mode

1. **Enable Dual Embedding**

   ```typescript
   // EmbeddingPipeline configuration
   const config = {
     models: {
       current: 'text-embedding-ada-002',
       next: 'text-embedding-3-large',
     },
     dualWrite: true,
     columns: {
       current: 'embedding',
       next: 'embedding_v2',
     },
   };
   ```

2. **Backfill Historical Data**
   - Use Trigger.dev batch jobs
   - Process in chunks of 100
   - Respect rate limits
   - Retry failed embeddings

### Phase 3: Index Creation (Zero-Downtime)

1. **Create Shadow Index Concurrently**

   ```sql
   -- Non-blocking index creation
   CREATE INDEX CONCURRENTLY idx_kb_embedding_v2_hnsw
       ON knowledge_base
       USING hnsw (embedding_v2 vector_cosine_ops)
       WITH (m = 24, ef_construction = 200);
   ```

2. **Benchmark New Index**

   ```typescript
   // Use HNSWOptimizer for validation
   const optimizer = new HNSWOptimizer(pool);
   const results = await optimizer.benchmarkSearch(
     'knowledge_base',
     'embedding_v2',
     testVectors,
     10,
     [40, 100, 200]
   );

   // Verify recall >= 95% at ef_search=100
   assert(results.find((r) => r.params.efSearch === 100)?.recall >= 0.95);
   ```

### Phase 4: Cutover

1. **Atomic Column Swap**

   ```sql
   BEGIN;
   -- Rename columns atomically
   ALTER TABLE knowledge_base RENAME COLUMN embedding TO embedding_v1_deprecated;
   ALTER TABLE knowledge_base RENAME COLUMN embedding_v2 TO embedding;
   COMMIT;
   ```

2. **Update Application Configuration**

   ```typescript
   // Update embedding dimension validation
   const EMBEDDING_DIMENSION = 3072; // was 1536
   ```

3. **Validate Search Functionality**
   - Run smoke tests against new embeddings
   - Compare search results with previous version
   - Monitor error rates

### Phase 5: Cleanup

1. **Drop Old Resources**

   ```sql
   -- Remove old index
   DROP INDEX CONCURRENTLY idx_knowledge_base_embedding_hnsw;

   -- Remove old column (after verification period)
   ALTER TABLE knowledge_base DROP COLUMN embedding_v1_deprecated;
   ```

2. **Update Model Tracking**
   ```sql
   -- Record migration in metadata
   UPDATE knowledge_base
   SET model_version = 'text-embedding-3-large'
   WHERE model_version = 'text-embedding-ada-002';
   ```

---

## Rollback Procedure

If issues are detected during cutover:

```sql
BEGIN;
-- Reverse the column swap
ALTER TABLE knowledge_base RENAME COLUMN embedding TO embedding_v2_failed;
ALTER TABLE knowledge_base RENAME COLUMN embedding_v1_deprecated TO embedding;
COMMIT;

-- Revert application configuration
-- Notify team of rollback
```

---

## Dataset Size Recommendations

| Dataset Size       | M   | ef_construction | ef_search (default) | Notes                           |
| ------------------ | --- | --------------- | ------------------- | ------------------------------- |
| < 10K vectors      | 16  | 128             | 64                  | Small datasets, fast builds     |
| 10K - 100K vectors | 24  | 200             | 100                 | **Current MedicalCor config**   |
| 100K - 1M vectors  | 32  | 256             | 128                 | Scale up M for better recall    |
| > 1M vectors       | 48  | 400             | 200                 | Consider partitioning by clinic |

---

## Performance Monitoring

### Key Metrics

| Metric               | Target   | Alert Threshold |
| -------------------- | -------- | --------------- |
| P95 Query Latency    | < 100ms  | > 200ms         |
| Recall @ 10          | > 95%    | < 90%           |
| Index Build Time     | < 1 hour | > 2 hours       |
| Embedding Throughput | > 50/sec | < 20/sec        |

### Monitoring Queries

```sql
-- Index health check
SELECT * FROM vector_index_health;

-- Query performance by profile
SELECT
  search_profile,
  AVG(latency_ms) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency
FROM rag_query_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY search_profile;
```

---

## Alternative Embedding Models

When evaluating new embedding models, consider:

| Model                   | Dimensions | Performance | Cost               | Notes                   |
| ----------------------- | ---------- | ----------- | ------------------ | ----------------------- |
| text-embedding-ada-002  | 1536       | Baseline    | $0.0001/1K tokens  | Current production      |
| text-embedding-3-small  | 1536       | Better      | $0.00002/1K tokens | 5x cheaper              |
| text-embedding-3-large  | 3072       | Best        | $0.00013/1K tokens | Highest quality         |
| Cohere embed-english-v3 | 1024       | Comparable  | $0.0001/1K tokens  | Alternative provider    |
| Voyage-2                | 1024       | Excellent   | $0.00012/1K tokens | Medical-specific option |

---

## Code References

| Component             | Location                                                          |
| --------------------- | ----------------------------------------------------------------- |
| HNSW Optimizer        | `packages/infrastructure/src/ai/vector-search/hnsw-optimizer.ts`  |
| PgVector Service      | `packages/infrastructure/src/ai/vector-search/PgVectorService.ts` |
| Embedding Pipeline    | `packages/infrastructure/src/ai/EmbeddingPipeline.ts`             |
| HNSW Migration        | `supabase/migrations/20251207200001_optimize_hnsw_indexes.sql`    |
| Knowledge Base Config | `packages/core/src/rag/knowledge-base-config.ts`                  |

---

## Consequences

### Positive

- **Zero-downtime migrations**: Shadow index approach enables seamless model upgrades
- **Performance tuning**: Adaptive ef_search profiles optimize for different use cases
- **Documented procedure**: Clear runbook for future embedding model changes
- **Monitoring**: Built-in health checks and performance tracking

### Negative

- **Storage overhead**: Dual-write mode temporarily doubles embedding storage
- **Complexity**: Migration requires coordination across multiple services
- **Cost**: Backfill requires re-embedding all historical content

### Risks & Mitigations

| Risk                              | Mitigation                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| API rate limiting during backfill | Use exponential backoff, batch processing                     |
| Index build locks table           | Use CONCURRENTLY for all index operations                     |
| Dimension mismatch errors         | Validate dimensions before any insert                         |
| Model output drift                | Version-track all embeddings, re-embed on major model updates |

---

## Related ADRs

- [ADR-004: Cognitive Episodic Memory](./004-cognitive-episodic-memory.md) - Uses same embedding infrastructure
- [ADR-002: Cloud-Agnostic Strategy](./002-cloud-agnostic-strategy.md) - Database portability considerations

## References

- [pgvector HNSW Documentation](https://github.com/pgvector/pgvector#hnsw)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [Supabase Vector Performance](https://supabase.com/blog/pgvector-performance)
