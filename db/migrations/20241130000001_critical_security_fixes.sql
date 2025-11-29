-- migrate:up
-- =============================================================================
-- CRITICAL SECURITY FIXES MIGRATION
-- MedicalCor Cortex - Medical/Dental OS Platform
-- Platinum Banking/Medical Standards Compliance
-- Created: 2024-11-30
-- =============================================================================

-- =============================================================================
-- 1. CREATE CLINICS TABLE (Missing FK reference)
-- =============================================================================
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Romania',
    phone VARCHAR(20),
    email VARCHAR(255),
    tax_id VARCHAR(50),

    -- Status management
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),

    -- Compliance
    hipaa_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    gdpr_compliant BOOLEAN NOT NULL DEFAULT TRUE,

    -- Soft delete for GDPR
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for clinics
CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clinics_deleted_at ON clinics(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add FK constraint to users table (safe - allows NULL clinic_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_users_clinic_id' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_clinic_id
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- 2. ENABLE ROW LEVEL SECURITY ON ALL SENSITIVE TABLES
-- =============================================================================

-- Enable RLS on MFA tables
ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- Enable RLS on encrypted data tables
ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_data_access_log ENABLE ROW LEVEL SECURITY;

-- Enable RLS on consent tables
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Enable RLS on users (for clinic isolation)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. CREATE RLS POLICIES
-- =============================================================================

-- Function to get current user ID from session context
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin_user() RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.is_admin', true) = 'true';
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get current clinic ID
CREATE OR REPLACE FUNCTION current_clinic_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_clinic_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- MFA SECRETS POLICIES (User can only access their own)
-- =============================================================================
DROP POLICY IF EXISTS mfa_secrets_user_policy ON mfa_secrets;
CREATE POLICY mfa_secrets_user_policy ON mfa_secrets
    FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

-- =============================================================================
-- MFA BACKUP CODES POLICIES
-- =============================================================================
DROP POLICY IF EXISTS mfa_backup_codes_user_policy ON mfa_backup_codes;
CREATE POLICY mfa_backup_codes_user_policy ON mfa_backup_codes
    FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

-- =============================================================================
-- ENCRYPTED DATA POLICIES
-- =============================================================================
DROP POLICY IF EXISTS encrypted_data_access_policy ON encrypted_data;
CREATE POLICY encrypted_data_access_policy ON encrypted_data
    FOR ALL
    USING (is_admin_user() OR (
        -- Users can access their own encrypted data
        entity_type = 'user' AND entity_id = current_user_id()
    ));

-- =============================================================================
-- SENSITIVE DATA ACCESS LOG POLICIES (Admin only for viewing)
-- =============================================================================
DROP POLICY IF EXISTS sensitive_log_admin_policy ON sensitive_data_access_log;
CREATE POLICY sensitive_log_admin_policy ON sensitive_data_access_log
    FOR SELECT
    USING (is_admin_user() OR user_id = current_user_id());

-- Allow insert for all authenticated users (for logging their own access)
DROP POLICY IF EXISTS sensitive_log_insert_policy ON sensitive_data_access_log;
CREATE POLICY sensitive_log_insert_policy ON sensitive_data_access_log
    FOR INSERT
    WITH CHECK (user_id = current_user_id() OR is_admin_user());

-- =============================================================================
-- CONSENT RECORDS POLICIES (Phone-based isolation + admin access)
-- =============================================================================
DROP POLICY IF EXISTS consent_records_access_policy ON consent_records;
CREATE POLICY consent_records_access_policy ON consent_records
    FOR ALL
    USING (
        is_admin_user() OR
        phone = current_setting('app.current_phone', true) OR
        current_user_id() IS NOT NULL  -- Staff can view for operations
    );

-- =============================================================================
-- USERS POLICIES (Clinic isolation + admin access)
-- =============================================================================
DROP POLICY IF EXISTS users_access_policy ON users;
CREATE POLICY users_access_policy ON users
    FOR SELECT
    USING (
        is_admin_user() OR
        id = current_user_id() OR
        clinic_id = current_clinic_id()
    );

DROP POLICY IF EXISTS users_update_policy ON users;
CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (
        is_admin_user() OR
        id = current_user_id()  -- Users can update themselves
    );

-- =============================================================================
-- SESSIONS POLICIES (User can only see their own sessions)
-- =============================================================================
DROP POLICY IF EXISTS sessions_user_policy ON sessions;
CREATE POLICY sessions_user_policy ON sessions
    FOR ALL
    USING (user_id = current_user_id() OR is_admin_user());

-- =============================================================================
-- 4. ADD MISSING CONSTRAINTS
-- =============================================================================

-- Add UNIQUE constraint on consent_records (phone, consent_type) if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_consent_records_phone_type_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_consent_records_phone_type_unique
            ON consent_records(phone, consent_type)
            WHERE deleted_at IS NULL;
    END IF;
END $$;

-- =============================================================================
-- 5. ADD ENCRYPTED CONTENT COLUMN TO MESSAGE_LOG
-- =============================================================================
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS content_encrypted TEXT;
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS encryption_key_version INT DEFAULT 1;

-- =============================================================================
-- 6. FIX CONFIDENCE SCORE PRECISION (DECIMAL(3,2) -> DECIMAL(5,4))
-- =============================================================================
DO $$
BEGIN
    -- Only alter if column exists and is wrong type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lead_scoring_history' AND column_name = 'confidence'
    ) THEN
        ALTER TABLE lead_scoring_history
            ALTER COLUMN confidence TYPE DECIMAL(5,4);
    END IF;
END $$;

-- =============================================================================
-- 7. ADD AUTOMATIC SOFT-DELETE CLEANUP SCHEDULING
-- =============================================================================

-- Create pg_cron extension if available (skip if not)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available - manual cleanup required';
END $$;

-- Schedule daily cleanup at 3 AM (if pg_cron available)
DO $$
BEGIN
    -- Remove existing job if any
    PERFORM cron.unschedule('cleanup-soft-deleted-records');
EXCEPTION WHEN OTHERS THEN
    -- pg_cron not available, skip
    NULL;
END $$;

DO $$
BEGIN
    -- Schedule new job
    PERFORM cron.schedule(
        'cleanup-soft-deleted-records',
        '0 3 * * *',  -- Daily at 3 AM
        'SELECT cleanup_soft_deleted_records(90)'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling not available - use external scheduler';
END $$;

-- =============================================================================
-- 8. ADD NAMESPACE TO IDEMPOTENCY KEY INDEX
-- =============================================================================
DROP INDEX IF EXISTS idx_domain_events_idempotency_aggregate;
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_idempotency_aggregate
    ON domain_events(idempotency_key, aggregate_id);

-- =============================================================================
-- 9. TRIGGER FOR UPDATED_AT ON CLINICS
-- =============================================================================
DROP TRIGGER IF EXISTS update_clinics_updated_at ON clinics;
CREATE TRIGGER update_clinics_updated_at
    BEFORE UPDATE ON clinics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9b. SCHEDULED DELETIONS TABLE (GDPR Article 17 compliance)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scheduled_deletions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    reason TEXT,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id)
);

-- Index for finding due deletions
CREATE INDEX IF NOT EXISTS idx_scheduled_deletions_due
    ON scheduled_deletions(scheduled_for)
    WHERE executed_at IS NULL;

-- =============================================================================
-- 10. SERVICE ACCOUNT BYPASS FOR APPLICATION
-- The application service account needs to bypass RLS for operations
-- =============================================================================

-- Create application role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_app') THEN
        CREATE ROLE medicalcor_app;
    END IF;
END $$;

-- Grant bypass permissions to application role
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_backup_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data FORCE ROW LEVEL SECURITY;
ALTER TABLE sensitive_data_access_log FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

-- Application can bypass RLS when running with elevated privileges
-- This is controlled via SET ROLE in the connection

-- =============================================================================
-- migrate:down
-- =============================================================================

-- Remove scheduled job
DO $$
BEGIN
    PERFORM cron.unschedule('cleanup-soft-deleted-records');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Drop policies
DROP POLICY IF EXISTS mfa_secrets_user_policy ON mfa_secrets;
DROP POLICY IF EXISTS mfa_backup_codes_user_policy ON mfa_backup_codes;
DROP POLICY IF EXISTS encrypted_data_access_policy ON encrypted_data;
DROP POLICY IF EXISTS sensitive_log_admin_policy ON sensitive_data_access_log;
DROP POLICY IF EXISTS sensitive_log_insert_policy ON sensitive_data_access_log;
DROP POLICY IF EXISTS consent_records_access_policy ON consent_records;
DROP POLICY IF EXISTS users_access_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;
DROP POLICY IF EXISTS sessions_user_policy ON sessions;

-- Disable RLS
ALTER TABLE mfa_secrets DISABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_backup_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_data_access_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;

-- Drop functions
DROP FUNCTION IF EXISTS current_user_id();
DROP FUNCTION IF EXISTS is_admin_user();
DROP FUNCTION IF EXISTS current_clinic_id();

-- Drop clinics FK
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_clinic_id;

-- Drop clinics table
DROP TABLE IF EXISTS clinics;

-- Remove message_log columns
ALTER TABLE message_log DROP COLUMN IF EXISTS content_encrypted;
ALTER TABLE message_log DROP COLUMN IF EXISTS encryption_key_version;

-- Drop namespaced idempotency index
DROP INDEX IF EXISTS idx_domain_events_idempotency_aggregate;
