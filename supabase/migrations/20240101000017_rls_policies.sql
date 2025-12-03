-- ============================================================================
-- MedicalCor Core - Row Level Security Policies
-- ============================================================================
-- Source: db/migrations/20241203000001_add_row_level_security.sql
-- + infra/migrations/005-security-rls.sql (MERGED)
-- Multi-tenant data isolation for HIPAA/GDPR compliance
-- ============================================================================

-- =============================================================================
-- HELPER FUNCTIONS FOR RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION current_clinic_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_clinic_id', true), '')::UUID;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_role', true), '');
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_system_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_user_role() = 'admin' OR current_setting('app.is_system', true) = 'true';
EXCEPTION WHEN others THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.is_admin', true) = 'true';
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- ADD clinic_id COLUMN TO TABLES (for multi-tenant isolation)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'consents' AND column_name = 'clinic_id') THEN
        ALTER TABLE consents ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_consents_clinic_id ON consents(clinic_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'consent_audit_log' AND column_name = 'clinic_id') THEN
        ALTER TABLE consent_audit_log ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_consent_audit_clinic_id ON consent_audit_log(clinic_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'domain_events' AND column_name = 'clinic_id') THEN
        ALTER TABLE domain_events ADD COLUMN clinic_id UUID;
        CREATE INDEX IF NOT EXISTS idx_domain_events_clinic_id ON domain_events(clinic_id);
    END IF;
END $$;

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_data_access_log ENABLE ROW LEVEL SECURITY;

-- Force RLS for all roles
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE message_log FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- CREATE APPLICATION ROLES
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medicalcor_api') THEN
        CREATE ROLE medicalcor_api;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_app') THEN
        CREATE ROLE medicalcor_app;
    END IF;
END $$;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Users policies
DROP POLICY IF EXISTS users_access_policy ON users;
CREATE POLICY users_access_policy ON users FOR SELECT
    USING (is_admin_user() OR id = current_user_id() OR clinic_id = current_clinic_id());

DROP POLICY IF EXISTS users_update_policy ON users;
CREATE POLICY users_update_policy ON users FOR UPDATE
    USING (is_admin_user() OR id = current_user_id());

-- Sessions policies
DROP POLICY IF EXISTS sessions_user_policy ON sessions;
CREATE POLICY sessions_user_policy ON sessions FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

-- MFA policies
DROP POLICY IF EXISTS mfa_secrets_user_policy ON mfa_secrets;
CREATE POLICY mfa_secrets_user_policy ON mfa_secrets FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

DROP POLICY IF EXISTS mfa_backup_codes_user_policy ON mfa_backup_codes;
CREATE POLICY mfa_backup_codes_user_policy ON mfa_backup_codes FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

-- Consent records policies
DROP POLICY IF EXISTS consent_records_access_policy ON consent_records;
CREATE POLICY consent_records_access_policy ON consent_records FOR ALL
    USING (is_admin_user() OR phone = current_setting('app.current_phone', true) OR current_user_id() IS NOT NULL);

-- Consents policies
DROP POLICY IF EXISTS consents_access_policy ON consents;
CREATE POLICY consents_access_policy ON consents FOR ALL TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR contact_id = current_setting('app.current_contact_id', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Consent audit log policies
DROP POLICY IF EXISTS consent_audit_access_policy ON consent_audit_log;
CREATE POLICY consent_audit_access_policy ON consent_audit_log FOR ALL TO medicalcor_api
    USING (
        consent_id IN (
            SELECT id FROM consents
            WHERE phone = current_setting('app.current_phone', true)
               OR contact_id = current_setting('app.current_contact_id', true)
        )
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Message log policies
DROP POLICY IF EXISTS message_log_access_policy ON message_log;
CREATE POLICY message_log_access_policy ON message_log FOR ALL TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR correlation_id = current_setting('app.current_correlation_id', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Lead scoring policies
DROP POLICY IF EXISTS lead_scoring_access_policy ON lead_scoring_history;
CREATE POLICY lead_scoring_access_policy ON lead_scoring_history FOR ALL TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Encrypted data policies
DROP POLICY IF EXISTS encrypted_data_access_policy ON encrypted_data;
CREATE POLICY encrypted_data_access_policy ON encrypted_data FOR ALL
    USING (is_admin_user() OR (entity_type = 'user' AND entity_id = current_user_id()));

-- Sensitive access log policies
DROP POLICY IF EXISTS sensitive_log_admin_policy ON sensitive_data_access_log;
CREATE POLICY sensitive_log_admin_policy ON sensitive_data_access_log FOR SELECT
    USING (is_admin_user() OR user_id = current_user_id());

DROP POLICY IF EXISTS sensitive_log_insert_policy ON sensitive_data_access_log;
CREATE POLICY sensitive_log_insert_policy ON sensitive_data_access_log FOR INSERT
    WITH CHECK (user_id = current_user_id() OR is_admin_user());

-- =============================================================================
-- CONSENT EXPIRY ENFORCEMENT
-- =============================================================================
CREATE OR REPLACE FUNCTION expire_consents()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE consents SET status = 'expired', updated_at = NOW()
        WHERE status = 'granted' AND expires_at IS NOT NULL AND expires_at <= NOW()
        RETURNING id, contact_id, consent_type
    ),
    logged AS (
        INSERT INTO consent_audit_log (id, consent_id, action, previous_status, new_status, performed_by, reason, timestamp)
        SELECT uuid_generate_v4()::VARCHAR(50), id, 'expired', 'granted', 'expired', 'system',
            'Automatic expiration based on expires_at timestamp', NOW()
        FROM expired
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM logged;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO medicalcor_api;
GRANT SELECT, INSERT, UPDATE ON consent_records TO medicalcor_api;
GRANT SELECT, INSERT, UPDATE ON consents TO medicalcor_api;
GRANT SELECT, INSERT ON consent_audit_log TO medicalcor_api;
GRANT SELECT, INSERT ON message_log TO medicalcor_api;
GRANT SELECT, INSERT ON lead_scoring_history TO medicalcor_api;
GRANT SELECT, INSERT ON pii_access_log TO medicalcor_api;
GRANT SELECT, INSERT ON domain_events TO medicalcor_api;
GRANT EXECUTE ON FUNCTION expire_consents TO medicalcor_api;
GRANT EXECUTE ON FUNCTION log_pii_access TO medicalcor_api;
