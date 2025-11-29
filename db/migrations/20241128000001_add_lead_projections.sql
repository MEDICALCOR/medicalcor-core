-- migrate:up
-- MedicalCor Lead Projections - Performance Fix for findByPhone
-- Created: 2024-11-28
-- Fixes: O(N) scan in LeadRepository.findByPhone -> O(1) lookup

-- =============================================================================
-- Leads Lookup Table (Projection for fast queries)
-- =============================================================================
-- This is a READ MODEL for CQRS - updated by event handlers when LeadCreated fires
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

    -- Event sourcing metadata
    last_event_version INTEGER DEFAULT 0,
    last_event_id UUID
);

-- Unique index on phone for O(1) lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lookup_phone ON leads_lookup(phone);

-- Index for classification-based queries (triage board)
CREATE INDEX IF NOT EXISTS idx_leads_lookup_classification ON leads_lookup(classification);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_leads_lookup_status ON leads_lookup(status);

-- Combined index for triage queries
CREATE INDEX IF NOT EXISTS idx_leads_lookup_triage
    ON leads_lookup(classification, status, created_at DESC);

-- =============================================================================
-- AI Metrics Persistence Table
-- =============================================================================
-- Stores AI call metrics for auditing and cost tracking
CREATE TABLE IF NOT EXISTS ai_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'llama', 'ollama')),
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(50) NOT NULL,

    -- Token usage
    tokens_prompt INTEGER NOT NULL DEFAULT 0,
    tokens_completion INTEGER NOT NULL DEFAULT 0,
    tokens_total INTEGER NOT NULL DEFAULT 0,

    -- Cost tracking (in USD)
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,

    -- Performance metrics
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    used_fallback BOOLEAN DEFAULT false,

    -- Context
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cost reporting (monthly aggregation)
CREATE INDEX IF NOT EXISTS idx_ai_metrics_created_at ON ai_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_provider ON ai_metrics(provider, created_at DESC);

-- Partial index for error analysis
CREATE INDEX IF NOT EXISTS idx_ai_metrics_errors
    ON ai_metrics(provider, created_at DESC)
    WHERE success = false;

-- =============================================================================
-- Triage Rules Configuration Table
-- =============================================================================
-- Dynamic configuration for triage keywords (replaces hardcoded DEFAULT_CONFIG)
CREATE TABLE IF NOT EXISTS triage_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (
        'priority_keyword',
        'emergency_keyword',
        'scheduling_keyword',
        'vip_phone'
    )),
    value VARCHAR(200) NOT NULL,
    language VARCHAR(10) DEFAULT 'ro',
    active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicates
    CONSTRAINT triage_rules_unique UNIQUE (rule_type, value, language)
);

-- Index for efficient rule loading
CREATE INDEX IF NOT EXISTS idx_triage_rules_type ON triage_rules(rule_type) WHERE active = true;

-- =============================================================================
-- Default Triage Rules (seed data)
-- =============================================================================
INSERT INTO triage_rules (rule_type, value, language, priority, notes) VALUES
    -- Priority keywords (pain/discomfort - high purchase intent)
    ('priority_keyword', 'durere', 'ro', 10, 'Pain indicator'),
    ('priority_keyword', 'durere puternica', 'ro', 15, 'Severe pain'),
    ('priority_keyword', 'umflatura', 'ro', 10, 'Swelling'),
    ('priority_keyword', 'urgent', 'ro', 12, 'Urgency'),
    ('priority_keyword', 'infectie', 'ro', 14, 'Infection'),
    ('priority_keyword', 'abces', 'ro', 15, 'Abscess'),
    ('priority_keyword', 'febra', 'ro', 13, 'Fever'),
    ('priority_keyword', 'nu pot manca', 'ro', 11, 'Cannot eat'),
    ('priority_keyword', 'nu pot dormi', 'ro', 11, 'Cannot sleep'),

    -- Emergency keywords (advise 112)
    ('emergency_keyword', 'accident', 'ro', 20, 'Accident'),
    ('emergency_keyword', 'cazut', 'ro', 18, 'Fall'),
    ('emergency_keyword', 'spart', 'ro', 16, 'Broken'),
    ('emergency_keyword', 'urgenta medicala', 'ro', 25, 'Medical emergency'),
    ('emergency_keyword', 'nu respir bine', 'ro', 25, 'Breathing issues'),

    -- Scheduling keywords (priority scheduling request)
    ('scheduling_keyword', 'urgent', 'ro', 10, 'Urgent request'),
    ('scheduling_keyword', 'cat mai repede', 'ro', 9, 'ASAP'),
    ('scheduling_keyword', 'imediat', 'ro', 10, 'Immediately'),
    ('scheduling_keyword', 'prioritar', 'ro', 8, 'Priority'),
    ('scheduling_keyword', 'maine', 'ro', 7, 'Tomorrow'),
    ('scheduling_keyword', 'azi', 'ro', 9, 'Today'),
    ('scheduling_keyword', 'acum', 'ro', 10, 'Now'),
    ('scheduling_keyword', 'de urgenta', 'ro', 9, 'Urgently'),
    ('scheduling_keyword', 'cel mai devreme', 'ro', 8, 'Earliest'),
    ('scheduling_keyword', 'prima programare', 'ro', 8, 'First appointment')
ON CONFLICT (rule_type, value, language) DO NOTHING;

-- =============================================================================
-- Default Owners Configuration Table
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
    -- Handle LeadCreated event
    IF NEW.type = 'lead.created' THEN
        INSERT INTO leads_lookup (
            id,
            phone,
            channel,
            status,
            created_at,
            last_event_version,
            last_event_id
        ) VALUES (
            (NEW.payload->>'aggregateId')::UUID,
            NEW.payload->>'phone',
            COALESCE(NEW.payload->>'channel', 'whatsapp'),
            'new',
            NEW.created_at,
            NEW.version,
            NEW.id
        )
        ON CONFLICT (phone) DO UPDATE SET
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id;

    -- Handle LeadScored event
    ELSIF NEW.type = 'lead.scored' THEN
        UPDATE leads_lookup SET
            score = (NEW.payload->>'score')::INTEGER,
            classification = NEW.payload->>'classification',
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;

    -- Handle LeadQualified event
    ELSIF NEW.type = 'lead.qualified' THEN
        UPDATE leads_lookup SET
            classification = NEW.payload->>'classification',
            status = 'qualified',
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;

    -- Handle LeadAssigned event
    ELSIF NEW.type = 'lead.assigned' THEN
        UPDATE leads_lookup SET
            assigned_to = NEW.payload->>'assignedTo',
            status = 'contacted',
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;

    -- Handle LeadConverted event
    ELSIF NEW.type = 'lead.converted' THEN
        UPDATE leads_lookup SET
            hubspot_contact_id = NEW.payload->>'hubspotContactId',
            status = 'converted',
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;

    -- Handle LeadLost event
    ELSIF NEW.type = 'lead.lost' THEN
        UPDATE leads_lookup SET
            status = 'lost',
            updated_at = NOW(),
            last_event_version = NEW.version,
            last_event_id = NEW.id
        WHERE id = (NEW.payload->>'aggregateId')::UUID;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic projection updates
DROP TRIGGER IF EXISTS trg_update_lead_projection ON domain_events;
CREATE TRIGGER trg_update_lead_projection
    AFTER INSERT ON domain_events
    FOR EACH ROW
    WHEN (NEW.type LIKE 'lead.%')
    EXECUTE FUNCTION update_lead_projection();

-- =============================================================================
-- View: AI Cost Summary (for reporting)
-- =============================================================================
CREATE OR REPLACE VIEW ai_cost_summary AS
SELECT
    date_trunc('day', created_at) as day,
    provider,
    COUNT(*) as total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_requests,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_requests,
    SUM(tokens_total) as total_tokens,
    SUM(cost_usd) as total_cost_usd,
    AVG(latency_ms)::INTEGER as avg_latency_ms,
    SUM(CASE WHEN used_fallback THEN 1 ELSE 0 END) as fallback_count
FROM ai_metrics
GROUP BY date_trunc('day', created_at), provider
ORDER BY day DESC, provider;

-- migrate:down
DROP VIEW IF EXISTS ai_cost_summary;
DROP TRIGGER IF EXISTS trg_update_lead_projection ON domain_events;
DROP FUNCTION IF EXISTS update_lead_projection();
DROP TABLE IF EXISTS triage_owners;
DROP TABLE IF EXISTS triage_rules;
DROP TABLE IF EXISTS ai_metrics;
DROP TABLE IF EXISTS leads_lookup;
