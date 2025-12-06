-- =============================================================================
-- Agent Guidance / Call Scripts Migration
-- M2 Milestone: Agent Guidance Call Scripts
--
-- Provides structured call scripts and real-time coaching guidance
-- for agents handling voice calls and chat interactions.
-- =============================================================================

-- =============================================================================
-- Agent Guidance Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_guidance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,

    -- Core identification
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'call-script',
        'coaching-prompt',
        'knowledge-base',
        'objection-handler',
        'procedure-guide'
    )),
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'intake',
        'scheduling',
        'pricing',
        'insurance',
        'follow-up',
        'emergency',
        'consultation',
        'objection',
        'closing'
    )),
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Target audience
    audience VARCHAR(50) DEFAULT 'all' CHECK (audience IN (
        'new-patient',
        'existing-patient',
        'referral',
        'emergency',
        'all'
    )),

    -- Script structure (stored as JSONB)
    initial_greeting TEXT NOT NULL,
    initial_greeting_ro TEXT,
    steps JSONB DEFAULT '[]'::jsonb,
    key_points JSONB DEFAULT '[]'::jsonb,
    objection_handlers JSONB DEFAULT '[]'::jsonb,
    closing_statements TEXT[] DEFAULT '{}',
    closing_statements_ro TEXT[],

    -- Applicable procedures
    procedures TEXT[] DEFAULT '{}',

    -- Languages
    languages TEXT[] DEFAULT ARRAY['ro', 'en'],
    default_language VARCHAR(2) DEFAULT 'ro' CHECK (default_language IN ('en', 'ro')),

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_draft BOOLEAN DEFAULT true,

    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES agent_guidance(id),

    -- Effectiveness metrics
    usage_count INTEGER DEFAULT 0,
    avg_call_duration NUMERIC,
    conversion_rate NUMERIC CHECK (conversion_rate >= 0 AND conversion_rate <= 100),
    satisfaction_score NUMERIC CHECK (satisfaction_score >= 0 AND satisfaction_score <= 100),

    -- Tags for search
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookups
CREATE INDEX idx_guidance_clinic ON agent_guidance(clinic_id);
CREATE INDEX idx_guidance_type ON agent_guidance(type);
CREATE INDEX idx_guidance_category ON agent_guidance(category);
CREATE INDEX idx_guidance_audience ON agent_guidance(audience);
CREATE INDEX idx_guidance_active ON agent_guidance(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_guidance_draft ON agent_guidance(is_draft);

-- Composite indexes for common queries
CREATE INDEX idx_guidance_clinic_active ON agent_guidance(clinic_id, is_active)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_guidance_clinic_type ON agent_guidance(clinic_id, type)
    WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_guidance_clinic_category ON agent_guidance(clinic_id, category)
    WHERE deleted_at IS NULL AND is_active = true;

-- Full-text search
CREATE INDEX idx_guidance_name_trgm ON agent_guidance USING gin(name gin_trgm_ops);
CREATE INDEX idx_guidance_tags ON agent_guidance USING gin(tags);
CREATE INDEX idx_guidance_procedures ON agent_guidance USING gin(procedures);

-- Versioning
CREATE INDEX idx_guidance_previous_version ON agent_guidance(previous_version_id);

-- Unique constraint on name per clinic (active only)
CREATE UNIQUE INDEX idx_guidance_unique_name ON agent_guidance(clinic_id, name)
    WHERE deleted_at IS NULL AND is_active = true;

-- =============================================================================
-- Guidance Usage Tracking Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS guidance_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guidance_id UUID NOT NULL REFERENCES agent_guidance(id) ON DELETE CASCADE,
    call_sid VARCHAR(100) NOT NULL,
    clinic_id UUID NOT NULL,

    -- Usage metrics
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Progress
    total_steps INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    skipped_steps INTEGER DEFAULT 0,

    -- Outcome
    outcome VARCHAR(50) CHECK (outcome IN (
        'completed',
        'partial',
        'abandoned',
        'transferred',
        'escalated'
    )),
    conversion BOOLEAN,

    -- Data collected during call
    collected_data JSONB DEFAULT '{}'::jsonb,

    -- Language used
    language VARCHAR(2) DEFAULT 'ro',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_guidance ON guidance_usage(guidance_id);
CREATE INDEX idx_usage_call ON guidance_usage(call_sid);
CREATE INDEX idx_usage_clinic ON guidance_usage(clinic_id);
CREATE INDEX idx_usage_date ON guidance_usage(started_at);
CREATE INDEX idx_usage_outcome ON guidance_usage(outcome);

-- =============================================================================
-- Guidance Suggestions Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS guidance_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) NOT NULL,
    guidance_id UUID NOT NULL REFERENCES agent_guidance(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Suggestion details
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'next-step',
        'talking-point',
        'objection-response',
        'coaching-tip',
        'warning',
        'escalation'
    )),
    content TEXT NOT NULL,
    content_ro TEXT,

    -- Context
    confidence NUMERIC DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    trigger_text TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

    -- Status
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    used BOOLEAN DEFAULT false,

    -- Timestamps
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_suggestions_call ON guidance_suggestions(call_sid);
CREATE INDEX idx_suggestions_guidance ON guidance_suggestions(guidance_id);
CREATE INDEX idx_suggestions_clinic ON guidance_suggestions(clinic_id);
CREATE INDEX idx_suggestions_type ON guidance_suggestions(type);
CREATE INDEX idx_suggestions_pending ON guidance_suggestions(call_sid, acknowledged)
    WHERE acknowledged = false;

-- =============================================================================
-- Objection Detection Log
-- =============================================================================

CREATE TABLE IF NOT EXISTS objection_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) NOT NULL,
    guidance_id UUID REFERENCES agent_guidance(id) ON DELETE SET NULL,
    clinic_id UUID NOT NULL,

    -- Objection details
    objection_text TEXT NOT NULL,
    objection_category VARCHAR(50),
    confidence NUMERIC DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),

    -- Response
    suggested_response TEXT,
    response_used BOOLEAN DEFAULT false,

    -- Outcome
    handled_successfully BOOLEAN,

    -- Timestamps
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_objections_call ON objection_detections(call_sid);
CREATE INDEX idx_objections_clinic ON objection_detections(clinic_id);
CREATE INDEX idx_objections_category ON objection_detections(objection_category);
CREATE INDEX idx_objections_date ON objection_detections(detected_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE agent_guidance ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objection_detections ENABLE ROW LEVEL SECURITY;

-- Agent Guidance RLS
CREATE POLICY guidance_clinic_isolation ON agent_guidance
    FOR ALL USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Usage RLS
CREATE POLICY usage_clinic_isolation ON guidance_usage
    FOR ALL USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Suggestions RLS
CREATE POLICY suggestions_clinic_isolation ON guidance_suggestions
    FOR ALL USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Objections RLS
CREATE POLICY objections_clinic_isolation ON objection_detections
    FOR ALL USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- =============================================================================
-- Updated At Trigger
-- =============================================================================

CREATE TRIGGER update_agent_guidance_updated_at
    BEFORE UPDATE ON agent_guidance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Views
-- =============================================================================

-- Guidance effectiveness view
CREATE OR REPLACE VIEW guidance_effectiveness AS
SELECT
    g.id,
    g.clinic_id,
    g.name,
    g.type,
    g.category,
    g.usage_count,
    g.avg_call_duration,
    g.conversion_rate,
    g.satisfaction_score,
    COALESCE(u.total_usages, 0) as actual_usages,
    COALESCE(u.avg_duration, 0) as actual_avg_duration,
    COALESCE(u.completion_rate, 0) as completion_rate,
    COALESCE(u.actual_conversion_rate, 0) as actual_conversion_rate
FROM agent_guidance g
LEFT JOIN (
    SELECT
        guidance_id,
        COUNT(*) as total_usages,
        AVG(duration_seconds) as avg_duration,
        AVG(CASE WHEN outcome = 'completed' THEN 1.0 ELSE 0.0 END) * 100 as completion_rate,
        AVG(CASE WHEN conversion = true THEN 1.0 ELSE 0.0 END) * 100 as actual_conversion_rate
    FROM guidance_usage
    WHERE started_at >= NOW() - INTERVAL '30 days'
    GROUP BY guidance_id
) u ON g.id = u.guidance_id
WHERE g.deleted_at IS NULL;

-- Daily guidance metrics view
CREATE OR REPLACE VIEW guidance_daily_metrics AS
SELECT
    DATE(started_at) as date,
    clinic_id,
    guidance_id,
    COUNT(*) as usage_count,
    AVG(duration_seconds) as avg_duration,
    SUM(completed_steps) as total_completed_steps,
    SUM(skipped_steps) as total_skipped_steps,
    SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) as completed_count,
    SUM(CASE WHEN conversion = true THEN 1 ELSE 0 END) as conversion_count
FROM guidance_usage
GROUP BY DATE(started_at), clinic_id, guidance_id;

-- Objection summary view
CREATE OR REPLACE VIEW objection_summary AS
SELECT
    clinic_id,
    objection_category,
    COUNT(*) as total_objections,
    SUM(CASE WHEN handled_successfully = true THEN 1 ELSE 0 END) as successful_handles,
    AVG(CASE WHEN handled_successfully = true THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
    SUM(CASE WHEN response_used = true THEN 1 ELSE 0 END) as responses_used
FROM objection_detections
WHERE detected_at >= NOW() - INTERVAL '30 days'
GROUP BY clinic_id, objection_category;

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Function to find best matching guidance for a call
CREATE OR REPLACE FUNCTION find_guidance_for_call(
    p_clinic_id UUID,
    p_type VARCHAR DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_audience VARCHAR DEFAULT 'all',
    p_procedure VARCHAR DEFAULT NULL,
    p_language VARCHAR DEFAULT 'ro'
) RETURNS UUID AS $$
DECLARE
    v_guidance_id UUID;
BEGIN
    SELECT id INTO v_guidance_id
    FROM agent_guidance
    WHERE clinic_id = p_clinic_id
      AND deleted_at IS NULL
      AND is_active = true
      AND is_draft = false
      AND (p_type IS NULL OR type = p_type)
      AND (p_category IS NULL OR category = p_category)
      AND (p_audience = 'all' OR audience = 'all' OR audience = p_audience)
      AND (p_procedure IS NULL OR p_procedure = ANY(procedures))
      AND p_language = ANY(languages)
    ORDER BY
        -- Prefer specific audience match
        CASE WHEN audience = p_audience THEN 0 ELSE 1 END,
        -- Prefer specific procedure match
        CASE WHEN p_procedure = ANY(procedures) THEN 0 ELSE 1 END,
        -- Prefer higher usage (proven effectiveness)
        usage_count DESC,
        -- Prefer newer
        created_at DESC
    LIMIT 1;

    RETURN v_guidance_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_guidance_usage(p_guidance_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE agent_guidance
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = p_guidance_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update guidance metrics
CREATE OR REPLACE FUNCTION update_guidance_metrics(p_guidance_id UUID)
RETURNS void AS $$
DECLARE
    v_avg_duration NUMERIC;
    v_conversion_rate NUMERIC;
BEGIN
    SELECT
        AVG(duration_seconds),
        AVG(CASE WHEN conversion = true THEN 100.0 ELSE 0.0 END)
    INTO v_avg_duration, v_conversion_rate
    FROM guidance_usage
    WHERE guidance_id = p_guidance_id
      AND started_at >= NOW() - INTERVAL '30 days';

    UPDATE agent_guidance
    SET
        avg_call_duration = COALESCE(v_avg_duration, avg_call_duration),
        conversion_rate = COALESCE(v_conversion_rate, conversion_rate),
        updated_at = NOW()
    WHERE id = p_guidance_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE agent_guidance IS 'Agent guidance and call scripts for structured call handling';
COMMENT ON TABLE guidance_usage IS 'Tracks usage of guidance during calls';
COMMENT ON TABLE guidance_suggestions IS 'Real-time suggestions generated during calls';
COMMENT ON TABLE objection_detections IS 'Log of detected objections and how they were handled';

COMMENT ON COLUMN agent_guidance.steps IS 'JSONB array of script steps with structure: [{id, order, actionType, content, ...}]';
COMMENT ON COLUMN agent_guidance.key_points IS 'JSONB array of talking points: [{id, topic, content, triggers, priority, ...}]';
COMMENT ON COLUMN agent_guidance.objection_handlers IS 'JSONB array of objection handlers: [{id, objection, patterns, response, ...}]';
