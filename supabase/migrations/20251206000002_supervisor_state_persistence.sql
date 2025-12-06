-- ============================================================================
-- MedicalCor Core - Supervisor Agent State Persistence
-- ============================================================================
-- H3 Fix: Persists SupervisorAgent state to database to survive restarts
-- Enables high availability and state recovery for voice call supervision
-- ============================================================================

-- =============================================================================
-- MONITORED CALLS (Active Call State)
-- =============================================================================

CREATE TABLE IF NOT EXISTS supervisor_monitored_calls (
    call_sid VARCHAR(100) PRIMARY KEY,
    clinic_id UUID NOT NULL,

    -- Call identification
    phone_number VARCHAR(50),
    lead_id UUID,
    contact_name VARCHAR(200),

    -- Current state
    state VARCHAR(30) NOT NULL DEFAULT 'ringing'
        CHECK (state IN ('ringing', 'in-progress', 'on-hold', 'transferring', 'wrapping-up', 'completed')),
    direction VARCHAR(20) NOT NULL DEFAULT 'inbound'
        CHECK (direction IN ('inbound', 'outbound')),

    -- AI/Agent assignment
    assistant_id VARCHAR(100),
    agent_id VARCHAR(100),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    hold_started_at TIMESTAMPTZ,

    -- Sentiment & classification
    sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    ai_score INTEGER,

    -- Flags (array of strings)
    flags TEXT[] DEFAULT '{}',

    -- Recent transcript (last N messages)
    recent_transcript JSONB DEFAULT '[]',

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_monitored_calls_clinic ON supervisor_monitored_calls(clinic_id);
CREATE INDEX IF NOT EXISTS idx_monitored_calls_state ON supervisor_monitored_calls(state);
CREATE INDEX IF NOT EXISTS idx_monitored_calls_flags ON supervisor_monitored_calls USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_monitored_calls_started ON supervisor_monitored_calls(started_at DESC);

-- =============================================================================
-- SUPERVISOR SESSIONS (Active Monitoring Sessions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS supervisor_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,

    -- Supervisor info
    supervisor_id VARCHAR(100) NOT NULL,
    supervisor_name VARCHAR(200),
    role VARCHAR(20) NOT NULL DEFAULT 'supervisor'
        CHECK (role IN ('supervisor', 'manager', 'admin')),
    permissions TEXT[] DEFAULT '{}',

    -- Current monitoring
    monitoring_mode VARCHAR(20) NOT NULL DEFAULT 'none'
        CHECK (monitoring_mode IN ('none', 'listen', 'whisper', 'barge', 'coach')),
    active_call_sid VARCHAR(100) REFERENCES supervisor_monitored_calls(call_sid) ON DELETE SET NULL,

    -- Session metrics
    calls_monitored INTEGER DEFAULT 0,
    interventions INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    -- Session expiry (for cleanup)
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '8 hours'),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_clinic ON supervisor_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_supervisor ON supervisor_sessions(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_active ON supervisor_sessions(active_call_sid) WHERE active_call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_expires ON supervisor_sessions(expires_at);

-- =============================================================================
-- SUPERVISOR NOTES (Call Notes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS supervisor_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) NOT NULL,
    supervisor_id VARCHAR(100) NOT NULL,
    supervisor_name VARCHAR(200),

    -- Note content
    content TEXT NOT NULL,
    is_private BOOLEAN DEFAULT false,

    -- Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supervisor_notes_call ON supervisor_notes(call_sid);
CREATE INDEX IF NOT EXISTS idx_supervisor_notes_supervisor ON supervisor_notes(supervisor_id);

-- =============================================================================
-- ESCALATION HISTORY (For Metrics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS supervisor_escalation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) NOT NULL,
    clinic_id UUID NOT NULL,

    -- Escalation details
    reason TEXT NOT NULL,
    escalation_type VARCHAR(50) NOT NULL DEFAULT 'keyword'
        CHECK (escalation_type IN ('keyword', 'sentiment', 'hold_time', 'silence', 'manual', 'ai_request')),

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_action VARCHAR(50),

    -- Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_escalation_history_clinic ON supervisor_escalation_history(clinic_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_time ON supervisor_escalation_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_history_call ON supervisor_escalation_history(call_sid);

-- =============================================================================
-- HANDOFF HISTORY (AI to Human)
-- =============================================================================

CREATE TABLE IF NOT EXISTS supervisor_handoff_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) NOT NULL,
    clinic_id UUID NOT NULL,

    -- Handoff details
    handoff_id VARCHAR(100) NOT NULL,
    reason TEXT,
    priority VARCHAR(20) DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    skill_required VARCHAR(100),
    context JSONB DEFAULT '{}',

    -- Request info
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Completion info
    completed_at TIMESTAMPTZ,
    agent_id VARCHAR(100),
    agent_name VARCHAR(200),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_handoff_history_clinic ON supervisor_handoff_history(clinic_id);
CREATE INDEX IF NOT EXISTS idx_handoff_history_time ON supervisor_handoff_history(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_history_call ON supervisor_handoff_history(call_sid);

-- =============================================================================
-- FUNCTIONS: Auto-cleanup expired calls and sessions
-- =============================================================================

-- Function to cleanup completed calls older than retention period
CREATE OR REPLACE FUNCTION cleanup_supervisor_completed_calls(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    -- Delete completed calls older than retention
    DELETE FROM supervisor_monitored_calls
    WHERE state = 'completed'
    AND updated_at < NOW() - (retention_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also cleanup expired sessions
    DELETE FROM supervisor_sessions
    WHERE expires_at < NOW();

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup orphaned call data (notes for deleted calls)
CREATE OR REPLACE FUNCTION cleanup_supervisor_orphaned_data()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER := 0;
    v_count INTEGER;
BEGIN
    -- Delete notes for calls that no longer exist and are older than 7 days
    DELETE FROM supervisor_notes
    WHERE call_sid NOT IN (SELECT call_sid FROM supervisor_monitored_calls)
    AND created_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;

    -- Delete old escalation history (keep 30 days)
    DELETE FROM supervisor_escalation_history
    WHERE timestamp < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;

    -- Delete old handoff history (keep 30 days)
    DELETE FROM supervisor_handoff_history
    WHERE requested_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_monitored_calls_updated_at ON supervisor_monitored_calls;
CREATE TRIGGER update_monitored_calls_updated_at
    BEFORE UPDATE ON supervisor_monitored_calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_supervisor_sessions_updated_at ON supervisor_sessions;
CREATE TRIGGER update_supervisor_sessions_updated_at
    BEFORE UPDATE ON supervisor_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS: Dashboard Statistics
-- =============================================================================

-- Real-time supervisor dashboard stats
CREATE OR REPLACE VIEW supervisor_dashboard_stats AS
SELECT
    smc.clinic_id,
    COUNT(*) FILTER (WHERE smc.state NOT IN ('completed')) AS active_calls,
    COUNT(*) FILTER (WHERE smc.state = 'ringing') AS calls_in_queue,
    COUNT(*) FILTER (WHERE 'escalation-requested' = ANY(smc.flags)) AS active_escalations,
    COUNT(*) FILTER (WHERE 'ai-handoff-needed' = ANY(smc.flags)) AS pending_handoffs,
    COUNT(*) FILTER (WHERE smc.assistant_id IS NOT NULL AND smc.agent_id IS NULL) AS ai_handled_calls,
    (
        SELECT COUNT(*) FROM supervisor_escalation_history seh
        WHERE seh.clinic_id = smc.clinic_id
        AND seh.timestamp >= DATE_TRUNC('day', NOW())
    ) AS escalations_today,
    (
        SELECT COUNT(*) FROM supervisor_handoff_history shh
        WHERE shh.clinic_id = smc.clinic_id
        AND shh.completed_at IS NOT NULL
        AND shh.requested_at >= DATE_TRUNC('day', NOW())
    ) AS handoffs_today,
    (
        SELECT COUNT(*) FROM supervisor_sessions ss
        WHERE ss.clinic_id = smc.clinic_id
        AND ss.expires_at > NOW()
    ) AS active_supervisors
FROM supervisor_monitored_calls smc
WHERE smc.state NOT IN ('completed')
GROUP BY smc.clinic_id;

-- Historical daily metrics
CREATE OR REPLACE VIEW supervisor_daily_metrics AS
SELECT
    DATE_TRUNC('day', timestamp) AS day,
    clinic_id,
    COUNT(*) AS total_escalations,
    COUNT(*) FILTER (WHERE escalation_type = 'keyword') AS keyword_escalations,
    COUNT(*) FILTER (WHERE escalation_type = 'sentiment') AS sentiment_escalations,
    COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_escalations,
    AVG(EXTRACT(EPOCH FROM (resolved_at - timestamp))) FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_seconds
FROM supervisor_escalation_history
GROUP BY DATE_TRUNC('day', timestamp), clinic_id;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE supervisor_monitored_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_escalation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_handoff_history ENABLE ROW LEVEL SECURITY;

-- Clinic-scoped access
CREATE POLICY supervisor_calls_clinic_isolation ON supervisor_monitored_calls
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY supervisor_sessions_clinic_isolation ON supervisor_sessions
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY supervisor_notes_access ON supervisor_notes
    FOR ALL
    USING (
        call_sid IN (
            SELECT call_sid FROM supervisor_monitored_calls
            WHERE clinic_id = current_setting('app.current_clinic_id', true)::UUID
        )
    );

CREATE POLICY supervisor_escalation_clinic_isolation ON supervisor_escalation_history
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY supervisor_handoff_clinic_isolation ON supervisor_handoff_history
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Comments
COMMENT ON TABLE supervisor_monitored_calls IS 'H3 Fix: Persistent state for monitored calls - survives restarts';
COMMENT ON TABLE supervisor_sessions IS 'H3 Fix: Persistent supervisor monitoring sessions';
COMMENT ON TABLE supervisor_notes IS 'Notes added by supervisors during call monitoring';
COMMENT ON TABLE supervisor_escalation_history IS 'Historical record of escalation events';
COMMENT ON TABLE supervisor_handoff_history IS 'Historical record of AI-to-human handoffs';
COMMENT ON VIEW supervisor_dashboard_stats IS 'Real-time dashboard statistics per clinic';
COMMENT ON VIEW supervisor_daily_metrics IS 'Daily aggregated supervisor metrics';
