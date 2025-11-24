import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { StripeWebhookEventSchema } from '@medicalcor/types';
import {
  ValidationError,
  WebhookSignatureError,
  toSafeErrorResponse,
  generateCorrelationId,
  IdempotencyKeys,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';

/**
 * Stripe webhook routes
 * Handles payment events from Stripe
 */

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
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

  // Check timestamp is within tolerance (5 minutes)
  const tolerance = 300;
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > tolerance) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Constant-time comparison (with length check to prevent timing attacks via exceptions)
  try {
    if (v1Signature.length !== expectedSignature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

export const stripeWebhookRoutes: FastifyPluginAsync = (fastify) => {
  // Store raw body for signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, payload, done) => {
    done(null, payload);
  });

  /**
   * Stripe webhook endpoint
   */
  fastify.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : generateCorrelationId();
    const signature = request.headers['stripe-signature'] as string | undefined;
    const rawBody = request.body as string;

    try {
      // Verify signature
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        fastify.log.error('STRIPE_WEBHOOK_SECRET not configured');
        return await reply.status(500).send({ error: 'Webhook not configured' });
      }

      if (!signature) {
        throw new WebhookSignatureError('Missing Stripe signature');
      }

      if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
        throw new WebhookSignatureError('Invalid Stripe signature');
      }

      // Parse and validate payload
      const payload = JSON.parse(rawBody) as unknown;
      const parseResult = StripeWebhookEventSchema.safeParse(payload);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid Stripe webhook payload',
          parseResult.error.flatten()
        );
        fastify.log.warn(
          { correlationId, errors: parseResult.error.issues },
          'Stripe webhook validation failed'
        );
        return await reply.status(400).send(toSafeErrorResponse(error));
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
          const amount = 'amount' in paymentData ? paymentData.amount : 0;
          const currency = 'currency' in paymentData ? paymentData.currency : 'eur';
          const customer = 'customer' in paymentData ? paymentData.customer : null;
          const receiptEmail = 'receipt_email' in paymentData ? paymentData.receipt_email : null;
          const metadata = 'metadata' in paymentData ? paymentData.metadata : undefined;

          fastify.log.info(
            {
              correlationId,
              paymentId: paymentData.id,
              amount,
              customer,
            },
            'Payment succeeded'
          );

          // Forward to Trigger.dev for processing
          const successPayload = {
            paymentId: paymentData.id,
            amount: typeof amount === 'number' ? amount : 0,
            currency: typeof currency === 'string' ? currency : 'eur',
            customerId: typeof customer === 'string' ? customer : null,
            customerEmail: typeof receiptEmail === 'string' ? receiptEmail : null,
            metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
            correlationId,
          };

          tasks.trigger('payment-succeeded-handler', successPayload, {
            idempotencyKey: IdempotencyKeys.paymentSucceeded(paymentData.id),
          }).catch((err: unknown) => {
            fastify.log.error(
              { err, paymentId: paymentData.id, correlationId },
              'Failed to trigger payment succeeded handler'
            );
          });
          break;
        }

        case 'payment_intent.payment_failed':
        case 'charge.failed': {
          const paymentData = event.data.object;
          const amount = 'amount' in paymentData ? paymentData.amount : 0;
          const currency = 'currency' in paymentData ? paymentData.currency : 'eur';
          const customer = 'customer' in paymentData ? paymentData.customer : null;
          const receiptEmail = 'receipt_email' in paymentData ? paymentData.receipt_email : null;
          const lastPaymentError =
            'last_payment_error' in paymentData ? paymentData.last_payment_error : null;
          const failureMessage =
            'failure_message' in paymentData ? paymentData.failure_message : null;
          const metadata = 'metadata' in paymentData ? paymentData.metadata : undefined;

          fastify.log.warn(
            {
              correlationId,
              paymentId: paymentData.id,
              customer,
            },
            'Payment failed'
          );

          // Extract failure details
          let failureCode: string | undefined;
          let failureReason = 'Payment failed';

          if (lastPaymentError && typeof lastPaymentError === 'object') {
            const errorObj = lastPaymentError as Record<string, unknown>;
            failureCode = typeof errorObj.code === 'string' ? errorObj.code : undefined;
            failureReason =
              typeof errorObj.message === 'string' ? errorObj.message : 'Payment failed';
          } else if (typeof failureMessage === 'string') {
            failureReason = failureMessage;
          }

          // Forward to Trigger.dev for processing
          const failedPayload = {
            paymentId: paymentData.id,
            amount: typeof amount === 'number' ? amount : 0,
            currency: typeof currency === 'string' ? currency : 'eur',
            customerId: typeof customer === 'string' ? customer : null,
            customerEmail: typeof receiptEmail === 'string' ? receiptEmail : null,
            failureCode,
            failureReason,
            metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
            correlationId,
          };

          tasks.trigger('payment-failed-handler', failedPayload, {
            idempotencyKey: IdempotencyKeys.paymentFailed(paymentData.id),
          }).catch((err: unknown) => {
            fastify.log.error(
              { err, paymentId: paymentData.id, correlationId },
              'Failed to trigger payment failed handler'
            );
          });
          break;
        }

        case 'checkout.session.completed': {
          const session = event.data.object;
          if ('mode' in session && session.payment_status === 'paid') {
            const amount = 'amount_total' in session ? session.amount_total : 0;
            const currency = 'currency' in session ? session.currency : 'eur';
            const customer = session.customer;
            const customerEmail = 'customer_email' in session ? session.customer_email : null;
            const metadata = 'metadata' in session ? session.metadata : undefined;

            fastify.log.info(
              {
                correlationId,
                sessionId: session.id,
                customer,
                paymentStatus: session.payment_status,
              },
              'Checkout session completed'
            );

            // Forward to Trigger.dev for processing (treat as payment succeeded)
            const checkoutPayload = {
              paymentId: session.id,
              amount: typeof amount === 'number' ? amount : 0,
              currency: typeof currency === 'string' ? currency : 'eur',
              customerId: typeof customer === 'string' ? customer : null,
              customerEmail: typeof customerEmail === 'string' ? customerEmail : null,
              metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
              correlationId,
            };

            tasks.trigger('payment-succeeded-handler', checkoutPayload, {
              idempotencyKey: IdempotencyKeys.paymentSucceeded(session.id),
            }).catch((err: unknown) => {
              fastify.log.error(
                { err, sessionId: session.id, correlationId },
                'Failed to trigger payment handler for checkout session'
              );
            });
          }
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object;
          if ('amount_paid' in invoice) {
            const customer = invoice.customer;
            const customerEmail = 'customer_email' in invoice ? invoice.customer_email : null;
            const metadata = 'metadata' in invoice ? invoice.metadata : undefined;

            fastify.log.info(
              {
                correlationId,
                invoiceId: invoice.id,
                customer,
                amountPaid: invoice.amount_paid,
              },
              'Invoice paid'
            );

            // Forward to Trigger.dev for processing
            const invoicePayload = {
              paymentId: invoice.id,
              amount: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0,
              currency: typeof invoice.currency === 'string' ? invoice.currency : 'eur',
              customerId: typeof customer === 'string' ? customer : null,
              customerEmail: typeof customerEmail === 'string' ? customerEmail : null,
              metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
              correlationId,
            };

            tasks.trigger('payment-succeeded-handler', invoicePayload, {
              idempotencyKey: IdempotencyKeys.paymentSucceeded(invoice.id),
            }).catch((err: unknown) => {
              fastify.log.error(
                { err, invoiceId: invoice.id, correlationId },
                'Failed to trigger payment handler for invoice'
              );
            });
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          if ('amount_refunded' in charge) {
            const customerEmail = 'receipt_email' in charge ? charge.receipt_email : null;
            const metadata = 'metadata' in charge ? charge.metadata : undefined;

            fastify.log.info(
              {
                correlationId,
                chargeId: charge.id,
                amountRefunded: charge.amount_refunded,
              },
              'Charge refunded'
            );

            // Forward to Trigger.dev for processing
            const refundPayload = {
              refundId: `refund_${charge.id}`,
              paymentId: charge.id,
              amount: typeof charge.amount_refunded === 'number' ? charge.amount_refunded : 0,
              currency: typeof charge.currency === 'string' ? charge.currency : 'eur',
              reason:
                'refund' in charge && typeof charge.refund === 'string' ? charge.refund : undefined,
              customerEmail: typeof customerEmail === 'string' ? customerEmail : null,
              metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
              correlationId,
            };

            tasks.trigger('refund-handler', refundPayload, {
              idempotencyKey: IdempotencyKeys.refund(`refund_${charge.id}`),
            }).catch((err: unknown) => {
              fastify.log.error(
                { err, chargeId: charge.id, correlationId },
                'Failed to trigger refund handler'
              );
            });
          }
          break;
        }

        default:
          fastify.log.info({ correlationId, eventType: event.type }, 'Unhandled Stripe event type');
      }

      // Acknowledge receipt
      return await reply.status(200).send({ received: true });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        fastify.log.warn({ correlationId }, 'Stripe webhook signature verification failed');
        return await reply.status(401).send(toSafeErrorResponse(error));
      }

      fastify.log.error({ correlationId, error }, 'Stripe webhook processing error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  return Promise.resolve();
};
