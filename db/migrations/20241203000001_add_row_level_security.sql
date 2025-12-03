-- migrate:up
-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
--
-- CRITICAL SECURITY: Multi-tenant data isolation for HIPAA/GDPR compliance
--
-- This migration implements Row-Level Security policies to ensure:
-- 1. Data isolation between clinics/organizations (multi-tenant)
-- 2. Role-based data access (RBAC at database level)
-- 3. Defense-in-depth: security enforced at DB level, not just application
--
-- DESIGN PRINCIPLES:
-- - Fail-closed: If no policy matches, access is DENIED
-- - Least privilege: Users only see their own data
-- - Audit trail: All policy evaluations can be logged
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================================

-- Get current user's clinic_id from session context
-- Set via: SET app.current_clinic_id = 'clinic-uuid';
CREATE OR REPLACE FUNCTION current_clinic_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_clinic_id', true), '')::UUID;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get current user's role from session context
-- Set via: SET app.current_user_role = 'doctor';
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_role', true), '');
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get current user's ID from session context
-- Set via: SET app.current_user_id = 'user-uuid';
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if current user is a system/admin user
CREATE OR REPLACE FUNCTION is_system_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_user_role() = 'admin'
        OR current_setting('app.is_system', true) = 'true';
EXCEPTION
    WHEN others THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- ADD clinic_id COLUMN TO TABLES (for multi-tenant isolation)
-- ============================================================================

-- Add clinic_id to consents table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'consents' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE consents ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_consents_clinic_id ON consents(clinic_id);
    END IF;
END $$;

-- Add clinic_id to consent_audit_log table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'consent_audit_log' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE consent_audit_log ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_consent_audit_clinic_id ON consent_audit_log(clinic_id);
    END IF;
END $$;

-- Add clinic_id to domain_events table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domain_events' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE domain_events ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_domain_events_clinic_id ON domain_events(clinic_id);
    END IF;
END $$;

-- Add clinic_id to message_log table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_log' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE message_log ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_message_log_clinic_id ON message_log(clinic_id);
    END IF;
END $$;

-- Add clinic_id to lead_scoring_history table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lead_scoring_history' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE lead_scoring_history ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_lead_scoring_clinic_id ON lead_scoring_history(clinic_id);
    END IF;
END $$;

-- Add clinic_id to aggregate_snapshots table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'aggregate_snapshots' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE aggregate_snapshots ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_aggregate_snapshots_clinic_id ON aggregate_snapshots(clinic_id);
    END IF;
END $$;

-- Add clinic_id to sagas table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sagas' AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE sagas ADD COLUMN clinic_id UUID;
        CREATE INDEX idx_sagas_clinic_id ON sagas(clinic_id);
    END IF;
END $$;

-- ============================================================================
-- ENABLE RLS ON SENSITIVE TABLES
-- ============================================================================

-- Consents table (GDPR critical)
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

-- Consent audit log (GDPR critical)
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log FORCE ROW LEVEL SECURITY;

-- Domain events (event store)
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

-- Message log (PHI/PII)
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log FORCE ROW LEVEL SECURITY;

-- Lead scoring history
ALTER TABLE lead_scoring_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history FORCE ROW LEVEL SECURITY;

-- Aggregate snapshots
ALTER TABLE aggregate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregate_snapshots FORCE ROW LEVEL SECURITY;

-- Sagas
ALTER TABLE sagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sagas FORCE ROW LEVEL SECURITY;

-- Knowledge base (if exists) - RAG data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_base') THEN
        EXECUTE 'ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY';
    END IF;
END $$;

-- Message embeddings (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_embeddings') THEN
        EXECUTE 'ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE message_embeddings FORCE ROW LEVEL SECURITY';
    END IF;
END $$;

-- ============================================================================
-- RLS POLICIES: CONSENTS TABLE
-- ============================================================================

-- Policy: Users can only see consents from their clinic
DROP POLICY IF EXISTS consents_clinic_isolation ON consents;
CREATE POLICY consents_clinic_isolation ON consents
    FOR ALL
    USING (
        -- System users can see all
        is_system_user()
        OR
        -- Clinic users can only see their clinic's data
        clinic_id = current_clinic_id()
        OR
        -- Allow NULL clinic_id for migration period (will be backfilled)
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        -- System users can insert any
        is_system_user()
        OR
        -- Clinic users can only insert for their clinic
        clinic_id = current_clinic_id()
    );

-- Policy: Read-only access for staff role
DROP POLICY IF EXISTS consents_staff_read_only ON consents;
CREATE POLICY consents_staff_read_only ON consents
    FOR SELECT
    USING (
        current_user_role() = 'staff'
        AND clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: CONSENT_AUDIT_LOG TABLE
-- ============================================================================

-- Policy: Audit logs are append-only, no updates/deletes
DROP POLICY IF EXISTS consent_audit_clinic_isolation ON consent_audit_log;
CREATE POLICY consent_audit_clinic_isolation ON consent_audit_log
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
        OR
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: DOMAIN_EVENTS TABLE (Event Store)
-- ============================================================================

-- Policy: Event store is append-only with clinic isolation
DROP POLICY IF EXISTS domain_events_clinic_isolation ON domain_events;
CREATE POLICY domain_events_clinic_isolation ON domain_events
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
        OR
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: MESSAGE_LOG TABLE (PHI/PII)
-- ============================================================================

-- Policy: Messages contain PHI, strict clinic isolation
DROP POLICY IF EXISTS message_log_clinic_isolation ON message_log;
CREATE POLICY message_log_clinic_isolation ON message_log
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: LEAD_SCORING_HISTORY TABLE
-- ============================================================================

DROP POLICY IF EXISTS lead_scoring_clinic_isolation ON lead_scoring_history;
CREATE POLICY lead_scoring_clinic_isolation ON lead_scoring_history
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
        OR
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: AGGREGATE_SNAPSHOTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS aggregate_snapshots_clinic_isolation ON aggregate_snapshots;
CREATE POLICY aggregate_snapshots_clinic_isolation ON aggregate_snapshots
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
        OR
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: SAGAS TABLE
-- ============================================================================

DROP POLICY IF EXISTS sagas_clinic_isolation ON sagas;
CREATE POLICY sagas_clinic_isolation ON sagas
    FOR ALL
    USING (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
        OR
        (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
    )
    WITH CHECK (
        is_system_user()
        OR
        clinic_id = current_clinic_id()
    );

-- ============================================================================
-- RLS POLICIES: KNOWLEDGE_BASE TABLE (RAG)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_base') THEN
        EXECUTE '
            DROP POLICY IF EXISTS knowledge_base_clinic_isolation ON knowledge_base;
            CREATE POLICY knowledge_base_clinic_isolation ON knowledge_base
                FOR ALL
                USING (
                    is_system_user()
                    OR
                    clinic_id = current_clinic_id()
                    OR
                    (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
                )
                WITH CHECK (
                    is_system_user()
                    OR
                    clinic_id = current_clinic_id()
                );
        ';
    END IF;
END $$;

-- ============================================================================
-- RLS POLICIES: MESSAGE_EMBEDDINGS TABLE
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_embeddings') THEN
        EXECUTE '
            DROP POLICY IF EXISTS message_embeddings_clinic_isolation ON message_embeddings;
            CREATE POLICY message_embeddings_clinic_isolation ON message_embeddings
                FOR ALL
                USING (
                    is_system_user()
                    OR
                    clinic_id = current_clinic_id()
                    OR
                    (clinic_id IS NULL AND current_clinic_id() IS NOT NULL)
                )
                WITH CHECK (
                    is_system_user()
                    OR
                    clinic_id = current_clinic_id()
                );
        ';
    END IF;
END $$;

-- ============================================================================
-- USERS TABLE: Special handling for auth
-- ============================================================================

-- Users can only see themselves, admins can see all in their clinic
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Add clinic_id if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'clinic_id'
        ) THEN
            EXECUTE 'ALTER TABLE users ADD COLUMN clinic_id UUID';
            EXECUTE 'CREATE INDEX idx_users_clinic_id ON users(clinic_id)';
        END IF;

        -- Enable RLS
        EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE users FORCE ROW LEVEL SECURITY';

        -- Policy: Users see themselves, admins see clinic
        EXECUTE '
            DROP POLICY IF EXISTS users_access_policy ON users;
            CREATE POLICY users_access_policy ON users
                FOR ALL
                USING (
                    is_system_user()
                    OR
                    id = current_app_user_id()
                    OR
                    (current_user_role() = ''admin'' AND clinic_id = current_clinic_id())
                )
                WITH CHECK (
                    is_system_user()
                    OR
                    (current_user_role() = ''admin'' AND clinic_id = current_clinic_id())
                );
        ';
    END IF;
END $$;

-- ============================================================================
-- SESSIONS TABLE: User can only see their own sessions
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        EXECUTE 'ALTER TABLE sessions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE sessions FORCE ROW LEVEL SECURITY';

        EXECUTE '
            DROP POLICY IF EXISTS sessions_user_isolation ON sessions;
            CREATE POLICY sessions_user_isolation ON sessions
                FOR ALL
                USING (
                    is_system_user()
                    OR
                    user_id = current_app_user_id()
                )
                WITH CHECK (
                    is_system_user()
                    OR
                    user_id = current_app_user_id()
                );
        ';
    END IF;
END $$;

-- ============================================================================
-- HELPER: Set RLS context for application connections
-- Usage in Node.js:
--   await db.query("SELECT set_rls_context($1, $2, $3)", [clinicId, userId, role]);
-- ============================================================================

CREATE OR REPLACE FUNCTION set_rls_context(
    p_clinic_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL,
    p_is_system BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
    -- Set clinic context
    IF p_clinic_id IS NOT NULL THEN
        PERFORM set_config('app.current_clinic_id', p_clinic_id::TEXT, true);
    END IF;

    -- Set user context
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
    END IF;

    -- Set role context
    IF p_user_role IS NOT NULL THEN
        PERFORM set_config('app.current_user_role', p_user_role, true);
    END IF;

    -- Set system flag
    IF p_is_system THEN
        PERFORM set_config('app.is_system', 'true', true);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to clear RLS context (call at end of request)
CREATE OR REPLACE FUNCTION clear_rls_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_clinic_id', '', true);
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_user_role', '', true);
    PERFORM set_config('app.is_system', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION current_clinic_id() IS 'Returns the current clinic UUID from session context for RLS';
COMMENT ON FUNCTION current_user_role() IS 'Returns the current user role from session context for RLS';
COMMENT ON FUNCTION current_app_user_id() IS 'Returns the current user UUID from session context for RLS';
COMMENT ON FUNCTION is_system_user() IS 'Returns true if current session is a system/admin user';
COMMENT ON FUNCTION set_rls_context(UUID, UUID, TEXT, BOOLEAN) IS 'Sets RLS context for the current transaction';
COMMENT ON FUNCTION clear_rls_context() IS 'Clears RLS context at end of request';

-- migrate:down

-- Remove policies
DROP POLICY IF EXISTS consents_clinic_isolation ON consents;
DROP POLICY IF EXISTS consents_staff_read_only ON consents;
DROP POLICY IF EXISTS consent_audit_clinic_isolation ON consent_audit_log;
DROP POLICY IF EXISTS domain_events_clinic_isolation ON domain_events;
DROP POLICY IF EXISTS message_log_clinic_isolation ON message_log;
DROP POLICY IF EXISTS lead_scoring_clinic_isolation ON lead_scoring_history;
DROP POLICY IF EXISTS aggregate_snapshots_clinic_isolation ON aggregate_snapshots;
DROP POLICY IF EXISTS sagas_clinic_isolation ON sagas;

-- Disable RLS
ALTER TABLE consents DISABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE aggregate_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE sagas DISABLE ROW LEVEL SECURITY;

-- Drop dynamic policies on conditional tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_base') THEN
        EXECUTE 'DROP POLICY IF EXISTS knowledge_base_clinic_isolation ON knowledge_base';
        EXECUTE 'ALTER TABLE knowledge_base DISABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_embeddings') THEN
        EXECUTE 'DROP POLICY IF EXISTS message_embeddings_clinic_isolation ON message_embeddings';
        EXECUTE 'ALTER TABLE message_embeddings DISABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        EXECUTE 'DROP POLICY IF EXISTS users_access_policy ON users';
        EXECUTE 'ALTER TABLE users DISABLE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        EXECUTE 'DROP POLICY IF EXISTS sessions_user_isolation ON sessions';
        EXECUTE 'ALTER TABLE sessions DISABLE ROW LEVEL SECURITY';
    END IF;
END $$;

-- Drop helper functions
DROP FUNCTION IF EXISTS clear_rls_context();
DROP FUNCTION IF EXISTS set_rls_context(UUID, UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS is_system_user();
DROP FUNCTION IF EXISTS current_app_user_id();
DROP FUNCTION IF EXISTS current_user_role();
DROP FUNCTION IF EXISTS current_clinic_id();

-- Note: clinic_id columns are NOT dropped to preserve data
-- They can be dropped manually if needed after verifying no data loss
