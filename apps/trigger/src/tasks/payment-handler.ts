import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Payment Handler Task
 * Processes Stripe payment events
 *
 * Flow:
 * 1. Find/create HubSpot contact by email or phone
 * 2. Log payment to timeline
 * 3. Update lifecycle stage to customer
 * 4. Send WhatsApp confirmation (if phone available)
 * 5. Emit domain event
 */

// Initialize clients lazily using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'payment-handler',
    includeTemplateCatalog: true,
  });
}

/**
 * Format currency amount for display
 */
function formatCurrency(
  amountCents: number,
  currency: string,
  language: 'ro' | 'en' | 'de' = 'ro'
): string {
  const amount = amountCents / 100;
  const locales: Record<string, string> = {
    ro: 'ro-RO',
    en: 'en-US',
    de: 'de-DE',
  };

  return new Intl.NumberFormat(locales[language], {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

export const PaymentSucceededPayloadSchema = z.object({
  paymentId: z.string(),
  amount: z.number(), // Amount in cents
  currency: z.string(),
  customerId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerName: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type PaymentSucceededPayload = z.infer<typeof PaymentSucceededPayloadSchema>;

export const handlePaymentSucceeded = task({
  id: 'payment-succeeded-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: PaymentSucceededPayload) => {
    const {
      paymentId,
      amount,
      currency,
      customerId,
      customerEmail,
      customerName,
      metadata,
      correlationId,
    } = payload;
    const { hubspot, whatsapp, templateCatalog, eventStore } = getClients();

    logger.info('Processing successful payment', {
      paymentId,
      amount,
      currency,
      customerId,
      hasEmail: !!customerEmail,
      hasPhone: !!metadata?.phone,
      correlationId,
    });

    // Step 1: Find or create HubSpot contact (using atomic upsert to prevent race conditions)
    // IMPORTANT: We use upsertContactByEmail/Phone which is atomic and prevents duplicate
    // contacts when multiple webhook events arrive simultaneously (e.g., payment_intent.succeeded
    // and charge.succeeded both trying to create the same contact)
    let hubspotContactId: string | undefined;
    let normalizedPhone: string | undefined;

    if (hubspot) {
      try {
        // Normalize phone if available
        if (metadata?.phone) {
          const phoneResult = normalizeRomanianPhone(metadata.phone);
          normalizedPhone = phoneResult.normalized;
        }

        // Use atomic upsert operations instead of check-then-act pattern
        // This prevents race conditions when concurrent webhooks try to create contacts
        if (customerEmail) {
          // Prefer email-based upsert as email is more unique
          const contact = await hubspot.upsertContactByEmail(customerEmail, {
            ...(customerName ? { firstname: customerName } : {}),
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
            lead_source: 'stripe_payment',
          });
          hubspotContactId = contact.id;
          logger.info('Upserted contact by email', { contactId: hubspotContactId, correlationId });
        } else if (normalizedPhone) {
          // Fallback to phone-based upsert
          const contact = await hubspot.upsertContactByPhone(normalizedPhone, {
            ...(customerName ? { firstname: customerName } : {}),
            lead_source: 'stripe_payment',
          });
          hubspotContactId = contact.id;
          logger.info('Upserted contact by phone', { contactId: hubspotContactId, correlationId });
        }
      } catch (err) {
        logger.error('Failed to upsert HubSpot contact', { err, correlationId });
      }
    } else {
      logger.warn('HubSpot client not configured', { correlationId });
    }

    // Step 2: Log payment to timeline and update lifecycle
    if (hubspot && hubspotContactId) {
      try {
        // Log payment to timeline
        await hubspot.logPaymentToTimeline({
          contactId: hubspotContactId,
          paymentId,
          amount,
          currency,
          status: 'succeeded',
        });
        logger.info('Payment logged to timeline', { contactId: hubspotContactId, correlationId });

        // Update lifecycle stage to customer
        await hubspot.updateContact(hubspotContactId, {
          lifecyclestage: 'customer',
          hs_lead_status: 'CONVERTED',
          last_payment_date: new Date().toISOString(),
          last_payment_amount: formatCurrency(amount, currency),
          stripe_customer_id: customerId ?? undefined,
        });
        logger.info('Contact updated to customer lifecycle', {
          contactId: hubspotContactId,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to update HubSpot contact', { err, correlationId });
      }
    }

    // Step 3: Send WhatsApp confirmation if phone available
    if (whatsapp && metadata?.phone && templateCatalog) {
      try {
        const phoneResult = normalizeRomanianPhone(metadata.phone);
        normalizedPhone = phoneResult.normalized;

        // Build template components
        const components = templateCatalog.buildTemplateComponents('payment_confirmation', {
          amount: formatCurrency(amount, currency),
          date: templateCatalog.formatDateForTemplate(new Date()),
        });

        await whatsapp.sendTemplate({
          to: normalizedPhone,
          templateName: 'payment_confirmation',
          language: 'ro',
          components,
        });
        logger.info('Payment confirmation sent via WhatsApp', { correlationId });
      } catch (err) {
        logger.error('Failed to send WhatsApp confirmation', { err, correlationId });
      }
    }

    // Step 4: Emit domain event
    try {
      await eventStore.emit({
        type: 'payment.received',
        correlationId,
        aggregateId: hubspotContactId ?? normalizedPhone ?? paymentId,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: paymentId,
          stripeCustomerId: customerId,
          hubspotContactId,
          amount,
          currency,
          formattedAmount: formatCurrency(amount, currency),
          customerEmail,
          phone: normalizedPhone,
        },
      });
      logger.info('Domain event emitted', { type: 'payment.received', correlationId });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

    return {
      success: true,
      paymentId,
      hubspotContactId,
      amount,
      formattedAmount: formatCurrency(amount, currency),
      currency,
      lifecycleUpdated: !!hubspotContactId,
      confirmationSent: !!(whatsapp && metadata?.phone),
    };
  },
});

/**
 * Payment Failed Handler Task
 * Processes failed payment events
 */
export const PaymentFailedPayloadSchema = z.object({
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  customerId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  failureCode: z.string().optional(),
  failureReason: z.string(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type PaymentFailedPayload = z.infer<typeof PaymentFailedPayloadSchema>;

export const handlePaymentFailed = task({
  id: 'payment-failed-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: PaymentFailedPayload) => {
    const {
      paymentId,
      amount,
      currency,
      customerId,
      customerEmail,
      failureCode,
      failureReason,
      metadata,
      correlationId,
    } = payload;
    const { hubspot, eventStore } = getClients();

    logger.warn('Processing failed payment', {
      paymentId,
      amount,
      failureCode,
      failureReason,
      correlationId,
    });

    // Find HubSpot contact
    let hubspotContactId: string | undefined;
    let normalizedPhone: string | undefined;

    if (hubspot) {
      try {
        // Try to find by email
        if (customerEmail) {
          const contact = await hubspot.findContactByEmail(customerEmail);
          hubspotContactId = contact?.id;
        }

        // Try to find by phone
        if (!hubspotContactId && metadata?.phone) {
          const phoneResult = normalizeRomanianPhone(metadata.phone);
          normalizedPhone = phoneResult.normalized;
          const contacts = await hubspot.searchContactsByPhone(normalizedPhone);
          const firstContact = contacts[0];
          if (firstContact) {
            hubspotContactId = firstContact.id;
          }
        }

        // Log failed payment to timeline
        if (hubspotContactId) {
          await hubspot.logPaymentToTimeline({
            contactId: hubspotContactId,
            paymentId,
            amount,
            currency,
            status: `failed: ${failureReason}`,
          });

          // Create follow-up task for staff
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `PAYMENT FAILED: ${formatCurrency(amount, currency)}`,
            body: `Payment ID: ${paymentId}\nAmount: ${formatCurrency(amount, currency)}\nReason: ${failureReason}\nCode: ${failureCode ?? 'N/A'}\n\nPlease follow up with the customer to resolve the payment issue.`,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
          });
          logger.info('Created follow-up task for failed payment', {
            contactId: hubspotContactId,
            correlationId,
          });
        }
      } catch (err) {
        logger.error('Failed to process failed payment in HubSpot', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'payment.failed',
        correlationId,
        aggregateId: hubspotContactId ?? paymentId,
        aggregateType: 'payment',
        payload: {
          stripePaymentId: paymentId,
          stripeCustomerId: customerId,
          hubspotContactId,
          amount,
          currency,
          failureCode,
          failureReason,
          customerEmail,
          phone: normalizedPhone,
        },
      });
      logger.info('Domain event emitted', { type: 'payment.failed', correlationId });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

    return {
      success: true,
      paymentId,
      hubspotContactId,
      failureReason,
      taskCreated: !!hubspotContactId,
    };
  },
});

/**
 * Refund Handler Task
 * Processes refund events
 */
export const RefundPayloadSchema = z.object({
  refundId: z.string(),
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  reason: z.string().optional(),
  customerEmail: z.string().nullable(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type RefundPayload = z.infer<typeof RefundPayloadSchema>;

export const handleRefund = task({
  id: 'refund-handler',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: RefundPayload) => {
    const {
      refundId,
      paymentId,
      amount,
      currency,
      reason,
      customerEmail,
      metadata: _metadata,
      correlationId,
    } = payload;
    const { hubspot, eventStore } = getClients();

    logger.info('Processing refund', {
      refundId,
      paymentId,
      amount,
      reason,
      correlationId,
    });

    // Find HubSpot contact
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.findContactByEmail(customerEmail);
        hubspotContactId = contact?.id;

        if (hubspotContactId) {
          // Log refund to timeline
          await hubspot.logPaymentToTimeline({
            contactId: hubspotContactId,
            paymentId: refundId,
            amount: -amount, // Negative to indicate refund
            currency,
            status: `refunded${reason ? `: ${reason}` : ''}`,
          });
          logger.info('Refund logged to timeline', { contactId: hubspotContactId, correlationId });
        }
      } catch (err) {
        logger.error('Failed to log refund to HubSpot', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'payment.refunded',
        correlationId,
        aggregateId: hubspotContactId ?? refundId,
        aggregateType: 'payment',
        payload: {
          refundId,
          originalPaymentId: paymentId,
          hubspotContactId,
          amount,
          currency,
          reason,
        },
      });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

    return {
      success: true,
      refundId,
      paymentId,
      hubspotContactId,
      amount: formatCurrency(amount, currency),
    };
  },
});
