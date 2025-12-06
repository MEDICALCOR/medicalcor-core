-- ============================================================================
-- MedicalCor Core - Capacity Planning Schema
-- ============================================================================
-- M12: Shift Scheduling with Capacity Planning
-- Staff shifts, capacity plans, and historical demand tracking
-- ============================================================================

-- ============================================================================
-- STAFF SHIFTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    staff_name VARCHAR(100) NOT NULL,
    staff_role VARCHAR(50) NOT NULL,
    shift_type VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    break_minutes INTEGER DEFAULT 0,
    max_appointments INTEGER DEFAULT 0,
    booked_appointments INTEGER DEFAULT 0,
    procedure_types TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_shift_times CHECK (end_time > start_time),
    CONSTRAINT valid_break_minutes CHECK (break_minutes >= 0 AND break_minutes <= 180),
    CONSTRAINT valid_appointments CHECK (max_appointments >= 0 AND booked_appointments >= 0),
    CONSTRAINT valid_shift_status CHECK (
        status IN ('SCHEDULED', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
    ),
    CONSTRAINT valid_staff_role CHECK (
        staff_role IN ('DENTIST', 'HYGIENIST', 'DENTAL_ASSISTANT', 'RECEPTIONIST', 'PRACTICE_MANAGER', 'SPECIALIST')
    ),
    CONSTRAINT valid_shift_type CHECK (
        shift_type IN ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'FULL_DAY', 'CUSTOM')
    ),
    -- Prevent double booking for same staff member
    CONSTRAINT no_staff_double_booking UNIQUE (staff_id, start_time)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_staff_shifts_clinic_date
    ON staff_shifts(clinic_id, start_time);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_date
    ON staff_shifts(staff_id, start_time);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_status
    ON staff_shifts(status)
    WHERE status IN ('SCHEDULED', 'CONFIRMED', 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_staff_shifts_date_range
    ON staff_shifts(clinic_id, start_time, end_time);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_staff_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_staff_shifts_updated_at ON staff_shifts;
CREATE TRIGGER trigger_staff_shifts_updated_at
    BEFORE UPDATE ON staff_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_shifts_updated_at();

-- ============================================================================
-- CAPACITY PLANS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS capacity_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    period VARCHAR(20) NOT NULL DEFAULT 'WEEK',
    overall_utilization DECIMAL(5, 2) DEFAULT 0,
    total_slots INTEGER DEFAULT 0,
    booked_slots INTEGER DEFAULT 0,
    conflict_count INTEGER DEFAULT 0,
    recommendation_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_plan_dates CHECK (end_date >= start_date),
    CONSTRAINT valid_plan_period CHECK (
        period IN ('DAY', 'WEEK', 'MONTH')
    ),
    CONSTRAINT valid_utilization CHECK (
        overall_utilization >= 0 AND overall_utilization <= 150
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_capacity_plans_clinic_dates
    ON capacity_plans(clinic_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_capacity_plans_created
    ON capacity_plans(clinic_id, created_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_capacity_plans_updated_at ON capacity_plans;
CREATE TRIGGER trigger_capacity_plans_updated_at
    BEFORE UPDATE ON capacity_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_shifts_updated_at();

-- ============================================================================
-- DAILY CAPACITY SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_capacity_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES capacity_plans(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,
    date DATE NOT NULL,
    total_slots INTEGER DEFAULT 0,
    booked_slots INTEGER DEFAULT 0,
    utilization_percent DECIMAL(5, 2) DEFAULT 0,
    capacity_level VARCHAR(20) NOT NULL,
    shift_count INTEGER DEFAULT 0,
    staff_count INTEGER DEFAULT 0,
    conflicts JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_capacity_level CHECK (
        capacity_level IN ('UNDERUTILIZED', 'OPTIMAL', 'HIGH', 'CRITICAL', 'OVERBOOKED')
    ),
    -- One snapshot per day per plan
    CONSTRAINT unique_daily_snapshot UNIQUE (plan_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_capacity_clinic_date
    ON daily_capacity_snapshots(clinic_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_capacity_level
    ON daily_capacity_snapshots(clinic_id, capacity_level)
    WHERE capacity_level IN ('CRITICAL', 'OVERBOOKED');

-- ============================================================================
-- HISTORICAL DEMAND TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS historical_demand (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    date DATE NOT NULL,
    day_of_week INTEGER NOT NULL,
    appointments INTEGER DEFAULT 0,
    no_shows INTEGER DEFAULT 0,
    cancellations INTEGER DEFAULT 0,
    walk_ins INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT valid_counts CHECK (
        appointments >= 0 AND no_shows >= 0 AND cancellations >= 0 AND walk_ins >= 0
    ),
    -- One record per day per clinic
    CONSTRAINT unique_daily_demand UNIQUE (clinic_id, date)
);

-- Indexes for forecasting queries
CREATE INDEX IF NOT EXISTS idx_historical_demand_clinic_date
    ON historical_demand(clinic_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_historical_demand_day_of_week
    ON historical_demand(clinic_id, day_of_week, date DESC);

-- ============================================================================
-- STAFFING RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS staffing_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES capacity_plans(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,
    date DATE NOT NULL,
    shift_type VARCHAR(50) NOT NULL,
    current_staff INTEGER NOT NULL,
    recommended_staff INTEGER NOT NULL,
    role VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_recommendation_priority CHECK (
        priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')
    ),
    CONSTRAINT valid_recommendation_status CHECK (
        status IN ('PENDING', 'ACKNOWLEDGED', 'IMPLEMENTED', 'DISMISSED')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staffing_recommendations_clinic_date
    ON staffing_recommendations(clinic_id, date);

CREATE INDEX IF NOT EXISTS idx_staffing_recommendations_priority
    ON staffing_recommendations(clinic_id, priority, status)
    WHERE status = 'PENDING';

-- ============================================================================
-- SHIFT CONFLICTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS shift_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES capacity_plans(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    conflicting_shift_id UUID,
    staff_id UUID NOT NULL,
    conflict_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    suggested_resolution TEXT,
    status VARCHAR(20) DEFAULT 'OPEN',
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_conflict_type CHECK (
        conflict_type IN ('OVERLAP', 'CONSECUTIVE_DAYS', 'OVERTIME', 'REST_VIOLATION', 'DOUBLE_BOOKING', 'UNDERSTAFFED', 'SKILL_GAP')
    ),
    CONSTRAINT valid_conflict_severity CHECK (
        severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    CONSTRAINT valid_conflict_status CHECK (
        status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_conflicts_clinic
    ON shift_conflicts(clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_shift_conflicts_shift
    ON shift_conflicts(shift_id);

CREATE INDEX IF NOT EXISTS idx_shift_conflicts_severity
    ON shift_conflicts(clinic_id, severity)
    WHERE status = 'OPEN';

-- ============================================================================
-- DEMAND FORECASTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS demand_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES capacity_plans(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,
    date DATE NOT NULL,
    predicted_demand INTEGER NOT NULL,
    confidence DECIMAL(4, 3) NOT NULL,
    trend VARCHAR(20) NOT NULL,
    based_on TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_forecast_confidence CHECK (
        confidence >= 0 AND confidence <= 1
    ),
    CONSTRAINT valid_forecast_trend CHECK (
        trend IN ('INCREASING', 'STABLE', 'DECREASING')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_clinic_date
    ON demand_forecasts(clinic_id, date);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Weekly capacity summary view
CREATE OR REPLACE VIEW weekly_capacity_summary AS
SELECT
    s.clinic_id,
    DATE_TRUNC('week', s.start_time)::DATE AS week_start,
    COUNT(DISTINCT s.id) AS total_shifts,
    COUNT(DISTINCT s.staff_id) AS total_staff,
    SUM(s.max_appointments) AS total_slots,
    SUM(s.booked_appointments) AS booked_slots,
    CASE
        WHEN SUM(s.max_appointments) > 0
        THEN ROUND((SUM(s.booked_appointments)::DECIMAL / SUM(s.max_appointments)) * 100, 2)
        ELSE 0
    END AS utilization_percent,
    COUNT(DISTINCT CASE WHEN c.severity IN ('HIGH', 'CRITICAL') THEN c.id END) AS critical_conflicts
FROM staff_shifts s
LEFT JOIN shift_conflicts c ON c.shift_id = s.id AND c.status = 'OPEN'
WHERE s.status NOT IN ('CANCELLED')
GROUP BY s.clinic_id, DATE_TRUNC('week', s.start_time)::DATE;

-- Staff workload view
CREATE OR REPLACE VIEW staff_workload AS
SELECT
    s.clinic_id,
    s.staff_id,
    s.staff_name,
    s.staff_role,
    DATE_TRUNC('week', s.start_time)::DATE AS week_start,
    COUNT(s.id) AS shift_count,
    SUM(
        EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600 - (s.break_minutes::DECIMAL / 60)
    ) AS total_hours,
    COUNT(DISTINCT DATE(s.start_time)) AS days_worked
FROM staff_shifts s
WHERE s.status NOT IN ('CANCELLED')
GROUP BY s.clinic_id, s.staff_id, s.staff_name, s.staff_role, DATE_TRUNC('week', s.start_time)::DATE;

-- Critical alerts view
CREATE OR REPLACE VIEW capacity_alerts AS
SELECT
    'CONFLICT' AS alert_type,
    c.clinic_id,
    c.created_at,
    c.severity AS priority,
    c.description AS message,
    c.shift_id AS related_id
FROM shift_conflicts c
WHERE c.status = 'OPEN' AND c.severity IN ('HIGH', 'CRITICAL')
UNION ALL
SELECT
    'STAFFING' AS alert_type,
    r.clinic_id,
    r.created_at,
    r.priority,
    r.reason AS message,
    r.plan_id AS related_id
FROM staffing_recommendations r
WHERE r.status = 'PENDING' AND r.priority IN ('HIGH', 'URGENT')
UNION ALL
SELECT
    'CAPACITY' AS alert_type,
    d.clinic_id,
    d.created_at,
    CASE d.capacity_level
        WHEN 'CRITICAL' THEN 'HIGH'
        WHEN 'OVERBOOKED' THEN 'URGENT'
    END AS priority,
    'Capacity ' || d.capacity_level || ' on ' || d.date::TEXT AS message,
    d.plan_id AS related_id
FROM daily_capacity_snapshots d
WHERE d.capacity_level IN ('CRITICAL', 'OVERBOOKED')
    AND d.date >= CURRENT_DATE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE staff_shifts IS 'Staff shift schedules for capacity planning';
COMMENT ON TABLE capacity_plans IS 'Capacity planning documents with aggregated metrics';
COMMENT ON TABLE daily_capacity_snapshots IS 'Daily capacity snapshots within a plan';
COMMENT ON TABLE historical_demand IS 'Historical appointment demand for forecasting';
COMMENT ON TABLE staffing_recommendations IS 'AI-generated staffing recommendations';
COMMENT ON TABLE shift_conflicts IS 'Detected scheduling conflicts';
COMMENT ON TABLE demand_forecasts IS 'Predicted demand forecasts';
