-- =============================================================================
-- MedicalCor Vision AI & Video AI - Database Migration
-- Deploy AI-Native features for medical image analysis and avatar video generation
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- VISION AI: Medical Records & Image Analysis
-- =============================================================================

-- Analysis intent enum for type-safe intent handling
CREATE TYPE vision_analysis_intent AS ENUM (
    'prescription',      -- Prescription/medication analysis
    'dermatology',       -- Skin condition analysis
    'lab_result',        -- Laboratory results extraction
    'xray',              -- X-ray/radiograph analysis
    'dental_scan',       -- Dental CT/panoramic analysis
    'document',          -- General medical document OCR
    'other'              -- Other medical images
);

-- Model tier for cost optimization
CREATE TYPE ai_model_tier AS ENUM (
    'premium',           -- gpt-4o for photos/complex
    'economy'            -- gpt-4o-mini for documents
);

-- Analysis status
CREATE TYPE analysis_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'review_required'    -- Needs human review
);

-- =============================================================================
-- Medical Records Table (Vision AI Results)
-- =============================================================================
CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference
    patient_id VARCHAR(100) NOT NULL,          -- External patient identifier
    correlation_id VARCHAR(100),                -- Request correlation
    hubspot_contact_id VARCHAR(50),             -- HubSpot link

    -- Source Image
    image_url TEXT NOT NULL,                    -- Original image URL
    image_storage_key TEXT,                     -- Supabase/S3 storage key
    image_hash VARCHAR(64),                     -- SHA-256 for deduplication
    image_mime_type VARCHAR(50),                -- image/jpeg, application/pdf, etc.
    image_size_bytes INTEGER,                   -- File size for billing

    -- Analysis Configuration
    intent vision_analysis_intent NOT NULL,
    model_tier ai_model_tier NOT NULL DEFAULT 'premium',
    model_used VARCHAR(50),                     -- Actual model (gpt-4o, gpt-4o-mini)

    -- Analysis Results
    status analysis_status NOT NULL DEFAULT 'pending',
    extracted_data JSONB,                       -- Structured extraction result
    summary TEXT,                               -- Human-readable summary
    confidence_score DECIMAL(3,2),              -- 0.00 - 1.00

    -- Medical-Specific Extractions
    medications JSONB DEFAULT '[]',             -- [{name, dosage, frequency, duration}]
    diagnoses JSONB DEFAULT '[]',               -- [{code, description, severity}]
    abnormal_values JSONB DEFAULT '[]',         -- [{metric, value, unit, reference_range, status}]
    recommendations JSONB DEFAULT '[]',         -- AI-generated recommendations

    -- Billing & Cost Tracking
    cost_in_cents INTEGER NOT NULL DEFAULT 0,   -- Actual cost in cents
    tokens_input INTEGER,                       -- Input tokens used
    tokens_output INTEGER,                      -- Output tokens used

    -- Provider Response
    provider_metadata JSONB DEFAULT '{}',       -- Raw OpenAI response metadata
    provider_request_id VARCHAR(100),           -- OpenAI request ID

    -- Error Handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,

    -- Audit
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    -- Soft delete for GDPR compliance
    deleted_at TIMESTAMPTZ,
    deletion_reason TEXT
);

-- Indexes for medical_records
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_correlation_id ON medical_records(correlation_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_hubspot_contact_id ON medical_records(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_status ON medical_records(status);
CREATE INDEX IF NOT EXISTS idx_medical_records_intent ON medical_records(intent);
CREATE INDEX IF NOT EXISTS idx_medical_records_image_hash ON medical_records(image_hash);
CREATE INDEX IF NOT EXISTS idx_medical_records_created_at ON medical_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_extracted_data ON medical_records USING gin(extracted_data);
CREATE INDEX IF NOT EXISTS idx_medical_records_medications ON medical_records USING gin(medications);
CREATE INDEX IF NOT EXISTS idx_medical_records_diagnoses ON medical_records USING gin(diagnoses);

-- Partial index for active (non-deleted) records
CREATE INDEX IF NOT EXISTS idx_medical_records_active
    ON medical_records(patient_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- VIDEO AI: Avatar Video Generations
-- =============================================================================

-- Video generation status
CREATE TYPE video_generation_status AS ENUM (
    'pending',
    'queued',
    'processing',
    'rendering',
    'completed',
    'failed',
    'expired'
);

-- =============================================================================
-- Avatar Videos Table (Video AI Results)
-- =============================================================================
CREATE TABLE IF NOT EXISTS avatar_videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference
    patient_id VARCHAR(100),                    -- Optional patient link
    patient_name VARCHAR(200),                  -- For personalization
    correlation_id VARCHAR(100),
    hubspot_contact_id VARCHAR(50),

    -- Script & Template
    script TEXT NOT NULL,                       -- The script to be spoken
    script_hash VARCHAR(64) NOT NULL,           -- SHA-256 for deduplication
    template_id VARCHAR(100),                   -- HeyGen avatar template
    avatar_id VARCHAR(100),                     -- HeyGen avatar ID
    voice_id VARCHAR(100),                      -- HeyGen voice ID
    language VARCHAR(10) DEFAULT 'ro',          -- Script language

    -- Generation Status
    status video_generation_status NOT NULL DEFAULT 'pending',
    heygen_video_id VARCHAR(100),               -- HeyGen video ID

    -- Output
    video_url TEXT,                             -- Final video URL
    video_storage_key TEXT,                     -- Supabase/S3 storage key
    thumbnail_url TEXT,                         -- Video thumbnail
    duration_seconds DECIMAL(10,2),             -- Video duration

    -- Billing & Cost Tracking
    cost_in_cents INTEGER NOT NULL DEFAULT 0,   -- Cost in cents (~200 cents = $2/video)
    credits_used INTEGER,                       -- HeyGen credits used

    -- Provider Response
    provider_metadata JSONB DEFAULT '{}',       -- Raw HeyGen response
    provider_request_id VARCHAR(100),           -- HeyGen request ID
    webhook_received_at TIMESTAMPTZ,            -- When webhook was received

    -- Error Handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,

    -- Polling Metadata
    poll_count INTEGER DEFAULT 0,
    last_polled_at TIMESTAMPTZ,

    -- Optimization: Cache hit tracking
    is_cache_hit BOOLEAN DEFAULT FALSE,         -- TRUE if reused existing video
    source_video_id UUID REFERENCES avatar_videos(id), -- Original video if cache hit

    -- Audit
    generation_started_at TIMESTAMPTZ,
    generation_completed_at TIMESTAMPTZ,
    generation_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    -- Expiration (HeyGen URLs may expire)
    expires_at TIMESTAMPTZ,

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deletion_reason TEXT
);

-- Indexes for avatar_videos
CREATE INDEX IF NOT EXISTS idx_avatar_videos_patient_id ON avatar_videos(patient_id);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_correlation_id ON avatar_videos(correlation_id);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_hubspot_contact_id ON avatar_videos(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_status ON avatar_videos(status);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_script_hash ON avatar_videos(script_hash);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_heygen_video_id ON avatar_videos(heygen_video_id);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_created_at ON avatar_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avatar_videos_expires_at ON avatar_videos(expires_at) WHERE expires_at IS NOT NULL;

-- Index for cache lookup: find existing videos with same script
CREATE INDEX IF NOT EXISTS idx_avatar_videos_cache_lookup
    ON avatar_videos(script_hash, status, deleted_at)
    WHERE status = 'completed' AND deleted_at IS NULL;

-- =============================================================================
-- AI Cost Tracking Aggregate (Daily Summary)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_cost_daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Date partition
    date DATE NOT NULL,

    -- Vision AI costs
    vision_total_cents INTEGER DEFAULT 0,
    vision_premium_calls INTEGER DEFAULT 0,
    vision_economy_calls INTEGER DEFAULT 0,
    vision_total_tokens INTEGER DEFAULT 0,

    -- Video AI costs
    video_total_cents INTEGER DEFAULT 0,
    video_generated_count INTEGER DEFAULT 0,
    video_cache_hits INTEGER DEFAULT 0,
    video_total_duration_seconds DECIMAL(12,2) DEFAULT 0,

    -- Combined
    total_cost_cents INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_cost_date UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_ai_cost_daily_date ON ai_cost_daily_summary(date DESC);

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check for existing video with same script (cache)
CREATE OR REPLACE FUNCTION find_cached_video(
    p_script_hash VARCHAR(64)
)
RETURNS TABLE (
    id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    duration_seconds DECIMAL,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        av.id,
        av.video_url,
        av.thumbnail_url,
        av.duration_seconds,
        av.created_at
    FROM avatar_videos av
    WHERE
        av.script_hash = p_script_hash
        AND av.status = 'completed'
        AND av.deleted_at IS NULL
        AND (av.expires_at IS NULL OR av.expires_at > NOW())
    ORDER BY av.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily cost summary
CREATE OR REPLACE FUNCTION update_ai_cost_summary(
    p_date DATE,
    p_cost_type VARCHAR(20),  -- 'vision' or 'video'
    p_cost_cents INTEGER,
    p_is_premium BOOLEAN DEFAULT TRUE,
    p_tokens INTEGER DEFAULT 0,
    p_duration_seconds DECIMAL DEFAULT 0,
    p_is_cache_hit BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ai_cost_daily_summary (date, total_cost_cents)
    VALUES (p_date, 0)
    ON CONFLICT (date) DO NOTHING;

    IF p_cost_type = 'vision' THEN
        UPDATE ai_cost_daily_summary
        SET
            vision_total_cents = vision_total_cents + p_cost_cents,
            vision_premium_calls = vision_premium_calls + (CASE WHEN p_is_premium THEN 1 ELSE 0 END),
            vision_economy_calls = vision_economy_calls + (CASE WHEN NOT p_is_premium THEN 1 ELSE 0 END),
            vision_total_tokens = vision_total_tokens + p_tokens,
            total_cost_cents = total_cost_cents + p_cost_cents,
            updated_at = NOW()
        WHERE date = p_date;
    ELSIF p_cost_type = 'video' THEN
        UPDATE ai_cost_daily_summary
        SET
            video_total_cents = video_total_cents + p_cost_cents,
            video_generated_count = video_generated_count + (CASE WHEN NOT p_is_cache_hit THEN 1 ELSE 0 END),
            video_cache_hits = video_cache_hits + (CASE WHEN p_is_cache_hit THEN 1 ELSE 0 END),
            video_total_duration_seconds = video_total_duration_seconds + p_duration_seconds,
            total_cost_cents = total_cost_cents + p_cost_cents,
            updated_at = NOW()
        WHERE date = p_date;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to determine model tier based on image type
CREATE OR REPLACE FUNCTION determine_model_tier(
    p_mime_type VARCHAR(50),
    p_intent vision_analysis_intent
)
RETURNS ai_model_tier AS $$
BEGIN
    -- Use economy model (gpt-4o-mini) for:
    -- 1. PDF documents (OCR-heavy, text extraction)
    -- 2. Document intent (pure text extraction)
    IF p_mime_type = 'application/pdf'
       OR p_intent = 'document'
       OR p_intent = 'prescription' THEN
        RETURN 'economy';
    END IF;

    -- Use premium model (gpt-4o) for:
    -- 1. Photos (dermatology, complex visual analysis)
    -- 2. X-rays, dental scans (medical imaging)
    RETURN 'premium';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to medical_records
DROP TRIGGER IF EXISTS trigger_medical_records_updated_at ON medical_records;
CREATE TRIGGER trigger_medical_records_updated_at
    BEFORE UPDATE ON medical_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to avatar_videos
DROP TRIGGER IF EXISTS trigger_avatar_videos_updated_at ON avatar_videos;
CREATE TRIGGER trigger_avatar_videos_updated_at
    BEFORE UPDATE ON avatar_videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Add HeyGen to processor registry (GDPR compliance)
-- =============================================================================
INSERT INTO processor_registry (name, category, data_types, dpa_signed, status) VALUES
    ('HeyGen', 'Video Generation', ARRAY['patient_name', 'script_content'], false, 'pending_review')
ON CONFLICT (name) DO UPDATE SET
    category = EXCLUDED.category,
    data_types = EXCLUDED.data_types,
    updated_at = NOW();

-- =============================================================================
-- Grants (uncomment and adjust based on your database user)
-- =============================================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON medical_records TO medicalcor_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON avatar_videos TO medicalcor_app;
-- GRANT SELECT, INSERT, UPDATE ON ai_cost_daily_summary TO medicalcor_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medicalcor_app;

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Run: psql -d medicalcor -f sql/deploy_ai_native.sql
