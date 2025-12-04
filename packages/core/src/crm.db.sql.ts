/**
 * CRM SQL Queries
 * Extracted for maintainability per Platinum Banking/Medical Standard
 *
 * All SQL queries are defined as constants to:
 * - Improve code readability and maintainability
 * - Enable SQL linting and static analysis
 * - Separate database logic from flow control
 */

// =============================================================================
// LEAD QUERIES
// =============================================================================

/**
 * Find lead ID by external source and contact ID
 */
export const FIND_LEAD_BY_EXTERNAL_SQL = `
  SELECT id FROM leads
  WHERE external_source = $1
    AND external_contact_id = $2
  LIMIT 1
`;

/**
 * Find practitioner ID by external user ID
 */
export const FIND_PRACTITIONER_BY_EXTERNAL_USER_SQL = `
  SELECT id
  FROM practitioners
  WHERE external_user_id = $1
    AND is_active = true
  LIMIT 1
`;

/**
 * Insert lead event for audit trail
 */
export const INSERT_LEAD_EVENT_SQL = `
  INSERT INTO lead_events (lead_id, event_type, actor, payload)
  VALUES ($1, $2, $3, $4)
`;

/**
 * Insert new lead (with ON CONFLICT for upsert pattern)
 * Parameters: $1-$24 mapped to lead fields
 */
export const INSERT_LEAD_SQL = `
  INSERT INTO leads (
    clinic_id, assigned_agent_id, external_contact_id, external_source, external_url,
    full_name, phone, email, source, acquisition_channel, ad_campaign_id,
    ai_score, ai_intent, ai_summary, ai_last_analysis_at, language, tags, metadata,
    gdpr_consent, gdpr_consent_at, gdpr_consent_source, status, created_by, updated_by
  )
  VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23, $24
  )
  ON CONFLICT (external_source, external_contact_id) DO NOTHING
  RETURNING id
`;

/**
 * Update existing lead (patch with COALESCE for partial updates)
 * Parameters: $1-$21 for values, $22-$23 for WHERE clause
 */
export const UPDATE_LEAD_SQL = `
  UPDATE leads SET
    clinic_id            = COALESCE($1, leads.clinic_id),
    assigned_agent_id    = COALESCE($2, leads.assigned_agent_id),
    external_url         = COALESCE($3, leads.external_url),
    full_name            = COALESCE($4, leads.full_name),
    phone                = COALESCE($5, leads.phone),
    email                = COALESCE($6, leads.email),
    source               = COALESCE($7, leads.source),
    acquisition_channel  = COALESCE($8, leads.acquisition_channel),
    ad_campaign_id       = COALESCE($9, leads.ad_campaign_id),
    ai_score             = COALESCE($10, leads.ai_score),
    ai_intent            = COALESCE($11, leads.ai_intent),
    ai_summary           = COALESCE($12, leads.ai_summary),
    ai_last_analysis_at  = COALESCE($13, leads.ai_last_analysis_at),
    language             = COALESCE($14, leads.language),
    tags                 = COALESCE($15, leads.tags),
    metadata             = COALESCE($16, leads.metadata),
    gdpr_consent         = COALESCE($17, leads.gdpr_consent),
    gdpr_consent_at      = COALESCE($18, leads.gdpr_consent_at),
    gdpr_consent_source  = COALESCE($19, leads.gdpr_consent_source),
    status               = COALESCE($20, leads.status),
    updated_by           = $21,
    updated_at           = NOW()
  WHERE external_source = $22
    AND external_contact_id = $23
  RETURNING id
`;

// =============================================================================
// TREATMENT PLAN QUERIES
// =============================================================================

/**
 * Insert new treatment plan
 */
export const INSERT_TREATMENT_PLAN_SQL = `
  INSERT INTO treatment_plans (
    lead_id, doctor_id, external_deal_id, name, total_value, currency,
    stage, probability, is_accepted, accepted_at, rejected_reason,
    valid_until, notes
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13
  )
  ON CONFLICT (external_deal_id) DO NOTHING
  RETURNING id
`;

/**
 * Update existing treatment plan (patch with COALESCE)
 */
export const UPDATE_TREATMENT_PLAN_SQL = `
  UPDATE treatment_plans SET
    lead_id         = $1,
    doctor_id       = COALESCE($2, treatment_plans.doctor_id),
    name            = COALESCE($3, treatment_plans.name),
    total_value     = COALESCE($4, treatment_plans.total_value),
    currency        = COALESCE($5, treatment_plans.currency),
    stage           = COALESCE($6, treatment_plans.stage),
    probability     = COALESCE($7, treatment_plans.probability),
    is_accepted     = COALESCE($8, treatment_plans.is_accepted),
    accepted_at     = COALESCE($9, treatment_plans.accepted_at),
    rejected_reason = COALESCE($10, treatment_plans.rejected_reason),
    valid_until     = COALESCE($11, treatment_plans.valid_until),
    notes           = COALESCE($12, treatment_plans.notes),
    updated_at      = NOW()
  WHERE external_deal_id = $13
  RETURNING id
`;

// =============================================================================
// INTERACTION QUERIES
// =============================================================================

/**
 * Insert new interaction
 */
export const INSERT_INTERACTION_SQL = `
  INSERT INTO interactions (
    lead_id, external_id, thread_id, provider, channel, direction, type,
    content, media_url, ai_sentiment_score, ai_tags, status, error_message, created_at
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14
  )
  ON CONFLICT (provider, external_id)
  DO NOTHING
  RETURNING id
`;

/**
 * Update lead's last interaction timestamp
 */
export const UPDATE_LEAD_LAST_INTERACTION_SQL = `
  UPDATE leads
  SET last_interaction_at = $1, updated_at = NOW()
  WHERE id = $2
`;

// =============================================================================
// QUERY HELPER QUERIES
// =============================================================================

/**
 * Get lead by ID
 */
export const GET_LEAD_BY_ID_SQL = `
  SELECT * FROM leads WHERE id = $1 LIMIT 1
`;

/**
 * Get lead by external source and contact ID
 */
export const GET_LEAD_BY_EXTERNAL_SQL = `
  SELECT * FROM leads
  WHERE external_source = $1 AND external_contact_id = $2
  LIMIT 1
`;

/**
 * Get lead events (with limit)
 */
export const GET_LEAD_EVENTS_SQL = `
  SELECT * FROM lead_events
  WHERE lead_id = $1
  ORDER BY created_at DESC
  LIMIT $2
`;

/**
 * Get treatment plans by lead ID
 */
export const GET_TREATMENT_PLANS_BY_LEAD_SQL = `
  SELECT * FROM treatment_plans
  WHERE lead_id = $1
  ORDER BY created_at DESC
`;

/**
 * Get interactions by lead ID (with limit)
 */
export const GET_INTERACTIONS_BY_LEAD_SQL = `
  SELECT * FROM interactions
  WHERE lead_id = $1
  ORDER BY created_at DESC
  LIMIT $2
`;
