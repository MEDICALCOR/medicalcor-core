-- MedicalCor GDPR Consent Schema
-- Persistent storage for consent records and audit trail
-- BLOCKER #8 FIX: Replace in-memory consent storage with PostgreSQL
--
-- This migration creates proper consent tables that match the
-- PostgresConsentRepository implementation in packages/domain

-- =============================================================================
-- Consents Table (Main consent records)
-- =============================================================================
CREATE TABLE IF NOT EXISTS consents (
    id VARCHAR(50) PRIMARY KEY,
    contact_id VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    consent_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    granted_at TIMESTAMP WITH TIME ZONE,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    source_channel VARCHAR(20) NOT NULL,
    source_method VARCHAR(20) NOT NULL,
    evidence_url TEXT,
    witnessed_by VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Each contact can only have one record per consent type
    CONSTRAINT consents_contact_type_unique UNIQUE(contact_id, consent_type),

    -- Validate consent types
    CONSTRAINT valid_consent_type CHECK (
        consent_type IN (
            'data_processing',
            'marketing_whatsapp',
            'marketing_email',
            'marketing_sms',
            'appointment_reminders',
            'treatment_updates',
            'third_party_sharing'
        )
    ),

    -- Validate consent status
    CONSTRAINT valid_consent_status CHECK (
        status IN ('granted', 'denied', 'withdrawn', 'pending')
    ),

    -- Validate source channel
    CONSTRAINT valid_source_channel CHECK (
        source_channel IN ('whatsapp', 'web', 'phone', 'in_person', 'email')
    ),

    -- Validate source method
    CONSTRAINT valid_source_method CHECK (
        source_method IN ('explicit', 'implicit', 'double_opt_in')
    )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_consents_contact_id ON consents(contact_id);
CREATE INDEX IF NOT EXISTS idx_consents_phone ON consents(phone);
CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);
CREATE INDEX IF NOT EXISTS idx_consents_expires_at ON consents(expires_at)
    WHERE status = 'granted' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_updated_at ON consents(updated_at DESC);

-- =============================================================================
-- Consent Audit Log Table (GDPR compliance audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS consent_audit_log (
    id VARCHAR(50) PRIMARY KEY,
    consent_id VARCHAR(50) NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    reason TEXT,
    ip_address VARCHAR(45),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Validate action types
    CONSTRAINT valid_audit_action CHECK (
        action IN ('created', 'granted', 'denied', 'withdrawn', 'expired', 'updated')
    )
);

-- Indexes for audit trail queries
CREATE INDEX IF NOT EXISTS idx_consent_audit_consent_id ON consent_audit_log(consent_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_timestamp ON consent_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_consent_audit_action ON consent_audit_log(action);

-- =============================================================================
-- Function: Update timestamp trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION update_consent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS tr_consents_updated_at ON consents;
CREATE TRIGGER tr_consents_updated_at
    BEFORE UPDATE ON consents
    FOR EACH ROW
    EXECUTE FUNCTION update_consent_updated_at();

-- =============================================================================
-- Function: Get consent status for a contact
-- =============================================================================
CREATE OR REPLACE FUNCTION get_consent_status(
    p_contact_id VARCHAR(100),
    p_consent_type VARCHAR(50)
) RETURNS TABLE (
    status VARCHAR(20),
    granted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.status,
        c.granted_at,
        c.expires_at,
        (c.status = 'granted' AND (c.expires_at IS NULL OR c.expires_at > NOW())) as is_valid
    FROM consents c
    WHERE c.contact_id = p_contact_id
      AND c.consent_type = p_consent_type;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Check if contact has valid required consents
-- =============================================================================
CREATE OR REPLACE FUNCTION has_required_consents(
    p_contact_id VARCHAR(100)
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_data_processing BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM consents
        WHERE contact_id = p_contact_id
          AND consent_type = 'data_processing'
          AND status = 'granted'
          AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO v_has_data_processing;

    RETURN v_has_data_processing;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Get expiring consents (for renewal reminders)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_expiring_consents(
    p_within_days INTEGER DEFAULT 30
) RETURNS TABLE (
    id VARCHAR(50),
    contact_id VARCHAR(100),
    phone VARCHAR(20),
    consent_type VARCHAR(50),
    expires_at TIMESTAMP WITH TIME ZONE,
    days_until_expiry INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.contact_id,
        c.phone,
        c.consent_type,
        c.expires_at,
        EXTRACT(DAY FROM (c.expires_at - NOW()))::INTEGER as days_until_expiry
    FROM consents c
    WHERE c.status = 'granted'
      AND c.expires_at IS NOT NULL
      AND c.expires_at <= NOW() + (p_within_days || ' days')::INTERVAL
      AND c.expires_at > NOW()
    ORDER BY c.expires_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE consents IS 'GDPR consent records for patient data processing and marketing';
COMMENT ON TABLE consent_audit_log IS 'Immutable audit trail for all consent changes (GDPR Article 7)';
COMMENT ON COLUMN consents.version IS 'Policy version number - consent needs renewal when policy updates';
COMMENT ON COLUMN consents.source_method IS 'How consent was obtained: explicit (checkbox), implicit (continued use), double_opt_in (email verification)';
COMMENT ON FUNCTION has_required_consents IS 'Check if contact has granted all required consents for data processing';
