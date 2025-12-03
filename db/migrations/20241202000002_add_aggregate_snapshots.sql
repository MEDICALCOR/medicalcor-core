-- migrate:up
-- ============================================================================
-- Aggregate Snapshots for Event Sourcing Performance
--
-- This table stores periodic snapshots of aggregate state to avoid replaying
-- the full event history. Snapshots are created every N events (configurable,
-- typically 100) and enable O(1) aggregate loading instead of O(n).
--
-- Benefits:
-- - Faster aggregate reconstruction (only replay events since last snapshot)
-- - Reduced database load during high-traffic periods
-- - Enables archival of old events without losing aggregate state
-- ============================================================================

CREATE TABLE aggregate_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Aggregate identification
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,

    -- Snapshot version (corresponds to the event version this snapshot was taken at)
    version INTEGER NOT NULL,

    -- Serialized aggregate state
    state JSONB NOT NULL,

    -- Metadata for debugging and auditing
    events_since_last_snapshot INTEGER DEFAULT 0,
    snapshot_trigger VARCHAR(50) DEFAULT 'interval', -- 'interval', 'manual', 'migration'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure we only have one snapshot per aggregate at each version
    CONSTRAINT uq_aggregate_version UNIQUE(aggregate_id, version)
);

-- Primary lookup: get latest snapshot for an aggregate
CREATE INDEX idx_snapshots_aggregate_latest
ON aggregate_snapshots(aggregate_id, version DESC);

-- Type-based queries for analytics
CREATE INDEX idx_snapshots_aggregate_type
ON aggregate_snapshots(aggregate_type);

-- Cleanup: find old snapshots for archival
CREATE INDEX idx_snapshots_created_at
ON aggregate_snapshots(created_at);

-- ============================================================================
-- Event Schema Registry for Event Versioning
--
-- Tracks registered event schemas and their versions to enable:
-- - Backward compatibility for event consumers
-- - Event upcasting (migration from old versions to new)
-- - Schema validation before event storage
-- ============================================================================

CREATE TABLE event_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event identification
    event_type VARCHAR(200) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,

    -- JSON Schema for validation
    schema JSONB NOT NULL,

    -- Migration function name (if any) for upcasting to next version
    migration_handler VARCHAR(200),

    -- Metadata
    description TEXT,
    deprecated BOOLEAN DEFAULT false,
    deprecated_at TIMESTAMPTZ,
    deprecated_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique version per event type
    CONSTRAINT uq_event_type_version UNIQUE(event_type, version)
);

-- Lookup by event type
CREATE INDEX idx_event_schemas_type
ON event_schemas(event_type);

-- Find non-deprecated schemas
CREATE INDEX idx_event_schemas_active
ON event_schemas(event_type, version)
WHERE deprecated = false;

-- ============================================================================
-- Helper function to get latest schema version for an event type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_latest_event_schema_version(p_event_type VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(version) FROM event_schemas WHERE event_type = p_event_type AND deprecated = false),
        1
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Trigger to update updated_at on event_schemas
-- ============================================================================

CREATE OR REPLACE FUNCTION update_event_schemas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_schemas_updated_at
    BEFORE UPDATE ON event_schemas
    FOR EACH ROW
    EXECUTE FUNCTION update_event_schemas_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS trg_event_schemas_updated_at ON event_schemas;
DROP FUNCTION IF EXISTS update_event_schemas_updated_at();
DROP FUNCTION IF EXISTS get_latest_event_schema_version(VARCHAR);
DROP TABLE IF EXISTS event_schemas;
DROP TABLE IF EXISTS aggregate_snapshots;
