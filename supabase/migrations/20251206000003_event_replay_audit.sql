-- ============================================================================
-- Event Sourcing Replay Audit Tables (M6/H7)
-- ============================================================================
-- Provides infrastructure for:
-- - Replay audit logging
-- - Projection checkpoints with PostgreSQL persistence
-- - State reconstruction tracking
-- ============================================================================

-- Replay Audit Log
-- Tracks all replay operations for compliance and debugging
CREATE TABLE IF NOT EXISTS replay_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN (
    'state_reconstruction',
    'projection_rebuild',
    'event_timeline_query',
    'state_verification',
    'state_diff',
    'full_replay',
    'partial_replay'
  )),
  status VARCHAR(20) NOT NULL CHECK (status IN (
    'started',
    'in_progress',
    'completed',
    'failed',
    'cancelled'
  )) DEFAULT 'started',
  aggregate_id VARCHAR(255),
  aggregate_type VARCHAR(255),
  projection_name VARCHAR(255),
  initiated_by VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255),
  correlation_id VARCHAR(255) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,
  progress JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE replay_audit_log IS 'Audit trail for all event sourcing replay operations (M6/H7)';
COMMENT ON COLUMN replay_audit_log.operation_type IS 'Type of replay operation performed';
COMMENT ON COLUMN replay_audit_log.status IS 'Current status of the replay operation';
COMMENT ON COLUMN replay_audit_log.initiated_by IS 'User or system that initiated the replay';
COMMENT ON COLUMN replay_audit_log.parameters IS 'Parameters used for the replay operation';
COMMENT ON COLUMN replay_audit_log.result IS 'Result of the replay operation if completed';
COMMENT ON COLUMN replay_audit_log.error IS 'Error details if the operation failed';
COMMENT ON COLUMN replay_audit_log.progress IS 'Progress information for long-running operations';

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_replay_audit_aggregate
ON replay_audit_log (aggregate_id, started_at DESC)
WHERE aggregate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_replay_audit_projection
ON replay_audit_log (projection_name, started_at DESC)
WHERE projection_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_replay_audit_user
ON replay_audit_log (initiated_by, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_audit_correlation
ON replay_audit_log (correlation_id);

CREATE INDEX IF NOT EXISTS idx_replay_audit_time
ON replay_audit_log (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_audit_status
ON replay_audit_log (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_audit_tenant
ON replay_audit_log (tenant_id, started_at DESC)
WHERE tenant_id IS NOT NULL;

-- Projection Checkpoints (enhanced version)
-- Stores checkpoint data for resumable projection replays
CREATE TABLE IF NOT EXISTS projection_checkpoints_v2 (
  projection_name VARCHAR(255) NOT NULL,
  projection_version INTEGER NOT NULL,
  last_event_id VARCHAR(255) NOT NULL,
  last_event_timestamp TIMESTAMPTZ NOT NULL,
  events_processed BIGINT NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'idle' CHECK (status IN (
    'idle',
    'running',
    'paused',
    'error',
    'rebuilding'
  )),
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (projection_name, projection_version)
);

COMMENT ON TABLE projection_checkpoints_v2 IS 'Checkpoint data for resumable projection replays (M6/H7)';
COMMENT ON COLUMN projection_checkpoints_v2.status IS 'Current status of the projection checkpoint';
COMMENT ON COLUMN projection_checkpoints_v2.events_processed IS 'Total number of events processed';
COMMENT ON COLUMN projection_checkpoints_v2.state IS 'Serialized projection state at checkpoint';

CREATE INDEX IF NOT EXISTS idx_checkpoints_v2_updated
ON projection_checkpoints_v2 (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_v2_status
ON projection_checkpoints_v2 (status);

-- State Reconstruction Log
-- Tracks point-in-time state reconstructions for audit purposes
CREATE TABLE IF NOT EXISTS state_reconstruction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  reconstruction_timestamp TIMESTAMPTZ,
  reconstruction_version INTEGER,
  reconstruction_event_id VARCHAR(255),
  events_replayed INTEGER NOT NULL DEFAULT 0,
  snapshot_used BOOLEAN NOT NULL DEFAULT false,
  snapshot_version INTEGER,
  duration_ms INTEGER NOT NULL,
  state_hash VARCHAR(64),
  initiated_by VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE state_reconstruction_log IS 'Log of point-in-time state reconstructions for audit (M6/H7)';
COMMENT ON COLUMN state_reconstruction_log.state_hash IS 'SHA-256 hash of reconstructed state for verification';
COMMENT ON COLUMN state_reconstruction_log.reason IS 'Reason for performing the reconstruction';

CREATE INDEX IF NOT EXISTS idx_reconstruction_aggregate
ON state_reconstruction_log (aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconstruction_type
ON state_reconstruction_log (aggregate_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconstruction_user
ON state_reconstruction_log (initiated_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconstruction_correlation
ON state_reconstruction_log (correlation_id);

-- State Verification Results
-- Stores results of state consistency checks
CREATE TABLE IF NOT EXISTS state_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  is_consistent BOOLEAN NOT NULL,
  differences_count INTEGER NOT NULL DEFAULT 0,
  differences JSONB,
  reconstructed_version INTEGER NOT NULL,
  recommendation TEXT,
  initiated_by VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE state_verification_results IS 'Results of state consistency verifications (M6/H7)';
COMMENT ON COLUMN state_verification_results.differences IS 'Array of differences found between current and reconstructed state';
COMMENT ON COLUMN state_verification_results.recommendation IS 'Recommended action based on verification result';

CREATE INDEX IF NOT EXISTS idx_verification_aggregate
ON state_verification_results (aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_inconsistent
ON state_verification_results (is_consistent, created_at DESC)
WHERE is_consistent = false;

-- Update trigger for projection checkpoints
CREATE OR REPLACE FUNCTION update_checkpoint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_checkpoint_timestamp ON projection_checkpoints_v2;
CREATE TRIGGER trigger_checkpoint_timestamp
  BEFORE UPDATE ON projection_checkpoints_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_checkpoint_timestamp();

-- Function to get replay statistics
CREATE OR REPLACE FUNCTION get_replay_statistics(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  operation_type VARCHAR(50),
  total_operations BIGINT,
  successful_operations BIGINT,
  failed_operations BIGINT,
  avg_duration_ms NUMERIC,
  total_events_processed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ral.operation_type,
    COUNT(*) as total_operations,
    COUNT(*) FILTER (WHERE ral.status = 'completed') as successful_operations,
    COUNT(*) FILTER (WHERE ral.status = 'failed') as failed_operations,
    AVG((ral.result->>'durationMs')::NUMERIC) FILTER (WHERE ral.result IS NOT NULL) as avg_duration_ms,
    SUM((ral.result->>'eventsProcessed')::BIGINT) FILTER (WHERE ral.result IS NOT NULL) as total_events_processed
  FROM replay_audit_log ral
  WHERE ral.started_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY ral.operation_type;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_replay_statistics IS 'Returns replay operation statistics for the specified number of days';

-- Function to find potentially inconsistent aggregates
CREATE OR REPLACE FUNCTION find_inconsistent_aggregates(
  p_aggregate_type VARCHAR DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  aggregate_id VARCHAR(255),
  aggregate_type VARCHAR(255),
  last_verification_at TIMESTAMPTZ,
  differences_count INTEGER,
  recommendation TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (svr.aggregate_id)
    svr.aggregate_id,
    svr.aggregate_type,
    svr.created_at as last_verification_at,
    svr.differences_count,
    svr.recommendation
  FROM state_verification_results svr
  WHERE svr.is_consistent = false
    AND (p_aggregate_type IS NULL OR svr.aggregate_type = p_aggregate_type)
  ORDER BY svr.aggregate_id, svr.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_inconsistent_aggregates IS 'Finds aggregates that have failed consistency checks';

-- Cleanup function for old audit entries
CREATE OR REPLACE FUNCTION cleanup_replay_audit(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM replay_audit_log
    WHERE started_at < NOW() - (p_retention_days || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_replay_audit IS 'Cleans up old replay audit entries based on retention policy';

-- Grant permissions (adjust roles as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON replay_audit_log TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON projection_checkpoints_v2 TO authenticated;
-- GRANT SELECT, INSERT ON state_reconstruction_log TO authenticated;
-- GRANT SELECT, INSERT ON state_verification_results TO authenticated;
