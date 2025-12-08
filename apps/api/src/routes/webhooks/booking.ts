import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ValidationError,
  toSafeErrorResponse,
  generateCorrelationId,
  IdempotencyKeys,
  normalizeRomanianPhone,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Booking webhook routes
 * Handles WhatsApp interactive button/list selection callbacks for appointment booking
 */

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
          phone: rawPhone,
          hubspotContactId,
          interactiveType,
          selectedId,
          selectedTitle,
          procedureType,
          language,
        } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

        fastify.log.info(
          { correlationId, interactiveType, selectedId, hasHubspotContact: !!hubspotContactId },
          'Booking interactive callback received'
        );

        // Handle slot selection (selectedId format: "slot_<slotId>")
        if (selectedId.startsWith('slot_')) {
          const slotId = selectedId.replace('slot_', '');

          // Idempotency: prevents duplicate bookings for the same slot selection
          const idempotencyKey = IdempotencyKeys.bookingAgent(hubspotContactId ?? phone, slotId);

          await tasks.trigger(
            'booking-agent-workflow',
            {
              phone,
              hubspotContactId: hubspotContactId ?? '',
              procedureType: procedureType ?? 'consultation',
              language,
              correlationId,
              selectedSlotId: slotId,
            },
            { idempotencyKey }
          );

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
          // Idempotency for booking initiation (no slot selected yet)
          const initIdempotencyKey = IdempotencyKeys.custom(
            'booking-init',
            hubspotContactId ?? phone,
            correlationId
          );

          await tasks.trigger(
            'booking-agent-workflow',
            {
              phone,
              hubspotContactId: hubspotContactId ?? '',
              procedureType: procedureType ?? 'consultation',
              language,
              correlationId,
            },
            { idempotencyKey: initIdempotencyKey }
          );

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
        phone: rawPhone,
        hubspotContactId,
        slotId,
        procedureType,
        patientName,
        patientEmail,
        language,
      } = parseResult.data;

      // Normalize phone number to E.164 format
      const phone = normalizePhoneInput(rawPhone);

      fastify.log.info({ correlationId, slotId, procedureType }, 'Direct booking request received');

      // Idempotency: prevents duplicate direct bookings for the same slot
      const directIdempotencyKey = IdempotencyKeys.bookingAgent(hubspotContactId, slotId);

      const handle = await tasks.trigger(
        'booking-agent-workflow',
        {
          phone,
          hubspotContactId,
          procedureType,
          patientName,
          patientEmail,
          language,
          correlationId,
          selectedSlotId: slotId,
        },
        { idempotencyKey: directIdempotencyKey }
      );

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
        const parseResult = TextSelectionSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid text selection payload',
            parseResult.error.flatten()
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const {
          phone: rawPhone,
          hubspotContactId,
          selectedNumber,
          availableSlotIds,
          procedureType,
          language,
        } = parseResult.data;

        // Normalize phone number to E.164 format
        const phone = normalizePhoneInput(rawPhone);

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

        // Idempotency: prevents duplicate bookings for the same text selection
        const textIdempotencyKey = IdempotencyKeys.bookingAgent(
          hubspotContactId ?? phone,
          selectedSlotId
        );

        await tasks.trigger(
          'booking-agent-workflow',
          {
            phone,
            hubspotContactId: hubspotContactId ?? '',
            procedureType,
            language,
            correlationId,
            selectedSlotId,
          },
          { idempotencyKey: textIdempotencyKey }
        );

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
        fastify.log.error({ correlationId, error }, 'Text selection processing error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );
};
