-- ============================================================================
-- MedicalCor Core - Aggregate Snapshots
-- ============================================================================
-- Source: db/migrations/20241202000002_add_aggregate_snapshots.sql
-- Event Sourcing performance optimization
-- ============================================================================

-- =============================================================================
-- Aggregate Snapshots Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS aggregate_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    state JSONB NOT NULL,
    events_since_last_snapshot INTEGER DEFAULT 0,
    snapshot_trigger VARCHAR(50) DEFAULT 'interval',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_aggregate_version UNIQUE(aggregate_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_latest ON aggregate_snapshots(aggregate_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_type ON aggregate_snapshots(aggregate_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON aggregate_snapshots(created_at);

-- =============================================================================
-- Event Schema Registry
-- =============================================================================
CREATE TABLE IF NOT EXISTS event_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(200) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    schema JSONB NOT NULL,
    migration_handler VARCHAR(200),
    description TEXT,
    deprecated BOOLEAN DEFAULT false,
    deprecated_at TIMESTAMPTZ,
    deprecated_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_event_type_version UNIQUE(event_type, version)
);

CREATE INDEX IF NOT EXISTS idx_event_schemas_type ON event_schemas(event_type);
CREATE INDEX IF NOT EXISTS idx_event_schemas_active ON event_schemas(event_type, version) WHERE deprecated = false;

-- =============================================================================
-- Functions
-- =============================================================================
CREATE OR REPLACE FUNCTION get_latest_event_schema_version(p_event_type VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(version) FROM event_schemas WHERE event_type = p_event_type AND deprecated = false),
        1
    );
END;
$$ LANGUAGE plpgsql STABLE;

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
