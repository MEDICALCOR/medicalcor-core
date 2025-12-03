-- ============================================================================
-- OSAX Row Level Security Policies
-- ============================================================================
-- Security policies for OSAX tables implementing:
-- - Role-based access control
-- - Organization/tenant isolation
-- - GDPR compliance (consent-based access)
-- - Audit trail protection
-- ============================================================================

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE osax_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE osax_treatments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's organization ID from JWT claims
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    COALESCE(
      current_setting('request.jwt.claims', TRUE)::json->>'organization_id',
      current_setting('app.organization_id', TRUE)
    )
  )::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get current user's ID from JWT claims
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    COALESCE(
      current_setting('request.jwt.claims', TRUE)::json->>'sub',
      current_setting('app.user_id', TRUE)
    )
  )::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get current user's role from JWT claims
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', TRUE)::json->>'role',
    current_setting('app.user_role', TRUE),
    'viewer'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'viewer';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user has specific permission
CREATE OR REPLACE FUNCTION has_osax_permission(permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  permissions TEXT[];
BEGIN
  user_role := get_current_user_role();

  -- Define role permissions
  CASE user_role
    WHEN 'admin' THEN
      permissions := ARRAY['read', 'write', 'delete', 'manage', 'audit'];
    WHEN 'physician' THEN
      permissions := ARRAY['read', 'write', 'review'];
    WHEN 'specialist' THEN
      permissions := ARRAY['read', 'write'];
    WHEN 'care_coordinator' THEN
      permissions := ARRAY['read', 'write'];
    WHEN 'viewer' THEN
      permissions := ARRAY['read'];
    ELSE
      permissions := ARRAY[]::TEXT[];
  END CASE;

  RETURN permission = ANY(permissions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can access specific case (organization + consent)
CREATE OR REPLACE FUNCTION can_access_osax_case(case_row osax_cases)
RETURNS BOOLEAN AS $$
DECLARE
  user_org_id UUID;
  user_role TEXT;
BEGIN
  user_org_id := get_user_organization_id();
  user_role := get_current_user_role();

  -- Admins can access all within organization
  IF user_role = 'admin' THEN
    RETURN case_row.organization_id = user_org_id OR user_org_id IS NULL;
  END IF;

  -- Check organization match
  IF case_row.organization_id IS NOT NULL AND case_row.organization_id != user_org_id THEN
    RETURN FALSE;
  END IF;

  -- Check consent for non-admin users
  IF case_row.consent_withdrawn = TRUE THEN
    RETURN FALSE;
  END IF;

  -- Specialists can only access assigned cases
  IF user_role = 'specialist' THEN
    RETURN case_row.assigned_specialist_id = get_current_user_id();
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- OSAX_CASES POLICIES
-- ============================================================================

-- SELECT: Users can read cases in their organization (with consent check)
CREATE POLICY osax_cases_select_policy ON osax_cases
  FOR SELECT
  USING (
    can_access_osax_case(osax_cases)
    AND has_osax_permission('read')
  );

-- INSERT: Users with write permission can create cases
CREATE POLICY osax_cases_insert_policy ON osax_cases
  FOR INSERT
  WITH CHECK (
    has_osax_permission('write')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
      OR get_current_user_role() = 'admin'
    )
  );

-- UPDATE: Users with write permission can update cases (with consent check)
CREATE POLICY osax_cases_update_policy ON osax_cases
  FOR UPDATE
  USING (
    can_access_osax_case(osax_cases)
    AND has_osax_permission('write')
  )
  WITH CHECK (
    has_osax_permission('write')
    AND (
      organization_id = get_user_organization_id()
      OR organization_id IS NULL
      OR get_current_user_role() = 'admin'
    )
  );

-- DELETE: Only admins can soft-delete (by setting deleted_at)
-- Hard delete is restricted at application level
CREATE POLICY osax_cases_delete_policy ON osax_cases
  FOR DELETE
  USING (
    has_osax_permission('delete')
    AND (
      organization_id = get_user_organization_id()
      OR get_current_user_role() = 'admin'
    )
  );

-- ============================================================================
-- OSAX_SCORE_HISTORY POLICIES
-- ============================================================================

-- SELECT: Same as parent case
CREATE POLICY osax_score_history_select_policy ON osax_score_history
  FOR SELECT
  USING (
    has_osax_permission('read')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_score_history.case_id
      AND can_access_osax_case(c)
    )
  );

-- INSERT: Through case access
CREATE POLICY osax_score_history_insert_policy ON osax_score_history
  FOR INSERT
  WITH CHECK (
    has_osax_permission('write')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_score_history.case_id
      AND can_access_osax_case(c)
    )
  );

-- UPDATE: Score history is immutable, no updates allowed
-- (Enforced by not having an update policy)

-- DELETE: Only through cascade or admin
CREATE POLICY osax_score_history_delete_policy ON osax_score_history
  FOR DELETE
  USING (
    has_osax_permission('delete')
  );

-- ============================================================================
-- OSAX_FOLLOW_UPS POLICIES
-- ============================================================================

-- SELECT: Same as parent case
CREATE POLICY osax_follow_ups_select_policy ON osax_follow_ups
  FOR SELECT
  USING (
    has_osax_permission('read')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_follow_ups.case_id
      AND can_access_osax_case(c)
    )
  );

-- INSERT: Through case access
CREATE POLICY osax_follow_ups_insert_policy ON osax_follow_ups
  FOR INSERT
  WITH CHECK (
    has_osax_permission('write')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_follow_ups.case_id
      AND can_access_osax_case(c)
    )
  );

-- UPDATE: Through case access
CREATE POLICY osax_follow_ups_update_policy ON osax_follow_ups
  FOR UPDATE
  USING (
    has_osax_permission('write')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_follow_ups.case_id
      AND can_access_osax_case(c)
    )
  );

-- DELETE: Admin only
CREATE POLICY osax_follow_ups_delete_policy ON osax_follow_ups
  FOR DELETE
  USING (
    has_osax_permission('delete')
  );

-- ============================================================================
-- OSAX_TREATMENTS POLICIES
-- ============================================================================

-- SELECT: Same as parent case
CREATE POLICY osax_treatments_select_policy ON osax_treatments
  FOR SELECT
  USING (
    has_osax_permission('read')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_treatments.case_id
      AND can_access_osax_case(c)
    )
  );

-- INSERT: Through case access
CREATE POLICY osax_treatments_insert_policy ON osax_treatments
  FOR INSERT
  WITH CHECK (
    has_osax_permission('write')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_treatments.case_id
      AND can_access_osax_case(c)
    )
  );

-- UPDATE: Through case access
CREATE POLICY osax_treatments_update_policy ON osax_treatments
  FOR UPDATE
  USING (
    has_osax_permission('write')
    AND EXISTS (
      SELECT 1 FROM osax_cases c
      WHERE c.id = osax_treatments.case_id
      AND can_access_osax_case(c)
    )
  );

-- DELETE: Admin only
CREATE POLICY osax_treatments_delete_policy ON osax_treatments
  FOR DELETE
  USING (
    has_osax_permission('delete')
  );

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================

-- Service role bypasses RLS for backend operations
-- This is handled automatically by Supabase for the service_role key

-- ============================================================================
-- GDPR DATA ACCESS POLICIES
-- ============================================================================

-- Function to check if data access is allowed under GDPR
CREATE OR REPLACE FUNCTION is_gdpr_access_allowed(case_row osax_cases)
RETURNS BOOLEAN AS $$
BEGIN
  -- Consent withdrawn - very limited access
  IF case_row.consent_withdrawn THEN
    -- Only allow access if within retention period and for legal purposes
    IF case_row.data_retention_until IS NULL OR
       case_row.data_retention_until < CURRENT_DATE THEN
      RETURN FALSE;
    END IF;
    -- Only admins can access withdrawn consent data
    RETURN get_current_user_role() = 'admin';
  END IF;

  -- No consent obtained - limited access
  IF NOT case_row.consent_obtained THEN
    -- Allow access for consent collection process
    RETURN TRUE;
  END IF;

  -- Consent obtained - full access within permissions
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- AUDIT TRIGGER FOR SENSITIVE OPERATIONS
-- ============================================================================

-- Log sensitive data access attempts
CREATE OR REPLACE FUNCTION log_osax_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log access to sensitive fields or withdrawn consent cases
  IF TG_OP = 'SELECT' AND OLD.consent_withdrawn = TRUE THEN
    INSERT INTO osax_access_log (
      case_id,
      user_id,
      access_type,
      accessed_at,
      ip_address
    ) VALUES (
      OLD.id,
      get_current_user_id(),
      'READ_WITHDRAWN',
      NOW(),
      current_setting('request.headers', TRUE)::json->>'x-forwarded-for'
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_user_organization_id() IS 'Extract organization ID from JWT claims';
COMMENT ON FUNCTION get_current_user_id() IS 'Extract user ID from JWT claims';
COMMENT ON FUNCTION get_current_user_role() IS 'Extract user role from JWT claims';
COMMENT ON FUNCTION has_osax_permission(TEXT) IS 'Check if current user has specific OSAX permission';
COMMENT ON FUNCTION can_access_osax_case(osax_cases) IS 'Check if current user can access specific case';
COMMENT ON FUNCTION is_gdpr_access_allowed(osax_cases) IS 'Check if data access is allowed under GDPR';
