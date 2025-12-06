-- =============================================================================
-- Bulk Lead Import Tables
-- L3 Feature: Onboarding efficiency through bulk lead import
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bulk Import Jobs Table
-- Tracks async import jobs and their progress
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bulk_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
    format VARCHAR(10) CHECK (format IN ('csv', 'json')),

    -- Progress counters
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    skip_count INTEGER NOT NULL DEFAULT 0,

    -- Options (stored as JSON)
    options JSONB,

    -- Error summary (aggregated error codes)
    error_summary JSONB,

    -- Actor tracking
    created_by VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bulk_import_jobs
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_clinic_id
    ON bulk_import_jobs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_status
    ON bulk_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_created_at
    ON bulk_import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_created_by
    ON bulk_import_jobs(created_by);

-- -----------------------------------------------------------------------------
-- Bulk Import Row Results Table
-- Stores individual row processing results for debugging and reporting
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bulk_import_row_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,

    -- Row identification
    row_number INTEGER NOT NULL,

    -- Result
    success BOOLEAN NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    external_contact_id VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    action VARCHAR(20) CHECK (action IN ('created', 'updated', 'skipped')),

    -- Error details (if failed)
    error_code VARCHAR(50),
    error_message TEXT,
    error_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bulk_import_row_results
CREATE INDEX IF NOT EXISTS idx_bulk_import_row_results_job_id
    ON bulk_import_row_results(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_row_results_success
    ON bulk_import_row_results(job_id, success);
CREATE INDEX IF NOT EXISTS idx_bulk_import_row_results_row_number
    ON bulk_import_row_results(job_id, row_number);
CREATE INDEX IF NOT EXISTS idx_bulk_import_row_results_error_code
    ON bulk_import_row_results(error_code) WHERE error_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Trigger for updated_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_bulk_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bulk_import_jobs_updated_at ON bulk_import_jobs;
CREATE TRIGGER trg_bulk_import_jobs_updated_at
    BEFORE UPDATE ON bulk_import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_bulk_import_jobs_updated_at();

-- -----------------------------------------------------------------------------
-- RLS Policies
-- -----------------------------------------------------------------------------

ALTER TABLE bulk_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_row_results ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own clinic's import jobs
CREATE POLICY bulk_import_jobs_clinic_access ON bulk_import_jobs
    FOR ALL
    USING (
        clinic_id IS NULL OR
        clinic_id IN (
            SELECT clinic_id FROM practitioners
            WHERE user_id = auth.uid()
        )
    );

-- Allow access to row results for accessible jobs
CREATE POLICY bulk_import_row_results_job_access ON bulk_import_row_results
    FOR ALL
    USING (
        job_id IN (
            SELECT id FROM bulk_import_jobs
            WHERE clinic_id IS NULL OR
            clinic_id IN (
                SELECT clinic_id FROM practitioners
                WHERE user_id = auth.uid()
            )
        )
    );

-- -----------------------------------------------------------------------------
-- Add bulk_import_jobs to lead_events audit trail
-- -----------------------------------------------------------------------------

-- Add new event types for bulk import
DO $$
BEGIN
    -- This just documents the new event types
    -- They're validated in the application layer
    COMMENT ON TABLE lead_events IS
        'Lead audit trail. Event types include: lead_created, lead_updated, lead_scored, ' ||
        'lead_qualified, lead_assigned, treatment_plan_created, treatment_plan_updated, ' ||
        'interaction_added, status_changed, gdpr_consent_recorded, bulk_import_created, bulk_import_updated';
END $$;

-- -----------------------------------------------------------------------------
-- Function to cleanup old import jobs (retention policy)
-- Jobs older than 90 days are removed
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanup_old_bulk_import_jobs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM bulk_import_jobs
        WHERE completed_at < NOW() - INTERVAL '90 days'
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment
COMMENT ON FUNCTION cleanup_old_bulk_import_jobs IS
    'Removes bulk import jobs older than 90 days. Call via cron job.';
