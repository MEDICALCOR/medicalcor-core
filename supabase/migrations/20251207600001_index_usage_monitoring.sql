-- ============================================================================
-- MedicalCor Core - Index Usage Monitoring Schema (L1)
-- ============================================================================
-- Provides tracking and analysis of PostgreSQL index usage patterns.
-- Helps identify unused indexes that can be removed to improve write performance.
-- ============================================================================

-- =============================================================================
-- INDEX USAGE METRICS (Historical tracking)
-- =============================================================================
-- Stores periodic snapshots of index usage metrics for trend analysis

CREATE TABLE IF NOT EXISTS index_usage_metrics (
    id BIGSERIAL PRIMARY KEY,

    -- Index identification
    index_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    schema_name VARCHAR(255) NOT NULL DEFAULT 'public',
    index_type VARCHAR(50) NOT NULL DEFAULT 'btree' CHECK (index_type IN (
        'btree', 'hash', 'gin', 'gist', 'spgist', 'brin', 'hnsw', 'ivfflat', 'unknown'
    )),

    -- Usage metrics
    index_scans BIGINT NOT NULL DEFAULT 0,
    tuples_read BIGINT NOT NULL DEFAULT 0,
    tuples_fetched BIGINT NOT NULL DEFAULT 0,
    efficiency DECIMAL(5, 4) NOT NULL DEFAULT 0 CHECK (efficiency >= 0 AND efficiency <= 1),

    -- Health status
    status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (status IN (
        'healthy', 'degraded', 'critical', 'unused'
    )),

    -- Size tracking
    size_bytes BIGINT NOT NULL DEFAULT 0,

    -- Maintenance timestamps
    last_analyze TIMESTAMPTZ,
    last_vacuum TIMESTAMPTZ,

    -- Recommendations (JSON array of strings)
    recommendations JSONB DEFAULT '[]'::jsonb,

    -- Audit
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_metrics_index_name ON index_usage_metrics(index_name);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_table_name ON index_usage_metrics(table_name);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_status ON index_usage_metrics(status);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_checked_at ON index_usage_metrics(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_size ON index_usage_metrics(size_bytes DESC);

-- Composite index for trend queries
CREATE INDEX IF NOT EXISTS idx_usage_metrics_trend ON index_usage_metrics(index_name, checked_at DESC);

-- =============================================================================
-- INDEX MONITORING CONFIGS
-- =============================================================================
-- Stores configuration for index monitoring per schema/table

CREATE TABLE IF NOT EXISTS index_monitoring_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Scope (null = global default)
    schema_name VARCHAR(255),
    table_name VARCHAR(255),

    -- Thresholds
    unused_threshold_days INTEGER NOT NULL DEFAULT 30,
    healthy_efficiency_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    analyze_staleness_days INTEGER NOT NULL DEFAULT 7,
    vacuum_staleness_days INTEGER NOT NULL DEFAULT 7,

    -- Patterns
    include_schemas TEXT[] DEFAULT ARRAY['public'],
    exclude_patterns TEXT[] DEFAULT ARRAY[]::TEXT[],
    include_system_indexes BOOLEAN NOT NULL DEFAULT FALSE,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Full config JSON for additional settings
    config JSONB DEFAULT '{}'::jsonb,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_config_scope UNIQUE NULLS NOT DISTINCT (schema_name, table_name)
);

-- =============================================================================
-- INDEX RECOMMENDATIONS (Action tracking)
-- =============================================================================
-- Stores generated recommendations and tracks their resolution

CREATE TABLE IF NOT EXISTS index_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Index identification
    index_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    schema_name VARCHAR(255) NOT NULL DEFAULT 'public',

    -- Recommendation details
    action VARCHAR(20) NOT NULL CHECK (action IN (
        'keep', 'analyze', 'vacuum', 'reindex', 'drop', 'monitor'
    )),
    reason TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN (
        'low', 'medium', 'high', 'critical'
    )),

    -- Potential savings
    estimated_savings_bytes BIGINT,

    -- Resolution tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'dismissed', 'expired'
    )),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,

    -- Tracing
    correlation_id VARCHAR(100),

    -- Audit
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for recommendation queries
CREATE INDEX IF NOT EXISTS idx_recommendations_index_name ON index_recommendations(index_name);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON index_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON index_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_recommendations_action ON index_recommendations(action);
CREATE INDEX IF NOT EXISTS idx_recommendations_pending ON index_recommendations(generated_at DESC)
    WHERE status = 'pending';

-- =============================================================================
-- INDEX MONITORING RUNS (Job execution tracking)
-- =============================================================================
-- Tracks each monitoring job execution

CREATE TABLE IF NOT EXISTS index_monitoring_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Run results
    success BOOLEAN NOT NULL,
    indexes_monitored INTEGER NOT NULL DEFAULT 0,
    unused_indexes_found INTEGER NOT NULL DEFAULT 0,
    degraded_indexes_found INTEGER NOT NULL DEFAULT 0,
    critical_indexes_found INTEGER NOT NULL DEFAULT 0,
    potential_savings_bytes BIGINT NOT NULL DEFAULT 0,
    processing_time_ms INTEGER NOT NULL DEFAULT 0,

    -- Error tracking
    error_message TEXT,

    -- Tracing
    correlation_id VARCHAR(100) NOT NULL,

    -- Audit
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for run history queries
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_completed ON index_monitoring_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_success ON index_monitoring_runs(success, completed_at DESC);

-- =============================================================================
-- VIEWS: Index Usage Dashboard
-- =============================================================================

-- Current index status overview (latest metrics per index)
CREATE OR REPLACE VIEW index_usage_current AS
SELECT DISTINCT ON (index_name, schema_name)
    index_name,
    table_name,
    schema_name,
    index_type,
    index_scans,
    tuples_read,
    tuples_fetched,
    efficiency,
    status,
    size_bytes,
    last_analyze,
    last_vacuum,
    recommendations,
    checked_at
FROM index_usage_metrics
ORDER BY index_name, schema_name, checked_at DESC;

-- Unused indexes summary (for quick review)
CREATE OR REPLACE VIEW unused_indexes_summary AS
SELECT
    index_name,
    table_name,
    schema_name,
    size_bytes,
    pg_size_pretty(size_bytes) as size_pretty,
    checked_at,
    recommendations
FROM index_usage_current
WHERE status = 'unused'
ORDER BY size_bytes DESC;

-- Index usage trend (daily aggregates)
CREATE OR REPLACE VIEW index_usage_daily_trend AS
SELECT
    DATE_TRUNC('day', checked_at) as day,
    COUNT(DISTINCT index_name) as total_indexes,
    COUNT(*) FILTER (WHERE status = 'unused') as unused_count,
    COUNT(*) FILTER (WHERE status = 'degraded') as degraded_count,
    COUNT(*) FILTER (WHERE status = 'critical') as critical_count,
    SUM(size_bytes) as total_size_bytes,
    AVG(efficiency) as avg_efficiency
FROM index_usage_metrics
GROUP BY DATE_TRUNC('day', checked_at)
ORDER BY day DESC;

-- =============================================================================
-- FUNCTIONS: Data Retention
-- =============================================================================

-- Clean up old metrics (keep 90 days by default)
CREATE OR REPLACE FUNCTION cleanup_old_index_metrics(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM index_usage_metrics
    WHERE checked_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired recommendations
CREATE OR REPLACE FUNCTION cleanup_expired_recommendations()
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE index_recommendations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTIONS: Summary Statistics
-- =============================================================================

-- Get current index health summary
CREATE OR REPLACE FUNCTION get_index_health_summary()
RETURNS TABLE (
    total_indexes INTEGER,
    healthy_count INTEGER,
    degraded_count INTEGER,
    critical_count INTEGER,
    unused_count INTEGER,
    total_size_bytes BIGINT,
    potential_savings_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_indexes,
        COUNT(*) FILTER (WHERE status = 'healthy')::INTEGER as healthy_count,
        COUNT(*) FILTER (WHERE status = 'degraded')::INTEGER as degraded_count,
        COUNT(*) FILTER (WHERE status = 'critical')::INTEGER as critical_count,
        COUNT(*) FILTER (WHERE status = 'unused')::INTEGER as unused_count,
        COALESCE(SUM(size_bytes), 0)::BIGINT as total_size_bytes,
        COALESCE(SUM(size_bytes) FILTER (WHERE status = 'unused'), 0)::BIGINT as potential_savings_bytes
    FROM index_usage_current;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

DROP TRIGGER IF EXISTS update_index_monitoring_configs_updated_at ON index_monitoring_configs;
CREATE TRIGGER update_index_monitoring_configs_updated_at
    BEFORE UPDATE ON index_monitoring_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_index_recommendations_updated_at ON index_recommendations;
CREATE TRIGGER update_index_recommendations_updated_at
    BEFORE UPDATE ON index_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE index_usage_metrics IS 'Historical tracking of PostgreSQL index usage metrics (L1)';
COMMENT ON TABLE index_monitoring_configs IS 'Configuration for index monitoring thresholds and scope';
COMMENT ON TABLE index_recommendations IS 'Generated recommendations for index maintenance';
COMMENT ON TABLE index_monitoring_runs IS 'Execution history of monitoring jobs';
COMMENT ON VIEW index_usage_current IS 'Latest metrics for each index';
COMMENT ON VIEW unused_indexes_summary IS 'Quick view of unused indexes sorted by size';
COMMENT ON VIEW index_usage_daily_trend IS 'Daily aggregated index usage trends';
COMMENT ON FUNCTION cleanup_old_index_metrics IS 'Remove old metrics based on retention policy';
COMMENT ON FUNCTION cleanup_expired_recommendations IS 'Mark expired recommendations as expired';
COMMENT ON FUNCTION get_index_health_summary IS 'Get current index health statistics';
