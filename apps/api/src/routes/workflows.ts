import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ValidationError,
  toSafeErrorResponse,
  generateCorrelationId,
  IdempotencyKeys,
  hashMessageContent,
  normalizeRomanianPhone,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Normalize and validate phone number to E.164 format
 * @param phone - Input phone number in various formats
 * @returns Normalized E.164 phone number
 * @throws ValidationError if phone cannot be normalized
 */
function normalizePhoneInput(phone: string): string {
  const result = normalizeRomanianPhone(phone);
  if (!result.isValid) {
    throw new ValidationError('Invalid phone number format', {
      fieldErrors: { phone: ['Phone number must be a valid Romanian number'] },
      formErrors: [],
    });
  }
  return result.normalized;
}

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

// OpenAPI response schemas
const WorkflowTriggerResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['triggered'] },
    taskId: { type: 'string', description: 'Trigger.dev task ID' },
    correlationId: { type: 'string', description: 'Request correlation ID' },
    message: { type: 'string', description: 'Human-readable status message' },
  },
  required: ['status', 'taskId', 'correlationId', 'message'],
} as const;

const ErrorResponseSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'Error code' },
    message: { type: 'string', description: 'Error message' },
    details: { type: 'object', description: 'Additional error details' },
  },
  required: ['code', 'message'],
} as const;

 
export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Trigger lead scoring workflow manually
   *
   * POST /workflows/lead-score
   */
  fastify.post(
    '/workflows/lead-score',
    {
      schema: {
        description:
          'Trigger lead scoring workflow to evaluate a lead based on their message and history',
        tags: ['Workflows'],
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['phone', 'message'],
          properties: {
            phone: {
              type: 'string',
              description: 'Phone number (will be normalized to E.164)',
            },
            hubspotContactId: {
              type: 'string',
              description: 'Optional HubSpot contact ID',
            },
            message: {
              type: 'string',
              description: 'Message content to score',
            },
            channel: {
              type: 'string',
              enum: ['whatsapp', 'voice', 'web'],
              default: 'whatsapp',
              description: 'Communication channel',
            },
            messageHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
              description: 'Optional conversation history for context',
            },
          },
        },
        response: {
          202: WorkflowTriggerResponseSchema,
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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

        const {
          phone: rawPhone,
          hubspotContactId,
          message,
          channel,
          messageHistory,
        } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

        fastify.log.info(
          {
            correlationId,
            channel,
            hasHubspotContact: !!hubspotContactId,
            hasHistory: !!messageHistory?.length,
          },
          'Manual lead scoring triggered'
        );

        // Generate idempotency key based on phone, channel, and message content
        // This prevents duplicate scoring for the same message
        const messageHash = hashMessageContent(message);
        const idempotencyKey = IdempotencyKeys.leadScoring(phone, channel, messageHash);

        const handle = await tasks.trigger(
          'lead-scoring-workflow',
          {
            phone,
            hubspotContactId,
            message,
            channel,
            messageHistory,
            correlationId,
          },
          { idempotencyKey }
        );

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
    }
  );

  /**
   * Trigger patient journey workflow manually
   *
   * POST /workflows/patient-journey
   */
  fastify.post(
    '/workflows/patient-journey',
    {
      schema: {
        description: 'Initiate patient journey workflow for automated follow-up and nurturing',
        tags: ['Workflows'],
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['phone', 'hubspotContactId'],
          properties: {
            phone: {
              type: 'string',
              description: 'Phone number (will be normalized to E.164)',
            },
            hubspotContactId: {
              type: 'string',
              description: 'HubSpot contact ID',
            },
            channel: {
              type: 'string',
              enum: ['whatsapp', 'voice', 'web'],
              default: 'whatsapp',
            },
            initialScore: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              default: 3,
              description: 'Initial lead score (1-5)',
            },
            classification: {
              type: 'string',
              enum: ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'],
              default: 'WARM',
              description: 'Lead classification',
            },
            procedureInterest: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of procedures the patient is interested in',
            },
          },
        },
        response: {
          202: WorkflowTriggerResponseSchema,
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
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
          phone: rawPhone,
          hubspotContactId,
          channel,
          initialScore,
          classification,
          procedureInterest,
        } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

        fastify.log.info(
          {
            correlationId,
            channel,
            classification,
            initialScore,
          },
          'Manual patient journey triggered'
        );

        // Idempotency based on contact and current stage
        // Prevents duplicate journey starts for the same patient
        const idempotencyKey = IdempotencyKeys.patientJourney(hubspotContactId, classification);

        const handle = await tasks.trigger(
          'patient-journey-workflow',
          {
            phone,
            hubspotContactId,
            channel,
            initialScore,
            classification,
            procedureInterest,
            correlationId,
          },
          { idempotencyKey }
        );

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
    {
      schema: {
        description: 'Start an automated nurture sequence for a contact',
        tags: ['Workflows'],
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['phone', 'hubspotContactId', 'sequenceType'],
          properties: {
            phone: {
              type: 'string',
              description: 'Phone number (will be normalized to E.164)',
            },
            hubspotContactId: {
              type: 'string',
              description: 'HubSpot contact ID',
            },
            sequenceType: {
              type: 'string',
              enum: ['warm_lead', 'cold_lead', 'post_consultation', 'recall'],
              description: 'Type of nurture sequence to run',
            },
          },
        },
        response: {
          202: WorkflowTriggerResponseSchema,
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
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

        const { phone: rawPhone, hubspotContactId, sequenceType } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

        fastify.log.info(
          {
            correlationId,
            sequenceType,
          },
          'Manual nurture sequence triggered'
        );

        // Idempotency based on contact and sequence type
        // Prevents duplicate nurture sequences for the same contact
        const idempotencyKey = IdempotencyKeys.nurtureSequence(hubspotContactId, sequenceType);

        const handle = await tasks.trigger(
          'nurture-sequence-workflow',
          {
            phone,
            hubspotContactId,
            sequenceType,
            correlationId,
          },
          { idempotencyKey }
        );

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
  fastify.post(
    '/workflows/booking-agent',
    {
      schema: {
        description: 'Initiate AI-powered booking agent to schedule an appointment',
        tags: ['Workflows'],
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: 'object',
          required: ['phone', 'hubspotContactId', 'procedureType'],
          properties: {
            phone: {
              type: 'string',
              description: 'Phone number (will be normalized to E.164)',
            },
            hubspotContactId: {
              type: 'string',
              description: 'HubSpot contact ID',
            },
            procedureType: {
              type: 'string',
              description: 'Type of dental procedure',
            },
            preferredDates: {
              type: 'array',
              items: { type: 'string' },
              description: 'ISO date strings for preferred appointment dates',
            },
            patientName: {
              type: 'string',
              description: 'Patient full name',
            },
            patientEmail: {
              type: 'string',
              format: 'email',
              description: 'Patient email address',
            },
            language: {
              type: 'string',
              enum: ['ro', 'en', 'de'],
              default: 'ro',
              description: 'Preferred language for communication',
            },
            selectedSlotId: {
              type: 'string',
              description: 'Pre-selected appointment slot ID',
            },
          },
        },
        response: {
          202: WorkflowTriggerResponseSchema,
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
          phone: rawPhone,
          hubspotContactId,
          procedureType,
          preferredDates,
          patientName,
          patientEmail,
          language,
          selectedSlotId,
        } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

        fastify.log.info(
          {
            correlationId,
            procedureType,
            language,
            hasPreselectedSlot: !!selectedSlotId,
          },
          'Manual booking agent triggered'
        );

        // Idempotency based on contact and slot (if selected) or correlationId
        // Prevents duplicate booking attempts for the same slot
        const bookingIdempotencyKey = selectedSlotId
          ? IdempotencyKeys.bookingAgent(hubspotContactId, selectedSlotId)
          : IdempotencyKeys.custom('booking-start', hubspotContactId, correlationId);

        const handle = await tasks.trigger(
          'booking-agent-workflow',
          {
            phone,
            hubspotContactId,
            procedureType,
            preferredDates,
            patientName,
            patientEmail,
            language,
            correlationId,
            selectedSlotId,
          },
          { idempotencyKey: bookingIdempotencyKey }
        );

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
    }
  );

  /**
   * Get workflow status by task ID
   *
   * GET /workflows/status/:taskId
   */
  fastify.get(
    '/workflows/status/:taskId',
    {
      schema: {
        description: 'Get the current status of a triggered workflow by task ID',
        tags: ['Workflows'],
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: {
              type: 'string',
              description: 'Trigger.dev task ID returned from workflow trigger',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'running', 'completed', 'failed', 'unknown'],
              },
              message: { type: 'string' },
              correlationId: { type: 'string' },
            },
          },
          500: ErrorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    }
  );
};
