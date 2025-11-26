-- =============================================================================
-- MedicalCor Core - pgvector Extension and RAG Tables
-- State-of-the-art RAG infrastructure for semantic search
-- =============================================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Knowledge Base Table (Document Store with Embeddings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Document identification
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'clinic_protocol',      -- Medical procedures, guidelines
        'faq',                  -- Frequently asked questions
        'patient_interaction',  -- Historical successful interactions
        'treatment_info',       -- Treatment information
        'pricing_info',         -- Pricing guidelines (non-specific)
        'appointment_policy',   -- Scheduling policies
        'consent_template',     -- Consent form templates
        'marketing_content',    -- Approved marketing messages
        'custom'                -- Custom knowledge entries
    )),
    source_id VARCHAR(200),     -- External reference (e.g., HubSpot article ID)

    -- Content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,  -- SHA-256 for deduplication

    -- Chunking metadata
    chunk_index INTEGER DEFAULT 0,      -- Position in original document
    chunk_total INTEGER DEFAULT 1,      -- Total chunks from source
    parent_id UUID REFERENCES knowledge_base(id) ON DELETE CASCADE,

    -- Vector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
    embedding vector(1536),

    -- Metadata for filtering
    clinic_id VARCHAR(100),             -- Multi-clinic support
    language VARCHAR(10) DEFAULT 'ro' CHECK (language IN ('ro', 'en', 'de')),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Versioning and audit
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    -- Constraints
    CONSTRAINT knowledge_base_content_hash_unique UNIQUE (content_hash, chunk_index)
);

-- =============================================================================
-- Vector Indexes for Semantic Search
-- =============================================================================

-- HNSW index for fast approximate nearest neighbor search
-- ef_construction=128 and m=16 provide good balance of speed/recall
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_hnsw
    ON knowledge_base
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- IVFFlat index as fallback for exact search when needed
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_ivfflat
    ON knowledge_base
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- =============================================================================
-- Supporting Indexes for Filtered Search
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_type ON knowledge_base(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_clinic_id ON knowledge_base(clinic_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_language ON knowledge_base(language);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_is_active ON knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags ON knowledge_base USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_metadata ON knowledge_base USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at DESC);

-- Composite index for common filtered searches
CREATE INDEX IF NOT EXISTS idx_knowledge_base_active_source_clinic
    ON knowledge_base(is_active, source_type, clinic_id)
    WHERE is_active = TRUE;

-- =============================================================================
-- Message Embeddings Table (For Conversation Context)
-- =============================================================================
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference to original message
    message_id UUID,                    -- Optional link to message_log
    phone VARCHAR(20) NOT NULL,
    correlation_id VARCHAR(100),

    -- Content (stored for reprocessing, PII-safe version)
    content_sanitized TEXT NOT NULL,    -- Sanitized content (no PII)
    content_hash VARCHAR(64) NOT NULL,  -- SHA-256 of original

    -- Vector embedding
    embedding vector(1536),

    -- Classification
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    message_type VARCHAR(50) DEFAULT 'text',
    intent VARCHAR(100),                -- Detected intent
    sentiment VARCHAR(20),              -- positive, neutral, negative

    -- Metadata
    language VARCHAR(10),
    clinic_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    message_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT message_embeddings_content_hash_unique UNIQUE (content_hash)
);

-- Indexes for message embeddings
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

    -- Query info
    query_text TEXT NOT NULL,
    query_embedding vector(1536),

    -- Search parameters
    search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('semantic', 'hybrid', 'keyword')),
    top_k INTEGER NOT NULL,
    similarity_threshold DECIMAL(4,3),
    filters JSONB DEFAULT '{}',

    -- Results
    result_count INTEGER NOT NULL,
    result_ids UUID[] DEFAULT '{}',
    result_scores DECIMAL[] DEFAULT '{}',

    -- Performance
    embedding_latency_ms INTEGER,
    search_latency_ms INTEGER,
    total_latency_ms INTEGER,

    -- Context
    correlation_id VARCHAR(100),
    use_case VARCHAR(50),               -- scoring, reply_generation, etc.

    -- Feedback (for continuous improvement)
    was_helpful BOOLEAN,
    feedback_score INTEGER CHECK (feedback_score >= 1 AND feedback_score <= 5),
    feedback_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_created_at ON rag_query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_use_case ON rag_query_log(use_case);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_correlation_id ON rag_query_log(correlation_id);

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

-- Search similar messages for context
CREATE OR REPLACE FUNCTION search_similar_messages(
    query_embedding vector(1536),
    target_phone VARCHAR DEFAULT NULL,
    match_threshold DECIMAL DEFAULT 0.75,
    match_count INTEGER DEFAULT 10,
    exclude_correlation_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    phone VARCHAR,
    content_sanitized TEXT,
    direction VARCHAR,
    intent VARCHAR,
    similarity DECIMAL,
    message_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        me.id,
        me.phone,
        me.content_sanitized,
        me.direction,
        me.intent,
        (1 - (me.embedding <=> query_embedding))::DECIMAL AS similarity,
        me.message_timestamp
    FROM message_embeddings me
    WHERE
        me.embedding IS NOT NULL
        AND (1 - (me.embedding <=> query_embedding)) >= match_threshold
        AND (target_phone IS NULL OR me.phone = target_phone)
        AND (exclude_correlation_id IS NULL OR me.correlation_id != exclude_correlation_id)
    ORDER BY me.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Hybrid search combining semantic and keyword
CREATE OR REPLACE FUNCTION hybrid_search_knowledge_base(
    query_embedding vector(1536),
    query_text TEXT,
    semantic_weight DECIMAL DEFAULT 0.7,
    keyword_weight DECIMAL DEFAULT 0.3,
    match_count INTEGER DEFAULT 5,
    filter_source_type VARCHAR DEFAULT NULL,
    filter_clinic_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    source_type VARCHAR,
    title VARCHAR,
    content TEXT,
    semantic_score DECIMAL,
    keyword_score DECIMAL,
    combined_score DECIMAL,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH semantic_results AS (
        SELECT
            kb.id,
            kb.source_type,
            kb.title,
            kb.content,
            (1 - (kb.embedding <=> query_embedding))::DECIMAL AS sem_score,
            kb.metadata
        FROM knowledge_base kb
        WHERE
            kb.is_active = TRUE
            AND kb.embedding IS NOT NULL
            AND (filter_source_type IS NULL OR kb.source_type = filter_source_type)
            AND (filter_clinic_id IS NULL OR kb.clinic_id = filter_clinic_id OR kb.clinic_id IS NULL)
    ),
    keyword_results AS (
        SELECT
            kb.id,
            ts_rank_cd(
                to_tsvector('simple', kb.title || ' ' || kb.content),
                plainto_tsquery('simple', query_text)
            )::DECIMAL AS kw_score
        FROM knowledge_base kb
        WHERE
            kb.is_active = TRUE
            AND (filter_source_type IS NULL OR kb.source_type = filter_source_type)
            AND (filter_clinic_id IS NULL OR kb.clinic_id = filter_clinic_id OR kb.clinic_id IS NULL)
    )
    SELECT
        sr.id,
        sr.source_type,
        sr.title,
        sr.content,
        sr.sem_score AS semantic_score,
        COALESCE(kr.kw_score, 0) AS keyword_score,
        (sr.sem_score * semantic_weight + COALESCE(kr.kw_score, 0) * keyword_weight)::DECIMAL AS combined_score,
        sr.metadata
    FROM semantic_results sr
    LEFT JOIN keyword_results kr ON sr.id = kr.id
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Triggers for Updated Timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Initial Knowledge Base Seed Data
-- =============================================================================
-- Note: Embeddings will be generated by the application on first run

INSERT INTO knowledge_base (source_type, title, content, content_hash, language, tags) VALUES
    ('faq', 'Ce este procedura All-on-4?',
     'Procedura All-on-4 este o tehnică modernă de implantologie dentară care permite înlocuirea tuturor dinților de pe o arcadă cu doar 4 implanturi dentare. Aceasta oferă o soluție fixă, stabilă și estetică pentru pacienții edentați total. Avantajele includ: recuperare rapidă, cost mai redus decât implanturile individuale, și rezultate imediate în multe cazuri.',
     encode(sha256('all-on-4-faq-ro'::bytea), 'hex'), 'ro', ARRAY['all-on-4', 'implant', 'procedura']),

    ('faq', 'What is the All-on-4 procedure?',
     'The All-on-4 procedure is a modern dental implant technique that allows replacement of all teeth on an arch with just 4 dental implants. It provides a fixed, stable, and aesthetic solution for completely edentulous patients. Benefits include: rapid recovery, lower cost than individual implants, and immediate results in many cases.',
     encode(sha256('all-on-4-faq-en'::bytea), 'hex'), 'en', ARRAY['all-on-4', 'implant', 'procedure']),

    ('faq', 'Cât costă implanturile dentare?',
     'Costul implanturilor dentare variază în funcție de complexitatea cazului, tipul de implant și materialele folosite. Pentru o evaluare personalizată, vă invităm la o consultație gratuită unde medicul specialist va analiza cazul dumneavoastră și vă va oferi un plan de tratament detaliat cu toate costurile incluse. Oferim și opțiuni de finanțare.',
     encode(sha256('pricing-faq-ro'::bytea), 'hex'), 'ro', ARRAY['pret', 'cost', 'implant']),

    ('clinic_protocol', 'Protocol de calificare lead-uri',
     'Un lead calificat pentru procedura All-on-X trebuie să îndeplinească următoarele criterii: 1) Edentat total sau parțial extins; 2) Sănătate generală bună; 3) Budget minim disponibil sau interes pentru finanțare; 4) Disponibilitate pentru consultație în următoarele 2 săptămâni; 5) Decizia nu depinde de terți. Lead-urile HOT menționează explicit procedura și au urgență.',
     encode(sha256('lead-qualification-protocol'::bytea), 'hex'), 'ro', ARRAY['protocol', 'calificare', 'lead']),

    ('treatment_info', 'Procesul de tratament All-on-X',
     'Etapele tratamentului All-on-X: 1) Consultație inițială și CT scan; 2) Planificare digitală a tratamentului; 3) Ziua intervenției - extracții, inserare implanturi, atașare provizorie; 4) Perioada de vindecare (3-6 luni); 5) Lucrare finală permanentă. În multe cazuri, pacienții pleacă cu dinți provizorii în aceeași zi.',
     encode(sha256('treatment-process-allonx'::bytea), 'hex'), 'ro', ARRAY['tratament', 'all-on-x', 'proces'])

ON CONFLICT (content_hash, chunk_index) DO NOTHING;

-- =============================================================================
-- Grants (adjust based on your database user)
-- =============================================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_base TO medicalcor_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON message_embeddings TO medicalcor_app;
-- GRANT SELECT, INSERT ON rag_query_log TO medicalcor_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medicalcor_app;
