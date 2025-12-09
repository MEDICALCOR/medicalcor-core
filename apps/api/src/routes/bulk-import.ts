/**
 * Bulk Import API Routes
 * L3 Feature: Onboarding efficiency through bulk lead import
 *
 * Endpoints:
 * - POST /api/leads/bulk-import - Import leads from CSV or JSON
 * - POST /api/leads/bulk-import/validate - Validate import data (dry-run)
 * - GET /api/leads/bulk-import/jobs/:jobId - Get import job status
 * - POST /api/leads/bulk-import/async - Start async import job
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  parseCSV,
  processBulkImport,
  createBulkImportJob,
  getBulkImportJob,
  generateCorrelationId,
} from '@medicalcor/core';
import {
  BulkImportRowSchema,
  BulkImportOptionsSchema,
  type BulkImportRow,
  type BulkImportSyncResponse,
  type BulkImportAsyncResponse,
  type BulkImportJobStatus,
  calculateImportProgress,
} from '@medicalcor/types';
import { z } from 'zod';

// =============================================================================
// Request Schemas
// =============================================================================

const BulkImportBodySchema = z.object({
  // Either provide rows array or CSV/JSON content
  rows: z.array(BulkImportRowSchema).optional(),
  csvContent: z.string().optional(),
  jsonContent: z.string().optional(),
  // Import options
  options: BulkImportOptionsSchema.optional(),
});

const BulkImportQuerySchema = z.object({
  // For async processing of large imports
  async: z.enum(['true', 'false']).optional().default('false'),
});

const JobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
});

// =============================================================================
// Route Configuration
// =============================================================================

/**
 * Maximum rows for synchronous processing
 * Larger imports should use async mode
 */
const SYNC_IMPORT_LIMIT = 500;

/**
 * Maximum file size (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// =============================================================================
// Route Handlers
// =============================================================================

export const bulkImportRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/leads/bulk-import
   * Import leads from CSV or JSON data
   */
  fastify.post(
    '/api/leads/bulk-import',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        // Parse body
        const bodyParsed = BulkImportBodySchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid request body',
            details: bodyParsed.error.issues,
          });
        }

        const { rows: providedRows, csvContent, jsonContent, options } = bodyParsed.data;

        // Parse query params
        const queryParsed = BulkImportQuerySchema.safeParse(request.query);
        const useAsync = queryParsed.success && queryParsed.data.async === 'true';

        // Determine rows from input
        let rows: BulkImportRow[] = [];
        let parseErrors: { line: number; error: string }[] = [];

        if (providedRows && providedRows.length > 0) {
          rows = providedRows;
        } else if (csvContent) {
          // Check file size
          if (csvContent.length > MAX_FILE_SIZE) {
            return reply.status(400).send({
              success: false,
              error: 'CSV content too large',
              maxSizeBytes: MAX_FILE_SIZE,
            });
          }

          const parsed = parseCSV(csvContent);
          rows = parsed.rows;
          parseErrors = parsed.errors;

          if (rows.length === 0) {
            return reply.status(400).send({
              success: false,
              error: 'No valid rows found in CSV',
              parseErrors,
            });
          }
        } else if (jsonContent) {
          try {
            const parsed: unknown = JSON.parse(jsonContent);
            if (!Array.isArray(parsed)) {
              return reply.status(400).send({
                success: false,
                error: 'JSON content must be an array of lead objects',
              });
            }

            // Validate each row
            for (let i = 0; i < parsed.length; i++) {
              const rowParsed = BulkImportRowSchema.safeParse(parsed[i]);
              if (rowParsed.success) {
                rows.push(rowParsed.data);
              } else {
                parseErrors.push({
                  line: i + 1,
                  error: rowParsed.error.issues.map((e) => e.message).join('; '),
                });
              }
            }
          } catch {
            return reply.status(400).send({
              success: false,
              error: 'Invalid JSON content',
            });
          }
        } else {
          return reply.status(400).send({
            success: false,
            error: 'Must provide either rows, csvContent, or jsonContent',
          });
        }

        request.log.info(
          {
            correlationId,
            rowCount: rows.length,
            parseErrors: parseErrors.length,
            useAsync,
          },
          'Bulk import request received'
        );

        // For large imports, require async mode
        if (rows.length > SYNC_IMPORT_LIMIT && !useAsync) {
          return reply.status(400).send({
            success: false,
            error: `Import of ${rows.length} rows exceeds sync limit (${SYNC_IMPORT_LIMIT}). Use async=true query parameter.`,
            rowCount: rows.length,
            syncLimit: SYNC_IMPORT_LIMIT,
          });
        }

        // Async mode - create job and return immediately
        if (useAsync) {
          const job = await createBulkImportJob({
            totalRows: rows.length,
            format: csvContent ? 'csv' : 'json',
            options,
          });

          // TODO: Trigger async workflow via Trigger.dev
          // For now, just return the job info

          const response: BulkImportAsyncResponse = {
            success: true,
            jobId: job.id,
            status: 'pending',
            message: `Import job created for ${rows.length} leads. Processing will begin shortly.`,
            totalRows: rows.length,
            statusUrl: `/api/leads/bulk-import/jobs/${job.id}`,
          };

          request.log.info({ correlationId, jobId: job.id }, 'Async bulk import job created');

          return reply.status(202).send(response);
        }

        // Sync mode - process immediately
        const result = await processBulkImport(rows, options);

        // Include parse errors in response
        if (parseErrors.length > 0) {
          request.log.warn(
            { correlationId, parseErrors: parseErrors.length },
            'Some rows failed to parse'
          );
        }

        const response: BulkImportSyncResponse = {
          ...result,
          // Add parse errors to the error list if any
        };

        request.log.info(
          {
            correlationId,
            success: result.success,
            successCount: result.successCount,
            errorCount: result.errorCount,
            skipCount: result.skipCount,
          },
          'Bulk import completed'
        );

        return reply.status(result.success ? 200 : 207).send(response);
      } catch (error) {
        request.log.error({ correlationId, error }, 'Bulk import failed');

        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * POST /api/leads/bulk-import/validate
   * Validate import data without persisting (dry-run)
   */
  fastify.post(
    '/api/leads/bulk-import/validate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const bodyParsed = BulkImportBodySchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid request body',
            details: bodyParsed.error.issues,
          });
        }

        const { rows: providedRows, csvContent, jsonContent, options } = bodyParsed.data;

        // Determine rows
        let rows: BulkImportRow[] = [];
        let parseErrors: { line: number; error: string }[] = [];

        if (providedRows && providedRows.length > 0) {
          rows = providedRows;
        } else if (csvContent) {
          const parsed = parseCSV(csvContent);
          rows = parsed.rows;
          parseErrors = parsed.errors;
        } else if (jsonContent) {
          try {
            const parsed: unknown = JSON.parse(jsonContent);
            if (Array.isArray(parsed)) {
              for (let i = 0; i < parsed.length; i++) {
                const rowParsed = BulkImportRowSchema.safeParse(parsed[i]);
                if (rowParsed.success) {
                  rows.push(rowParsed.data);
                } else {
                  parseErrors.push({
                    line: i + 1,
                    error: rowParsed.error.issues.map((e) => e.message).join('; '),
                  });
                }
              }
            }
          } catch {
            return reply.status(400).send({
              success: false,
              error: 'Invalid JSON content',
            });
          }
        }

        // Process with validateOnly flag
        const result = await processBulkImport(rows, {
          ...options,
          validateOnly: true,
        });

        request.log.info(
          {
            correlationId,
            rowCount: rows.length,
            validCount: result.successCount,
            invalidCount: result.errorCount,
          },
          'Bulk import validation completed'
        );

        return reply.status(200).send({
          ...result,
          parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
        });
      } catch (error) {
        request.log.error({ correlationId, error }, 'Bulk import validation failed');

        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /api/leads/bulk-import/jobs/:jobId
   * Get import job status and progress
   */
  fastify.get(
    '/api/leads/bulk-import/jobs/:jobId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = JobIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid job ID',
        });
      }

      const { jobId } = paramsParsed.data;
      const job = await getBulkImportJob(jobId);

      if (!job) {
        return reply.status(404).send({
          success: false,
          error: 'Job not found',
        });
      }

      const response: BulkImportJobStatus = {
        job,
        progress: calculateImportProgress(job.processedRows, job.totalRows),
        isComplete: ['completed', 'partial', 'failed', 'cancelled'].includes(job.status),
      };

      return reply.status(200).send(response);
    }
  );

  /**
   * POST /api/leads/bulk-import/template
   * Download CSV template for bulk import
   */
  fastify.get(
    '/api/leads/bulk-import/template',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const template = [
        'phone,fullName,email,source,tags,language,gdprConsent,status,notes',
        '+40721234567,Ion Popescu,ion@example.com,facebook,"implant,urgent",ro,true,new,Lead from Facebook ad',
        '+40722345678,Maria Ionescu,maria@example.com,google,"consultatii",ro,true,new,Interested in consultation',
      ].join('\n');

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', 'attachment; filename="lead-import-template.csv"')
        .send(template);
    }
  );
};

export default bulkImportRoutes;
