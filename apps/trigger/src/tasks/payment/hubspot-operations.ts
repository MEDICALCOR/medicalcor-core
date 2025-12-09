/**
 * HubSpot operations for payment handler
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-return */

import { logger } from '@trigger.dev/sdk/v3';
import type { HubSpotClient } from './types.js';
import { formatCurrency } from './types.js';

/**
 * Upsert contact by email or phone for payment
 */
export async function upsertPaymentContact(
  hubspot: HubSpotClient | null,
  params: {
    customerEmail: string | null;
    normalizedPhone: string | undefined;
    customerName?: string;
  },
  correlationId: string
): Promise<string | undefined> {
  if (!hubspot) {
    logger.warn('HubSpot client not configured', { correlationId });
    return undefined;
  }

  const { customerEmail, normalizedPhone, customerName } = params;

  try {
    // Use atomic upsert operations to prevent race conditions
    if (customerEmail) {
      // Prefer email-based upsert as email is more unique
      const contact = await hubspot.upsertContactByEmail(customerEmail, {
        ...(customerName ? { firstname: customerName } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        lead_source: 'stripe_payment',
      });
      logger.info('Upserted contact by email', { contactId: contact.id, correlationId });
      return contact.id;
    } else if (normalizedPhone) {
      // Fallback to phone-based upsert
      const contact = await hubspot.upsertContactByPhone(normalizedPhone, {
        ...(customerName ? { firstname: customerName } : {}),
        lead_source: 'stripe_payment',
      });
      logger.info('Upserted contact by phone', { contactId: contact.id, correlationId });
      return contact.id;
    }
    return undefined;
  } catch (err) {
    logger.error('Failed to upsert HubSpot contact', { err, correlationId });
    return undefined;
  }
}

/**
 * Log payment to timeline and update lifecycle stage
 */
export async function logPaymentAndUpdateLifecycle(
  hubspot: HubSpotClient,
  params: {
    contactId: string;
    paymentId: string;
    amount: number;
    currency: string;
    customerId: string | null;
  },
  correlationId: string
): Promise<void> {
  const { contactId, paymentId, amount, currency, customerId } = params;

  try {
    // Log payment to timeline
    await hubspot.logPaymentToTimeline({
      contactId,
      paymentId,
      amount,
      currency,
      status: 'succeeded',
    });
    logger.info('Payment logged to timeline', { contactId, correlationId });

    // Update lifecycle stage to customer
    await hubspot.updateContact(contactId, {
      lifecyclestage: 'customer',
      hs_lead_status: 'CONVERTED',
      last_payment_date: new Date().toISOString(),
      last_payment_amount: formatCurrency(amount, currency),
      stripe_customer_id: customerId ?? undefined,
    });
    logger.info('Contact updated to customer lifecycle', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to update HubSpot contact', { err, correlationId });
    throw err;
  }
}

/**
 * Find HubSpot contact by email or phone
 */
export async function findContactByEmailOrPhone(
  hubspot: HubSpotClient,
  customerEmail: string | null,
  normalizedPhone: string | undefined,
  correlationId: string
): Promise<{ contactId: string | undefined; phone: string | undefined }> {
  let hubspotContactId: string | undefined;

  try {
    // Try to find by email
    if (customerEmail) {
      const contact = await hubspot.findContactByEmail(customerEmail);
      hubspotContactId = contact?.id;
    }

    // Try to find by phone
    if (!hubspotContactId && normalizedPhone) {
      const contacts = await hubspot.searchContactsByPhone(normalizedPhone);
      const firstContact = contacts[0];
      if (firstContact) {
        hubspotContactId = firstContact.id;
      }
    }
  } catch (err) {
    logger.error('Failed to find HubSpot contact', { err, correlationId });
  }

  return { contactId: hubspotContactId, phone: normalizedPhone };
}

/**
 * Log failed payment and create follow-up task
 */
export async function handleFailedPayment(
  hubspot: HubSpotClient,
  params: {
    contactId: string;
    paymentId: string;
    amount: number;
    currency: string;
    failureCode?: string;
    failureReason: string;
  },
  correlationId: string
): Promise<void> {
  const { contactId, paymentId, amount, currency, failureCode, failureReason } = params;

  try {
    // Log failed payment to timeline
    await hubspot.logPaymentToTimeline({
      contactId,
      paymentId,
      amount,
      currency,
      status: `failed: ${failureReason}`,
    });

    // Create follow-up task for staff
    await hubspot.createTask({
      contactId,
      subject: `PAYMENT FAILED: ${formatCurrency(amount, currency)}`,
      body: `Payment ID: ${paymentId}\nAmount: ${formatCurrency(amount, currency)}\nReason: ${failureReason}\nCode: ${failureCode ?? 'N/A'}\n\nPlease follow up with the customer to resolve the payment issue.`,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
    });

    logger.info('Created follow-up task for failed payment', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to process failed payment in HubSpot', { err, correlationId });
  }
}

/**
 * Log refund to timeline
 */
export async function logRefundToTimeline(
  hubspot: HubSpotClient,
  params: {
    contactId: string;
    refundId: string;
    amount: number;
    currency: string;
    reason?: string;
  },
  correlationId: string
): Promise<void> {
  const { contactId, refundId, amount, currency, reason } = params;

  try {
    await hubspot.logPaymentToTimeline({
      contactId,
      paymentId: refundId,
      amount: -amount, // Negative to indicate refund
      currency,
      status: `refunded${reason ? `: ${reason}` : ''}`,
    });
    logger.info('Refund logged to timeline', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to log refund to HubSpot', { err, correlationId });
    throw err;
  }
}
