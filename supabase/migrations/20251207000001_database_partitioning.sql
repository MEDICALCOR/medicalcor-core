-- ============================================================================
-- MedicalCor Core - Database Partitioning (H6)
-- ============================================================================
-- Time-based partitioning for domain_events and audit_log tables
-- These tables grow unbounded and benefit from monthly partitioning for:
-- - Improved query performance on time-range queries
-- - Efficient data archival and cleanup
-- - Better vacuum and maintenance operations
-- ============================================================================

-- =============================================================================
-- DOMAIN_EVENTS TABLE PARTITIONING
-- =============================================================================

-- Step 1: Rename the existing table
ALTER TABLE IF EXISTS domain_events RENAME TO domain_events_old;

-- Step 2: Drop existing indexes (they'll be recreated on partitioned table)
DROP INDEX IF EXISTS idx_domain_events_type;
DROP INDEX IF EXISTS idx_domain_events_correlation_id;
DROP INDEX IF EXISTS idx_domain_events_created_at;
DROP INDEX IF EXISTS idx_domain_events_aggregate;
DROP INDEX IF EXISTS idx_domain_events_aggregate_type;
DROP INDEX IF EXISTS idx_domain_events_temporal;
DROP INDEX IF EXISTS idx_domain_events_version;

-- Step 3: Create the partitioned table
CREATE TABLE domain_events (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Additional columns from event_sourcing_replay migration
    aggregate_id UUID,
    aggregate_type VARCHAR(100),
    causation_id VARCHAR(100),
    actor_id VARCHAR(100),
    actor_type VARCHAR(20),
    actor_name VARCHAR(200),

    CONSTRAINT domain_events_type_check CHECK (type ~ '^[a-z]+\.[a-z_]+$'),

    -- Primary key includes partition key for PostgreSQL requirement
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 4: Create indexes on the partitioned table (will be inherited by partitions)
CREATE INDEX idx_domain_events_type ON domain_events(type);
CREATE INDEX idx_domain_events_correlation_id ON domain_events(correlation_id);
CREATE INDEX idx_domain_events_created_at ON domain_events(created_at DESC);
CREATE INDEX idx_domain_events_aggregate ON domain_events(aggregate_id);
CREATE INDEX idx_domain_events_aggregate_type ON domain_events(aggregate_type);
CREATE INDEX idx_domain_events_temporal ON domain_events(aggregate_id, aggregate_type, created_at);
CREATE INDEX idx_domain_events_version ON domain_events(aggregate_id, version);
CREATE INDEX idx_domain_events_idempotency ON domain_events(idempotency_key);

-- =============================================================================
-- AUDIT_LOG TABLE PARTITIONING
-- =============================================================================

-- Step 1: Rename the existing table
ALTER TABLE IF EXISTS audit_log RENAME TO audit_log_old;

-- Step 2: Drop existing indexes
DROP INDEX IF EXISTS idx_audit_log_timestamp;
DROP INDEX IF EXISTS idx_audit_log_aggregate;
DROP INDEX IF EXISTS idx_audit_log_actor;
DROP INDEX IF EXISTS idx_audit_log_action;
DROP INDEX IF EXISTS idx_audit_log_severity;
DROP INDEX IF EXISTS idx_audit_log_correlation;
DROP INDEX IF EXISTS idx_audit_log_compliance;
DROP INDEX IF EXISTS idx_audit_log_event;
DROP INDEX IF EXISTS idx_audit_log_compliance_report;

-- Step 3: Create the partitioned table
CREATE TABLE audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Temporal information (partition key)
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Event reference
    event_type VARCHAR(100) NOT NULL,
    event_id UUID NOT NULL,

    -- Aggregate information
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,

    -- Actor information
    actor_id VARCHAR(100) NOT NULL,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'system', 'api', 'integration', 'cron')),
    actor_name VARCHAR(200),
    actor_email VARCHAR(200),
    actor_ip_address INET,
    actor_user_agent TEXT,
    actor_clinic_id UUID,

    -- Action information
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create', 'read', 'update', 'delete',
        'export', 'import', 'access', 'consent',
        'authenticate', 'authorize', 'score', 'assign',
        'transfer', 'schedule', 'cancel', 'complete',
        'escalate', 'archive', 'restore'
    )),
    reason TEXT,

    -- State tracking
    previous_state JSONB,
    new_state JSONB,
    changed_fields TEXT[],

    -- Tracing
    correlation_id VARCHAR(100) NOT NULL,
    causation_id VARCHAR(100),

    -- Additional metadata
    metadata JSONB,

    -- Compliance
    compliance_tags TEXT[],
    severity VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Retention
    retention_until TIMESTAMPTZ,
    is_redacted BOOLEAN DEFAULT FALSE,

    -- Primary key includes partition key
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Step 4: Create indexes on the partitioned table
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_aggregate ON audit_log(aggregate_id, aggregate_type);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, actor_type);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_severity ON audit_log(severity) WHERE severity IN ('high', 'critical');
CREATE INDEX idx_audit_log_correlation ON audit_log(correlation_id);
CREATE INDEX idx_audit_log_compliance ON audit_log USING GIN(compliance_tags);
CREATE INDEX idx_audit_log_event ON audit_log(event_id);
CREATE INDEX idx_audit_log_compliance_report ON audit_log(timestamp, aggregate_type, action, severity);

-- =============================================================================
-- PARTITION MANAGEMENT FUNCTIONS
-- =============================================================================

-- Function to create a partition for a specific month
CREATE OR REPLACE FUNCTION create_domain_events_partition(
    p_year INTEGER,
    p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_partition_name := format('domain_events_y%sm%s', p_year, LPAD(p_month::TEXT, 2, '0'));
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := v_start_date + INTERVAL '1 month';

    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = v_partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF domain_events FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;

    RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to create audit_log partition for a specific month
CREATE OR REPLACE FUNCTION create_audit_log_partition(
    p_year INTEGER,
    p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_partition_name := format('audit_log_y%sm%s', p_year, LPAD(p_month::TEXT, 2, '0'));
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := v_start_date + INTERVAL '1 month';

    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = v_partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
            v_partition_name, v_start_date, v_end_date
        );
    END IF;

    RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure partitions exist for a date range
CREATE OR REPLACE FUNCTION ensure_partitions_exist(
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    table_name TEXT,
    partition_name TEXT
) AS $$
DECLARE
    v_current_date DATE;
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_current_date := date_trunc('month', p_start_date)::DATE;

    WHILE v_current_date < p_end_date LOOP
        v_year := EXTRACT(YEAR FROM v_current_date);
        v_month := EXTRACT(MONTH FROM v_current_date);

        -- Create partitions for both tables
        table_name := 'domain_events';
        partition_name := create_domain_events_partition(v_year, v_month);
        RETURN NEXT;

        table_name := 'audit_log';
        partition_name := create_audit_log_partition(v_year, v_month);
        RETURN NEXT;

        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to create future partitions (for cron job)
CREATE OR REPLACE FUNCTION create_future_partitions(
    p_months_ahead INTEGER DEFAULT 3
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_current_date DATE;
    v_end_date DATE;
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_current_date := date_trunc('month', CURRENT_DATE)::DATE;
    v_end_date := v_current_date + (p_months_ahead || ' months')::INTERVAL;

    WHILE v_current_date <= v_end_date LOOP
        v_year := EXTRACT(YEAR FROM v_current_date);
        v_month := EXTRACT(MONTH FROM v_current_date);

        PERFORM create_domain_events_partition(v_year, v_month);
        PERFORM create_audit_log_partition(v_year, v_month);

        v_count := v_count + 2;
        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (for data retention)
CREATE OR REPLACE FUNCTION drop_old_partitions(
    p_table_name TEXT,
    p_retention_months INTEGER DEFAULT 24
) RETURNS INTEGER AS $$
DECLARE
    v_partition RECORD;
    v_count INTEGER := 0;
    v_cutoff_date DATE;
    v_pattern TEXT;
BEGIN
    v_cutoff_date := date_trunc('month', CURRENT_DATE - (p_retention_months || ' months')::INTERVAL)::DATE;
    v_pattern := p_table_name || '_y%';

    FOR v_partition IN
        SELECT
            child.relname AS partition_name,
            pg_get_expr(child.relpartbound, child.oid) AS partition_bound
        FROM pg_class parent
        JOIN pg_inherits i ON i.inhparent = parent.oid
        JOIN pg_class child ON child.oid = i.inhrelid
        WHERE parent.relname = p_table_name
            AND child.relname LIKE v_pattern
    LOOP
        -- Extract the start date from the partition bound expression
        -- Format: FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
        IF v_partition.partition_bound ~ 'FROM \(''(\d{4}-\d{2}-\d{2})' THEN
            DECLARE
                v_start_date DATE;
            BEGIN
                v_start_date := (regexp_match(v_partition.partition_bound, 'FROM \(''(\d{4}-\d{2}-\d{2})'))[1]::DATE;

                IF v_start_date < v_cutoff_date THEN
                    EXECUTE format('DROP TABLE IF EXISTS %I', v_partition.partition_name);
                    v_count := v_count + 1;
                END IF;
            END;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get partition statistics
CREATE OR REPLACE FUNCTION get_partition_stats(
    p_table_name TEXT
) RETURNS TABLE (
    partition_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    index_size TEXT,
    partition_range TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        child.relname::TEXT AS partition_name,
        pg_stat_get_live_tuples(child.oid) AS row_count,
        pg_size_pretty(pg_total_relation_size(child.oid)) AS total_size,
        pg_size_pretty(pg_indexes_size(child.oid)) AS index_size,
        pg_get_expr(child.relpartbound, child.oid)::TEXT AS partition_range
    FROM pg_class parent
    JOIN pg_inherits i ON i.inhparent = parent.oid
    JOIN pg_class child ON child.oid = i.inhrelid
    WHERE parent.relname = p_table_name
    ORDER BY child.relname;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CREATE INITIAL PARTITIONS
-- =============================================================================

-- Create partitions for 2024 (historical data)
DO $$
BEGIN
    FOR m IN 1..12 LOOP
        PERFORM create_domain_events_partition(2024, m);
        PERFORM create_audit_log_partition(2024, m);
    END LOOP;
END $$;

-- Create partitions for 2025 (current year)
DO $$
BEGIN
    FOR m IN 1..12 LOOP
        PERFORM create_domain_events_partition(2025, m);
        PERFORM create_audit_log_partition(2025, m);
    END LOOP;
END $$;

-- Create partitions for 2026 (future)
DO $$
BEGIN
    FOR m IN 1..6 LOOP
        PERFORM create_domain_events_partition(2026, m);
        PERFORM create_audit_log_partition(2026, m);
    END LOOP;
END $$;

-- =============================================================================
-- MIGRATE EXISTING DATA
-- =============================================================================

-- Migrate domain_events data (if old table exists and has data)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'domain_events_old') THEN
        -- Ensure created_at is not null for partitioning
        UPDATE domain_events_old SET created_at = NOW() WHERE created_at IS NULL;

        -- Insert data into new partitioned table
        INSERT INTO domain_events (
            id, type, payload, correlation_id, idempotency_key, version, created_at,
            aggregate_id, aggregate_type, causation_id, actor_id, actor_type, actor_name
        )
        SELECT
            id, type, payload, correlation_id, idempotency_key, version,
            COALESCE(created_at, NOW()),
            aggregate_id, aggregate_type, causation_id, actor_id, actor_type, actor_name
        FROM domain_events_old
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Migrate audit_log data (if old table exists and has data)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log_old') THEN
        -- Ensure timestamp is not null for partitioning
        UPDATE audit_log_old SET timestamp = NOW() WHERE timestamp IS NULL;

        -- Insert data into new partitioned table
        INSERT INTO audit_log (
            id, timestamp, event_type, event_id, aggregate_id, aggregate_type,
            actor_id, actor_type, actor_name, actor_email, actor_ip_address,
            actor_user_agent, actor_clinic_id, action, reason, previous_state,
            new_state, changed_fields, correlation_id, causation_id, metadata,
            compliance_tags, severity, retention_until, is_redacted
        )
        SELECT
            id, COALESCE(timestamp, NOW()), event_type, event_id, aggregate_id, aggregate_type,
            actor_id, actor_type, actor_name, actor_email, actor_ip_address,
            actor_user_agent, actor_clinic_id, action, reason, previous_state,
            new_state, changed_fields, correlation_id, causation_id, metadata,
            compliance_tags, severity, retention_until, is_redacted
        FROM audit_log_old
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- DROP OLD TABLES (after data migration)
-- =============================================================================

DROP TABLE IF EXISTS domain_events_old CASCADE;
DROP TABLE IF EXISTS audit_log_old CASCADE;

-- =============================================================================
-- UPDATE FUNCTIONS TO WORK WITH PARTITIONED TABLES
-- =============================================================================

-- Update emit_domain_event function to ensure created_at is set
CREATE OR REPLACE FUNCTION emit_domain_event(
    p_type VARCHAR(100),
    p_payload JSONB,
    p_correlation_id VARCHAR(100),
    p_idempotency_key VARCHAR(200)
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_created_at TIMESTAMPTZ := NOW();
BEGIN
    INSERT INTO domain_events (type, payload, correlation_id, idempotency_key, created_at)
    VALUES (p_type, p_payload, p_correlation_id, p_idempotency_key, v_created_at)
    ON CONFLICT (idempotency_key, created_at) DO NOTHING
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle race condition - return existing event id
        SELECT id INTO v_id FROM domain_events
        WHERE idempotency_key = p_idempotency_key LIMIT 1;
        RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Update insert_audit_log function to ensure timestamp is set
CREATE OR REPLACE FUNCTION insert_audit_log(
    p_event_type VARCHAR(100),
    p_event_id UUID,
    p_aggregate_id UUID,
    p_aggregate_type VARCHAR(100),
    p_actor_id VARCHAR(100),
    p_actor_type VARCHAR(20),
    p_action VARCHAR(50),
    p_correlation_id VARCHAR(100),
    p_severity VARCHAR(20) DEFAULT 'low',
    p_reason TEXT DEFAULT NULL,
    p_previous_state JSONB DEFAULT NULL,
    p_new_state JSONB DEFAULT NULL,
    p_changed_fields TEXT[] DEFAULT NULL,
    p_compliance_tags TEXT[] DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_timestamp TIMESTAMPTZ := NOW();
BEGIN
    INSERT INTO audit_log (
        timestamp, event_type, event_id, aggregate_id, aggregate_type,
        actor_id, actor_type, action, correlation_id,
        severity, reason, previous_state, new_state,
        changed_fields, compliance_tags, metadata
    ) VALUES (
        v_timestamp, p_event_type, p_event_id, p_aggregate_id, p_aggregate_type,
        p_actor_id, p_actor_type, p_action, p_correlation_id,
        p_severity, p_reason, p_previous_state, p_new_state,
        p_changed_fields, p_compliance_tags, p_metadata
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RE-ENABLE ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on partitioned audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Recreate policy: Users can view audit logs for their clinic
DROP POLICY IF EXISTS audit_log_clinic_access ON audit_log;
CREATE POLICY audit_log_clinic_access ON audit_log
    FOR SELECT
    USING (
        actor_clinic_id IN (
            SELECT clinic_id FROM user_clinic_memberships
            WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- Recreate policy: System can insert audit logs
DROP POLICY IF EXISTS audit_log_system_insert ON audit_log;
CREATE POLICY audit_log_system_insert ON audit_log
    FOR INSERT
    WITH CHECK (TRUE);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE domain_events IS 'Partitioned event store for domain events - partitioned by created_at (monthly)';
COMMENT ON TABLE audit_log IS 'Partitioned audit log for compliance (HIPAA, GDPR) - partitioned by timestamp (monthly)';

COMMENT ON FUNCTION create_domain_events_partition IS 'Creates a monthly partition for domain_events table';
COMMENT ON FUNCTION create_audit_log_partition IS 'Creates a monthly partition for audit_log table';
COMMENT ON FUNCTION ensure_partitions_exist IS 'Ensures partitions exist for a given date range';
COMMENT ON FUNCTION create_future_partitions IS 'Creates partitions for upcoming months (for cron job)';
COMMENT ON FUNCTION drop_old_partitions IS 'Drops old partitions based on retention policy';
COMMENT ON FUNCTION get_partition_stats IS 'Returns statistics for all partitions of a table';
