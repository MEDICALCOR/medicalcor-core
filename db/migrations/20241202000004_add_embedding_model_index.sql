-- migrate:up
-- ============================================================================
-- Embedding Model Index and Helper Functions
--
-- Adds indexes and functions to support:
-- - Finding entries with outdated embedding models
-- - Efficient batch updates for embedding refresh
-- - Model version tracking statistics
-- ============================================================================

-- Index for finding entries by embedding model (for refresh jobs)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_model
ON knowledge_base(embedding_model)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding_model
ON message_embeddings(embedding_model);

-- Index for finding entries needing embeddings
CREATE INDEX IF NOT EXISTS idx_knowledge_base_no_embedding
ON knowledge_base(id)
WHERE embedding IS NULL AND is_active = true;

-- ============================================================================
-- Helper function: Find entries with outdated embedding model
-- ============================================================================
CREATE OR REPLACE FUNCTION find_outdated_embeddings(
    p_current_model VARCHAR,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    embedding_model VARCHAR,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.content,
        kb.embedding_model,
        kb.updated_at
    FROM knowledge_base kb
    WHERE kb.is_active = true
      AND kb.embedding IS NOT NULL
      AND (kb.embedding_model IS NULL OR kb.embedding_model != p_current_model)
    ORDER BY kb.updated_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Helper function: Get embedding model statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION get_embedding_model_stats()
RETURNS TABLE (
    embedding_model VARCHAR,
    entry_count BIGINT,
    with_embedding BIGINT,
    without_embedding BIGINT,
    oldest_updated TIMESTAMPTZ,
    newest_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(kb.embedding_model, 'unknown') AS embedding_model,
        COUNT(*) AS entry_count,
        COUNT(*) FILTER (WHERE kb.embedding IS NOT NULL) AS with_embedding,
        COUNT(*) FILTER (WHERE kb.embedding IS NULL) AS without_embedding,
        MIN(kb.updated_at) AS oldest_updated,
        MAX(kb.updated_at) AS newest_updated
    FROM knowledge_base kb
    WHERE kb.is_active = true
    GROUP BY kb.embedding_model
    ORDER BY entry_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Helper function: Batch update embeddings
-- ============================================================================
CREATE OR REPLACE FUNCTION batch_update_embeddings(
    p_updates JSONB -- Array of {id, embedding, model}
)
RETURNS INTEGER AS $$
DECLARE
    v_update JSONB;
    v_count INTEGER := 0;
BEGIN
    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        UPDATE knowledge_base
        SET
            embedding = (v_update->>'embedding')::vector,
            embedding_model = v_update->>'model',
            updated_at = NOW()
        WHERE id = (v_update->>'id')::UUID;

        IF FOUND THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Add created_by column if not exists (for audit trail)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_base' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE knowledge_base ADD COLUMN created_by VARCHAR(255);
    END IF;
END $$;

-- ============================================================================
-- Add source_id column if not exists (for external references)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_base' AND column_name = 'source_id'
    ) THEN
        ALTER TABLE knowledge_base ADD COLUMN source_id VARCHAR(255);
    END IF;
END $$;

-- migrate:down
DROP FUNCTION IF EXISTS batch_update_embeddings(JSONB);
DROP FUNCTION IF EXISTS get_embedding_model_stats();
DROP FUNCTION IF EXISTS find_outdated_embeddings(VARCHAR, INTEGER);
DROP INDEX IF EXISTS idx_knowledge_base_no_embedding;
DROP INDEX IF EXISTS idx_message_embeddings_embedding_model;
DROP INDEX IF EXISTS idx_knowledge_base_embedding_model;
