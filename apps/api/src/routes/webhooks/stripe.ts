import type { FastifyPluginAsync, FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { StripeWebhookEvent } from '@medicalcor/types';
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

// =============================================================================
// Types
// =============================================================================

interface HandlerContext {
  fastify: FastifyInstance;
  correlationId: string;
}

interface PaymentEventData {
  id: string;
  amount: number;
  currency: string;
  customerId: string | null;
  customerEmail: string | null;
  metadata?: Record<string, unknown>;
  paymentIntentId: string | null;
}

// =============================================================================
// Data Extraction Utilities
// =============================================================================

/**
 * Safely extract a typed value from an object with 'in' check
 */
function extractField<T>(obj: unknown, field: string, defaultValue: T): T {
  if (obj && typeof obj === 'object' && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    if (typeof value === typeof defaultValue || (defaultValue === null && value === null)) {
      return value as T;
    }
    if (defaultValue === null && typeof value === 'string') {
      return value as T;
    }
  }
  return defaultValue;
}

/**
 * Extract common payment data from various Stripe event objects
 */
function extractPaymentData(eventData: unknown): PaymentEventData {
  const obj = eventData as Record<string, unknown>;
  return {
    id: extractField(obj, 'id', ''),
    amount:
      extractField(obj, 'amount', 0) ||
      extractField(obj, 'amount_total', 0) ||
      extractField(obj, 'amount_paid', 0),
    currency: extractField(obj, 'currency', 'eur'),
    customerId: typeof obj.customer === 'string' ? obj.customer : null,
    customerEmail:
      extractField(obj, 'receipt_email', null as string | null) ??
      extractField(obj, 'customer_email', null as string | null),
    metadata:
      typeof obj.metadata === 'object' && obj.metadata
        ? (obj.metadata as Record<string, unknown>)
        : undefined,
    paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
  };
}

/**
 * Extract the canonical payment ID from a Stripe event object.
 * For charges, this extracts the payment_intent ID to prevent double-processing
 * when Stripe sends both payment_intent.succeeded and charge.succeeded events.
 */
function getCanonicalPaymentId(
  eventType: string,
  paymentData: { id: string; paymentIntentId: string | null }
): string {
  if (eventType.startsWith('charge.') && paymentData.paymentIntentId) {
    return paymentData.paymentIntentId;
  }
  return paymentData.id;
}

// =============================================================================
// Trigger Utility
// =============================================================================

/**
 * Trigger a task with consistent error handling and logging
 */
function triggerTask(
  ctx: HandlerContext,
  taskId: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  entityInfo: Record<string, unknown>
): void {
  tasks.trigger(taskId, payload, { idempotencyKey }).catch((err: unknown) => {
    ctx.fastify.log.error(
      { err, ...entityInfo, correlationId: ctx.correlationId },
      `Failed to trigger ${taskId}`
    );
  });
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

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle payment success events (payment_intent.succeeded, charge.succeeded)
 */
function handlePaymentSucceeded(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const data = extractPaymentData(event.data.object);
  const canonicalPaymentId = getCanonicalPaymentId(event.type, data);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      eventType: event.type,
      rawPaymentId: data.id,
      canonicalPaymentId,
      amount: data.amount,
      customer: data.customerId,
    },
    'Payment succeeded'
  );

  triggerTask(
    ctx,
    'payment-succeeded-handler',
    {
      paymentId: canonicalPaymentId,
      rawPaymentId: data.id,
      eventType: event.type,
      amount: data.amount,
      currency: data.currency,
      customerId: data.customerId,
      customerEmail: data.customerEmail,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(canonicalPaymentId),
    { paymentId: canonicalPaymentId }
  );
}

/**
 * Handle payment failure events (payment_intent.payment_failed, charge.failed)
 */
function handlePaymentFailed(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const data = extractPaymentData(event.data.object);
  const canonicalPaymentId = getCanonicalPaymentId(event.type, data);
  const eventData = event.data.object as Record<string, unknown>;

  // Extract failure details
  const lastPaymentError = extractField(eventData, 'last_payment_error', null as unknown);
  const failureMessage = extractField(eventData, 'failure_message', null as string | null);

  let failureCode: string | undefined;
  let failureReason = 'Payment failed';

  if (lastPaymentError && typeof lastPaymentError === 'object') {
    const errorObj = lastPaymentError as Record<string, unknown>;
    failureCode = typeof errorObj.code === 'string' ? errorObj.code : undefined;
    failureReason = typeof errorObj.message === 'string' ? errorObj.message : 'Payment failed';
  } else if (failureMessage) {
    failureReason = failureMessage;
  }

  ctx.fastify.log.warn(
    {
      correlationId: ctx.correlationId,
      eventType: event.type,
      rawPaymentId: data.id,
      canonicalPaymentId,
      customer: data.customerId,
    },
    'Payment failed'
  );

  triggerTask(
    ctx,
    'payment-failed-handler',
    {
      paymentId: canonicalPaymentId,
      rawPaymentId: data.id,
      eventType: event.type,
      amount: data.amount,
      currency: data.currency,
      customerId: data.customerId,
      customerEmail: data.customerEmail,
      failureCode,
      failureReason,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentFailed(canonicalPaymentId),
    { paymentId: canonicalPaymentId }
  );
}

/**
 * Handle checkout session completed events
 */
function handleCheckoutSessionCompleted(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const session = event.data.object as Record<string, unknown>;

  if (!('mode' in session) || session.payment_status !== 'paid') {
    return;
  }

  const data = extractPaymentData(session);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      sessionId: data.id,
      customer: data.customerId,
      paymentStatus: session.payment_status,
    },
    'Checkout session completed'
  );

  triggerTask(
    ctx,
    'payment-succeeded-handler',
    {
      paymentId: data.id,
      amount: data.amount,
      currency: data.currency,
      customerId: data.customerId,
      customerEmail: data.customerEmail,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(data.id),
    { sessionId: data.id }
  );
}

/**
 * Handle invoice paid events
 */
function handleInvoicePaid(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const invoice = event.data.object as Record<string, unknown>;

  if (!('amount_paid' in invoice)) {
    return;
  }

  const data = extractPaymentData(invoice);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      invoiceId: data.id,
      customer: data.customerId,
      amountPaid: data.amount,
    },
    'Invoice paid'
  );

  triggerTask(
    ctx,
    'payment-succeeded-handler',
    {
      paymentId: data.id,
      amount: data.amount,
      currency: data.currency,
      customerId: data.customerId,
      customerEmail: data.customerEmail,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(data.id),
    { invoiceId: data.id }
  );
}

/**
 * Handle charge refunded events
 */
function handleChargeRefunded(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const charge = event.data.object as Record<string, unknown>;

  if (!('amount_refunded' in charge)) {
    return;
  }

  const data = extractPaymentData(charge);
  const canonicalPaymentId = getCanonicalPaymentId(event.type, data);
  const amountRefunded = extractField(charge, 'amount_refunded', 0);
  const refundReason = extractField(charge, 'refund', undefined as string | undefined);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      chargeId: data.id,
      canonicalPaymentId,
      amountRefunded,
    },
    'Charge refunded'
  );

  triggerTask(
    ctx,
    'refund-handler',
    {
      refundId: `refund_${canonicalPaymentId}`,
      paymentId: canonicalPaymentId,
      chargeId: data.id,
      amount: amountRefunded,
      currency: data.currency,
      reason: refundReason,
      customerEmail: data.customerEmail,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.refund(`refund_${canonicalPaymentId}`),
    { chargeId: data.id, canonicalPaymentId }
  );
}

/**
 * Extract subscription data from event
 */
function extractSubscriptionData(subscription: Record<string, unknown>) {
  const items = extractField(subscription, 'items', null as unknown);
  const itemsData =
    items && typeof items === 'object' && 'data' in items
      ? (items as Record<string, unknown>).data
      : null;
  const firstItem = Array.isArray(itemsData)
    ? (itemsData[0] as Record<string, unknown> | undefined)
    : undefined;
  const price = firstItem?.price as Record<string, unknown> | undefined;
  const recurring = price?.recurring as Record<string, unknown> | undefined;

  return {
    id: extractField(subscription, 'id', ''),
    customerId: typeof subscription.customer === 'string' ? subscription.customer : '',
    status: extractField(subscription, 'status', ''),
    productName: price?.product,
    amount: price?.unit_amount,
    currency: price?.currency,
    interval: recurring?.interval,
    trialEnd: extractField(subscription, 'trial_end', null as number | null),
    currentPeriodEnd: extractField(subscription, 'current_period_end', Date.now() / 1000),
    cancelAt: extractField(subscription, 'cancel_at', null as number | null),
    canceledAt: extractField(subscription, 'canceled_at', null as number | null),
    endedAt: extractField(subscription, 'ended_at', null as number | null),
    metadata:
      typeof subscription.metadata === 'object' && subscription.metadata
        ? (subscription.metadata as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Handle subscription created events
 */
function handleSubscriptionCreated(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const subscription = event.data.object as Record<string, unknown>;

  if (!('status' in subscription)) {
    return;
  }

  const data = extractSubscriptionData(subscription);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      subscriptionId: data.id,
      status: data.status,
    },
    'Subscription created'
  );

  triggerTask(
    ctx,
    'subscription-created-handler',
    {
      subscriptionId: data.id,
      customerId: data.customerId,
      customerEmail: null,
      status: data.status,
      productName: data.productName,
      amount: data.amount,
      currency: data.currency,
      interval: data.interval,
      trialEnd: data.trialEnd,
      currentPeriodEnd: data.currentPeriodEnd,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(`sub_created_${data.id}`),
    { subscriptionId: data.id }
  );
}

/**
 * Handle subscription updated events
 */
function handleSubscriptionUpdated(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const subscription = event.data.object as Record<string, unknown>;

  if (!('status' in subscription)) {
    return;
  }

  const data = extractSubscriptionData(subscription);

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      subscriptionId: data.id,
      status: data.status,
    },
    'Subscription updated'
  );

  triggerTask(
    ctx,
    'subscription-updated-handler',
    {
      subscriptionId: data.id,
      customerId: data.customerId,
      customerEmail: null,
      newStatus: data.status,
      cancelAt: data.cancelAt,
      canceledAt: data.canceledAt,
      endedAt: data.endedAt,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(`sub_updated_${data.id}_${Date.now()}`),
    { subscriptionId: data.id }
  );
}

/**
 * Handle subscription deleted events
 */
function handleSubscriptionDeleted(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const subscription = event.data.object as Record<string, unknown>;
  const data = extractSubscriptionData(subscription);

  ctx.fastify.log.warn(
    {
      correlationId: ctx.correlationId,
      subscriptionId: data.id,
    },
    'Subscription deleted'
  );

  triggerTask(
    ctx,
    'subscription-deleted-handler',
    {
      subscriptionId: data.id,
      customerId: data.customerId,
      customerEmail: null,
      cancellationReason: undefined,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(`sub_deleted_${data.id}`),
    { subscriptionId: data.id }
  );
}

/**
 * Handle trial will end events
 */
function handleTrialWillEnd(ctx: HandlerContext, event: StripeWebhookEvent): void {
  const subscription = event.data.object as Record<string, unknown>;
  const trialEnd = extractField(subscription, 'trial_end', null as number | null);

  if (!trialEnd) {
    return;
  }

  const data = extractSubscriptionData(subscription);
  const daysRemaining = Math.ceil((trialEnd * 1000 - Date.now()) / (24 * 60 * 60 * 1000));

  ctx.fastify.log.info(
    {
      correlationId: ctx.correlationId,
      subscriptionId: data.id,
      trialEnd,
      daysRemaining,
    },
    'Trial ending soon'
  );

  triggerTask(
    ctx,
    'trial-ending-handler',
    {
      subscriptionId: data.id,
      customerId: data.customerId,
      customerEmail: null,
      trialEnd,
      daysRemaining,
      metadata: data.metadata,
      correlationId: ctx.correlationId,
    },
    IdempotencyKeys.paymentSucceeded(`trial_ending_${data.id}`),
    { subscriptionId: data.id }
  );
}

// =============================================================================
// Handler Registry
// =============================================================================

type EventHandler = (ctx: HandlerContext, event: StripeWebhookEvent) => void;

const eventHandlers: Record<string, EventHandler> = {
  'payment_intent.succeeded': handlePaymentSucceeded,
  'charge.succeeded': handlePaymentSucceeded,
  'payment_intent.payment_failed': handlePaymentFailed,
  'charge.failed': handlePaymentFailed,
  'checkout.session.completed': handleCheckoutSessionCompleted,
  'invoice.paid': handleInvoicePaid,
  'charge.refunded': handleChargeRefunded,
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'customer.subscription.trial_will_end': handleTrialWillEnd,
};

/** Event types that are known but intentionally not processed */
const knownUnhandledEvents = new Set([
  'payment_intent.canceled',
  'customer.created',
  'customer.updated',
  'invoice.payment_failed',
  'invoice.created',
  'invoice.finalized',
  'invoice.upcoming',
  'checkout.session.expired',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

// =============================================================================
// Route Definition
// =============================================================================

export const stripeWebhookRoutes: FastifyPluginAsync = (fastify) => {
  // Store raw body for signature verification - remove existing parser first
  fastify.removeContentTypeParser('application/json');
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

      // Dispatch to appropriate handler using the registry
      const ctx: HandlerContext = { fastify, correlationId };
      const handler = eventHandlers[event.type];

      if (handler) {
        handler(ctx, event);
      } else if (!knownUnhandledEvents.has(event.type)) {
        fastify.log.info({ correlationId, eventType: event.type }, 'Unknown Stripe event type');
      } else {
        fastify.log.debug({ correlationId, eventType: event.type }, 'Ignored Stripe event type');
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
