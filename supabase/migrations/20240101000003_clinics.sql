-- ============================================================================
-- MedicalCor Core - Clinics Table
-- ============================================================================
-- Source: db/migrations/20241130000001_critical_security_fixes.sql
-- Creates clinics table and adds FK constraint to users
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Romania',
    phone VARCHAR(20),
    email VARCHAR(255),
    tax_id VARCHAR(50),

    -- Status management
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),

    -- Compliance
    hipaa_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    gdpr_compliant BOOLEAN NOT NULL DEFAULT TRUE,

    -- Soft delete for GDPR
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clinics_deleted_at ON clinics(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add FK constraint to users table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_users_clinic_id' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_clinic_id
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_clinics_updated_at ON clinics;
CREATE TRIGGER update_clinics_updated_at
    BEFORE UPDATE ON clinics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
