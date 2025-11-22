import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ValidationError, toSafeErrorResponse, generateCorrelationId } from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

function getCorrelationId(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  return typeof header === 'string' ? header : generateCorrelationId();
}

/**
 * Manual workflow trigger endpoints
 * Allows admin/support staff to manually trigger workflows
 */

// Schema for lead scoring trigger
const LeadScorePayloadSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  channel: z.enum(['whatsapp', 'voice', 'web']).default('whatsapp'),
  messageHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string(),
      })
    )
    .optional(),
});

// Schema for patient journey trigger
const PatientJourneyPayloadSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().min(1, 'HubSpot contact ID is required'),
  channel: z.enum(['whatsapp', 'voice', 'web']).default('whatsapp'),
  initialScore: z.number().int().min(1).max(5).default(3),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).default('WARM'),
  procedureInterest: z.array(z.string()).optional(),
});

// Schema for nurture sequence trigger
const NurtureSequencePayloadSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().min(1, 'HubSpot contact ID is required'),
  sequenceType: z.enum(['warm_lead', 'cold_lead', 'post_consultation', 'recall']),
});

// Schema for booking agent trigger
const BookingAgentPayloadSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().min(1, 'HubSpot contact ID is required'),
  procedureType: z.string().min(1, 'Procedure type is required'),
  preferredDates: z.array(z.string()).optional(),
  patientName: z.string().optional(),
  patientEmail: z.string().email().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
  selectedSlotId: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Trigger lead scoring workflow manually
   *
   * POST /workflows/lead-score
   */
  fastify.post('/workflows/lead-score', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = LeadScorePayloadSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid lead score payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Lead score validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const { phone, hubspotContactId, message, channel, messageHistory } = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          channel,
          hasHubspotContact: !!hubspotContactId,
          hasHistory: !!messageHistory?.length,
        },
        'Manual lead scoring triggered'
      );

      const handle = await tasks.trigger('lead-scoring-workflow', {
        phone,
        hubspotContactId,
        message,
        channel,
        messageHistory,
        correlationId,
      });

      return await reply.status(202).send({
        status: 'triggered',
        taskId: handle.id,
        correlationId,
        message: 'Lead scoring workflow has been triggered',
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Failed to trigger lead scoring workflow');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * Trigger patient journey workflow manually
   *
   * POST /workflows/patient-journey
   */
  fastify.post(
    '/workflows/patient-journey',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = getCorrelationId(request);

      try {
        const parseResult = PatientJourneyPayloadSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid patient journey payload',
            parseResult.error.flatten()
          );
          fastify.log.warn(
            { correlationId, errors: parseResult.error.issues },
            'Patient journey validation failed'
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const {
          phone,
          hubspotContactId,
          channel,
          initialScore,
          classification,
          procedureInterest,
        } = parseResult.data;

        fastify.log.info(
          {
            correlationId,
            channel,
            classification,
            initialScore,
          },
          'Manual patient journey triggered'
        );

        const handle = await tasks.trigger('patient-journey-workflow', {
          phone,
          hubspotContactId,
          channel,
          initialScore,
          classification,
          procedureInterest,
          correlationId,
        });

        return await reply.status(202).send({
          status: 'triggered',
          taskId: handle.id,
          correlationId,
          message: 'Patient journey workflow has been triggered',
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Failed to trigger patient journey workflow');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * Trigger nurture sequence workflow manually
   *
   * POST /workflows/nurture-sequence
   */
  fastify.post(
    '/workflows/nurture-sequence',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = getCorrelationId(request);

      try {
        const parseResult = NurtureSequencePayloadSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid nurture sequence payload',
            parseResult.error.flatten()
          );
          fastify.log.warn(
            { correlationId, errors: parseResult.error.issues },
            'Nurture sequence validation failed'
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const { phone, hubspotContactId, sequenceType } = parseResult.data;

        fastify.log.info(
          {
            correlationId,
            sequenceType,
          },
          'Manual nurture sequence triggered'
        );

        const handle = await tasks.trigger('nurture-sequence-workflow', {
          phone,
          hubspotContactId,
          sequenceType,
          correlationId,
        });

        return await reply.status(202).send({
          status: 'triggered',
          taskId: handle.id,
          correlationId,
          message: `Nurture sequence (${sequenceType}) has been triggered`,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Failed to trigger nurture sequence workflow');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * Trigger booking agent workflow manually
   *
   * POST /workflows/booking-agent
   */
  fastify.post('/workflows/booking-agent', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = BookingAgentPayloadSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid booking agent payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Booking agent validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const {
        phone,
        hubspotContactId,
        procedureType,
        preferredDates,
        patientName,
        patientEmail,
        language,
        selectedSlotId,
      } = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          procedureType,
          language,
          hasPreselectedSlot: !!selectedSlotId,
        },
        'Manual booking agent triggered'
      );

      const handle = await tasks.trigger('booking-agent-workflow', {
        phone,
        hubspotContactId,
        procedureType,
        preferredDates,
        patientName,
        patientEmail,
        language,
        correlationId,
        selectedSlotId,
      });

      return await reply.status(202).send({
        status: 'triggered',
        taskId: handle.id,
        correlationId,
        message: 'Booking agent workflow has been triggered',
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Failed to trigger booking agent workflow');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * Get workflow status by task ID
   *
   * GET /workflows/status/:taskId
   */
  fastify.get('/workflows/status/:taskId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const correlationId = getCorrelationId(request);

    try {
      // Note: This requires Trigger.dev runs API access
      // For now, return a placeholder response
      fastify.log.info({ correlationId, taskId }, 'Workflow status requested');

      return await reply.status(200).send({
        taskId,
        status: 'unknown',
        message: 'Use Trigger.dev dashboard to check task status',
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Failed to get workflow status');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });
};
