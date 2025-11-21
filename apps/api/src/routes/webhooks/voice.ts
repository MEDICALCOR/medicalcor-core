import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceWebhookSchema, CallStatusCallbackSchema } from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse } from '@medicalcor/core';

/**
 * Voice/Twilio webhook routes
 * Handles incoming calls and call status updates
 */
export const voiceWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Incoming voice call webhook
   * Called by Twilio when a call comes in
   */
  fastify.post('/webhooks/voice', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] as string | undefined;

    try {
      // Twilio sends form-urlencoded data
      const parseResult = VoiceWebhookSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid voice webhook payload', parseResult.error.flatten());
        fastify.log.warn({ correlationId, errors: parseResult.error.issues }, 'Voice webhook validation failed');
        return reply.status(400).send(toSafeErrorResponse(error));
      }

      const webhook = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          callSid: webhook.CallSid,
          status: webhook.CallStatus,
          direction: webhook.Direction,
        },
        'Voice call received'
      );

      // TODO: Forward to Trigger.dev for processing
      // Return TwiML response for now
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Please hold while we connect you.</Say>
  <Pause length="2"/>
</Response>`;

      return reply
        .header('Content-Type', 'application/xml')
        .send(twiml);
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Voice webhook processing error');
      return reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * Call status callback webhook
   * Called by Twilio when call status changes
   */
  fastify.post('/webhooks/voice/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] as string | undefined;

    try {
      const parseResult = CallStatusCallbackSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid call status payload', parseResult.error.flatten());
        fastify.log.warn({ correlationId, errors: parseResult.error.issues }, 'Call status validation failed');
        return reply.status(400).send(toSafeErrorResponse(error));
      }

      const callback = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          callSid: callback.CallSid,
          status: callback.CallStatus,
          duration: callback.CallDuration,
        },
        'Call status update received'
      );

      // TODO: Forward to Trigger.dev for processing

      return reply.status(200).send({ status: 'received' });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Call status webhook processing error');
      return reply.status(500).send(toSafeErrorResponse(error));
    }
  });
};
