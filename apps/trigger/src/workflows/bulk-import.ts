/**
 * Bulk Import Workflow
 * L3 Feature: Async processing of large lead imports
 *
 * Handles imports with:
 * - Batch processing with progress tracking
 * - Retry logic for transient failures
 * - Job status updates in real-time
 * - Event emission for import completion
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import {
  processBulkImport,
  updateJobProgress,
  getBulkImportJob,
} from '@medicalcor/core';
import {
  BulkImportRowSchema,
  BulkImportOptionsSchema,
  type BulkImportRow,
  type BulkImportStatus,
  type BulkImportErrorCode,
} from '@medicalcor/types';

// =============================================================================
// Workflow Payload Schema
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
// Workflow Result
// =============================================================================

export interface BulkImportWorkflowResult {
  success: boolean;
  jobId: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  skipCount: number;
  durationMs: number;
  errorSummary?: Record<string, number>;
}

// =============================================================================
// Main Bulk Import Workflow
// =============================================================================

/**
 * Process bulk lead import asynchronously
 * Suitable for large imports (500+ rows)
 */
export const bulkImportWorkflow = task({
  id: 'bulk-import-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: BulkImportWorkflowPayload): Promise<BulkImportWorkflowResult> => {
    const { jobId, rows, options, correlationId } = payload;
    const startTime = Date.now();

    logger.info('Starting bulk import workflow', {
      jobId,
      rowCount: rows.length,
      correlationId,
      options: {
        skipDuplicates: options.skipDuplicates,
        updateExisting: options.updateExisting,
        batchSize: options.batchSize,
      },
    });

    try {
      // Update job status to processing
      await updateJobProgress(jobId, {
        status: 'processing',
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
        skipCount: 0,
      });

      // Process the import
      const result = await processBulkImport(rows, {
        ...options,
        validateOnly: false,
      });

      // Build error summary
      const errorSummary: Record<BulkImportErrorCode, number> = {} as Record<BulkImportErrorCode, number>;
      if (result.errors) {
        for (const error of result.errors) {
          if (error.errorCode) {
            errorSummary[error.errorCode] = (errorSummary[error.errorCode] ?? 0) + 1;
          }
        }
      }

      // Determine final status
      let finalStatus: BulkImportStatus = 'completed';
      if (result.errorCount > 0 && result.successCount === 0) {
        finalStatus = 'failed';
      } else if (result.errorCount > 0) {
        finalStatus = 'partial';
      }

      // Update job with final status
      await updateJobProgress(jobId, {
        status: finalStatus,
        processedRows: rows.length,
        successCount: result.successCount,
        errorCount: result.errorCount,
        skipCount: result.skipCount,
        errorSummary: Object.keys(errorSummary).length > 0 ? errorSummary : undefined,
      });

      const durationMs = Date.now() - startTime;

      logger.info('Bulk import workflow completed', {
        jobId,
        correlationId,
        status: finalStatus,
        successCount: result.successCount,
        errorCount: result.errorCount,
        skipCount: result.skipCount,
        durationMs,
      });

      return {
        success: result.success,
        jobId,
        totalRows: rows.length,
        successCount: result.successCount,
        errorCount: result.errorCount,
        skipCount: result.skipCount,
        durationMs,
        errorSummary: Object.keys(errorSummary).length > 0 ? errorSummary : undefined,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      logger.error('Bulk import workflow failed', {
        jobId,
        correlationId,
        error,
        durationMs,
      });

      // Update job as failed
      await updateJobProgress(jobId, {
        status: 'failed',
        processedRows: 0,
        successCount: 0,
        errorCount: rows.length,
        skipCount: 0,
        errorSummary: { UNKNOWN_ERROR: rows.length },
      });

      throw error;
    }
  },
});

// =============================================================================
// Batch Processing Workflow (for very large imports)
// =============================================================================

export const BulkImportBatchPayloadSchema = z.object({
  jobId: z.string().uuid(),
  rows: z.array(BulkImportRowSchema),
  options: BulkImportOptionsSchema,
  correlationId: z.string(),
  batchIndex: z.number().int().nonnegative(),
  totalBatches: z.number().int().positive(),
  previousSuccessCount: z.number().int().nonnegative().default(0),
  previousErrorCount: z.number().int().nonnegative().default(0),
  previousSkipCount: z.number().int().nonnegative().default(0),
});

export type BulkImportBatchPayload = z.infer<typeof BulkImportBatchPayloadSchema>;

/**
 * Process a single batch of a large import
 * Used for imports > 1000 rows, split into batches
 */
export const bulkImportBatchTask = task({
  id: 'bulk-import-batch',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 15000,
    factor: 2,
  },
  run: async (payload: BulkImportBatchPayload) => {
    const {
      jobId,
      rows,
      options,
      correlationId,
      batchIndex,
      totalBatches,
      previousSuccessCount,
      previousErrorCount,
      previousSkipCount,
    } = payload;

    logger.info('Processing bulk import batch', {
      jobId,
      correlationId,
      batchIndex,
      totalBatches,
      rowCount: rows.length,
    });

    try {
      const result = await processBulkImport(rows, {
        ...options,
        validateOnly: false,
      });

      const cumulativeSuccess = previousSuccessCount + result.successCount;
      const cumulativeError = previousErrorCount + result.errorCount;
      const cumulativeSkip = previousSkipCount + result.skipCount;

      // Update progress
      const isLastBatch = batchIndex === totalBatches - 1;
      let status: BulkImportStatus = 'processing';
      if (isLastBatch) {
        if (cumulativeError > 0 && cumulativeSuccess === 0) {
          status = 'failed';
        } else if (cumulativeError > 0) {
          status = 'partial';
        } else {
          status = 'completed';
        }
      }

      await updateJobProgress(jobId, {
        status,
        processedRows: (batchIndex + 1) * (options.batchSize ?? 100),
        successCount: cumulativeSuccess,
        errorCount: cumulativeError,
        skipCount: cumulativeSkip,
      });

      logger.info('Bulk import batch completed', {
        jobId,
        correlationId,
        batchIndex,
        batchSuccess: result.successCount,
        batchErrors: result.errorCount,
        cumulativeSuccess,
        cumulativeError,
      });

      return {
        success: true,
        batchIndex,
        successCount: result.successCount,
        errorCount: result.errorCount,
        skipCount: result.skipCount,
        cumulativeSuccess,
        cumulativeError,
        cumulativeSkip,
        errors: result.errors,
      };
    } catch (error) {
      logger.error('Bulk import batch failed', {
        jobId,
        correlationId,
        batchIndex,
        error,
      });

      throw error;
    }
  },
});

// =============================================================================
// Orchestrator for Large Imports
// =============================================================================

export const LargeImportOrchestratorPayloadSchema = z.object({
  jobId: z.string().uuid(),
  rows: z.array(BulkImportRowSchema),
  options: BulkImportOptionsSchema,
  correlationId: z.string(),
});

/**
 * Orchestrate large imports by splitting into batches
 * and processing sequentially
 */
export const largeImportOrchestrator = task({
  id: 'bulk-import-orchestrator',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: z.infer<typeof LargeImportOrchestratorPayloadSchema>) => {
    const { jobId, rows, options, correlationId } = payload;
    const batchSize = options.batchSize ?? 100;
    const totalBatches = Math.ceil(rows.length / batchSize);

    logger.info('Starting large import orchestration', {
      jobId,
      correlationId,
      totalRows: rows.length,
      batchSize,
      totalBatches,
    });

    let cumulativeSuccess = 0;
    let cumulativeError = 0;
    let cumulativeSkip = 0;

    // Process batches sequentially to manage database load
    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, rows.length);
      const batchRows = rows.slice(batchStart, batchEnd);

      try {
        const result = await bulkImportBatchTask.triggerAndWait({
          jobId,
          rows: batchRows,
          options,
          correlationId,
          batchIndex: i,
          totalBatches,
          previousSuccessCount: cumulativeSuccess,
          previousErrorCount: cumulativeError,
          previousSkipCount: cumulativeSkip,
        });

        if (result.ok) {
          cumulativeSuccess = result.output.cumulativeSuccess;
          cumulativeError = result.output.cumulativeError;
          cumulativeSkip = result.output.cumulativeSkip;
        }

        // Check if we should stop on errors
        if (options.stopOnFirstError && cumulativeError > 0) {
          logger.info('Stopping orchestration due to stopOnFirstError', {
            jobId,
            correlationId,
            batchIndex: i,
            cumulativeError,
          });
          break;
        }

        // Check max errors limit
        if (cumulativeError >= (options.maxErrors ?? 100)) {
          logger.info('Stopping orchestration due to maxErrors limit', {
            jobId,
            correlationId,
            batchIndex: i,
            cumulativeError,
            maxErrors: options.maxErrors,
          });
          break;
        }
      } catch (error) {
        logger.error('Batch processing failed in orchestrator', {
          jobId,
          correlationId,
          batchIndex: i,
          error,
        });

        // Continue with next batch unless stopOnFirstError
        if (options.stopOnFirstError) {
          throw error;
        }
      }
    }

    logger.info('Large import orchestration completed', {
      jobId,
      correlationId,
      totalRows: rows.length,
      successCount: cumulativeSuccess,
      errorCount: cumulativeError,
      skipCount: cumulativeSkip,
    });

    return {
      success: cumulativeError === 0,
      jobId,
      totalRows: rows.length,
      successCount: cumulativeSuccess,
      errorCount: cumulativeError,
      skipCount: cumulativeSkip,
    };
  },
});
