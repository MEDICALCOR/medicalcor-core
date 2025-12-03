-- ============================================================================
-- MedicalCor Core - pgvector Extension and RAG Tables
-- ============================================================================
-- Source: infra/migrations/002-extensions-pgvector.sql (canonical)
-- + db/migrations/20241202000001_add_pgvector_extension.sql (projection_checkpoints)
-- ============================================================================

-- =============================================================================
-- Knowledge Base Table (Document Store with Embeddings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'clinic_protocol', 'faq', 'patient_interaction', 'treatment_info',
        'pricing_info', 'appointment_policy', 'consent_template',
        'marketing_content', 'custom'
    )),
    source_id VARCHAR(200),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    parent_id UUID REFERENCES knowledge_base(id) ON DELETE CASCADE,
    embedding vector(1536),
    clinic_id VARCHAR(100),
    language VARCHAR(10) DEFAULT 'ro' CHECK (language IN ('ro', 'en', 'de')),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    CONSTRAINT knowledge_base_content_hash_unique UNIQUE (content_hash, chunk_index)
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_hnsw
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_type ON knowledge_base(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_clinic_id ON knowledge_base(clinic_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_language ON knowledge_base(language);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_is_active ON knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags ON knowledge_base USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_metadata ON knowledge_base USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at DESC);

-- =============================================================================
-- Message Embeddings Table (For Conversation Context)
-- =============================================================================
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID,
    phone VARCHAR(20) NOT NULL,
    correlation_id VARCHAR(100),
    content_sanitized TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    embedding vector(1536),
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    message_type VARCHAR(50) DEFAULT 'text',
    intent VARCHAR(100),
    sentiment VARCHAR(20),
    language VARCHAR(10),
    clinic_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    message_timestamp TIMESTAMPTZ,
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT message_embeddings_content_hash_unique UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding_hnsw
    ON message_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_phone ON message_embeddings(phone);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_correlation_id ON message_embeddings(correlation_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_created_at ON message_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_intent ON message_embeddings(intent);

-- =============================================================================
-- RAG Query Log (For Analytics and Optimization)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_query_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text TEXT NOT NULL,
    query_embedding vector(1536),
    search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('semantic', 'hybrid', 'keyword')),
    top_k INTEGER NOT NULL,
    similarity_threshold DECIMAL(4,3),
    filters JSONB DEFAULT '{}',
    result_count INTEGER NOT NULL,
    result_ids UUID[] DEFAULT '{}',
    result_scores DECIMAL[] DEFAULT '{}',
    embedding_latency_ms INTEGER,
    search_latency_ms INTEGER,
    total_latency_ms INTEGER,
    correlation_id VARCHAR(100),
    use_case VARCHAR(50),
    was_helpful BOOLEAN,
    feedback_score INTEGER CHECK (feedback_score >= 1 AND feedback_score <= 5),
    feedback_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_created_at ON rag_query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_use_case ON rag_query_log(use_case);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_correlation_id ON rag_query_log(correlation_id);

-- =============================================================================
-- Projection Checkpoints Table (for health monitoring)
-- =============================================================================
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(100) PRIMARY KEY,
    last_event_id UUID,
    last_event_timestamp TIMESTAMPTZ,
    events_processed BIGINT DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'paused', 'error', 'rebuilding')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial projection checkpoints
INSERT INTO projection_checkpoints (projection_name, status) VALUES
    ('lead-stats', 'running'),
    ('patient-activity', 'running'),
    ('daily-metrics', 'running')
ON CONFLICT (projection_name) DO NOTHING;

-- =============================================================================
-- Functions for Vector Search
-- =============================================================================

-- Semantic search function with filtering
CREATE OR REPLACE FUNCTION search_knowledge_base(
    query_embedding vector(1536),
    match_threshold DECIMAL DEFAULT 0.7,
    match_count INTEGER DEFAULT 5,
    filter_source_type VARCHAR DEFAULT NULL,
    filter_clinic_id VARCHAR DEFAULT NULL,
    filter_language VARCHAR DEFAULT NULL,
    filter_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    source_type VARCHAR,
    title VARCHAR,
    content TEXT,
    similarity DECIMAL,
    metadata JSONB,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.source_type,
        kb.title,
        kb.content,
        (1 - (kb.embedding <=> query_embedding))::DECIMAL AS similarity,
        kb.metadata,
        kb.tags
    FROM knowledge_base kb
    WHERE
        kb.is_active = TRUE
        AND kb.embedding IS NOT NULL
        AND (1 - (kb.embedding <=> query_embedding)) >= match_threshold
        AND (filter_source_type IS NULL OR kb.source_type = filter_source_type)
        AND (filter_clinic_id IS NULL OR kb.clinic_id = filter_clinic_id OR kb.clinic_id IS NULL)
        AND (filter_language IS NULL OR kb.language = filter_language)
        AND (filter_tags IS NULL OR kb.tags && filter_tags)
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER trigger_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_projection_checkpoints_updated_at
    BEFORE UPDATE ON projection_checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed initial knowledge base data
INSERT INTO knowledge_base (source_type, title, content, content_hash, language, tags) VALUES
    ('faq', 'Ce este procedura All-on-4?',
     'Procedura All-on-4 este o tehnică modernă de implantologie dentară care permite înlocuirea tuturor dinților de pe o arcadă cu doar 4 implanturi dentare.',
     encode(sha256('all-on-4-faq-ro'::bytea), 'hex'), 'ro', ARRAY['all-on-4', 'implant', 'procedura']),
    ('faq', 'Cât costă implanturile dentare?',
     'Costul implanturilor dentare variază în funcție de complexitatea cazului. Pentru o evaluare personalizată, vă invităm la o consultație gratuită.',
     encode(sha256('pricing-faq-ro'::bytea), 'hex'), 'ro', ARRAY['pret', 'cost', 'implant'])
ON CONFLICT (content_hash, chunk_index) DO NOTHING;
