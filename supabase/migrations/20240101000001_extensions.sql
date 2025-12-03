-- ============================================================================
-- MedicalCor Core - Database Extensions
-- ============================================================================
-- This migration MUST run first - enables required PostgreSQL extensions
-- ============================================================================

-- UUID generation (required for all table PKs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cryptographic functions (for encryption, hashing)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Vector similarity search (for RAG/semantic search)
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Shared utility function: update_updated_at_column
-- Used by multiple tables for automatic timestamp management
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates updated_at timestamp on row modification';
