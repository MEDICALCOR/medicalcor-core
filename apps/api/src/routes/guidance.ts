/**
 * Agent Guidance API Routes
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * REST API endpoints for managing call scripts, guidance, and
 * real-time coaching during calls.
 */
/* eslint-disable max-lines-per-function */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CreateGuidanceSchema,
  UpdateGuidanceSchema,
  GuidanceQuerySchema,
  GuidanceCategorySchema,
  GuidanceTypeSchema,
} from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse, generateCorrelationId } from '@medicalcor/core';
import { GuidanceService, type IGuidanceRepository } from '@medicalcor/domain';

// =============================================================================
// Request Schemas
// =============================================================================

const ParamsWithId = z.object({
  id: z.string().uuid(),
});

const ParamsWithCallSid = z.object({
  callSid: z.string().min(1),
});

const LoadGuidanceForCallSchema = z.object({
  procedure: z.string().optional(),
  category: GuidanceCategorySchema.optional(),
  audience: z.enum(['new-patient', 'existing-patient', 'referral', 'emergency', 'all']).optional(),
  language: z.enum(['en', 'ro']).optional(),
  type: GuidanceTypeSchema.optional(),
});

const CompleteStepSchema = z.object({
  stepId: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

const ProcessMessageSchema = z.object({
  speaker: z.enum(['customer', 'agent', 'assistant']),
  text: z.string().min(1),
});

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create guidance routes with injected repository
 */
export function createGuidanceRoutes(repository: IGuidanceRepository): FastifyPluginAsync {
  const service = new GuidanceService(repository);

   
  const guidanceRoutes: FastifyPluginAsync = async (fastify) => {
    // ========================================================================
    // CRUD Operations
    // ========================================================================

    /**
     * GET /guidance
     * List all guidance with filtering
     */
    fastify.get('/guidance', async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        // Extract clinic ID from auth context
        const clinicId = (request as FastifyRequest & { clinicId?: string }).clinicId;
        if (!clinicId) {
          return await reply.status(401).send({
            error: 'Clinic context required',
            correlationId,
          });
        }

        const parseResult = GuidanceQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid query parameters',
            parseResult.error.flatten()
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const result = await service.listGuidance({ ...parseResult.data, clinicId });

        if (!result.success) {
          return await reply.status(500).send({
            error: result.error.message,
            code: result.error.code,
            correlationId,
          });
        }

        return await reply.send({
          ...result.data,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'List guidance error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    });

    /**
     * GET /guidance/:id
     * Get specific guidance by ID
     */
    fastify.get(
      '/guidance/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.getGuidance(parseResult.data.id);

          if (!result.success) {
            return await reply.status(500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          if (!result.data) {
            return await reply.status(404).send({
              error: 'Guidance not found',
              correlationId,
            });
          }

          return await reply.send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance
     * Create new guidance
     */
    fastify.post('/guidance', async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const clinicId = (request as FastifyRequest & { clinicId?: string }).clinicId;
        if (!clinicId) {
          return await reply.status(401).send({
            error: 'Clinic context required',
            correlationId,
          });
        }

        const parseResult = CreateGuidanceSchema.safeParse(request.body);
        if (!parseResult.success) {
          const error = new ValidationError('Invalid guidance data', parseResult.error.flatten());
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const result = await service.createGuidance({
          ...parseResult.data,
          clinicId,
        });

        if (!result.success) {
          const statusCode = result.error.code === 'DUPLICATE_NAME' ? 409 : 500;
          return await reply.status(statusCode).send({
            error: result.error.message,
            code: result.error.code,
            correlationId,
          });
        }

        fastify.log.info(
          { correlationId, guidanceId: result.data.id, name: result.data.name },
          'Guidance created'
        );

        return await reply.status(201).send({
          guidance: result.data,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Create guidance error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    });

    /**
     * PUT /guidance/:id
     * Update existing guidance
     */
    fastify.put(
      '/guidance/:id',
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithId.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const bodyResult = UpdateGuidanceSchema.partial().safeParse(request.body);
          if (!bodyResult.success) {
            const error = new ValidationError('Invalid update data', bodyResult.error.flatten());
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const result = await service.updateGuidance(paramsResult.data.id, bodyResult.data);

          if (!result.success) {
            const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 500;
            return await reply.status(statusCode).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          fastify.log.info({ correlationId, guidanceId: result.data.id }, 'Guidance updated');

          return await reply.send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Update guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * DELETE /guidance/:id
     * Delete guidance (soft delete)
     */
    fastify.delete(
      '/guidance/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.deleteGuidance(parseResult.data.id);

          if (!result.success) {
            const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 500;
            return await reply.status(statusCode).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          fastify.log.info({ correlationId, guidanceId: parseResult.data.id }, 'Guidance deleted');

          return await reply.send({
            success: true,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Delete guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Status Management
    // ========================================================================

    /**
     * POST /guidance/:id/activate
     * Activate guidance
     */
    fastify.post(
      '/guidance/:id/activate',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.activateGuidance(parseResult.data.id);

          if (!result.success) {
            return await reply.status(result.error.code === 'NOT_FOUND' ? 404 : 500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          return await reply.send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Activate guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance/:id/deactivate
     * Deactivate guidance
     */
    fastify.post(
      '/guidance/:id/deactivate',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.deactivateGuidance(parseResult.data.id);

          if (!result.success) {
            return await reply.status(result.error.code === 'NOT_FOUND' ? 404 : 500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          return await reply.send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Deactivate guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance/:id/publish
     * Publish draft guidance
     */
    fastify.post(
      '/guidance/:id/publish',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.publishGuidance(parseResult.data.id);

          if (!result.success) {
            return await reply.status(result.error.code === 'NOT_FOUND' ? 404 : 500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          fastify.log.info(
            { correlationId, guidanceId: parseResult.data.id },
            'Guidance published'
          );

          return await reply.send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Publish guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Versioning
    // ========================================================================

    /**
     * POST /guidance/:id/version
     * Create new version of guidance
     */
    fastify.post(
      '/guidance/:id/version',
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithId.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const bodyResult = UpdateGuidanceSchema.partial().safeParse(request.body);
          if (!bodyResult.success) {
            const error = new ValidationError('Invalid version data', bodyResult.error.flatten());
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const result = await service.createNewVersion(paramsResult.data.id, bodyResult.data);

          if (!result.success) {
            return await reply.status(result.error.code === 'NOT_FOUND' ? 404 : 500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          fastify.log.info(
            { correlationId, guidanceId: result.data.id, version: result.data.version },
            'Guidance version created'
          );

          return await reply.status(201).send({
            guidance: result.data,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Create version error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * GET /guidance/:id/versions
     * Get version history
     */
    fastify.get(
      '/guidance/:id/versions',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const parseResult = ParamsWithId.safeParse(request.params);
          if (!parseResult.success) {
            return await reply.status(400).send({
              error: 'Invalid guidance ID',
              correlationId,
            });
          }

          const result = await service.getVersionHistory(parseResult.data.id);

          if (!result.success) {
            return await reply.status(500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          return await reply.send({
            versions: result.data,
            total: result.data.length,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get versions error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Call Guidance (Real-time)
    // ========================================================================

    /**
     * POST /guidance/calls/:callSid/load
     * Load guidance for a specific call
     */
    fastify.post(
      '/guidance/calls/:callSid/load',
      async (
        request: FastifyRequest<{ Params: { callSid: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const clinicId = (request as FastifyRequest & { clinicId?: string }).clinicId;
          if (!clinicId) {
            return await reply.status(401).send({
              error: 'Clinic context required',
              correlationId,
            });
          }

          const paramsResult = ParamsWithCallSid.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid call SID',
              correlationId,
            });
          }

          const bodyResult = LoadGuidanceForCallSchema.safeParse(request.body);
          if (!bodyResult.success) {
            const error = new ValidationError(
              'Invalid load parameters',
              bodyResult.error.flatten()
            );
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const result = await service.loadGuidanceForCall(paramsResult.data.callSid, {
            clinicId,
            ...bodyResult.data,
          });

          if (!result.success) {
            return await reply.status(500).send({
              error: result.error.message,
              code: result.error.code,
              correlationId,
            });
          }

          if (!result.data) {
            return await reply.status(404).send({
              error: 'No matching guidance found',
              correlationId,
            });
          }

          fastify.log.info(
            { correlationId, callSid: paramsResult.data.callSid, guidanceId: result.data.id },
            'Guidance loaded for call'
          );

          return await reply.send({
            guidance: result.data,
            currentStep: service.getCurrentStep(paramsResult.data.callSid),
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Load guidance for call error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * GET /guidance/calls/:callSid
     * Get current guidance state for a call
     */
    fastify.get(
      '/guidance/calls/:callSid',
      async (request: FastifyRequest<{ Params: { callSid: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithCallSid.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid call SID',
              correlationId,
            });
          }

          const guidance = service.getCallGuidance(paramsResult.data.callSid);
          if (!guidance) {
            return await reply.status(404).send({
              error: 'No guidance loaded for this call',
              correlationId,
            });
          }

          return await reply.send({
            guidance,
            currentStep: service.getCurrentStep(paramsResult.data.callSid),
            suggestions: service.getPendingSuggestions(paramsResult.data.callSid),
            collectedData: service.getCollectedData(paramsResult.data.callSid),
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Get call guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance/calls/:callSid/step/complete
     * Complete current step
     */
    fastify.post(
      '/guidance/calls/:callSid/step/complete',
      async (
        request: FastifyRequest<{ Params: { callSid: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithCallSid.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid call SID',
              correlationId,
            });
          }

          const bodyResult = CompleteStepSchema.safeParse(request.body);
          if (!bodyResult.success) {
            const error = new ValidationError('Invalid step data', bodyResult.error.flatten());
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const nextStep = service.completeStep(
            paramsResult.data.callSid,
            bodyResult.data.stepId,
            bodyResult.data.data
          );

          return await reply.send({
            nextStep,
            isComplete: !nextStep,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Complete step error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance/calls/:callSid/message
     * Process a message and get suggestions
     */
    fastify.post(
      '/guidance/calls/:callSid/message',
      async (
        request: FastifyRequest<{ Params: { callSid: string }; Body: unknown }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithCallSid.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid call SID',
              correlationId,
            });
          }

          const bodyResult = ProcessMessageSchema.safeParse(request.body);
          if (!bodyResult.success) {
            const error = new ValidationError('Invalid message data', bodyResult.error.flatten());
            return await reply.status(400).send(toSafeErrorResponse(error));
          }

          const suggestions = service.processMessage(
            paramsResult.data.callSid,
            bodyResult.data.speaker,
            bodyResult.data.text
          );

          return await reply.send({
            suggestions,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Process message error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * POST /guidance/calls/:callSid/suggestions/:suggestionId/acknowledge
     * Acknowledge a suggestion
     */
    fastify.post(
      '/guidance/calls/:callSid/suggestions/:suggestionId/acknowledge',
      async (
        request: FastifyRequest<{ Params: { callSid: string; suggestionId: string } }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();

        try {
          const { callSid, suggestionId } = request.params;

          const success = service.acknowledgeSuggestion(callSid, suggestionId);

          if (!success) {
            return await reply.status(404).send({
              error: 'Suggestion not found',
              correlationId,
            });
          }

          return await reply.send({
            success: true,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'Acknowledge suggestion error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    /**
     * DELETE /guidance/calls/:callSid
     * End guidance for a call
     */
    fastify.delete(
      '/guidance/calls/:callSid',
      async (request: FastifyRequest<{ Params: { callSid: string } }>, reply: FastifyReply) => {
        const correlationId = generateCorrelationId();

        try {
          const paramsResult = ParamsWithCallSid.safeParse(request.params);
          if (!paramsResult.success) {
            return await reply.status(400).send({
              error: 'Invalid call SID',
              correlationId,
            });
          }

          service.endCallGuidance(paramsResult.data.callSid);

          return await reply.send({
            success: true,
            correlationId,
          });
        } catch (error) {
          fastify.log.error({ correlationId, error }, 'End call guidance error');
          return await reply.status(500).send(toSafeErrorResponse(error));
        }
      }
    );

    // ========================================================================
    // Search
    // ========================================================================

    /**
     * GET /guidance/search
     * Search guidance by text and tags
     */
    fastify.get('/guidance/search', async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const clinicId = (request as FastifyRequest & { clinicId?: string }).clinicId;
        if (!clinicId) {
          return await reply.status(401).send({
            error: 'Clinic context required',
            correlationId,
          });
        }

        const query = request.query as { q?: string; tags?: string };
        const searchTerm = query.q ?? '';
        const tags = query.tags?.split(',').filter(Boolean);

        const result = await service.searchGuidance(clinicId, searchTerm, tags);

        if (!result.success) {
          return await reply.status(500).send({
            error: result.error.message,
            code: result.error.code,
            correlationId,
          });
        }

        return await reply.send({
          results: result.data,
          total: result.data.length,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Search guidance error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    });
  };

  return guidanceRoutes;
}

// Export a default factory that requires repository injection
export { createGuidanceRoutes as guidanceRoutes };
