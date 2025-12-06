-- M15: Data Lineage Tracking
-- Migration for data lineage tables supporting compliance and debugging

-- =============================================================================
-- DATA LINEAGE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_lineage (
    -- Primary key
    id UUID PRIMARY KEY,

    -- Target aggregate (entity receiving/affected by data)
    target_aggregate_id VARCHAR(255) NOT NULL,
    target_aggregate_type VARCHAR(100) NOT NULL,

    -- Triggering event
    trigger_event_id VARCHAR(255) NOT NULL,
    trigger_event_type VARCHAR(255) NOT NULL,

    -- Transformation details
    transformation_type VARCHAR(50) NOT NULL,
    transformation_description TEXT,

    -- Source data (JSONB array of DataSource objects)
    sources JSONB NOT NULL DEFAULT '[]',

    -- Data quality metrics
    quality JSONB,

    -- Compliance context
    compliance JSONB,

    -- Actor who initiated the transformation
    actor JSONB,

    -- Distributed tracing
    correlation_id VARCHAR(255) NOT NULL,
    causation_id VARCHAR(255),

    -- Processing context
    processing_context JSONB,

    -- Additional metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_lineage_target_aggregate
    ON data_lineage (target_aggregate_id, target_aggregate_type);

CREATE INDEX IF NOT EXISTS idx_lineage_trigger_event
    ON data_lineage (trigger_event_id);

CREATE INDEX IF NOT EXISTS idx_lineage_correlation
    ON data_lineage (correlation_id);

CREATE INDEX IF NOT EXISTS idx_lineage_causation
    ON data_lineage (causation_id)
    WHERE causation_id IS NOT NULL;

-- Transformation type index for filtering
CREATE INDEX IF NOT EXISTS idx_lineage_transformation_type
    ON data_lineage (transformation_type);

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_lineage_created_at
    ON data_lineage (created_at DESC);

-- Compliance framework queries (GIN for JSONB array containment)
CREATE INDEX IF NOT EXISTS idx_lineage_compliance_frameworks
    ON data_lineage USING GIN ((compliance->'frameworks'));

-- Actor queries
CREATE INDEX IF NOT EXISTS idx_lineage_actor_id
    ON data_lineage ((actor->>'id'))
    WHERE actor IS NOT NULL;

-- Service queries
CREATE INDEX IF NOT EXISTS idx_lineage_service
    ON data_lineage ((processing_context->>'service'))
    WHERE processing_context IS NOT NULL;

-- Quality confidence queries
CREATE INDEX IF NOT EXISTS idx_lineage_quality_confidence
    ON data_lineage (((quality->>'confidence')::float))
    WHERE quality IS NOT NULL;

-- Source aggregate queries (GIN for JSONB array containment)
CREATE INDEX IF NOT EXISTS idx_lineage_sources
    ON data_lineage USING GIN (sources);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE data_lineage IS 'M15: Data lineage tracking for compliance and debugging';
COMMENT ON COLUMN data_lineage.id IS 'Unique lineage entry identifier';
COMMENT ON COLUMN data_lineage.target_aggregate_id IS 'ID of the aggregate receiving/affected by data';
COMMENT ON COLUMN data_lineage.target_aggregate_type IS 'Type of the target aggregate (Lead, Patient, etc.)';
COMMENT ON COLUMN data_lineage.trigger_event_id IS 'ID of the event that triggered this lineage entry';
COMMENT ON COLUMN data_lineage.trigger_event_type IS 'Type of the triggering event';
COMMENT ON COLUMN data_lineage.transformation_type IS 'Type of data transformation (scoring, enrichment, etc.)';
COMMENT ON COLUMN data_lineage.transformation_description IS 'Human-readable description of the transformation';
COMMENT ON COLUMN data_lineage.sources IS 'Array of source data inputs (DataSource objects)';
COMMENT ON COLUMN data_lineage.quality IS 'Data quality metrics (confidence, completeness, etc.)';
COMMENT ON COLUMN data_lineage.compliance IS 'Compliance context (frameworks, legal basis, sensitivity)';
COMMENT ON COLUMN data_lineage.actor IS 'Actor who initiated the transformation';
COMMENT ON COLUMN data_lineage.correlation_id IS 'Correlation ID for distributed tracing';
COMMENT ON COLUMN data_lineage.causation_id IS 'ID of the parent event that caused this';
COMMENT ON COLUMN data_lineage.processing_context IS 'Processing context (service, version, model)';
COMMENT ON COLUMN data_lineage.metadata IS 'Additional metadata';
COMMENT ON COLUMN data_lineage.created_at IS 'Timestamp of lineage entry creation';

-- =============================================================================
-- LINEAGE SUMMARY VIEW
-- =============================================================================

CREATE OR REPLACE VIEW lineage_summary AS
SELECT
    target_aggregate_type,
    transformation_type,
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) AS entry_count,
    AVG((quality->>'confidence')::float) AS avg_confidence,
    COUNT(DISTINCT target_aggregate_id) AS unique_aggregates,
    COUNT(DISTINCT correlation_id) AS unique_correlations
FROM data_lineage
GROUP BY target_aggregate_type, transformation_type, DATE_TRUNC('day', created_at);

COMMENT ON VIEW lineage_summary IS 'Daily summary of lineage entries by type';

-- =============================================================================
-- COMPLIANCE LINEAGE VIEW
-- =============================================================================

CREATE OR REPLACE VIEW compliance_lineage AS
SELECT
    id,
    target_aggregate_id,
    target_aggregate_type,
    trigger_event_type,
    transformation_type,
    compliance->'frameworks' AS compliance_frameworks,
    compliance->>'legalBasis' AS legal_basis,
    compliance->>'sensitivity' AS data_sensitivity,
    compliance->>'purpose' AS processing_purpose,
    compliance->>'consentId' AS consent_id,
    actor->>'id' AS actor_id,
    actor->>'type' AS actor_type,
    processing_context->>'service' AS processing_service,
    created_at
FROM data_lineage
WHERE compliance IS NOT NULL;

COMMENT ON VIEW compliance_lineage IS 'Compliance-focused view of lineage data';

-- =============================================================================
-- HIPAA AUDIT VIEW
-- =============================================================================

CREATE OR REPLACE VIEW hipaa_lineage_audit AS
SELECT
    id,
    target_aggregate_id AS phi_id,
    target_aggregate_type AS phi_type,
    transformation_type,
    trigger_event_type AS access_event,
    actor->>'id' AS user_id,
    actor->>'name' AS user_name,
    actor->>'type' AS actor_type,
    compliance->>'purpose' AS access_purpose,
    processing_context->>'service' AS source_system,
    created_at AS access_timestamp
FROM data_lineage
WHERE
    compliance->'frameworks' ? 'HIPAA'
    OR compliance->>'sensitivity' = 'phi';

COMMENT ON VIEW hipaa_lineage_audit IS 'HIPAA audit trail view for PHI access';

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to get upstream lineage (data sources)
CREATE OR REPLACE FUNCTION get_upstream_lineage(
    p_aggregate_id VARCHAR,
    p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    target_aggregate_id VARCHAR,
    target_aggregate_type VARCHAR,
    source_aggregate_id TEXT,
    source_aggregate_type TEXT,
    transformation_type VARCHAR,
    depth INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE upstream AS (
        -- Base case
        SELECT
            l.id,
            l.target_aggregate_id,
            l.target_aggregate_type,
            s.value->>'aggregateId' AS source_aggregate_id,
            s.value->>'aggregateType' AS source_aggregate_type,
            l.transformation_type,
            1 AS depth
        FROM data_lineage l
        CROSS JOIN LATERAL jsonb_array_elements(l.sources) AS s(value)
        WHERE l.target_aggregate_id = p_aggregate_id

        UNION ALL

        -- Recursive case
        SELECT
            l.id,
            l.target_aggregate_id,
            l.target_aggregate_type,
            s.value->>'aggregateId' AS source_aggregate_id,
            s.value->>'aggregateType' AS source_aggregate_type,
            l.transformation_type,
            u.depth + 1
        FROM data_lineage l
        CROSS JOIN LATERAL jsonb_array_elements(l.sources) AS s(value)
        INNER JOIN upstream u ON l.target_aggregate_id = u.source_aggregate_id
        WHERE u.depth < p_max_depth
    )
    SELECT DISTINCT
        upstream.id,
        upstream.target_aggregate_id,
        upstream.target_aggregate_type,
        upstream.source_aggregate_id,
        upstream.source_aggregate_type,
        upstream.transformation_type,
        upstream.depth
    FROM upstream
    ORDER BY upstream.depth, upstream.target_aggregate_id;
END;
$$;

COMMENT ON FUNCTION get_upstream_lineage IS 'Get upstream data sources for an aggregate';

-- Function to get downstream impact (affected aggregates)
CREATE OR REPLACE FUNCTION get_downstream_impact(
    p_aggregate_id VARCHAR,
    p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    target_aggregate_id VARCHAR,
    target_aggregate_type VARCHAR,
    transformation_type VARCHAR,
    depth INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downstream AS (
        -- Base case
        SELECT
            l.id,
            l.target_aggregate_id,
            l.target_aggregate_type,
            l.transformation_type,
            1 AS depth
        FROM data_lineage l
        WHERE l.sources @> jsonb_build_array(jsonb_build_object('aggregateId', p_aggregate_id))

        UNION ALL

        -- Recursive case
        SELECT
            l.id,
            l.target_aggregate_id,
            l.target_aggregate_type,
            l.transformation_type,
            d.depth + 1
        FROM data_lineage l
        INNER JOIN downstream d ON l.sources @> jsonb_build_array(jsonb_build_object('aggregateId', d.target_aggregate_id))
        WHERE d.depth < p_max_depth
    )
    SELECT DISTINCT
        downstream.id,
        downstream.target_aggregate_id,
        downstream.target_aggregate_type,
        downstream.transformation_type,
        downstream.depth
    FROM downstream
    ORDER BY downstream.depth, downstream.target_aggregate_id;
END;
$$;

COMMENT ON FUNCTION get_downstream_impact IS 'Get downstream impact for an aggregate';

-- Function to generate compliance report
CREATE OR REPLACE FUNCTION generate_compliance_report(
    p_aggregate_id VARCHAR,
    p_aggregate_type VARCHAR,
    p_framework VARCHAR,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 year',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    transformation_type VARCHAR,
    legal_basis TEXT,
    processing_purpose TEXT,
    entry_count BIGINT,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ,
    unique_sources BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.transformation_type,
        l.compliance->>'legalBasis' AS legal_basis,
        l.compliance->>'purpose' AS processing_purpose,
        COUNT(*) AS entry_count,
        MIN(l.created_at) AS first_occurrence,
        MAX(l.created_at) AS last_occurrence,
        COUNT(DISTINCT jsonb_array_length(l.sources)) AS unique_sources
    FROM data_lineage l
    WHERE l.target_aggregate_id = p_aggregate_id
      AND l.target_aggregate_type = p_aggregate_type
      AND l.created_at >= p_start_date
      AND l.created_at <= p_end_date
      AND (p_framework IS NULL OR l.compliance->'frameworks' ? p_framework)
    GROUP BY l.transformation_type, l.compliance->>'legalBasis', l.compliance->>'purpose'
    ORDER BY last_occurrence DESC;
END;
$$;

COMMENT ON FUNCTION generate_compliance_report IS 'Generate compliance lineage report for an aggregate';

-- =============================================================================
-- RETENTION POLICY
-- =============================================================================

-- Lineage entries are retained for 7 years (HIPAA requirement)
-- This is handled by the application layer based on compliance.retentionDays

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS (to be configured based on clinic isolation requirements)
ALTER TABLE data_lineage ENABLE ROW LEVEL SECURITY;

-- Default policy: allow all for authenticated users (can be refined)
CREATE POLICY lineage_access_policy ON data_lineage
    FOR ALL
    USING (true);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant necessary permissions
GRANT SELECT, INSERT, DELETE ON data_lineage TO authenticated;
GRANT SELECT ON lineage_summary TO authenticated;
GRANT SELECT ON compliance_lineage TO authenticated;
GRANT SELECT ON hipaa_lineage_audit TO authenticated;
GRANT EXECUTE ON FUNCTION get_upstream_lineage TO authenticated;
GRANT EXECUTE ON FUNCTION get_downstream_impact TO authenticated;
GRANT EXECUTE ON FUNCTION generate_compliance_report TO authenticated;
