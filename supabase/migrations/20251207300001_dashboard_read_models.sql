-- ============================================================================
-- MedicalCor Core - Dashboard Read Models (CQRS Materialized Views)
-- ============================================================================
-- Creates materialized views for dashboard queries to offload reporting from
-- the main transactional database. These views are optimized for read-heavy
-- dashboard operations.
-- ============================================================================

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Lead Summary
-- =============================================================================
-- Aggregated lead metrics per clinic for dashboard overview widgets.
-- Replaces expensive COUNT/GROUP BY queries on the leads table.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_lead_summary AS
SELECT
    clinic_id,
    -- Total counts by status
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
    COUNT(*) FILTER (WHERE status = 'contacted') AS contacted_leads,
    COUNT(*) FILTER (WHERE status = 'qualified') AS qualified_leads,
    COUNT(*) FILTER (WHERE status = 'converted') AS converted_leads,
    COUNT(*) FILTER (WHERE status = 'lost') AS lost_leads,
    -- Counts by classification
    COUNT(*) FILTER (WHERE classification = 'HOT') AS hot_leads,
    COUNT(*) FILTER (WHERE classification = 'WARM') AS warm_leads,
    COUNT(*) FILTER (WHERE classification = 'COLD') AS cold_leads,
    COUNT(*) FILTER (WHERE classification = 'UNQUALIFIED') AS unqualified_leads,
    -- Counts by channel
    COUNT(*) FILTER (WHERE channel = 'whatsapp') AS whatsapp_leads,
    COUNT(*) FILTER (WHERE channel = 'voice') AS voice_leads,
    COUNT(*) FILTER (WHERE channel = 'web') AS web_leads,
    COUNT(*) FILTER (WHERE channel = 'referral') AS referral_leads,
    -- Score metrics
    ROUND(AVG(score)::NUMERIC, 2) AS avg_score,
    COUNT(*) FILTER (WHERE score IS NOT NULL) AS scored_leads,
    -- Time-based metrics
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS leads_last_7_days,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS leads_last_30_days,
    COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) AS leads_this_month,
    -- Conversion rate
    CASE
        WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'converted') / COUNT(*), 2)
        ELSE 0
    END AS conversion_rate,
    -- Last updated timestamp
    NOW() AS refreshed_at
FROM leads
WHERE deleted_at IS NULL
GROUP BY clinic_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_lead_summary_pk
    ON mv_dashboard_lead_summary(clinic_id);

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Daily Metrics
-- =============================================================================
-- Pre-aggregated daily metrics for time-series charts.
-- Covers the last 90 days of activity.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_daily_metrics AS
WITH date_series AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '90 days',
        CURRENT_DATE,
        INTERVAL '1 day'
    )::DATE AS date
),
lead_metrics AS (
    SELECT
        clinic_id,
        DATE(created_at) AS date,
        COUNT(*) AS new_leads,
        COUNT(*) FILTER (WHERE classification = 'HOT') AS hot_leads,
        COUNT(*) FILTER (WHERE classification = 'WARM') AS warm_leads
    FROM leads
    WHERE deleted_at IS NULL
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY clinic_id, DATE(created_at)
),
conversion_metrics AS (
    SELECT
        clinic_id,
        DATE(updated_at) AS date,
        COUNT(*) FILTER (WHERE status = 'converted') AS converted_leads,
        COUNT(*) FILTER (WHERE status = 'lost') AS lost_leads
    FROM leads
    WHERE deleted_at IS NULL
      AND status IN ('converted', 'lost')
      AND updated_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY clinic_id, DATE(updated_at)
),
appointment_metrics AS (
    SELECT
        clinic_id,
        DATE(created_at) AS date,
        COUNT(*) AS appointments_scheduled,
        COUNT(*) FILTER (WHERE status = 'completed') AS appointments_completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS appointments_cancelled
    FROM appointments
    WHERE deleted_at IS NULL
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY clinic_id, DATE(created_at)
),
message_metrics AS (
    SELECT
        clinic_id,
        DATE(created_at) AS date,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS messages_received,
        COUNT(*) FILTER (WHERE direction = 'outbound') AS messages_sent
    FROM messages
    WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY clinic_id, DATE(created_at)
),
payment_metrics AS (
    SELECT
        c.clinic_id,
        DATE(p.processed_at) AS date,
        COUNT(*) AS payments_count,
        SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE 0 END) AS gross_revenue,
        SUM(CASE WHEN p.type = 'refund' THEN p.amount ELSE 0 END) AS refunds
    FROM payments p
    JOIN cases c ON c.id = p.case_id
    WHERE p.status = 'completed'
      AND p.processed_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY c.clinic_id, DATE(p.processed_at)
)
SELECT
    COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id, mm.clinic_id, pm.clinic_id) AS clinic_id,
    ds.date,
    COALESCE(lm.new_leads, 0) AS new_leads,
    COALESCE(lm.hot_leads, 0) AS hot_leads,
    COALESCE(lm.warm_leads, 0) AS warm_leads,
    COALESCE(cm.converted_leads, 0) AS converted_leads,
    COALESCE(cm.lost_leads, 0) AS lost_leads,
    COALESCE(am.appointments_scheduled, 0) AS appointments_scheduled,
    COALESCE(am.appointments_completed, 0) AS appointments_completed,
    COALESCE(am.appointments_cancelled, 0) AS appointments_cancelled,
    COALESCE(mm.messages_received, 0) AS messages_received,
    COALESCE(mm.messages_sent, 0) AS messages_sent,
    COALESCE(pm.payments_count, 0) AS payments_count,
    COALESCE(pm.gross_revenue, 0) AS gross_revenue,
    COALESCE(pm.refunds, 0) AS refunds,
    COALESCE(pm.gross_revenue, 0) - COALESCE(pm.refunds, 0) AS net_revenue,
    NOW() AS refreshed_at
FROM date_series ds
LEFT JOIN lead_metrics lm ON ds.date = lm.date
LEFT JOIN conversion_metrics cm ON ds.date = cm.date
    AND (lm.clinic_id = cm.clinic_id OR lm.clinic_id IS NULL OR cm.clinic_id IS NULL)
LEFT JOIN appointment_metrics am ON ds.date = am.date
    AND (COALESCE(lm.clinic_id, cm.clinic_id) = am.clinic_id
         OR COALESCE(lm.clinic_id, cm.clinic_id) IS NULL OR am.clinic_id IS NULL)
LEFT JOIN message_metrics mm ON ds.date = mm.date
    AND (COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id) = mm.clinic_id
         OR COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id) IS NULL OR mm.clinic_id IS NULL)
LEFT JOIN payment_metrics pm ON ds.date = pm.date
    AND (COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id, mm.clinic_id) = pm.clinic_id
         OR COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id, mm.clinic_id) IS NULL OR pm.clinic_id IS NULL)
WHERE COALESCE(lm.clinic_id, cm.clinic_id, am.clinic_id, mm.clinic_id, pm.clinic_id) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_daily_metrics_pk
    ON mv_dashboard_daily_metrics(clinic_id, date);

CREATE INDEX IF NOT EXISTS idx_mv_dashboard_daily_metrics_clinic
    ON mv_dashboard_daily_metrics(clinic_id);

CREATE INDEX IF NOT EXISTS idx_mv_dashboard_daily_metrics_date
    ON mv_dashboard_daily_metrics(date DESC);

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Appointment Summary
-- =============================================================================
-- Aggregated appointment metrics per clinic for scheduling dashboards.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_appointment_summary AS
SELECT
    clinic_id,
    -- Status counts
    COUNT(*) AS total_appointments,
    COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled_count,
    COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
    -- Upcoming appointments
    COUNT(*) FILTER (WHERE scheduled_at >= NOW() AND status IN ('scheduled', 'confirmed')) AS upcoming_count,
    COUNT(*) FILTER (WHERE scheduled_at >= NOW()
        AND scheduled_at < NOW() + INTERVAL '24 hours'
        AND status IN ('scheduled', 'confirmed')) AS next_24h_count,
    COUNT(*) FILTER (WHERE scheduled_at >= NOW()
        AND scheduled_at < NOW() + INTERVAL '7 days'
        AND status IN ('scheduled', 'confirmed')) AS next_7_days_count,
    -- Time period metrics
    COUNT(*) FILTER (WHERE scheduled_at >= CURRENT_DATE - INTERVAL '7 days') AS last_7_days,
    COUNT(*) FILTER (WHERE scheduled_at >= CURRENT_DATE - INTERVAL '30 days') AS last_30_days,
    -- Show rate calculation
    CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')) > 0
        THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'completed') /
            COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')),
            2
        )
        ELSE NULL
    END AS show_rate,
    -- Cancellation rate
    CASE
        WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'cancelled') / COUNT(*), 2)
        ELSE 0
    END AS cancellation_rate,
    -- Average appointments per day (last 30 days)
    ROUND(
        COUNT(*) FILTER (WHERE scheduled_at >= CURRENT_DATE - INTERVAL '30 days')::NUMERIC / 30,
        2
    ) AS avg_daily_appointments,
    NOW() AS refreshed_at
FROM appointments
WHERE deleted_at IS NULL
GROUP BY clinic_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_appointment_summary_pk
    ON mv_dashboard_appointment_summary(clinic_id);

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Revenue Summary
-- =============================================================================
-- Pre-aggregated revenue metrics for financial dashboards.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_revenue_summary AS
SELECT
    c.clinic_id,
    -- Total amounts
    COUNT(DISTINCT c.id) AS total_cases,
    COALESCE(SUM(c.total_amount), 0) AS total_case_value,
    COALESCE(SUM(c.paid_amount), 0) AS total_collected,
    COALESCE(SUM(c.outstanding_amount), 0) AS total_outstanding,
    -- Average metrics
    ROUND(AVG(c.total_amount)::NUMERIC, 2) AS avg_case_value,
    -- Status breakdown
    COUNT(*) FILTER (WHERE c.status = 'pending') AS pending_cases,
    COUNT(*) FILTER (WHERE c.status = 'in_progress') AS in_progress_cases,
    COUNT(*) FILTER (WHERE c.status = 'completed') AS completed_cases,
    COUNT(*) FILTER (WHERE c.status = 'cancelled') AS cancelled_cases,
    -- Payment status breakdown
    COUNT(*) FILTER (WHERE c.payment_status = 'unpaid') AS unpaid_cases,
    COUNT(*) FILTER (WHERE c.payment_status = 'partial') AS partial_paid_cases,
    COUNT(*) FILTER (WHERE c.payment_status = 'paid') AS fully_paid_cases,
    -- Time period revenue
    COALESCE(SUM(c.paid_amount) FILTER (WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS revenue_last_7_days,
    COALESCE(SUM(c.paid_amount) FILTER (WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) AS revenue_last_30_days,
    COALESCE(SUM(c.paid_amount) FILTER (WHERE c.created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS revenue_this_month,
    COALESCE(SUM(c.paid_amount) FILTER (WHERE c.created_at >= DATE_TRUNC('year', CURRENT_DATE)), 0) AS revenue_this_year,
    -- Collection rate
    CASE
        WHEN SUM(c.total_amount) > 0
        THEN ROUND(100.0 * SUM(c.paid_amount) / SUM(c.total_amount), 2)
        ELSE NULL
    END AS collection_rate,
    NOW() AS refreshed_at
FROM cases c
WHERE c.deleted_at IS NULL
GROUP BY c.clinic_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_revenue_summary_pk
    ON mv_dashboard_revenue_summary(clinic_id);

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Agent Performance
-- =============================================================================
-- Pre-aggregated agent/user performance metrics for team dashboards.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_agent_performance AS
SELECT
    l.assigned_to AS agent_id,
    l.clinic_id,
    -- Lead metrics
    COUNT(*) AS total_leads_assigned,
    COUNT(*) FILTER (WHERE l.status = 'converted') AS leads_converted,
    COUNT(*) FILTER (WHERE l.status = 'lost') AS leads_lost,
    COUNT(*) FILTER (WHERE l.status IN ('new', 'contacted', 'qualified')) AS leads_active,
    -- Conversion rate
    CASE
        WHEN COUNT(*) FILTER (WHERE l.status IN ('converted', 'lost')) > 0
        THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE l.status = 'converted') /
            COUNT(*) FILTER (WHERE l.status IN ('converted', 'lost')),
            2
        )
        ELSE NULL
    END AS conversion_rate,
    -- Classification distribution
    COUNT(*) FILTER (WHERE l.classification = 'HOT') AS hot_leads,
    COUNT(*) FILTER (WHERE l.classification = 'WARM') AS warm_leads,
    COUNT(*) FILTER (WHERE l.classification = 'COLD') AS cold_leads,
    -- Activity this period
    COUNT(*) FILTER (WHERE l.updated_at >= CURRENT_DATE - INTERVAL '7 days') AS activity_last_7_days,
    COUNT(*) FILTER (WHERE l.updated_at >= CURRENT_DATE - INTERVAL '30 days') AS activity_last_30_days,
    -- Average score of assigned leads
    ROUND(AVG(l.score)::NUMERIC, 2) AS avg_lead_score,
    NOW() AS refreshed_at
FROM leads l
WHERE l.deleted_at IS NULL
  AND l.assigned_to IS NOT NULL
GROUP BY l.assigned_to, l.clinic_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_agent_performance_pk
    ON mv_dashboard_agent_performance(clinic_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_mv_dashboard_agent_performance_clinic
    ON mv_dashboard_agent_performance(clinic_id);

-- =============================================================================
-- MATERIALIZED VIEW: Dashboard Channel Performance
-- =============================================================================
-- Pre-aggregated channel performance metrics.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_channel_performance AS
SELECT
    clinic_id,
    channel,
    -- Volume metrics
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS leads_last_30_days,
    -- Quality metrics
    ROUND(AVG(score)::NUMERIC, 2) AS avg_score,
    COUNT(*) FILTER (WHERE classification = 'HOT') AS hot_leads,
    COUNT(*) FILTER (WHERE classification = 'WARM') AS warm_leads,
    COUNT(*) FILTER (WHERE classification = 'COLD') AS cold_leads,
    COUNT(*) FILTER (WHERE classification = 'UNQUALIFIED') AS unqualified_leads,
    -- Conversion metrics
    COUNT(*) FILTER (WHERE status = 'converted') AS converted_leads,
    CASE
        WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'converted') / COUNT(*), 2)
        ELSE 0
    END AS conversion_rate,
    -- Time to qualify (avg days from created to qualified/converted)
    ROUND(
        AVG(
            EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
        ) FILTER (WHERE status IN ('qualified', 'converted'))::NUMERIC,
        2
    ) AS avg_days_to_qualify,
    NOW() AS refreshed_at
FROM leads
WHERE deleted_at IS NULL
GROUP BY clinic_id, channel;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_channel_performance_pk
    ON mv_dashboard_channel_performance(clinic_id, channel);

-- =============================================================================
-- TABLE: Read Model Metadata
-- =============================================================================
-- Tracks metadata about materialized views for monitoring and refresh scheduling.

CREATE TABLE IF NOT EXISTS read_model_metadata (
    view_name VARCHAR(100) PRIMARY KEY,
    last_refresh_at TIMESTAMPTZ,
    last_refresh_duration_ms INTEGER,
    row_count BIGINT,
    next_scheduled_refresh TIMESTAMPTZ,
    refresh_interval_minutes INTEGER DEFAULT 15,
    is_refreshing BOOLEAN DEFAULT FALSE,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial metadata
INSERT INTO read_model_metadata (view_name, refresh_interval_minutes) VALUES
    ('mv_dashboard_lead_summary', 5),
    ('mv_dashboard_daily_metrics', 15),
    ('mv_dashboard_appointment_summary', 5),
    ('mv_dashboard_revenue_summary', 15),
    ('mv_dashboard_agent_performance', 30),
    ('mv_dashboard_channel_performance', 30),
    ('cohort_ltv_monthly', 60),
    ('cohort_ltv_evolution', 60)
ON CONFLICT (view_name) DO UPDATE SET
    refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
    updated_at = NOW();

-- =============================================================================
-- FUNCTION: Refresh Single Read Model
-- =============================================================================
-- Refreshes a single materialized view and updates metadata.

CREATE OR REPLACE FUNCTION refresh_read_model(p_view_name VARCHAR(100))
RETURNS TABLE (
    success BOOLEAN,
    duration_ms INTEGER,
    row_count BIGINT,
    error_message TEXT
) AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_duration_ms INTEGER;
    v_row_count BIGINT;
    v_error TEXT;
BEGIN
    -- Mark as refreshing
    UPDATE read_model_metadata
    SET is_refreshing = TRUE, updated_at = NOW()
    WHERE view_name = p_view_name;

    v_start_time := clock_timestamp();

    BEGIN
        -- Refresh the materialized view concurrently if possible
        EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', p_view_name);

        -- Get row count
        EXECUTE format('SELECT COUNT(*) FROM %I', p_view_name) INTO v_row_count;

        v_duration_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::INTEGER;

        -- Update metadata
        UPDATE read_model_metadata
        SET
            last_refresh_at = NOW(),
            last_refresh_duration_ms = v_duration_ms,
            row_count = v_row_count,
            next_scheduled_refresh = NOW() + (refresh_interval_minutes || ' minutes')::INTERVAL,
            is_refreshing = FALSE,
            last_error = NULL,
            updated_at = NOW()
        WHERE view_name = p_view_name;

        RETURN QUERY SELECT TRUE, v_duration_ms, v_row_count, NULL::TEXT;

    EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        v_duration_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::INTEGER;

        UPDATE read_model_metadata
        SET
            is_refreshing = FALSE,
            last_error = v_error,
            updated_at = NOW()
        WHERE view_name = p_view_name;

        RETURN QUERY SELECT FALSE, v_duration_ms, 0::BIGINT, v_error;
    END;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Refresh All Dashboard Read Models
-- =============================================================================
-- Refreshes all dashboard materialized views.

CREATE OR REPLACE FUNCTION refresh_all_dashboard_read_models()
RETURNS TABLE (
    view_name VARCHAR(100),
    success BOOLEAN,
    duration_ms INTEGER,
    row_count BIGINT,
    error_message TEXT
) AS $$
DECLARE
    v_view_name VARCHAR(100);
BEGIN
    FOR v_view_name IN
        SELECT rm.view_name
        FROM read_model_metadata rm
        WHERE rm.view_name LIKE 'mv_dashboard_%'
        ORDER BY rm.view_name
    LOOP
        RETURN QUERY
        SELECT v_view_name, r.success, r.duration_ms, r.row_count, r.error_message
        FROM refresh_read_model(v_view_name) r;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Refresh Stale Read Models
-- =============================================================================
-- Refreshes only read models that are past their scheduled refresh time.

CREATE OR REPLACE FUNCTION refresh_stale_read_models()
RETURNS TABLE (
    view_name VARCHAR(100),
    success BOOLEAN,
    duration_ms INTEGER,
    row_count BIGINT,
    error_message TEXT
) AS $$
DECLARE
    v_view_name VARCHAR(100);
BEGIN
    FOR v_view_name IN
        SELECT rm.view_name
        FROM read_model_metadata rm
        WHERE (rm.next_scheduled_refresh IS NULL OR rm.next_scheduled_refresh <= NOW())
          AND rm.is_refreshing = FALSE
        ORDER BY rm.next_scheduled_refresh NULLS FIRST
    LOOP
        RETURN QUERY
        SELECT v_view_name, r.success, r.duration_ms, r.row_count, r.error_message
        FROM refresh_read_model(v_view_name) r;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW mv_dashboard_lead_summary IS
    'CQRS Read Model: Aggregated lead metrics per clinic for dashboard widgets';

COMMENT ON MATERIALIZED VIEW mv_dashboard_daily_metrics IS
    'CQRS Read Model: Daily aggregated metrics for time-series charts (90 days)';

COMMENT ON MATERIALIZED VIEW mv_dashboard_appointment_summary IS
    'CQRS Read Model: Aggregated appointment metrics per clinic';

COMMENT ON MATERIALIZED VIEW mv_dashboard_revenue_summary IS
    'CQRS Read Model: Aggregated revenue and case metrics per clinic';

COMMENT ON MATERIALIZED VIEW mv_dashboard_agent_performance IS
    'CQRS Read Model: Agent/user performance metrics per clinic';

COMMENT ON MATERIALIZED VIEW mv_dashboard_channel_performance IS
    'CQRS Read Model: Lead channel performance metrics per clinic';

COMMENT ON TABLE read_model_metadata IS
    'CQRS Read Model: Metadata for tracking materialized view refresh status';

COMMENT ON FUNCTION refresh_read_model(VARCHAR) IS
    'CQRS: Refreshes a single materialized view and updates metadata';

COMMENT ON FUNCTION refresh_all_dashboard_read_models() IS
    'CQRS: Refreshes all dashboard materialized views';

COMMENT ON FUNCTION refresh_stale_read_models() IS
    'CQRS: Refreshes only read models that are past their scheduled refresh time';
