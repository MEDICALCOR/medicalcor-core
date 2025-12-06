-- ============================================================================
-- MedicalCor Core - Event Sourcing Replay (M6/H7)
-- ============================================================================
-- Audit Trail and State Reconstruction Support
-- - Audit log table for compliance (HIPAA, GDPR)
-- - Replay checkpoints for resumable replays
-- - Event metadata enhancements
-- - Temporal query indexes
-- ============================================================================

-- =============================================================================
-- Audit Log Table (Compliance-Ready)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Temporal information
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Event reference
    event_type VARCHAR(100) NOT NULL,
    event_id UUID NOT NULL,

    -- Aggregate information
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,

    -- Actor information (who performed the action)
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

    -- Retention (for GDPR/HIPAA)
    retention_until TIMESTAMPTZ,
    is_redacted BOOLEAN DEFAULT FALSE
);

-- Indexes for common audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_aggregate ON audit_log(aggregate_id, aggregate_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity) WHERE severity IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation ON audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_compliance ON audit_log USING GIN(compliance_tags);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_id);

-- Composite index for compliance reporting
CREATE INDEX IF NOT EXISTS idx_audit_log_compliance_report
    ON audit_log(timestamp, aggregate_type, action, severity);

-- =============================================================================
-- Replay Checkpoints Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS replay_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Projection identification
    projection_name VARCHAR(100) NOT NULL,
    projection_version INTEGER NOT NULL,

    -- Checkpoint state
    last_event_id UUID NOT NULL,
    last_event_timestamp TIMESTAMPTZ NOT NULL,
    events_processed INTEGER NOT NULL DEFAULT 0,

    -- Serialized state
    state JSONB NOT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replay_type VARCHAR(50) DEFAULT 'standard' CHECK (replay_type IN ('standard', 'temporal', 'migration')),

    -- Unique constraint per projection/version
    CONSTRAINT uq_replay_checkpoint UNIQUE (projection_name, projection_version)
);

CREATE INDEX IF NOT EXISTS idx_replay_checkpoints_projection
    ON replay_checkpoints(projection_name, projection_version);

-- =============================================================================
-- Enhance Domain Events Table
-- =============================================================================

-- Add columns for better temporal queries (if not exists)
DO $$
BEGIN
    -- Add aggregate_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'aggregate_id'
    ) THEN
        ALTER TABLE domain_events ADD COLUMN aggregate_id UUID;
        CREATE INDEX idx_domain_events_aggregate ON domain_events(aggregate_id);
    END IF;

    -- Add aggregate_type if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'aggregate_type'
    ) THEN
        ALTER TABLE domain_events ADD COLUMN aggregate_type VARCHAR(100);
        CREATE INDEX idx_domain_events_aggregate_type ON domain_events(aggregate_type);
    END IF;

    -- Add causation_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'causation_id'
    ) THEN
        ALTER TABLE domain_events ADD COLUMN causation_id VARCHAR(100);
    END IF;

    -- Add actor metadata columns if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'actor_id'
    ) THEN
        ALTER TABLE domain_events ADD COLUMN actor_id VARCHAR(100);
        ALTER TABLE domain_events ADD COLUMN actor_type VARCHAR(20);
        ALTER TABLE domain_events ADD COLUMN actor_name VARCHAR(200);
    END IF;
END $$;

-- Create composite index for temporal queries
CREATE INDEX IF NOT EXISTS idx_domain_events_temporal
    ON domain_events(aggregate_id, aggregate_type, created_at);

-- Create index for version-based queries
CREATE INDEX IF NOT EXISTS idx_domain_events_version
    ON domain_events(aggregate_id, version);

-- =============================================================================
-- Projection State Snapshots (for faster reconstruction)
-- =============================================================================
CREATE TABLE IF NOT EXISTS projection_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Projection identification
    projection_name VARCHAR(100) NOT NULL,
    projection_version INTEGER NOT NULL,

    -- Snapshot state
    state JSONB NOT NULL,
    last_event_id UUID NOT NULL,
    last_event_timestamp TIMESTAMPTZ NOT NULL,
    events_applied INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_trigger VARCHAR(50) DEFAULT 'interval' CHECK (snapshot_trigger IN ('interval', 'manual', 'rebuild', 'migration')),

    -- Performance metrics
    state_size_bytes INTEGER,
    creation_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_projection_snapshots_lookup
    ON projection_snapshots(projection_name, projection_version, created_at DESC);

-- =============================================================================
-- Event Correlation Graph (for tracing event chains)
-- =============================================================================
CREATE TABLE IF NOT EXISTS event_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent-child relationship
    parent_event_id UUID NOT NULL,
    child_event_id UUID NOT NULL,

    -- Correlation context
    correlation_id VARCHAR(100) NOT NULL,
    relationship_type VARCHAR(50) DEFAULT 'caused_by' CHECK (relationship_type IN ('caused_by', 'followed_by', 'compensated_by', 'retried_from')),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_event_correlation UNIQUE (parent_event_id, child_event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_correlations_parent ON event_correlations(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_event_correlations_child ON event_correlations(child_event_id);
CREATE INDEX IF NOT EXISTS idx_event_correlations_correlation ON event_correlations(correlation_id);

-- =============================================================================
-- State History Table (for point-in-time queries)
-- =============================================================================
CREATE TABLE IF NOT EXISTS aggregate_state_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Aggregate identification
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,

    -- Version tracking
    version INTEGER NOT NULL,
    event_id UUID NOT NULL,

    -- State at this version
    state JSONB NOT NULL,

    -- Temporal information
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_aggregate_state_version UNIQUE (aggregate_id, aggregate_type, version)
);

CREATE INDEX IF NOT EXISTS idx_aggregate_state_history_lookup
    ON aggregate_state_history(aggregate_id, aggregate_type, version DESC);

CREATE INDEX IF NOT EXISTS idx_aggregate_state_history_temporal
    ON aggregate_state_history(aggregate_id, valid_from, valid_until);

-- =============================================================================
-- Functions for Audit and Replay
-- =============================================================================

-- Function to insert audit log entry
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
BEGIN
    INSERT INTO audit_log (
        event_type, event_id, aggregate_id, aggregate_type,
        actor_id, actor_type, action, correlation_id,
        severity, reason, previous_state, new_state,
        changed_fields, compliance_tags, metadata
    ) VALUES (
        p_event_type, p_event_id, p_aggregate_id, p_aggregate_type,
        p_actor_id, p_actor_type, p_action, p_correlation_id,
        p_severity, p_reason, p_previous_state, p_new_state,
        p_changed_fields, p_compliance_tags, p_metadata
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get audit trail for an aggregate
CREATE OR REPLACE FUNCTION get_aggregate_audit_trail(
    p_aggregate_id UUID,
    p_aggregate_type VARCHAR(100) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
    id UUID,
    timestamp TIMESTAMPTZ,
    event_type VARCHAR(100),
    action VARCHAR(50),
    actor_id VARCHAR(100),
    actor_type VARCHAR(20),
    actor_name VARCHAR(200),
    severity VARCHAR(20),
    changed_fields TEXT[],
    compliance_tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.timestamp,
        al.event_type,
        al.action,
        al.actor_id,
        al.actor_type,
        al.actor_name,
        al.severity,
        al.changed_fields,
        al.compliance_tags
    FROM audit_log al
    WHERE al.aggregate_id = p_aggregate_id
        AND (p_aggregate_type IS NULL OR al.aggregate_type = p_aggregate_type)
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get compliance report
CREATE OR REPLACE FUNCTION get_compliance_report(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_compliance_tags TEXT[] DEFAULT NULL
) RETURNS TABLE (
    compliance_tag TEXT,
    total_entries BIGINT,
    by_action JSONB,
    by_severity JSONB,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tag AS compliance_tag,
        COUNT(*) AS total_entries,
        jsonb_object_agg(action, action_count) AS by_action,
        jsonb_object_agg(severity, severity_count) AS by_severity,
        MIN(al.timestamp) AS first_occurrence,
        MAX(al.timestamp) AS last_occurrence
    FROM audit_log al,
         LATERAL unnest(al.compliance_tags) AS tag
    CROSS JOIN LATERAL (
        SELECT al.action, COUNT(*) AS action_count
        GROUP BY al.action
    ) actions
    CROSS JOIN LATERAL (
        SELECT al.severity, COUNT(*) AS severity_count
        GROUP BY al.severity
    ) severities
    WHERE al.timestamp >= p_start_time
        AND al.timestamp <= p_end_time
        AND (p_compliance_tags IS NULL OR al.compliance_tags && p_compliance_tags)
    GROUP BY tag;
END;
$$ LANGUAGE plpgsql;

-- Function to rebuild projection state from events
CREATE OR REPLACE FUNCTION get_events_for_replay(
    p_aggregate_id UUID DEFAULT NULL,
    p_aggregate_type VARCHAR(100) DEFAULT NULL,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_event_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 10000
) RETURNS TABLE (
    id UUID,
    type VARCHAR(100),
    aggregate_id UUID,
    aggregate_type VARCHAR(100),
    version INTEGER,
    payload JSONB,
    correlation_id VARCHAR(100),
    causation_id VARCHAR(100),
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        de.id,
        de.type,
        de.aggregate_id,
        de.aggregate_type,
        de.version,
        de.payload,
        de.correlation_id,
        de.causation_id,
        de.created_at
    FROM domain_events de
    WHERE (p_aggregate_id IS NULL OR de.aggregate_id = p_aggregate_id)
        AND (p_aggregate_type IS NULL OR de.aggregate_type = p_aggregate_type)
        AND (p_start_time IS NULL OR de.created_at >= p_start_time)
        AND (p_end_time IS NULL OR de.created_at <= p_end_time)
        AND (p_event_types IS NULL OR de.type = ANY(p_event_types))
    ORDER BY de.created_at ASC, de.version ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to save state history snapshot
CREATE OR REPLACE FUNCTION save_aggregate_state_history(
    p_aggregate_id UUID,
    p_aggregate_type VARCHAR(100),
    p_version INTEGER,
    p_event_id UUID,
    p_state JSONB,
    p_valid_from TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Close the previous state record
    UPDATE aggregate_state_history
    SET valid_until = p_valid_from
    WHERE aggregate_id = p_aggregate_id
        AND aggregate_type = p_aggregate_type
        AND valid_until IS NULL;

    -- Insert new state record
    INSERT INTO aggregate_state_history (
        aggregate_id, aggregate_type, version, event_id, state, valid_from
    ) VALUES (
        p_aggregate_id, p_aggregate_type, p_version, p_event_id, p_state, p_valid_from
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get state at a point in time
CREATE OR REPLACE FUNCTION get_aggregate_state_at_time(
    p_aggregate_id UUID,
    p_aggregate_type VARCHAR(100),
    p_timestamp TIMESTAMPTZ
) RETURNS TABLE (
    version INTEGER,
    state JSONB,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ash.version,
        ash.state,
        ash.valid_from,
        ash.valid_until
    FROM aggregate_state_history ash
    WHERE ash.aggregate_id = p_aggregate_id
        AND ash.aggregate_type = p_aggregate_type
        AND ash.valid_from <= p_timestamp
        AND (ash.valid_until IS NULL OR ash.valid_until > p_timestamp)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Row Level Security (RLS) for Audit Log
-- =============================================================================

-- Enable RLS on audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for their clinic
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

-- Policy: System can insert audit logs
CREATE POLICY audit_log_system_insert ON audit_log
    FOR INSERT
    WITH CHECK (TRUE);

-- =============================================================================
-- Cleanup Job for Old Audit Logs (GDPR Compliance)
-- =============================================================================

-- Function to cleanup expired audit logs
CREATE OR REPLACE FUNCTION cleanup_expired_audit_logs() RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM audit_log
    WHERE retention_until IS NOT NULL
        AND retention_until < NOW()
        AND severity NOT IN ('high', 'critical');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for compliance (HIPAA, GDPR) - stores all state changes with actor and context information';
COMMENT ON TABLE replay_checkpoints IS 'Stores checkpoint state for resumable event replay operations';
COMMENT ON TABLE projection_snapshots IS 'Periodic snapshots of projection state for faster reconstruction';
COMMENT ON TABLE event_correlations IS 'Tracks parent-child relationships between events for distributed tracing';
COMMENT ON TABLE aggregate_state_history IS 'Bi-temporal table storing aggregate state history for point-in-time queries';

COMMENT ON FUNCTION insert_audit_log IS 'Insert a new audit log entry with full actor and context information';
COMMENT ON FUNCTION get_aggregate_audit_trail IS 'Get complete audit history for a specific aggregate';
COMMENT ON FUNCTION get_compliance_report IS 'Generate compliance report grouped by compliance tags';
COMMENT ON FUNCTION get_events_for_replay IS 'Get events for replay with temporal and type filtering';
COMMENT ON FUNCTION save_aggregate_state_history IS 'Save aggregate state to history with bi-temporal tracking';
COMMENT ON FUNCTION get_aggregate_state_at_time IS 'Retrieve aggregate state as it was at a specific point in time';
