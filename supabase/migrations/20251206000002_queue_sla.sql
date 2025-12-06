-- ============================================================================
-- MedicalCor Core - Queue SLA Monitoring Schema (H6)
-- ============================================================================
-- Provides SLA monitoring for call center queues
-- Tracks breaches, status, and generates reports
-- ============================================================================

-- =============================================================================
-- QUEUE SLA CONFIGURATIONS
-- =============================================================================
-- Stores SLA thresholds for each queue

CREATE TABLE IF NOT EXISTS queue_sla_configs (
    queue_sid VARCHAR(100) PRIMARY KEY,
    queue_name VARCHAR(200) NOT NULL,

    -- Wait time thresholds (seconds)
    target_answer_time INTEGER NOT NULL DEFAULT 30,
    max_wait_time INTEGER NOT NULL DEFAULT 120,
    critical_wait_time INTEGER NOT NULL DEFAULT 300,

    -- Queue size thresholds
    max_queue_size INTEGER NOT NULL DEFAULT 10,
    critical_queue_size INTEGER NOT NULL DEFAULT 20,

    -- Abandonment thresholds (percentage)
    max_abandon_rate DECIMAL(5, 2) NOT NULL DEFAULT 5.0,

    -- Agent availability thresholds
    min_available_agents INTEGER NOT NULL DEFAULT 1,
    target_agent_utilization DECIMAL(5, 2) NOT NULL DEFAULT 80.0,

    -- Service level target (percentage of calls answered within target time)
    service_level_target DECIMAL(5, 2) NOT NULL DEFAULT 80.0,

    -- Alert settings
    alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    escalation_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Full config JSON for additional settings
    config JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- QUEUE SLA STATUS (Real-time metrics)
-- =============================================================================
-- Updated every monitoring cycle with current queue status

CREATE TABLE IF NOT EXISTS queue_sla_status (
    queue_sid VARCHAR(100) PRIMARY KEY,
    queue_name VARCHAR(200) NOT NULL,

    -- Current queue metrics
    current_queue_size INTEGER NOT NULL DEFAULT 0,
    longest_wait_time INTEGER NOT NULL DEFAULT 0, -- seconds
    average_wait_time DECIMAL(10, 2) NOT NULL DEFAULT 0,
    average_handle_time DECIMAL(10, 2) NOT NULL DEFAULT 0,

    -- Agent metrics
    available_agents INTEGER NOT NULL DEFAULT 0,
    busy_agents INTEGER NOT NULL DEFAULT 0,
    total_agents INTEGER NOT NULL DEFAULT 0,
    agent_utilization DECIMAL(5, 2) NOT NULL DEFAULT 0,

    -- Performance metrics (rolling)
    calls_handled_today INTEGER NOT NULL DEFAULT 0,
    calls_abandoned_today INTEGER NOT NULL DEFAULT 0,
    abandon_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    service_level DECIMAL(5, 2) NOT NULL DEFAULT 0,

    -- Compliance
    is_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    breaches JSONB DEFAULT '[]', -- Array of current breach types
    severity VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (severity IN ('ok', 'warning', 'critical')),

    -- Timestamp
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- QUEUE SLA BREACHES (Breach events)
-- =============================================================================
-- Records each SLA breach event for auditing and reporting

CREATE TABLE IF NOT EXISTS queue_sla_breaches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_sid VARCHAR(100) NOT NULL,
    queue_name VARCHAR(200) NOT NULL,

    -- Breach details
    breach_type VARCHAR(50) NOT NULL CHECK (breach_type IN (
        'wait_time_exceeded',
        'queue_size_exceeded',
        'abandon_rate_exceeded',
        'agent_availability_low',
        'service_level_missed'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'critical')),

    -- Values at time of breach
    threshold_value DECIMAL(10, 2) NOT NULL,
    current_value DECIMAL(10, 2) NOT NULL,
    affected_calls INTEGER DEFAULT 0,
    affected_agents TEXT[], -- Array of agent IDs

    -- Timing
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    duration_seconds INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - detected_at))::INTEGER
    ) STORED,

    -- Actions
    alert_sent BOOLEAN DEFAULT FALSE,
    escalated BOOLEAN DEFAULT FALSE,
    notes TEXT,

    -- Tracing
    correlation_id VARCHAR(100),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for breach queries
CREATE INDEX IF NOT EXISTS idx_sla_breaches_queue ON queue_sla_breaches(queue_sid);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_type ON queue_sla_breaches(breach_type);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_severity ON queue_sla_breaches(severity);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_detected ON queue_sla_breaches(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_unresolved ON queue_sla_breaches(queue_sid, detected_at)
    WHERE resolved_at IS NULL;

-- =============================================================================
-- QUEUE SLA REPORTS (Aggregated reports)
-- =============================================================================
-- Stores generated SLA reports for historical analysis

CREATE TABLE IF NOT EXISTS queue_sla_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_sid VARCHAR(100) NOT NULL,
    queue_name VARCHAR(200) NOT NULL,

    -- Report period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('hourly', 'daily', 'weekly', 'monthly')),

    -- Summary metrics
    total_calls INTEGER NOT NULL DEFAULT 0,
    calls_answered INTEGER NOT NULL DEFAULT 0,
    calls_abandoned INTEGER NOT NULL DEFAULT 0,
    calls_within_sla INTEGER NOT NULL DEFAULT 0,

    -- Performance
    overall_service_level DECIMAL(5, 2) NOT NULL DEFAULT 0,
    average_wait_time DECIMAL(10, 2) NOT NULL DEFAULT 0,
    average_handle_time DECIMAL(10, 2) NOT NULL DEFAULT 0,
    max_wait_time INTEGER NOT NULL DEFAULT 0,
    abandon_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,

    -- Agent metrics
    average_agent_utilization DECIMAL(5, 2) NOT NULL DEFAULT 0,
    peak_queue_size INTEGER NOT NULL DEFAULT 0,

    -- Breach summary
    total_breaches INTEGER NOT NULL DEFAULT 0,
    critical_breaches INTEGER NOT NULL DEFAULT 0,
    breaches_by_type JSONB DEFAULT '{}',

    -- Compliance
    compliance_rate DECIMAL(5, 2) NOT NULL DEFAULT 0, -- % of time in compliance
    trend VARCHAR(20) CHECK (trend IN ('improving', 'stable', 'declining')),

    -- Metadata
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_report_period UNIQUE (queue_sid, period_start, period_type)
);

-- Indexes for report queries
CREATE INDEX IF NOT EXISTS idx_sla_reports_queue ON queue_sla_reports(queue_sid);
CREATE INDEX IF NOT EXISTS idx_sla_reports_period ON queue_sla_reports(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sla_reports_type ON queue_sla_reports(period_type);

-- =============================================================================
-- FUNCTIONS: Auto-resolve breaches
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_resolve_sla_breach(p_queue_sid VARCHAR(100), p_breach_type VARCHAR(50))
RETURNS INTEGER AS $$
DECLARE
    v_resolved_count INTEGER;
BEGIN
    UPDATE queue_sla_breaches
    SET resolved_at = NOW()
    WHERE queue_sid = p_queue_sid
    AND breach_type = p_breach_type
    AND resolved_at IS NULL;

    GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    RETURN v_resolved_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTIONS: Get current SLA status summary
-- =============================================================================

CREATE OR REPLACE FUNCTION get_sla_summary()
RETURNS TABLE (
    total_queues INTEGER,
    queues_compliant INTEGER,
    queues_warning INTEGER,
    queues_critical INTEGER,
    active_breaches INTEGER,
    longest_breach_duration INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_queues,
        COUNT(*) FILTER (WHERE severity = 'ok')::INTEGER as queues_compliant,
        COUNT(*) FILTER (WHERE severity = 'warning')::INTEGER as queues_warning,
        COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as queues_critical,
        (SELECT COUNT(*)::INTEGER FROM queue_sla_breaches WHERE resolved_at IS NULL) as active_breaches,
        (SELECT COALESCE(MAX(duration_seconds), 0)::INTEGER FROM queue_sla_breaches WHERE resolved_at IS NULL) as longest_breach_duration
    FROM queue_sla_status;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_queue_sla_configs_updated_at ON queue_sla_configs;
CREATE TRIGGER update_queue_sla_configs_updated_at
    BEFORE UPDATE ON queue_sla_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS: SLA Dashboard
-- =============================================================================

-- Current SLA status overview
CREATE OR REPLACE VIEW sla_dashboard AS
SELECT
    s.queue_sid,
    s.queue_name,
    s.current_queue_size,
    s.longest_wait_time,
    s.available_agents,
    s.total_agents,
    s.service_level,
    s.is_compliant,
    s.severity,
    s.last_updated,
    c.target_answer_time,
    c.max_wait_time,
    c.service_level_target,
    (SELECT COUNT(*) FROM queue_sla_breaches b
     WHERE b.queue_sid = s.queue_sid AND b.resolved_at IS NULL) as active_breach_count,
    (SELECT COUNT(*) FROM queue_sla_breaches b
     WHERE b.queue_sid = s.queue_sid
     AND b.detected_at >= NOW() - INTERVAL '24 hours') as breaches_last_24h
FROM queue_sla_status s
LEFT JOIN queue_sla_configs c ON c.queue_sid = s.queue_sid;

-- Daily breach summary
CREATE OR REPLACE VIEW daily_breach_summary AS
SELECT
    DATE(detected_at) as breach_date,
    queue_sid,
    queue_name,
    breach_type,
    severity,
    COUNT(*) as breach_count,
    AVG(duration_seconds) as avg_duration_seconds,
    MAX(duration_seconds) as max_duration_seconds
FROM queue_sla_breaches
GROUP BY DATE(detected_at), queue_sid, queue_name, breach_type, severity
ORDER BY breach_date DESC, breach_count DESC;

COMMENT ON TABLE queue_sla_configs IS 'SLA threshold configurations for call center queues (H6)';
COMMENT ON TABLE queue_sla_status IS 'Real-time SLA status for each queue';
COMMENT ON TABLE queue_sla_breaches IS 'Historical record of SLA breach events';
COMMENT ON TABLE queue_sla_reports IS 'Aggregated SLA reports for analytics';
COMMENT ON VIEW sla_dashboard IS 'Real-time SLA monitoring dashboard view';
COMMENT ON VIEW daily_breach_summary IS 'Daily aggregation of SLA breaches';
