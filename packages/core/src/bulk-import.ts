/**
 * Bulk Lead Import Service
 * L3 Feature: Onboarding efficiency through bulk lead import
 *
 * Supports:
 * - CSV/JSON import formats
 * - Phone number validation and normalization
 * - Duplicate detection (phone-based and external ID-based)
 * - Batch processing with transactional safety
 * - Progress tracking and error reporting
 * - Async processing for large datasets via Trigger.dev
 */

import {
  createDatabaseClient,
  withTransaction,
  type DatabasePool,
  type TransactionClient,
} from './database.js';
import { createLogger } from './logger.js';
import { validatePhone, normalizeRomanianPhone } from './phone.js';
import { recordLeadEvent } from './crm.db.js';
import { INSERT_LEAD_SQL, UPDATE_LEAD_SQL } from './crm.db.sql.js';
import {
  INSERT_BULK_IMPORT_JOB_SQL,
  UPDATE_BULK_IMPORT_JOB_PROGRESS_SQL,
  GET_BULK_IMPORT_JOB_SQL,
  CHECK_EXISTING_PHONES_SQL,
} from './bulk-import.sql.js';
import { AppError, ValidationError, DatabaseOperationError } from './errors.js';
import type {
  BulkImportRow,
  BulkImportRowResult,
  BulkImportOptions,
  BulkImportSyncResponse,
  BulkImportJob,
  BulkImportErrorCode,
  BulkImportStatus,
} from '@medicalcor/types';
import { BulkImportRowSchema } from '@medicalcor/types';
import crypto from 'crypto';

const logger = createLogger({ name: 'bulk-import' });

// =============================================================================
// CSV Parsing
// =============================================================================

/**
 * Field names used for row mapping
 */
type ImportFieldName = 'phone' | 'fullName' | 'firstName' | 'lastName' | 'email' |
  'source' | 'acquisitionChannel' | 'tags' | 'language' | 'gdprConsent' |
  'status' | 'notes' | 'externalContactId';

/**
 * Default CSV column mappings (case-insensitive)
 */
const DEFAULT_CSV_MAPPINGS: Record<string, ImportFieldName> = {
  // Phone variations
  phone: 'phone',
  telefon: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  mobil: 'phone',
  'phone number': 'phone',

  // Name variations
  name: 'fullName',
  fullname: 'fullName',
  'full name': 'fullName',
  nume: 'fullName',
  'nume complet': 'fullName',
  firstname: 'firstName',
  'first name': 'firstName',
  prenume: 'firstName',
  lastname: 'lastName',
  'last name': 'lastName',
  'nume familie': 'lastName',

  // Email variations
  email: 'email',
  'e-mail': 'email',
  mail: 'email',

  // Source variations
  source: 'source',
  sursa: 'source',
  channel: 'acquisitionChannel',
  canal: 'acquisitionChannel',

  // Other fields
  tags: 'tags',
  etichete: 'tags',
  language: 'language',
  limba: 'language',
  gdpr: 'gdprConsent',
  consent: 'gdprConsent',
  consimtamant: 'gdprConsent',
  status: 'status',
  notes: 'notes',
  note: 'notes',
  observatii: 'notes',
  'external_id': 'externalContactId',
  'external id': 'externalContactId',
  id: 'externalContactId',
};

/**
 * Parse CSV content into rows
 */
export function parseCSV(
  csvContent: string
): { rows: BulkImportRow[]; errors: Array<{ line: number; error: string }> } {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new ValidationError('CSV must have at least a header row and one data row');
  }

  const rows: BulkImportRow[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  // Parse header
  const headerLine = lines[0];
  if (!headerLine) {
    throw new ValidationError('CSV must have a header row');
  }
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  // Build column mapping
  const columnMapping = new Map<number, ImportFieldName>();
  headers.forEach((header, index) => {
    // Check custom mapping first (maps field name to CSV header)
    // Then fall back to default CSV header -> field name mapping
    const defaultField = DEFAULT_CSV_MAPPINGS[header];
    if (defaultField) {
      columnMapping.set(index, defaultField);
    }
  });

  // Validate required phone column exists
  let hasPhoneColumn = false;
  for (const field of columnMapping.values()) {
    if (field === 'phone') {
      hasPhoneColumn = true;
      break;
    }
  }
  if (!hasPhoneColumn) {
    throw new ValidationError(
      'CSV must have a phone column. Recognized headers: phone, telefon, telephone, mobile'
    );
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue; // Skip empty lines

    try {
      const values = parseCSVLine(line);
      const rowData: Record<string, unknown> = {};

      // Map values to fields
      for (const [index, field] of columnMapping.entries()) {
        const value = values[index]?.trim();
        if (value) {
          rowData[field] = value;
        }
      }

      // Construct full name from first/last if needed
      if (!rowData.fullName && (rowData.firstName ?? rowData.lastName)) {
        rowData.fullName = [rowData.firstName, rowData.lastName]
          .filter(Boolean)
          .join(' ');
      }

      // Validate row
      const parsed = BulkImportRowSchema.safeParse(rowData);
      if (parsed.success) {
        rows.push(parsed.data);
      } else {
        errors.push({
          line: i + 1,
          error: parsed.error.issues.map((e) => e.message).join('; '),
        });
      }
    } catch (error) {
      errors.push({
        line: i + 1,
        error: error instanceof Error ? error.message : 'Parse error',
      });
    }
  }

  return { rows, errors };
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// =============================================================================
// Phone Validation & Normalization
// =============================================================================

/**
 * Validate and normalize phone number
 */
async function validateAndNormalizePhone(
  phone: string
): Promise<{ valid: boolean; normalized: string | null; error?: string }> {
  try {
    // First try Romanian format
    const roResult = normalizeRomanianPhone(phone);
    if (roResult.isValid && roResult.normalized) {
      return { valid: true, normalized: roResult.normalized };
    }

    // Fall back to international validation
    const intlResult = await validatePhone(phone);
    if (intlResult.isValid && intlResult.normalized) {
      return { valid: true, normalized: intlResult.normalized };
    }

    return {
      valid: false,
      normalized: null,
      error: intlResult.error ?? 'Invalid phone number format',
    };
  } catch (error) {
    return {
      valid: false,
      normalized: null,
      error: error instanceof Error ? error.message : 'Phone validation failed',
    };
  }
}

// =============================================================================
// Bulk Import Job Management
// =============================================================================

/**
 * Create a new bulk import job
 */
export async function createBulkImportJob(params: {
  clinicId?: string;
  totalRows: number;
  format?: 'csv' | 'json';
  options?: BulkImportOptions;
  createdBy?: string;
}): Promise<BulkImportJob> {
  const pool = createDatabaseClient();
  const jobId = crypto.randomUUID();

  const result = await pool.query<BulkImportJob>(INSERT_BULK_IMPORT_JOB_SQL, [
    jobId,
    params.clinicId ?? null,
    'pending',
    params.format ?? null,
    params.totalRows,
    params.options ? JSON.stringify(params.options) : null,
    params.createdBy ?? null,
  ]);

  const job = result.rows[0];
  if (!job) {
    throw new DatabaseOperationError('create_bulk_import_job', 'Failed to create job');
  }
  return job;
}

/**
 * Get bulk import job by ID
 */
export async function getBulkImportJob(jobId: string): Promise<BulkImportJob | null> {
  const pool = createDatabaseClient();
  const result = await pool.query<BulkImportJob>(GET_BULK_IMPORT_JOB_SQL, [jobId]);
  return result.rows[0] ?? null;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: {
    status: BulkImportStatus;
    processedRows: number;
    successCount: number;
    errorCount: number;
    skipCount: number;
    errorSummary?: Partial<Record<BulkImportErrorCode, number>>;
  },
  client?: DatabasePool | TransactionClient
): Promise<void> {
  const db = client ?? createDatabaseClient();
  await db.query(UPDATE_BULK_IMPORT_JOB_PROGRESS_SQL, [
    jobId,
    progress.status,
    progress.processedRows,
    progress.successCount,
    progress.errorCount,
    progress.skipCount,
    progress.errorSummary ? JSON.stringify(progress.errorSummary) : null,
  ]);
}

// =============================================================================
// Bulk Import Processing
// =============================================================================

export interface BulkImportContext {
  jobId?: string;
  correlationId: string;
  options: BulkImportOptions;
  existingPhones: Map<string, { id: string; externalContactId: string }>;
}

/**
 * Process a batch of import rows synchronously
 */
export async function processBulkImport(
  rows: BulkImportRow[],
  options: Partial<BulkImportOptions> = {}
): Promise<BulkImportSyncResponse> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Apply defaults with explicit type for required fields
  const opts: {
    skipDuplicates: boolean;
    updateExisting: boolean;
    validateOnly: boolean;
    defaultSource: string;
    clinicId: string | undefined;
    stopOnFirstError: boolean;
    maxErrors: number;
    batchSize: number;
    actor: string;
  } = {
    skipDuplicates: options.skipDuplicates ?? true,
    updateExisting: options.updateExisting ?? false,
    validateOnly: options.validateOnly ?? false,
    defaultSource: options.defaultSource ?? 'bulk_import',
    clinicId: options.clinicId,
    stopOnFirstError: options.stopOnFirstError ?? false,
    maxErrors: options.maxErrors ?? 100,
    batchSize: options.batchSize ?? 100,
    actor: options.actor ?? 'bulk-import',
  };

  const results: BulkImportRowResult[] = [];
  const errors: BulkImportRowResult[] = [];
  const errorSummary: Partial<Record<BulkImportErrorCode, number>> = {};
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  logger.info(
    { correlationId, totalRows: rows.length, validateOnly: opts.validateOnly },
    'Starting bulk import'
  );

  try {
    const pool = createDatabaseClient();

    // Pre-fetch existing phones for duplicate detection
    const phonesToCheck = rows.map((r) => r.phone);
    const existingPhonesResult = await pool.query<{
      phone: string;
      id: string;
      external_contact_id: string;
    }>(CHECK_EXISTING_PHONES_SQL, [phonesToCheck]);

    const existingPhones = new Map(
      existingPhonesResult.rows.map((r) => [
        r.phone,
        { id: r.id, externalContactId: r.external_contact_id },
      ])
    );

    // Also check normalized versions
    for (const row of rows) {
      const { normalized } = await validateAndNormalizePhone(row.phone);
      if (normalized && normalized !== row.phone) {
        const existing = existingPhonesResult.rows.find((r) => r.phone === normalized);
        if (existing) {
          existingPhones.set(row.phone, {
            id: existing.id,
            externalContactId: existing.external_contact_id,
          });
        }
      }
    }

    // Process rows in batches
    for (let i = 0; i < rows.length; i += opts.batchSize) {
      const batch = rows.slice(i, Math.min(i + opts.batchSize, rows.length));

      // Check if we've hit max errors
      if (opts.stopOnFirstError && errorCount > 0) {
        break;
      }
      if (errorCount >= opts.maxErrors) {
        logger.warn({ correlationId, errorCount }, 'Max errors reached, stopping import');
        break;
      }

      // Process batch within transaction
      if (!opts.validateOnly) {
        await withTransaction(pool, async (tx) => {
          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            if (!row) continue;
            const rowNumber = i + j + 1;

            const result = await processRow(row, rowNumber, {
              correlationId,
              options: opts,
              existingPhones,
            }, tx);

            results.push(result);

            if (result.success) {
              if (result.action === 'skipped') {
                skipCount++;
              } else {
                successCount++;
              }
            } else {
              errorCount++;
              errors.push(result);
              if (result.errorCode) {
                errorSummary[result.errorCode] = (errorSummary[result.errorCode] ?? 0) + 1;
              }

              if (opts.stopOnFirstError) {
                throw new AppError(
                  `Import stopped at row ${rowNumber}: ${result.errorMessage}`,
                  'IMPORT_STOPPED',
                  400
                );
              }
            }
          }
        });
      } else {
        // Validate-only mode - don't write to database
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          if (!row) continue;
          const rowNumber = i + j + 1;

          const result = await validateRow(row, rowNumber, {
            correlationId,
            options: opts,
            existingPhones,
          });

          results.push(result);

          if (result.success) {
            if (result.action === 'skipped') {
              skipCount++;
            } else {
              successCount++;
            }
          } else {
            errorCount++;
            errors.push(result);
            if (result.errorCode) {
              errorSummary[result.errorCode] = (errorSummary[result.errorCode] ?? 0) + 1;
            }
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        correlationId,
        successCount,
        errorCount,
        skipCount,
        durationMs,
      },
      'Bulk import completed'
    );

    return {
      success: errorCount === 0,
      totalRows: rows.length,
      successCount,
      errorCount,
      skipCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
      validationOnly: opts.validateOnly,
      durationMs,
    };
  } catch (error) {
    logger.error({ correlationId, error }, 'Bulk import failed');

    if (error instanceof AppError) {
      throw error;
    }

    throw new DatabaseOperationError(
      'bulk_import',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Validate a single row without persisting
 */
async function validateRow(
  row: BulkImportRow,
  rowNumber: number,
  context: Omit<BulkImportContext, 'jobId'>
): Promise<BulkImportRowResult> {
  const { options, existingPhones } = context;

  // Validate phone
  const phoneValidation = await validateAndNormalizePhone(row.phone);
  if (!phoneValidation.valid) {
    return {
      rowNumber,
      success: false,
      phone: row.phone,
      errorCode: 'INVALID_PHONE',
      errorMessage: phoneValidation.error ?? 'Invalid phone number',
    };
  }

  const normalizedPhone = phoneValidation.normalized!;

  // Check for duplicates
  const existing = existingPhones.get(normalizedPhone) ?? existingPhones.get(row.phone);
  if (existing) {
    if (options.skipDuplicates && !options.updateExisting) {
      return {
        rowNumber,
        success: true,
        phone: normalizedPhone,
        externalContactId: existing.externalContactId,
        leadId: existing.id,
        action: 'skipped',
      };
    } else if (options.updateExisting) {
      return {
        rowNumber,
        success: true,
        phone: normalizedPhone,
        externalContactId: existing.externalContactId,
        leadId: existing.id,
        action: 'updated',
      };
    } else {
      return {
        rowNumber,
        success: false,
        phone: normalizedPhone,
        errorCode: 'DUPLICATE_PHONE',
        errorMessage: 'Phone number already exists',
      };
    }
  }

  // Validate email if provided
  if (row.email && row.email.length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.email)) {
      return {
        rowNumber,
        success: false,
        phone: normalizedPhone,
        errorCode: 'INVALID_EMAIL',
        errorMessage: 'Invalid email format',
      };
    }
  }

  return {
    rowNumber,
    success: true,
    phone: normalizedPhone,
    action: 'created',
  };
}

/**
 * Process a single row and persist to database
 */
async function processRow(
  row: BulkImportRow,
  rowNumber: number,
  context: Omit<BulkImportContext, 'jobId'>,
  tx: TransactionClient
): Promise<BulkImportRowResult> {
  const { options, existingPhones, correlationId } = context;

  try {
    // First validate
    const validation = await validateRow(row, rowNumber, context);
    if (!validation.success) {
      return validation;
    }

    // If validation says skip (duplicate with skipDuplicates), return early
    if (validation.action === 'skipped') {
      return validation;
    }

    const normalizedPhone = validation.phone;
    const existing = existingPhones.get(normalizedPhone) ?? existingPhones.get(row.phone);

    // Generate external contact ID if not provided
    const externalContactId = row.externalContactId ??
      `${options.defaultSource}-${normalizedPhone.replace(/\D/g, '')}`;
    const externalSource = row.externalSource ?? options.defaultSource;

    // Build full name
    const fullName = row.fullName ??
      ([row.firstName, row.lastName].filter(Boolean).join(' ') || undefined);

    // Process tags
    const tags = Array.isArray(row.tags) ? row.tags : undefined;

    if (existing && options.updateExisting) {
      // Update existing lead
      const updateResult = await tx.query<{ id: string }>(UPDATE_LEAD_SQL, [
        options.clinicId ?? null, // clinic_id
        null, // assigned_agent_id
        null, // external_url
        fullName ?? null, // full_name
        normalizedPhone, // phone
        row.email ?? null, // email
        row.source ?? null, // source
        row.acquisitionChannel ?? null, // acquisition_channel
        row.adCampaignId ?? null, // ad_campaign_id
        null, // ai_score
        null, // ai_intent
        null, // ai_summary
        null, // ai_last_analysis_at
        row.language ?? null, // language
        tags ?? null, // tags
        null, // metadata
        row.gdprConsent ?? null, // gdpr_consent
        row.gdprConsent ? new Date() : null, // gdpr_consent_at
        row.gdprConsent ? 'bulk_import' : null, // gdpr_consent_source
        row.status ?? null, // status
        options.actor ?? null, // updated_by
        externalSource, // WHERE external_source
        existing.externalContactId, // WHERE external_contact_id
      ]);

      if (updateResult.rows[0]) {
        await recordLeadEvent({
          leadId: updateResult.rows[0].id,
          eventType: 'lead_updated',
          actor: options.actor ?? 'bulk-import',
          payload: { change: 'bulk_import', rowNumber },
          client: tx,
        });

        return {
          rowNumber,
          success: true,
          leadId: updateResult.rows[0].id,
          phone: normalizedPhone,
          externalContactId: existing.externalContactId,
          action: 'updated',
        };
      }
    }

    // Insert new lead
    const insertResult = await tx.query<{ id: string }>(INSERT_LEAD_SQL, [
      options.clinicId ?? null, // clinic_id
      null, // assigned_agent_id
      externalContactId, // external_contact_id
      externalSource, // external_source
      null, // external_url
      fullName ?? null, // full_name
      normalizedPhone, // phone
      row.email ?? null, // email
      row.source ?? null, // source
      row.acquisitionChannel ?? null, // acquisition_channel
      row.adCampaignId ?? null, // ad_campaign_id
      0, // ai_score
      null, // ai_intent
      null, // ai_summary
      null, // ai_last_analysis_at
      row.language ?? 'ro', // language
      tags ?? null, // tags
      null, // metadata
      row.gdprConsent ?? false, // gdpr_consent
      row.gdprConsent ? new Date() : null, // gdpr_consent_at
      row.gdprConsent ? 'bulk_import' : null, // gdpr_consent_source
      row.status ?? 'new', // status
      options.actor ?? null, // created_by
      options.actor ?? null, // updated_by
    ]);

    if (insertResult.rows[0]) {
      const leadId = insertResult.rows[0].id;

      // Record event
      await recordLeadEvent({
        leadId,
        eventType: 'lead_created',
        actor: options.actor ?? 'bulk-import',
        payload: { change: 'bulk_import', rowNumber },
        client: tx,
      });

      // Update cache
      existingPhones.set(normalizedPhone, {
        id: leadId,
        externalContactId,
      });

      return {
        rowNumber,
        success: true,
        leadId,
        phone: normalizedPhone,
        externalContactId,
        action: 'created',
      };
    }

    // If ON CONFLICT DO NOTHING triggered, the row already exists
    if (options.skipDuplicates) {
      return {
        rowNumber,
        success: true,
        phone: normalizedPhone,
        externalContactId,
        action: 'skipped',
      };
    }

    return {
      rowNumber,
      success: false,
      phone: normalizedPhone,
      errorCode: 'DUPLICATE_EXTERNAL_ID',
      errorMessage: 'External ID already exists',
    };
  } catch (error) {
    logger.error(
      { correlationId, rowNumber, error },
      'Failed to process row'
    );

    return {
      rowNumber,
      success: false,
      phone: row.phone,
      errorCode: 'DATABASE_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown database error',
      errorDetails: error instanceof Error ? { stack: error.stack } : undefined,
    };
  }
}

// =============================================================================
// Export Service Interface
// =============================================================================

export interface BulkImportService {
  parseCSV: typeof parseCSV;
  processBulkImport: typeof processBulkImport;
  createBulkImportJob: typeof createBulkImportJob;
  getBulkImportJob: typeof getBulkImportJob;
  updateJobProgress: typeof updateJobProgress;
}

export function createBulkImportService(): BulkImportService {
  return {
    parseCSV,
    processBulkImport,
    createBulkImportJob,
    getBulkImportJob,
    updateJobProgress,
  };
}
