-- ============================================================================
-- MedicalCor Core - Saga Store
-- ============================================================================
-- Source: db/migrations/20241202000003_add_saga_store.sql
-- Distributed Transaction Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS saga_store (
    saga_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_type VARCHAR(100) NOT NULL,
    correlation_id UUID NOT NULL,
    state JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    step_history JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(255),

    CONSTRAINT valid_saga_status CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'compensating', 'compensated', 'timeout')
    )
);

CREATE INDEX IF NOT EXISTS idx_saga_correlation ON saga_store(correlation_id);
CREATE INDEX IF NOT EXISTS idx_saga_type ON saga_store(saga_type);
CREATE INDEX IF NOT EXISTS idx_saga_status_active ON saga_store(status, updated_at) WHERE status IN ('pending', 'running', 'compensating');
CREATE INDEX IF NOT EXISTS idx_saga_timeout ON saga_store(timeout_at) WHERE status IN ('pending', 'running') AND timeout_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saga_completed ON saga_store(completed_at) WHERE status IN ('completed', 'failed', 'compensated');
CREATE INDEX IF NOT EXISTS idx_saga_recovery ON saga_store(saga_type, status, started_at) WHERE status IN ('pending', 'running', 'compensating');

-- =============================================================================
-- Functions
-- =============================================================================
CREATE OR REPLACE FUNCTION update_saga_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_saga_updated_at
    BEFORE UPDATE ON saga_store
    FOR EACH ROW
    EXECUTE FUNCTION update_saga_updated_at();

CREATE OR REPLACE FUNCTION append_saga_step(
    p_saga_id UUID,
    p_step_name VARCHAR,
    p_step_data JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    UPDATE saga_store
    SET step_history = step_history || jsonb_build_object(
        'step', p_step_name,
        'timestamp', NOW(),
        'data', p_step_data
    )
    WHERE saga_id = p_saga_id;
END;
$$ LANGUAGE plpgsql;
