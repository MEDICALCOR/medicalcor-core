/**
 * LTV orchestration triggers for payment handler
 */
import { logger } from '@trigger.dev/sdk/v3';
import { IdempotencyKeys } from '@medicalcor/core';
import { recordPaymentToCase } from '../../workflows/ltv-orchestration.js';
import { attributePaymentToLead } from '../payment-attribution.js';

/**
 * Trigger LTV orchestration with direct IDs
 */
export async function triggerDirectLTV(
  params: {
    paymentId: string;
    leadId: string;
    clinicId: string;
    caseId?: string;
    treatmentPlanId?: string;
    amount: number;
    currency: string;
  },
  correlationId: string
): Promise<boolean> {
  const { paymentId, leadId, clinicId, caseId, treatmentPlanId, amount, currency } = params;

  try {
    await recordPaymentToCase.trigger(
      {
        paymentId,
        leadId,
        clinicId,
        caseId,
        treatmentPlanId,
        amount,
        currency,
        method: 'card',
        type: 'payment',
        processorName: 'stripe',
        processorTransactionId: paymentId,
        correlationId,
      },
      {
        idempotencyKey: IdempotencyKeys.custom('ltv-payment', paymentId, correlationId),
      }
    );
    logger.info('LTV orchestration triggered (direct)', { leadId, clinicId, correlationId });
    return true;
  } catch (err) {
    logger.error('Failed to trigger LTV orchestration', {
      err,
      leadId,
      clinicId,
      correlationId,
    });
    return false;
  }
}

/**
 * Trigger payment attribution to resolve lead
 */
export async function triggerPaymentAttribution(
  params: {
    paymentId: string;
    amount: number;
    currency: string;
    stripeCustomerId: string | null;
    customerEmail: string | null;
    customerPhone?: string;
    customerName?: string;
  },
  correlationId: string
): Promise<boolean> {
  const {
    paymentId,
    amount,
    currency,
    stripeCustomerId,
    customerEmail,
    customerPhone,
    customerName,
  } = params;

  try {
    await attributePaymentToLead.trigger(
      {
        paymentId,
        amount,
        currency,
        stripeCustomerId,
        customerEmail,
        customerPhone,
        customerName,
        method: 'card',
        type: 'payment',
        correlationId,
      },
      {
        idempotencyKey: IdempotencyKeys.custom('ltv-attr', paymentId, correlationId),
      }
    );
    logger.info('Payment attribution triggered', {
      hasEmail: !!customerEmail,
      hasPhone: !!customerPhone,
      hasCustomerId: !!stripeCustomerId,
      correlationId,
    });
    return true;
  } catch (err) {
    logger.error('Failed to trigger payment attribution', { err, correlationId });
    return false;
  }
}
