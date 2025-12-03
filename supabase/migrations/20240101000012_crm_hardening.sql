-- ============================================================================
-- MedicalCor Core - CRM Hardening
-- ============================================================================
-- Source: infra/migrations/008-crm-hardening.sql
-- Constraints, Foreign Keys, Checks & Indexes for CRM tables
-- ============================================================================

-- =============================================================================
-- LEADS - FKs, Checks, Unique
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinics') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leads_clinic_fk') THEN
            ALTER TABLE leads ADD CONSTRAINT leads_clinic_fk
                FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leads_assigned_agent_fk') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_assigned_agent_fk
            FOREIGN KEY (assigned_agent_id) REFERENCES practitioners(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_ai_score_range') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_ai_score_range CHECK (ai_score BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_valid') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_status_valid CHECK (status IS NULL OR length(trim(status)) > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_external_contact_unique') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_external_contact_unique UNIQUE (external_source, external_contact_id);
    END IF;
END $$;

-- =============================================================================
-- INTERACTIONS - Checks & Unique
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_sentiment_range') THEN
        ALTER TABLE interactions ADD CONSTRAINT interactions_sentiment_range
            CHECK (ai_sentiment_score IS NULL OR (ai_sentiment_score >= -1.0 AND ai_sentiment_score <= 1.0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_provider_external_unique') THEN
        ALTER TABLE interactions ADD CONSTRAINT interactions_provider_external_unique UNIQUE (provider, external_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_interactions_provider_external ON interactions(provider, external_id);

-- =============================================================================
-- TREATMENT PLANS - FKs, Checks, Unique
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'treatment_plans_doctor_fk') THEN
        ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_doctor_fk
            FOREIGN KEY (doctor_id) REFERENCES practitioners(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_probability_range') THEN
        ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_probability_range CHECK (probability BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_total_value_non_negative') THEN
        ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_total_value_non_negative CHECK (total_value IS NULL OR total_value >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_external_deal_unique') THEN
        ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_external_deal_unique UNIQUE (external_deal_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_lead_stage ON treatment_plans(lead_id, stage);

-- =============================================================================
-- TREATMENT_PLAN_ITEMS - Checks & Index
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tpi_quantity_positive') THEN
        ALTER TABLE treatment_plan_items ADD CONSTRAINT tpi_quantity_positive CHECK (quantity > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tpi_price_non_negative') THEN
        ALTER TABLE treatment_plan_items ADD CONSTRAINT tpi_price_non_negative
            CHECK (unit_price >= 0 AND discount >= 0 AND total_price >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan ON treatment_plan_items(treatment_plan_id);

-- =============================================================================
-- LEAD_EVENTS - Index & Check
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_lead_events_timeline ON lead_events(lead_id, event_type, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_events_type_valid') THEN
        ALTER TABLE lead_events ADD CONSTRAINT lead_events_type_valid CHECK (length(trim(event_type)) > 0);
    END IF;
END $$;
