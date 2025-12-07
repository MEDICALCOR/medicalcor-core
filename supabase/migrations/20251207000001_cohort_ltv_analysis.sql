-- ============================================================================
-- MedicalCor Core - Cohort LTV (Lifetime Value) Analysis
-- ============================================================================
-- M7 Milestone: Add monthly cohort materialized view for LTV tracking
-- Enables analysis of customer lifetime value by acquisition cohort
-- ============================================================================

-- =============================================================================
-- MATERIALIZED VIEW: Monthly Cohort LTV Analysis
-- =============================================================================
-- Groups leads by their acquisition month and tracks LTV metrics over time.
-- This enables cohort analysis to understand how customer value evolves
-- based on when they were acquired.

CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_ltv_monthly AS
WITH lead_cohorts AS (
    -- Assign each lead to their acquisition month cohort
    SELECT
        l.id AS lead_id,
        l.clinic_id,
        DATE_TRUNC('month', l.created_at) AS cohort_month,
        l.created_at AS lead_created_at,
        l.source AS acquisition_source,
        l.acquisition_channel
    FROM leads l
    WHERE l.deleted_at IS NULL
),
cohort_revenue AS (
    -- Calculate revenue metrics for each lead
    SELECT
        lc.lead_id,
        lc.clinic_id,
        lc.cohort_month,
        lc.acquisition_source,
        lc.acquisition_channel,
        COUNT(DISTINCT c.id) AS total_cases,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed') AS completed_cases,
        COALESCE(SUM(c.total_amount), 0) AS total_case_value,
        COALESCE(SUM(c.paid_amount), 0) AS total_paid,
        COALESCE(SUM(c.outstanding_amount), 0) AS total_outstanding,
        MIN(c.created_at) AS first_case_date,
        MAX(c.created_at) AS last_case_date,
        -- Time to first case (days)
        EXTRACT(EPOCH FROM (MIN(c.created_at) - lc.lead_created_at)) / 86400 AS days_to_first_case,
        -- Calculate months since acquisition for each payment
        MAX(EXTRACT(EPOCH FROM (p.processed_at - lc.lead_created_at)) / 2592000)::INTEGER AS months_active
    FROM lead_cohorts lc
    LEFT JOIN cases c ON c.lead_id = lc.lead_id AND c.deleted_at IS NULL
    LEFT JOIN payments p ON p.case_id = c.id AND p.status = 'completed'
    GROUP BY lc.lead_id, lc.clinic_id, lc.cohort_month, lc.acquisition_source,
             lc.acquisition_channel, lc.lead_created_at
)
SELECT
    cr.clinic_id,
    cr.cohort_month,
    cr.acquisition_source,
    cr.acquisition_channel,
    -- Cohort size
    COUNT(DISTINCT cr.lead_id) AS cohort_size,
    -- Conversion metrics
    COUNT(DISTINCT cr.lead_id) FILTER (WHERE cr.total_cases > 0) AS converted_leads,
    ROUND(
        100.0 * COUNT(DISTINCT cr.lead_id) FILTER (WHERE cr.total_cases > 0) /
        NULLIF(COUNT(DISTINCT cr.lead_id), 0),
        2
    ) AS conversion_rate,
    -- Revenue metrics
    SUM(cr.total_case_value) AS total_revenue,
    SUM(cr.total_paid) AS total_collected,
    SUM(cr.total_outstanding) AS total_outstanding,
    -- LTV metrics
    ROUND(
        SUM(cr.total_paid) / NULLIF(COUNT(DISTINCT cr.lead_id), 0),
        2
    ) AS avg_ltv,
    ROUND(
        SUM(cr.total_paid) / NULLIF(COUNT(DISTINCT cr.lead_id) FILTER (WHERE cr.total_cases > 0), 0),
        2
    ) AS avg_ltv_converted,
    -- Case metrics
    SUM(cr.total_cases) AS total_cases,
    SUM(cr.completed_cases) AS completed_cases,
    ROUND(
        SUM(cr.total_cases)::DECIMAL / NULLIF(COUNT(DISTINCT cr.lead_id) FILTER (WHERE cr.total_cases > 0), 0),
        2
    ) AS avg_cases_per_customer,
    -- Time metrics
    ROUND(AVG(cr.days_to_first_case) FILTER (WHERE cr.days_to_first_case IS NOT NULL), 1) AS avg_days_to_first_case,
    MAX(cr.months_active) AS max_months_active,
    -- Collection efficiency
    ROUND(
        100.0 * SUM(cr.total_paid) / NULLIF(SUM(cr.total_case_value), 0),
        2
    ) AS collection_rate
FROM cohort_revenue cr
GROUP BY cr.clinic_id, cr.cohort_month, cr.acquisition_source, cr.acquisition_channel
ORDER BY cr.cohort_month DESC, cr.clinic_id;

-- Index for efficient cohort queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_ltv_monthly_pk
    ON cohort_ltv_monthly(clinic_id, cohort_month, COALESCE(acquisition_source, ''), COALESCE(acquisition_channel, ''));

CREATE INDEX IF NOT EXISTS idx_cohort_ltv_monthly_clinic
    ON cohort_ltv_monthly(clinic_id);

CREATE INDEX IF NOT EXISTS idx_cohort_ltv_monthly_cohort
    ON cohort_ltv_monthly(cohort_month DESC);

-- =============================================================================
-- MATERIALIZED VIEW: Cohort LTV Over Time (Revenue Evolution)
-- =============================================================================
-- Tracks how LTV evolves month-by-month after acquisition for each cohort.
-- This enables analysis of revenue curves and payback periods.

CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_ltv_evolution AS
WITH lead_cohorts AS (
    SELECT
        l.id AS lead_id,
        l.clinic_id,
        DATE_TRUNC('month', l.created_at) AS cohort_month,
        l.created_at AS lead_created_at
    FROM leads l
    WHERE l.deleted_at IS NULL
),
monthly_payments AS (
    -- Get payments grouped by lead and payment month
    SELECT
        lc.lead_id,
        lc.clinic_id,
        lc.cohort_month,
        DATE_TRUNC('month', p.processed_at) AS payment_month,
        -- Calculate months since acquisition (0 = same month as acquisition)
        (EXTRACT(YEAR FROM DATE_TRUNC('month', p.processed_at)) -
         EXTRACT(YEAR FROM lc.cohort_month)) * 12 +
        (EXTRACT(MONTH FROM DATE_TRUNC('month', p.processed_at)) -
         EXTRACT(MONTH FROM lc.cohort_month)) AS months_since_acquisition,
        SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END) AS payment_amount
    FROM lead_cohorts lc
    JOIN cases c ON c.lead_id = lc.lead_id AND c.deleted_at IS NULL
    JOIN payments p ON p.case_id = c.id AND p.status = 'completed' AND p.processed_at IS NOT NULL
    GROUP BY lc.lead_id, lc.clinic_id, lc.cohort_month, DATE_TRUNC('month', p.processed_at)
),
cohort_sizes AS (
    SELECT
        clinic_id,
        cohort_month,
        COUNT(DISTINCT lead_id) AS cohort_size
    FROM lead_cohorts
    GROUP BY clinic_id, cohort_month
)
SELECT
    mp.clinic_id,
    mp.cohort_month,
    mp.months_since_acquisition::INTEGER,
    cs.cohort_size,
    -- Revenue in this period
    SUM(mp.payment_amount) AS period_revenue,
    COUNT(DISTINCT mp.lead_id) AS paying_customers,
    -- Cumulative LTV (running total)
    SUM(SUM(mp.payment_amount)) OVER (
        PARTITION BY mp.clinic_id, mp.cohort_month
        ORDER BY mp.months_since_acquisition
    ) AS cumulative_revenue,
    -- Per-customer metrics
    ROUND(
        SUM(SUM(mp.payment_amount)) OVER (
            PARTITION BY mp.clinic_id, mp.cohort_month
            ORDER BY mp.months_since_acquisition
        ) / cs.cohort_size,
        2
    ) AS cumulative_ltv_per_lead,
    -- Retention: percentage of cohort still paying
    ROUND(
        100.0 * COUNT(DISTINCT mp.lead_id) / cs.cohort_size,
        2
    ) AS paying_percentage
FROM monthly_payments mp
JOIN cohort_sizes cs ON cs.clinic_id = mp.clinic_id AND cs.cohort_month = mp.cohort_month
WHERE mp.months_since_acquisition >= 0
  AND mp.months_since_acquisition <= 24  -- Track up to 24 months
GROUP BY mp.clinic_id, mp.cohort_month, mp.months_since_acquisition, cs.cohort_size
ORDER BY mp.cohort_month DESC, mp.months_since_acquisition;

-- Indexes for cohort evolution queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_ltv_evolution_pk
    ON cohort_ltv_evolution(clinic_id, cohort_month, months_since_acquisition);

CREATE INDEX IF NOT EXISTS idx_cohort_ltv_evolution_clinic
    ON cohort_ltv_evolution(clinic_id);

-- =============================================================================
-- VIEW: Cohort Comparison Summary
-- =============================================================================
-- Provides a quick comparison of cohorts for dashboard display

CREATE OR REPLACE VIEW cohort_comparison_summary AS
SELECT
    clinic_id,
    cohort_month,
    cohort_size,
    converted_leads,
    conversion_rate,
    total_collected,
    avg_ltv,
    avg_ltv_converted,
    collection_rate,
    avg_days_to_first_case,
    -- Compare to previous cohort
    LAG(avg_ltv) OVER (PARTITION BY clinic_id ORDER BY cohort_month) AS prev_cohort_avg_ltv,
    ROUND(
        100.0 * (avg_ltv - LAG(avg_ltv) OVER (PARTITION BY clinic_id ORDER BY cohort_month)) /
        NULLIF(LAG(avg_ltv) OVER (PARTITION BY clinic_id ORDER BY cohort_month), 0),
        2
    ) AS ltv_growth_vs_prev,
    -- Compare to same month last year
    LAG(avg_ltv, 12) OVER (PARTITION BY clinic_id ORDER BY cohort_month) AS yoy_cohort_avg_ltv,
    ROUND(
        100.0 * (avg_ltv - LAG(avg_ltv, 12) OVER (PARTITION BY clinic_id ORDER BY cohort_month)) /
        NULLIF(LAG(avg_ltv, 12) OVER (PARTITION BY clinic_id ORDER BY cohort_month), 0),
        2
    ) AS ltv_growth_yoy
FROM cohort_ltv_monthly
WHERE acquisition_source IS NULL  -- Aggregate view (all sources)
  AND acquisition_channel IS NULL
ORDER BY cohort_month DESC;

-- =============================================================================
-- FUNCTION: Refresh Cohort LTV Materialized Views
-- =============================================================================
-- Call this function to refresh all cohort LTV materialized views.
-- Should be scheduled as a cron job (e.g., daily or hourly during business hours)

CREATE OR REPLACE FUNCTION refresh_cohort_ltv_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY cohort_ltv_monthly;
    REFRESH MATERIALIZED VIEW CONCURRENTLY cohort_ltv_evolution;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Get Cohort LTV Summary
-- =============================================================================
-- Returns cohort LTV summary for a specific clinic

CREATE OR REPLACE FUNCTION get_cohort_ltv_summary(
    p_clinic_id UUID,
    p_start_month DATE DEFAULT NULL,
    p_end_month DATE DEFAULT NULL
)
RETURNS TABLE (
    cohort_month TIMESTAMPTZ,
    cohort_size BIGINT,
    converted_leads BIGINT,
    conversion_rate NUMERIC,
    total_collected NUMERIC,
    avg_ltv NUMERIC,
    avg_ltv_converted NUMERIC,
    collection_rate NUMERIC,
    avg_days_to_first_case NUMERIC,
    ltv_growth_vs_prev NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.cohort_month,
        c.cohort_size,
        c.converted_leads,
        c.conversion_rate,
        c.total_collected,
        c.avg_ltv,
        c.avg_ltv_converted,
        c.collection_rate,
        c.avg_days_to_first_case,
        c.ltv_growth_vs_prev
    FROM cohort_comparison_summary c
    WHERE c.clinic_id = p_clinic_id
      AND (p_start_month IS NULL OR c.cohort_month >= p_start_month)
      AND (p_end_month IS NULL OR c.cohort_month <= p_end_month)
    ORDER BY c.cohort_month DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNCTION: Get Cohort LTV Evolution (Revenue Curve)
-- =============================================================================
-- Returns the LTV evolution for a specific cohort

CREATE OR REPLACE FUNCTION get_cohort_ltv_evolution(
    p_clinic_id UUID,
    p_cohort_month DATE
)
RETURNS TABLE (
    months_since_acquisition INTEGER,
    cohort_size BIGINT,
    period_revenue NUMERIC,
    paying_customers BIGINT,
    cumulative_revenue NUMERIC,
    cumulative_ltv_per_lead NUMERIC,
    paying_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.months_since_acquisition,
        e.cohort_size,
        e.period_revenue,
        e.paying_customers,
        e.cumulative_revenue,
        e.cumulative_ltv_per_lead,
        e.paying_percentage
    FROM cohort_ltv_evolution e
    WHERE e.clinic_id = p_clinic_id
      AND e.cohort_month = DATE_TRUNC('month', p_cohort_month)
    ORDER BY e.months_since_acquisition;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW cohort_ltv_monthly IS
    'M7: Monthly cohort analysis showing LTV metrics by acquisition month and source';

COMMENT ON MATERIALIZED VIEW cohort_ltv_evolution IS
    'M7: Tracks how LTV evolves over time for each acquisition cohort';

COMMENT ON VIEW cohort_comparison_summary IS
    'M7: Quick comparison view of cohort performance with growth metrics';

COMMENT ON FUNCTION refresh_cohort_ltv_views() IS
    'M7: Refreshes all cohort LTV materialized views concurrently';

COMMENT ON FUNCTION get_cohort_ltv_summary(UUID, DATE, DATE) IS
    'M7: Returns cohort LTV summary for a clinic within optional date range';

COMMENT ON FUNCTION get_cohort_ltv_evolution(UUID, DATE) IS
    'M7: Returns the revenue evolution curve for a specific cohort';
