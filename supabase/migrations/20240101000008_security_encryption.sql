-- ============================================================================
-- MedicalCor Core - Security & Encryption
-- ============================================================================
-- Source: db/migrations/20241129000001_add_mfa_and_soft_delete.sql
-- MFA, Encryption Keys, Sensitive Data Access
-- ============================================================================

-- =============================================================================
-- MFA SECRETS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mfa_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL DEFAULT 'totp' CHECK (method IN ('totp', 'email_otp', 'sms_otp')),
    secret_encrypted TEXT,
    pending_secret_encrypted TEXT,
    verified_at TIMESTAMPTZ,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mfa_secrets_user_id ON mfa_secrets(user_id);

-- =============================================================================
-- MFA BACKUP CODES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    pending BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_code ON mfa_backup_codes(user_id, code_hash);

-- =============================================================================
-- ENCRYPTED DATA TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS encrypted_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    encrypted_value TEXT NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    classification VARCHAR(20) NOT NULL DEFAULT 'pii' CHECK (classification IN ('pii', 'phi', 'sensitive', 'confidential')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMPTZ,
    accessed_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_encrypted_data_entity_field
    ON encrypted_data(entity_type, entity_id, field_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_encrypted_data_key_version ON encrypted_data(key_version);
CREATE INDEX IF NOT EXISTS idx_encrypted_data_entity ON encrypted_data(entity_type, entity_id);

-- =============================================================================
-- ENCRYPTION KEY METADATA TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS encryption_keys (
    version INT PRIMARY KEY,
    fingerprint VARCHAR(16) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'retired', 'compromised')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retired_at TIMESTAMPTZ,
    created_by UUID,
    notes TEXT
);

-- =============================================================================
-- SENSITIVE DATA ACCESS LOG
-- =============================================================================
CREATE TABLE IF NOT EXISTS sensitive_data_access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    field_names TEXT[] NOT NULL,
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('read', 'write', 'export', 'delete')),
    access_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_user ON sensitive_data_access_log(user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_entity ON sensitive_data_access_log(entity_type, entity_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_time ON sensitive_data_access_log(accessed_at DESC);

-- =============================================================================
-- PII Access Log (additional granular logging)
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

CREATE INDEX IF NOT EXISTS idx_pii_access_log_timestamp ON pii_access_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pii_access_log_record ON pii_access_log(table_name, record_id);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    NEW.deleted_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_soft_deleted_records(retention_days INT DEFAULT 90)
RETURNS TABLE (table_name TEXT, deleted_count BIGINT) AS $$
DECLARE
    retention_date TIMESTAMPTZ;
BEGIN
    retention_date := CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;

    DELETE FROM users WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN table_name := 'users'; RETURN NEXT; END IF;

    DELETE FROM consent_records WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN table_name := 'consent_records'; RETURN NEXT; END IF;

    DELETE FROM encrypted_data WHERE deleted_at < retention_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN table_name := 'encrypted_data'; RETURN NEXT; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_pii_access(
    p_table_name VARCHAR(100),
    p_column_name VARCHAR(100),
    p_record_id VARCHAR(100),
    p_access_type VARCHAR(20),
    p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO pii_access_log (table_name, column_name, record_id, access_type, accessed_by, access_reason, ip_address, correlation_id)
    VALUES (p_table_name, p_column_name, p_record_id, p_access_type,
        current_setting('app.current_user', true), p_reason,
        current_setting('app.client_ip', true)::INET,
        current_setting('app.current_correlation_id', true));
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS update_mfa_secrets_updated_at ON mfa_secrets;
CREATE TRIGGER update_mfa_secrets_updated_at
    BEFORE UPDATE ON mfa_secrets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_encrypted_data_updated_at ON encrypted_data;
CREATE TRIGGER update_encrypted_data_updated_at
    BEFORE UPDATE ON encrypted_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Prevent audit log modification
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

DROP TRIGGER IF EXISTS tr_prevent_pii_access_log_modification ON pii_access_log;
CREATE TRIGGER tr_prevent_pii_access_log_modification
    BEFORE UPDATE OR DELETE ON pii_access_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();
