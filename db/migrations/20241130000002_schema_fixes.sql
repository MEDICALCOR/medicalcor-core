-- =============================================================================
-- SCHEMA FIXES MIGRATION
-- Addresses HIGH/MEDIUM priority issues from platinum audit
-- =============================================================================

-- Migration: 20241130000002_schema_fixes

-- =============================================================================
-- 1. FIX CONFIDENCE PRECISION IN LEAD_SCORING_HISTORY
-- Issue: DECIMAL(3,2) only allows values 0.00-9.99, but confidence is 0.00-1.00
-- Fix: Use DECIMAL(5,4) to allow values like 0.9876
-- =============================================================================

-- Check if column needs update (only if using wrong precision)
DO $$
BEGIN
    -- Alter column type if it exists with wrong precision
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lead_scoring_history'
        AND column_name = 'confidence'
        AND numeric_precision = 3
    ) THEN
        ALTER TABLE lead_scoring_history
        ALTER COLUMN confidence TYPE DECIMAL(5,4);
        RAISE NOTICE 'Updated lead_scoring_history.confidence to DECIMAL(5,4)';
    END IF;
END $$;

-- =============================================================================
-- 2. ADD UNIQUE CONSTRAINT ON CONSENT_RECORDS
-- Issue: Same user can have duplicate consent records for same type
-- Fix: Add unique constraint on (phone, consent_type) where not deleted
-- =============================================================================

-- Create partial unique index (only for non-deleted records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_records_unique_active
    ON consent_records(phone, consent_type)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 3. NAMESPACE IDEMPOTENCY KEY BY AGGREGATE TYPE
-- Issue: Global idempotency key allows conflicts across aggregates
-- Fix: Add composite unique index
-- =============================================================================

-- Drop old index if exists
DROP INDEX IF EXISTS idx_domain_events_idempotency;

-- Create new composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_idempotency_aggregate_type
    ON domain_events(idempotency_key, aggregate_type)
    WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 4. ADD MESSAGE_LOG INDEXES FOR PERFORMANCE
-- Issue: Missing indexes on commonly queried columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_message_log_phone_created
    ON message_log(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_log_status_created
    ON message_log(status, created_at DESC)
    WHERE status IN ('pending', 'failed');

-- =============================================================================
-- 5. ADD MISSING FOREIGN KEY TO USERS TABLE
-- Issue: mfa_secrets.user_id has FK but no index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_mfa_secrets_user_id
    ON mfa_secrets(user_id);

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id
    ON mfa_backup_codes(user_id);

-- =============================================================================
-- 6. ADD AUDIT LOG RETENTION INDEX
-- Issue: No efficient way to clean up old audit logs
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_auth_events_created_at
    ON auth_events(created_at);

CREATE INDEX IF NOT EXISTS idx_sensitive_data_access_log_accessed_at
    ON sensitive_data_access_log(accessed_at);

-- =============================================================================
-- 7. ADD DEAD LETTER QUEUE TABLE
-- Issue: Failed operations have no persistent storage for retry
-- =============================================================================

CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source information
    source_type VARCHAR(100) NOT NULL, -- 'webhook', 'workflow', 'api', etc.
    source_id VARCHAR(255),
    correlation_id UUID,

    -- Payload
    payload JSONB NOT NULL,
    error_message TEXT,
    error_stack TEXT,

    -- Retry information
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    last_retry_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, failed, succeeded
    processed_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- For soft delete cleanup
    deleted_at TIMESTAMPTZ
);

-- Indexes for dead letter queue
CREATE INDEX IF NOT EXISTS idx_dlq_status_next_retry
    ON dead_letter_queue(status, next_retry_at)
    WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dlq_source
    ON dead_letter_queue(source_type, source_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dlq_correlation
    ON dead_letter_queue(correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_dlq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_dead_letter_queue_updated_at ON dead_letter_queue;
CREATE TRIGGER update_dead_letter_queue_updated_at
    BEFORE UPDATE ON dead_letter_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_dlq_updated_at();

-- =============================================================================
-- 8. ADD ENCRYPTION KEY ROTATION TABLE
-- Issue: No mechanism to track encryption key versions
-- =============================================================================

CREATE TABLE IF NOT EXISTS encryption_key_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_id VARCHAR(255) NOT NULL UNIQUE, -- External key ID (e.g., from Cloud KMS)
    version INTEGER NOT NULL,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',

    -- Key state
    state VARCHAR(50) NOT NULL DEFAULT 'active', -- active, rotate_out, retired

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    destroy_scheduled_at TIMESTAMPTZ,

    -- Audit
    created_by UUID,
    CONSTRAINT fk_encryption_key_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Index for active keys
CREATE INDEX IF NOT EXISTS idx_encryption_key_versions_active
    ON encryption_key_versions(state, version DESC)
    WHERE state = 'active';

-- =============================================================================
-- 9. ADD CONSENT ENFORCEMENT TRACKING
-- Issue: No way to track consent enforcement decisions
-- =============================================================================

CREATE TABLE IF NOT EXISTS consent_enforcement_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Request information
    request_type VARCHAR(100) NOT NULL, -- 'message_send', 'data_access', etc.
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    user_id UUID,

    -- Consent check result
    consent_type VARCHAR(100) NOT NULL,
    consent_granted BOOLEAN NOT NULL,
    consent_record_id UUID,

    -- Action taken
    action_allowed BOOLEAN NOT NULL,
    denial_reason TEXT,

    -- Metadata
    correlation_id UUID,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for consent enforcement queries
CREATE INDEX IF NOT EXISTS idx_consent_enforcement_entity
    ON consent_enforcement_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_enforcement_denied
    ON consent_enforcement_log(created_at DESC)
    WHERE action_allowed = FALSE;

-- =============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE dead_letter_queue IS 'Stores failed operations for retry. HIPAA: May contain PHI - apply RLS.';
COMMENT ON TABLE encryption_key_versions IS 'Tracks encryption key lifecycle for compliance audits.';
COMMENT ON TABLE consent_enforcement_log IS 'Audit trail for consent enforcement decisions. GDPR Article 7.';
COMMENT ON INDEX idx_consent_records_unique_active IS 'Ensures one active consent record per phone/type.';
