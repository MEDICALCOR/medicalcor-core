/**
 * Event emission for LTV orchestration
 *
 * Uses loosely typed event store interface to avoid tight coupling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { logger } from '@trigger.dev/sdk/v3';

/**
 * Event store client type (loosely typed to avoid coupling)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventStoreClient = any;

/**
 * Emit payment recorded event
 */
export async function emitPaymentRecordedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    leadId: string;
    clinicId: string;
    caseId: string;
    paymentId: string;
    paymentReference: string;
    amount: number;
    currency: string;
    stripePaymentId: string;
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'ltv.payment_recorded',
      correlationId,
      aggregateId: payload.leadId,
      aggregateType: 'lead',
      payload,
    });
  } catch (err) {
    logger.error('Failed to emit ltv.payment_recorded event', { err, correlationId });
  }
}

/**
 * Emit high value lead identified event
 */
export async function emitHighValueLeadEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    leadId: string;
    clinicId: string;
    predictedLTV: number;
    tier: string;
    investmentPriority: string;
    confidence: number;
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'ltv.high_value_lead_identified',
      correlationId,
      aggregateId: payload.leadId,
      aggregateType: 'lead',
      payload,
    });
  } catch (err) {
    logger.error('Failed to emit high_value_lead event', { err, correlationId });
  }
}

/**
 * Emit pLTV calculated event
 */
export async function emitPLTVCalculatedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    leadId: string;
    clinicId: string;
    predictedLTV: number;
    tier: string;
    growthPotential: string;
    reason?: string;
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'ltv.pltv_calculated',
      correlationId,
      aggregateId: payload.leadId,
      aggregateType: 'lead',
      payload,
    });
  } catch (err) {
    logger.error('Failed to emit ltv.pltv_calculated event', { err, correlationId });
  }
}
