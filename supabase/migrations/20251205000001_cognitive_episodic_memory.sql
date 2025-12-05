-- ============================================================================
-- MedicalCor Core - Cognitive Episodic Memory System
-- ============================================================================
-- ADR-004: Cognitive Episodic Memory
-- Phase 1: Foundation tables for AI-powered patient interaction memory
-- ============================================================================

-- =============================================================================
-- Episodic Events Table (Core Memory Store)
-- =============================================================================
-- Stores summarized, embedding-enriched events for semantic retrieval
-- Each event represents a meaningful interaction point with a patient/lead
-- =============================================================================

CREATE TABLE IF NOT EXISTS episodic_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

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

    -- Temporal metadata
    occurred_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Extensibility
    metadata JSONB DEFAULT '{}',

    -- GDPR compliance (soft delete)
    deleted_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment on table
COMMENT ON TABLE episodic_events IS 'Cognitive episodic memory: LLM-summarized events with embeddings for semantic retrieval (ADR-004)';

-- =============================================================================
-- Indexes for Episodic Events
-- =============================================================================

-- Primary query pattern: get events for a subject (most recent first)
CREATE INDEX IF NOT EXISTS idx_episodic_subject ON episodic_events(subject_type, subject_id, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Filter by event type
CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_events(event_type, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Filter by channel
CREATE INDEX IF NOT EXISTS idx_episodic_channel ON episodic_events(source_channel, occurred_at DESC)
    WHERE deleted_at IS NULL;

-- Time-range queries
CREATE INDEX IF NOT EXISTS idx_episodic_occurred ON episodic_events(occurred_at DESC)
    WHERE deleted_at IS NULL;

-- HNSW index for semantic similarity search (same params as knowledge_base)
CREATE INDEX IF NOT EXISTS idx_episodic_embedding_hnsw ON episodic_events
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- GIN index for entity search within JSONB
CREATE INDEX IF NOT EXISTS idx_episodic_entities ON episodic_events USING gin(key_entities);

-- Sentiment analysis queries
CREATE INDEX IF NOT EXISTS idx_episodic_sentiment ON episodic_events(subject_id, sentiment, occurred_at DESC)
    WHERE deleted_at IS NULL AND sentiment IS NOT NULL;

-- =============================================================================
-- Behavioral Patterns Table (Computed Insights Cache)
-- =============================================================================
-- Stores detected behavioral patterns for faster retrieval
-- Patterns are computed by PatternDetector and updated incrementally
-- =============================================================================

CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Subject identification
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('lead', 'patient', 'contact')),
    subject_id UUID NOT NULL,

    -- Pattern details
    pattern_type VARCHAR(50) NOT NULL,
    pattern_description TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

    -- Evidence
    supporting_event_ids UUID[] NOT NULL DEFAULT '{}',

    -- Temporal tracking
    first_observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    occurrence_count INTEGER DEFAULT 1,

    -- Extensibility
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One pattern type per subject
    CONSTRAINT behavioral_patterns_unique UNIQUE(subject_type, subject_id, pattern_type)
);

-- Comment on table
COMMENT ON TABLE behavioral_patterns IS 'Cached behavioral patterns detected by AI analysis (ADR-004)';

-- =============================================================================
-- Indexes for Behavioral Patterns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_patterns_subject ON behavioral_patterns(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON behavioral_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON behavioral_patterns(confidence DESC);

-- =============================================================================
-- Semantic Search Function for Episodic Events
-- =============================================================================

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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_episodic_events IS 'Semantic search across episodic memory with temporal and subject filters';

-- =============================================================================
-- Aggregation Function for Subject Memory Summary
-- =============================================================================

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
    SELECT
        COUNT(*)::BIGINT AS total_events,
        MIN(ee.occurred_at) AS first_interaction,
        MAX(ee.occurred_at) AS last_interaction,
        COALESCE(
            jsonb_object_agg(ee.source_channel, channel_count),
            '{}'::JSONB
        ) AS channel_breakdown,
        COALESCE(SUM(CASE WHEN ee.sentiment = 'positive' THEN 1 ELSE 0 END), 0)::BIGINT AS positive_count,
        COALESCE(SUM(CASE WHEN ee.sentiment = 'neutral' THEN 1 ELSE 0 END), 0)::BIGINT AS neutral_count,
        COALESCE(SUM(CASE WHEN ee.sentiment = 'negative' THEN 1 ELSE 0 END), 0)::BIGINT AS negative_count
    FROM episodic_events ee
    LEFT JOIN LATERAL (
        SELECT ee2.source_channel, COUNT(*) AS channel_count
        FROM episodic_events ee2
        WHERE ee2.subject_type = p_subject_type
          AND ee2.subject_id = p_subject_id
          AND ee2.deleted_at IS NULL
        GROUP BY ee2.source_channel
    ) channel_stats ON TRUE
    WHERE ee.subject_type = p_subject_type
      AND ee.subject_id = p_subject_id
      AND ee.deleted_at IS NULL
    GROUP BY channel_stats.source_channel, channel_stats.channel_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_subject_memory_stats IS 'Get aggregated statistics for a subject memory profile';

-- =============================================================================
-- Triggers for Updated Timestamps
-- =============================================================================

CREATE TRIGGER trigger_episodic_events_updated_at
    BEFORE UPDATE ON episodic_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_behavioral_patterns_updated_at
    BEFORE UPDATE ON behavioral_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS Policies (if RLS is enabled)
-- =============================================================================
-- Note: RLS policies should be added based on your security requirements
-- For medical data, typically:
-- 1. Users can only see events for patients/leads they have access to
-- 2. System accounts have full access for processing

-- Enable RLS (uncomment when ready)
-- ALTER TABLE episodic_events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;
