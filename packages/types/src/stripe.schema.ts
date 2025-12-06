import { z } from 'zod';

/**
 * Stripe Webhook Schemas
 * Based on Stripe API v2023-10-16
 */

// Stripe event types relevant for medical payments
export const StripeEventTypeSchema = z.enum([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'customer.created',
  'customer.updated',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.created',
  'invoice.finalized',
  'invoice.upcoming',
  'checkout.session.completed',
  'checkout.session.expired',
  // Subscription events
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
]);

// Payment intent object
export const PaymentIntentSchema = z.object({
  id: z.string(),
  object: z.literal('payment_intent'),
  amount: z.number(),
  amount_received: z.number(),
  currency: z.string(),
  status: z.enum(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded']),
  customer: z.string().nullable(),
  description: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
  payment_method: z.string().nullable(),
  receipt_email: z.string().nullable(),
  created: z.number(),
});

// Charge object
export const ChargeSchema = z.object({
  id: z.string(),
  object: z.literal('charge'),
  amount: z.number(),
  amount_refunded: z.number(),
  currency: z.string(),
  status: z.enum(['succeeded', 'pending', 'failed']),
  customer: z.string().nullable(),
  description: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
  payment_intent: z.string().nullable(),
  receipt_email: z.string().nullable(),
  receipt_url: z.string().nullable(),
  refunded: z.boolean(),
  created: z.number(),
});

// Customer object
export const StripeCustomerSchema = z.object({
  id: z.string(),
  object: z.literal('customer'),
  email: z.string().nullable(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
  created: z.number(),
});

// Invoice object
export const InvoiceSchema = z.object({
  id: z.string(),
  object: z.literal('invoice'),
  amount_due: z.number(),
  amount_paid: z.number(),
  currency: z.string(),
  customer: z.string(),
  customer_email: z.string().nullable(),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).nullable(),
  metadata: z.record(z.string()).optional(),
  created: z.number(),
});

// Checkout session object
export const CheckoutSessionSchema = z.object({
  id: z.string(),
  object: z.literal('checkout.session'),
  amount_total: z.number().nullable(),
  currency: z.string().nullable(),
  customer: z.string().nullable(),
  customer_email: z.string().nullable(),
  mode: z.enum(['payment', 'setup', 'subscription']),
  payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
  status: z.enum(['open', 'complete', 'expired']).nullable(),
  metadata: z.record(z.string()).optional(),
  success_url: z.string().nullable(),
  cancel_url: z.string().nullable(),
  created: z.number(),
});

// Subscription object
export const SubscriptionSchema = z.object({
  id: z.string(),
  object: z.literal('subscription'),
  customer: z.string(),
  status: z.enum([
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused',
  ]),
  current_period_start: z.number(),
  current_period_end: z.number(),
  trial_start: z.number().nullable(),
  trial_end: z.number().nullable(),
  cancel_at: z.number().nullable(),
  canceled_at: z.number().nullable(),
  ended_at: z.number().nullable(),
  metadata: z.record(z.string()).optional(),
  items: z.object({
    data: z.array(z.object({
      id: z.string(),
      price: z.object({
        id: z.string(),
        product: z.string(),
        unit_amount: z.number().nullable(),
        currency: z.string(),
        recurring: z.object({
          interval: z.enum(['day', 'week', 'month', 'year']),
          interval_count: z.number(),
        }).nullable(),
      }),
      quantity: z.number().optional(),
    })),
  }).optional(),
  created: z.number(),
});

// Stripe webhook event
export const StripeWebhookEventSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  api_version: z.string(),
  created: z.number(),
  type: StripeEventTypeSchema,
  livemode: z.boolean(),
  pending_webhooks: z.number(),
  data: z.object({
    object: z.union([
      PaymentIntentSchema,
      ChargeSchema,
      StripeCustomerSchema,
      InvoiceSchema,
      CheckoutSessionSchema,
      SubscriptionSchema,
    ]),
  }),
});

// Internal payment event representation
export const PaymentEventSchema = z.object({
  eventId: z.string(),
  eventType: StripeEventTypeSchema,
  customerId: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  metadata: z.record(z.string()).optional(),
  timestamp: z.string(),
});

// Inferred types
export type StripeEventType = z.infer<typeof StripeEventTypeSchema>;
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;
export type Charge = z.infer<typeof ChargeSchema>;
export type StripeCustomer = z.infer<typeof StripeCustomerSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type StripeWebhookEvent = z.infer<typeof StripeWebhookEventSchema>;
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
