-- =============================================================================
-- M4: Vector Search Query Logging - Enhanced RAG Performance Monitoring
-- =============================================================================
-- This migration adds comprehensive query logging capabilities for:
-- - Performance monitoring and optimization
-- - Error tracking and classification
-- - Query complexity analysis
-- - Result quality metrics
-- - Cache effectiveness tracking
-- =============================================================================

-- Add new columns to rag_query_log for enhanced analytics
ALTER TABLE rag_query_log
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS error_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN,
ADD COLUMN IF NOT EXISTS semantic_weight DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS keyword_weight DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS avg_result_score DECIMAL(5,4),
ADD COLUMN IF NOT EXISTS min_result_score DECIMAL(5,4),
ADD COLUMN IF NOT EXISTS max_result_score DECIMAL(5,4),
ADD COLUMN IF NOT EXISTS query_token_count INTEGER,
ADD COLUMN IF NOT EXISTS query_word_count INTEGER,
ADD COLUMN IF NOT EXISTS filter_count INTEGER,
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER,
ADD COLUMN IF NOT EXISTS index_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS source_types_searched TEXT[],
ADD COLUMN IF NOT EXISTS client_source VARCHAR(100);

-- =============================================================================
-- Indexes for Performance Monitoring Queries
-- =============================================================================

-- Index for error analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_error_code
    ON rag_query_log(error_code)
    WHERE error_code IS NOT NULL;

-- Index for slow query analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_total_latency
    ON rag_query_log(total_latency_ms DESC)
    WHERE total_latency_ms IS NOT NULL;

-- Index for cache effectiveness analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_cache_hit
    ON rag_query_log(cache_hit)
    WHERE cache_hit IS NOT NULL;

-- Index for search type performance comparison
CREATE INDEX IF NOT EXISTS idx_rag_query_log_search_type_latency
    ON rag_query_log(search_type, total_latency_ms);

-- Composite index for time-series analytics by use case
CREATE INDEX IF NOT EXISTS idx_rag_query_log_usecase_time
    ON rag_query_log(use_case, created_at DESC);

-- Index for result quality analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_avg_score
    ON rag_query_log(avg_result_score DESC)
    WHERE avg_result_score IS NOT NULL;

-- Index for zero-result query analysis
CREATE INDEX IF NOT EXISTS idx_rag_query_log_zero_results
    ON rag_query_log(created_at DESC)
    WHERE result_count = 0;

-- =============================================================================
-- Aggregated Metrics Table for Performance Dashboards
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_query_metrics_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Time bucket
    hour_start TIMESTAMPTZ NOT NULL,

    -- Dimensions
    use_case VARCHAR(50),
    search_type VARCHAR(20),
    clinic_id VARCHAR(100),

    -- Query counts
    total_queries INTEGER NOT NULL DEFAULT 0,
    successful_queries INTEGER NOT NULL DEFAULT 0,
    failed_queries INTEGER NOT NULL DEFAULT 0,
    zero_result_queries INTEGER NOT NULL DEFAULT 0,
    cache_hit_queries INTEGER NOT NULL DEFAULT 0,
    slow_queries INTEGER NOT NULL DEFAULT 0, -- > 500ms

    -- Latency metrics (milliseconds)
    avg_total_latency_ms DECIMAL(10,2),
    p50_total_latency_ms INTEGER,
    p95_total_latency_ms INTEGER,
    p99_total_latency_ms INTEGER,
    max_total_latency_ms INTEGER,

    avg_embedding_latency_ms DECIMAL(10,2),
    avg_search_latency_ms DECIMAL(10,2),

    -- Result quality metrics
    avg_result_count DECIMAL(5,2),
    avg_result_score DECIMAL(5,4),
    avg_top_result_score DECIMAL(5,4),

    -- Query complexity
    avg_query_tokens INTEGER,
    avg_filter_count DECIMAL(3,1),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint for upsert
    CONSTRAINT rag_query_metrics_hourly_unique
        UNIQUE (hour_start, use_case, search_type, clinic_id)
);

-- Indexes for metrics queries
CREATE INDEX IF NOT EXISTS idx_rag_query_metrics_hourly_time
    ON rag_query_metrics_hourly(hour_start DESC);

CREATE INDEX IF NOT EXISTS idx_rag_query_metrics_hourly_usecase
    ON rag_query_metrics_hourly(use_case, hour_start DESC);

-- =============================================================================
-- Daily Aggregation Table for Long-term Trends
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_query_metrics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Time bucket
    day_start DATE NOT NULL,

    -- Dimensions
    use_case VARCHAR(50),
    search_type VARCHAR(20),

    -- Query counts
    total_queries INTEGER NOT NULL DEFAULT 0,
    successful_queries INTEGER NOT NULL DEFAULT 0,
    failed_queries INTEGER NOT NULL DEFAULT 0,
    zero_result_queries INTEGER NOT NULL DEFAULT 0,

    -- Error breakdown
    timeout_errors INTEGER DEFAULT 0,
    connection_errors INTEGER DEFAULT 0,
    embedding_errors INTEGER DEFAULT 0,
    other_errors INTEGER DEFAULT 0,

    -- Latency metrics
    avg_total_latency_ms DECIMAL(10,2),
    p95_total_latency_ms INTEGER,

    -- Result quality
    avg_result_count DECIMAL(5,2),
    avg_result_score DECIMAL(5,4),

    -- Cache effectiveness
    cache_hit_rate DECIMAL(5,4),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT rag_query_metrics_daily_unique
        UNIQUE (day_start, use_case, search_type)
);

CREATE INDEX IF NOT EXISTS idx_rag_query_metrics_daily_time
    ON rag_query_metrics_daily(day_start DESC);

-- =============================================================================
-- Function: Aggregate Hourly Metrics
-- =============================================================================

CREATE OR REPLACE FUNCTION aggregate_rag_query_metrics_hourly(
    target_hour TIMESTAMPTZ DEFAULT date_trunc('hour', NOW() - INTERVAL '1 hour')
)
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER := 0;
BEGIN
    INSERT INTO rag_query_metrics_hourly (
        hour_start,
        use_case,
        search_type,
        clinic_id,
        total_queries,
        successful_queries,
        failed_queries,
        zero_result_queries,
        cache_hit_queries,
        slow_queries,
        avg_total_latency_ms,
        p50_total_latency_ms,
        p95_total_latency_ms,
        p99_total_latency_ms,
        max_total_latency_ms,
        avg_embedding_latency_ms,
        avg_search_latency_ms,
        avg_result_count,
        avg_result_score,
        avg_top_result_score,
        avg_query_tokens,
        avg_filter_count
    )
    SELECT
        target_hour AS hour_start,
        use_case,
        search_type,
        (filters->>'clinicId')::VARCHAR(100) AS clinic_id,
        COUNT(*) AS total_queries,
        COUNT(*) FILTER (WHERE error_code IS NULL) AS successful_queries,
        COUNT(*) FILTER (WHERE error_code IS NOT NULL) AS failed_queries,
        COUNT(*) FILTER (WHERE result_count = 0 AND error_code IS NULL) AS zero_result_queries,
        COUNT(*) FILTER (WHERE cache_hit = TRUE) AS cache_hit_queries,
        COUNT(*) FILTER (WHERE total_latency_ms > 500) AS slow_queries,
        AVG(total_latency_ms) AS avg_total_latency_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_latency_ms)::INTEGER AS p50_total_latency_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::INTEGER AS p95_total_latency_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms)::INTEGER AS p99_total_latency_ms,
        MAX(total_latency_ms) AS max_total_latency_ms,
        AVG(embedding_latency_ms) AS avg_embedding_latency_ms,
        AVG(search_latency_ms) AS avg_search_latency_ms,
        AVG(result_count) AS avg_result_count,
        AVG(avg_result_score) AS avg_result_score,
        AVG(max_result_score) AS avg_top_result_score,
        AVG(query_token_count) AS avg_query_tokens,
        AVG(filter_count) AS avg_filter_count
    FROM rag_query_log
    WHERE created_at >= target_hour
      AND created_at < target_hour + INTERVAL '1 hour'
    GROUP BY use_case, search_type, (filters->>'clinicId')::VARCHAR(100)
    ON CONFLICT (hour_start, use_case, search_type, clinic_id)
    DO UPDATE SET
        total_queries = EXCLUDED.total_queries,
        successful_queries = EXCLUDED.successful_queries,
        failed_queries = EXCLUDED.failed_queries,
        zero_result_queries = EXCLUDED.zero_result_queries,
        cache_hit_queries = EXCLUDED.cache_hit_queries,
        slow_queries = EXCLUDED.slow_queries,
        avg_total_latency_ms = EXCLUDED.avg_total_latency_ms,
        p50_total_latency_ms = EXCLUDED.p50_total_latency_ms,
        p95_total_latency_ms = EXCLUDED.p95_total_latency_ms,
        p99_total_latency_ms = EXCLUDED.p99_total_latency_ms,
        max_total_latency_ms = EXCLUDED.max_total_latency_ms,
        avg_embedding_latency_ms = EXCLUDED.avg_embedding_latency_ms,
        avg_search_latency_ms = EXCLUDED.avg_search_latency_ms,
        avg_result_count = EXCLUDED.avg_result_count,
        avg_result_score = EXCLUDED.avg_result_score,
        avg_top_result_score = EXCLUDED.avg_top_result_score,
        avg_query_tokens = EXCLUDED.avg_query_tokens,
        avg_filter_count = EXCLUDED.avg_filter_count,
        updated_at = NOW();

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Aggregate Daily Metrics
-- =============================================================================

CREATE OR REPLACE FUNCTION aggregate_rag_query_metrics_daily(
    target_day DATE DEFAULT (CURRENT_DATE - INTERVAL '1 day')::DATE
)
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER := 0;
BEGIN
    INSERT INTO rag_query_metrics_daily (
        day_start,
        use_case,
        search_type,
        total_queries,
        successful_queries,
        failed_queries,
        zero_result_queries,
        timeout_errors,
        connection_errors,
        embedding_errors,
        other_errors,
        avg_total_latency_ms,
        p95_total_latency_ms,
        avg_result_count,
        avg_result_score,
        cache_hit_rate
    )
    SELECT
        target_day AS day_start,
        use_case,
        search_type,
        COUNT(*) AS total_queries,
        COUNT(*) FILTER (WHERE error_code IS NULL) AS successful_queries,
        COUNT(*) FILTER (WHERE error_code IS NOT NULL) AS failed_queries,
        COUNT(*) FILTER (WHERE result_count = 0 AND error_code IS NULL) AS zero_result_queries,
        COUNT(*) FILTER (WHERE error_code = 'TIMEOUT') AS timeout_errors,
        COUNT(*) FILTER (WHERE error_code = 'CONNECTION_ERROR') AS connection_errors,
        COUNT(*) FILTER (WHERE error_code = 'EMBEDDING_ERROR') AS embedding_errors,
        COUNT(*) FILTER (WHERE error_code NOT IN ('TIMEOUT', 'CONNECTION_ERROR', 'EMBEDDING_ERROR') AND error_code IS NOT NULL) AS other_errors,
        AVG(total_latency_ms) AS avg_total_latency_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::INTEGER AS p95_total_latency_ms,
        AVG(result_count) AS avg_result_count,
        AVG(avg_result_score) AS avg_result_score,
        CASE
            WHEN COUNT(*) > 0
            THEN (COUNT(*) FILTER (WHERE cache_hit = TRUE))::DECIMAL / COUNT(*)
            ELSE 0
        END AS cache_hit_rate
    FROM rag_query_log
    WHERE created_at >= target_day::TIMESTAMPTZ
      AND created_at < (target_day + INTERVAL '1 day')::TIMESTAMPTZ
    GROUP BY use_case, search_type
    ON CONFLICT (day_start, use_case, search_type)
    DO UPDATE SET
        total_queries = EXCLUDED.total_queries,
        successful_queries = EXCLUDED.successful_queries,
        failed_queries = EXCLUDED.failed_queries,
        zero_result_queries = EXCLUDED.zero_result_queries,
        timeout_errors = EXCLUDED.timeout_errors,
        connection_errors = EXCLUDED.connection_errors,
        embedding_errors = EXCLUDED.embedding_errors,
        other_errors = EXCLUDED.other_errors,
        avg_total_latency_ms = EXCLUDED.avg_total_latency_ms,
        p95_total_latency_ms = EXCLUDED.p95_total_latency_ms,
        avg_result_count = EXCLUDED.avg_result_count,
        avg_result_score = EXCLUDED.avg_result_score,
        cache_hit_rate = EXCLUDED.cache_hit_rate;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Get Performance Summary
-- =============================================================================

CREATE OR REPLACE FUNCTION get_rag_performance_summary(
    time_range_hours INTEGER DEFAULT 24,
    filter_use_case VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    metric_name VARCHAR,
    metric_value DECIMAL,
    unit VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_queries AS (
        SELECT *
        FROM rag_query_log
        WHERE created_at >= NOW() - (time_range_hours || ' hours')::INTERVAL
          AND (filter_use_case IS NULL OR use_case = filter_use_case)
    )
    SELECT 'total_queries'::VARCHAR, COUNT(*)::DECIMAL, 'count'::VARCHAR FROM recent_queries
    UNION ALL
    SELECT 'success_rate'::VARCHAR,
           CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE error_code IS NULL))::DECIMAL / COUNT(*) * 100
                ELSE 0 END,
           'percent'::VARCHAR
    FROM recent_queries
    UNION ALL
    SELECT 'avg_latency_ms'::VARCHAR, AVG(total_latency_ms), 'ms'::VARCHAR FROM recent_queries
    UNION ALL
    SELECT 'p95_latency_ms'::VARCHAR,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms),
           'ms'::VARCHAR
    FROM recent_queries
    UNION ALL
    SELECT 'avg_result_score'::VARCHAR, AVG(avg_result_score), 'score'::VARCHAR FROM recent_queries
    UNION ALL
    SELECT 'zero_result_rate'::VARCHAR,
           CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE result_count = 0))::DECIMAL / COUNT(*) * 100
                ELSE 0 END,
           'percent'::VARCHAR
    FROM recent_queries
    UNION ALL
    SELECT 'cache_hit_rate'::VARCHAR,
           CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE cache_hit = TRUE))::DECIMAL / COUNT(*) * 100
                ELSE 0 END,
           'percent'::VARCHAR
    FROM recent_queries;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grants
-- =============================================================================
-- GRANT SELECT, INSERT ON rag_query_metrics_hourly TO medicalcor_app;
-- GRANT SELECT, INSERT ON rag_query_metrics_daily TO medicalcor_app;
-- GRANT EXECUTE ON FUNCTION aggregate_rag_query_metrics_hourly TO medicalcor_app;
-- GRANT EXECUTE ON FUNCTION aggregate_rag_query_metrics_daily TO medicalcor_app;
-- GRANT EXECUTE ON FUNCTION get_rag_performance_summary TO medicalcor_app;
