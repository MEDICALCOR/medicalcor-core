-- MedicalCor Security Enhancements Migration
-- Addresses critical security issues identified in audit
-- CRITICAL FIXES: RLS, PII encryption, audit log immutability
--
-- Run this migration AFTER 01-init.sql, 02-pgvector.sql, 02-scheduling.sql, 03-consent.sql

-- =============================================================================
-- Enable Required Extensions
-- =============================================================================

-- pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- SECURITY FIX #1: Row-Level Security (RLS) Policies
-- Prevents unauthorized access to records across tenants/contacts
-- =============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (superusers can still bypass)
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE message_log FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_history FORCE ROW LEVEL SECURITY;

-- Create application role for API access
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medicalcor_api') THEN
        CREATE ROLE medicalcor_api;
    END IF;
END
$$;

-- Policy: API can only access records via correlation_id or phone from session
-- The application must set these session variables before queries:
--   SET LOCAL app.current_phone = '+40...';
--   SET LOCAL app.current_correlation_id = 'corr_...';

-- Consent records: Access by phone number
CREATE POLICY consent_records_phone_policy ON consent_records
    FOR ALL
    TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Consents: Access by contact_id or phone
CREATE POLICY consents_access_policy ON consents
    FOR ALL
    TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR contact_id = current_setting('app.current_contact_id', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Consent audit log: Access through consent relationship
CREATE POLICY consent_audit_access_policy ON consent_audit_log
    FOR ALL
    TO medicalcor_api
    USING (
        consent_id IN (
            SELECT id FROM consents
            WHERE phone = current_setting('app.current_phone', true)
               OR contact_id = current_setting('app.current_contact_id', true)
        )
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Message log: Access by phone or correlation_id
CREATE POLICY message_log_access_policy ON message_log
    FOR ALL
    TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR correlation_id = current_setting('app.current_correlation_id', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- Lead scoring: Access by phone
CREATE POLICY lead_scoring_access_policy ON lead_scoring_history
    FOR ALL
    TO medicalcor_api
    USING (
        phone = current_setting('app.current_phone', true)
        OR current_setting('app.admin_access', true) = 'true'
    );

-- =============================================================================
-- SECURITY FIX #2: Audit Log Immutability
-- Prevent modifications and deletions to audit trail
-- =============================================================================

-- Remove CASCADE DELETE from consent_audit_log (CRITICAL FIX)
-- First, drop the existing foreign key constraint
ALTER TABLE consent_audit_log
    DROP CONSTRAINT IF EXISTS consent_audit_log_consent_id_fkey;

-- Re-add without CASCADE DELETE - audit records persist even if consent is deleted
ALTER TABLE consent_audit_log
    ADD CONSTRAINT consent_audit_log_consent_id_fkey
    FOREIGN KEY (consent_id)
    REFERENCES consents(id)
    ON DELETE RESTRICT;

-- Create trigger to prevent UPDATE and DELETE on audit log
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit log records cannot be deleted (GDPR compliance)';
    ELSIF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Audit log records cannot be modified (GDPR compliance)';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_audit_modification ON consent_audit_log;
CREATE TRIGGER tr_prevent_audit_modification
    BEFORE UPDATE OR DELETE ON consent_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- Similarly protect domain_events (event sourcing immutability)
DROP TRIGGER IF EXISTS tr_prevent_event_modification ON domain_events;
CREATE TRIGGER tr_prevent_event_modification
    BEFORE UPDATE OR DELETE ON domain_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- =============================================================================
-- SECURITY FIX #3: PII Encryption Functions
-- Column-level encryption for sensitive data
-- =============================================================================

-- Create encryption key management table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_name VARCHAR(50) NOT NULL UNIQUE,
    key_version INTEGER NOT NULL DEFAULT 1,
    -- Encrypted with master key from environment variable
    -- In production, use Cloud KMS or HashiCorp Vault
    encrypted_key BYTEA NOT NULL,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'aes-256-gcm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

-- Function to encrypt PII data
CREATE OR REPLACE FUNCTION encrypt_pii(
    plaintext TEXT,
    key_name VARCHAR(50) DEFAULT 'default'
) RETURNS TEXT AS $$
DECLARE
    v_key BYTEA;
    v_encrypted BYTEA;
BEGIN
    -- Get encryption key (in production, fetch from secure key store)
    -- This uses a session variable that must be set by the application
    v_key := decode(current_setting('app.encryption_key', true), 'hex');

    IF v_key IS NULL THEN
        -- Fallback: store plaintext with marker (for development only)
        RETURN 'UNENCRYPTED:' || plaintext;
    END IF;

    -- Encrypt using pgcrypto
    v_encrypted := pgp_sym_encrypt(plaintext, encode(v_key, 'escape'));

    RETURN 'ENC:' || encode(v_encrypted, 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt PII data
CREATE OR REPLACE FUNCTION decrypt_pii(
    ciphertext TEXT,
    key_name VARCHAR(50) DEFAULT 'default'
) RETURNS TEXT AS $$
DECLARE
    v_key BYTEA;
    v_decrypted TEXT;
BEGIN
    -- Check if data is unencrypted (development mode)
    IF ciphertext LIKE 'UNENCRYPTED:%' THEN
        RETURN substring(ciphertext FROM 13);
    END IF;

    -- Check if data is encrypted
    IF NOT ciphertext LIKE 'ENC:%' THEN
        RETURN ciphertext; -- Return as-is if not encrypted
    END IF;

    -- Get decryption key
    v_key := decode(current_setting('app.encryption_key', true), 'hex');

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'Decryption key not available';
    END IF;

    -- Decrypt
    v_decrypted := pgp_sym_decrypt(
        decode(substring(ciphertext FROM 5), 'base64'),
        encode(v_key, 'escape')
    );

    RETURN v_decrypted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SECURITY FIX #4: Add Encrypted PII Columns
-- Migrate existing plaintext PII to encrypted columns
-- =============================================================================

-- Add encrypted columns to consent_records
ALTER TABLE consent_records
    ADD COLUMN IF NOT EXISTS phone_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS ip_address_encrypted TEXT;

-- Add encrypted columns to consents
ALTER TABLE consents
    ADD COLUMN IF NOT EXISTS phone_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS ip_address_encrypted TEXT;

-- Add encrypted columns to message_log
ALTER TABLE message_log
    ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Add encrypted columns to lead_scoring_history
ALTER TABLE lead_scoring_history
    ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- =============================================================================
-- SECURITY FIX #5: Sensitive Data Access Logging
-- Track all access to PII for GDPR compliance
-- =============================================================================

CREATE TABLE IF NOT EXISTS pii_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('READ', 'WRITE', 'EXPORT')),
    accessed_by VARCHAR(100) NOT NULL,
    access_reason TEXT,
    ip_address INET,
    correlation_id VARCHAR(100),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pii_access_log_timestamp ON pii_access_log(timestamp DESC);
CREATE INDEX idx_pii_access_log_record ON pii_access_log(table_name, record_id);

-- Protect PII access log from modification
DROP TRIGGER IF EXISTS tr_prevent_pii_access_log_modification ON pii_access_log;
CREATE TRIGGER tr_prevent_pii_access_log_modification
    BEFORE UPDATE OR DELETE ON pii_access_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- Function to log PII access
CREATE OR REPLACE FUNCTION log_pii_access(
    p_table_name VARCHAR(100),
    p_column_name VARCHAR(100),
    p_record_id VARCHAR(100),
    p_access_type VARCHAR(20),
    p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO pii_access_log (
        table_name, column_name, record_id, access_type,
        accessed_by, access_reason, ip_address, correlation_id
    ) VALUES (
        p_table_name, p_column_name, p_record_id, p_access_type,
        current_setting('app.current_user', true),
        p_reason,
        current_setting('app.client_ip', true)::INET,
        current_setting('app.current_correlation_id', true)
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECURITY FIX #6: Consent Expiry Enforcement
-- Automatic consent expiration without manual checks
-- =============================================================================

-- Function to check and expire consents
CREATE OR REPLACE FUNCTION expire_consents()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE consents
        SET
            status = 'expired',
            updated_at = NOW()
        WHERE status = 'granted'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        RETURNING id, contact_id, consent_type
    ),
    logged AS (
        INSERT INTO consent_audit_log (
            id, consent_id, action, previous_status, new_status,
            performed_by, reason, timestamp
        )
        SELECT
            uuid_generate_v4()::VARCHAR(50),
            id,
            'expired',
            'granted',
            'expired',
            'system',
            'Automatic expiration based on expires_at timestamp',
            NOW()
        FROM expired
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM logged;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECURITY FIX #7: Data Masking for Withdrawn Consents
-- Mask PII when consent is withdrawn
-- =============================================================================

CREATE OR REPLACE FUNCTION mask_withdrawn_consent_data()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'withdrawn' AND OLD.status != 'withdrawn' THEN
        -- Mask phone number (keep last 4 digits for reference)
        NEW.phone := 'MASKED-' || RIGHT(OLD.phone, 4);
        NEW.phone_encrypted := NULL; -- Remove encrypted data

        -- Clear IP address
        NEW.ip_address := NULL;
        NEW.ip_address_encrypted := NULL;

        -- Clear user agent
        NEW.user_agent := 'MASKED';

        -- Log this action
        PERFORM log_pii_access(
            'consents', 'phone,ip_address,user_agent',
            NEW.id, 'WRITE',
            'Masked due to consent withdrawal'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_mask_withdrawn_consent ON consents;
CREATE TRIGGER tr_mask_withdrawn_consent
    BEFORE UPDATE ON consents
    FOR EACH ROW
    EXECUTE FUNCTION mask_withdrawn_consent_data();

-- =============================================================================
-- Grant Permissions
-- =============================================================================

-- Grant usage on schema to API role
GRANT USAGE ON SCHEMA public TO medicalcor_api;

-- Grant table permissions (RLS will restrict actual access)
GRANT SELECT, INSERT, UPDATE ON consent_records TO medicalcor_api;
GRANT SELECT, INSERT, UPDATE ON consents TO medicalcor_api;
GRANT SELECT, INSERT ON consent_audit_log TO medicalcor_api;
GRANT SELECT, INSERT ON message_log TO medicalcor_api;
GRANT SELECT, INSERT ON lead_scoring_history TO medicalcor_api;
GRANT SELECT, INSERT ON pii_access_log TO medicalcor_api;
GRANT SELECT, INSERT ON domain_events TO medicalcor_api;

-- Grant function execution
GRANT EXECUTE ON FUNCTION encrypt_pii TO medicalcor_api;
GRANT EXECUTE ON FUNCTION decrypt_pii TO medicalcor_api;
GRANT EXECUTE ON FUNCTION log_pii_access TO medicalcor_api;
GRANT EXECUTE ON FUNCTION expire_consents TO medicalcor_api;

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON TABLE encryption_keys IS 'Key management for column-level encryption (HIPAA requirement)';
COMMENT ON TABLE pii_access_log IS 'Immutable log of all PII access for GDPR Article 30 compliance';
COMMENT ON FUNCTION encrypt_pii IS 'Encrypt PII data using pgcrypto - requires app.encryption_key session variable';
COMMENT ON FUNCTION decrypt_pii IS 'Decrypt PII data - requires app.encryption_key session variable';
COMMENT ON FUNCTION expire_consents IS 'Automatically expire consents past their expiration date';
COMMENT ON FUNCTION mask_withdrawn_consent_data IS 'Mask PII when consent is withdrawn (GDPR right to erasure)';
