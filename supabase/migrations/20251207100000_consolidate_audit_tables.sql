-- ============================================================================
-- MedicalCor Core - Consolidate Audit Tables (M1)
-- ============================================================================
-- Merges 4 similar audit tables into a unified audit_log table:
-- - audit_log (compliance) -> audit_type = 'compliance'
-- - audit_logs (general) -> audit_type = 'general'
-- - consent_audit_log -> audit_type = 'consent'
-- - replay_audit_log -> audit_type = 'replay'
--
-- Benefits:
-- - Single source of truth for all audit data
-- - Unified query interface
-- - Consistent retention and partitioning
-- - Reduced schema complexity
-- ============================================================================

-- =============================================================================
-- STEP 1: CREATE AUDIT TYPE ENUM
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_type_enum') THEN
        CREATE TYPE audit_type_enum AS ENUM ('compliance', 'general', 'consent', 'replay');
    END IF;
END $$;

-- =============================================================================
-- STEP 2: ADD NEW COLUMNS TO AUDIT_LOG FOR CONSOLIDATION
-- =============================================================================

-- Add audit_type column to distinguish between different audit sources
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS audit_type audit_type_enum NOT NULL DEFAULT 'compliance';

-- Columns for general audit (audit_logs) support
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_name VARCHAR(300);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Columns for consent audit (consent_audit_log) support
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS consent_id VARCHAR(50);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS previous_status VARCHAR(20);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_status VARCHAR(20);

-- Columns for replay audit (replay_audit_log) support
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS replay_status VARCHAR(20);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS projection_name VARCHAR(255);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS parameters JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS error JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS progress JSONB;

-- =============================================================================
-- STEP 3: CREATE NEW INDEXES FOR CONSOLIDATED QUERIES
-- =============================================================================

-- Index for audit_type filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_audit_type
ON audit_log(audit_type, timestamp DESC);

-- Index for general audit queries by clinic
CREATE INDEX IF NOT EXISTS idx_audit_log_clinic
ON audit_log(clinic_id, timestamp DESC)
WHERE audit_type = 'general';

-- Index for general audit queries by category
CREATE INDEX IF NOT EXISTS idx_audit_log_category
ON audit_log(category, timestamp DESC)
WHERE audit_type = 'general';

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
ON audit_log(entity_type, entity_id)
WHERE entity_type IS NOT NULL;

-- Index for consent audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_consent
ON audit_log(consent_id, timestamp DESC)
WHERE audit_type = 'consent';

-- Index for replay audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_replay_operation
ON audit_log(operation_type, timestamp DESC)
WHERE audit_type = 'replay';

-- Index for replay audit by projection
CREATE INDEX IF NOT EXISTS idx_audit_log_projection
ON audit_log(projection_name, timestamp DESC)
WHERE audit_type = 'replay';

-- Index for replay audit by tenant
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant
ON audit_log(tenant_id, timestamp DESC)
WHERE audit_type = 'replay';

-- =============================================================================
-- STEP 4: MIGRATE DATA FROM AUDIT_LOGS (GENERAL)
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        -- Ensure partitions exist for the data we're migrating
        PERFORM ensure_partitions_exist(
            (SELECT COALESCE(MIN(DATE(created_at)), CURRENT_DATE) FROM audit_logs),
            CURRENT_DATE + INTERVAL '1 month'
        );

        INSERT INTO audit_log (
            id,
            timestamp,
            audit_type,
            clinic_id,
            actor_id,
            actor_type,
            actor_name,
            actor_ip_address,
            actor_user_agent,
            action,
            category,
            entity_type,
            entity_id,
            entity_name,
            previous_state,
            new_state,
            details,
            status,
            correlation_id,
            event_type,
            event_id,
            aggregate_id,
            aggregate_type,
            severity,
            metadata
        )
        SELECT
            al.id,
            COALESCE(al.created_at, NOW()),
            'general'::audit_type_enum,
            al.clinic_id,
            COALESCE(al.user_id::text, 'unknown'),
            'user'::VARCHAR(20),
            al.user_name,
            al.ip_address,
            al.user_agent,
            CASE
                WHEN al.action ILIKE '%create%' OR al.action ILIKE '%add%' THEN 'create'
                WHEN al.action ILIKE '%update%' OR al.action ILIKE '%edit%' OR al.action ILIKE '%change%' THEN 'update'
                WHEN al.action ILIKE '%delete%' OR al.action ILIKE '%remove%' THEN 'delete'
                WHEN al.action ILIKE '%read%' OR al.action ILIKE '%view%' OR al.action ILIKE '%get%' THEN 'read'
                WHEN al.action ILIKE '%export%' THEN 'export'
                WHEN al.action ILIKE '%import%' THEN 'import'
                WHEN al.action ILIKE '%login%' OR al.action ILIKE '%auth%' THEN 'authenticate'
                ELSE 'access'
            END::VARCHAR(50),
            al.category,
            al.entity_type,
            al.entity_id,
            al.entity_name,
            al.old_value,
            al.new_value,
            al.details,
            al.status,
            COALESCE('general-' || al.id::text, gen_random_uuid()::text),
            'audit.general_action',
            COALESCE(al.id, gen_random_uuid()),
            COALESCE(al.entity_id, al.clinic_id, gen_random_uuid()),
            COALESCE(al.entity_type, 'general'),
            CASE
                WHEN al.status = 'failure' THEN 'high'
                WHEN al.status = 'warning' THEN 'medium'
                ELSE 'low'
            END::VARCHAR(20),
            jsonb_build_object(
                'source', 'audit_logs_migration',
                'original_action', al.action,
                'user_role', al.user_role
            )
        FROM audit_logs al
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Migrated % rows from audit_logs', v_count;
    END IF;
END $$;

-- =============================================================================
-- STEP 5: MIGRATE DATA FROM CONSENT_AUDIT_LOG
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_audit_log') THEN
        -- Ensure partitions exist for the data we're migrating
        PERFORM ensure_partitions_exist(
            (SELECT COALESCE(MIN(DATE(timestamp)), CURRENT_DATE) FROM consent_audit_log),
            CURRENT_DATE + INTERVAL '1 month'
        );

        INSERT INTO audit_log (
            id,
            timestamp,
            audit_type,
            consent_id,
            actor_id,
            actor_type,
            action,
            previous_status,
            new_status,
            reason,
            actor_ip_address,
            correlation_id,
            event_type,
            event_id,
            aggregate_id,
            aggregate_type,
            severity,
            compliance_tags,
            metadata
        )
        SELECT
            gen_random_uuid(),
            COALESCE(cal.timestamp, NOW()),
            'consent'::audit_type_enum,
            cal.consent_id,
            cal.performed_by,
            'user'::VARCHAR(20),
            'consent'::VARCHAR(50),
            cal.previous_status,
            cal.new_status,
            cal.reason,
            cal.ip_address::inet,
            COALESCE('consent-' || cal.id, gen_random_uuid()::text),
            'consent.' || cal.action,
            gen_random_uuid(),
            cal.consent_id::uuid,
            'Consent',
            CASE
                WHEN cal.action = 'withdrawn' THEN 'high'
                WHEN cal.action = 'denied' THEN 'medium'
                ELSE 'low'
            END::VARCHAR(20),
            ARRAY['GDPR', 'CONSENT']::TEXT[],
            COALESCE(cal.metadata, '{}'::jsonb) || jsonb_build_object(
                'source', 'consent_audit_log_migration',
                'original_id', cal.id,
                'original_action', cal.action
            )
        FROM consent_audit_log cal
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Migrated % rows from consent_audit_log', v_count;
    END IF;
END $$;

-- =============================================================================
-- STEP 6: MIGRATE DATA FROM REPLAY_AUDIT_LOG
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_audit_log') THEN
        -- Ensure partitions exist for the data we're migrating
        PERFORM ensure_partitions_exist(
            (SELECT COALESCE(MIN(DATE(started_at)), CURRENT_DATE) FROM replay_audit_log),
            CURRENT_DATE + INTERVAL '1 month'
        );

        INSERT INTO audit_log (
            id,
            timestamp,
            audit_type,
            operation_type,
            replay_status,
            aggregate_id,
            aggregate_type,
            projection_name,
            actor_id,
            actor_type,
            tenant_id,
            correlation_id,
            parameters,
            result,
            error,
            started_at,
            completed_at,
            last_progress_at,
            progress,
            action,
            event_type,
            event_id,
            severity,
            metadata
        )
        SELECT
            ral.id,
            COALESCE(ral.started_at, NOW()),
            'replay'::audit_type_enum,
            ral.operation_type,
            ral.status,
            ral.aggregate_id::uuid,
            COALESCE(ral.aggregate_type, 'Unknown'),
            ral.projection_name,
            ral.initiated_by,
            'system'::VARCHAR(20),
            ral.tenant_id,
            ral.correlation_id,
            ral.parameters,
            ral.result,
            ral.error,
            ral.started_at,
            ral.completed_at,
            ral.last_progress_at,
            ral.progress,
            CASE
                WHEN ral.operation_type = 'state_reconstruction' THEN 'restore'
                WHEN ral.operation_type = 'projection_rebuild' THEN 'update'
                ELSE 'access'
            END::VARCHAR(50),
            'replay.' || ral.operation_type,
            ral.id,
            CASE
                WHEN ral.status = 'failed' THEN 'high'
                WHEN ral.status = 'cancelled' THEN 'medium'
                ELSE 'low'
            END::VARCHAR(20),
            COALESCE(ral.metadata, '{}'::jsonb) || jsonb_build_object(
                'source', 'replay_audit_log_migration'
            )
        FROM replay_audit_log ral
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Migrated % rows from replay_audit_log', v_count;
    END IF;
END $$;

-- =============================================================================
-- STEP 7: CREATE BACKWARD-COMPATIBLE VIEWS
-- =============================================================================

-- View for general audit logs (audit_logs compatibility)
CREATE OR REPLACE VIEW audit_logs_view AS
SELECT
    id,
    clinic_id,
    actor_id::uuid AS user_id,
    actor_name AS user_name,
    metadata->>'user_role' AS user_role,
    COALESCE(metadata->>'original_action', action) AS action,
    category,
    entity_type,
    entity_id,
    entity_name,
    previous_state AS old_value,
    new_state AS new_value,
    details,
    actor_ip_address AS ip_address,
    actor_user_agent AS user_agent,
    status,
    timestamp AS created_at
FROM audit_log
WHERE audit_type = 'general';

COMMENT ON VIEW audit_logs_view IS 'Backward-compatible view for the deprecated audit_logs table';

-- View for consent audit log (consent_audit_log compatibility)
CREATE OR REPLACE VIEW consent_audit_log_view AS
SELECT
    id::text AS id,
    consent_id,
    COALESCE(metadata->>'original_action',
        CASE
            WHEN new_status = previous_status THEN 'updated'
            WHEN previous_status IS NULL THEN 'created'
            WHEN new_status = 'granted' THEN 'granted'
            WHEN new_status = 'denied' THEN 'denied'
            WHEN new_status = 'withdrawn' THEN 'withdrawn'
            ELSE 'updated'
        END
    ) AS action,
    previous_status,
    new_status,
    actor_id AS performed_by,
    reason,
    actor_ip_address::text AS ip_address,
    metadata,
    timestamp
FROM audit_log
WHERE audit_type = 'consent';

COMMENT ON VIEW consent_audit_log_view IS 'Backward-compatible view for the deprecated consent_audit_log table';

-- View for replay audit log (replay_audit_log compatibility)
CREATE OR REPLACE VIEW replay_audit_log_view AS
SELECT
    id,
    operation_type,
    replay_status AS status,
    aggregate_id::text AS aggregate_id,
    aggregate_type,
    projection_name,
    actor_id AS initiated_by,
    tenant_id,
    correlation_id,
    parameters,
    result,
    error,
    started_at,
    completed_at,
    last_progress_at,
    progress,
    metadata
FROM audit_log
WHERE audit_type = 'replay';

COMMENT ON VIEW replay_audit_log_view IS 'Backward-compatible view for the deprecated replay_audit_log table';

-- =============================================================================
-- STEP 8: CREATE INSERT TRIGGERS FOR BACKWARD COMPATIBILITY
-- =============================================================================

-- Function to handle inserts to audit_logs_view
CREATE OR REPLACE FUNCTION audit_logs_view_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        id,
        timestamp,
        audit_type,
        clinic_id,
        actor_id,
        actor_type,
        actor_name,
        actor_ip_address,
        actor_user_agent,
        action,
        category,
        entity_type,
        entity_id,
        entity_name,
        previous_state,
        new_state,
        details,
        status,
        correlation_id,
        event_type,
        event_id,
        aggregate_id,
        aggregate_type,
        severity,
        metadata
    ) VALUES (
        COALESCE(NEW.id, gen_random_uuid()),
        COALESCE(NEW.created_at, NOW()),
        'general',
        NEW.clinic_id,
        COALESCE(NEW.user_id::text, 'unknown'),
        'user',
        NEW.user_name,
        NEW.ip_address,
        NEW.user_agent,
        CASE
            WHEN NEW.action ILIKE '%create%' OR NEW.action ILIKE '%add%' THEN 'create'
            WHEN NEW.action ILIKE '%update%' OR NEW.action ILIKE '%edit%' THEN 'update'
            WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%remove%' THEN 'delete'
            WHEN NEW.action ILIKE '%read%' OR NEW.action ILIKE '%view%' THEN 'read'
            ELSE 'access'
        END,
        NEW.category,
        NEW.entity_type,
        NEW.entity_id,
        NEW.entity_name,
        NEW.old_value,
        NEW.new_value,
        NEW.details,
        NEW.status,
        COALESCE('general-' || NEW.id::text, gen_random_uuid()::text),
        'audit.general_action',
        COALESCE(NEW.id, gen_random_uuid()),
        COALESCE(NEW.entity_id, NEW.clinic_id, gen_random_uuid()),
        COALESCE(NEW.entity_type, 'general'),
        CASE
            WHEN NEW.status = 'failure' THEN 'high'
            WHEN NEW.status = 'warning' THEN 'medium'
            ELSE 'low'
        END,
        jsonb_build_object(
            'original_action', NEW.action,
            'user_role', NEW.user_role
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on the view
DROP TRIGGER IF EXISTS audit_logs_view_insert_trigger ON audit_logs_view;
CREATE TRIGGER audit_logs_view_insert_trigger
    INSTEAD OF INSERT ON audit_logs_view
    FOR EACH ROW EXECUTE FUNCTION audit_logs_view_insert();

-- Function to handle inserts to consent_audit_log_view
CREATE OR REPLACE FUNCTION consent_audit_log_view_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        id,
        timestamp,
        audit_type,
        consent_id,
        actor_id,
        actor_type,
        action,
        previous_status,
        new_status,
        reason,
        actor_ip_address,
        correlation_id,
        event_type,
        event_id,
        aggregate_id,
        aggregate_type,
        severity,
        compliance_tags,
        metadata
    ) VALUES (
        gen_random_uuid(),
        COALESCE(NEW.timestamp, NOW()),
        'consent',
        NEW.consent_id,
        NEW.performed_by,
        'user',
        'consent',
        NEW.previous_status,
        NEW.new_status,
        NEW.reason,
        NEW.ip_address::inet,
        COALESCE('consent-' || NEW.id, gen_random_uuid()::text),
        'consent.' || NEW.action,
        gen_random_uuid(),
        NEW.consent_id::uuid,
        'Consent',
        CASE
            WHEN NEW.action = 'withdrawn' THEN 'high'
            WHEN NEW.action = 'denied' THEN 'medium'
            ELSE 'low'
        END,
        ARRAY['GDPR', 'CONSENT'],
        COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
            'original_id', NEW.id,
            'original_action', NEW.action
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consent_audit_log_view_insert_trigger ON consent_audit_log_view;
CREATE TRIGGER consent_audit_log_view_insert_trigger
    INSTEAD OF INSERT ON consent_audit_log_view
    FOR EACH ROW EXECUTE FUNCTION consent_audit_log_view_insert();

-- Function to handle inserts to replay_audit_log_view
CREATE OR REPLACE FUNCTION replay_audit_log_view_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        id,
        timestamp,
        audit_type,
        operation_type,
        replay_status,
        aggregate_id,
        aggregate_type,
        projection_name,
        actor_id,
        actor_type,
        tenant_id,
        correlation_id,
        parameters,
        result,
        error,
        started_at,
        completed_at,
        last_progress_at,
        progress,
        action,
        event_type,
        event_id,
        severity,
        metadata
    ) VALUES (
        COALESCE(NEW.id, gen_random_uuid()),
        COALESCE(NEW.started_at, NOW()),
        'replay',
        NEW.operation_type,
        NEW.status,
        NEW.aggregate_id::uuid,
        COALESCE(NEW.aggregate_type, 'Unknown'),
        NEW.projection_name,
        NEW.initiated_by,
        'system',
        NEW.tenant_id,
        NEW.correlation_id,
        NEW.parameters,
        NEW.result,
        NEW.error,
        NEW.started_at,
        NEW.completed_at,
        NEW.last_progress_at,
        NEW.progress,
        CASE
            WHEN NEW.operation_type = 'state_reconstruction' THEN 'restore'
            WHEN NEW.operation_type = 'projection_rebuild' THEN 'update'
            ELSE 'access'
        END,
        'replay.' || NEW.operation_type,
        COALESCE(NEW.id, gen_random_uuid()),
        CASE
            WHEN NEW.status = 'failed' THEN 'high'
            WHEN NEW.status = 'cancelled' THEN 'medium'
            ELSE 'low'
        END,
        COALESCE(NEW.metadata, '{}'::jsonb)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS replay_audit_log_view_insert_trigger ON replay_audit_log_view;
CREATE TRIGGER replay_audit_log_view_insert_trigger
    INSTEAD OF INSERT ON replay_audit_log_view
    FOR EACH ROW EXECUTE FUNCTION replay_audit_log_view_insert();

-- =============================================================================
-- STEP 9: UPDATE INSERT FUNCTION FOR UNIFIED AUDIT LOG
-- =============================================================================

-- Enhanced insert function that handles all audit types
CREATE OR REPLACE FUNCTION insert_unified_audit_log(
    p_audit_type audit_type_enum,
    p_actor_id VARCHAR(100),
    p_actor_type VARCHAR(20),
    p_action VARCHAR(50),
    p_correlation_id VARCHAR(100),
    -- Optional common parameters
    p_event_type VARCHAR(100) DEFAULT NULL,
    p_event_id UUID DEFAULT NULL,
    p_aggregate_id UUID DEFAULT NULL,
    p_aggregate_type VARCHAR(100) DEFAULT NULL,
    p_severity VARCHAR(20) DEFAULT 'low',
    p_reason TEXT DEFAULT NULL,
    p_previous_state JSONB DEFAULT NULL,
    p_new_state JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    -- General audit parameters
    p_clinic_id UUID DEFAULT NULL,
    p_category VARCHAR(50) DEFAULT NULL,
    p_entity_type VARCHAR(100) DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_entity_name VARCHAR(300) DEFAULT NULL,
    p_details TEXT DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    -- Consent audit parameters
    p_consent_id VARCHAR(50) DEFAULT NULL,
    p_previous_status VARCHAR(20) DEFAULT NULL,
    p_new_status VARCHAR(20) DEFAULT NULL,
    -- Replay audit parameters
    p_operation_type VARCHAR(50) DEFAULT NULL,
    p_replay_status VARCHAR(20) DEFAULT NULL,
    p_projection_name VARCHAR(255) DEFAULT NULL,
    p_tenant_id VARCHAR(255) DEFAULT NULL,
    p_parameters JSONB DEFAULT NULL,
    p_result JSONB DEFAULT NULL,
    p_error JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_timestamp TIMESTAMPTZ := NOW();
BEGIN
    INSERT INTO audit_log (
        timestamp,
        audit_type,
        actor_id,
        actor_type,
        action,
        correlation_id,
        event_type,
        event_id,
        aggregate_id,
        aggregate_type,
        severity,
        reason,
        previous_state,
        new_state,
        metadata,
        -- General fields
        clinic_id,
        category,
        entity_type,
        entity_id,
        entity_name,
        details,
        status,
        -- Consent fields
        consent_id,
        previous_status,
        new_status,
        -- Replay fields
        operation_type,
        replay_status,
        projection_name,
        tenant_id,
        parameters,
        result,
        error,
        started_at
    ) VALUES (
        v_timestamp,
        p_audit_type,
        p_actor_id,
        p_actor_type,
        p_action,
        p_correlation_id,
        COALESCE(p_event_type, p_audit_type::text || '.' || p_action),
        COALESCE(p_event_id, gen_random_uuid()),
        COALESCE(p_aggregate_id, gen_random_uuid()),
        COALESCE(p_aggregate_type, 'Unknown'),
        p_severity,
        p_reason,
        p_previous_state,
        p_new_state,
        p_metadata,
        p_clinic_id,
        p_category,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_details,
        p_status,
        p_consent_id,
        p_previous_status,
        p_new_status,
        p_operation_type,
        p_replay_status,
        p_projection_name,
        p_tenant_id,
        p_parameters,
        p_result,
        p_error,
        CASE WHEN p_audit_type = 'replay' THEN v_timestamp ELSE NULL END
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION insert_unified_audit_log IS 'Unified function to insert audit entries of any type';

-- =============================================================================
-- STEP 10: CREATE UNIFIED QUERY FUNCTIONS
-- =============================================================================

-- Function to query unified audit log with filtering
CREATE OR REPLACE FUNCTION query_unified_audit_log(
    p_audit_type audit_type_enum DEFAULT NULL,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_actor_id VARCHAR DEFAULT NULL,
    p_aggregate_id UUID DEFAULT NULL,
    p_clinic_id UUID DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_consent_id VARCHAR DEFAULT NULL,
    p_operation_type VARCHAR DEFAULT NULL,
    p_severity VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID,
    timestamp TIMESTAMPTZ,
    audit_type audit_type_enum,
    actor_id VARCHAR(100),
    actor_type VARCHAR(20),
    actor_name VARCHAR(200),
    action VARCHAR(50),
    severity VARCHAR(20),
    aggregate_id UUID,
    aggregate_type VARCHAR(100),
    correlation_id VARCHAR(100),
    metadata JSONB,
    -- Type-specific fields
    clinic_id UUID,
    category VARCHAR(50),
    entity_type VARCHAR(100),
    entity_id UUID,
    entity_name VARCHAR(300),
    consent_id VARCHAR(50),
    operation_type VARCHAR(50),
    replay_status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.timestamp,
        al.audit_type,
        al.actor_id,
        al.actor_type,
        al.actor_name,
        al.action,
        al.severity,
        al.aggregate_id,
        al.aggregate_type,
        al.correlation_id,
        al.metadata,
        al.clinic_id,
        al.category,
        al.entity_type,
        al.entity_id,
        al.entity_name,
        al.consent_id,
        al.operation_type,
        al.replay_status
    FROM audit_log al
    WHERE (p_audit_type IS NULL OR al.audit_type = p_audit_type)
        AND (p_start_time IS NULL OR al.timestamp >= p_start_time)
        AND (p_end_time IS NULL OR al.timestamp <= p_end_time)
        AND (p_actor_id IS NULL OR al.actor_id = p_actor_id)
        AND (p_aggregate_id IS NULL OR al.aggregate_id = p_aggregate_id)
        AND (p_clinic_id IS NULL OR al.clinic_id = p_clinic_id)
        AND (p_category IS NULL OR al.category = p_category)
        AND (p_consent_id IS NULL OR al.consent_id = p_consent_id)
        AND (p_operation_type IS NULL OR al.operation_type = p_operation_type)
        AND (p_severity IS NULL OR al.severity = p_severity)
    ORDER BY al.timestamp DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION query_unified_audit_log IS 'Query function for the unified audit log with flexible filtering';

-- Function to get audit statistics
CREATE OR REPLACE FUNCTION get_unified_audit_stats(
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_time TIMESTAMPTZ DEFAULT NOW(),
    p_clinic_id UUID DEFAULT NULL
) RETURNS TABLE (
    audit_type audit_type_enum,
    total_entries BIGINT,
    by_severity JSONB,
    by_action JSONB,
    unique_actors BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.audit_type,
        COUNT(*) as total_entries,
        jsonb_object_agg(
            COALESCE(al.severity, 'unknown'),
            cnt
        ) as by_severity,
        jsonb_object_agg(
            COALESCE(al.action, 'unknown'),
            action_cnt
        ) as by_action,
        COUNT(DISTINCT al.actor_id) as unique_actors
    FROM audit_log al
    LEFT JOIN LATERAL (
        SELECT al.severity, COUNT(*) as cnt
        FROM audit_log al2
        WHERE al2.audit_type = al.audit_type
            AND al2.timestamp BETWEEN p_start_time AND p_end_time
            AND (p_clinic_id IS NULL OR al2.clinic_id = p_clinic_id)
        GROUP BY al2.severity
    ) sev ON true
    LEFT JOIN LATERAL (
        SELECT al.action, COUNT(*) as action_cnt
        FROM audit_log al3
        WHERE al3.audit_type = al.audit_type
            AND al3.timestamp BETWEEN p_start_time AND p_end_time
            AND (p_clinic_id IS NULL OR al3.clinic_id = p_clinic_id)
        GROUP BY al3.action
    ) act ON true
    WHERE al.timestamp BETWEEN p_start_time AND p_end_time
        AND (p_clinic_id IS NULL OR al.clinic_id = p_clinic_id)
    GROUP BY al.audit_type;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_unified_audit_stats IS 'Returns audit statistics grouped by audit type';

-- =============================================================================
-- STEP 11: DROP OLD TABLES (KEEPING BACKUP VIEWS FOR SAFETY)
-- =============================================================================

-- Rename old tables as backup (will be dropped in a future migration)
DO $$
BEGIN
    -- Backup audit_logs if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        ALTER TABLE audit_logs RENAME TO audit_logs_deprecated;
        RAISE NOTICE 'Renamed audit_logs to audit_logs_deprecated';
    END IF;

    -- Backup consent_audit_log if it exists (but preserve FK to consents)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_audit_log') THEN
        -- Remove FK constraint first
        ALTER TABLE consent_audit_log DROP CONSTRAINT IF EXISTS consent_audit_log_consent_id_fkey;
        ALTER TABLE consent_audit_log RENAME TO consent_audit_log_deprecated;
        RAISE NOTICE 'Renamed consent_audit_log to consent_audit_log_deprecated';
    END IF;

    -- Backup replay_audit_log if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_audit_log') THEN
        ALTER TABLE replay_audit_log RENAME TO replay_audit_log_deprecated;
        RAISE NOTICE 'Renamed replay_audit_log to replay_audit_log_deprecated';
    END IF;
END $$;

-- =============================================================================
-- STEP 12: UPDATE RLS POLICIES
-- =============================================================================

-- Update RLS policy to handle all audit types
DROP POLICY IF EXISTS audit_log_clinic_access ON audit_log;
CREATE POLICY audit_log_clinic_access ON audit_log
    FOR SELECT
    USING (
        -- Compliance audit: original policy
        (audit_type = 'compliance' AND (
            actor_clinic_id IN (
                SELECT clinic_id FROM user_clinic_memberships
                WHERE user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM users
                WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
            )
        ))
        -- General audit: clinic-based access
        OR (audit_type = 'general' AND (
            clinic_id IN (
                SELECT clinic_id FROM user_clinic_memberships
                WHERE user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM users
                WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
            )
        ))
        -- Consent audit: admin only
        OR (audit_type = 'consent' AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        ))
        -- Replay audit: system/admin only
        OR (audit_type = 'replay' AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        ))
    );

-- =============================================================================
-- STEP 13: ADD COMMENTS
-- =============================================================================

COMMENT ON COLUMN audit_log.audit_type IS 'Type of audit entry: compliance (HIPAA/GDPR events), general (UI actions), consent (GDPR consent changes), replay (event sourcing operations)';
COMMENT ON COLUMN audit_log.clinic_id IS 'Clinic ID for general audit entries';
COMMENT ON COLUMN audit_log.category IS 'Category for general audit (patient, document, settings, auth, billing, system)';
COMMENT ON COLUMN audit_log.entity_type IS 'Type of entity being audited for general/entity-specific audits';
COMMENT ON COLUMN audit_log.entity_id IS 'ID of the entity being audited';
COMMENT ON COLUMN audit_log.entity_name IS 'Display name of the entity being audited';
COMMENT ON COLUMN audit_log.details IS 'Additional details for general audit entries';
COMMENT ON COLUMN audit_log.status IS 'Status for general audit (success, failure, warning)';
COMMENT ON COLUMN audit_log.consent_id IS 'Consent ID for consent audit entries';
COMMENT ON COLUMN audit_log.previous_status IS 'Previous consent status for consent audit';
COMMENT ON COLUMN audit_log.new_status IS 'New consent status for consent audit';
COMMENT ON COLUMN audit_log.operation_type IS 'Operation type for replay audit (state_reconstruction, projection_rebuild, etc.)';
COMMENT ON COLUMN audit_log.replay_status IS 'Status for replay audit (started, in_progress, completed, failed, cancelled)';
COMMENT ON COLUMN audit_log.projection_name IS 'Projection name for replay audit entries';
COMMENT ON COLUMN audit_log.tenant_id IS 'Tenant ID for multi-tenancy in replay audit';
COMMENT ON COLUMN audit_log.parameters IS 'Parameters for replay operations';
COMMENT ON COLUMN audit_log.result IS 'Result of replay operations';
COMMENT ON COLUMN audit_log.error IS 'Error details for failed replay operations';
COMMENT ON COLUMN audit_log.progress IS 'Progress information for long-running replay operations';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- The following deprecated tables can be dropped after verification:
-- - audit_logs_deprecated
-- - consent_audit_log_deprecated
-- - replay_audit_log_deprecated
--
-- The following views provide backward compatibility:
-- - audit_logs_view (replaces audit_logs)
-- - consent_audit_log_view (replaces consent_audit_log)
-- - replay_audit_log_view (replaces replay_audit_log)
-- =============================================================================
