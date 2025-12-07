-- ============================================================================
-- MedicalCor Core - Cognitive Memory Row Level Security Policies
-- ============================================================================
-- Enables multi-tenant data isolation for episodic memory and behavioral
-- patterns to ensure HIPAA/GDPR compliance at the database level.
-- ============================================================================

-- =============================================================================
-- ADD clinic_id COLUMN FOR MULTI-TENANT ISOLATION
-- =============================================================================

-- Add clinic_id to episodic_events for direct tenant filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'episodic_events' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE episodic_events ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_episodic_events_clinic_id ON episodic_events(clinic_id)
            WHERE deleted_at IS NULL;
        COMMENT ON COLUMN episodic_events.clinic_id IS 'Clinic ID for multi-tenant data isolation (RLS)';
    END IF;
END $$;

-- Add clinic_id to behavioral_patterns for direct tenant filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'behavioral_patterns' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE behavioral_patterns ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_clinic_id ON behavioral_patterns(clinic_id);
        COMMENT ON COLUMN behavioral_patterns.clinic_id IS 'Clinic ID for multi-tenant data isolation (RLS)';
    END IF;
END $$;

-- =============================================================================
-- BACKFILL clinic_id FROM LEADS TABLE (IF DATA EXISTS)
-- =============================================================================
-- This populates clinic_id for existing episodic events by looking up the
-- subject's clinic from the leads table. Run as a one-time backfill.

DO $$
BEGIN
    -- Backfill episodic_events where subject_type = 'lead'
    UPDATE episodic_events ee
    SET clinic_id = l.clinic_id
    FROM leads l
    WHERE ee.subject_type = 'lead'
      AND ee.subject_id = l.id
      AND ee.clinic_id IS NULL
      AND l.clinic_id IS NOT NULL;

    -- Backfill behavioral_patterns where subject_type = 'lead'
    UPDATE behavioral_patterns bp
    SET clinic_id = l.clinic_id
    FROM leads l
    WHERE bp.subject_type = 'lead'
      AND bp.subject_id = l.id
      AND bp.clinic_id IS NULL
      AND l.clinic_id IS NOT NULL;
END $$;

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE episodic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (defense in depth)
ALTER TABLE episodic_events FORCE ROW LEVEL SECURITY;
ALTER TABLE behavioral_patterns FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES FOR EPISODIC_EVENTS
-- =============================================================================
-- Access patterns:
-- 1. System users (Trigger.dev workflows, admin) - full access
-- 2. Clinic users - access only their clinic's data
-- 3. API with subject context - access events for that subject

-- Policy: System and admin users have full access
DROP POLICY IF EXISTS episodic_events_system_access ON episodic_events;
CREATE POLICY episodic_events_system_access ON episodic_events FOR ALL
    USING (
        is_system_user()
        OR is_admin_user()
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Policy: Clinic users can access their clinic's events
DROP POLICY IF EXISTS episodic_events_clinic_access ON episodic_events;
CREATE POLICY episodic_events_clinic_access ON episodic_events FOR ALL
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = current_clinic_id()
    );

-- Policy: Access by subject context (for API calls with subject in context)
DROP POLICY IF EXISTS episodic_events_subject_access ON episodic_events;
CREATE POLICY episodic_events_subject_access ON episodic_events FOR SELECT
    USING (
        (
            subject_type = current_setting('app.current_subject_type', true)
            AND subject_id = NULLIF(current_setting('app.current_subject_id', true), '')::UUID
        )
        OR (
            subject_type = 'lead'
            AND subject_id IN (
                SELECT id FROM leads
                WHERE phone = current_setting('app.current_phone', true)
            )
        )
    );

-- =============================================================================
-- RLS POLICIES FOR BEHAVIORAL_PATTERNS
-- =============================================================================

-- Policy: System and admin users have full access
DROP POLICY IF EXISTS behavioral_patterns_system_access ON behavioral_patterns;
CREATE POLICY behavioral_patterns_system_access ON behavioral_patterns FOR ALL
    USING (
        is_system_user()
        OR is_admin_user()
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Policy: Clinic users can access their clinic's patterns
DROP POLICY IF EXISTS behavioral_patterns_clinic_access ON behavioral_patterns;
CREATE POLICY behavioral_patterns_clinic_access ON behavioral_patterns FOR ALL
    USING (
        clinic_id IS NOT NULL
        AND clinic_id = current_clinic_id()
    );

-- Policy: Access by subject context
DROP POLICY IF EXISTS behavioral_patterns_subject_access ON behavioral_patterns;
CREATE POLICY behavioral_patterns_subject_access ON behavioral_patterns FOR SELECT
    USING (
        (
            subject_type = current_setting('app.current_subject_type', true)
            AND subject_id = NULLIF(current_setting('app.current_subject_id', true), '')::UUID
        )
        OR (
            subject_type = 'lead'
            AND subject_id IN (
                SELECT id FROM leads
                WHERE phone = current_setting('app.current_phone', true)
            )
        )
    );

-- =============================================================================
-- GRANTS FOR APPLICATION ROLE
-- =============================================================================

-- Grant access to medicalcor_api role (created in 20240101000017_rls_policies.sql)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_api') THEN
        GRANT SELECT, INSERT, UPDATE ON episodic_events TO medicalcor_api;
        GRANT SELECT, INSERT, UPDATE ON behavioral_patterns TO medicalcor_api;
    END IF;
END $$;

-- =============================================================================
-- TRIGGER TO AUTO-POPULATE clinic_id ON INSERT
-- =============================================================================
-- Automatically sets clinic_id when inserting new episodic events if subject
-- is a lead and clinic_id is not provided.

CREATE OR REPLACE FUNCTION set_episodic_event_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If clinic_id not set and subject is a lead, look it up
    IF NEW.clinic_id IS NULL AND NEW.subject_type = 'lead' THEN
        SELECT clinic_id INTO NEW.clinic_id
        FROM leads
        WHERE id = NEW.subject_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trigger_episodic_events_set_clinic_id ON episodic_events;
CREATE TRIGGER trigger_episodic_events_set_clinic_id
    BEFORE INSERT ON episodic_events
    FOR EACH ROW
    EXECUTE FUNCTION set_episodic_event_clinic_id();

-- Same trigger for behavioral_patterns
CREATE OR REPLACE FUNCTION set_behavioral_pattern_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If clinic_id not set and subject is a lead, look it up
    IF NEW.clinic_id IS NULL AND NEW.subject_type = 'lead' THEN
        SELECT clinic_id INTO NEW.clinic_id
        FROM leads
        WHERE id = NEW.subject_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_behavioral_patterns_set_clinic_id ON behavioral_patterns;
CREATE TRIGGER trigger_behavioral_patterns_set_clinic_id
    BEFORE INSERT ON behavioral_patterns
    FOR EACH ROW
    EXECUTE FUNCTION set_behavioral_pattern_clinic_id();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY episodic_events_system_access ON episodic_events IS
    'Allow system users and admins full access to episodic events for background processing';

COMMENT ON POLICY episodic_events_clinic_access ON episodic_events IS
    'Allow clinic users to access only their clinic episodic events';

COMMENT ON POLICY episodic_events_subject_access ON episodic_events IS
    'Allow access to episodic events when subject context is set (API calls)';

COMMENT ON POLICY behavioral_patterns_system_access ON behavioral_patterns IS
    'Allow system users and admins full access to behavioral patterns';

COMMENT ON POLICY behavioral_patterns_clinic_access ON behavioral_patterns IS
    'Allow clinic users to access only their clinic behavioral patterns';

COMMENT ON POLICY behavioral_patterns_subject_access ON behavioral_patterns IS
    'Allow access to behavioral patterns when subject context is set';
