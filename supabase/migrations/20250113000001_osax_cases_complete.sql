-- Migration: 20250113000001_osax_cases_complete.sql
-- Description: Create OSAX cases table with encryption and RLS
-- Author: MEDICALCOR_ORCHESTRATOR_AGENT
--
-- IDEMPOTENT: Uses IF NOT EXISTS / IF EXISTS for safe re-running

-- ============================================================================
-- OSAX CASES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS osax_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('lead', 'patient')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scored', 'red', 'yellow', 'green')),

  -- Encrypted PHI fields (HIPAA compliance)
  encrypted_medical_data BYTEA,
  encryption_key_id TEXT NOT NULL,

  -- Scores
  global_score INTEGER CHECK (global_score IS NULL OR (global_score >= 0 AND global_score <= 100)),
  risk_class TEXT CHECK (risk_class IS NULL OR risk_class IN ('RED', 'YELLOW', 'GREEN')),

  -- Component scores (JSONB for flexibility)
  component_scores JSONB,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  correlation_id UUID,

  -- Version for optimistic locking
  version INTEGER NOT NULL DEFAULT 1
);

-- Add comment for documentation
COMMENT ON TABLE osax_cases IS 'OSAX (Oral Surgery Assessment eXtended) case records with encrypted PHI';
COMMENT ON COLUMN osax_cases.encrypted_medical_data IS 'AES-256-GCM encrypted medical data (HIPAA compliant)';
COMMENT ON COLUMN osax_cases.encryption_key_id IS 'Reference to encryption key in key management service';
COMMENT ON COLUMN osax_cases.component_scores IS 'Individual scorer results: bone_quality, soft_tissue, systemic_risk, urgency, financial';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Subject lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_osax_cases_subject
  ON osax_cases(subject_id, subject_type)
  WHERE deleted_at IS NULL;

-- Status filtering for dashboards
CREATE INDEX IF NOT EXISTS idx_osax_cases_status
  ON osax_cases(status)
  WHERE deleted_at IS NULL;

-- Risk class filtering for alerts
CREATE INDEX IF NOT EXISTS idx_osax_cases_risk_class
  ON osax_cases(risk_class)
  WHERE deleted_at IS NULL AND risk_class IS NOT NULL;

-- Audit correlation lookup
CREATE INDEX IF NOT EXISTS idx_osax_cases_correlation
  ON osax_cases(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Date range queries for analytics
CREATE INDEX IF NOT EXISTS idx_osax_cases_created_at
  ON osax_cases(created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE osax_cases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cases from their clinics
-- This uses a subquery to check clinic access through leads/patients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'osax_cases' AND policyname = 'osax_cases_select_policy'
  ) THEN
    CREATE POLICY osax_cases_select_policy ON osax_cases
      FOR SELECT
      USING (
        -- Check if user has access via lead
        EXISTS (
          SELECT 1 FROM leads l
          JOIN user_clinic_access uca ON uca.clinic_id = l.clinic_id
          WHERE l.id::text = osax_cases.subject_id
          AND uca.user_id = auth.uid()
        )
        OR
        -- Check if user has access via patient
        EXISTS (
          SELECT 1 FROM patients p
          JOIN user_clinic_access uca ON uca.clinic_id = p.clinic_id
          WHERE p.id::text = osax_cases.subject_id
          AND uca.user_id = auth.uid()
        )
        OR
        -- Service role bypass
        auth.jwt() ->> 'role' = 'service_role'
      );
  END IF;
END $$;

-- Policy: Only service role can insert/update/delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'osax_cases' AND policyname = 'osax_cases_service_policy'
  ) THEN
    CREATE POLICY osax_cases_service_policy ON osax_cases
      FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role')
      WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- ENCRYPTION RPC FUNCTIONS (Stubs for development)
-- In production, these would call the key management service
-- ============================================================================

-- PHI encryption function
CREATE OR REPLACE FUNCTION encrypt_phi(
  plaintext TEXT,
  key_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- In production, this calls the key management service
  -- For development, return a mock encrypted value
  IF plaintext IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mock encryption: base64 encode with prefix
  RETURN 'ENC:' || encode(plaintext::bytea, 'base64');
END;
$$;

-- PHI decryption function
CREATE OR REPLACE FUNCTION decrypt_phi(
  ciphertext TEXT,
  key_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- In production, this calls the key management service
  -- For development, return mock decrypted value
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mock decryption: remove prefix and base64 decode
  IF ciphertext LIKE 'ENC:%' THEN
    RETURN convert_from(decode(substring(ciphertext FROM 5), 'base64'), 'UTF8');
  END IF;

  RETURN ciphertext;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION encrypt_phi(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_phi(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION encrypt_phi(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_phi(TEXT, TEXT) TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on row update
CREATE OR REPLACE FUNCTION update_osax_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_osax_cases_updated_at ON osax_cases;
CREATE TRIGGER trigger_osax_cases_updated_at
  BEFORE UPDATE ON osax_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_osax_cases_updated_at();

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant access to service role
GRANT ALL ON osax_cases TO service_role;

-- Grant read access to authenticated users (RLS will filter)
GRANT SELECT ON osax_cases TO authenticated;
