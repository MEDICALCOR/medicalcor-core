-- migrate:up
-- ============================================================================
-- Saga Store for Distributed Transaction Management
--
-- Provides durable saga persistence to survive process restarts.
-- Sagas coordinate multi-step business processes (e.g., lead onboarding,
-- appointment scheduling) with compensation logic for rollback.
--
-- Benefits:
-- - Saga state survives process restarts
-- - Enables saga recovery on application startup
-- - Audit trail for distributed transactions
-- - Supports compensation (rollback) workflows
-- ============================================================================

CREATE TABLE saga_store (
    -- Primary identification
    saga_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_type VARCHAR(100) NOT NULL,
    correlation_id UUID NOT NULL,

    -- Saga state and progress
    state JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,

    -- Execution history for debugging
    step_history JSONB DEFAULT '[]',

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,

    -- Error handling
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(255),

    -- Status validation
    CONSTRAINT valid_saga_status CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'compensating', 'compensated', 'timeout')
    )
);

-- Correlation lookup (find saga by business process ID)
CREATE INDEX idx_saga_correlation ON saga_store(correlation_id);

-- Type-based queries
CREATE INDEX idx_saga_type ON saga_store(saga_type);

-- Find sagas needing attention (pending, running, compensating)
CREATE INDEX idx_saga_status_active ON saga_store(status, updated_at)
WHERE status IN ('pending', 'running', 'compensating');

-- Timeout detection
CREATE INDEX idx_saga_timeout ON saga_store(timeout_at)
WHERE status IN ('pending', 'running') AND timeout_at IS NOT NULL;

-- Cleanup: find old completed sagas
CREATE INDEX idx_saga_completed ON saga_store(completed_at)
WHERE status IN ('completed', 'failed', 'compensated');

-- Combined query for saga recovery on startup
CREATE INDEX idx_saga_recovery ON saga_store(saga_type, status, started_at)
WHERE status IN ('pending', 'running', 'compensating');

-- ============================================================================
-- Trigger to automatically update updated_at
-- ============================================================================

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

-- ============================================================================
-- Helper function to append step to history
-- ============================================================================

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

-- migrate:down
DROP FUNCTION IF EXISTS append_saga_step(UUID, VARCHAR, JSONB);
DROP TRIGGER IF EXISTS trg_saga_updated_at ON saga_store;
DROP FUNCTION IF EXISTS update_saga_updated_at();
DROP TABLE IF EXISTS saga_store;
