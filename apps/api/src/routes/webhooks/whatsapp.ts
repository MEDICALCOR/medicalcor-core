import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import {
  WhatsAppWebhookSchema,
  type WhatsAppMessage,
  type WhatsAppMetadata,
  type WhatsAppContact,
} from '@medicalcor/types';
import {
  ValidationError,
  WebhookSignatureError,
  toSafeErrorResponse,
  generateCorrelationId,
  IdempotencyKeys,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

/**
 * WhatsApp (360dialog) webhook routes
 * Handles incoming messages and status updates from WhatsApp Business API
 */
export const whatsappWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve(); // Satisfy require-await for Fastify plugin pattern
  /**
   * Verify HMAC signature from 360dialog (timing-safe)
   */
  function verifySignature(payload: string, signature: string | undefined): boolean {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!secret) {
      // SECURITY: Never bypass signature verification
      // In development, log a warning but still reject unsigned requests
      if (process.env.NODE_ENV !== 'production') {
        fastify.log.warn(
          'WHATSAPP_WEBHOOK_SECRET not configured - webhook requests will be rejected. ' +
            'Set this environment variable to accept webhooks.'
        );
      }
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
   * Webhook verification endpoint (GET)
   * Used by Meta/360dialog to verify webhook URL ownership
   */
  fastify.get('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      fastify.log.info('WhatsApp webhook verified');
      return reply.send(challenge);
    }

    fastify.log.warn(
      { mode, tokenMatch: token === verifyToken },
      'WhatsApp webhook verification failed'
    );
    return reply.status(403).send({ error: 'Verification failed' });
  });

  /**
   * Webhook receiver endpoint (POST)
   * Receives incoming messages and status updates
   * Verifies HMAC signature and forwards to Trigger.dev
   */
  fastify.post('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? generateCorrelationId();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;

    try {
      // Verify HMAC signature (timing-safe)
      const rawBody = JSON.stringify(request.body);
      if (!verifySignature(rawBody, signature)) {
        fastify.log.warn({ correlationId }, 'WhatsApp webhook signature verification failed');
        throw new WebhookSignatureError('Invalid WhatsApp webhook signature');
      }

      // Validate payload against schema
      const parseResult = WhatsAppWebhookSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid WhatsApp webhook payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'WhatsApp webhook validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const webhook = parseResult.data;

      // Collect all tasks to trigger
      const messageTasks: {
        message: WhatsAppMessage;
        metadata: WhatsAppMetadata;
        contact?: WhatsAppContact;
      }[] = [];

      const statusTasks: {
        messageId: string;
        status: string;
        recipientId: string;
        timestamp: string;
        errors?: { code: number; title: string }[];
      }[] = [];

      // Process each entry
      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          const { messages, statuses, metadata, contacts } = change.value;

          // Collect incoming messages
          if (messages) {
            for (const message of messages) {
              const contact = contacts?.find((c) => c.wa_id === message.from);
              const taskEntry = { message, metadata, ...(contact && { contact }) };
              messageTasks.push(taskEntry);

              fastify.log.info(
                {
                  correlationId,
                  messageId: message.id,
                  type: message.type,
                  from: '[REDACTED]', // PII protection
                  phoneNumberId: metadata.phone_number_id,
                },
                'WhatsApp message received'
              );
            }
          }

          // Collect status updates
          if (statuses) {
            for (const status of statuses) {
              const mappedErrors = status.errors?.map((e) => ({ code: e.code, title: e.title }));
              statusTasks.push({
                messageId: status.id,
                status: status.status,
                recipientId: status.recipient_id,
                timestamp: status.timestamp,
                ...(mappedErrors && { errors: mappedErrors }),
              });

              fastify.log.info(
                {
                  correlationId,
                  messageId: status.id,
                  status: status.status,
                },
                'WhatsApp status update received'
              );
            }
          }
        }
      }

      // Trigger all message handlers (fire and forget for fast response)
      for (const { message, metadata, contact } of messageTasks) {
        const messagePayload = {
          message: {
            id: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            ...(message.text && { text: message.text }),
          },
          metadata: {
            display_phone_number: metadata.display_phone_number,
            phone_number_id: metadata.phone_number_id,
          },
          correlationId,
          ...(contact && {
            contact: {
              profile: { name: contact.profile.name },
              wa_id: contact.wa_id,
            },
          }),
        };
        tasks
          .trigger('whatsapp-message-handler', messagePayload, {
            idempotencyKey: IdempotencyKeys.whatsAppMessage(message.id),
          })
          .catch((err: unknown) => {
            fastify.log.error(
              { err, messageId: message.id },
              'Failed to trigger WhatsApp message handler'
            );
          });
      }

      // Trigger all status handlers
      for (const status of statusTasks) {
        const statusPayload = {
          messageId: status.messageId,
          status: status.status,
          recipientId: status.recipientId,
          timestamp: status.timestamp,
          correlationId,
          ...(status.errors && { errors: status.errors }),
        };
        tasks
          .trigger('whatsapp-status-handler', statusPayload, {
            idempotencyKey: IdempotencyKeys.whatsAppStatus(status.messageId, status.status),
          })
          .catch((err: unknown) => {
            fastify.log.error(
              { err, messageId: status.messageId },
              'Failed to trigger WhatsApp status handler'
            );
          });
      }

      // Always respond 200 immediately to acknowledge receipt
      // WhatsApp expects quick acknowledgment (<15s)
      return await reply.status(200).send({ status: 'received' });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        return reply.status(401).send(toSafeErrorResponse(error));
      }
      fastify.log.error({ correlationId, error }, 'WhatsApp webhook processing error');
      return reply.status(500).send(toSafeErrorResponse(error));
    }
  });
};
