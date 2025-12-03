-- migrate:up
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

CREATE TRIGGER trigger_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_base_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS trigger_knowledge_base_updated_at ON knowledge_base;
DROP FUNCTION IF EXISTS update_knowledge_base_updated_at();
DROP TABLE IF EXISTS knowledge_base;
DROP EXTENSION IF EXISTS vector;
