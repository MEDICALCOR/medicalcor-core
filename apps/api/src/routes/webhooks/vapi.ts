import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ValidationError,
  WebhookSignatureError,
  toSafeErrorResponse,
  generateCorrelationId,
  IdempotencyKeys,
  maskPhone,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';

/**
 * Vapi webhook routes
 * Handles voice call events from Vapi
 *
 * Security: HMAC-SHA256 signature verification using X-Vapi-Signature header
 */

/**
 * Verify Vapi webhook signature using HMAC-SHA256
 *
 * Vapi sends a signature in the format: t=timestamp,v1=signature
 * Similar to Stripe's signature format
 */
function verifyVapiSignature(payload: string, signature: string, secret: string): boolean {
  // Parse signature header: t=timestamp,v1=signature
  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  const timestamp = parts.t;
  const v1Signature = parts.v1;

  if (!timestamp || !v1Signature) {
    return false;
  }

  // Check timestamp is within tolerance (5 minutes) to prevent replay attacks
  const tolerance = 300; // 5 minutes
  const parsedTimestamp = parseInt(timestamp, 10);
  // Reject if timestamp is invalid (NaN)
  if (Number.isNaN(parsedTimestamp)) {
    return false;
  }
  const timestampAge = Math.floor(Date.now() / 1000) - parsedTimestamp;
  if (timestampAge > tolerance || timestampAge < -tolerance) {
    return false;
  }

  // Compute expected signature: HMAC-SHA256(secret, timestamp.payload)
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    if (v1Signature.length !== expectedSignature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

// Schema for Vapi webhook events
const VapiCallSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  assistantId: z.string().optional(),
  status: z.enum(['queued', 'ringing', 'in-progress', 'forwarding', 'ended']),
  type: z.enum(['inbound', 'outbound']),
  phoneNumber: z.object({
    id: z.string(),
    number: z.string(),
  }).optional(),
  customer: z.object({
    number: z.string(),
    name: z.string().optional(),
  }).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  endedReason: z.string().optional(),
  cost: z.number().optional(),
});

const VapiTranscriptMessageSchema = z.object({
  role: z.enum(['assistant', 'user', 'system', 'function_call']),
  message: z.string(),
  timestamp: z.number(),
  duration: z.number().optional(),
  name: z.string().optional(),
  arguments: z.string().optional(),
});

const VapiWebhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('call.started'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('call.ended'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('transcript.updated'),
    transcript: z.object({
      callId: z.string(),
      messages: z.array(VapiTranscriptMessageSchema),
      duration: z.number(),
      startedAt: z.string(),
      endedAt: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('function.call'),
    call: VapiCallSchema,
    functionCall: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()),
    }),
  }),
]);

export const vapiWebhookRoutes: FastifyPluginAsync = (fastify) => {
  // Store raw body for signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, payload, done) => {
    done(null, payload);
  });

  /**
   * Vapi webhook endpoint
   * POST /webhooks/vapi
   */
  fastify.post('/webhooks/vapi', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();
    const signature = request.headers['x-vapi-signature'] as string | undefined;
    const rawBody = request.body as string;

    try {
      // Verify webhook secret is configured
      const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
      if (!webhookSecret) {
        fastify.log.error('VAPI_WEBHOOK_SECRET not configured');
        return await reply.status(500).send({ error: 'Webhook not configured' });
      }

      // Verify signature
      if (!signature) {
        throw new WebhookSignatureError('Missing Vapi signature');
      }

      if (!verifyVapiSignature(rawBody, signature, webhookSecret)) {
        throw new WebhookSignatureError('Invalid Vapi signature');
      }

      // Parse and validate payload
      const payload = JSON.parse(rawBody) as unknown;
      const parseResult = VapiWebhookEventSchema.safeParse(payload);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid Vapi webhook payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Vapi webhook validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const event = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          eventType: event.type,
          ...(event.type !== 'transcript.updated' && { callId: event.call.id }),
        },
        'Vapi webhook received'
      );

      // Handle different event types
      switch (event.type) {
        case 'call.started': {
          fastify.log.info(
            {
              correlationId,
              callId: event.call.id,
              callType: event.call.type,
              // SECURITY FIX: Mask phone number for HIPAA/GDPR compliance
              customerPhone: maskPhone(event.call.customer?.number),
            },
            'Vapi call started'
          );
          // Acknowledge - processing happens on call.ended
          break;
        }

        case 'call.ended': {
          const call = event.call;

          fastify.log.info(
            {
              correlationId,
              callId: call.id,
              status: call.status,
              endedReason: call.endedReason,
              // SECURITY FIX: Mask phone number for HIPAA/GDPR compliance
              customerPhone: maskPhone(call.customer?.number),
            },
            'Vapi call ended'
          );

          // Only process if we have customer phone
          if (call.customer?.number) {
            // Calculate duration if we have start/end times
            let duration: number | undefined;
            if (call.startedAt && call.endedAt) {
              duration = Math.round(
                (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
              );
            }

            // Trigger Vapi webhook handler task
            const webhookPayload = {
              type: 'call.ended' as const,
              call: {
                id: call.id,
                status: call.status,
                type: call.type,
                customer: call.customer,
                endedReason: call.endedReason,
                cost: call.cost,
                startedAt: call.startedAt,
                endedAt: call.endedAt,
              },
              correlationId,
            };

            tasks.trigger('vapi-webhook-handler', webhookPayload, {
              idempotencyKey: IdempotencyKeys.vapiWebhook(call.id),
            }).catch((err: unknown) => {
              fastify.log.error(
                { err, callId: call.id, correlationId },
                'Failed to trigger Vapi webhook handler'
              );
            });

            fastify.log.info(
              {
                callId: call.id,
                duration,
                correlationId,
              },
              'Vapi post-call processing triggered'
            );
          } else {
            fastify.log.warn(
              { callId: call.id, correlationId },
              'Vapi call ended without customer phone'
            );
          }
          break;
        }

        case 'transcript.updated': {
          fastify.log.info(
            {
              correlationId,
              callId: event.transcript.callId,
              messageCount: event.transcript.messages.length,
            },
            'Vapi transcript updated'
          );
          // Transcript updates are informational - full processing on call.ended
          break;
        }

        case 'function.call': {
          fastify.log.info(
            {
              correlationId,
              callId: event.call.id,
              functionName: event.functionCall.name,
            },
            'Vapi function call received'
          );
          // Function calls can be used for real-time integrations
          // For now, just acknowledge
          break;
        }

        default:
          fastify.log.info(
            { correlationId, eventType: (event as { type: string }).type },
            'Unhandled Vapi event type'
          );
      }

      // Acknowledge receipt
      return await reply.status(200).send({ received: true });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        fastify.log.warn({ correlationId }, 'Vapi webhook signature verification failed');
        return await reply.status(401).send(toSafeErrorResponse(error));
      }

      fastify.log.error({ correlationId, error }, 'Vapi webhook processing error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  return Promise.resolve();
};
