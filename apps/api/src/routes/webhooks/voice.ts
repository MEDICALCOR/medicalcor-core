import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceWebhookSchema, CallStatusCallbackSchema } from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse, generateCorrelationId } from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Voice/Twilio webhook routes
 * Handles incoming calls and call status updates
 */
export const voiceWebhookRoutes: FastifyPluginAsync = (fastify) => {
  /**
   * Incoming voice call webhook
   * Called by Twilio when a call comes in
   */
  fastify.post('/webhooks/voice', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();

    try {
      // Twilio sends form-urlencoded data
      const parseResult = VoiceWebhookSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid voice webhook payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Voice webhook validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
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

      // Forward to Trigger.dev for processing (fire and forget for fast TwiML response)
      const taskPayload = {
        callSid: webhook.CallSid,
        from: webhook.From,
        to: webhook.To,
        direction: webhook.Direction,
        status: webhook.CallStatus,
        correlationId,
      };

      tasks.trigger('voice-call-handler', taskPayload).catch((err: unknown) => {
        fastify.log.error(
          { err, callSid: webhook.CallSid, correlationId },
          'Failed to trigger voice call handler'
        );
      });

      // Return TwiML response immediately (Twilio requires quick response)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Please hold while we connect you.</Say>
  <Pause length="2"/>
</Response>`;

      return await reply.header('Content-Type', 'application/xml').send(twiml);
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Voice webhook processing error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * Call status callback webhook
   * Called by Twilio when call status changes
   */
  fastify.post('/webhooks/voice/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();

    try {
      const parseResult = CallStatusCallbackSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid call status payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Call status validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
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

      // Forward to Trigger.dev for processing (fire and forget)
      const taskPayload = {
        callSid: callback.CallSid,
        from: callback.From,
        to: callback.To,
        direction: callback.Direction,
        status: callback.CallStatus,
        duration: callback.CallDuration,
        correlationId,
      };

      tasks.trigger('voice-call-handler', taskPayload).catch((err: unknown) => {
        fastify.log.error(
          { err, callSid: callback.CallSid, correlationId },
          'Failed to trigger voice call handler'
        );
      });

      return await reply.status(200).send({ status: 'received' });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Call status webhook processing error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  return Promise.resolve();
};
