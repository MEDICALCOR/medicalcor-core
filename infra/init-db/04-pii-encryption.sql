-- =============================================================================
-- PII Encryption Migration
-- GDPR/HIPAA Compliance: Encrypt sensitive data at rest
-- =============================================================================

-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Encryption Key Management
-- IMPORTANT: In production, use a proper key management solution (e.g., Vault, AWS KMS)
-- The encryption key should NEVER be stored in the database
-- =============================================================================

-- Create a table to store encrypted key references (NOT the actual keys)
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_alias VARCHAR(100) NOT NULL UNIQUE,
    key_version INTEGER NOT NULL DEFAULT 1,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'expired', 'revoked'))
);

-- Insert default key alias (actual key loaded from environment variable)
INSERT INTO encryption_keys (key_alias, key_version, algorithm, status)
VALUES ('pii_encryption_key_v1', 1, 'aes-256-gcm', 'active')
ON CONFLICT (key_alias) DO NOTHING;

-- =============================================================================
-- PII Encryption Helper Functions
-- =============================================================================

-- Function to encrypt PII data
-- NOTE: The encryption key is passed as a parameter, sourced from application config
CREATE OR REPLACE FUNCTION encrypt_pii(
    p_plaintext TEXT,
    p_encryption_key TEXT
) RETURNS BYTEA AS $$
BEGIN
    IF p_plaintext IS NULL OR p_plaintext = '' THEN
        RETURN NULL;
    END IF;

    -- Use AES-256 encryption with random IV
    RETURN pgp_sym_encrypt(
        p_plaintext,
        p_encryption_key,
        'cipher-algo=aes256'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt PII data
CREATE OR REPLACE FUNCTION decrypt_pii(
    p_ciphertext BYTEA,
    p_encryption_key TEXT
) RETURNS TEXT AS $$
BEGIN
    IF p_ciphertext IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN pgp_sym_decrypt(p_ciphertext, p_encryption_key);
EXCEPTION
    WHEN OTHERS THEN
        -- Log decryption failure but don't expose error details
        RAISE WARNING 'PII decryption failed - check encryption key';
        RETURN '[DECRYPTION_FAILED]';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to hash PII for indexing (one-way, searchable)
CREATE OR REPLACE FUNCTION hash_pii(
    p_plaintext TEXT,
    p_salt TEXT DEFAULT 'medicalcor_pii_salt'
) RETURNS TEXT AS $$
BEGIN
    IF p_plaintext IS NULL OR p_plaintext = '' THEN
        RETURN NULL;
    END IF;

    -- HMAC-SHA256 for consistent, salted hashing
    RETURN encode(
        hmac(p_plaintext, p_salt, 'sha256'),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- =============================================================================
-- Add Encrypted Columns to Existing Tables
-- =============================================================================

-- Consent Records: Add encrypted phone column
ALTER TABLE consent_records
ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS ip_address_encrypted BYTEA;

-- Message Log: Add encrypted phone column
ALTER TABLE message_log
ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

-- Lead Scoring History: Add encrypted phone column
ALTER TABLE lead_scoring_history
ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

-- =============================================================================
-- Create Indexes on Hashed Columns (for searchability)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_consent_records_phone_hash
ON consent_records(phone_hash);

CREATE INDEX IF NOT EXISTS idx_message_log_phone_hash
ON message_log(phone_hash);

CREATE INDEX IF NOT EXISTS idx_lead_scoring_phone_hash
ON lead_scoring_history(phone_hash);

-- =============================================================================
-- Migration Function: Encrypt Existing Data
-- Run this ONCE after setting up encryption key in environment
-- =============================================================================

CREATE OR REPLACE FUNCTION migrate_encrypt_pii(
    p_encryption_key TEXT,
    p_hash_salt TEXT DEFAULT 'medicalcor_pii_salt'
) RETURNS TABLE(
    table_name TEXT,
    rows_migrated INTEGER,
    status TEXT
) AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Migrate consent_records
    UPDATE consent_records
    SET
        phone_encrypted = encrypt_pii(phone, p_encryption_key),
        phone_hash = hash_pii(phone, p_hash_salt),
        ip_address_encrypted = CASE
            WHEN ip_address IS NOT NULL
            THEN encrypt_pii(ip_address::TEXT, p_encryption_key)
            ELSE NULL
        END
    WHERE phone_encrypted IS NULL AND phone IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    table_name := 'consent_records';
    rows_migrated := v_count;
    status := 'completed';
    RETURN NEXT;

    -- Migrate message_log
    UPDATE message_log
    SET
        phone_encrypted = encrypt_pii(phone, p_encryption_key),
        phone_hash = hash_pii(phone, p_hash_salt)
    WHERE phone_encrypted IS NULL AND phone IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    table_name := 'message_log';
    rows_migrated := v_count;
    status := 'completed';
    RETURN NEXT;

    -- Migrate lead_scoring_history
    UPDATE lead_scoring_history
    SET
        phone_encrypted = encrypt_pii(phone, p_encryption_key),
        phone_hash = hash_pii(phone, p_hash_salt)
    WHERE phone_encrypted IS NULL AND phone IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    table_name := 'lead_scoring_history';
    rows_migrated := v_count;
    status := 'completed';
    RETURN NEXT;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Secure Views for Decrypted Access
-- These views should only be accessible to authorized roles
-- =============================================================================

-- NOTE: Views that need decryption should be created in application code
-- where the encryption key is available from environment variables
-- Do NOT create views with hardcoded keys here

-- =============================================================================
-- Audit Trigger for PII Access
-- =============================================================================

CREATE TABLE IF NOT EXISTS pii_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    user_name VARCHAR(100),
    client_ip INET,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    row_count INTEGER,
    query_hash VARCHAR(64)
);

-- Function to log PII access
CREATE OR REPLACE FUNCTION log_pii_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO pii_access_log (
        table_name,
        operation,
        user_name,
        client_ip,
        row_count
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        current_user,
        inet_client_addr(),
        1
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add audit triggers to PII tables
DROP TRIGGER IF EXISTS audit_consent_records ON consent_records;
CREATE TRIGGER audit_consent_records
    AFTER SELECT OR INSERT OR UPDATE OR DELETE ON consent_records
    FOR EACH STATEMENT
    EXECUTE FUNCTION log_pii_access();

DROP TRIGGER IF EXISTS audit_message_log ON message_log;
CREATE TRIGGER audit_message_log
    AFTER SELECT OR INSERT OR UPDATE OR DELETE ON message_log
    FOR EACH STATEMENT
    EXECUTE FUNCTION log_pii_access();

DROP TRIGGER IF EXISTS audit_lead_scoring ON lead_scoring_history;
CREATE TRIGGER audit_lead_scoring
    AFTER SELECT OR INSERT OR UPDATE OR DELETE ON lead_scoring_history
    FOR EACH STATEMENT
    EXECUTE FUNCTION log_pii_access();

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON FUNCTION encrypt_pii IS 'Encrypts PII using AES-256. Key must be provided from application environment.';
COMMENT ON FUNCTION decrypt_pii IS 'Decrypts PII. Returns [DECRYPTION_FAILED] if key is wrong.';
COMMENT ON FUNCTION hash_pii IS 'Creates searchable HMAC-SHA256 hash of PII for index lookups.';
COMMENT ON TABLE pii_access_log IS 'Audit log of all access to PII-containing tables for compliance.';
COMMENT ON TABLE encryption_keys IS 'Metadata about encryption keys. Actual keys stored in external KMS.';
