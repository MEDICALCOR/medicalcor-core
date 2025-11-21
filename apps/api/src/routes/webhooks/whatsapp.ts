import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { WhatsAppWebhookSchema } from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse } from '@medicalcor/core';

/**
 * WhatsApp (360dialog) webhook routes
 * Handles incoming messages and status updates from WhatsApp Business API
 */
export const whatsappWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Webhook verification endpoint (GET)
   * Used by Meta/360dialog to verify webhook URL ownership
   */
  fastify.get('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = process.env['WHATSAPP_VERIFY_TOKEN'];

    if (mode === 'subscribe' && token === verifyToken) {
      fastify.log.info('WhatsApp webhook verified');
      return reply.send(challenge);
    }

    fastify.log.warn({ mode, tokenMatch: token === verifyToken }, 'WhatsApp webhook verification failed');
    return reply.status(403).send({ error: 'Verification failed' });
  });

  /**
   * Webhook receiver endpoint (POST)
   * Receives incoming messages and status updates
   */
  fastify.post('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] as string | undefined;

    try {
      // Validate payload against schema
      const parseResult = WhatsAppWebhookSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid WhatsApp webhook payload', parseResult.error.flatten());
        fastify.log.warn({ correlationId, errors: parseResult.error.issues }, 'WhatsApp webhook validation failed');
        return reply.status(400).send(toSafeErrorResponse(error));
      }

      const webhook = parseResult.data;

      // Process each entry
      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          const { messages, statuses, metadata } = change.value;

          // Handle incoming messages
          if (messages) {
            for (const message of messages) {
              fastify.log.info(
                {
                  correlationId,
                  messageId: message.id,
                  type: message.type,
                  phoneNumberId: metadata.phone_number_id,
                },
                'WhatsApp message received'
              );

              // TODO: Forward to Trigger.dev for processing
              // This will be implemented in the trigger app
            }
          }

          // Handle status updates
          if (statuses) {
            for (const status of statuses) {
              fastify.log.info(
                {
                  correlationId,
                  messageId: status.id,
                  status: status.status,
                },
                'WhatsApp status update received'
              );

              // TODO: Forward status updates to Trigger.dev
            }
          }
        }
      }

      // Always respond 200 to acknowledge receipt
      // WhatsApp expects quick acknowledgment
      return reply.status(200).send({ status: 'received' });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'WhatsApp webhook processing error');
      return reply.status(500).send(toSafeErrorResponse(error));
    }
  });
};
