-- ============================================================================
-- MedicalCor Core - Agent Wrap-Up Time Tracking
-- ============================================================================
-- M8: Agent Wrap-Up Time Tracking - Track time between calls, disposition entry
-- Provides agent productivity metrics for after-call work (ACW)
-- ============================================================================

-- =============================================================================
-- ADD WRAP-UP COLUMNS TO AGENT PERFORMANCE DAILY
-- =============================================================================

ALTER TABLE agent_performance_daily
    ADD COLUMN IF NOT EXISTS wrap_up_time_seconds INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wrap_up_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_wrap_up_time_seconds INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS min_wrap_up_time_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS max_wrap_up_time_seconds INTEGER;

COMMENT ON COLUMN agent_performance_daily.wrap_up_time_seconds IS 'M8: Total wrap-up time in seconds';
COMMENT ON COLUMN agent_performance_daily.wrap_up_count IS 'M8: Number of wrap-up sessions completed';
COMMENT ON COLUMN agent_performance_daily.avg_wrap_up_time_seconds IS 'M8: Average wrap-up time per call';
COMMENT ON COLUMN agent_performance_daily.min_wrap_up_time_seconds IS 'M8: Minimum wrap-up time recorded';
COMMENT ON COLUMN agent_performance_daily.max_wrap_up_time_seconds IS 'M8: Maximum wrap-up time recorded';

-- =============================================================================
-- AGENT WRAP-UP EVENTS TABLE (Granular Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_wrap_up_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Call reference
    call_sid VARCHAR(100) NOT NULL,
    lead_id UUID,

    -- Disposition reference (set when wrap-up completed)
    disposition_id UUID,

    -- Wrap-up status
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'abandoned')),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Optional notes/metadata
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_agent ON agent_wrap_up_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_clinic ON agent_wrap_up_events(clinic_id);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_call ON agent_wrap_up_events(call_sid);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_started ON agent_wrap_up_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_status ON agent_wrap_up_events(status);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_agent_date ON agent_wrap_up_events(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wrap_up_events_in_progress ON agent_wrap_up_events(agent_id, call_sid)
    WHERE status = 'in_progress';

-- =============================================================================
-- FUNCTIONS: Wrap-Up Time Management
-- =============================================================================

-- Function to start wrap-up tracking
CREATE OR REPLACE FUNCTION start_agent_wrap_up(
    p_agent_id UUID,
    p_clinic_id UUID,
    p_call_sid VARCHAR(100),
    p_lead_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Mark any existing in-progress wrap-up for same call as abandoned
    UPDATE agent_wrap_up_events
    SET status = 'abandoned',
        completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
        updated_at = NOW()
    WHERE agent_id = p_agent_id
    AND call_sid = p_call_sid
    AND status = 'in_progress';

    -- Create new wrap-up event
    INSERT INTO agent_wrap_up_events (
        agent_id, clinic_id, call_sid, lead_id, status, started_at
    ) VALUES (
        p_agent_id, p_clinic_id, p_call_sid, p_lead_id, 'in_progress', NOW()
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete wrap-up tracking
CREATE OR REPLACE FUNCTION complete_agent_wrap_up(
    p_call_sid VARCHAR(100),
    p_agent_id UUID,
    p_disposition_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_duration INTEGER;
    v_clinic_id UUID;
    v_started_at TIMESTAMPTZ;
BEGIN
    -- Get the in-progress event
    SELECT clinic_id, started_at INTO v_clinic_id, v_started_at
    FROM agent_wrap_up_events
    WHERE call_sid = p_call_sid
    AND agent_id = p_agent_id
    AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_started_at IS NULL THEN
        RETURN 0; -- No in-progress wrap-up found
    END IF;

    -- Calculate duration
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_started_at))::INTEGER;

    -- Update the wrap-up event
    UPDATE agent_wrap_up_events
    SET status = 'completed',
        completed_at = NOW(),
        duration_seconds = v_duration,
        disposition_id = p_disposition_id,
        notes = p_notes,
        updated_at = NOW()
    WHERE call_sid = p_call_sid
    AND agent_id = p_agent_id
    AND status = 'in_progress';

    -- Update daily metrics
    PERFORM update_agent_wrap_up_metrics(p_agent_id, v_clinic_id, v_duration);

    RETURN v_duration;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily wrap-up metrics
CREATE OR REPLACE FUNCTION update_agent_wrap_up_metrics(
    p_agent_id UUID,
    p_clinic_id UUID,
    p_duration_seconds INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_record_id UUID;
    v_current_total INTEGER;
    v_current_count INTEGER;
    v_current_min INTEGER;
    v_current_max INTEGER;
BEGIN
    -- Get or create daily record
    v_record_id := get_or_create_agent_daily_performance(p_agent_id, p_clinic_id);

    -- Get current values
    SELECT
        COALESCE(wrap_up_time_seconds, 0),
        COALESCE(wrap_up_count, 0),
        min_wrap_up_time_seconds,
        max_wrap_up_time_seconds
    INTO v_current_total, v_current_count, v_current_min, v_current_max
    FROM agent_performance_daily
    WHERE id = v_record_id;

    -- Update metrics
    UPDATE agent_performance_daily
    SET
        wrap_up_time_seconds = v_current_total + p_duration_seconds,
        wrap_up_count = v_current_count + 1,
        avg_wrap_up_time_seconds = (v_current_total + p_duration_seconds) / (v_current_count + 1),
        min_wrap_up_time_seconds = LEAST(COALESCE(v_current_min, p_duration_seconds), p_duration_seconds),
        max_wrap_up_time_seconds = GREATEST(COALESCE(v_current_max, p_duration_seconds), p_duration_seconds),
        updated_at = NOW()
    WHERE id = v_record_id;
END;
$$ LANGUAGE plpgsql;

-- Function to abandon stale wrap-ups (e.g., agent went offline)
CREATE OR REPLACE FUNCTION abandon_stale_wrap_ups(
    p_max_age_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH abandoned AS (
        UPDATE agent_wrap_up_events
        SET status = 'abandoned',
            completed_at = NOW(),
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
            updated_at = NOW()
        WHERE status = 'in_progress'
        AND started_at < NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM abandoned;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent wrap-up statistics
CREATE OR REPLACE FUNCTION get_agent_wrap_up_stats(
    p_agent_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_wrap_ups BIGINT,
    completed_wrap_ups BIGINT,
    abandoned_wrap_ups BIGINT,
    total_wrap_up_time_seconds BIGINT,
    avg_wrap_up_time_seconds NUMERIC,
    min_wrap_up_time_seconds INTEGER,
    max_wrap_up_time_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
        COUNT(*) FILTER (WHERE status = 'abandoned')::BIGINT,
        COALESCE(SUM(duration_seconds), 0)::BIGINT,
        COALESCE(AVG(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC,
        MIN(duration_seconds) FILTER (WHERE status = 'completed'),
        MAX(duration_seconds) FILTER (WHERE status = 'completed')
    FROM agent_wrap_up_events
    WHERE agent_id = p_agent_id
    AND started_at::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VIEWS: Wrap-Up Time Analytics
-- =============================================================================

-- Real-time wrap-up status view
CREATE OR REPLACE VIEW agent_wrap_up_status AS
SELECT
    a.id AS agent_id,
    a.name AS agent_name,
    a.clinic_id,
    w.call_sid,
    w.lead_id,
    w.started_at,
    EXTRACT(EPOCH FROM (NOW() - w.started_at))::INTEGER AS current_duration_seconds
FROM agents a
INNER JOIN agent_wrap_up_events w ON w.agent_id = a.id
WHERE w.status = 'in_progress'
AND a.deleted_at IS NULL;

-- Agent wrap-up performance summary (last 30 days)
CREATE OR REPLACE VIEW agent_wrap_up_summary AS
SELECT
    a.id AS agent_id,
    a.name,
    a.agent_type,
    a.clinic_id,
    COALESCE(SUM(p.wrap_up_count), 0)::INTEGER AS total_wrap_ups,
    COALESCE(SUM(p.wrap_up_time_seconds), 0)::INTEGER AS total_wrap_up_time,
    CASE
        WHEN SUM(p.wrap_up_count) > 0
        THEN ROUND(SUM(p.wrap_up_time_seconds)::NUMERIC / SUM(p.wrap_up_count), 0)
        ELSE 0
    END AS avg_wrap_up_seconds,
    MIN(p.min_wrap_up_time_seconds) AS min_wrap_up_seconds,
    MAX(p.max_wrap_up_time_seconds) AS max_wrap_up_seconds
FROM agents a
LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
    AND p.metric_date >= CURRENT_DATE - INTERVAL '30 days'
WHERE a.deleted_at IS NULL
AND a.status = 'active'
GROUP BY a.id, a.name, a.agent_type, a.clinic_id;

-- Daily wrap-up trend view
CREATE OR REPLACE VIEW agent_wrap_up_daily_trend AS
SELECT
    agent_id,
    clinic_id,
    metric_date,
    wrap_up_count,
    wrap_up_time_seconds AS total_wrap_up_seconds,
    avg_wrap_up_time_seconds,
    min_wrap_up_time_seconds,
    max_wrap_up_time_seconds
FROM agent_performance_daily
WHERE wrap_up_count > 0
ORDER BY metric_date DESC;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamps
DROP TRIGGER IF EXISTS update_wrap_up_events_updated_at ON agent_wrap_up_events;
CREATE TRIGGER update_wrap_up_events_updated_at
    BEFORE UPDATE ON agent_wrap_up_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE agent_wrap_up_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY wrap_up_events_clinic_isolation ON agent_wrap_up_events
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE agent_wrap_up_events IS 'M8: Individual wrap-up tracking events for agent productivity metrics';
COMMENT ON FUNCTION start_agent_wrap_up IS 'M8: Start tracking wrap-up time after a call ends';
COMMENT ON FUNCTION complete_agent_wrap_up IS 'M8: Complete wrap-up tracking when disposition is entered';
COMMENT ON FUNCTION update_agent_wrap_up_metrics IS 'M8: Update daily aggregate metrics with wrap-up data';
COMMENT ON FUNCTION abandon_stale_wrap_ups IS 'M8: Mark long-running wrap-ups as abandoned';
COMMENT ON FUNCTION get_agent_wrap_up_stats IS 'M8: Get wrap-up statistics for an agent over a period';
COMMENT ON VIEW agent_wrap_up_status IS 'M8: Real-time view of agents currently in wrap-up';
COMMENT ON VIEW agent_wrap_up_summary IS 'M8: Agent wrap-up performance summary (last 30 days)';
COMMENT ON VIEW agent_wrap_up_daily_trend IS 'M8: Daily wrap-up metrics for trending';
