-- ============================================================================
-- MedicalCor Core - Partition Episodic Events Table (H7)
-- ============================================================================
-- Monthly partitioning for episodic_events table to handle 1M+ events scale
-- Following the pattern established in 20251207000001_database_partitioning.sql
-- ============================================================================

-- =============================================================================
-- STEP 1: RENAME EXISTING TABLE
-- =============================================================================

-- Rename the existing table to preserve data
ALTER TABLE IF EXISTS episodic_events RENAME TO episodic_events_old;

-- =============================================================================
-- STEP 2: DROP EXISTING INDEXES (will be recreated on partitioned table)
-- =============================================================================

DROP INDEX IF EXISTS idx_episodic_subject;
DROP INDEX IF EXISTS idx_episodic_type;
DROP INDEX IF EXISTS idx_episodic_channel;
DROP INDEX IF EXISTS idx_episodic_occurred;
DROP INDEX IF EXISTS idx_episodic_embedding_hnsw;
DROP INDEX IF EXISTS idx_episodic_entities;
DROP INDEX IF EXISTS idx_episodic_sentiment;

-- =============================================================================
-- STEP 3: CREATE PARTITIONED TABLE
-- =============================================================================

CREATE TABLE episodic_events (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),

    -- Subject identification (polymorphic reference)
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('lead', 'patient', 'contact')),
    subject_id UUID NOT NULL,

    -- Event classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL CHECK (event_category IN (
        'communication', 'scheduling', 'clinical', 'financial', 'lifecycle', 'other'
    )),
    source_channel VARCHAR(30) NOT NULL CHECK (source_channel IN (
        'whatsapp', 'voice', 'web', 'email', 'crm', 'system'
    )),

    -- Reference to raw event (domain_events)
    raw_event_id UUID,

    -- LLM-generated content
    summary TEXT NOT NULL,
    key_entities JSONB DEFAULT '[]',
    sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    intent VARCHAR(100),

    -- Semantic embedding for similarity search
    embedding vector(1536),
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

    -- Temporal metadata (partition key)
    occurred_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Extensibility
    metadata JSONB DEFAULT '{}',

    -- GDPR compliance (soft delete)
    deleted_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Primary key includes partition key for PostgreSQL requirement
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- =============================================================================
-- STEP 4: CREATE INDEXES ON PARTITIONED TABLE
-- =============================================================================

-- Primary query pattern: get events for a subject (most recent first)
CREATE INDEX idx_episodic_subject ON episodic_events(subject_type, subject_id, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Filter by event type
CREATE INDEX idx_episodic_type ON episodic_events(event_type, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Filter by channel
CREATE INDEX idx_episodic_channel ON episodic_events(source_channel, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Time-range queries
CREATE INDEX idx_episodic_occurred ON episodic_events(occurred_at DESC)
    WHERE deleted_at IS NULL;

-- HNSW index for semantic similarity search
-- Note: This index will be inherited by partitions
CREATE INDEX idx_episodic_embedding_hnsw ON episodic_events
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- GIN index for entity search within JSONB
CREATE INDEX idx_episodic_entities ON episodic_events USING gin(key_entities);

-- Sentiment analysis queries
CREATE INDEX idx_episodic_sentiment ON episodic_events(subject_id, sentiment, occurred_at DESC)
    WHERE deleted_at IS NULL AND sentiment IS NOT NULL;

-- Raw event reference lookup
CREATE INDEX idx_episodic_raw_event ON episodic_events(raw_event_id)
    WHERE raw_event_id IS NOT NULL;

-- =============================================================================
-- STEP 5: CREATE PARTITION MANAGEMENT FUNCTION
-- =============================================================================

-- Function to create a partition for episodic_events for a specific month
CREATE OR REPLACE FUNCTION create_episodic_events_partition(
    p_year INTEGER,
    p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_partition_name := format('episodic_events_y%sm%s', p_year, LPAD(p_month::TEXT, 2, '0'));
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := v_start_date + INTERVAL '1 month';

    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = v_partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF episodic_events FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;

    RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_episodic_events_partition IS 'Creates a monthly partition for episodic_events table';

-- =============================================================================
-- STEP 6: UPDATE ensure_partitions_exist TO INCLUDE EPISODIC_EVENTS
-- =============================================================================

-- Drop existing function to replace it
DROP FUNCTION IF EXISTS ensure_partitions_exist(DATE, DATE);

-- Recreate with episodic_events support
CREATE OR REPLACE FUNCTION ensure_partitions_exist(
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    table_name TEXT,
    partition_name TEXT
) AS $$
DECLARE
    v_current_date DATE;
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_current_date := date_trunc('month', p_start_date)::DATE;

    WHILE v_current_date < p_end_date LOOP
        v_year := EXTRACT(YEAR FROM v_current_date);
        v_month := EXTRACT(MONTH FROM v_current_date);

        -- Create partitions for domain_events
        table_name := 'domain_events';
        partition_name := create_domain_events_partition(v_year, v_month);
        RETURN NEXT;

        -- Create partitions for audit_log
        table_name := 'audit_log';
        partition_name := create_audit_log_partition(v_year, v_month);
        RETURN NEXT;

        -- Create partitions for episodic_events
        table_name := 'episodic_events';
        partition_name := create_episodic_events_partition(v_year, v_month);
        RETURN NEXT;

        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ensure_partitions_exist IS 'Ensures partitions exist for domain_events, audit_log, and episodic_events for a given date range';

-- =============================================================================
-- STEP 7: UPDATE create_future_partitions TO INCLUDE EPISODIC_EVENTS
-- =============================================================================

-- Drop existing function to replace it
DROP FUNCTION IF EXISTS create_future_partitions(INTEGER);

-- Recreate with episodic_events support
CREATE OR REPLACE FUNCTION create_future_partitions(
    p_months_ahead INTEGER DEFAULT 3
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_current_date DATE;
    v_end_date DATE;
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_current_date := date_trunc('month', CURRENT_DATE)::DATE;
    v_end_date := v_current_date + (p_months_ahead || ' months')::INTERVAL;

    WHILE v_current_date <= v_end_date LOOP
        v_year := EXTRACT(YEAR FROM v_current_date);
        v_month := EXTRACT(MONTH FROM v_current_date);

        PERFORM create_domain_events_partition(v_year, v_month);
        PERFORM create_audit_log_partition(v_year, v_month);
        PERFORM create_episodic_events_partition(v_year, v_month);

        v_count := v_count + 3;
        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_future_partitions IS 'Creates partitions for domain_events, audit_log, and episodic_events for upcoming months (for cron job)';

-- =============================================================================
-- STEP 8: UPDATE drop_old_partitions FOR EPISODIC_EVENTS SUPPORT
-- =============================================================================

-- The existing drop_old_partitions function works generically with any table name
-- Just document that it can be called for episodic_events

COMMENT ON FUNCTION drop_old_partitions IS 'Drops old partitions for a specified table based on retention policy. Supports domain_events, audit_log, and episodic_events.';

-- =============================================================================
-- STEP 9: CREATE INITIAL PARTITIONS FOR EPISODIC_EVENTS
-- =============================================================================

-- Create partitions for 2024 (historical data)
DO $$
BEGIN
    FOR m IN 1..12 LOOP
        PERFORM create_episodic_events_partition(2024, m);
    END LOOP;
END $$;

-- Create partitions for 2025 (current year)
DO $$
BEGIN
    FOR m IN 1..12 LOOP
        PERFORM create_episodic_events_partition(2025, m);
    END LOOP;
END $$;

-- Create partitions for 2026 (future)
DO $$
BEGIN
    FOR m IN 1..6 LOOP
        PERFORM create_episodic_events_partition(2026, m);
    END LOOP;
END $$;

-- =============================================================================
-- STEP 10: MIGRATE EXISTING DATA
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'episodic_events_old') THEN
        -- Ensure occurred_at is not null for partitioning
        UPDATE episodic_events_old SET occurred_at = COALESCE(created_at, NOW()) WHERE occurred_at IS NULL;

        -- Insert data into new partitioned table
        INSERT INTO episodic_events (
            id, subject_type, subject_id, event_type, event_category,
            source_channel, raw_event_id, summary, key_entities, sentiment,
            intent, embedding, embedding_model, occurred_at, processed_at,
            metadata, deleted_at, created_at, updated_at
        )
        SELECT
            id, subject_type, subject_id, event_type, event_category,
            source_channel, raw_event_id, summary, key_entities, sentiment,
            intent, embedding, embedding_model,
            COALESCE(occurred_at, created_at, NOW()),
            processed_at,
            metadata, deleted_at, created_at, updated_at
        FROM episodic_events_old
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Migrated % rows from episodic_events_old', v_count;
    END IF;
END $$;

-- =============================================================================
-- STEP 11: UPDATE SEARCH FUNCTION FOR PARTITIONED TABLE
-- =============================================================================

-- Drop and recreate the search function to work with partitioned table
DROP FUNCTION IF EXISTS search_episodic_events(vector, VARCHAR, UUID, DECIMAL, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION search_episodic_events(
    query_embedding vector(1536),
    p_subject_type VARCHAR DEFAULT NULL,
    p_subject_id UUID DEFAULT NULL,
    match_threshold DECIMAL DEFAULT 0.7,
    match_count INTEGER DEFAULT 10,
    p_from_date TIMESTAMPTZ DEFAULT NULL,
    p_to_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    subject_type VARCHAR,
    subject_id UUID,
    event_type VARCHAR,
    event_category VARCHAR,
    source_channel VARCHAR,
    summary TEXT,
    key_entities JSONB,
    sentiment VARCHAR,
    intent VARCHAR,
    occurred_at TIMESTAMPTZ,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ee.id,
        ee.subject_type,
        ee.subject_id,
        ee.event_type,
        ee.event_category,
        ee.source_channel,
        ee.summary,
        ee.key_entities,
        ee.sentiment,
        ee.intent,
        ee.occurred_at,
        (1 - (ee.embedding <=> query_embedding))::DECIMAL AS similarity
    FROM episodic_events ee
    WHERE
        ee.deleted_at IS NULL
        AND ee.embedding IS NOT NULL
        AND (1 - (ee.embedding <=> query_embedding)) >= match_threshold
        AND (p_subject_type IS NULL OR ee.subject_type = p_subject_type)
        AND (p_subject_id IS NULL OR ee.subject_id = p_subject_id)
        AND (p_from_date IS NULL OR ee.occurred_at >= p_from_date)
        AND (p_to_date IS NULL OR ee.occurred_at <= p_to_date)
    ORDER BY ee.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_episodic_events IS 'Semantic search across partitioned episodic memory with temporal and subject filters';

-- =============================================================================
-- STEP 12: UPDATE SUBJECT MEMORY STATS FUNCTION
-- =============================================================================

DROP FUNCTION IF EXISTS get_subject_memory_stats(VARCHAR, UUID);

CREATE OR REPLACE FUNCTION get_subject_memory_stats(
    p_subject_type VARCHAR,
    p_subject_id UUID
)
RETURNS TABLE (
    total_events BIGINT,
    first_interaction TIMESTAMPTZ,
    last_interaction TIMESTAMPTZ,
    channel_breakdown JSONB,
    positive_count BIGINT,
    neutral_count BIGINT,
    negative_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH event_stats AS (
        SELECT
            COUNT(*) AS total,
            MIN(ee.occurred_at) AS first_date,
            MAX(ee.occurred_at) AS last_date,
            COALESCE(SUM(CASE WHEN ee.sentiment = 'positive' THEN 1 ELSE 0 END), 0) AS pos_count,
            COALESCE(SUM(CASE WHEN ee.sentiment = 'neutral' THEN 1 ELSE 0 END), 0) AS neu_count,
            COALESCE(SUM(CASE WHEN ee.sentiment = 'negative' THEN 1 ELSE 0 END), 0) AS neg_count
        FROM episodic_events ee
        WHERE ee.subject_type = p_subject_type
          AND ee.subject_id = p_subject_id
          AND ee.deleted_at IS NULL
    ),
    channel_counts AS (
        SELECT
            jsonb_object_agg(ee.source_channel, cnt) AS channels
        FROM (
            SELECT source_channel, COUNT(*) AS cnt
            FROM episodic_events ee2
            WHERE ee2.subject_type = p_subject_type
              AND ee2.subject_id = p_subject_id
              AND ee2.deleted_at IS NULL
            GROUP BY ee2.source_channel
        ) ee
    )
    SELECT
        es.total::BIGINT AS total_events,
        es.first_date AS first_interaction,
        es.last_date AS last_interaction,
        COALESCE(cc.channels, '{}'::JSONB) AS channel_breakdown,
        es.pos_count::BIGINT AS positive_count,
        es.neu_count::BIGINT AS neutral_count,
        es.neg_count::BIGINT AS negative_count
    FROM event_stats es
    CROSS JOIN channel_counts cc;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_subject_memory_stats IS 'Get aggregated statistics for a subject memory profile (partitioned table optimized)';

-- =============================================================================
-- STEP 13: RECREATE TRIGGER FOR UPDATED_AT
-- =============================================================================

-- Drop existing trigger if it exists on old table
DROP TRIGGER IF EXISTS trigger_episodic_events_updated_at ON episodic_events_old;

-- Create trigger on new partitioned table
CREATE TRIGGER trigger_episodic_events_updated_at
    BEFORE UPDATE ON episodic_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 14: DROP OLD TABLE AFTER MIGRATION
-- =============================================================================

DROP TABLE IF EXISTS episodic_events_old CASCADE;

-- =============================================================================
-- STEP 15: ADD TABLE COMMENTS
-- =============================================================================

COMMENT ON TABLE episodic_events IS 'Partitioned cognitive episodic memory: LLM-summarized events with embeddings for semantic retrieval (ADR-004). Partitioned by occurred_at (monthly).';

-- =============================================================================
-- STEP 16: CREATE PARTITION MAINTENANCE HELPER
-- =============================================================================

-- Function to get partition statistics for episodic_events
-- (get_partition_stats already exists and works generically)

-- Create a specific function to analyze episodic events distribution
CREATE OR REPLACE FUNCTION get_episodic_events_partition_stats()
RETURNS TABLE (
    partition_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    index_size TEXT,
    partition_range TEXT,
    events_by_type JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH partition_info AS (
        SELECT
            child.relname::TEXT AS pname,
            pg_stat_get_live_tuples(child.oid) AS rows,
            pg_size_pretty(pg_total_relation_size(child.oid)) AS tsize,
            pg_size_pretty(pg_indexes_size(child.oid)) AS isize,
            pg_get_expr(child.relpartbound, child.oid)::TEXT AS prange
        FROM pg_class parent
        JOIN pg_inherits i ON i.inhparent = parent.oid
        JOIN pg_class child ON child.oid = i.inhrelid
        WHERE parent.relname = 'episodic_events'
    )
    SELECT
        pi.pname AS partition_name,
        pi.rows AS row_count,
        pi.tsize AS total_size,
        pi.isize AS index_size,
        pi.prange AS partition_range,
        NULL::JSONB AS events_by_type -- Could be populated with actual event type counts
    FROM partition_info pi
    ORDER BY pi.pname;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_episodic_events_partition_stats IS 'Returns statistics for all episodic_events partitions';

-- =============================================================================
-- STEP 17: CREATE EPISODIC EVENTS CLEANUP FUNCTION
-- =============================================================================

-- Function to clean up old episodic events (respects GDPR soft delete)
CREATE OR REPLACE FUNCTION cleanup_old_episodic_events(
    p_retention_months INTEGER DEFAULT 24
) RETURNS TABLE (
    action TEXT,
    count BIGINT
) AS $$
DECLARE
    v_cutoff_date TIMESTAMPTZ;
    v_soft_deleted BIGINT;
    v_partitions_dropped INTEGER;
BEGIN
    v_cutoff_date := date_trunc('month', CURRENT_DATE - (p_retention_months || ' months')::INTERVAL);

    -- First, permanently delete soft-deleted events older than retention period
    -- (These were already marked for deletion via GDPR erasure)
    DELETE FROM episodic_events
    WHERE deleted_at IS NOT NULL
      AND deleted_at < v_cutoff_date;

    GET DIAGNOSTICS v_soft_deleted = ROW_COUNT;

    action := 'soft_deleted_events_purged';
    count := v_soft_deleted;
    RETURN NEXT;

    -- Drop old partitions
    v_partitions_dropped := drop_old_partitions('episodic_events', p_retention_months);

    action := 'partitions_dropped';
    count := v_partitions_dropped;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_episodic_events IS 'Cleans up old episodic events: purges soft-deleted records and drops old partitions based on retention policy';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- The episodic_events table is now partitioned by occurred_at (monthly)
--
-- Partition functions:
-- - create_episodic_events_partition(year, month): Creates a specific partition
-- - ensure_partitions_exist(start_date, end_date): Creates partitions for date range
-- - create_future_partitions(months_ahead): Creates upcoming partitions (for cron)
-- - drop_old_partitions('episodic_events', retention_months): Drops old partitions
-- - get_episodic_events_partition_stats(): Returns partition statistics
-- - cleanup_old_episodic_events(retention_months): Comprehensive cleanup
--
-- Use create_future_partitions() via a cron job to automate partition creation
-- =============================================================================
