-- ============================================================================
-- OSAX Cases Table Migration
-- ============================================================================
-- Main table for OSAX (Obstructive Sleep Apnea Extended) case management.
-- Follows AASM clinical guidelines for sleep apnea assessment and treatment.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Case status lifecycle
CREATE TYPE osax_case_status AS ENUM (
  'PENDING_STUDY',
  'STUDY_COMPLETED',
  'SCORED',
  'REVIEWED',
  'TREATMENT_PLANNED',
  'IN_TREATMENT',
  'FOLLOW_UP',
  'CLOSED',
  'CANCELLED'
);

-- OSA severity classification per AASM guidelines
CREATE TYPE osax_severity AS ENUM (
  'NONE',
  'MILD',
  'MODERATE',
  'SEVERE'
);

-- Case priority levels
CREATE TYPE osax_priority AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

-- Treatment types
CREATE TYPE osax_treatment_type AS ENUM (
  'CPAP_THERAPY',
  'BIPAP_THERAPY',
  'ORAL_APPLIANCE',
  'POSITIONAL_THERAPY',
  'LIFESTYLE_MODIFICATION',
  'SURGERY_EVALUATION'
);

-- Cardiovascular risk levels
CREATE TYPE osax_cardiovascular_risk AS ENUM (
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL'
);

-- Follow-up types
CREATE TYPE osax_follow_up_type AS ENUM (
  'INITIAL_CHECK',
  'COMPLIANCE_REVIEW',
  'TITRATION',
  'ANNUAL_REVIEW',
  'SYMPTOM_FOLLOW_UP'
);

-- Review decision types
CREATE TYPE osax_review_decision AS ENUM (
  'APPROVE',
  'MODIFY',
  'REJECT',
  'REFER'
);

-- Scoring method
CREATE TYPE osax_scoring_method AS ENUM (
  'SYSTEM',
  'PHYSICIAN'
);

-- Subject ID types for GDPR compliance
CREATE TYPE osax_subject_id_type AS ENUM (
  'INTERNAL',
  'EXTERNAL_STUDY',
  'ANONYMIZED'
);

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- OSAX Cases table (Aggregate Root)
CREATE TABLE osax_cases (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Case identification
  case_number VARCHAR(50) NOT NULL UNIQUE,

  -- Status and priority
  status osax_case_status NOT NULL DEFAULT 'PENDING_STUDY',
  priority osax_priority NOT NULL DEFAULT 'NORMAL',

  -- Subject identification (GDPR compliant)
  subject_id UUID NOT NULL,
  subject_id_type osax_subject_id_type NOT NULL DEFAULT 'INTERNAL',
  pseudonymized_id VARCHAR(64),

  -- Clinical scoring (embedded value object)
  severity osax_severity,
  composite_score DECIMAL(5,2),
  ahi DECIMAL(6,2),
  odi DECIMAL(6,2),
  spo2_nadir DECIMAL(5,2),
  spo2_average DECIMAL(5,2),
  sleep_efficiency DECIMAL(5,2),
  ess_score INTEGER,
  bmi DECIMAL(5,2),
  neck_circumference DECIMAL(5,2),
  total_sleep_time INTEGER, -- minutes
  rem_ahi DECIMAL(6,2),
  supine_ahi DECIMAL(6,2),
  cardiovascular_risk osax_cardiovascular_risk,
  treatment_recommendation TEXT,
  scoring_confidence DECIMAL(3,2),
  scoring_method osax_scoring_method,
  scored_at TIMESTAMPTZ,
  scored_by VARCHAR(100),

  -- Study metadata
  study_date DATE,
  study_type VARCHAR(50),
  study_provider VARCHAR(100),
  study_reference VARCHAR(100),
  raw_study_data JSONB,

  -- Treatment information
  treatment_type osax_treatment_type,
  treatment_start_date DATE,
  treatment_end_date DATE,
  treatment_notes TEXT,
  device_info JSONB,

  -- Assignment
  assigned_specialist_id UUID,
  assigned_specialist_name VARCHAR(200),
  assigned_at TIMESTAMPTZ,

  -- Review information
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewer_name VARCHAR(200),
  review_decision osax_review_decision,
  review_notes TEXT,
  modified_recommendation TEXT,
  referral_specialty VARCHAR(100),

  -- Follow-up tracking
  next_follow_up_date DATE,
  next_follow_up_type osax_follow_up_type,

  -- Compliance metrics
  compliance_rate DECIMAL(5,2),
  last_compliance_check TIMESTAMPTZ,

  -- Consent tracking (GDPR)
  consent_obtained BOOLEAN NOT NULL DEFAULT FALSE,
  consent_date TIMESTAMPTZ,
  consent_type VARCHAR(50),
  consent_withdrawn BOOLEAN NOT NULL DEFAULT FALSE,
  consent_withdrawal_date TIMESTAMPTZ,
  data_retention_until DATE,

  -- Optimistic locking
  version INTEGER NOT NULL DEFAULT 1,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Organization/tenant (for multi-tenancy)
  organization_id UUID,

  -- Constraints
  CONSTRAINT valid_ahi CHECK (ahi IS NULL OR ahi >= 0),
  CONSTRAINT valid_odi CHECK (odi IS NULL OR odi >= 0),
  CONSTRAINT valid_spo2_nadir CHECK (spo2_nadir IS NULL OR (spo2_nadir >= 0 AND spo2_nadir <= 100)),
  CONSTRAINT valid_spo2_average CHECK (spo2_average IS NULL OR (spo2_average >= 0 AND spo2_average <= 100)),
  CONSTRAINT valid_sleep_efficiency CHECK (sleep_efficiency IS NULL OR (sleep_efficiency >= 0 AND sleep_efficiency <= 100)),
  CONSTRAINT valid_ess_score CHECK (ess_score IS NULL OR (ess_score >= 0 AND ess_score <= 24)),
  CONSTRAINT valid_composite_score CHECK (composite_score IS NULL OR (composite_score >= 0 AND composite_score <= 100)),
  CONSTRAINT valid_confidence CHECK (scoring_confidence IS NULL OR (scoring_confidence >= 0 AND scoring_confidence <= 1)),
  CONSTRAINT valid_compliance_rate CHECK (compliance_rate IS NULL OR (compliance_rate >= 0 AND compliance_rate <= 100))
);

-- Score history table (for tracking score changes over time)
CREATE TABLE osax_score_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES osax_cases(id) ON DELETE CASCADE,

  -- Score snapshot
  severity osax_severity NOT NULL,
  composite_score DECIMAL(5,2) NOT NULL,
  ahi DECIMAL(6,2) NOT NULL,
  odi DECIMAL(6,2),
  spo2_nadir DECIMAL(5,2),
  cardiovascular_risk osax_cardiovascular_risk,
  treatment_recommendation TEXT,

  -- Scoring context
  scoring_method osax_scoring_method NOT NULL,
  scored_by VARCHAR(100) NOT NULL,
  scoring_notes TEXT,

  -- Timestamp
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Index for efficient queries
  CONSTRAINT valid_history_ahi CHECK (ahi >= 0)
);

-- Follow-up records table
CREATE TABLE osax_follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES osax_cases(id) ON DELETE CASCADE,

  -- Follow-up details
  follow_up_type osax_follow_up_type NOT NULL,
  scheduled_date DATE NOT NULL,
  completed_date DATE,

  -- Results
  ahi_at_follow_up DECIMAL(6,2),
  compliance_at_follow_up DECIMAL(5,2),
  symptoms_improved BOOLEAN,
  notes TEXT,

  -- Metadata
  performed_by UUID,
  performer_name VARCHAR(200),

  -- Status
  missed BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treatment records table
CREATE TABLE osax_treatments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES osax_cases(id) ON DELETE CASCADE,

  -- Treatment details
  treatment_type osax_treatment_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,

  -- Device information (for CPAP/BiPAP)
  device_model VARCHAR(100),
  device_serial VARCHAR(100),
  device_settings JSONB,

  -- Compliance
  average_usage_hours DECIMAL(4,2),
  days_used INTEGER,
  days_prescribed INTEGER,
  compliance_percentage DECIMAL(5,2),

  -- Clinical outcomes
  residual_ahi DECIMAL(6,2),
  leak_rate DECIMAL(6,2),

  -- Notes
  notes TEXT,

  -- Status
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query patterns
CREATE INDEX idx_osax_cases_status ON osax_cases(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_severity ON osax_cases(severity) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_priority ON osax_cases(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_subject ON osax_cases(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_assigned ON osax_cases(assigned_specialist_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_organization ON osax_cases(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_osax_cases_created ON osax_cases(created_at DESC) WHERE deleted_at IS NULL;

-- Workflow indexes
CREATE INDEX idx_osax_cases_pending_review ON osax_cases(status, priority)
  WHERE status = 'SCORED' AND deleted_at IS NULL;
CREATE INDEX idx_osax_cases_urgent ON osax_cases(priority, created_at)
  WHERE priority = 'URGENT' AND deleted_at IS NULL;
CREATE INDEX idx_osax_cases_follow_up_due ON osax_cases(next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL AND deleted_at IS NULL;

-- Clinical indexes
CREATE INDEX idx_osax_cases_ahi ON osax_cases(ahi) WHERE ahi IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_osax_cases_cv_risk ON osax_cases(cardiovascular_risk)
  WHERE cardiovascular_risk IS NOT NULL AND deleted_at IS NULL;

-- GDPR compliance indexes
CREATE INDEX idx_osax_cases_consent_withdrawn ON osax_cases(consent_withdrawn, consent_withdrawal_date)
  WHERE consent_withdrawn = TRUE;
CREATE INDEX idx_osax_cases_retention ON osax_cases(data_retention_until)
  WHERE data_retention_until IS NOT NULL;

-- History indexes
CREATE INDEX idx_osax_score_history_case ON osax_score_history(case_id, scored_at DESC);

-- Follow-up indexes
CREATE INDEX idx_osax_follow_ups_case ON osax_follow_ups(case_id, scheduled_date);
CREATE INDEX idx_osax_follow_ups_scheduled ON osax_follow_ups(scheduled_date)
  WHERE completed_date IS NULL AND cancelled = FALSE;
CREATE INDEX idx_osax_follow_ups_missed ON osax_follow_ups(case_id)
  WHERE missed = TRUE;

-- Treatment indexes
CREATE INDEX idx_osax_treatments_case ON osax_treatments(case_id, start_date DESC);
CREATE INDEX idx_osax_treatments_active ON osax_treatments(case_id) WHERE active = TRUE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_osax_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_osax_cases_updated_at
  BEFORE UPDATE ON osax_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_osax_updated_at();

CREATE TRIGGER trigger_osax_follow_ups_updated_at
  BEFORE UPDATE ON osax_follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_osax_updated_at();

CREATE TRIGGER trigger_osax_treatments_updated_at
  BEFORE UPDATE ON osax_treatments
  FOR EACH ROW
  EXECUTE FUNCTION update_osax_updated_at();

-- Auto-increment version for optimistic locking
CREATE OR REPLACE FUNCTION increment_osax_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_osax_cases_version
  BEFORE UPDATE ON osax_cases
  FOR EACH ROW
  EXECUTE FUNCTION increment_osax_version();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate case number
CREATE OR REPLACE FUNCTION generate_osax_case_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
  case_num TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(case_number FROM 'OSA-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM osax_cases
  WHERE case_number LIKE 'OSA-' || year_part || '-%';

  case_num := 'OSA-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
  RETURN case_num;
END;
$$ LANGUAGE plpgsql;

-- Determine severity from AHI (AASM guidelines)
CREATE OR REPLACE FUNCTION determine_osax_severity(ahi_value DECIMAL)
RETURNS osax_severity AS $$
BEGIN
  IF ahi_value IS NULL THEN
    RETURN NULL;
  ELSIF ahi_value < 5 THEN
    RETURN 'NONE';
  ELSIF ahi_value < 15 THEN
    RETURN 'MILD';
  ELSIF ahi_value < 30 THEN
    RETURN 'MODERATE';
  ELSE
    RETURN 'SEVERE';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if case requires immediate attention
CREATE OR REPLACE FUNCTION osax_requires_immediate_attention(
  p_priority osax_priority,
  p_severity osax_severity,
  p_cv_risk osax_cardiovascular_risk
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_priority = 'URGENT'
    OR p_severity = 'SEVERE'
    OR p_cv_risk = 'CRITICAL';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active cases view (excludes deleted and closed)
CREATE OR REPLACE VIEW osax_active_cases AS
SELECT *
FROM osax_cases
WHERE deleted_at IS NULL
  AND status NOT IN ('CLOSED', 'CANCELLED');

-- Cases pending review
CREATE OR REPLACE VIEW osax_pending_review AS
SELECT *
FROM osax_cases
WHERE deleted_at IS NULL
  AND status = 'SCORED'
ORDER BY
  CASE priority
    WHEN 'URGENT' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'NORMAL' THEN 3
    WHEN 'LOW' THEN 4
  END,
  created_at ASC;

-- Cases with overdue follow-ups
CREATE OR REPLACE VIEW osax_overdue_follow_ups AS
SELECT c.*, f.scheduled_date as overdue_follow_up_date, f.follow_up_type as overdue_follow_up_type
FROM osax_cases c
JOIN osax_follow_ups f ON f.case_id = c.id
WHERE c.deleted_at IS NULL
  AND f.completed_date IS NULL
  AND f.cancelled = FALSE
  AND f.scheduled_date < CURRENT_DATE;

-- Dashboard statistics view
CREATE OR REPLACE VIEW osax_dashboard_stats AS
SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_cases,
  COUNT(*) FILTER (WHERE status = 'SCORED' AND deleted_at IS NULL) as pending_review,
  COUNT(*) FILTER (WHERE status = 'IN_TREATMENT' AND deleted_at IS NULL) as active_treatments,
  COUNT(*) FILTER (WHERE severity = 'SEVERE' AND deleted_at IS NULL) as severe_cases,
  COUNT(*) FILTER (WHERE priority = 'URGENT' AND deleted_at IS NULL) as urgent_cases,
  AVG(compliance_rate) FILTER (WHERE compliance_rate IS NOT NULL AND deleted_at IS NULL) as avg_compliance_rate
FROM osax_cases;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE osax_cases IS 'OSAX case management aggregate root - stores sleep apnea cases';
COMMENT ON TABLE osax_score_history IS 'Historical record of clinical scores for audit trail';
COMMENT ON TABLE osax_follow_ups IS 'Follow-up appointments and compliance checks';
COMMENT ON TABLE osax_treatments IS 'Treatment records including device settings and compliance';

COMMENT ON COLUMN osax_cases.ahi IS 'Apnea-Hypopnea Index - events per hour';
COMMENT ON COLUMN osax_cases.odi IS 'Oxygen Desaturation Index - desaturations per hour';
COMMENT ON COLUMN osax_cases.spo2_nadir IS 'Lowest SpO2 during sleep (percentage)';
COMMENT ON COLUMN osax_cases.ess_score IS 'Epworth Sleepiness Scale score (0-24)';
COMMENT ON COLUMN osax_cases.composite_score IS 'Weighted composite clinical score (0-100)';
COMMENT ON COLUMN osax_cases.pseudonymized_id IS 'GDPR-compliant pseudonymized identifier';
