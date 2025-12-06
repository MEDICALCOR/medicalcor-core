/**
 * Bulk Import SQL Queries
 * Extracted for maintainability per Platinum Banking/Medical Standard
 */

// =============================================================================
// BULK IMPORT JOB QUERIES
// =============================================================================

/**
 * Create a new bulk import job
 */
export const INSERT_BULK_IMPORT_JOB_SQL = `
  INSERT INTO bulk_import_jobs (
    id, clinic_id, status, format, total_rows, options, created_by, created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  RETURNING *
`;

/**
 * Update bulk import job progress
 */
export const UPDATE_BULK_IMPORT_JOB_PROGRESS_SQL = `
  UPDATE bulk_import_jobs SET
    status = $2,
    processed_rows = $3,
    success_count = $4,
    error_count = $5,
    skip_count = $6,
    error_summary = $7,
    updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

/**
 * Mark bulk import job as started
 */
export const START_BULK_IMPORT_JOB_SQL = `
  UPDATE bulk_import_jobs SET
    status = 'processing',
    started_at = NOW(),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

/**
 * Complete bulk import job
 */
export const COMPLETE_BULK_IMPORT_JOB_SQL = `
  UPDATE bulk_import_jobs SET
    status = $2,
    processed_rows = $3,
    success_count = $4,
    error_count = $5,
    skip_count = $6,
    error_summary = $7,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

/**
 * Get bulk import job by ID
 */
export const GET_BULK_IMPORT_JOB_SQL = `
  SELECT * FROM bulk_import_jobs WHERE id = $1
`;

/**
 * Get bulk import jobs for clinic (paginated)
 */
export const GET_BULK_IMPORT_JOBS_BY_CLINIC_SQL = `
  SELECT * FROM bulk_import_jobs
  WHERE clinic_id = $1
  ORDER BY created_at DESC
  LIMIT $2 OFFSET $3
`;

// =============================================================================
// BULK IMPORT ROW RESULT QUERIES
// =============================================================================

/**
 * Insert bulk import row result
 */
export const INSERT_BULK_IMPORT_ROW_RESULT_SQL = `
  INSERT INTO bulk_import_row_results (
    job_id, row_number, success, lead_id, external_contact_id, phone,
    action, error_code, error_message, error_details, created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
`;

/**
 * Batch insert row results (for performance)
 */
export const BATCH_INSERT_ROW_RESULTS_SQL = `
  INSERT INTO bulk_import_row_results (
    job_id, row_number, success, lead_id, external_contact_id, phone,
    action, error_code, error_message, error_details, created_at
  )
  SELECT
    $1,
    (row_data->>'rowNumber')::integer,
    (row_data->>'success')::boolean,
    NULLIF(row_data->>'leadId', '')::uuid,
    NULLIF(row_data->>'externalContactId', ''),
    row_data->>'phone',
    NULLIF(row_data->>'action', ''),
    NULLIF(row_data->>'errorCode', ''),
    NULLIF(row_data->>'errorMessage', ''),
    CASE WHEN row_data->'errorDetails' IS NOT NULL
         THEN row_data->'errorDetails'
         ELSE NULL END,
    NOW()
  FROM jsonb_array_elements($2::jsonb) AS row_data
`;

/**
 * Get row results for job (with pagination)
 */
export const GET_BULK_IMPORT_ROW_RESULTS_SQL = `
  SELECT * FROM bulk_import_row_results
  WHERE job_id = $1
  ORDER BY row_number
  LIMIT $2 OFFSET $3
`;

/**
 * Get error rows for job
 */
export const GET_BULK_IMPORT_ERROR_ROWS_SQL = `
  SELECT * FROM bulk_import_row_results
  WHERE job_id = $1 AND success = false
  ORDER BY row_number
  LIMIT $2
`;

// =============================================================================
// DUPLICATE DETECTION QUERIES
// =============================================================================

/**
 * Check for existing leads by phone numbers (batch)
 */
export const CHECK_EXISTING_PHONES_SQL = `
  SELECT phone, id, external_contact_id, external_source
  FROM leads
  WHERE phone = ANY($1::text[])
`;

/**
 * Check for existing leads by external IDs (batch)
 */
export const CHECK_EXISTING_EXTERNAL_IDS_SQL = `
  SELECT external_contact_id, external_source, id, phone
  FROM leads
  WHERE external_source = $1
    AND external_contact_id = ANY($2::text[])
`;
