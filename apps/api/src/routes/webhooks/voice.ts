import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { VoiceWebhookSchema, CallStatusCallbackSchema } from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse, generateCorrelationId } from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Verify Twilio webhook signature
 * Uses HMAC-SHA1 as per Twilio's specification
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
function verifyTwilioSignature(request: FastifyRequest, authToken: string): boolean {
  const signature = request.headers['x-twilio-signature'];

  if (!signature || typeof signature !== 'string') {
    return false;
  }

  // Get the full URL that Twilio called
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
  if (!webhookUrl) {
    // Fall back to constructing URL from request (less secure)
    return false;
  }

  // Build the data string: URL + sorted POST parameters
  const body = request.body as Record<string, string>;
  const sortedKeys = Object.keys(body).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) {
    data += key + (body[key] ?? '');
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(data, 'utf-8')
    .digest('base64');

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    // Buffers have different lengths - signature is invalid
    return false;
  }
}

/**
 * Voice/Twilio webhook routes
 * Handles incoming calls and call status updates
 * SECURITY: All endpoints verify Twilio signature before processing
 */
export const voiceWebhookRoutes: FastifyPluginAsync = (fastify) => {
  /**
   * Incoming voice call webhook
   * Called by Twilio when a call comes in
   * SECURITY: Requires valid Twilio signature
   */
  fastify.post('/webhooks/voice', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();

    try {
      // SECURITY: Verify Twilio signature - REQUIRED in ALL environments
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!authToken) {
        fastify.log.error({ correlationId }, 'TWILIO_AUTH_TOKEN not configured - rejecting request');
        return await reply.status(500).send({ error: 'Server configuration error' });
      }

      if (!verifyTwilioSignature(request, authToken)) {
        fastify.log.warn({ correlationId }, 'Invalid Twilio signature on voice webhook');
        return await reply.status(403).send({ error: 'Invalid signature' });
      }

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

      // Return TwiML response with Vapi.ai streaming handoff
      const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;

      if (!vapiAssistantId) {
        fastify.log.error({ correlationId }, 'CRITICAL: VAPI_ASSISTANT_ID not configured');
        // Fallback to polite error message
        const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We apologize, but our voice assistant is temporarily unavailable. Please try again later or contact us through our website.</Say>
</Response>`;
        return await reply.header('Content-Type', 'application/xml').send(fallbackTwiml);
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://api.vapi.ai/pull">
            <Parameter name="assistantId" value="${vapiAssistantId}" />
            <Parameter name="customerPhoneNumber" value="${webhook.From}" />
            <Parameter name="callSid" value="${webhook.CallSid}" />
        </Stream>
    </Connect>
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
   * SECURITY: Requires valid Twilio signature
   */
  fastify.post('/webhooks/voice/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();

    try {
      // SECURITY: Verify Twilio signature - REQUIRED in ALL environments
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!authToken) {
        fastify.log.error({ correlationId }, 'TWILIO_AUTH_TOKEN not configured - rejecting request');
        return await reply.status(500).send({ error: 'Server configuration error' });
      }

      if (!verifyTwilioSignature(request, authToken)) {
        fastify.log.warn({ correlationId }, 'Invalid Twilio signature on status webhook');
        return await reply.status(403).send({ error: 'Invalid signature' });
      }

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
