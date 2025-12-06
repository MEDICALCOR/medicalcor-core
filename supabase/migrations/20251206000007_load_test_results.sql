-- =============================================================================
-- Load Test Results Storage (L7 - Performance Baseline)
-- =============================================================================
-- Stores K6 load testing results for trend analysis and performance monitoring.
-- Supports multiple scenarios (smoke, load, stress, soak) and environments.
-- =============================================================================

-- Create enum for test scenarios
CREATE TYPE load_test_scenario AS ENUM ('smoke', 'load', 'stress', 'soak', 'custom');

-- Create enum for test status
CREATE TYPE load_test_status AS ENUM ('passed', 'failed', 'degraded');

-- Main load test results table
CREATE TABLE IF NOT EXISTS load_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test identification
    run_id UUID NOT NULL DEFAULT gen_random_uuid(),
    scenario load_test_scenario NOT NULL DEFAULT 'smoke',
    environment VARCHAR(50) NOT NULL DEFAULT 'local',
    base_url VARCHAR(255) NOT NULL,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds NUMERIC(10, 2),

    -- Overall status
    status load_test_status NOT NULL DEFAULT 'passed',

    -- Request metrics
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    success_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    error_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,

    -- Virtual users
    vus_max INTEGER NOT NULL DEFAULT 0,
    iterations INTEGER NOT NULL DEFAULT 0,

    -- Latency metrics (milliseconds)
    avg_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    min_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p50_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p90_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p95_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p99_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,

    -- Throughput
    requests_per_second NUMERIC(10, 2) NOT NULL DEFAULT 0,
    data_received_bytes BIGINT NOT NULL DEFAULT 0,
    data_sent_bytes BIGINT NOT NULL DEFAULT 0,

    -- Threshold results (JSONB for flexibility)
    thresholds JSONB DEFAULT '{}',
    thresholds_passed BOOLEAN DEFAULT TRUE,

    -- Additional metadata
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT current_user
);

-- Individual endpoint metrics for detailed analysis
CREATE TABLE IF NOT EXISTS load_test_endpoint_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES load_test_results(id) ON DELETE CASCADE,

    -- Endpoint identification
    endpoint_name VARCHAR(100) NOT NULL,
    endpoint_url VARCHAR(500),
    method VARCHAR(10) DEFAULT 'GET',

    -- Request counts
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,

    -- Latency metrics (milliseconds)
    avg_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    min_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p50_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p90_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p95_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,
    p99_duration NUMERIC(10, 2) NOT NULL DEFAULT 0,

    -- Status code distribution
    status_codes JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Threshold check results
CREATE TABLE IF NOT EXISTS load_test_threshold_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES load_test_results(id) ON DELETE CASCADE,

    -- Threshold identification
    metric_name VARCHAR(100) NOT NULL,
    threshold_expression VARCHAR(255) NOT NULL,

    -- Result
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    actual_value NUMERIC(15, 4),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_load_test_results_scenario ON load_test_results(scenario);
CREATE INDEX idx_load_test_results_environment ON load_test_results(environment);
CREATE INDEX idx_load_test_results_started_at ON load_test_results(started_at DESC);
CREATE INDEX idx_load_test_results_status ON load_test_results(status);
CREATE INDEX idx_load_test_results_scenario_env ON load_test_results(scenario, environment);
CREATE INDEX idx_load_test_endpoint_metrics_result ON load_test_endpoint_metrics(result_id);
CREATE INDEX idx_load_test_threshold_results_result ON load_test_threshold_results(result_id);

-- GIN index for JSONB queries
CREATE INDEX idx_load_test_results_tags ON load_test_results USING GIN(tags);
CREATE INDEX idx_load_test_results_thresholds ON load_test_results USING GIN(thresholds);

-- Comments for documentation
COMMENT ON TABLE load_test_results IS 'Stores K6 load test run results for performance trend analysis';
COMMENT ON TABLE load_test_endpoint_metrics IS 'Per-endpoint metrics from load test runs';
COMMENT ON TABLE load_test_threshold_results IS 'Individual threshold check results from load tests';

COMMENT ON COLUMN load_test_results.scenario IS 'Test scenario type: smoke, load, stress, soak, or custom';
COMMENT ON COLUMN load_test_results.success_rate IS 'Percentage of successful requests (0-100)';
COMMENT ON COLUMN load_test_results.thresholds IS 'JSON object containing all threshold configurations and results';
COMMENT ON COLUMN load_test_results.p95_duration IS '95th percentile response time in milliseconds';
COMMENT ON COLUMN load_test_results.p99_duration IS '99th percentile response time in milliseconds';
