-- ============================================================================
-- MedicalCor Core - CRM Schema
-- ============================================================================
-- Source: infra/migrations/007-crm.sql
-- Lead Generation Machine & CRM for High-Ticket Dental Sales
-- ============================================================================

-- =============================================================================
-- LEADS (Central Command)
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID,
    assigned_agent_id UUID,
    external_contact_id VARCHAR(100) NOT NULL,
    external_source VARCHAR(50) NOT NULL DEFAULT 'pipedrive',
    external_url TEXT,
    full_name VARCHAR(200),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(200),
    source VARCHAR(50),
    acquisition_channel VARCHAR(50),
    ad_campaign_id VARCHAR(100),
    ai_score INTEGER DEFAULT 0,
    ai_intent VARCHAR(50),
    ai_summary TEXT,
    ai_last_analysis_at TIMESTAMPTZ,
    language VARCHAR(5) DEFAULT 'ro',
    tags TEXT[],
    metadata JSONB,
    gdpr_consent BOOLEAN DEFAULT false,
    gdpr_consent_at TIMESTAMPTZ,
    gdpr_consent_source VARCHAR(100),
    status VARCHAR(50) DEFAULT 'new',
    created_by UUID,
    updated_by UUID,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_clinic ON leads(clinic_id);

-- =============================================================================
-- INTERACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    external_id VARCHAR(100),
    thread_id VARCHAR(100),
    provider VARCHAR(50),
    channel VARCHAR(20) CHECK (channel IN ('whatsapp', 'sms', 'email', 'call', 'note')),
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(20) DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    ai_sentiment_score DECIMAL(3,2),
    ai_tags TEXT[],
    status VARCHAR(20),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_lead_time ON interactions(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(channel);

-- =============================================================================
-- TREATMENT PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS treatment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    doctor_id UUID,
    external_deal_id VARCHAR(100) NOT NULL,
    name VARCHAR(200),
    total_value DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    stage VARCHAR(50),
    probability INTEGER DEFAULT 0,
    is_accepted BOOLEAN DEFAULT false,
    accepted_at TIMESTAMPTZ,
    rejected_reason TEXT,
    notes TEXT,
    valid_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TREATMENT PLAN ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS treatment_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    tooth_number VARCHAR(10),
    procedure_code VARCHAR(50),
    procedure_name VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    total_price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- LEAD EVENTS (Immutable Timeline)
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(50),
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);

-- =============================================================================
-- Triggers
-- =============================================================================
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plans_updated_at ON treatment_plans;
CREATE TRIGGER update_plans_updated_at
    BEFORE UPDATE ON treatment_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
