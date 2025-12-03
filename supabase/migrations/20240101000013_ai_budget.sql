-- ============================================================================
-- MedicalCor Core - AI Budget Tracking
-- ============================================================================
-- Source: db/migrations/20241127000002_add_ai_budget_tracking.sql
-- Cost monitoring and alerts for AI operations
-- ============================================================================

-- =============================================================================
-- AI Budget Usage Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_budget_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'monthly')),
    period_start DATE NOT NULL,
    total_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (user_id, tenant_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_usage_user ON ai_budget_usage(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_budget_usage_tenant ON ai_budget_usage(tenant_id, period_start DESC);

-- =============================================================================
-- AI Budget Alerts Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'tenant', 'user')),
    scope_id VARCHAR(100),
    period VARCHAR(10) NOT NULL CHECK (period IN ('daily', 'monthly')),
    threshold DECIMAL(3, 2) NOT NULL,
    percent_used DECIMAL(5, 2) NOT NULL,
    current_spend DECIMAL(12, 4) NOT NULL,
    budget_limit DECIMAL(12, 4) NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_alerts_scope ON ai_budget_alerts(scope, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_budget_alerts_unack ON ai_budget_alerts(acknowledged) WHERE acknowledged = FALSE;

-- =============================================================================
-- AI Provider Metrics Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_provider_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    response_time_ms INTEGER NOT NULL,
    used_fallback BOOLEAN DEFAULT FALSE,
    fallback_provider VARCHAR(50),
    error_type VARCHAR(100),
    error_message TEXT,
    model VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost DECIMAL(10, 6),
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_provider ON ai_provider_metrics(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_operation ON ai_provider_metrics(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_fallback ON ai_provider_metrics(used_fallback, created_at DESC) WHERE used_fallback = TRUE;

-- =============================================================================
-- AI User Rate Limits Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_user_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    tier VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise', 'unlimited')),
    requests_per_minute INTEGER,
    requests_per_hour INTEGER,
    requests_per_day INTEGER,
    tokens_per_minute INTEGER,
    tokens_per_day INTEGER,
    daily_budget DECIMAL(10, 2),
    monthly_budget DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Views for Dashboard Queries
-- =============================================================================
CREATE OR REPLACE VIEW v_ai_daily_spend AS
SELECT
    DATE(created_at) as date,
    provider,
    operation_type,
    COUNT(*) as request_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(cost) as total_cost,
    AVG(response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    SUM(CASE WHEN used_fallback THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) as fallback_rate,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) as success_rate
FROM ai_provider_metrics
GROUP BY DATE(created_at), provider, operation_type;

CREATE OR REPLACE VIEW v_ai_provider_health AS
SELECT
    provider,
    COUNT(*) as total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) as success_rate,
    AVG(response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    SUM(CASE WHEN used_fallback THEN 1 ELSE 0 END) as fallback_count,
    SUM(CASE WHEN used_fallback THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) as fallback_rate
FROM ai_provider_metrics
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY provider;
