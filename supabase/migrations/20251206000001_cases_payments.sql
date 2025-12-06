-- ============================================================================
-- MedicalCor Core - Cases & Payments Schema
-- ============================================================================
-- H1 Fix: Creates cases table linking treatment plans to payments
-- Provides end-to-end visibility from lead to treatment to payment
-- ============================================================================

-- =============================================================================
-- CASES (Links Treatment Plans to Financial Transactions)
-- =============================================================================
-- A case represents a patient's journey from treatment plan acceptance
-- through payment completion. It bridges clinical and financial data.

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,

    -- Case identification
    case_number VARCHAR(50) NOT NULL,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',           -- Treatment plan accepted, awaiting start
            'in_progress',       -- Treatment ongoing
            'completed',         -- Treatment finished
            'cancelled',         -- Case cancelled
            'on_hold'            -- Temporarily paused
        )),

    -- Financial summary (denormalized for query performance)
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    outstanding_amount DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

    -- Payment status
    payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN (
            'unpaid',            -- No payments received
            'partial',           -- Some payments received
            'paid',              -- Fully paid
            'overpaid',          -- More than total paid
            'refunded'           -- Full refund issued
        )),

    -- Financing
    financing_provider VARCHAR(100),
    financing_reference VARCHAR(100),
    financing_approved_at TIMESTAMPTZ,

    -- Clinical timeline
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expected_completion_date DATE,

    -- Notes and metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT unique_case_number_per_clinic UNIQUE (clinic_id, case_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cases_clinic ON cases(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cases_lead ON cases(lead_id);
CREATE INDEX IF NOT EXISTS idx_cases_treatment_plan ON cases(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cases_payment_status ON cases(payment_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cases_outstanding ON cases(outstanding_amount DESC) WHERE deleted_at IS NULL AND outstanding_amount > 0;
CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at DESC) WHERE deleted_at IS NULL;

-- =============================================================================
-- PAYMENTS (Financial Transactions for Cases)
-- =============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Payment identification
    payment_reference VARCHAR(100) NOT NULL,
    external_reference VARCHAR(200), -- External payment processor reference

    -- Payment details
    amount DECIMAL(12, 2) NOT NULL CHECK (amount != 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

    -- Payment type
    type VARCHAR(50) NOT NULL DEFAULT 'payment'
        CHECK (type IN (
            'payment',           -- Regular payment
            'deposit',           -- Initial deposit
            'installment',       -- Payment plan installment
            'refund',            -- Money returned to patient
            'adjustment',        -- Manual adjustment
            'financing_payout'   -- Payment from financing provider
        )),

    -- Payment method
    method VARCHAR(50) NOT NULL
        CHECK (method IN (
            'cash',
            'card',
            'bank_transfer',
            'financing',
            'insurance',
            'check',
            'other'
        )),

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',           -- Awaiting processing
            'completed',         -- Successfully processed
            'failed',            -- Processing failed
            'cancelled',         -- Cancelled before processing
            'refunded'           -- Payment refunded
        )),

    -- Processing details
    processed_at TIMESTAMPTZ,
    processor_name VARCHAR(100),
    processor_transaction_id VARCHAR(200),
    failure_reason TEXT,

    -- Receipt
    receipt_number VARCHAR(100),
    receipt_url TEXT,

    -- Notes
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    -- Audit
    received_by UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_payment_reference_per_clinic UNIQUE (clinic_id, payment_reference)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_case ON payments(case_id);
CREATE INDEX IF NOT EXISTS idx_payments_clinic ON payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_processed ON payments(processed_at DESC) WHERE status = 'completed';

-- =============================================================================
-- PAYMENT PLAN (Installment Schedules)
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

    -- Plan details
    name VARCHAR(200) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    number_of_installments INTEGER NOT NULL CHECK (number_of_installments > 0),
    installment_amount DECIMAL(12, 2) NOT NULL,

    -- Frequency
    frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
        CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),

    -- Schedule
    start_date DATE NOT NULL,
    next_due_date DATE,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'defaulted', 'cancelled')),

    -- Progress
    installments_paid INTEGER DEFAULT 0,
    total_paid DECIMAL(12, 2) DEFAULT 0,

    -- Interest/fees (if applicable)
    interest_rate DECIMAL(5, 2) DEFAULT 0,
    late_fee DECIMAL(10, 2) DEFAULT 0,

    -- Notes
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_case ON payment_plans(case_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_next_due ON payment_plans(next_due_date) WHERE status = 'active';

-- =============================================================================
-- PAYMENT PLAN INSTALLMENTS (Individual Scheduled Payments)
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_plan_installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id), -- Linked when paid

    -- Installment details
    installment_number INTEGER NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    due_date DATE NOT NULL,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'overdue', 'skipped', 'cancelled')),

    -- Payment tracking
    paid_at TIMESTAMPTZ,
    paid_amount DECIMAL(12, 2),
    late_fee_applied DECIMAL(10, 2) DEFAULT 0,

    -- Reminders
    reminder_sent_at TIMESTAMPTZ,
    reminder_count INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_installment_per_plan UNIQUE (payment_plan_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_installments_plan ON payment_plan_installments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON payment_plan_installments(due_date) WHERE status IN ('pending', 'overdue');
CREATE INDEX IF NOT EXISTS idx_installments_status ON payment_plan_installments(status);

-- =============================================================================
-- FUNCTIONS: Auto-update case payment status
-- =============================================================================

CREATE OR REPLACE FUNCTION update_case_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid DECIMAL(12, 2);
    v_case_total DECIMAL(12, 2);
    v_payment_status VARCHAR(50);
BEGIN
    -- Calculate total completed payments for the case
    SELECT COALESCE(SUM(
        CASE WHEN type = 'refund' THEN -amount ELSE amount END
    ), 0)
    INTO v_total_paid
    FROM payments
    WHERE case_id = COALESCE(NEW.case_id, OLD.case_id)
    AND status = 'completed';

    -- Get case total
    SELECT total_amount INTO v_case_total
    FROM cases
    WHERE id = COALESCE(NEW.case_id, OLD.case_id);

    -- Determine payment status
    IF v_total_paid <= 0 THEN
        v_payment_status := 'unpaid';
    ELSIF v_total_paid < v_case_total THEN
        v_payment_status := 'partial';
    ELSIF v_total_paid = v_case_total THEN
        v_payment_status := 'paid';
    ELSE
        v_payment_status := 'overpaid';
    END IF;

    -- Update case
    UPDATE cases
    SET paid_amount = v_total_paid,
        payment_status = v_payment_status,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.case_id, OLD.case_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update case totals when payments change
DROP TRIGGER IF EXISTS update_case_payment_totals_trigger ON payments;
CREATE TRIGGER update_case_payment_totals_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_case_payment_totals();

-- =============================================================================
-- FUNCTIONS: Generate case number
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_case_number(p_clinic_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_sequence INTEGER;
    v_case_number VARCHAR(50);
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Get next sequence for this clinic/year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(case_number FROM 'CASE-[0-9]{4}-([0-9]+)') AS INTEGER)
    ), 0) + 1
    INTO v_sequence
    FROM cases
    WHERE clinic_id = p_clinic_id
    AND case_number LIKE 'CASE-' || v_year || '-%';

    v_case_number := 'CASE-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');

    RETURN v_case_number;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_plans_updated_at ON payment_plans;
CREATE TRIGGER update_payment_plans_updated_at
    BEFORE UPDATE ON payment_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_installments_updated_at ON payment_plan_installments;
CREATE TRIGGER update_installments_updated_at
    BEFORE UPDATE ON payment_plan_installments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_installments ENABLE ROW LEVEL SECURITY;

-- Cases: Clinic-scoped access
CREATE POLICY cases_clinic_isolation ON cases
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Payments: Clinic-scoped access
CREATE POLICY payments_clinic_isolation ON payments
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- Payment plans: Access via case ownership
CREATE POLICY payment_plans_via_case ON payment_plans
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM cases
        WHERE cases.id = payment_plans.case_id
        AND cases.clinic_id = current_setting('app.current_clinic_id', true)::UUID
    ));

-- Installments: Access via payment plan ownership
CREATE POLICY installments_via_plan ON payment_plan_installments
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM payment_plans
        JOIN cases ON cases.id = payment_plans.case_id
        WHERE payment_plans.id = payment_plan_installments.payment_plan_id
        AND cases.clinic_id = current_setting('app.current_clinic_id', true)::UUID
    ));

-- =============================================================================
-- VIEWS: LTV and Revenue Analytics
-- =============================================================================

-- Lead Lifetime Value view
CREATE OR REPLACE VIEW lead_ltv AS
SELECT
    l.id AS lead_id,
    l.clinic_id,
    l.full_name,
    l.email,
    l.phone,
    l.created_at AS lead_created_at,
    COUNT(DISTINCT c.id) AS total_cases,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed') AS completed_cases,
    COALESCE(SUM(c.total_amount), 0) AS total_case_value,
    COALESCE(SUM(c.paid_amount), 0) AS total_paid,
    COALESCE(SUM(c.outstanding_amount), 0) AS total_outstanding,
    COALESCE(AVG(c.total_amount), 0) AS avg_case_value,
    MIN(c.created_at) AS first_case_date,
    MAX(c.created_at) AS last_case_date
FROM leads l
LEFT JOIN cases c ON c.lead_id = l.id AND c.deleted_at IS NULL
WHERE l.deleted_at IS NULL
GROUP BY l.id, l.clinic_id, l.full_name, l.email, l.phone, l.created_at;

-- Monthly revenue view
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
    DATE_TRUNC('month', p.processed_at) AS month,
    p.clinic_id,
    COUNT(DISTINCT c.id) AS cases_with_payments,
    COUNT(p.id) AS payment_count,
    SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE 0 END) AS gross_revenue,
    SUM(CASE WHEN p.type = 'refund' THEN p.amount ELSE 0 END) AS refunds,
    SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END) AS net_revenue,
    AVG(p.amount) FILTER (WHERE p.type != 'refund') AS avg_payment_amount
FROM payments p
JOIN cases c ON c.id = p.case_id
WHERE p.status = 'completed'
AND p.processed_at IS NOT NULL
GROUP BY DATE_TRUNC('month', p.processed_at), p.clinic_id
ORDER BY month DESC;

-- Case pipeline view
CREATE OR REPLACE VIEW case_pipeline AS
SELECT
    c.clinic_id,
    c.status,
    c.payment_status,
    COUNT(*) AS case_count,
    SUM(c.total_amount) AS total_value,
    SUM(c.paid_amount) AS paid_value,
    SUM(c.outstanding_amount) AS outstanding_value,
    AVG(c.total_amount) AS avg_case_value
FROM cases c
WHERE c.deleted_at IS NULL
GROUP BY c.clinic_id, c.status, c.payment_status;

COMMENT ON TABLE cases IS 'Links treatment plans to financial transactions - H1 production fix';
COMMENT ON TABLE payments IS 'Individual payment transactions for cases';
COMMENT ON TABLE payment_plans IS 'Installment payment schedules';
COMMENT ON TABLE payment_plan_installments IS 'Individual scheduled installments';
COMMENT ON VIEW lead_ltv IS 'Customer Lifetime Value by lead';
COMMENT ON VIEW monthly_revenue IS 'Monthly revenue aggregation for dashboards';
COMMENT ON VIEW case_pipeline IS 'Case funnel by status and payment status';
