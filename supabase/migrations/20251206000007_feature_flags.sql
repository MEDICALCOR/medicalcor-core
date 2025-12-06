-- ============================================================================
-- MedicalCor Core - Feature Flags
-- ============================================================================
-- Feature flags for progressive rollouts and A/B testing
-- ============================================================================

-- =============================================================================
-- FEATURE FLAGS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,  -- NULL for global flags

    -- Flag identification
    key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Status
    enabled BOOLEAN NOT NULL DEFAULT FALSE,

    -- Progressive rollout
    rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),

    -- Targeting rules (JSON structure for advanced targeting)
    targeting JSONB DEFAULT NULL,

    -- Variants for A/B testing
    variants JSONB DEFAULT NULL,

    -- Metadata
    owner VARCHAR(255),
    tags TEXT[] NOT NULL DEFAULT '{}',
    environment VARCHAR(20) NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,

    -- Unique constraint: one flag key per clinic (or global)
    CONSTRAINT unique_flag_key_per_clinic UNIQUE (COALESCE(clinic_id, '00000000-0000-0000-0000-000000000000'::UUID), key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_clinic_id ON feature_flags(clinic_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_feature_flags_environment ON feature_flags(environment);
CREATE INDEX IF NOT EXISTS idx_feature_flags_tags ON feature_flags USING GIN(tags);

-- =============================================================================
-- FEATURE FLAG OVERRIDES TABLE (per-user or per-tenant overrides)
-- =============================================================================
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,

    -- Override target (one of these should be set)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- Override value
    enabled BOOLEAN NOT NULL,
    variant VARCHAR(100),

    -- Reason for override
    reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,

    -- Ensure at least one target is set
    CONSTRAINT flag_override_has_target CHECK (user_id IS NOT NULL OR tenant_id IS NOT NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flag_overrides_flag_id ON feature_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS idx_flag_overrides_user_id ON feature_flag_overrides(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flag_overrides_tenant_id ON feature_flag_overrides(tenant_id) WHERE tenant_id IS NOT NULL;

-- =============================================================================
-- FEATURE FLAG AUDIT LOG
-- =============================================================================
CREATE TABLE IF NOT EXISTS feature_flag_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,

    -- Action
    action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'enabled', 'disabled', 'rollout_changed')),

    -- Changes
    previous_value JSONB,
    new_value JSONB,

    -- Actor
    performed_by UUID REFERENCES users(id),

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flag_audit_flag_id ON feature_flag_audit_log(flag_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flag_audit_created_at ON feature_flag_audit_log(created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- AUDIT TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION log_feature_flag_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'created';
        INSERT INTO feature_flag_audit_log (flag_id, action, new_value)
        VALUES (NEW.id, v_action, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.enabled != NEW.enabled THEN
            v_action := CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END;
        ELSIF OLD.rollout_percentage != NEW.rollout_percentage THEN
            v_action := 'rollout_changed';
        ELSE
            v_action := 'updated';
        END IF;
        INSERT INTO feature_flag_audit_log (flag_id, action, previous_value, new_value)
        VALUES (NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'deleted';
        INSERT INTO feature_flag_audit_log (flag_id, action, previous_value)
        VALUES (OLD.id, v_action, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feature_flag_audit_trigger ON feature_flags;
CREATE TRIGGER feature_flag_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION log_feature_flag_changes();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to evaluate if a flag is enabled for a specific context
CREATE OR REPLACE FUNCTION evaluate_feature_flag(
    p_flag_key VARCHAR(100),
    p_clinic_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_flag RECORD;
    v_override RECORD;
    v_random_value INTEGER;
BEGIN
    -- Get the flag (clinic-specific first, then global)
    SELECT * INTO v_flag
    FROM feature_flags
    WHERE key = p_flag_key
    AND (clinic_id = p_clinic_id OR clinic_id IS NULL)
    ORDER BY clinic_id NULLS LAST
    LIMIT 1;

    -- Flag not found
    IF v_flag IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Flag is disabled
    IF NOT v_flag.enabled THEN
        RETURN FALSE;
    END IF;

    -- Check for user-specific override
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO v_override
        FROM feature_flag_overrides
        WHERE flag_id = v_flag.id
        AND user_id = p_user_id
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

        IF v_override IS NOT NULL THEN
            RETURN v_override.enabled;
        END IF;
    END IF;

    -- Check for tenant-specific override
    IF p_clinic_id IS NOT NULL THEN
        SELECT * INTO v_override
        FROM feature_flag_overrides
        WHERE flag_id = v_flag.id
        AND tenant_id = p_clinic_id
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

        IF v_override IS NOT NULL THEN
            RETURN v_override.enabled;
        END IF;
    END IF;

    -- Apply rollout percentage
    IF v_flag.rollout_percentage = 100 THEN
        RETURN TRUE;
    ELSIF v_flag.rollout_percentage = 0 THEN
        RETURN FALSE;
    ELSE
        -- Use consistent hashing based on user_id or random
        IF p_user_id IS NOT NULL THEN
            v_random_value := abs(hashtext(p_user_id::TEXT || v_flag.key)) % 100;
        ELSE
            v_random_value := floor(random() * 100);
        END IF;
        RETURN v_random_value < v_flag.rollout_percentage;
    END IF;
END;
$$ LANGUAGE plpgsql;
