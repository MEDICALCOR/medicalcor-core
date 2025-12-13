/**
 * @fileoverview Leads API Routes
 *
 * REST API endpoints for Lead management.
 *
 * Endpoints:
 * - POST   /api/leads                - Create lead
 * - GET    /api/leads/:id            - Get lead
 * - GET    /api/leads                - List leads (paginated)
 * - PATCH  /api/leads/:id/score      - Score lead
 * - DELETE /api/leads/:id            - Soft delete
 *
 * @module api/routes/leads
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'leads-routes' });

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const CreateLeadSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  source: z.enum([
    'whatsapp',
    'voice',
    'web_form',
    'facebook',
    'google',
    'referral',
    'hubspot',
    'manual',
  ]),
  hubspotContactId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

const ScoreLeadSchema = z.object({
  score: z.number().int().min(1).max(5),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  confidence: z.number().min(0).max(1),
  method: z.enum(['ai', 'rule-based', 'manual']),
  reasoning: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
  urgencyIndicators: z.array(z.string()).optional(),
  budgetMentioned: z.boolean().optional(),
});

const ListLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'new',
      'contacted',
      'qualified',
      'nurturing',
      'scheduled',
      'converted',
      'lost',
      'invalid',
    ])
    .optional(),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  source: z.string().optional(),
});

interface LeadIdParams {
  id: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface LeadResponse {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string;
  status: string;
  score: number | null;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | null;
  hubspotContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedLeadsResponse {
  data: LeadResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

export const leadsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/leads
   * Create a new lead
   */
  fastify.post<{
    Body: z.infer<typeof CreateLeadSchema>;
    Reply: LeadResponse | ApiErrorResponse;
  }>(
    '/leads',
    {
      schema: {
        description: 'Create a new lead',
        tags: ['Leads'],
        body: {
          type: 'object',
          required: ['phone', 'source'],
          properties: {
            phone: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string', maxLength: 100 },
            lastName: { type: 'string', maxLength: 100 },
            source: {
              type: 'string',
              enum: [
                'whatsapp',
                'voice',
                'web_form',
                'facebook',
                'google',
                'referral',
                'hubspot',
                'manual',
              ],
            },
            hubspotContactId: { type: 'string' },
            utmSource: { type: 'string' },
            utmMedium: { type: 'string' },
            utmCampaign: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              phone: { type: 'string' },
              email: { type: 'string', nullable: true },
              firstName: { type: 'string', nullable: true },
              lastName: { type: 'string', nullable: true },
              source: { type: 'string' },
              status: { type: 'string' },
              score: { type: 'number', nullable: true },
              classification: { type: 'string', nullable: true },
              hubspotContactId: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

      const parsed = CreateLeadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.message,
            correlationId,
          },
        });
      }

      const { phone, email, firstName, lastName, source, hubspotContactId } = parsed.data;

      logger.info({ phone, source, correlationId }, 'Creating lead');

      const now = new Date().toISOString();
      const lead: LeadResponse = {
        id: crypto.randomUUID(),
        phone,
        email: email ?? null,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        source,
        status: 'new',
        score: null,
        classification: null,
        hubspotContactId: hubspotContactId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      reply.header('X-Correlation-ID', correlationId);
      return reply.status(201).send(lead);
    }
  );

  /**
   * GET /api/leads/:id
   * Get lead by ID
   */
  fastify.get<{
    Params: LeadIdParams;
    Reply: LeadResponse | ApiErrorResponse;
  }>(
    '/leads/:id',
    {
      schema: {
        description: 'Get lead by ID',
        tags: ['Leads'],
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
              phone: { type: 'string' },
              email: { type: 'string', nullable: true },
              firstName: { type: 'string', nullable: true },
              lastName: { type: 'string', nullable: true },
              source: { type: 'string' },
              status: { type: 'string' },
              score: { type: 'number', nullable: true },
              classification: { type: 'string', nullable: true },
              hubspotContactId: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const { id } = request.params;

      logger.debug({ leadId: id, correlationId }, 'Fetching lead');

      // In production, this would use LeadRepository.findById()
      const now = new Date().toISOString();
      const lead: LeadResponse = {
        id,
        phone: '+40700000001',
        email: null,
        firstName: null,
        lastName: null,
        source: 'whatsapp',
        status: 'new',
        score: null,
        classification: null,
        hubspotContactId: null,
        createdAt: now,
        updatedAt: now,
      };

      reply.header('X-Correlation-ID', correlationId);
      return lead;
    }
  );

  /**
   * GET /api/leads
   * List leads with pagination
   */
  fastify.get<{
    Querystring: z.infer<typeof ListLeadsQuerySchema>;
    Reply: PaginatedLeadsResponse | ApiErrorResponse;
  }>(
    '/leads',
    {
      schema: {
        description: 'List leads with pagination',
        tags: ['Leads'],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            status: {
              type: 'string',
              enum: [
                'new',
                'contacted',
                'qualified',
                'nurturing',
                'scheduled',
                'converted',
                'lost',
                'invalid',
              ],
            },
            classification: { type: 'string', enum: ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] },
            source: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string', nullable: true },
                    firstName: { type: 'string', nullable: true },
                    lastName: { type: 'string', nullable: true },
                    source: { type: 'string' },
                    status: { type: 'string' },
                    score: { type: 'number', nullable: true },
                    classification: { type: 'string', nullable: true },
                    hubspotContactId: { type: 'string', nullable: true },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

      const parsed = ListLeadsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.message,
            correlationId,
          },
        });
      }

      const { page, limit } = parsed.data;

      logger.debug({ page, limit, correlationId }, 'Listing leads');

      // In production, this would use LeadRepository with pagination
      reply.header('X-Correlation-ID', correlationId);
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
  );

  /**
   * PATCH /api/leads/:id/score
   * Score a lead
   */
  fastify.patch<{
    Params: LeadIdParams;
    Body: z.infer<typeof ScoreLeadSchema>;
    Reply: LeadResponse | ApiErrorResponse;
  }>(
    '/leads/:id/score',
    {
      schema: {
        description: 'Score a lead',
        tags: ['Leads'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['score', 'classification', 'confidence', 'method'],
          properties: {
            score: { type: 'integer', minimum: 1, maximum: 5 },
            classification: { type: 'string', enum: ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            method: { type: 'string', enum: ['ai', 'rule-based', 'manual'] },
            reasoning: { type: 'string' },
            procedureInterest: { type: 'array', items: { type: 'string' } },
            urgencyIndicators: { type: 'array', items: { type: 'string' } },
            budgetMentioned: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string', nullable: true },
              firstName: { type: 'string', nullable: true },
              lastName: { type: 'string', nullable: true },
              source: { type: 'string' },
              status: { type: 'string' },
              score: { type: 'number' },
              classification: { type: 'string' },
              hubspotContactId: { type: 'string', nullable: true },
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

      const parsed = ScoreLeadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.message,
            correlationId,
          },
        });
      }

      const { score, classification } = parsed.data;

      logger.info({ leadId: id, score, classification, correlationId }, 'Scoring lead');

      // In production, this would use LeadAggregateRoot.score() and persist
      const now = new Date().toISOString();
      const lead: LeadResponse = {
        id,
        phone: '+40700000001',
        email: null,
        firstName: null,
        lastName: null,
        source: 'whatsapp',
        status: classification === 'HOT' ? 'qualified' : 'contacted',
        score,
        classification,
        hubspotContactId: null,
        createdAt: now,
        updatedAt: now,
      };

      reply.header('X-Correlation-ID', correlationId);
      return lead;
    }
  );

  /**
   * DELETE /api/leads/:id
   * Soft delete a lead
   */
  fastify.delete<{
    Params: LeadIdParams;
    Reply: { success: boolean; message: string } | ApiErrorResponse;
  }>(
    '/leads/:id',
    {
      schema: {
        description: 'Soft delete a lead',
        tags: ['Leads'],
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

      logger.info({ leadId: id, correlationId }, 'Soft deleting lead');

      // In production, this would use LeadRepository.softDelete()
      reply.header('X-Correlation-ID', correlationId);
      return { success: true, message: `Lead ${id} deleted` };
    }
  );
};
