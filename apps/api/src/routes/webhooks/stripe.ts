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
 *
 * IMPORTANT: Stripe sends BOTH payment_intent.succeeded AND charge.succeeded
 * events for the same payment. We use the payment_intent ID as the canonical
 * identifier to prevent double-processing.
 */

/**
 * Extract the canonical payment ID from a Stripe event object.
 * For charges, this extracts the payment_intent ID to prevent double-processing
 * when Stripe sends both payment_intent.succeeded and charge.succeeded events.
 *
 * @param eventType - The Stripe event type
 * @param paymentData - The event data object
 * @returns The canonical payment ID (payment_intent ID preferred)
 */
function getCanonicalPaymentId(
  eventType: string,
  paymentData: { id: string; payment_intent?: string | null }
): string {
  // For charge events, prefer the payment_intent ID if available
  // This ensures the same idempotency key for both charge.succeeded and payment_intent.succeeded
  if (eventType.startsWith('charge.') && paymentData.payment_intent) {
    return paymentData.payment_intent;
  }
  return paymentData.id;
}

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
  const parsedTimestamp = parseInt(timestamp, 10);
  // Reject if timestamp is invalid (NaN)
  if (Number.isNaN(parsedTimestamp)) {
    return false;
  }
  const timestampAge = Math.floor(Date.now() / 1000) - parsedTimestamp;
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

          // CRITICAL: Use canonical payment ID to prevent double-processing
          // Stripe sends BOTH payment_intent.succeeded AND charge.succeeded for the same payment
          // By using the payment_intent ID as canonical, both events generate the same idempotency key
          const paymentIntentId =
            'payment_intent' in paymentData ? paymentData.payment_intent : null;
          const canonicalPaymentId = getCanonicalPaymentId(event.type, {
            id: paymentData.id,
            payment_intent: typeof paymentIntentId === 'string' ? paymentIntentId : null,
          });

          fastify.log.info(
            {
              correlationId,
              eventType: event.type,
              rawPaymentId: paymentData.id,
              canonicalPaymentId,
              amount,
              customer,
            },
            'Payment succeeded'
          );

          // Forward to Trigger.dev for processing
          const successPayload = {
            paymentId: canonicalPaymentId,
            rawPaymentId: paymentData.id,
            eventType: event.type,
            amount: typeof amount === 'number' ? amount : 0,
            currency: typeof currency === 'string' ? currency : 'eur',
            customerId: typeof customer === 'string' ? customer : null,
            customerEmail: typeof receiptEmail === 'string' ? receiptEmail : null,
            metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
            correlationId,
          };

          // Use canonical payment ID for idempotency - ensures both payment_intent.succeeded
          // and charge.succeeded events for the same payment use the same idempotency key
          tasks
            .trigger('payment-succeeded-handler', successPayload, {
              idempotencyKey: IdempotencyKeys.paymentSucceeded(canonicalPaymentId),
            })
            .catch((err: unknown) => {
              fastify.log.error(
                { err, paymentId: canonicalPaymentId, correlationId },
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

          // CRITICAL: Use canonical payment ID to prevent double-processing
          const paymentIntentId =
            'payment_intent' in paymentData ? paymentData.payment_intent : null;
          const canonicalPaymentId = getCanonicalPaymentId(event.type, {
            id: paymentData.id,
            payment_intent: typeof paymentIntentId === 'string' ? paymentIntentId : null,
          });

          fastify.log.warn(
            {
              correlationId,
              eventType: event.type,
              rawPaymentId: paymentData.id,
              canonicalPaymentId,
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
            paymentId: canonicalPaymentId,
            rawPaymentId: paymentData.id,
            eventType: event.type,
            amount: typeof amount === 'number' ? amount : 0,
            currency: typeof currency === 'string' ? currency : 'eur',
            customerId: typeof customer === 'string' ? customer : null,
            customerEmail: typeof receiptEmail === 'string' ? receiptEmail : null,
            failureCode,
            failureReason,
            metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
            correlationId,
          };

          // Use canonical payment ID for idempotency
          tasks
            .trigger('payment-failed-handler', failedPayload, {
              idempotencyKey: IdempotencyKeys.paymentFailed(canonicalPaymentId),
            })
            .catch((err: unknown) => {
              fastify.log.error(
                { err, paymentId: canonicalPaymentId, correlationId },
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

            tasks
              .trigger('payment-succeeded-handler', checkoutPayload, {
                idempotencyKey: IdempotencyKeys.paymentSucceeded(session.id),
              })
              .catch((err: unknown) => {
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

            tasks
              .trigger('payment-succeeded-handler', invoicePayload, {
                idempotencyKey: IdempotencyKeys.paymentSucceeded(invoice.id),
              })
              .catch((err: unknown) => {
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

            // Use canonical payment ID (payment_intent if available)
            const paymentIntentId = 'payment_intent' in charge ? charge.payment_intent : null;
            const canonicalPaymentId = getCanonicalPaymentId(event.type, {
              id: charge.id,
              payment_intent: typeof paymentIntentId === 'string' ? paymentIntentId : null,
            });

            fastify.log.info(
              {
                correlationId,
                chargeId: charge.id,
                canonicalPaymentId,
                amountRefunded: charge.amount_refunded,
              },
              'Charge refunded'
            );

            // Forward to Trigger.dev for processing
            // Use canonical payment ID for the refund ID to link it to the original payment
            const refundPayload = {
              refundId: `refund_${canonicalPaymentId}`,
              paymentId: canonicalPaymentId,
              chargeId: charge.id,
              amount: typeof charge.amount_refunded === 'number' ? charge.amount_refunded : 0,
              currency: typeof charge.currency === 'string' ? charge.currency : 'eur',
              reason:
                'refund' in charge && typeof charge.refund === 'string' ? charge.refund : undefined,
              customerEmail: typeof customerEmail === 'string' ? customerEmail : null,
              metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
              correlationId,
            };

            tasks
              .trigger('refund-handler', refundPayload, {
                idempotencyKey: IdempotencyKeys.refund(`refund_${canonicalPaymentId}`),
              })
              .catch((err: unknown) => {
                fastify.log.error(
                  { err, chargeId: charge.id, canonicalPaymentId, correlationId },
                  'Failed to trigger refund handler'
                );
              });
          }
          break;
        }

        // Subscription events
        case 'customer.subscription.created': {
          const subscription = event.data.object;
          if ('status' in subscription) {
            const items = 'items' in subscription ? subscription.items : null;
            const firstItem =
              items && 'data' in items && Array.isArray(items.data) ? items.data[0] : null;

            fastify.log.info(
              {
                correlationId,
                subscriptionId: subscription.id,
                status: subscription.status,
              },
              'Subscription created'
            );

            const subscriptionPayload = {
              subscriptionId: subscription.id,
              customerId: typeof subscription.customer === 'string' ? subscription.customer : '',
              customerEmail: null as string | null,
              status: subscription.status,
              productName: firstItem?.price?.product as string | undefined,
              amount: firstItem?.price?.unit_amount ?? undefined,
              currency: firstItem?.price?.currency,
              interval: firstItem?.price?.recurring?.interval,
              trialEnd: 'trial_end' in subscription ? subscription.trial_end : null,
              currentPeriodEnd:
                'current_period_end' in subscription
                  ? subscription.current_period_end
                  : Date.now() / 1000,
              metadata: 'metadata' in subscription ? subscription.metadata : undefined,
              correlationId,
            };

            tasks
              .trigger('subscription-created-handler', subscriptionPayload, {
                idempotencyKey: IdempotencyKeys.paymentSucceeded(`sub_created_${subscription.id}`),
              })
              .catch((err: unknown) => {
                fastify.log.error(
                  { err, subscriptionId: subscription.id, correlationId },
                  'Failed to trigger subscription created handler'
                );
              });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          if ('status' in subscription) {
            fastify.log.info(
              {
                correlationId,
                subscriptionId: subscription.id,
                status: subscription.status,
              },
              'Subscription updated'
            );

            const updatePayload = {
              subscriptionId: subscription.id,
              customerId: typeof subscription.customer === 'string' ? subscription.customer : '',
              customerEmail: null as string | null,
              newStatus: subscription.status,
              cancelAt: 'cancel_at' in subscription ? subscription.cancel_at : null,
              canceledAt: 'canceled_at' in subscription ? subscription.canceled_at : null,
              endedAt: 'ended_at' in subscription ? subscription.ended_at : null,
              metadata: 'metadata' in subscription ? subscription.metadata : undefined,
              correlationId,
            };

            tasks
              .trigger('subscription-updated-handler', updatePayload, {
                idempotencyKey: IdempotencyKeys.paymentSucceeded(
                  `sub_updated_${subscription.id}_${Date.now()}`
                ),
              })
              .catch((err: unknown) => {
                fastify.log.error(
                  { err, subscriptionId: subscription.id, correlationId },
                  'Failed to trigger subscription updated handler'
                );
              });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          fastify.log.warn(
            {
              correlationId,
              subscriptionId: subscription.id,
            },
            'Subscription deleted'
          );

          const deletePayload = {
            subscriptionId: subscription.id,
            customerId:
              'customer' in subscription && typeof subscription.customer === 'string'
                ? subscription.customer
                : '',
            customerEmail: null as string | null,
            cancellationReason: undefined as string | undefined,
            metadata: 'metadata' in subscription ? subscription.metadata : undefined,
            correlationId,
          };

          tasks
            .trigger('subscription-deleted-handler', deletePayload, {
              idempotencyKey: IdempotencyKeys.paymentSucceeded(`sub_deleted_${subscription.id}`),
            })
            .catch((err: unknown) => {
              fastify.log.error(
                { err, subscriptionId: subscription.id, correlationId },
                'Failed to trigger subscription deleted handler'
              );
            });
          break;
        }

        case 'customer.subscription.trial_will_end': {
          const subscription = event.data.object;
          if ('trial_end' in subscription && subscription.trial_end) {
            const trialEnd = subscription.trial_end as number;
            const daysRemaining = Math.ceil((trialEnd * 1000 - Date.now()) / (24 * 60 * 60 * 1000));

            fastify.log.info(
              {
                correlationId,
                subscriptionId: subscription.id,
                trialEnd,
                daysRemaining,
              },
              'Trial ending soon'
            );

            const trialPayload = {
              subscriptionId: subscription.id,
              customerId: typeof subscription.customer === 'string' ? subscription.customer : '',
              customerEmail: null as string | null,
              trialEnd,
              daysRemaining,
              metadata: 'metadata' in subscription ? subscription.metadata : undefined,
              correlationId,
            };

            tasks
              .trigger('trial-ending-handler', trialPayload, {
                idempotencyKey: IdempotencyKeys.paymentSucceeded(`trial_ending_${subscription.id}`),
              })
              .catch((err: unknown) => {
                fastify.log.error(
                  { err, subscriptionId: subscription.id, correlationId },
                  'Failed to trigger trial ending handler'
                );
              });
          }
          break;
        }

        // Explicitly handle other expected event types (logged but not processed)
        case 'payment_intent.canceled':
        case 'customer.created':
        case 'customer.updated':
        case 'invoice.payment_failed':
        case 'invoice.created':
        case 'invoice.finalized':
        case 'invoice.upcoming':
        case 'checkout.session.expired':
        case 'customer.subscription.paused':
        case 'customer.subscription.resumed':
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
