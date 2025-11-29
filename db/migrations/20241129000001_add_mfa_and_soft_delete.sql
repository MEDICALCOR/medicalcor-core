-- migrate:up
-- MedicalCor Security Enhancement Migration
-- Adds MFA support and soft delete for critical tables
-- Created: 2024-11-29

-- =============================================================================
-- MFA SECRETS TABLE
-- Stores encrypted TOTP secrets for Multi-Factor Authentication
-- =============================================================================
CREATE TABLE IF NOT EXISTS mfa_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- MFA method
    method VARCHAR(20) NOT NULL DEFAULT 'totp' CHECK (method IN ('totp', 'email_otp', 'sms_otp')),

    -- Encrypted TOTP secret (AES-256-GCM)
    -- Format: iv:authTag:encryptedData (all base64)
    secret_encrypted TEXT,

    -- Pending secret during setup (before verification)
    pending_secret_encrypted TEXT,

    -- Verification status
    verified_at TIMESTAMPTZ,

    -- Rate limiting for MFA attempts
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_mfa_secrets_user_id ON mfa_secrets(user_id);

-- =============================================================================
-- MFA BACKUP CODES TABLE
-- Stores hashed backup codes for MFA recovery
-- =============================================================================
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- SHA-256 hash of the backup code
    code_hash VARCHAR(64) NOT NULL,

    -- Pending during setup (before MFA is verified)
    pending BOOLEAN NOT NULL DEFAULT false,

    -- Usage tracking
    used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for user's backup codes
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);

-- Unique constraint on code_hash per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_code ON mfa_backup_codes(user_id, code_hash);

-- =============================================================================
-- SOFT DELETE: Add deleted_at to critical tables
-- GDPR: Allows for data recovery before permanent deletion
-- =============================================================================

-- Users table soft delete
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Consent records soft delete (GDPR critical)
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_consent_records_deleted_at ON consent_records(deleted_at) WHERE deleted_at IS NOT NULL;

-- Lead scoring history soft delete (medical data)
ALTER TABLE lead_scoring_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lead_scoring_deleted_at ON lead_scoring_history(deleted_at) WHERE deleted_at IS NOT NULL;

-- Message log soft delete (audit trail)
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_message_log_deleted_at ON message_log(deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- ENCRYPTED DATA TABLE
-- Stores encrypted PHI/PII with key rotation support
-- =============================================================================
CREATE TABLE IF NOT EXISTS encrypted_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference to owning entity
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    field_name VARCHAR(100) NOT NULL,

    -- Encrypted data (AES-256-GCM)
    -- Format: keyVersion:iv:authTag:encryptedData (all base64)
    encrypted_value TEXT NOT NULL,

    -- Key version for rotation
    key_version INT NOT NULL DEFAULT 1,

    -- Data classification
    classification VARCHAR(20) NOT NULL DEFAULT 'pii' CHECK (classification IN ('pii', 'phi', 'sensitive', 'confidential')),

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMPTZ,
    accessed_by UUID,

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Unique constraint on entity + field
CREATE UNIQUE INDEX IF NOT EXISTS idx_encrypted_data_entity_field
    ON encrypted_data(entity_type, entity_id, field_name) WHERE deleted_at IS NULL;

-- Index for key rotation
CREATE INDEX IF NOT EXISTS idx_encrypted_data_key_version ON encrypted_data(key_version);

-- Index for entity lookup
CREATE INDEX IF NOT EXISTS idx_encrypted_data_entity ON encrypted_data(entity_type, entity_id);

-- =============================================================================
-- ENCRYPTION KEY METADATA TABLE
-- Tracks encryption key versions for rotation
-- =============================================================================
CREATE TABLE IF NOT EXISTS encryption_keys (
    version INT PRIMARY KEY,

    -- Key fingerprint (SHA-256 of key, truncated for identification)
    fingerprint VARCHAR(16) NOT NULL,

    -- Key status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'retired', 'compromised')),

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retired_at TIMESTAMPTZ,

    -- Audit
    created_by UUID,
    notes TEXT
);

-- =============================================================================
-- AUDIT LOG FOR SENSITIVE DATA ACCESS
-- HIPAA/GDPR: Track all access to PHI/PII
-- =============================================================================
CREATE TABLE IF NOT EXISTS sensitive_data_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who accessed
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID,

    -- What was accessed
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    field_names TEXT[] NOT NULL,

    -- Access context
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('read', 'write', 'export', 'delete')),
    access_reason TEXT,

    -- Request context
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_sensitive_access_user ON sensitive_data_access_log(user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_entity ON sensitive_data_access_log(entity_type, entity_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_time ON sensitive_data_access_log(accessed_at DESC);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function for soft delete
CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    NEW.deleted_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to permanently delete soft-deleted records after retention period
CREATE OR REPLACE FUNCTION cleanup_soft_deleted_records(retention_days INT DEFAULT 90)
RETURNS TABLE (
    table_name TEXT,
    deleted_count BIGINT
) AS $$
DECLARE
    retention_date TIMESTAMPTZ;
BEGIN
    retention_date := CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;

    -- Users (cascade will handle related MFA records)
    DELETE FROM users WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        table_name := 'users';
        RETURN NEXT;
    END IF;

    -- Consent records
    DELETE FROM consent_records WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        table_name := 'consent_records';
        RETURN NEXT;
    END IF;

    -- Lead scoring history
    DELETE FROM lead_scoring_history WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        table_name := 'lead_scoring_history';
        RETURN NEXT;
    END IF;

    -- Message log
    DELETE FROM message_log WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        table_name := 'message_log';
        RETURN NEXT;
    END IF;

    -- Encrypted data
    DELETE FROM encrypted_data WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
        table_name := 'encrypted_data';
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update trigger for mfa_secrets
DROP TRIGGER IF EXISTS update_mfa_secrets_updated_at ON mfa_secrets;
CREATE TRIGGER update_mfa_secrets_updated_at
    BEFORE UPDATE ON mfa_secrets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for encrypted_data
DROP TRIGGER IF EXISTS update_encrypted_data_updated_at ON encrypted_data;
CREATE TRIGGER update_encrypted_data_updated_at
    BEFORE UPDATE ON encrypted_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (Optional - enable in production)
-- =============================================================================

-- Enable RLS on sensitive tables (uncomment in production)
-- ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sensitive_data_access_log ENABLE ROW LEVEL SECURITY;

-- migrate:down
DROP TABLE IF EXISTS sensitive_data_access_log;
DROP TABLE IF EXISTS encryption_keys;
DROP TABLE IF EXISTS encrypted_data;
DROP TABLE IF EXISTS mfa_backup_codes;
DROP TABLE IF EXISTS mfa_secrets;

ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE consent_records DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE lead_scoring_history DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE message_log DROP COLUMN IF EXISTS deleted_at;

DROP FUNCTION IF EXISTS cleanup_soft_deleted_records(INT);
DROP FUNCTION IF EXISTS soft_delete();
