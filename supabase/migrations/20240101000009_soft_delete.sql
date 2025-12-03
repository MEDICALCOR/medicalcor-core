-- ============================================================================
-- MedicalCor Core - Soft Delete Columns
-- ============================================================================
-- Source: db/migrations/20241129000001_add_mfa_and_soft_delete.sql
-- Add deleted_at to critical tables for GDPR compliance
-- ============================================================================

-- Consent records soft delete (GDPR critical)
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_consent_records_deleted_at ON consent_records(deleted_at) WHERE deleted_at IS NOT NULL;

-- Lead scoring history soft delete (medical data)
ALTER TABLE lead_scoring_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lead_scoring_deleted_at ON lead_scoring_history(deleted_at) WHERE deleted_at IS NOT NULL;

-- Message log soft delete (audit trail)
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_message_log_deleted_at ON message_log(deleted_at) WHERE deleted_at IS NOT NULL;

-- Message log encryption columns
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS content_encrypted TEXT;
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS encryption_key_version INT DEFAULT 1;

-- Add encrypted PII columns to consent_records
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS ip_address_encrypted TEXT;

-- Add encrypted PII columns to consents
ALTER TABLE consents ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS ip_address_encrypted TEXT;

-- Add encrypted PII columns to message_log
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Add encrypted PII columns to lead_scoring_history
ALTER TABLE lead_scoring_history ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- =============================================================================
-- Scheduled Deletions Table (GDPR Article 17 compliance)
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

CREATE INDEX IF NOT EXISTS idx_scheduled_deletions_due
    ON scheduled_deletions(scheduled_for)
    WHERE executed_at IS NULL;

-- Protect domain_events from modification (event sourcing immutability)
DROP TRIGGER IF EXISTS tr_prevent_event_modification ON domain_events;
CREATE TRIGGER tr_prevent_event_modification
    BEFORE UPDATE OR DELETE ON domain_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- Protect consent_audit_log from modification
DROP TRIGGER IF EXISTS tr_prevent_audit_modification ON consent_audit_log;
CREATE TRIGGER tr_prevent_audit_modification
    BEFORE UPDATE OR DELETE ON consent_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();
