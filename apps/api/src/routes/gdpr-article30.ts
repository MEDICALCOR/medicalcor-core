/**
 * GDPR Article 30 Compliance Reporting Routes (L10)
 *
 * Implements GDPR Article 30: Records of Processing Activities (RoPA)
 * Automated compliance reporting for regulatory audits.
 *
 * SECURITY: All endpoints require API key authentication via X-API-Key header.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { generateCorrelationId, createArticle30ReportService } from '@medicalcor/core';
import type { Article30ControllerInfo, Article30ReportStatus } from '@medicalcor/types';

/**
 * Get controller info from environment
 */
function getControllerInfo(): Article30ControllerInfo {
  return {
    name: process.env.ORGANIZATION_NAME ?? 'MedicalCor',
    address: process.env.ORGANIZATION_ADDRESS ?? '',
    country: process.env.ORGANIZATION_COUNTRY ?? 'RO',
    email: process.env.DPO_EMAIL ?? 'dpo@medicalcor.com',
    dpoName: process.env.DPO_NAME,
    dpoEmail: process.env.DPO_EMAIL,
  };
}

/**
 * Create report service or return null if database not configured
 */
function createReportService(): ReturnType<typeof createArticle30ReportService> | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

   
  const supabase = createClient(supabaseUrl, supabaseKey);
  return createArticle30ReportService({
    supabase,
    controller: getControllerInfo(),
  });
   
}

/**
 * GDPR Article 30 Compliance Reporting Routes
 */
 
export const gdprArticle30Routes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /gdpr/article30/reports
   *
   * List Article 30 compliance reports with pagination
   */
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      status?: Article30ReportStatus;
    };
  }>('/gdpr/article30/reports', {
    schema: {
      description: 'List GDPR Article 30 compliance reports',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10, maximum: 100 },
          offset: { type: 'number', default: 0 },
          status: {
            type: 'string',
            enum: ['draft', 'pending_review', 'approved', 'published', 'archived'],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reports: { type: 'array' },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{
        Querystring: { limit?: number; offset?: number; status?: Article30ReportStatus };
      }>,
      reply: FastifyReply
    ) => {
      const { limit = 10, offset = 0, status } = request.query;
      const correlationId = generateCorrelationId();

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const result = await reportService.listReports({ limit, offset, status });

        fastify.log.info(
          { correlationId, reportCount: result.reports.length, total: result.total },
          'Article 30 reports listed'
        );

        return await reply.send({
          reports: result.reports.map((r) => ({
            reportId: r.reportId,
            version: r.version,
            title: r.title,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            generatedAt: r.generatedAt,
            status: r.status,
            frequency: r.frequency,
            totalActivities: r.statistics.totalActivities,
          })),
          total: result.total,
          limit,
          offset,
        });
      } catch (error) {
        fastify.log.error({ error, correlationId }, 'Failed to list Article 30 reports');
        return reply.status(500).send({
          code: 'LIST_FAILED',
          message: 'Failed to list compliance reports',
        });
      }
    },
  });

  /**
   * GET /gdpr/article30/reports/latest
   */
  fastify.get('/gdpr/article30/reports/latest', {
    schema: {
      description: 'Get latest GDPR Article 30 compliance report',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: { type: 'object', description: 'Article 30 compliance report' },
        404: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const report = await reportService.getLatestReport();

        if (!report) {
          return await reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'No Article 30 reports found',
          });
        }

        fastify.log.info(
          { correlationId, reportId: report.reportId },
          'Latest Article 30 report retrieved'
        );

        return await reply.send(report);
      } catch (error) {
        fastify.log.error({ error, correlationId }, 'Failed to get latest Article 30 report');
        return reply.status(500).send({
          code: 'GET_FAILED',
          message: 'Failed to retrieve latest compliance report',
        });
      }
    },
  });

  /**
   * GET /gdpr/article30/reports/:id
   */
  fastify.get<{ Params: { id: string } }>('/gdpr/article30/reports/:id', {
    schema: {
      description: 'Get specific GDPR Article 30 compliance report',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { type: 'object', description: 'Article 30 compliance report' },
        404: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const correlationId = generateCorrelationId();

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const report = await reportService.getReport(id);

        if (!report) {
          return await reply.status(404).send({
            code: 'NOT_FOUND',
            message: `Article 30 report not found: ${id}`,
          });
        }

        fastify.log.info({ correlationId, reportId: id }, 'Article 30 report retrieved');

        return await reply.send(report);
      } catch (error) {
        fastify.log.error(
          { error, correlationId, reportId: id },
          'Failed to get Article 30 report'
        );
        return reply.status(500).send({
          code: 'GET_FAILED',
          message: 'Failed to retrieve compliance report',
        });
      }
    },
  });

  /**
   * POST /gdpr/article30/reports/generate
   */
  fastify.post<{
    Body: {
      periodStart?: string;
      periodEnd?: string;
      title?: string;
      frequency?: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'on_demand';
      includeConsentSummary?: boolean;
      includeDSRSummary?: boolean;
      includeDataBreaches?: boolean;
      notes?: string;
    };
  }>('/gdpr/article30/reports/generate', {
    schema: {
      description: 'Generate a new GDPR Article 30 compliance report',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      body: {
        type: 'object',
        properties: {
          periodStart: { type: 'string', format: 'date-time' },
          periodEnd: { type: 'string', format: 'date-time' },
          title: { type: 'string' },
          frequency: {
            type: 'string',
            enum: ['monthly', 'quarterly', 'semi_annual', 'annual', 'on_demand'],
          },
          includeConsentSummary: { type: 'boolean', default: true },
          includeDSRSummary: { type: 'boolean', default: true },
          includeDataBreaches: { type: 'boolean', default: true },
          notes: { type: 'string' },
        },
      },
      response: {
        201: { type: 'object', description: 'Generated Article 30 compliance report' },
      },
    },
    handler: async (
      request: FastifyRequest<{
        Body: {
          periodStart?: string;
          periodEnd?: string;
          title?: string;
          frequency?: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'on_demand';
          includeConsentSummary?: boolean;
          includeDSRSummary?: boolean;
          includeDataBreaches?: boolean;
          notes?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();
      const body = request.body;

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const report = await reportService.generateReport({
          periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
          periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
          title: body.title,
          frequency: body.frequency ?? 'on_demand',
          includeConsentSummary: body.includeConsentSummary ?? true,
          includeDSRSummary: body.includeDSRSummary ?? true,
          includeDataBreaches: body.includeDataBreaches ?? true,
          notes: body.notes,
          correlationId,
        });

        fastify.log.info(
          {
            correlationId,
            reportId: report.reportId,
            version: report.version,
            totalActivities: report.statistics.totalActivities,
          },
          'Article 30 report generated via API'
        );

        reply.header('X-Correlation-Id', correlationId);
        return await reply.status(201).send(report);
      } catch (error) {
        fastify.log.error({ error, correlationId }, 'Failed to generate Article 30 report');
        return reply.status(500).send({
          code: 'GENERATION_FAILED',
          message: 'Failed to generate compliance report',
        });
      }
    },
  });

  /**
   * POST /gdpr/article30/reports/:id/approve
   */
  fastify.post<{
    Params: { id: string };
    Body: { approvedBy: string; comments?: string };
  }>('/gdpr/article30/reports/:id/approve', {
    schema: {
      description: 'Approve a GDPR Article 30 compliance report',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['approvedBy'],
        properties: {
          approvedBy: { type: 'string' },
          comments: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', description: 'Approved Article 30 compliance report' },
        400: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
        404: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { approvedBy: string; comments?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { approvedBy, comments } = request.body;
      const correlationId = generateCorrelationId();

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const report = await reportService.approveReport(id, approvedBy, comments);

        fastify.log.info({ correlationId, reportId: id, approvedBy }, 'Article 30 report approved');

        return await reply.send(report);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: `Article 30 report not found: ${id}`,
          });
        }

        if (errorMessage.includes('cannot be approved')) {
          return reply.status(400).send({
            code: 'INVALID_STATUS',
            message: errorMessage,
          });
        }

        fastify.log.error(
          { error, correlationId, reportId: id },
          'Failed to approve Article 30 report'
        );
        return reply.status(500).send({
          code: 'APPROVAL_FAILED',
          message: 'Failed to approve compliance report',
        });
      }
    },
  });

  /**
   * GET /gdpr/article30/reports/:id/export
   */
  fastify.get<{ Params: { id: string } }>('/gdpr/article30/reports/:id/export', {
    schema: {
      description: 'Export GDPR Article 30 compliance report as JSON',
      tags: ['GDPR', 'Article 30'],
      security: [{ ApiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { type: 'string', description: 'JSON report export' },
        404: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const correlationId = generateCorrelationId();

      const reportService = createReportService();
      if (!reportService) {
        return reply.status(503).send({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service not configured',
        });
      }

      try {
        const jsonExport = await reportService.exportToJSON(id);

        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="article30-report-${id}.json"`);
        reply.header('X-Correlation-Id', correlationId);

        fastify.log.info({ correlationId, reportId: id }, 'Article 30 report exported');

        return await reply.send(jsonExport);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('not found')) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: `Article 30 report not found: ${id}`,
          });
        }

        fastify.log.error(
          { error, correlationId, reportId: id },
          'Failed to export Article 30 report'
        );
        return reply.status(500).send({
          code: 'EXPORT_FAILED',
          message: 'Failed to export compliance report',
        });
      }
    },
  });
};

export default gdprArticle30Routes;
