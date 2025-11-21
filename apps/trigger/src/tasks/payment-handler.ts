import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

/**
 * Payment Handler Task
 * Processes Stripe payment events
 */

const PaymentSucceededPayloadSchema = z.object({
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  customerId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export const handlePaymentSucceeded = task({
  id: 'payment-succeeded-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof PaymentSucceededPayloadSchema>) => {
    const { paymentId, amount, currency, customerId, customerEmail: _customerEmail, metadata: _metadata, correlationId } = payload;

    logger.info('Processing successful payment', {
      paymentId,
      amount,
      currency,
      customerId,
      correlationId,
    });

    // Step 1: Find or create HubSpot contact
    // let hubspotContactId: string | undefined;
    // if (customerEmail) {
    //   const contact = await hubspotClient.findContactByEmail(customerEmail);
    //   hubspotContactId = contact?.id;
    // } else if (metadata?.phone) {
    //   const contact = await hubspotClient.findContactByPhone(metadata.phone);
    //   hubspotContactId = contact?.id;
    // }

    // Step 2: Log payment to timeline
    // if (hubspotContactId) {
    //   await hubspotClient.logPaymentToTimeline({
    //     contactId: hubspotContactId,
    //     paymentId,
    //     amount,
    //     currency,
    //     status: 'succeeded',
    //   });
    //
    //   // Update lifecycle stage
    //   await hubspotClient.updateContact(hubspotContactId, {
    //     lifecyclestage: 'customer',
    //   });
    // }

    // Step 3: Send confirmation via WhatsApp if phone available
    // if (metadata?.phone) {
    //   await whatsappClient.sendTemplate(
    //     metadata.phone,
    //     'payment_confirmation',
    //     { amount: formatCurrency(amount, currency) }
    //   );
    // }

    // Step 4: Emit domain event
    // await eventStore.emit({
    //   type: 'payment.received',
    //   correlationId,
    //   payload: {
    //     stripePaymentId: paymentId,
    //     hubspotContactId,
    //     amount,
    //     currency,
    //   },
    // });

    return {
      success: true,
      paymentId,
      amount,
      currency,
    };
  },
});

const PaymentFailedPayloadSchema = z.object({
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  customerId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  failureReason: z.string(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export const handlePaymentFailed = task({
  id: 'payment-failed-handler',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: z.infer<typeof PaymentFailedPayloadSchema>) => {
    const { paymentId, amount, currency: _currency, failureReason, metadata: _metadata, correlationId } = payload;

    logger.warn('Processing failed payment', {
      paymentId,
      amount,
      failureReason,
      correlationId,
    });

    // Notify staff about failed payment
    // Create follow-up task in HubSpot

    return {
      success: true,
      paymentId,
      failureReason,
    };
  },
});
