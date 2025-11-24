import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import {
  ValidationError,
  WebhookSignatureError,
  AuthenticationError,
  toSafeErrorResponse,
  generateCorrelationId,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Booking webhook routes
 * Handles WhatsApp interactive button/list selection callbacks for appointment booking
 *
 * SECURITY:
 * - WhatsApp callbacks require signature verification (x-hub-signature-256 header)
 * - Internal/direct booking requires API key (x-api-key header)
 */

// Schema for WhatsApp interactive message callback
const InteractiveCallbackSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().optional(),
  interactiveType: z.enum(['button_reply', 'list_reply']),
  selectedId: z.string().min(1, 'Selected ID is required'),
  selectedTitle: z.string().optional(),
  procedureType: z.string().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
  originalMessageId: z.string().optional(),
});

// Schema for direct slot booking (internal API)
const DirectBookingSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string(),
  slotId: z.string().min(1, 'Slot ID is required'),
  procedureType: z.string().min(1, 'Procedure type is required'),
  patientName: z.string().optional(),
  patientEmail: z.string().email().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
});

// Schema for text-based slot selection
const TextSelectionSchema = z.object({
  phone: z.string().min(1),
  hubspotContactId: z.string().optional(),
  selectedNumber: z.number().int().min(1).max(10),
  availableSlotIds: z.array(z.string()),
  procedureType: z.string(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
});

function getCorrelationId(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  return typeof header === 'string' ? header : generateCorrelationId();
}

/**
 * Verify WhatsApp HMAC signature (timing-safe)
 * @param payload - The raw request body as string
 * @param signature - The signature from x-hub-signature-256 header
 * @returns true if signature is valid
 */
function verifyWhatsAppSignature(payload: string, signature: string | undefined): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  if (!signature) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const providedSignature = signature.replace('sha256=', '');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
  } catch {
    return false;
  }
}

/**
 * Verify API key for internal endpoints (timing-safe)
 * @param apiKey - The API key from x-api-key header
 * @returns true if API key is valid
 */
function verifyApiKey(apiKey: string | undefined): boolean {
  const validKey = process.env.API_SECRET_KEY;
  if (!validKey) {
    return false;
  }

  if (!apiKey) {
    return false;
  }

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey));
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
export const bookingWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Handle WhatsApp interactive callback (button/list selection)
   * POST /webhooks/booking/interactive
   */
  fastify.post(
    '/webhooks/booking/interactive',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = getCorrelationId(request);

      try {
        // Verify WhatsApp signature (HMAC-SHA256)
        const signature = request.headers['x-hub-signature-256'] as string | undefined;
        const rawBody = JSON.stringify(request.body);

        if (!verifyWhatsAppSignature(rawBody, signature)) {
          fastify.log.warn({ correlationId }, 'Invalid WhatsApp signature for booking webhook');
          throw new WebhookSignatureError('Invalid WhatsApp webhook signature');
        }

        const parseResult = InteractiveCallbackSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid interactive callback payload',
            parseResult.error.flatten()
          );
          fastify.log.warn(
            { correlationId, errors: parseResult.error.issues },
            'Booking interactive callback validation failed'
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const {
          phone,
          hubspotContactId,
          interactiveType,
          selectedId,
          selectedTitle,
          procedureType,
          language,
        } = parseResult.data;

        fastify.log.info(
          { correlationId, interactiveType, selectedId, hasHubspotContact: !!hubspotContactId },
          'Booking interactive callback received'
        );

        // Handle slot selection (selectedId format: "slot_<slotId>")
        if (selectedId.startsWith('slot_')) {
          const slotId = selectedId.replace('slot_', '');

          await tasks.trigger('booking-agent-workflow', {
            phone,
            hubspotContactId: hubspotContactId ?? '',
            procedureType: procedureType ?? 'consultation',
            language,
            correlationId,
            selectedSlotId: slotId,
          });

          fastify.log.info(
            { correlationId, slotId },
            'Triggered booking workflow for slot selection'
          );

          return await reply.status(200).send({
            status: 'processing',
            message: 'Booking request is being processed',
            correlationId,
          });
        }

        // Handle booking confirmation buttons
        if (selectedId === 'book_yes') {
          await tasks.trigger('booking-agent-workflow', {
            phone,
            hubspotContactId: hubspotContactId ?? '',
            procedureType: procedureType ?? 'consultation',
            language,
            correlationId,
          });

          fastify.log.info({ correlationId }, 'Triggered booking workflow for booking request');

          return await reply.status(200).send({
            status: 'processing',
            message: 'Fetching available slots',
            correlationId,
          });
        }

        if (selectedId === 'book_later') {
          fastify.log.info({ correlationId }, 'User deferred booking to later');
          return await reply.status(200).send({
            status: 'acknowledged',
            message: 'Booking deferred',
            correlationId,
          });
        }

        // Unknown selection
        fastify.log.warn(
          { correlationId, selectedId, selectedTitle },
          'Unknown interactive selection received'
        );
        return await reply.status(200).send({
          status: 'acknowledged',
          message: 'Selection received',
          correlationId,
        });
      } catch (error) {
        if (error instanceof WebhookSignatureError) {
          return await reply.status(401).send(toSafeErrorResponse(error));
        }
        fastify.log.error(
          { correlationId, error },
          'Booking interactive callback processing error'
        );
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * Direct slot booking endpoint (internal API)
   * POST /webhooks/booking/direct
   */
  fastify.post('/webhooks/booking/direct', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      // Verify API key (internal endpoint)
      const apiKey = request.headers['x-api-key'] as string | undefined;

      if (!verifyApiKey(apiKey)) {
        fastify.log.warn({ correlationId }, 'Invalid API key for direct booking');
        throw new AuthenticationError('Invalid or missing API key');
      }

      const parseResult = DirectBookingSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid direct booking payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Direct booking validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const {
        phone,
        hubspotContactId,
        slotId,
        procedureType,
        patientName,
        patientEmail,
        language,
      } = parseResult.data;

      fastify.log.info({ correlationId, slotId, procedureType }, 'Direct booking request received');

      const handle = await tasks.trigger('booking-agent-workflow', {
        phone,
        hubspotContactId,
        procedureType,
        patientName,
        patientEmail,
        language,
        correlationId,
        selectedSlotId: slotId,
      });

      fastify.log.info(
        { correlationId, slotId, taskId: handle.id },
        'Triggered direct booking workflow'
      );

      return await reply.status(202).send({
        status: 'processing',
        message: 'Booking request submitted',
        taskId: handle.id,
        correlationId,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return await reply.status(401).send(toSafeErrorResponse(error));
      }
      fastify.log.error({ correlationId, error }, 'Direct booking processing error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * Text-based slot selection fallback
   * POST /webhooks/booking/text-selection
   */
  fastify.post(
    '/webhooks/booking/text-selection',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = getCorrelationId(request);

      try {
        // Verify WhatsApp signature (HMAC-SHA256)
        const signature = request.headers['x-hub-signature-256'] as string | undefined;
        const rawBody = JSON.stringify(request.body);

        if (!verifyWhatsAppSignature(rawBody, signature)) {
          fastify.log.warn({ correlationId }, 'Invalid WhatsApp signature for text selection');
          throw new WebhookSignatureError('Invalid WhatsApp webhook signature');
        }

        const parseResult = TextSelectionSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid text selection payload',
            parseResult.error.flatten()
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const {
          phone,
          hubspotContactId,
          selectedNumber,
          availableSlotIds,
          procedureType,
          language,
        } = parseResult.data;

        const slotIndex = selectedNumber - 1;
        const selectedSlotId = availableSlotIds[slotIndex];

        if (!selectedSlotId) {
          fastify.log.warn(
            { correlationId, selectedNumber, availableCount: availableSlotIds.length },
            'Invalid slot number selected'
          );
          return await reply.status(400).send({
            error: 'Invalid selection',
            message: `Please select a number between 1 and ${availableSlotIds.length}`,
          });
        }

        await tasks.trigger('booking-agent-workflow', {
          phone,
          hubspotContactId: hubspotContactId ?? '',
          procedureType,
          language,
          correlationId,
          selectedSlotId,
        });

        fastify.log.info(
          { correlationId, selectedSlotId, selectedNumber },
          'Triggered booking workflow from text selection'
        );

        return await reply.status(200).send({
          status: 'processing',
          message: 'Booking request is being processed',
          correlationId,
        });
      } catch (error) {
        if (error instanceof WebhookSignatureError) {
          return await reply.status(401).send(toSafeErrorResponse(error));
        }
        fastify.log.error({ correlationId, error }, 'Text selection processing error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );
};
