-- ============================================================================
-- MedicalCor Core - API Keys & WhatsApp Templates
-- ============================================================================
-- API Keys for external integrations and WhatsApp message templates
-- ============================================================================

-- =============================================================================
-- API KEYS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Key information
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of the key
    key_prefix VARCHAR(20) NOT NULL,  -- First 8 chars for identification (e.g., "pk_live_abc...")

    -- Type and permissions
    type VARCHAR(20) NOT NULL DEFAULT 'production' CHECK (type IN ('production', 'test')),
    permissions TEXT[] NOT NULL DEFAULT '{}',

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    requests_today INTEGER NOT NULL DEFAULT 0,
    requests_total BIGINT NOT NULL DEFAULT 0,
    daily_limit INTEGER NOT NULL DEFAULT 10000,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id),
    revoked_reason TEXT,

    -- Expiration
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_clinic_id ON api_keys(clinic_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- API KEY USAGE LOG (for rate limiting and analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_key_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage_log(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created_at ON api_key_usage_log(created_at DESC);

-- Partition by day for better performance (optional, for high volume)
-- Can be added later when usage increases

-- =============================================================================
-- WHATSAPP TEMPLATES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Template information
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('appointment', 'reminder', 'followup', 'marketing', 'utility', 'authentication')),

    -- Status (Meta approval status)
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected', 'disabled')),
    rejection_reason TEXT,

    -- Content
    language VARCHAR(10) NOT NULL DEFAULT 'ro',
    content TEXT NOT NULL,
    variables TEXT[] NOT NULL DEFAULT '{}',

    -- Header (optional)
    header_type VARCHAR(20) CHECK (header_type IN ('text', 'image', 'video', 'document')),
    header_content TEXT,

    -- Footer (optional)
    footer TEXT,

    -- Buttons (optional, stored as JSONB)
    buttons JSONB,

    -- Meta/360dialog reference
    external_template_id VARCHAR(100),
    external_namespace VARCHAR(100),

    -- Usage statistics
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_clinic_id ON whatsapp_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_clinic_name ON whatsapp_templates(clinic_id, name);

-- =============================================================================
-- BILLING / INVOICES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID,  -- Optional, for patient-specific invoices

    -- Invoice details
    invoice_number VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),

    -- Amounts (in smallest currency unit, e.g., bani for RON)
    subtotal INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'RON',

    -- Tax information
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 19.00,

    -- Payment
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,

    -- Stripe integration
    stripe_invoice_id VARCHAR(100),
    stripe_payment_intent_id VARCHAR(100),

    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,

    -- Customer info (denormalized for invoices)
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_address TEXT,
    customer_tax_id VARCHAR(50),

    -- Notes
    notes TEXT,
    internal_notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_clinic_id ON invoices(clinic_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON invoices(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_clinic_number ON invoices(clinic_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- =============================================================================
-- INVOICE LINE ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

    -- Item details
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,  -- in smallest currency unit
    total INTEGER NOT NULL,

    -- Optional procedure/service reference
    service_code VARCHAR(50),
    service_name VARCHAR(255),

    -- Tax
    tax_rate DECIMAL(5,2),
    tax_amount INTEGER,

    -- Order
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_templates_updated_at ON whatsapp_templates;
CREATE TRIGGER update_whatsapp_templates_updated_at
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to reset daily API key request counters (called by cron)
CREATE OR REPLACE FUNCTION reset_api_key_daily_counters()
RETURNS void AS $$
BEGIN
    UPDATE api_keys SET requests_today = 0 WHERE requests_today > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to increment API key usage
CREATE OR REPLACE FUNCTION increment_api_key_usage(
    p_key_id UUID,
    p_endpoint VARCHAR(255),
    p_method VARCHAR(10),
    p_status_code INTEGER,
    p_response_time_ms INTEGER DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_active BOOLEAN;
    v_daily_limit INTEGER;
    v_requests_today INTEGER;
BEGIN
    -- Check if key is active and within limits
    SELECT is_active, daily_limit, requests_today
    INTO v_is_active, v_daily_limit, v_requests_today
    FROM api_keys
    WHERE id = p_key_id;

    IF NOT v_is_active THEN
        RETURN FALSE;
    END IF;

    IF v_requests_today >= v_daily_limit THEN
        RETURN FALSE;
    END IF;

    -- Update counters
    UPDATE api_keys
    SET
        requests_today = requests_today + 1,
        requests_total = requests_total + 1,
        last_used_at = CURRENT_TIMESTAMP
    WHERE id = p_key_id;

    -- Log usage
    INSERT INTO api_key_usage_log (api_key_id, endpoint, method, status_code, response_time_ms, ip_address)
    VALUES (p_key_id, p_endpoint, p_method, p_status_code, p_response_time_ms, p_ip_address);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(p_clinic_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_count INTEGER;
    v_prefix VARCHAR(10);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);

    SELECT COUNT(*) + 1 INTO v_count
    FROM invoices
    WHERE clinic_id = p_clinic_id
    AND EXTRACT(YEAR FROM created_at) = v_year;

    v_prefix := 'INV';

    RETURN v_prefix || '-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
