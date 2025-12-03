-- migrate:up
-- MedicalCor pgvector Extension and Knowledge Base
-- Created: 2024-12-02
-- Purpose: Enable vector similarity search for RAG and semantic retrieval

-- =============================================================================
-- IMPORTANT: This migration requires pgvector extension to be installed
-- In managed databases (RDS, CloudSQL), enable via console or:
--   CREATE EXTENSION IF NOT EXISTS vector;
-- =============================================================================

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Knowledge Base Table (for RAG retrieval)
-- =============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Classification
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'clinic_protocol',
        'faq',
        'patient_interaction',
        'treatment_info',
        'pricing_info',
        'appointment_policy',
        'consent_template',
        'marketing_content',
        'custom'
    )),

    -- Content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 for deduplication

    -- Chunking metadata (for large documents)
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    parent_id UUID REFERENCES knowledge_base(id) ON DELETE CASCADE,

    -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
    embedding vector(1536),

    -- Multi-tenant/clinic support
    clinic_id VARCHAR(100),

    -- Localization
    language VARCHAR(10) DEFAULT 'ro' CHECK (language IN ('ro', 'en', 'de')),

    -- Tagging and metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Versioning
    version INTEGER DEFAULT 1,

    -- Soft delete for GDPR
    is_active BOOLEAN DEFAULT true,

    -- Embedding model tracking (for refresh when models change)
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

    -- Timestamps
-- Add pgvector extension for vector similarity search (RAG/AI embeddings)
-- This migration adds the infrastructure needed for Retrieval-Augmented Generation (RAG)
-- and semantic search capabilities using OpenAI embeddings

CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table for storing documents with embeddings
-- Supports chunking for large documents and hierarchical relationships
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    parent_id UUID REFERENCES knowledge_base(id),
    embedding vector(1536),
    clinic_id VARCHAR(100),
    language VARCHAR(10) DEFAULT 'ro',
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES for Knowledge Base
-- =============================================================================

-- HNSW index for fast approximate nearest neighbor search
-- m=16: number of connections per layer (higher = more accurate, more memory)
-- ef_construction=128: size of dynamic candidate list during construction
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_hnsw
ON knowledge_base USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Unique constraint on content hash to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_base_content_hash
ON knowledge_base(content_hash) WHERE is_active = true;

-- Filtered search indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_type
ON knowledge_base(source_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_clinic_language
ON knowledge_base(clinic_id, language) WHERE is_active = true;

-- GIN index for tags array search
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags
ON knowledge_base USING gin(tags);

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_knowledge_base_metadata
ON knowledge_base USING gin(metadata);

-- Composite index for common filtered+semantic searches
CREATE INDEX IF NOT EXISTS idx_knowledge_base_filtered_search
ON knowledge_base(source_type, clinic_id, language, is_active);

-- =============================================================================
-- Message Embeddings Table (for conversation context retrieval)
-- =============================================================================
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Message reference
    message_id UUID NOT NULL,

    -- Subject identification
    phone VARCHAR(20) NOT NULL,
    correlation_id UUID,

    -- Content (sanitized for GDPR - no PII)
    content_sanitized TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,

    -- Vector embedding
    embedding vector(1536),

    -- Classification
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    intent VARCHAR(100),
    sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),

    -- Channel
    channel VARCHAR(20) DEFAULT 'whatsapp',

    -- Embedding model tracking
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for message similarity search
CREATE INDEX IF NOT EXISTS idx_message_embeddings_hnsw
ON message_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Unique constraint on content hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_embeddings_content_hash
ON message_embeddings(content_hash);

-- Phone lookup for conversation context
CREATE INDEX IF NOT EXISTS idx_message_embeddings_phone
ON message_embeddings(phone, created_at DESC);

-- Correlation ID for tracing
CREATE INDEX IF NOT EXISTS idx_message_embeddings_correlation
ON message_embeddings(correlation_id) WHERE correlation_id IS NOT NULL;

-- =============================================================================
-- RAG Query Log Table (for analytics and improvement)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Query details
    query_text TEXT NOT NULL,
    query_embedding vector(1536),

    -- Search parameters
    search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('semantic', 'hybrid', 'keyword')),
    top_k INTEGER NOT NULL,
    similarity_threshold DECIMAL(4,3),
    filters JSONB DEFAULT '{}',

    -- Results
    results_count INTEGER NOT NULL,
    result_ids UUID[] DEFAULT '{}',

    -- Performance metrics
    embedding_latency_ms INTEGER,
    search_latency_ms INTEGER,
    total_latency_ms INTEGER NOT NULL,

    -- Feedback (for continuous improvement)
    was_helpful BOOLEAN,
    feedback_score INTEGER CHECK (feedback_score >= 1 AND feedback_score <= 5),
    feedback_notes TEXT,

    -- Context
    correlation_id UUID,
    user_id VARCHAR(100),
    use_case VARCHAR(50), -- 'scoring', 'reply_generation', 'search'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_rag_query_log_created
ON rag_query_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_use_case
ON rag_query_log(use_case, created_at DESC);

-- Index for feedback analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_feedback
ON rag_query_log(was_helpful, feedback_score)
WHERE was_helpful IS NOT NULL;

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

-- =============================================================================
-- Helper function: Update timestamp on modification
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
-- HNSW index for fast approximate nearest neighbor search
-- m = 16: number of connections per layer (balance between speed and recall)
-- ef_construction = 128: size of dynamic candidate list (higher = better recall, slower build)
CREATE INDEX idx_knowledge_base_embedding_hnsw
ON knowledge_base USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Filtered search indexes for common query patterns
CREATE INDEX idx_knowledge_base_source_type ON knowledge_base(source_type) WHERE is_active;
CREATE INDEX idx_knowledge_base_clinic_language ON knowledge_base(clinic_id, language) WHERE is_active;
CREATE INDEX idx_knowledge_base_tags ON knowledge_base USING gin(tags);
CREATE UNIQUE INDEX idx_knowledge_base_content_hash ON knowledge_base(content_hash);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_base_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trg_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_projection_checkpoints_updated_at
    BEFORE UPDATE ON projection_checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Seed initial projection checkpoints
-- =============================================================================
INSERT INTO projection_checkpoints (projection_name, status) VALUES
    ('lead-stats', 'running'),
    ('patient-activity', 'running'),
    ('daily-metrics', 'running')
ON CONFLICT (projection_name) DO NOTHING;

-- migrate:down
DROP TRIGGER IF EXISTS trg_projection_checkpoints_updated_at ON projection_checkpoints;
DROP TRIGGER IF EXISTS trg_knowledge_base_updated_at ON knowledge_base;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS projection_checkpoints;
DROP TABLE IF EXISTS rag_query_log;
DROP TABLE IF EXISTS message_embeddings;
CREATE TRIGGER trigger_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_base_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS trigger_knowledge_base_updated_at ON knowledge_base;
DROP FUNCTION IF EXISTS update_knowledge_base_updated_at();
DROP TABLE IF EXISTS knowledge_base;
DROP EXTENSION IF EXISTS vector;
