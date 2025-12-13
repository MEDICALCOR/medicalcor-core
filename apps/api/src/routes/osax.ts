/**
 * @fileoverview OSAX API Routes
 *
 * REST API endpoints for OSAX (Oral Surgery Assessment eXtended) case management.
 *
 * Endpoints:
 * - POST   /api/osax/cases           - Create OSAX case
 * - GET    /api/osax/cases/:id       - Get case by ID
 * - GET    /api/osax/cases/subject/:subjectId - Get cases by subject
 * - PATCH  /api/osax/cases/:id/score - Update score
 * - DELETE /api/osax/cases/:id       - Soft delete
 *
 * @module api/routes/osax
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'osax-routes' });

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const CreateOsaxCaseSchema = z.object({
  subjectId: z.string().uuid(),
  subjectType: z.enum(['lead', 'patient']),
  encryptionKeyId: z.string().optional(),
});

const ScoreOsaxCaseSchema = z.object({
  boneQuality: z.number().int().min(1).max(4),
  softTissueHealth: z.enum(['excellent', 'good', 'fair', 'poor']),
  systemicRisks: z.array(z.string()),
  urgency: z.enum(['routine', 'soon', 'urgent', 'emergency']),
  financialReadiness: z.enum(['ready', 'financing_needed', 'uncertain', 'not_ready']),
  patientAge: z.number().int().min(0).max(120).optional(),
  asaClassification: z.number().int().min(1).max(5).optional(),
});

interface OsaxCaseIdParams {
  id: string;
}
interface SubjectIdParams {
  subjectId: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface OsaxCaseResponse {
  id: string;
  subjectId: string;
  subjectType: 'lead' | 'patient';
  status: string;
  globalScore: number | null;
  riskClass: 'RED' | 'YELLOW' | 'GREEN' | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export const osaxRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/osax/cases
   * Create a new OSAX case
   */
  fastify.post<{
    Body: z.infer<typeof CreateOsaxCaseSchema>;
    Reply: OsaxCaseResponse | ApiErrorResponse;
  }>(
    '/osax/cases',
    {
      schema: {
        description: 'Create a new OSAX assessment case',
        tags: ['OSAX'],
        body: {
          type: 'object',
          required: ['subjectId', 'subjectType'],
          properties: {
            subjectId: { type: 'string', format: 'uuid' },
            subjectType: { type: 'string', enum: ['lead', 'patient'] },
            encryptionKeyId: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              subjectId: { type: 'string' },
              subjectType: { type: 'string' },
              status: { type: 'string' },
              globalScore: { type: 'number', nullable: true },
              riskClass: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string', nullable: true },
            },
          },
          400: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

      const parsed = CreateOsaxCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.message,
            correlationId,
          },
        });
      }

      const { subjectId, subjectType } = parsed.data;

      logger.info({ subjectId, subjectType, correlationId }, 'Creating OSAX case');

      // In production, this would use SupabaseOsaxCaseRepository
      const osaxCase: OsaxCaseResponse = {
        id: crypto.randomUUID(),
        subjectId,
        subjectType,
        status: 'pending',
        globalScore: null,
        riskClass: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

      reply.header('X-Correlation-ID', correlationId);
      return reply.status(201).send(osaxCase);
    }
  );

  /**
   * GET /api/osax/cases/:id
   * Get OSAX case by ID
   */
  fastify.get<{
    Params: OsaxCaseIdParams;
    Reply: OsaxCaseResponse | ApiErrorResponse;
  }>(
    '/osax/cases/:id',
    {
      schema: {
        description: 'Get OSAX case by ID',
        tags: ['OSAX'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subjectId: { type: 'string' },
              subjectType: { type: 'string' },
              status: { type: 'string' },
              globalScore: { type: 'number', nullable: true },
              riskClass: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string', nullable: true },
            },
          },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const { id } = request.params;

      logger.debug({ caseId: id, correlationId }, 'Fetching OSAX case');

      // In production, this would use SupabaseOsaxCaseRepository.findById()
      // For now, return mock data
      const osaxCase: OsaxCaseResponse = {
        id,
        subjectId: 'mock-subject-id',
        subjectType: 'lead',
        status: 'pending',
        globalScore: null,
        riskClass: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

      reply.header('X-Correlation-ID', correlationId);
      return osaxCase;
    }
  );

  /**
   * GET /api/osax/cases/subject/:subjectId
   * Get OSAX cases by subject ID
   */
  fastify.get<{
    Params: SubjectIdParams;
    Reply: OsaxCaseResponse[] | ApiErrorResponse;
  }>(
    '/osax/cases/subject/:subjectId',
    {
      schema: {
        description: 'Get OSAX cases by subject ID',
        tags: ['OSAX'],
        params: {
          type: 'object',
          required: ['subjectId'],
          properties: {
            subjectId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                subjectId: { type: 'string' },
                subjectType: { type: 'string' },
                status: { type: 'string' },
                globalScore: { type: 'number', nullable: true },
                riskClass: { type: 'string', nullable: true },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const { subjectId } = request.params;

      logger.debug({ subjectId, correlationId }, 'Fetching OSAX cases by subject');

      // In production, this would use SupabaseOsaxCaseRepository.findBySubjectId()
      reply.header('X-Correlation-ID', correlationId);
      return [];
    }
  );

  /**
   * PATCH /api/osax/cases/:id/score
   * Score an OSAX case
   */
  fastify.patch<{
    Params: OsaxCaseIdParams;
    Body: z.infer<typeof ScoreOsaxCaseSchema>;
    Reply: OsaxCaseResponse | ApiErrorResponse;
  }>(
    '/osax/cases/:id/score',
    {
      schema: {
        description: 'Score an OSAX case with medical factors',
        tags: ['OSAX'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: [
            'boneQuality',
            'softTissueHealth',
            'systemicRisks',
            'urgency',
            'financialReadiness',
          ],
          properties: {
            boneQuality: { type: 'integer', minimum: 1, maximum: 4 },
            softTissueHealth: { type: 'string', enum: ['excellent', 'good', 'fair', 'poor'] },
            systemicRisks: { type: 'array', items: { type: 'string' } },
            urgency: { type: 'string', enum: ['routine', 'soon', 'urgent', 'emergency'] },
            financialReadiness: {
              type: 'string',
              enum: ['ready', 'financing_needed', 'uncertain', 'not_ready'],
            },
            patientAge: { type: 'integer', minimum: 0, maximum: 120 },
            asaClassification: { type: 'integer', minimum: 1, maximum: 5 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subjectId: { type: 'string' },
              subjectType: { type: 'string' },
              status: { type: 'string' },
              globalScore: { type: 'number' },
              riskClass: { type: 'string' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const { id } = request.params;

      const parsed = ScoreOsaxCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.message,
            correlationId,
          },
        });
      }

      logger.info({ caseId: id, correlationId }, 'Scoring OSAX case');

      // In production, this would use OsaxScoringPolicy and SupabaseOsaxCaseRepository
      // Simplified scoring for demonstration
      const { boneQuality, softTissueHealth, systemicRisks } = parsed.data;
      let globalScore = 100;
      globalScore -= (boneQuality - 1) * 10;
      globalScore -= softTissueHealth === 'poor' ? 20 : softTissueHealth === 'fair' ? 10 : 0;
      globalScore -= systemicRisks.length * 15;

      const riskClass: 'RED' | 'YELLOW' | 'GREEN' =
        globalScore >= 70 ? 'GREEN' : globalScore >= 40 ? 'YELLOW' : 'RED';

      const osaxCase: OsaxCaseResponse = {
        id,
        subjectId: 'mock-subject-id',
        subjectType: 'lead',
        status: 'scored',
        globalScore,
        riskClass,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      reply.header('X-Correlation-ID', correlationId);
      return osaxCase;
    }
  );

  /**
   * DELETE /api/osax/cases/:id
   * Soft delete an OSAX case
   */
  fastify.delete<{
    Params: OsaxCaseIdParams;
    Reply: { success: boolean; message: string } | ApiErrorResponse;
  }>(
    '/osax/cases/:id',
    {
      schema: {
        description: 'Soft delete an OSAX case',
        tags: ['OSAX'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const { id } = request.params;

      logger.info({ caseId: id, correlationId }, 'Soft deleting OSAX case');

      // In production, this would use SupabaseOsaxCaseRepository.delete()
      reply.header('X-Correlation-ID', correlationId);
      return { success: true, message: `OSAX case ${id} deleted` };
    }
  );
};
