-- ============================================================================
-- MedicalCor Core - Disposition Codes Schema
-- ============================================================================
-- M1 Fix: Disposition codes for call outcome tracking
-- Provides comprehensive call outcome categorization for analytics and follow-up
-- ============================================================================

-- =============================================================================
-- DISPOSITION CODES (Reference Table)
-- =============================================================================
-- Standard disposition codes that can be assigned to calls
-- These are configurable per clinic and follow industry standards

CREATE TABLE IF NOT EXISTS disposition_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID,  -- NULL for system-wide codes

    -- Code identification
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Categorization
    category VARCHAR(50) NOT NULL
        CHECK (category IN (
            'connected',       -- Customer was reached
            'not_connected',   -- Customer was not reached
            'follow_up',       -- Requires follow-up action
            'completed',       -- Call objective achieved
            'disqualified'     -- Lead disqualified
        )),

    -- Outcome classification
    is_positive_outcome BOOLEAN DEFAULT false,  -- Did this achieve the call objective?
    requires_follow_up BOOLEAN DEFAULT false,   -- Should a follow-up task be created?
    follow_up_days INTEGER,                     -- Days until follow-up (if applicable)

    -- Status
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_disposition_code UNIQUE (clinic_id, code)
);

CREATE INDEX IF NOT EXISTS idx_disposition_codes_clinic ON disposition_codes(clinic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_disposition_codes_category ON disposition_codes(category) WHERE is_active = true;

-- =============================================================================
-- CALL DISPOSITIONS (Individual Call Outcomes)
-- =============================================================================
-- Records the disposition set for each call

CREATE TABLE IF NOT EXISTS call_dispositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Call identification
    call_sid VARCHAR(100) NOT NULL,
    clinic_id UUID NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

    -- Disposition
    disposition_code_id UUID NOT NULL REFERENCES disposition_codes(id) ON DELETE RESTRICT,

    -- Additional context
    sub_disposition VARCHAR(100),     -- Optional sub-categorization
    reason TEXT,                      -- Agent notes on why this disposition
    notes TEXT,                       -- Additional notes

    -- Call metadata
    call_duration_seconds INTEGER,
    call_direction VARCHAR(20) CHECK (call_direction IN ('inbound', 'outbound')),
    call_type VARCHAR(50),            -- e.g., 'sales', 'support', 'follow_up'

    -- Agent/AI info
    handled_by_type VARCHAR(20) NOT NULL CHECK (handled_by_type IN ('ai', 'human', 'hybrid')),
    agent_id VARCHAR(100),            -- Human agent ID if applicable
    assistant_id VARCHAR(100),        -- AI assistant ID if applicable

    -- Objections/Intent tracking
    objections_handled JSONB DEFAULT '[]',  -- Array of objection codes
    detected_intent VARCHAR(100),           -- AI-detected customer intent
    intent_confidence DECIMAL(3, 2),        -- Confidence score 0-1

    -- Follow-up
    follow_up_scheduled BOOLEAN DEFAULT false,
    follow_up_date DATE,
    follow_up_notes TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Audit
    set_by UUID,                      -- User who set the disposition
    set_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_call_disposition UNIQUE (call_sid)
);

CREATE INDEX IF NOT EXISTS idx_call_dispositions_clinic ON call_dispositions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_lead ON call_dispositions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_code ON call_dispositions(disposition_code_id);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_date ON call_dispositions(set_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_dispositions_follow_up ON call_dispositions(follow_up_date)
    WHERE follow_up_scheduled = true AND follow_up_date IS NOT NULL;

-- =============================================================================
-- SEED DATA: Default System Disposition Codes
-- =============================================================================

INSERT INTO disposition_codes (clinic_id, code, name, description, category, is_positive_outcome, requires_follow_up, follow_up_days, display_order)
VALUES
    -- Connected - Positive
    (NULL, 'SOLD', 'Sale Completed', 'Customer agreed to proceed with treatment', 'completed', true, false, NULL, 10),
    (NULL, 'APPT_SCHEDULED', 'Appointment Scheduled', 'Customer scheduled a consultation or treatment', 'completed', true, false, NULL, 20),
    (NULL, 'INTERESTED', 'Interested', 'Customer expressed interest, needs more information', 'follow_up', true, true, 3, 30),
    (NULL, 'INFO_SENT', 'Information Sent', 'Sent requested information to customer', 'follow_up', true, true, 2, 40),

    -- Connected - Neutral
    (NULL, 'CALLBACK_REQUESTED', 'Callback Requested', 'Customer requested a callback at specific time', 'follow_up', false, true, 1, 50),
    (NULL, 'DECISION_PENDING', 'Decision Pending', 'Customer needs time to decide', 'follow_up', false, true, 7, 60),
    (NULL, 'PRICE_OBJECTION', 'Price Objection', 'Customer concerned about pricing', 'follow_up', false, true, 5, 70),

    -- Connected - Negative
    (NULL, 'NOT_INTERESTED', 'Not Interested', 'Customer explicitly not interested', 'disqualified', false, false, NULL, 80),
    (NULL, 'COMPETITOR', 'Chose Competitor', 'Customer went with another provider', 'disqualified', false, false, NULL, 90),
    (NULL, 'NOT_QUALIFIED', 'Not Qualified', 'Customer does not meet criteria', 'disqualified', false, false, NULL, 100),
    (NULL, 'DO_NOT_CALL', 'Do Not Call', 'Customer requested no further contact', 'disqualified', false, false, NULL, 110),

    -- Not Connected
    (NULL, 'NO_ANSWER', 'No Answer', 'Call not answered', 'not_connected', false, true, 1, 120),
    (NULL, 'BUSY', 'Busy', 'Line was busy', 'not_connected', false, true, 1, 130),
    (NULL, 'VOICEMAIL', 'Voicemail', 'Left voicemail message', 'not_connected', false, true, 2, 140),
    (NULL, 'WRONG_NUMBER', 'Wrong Number', 'Incorrect phone number', 'not_connected', false, false, NULL, 150),
    (NULL, 'DISCONNECTED', 'Disconnected', 'Number no longer in service', 'disqualified', false, false, NULL, 160),
    (NULL, 'INVALID_NUMBER', 'Invalid Number', 'Phone number format invalid', 'disqualified', false, false, NULL, 170),

    -- Technical/Other
    (NULL, 'TRANSFERRED', 'Transferred', 'Call transferred to another agent/department', 'connected', false, false, NULL, 180),
    (NULL, 'CALL_FAILED', 'Call Failed', 'Technical failure during call', 'not_connected', false, true, 1, 190),
    (NULL, 'ABANDONED', 'Abandoned', 'Customer hung up before speaking', 'not_connected', false, true, 1, 200)
ON CONFLICT (clinic_id, code) DO NOTHING;

-- =============================================================================
-- VIEWS: Disposition Analytics
-- =============================================================================

-- Disposition summary by code
CREATE OR REPLACE VIEW disposition_summary AS
SELECT
    cd.clinic_id,
    dc.code,
    dc.name,
    dc.category,
    dc.is_positive_outcome,
    COUNT(*) AS call_count,
    COUNT(*) FILTER (WHERE cd.handled_by_type = 'ai') AS ai_handled,
    COUNT(*) FILTER (WHERE cd.handled_by_type = 'human') AS human_handled,
    COUNT(*) FILTER (WHERE cd.handled_by_type = 'hybrid') AS hybrid_handled,
    AVG(cd.call_duration_seconds) AS avg_duration_seconds,
    COUNT(*) FILTER (WHERE cd.follow_up_scheduled) AS follow_ups_scheduled
FROM call_dispositions cd
JOIN disposition_codes dc ON dc.id = cd.disposition_code_id
GROUP BY cd.clinic_id, dc.code, dc.name, dc.category, dc.is_positive_outcome;

-- Daily disposition trends
CREATE OR REPLACE VIEW daily_disposition_trends AS
SELECT
    cd.clinic_id,
    DATE_TRUNC('day', cd.set_at) AS date,
    dc.category,
    COUNT(*) AS total_calls,
    COUNT(*) FILTER (WHERE dc.is_positive_outcome) AS positive_outcomes,
    ROUND(
        COUNT(*) FILTER (WHERE dc.is_positive_outcome)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS positive_rate
FROM call_dispositions cd
JOIN disposition_codes dc ON dc.id = cd.disposition_code_id
GROUP BY cd.clinic_id, DATE_TRUNC('day', cd.set_at), dc.category
ORDER BY date DESC;

-- Agent performance by disposition
CREATE OR REPLACE VIEW agent_disposition_performance AS
SELECT
    cd.clinic_id,
    cd.agent_id,
    COUNT(*) AS total_calls,
    COUNT(*) FILTER (WHERE dc.is_positive_outcome) AS positive_outcomes,
    COUNT(*) FILTER (WHERE dc.category = 'completed') AS completed_calls,
    COUNT(*) FILTER (WHERE dc.category = 'follow_up') AS follow_up_calls,
    ROUND(
        COUNT(*) FILTER (WHERE dc.is_positive_outcome)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS conversion_rate,
    AVG(cd.call_duration_seconds) AS avg_call_duration
FROM call_dispositions cd
JOIN disposition_codes dc ON dc.id = cd.disposition_code_id
WHERE cd.agent_id IS NOT NULL
GROUP BY cd.clinic_id, cd.agent_id;

-- =============================================================================
-- FUNCTIONS: Disposition Helpers
-- =============================================================================

-- Get next follow-up date based on disposition code
CREATE OR REPLACE FUNCTION get_follow_up_date(p_disposition_code_id UUID)
RETURNS DATE AS $$
DECLARE
    v_follow_up_days INTEGER;
BEGIN
    SELECT follow_up_days INTO v_follow_up_days
    FROM disposition_codes
    WHERE id = p_disposition_code_id AND requires_follow_up = true;

    IF v_follow_up_days IS NOT NULL THEN
        RETURN CURRENT_DATE + v_follow_up_days;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_disposition_codes_updated_at ON disposition_codes;
CREATE TRIGGER update_disposition_codes_updated_at
    BEFORE UPDATE ON disposition_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE disposition_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_dispositions ENABLE ROW LEVEL SECURITY;

-- Disposition codes: Clinic-scoped or system-wide
CREATE POLICY disposition_codes_access ON disposition_codes
    FOR ALL
    USING (
        clinic_id IS NULL OR
        clinic_id = current_setting('app.current_clinic_id', true)::UUID
    );

-- Call dispositions: Clinic-scoped access
CREATE POLICY call_dispositions_clinic_isolation ON call_dispositions
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE disposition_codes IS 'M1: Standard disposition codes for call outcome categorization';
COMMENT ON TABLE call_dispositions IS 'M1: Individual call disposition records for analytics';
COMMENT ON VIEW disposition_summary IS 'M1: Aggregated disposition statistics by code';
COMMENT ON VIEW daily_disposition_trends IS 'M1: Daily trends in call dispositions';
COMMENT ON VIEW agent_disposition_performance IS 'M1: Agent performance metrics by disposition';
