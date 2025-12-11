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
import {
  createWebhookTraceContext,
  getTracer,
  createProducerSpan,
  endSpan,
  recordSpanError,
} from '@medicalcor/core/observability/tracing';
import { context, trace } from '@opentelemetry/api';

/**
 * Timestamp validation configuration for replay attack prevention
 * SECURITY FIX: Reduced window from 5 to 3 minutes for tighter security
 * - MAX_TIMESTAMP_AGE_SECONDS: Maximum allowed age of a message timestamp (3 minutes)
 * - MAX_TIMESTAMP_FUTURE_SECONDS: Maximum allowed future timestamp (30 seconds for clock skew)
 */
const MAX_TIMESTAMP_AGE_SECONDS = 180; // 3 minutes - SECURITY FIX: reduced from 5 min
const MAX_TIMESTAMP_FUTURE_SECONDS = 30; // 30 seconds - SECURITY FIX: reduced from 60 sec

/**
 * Validate a WhatsApp message timestamp
 * Prevents replay attacks by rejecting messages with timestamps that are:
 * - Too old (potential replay attack)
 * - Too far in the future (potential clock manipulation or invalid data)
 *
 * @param timestamp - Unix timestamp string from WhatsApp message
 * @returns Object with validation result and details
 */
function validateTimestamp(timestamp: string): {
  isValid: boolean;
  error?: string;
  ageSeconds?: number;
} {
  const timestampNum = parseInt(timestamp, 10);

  if (isNaN(timestampNum) || timestampNum <= 0) {
    return { isValid: false, error: 'Invalid timestamp format' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - timestampNum;

  // Check if timestamp is too old (potential replay attack)
  if (ageSeconds > MAX_TIMESTAMP_AGE_SECONDS) {
    return {
      isValid: false,
      error: `Message timestamp too old (${ageSeconds}s > ${MAX_TIMESTAMP_AGE_SECONDS}s max)`,
      ageSeconds,
    };
  }

  // Check if timestamp is in the future (beyond clock skew tolerance)
  if (ageSeconds < -MAX_TIMESTAMP_FUTURE_SECONDS) {
    return {
      isValid: false,
      error: `Message timestamp too far in future (${-ageSeconds}s > ${MAX_TIMESTAMP_FUTURE_SECONDS}s tolerance)`,
      ageSeconds,
    };
  }

  return { isValid: true, ageSeconds };
}

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
   * SECURITY: Timing-safe token comparison to prevent timing attacks
   */
  function verifyTokenTimingSafe(
    providedToken: string | undefined,
    expectedToken: string | undefined
  ): boolean {
    if (!providedToken || !expectedToken) {
      return false;
    }

    try {
      const providedBuffer = Buffer.from(providedToken);
      const expectedBuffer = Buffer.from(expectedToken);

      if (providedBuffer.length !== expectedBuffer.length) {
        // Perform a dummy comparison to maintain constant time
        crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
        return false;
      }

      return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Webhook verification endpoint (GET)
   * Used by Meta/360dialog to verify webhook URL ownership
   * SECURITY: Uses timing-safe comparison for verify token
   */
  fastify.get('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && verifyTokenTimingSafe(token, verifyToken)) {
      fastify.log.info('WhatsApp webhook verified');
      return reply.send(challenge);
    }

    fastify.log.warn({ mode }, 'WhatsApp webhook verification failed');
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
      // SECURITY FIX: Use raw body for signature verification, NOT re-serialized JSON
      // The signature is computed against the exact bytes received, not a re-serialized version
      // JSON.stringify(request.body) could produce different output due to key ordering/whitespace
      const rawBody = (request as unknown as { rawBody?: string }).rawBody;
      if (!rawBody) {
        fastify.log.error({ correlationId }, 'Raw body not available for signature verification');
        throw new WebhookSignatureError('Raw body not available');
      }
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

          // Collect incoming messages with timestamp validation
          if (messages) {
            for (const message of messages) {
              // Validate message timestamp to prevent replay attacks
              const timestampValidation = validateTimestamp(message.timestamp);
              if (!timestampValidation.isValid) {
                fastify.log.warn(
                  {
                    correlationId,
                    messageId: message.id,
                    timestamp: message.timestamp,
                    error: timestampValidation.error,
                  },
                  'WhatsApp message rejected due to invalid timestamp'
                );
                // Skip this message but continue processing others
                continue;
              }

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
                  timestampAgeSeconds: timestampValidation.ageSeconds,
                },
                'WhatsApp message received'
              );
            }
          }

          // Collect status updates with timestamp validation
          if (statuses) {
            for (const status of statuses) {
              // Validate status timestamp to prevent replay attacks
              const statusTimestampValidation = validateTimestamp(status.timestamp);
              if (!statusTimestampValidation.isValid) {
                fastify.log.warn(
                  {
                    correlationId,
                    messageId: status.id,
                    timestamp: status.timestamp,
                    error: statusTimestampValidation.error,
                  },
                  'WhatsApp status update rejected due to invalid timestamp'
                );
                // Skip this status but continue processing others
                continue;
              }

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
                  timestampAgeSeconds: statusTimestampValidation.ageSeconds,
                },
                'WhatsApp status update received'
              );
            }
          }
        }
      }

      // Get tracer for webhook operations
      const tracer = getTracer('whatsapp-webhook');

      // Trigger all message handlers in parallel using Promise.allSettled
      // Include trace context for distributed tracing
      const messagePromises = messageTasks.map(({ message, metadata, contact }) => {
        // Create a producer span for task triggering
        const producerSpan = createProducerSpan(
          tracer,
          'trigger.dev',
          'whatsapp-message-handler',
          message.id,
          { correlationId }
        );

        // Get trace context to propagate to the task
        const traceContext = createWebhookTraceContext(correlationId);

        // CRITICAL FIX: Forward ALL message types, not just text
        // WhatsApp supports: text, image, audio, video, document, sticker, location, contacts, button, interactive
        const messagePayload = {
          message: {
            id: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            // Forward all possible message content types
            ...(message.text && { text: message.text }),
            ...(message.image && { image: message.image }),
            ...(message.audio && { audio: message.audio }),
            ...(message.video && { video: message.video }),
            ...(message.document && { document: message.document }),
            ...(message.sticker && { sticker: message.sticker }),
            ...(message.location && { location: message.location }),
            ...(message.contacts && { contacts: message.contacts }),
            ...(message.button && { button: message.button }),
            ...(message.interactive && { interactive: message.interactive }),
          },
          metadata: {
            display_phone_number: metadata.display_phone_number,
            phone_number_id: metadata.phone_number_id,
          },
          correlationId,
          // Include trace context for distributed tracing
          ...traceContext,
          ...(contact && {
            contact: {
              profile: { name: contact.profile.name },
              wa_id: contact.wa_id,
            },
          }),
        };

        return context.with(trace.setSpan(context.active(), producerSpan), async () => {
          try {
            const result = await tasks.trigger('whatsapp-message-handler', messagePayload, {
              idempotencyKey: IdempotencyKeys.whatsAppMessage(message.id),
            });
            producerSpan.setAttribute('trigger.task.handle_id', result.id);
            endSpan(producerSpan, 'ok');
            return result;
          } catch (err: unknown) {
            recordSpanError(producerSpan, err);
            fastify.log.error(
              { err, messageId: message.id },
              'Failed to trigger WhatsApp message handler'
            );
            throw err; // Re-throw so Promise.allSettled captures it
          }
        });
      });

      // Trigger all status handlers in parallel using Promise.allSettled
      // Include trace context for distributed tracing
      const statusPromises = statusTasks.map((status) => {
        // Create a producer span for task triggering
        const producerSpan = createProducerSpan(
          tracer,
          'trigger.dev',
          'whatsapp-status-handler',
          status.messageId,
          { correlationId }
        );

        // Get trace context to propagate to the task
        const traceContext = createWebhookTraceContext(correlationId);

        const statusPayload = {
          messageId: status.messageId,
          status: status.status,
          recipientId: status.recipientId,
          timestamp: status.timestamp,
          correlationId,
          // Include trace context for distributed tracing
          ...traceContext,
          ...(status.errors && { errors: status.errors }),
        };

        return context.with(trace.setSpan(context.active(), producerSpan), async () => {
          try {
            const result = await tasks.trigger('whatsapp-status-handler', statusPayload, {
              idempotencyKey: IdempotencyKeys.whatsAppStatus(status.messageId, status.status),
            });
            producerSpan.setAttribute('trigger.task.handle_id', result.id);
            endSpan(producerSpan, 'ok');
            return result;
          } catch (err: unknown) {
            recordSpanError(producerSpan, err);
            fastify.log.error(
              { err, messageId: status.messageId },
              'Failed to trigger WhatsApp status handler'
            );
            throw err; // Re-throw so Promise.allSettled captures it
          }
        });
      });

      // Execute all triggers in parallel (don't await - fire and forget for fast response)
      void Promise.allSettled([...messagePromises, ...statusPromises]);

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
