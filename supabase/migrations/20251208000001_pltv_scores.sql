-- ============================================================================
-- MedicalCor Core - pLTV (Predicted Lifetime Value) Scores Table
-- ============================================================================
-- Stores calculated pLTV predictions for leads with full audit trail.
-- Part of the LTV orchestration flow for complete Lead → LTV tracking.
-- ============================================================================

-- =============================================================================
-- PLTV SCORES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_pltv_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Prediction values
    predicted_ltv DECIMAL(12, 2) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE')),
    growth_potential VARCHAR(20) NOT NULL CHECK (growth_potential IN ('HIGH_GROWTH', 'MODERATE_GROWTH', 'STABLE', 'DECLINING')),
    investment_priority VARCHAR(30) NOT NULL CHECK (investment_priority IN ('PRIORITATE_MAXIMA', 'PRIORITATE_RIDICATA', 'PRIORITATE_MEDIE', 'PRIORITATE_SCAZUTA')),
    confidence DECIMAL(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),

    -- Detailed breakdown
    breakdown JSONB NOT NULL DEFAULT '{}',
    reasoning TEXT,

    -- Model metadata
    model_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    method VARCHAR(20) NOT NULL DEFAULT 'rule_based' CHECK (method IN ('ml', 'rule_based', 'hybrid')),

    -- Timestamps
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one score per lead (latest wins via upsert)
    CONSTRAINT unique_pltv_per_lead UNIQUE (lead_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Clinic-level queries
CREATE INDEX IF NOT EXISTS idx_pltv_scores_clinic ON lead_pltv_scores(clinic_id);

-- Tier-based filtering for VIP programs
CREATE INDEX IF NOT EXISTS idx_pltv_scores_tier ON lead_pltv_scores(tier);

-- High-value lead identification (DIAMOND/PLATINUM)
CREATE INDEX IF NOT EXISTS idx_pltv_scores_high_value ON lead_pltv_scores(clinic_id, tier)
    WHERE tier IN ('DIAMOND', 'PLATINUM');

-- Investment priority for outreach
CREATE INDEX IF NOT EXISTS idx_pltv_scores_priority ON lead_pltv_scores(clinic_id, investment_priority);

-- Stale score detection for recalculation
CREATE INDEX IF NOT EXISTS idx_pltv_scores_calculated ON lead_pltv_scores(calculated_at);

-- Growth potential for marketing targeting
CREATE INDEX IF NOT EXISTS idx_pltv_scores_growth ON lead_pltv_scores(clinic_id, growth_potential);

-- =============================================================================
-- PLTV SCORE HISTORY (Audit Trail)
-- =============================================================================
-- Keeps track of how pLTV changes over time for each lead

CREATE TABLE IF NOT EXISTS lead_pltv_score_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL,

    -- Snapshot of prediction at this point in time
    predicted_ltv DECIMAL(12, 2) NOT NULL,
    tier VARCHAR(20) NOT NULL,
    growth_potential VARCHAR(20) NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL,

    -- Change tracking
    previous_ltv DECIMAL(12, 2),
    ltv_change DECIMAL(12, 2),
    ltv_change_percent DECIMAL(8, 4),
    previous_tier VARCHAR(20),
    tier_changed BOOLEAN NOT NULL DEFAULT FALSE,

    -- Trigger for recalculation
    trigger_reason VARCHAR(50) NOT NULL DEFAULT 'scheduled',

    -- Timestamps
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_pltv_history_lead ON lead_pltv_score_history(lead_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pltv_history_clinic ON lead_pltv_score_history(clinic_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pltv_history_tier_changes ON lead_pltv_score_history(clinic_id)
    WHERE tier_changed = TRUE;

-- =============================================================================
-- FUNCTION: Record pLTV Score History
-- =============================================================================

CREATE OR REPLACE FUNCTION record_pltv_history()
RETURNS TRIGGER AS $$
DECLARE
    v_previous_ltv DECIMAL(12, 2);
    v_previous_tier VARCHAR(20);
    v_ltv_change DECIMAL(12, 2);
    v_ltv_change_percent DECIMAL(8, 4);
    v_tier_changed BOOLEAN;
BEGIN
    -- Get previous values if this is an update
    IF TG_OP = 'UPDATE' THEN
        v_previous_ltv := OLD.predicted_ltv;
        v_previous_tier := OLD.tier;
        v_ltv_change := NEW.predicted_ltv - OLD.predicted_ltv;
        v_ltv_change_percent := CASE
            WHEN OLD.predicted_ltv > 0 THEN (v_ltv_change / OLD.predicted_ltv) * 100
            ELSE 0
        END;
        v_tier_changed := OLD.tier != NEW.tier;
    ELSE
        -- For inserts, no previous values
        v_previous_ltv := NULL;
        v_previous_tier := NULL;
        v_ltv_change := NULL;
        v_ltv_change_percent := NULL;
        v_tier_changed := FALSE;
    END IF;

    -- Insert history record
    INSERT INTO lead_pltv_score_history (
        lead_id, clinic_id, predicted_ltv, tier, growth_potential, confidence,
        previous_ltv, ltv_change, ltv_change_percent, previous_tier, tier_changed,
        trigger_reason, calculated_at
    ) VALUES (
        NEW.lead_id, NEW.clinic_id, NEW.predicted_ltv, NEW.tier, NEW.growth_potential, NEW.confidence,
        v_previous_ltv, v_ltv_change, v_ltv_change_percent, v_previous_tier, v_tier_changed,
        COALESCE(NEW.breakdown->>'reason', 'recalculation'), NEW.calculated_at
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to record history on insert/update
DROP TRIGGER IF EXISTS record_pltv_history_trigger ON lead_pltv_scores;
CREATE TRIGGER record_pltv_history_trigger
    AFTER INSERT OR UPDATE ON lead_pltv_scores
    FOR EACH ROW
    EXECUTE FUNCTION record_pltv_history();

-- =============================================================================
-- FUNCTION: Update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_pltv_scores_updated_at ON lead_pltv_scores;
CREATE TRIGGER update_pltv_scores_updated_at
    BEFORE UPDATE ON lead_pltv_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE lead_pltv_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_pltv_score_history ENABLE ROW LEVEL SECURITY;

-- pLTV scores: Clinic-scoped access
CREATE POLICY pltv_scores_clinic_isolation ON lead_pltv_scores
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- History: Clinic-scoped access
CREATE POLICY pltv_history_clinic_isolation ON lead_pltv_score_history
    FOR ALL
    USING (clinic_id = current_setting('app.current_clinic_id', true)::UUID);

-- =============================================================================
-- VIEWS: pLTV Analytics
-- =============================================================================

-- Clinic pLTV summary view
CREATE OR REPLACE VIEW clinic_pltv_summary AS
SELECT
    clinic_id,
    COUNT(*) AS total_scored_leads,
    COUNT(*) FILTER (WHERE tier = 'DIAMOND') AS diamond_leads,
    COUNT(*) FILTER (WHERE tier = 'PLATINUM') AS platinum_leads,
    COUNT(*) FILTER (WHERE tier = 'GOLD') AS gold_leads,
    COUNT(*) FILTER (WHERE tier = 'SILVER') AS silver_leads,
    COUNT(*) FILTER (WHERE tier = 'BRONZE') AS bronze_leads,
    ROUND(AVG(predicted_ltv), 2) AS avg_predicted_ltv,
    ROUND(AVG(confidence), 4) AS avg_confidence,
    SUM(predicted_ltv) AS total_predicted_ltv,
    COUNT(*) FILTER (WHERE growth_potential = 'HIGH_GROWTH') AS high_growth_leads,
    COUNT(*) FILTER (WHERE investment_priority = 'PRIORITATE_MAXIMA') AS priority_leads,
    MAX(calculated_at) AS last_calculation
FROM lead_pltv_scores
GROUP BY clinic_id;

-- Lead pLTV with current actual LTV for comparison
CREATE OR REPLACE VIEW lead_pltv_comparison AS
SELECT
    lps.lead_id,
    lps.clinic_id,
    l.full_name,
    l.email,
    lps.predicted_ltv,
    lps.tier AS predicted_tier,
    lps.confidence,
    lps.growth_potential,
    lps.investment_priority,
    COALESCE(ltv.total_paid, 0) AS actual_ltv,
    ROUND(lps.predicted_ltv - COALESCE(ltv.total_paid, 0), 2) AS ltv_gap,
    CASE
        WHEN COALESCE(ltv.total_paid, 0) = 0 THEN NULL
        ELSE ROUND(((lps.predicted_ltv - ltv.total_paid) / ltv.total_paid) * 100, 2)
    END AS ltv_gap_percent,
    lps.calculated_at,
    ltv.last_case_date
FROM lead_pltv_scores lps
JOIN leads l ON l.id = lps.lead_id
LEFT JOIN lead_ltv ltv ON ltv.lead_id = lps.lead_id
WHERE l.deleted_at IS NULL;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE lead_pltv_scores IS 'Predicted Lifetime Value scores for leads - part of LTV orchestration';
COMMENT ON TABLE lead_pltv_score_history IS 'Audit trail of pLTV score changes over time';
COMMENT ON VIEW clinic_pltv_summary IS 'Aggregate pLTV metrics per clinic';
COMMENT ON VIEW lead_pltv_comparison IS 'Compare predicted LTV vs actual LTV for leads';
