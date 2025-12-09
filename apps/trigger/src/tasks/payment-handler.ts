import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  formatCurrency,
  upsertPaymentContact,
  logPaymentAndUpdateLifecycle,
  findContactByEmailOrPhone,
  handleFailedPayment,
  logRefundToTimeline,
  sendPaymentConfirmation,
  triggerDirectLTV,
  triggerPaymentAttribution,
  emitPaymentReceivedEvent,
  emitPaymentFailedEvent,
  emitPaymentRefundedEvent,
} from './payment/index.js';

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
 * 6. Trigger LTV orchestration (if lead/clinic info available)
 */

// Initialize clients lazily using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'payment-handler',
    includeTemplateCatalog: true,
  });
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
  // LTV orchestration fields (optional - enables full LTV tracking)
  leadId: z.string().uuid().optional().describe('Lead UUID for LTV orchestration'),
  clinicId: z.string().uuid().optional().describe('Clinic UUID for LTV orchestration'),
  caseId: z.string().uuid().optional().describe('Case UUID if known'),
  treatmentPlanId: z.string().uuid().optional().describe('Treatment plan UUID if known'),
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
      leadId,
      clinicId,
      caseId,
      treatmentPlanId,
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

    // Step 1: Normalize phone if available
    let normalizedPhone: string | undefined;
    if (metadata?.phone) {
      const phoneResult = normalizeRomanianPhone(metadata.phone);
      normalizedPhone = phoneResult.normalized;
    }

    // Step 2: Find or create HubSpot contact
    const hubspotContactId = await upsertPaymentContact(
      hubspot,
      { customerEmail, normalizedPhone, customerName },
      correlationId
    );

    // Step 3: Log payment to timeline and update lifecycle
    if (hubspot && hubspotContactId) {
      try {
        await logPaymentAndUpdateLifecycle(
          hubspot,
          { contactId: hubspotContactId, paymentId, amount, currency, customerId },
          correlationId
        );
      } catch {
        // Error already logged in helper
      }
    }

    // Step 4: Send WhatsApp confirmation if phone available
    let confirmationSent = false;
    if (metadata?.phone && normalizedPhone) {
      confirmationSent = await sendPaymentConfirmation(
        whatsapp,
        templateCatalog,
        { normalizedPhone, amount, currency },
        correlationId
      );
    }

    // Step 5: Emit domain event
    await emitPaymentReceivedEvent(
      eventStore,
      correlationId,
      hubspotContactId ?? normalizedPhone ?? paymentId,
      {
        stripePaymentId: paymentId,
        stripeCustomerId: customerId,
        hubspotContactId,
        amount,
        currency,
        formattedAmount: formatCurrency(amount, currency),
        customerEmail,
        phone: normalizedPhone,
      }
    );

    // Step 6: Trigger LTV orchestration
    const ltvResult = await triggerLTVOrchestration(
      {
        paymentId,
        amount,
        currency,
        customerId,
        customerEmail,
        customerPhone: normalizedPhone ?? metadata?.phone,
        customerName,
        leadId,
        clinicId,
        caseId,
        treatmentPlanId,
      },
      correlationId
    );

    return {
      success: true,
      paymentId,
      hubspotContactId,
      amount,
      formattedAmount: formatCurrency(amount, currency),
      currency,
      lifecycleUpdated: !!hubspotContactId,
      confirmationSent,
      ltvOrchestrationTriggered: ltvResult,
    };
  },
});

/**
 * Handle LTV orchestration triggering based on available identifiers
 */
async function triggerLTVOrchestration(
  params: {
    paymentId: string;
    amount: number;
    currency: string;
    customerId: string | null;
    customerEmail: string | null;
    customerPhone?: string;
    customerName?: string;
    leadId?: string;
    clinicId?: string;
    caseId?: string;
    treatmentPlanId?: string;
  },
  correlationId: string
): Promise<boolean> {
  const {
    paymentId,
    amount,
    currency,
    customerId,
    customerEmail,
    customerPhone,
    customerName,
    leadId,
    clinicId,
    caseId,
    treatmentPlanId,
  } = params;

  // Direct path: explicit IDs provided
  if (leadId && clinicId) {
    return triggerDirectLTV(
      { paymentId, leadId, clinicId, caseId, treatmentPlanId, amount, currency },
      correlationId
    );
  }

  // Attribution path: resolve lead from customer identifiers
  if (customerEmail || customerPhone || customerId) {
    return triggerPaymentAttribution(
      {
        paymentId,
        amount,
        currency,
        stripeCustomerId: customerId,
        customerEmail,
        customerPhone,
        customerName,
      },
      correlationId
    );
  }

  // No identifiers available
  logger.warn('LTV orchestration skipped - no identifiers available', {
    hasLeadId: !!leadId,
    hasClinicId: !!clinicId,
    hasEmail: !!customerEmail,
    hasPhone: !!customerPhone,
    correlationId,
  });
  return false;
}

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

    // Find HubSpot contact and process failed payment
    let hubspotContactId: string | undefined;
    let normalizedPhone: string | undefined;

    if (hubspot) {
      // Normalize phone if available
      if (metadata?.phone) {
        const phoneResult = normalizeRomanianPhone(metadata.phone);
        normalizedPhone = phoneResult.normalized;
      }

      const result = await findContactByEmailOrPhone(
        hubspot,
        customerEmail,
        normalizedPhone,
        correlationId
      );
      hubspotContactId = result.contactId;

      if (hubspotContactId) {
        await handleFailedPayment(
          hubspot,
          { contactId: hubspotContactId, paymentId, amount, currency, failureCode, failureReason },
          correlationId
        );
      }
    }

    // Emit domain event
    await emitPaymentFailedEvent(eventStore, correlationId, hubspotContactId ?? paymentId, {
      stripePaymentId: paymentId,
      stripeCustomerId: customerId,
      hubspotContactId,
      amount,
      currency,
      failureCode,
      failureReason,
      customerEmail,
      phone: normalizedPhone,
    });

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
    const { refundId, paymentId, amount, currency, reason, customerEmail, correlationId } = payload;
    const { hubspot, eventStore } = getClients();

    logger.info('Processing refund', {
      refundId,
      paymentId,
      amount,
      reason,
      correlationId,
    });

    // Find HubSpot contact and log refund
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.findContactByEmail(customerEmail);
        hubspotContactId = contact?.id;

        if (hubspotContactId) {
          await logRefundToTimeline(
            hubspot,
            { contactId: hubspotContactId, refundId, amount, currency, reason },
            correlationId
          );
        }
      } catch (err) {
        logger.error('Failed to log refund to HubSpot', { err, correlationId });
      }
    }

    // Emit domain event
    await emitPaymentRefundedEvent(eventStore, correlationId, hubspotContactId ?? refundId, {
      refundId,
      originalPaymentId: paymentId,
      hubspotContactId,
      amount,
      currency,
      reason,
    });

    return {
      success: true,
      refundId,
      paymentId,
      hubspotContactId,
      amount: formatCurrency(amount, currency),
    };
  },
});
