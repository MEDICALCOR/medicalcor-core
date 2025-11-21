import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { StripeWebhookEventSchema } from '@medicalcor/types';
import { ValidationError, WebhookSignatureError, toSafeErrorResponse } from '@medicalcor/core';
import crypto from 'crypto';

/**
 * Stripe webhook routes
 * Handles payment events from Stripe
 */

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const v1Signature = parts['v1'];

  if (!timestamp || !v1Signature) {
    return false;
  }

  // Check timestamp is within tolerance (5 minutes)
  const tolerance = 300;
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > tolerance) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(v1Signature),
    Buffer.from(expectedSignature)
  );
}

export const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Store raw body for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, payload, done) => {
      done(null, payload);
    }
  );

  /**
   * Stripe webhook endpoint
   */
  fastify.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] as string | undefined;
    const signature = request.headers['stripe-signature'] as string | undefined;
    const rawBody = request.body as string;

    try {
      // Verify signature
      const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
      if (!webhookSecret) {
        fastify.log.error('STRIPE_WEBHOOK_SECRET not configured');
        return reply.status(500).send({ error: 'Webhook not configured' });
      }

      if (!signature) {
        throw new WebhookSignatureError('Missing Stripe signature');
      }

      if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
        throw new WebhookSignatureError('Invalid Stripe signature');
      }

      // Parse and validate payload
      const payload = JSON.parse(rawBody);
      const parseResult = StripeWebhookEventSchema.safeParse(payload);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid Stripe webhook payload', parseResult.error.flatten());
        fastify.log.warn({ correlationId, errors: parseResult.error.issues }, 'Stripe webhook validation failed');
        return reply.status(400).send(toSafeErrorResponse(error));
      }

      const event = parseResult.data;

      fastify.log.info(
        {
          correlationId,
          eventId: event.id,
          eventType: event.type,
          livemode: event.livemode,
        },
        'Stripe webhook received'
      );

      // Handle different event types
      switch (event.type) {
        case 'payment_intent.succeeded':
        case 'charge.succeeded': {
          const paymentData = event.data.object;
          fastify.log.info(
            {
              correlationId,
              paymentId: paymentData.id,
              amount: 'amount' in paymentData ? paymentData.amount : undefined,
              customer: paymentData.customer,
            },
            'Payment succeeded'
          );
          // TODO: Forward to Trigger.dev for processing
          break;
        }

        case 'payment_intent.payment_failed':
        case 'charge.failed': {
          const paymentData = event.data.object;
          fastify.log.warn(
            {
              correlationId,
              paymentId: paymentData.id,
              customer: paymentData.customer,
            },
            'Payment failed'
          );
          // TODO: Forward to Trigger.dev for processing
          break;
        }

        case 'checkout.session.completed': {
          const session = event.data.object;
          if ('mode' in session) {
            fastify.log.info(
              {
                correlationId,
                sessionId: session.id,
                customer: session.customer,
                paymentStatus: session.payment_status,
              },
              'Checkout session completed'
            );
          }
          // TODO: Forward to Trigger.dev for processing
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object;
          if ('amount_paid' in invoice) {
            fastify.log.info(
              {
                correlationId,
                invoiceId: invoice.id,
                customer: invoice.customer,
                amountPaid: invoice.amount_paid,
              },
              'Invoice paid'
            );
          }
          // TODO: Forward to Trigger.dev for processing
          break;
        }

        default:
          fastify.log.info(
            { correlationId, eventType: event.type },
            'Unhandled Stripe event type'
          );
      }

      // Acknowledge receipt
      return reply.status(200).send({ received: true });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        fastify.log.warn({ correlationId }, 'Stripe webhook signature verification failed');
        return reply.status(401).send(toSafeErrorResponse(error));
      }

      fastify.log.error({ correlationId, error }, 'Stripe webhook processing error');
      return reply.status(500).send(toSafeErrorResponse(error));
    }
  });
};
