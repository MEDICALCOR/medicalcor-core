-- ============================================================================
-- MedicalCor Core - Lead Projections
-- ============================================================================
-- Source: db/migrations/20241128000001_add_lead_projections.sql
-- CQRS Read Models for fast queries
-- ============================================================================

-- =============================================================================
-- Leads Lookup Table (Projection for fast queries)
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads_lookup (
    id UUID PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'web', 'referral')),
    classification VARCHAR(20) CHECK (classification IN ('HOT', 'WARM', 'COLD', 'UNQUALIFIED')),
    score INTEGER CHECK (score >= 1 AND score <= 5),
    hubspot_contact_id VARCHAR(50),
    assigned_to VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_event_version INTEGER DEFAULT 0,
    last_event_id UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lookup_phone ON leads_lookup(phone);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_classification ON leads_lookup(classification);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_status ON leads_lookup(status);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_triage ON leads_lookup(classification, status, created_at DESC);

-- =============================================================================
-- AI Metrics Persistence Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'llama', 'ollama')),
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(50) NOT NULL,
    tokens_prompt INTEGER NOT NULL DEFAULT 0,
    tokens_completion INTEGER NOT NULL DEFAULT 0,
    tokens_total INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    used_fallback BOOLEAN DEFAULT false,
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_created_at ON ai_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_provider ON ai_metrics(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_errors ON ai_metrics(provider, created_at DESC) WHERE success = false;

-- =============================================================================
-- Triage Rules Configuration Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS triage_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('priority_keyword', 'emergency_keyword', 'scheduling_keyword', 'vip_phone')),
    value VARCHAR(200) NOT NULL,
    language VARCHAR(10) DEFAULT 'ro',
    active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT triage_rules_unique UNIQUE (rule_type, value, language)
);

CREATE INDEX IF NOT EXISTS idx_triage_rules_type ON triage_rules(rule_type) WHERE active = true;

-- Seed default triage rules
INSERT INTO triage_rules (rule_type, value, language, priority, notes) VALUES
    ('priority_keyword', 'durere', 'ro', 10, 'Pain indicator'),
    ('priority_keyword', 'urgent', 'ro', 12, 'Urgency'),
    ('priority_keyword', 'infectie', 'ro', 14, 'Infection'),
    ('emergency_keyword', 'accident', 'ro', 20, 'Accident'),
    ('emergency_keyword', 'urgenta medicala', 'ro', 25, 'Medical emergency'),
    ('scheduling_keyword', 'cat mai repede', 'ro', 9, 'ASAP'),
    ('scheduling_keyword', 'azi', 'ro', 9, 'Today'),
    ('scheduling_keyword', 'maine', 'ro', 7, 'Tomorrow')
ON CONFLICT (rule_type, value, language) DO NOTHING;

-- =============================================================================
-- Triage Owners Configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS triage_owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_key VARCHAR(50) NOT NULL UNIQUE,
    owner_value VARCHAR(100) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO triage_owners (owner_key, owner_value, description) VALUES
    ('implants', 'dr-implant-team', 'Owner for implant procedures'),
    ('general', 'reception-team', 'Default owner for general inquiries'),
    ('priority', 'scheduling-team', 'Owner for priority/urgent cases')
ON CONFLICT (owner_key) DO NOTHING;

-- =============================================================================
-- Function: Update leads_lookup on event
-- =============================================================================
CREATE OR REPLACE FUNCTION update_lead_projection()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'lead.created' THEN
        INSERT INTO leads_lookup (id, phone, channel, status, created_at, last_event_version, last_event_id)
        VALUES (
            (NEW.payload->>'aggregateId')::UUID,
            NEW.payload->>'phone',
            COALESCE(NEW.payload->>'channel', 'whatsapp'),
            'new', NEW.created_at, NEW.version, NEW.id
        )
        ON CONFLICT (phone) DO UPDATE SET
            updated_at = NOW(), last_event_version = NEW.version, last_event_id = NEW.id;
    ELSIF NEW.type = 'lead.scored' THEN
        UPDATE leads_lookup SET
            score = (NEW.payload->>'score')::INTEGER,
            classification = NEW.payload->>'classification',
            updated_at = NOW(), last_event_version = NEW.version, last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;
    ELSIF NEW.type = 'lead.converted' THEN
        UPDATE leads_lookup SET
            hubspot_contact_id = NEW.payload->>'hubspotContactId',
            status = 'converted',
            updated_at = NOW(), last_event_version = NEW.version, last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_lead_projection ON domain_events;
CREATE TRIGGER trg_update_lead_projection
    AFTER INSERT ON domain_events
    FOR EACH ROW
    WHEN (NEW.type LIKE 'lead.%')
    EXECUTE FUNCTION update_lead_projection();

-- =============================================================================
-- View: AI Cost Summary
-- =============================================================================
CREATE OR REPLACE VIEW ai_cost_summary AS
SELECT
    date_trunc('day', created_at) as day,
    provider,
    COUNT(*) as total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_requests,
    SUM(tokens_total) as total_tokens,
    SUM(cost_usd) as total_cost_usd,
    AVG(latency_ms)::INTEGER as avg_latency_ms,
    SUM(CASE WHEN used_fallback THEN 1 ELSE 0 END) as fallback_count
FROM ai_metrics
GROUP BY date_trunc('day', created_at), provider
ORDER BY day DESC, provider;
