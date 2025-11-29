-- ============================================================================
-- OSAX Audit Log Migration
-- ============================================================================
-- Comprehensive audit logging for OSAX domain operations.
-- Supports GDPR compliance, clinical audit requirements, and security tracking.
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Audit event categories
CREATE TYPE osax_audit_category AS ENUM (
  'CASE_LIFECYCLE',
  'CLINICAL_SCORING',
  'TREATMENT',
  'REVIEW',
  'CONSENT',
  'DATA_ACCESS',
  'SECURITY',
  'GDPR'
);

-- Audit event types
CREATE TYPE osax_audit_event_type AS ENUM (
  -- Case lifecycle
  'CASE_CREATED',
  'CASE_UPDATED',
  'CASE_DELETED',
  'CASE_STATUS_CHANGED',
  'CASE_PRIORITY_CHANGED',
  'CASE_ASSIGNED',
  'CASE_UNASSIGNED',

  -- Clinical scoring
  'SCORE_CALCULATED',
  'SCORE_MODIFIED',
  'SEVERITY_CHANGED',

  -- Treatment
  'TREATMENT_INITIATED',
  'TREATMENT_MODIFIED',
  'TREATMENT_COMPLETED',
  'TREATMENT_TERMINATED',

  -- Review
  'REVIEW_SUBMITTED',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
  'REVIEW_REFERRED',

  -- Follow-up
  'FOLLOW_UP_SCHEDULED',
  'FOLLOW_UP_COMPLETED',
  'FOLLOW_UP_MISSED',
  'FOLLOW_UP_CANCELLED',

  -- Consent (GDPR)
  'CONSENT_OBTAINED',
  'CONSENT_WITHDRAWN',
  'CONSENT_RENEWED',

  -- Data access (GDPR)
  'DATA_ACCESSED',
  'DATA_EXPORTED',
  'DATA_DELETED',
  'DATA_ANONYMIZED',
  'DATA_RETENTION_SET',

  -- Security
  'ACCESS_DENIED',
  'SUSPICIOUS_ACTIVITY',
  'BULK_OPERATION'
);

-- ============================================================================
-- AUDIT TABLES
-- ============================================================================

-- Main audit log table
CREATE TABLE osax_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event identification
  event_type osax_audit_event_type NOT NULL,
  category osax_audit_category NOT NULL,

  -- Correlation
  correlation_id UUID,
  causation_id UUID,
  idempotency_key VARCHAR(100),

  -- Target
  case_id UUID REFERENCES osax_cases(id) ON DELETE SET NULL,
  case_number VARCHAR(50),
  subject_id UUID,

  -- Actor
  actor_id UUID,
  actor_type VARCHAR(50) NOT NULL DEFAULT 'USER', -- USER, SYSTEM, SERVICE
  actor_name VARCHAR(200),
  actor_role VARCHAR(50),

  -- Changes
  old_value JSONB,
  new_value JSONB,
  changed_fields TEXT[],

  -- Context
  reason TEXT,
  notes TEXT,

  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),
  session_id VARCHAR(100),

  -- Organization
  organization_id UUID,

  -- Timestamp (immutable)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  metadata JSONB,

  -- Retention tracking
  retention_until DATE,
  retention_policy VARCHAR(50)
);

-- Access log for sensitive data (GDPR Art. 30)
CREATE TABLE osax_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Target
  case_id UUID REFERENCES osax_cases(id) ON DELETE SET NULL,
  subject_id UUID,

  -- Actor
  user_id UUID NOT NULL,
  user_role VARCHAR(50),

  -- Access details
  access_type VARCHAR(50) NOT NULL, -- READ, EXPORT, SEARCH, etc.
  fields_accessed TEXT[],
  purpose TEXT,

  -- Request context
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Organization
  organization_id UUID
);

-- Data subject requests log (GDPR Art. 15-22)
CREATE TABLE osax_data_subject_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Request details
  request_type VARCHAR(50) NOT NULL, -- ACCESS, PORTABILITY, RECTIFICATION, ERASURE, RESTRICTION, OBJECTION
  subject_id UUID NOT NULL,
  case_id UUID REFERENCES osax_cases(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, DENIED

  -- Timeline (GDPR: 1 month response time)
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Processing
  processed_by UUID,
  processor_name VARCHAR(200),
  response_notes TEXT,
  denial_reason TEXT,

  -- Data
  exported_data JSONB, -- For access/portability requests
  rectification_details JSONB, -- For rectification requests

  -- Metadata
  metadata JSONB,

  -- Organization
  organization_id UUID
);

-- Consent history (GDPR Art. 7)
CREATE TABLE osax_consent_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Subject and case
  subject_id UUID NOT NULL,
  case_id UUID REFERENCES osax_cases(id) ON DELETE SET NULL,

  -- Consent details
  consent_type VARCHAR(50) NOT NULL, -- PROCESSING, RESEARCH, MARKETING, THIRD_PARTY
  consent_given BOOLEAN NOT NULL,

  -- Context
  obtained_by UUID,
  obtained_method VARCHAR(50), -- WRITTEN, VERBAL, ELECTRONIC
  withdrawal_reason TEXT,

  -- Evidence
  consent_document_id VARCHAR(100),
  ip_address INET,

  -- Timestamp
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  -- Organization
  organization_id UUID
);

-- Data retention schedule
CREATE TABLE osax_retention_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Target
  case_id UUID REFERENCES osax_cases(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL,

  -- Retention details
  retention_category VARCHAR(50) NOT NULL, -- CLINICAL, LEGAL, RESEARCH
  retention_period_days INTEGER NOT NULL,
  retention_reason TEXT NOT NULL,
  legal_basis TEXT,

  -- Schedule
  data_created_at TIMESTAMPTZ NOT NULL,
  retention_until DATE NOT NULL,
  deletion_scheduled_at DATE,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PENDING_DELETION, DELETED, EXTENDED

  -- Processing
  deletion_requested_by UUID,
  deletion_approved_by UUID,
  deleted_at TIMESTAMPTZ,
  deletion_notes TEXT,

  -- Metadata
  metadata JSONB,

  -- Organization
  organization_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Audit log indexes
CREATE INDEX idx_osax_audit_log_case ON osax_audit_log(case_id, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_subject ON osax_audit_log(subject_id, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_actor ON osax_audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_type ON osax_audit_log(event_type, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_category ON osax_audit_log(category, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_correlation ON osax_audit_log(correlation_id);
CREATE INDEX idx_osax_audit_log_organization ON osax_audit_log(organization_id, occurred_at DESC);
CREATE INDEX idx_osax_audit_log_occurred ON osax_audit_log(occurred_at DESC);
CREATE INDEX idx_osax_audit_log_retention ON osax_audit_log(retention_until) WHERE retention_until IS NOT NULL;

-- Access log indexes
CREATE INDEX idx_osax_access_log_case ON osax_access_log(case_id, accessed_at DESC);
CREATE INDEX idx_osax_access_log_user ON osax_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_osax_access_log_subject ON osax_access_log(subject_id, accessed_at DESC);
CREATE INDEX idx_osax_access_log_type ON osax_access_log(access_type, accessed_at DESC);

-- Data subject requests indexes
CREATE INDEX idx_osax_dsr_subject ON osax_data_subject_requests(subject_id);
CREATE INDEX idx_osax_dsr_status ON osax_data_subject_requests(status, deadline_at);
CREATE INDEX idx_osax_dsr_pending ON osax_data_subject_requests(deadline_at) WHERE status = 'PENDING';

-- Consent history indexes
CREATE INDEX idx_osax_consent_subject ON osax_consent_history(subject_id, recorded_at DESC);
CREATE INDEX idx_osax_consent_case ON osax_consent_history(case_id, recorded_at DESC);
CREATE INDEX idx_osax_consent_type ON osax_consent_history(consent_type, valid_from DESC);

-- Retention schedule indexes
CREATE INDEX idx_osax_retention_case ON osax_retention_schedule(case_id);
CREATE INDEX idx_osax_retention_subject ON osax_retention_schedule(subject_id);
CREATE INDEX idx_osax_retention_until ON osax_retention_schedule(retention_until) WHERE status = 'ACTIVE';
CREATE INDEX idx_osax_retention_deletion ON osax_retention_schedule(deletion_scheduled_at) WHERE status = 'PENDING_DELETION';

-- ============================================================================
-- RLS POLICIES FOR AUDIT TABLES
-- ============================================================================

ALTER TABLE osax_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_retention_schedule ENABLE ROW LEVEL SECURITY;

-- Audit log: read-only for admins, insert for system
CREATE POLICY osax_audit_log_select ON osax_audit_log
  FOR SELECT
  USING (
    has_osax_permission('audit')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
    )
  );

CREATE POLICY osax_audit_log_insert ON osax_audit_log
  FOR INSERT
  WITH CHECK (TRUE); -- System can always insert

-- Access log: similar to audit log
CREATE POLICY osax_access_log_select ON osax_access_log
  FOR SELECT
  USING (
    has_osax_permission('audit')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
    )
  );

CREATE POLICY osax_access_log_insert ON osax_access_log
  FOR INSERT
  WITH CHECK (TRUE);

-- Data subject requests: admin access + own requests
CREATE POLICY osax_dsr_select ON osax_data_subject_requests
  FOR SELECT
  USING (
    has_osax_permission('audit')
    OR subject_id = get_current_user_id()
  );

CREATE POLICY osax_dsr_insert ON osax_data_subject_requests
  FOR INSERT
  WITH CHECK (has_osax_permission('write'));

CREATE POLICY osax_dsr_update ON osax_data_subject_requests
  FOR UPDATE
  USING (has_osax_permission('manage'));

-- Consent history: admin access
CREATE POLICY osax_consent_select ON osax_consent_history
  FOR SELECT
  USING (
    has_osax_permission('audit')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
    )
  );

CREATE POLICY osax_consent_insert ON osax_consent_history
  FOR INSERT
  WITH CHECK (has_osax_permission('write'));

-- Retention schedule: admin access
CREATE POLICY osax_retention_select ON osax_retention_schedule
  FOR SELECT
  USING (
    has_osax_permission('manage')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
    )
  );

CREATE POLICY osax_retention_insert ON osax_retention_schedule
  FOR INSERT
  WITH CHECK (has_osax_permission('manage'));

CREATE POLICY osax_retention_update ON osax_retention_schedule
  FOR UPDATE
  USING (has_osax_permission('manage'));

-- ============================================================================
-- AUDIT FUNCTIONS
-- ============================================================================

-- Create audit log entry
CREATE OR REPLACE FUNCTION create_osax_audit_entry(
  p_event_type osax_audit_event_type,
  p_category osax_audit_category,
  p_case_id UUID DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_changed_fields TEXT[] DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  entry_id UUID;
  v_case_number VARCHAR(50);
  v_subject_id UUID;
BEGIN
  -- Get case details if case_id provided
  IF p_case_id IS NOT NULL THEN
    SELECT case_number, subject_id
    INTO v_case_number, v_subject_id
    FROM osax_cases
    WHERE id = p_case_id;
  END IF;

  INSERT INTO osax_audit_log (
    event_type,
    category,
    case_id,
    case_number,
    subject_id,
    actor_id,
    actor_type,
    actor_role,
    old_value,
    new_value,
    changed_fields,
    reason,
    correlation_id,
    ip_address,
    organization_id
  ) VALUES (
    p_event_type,
    p_category,
    p_case_id,
    v_case_number,
    v_subject_id,
    get_current_user_id(),
    'USER',
    get_current_user_role(),
    p_old_value,
    p_new_value,
    p_changed_fields,
    p_reason,
    p_correlation_id,
    (current_setting('request.headers', TRUE)::json->>'x-forwarded-for')::INET
    get_user_organization_id()
  )
  RETURNING id INTO entry_id;

  RETURN entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automatic audit trigger for osax_cases
CREATE OR REPLACE FUNCTION audit_osax_cases_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type osax_audit_event_type;
  v_old_value JSONB;
  v_new_value JSONB;
  v_changed_fields TEXT[];
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'CASE_CREATED';
    v_new_value := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'CASE_DELETED';
    v_old_value := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine specific event type based on changes
    IF OLD.status != NEW.status THEN
      v_event_type := 'CASE_STATUS_CHANGED';
    ELSIF OLD.priority != NEW.priority THEN
      v_event_type := 'CASE_PRIORITY_CHANGED';
    ELSIF OLD.assigned_specialist_id IS DISTINCT FROM NEW.assigned_specialist_id THEN
      IF NEW.assigned_specialist_id IS NOT NULL THEN
        v_event_type := 'CASE_ASSIGNED';
      ELSE
        v_event_type := 'CASE_UNASSIGNED';
      END IF;
    ELSIF OLD.severity IS DISTINCT FROM NEW.severity THEN
      v_event_type := 'SEVERITY_CHANGED';
    ELSIF OLD.consent_obtained != NEW.consent_obtained OR
          OLD.consent_withdrawn != NEW.consent_withdrawn THEN
      IF NEW.consent_withdrawn THEN
        v_event_type := 'CONSENT_WITHDRAWN';
      ELSIF NEW.consent_obtained AND NOT OLD.consent_obtained THEN
        v_event_type := 'CONSENT_OBTAINED';
      ELSE
        v_event_type := 'CONSENT_RENEWED';
      END IF;
    ELSE
      v_event_type := 'CASE_UPDATED';
    END IF;

    v_old_value := to_jsonb(OLD);
    v_new_value := to_jsonb(NEW);

    -- Identify changed fields
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      EXCEPT
      SELECT key FROM jsonb_each(to_jsonb(OLD))
    ) changed;
  END IF;

  -- Insert audit entry
  INSERT INTO osax_audit_log (
    event_type,
    category,
    case_id,
    case_number,
    subject_id,
    actor_id,
    actor_type,
    actor_role,
    old_value,
    new_value,
    changed_fields,
    organization_id
  ) VALUES (
    v_event_type,
    CASE
      WHEN v_event_type IN ('CONSENT_OBTAINED', 'CONSENT_WITHDRAWN', 'CONSENT_RENEWED') THEN 'CONSENT'::osax_audit_category
      WHEN v_event_type = 'SEVERITY_CHANGED' THEN 'CLINICAL_SCORING'::osax_audit_category
      ELSE 'CASE_LIFECYCLE'::osax_audit_category
    END,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.case_number, OLD.case_number),
    COALESCE(NEW.subject_id, OLD.subject_id),
    get_current_user_id(),
    'USER',
    get_current_user_role(),
    v_old_value,
    v_new_value,
    v_changed_fields,
    COALESCE(NEW.organization_id, OLD.organization_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_audit_osax_cases
  AFTER INSERT OR UPDATE OR DELETE ON osax_cases
  FOR EACH ROW
  EXECUTE FUNCTION audit_osax_cases_changes();

-- ============================================================================
-- GDPR COMPLIANCE FUNCTIONS
-- ============================================================================

-- Export subject data (GDPR Art. 15, 20)
CREATE OR REPLACE FUNCTION export_osax_subject_data(p_subject_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_data JSONB;
BEGIN
  -- Collect all data for the subject
  SELECT jsonb_build_object(
    'subject_id', p_subject_id,
    'exported_at', NOW(),
    'cases', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb)
      FROM osax_cases c
      WHERE c.subject_id = p_subject_id
      AND c.deleted_at IS NULL
    ),
    'score_history', (
      SELECT COALESCE(jsonb_agg(to_jsonb(sh.*)), '[]'::jsonb)
      FROM osax_score_history sh
      JOIN osax_cases c ON c.id = sh.case_id
      WHERE c.subject_id = p_subject_id
    ),
    'follow_ups', (
      SELECT COALESCE(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb)
      FROM osax_follow_ups f
      JOIN osax_cases c ON c.id = f.case_id
      WHERE c.subject_id = p_subject_id
    ),
    'treatments', (
      SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
      FROM osax_treatments t
      JOIN osax_cases c ON c.id = t.case_id
      WHERE c.subject_id = p_subject_id
    ),
    'consent_history', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ch.*)), '[]'::jsonb)
      FROM osax_consent_history ch
      WHERE ch.subject_id = p_subject_id
    )
  ) INTO v_data;

  -- Log the export
  INSERT INTO osax_audit_log (
    event_type,
    category,
    subject_id,
    actor_id,
    actor_type,
    actor_role,
    new_value,
    organization_id
  ) VALUES (
    'DATA_EXPORTED',
    'GDPR',
    p_subject_id,
    get_current_user_id(),
    'USER',
    get_current_user_role(),
    jsonb_build_object('export_type', 'FULL', 'record_count', jsonb_array_length(v_data->'cases')),
    get_user_organization_id()
  );

  RETURN v_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anonymize subject data (GDPR Art. 17 alternative)
CREATE OR REPLACE FUNCTION anonymize_osax_subject_data(
  p_subject_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_anonymized_id UUID;
BEGIN
  -- Generate anonymized ID
  v_anonymized_id := uuid_generate_v4();

  -- Anonymize cases
  UPDATE osax_cases
  SET
    subject_id = v_anonymized_id,
    subject_id_type = 'ANONYMIZED',
    pseudonymized_id = encode(sha256(p_subject_id::text::bytea), 'hex'),
    assigned_specialist_name = 'ANONYMIZED',
    reviewer_name = 'ANONYMIZED',
    treatment_notes = NULL,
    review_notes = NULL
  WHERE subject_id = p_subject_id;

  -- Update consent history
  UPDATE osax_consent_history
  SET subject_id = v_anonymized_id
  WHERE subject_id = p_subject_id;

  -- Log anonymization
  INSERT INTO osax_audit_log (
    event_type,
    category,
    subject_id,
    actor_id,
    actor_type,
    actor_role,
    reason,
    new_value,
    organization_id
  ) VALUES (
    'DATA_ANONYMIZED',
    'GDPR',
    v_anonymized_id, -- Use new ID
    get_current_user_id(),
    'USER',
    get_current_user_role(),
    p_reason,
    jsonb_build_object('original_subject_hash', encode(sha256(p_subject_id::text::bytea), 'hex')),
    get_user_organization_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete subject data (GDPR Art. 17)
CREATE OR REPLACE FUNCTION delete_osax_subject_data(
  p_subject_id UUID,
  p_reason TEXT,
  p_immediate BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
  IF p_immediate THEN
    -- Hard delete all data
    DELETE FROM osax_treatments t
    USING osax_cases c
    WHERE t.case_id = c.id AND c.subject_id = p_subject_id;

    DELETE FROM osax_follow_ups f
    USING osax_cases c
    WHERE f.case_id = c.id AND c.subject_id = p_subject_id;

    DELETE FROM osax_score_history sh
    USING osax_cases c
    WHERE sh.case_id = c.id AND c.subject_id = p_subject_id;

    DELETE FROM osax_cases WHERE subject_id = p_subject_id;

    DELETE FROM osax_consent_history WHERE subject_id = p_subject_id;
  ELSE
    -- Soft delete (mark for deletion)
    UPDATE osax_cases
    SET deleted_at = NOW()
    WHERE subject_id = p_subject_id;

    -- Schedule retention deletion
    INSERT INTO osax_retention_schedule (
      subject_id,
      retention_category,
      retention_period_days,
      retention_reason,
      data_created_at,
      retention_until,
      deletion_scheduled_at,
      status,
      deletion_requested_by,
      deletion_notes
    )
    SELECT
      p_subject_id,
      'GDPR',
      30, -- 30 day grace period
      p_reason,
      created_at,
      CURRENT_DATE + INTERVAL '30 days',
      CURRENT_DATE + INTERVAL '30 days',
      'PENDING_DELETION',
      get_current_user_id(),
      'Subject deletion request'
    FROM osax_cases
    WHERE subject_id = p_subject_id
    LIMIT 1;
  END IF;

  -- Log deletion
  INSERT INTO osax_audit_log (
    event_type,
    category,
    subject_id,
    actor_id,
    actor_type,
    actor_role,
    reason,
    new_value,
    organization_id
  ) VALUES (
    'DATA_DELETED',
    'GDPR',
    p_subject_id,
    get_current_user_id(),
    'USER',
    get_current_user_role(),
    p_reason,
    jsonb_build_object('immediate', p_immediate),
    get_user_organization_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RETENTION MANAGEMENT
-- ============================================================================

-- Process pending deletions (run as scheduled job)
CREATE OR REPLACE FUNCTION process_osax_retention_deletions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT rs.*, c.id as case_id
    FROM osax_retention_schedule rs
    LEFT JOIN osax_cases c ON c.subject_id = rs.subject_id
    WHERE rs.status = 'PENDING_DELETION'
    AND rs.deletion_scheduled_at <= CURRENT_DATE
  LOOP
    -- Delete the data
    PERFORM delete_osax_subject_data(v_record.subject_id, 'Retention period expired', TRUE);

    -- Update schedule status
    UPDATE osax_retention_schedule
    SET
      status = 'DELETED',
      deleted_at = NOW()
    WHERE id = v_record.id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Audit summary view
CREATE OR REPLACE VIEW osax_audit_summary AS
SELECT
  DATE_TRUNC('day', occurred_at) as audit_date,
  category,
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT case_id) as unique_cases,
  COUNT(DISTINCT actor_id) as unique_actors
FROM osax_audit_log
WHERE occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', occurred_at), category, event_type
ORDER BY audit_date DESC, category, event_type;

-- Pending data subject requests
CREATE OR REPLACE VIEW osax_pending_dsr AS
SELECT
  *,
  deadline_at - NOW() as time_remaining,
  CASE
    WHEN deadline_at < NOW() THEN 'OVERDUE'
    WHEN deadline_at < NOW() + INTERVAL '7 days' THEN 'URGENT'
    ELSE 'ON_TRACK'
  END as urgency
FROM osax_data_subject_requests
WHERE status IN ('PENDING', 'IN_PROGRESS')
ORDER BY deadline_at ASC;

-- Consent status summary
CREATE OR REPLACE VIEW osax_consent_summary AS
SELECT
  c.subject_id,
  c.case_id,
  c.consent_type,
  c.consent_given,
  c.valid_from,
  c.valid_until,
  CASE
    WHEN c.valid_until < NOW() THEN 'EXPIRED'
    WHEN NOT c.consent_given THEN 'WITHDRAWN'
    ELSE 'ACTIVE'
  END as consent_status
FROM osax_consent_history c
WHERE c.id = (
  SELECT id FROM osax_consent_history ch
  WHERE ch.subject_id = c.subject_id
  AND ch.consent_type = c.consent_type
  ORDER BY ch.recorded_at DESC
  LIMIT 1
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE osax_audit_log IS 'Comprehensive audit trail for all OSAX operations';
COMMENT ON TABLE osax_access_log IS 'Log of data access for GDPR Article 30 compliance';
COMMENT ON TABLE osax_data_subject_requests IS 'GDPR data subject request tracking (Art. 15-22)';
COMMENT ON TABLE osax_consent_history IS 'Consent record history for GDPR Article 7 compliance';
COMMENT ON TABLE osax_retention_schedule IS 'Data retention and deletion scheduling';

COMMENT ON FUNCTION create_osax_audit_entry IS 'Create a manual audit log entry';
COMMENT ON FUNCTION export_osax_subject_data IS 'Export all data for a subject (GDPR Art. 15, 20)';
COMMENT ON FUNCTION anonymize_osax_subject_data IS 'Anonymize subject data (GDPR Art. 17 alternative)';
COMMENT ON FUNCTION delete_osax_subject_data IS 'Delete subject data (GDPR Art. 17)';
COMMENT ON FUNCTION process_osax_retention_deletions IS 'Process scheduled deletions (run as cron job)';
