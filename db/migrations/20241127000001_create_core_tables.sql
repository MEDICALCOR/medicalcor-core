-- migrate:up
-- MedicalCor Core Database - Initial Schema
-- Created: 2024-11-27

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Domain Events Table (Append-only Event Store)
-- =============================================================================
CREATE TABLE IF NOT EXISTS domain_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL UNIQUE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT domain_events_type_check CHECK (type ~ '^[a-z]+\.[a-z_]+$')
);

CREATE INDEX idx_domain_events_type ON domain_events(type);
CREATE INDEX idx_domain_events_correlation_id ON domain_events(correlation_id);
CREATE INDEX idx_domain_events_created_at ON domain_events(created_at DESC);

-- =============================================================================
-- Consent Records Table (GDPR Compliance)
-- =============================================================================
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    hubspot_contact_id VARCHAR(50),
    consent_type VARCHAR(50) NOT NULL,
    granted BOOLEAN NOT NULL,
    consent_text TEXT NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT consent_type_check CHECK (consent_type IN ('marketing', 'medical_data', 'communication'))
);

CREATE INDEX idx_consent_records_phone ON consent_records(phone);
CREATE INDEX idx_consent_records_hubspot_contact_id ON consent_records(hubspot_contact_id);

-- =============================================================================
-- Message Log Table (Audit Trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS message_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_message_id VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms', 'email')),
    content_hash VARCHAR(64),
    status VARCHAR(20),
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_log_phone ON message_log(phone);
CREATE INDEX idx_message_log_external_id ON message_log(external_message_id);
CREATE INDEX idx_message_log_created_at ON message_log(created_at DESC);

-- =============================================================================
-- Lead Scoring History Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_scoring_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    hubspot_contact_id VARCHAR(50),
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
    classification VARCHAR(20) NOT NULL CHECK (classification IN ('HOT', 'WARM', 'COLD', 'UNQUALIFIED')),
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT,
    model_version VARCHAR(50),
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lead_scoring_phone ON lead_scoring_history(phone);
CREATE INDEX idx_lead_scoring_created_at ON lead_scoring_history(created_at DESC);

-- =============================================================================
-- Processor Registry (GDPR Data Processors)
-- =============================================================================
CREATE TABLE IF NOT EXISTS processor_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    data_types TEXT[] NOT NULL,
    dpa_signed BOOLEAN DEFAULT FALSE,
    dpa_document_url TEXT,
    reviewed_at DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_review')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial processors
INSERT INTO processor_registry (name, category, data_types, dpa_signed, status) VALUES
    ('HubSpot', 'CRM', ARRAY['contact', 'communication', 'scoring'], true, 'active'),
    ('360dialog', 'Messaging', ARRAY['phone', 'message_content'], true, 'active'),
    ('Twilio', 'Voice', ARRAY['phone', 'call_recording', 'transcript'], true, 'active'),
    ('OpenAI', 'AI Processing', ARRAY['message_content', 'transcript'], true, 'active'),
    ('Stripe', 'Payments', ARRAY['payment', 'email'], true, 'active'),
    ('Trigger.dev', 'Workflow', ARRAY['event_data'], true, 'active')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to emit domain event with idempotency check
CREATE OR REPLACE FUNCTION emit_domain_event(
    p_type VARCHAR(100),
    p_payload JSONB,
    p_correlation_id VARCHAR(100),
    p_idempotency_key VARCHAR(200)
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO domain_events (type, payload, correlation_id, idempotency_key)
    VALUES (p_type, p_payload, p_correlation_id, p_idempotency_key)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get events by correlation ID
CREATE OR REPLACE FUNCTION get_events_by_correlation(
    p_correlation_id VARCHAR(100)
) RETURNS TABLE (
    id UUID,
    type VARCHAR(100),
    payload JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT de.id, de.type, de.payload, de.created_at
    FROM domain_events de
    WHERE de.correlation_id = p_correlation_id
    ORDER BY de.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- migrate:down
DROP FUNCTION IF EXISTS get_events_by_correlation(VARCHAR);
DROP FUNCTION IF EXISTS emit_domain_event(VARCHAR, JSONB, VARCHAR, VARCHAR);
DROP TABLE IF EXISTS processor_registry;
DROP TABLE IF EXISTS lead_scoring_history;
DROP TABLE IF EXISTS message_log;
DROP TABLE IF EXISTS consent_records;
DROP TABLE IF EXISTS domain_events;
