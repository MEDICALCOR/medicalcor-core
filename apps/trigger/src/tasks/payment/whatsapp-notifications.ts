/**
 * WhatsApp notifications for payment handler
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { WhatsAppClient, TemplateCatalogClient } from './types.js';
import { formatCurrency } from './types.js';

/**
 * Send payment confirmation via WhatsApp
 */
export async function sendPaymentConfirmation(
  whatsapp: WhatsAppClient | null,
  templateCatalog: TemplateCatalogClient | null,
  params: {
    normalizedPhone: string;
    amount: number;
    currency: string;
  },
  correlationId: string
): Promise<boolean> {
  if (!whatsapp || !templateCatalog) {
    return false;
  }

  const { normalizedPhone, amount, currency } = params;

  try {
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
    return true;
  } catch (err) {
    logger.error('Failed to send WhatsApp confirmation', { err, correlationId });
    return false;
  }
}
