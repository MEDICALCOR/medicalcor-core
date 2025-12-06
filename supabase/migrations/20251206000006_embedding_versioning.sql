-- ============================================================================
-- MedicalCor Core - Embedding Versioning & Model Upgrade Infrastructure
-- ============================================================================
-- Feature: M14 - Embedding versioning with model upgrade path
-- ============================================================================

-- =============================================================================
-- Embedding Model Versions Table
-- =============================================================================
-- Tracks all embedding model versions and their metadata
CREATE TABLE IF NOT EXISTS embedding_model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'openai',
    dimensions INTEGER NOT NULL,
    max_input_tokens INTEGER NOT NULL DEFAULT 8191,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'supported', 'deprecated', 'retired')),
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    released_at TIMESTAMPTZ NOT NULL,
    deprecated_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    migrate_to VARCHAR(100) REFERENCES embedding_model_versions(model_id),
    cost_per_1m_tokens DECIMAL(10, 4) NOT NULL,
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial model versions
INSERT INTO embedding_model_versions (
    model_id, display_name, provider, dimensions, max_input_tokens,
    status, version, released_at, deprecated_at, cost_per_1m_tokens, quality_score, notes
) VALUES
    ('text-embedding-3-small', 'Text Embedding 3 Small', 'openai', 1536, 8191,
     'active', '1.0.0', '2024-01-25', NULL, 0.02, 85,
     'Cost-effective model with excellent quality for most use cases'),
    ('text-embedding-3-large', 'Text Embedding 3 Large', 'openai', 3072, 8191,
     'supported', '1.0.0', '2024-01-25', NULL, 0.13, 95,
     'Highest quality model, recommended for precision-critical use cases'),
    ('text-embedding-ada-002', 'Ada 002 (Legacy)', 'openai', 1536, 8191,
     'deprecated', '1.0.0', '2022-12-15', '2024-01-25', 0.10, 70,
     'Legacy model, migrate to text-embedding-3-small for better performance')
ON CONFLICT (model_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    deprecated_at = EXCLUDED.deprecated_at,
    cost_per_1m_tokens = EXCLUDED.cost_per_1m_tokens,
    quality_score = EXCLUDED.quality_score,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Update migrate_to reference after all rows exist
UPDATE embedding_model_versions
SET migrate_to = 'text-embedding-3-small'
WHERE model_id = 'text-embedding-ada-002';

CREATE INDEX IF NOT EXISTS idx_embedding_model_versions_status
    ON embedding_model_versions(status);

-- =============================================================================
-- Embedding Migration Jobs Table
-- =============================================================================
-- Tracks migration jobs for batch embedding upgrades
CREATE TABLE IF NOT EXISTS embedding_migration_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name VARCHAR(200) NOT NULL,
    from_model VARCHAR(100) NOT NULL REFERENCES embedding_model_versions(model_id),
    to_model VARCHAR(100) NOT NULL REFERENCES embedding_model_versions(model_id),
    target_table VARCHAR(100) NOT NULL DEFAULT 'knowledge_base',
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rolling_back')),
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),

    -- Progress tracking
    total_entries INTEGER DEFAULT 0,
    processed_entries INTEGER DEFAULT 0,
    failed_entries INTEGER DEFAULT 0,
    skipped_entries INTEGER DEFAULT 0,

    -- Batch processing configuration
    batch_size INTEGER DEFAULT 50,
    concurrency INTEGER DEFAULT 1,
    delay_between_batches_ms INTEGER DEFAULT 100,

    -- Error handling
    max_retries INTEGER DEFAULT 3,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    estimated_completion_at TIMESTAMPTZ,

    -- Checkpointing for resumability
    last_processed_id UUID,
    checkpoint_data JSONB DEFAULT '{}',

    -- Metadata
    created_by VARCHAR(100),
    correlation_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_migration_jobs_status
    ON embedding_migration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_jobs_from_model
    ON embedding_migration_jobs(from_model);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_jobs_to_model
    ON embedding_migration_jobs(to_model);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_jobs_created_at
    ON embedding_migration_jobs(created_at DESC);

-- =============================================================================
-- Embedding Migration History Table
-- =============================================================================
-- Audit log for individual embedding migrations
CREATE TABLE IF NOT EXISTS embedding_migration_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES embedding_migration_jobs(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL,
    entry_table VARCHAR(100) NOT NULL DEFAULT 'knowledge_base',
    from_model VARCHAR(100) NOT NULL,
    to_model VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'rolled_back')),

    -- Metrics
    processing_time_ms INTEGER,
    tokens_used INTEGER,

    -- Error details
    error_message TEXT,
    error_code VARCHAR(50),

    -- Rollback support
    previous_embedding_hash VARCHAR(64),
    new_embedding_hash VARCHAR(64),
    can_rollback BOOLEAN DEFAULT TRUE,
    rolled_back_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_migration_history_job_id
    ON embedding_migration_history(job_id);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_history_entry_id
    ON embedding_migration_history(entry_id);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_history_status
    ON embedding_migration_history(status);
CREATE INDEX IF NOT EXISTS idx_embedding_migration_history_created_at
    ON embedding_migration_history(created_at DESC);

-- =============================================================================
-- Embedding Health Checks Table
-- =============================================================================
-- Records periodic health checks on embedding quality and consistency
CREATE TABLE IF NOT EXISTS embedding_health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_type VARCHAR(50) NOT NULL
        CHECK (check_type IN ('consistency', 'quality', 'coverage', 'staleness', 'dimension_validation')),
    target_table VARCHAR(100) NOT NULL DEFAULT 'knowledge_base',
    model_id VARCHAR(100) REFERENCES embedding_model_versions(model_id),

    -- Results
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'error')),
    score DECIMAL(5, 2) CHECK (score >= 0 AND score <= 100),

    -- Metrics
    total_checked INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,

    -- Details
    issues JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{}',

    -- Timing
    check_duration_ms INTEGER,
    correlation_id VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_health_checks_check_type
    ON embedding_health_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_embedding_health_checks_status
    ON embedding_health_checks(status);
CREATE INDEX IF NOT EXISTS idx_embedding_health_checks_created_at
    ON embedding_health_checks(created_at DESC);

-- =============================================================================
-- Update existing tables with versioning columns
-- =============================================================================

-- Add embedding_version column to knowledge_base if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_base' AND column_name = 'embedding_version'
    ) THEN
        ALTER TABLE knowledge_base
        ADD COLUMN embedding_version INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_base' AND column_name = 'embedding_generated_at'
    ) THEN
        ALTER TABLE knowledge_base
        ADD COLUMN embedding_generated_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_base' AND column_name = 'embedding_tokens_used'
    ) THEN
        ALTER TABLE knowledge_base
        ADD COLUMN embedding_tokens_used INTEGER;
    END IF;
END $$;

-- Add versioning columns to message_embeddings if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_embeddings' AND column_name = 'embedding_version'
    ) THEN
        ALTER TABLE message_embeddings
        ADD COLUMN embedding_version INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_embeddings' AND column_name = 'embedding_generated_at'
    ) THEN
        ALTER TABLE message_embeddings
        ADD COLUMN embedding_generated_at TIMESTAMPTZ;
    END IF;
END $$;

-- =============================================================================
-- Functions for Embedding Versioning
-- =============================================================================

-- Function to find entries needing migration
CREATE OR REPLACE FUNCTION find_entries_for_migration(
    p_from_model VARCHAR,
    p_to_model VARCHAR,
    p_target_table VARCHAR,
    p_batch_size INTEGER DEFAULT 100,
    p_last_id UUID DEFAULT NULL
)
RETURNS TABLE (
    entry_id UUID,
    content TEXT,
    current_model VARCHAR,
    embedding_version INTEGER
) AS $$
BEGIN
    IF p_target_table = 'knowledge_base' THEN
        RETURN QUERY
        SELECT
            kb.id,
            kb.content,
            kb.embedding_model,
            kb.embedding_version
        FROM knowledge_base kb
        WHERE kb.embedding_model = p_from_model
            AND kb.is_active = TRUE
            AND kb.embedding IS NOT NULL
            AND (p_last_id IS NULL OR kb.id > p_last_id)
        ORDER BY kb.id
        LIMIT p_batch_size;
    ELSIF p_target_table = 'message_embeddings' THEN
        RETURN QUERY
        SELECT
            me.id,
            me.content_sanitized,
            me.embedding_model,
            me.embedding_version
        FROM message_embeddings me
        WHERE me.embedding_model = p_from_model
            AND me.embedding IS NOT NULL
            AND (p_last_id IS NULL OR me.id > p_last_id)
        ORDER BY me.id
        LIMIT p_batch_size;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update embedding with version tracking
CREATE OR REPLACE FUNCTION update_embedding_with_version(
    p_entry_id UUID,
    p_target_table VARCHAR,
    p_embedding vector,
    p_model VARCHAR,
    p_tokens_used INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated BOOLEAN;
BEGIN
    IF p_target_table = 'knowledge_base' THEN
        UPDATE knowledge_base
        SET
            embedding = p_embedding,
            embedding_model = p_model,
            embedding_version = COALESCE(embedding_version, 0) + 1,
            embedding_generated_at = NOW(),
            embedding_tokens_used = p_tokens_used,
            updated_at = NOW()
        WHERE id = p_entry_id;
        v_updated := FOUND;
    ELSIF p_target_table = 'message_embeddings' THEN
        UPDATE message_embeddings
        SET
            embedding = p_embedding,
            embedding_model = p_model,
            embedding_version = COALESCE(embedding_version, 0) + 1,
            embedding_generated_at = NOW()
        WHERE id = p_entry_id;
        v_updated := FOUND;
    ELSE
        v_updated := FALSE;
    END IF;

    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- Function to get migration job progress
CREATE OR REPLACE FUNCTION get_migration_job_progress(p_job_id UUID)
RETURNS TABLE (
    job_id UUID,
    status VARCHAR,
    progress_percent DECIMAL,
    entries_per_second DECIMAL,
    estimated_time_remaining_seconds INTEGER,
    error_rate DECIMAL
) AS $$
DECLARE
    v_job embedding_migration_jobs%ROWTYPE;
    v_elapsed_seconds DECIMAL;
    v_rate DECIMAL;
    v_remaining INTEGER;
BEGIN
    SELECT * INTO v_job FROM embedding_migration_jobs WHERE id = p_job_id;

    IF v_job.id IS NULL THEN
        RETURN;
    END IF;

    -- Calculate elapsed time
    v_elapsed_seconds := CASE
        WHEN v_job.started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (COALESCE(v_job.completed_at, NOW()) - v_job.started_at))
        ELSE 0
    END;

    -- Calculate processing rate
    v_rate := CASE
        WHEN v_elapsed_seconds > 0 THEN
            v_job.processed_entries::DECIMAL / v_elapsed_seconds
        ELSE 0
    END;

    -- Estimate remaining time
    v_remaining := CASE
        WHEN v_rate > 0 THEN
            ((v_job.total_entries - v_job.processed_entries) / v_rate)::INTEGER
        ELSE NULL
    END;

    RETURN QUERY SELECT
        v_job.id,
        v_job.status,
        CASE
            WHEN v_job.total_entries > 0 THEN
                (v_job.processed_entries::DECIMAL / v_job.total_entries * 100)
            ELSE 0
        END,
        v_rate,
        v_remaining,
        CASE
            WHEN v_job.processed_entries > 0 THEN
                (v_job.failed_entries::DECIMAL / v_job.processed_entries * 100)
            ELSE 0
        END;
END;
$$ LANGUAGE plpgsql;

-- Function to get embedding model distribution
CREATE OR REPLACE FUNCTION get_embedding_model_distribution(p_target_table VARCHAR DEFAULT 'knowledge_base')
RETURNS TABLE (
    model VARCHAR,
    entry_count BIGINT,
    percentage DECIMAL,
    avg_version DECIMAL,
    oldest_embedding TIMESTAMPTZ,
    newest_embedding TIMESTAMPTZ
) AS $$
BEGIN
    IF p_target_table = 'knowledge_base' THEN
        RETURN QUERY
        SELECT
            kb.embedding_model::VARCHAR,
            COUNT(*)::BIGINT,
            (COUNT(*)::DECIMAL / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100),
            AVG(kb.embedding_version)::DECIMAL,
            MIN(kb.embedding_generated_at),
            MAX(kb.embedding_generated_at)
        FROM knowledge_base kb
        WHERE kb.embedding IS NOT NULL AND kb.is_active = TRUE
        GROUP BY kb.embedding_model
        ORDER BY COUNT(*) DESC;
    ELSIF p_target_table = 'message_embeddings' THEN
        RETURN QUERY
        SELECT
            me.embedding_model::VARCHAR,
            COUNT(*)::BIGINT,
            (COUNT(*)::DECIMAL / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100),
            AVG(me.embedding_version)::DECIMAL,
            MIN(me.embedding_generated_at),
            MAX(me.embedding_generated_at)
        FROM message_embeddings me
        WHERE me.embedding IS NOT NULL
        GROUP BY me.embedding_model
        ORDER BY COUNT(*) DESC;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to validate embedding dimensions
CREATE OR REPLACE FUNCTION validate_embedding_dimensions(
    p_target_table VARCHAR DEFAULT 'knowledge_base',
    p_sample_size INTEGER DEFAULT 100
)
RETURNS TABLE (
    model VARCHAR,
    expected_dimensions INTEGER,
    entries_checked BIGINT,
    valid_count BIGINT,
    invalid_count BIGINT,
    null_count BIGINT
) AS $$
BEGIN
    IF p_target_table = 'knowledge_base' THEN
        RETURN QUERY
        WITH model_dims AS (
            SELECT model_id, dimensions FROM embedding_model_versions
        ),
        samples AS (
            SELECT
                kb.embedding_model,
                kb.embedding,
                md.dimensions AS expected_dims
            FROM knowledge_base kb
            LEFT JOIN model_dims md ON md.model_id = kb.embedding_model
            WHERE kb.is_active = TRUE
            LIMIT p_sample_size
        )
        SELECT
            s.embedding_model::VARCHAR,
            MAX(s.expected_dims)::INTEGER,
            COUNT(*)::BIGINT,
            COUNT(CASE WHEN s.embedding IS NOT NULL
                AND array_length(s.embedding::real[], 1) = s.expected_dims THEN 1 END)::BIGINT,
            COUNT(CASE WHEN s.embedding IS NOT NULL
                AND array_length(s.embedding::real[], 1) != s.expected_dims THEN 1 END)::BIGINT,
            COUNT(CASE WHEN s.embedding IS NULL THEN 1 END)::BIGINT
        FROM samples s
        GROUP BY s.embedding_model;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trigger_embedding_model_versions_updated_at
    BEFORE UPDATE ON embedding_model_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_embedding_migration_jobs_updated_at
    BEFORE UPDATE ON embedding_migration_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Indexes for embedding versioning queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_model
    ON knowledge_base(embedding_model)
    WHERE embedding IS NOT NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_version
    ON knowledge_base(embedding_version);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding_model
    ON message_embeddings(embedding_model)
    WHERE embedding IS NOT NULL;

-- Composite index for migration queries
CREATE INDEX IF NOT EXISTS idx_knowledge_base_migration_lookup
    ON knowledge_base(embedding_model, id)
    WHERE embedding IS NOT NULL AND is_active = TRUE;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE embedding_model_versions IS
    'Registry of all embedding model versions with metadata and migration paths';

COMMENT ON TABLE embedding_migration_jobs IS
    'Tracks batch embedding migration jobs with progress and checkpointing';

COMMENT ON TABLE embedding_migration_history IS
    'Audit log for individual embedding migrations with rollback support';

COMMENT ON TABLE embedding_health_checks IS
    'Records of periodic embedding health and quality checks';

COMMENT ON FUNCTION find_entries_for_migration IS
    'Find entries that need to be migrated from one embedding model to another';

COMMENT ON FUNCTION update_embedding_with_version IS
    'Update an entry embedding with version tracking';

COMMENT ON FUNCTION get_migration_job_progress IS
    'Get detailed progress information for a migration job';

COMMENT ON FUNCTION get_embedding_model_distribution IS
    'Get distribution of embedding models across entries';

COMMENT ON FUNCTION validate_embedding_dimensions IS
    'Validate that embeddings have correct dimensions for their model';
