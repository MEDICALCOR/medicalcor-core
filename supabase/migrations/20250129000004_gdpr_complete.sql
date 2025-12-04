-- ============================================================================
-- MedicalCor Core - Complete GDPR Compliance Tables
-- ============================================================================
-- Adds remaining GDPR Article 30 tables for full compliance:
-- - Data inventory (processing activities)
-- - Data subject requests tracking
-- - Retention policies
-- ============================================================================

-- =============================================================================
-- Data Subject Requests (DSR) Table (GDPR Articles 15-22)
-- =============================================================================
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id VARCHAR(255) NOT NULL,
    subject_type VARCHAR(50) NOT NULL DEFAULT 'patient',
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',

    -- Identity verification
    verified_at TIMESTAMPTZ,
    verification_method VARCHAR(100),
    verified_by UUID,

    -- Request details
    details JSONB NOT NULL DEFAULT '{}',
    response_data JSONB,
    response_type VARCHAR(50),
    download_url TEXT,
    download_expires_at TIMESTAMPTZ,

    -- Processing info
    assigned_to UUID,
    processing_notes TEXT,
    rejection_reason TEXT,

    -- Timestamps & compliance
    due_date TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Audit fields
    created_by UUID,
    ip_address INET,
    user_agent TEXT,
    correlation_id VARCHAR(100),

    CONSTRAINT valid_request_type CHECK (request_type IN (
        'access', 'rectification', 'erasure', 'portability',
        'restriction', 'objection', 'automated_decision'
    )),
    CONSTRAINT valid_status CHECK (status IN (
        'pending_verification', 'verified', 'in_progress',
        'completed', 'rejected', 'cancelled'
    ))
);

-- Indexes for DSR queries
CREATE INDEX IF NOT EXISTS idx_dsr_subject_id ON data_subject_requests(subject_id);
CREATE INDEX IF NOT EXISTS idx_dsr_status ON data_subject_requests(status);
CREATE INDEX IF NOT EXISTS idx_dsr_due_date ON data_subject_requests(due_date) WHERE status NOT IN ('completed', 'rejected', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_dsr_created_at ON data_subject_requests(created_at DESC);

-- =============================================================================
-- GDPR Data Inventory Table (Article 30 - Records of Processing Activities)
-- =============================================================================
CREATE TABLE IF NOT EXISTS gdpr_data_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Processing activity identification
    activity_id VARCHAR(100) UNIQUE NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Purpose and legal basis
    purpose TEXT NOT NULL,
    legal_basis VARCHAR(50) NOT NULL,
    legitimate_interest_assessment TEXT,

    -- Data details
    data_categories TEXT[] NOT NULL DEFAULT '{}',
    data_subject_types TEXT[] NOT NULL DEFAULT '{}',
    sensitive_data BOOLEAN DEFAULT FALSE,
    special_categories TEXT[],

    -- Storage and retention
    storage_location VARCHAR(255),
    retention_period_days INTEGER NOT NULL,
    retention_policy_reference VARCHAR(100),

    -- Data flows
    data_source VARCHAR(255),
    recipients JSONB DEFAULT '[]',
    transfers_outside_eu BOOLEAN DEFAULT FALSE,
    transfer_safeguards TEXT,
    transfer_countries TEXT[],

    -- Security measures
    security_measures TEXT[],
    encryption_at_rest BOOLEAN DEFAULT TRUE,
    encryption_in_transit BOOLEAN DEFAULT TRUE,
    access_controls TEXT,

    -- Risk assessment
    dpia_required BOOLEAN DEFAULT FALSE,
    dpia_reference VARCHAR(100),
    risk_level VARCHAR(20) DEFAULT 'low',

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    last_reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_legal_basis CHECK (legal_basis IN (
        'consent', 'contract', 'legal_obligation',
        'vital_interests', 'public_task', 'legitimate_interests'
    )),
    CONSTRAINT valid_risk_level CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
);

-- Indexes for data inventory
CREATE INDEX IF NOT EXISTS idx_data_inventory_activity_id ON gdpr_data_inventory(activity_id);
CREATE INDEX IF NOT EXISTS idx_data_inventory_legal_basis ON gdpr_data_inventory(legal_basis);
CREATE INDEX IF NOT EXISTS idx_data_inventory_active ON gdpr_data_inventory(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- Retention Policies Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS gdpr_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Policy identification
    policy_id VARCHAR(100) UNIQUE NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scope
    data_category VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,

    -- Retention rules
    retention_period_days INTEGER NOT NULL,
    legal_basis TEXT NOT NULL,
    disposal_method VARCHAR(50) NOT NULL DEFAULT 'delete',

    -- Exceptions
    exceptions JSONB DEFAULT '[]',

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,

    CONSTRAINT valid_disposal_method CHECK (disposal_method IN (
        'delete', 'anonymize', 'archive', 'pseudonymize'
    )),
    CONSTRAINT unique_policy_per_resource UNIQUE(data_category, resource_type)
);

-- Index for policy lookups
CREATE INDEX IF NOT EXISTS idx_retention_policy_lookup
    ON gdpr_retention_policies(data_category, resource_type)
    WHERE is_active = TRUE;

-- =============================================================================
-- DSR Audit Log Table (Immutable)
-- =============================================================================
CREATE TABLE IF NOT EXISTS dsr_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES data_subject_requests(id),
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_dsr_audit_request_id ON dsr_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_dsr_audit_created_at ON dsr_audit_log(created_at DESC);

-- Prevent modification of DSR audit log
CREATE OR REPLACE FUNCTION prevent_dsr_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DSR audit log entries cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_dsr_audit_modification ON dsr_audit_log;
CREATE TRIGGER tr_prevent_dsr_audit_modification
    BEFORE UPDATE OR DELETE ON dsr_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_dsr_audit_modification();

-- =============================================================================
-- Auto-update timestamps trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION update_gdpr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_dsr_updated_at ON data_subject_requests;
CREATE TRIGGER tr_dsr_updated_at
    BEFORE UPDATE ON data_subject_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_gdpr_updated_at();

DROP TRIGGER IF EXISTS tr_data_inventory_updated_at ON gdpr_data_inventory;
CREATE TRIGGER tr_data_inventory_updated_at
    BEFORE UPDATE ON gdpr_data_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_gdpr_updated_at();

DROP TRIGGER IF EXISTS tr_retention_policy_updated_at ON gdpr_retention_policies;
CREATE TRIGGER tr_retention_policy_updated_at
    BEFORE UPDATE ON gdpr_retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_gdpr_updated_at();

-- =============================================================================
-- Seed Default Retention Policies (Medical Records Compliance)
-- =============================================================================
INSERT INTO gdpr_retention_policies (policy_id, policy_name, data_category, resource_type, retention_period_days, legal_basis, disposal_method, description)
VALUES
    ('medical-records-default', 'Medical Records Retention', 'health', 'patient_record', 2555, 'Legal obligation to retain medical records for 7 years', 'archive', 'Default retention for patient medical records per healthcare regulations'),
    ('consent-records', 'Consent Records Retention', 'personal', 'consent', 2555, 'Legal obligation to prove consent was obtained', 'archive', 'Consent records must be retained to prove compliance'),
    ('audit-logs', 'Audit Log Retention', 'behavioral', 'audit_log', 2555, 'Legal obligation for compliance auditing', 'archive', 'Audit logs for HIPAA/GDPR compliance'),
    ('marketing-data', 'Marketing Data Retention', 'contact', 'lead', 730, 'Legitimate interest with 2-year limit', 'delete', 'Marketing leads retained for 2 years max'),
    ('communication-logs', 'Communication Logs Retention', 'contact', 'message', 365, 'Contract performance and service delivery', 'anonymize', 'Communication logs for service quality'),
    ('appointment-data', 'Appointment Data Retention', 'personal', 'appointment', 2555, 'Medical record keeping requirements', 'archive', 'Appointment history as part of medical records')
ON CONFLICT (policy_id) DO NOTHING;

-- =============================================================================
-- Seed Default Data Inventory (Common Processing Activities)
-- =============================================================================
INSERT INTO gdpr_data_inventory (activity_id, activity_name, purpose, legal_basis, data_categories, data_subject_types, retention_period_days, security_measures)
VALUES
    ('patient-care', 'Patient Care Delivery', 'Provide dental healthcare services', 'contract', ARRAY['health', 'personal', 'contact'], ARRAY['patient'], 2555, ARRAY['encryption', 'access_control', 'audit_logging']),
    ('appointment-scheduling', 'Appointment Scheduling', 'Schedule and manage patient appointments', 'contract', ARRAY['personal', 'contact'], ARRAY['patient'], 2555, ARRAY['encryption', 'access_control']),
    ('lead-management', 'Lead Management', 'Convert prospects to patients', 'legitimate_interests', ARRAY['contact', 'behavioral'], ARRAY['prospect', 'lead'], 730, ARRAY['encryption', 'access_control']),
    ('marketing-communications', 'Marketing Communications', 'Send promotional content to consented contacts', 'consent', ARRAY['contact'], ARRAY['patient', 'prospect'], 730, ARRAY['encryption', 'consent_tracking']),
    ('ai-scoring', 'AI Lead Scoring', 'Score leads using AI for prioritization', 'legitimate_interests', ARRAY['behavioral', 'contact'], ARRAY['lead'], 365, ARRAY['encryption', 'audit_logging', 'model_logging']),
    ('analytics', 'Business Analytics', 'Analyze service delivery and outcomes', 'legitimate_interests', ARRAY['behavioral'], ARRAY['patient', 'staff'], 365, ARRAY['anonymization', 'aggregation'])
ON CONFLICT (activity_id) DO NOTHING;

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE data_subject_requests IS 'GDPR Data Subject Requests (DSR) tracking - Articles 15-22';
COMMENT ON TABLE gdpr_data_inventory IS 'GDPR Article 30 - Records of Processing Activities';
COMMENT ON TABLE gdpr_retention_policies IS 'Data retention policies per data category and resource type';
COMMENT ON TABLE dsr_audit_log IS 'Immutable audit trail for DSR processing';
