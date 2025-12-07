-- ============================================================================
-- MedicalCor Core - Agent Performance Metrics
-- ============================================================================
-- M7: Agent Performance Dashboard - Individual Metrics
-- Tracks individual agent performance across leads, calls, conversions, and satisfaction
-- ============================================================================

-- =============================================================================
-- AGENTS TABLE (Core Agent Registry)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,

    -- Agent identity
    user_id UUID, -- References auth.users if internal user
    external_id VARCHAR(100), -- External system ID (e.g., Twilio worker SID)
    name VARCHAR(200) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(50),
    avatar_url TEXT,

    -- Agent classification
    agent_type VARCHAR(30) NOT NULL DEFAULT 'human'
        CHECK (agent_type IN ('human', 'ai', 'hybrid')),
    role VARCHAR(50) DEFAULT 'agent'
        CHECK (role IN ('agent', 'senior_agent', 'team_lead', 'supervisor', 'manager')),

    -- Skills and specializations
    skills TEXT[] DEFAULT '{}',
    languages TEXT[] DEFAULT ARRAY['ro'],
    max_concurrent_chats INTEGER DEFAULT 3,

    -- Status
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
    available BOOLEAN DEFAULT true,

    -- Working hours (JSON with day-based schedule)
    working_hours JSONB DEFAULT '{"timezone": "Europe/Bucharest", "schedule": {}}',

    -- Timestamps
    hired_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_clinic ON agents(clinic_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_agents_skills ON agents USING gin(skills);

-- =============================================================================
-- AGENT SESSIONS (Work Shifts/Login Sessions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Session timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    -- Status during session
    status VARCHAR(30) DEFAULT 'available'
        CHECK (status IN ('available', 'busy', 'away', 'break', 'training', 'offline')),

    -- Session stats (updated during session)
    leads_handled INTEGER DEFAULT 0,
    calls_handled INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,

    -- Break tracking (total seconds on break)
    total_break_seconds INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_clinic ON agent_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_started ON agent_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_active ON agent_sessions(agent_id) WHERE ended_at IS NULL;

-- =============================================================================
-- AGENT PERFORMANCE METRICS (Daily Aggregates)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_performance_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Date partition
    metric_date DATE NOT NULL,

    -- Lead metrics
    leads_assigned INTEGER DEFAULT 0,
    leads_handled INTEGER DEFAULT 0,
    leads_converted INTEGER DEFAULT 0,
    leads_lost INTEGER DEFAULT 0,

    -- Call metrics
    calls_inbound INTEGER DEFAULT 0,
    calls_outbound INTEGER DEFAULT 0,
    calls_answered INTEGER DEFAULT 0,
    calls_missed INTEGER DEFAULT 0,
    total_talk_time_seconds INTEGER DEFAULT 0,
    avg_call_duration_seconds INTEGER DEFAULT 0,

    -- Message metrics
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,

    -- Response metrics (in milliseconds)
    avg_response_time_ms INTEGER DEFAULT 0,
    min_response_time_ms INTEGER,
    max_response_time_ms INTEGER,
    first_response_time_ms INTEGER,

    -- Conversion metrics
    appointments_scheduled INTEGER DEFAULT 0,
    appointments_completed INTEGER DEFAULT 0,
    appointments_cancelled INTEGER DEFAULT 0,

    -- Quality metrics
    escalations INTEGER DEFAULT 0,
    handoffs_received INTEGER DEFAULT 0,
    handoffs_given INTEGER DEFAULT 0,

    -- Customer satisfaction
    csat_responses INTEGER DEFAULT 0,
    csat_total_score INTEGER DEFAULT 0, -- Sum of all scores for avg calculation
    nps_promoters INTEGER DEFAULT 0,
    nps_detractors INTEGER DEFAULT 0,
    nps_passives INTEGER DEFAULT 0,

    -- Revenue attribution
    revenue_generated DECIMAL(12, 2) DEFAULT 0,

    -- Time tracking
    time_logged_seconds INTEGER DEFAULT 0,
    time_on_break_seconds INTEGER DEFAULT 0,
    time_in_calls_seconds INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one row per agent per day
    UNIQUE(agent_id, metric_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_agent ON agent_performance_daily(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_clinic ON agent_performance_daily(clinic_id);
CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_date ON agent_performance_daily(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_perf_daily_agent_date ON agent_performance_daily(agent_id, metric_date DESC);

-- =============================================================================
-- AGENT LEAD ASSIGNMENTS (Track lead ownership history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_lead_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    clinic_id UUID NOT NULL,

    -- Assignment details
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    assignment_reason VARCHAR(50) DEFAULT 'manual'
        CHECK (assignment_reason IN ('manual', 'auto_round_robin', 'auto_skill_based', 'auto_load_balance', 'escalation', 'handoff')),

    -- Outcome
    outcome VARCHAR(30)
        CHECK (outcome IN ('converted', 'lost', 'transferred', 'pending')),
    outcome_at TIMESTAMPTZ,

    -- First response tracking
    first_response_at TIMESTAMPTZ,
    first_response_time_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_assignments_agent ON agent_lead_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead ON agent_lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_clinic ON agent_lead_assignments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned ON agent_lead_assignments(assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_active ON agent_lead_assignments(agent_id) WHERE unassigned_at IS NULL;

-- =============================================================================
-- AGENT SATISFACTION RATINGS (Customer Feedback per Interaction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_satisfaction_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    lead_id UUID,
    interaction_id UUID, -- References interactions table
    clinic_id UUID NOT NULL,

    -- Rating type
    rating_type VARCHAR(20) NOT NULL DEFAULT 'csat'
        CHECK (rating_type IN ('csat', 'nps', 'effort_score')),

    -- Score
    score INTEGER NOT NULL, -- 1-5 for CSAT, 0-10 for NPS, 1-7 for CES

    -- Optional feedback
    feedback TEXT,

    -- Source
    channel VARCHAR(20),

    -- Timestamp
    rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_satisfaction_agent ON agent_satisfaction_ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_clinic ON agent_satisfaction_ratings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_rated ON agent_satisfaction_ratings(rated_at DESC);

-- =============================================================================
-- FUNCTIONS: Calculate Agent Performance
-- =============================================================================

-- Function to get or create daily performance record
CREATE OR REPLACE FUNCTION get_or_create_agent_daily_performance(
    p_agent_id UUID,
    p_clinic_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
    v_record_id UUID;
BEGIN
    -- Try to find existing record
    SELECT id INTO v_record_id
    FROM agent_performance_daily
    WHERE agent_id = p_agent_id AND metric_date = p_date;

    -- Create if not exists
    IF v_record_id IS NULL THEN
        INSERT INTO agent_performance_daily (agent_id, clinic_id, metric_date)
        VALUES (p_agent_id, p_clinic_id, p_date)
        RETURNING id INTO v_record_id;
    END IF;

    RETURN v_record_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment lead metrics
CREATE OR REPLACE FUNCTION increment_agent_lead_metric(
    p_agent_id UUID,
    p_clinic_id UUID,
    p_metric VARCHAR(30),
    p_value INTEGER DEFAULT 1
)
RETURNS VOID AS $$
DECLARE
    v_record_id UUID;
BEGIN
    v_record_id := get_or_create_agent_daily_performance(p_agent_id, p_clinic_id);

    EXECUTE format(
        'UPDATE agent_performance_daily SET %I = %I + $1, updated_at = NOW() WHERE id = $2',
        p_metric, p_metric
    ) USING p_value, v_record_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate agent conversion rate
CREATE OR REPLACE FUNCTION calculate_agent_conversion_rate(
    p_agent_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_handled INTEGER;
    v_converted INTEGER;
BEGIN
    SELECT
        COALESCE(SUM(leads_handled), 0),
        COALESCE(SUM(leads_converted), 0)
    INTO v_handled, v_converted
    FROM agent_performance_daily
    WHERE agent_id = p_agent_id
    AND metric_date BETWEEN p_start_date AND p_end_date;

    IF v_handled = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((v_converted::DECIMAL / v_handled) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate agent CSAT score
CREATE OR REPLACE FUNCTION calculate_agent_csat(
    p_agent_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(3, 2) AS $$
DECLARE
    v_responses INTEGER;
    v_total_score INTEGER;
BEGIN
    SELECT
        COALESCE(SUM(csat_responses), 0),
        COALESCE(SUM(csat_total_score), 0)
    INTO v_responses, v_total_score
    FROM agent_performance_daily
    WHERE agent_id = p_agent_id
    AND metric_date BETWEEN p_start_date AND p_end_date;

    IF v_responses = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND(v_total_score::DECIMAL / v_responses, 2);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VIEWS: Agent Performance Dashboards
-- =============================================================================

-- Real-time agent status view
CREATE OR REPLACE VIEW agent_current_status AS
SELECT
    a.id AS agent_id,
    a.name,
    a.agent_type,
    a.role,
    a.clinic_id,
    a.avatar_url,
    COALESCE(s.status, 'offline') AS current_status,
    s.started_at AS session_started,
    s.leads_handled AS session_leads,
    s.calls_handled AS session_calls,
    (
        SELECT COUNT(*)
        FROM agent_lead_assignments ala
        WHERE ala.agent_id = a.id
        AND ala.unassigned_at IS NULL
    ) AS active_leads
FROM agents a
LEFT JOIN agent_sessions s ON s.agent_id = a.id AND s.ended_at IS NULL
WHERE a.deleted_at IS NULL
AND a.status = 'active';

-- Agent performance summary (last 30 days)
CREATE OR REPLACE VIEW agent_performance_summary AS
SELECT
    a.id AS agent_id,
    a.name,
    a.agent_type,
    a.role,
    a.clinic_id,
    a.avatar_url,
    -- Lead metrics
    COALESCE(SUM(p.leads_handled), 0) AS total_leads_handled,
    COALESCE(SUM(p.leads_converted), 0) AS total_conversions,
    CASE
        WHEN SUM(p.leads_handled) > 0
        THEN ROUND((SUM(p.leads_converted)::DECIMAL / SUM(p.leads_handled)) * 100, 1)
        ELSE 0
    END AS conversion_rate,
    -- Response time
    CASE
        WHEN SUM(p.leads_handled) > 0
        THEN ROUND(AVG(p.avg_response_time_ms) / 60000, 1) -- Convert to minutes
        ELSE 0
    END AS avg_response_time_min,
    -- Satisfaction
    CASE
        WHEN SUM(p.csat_responses) > 0
        THEN ROUND(SUM(p.csat_total_score)::DECIMAL / SUM(p.csat_responses), 1)
        ELSE 0
    END AS csat_score,
    -- Call metrics
    COALESCE(SUM(p.calls_answered), 0) AS total_calls,
    COALESCE(SUM(p.total_talk_time_seconds) / 3600, 0) AS talk_time_hours,
    -- Revenue
    COALESCE(SUM(p.revenue_generated), 0) AS total_revenue
FROM agents a
LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
    AND p.metric_date >= CURRENT_DATE - INTERVAL '30 days'
WHERE a.deleted_at IS NULL
AND a.status = 'active'
GROUP BY a.id, a.name, a.agent_type, a.role, a.clinic_id, a.avatar_url;

-- Daily performance trend view
CREATE OR REPLACE VIEW agent_daily_trend AS
SELECT
    agent_id,
    clinic_id,
    metric_date,
    leads_handled,
    leads_converted,
    CASE
        WHEN leads_handled > 0
        THEN ROUND((leads_converted::DECIMAL / leads_handled) * 100, 1)
        ELSE 0
    END AS conversion_rate,
    calls_answered,
    avg_response_time_ms / 60000.0 AS avg_response_time_min,
    CASE
        WHEN csat_responses > 0
        THEN ROUND(csat_total_score::DECIMAL / csat_responses, 2)
        ELSE NULL
    END AS csat_score,
    appointments_scheduled,
    revenue_generated
FROM agent_performance_daily
ORDER BY metric_date DESC;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamps
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at
    BEFORE UPDATE ON agent_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_perf_daily_updated_at ON agent_performance_daily;
CREATE TRIGGER update_agent_perf_daily_updated_at
    BEFORE UPDATE ON agent_performance_daily
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_performance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_satisfaction_ratings ENABLE ROW LEVEL SECURITY;

-- Clinic-scoped access
CREATE POLICY agents_clinic_isolation ON agents
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY agent_sessions_clinic_isolation ON agent_sessions
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY agent_perf_daily_clinic_isolation ON agent_performance_daily
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY agent_assignments_clinic_isolation ON agent_lead_assignments
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

CREATE POLICY agent_satisfaction_clinic_isolation ON agent_satisfaction_ratings
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE agents IS 'M7: Agent registry - tracks all human and AI agents in the system';
COMMENT ON TABLE agent_sessions IS 'M7: Agent work sessions/shifts for availability and time tracking';
COMMENT ON TABLE agent_performance_daily IS 'M7: Daily aggregated performance metrics per agent';
COMMENT ON TABLE agent_lead_assignments IS 'M7: Lead ownership history and assignment tracking';
COMMENT ON TABLE agent_satisfaction_ratings IS 'M7: Customer satisfaction ratings per agent interaction';
COMMENT ON VIEW agent_current_status IS 'Real-time agent availability and status';
COMMENT ON VIEW agent_performance_summary IS 'Agent performance KPIs (last 30 days)';
COMMENT ON VIEW agent_daily_trend IS 'Daily performance metrics for trending';
