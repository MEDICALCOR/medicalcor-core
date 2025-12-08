/**
 * Bulk Import Schema Definitions
 * Types and validation for bulk lead import operations
 *
 * Supports CSV/JSON import with validation, error reporting, and async processing
 */

import { z } from 'zod';

// =============================================================================
// Import Format
// =============================================================================

export const BulkImportFormatSchema = z.enum(['csv', 'json']);
export type BulkImportFormat = z.infer<typeof BulkImportFormatSchema>;

// =============================================================================
// Import Status
// =============================================================================

export const BulkImportStatusSchema = z.enum([
  'pending', // Import job created, not yet started
  'validating', // Validating input data
  'processing', // Actively importing leads
  'completed', // All leads processed successfully
  'partial', // Some leads failed, others succeeded
  'failed', // Import failed entirely
  'cancelled', // Import was cancelled by user
]);
export type BulkImportStatus = z.infer<typeof BulkImportStatusSchema>;

// =============================================================================
// Row Error Types
// =============================================================================

export const BulkImportErrorCodeSchema = z.enum([
  'INVALID_PHONE',
  'INVALID_EMAIL',
  'MISSING_REQUIRED_FIELD',
  'DUPLICATE_PHONE',
  'DUPLICATE_EXTERNAL_ID',
  'INVALID_SOURCE',
  'INVALID_STATUS',
  'VALIDATION_ERROR',
  'DATABASE_ERROR',
  'UNKNOWN_ERROR',
]);
export type BulkImportErrorCode = z.infer<typeof BulkImportErrorCodeSchema>;

// =============================================================================
// Import Row (Single Lead)
// =============================================================================

export const BulkImportRowSchema = z.object({
  // Required fields
  phone: z.string().min(1, 'Phone is required'),

  // External identification (optional - will be auto-generated if not provided)
  externalContactId: z.string().optional(),
  externalSource: z.string().default('bulk_import'),

  // Contact information
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),

  // Marketing & Attribution
  source: z.string().optional(),
  acquisitionChannel: z.string().optional(),
  adCampaignId: z.string().optional(),

  // Language & Metadata
  language: z.string().max(5).default('ro'),
  tags: z
    .union([
      z.array(z.string()),
      z.string().transform((s) =>
        s
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      ),
    ])
    .optional(),

  // GDPR
  gdprConsent: z
    .union([
      z.boolean(),
      z.string().transform((s) => s.toLowerCase() === 'true' || s === '1' || s === 'yes'),
    ])
    .optional(),

  // Pipeline Status
  status: z.string().default('new'),

  // Notes
  notes: z.string().optional(),
});

export type BulkImportRow = z.infer<typeof BulkImportRowSchema>;

// =============================================================================
// Row Result (Processing Outcome)
// =============================================================================

export const BulkImportRowResultSchema = z.object({
  rowNumber: z.number().int().positive(),
  success: z.boolean(),
  leadId: z.string().uuid().optional(),
  externalContactId: z.string().optional(),
  phone: z.string(),
  action: z.enum(['created', 'updated', 'skipped']).optional(),
  errorCode: BulkImportErrorCodeSchema.optional(),
  errorMessage: z.string().optional(),
  errorDetails: z.record(z.string(), z.unknown()).optional(),
});

export type BulkImportRowResult = z.infer<typeof BulkImportRowResultSchema>;

// =============================================================================
// Import Options
// =============================================================================

export const BulkImportOptionsSchema = z.object({
  // Processing options
  skipDuplicates: z.boolean().default(true),
  updateExisting: z.boolean().default(false),
  validateOnly: z.boolean().default(false), // Dry-run mode

  // Source configuration
  defaultSource: z.string().default('bulk_import'),
  clinicId: z.string().uuid().optional(),

  // Error handling
  stopOnFirstError: z.boolean().default(false),
  maxErrors: z.number().int().positive().default(100),

  // Batch processing
  batchSize: z.number().int().positive().max(1000).default(100),

  // Actor tracking
  actor: z.string().optional(),
});

export type BulkImportOptions = z.infer<typeof BulkImportOptionsSchema>;

// =============================================================================
// Import Request (API Input)
// =============================================================================

export const BulkImportRequestSchema = z.object({
  // Either rows or file content
  rows: z.array(BulkImportRowSchema).optional(),
  csvContent: z.string().optional(),
  jsonContent: z.string().optional(),

  // Options
  options: BulkImportOptionsSchema.optional(),
});

export type BulkImportRequest = z.infer<typeof BulkImportRequestSchema>;

// =============================================================================
// Import Job Record
// =============================================================================

export const BulkImportJobSchema = z.object({
  id: z.string().uuid(),
  clinicId: z.string().uuid().optional(),
  status: BulkImportStatusSchema,
  format: BulkImportFormatSchema.optional(),

  // Progress tracking
  totalRows: z.number().int().nonnegative(),
  processedRows: z.number().int().nonnegative().default(0),
  successCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  skipCount: z.number().int().nonnegative().default(0),

  // Options used
  options: BulkImportOptionsSchema.optional(),

  // Timestamps
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),

  // Actor
  createdBy: z.string().optional(),

  // Error summary
  errorSummary: z.record(BulkImportErrorCodeSchema, z.number()).optional(),
});

export type BulkImportJob = z.infer<typeof BulkImportJobSchema>;

// =============================================================================
// Import Response (API Output)
// =============================================================================

export const BulkImportSyncResponseSchema = z.object({
  success: z.boolean(),
  totalRows: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  skipCount: z.number().int().nonnegative(),
  results: z.array(BulkImportRowResultSchema),
  errors: z.array(BulkImportRowResultSchema).optional(),
  validationOnly: z.boolean().default(false),
  durationMs: z.number().nonnegative().optional(),
});

export type BulkImportSyncResponse = z.infer<typeof BulkImportSyncResponseSchema>;

export const BulkImportAsyncResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string().uuid(),
  status: BulkImportStatusSchema,
  message: z.string(),
  totalRows: z.number().int().nonnegative(),
  statusUrl: z.string().url().optional(),
});

export type BulkImportAsyncResponse = z.infer<typeof BulkImportAsyncResponseSchema>;

// =============================================================================
// Job Status Response
// =============================================================================

export const BulkImportJobStatusSchema = z.object({
  job: BulkImportJobSchema,
  progress: z.number().min(0).max(100),
  isComplete: z.boolean(),
  results: z.array(BulkImportRowResultSchema).optional(),
  errors: z.array(BulkImportRowResultSchema).optional(),
});

export type BulkImportJobStatus = z.infer<typeof BulkImportJobStatusSchema>;

// =============================================================================
// CSV Column Mapping
// =============================================================================

export const CSVColumnMappingSchema = z.object({
  phone: z.string().default('phone'),
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  source: z.string().optional(),
  acquisitionChannel: z.string().optional(),
  tags: z.string().optional(),
  language: z.string().optional(),
  gdprConsent: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  externalContactId: z.string().optional(),
});

export type CSVColumnMapping = z.infer<typeof CSVColumnMappingSchema>;

// =============================================================================
// Workflow Payload (for Trigger.dev)
// =============================================================================

export const BulkImportWorkflowPayloadSchema = z.object({
  jobId: z.string().uuid(),
  rows: z.array(BulkImportRowSchema),
  options: BulkImportOptionsSchema,
  correlationId: z.string(),
  batchIndex: z.number().int().nonnegative().optional(),
  totalBatches: z.number().int().positive().optional(),
});

export type BulkImportWorkflowPayload = z.infer<typeof BulkImportWorkflowPayloadSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize phone number for comparison
 */
export function normalizePhoneForComparison(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Generate external contact ID from phone if not provided
 */
export function generateExternalContactId(phone: string, source: string): string {
  const normalized = normalizePhoneForComparison(phone);
  return `${source}-${normalized}`;
}

/**
 * Calculate import progress percentage
 */
export function calculateImportProgress(processed: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((processed / total) * 100);
}
