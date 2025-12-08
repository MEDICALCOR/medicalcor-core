-- L6: Data Classification Labels
-- Migration to add explicit PII/PHI/sensitive labels to all database tables
-- Supports HIPAA/GDPR compliance with comprehensive data inventory

-- =============================================================================
-- DATA CLASSIFICATION TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_classification (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Table identification
    table_name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(50) NOT NULL DEFAULT 'public',

    -- Overall sensitivity level (highest among columns)
    sensitivity_level VARCHAR(20) NOT NULL CHECK (sensitivity_level IN (
        'public', 'internal', 'confidential', 'restricted_pii', 'phi', 'financial'
    )),

    -- Data type flags
    contains_pii BOOLEAN NOT NULL DEFAULT false,
    contains_phi BOOLEAN NOT NULL DEFAULT false,
    contains_financial BOOLEAN NOT NULL DEFAULT false,

    -- Compliance frameworks (array of strings)
    compliance_frameworks TEXT[] NOT NULL DEFAULT '{}',

    -- Encryption requirement
    encryption_requirement VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (encryption_requirement IN (
        'none', 'recommended', 'required', 'field_level'
    )),

    -- Retention policy category
    retention_category VARCHAR(50) NOT NULL CHECK (retention_category IN (
        'medical_records', 'consent_records', 'audit_logs', 'marketing_leads',
        'communication_logs', 'appointment_data', 'financial_records',
        'session_data', 'temporary'
    )),

    -- Security features
    rls_enabled BOOLEAN NOT NULL DEFAULT false,
    soft_delete_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Column-level classifications (JSONB array)
    columns JSONB NOT NULL DEFAULT '[]',

    -- Documentation
    description TEXT,
    compliance_notes TEXT,

    -- Review tracking
    last_reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint on table identification
    CONSTRAINT uq_data_classification_table UNIQUE (schema_name, table_name)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Sensitivity queries
CREATE INDEX IF NOT EXISTS idx_classification_sensitivity
    ON data_classification (sensitivity_level);

-- PII/PHI filters
CREATE INDEX IF NOT EXISTS idx_classification_pii
    ON data_classification (contains_pii) WHERE contains_pii = true;

CREATE INDEX IF NOT EXISTS idx_classification_phi
    ON data_classification (contains_phi) WHERE contains_phi = true;

CREATE INDEX IF NOT EXISTS idx_classification_financial
    ON data_classification (contains_financial) WHERE contains_financial = true;

-- Compliance framework queries (GIN for array containment)
CREATE INDEX IF NOT EXISTS idx_classification_frameworks
    ON data_classification USING GIN (compliance_frameworks);

-- Retention queries
CREATE INDEX IF NOT EXISTS idx_classification_retention
    ON data_classification (retention_category);

-- Review tracking
CREATE INDEX IF NOT EXISTS idx_classification_stale_review
    ON data_classification (last_reviewed_at)
    WHERE last_reviewed_at IS NULL OR last_reviewed_at < NOW() - INTERVAL '90 days';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_data_classification_updated_at ON data_classification;
CREATE TRIGGER update_data_classification_updated_at
    BEFORE UPDATE ON data_classification
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE data_classification IS 'L6: Data classification inventory for HIPAA/GDPR compliance';
COMMENT ON COLUMN data_classification.id IS 'Unique identifier';
COMMENT ON COLUMN data_classification.table_name IS 'Name of the database table';
COMMENT ON COLUMN data_classification.schema_name IS 'Database schema (default: public)';
COMMENT ON COLUMN data_classification.sensitivity_level IS 'Overall data sensitivity: public, internal, confidential, restricted_pii, phi, financial';
COMMENT ON COLUMN data_classification.contains_pii IS 'Whether table contains Personally Identifiable Information';
COMMENT ON COLUMN data_classification.contains_phi IS 'Whether table contains Protected Health Information (HIPAA)';
COMMENT ON COLUMN data_classification.contains_financial IS 'Whether table contains financial/payment data (PCI-DSS)';
COMMENT ON COLUMN data_classification.compliance_frameworks IS 'Applicable compliance frameworks: HIPAA, GDPR, CCPA, PCI_DSS, SOC2, ISO27001';
COMMENT ON COLUMN data_classification.encryption_requirement IS 'Encryption requirement: none, recommended, required, field_level';
COMMENT ON COLUMN data_classification.retention_category IS 'Data retention policy category';
COMMENT ON COLUMN data_classification.rls_enabled IS 'Whether Row Level Security is enabled';
COMMENT ON COLUMN data_classification.soft_delete_enabled IS 'Whether soft delete is implemented';
COMMENT ON COLUMN data_classification.columns IS 'Column-level classification metadata (JSONB array)';
COMMENT ON COLUMN data_classification.description IS 'Human-readable table description';
COMMENT ON COLUMN data_classification.compliance_notes IS 'Notes for compliance auditors';
COMMENT ON COLUMN data_classification.last_reviewed_at IS 'Last review date for classification accuracy';
COMMENT ON COLUMN data_classification.reviewed_by IS 'Person who last reviewed the classification';

-- =============================================================================
-- SEED DATA: Classification for all existing tables
-- =============================================================================

-- Authentication & Access Control
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('users', 'restricted_pii', true, false, false, ARRAY['GDPR', 'CCPA', 'SOC2'], 'recommended', 'consent_records', false, true,
    '[{"columnName": "email", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": false, "redactInLogs": true},
      {"columnName": "name", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "personal", "isEncrypted": false, "redactInLogs": true},
      {"columnName": "password_hash", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'Staff and admin user accounts',
    'Contains staff PII. Password hashes are one-way encrypted. Soft delete enabled for account recovery.'),

('sessions', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'session_data', false, false,
    '[{"columnName": "token", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'User session management',
    'Session tokens should be rotated regularly. 30-day retention.'),

('auth_events', 'internal', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'audit_logs', false, false,
    '[{"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Authentication audit trail',
    'Immutable audit log. IP addresses are PII under GDPR. 7-year retention for compliance.'),

('login_attempts', 'internal', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'audit_logs', false, false,
    '[{"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Brute force protection tracking',
    'Security audit data. Short retention acceptable (90 days).'),

('password_reset_tokens', 'confidential', true, false, false, ARRAY['GDPR', 'SOC2'], 'required', 'temporary', false, false,
    '[{"columnName": "token", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'Password reset token storage',
    'Tokens expire after 1 hour. Encrypted at rest.'),

('refresh_tokens', 'confidential', false, false, false, ARRAY['SOC2'], 'required', 'session_data', false, false,
    '[{"columnName": "token_hash", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'JWT refresh token rotation',
    'Token family tracking for security. 30-day rotation.'),

('mfa_secrets', 'confidential', false, false, false, ARRAY['SOC2'], 'required', 'consent_records', false, false,
    '[{"columnName": "secret_encrypted", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'Multi-factor authentication secrets',
    'TOTP secrets encrypted with AES-256. Never log or expose.'),

('mfa_backup_codes', 'confidential', false, false, false, ARRAY['SOC2'], 'required', 'consent_records', false, false,
    '[{"columnName": "code_hash", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'MFA emergency recovery codes',
    'One-way hashed. Single use only.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Clinic & Organization
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('clinics', 'internal', false, false, true, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'none', 'consent_records', true, false,
    '[{"columnName": "name", "sensitivityLevel": "internal", "isPii": false, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false},
      {"columnName": "hubspot_company_id", "sensitivityLevel": "internal", "isPii": false, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Dental clinic entities',
    'Multi-tenant isolation via clinic_id. Contains compliance flags.'),

('processor_registry', 'internal', false, false, false, ARRAY['GDPR'], 'none', 'consent_records', false, false,
    '[]'::jsonb,
    'GDPR data processor registry',
    'Article 28 processor tracking. Required for DPA compliance.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Patient/Lead Data (PII/PHI)
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('leads', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'CCPA', 'SOC2'], 'field_level', 'medical_records', true, true,
    '[{"columnName": "phone", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": false, "redactInLogs": true, "piiPatterns": ["phone"]},
      {"columnName": "email", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": false, "redactInLogs": true, "piiPatterns": ["email"]},
      {"columnName": "full_name", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "personal", "isEncrypted": false, "redactInLogs": true, "piiPatterns": ["name"]},
      {"columnName": "context", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": true, "description": "Contains medical context, symptoms, treatment interest"}]'::jsonb,
    'Patient/prospect lead records with AI scoring',
    'Core patient data. Context JSONB may contain PHI (symptoms, treatments). GDPR consent tracking included. 7-year medical retention.'),

('lead_scoring_history', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'recommended', 'medical_records', true, false,
    '[{"columnName": "phone_encrypted", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": true, "redactInLogs": true},
      {"columnName": "context", "sensitivityLevel": "phi", "isPii": false, "isPhi": true, "dataCategory": "ai_generated", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Lead score evolution audit trail',
    'AI scoring history with classification. Used for model improvement and audit.'),

('interactions', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'recommended', 'communication_logs', true, false,
    '[{"columnName": "content", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "communication", "isEncrypted": false, "redactInLogs": true, "description": "Message content may contain health information"}]'::jsonb,
    'Communication records (WhatsApp, SMS, email, call, note)',
    'Bidirectional communication. Content may contain PHI. AI sentiment scoring applied. 1-year retention then anonymize.'),

('treatment_plans', 'phi', true, true, true, ARRAY['HIPAA', 'GDPR', 'PCI_DSS', 'SOC2'], 'required', 'medical_records', true, true,
    '[{"columnName": "items", "sensitivityLevel": "phi", "isPii": false, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Clinical treatment plans with procedures and pricing',
    'PHI: procedure details. Financial: pricing. 7-year medical record retention.'),

('treatment_plan_items', 'phi', false, true, true, ARRAY['HIPAA', 'PCI_DSS', 'SOC2'], 'none', 'medical_records', true, false,
    '[{"columnName": "procedure_name", "sensitivityLevel": "phi", "isPii": false, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": false},
      {"columnName": "tooth_number", "sensitivityLevel": "phi", "isPii": false, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Individual treatment procedure line items',
    'PHI: specific dental procedures and tooth numbers. Financial: unit pricing.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Financial/Cases
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('cases', 'financial', false, false, true, ARRAY['HIPAA', 'PCI_DSS', 'SOC2'], 'none', 'financial_records', true, true,
    '[{"columnName": "total_amount", "sensitivityLevel": "financial", "isPii": false, "isPhi": false, "dataCategory": "financial", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Treatment case records linking plans to payments',
    'Financial summary denormalized for performance. 7-year retention for tax/accounting.'),

('payments', 'financial', false, false, true, ARRAY['PCI_DSS', 'SOC2'], 'required', 'financial_records', true, true,
    '[{"columnName": "amount", "sensitivityLevel": "financial", "isPii": false, "isPhi": false, "dataCategory": "financial", "isEncrypted": false, "redactInLogs": false},
      {"columnName": "processor_reference", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "financial", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Payment transaction records',
    'PCI-DSS scope. No card numbers stored (tokenized via Stripe). 7-year retention.'),

('payment_plans', 'financial', false, false, true, ARRAY['PCI_DSS', 'SOC2'], 'none', 'financial_records', true, false,
    '[]'::jsonb,
    'Payment installment schedule definitions',
    'Financial: installment terms and amounts.'),

('payment_plan_installments', 'financial', false, false, true, ARRAY['PCI_DSS', 'SOC2'], 'none', 'financial_records', true, false,
    '[]'::jsonb,
    'Individual scheduled payment installments',
    'Financial: scheduled amounts and due dates.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Consent & GDPR Compliance
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('consents', 'restricted_pii', true, false, false, ARRAY['GDPR', 'HIPAA', 'CCPA', 'SOC2'], 'field_level', 'consent_records', true, true,
    '[{"columnName": "phone", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": false, "redactInLogs": true},
      {"columnName": "phone_encrypted", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": true, "redactInLogs": true},
      {"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'GDPR consent records with granular consent types',
    'CRITICAL: GDPR Article 7 proof. 7-year retention. Never delete - mark withdrawn. IP address is PII.'),

('consent_audit_log', 'internal', true, false, false, ARRAY['GDPR', 'HIPAA', 'SOC2'], 'none', 'audit_logs', false, false,
    '[{"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Immutable consent change audit trail',
    'GDPR Article 7 compliance. Immutable - cannot be modified or deleted. 7-year retention.'),

('consent_records', 'restricted_pii', true, false, false, ARRAY['GDPR', 'SOC2'], 'field_level', 'consent_records', false, true,
    '[{"columnName": "phone_encrypted", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'Legacy consent records (migrated to consents)',
    'Soft delete for GDPR compliance.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- GDPR Data Subject Requests
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('data_subject_requests', 'restricted_pii', true, false, false, ARRAY['GDPR', 'CCPA', 'SOC2'], 'recommended', 'audit_logs', false, false,
    '[{"columnName": "email", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "contact", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'GDPR/CCPA data subject request tracking',
    'Articles 15-22 request management. 30-day SLA tracking. Identity verification required.'),

('dsr_audit_log', 'internal', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'audit_logs', false, false,
    '[]'::jsonb,
    'Immutable DSR processing audit trail',
    'Proof of DSR handling. Immutable. 7-year retention.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Data Inventory & Retention
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('gdpr_data_inventory', 'internal', false, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'consent_records', false, false,
    '[]'::jsonb,
    'GDPR Article 30 Records of Processing Activities',
    'Required for GDPR compliance. Documents all data processing activities.'),

('gdpr_retention_policies', 'internal', false, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'consent_records', false, false,
    '[]'::jsonb,
    'Data retention rules by category',
    'Defines disposal methods and retention periods.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Security & Encryption
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('encrypted_data', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'required', 'medical_records', false, true,
    '[{"columnName": "encrypted_value", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "health", "isEncrypted": true, "redactInLogs": true}]'::jsonb,
    'Encrypted field storage registry',
    'Central encrypted data store. AES-256-GCM. Key versioning for rotation.'),

('encryption_keys', 'confidential', false, false, false, ARRAY['SOC2', 'ISO27001'], 'required', 'consent_records', false, false,
    '[{"columnName": "fingerprint", "sensitivityLevel": "confidential", "isPii": false, "isPhi": false, "dataCategory": "authentication", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Encryption key metadata and rotation tracking',
    'Key material stored in HSM/KMS, not here. Only metadata.'),

('sensitive_data_access_log', 'internal', true, false, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'none', 'audit_logs', false, false,
    '[{"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Granular access tracking for sensitive data',
    'HIPAA minimum necessary. Tracks who accessed what and why.'),

('pii_access_log', 'internal', true, false, false, ARRAY['GDPR', 'HIPAA', 'SOC2'], 'none', 'audit_logs', false, false,
    '[{"columnName": "ip_address", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'PII-specific access logging',
    'Immutable. Correlation ID for request tracing. 7-year retention.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Event Sourcing & Audit
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('domain_events', 'phi', true, true, true, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'recommended', 'audit_logs', false, false,
    '[{"columnName": "payload", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": true, "description": "Event payload may contain PII/PHI depending on event type"}]'::jsonb,
    'Append-only event store for CQRS',
    'Immutable event log. Payload sensitivity varies by event type. 7-year retention.'),

('lead_events', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'none', 'medical_records', false, false,
    '[{"columnName": "data", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Immutable lead state change timeline',
    'Event sourcing for lead lifecycle. Contains PII/PHI in data payload.'),

('event_sourcing_replay', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'audit_logs', false, false,
    '[]'::jsonb,
    'Event replay tracking for CQRS projections',
    'Operational metadata. No PII/PHI.'),

('saga_store', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'session_data', false, false,
    '[]'::jsonb,
    'CQRS saga orchestration state',
    'Workflow coordination. May reference entity IDs but no PII directly.'),

('aggregate_snapshots', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'recommended', 'medical_records', false, false,
    '[{"columnName": "state", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "health", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Performance optimization snapshots for aggregates',
    'Contains full aggregate state which may include PII/PHI.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Cognitive Memory & AI
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('episodic_events', 'phi', true, true, false, ARRAY['HIPAA', 'GDPR', 'SOC2'], 'recommended', 'medical_records', true, true,
    '[{"columnName": "summary", "sensitivityLevel": "phi", "isPii": true, "isPhi": true, "dataCategory": "ai_generated", "isEncrypted": false, "redactInLogs": true, "description": "LLM-generated conversation summary may contain PHI"},
      {"columnName": "key_entities", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "ai_generated", "isEncrypted": false, "redactInLogs": true},
      {"columnName": "embedding", "sensitivityLevel": "internal", "isPii": false, "isPhi": false, "dataCategory": "ai_generated", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'LLM-summarized interaction episodic memory',
    'ADR-004 cognitive memory. Summaries may contain PHI. Embeddings are anonymized. Soft delete for GDPR.'),

('behavioral_patterns', 'restricted_pii', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'medical_records', true, true,
    '[{"columnName": "pattern_data", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "behavioral", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'AI-detected behavioral patterns',
    'Derived PII. Used for personalization. GDPR profiling considerations.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Vector Search & RAG
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('knowledge_base', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'consent_records', true, false,
    '[{"columnName": "content", "sensitivityLevel": "internal", "isPii": false, "isPhi": false, "dataCategory": "technical", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'RAG document store with embeddings',
    'Clinic protocols, FAQs. Should not contain patient data.'),

('message_embeddings', 'restricted_pii', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'communication_logs', true, false,
    '[{"columnName": "sanitized_content", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "ai_generated", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Conversation context embeddings',
    'Content sanitized before embedding. PII patterns may remain.'),

('rag_query_log', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'audit_logs', false, false,
    '[]'::jsonb,
    'RAG operation logging for optimization',
    'Performance metrics. No PII/PHI.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Data Lineage
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('data_lineage', 'internal', false, false, false, ARRAY['GDPR', 'HIPAA', 'SOC2'], 'none', 'audit_logs', true, false,
    '[{"columnName": "compliance", "sensitivityLevel": "internal", "isPii": false, "isPhi": false, "dataCategory": "audit", "isEncrypted": false, "redactInLogs": false}]'::jsonb,
    'Complete data flow and transformation tracking',
    'M15 lineage. References entity IDs but no PII directly. 7-year retention for HIPAA.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Scheduling
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('scheduled_deletions', 'internal', false, false, false, ARRAY['GDPR'], 'none', 'temporary', false, false,
    '[]'::jsonb,
    'GDPR right-to-erasure queue',
    'Tracks pending deletions. Short retention.'),

('projection_checkpoints', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'temporary', false, false,
    '[]'::jsonb,
    'CQRS projection health monitoring',
    'Operational metadata.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Agent Performance & Monitoring
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('agent_performance_metrics', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'audit_logs', true, false,
    '[]'::jsonb,
    'Call center agent performance metrics',
    'Aggregated metrics. No PII.'),

('nps_collection', 'restricted_pii', true, false, false, ARRAY['GDPR', 'SOC2'], 'none', 'marketing_leads', true, false,
    '[{"columnName": "feedback", "sensitivityLevel": "restricted_pii", "isPii": true, "isPhi": false, "dataCategory": "behavioral", "isEncrypted": false, "redactInLogs": true}]'::jsonb,
    'Net Promoter Score survey responses',
    'Customer feedback. May contain PII in comments. 2-year retention.'),

('agent_guidance', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'communication_logs', false, false,
    '[]'::jsonb,
    'Real-time agent assistance logs',
    'AI suggestions to agents. No patient data.'),

('queue_sla', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'audit_logs', true, false,
    '[]'::jsonb,
    'Call queue SLA monitoring',
    'Operational metrics.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- Load Testing
INSERT INTO data_classification (table_name, sensitivity_level, contains_pii, contains_phi, contains_financial, compliance_frameworks, encryption_requirement, retention_category, rls_enabled, soft_delete_enabled, columns, description, compliance_notes) VALUES
('load_test_results', 'internal', false, false, false, ARRAY['SOC2'], 'none', 'temporary', false, false,
    '[]'::jsonb,
    'Performance benchmarking results',
    'Test data only. No production PII.')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Summary view for compliance reporting
CREATE OR REPLACE VIEW data_classification_summary AS
SELECT
    sensitivity_level,
    COUNT(*) AS table_count,
    SUM(CASE WHEN contains_pii THEN 1 ELSE 0 END) AS pii_tables,
    SUM(CASE WHEN contains_phi THEN 1 ELSE 0 END) AS phi_tables,
    SUM(CASE WHEN contains_financial THEN 1 ELSE 0 END) AS financial_tables,
    SUM(CASE WHEN rls_enabled THEN 1 ELSE 0 END) AS rls_enabled_count,
    SUM(CASE WHEN soft_delete_enabled THEN 1 ELSE 0 END) AS soft_delete_count
FROM data_classification
GROUP BY sensitivity_level
ORDER BY
    CASE sensitivity_level
        WHEN 'phi' THEN 1
        WHEN 'financial' THEN 2
        WHEN 'restricted_pii' THEN 3
        WHEN 'confidential' THEN 4
        WHEN 'internal' THEN 5
        WHEN 'public' THEN 6
    END;

COMMENT ON VIEW data_classification_summary IS 'Summary of data classifications by sensitivity level';

-- PII/PHI inventory view for HIPAA/GDPR audits
CREATE OR REPLACE VIEW pii_phi_inventory AS
SELECT
    table_name,
    schema_name,
    sensitivity_level,
    contains_pii,
    contains_phi,
    compliance_frameworks,
    encryption_requirement,
    retention_category,
    rls_enabled,
    soft_delete_enabled,
    columns,
    last_reviewed_at,
    CASE
        WHEN last_reviewed_at IS NULL THEN 'never_reviewed'
        WHEN last_reviewed_at < NOW() - INTERVAL '90 days' THEN 'stale'
        ELSE 'current'
    END AS review_status
FROM data_classification
WHERE contains_pii = true OR contains_phi = true
ORDER BY
    CASE
        WHEN contains_phi THEN 1
        WHEN contains_pii THEN 2
        ELSE 3
    END,
    table_name;

COMMENT ON VIEW pii_phi_inventory IS 'Inventory of tables containing PII or PHI for compliance audits';

-- Compliance gaps view
CREATE OR REPLACE VIEW data_classification_gaps AS
SELECT
    table_name,
    'missing_encryption' AS gap_type,
    'high' AS severity,
    'Table contains PHI but encryption is not required' AS description
FROM data_classification
WHERE contains_phi = true AND encryption_requirement NOT IN ('required', 'field_level')

UNION ALL

SELECT
    table_name,
    'missing_rls' AS gap_type,
    'medium' AS severity,
    'Table contains PII/PHI but RLS is not enabled' AS description
FROM data_classification
WHERE (contains_pii = true OR contains_phi = true) AND rls_enabled = false

UNION ALL

SELECT
    table_name,
    'stale_review' AS gap_type,
    'low' AS severity,
    'Classification not reviewed in over 90 days' AS description
FROM data_classification
WHERE last_reviewed_at IS NULL OR last_reviewed_at < NOW() - INTERVAL '90 days';

COMMENT ON VIEW data_classification_gaps IS 'Identified compliance gaps in data classification';

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to get classification for a table
CREATE OR REPLACE FUNCTION get_table_classification(p_table_name VARCHAR)
RETURNS TABLE (
    table_name VARCHAR,
    sensitivity_level VARCHAR,
    contains_pii BOOLEAN,
    contains_phi BOOLEAN,
    contains_financial BOOLEAN,
    compliance_frameworks TEXT[],
    encryption_requirement VARCHAR,
    retention_category VARCHAR,
    rls_enabled BOOLEAN,
    columns JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.table_name::VARCHAR,
        dc.sensitivity_level::VARCHAR,
        dc.contains_pii,
        dc.contains_phi,
        dc.contains_financial,
        dc.compliance_frameworks,
        dc.encryption_requirement::VARCHAR,
        dc.retention_category::VARCHAR,
        dc.rls_enabled,
        dc.columns
    FROM data_classification dc
    WHERE dc.table_name = p_table_name;
END;
$$;

COMMENT ON FUNCTION get_table_classification IS 'Get classification metadata for a specific table';

-- Function to check if a column is classified as PII
CREATE OR REPLACE FUNCTION is_column_pii(p_table_name VARCHAR, p_column_name VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_pii BOOLEAN;
BEGIN
    SELECT
        EXISTS (
            SELECT 1
            FROM data_classification dc,
                 jsonb_array_elements(dc.columns) AS col
            WHERE dc.table_name = p_table_name
              AND col->>'columnName' = p_column_name
              AND (col->>'isPii')::boolean = true
        )
    INTO v_is_pii;

    RETURN COALESCE(v_is_pii, false);
END;
$$;

COMMENT ON FUNCTION is_column_pii IS 'Check if a specific column is classified as PII';

-- Function to generate compliance report
CREATE OR REPLACE FUNCTION generate_classification_report()
RETURNS TABLE (
    report_type VARCHAR,
    metric_name VARCHAR,
    metric_value BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 'summary'::VARCHAR, 'total_tables'::VARCHAR, COUNT(*)::BIGINT FROM data_classification
    UNION ALL
    SELECT 'summary', 'tables_with_pii', COUNT(*) FROM data_classification WHERE contains_pii = true
    UNION ALL
    SELECT 'summary', 'tables_with_phi', COUNT(*) FROM data_classification WHERE contains_phi = true
    UNION ALL
    SELECT 'summary', 'tables_with_financial', COUNT(*) FROM data_classification WHERE contains_financial = true
    UNION ALL
    SELECT 'summary', 'tables_with_rls', COUNT(*) FROM data_classification WHERE rls_enabled = true
    UNION ALL
    SELECT 'summary', 'stale_reviews', COUNT(*) FROM data_classification
        WHERE last_reviewed_at IS NULL OR last_reviewed_at < NOW() - INTERVAL '90 days'
    UNION ALL
    SELECT 'by_sensitivity', sensitivity_level, COUNT(*) FROM data_classification GROUP BY sensitivity_level
    UNION ALL
    SELECT 'by_retention', retention_category, COUNT(*) FROM data_classification GROUP BY retention_category;
END;
$$;

COMMENT ON FUNCTION generate_classification_report IS 'Generate summary report of data classifications';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS
ALTER TABLE data_classification ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read classifications
CREATE POLICY classification_read_policy ON data_classification
    FOR SELECT
    USING (true);

-- Policy: Only admins can modify classifications
CREATE POLICY classification_write_policy ON data_classification
    FOR ALL
    USING (
        current_setting('app.user_role', true) = 'admin'
        OR current_setting('app.user_role', true) = 'compliance_officer'
    );

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT ON data_classification TO authenticated;
GRANT SELECT ON data_classification_summary TO authenticated;
GRANT SELECT ON pii_phi_inventory TO authenticated;
GRANT SELECT ON data_classification_gaps TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_classification TO authenticated;
GRANT EXECUTE ON FUNCTION is_column_pii TO authenticated;
GRANT EXECUTE ON FUNCTION generate_classification_report TO authenticated;
