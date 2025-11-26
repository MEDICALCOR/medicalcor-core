-- =============================================================================
-- Row-Level Security (RLS) Implementation
-- Multi-tenant data isolation for GDPR/HIPAA compliance
-- =============================================================================

-- =============================================================================
-- Clinic/Tenant Management
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    external_id VARCHAR(100) UNIQUE, -- HubSpot company ID or similar
    settings JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (links to auth system)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    clinic_id UUID REFERENCES clinics(id),
    role VARCHAR(50) NOT NULL DEFAULT 'staff',
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT role_check CHECK (role IN ('admin', 'doctor', 'receptionist', 'staff', 'super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================================================
-- Add Clinic References to Existing Tables
-- =============================================================================

-- Add clinic_id to consent_records
ALTER TABLE consent_records
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Add clinic_id to message_log
ALTER TABLE message_log
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Add clinic_id to lead_scoring_history
ALTER TABLE lead_scoring_history
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Add clinic_id to domain_events
ALTER TABLE domain_events
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Create indexes for clinic_id columns
CREATE INDEX IF NOT EXISTS idx_consent_records_clinic ON consent_records(clinic_id);
CREATE INDEX IF NOT EXISTS idx_message_log_clinic ON message_log(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_clinic ON lead_scoring_history(clinic_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_clinic ON domain_events(clinic_id);

-- =============================================================================
-- Application Roles for RLS
-- =============================================================================

-- Create roles if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_app') THEN
        CREATE ROLE medicalcor_app;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_admin') THEN
        CREATE ROLE medicalcor_admin;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medicalcor_readonly') THEN
        CREATE ROLE medicalcor_readonly;
    END IF;
END
$$;

-- Grant basic permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO medicalcor_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medicalcor_readonly;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medicalcor_admin;

-- =============================================================================
-- Session Context Functions
-- These functions set/get the current user's context for RLS
-- =============================================================================

-- Function to set current user context (called at start of each request)
CREATE OR REPLACE FUNCTION set_user_context(
    p_user_id UUID,
    p_clinic_id UUID,
    p_role VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
    -- Store user context in session variables
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, FALSE);
    PERFORM set_config('app.current_clinic_id', p_clinic_id::TEXT, FALSE);
    PERFORM set_config('app.current_role', p_role, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current clinic ID from context
CREATE OR REPLACE FUNCTION get_current_clinic_id() RETURNS UUID AS $$
DECLARE
    v_clinic_id TEXT;
BEGIN
    v_clinic_id := current_setting('app.current_clinic_id', TRUE);
    IF v_clinic_id IS NULL OR v_clinic_id = '' THEN
        RETURN NULL;
    END IF;
    RETURN v_clinic_id::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get current user role
CREATE OR REPLACE FUNCTION get_current_role() RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN current_setting('app.current_role', TRUE);
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_current_role() = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- Enable Row-Level Security on Tables
-- =============================================================================

-- Enable RLS on consent_records
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see records from their clinic
CREATE POLICY consent_records_clinic_isolation ON consent_records
    FOR ALL
    USING (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    )
    WITH CHECK (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    );

-- Enable RLS on message_log
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_log_clinic_isolation ON message_log
    FOR ALL
    USING (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    )
    WITH CHECK (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    );

-- Enable RLS on lead_scoring_history
ALTER TABLE lead_scoring_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_scoring_clinic_isolation ON lead_scoring_history
    FOR ALL
    USING (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    )
    WITH CHECK (
        is_super_admin() OR
        clinic_id = get_current_clinic_id()
    );

-- Enable RLS on domain_events
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY domain_events_clinic_isolation ON domain_events
    FOR ALL
    USING (
        is_super_admin() OR
        clinic_id IS NULL OR  -- System events without clinic context
        clinic_id = get_current_clinic_id()
    )
    WITH CHECK (
        is_super_admin() OR
        clinic_id IS NULL OR
        clinic_id = get_current_clinic_id()
    );

-- =============================================================================
-- Role-Based Policies for Sensitive Operations
-- =============================================================================

-- Consent records: Only doctors and admins can modify
CREATE POLICY consent_records_modify ON consent_records
    FOR UPDATE
    USING (
        is_super_admin() OR
        get_current_role() IN ('admin', 'doctor')
    );

-- Lead scoring: Staff cannot delete historical scores
CREATE POLICY lead_scoring_no_staff_delete ON lead_scoring_history
    FOR DELETE
    USING (
        get_current_role() != 'staff' OR
        is_super_admin()
    );

-- =============================================================================
-- PII Access Policies
-- =============================================================================

-- Policy for accessing encrypted PII columns
-- Only specific roles can decrypt PII
CREATE OR REPLACE FUNCTION can_access_pii() RETURNS BOOLEAN AS $$
BEGIN
    -- Super admins and doctors can access PII
    -- Receptionists can access for scheduling purposes
    RETURN get_current_role() IN ('super_admin', 'admin', 'doctor', 'receptionist');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- Audit Policy Enforcement
-- =============================================================================

-- Table to track policy violations
CREATE TABLE IF NOT EXISTS rls_violation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    clinic_id UUID,
    attempted_clinic_id UUID,
    table_name VARCHAR(100),
    operation VARCHAR(20),
    violation_type VARCHAR(50),
    details JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to log RLS violations (called from application on policy check failures)
CREATE OR REPLACE FUNCTION log_rls_violation(
    p_user_id UUID,
    p_clinic_id UUID,
    p_attempted_clinic_id UUID,
    p_table_name VARCHAR(100),
    p_operation VARCHAR(20),
    p_violation_type VARCHAR(50),
    p_details JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO rls_violation_log (
        user_id,
        clinic_id,
        attempted_clinic_id,
        table_name,
        operation,
        violation_type,
        details
    ) VALUES (
        p_user_id,
        p_clinic_id,
        p_attempted_clinic_id,
        p_table_name,
        p_operation,
        p_violation_type,
        p_details
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Force RLS for Application Roles
-- =============================================================================

-- Force RLS even for table owners (except super admins)
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
ALTER TABLE message_log FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history FORCE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON FUNCTION set_user_context IS 'Sets the current user context for RLS. Must be called at the start of each database session.';
COMMENT ON FUNCTION get_current_clinic_id IS 'Returns the clinic ID from the current session context for RLS policies.';
COMMENT ON TABLE rls_violation_log IS 'Audit log of RLS policy violation attempts for security monitoring.';
COMMENT ON POLICY consent_records_clinic_isolation ON consent_records IS 'Ensures users can only access consent records from their own clinic.';
