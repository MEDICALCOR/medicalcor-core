/**
 * Payment handler shared types
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Loosely typed clients to avoid tight coupling
export type HubSpotClient = any;
export type WhatsAppClient = any;
export type TemplateCatalogClient = any;
export type EventStoreClient = any;

export interface PaymentEventPayload {
  stripePaymentId: string;
  stripeCustomerId?: string | null;
  hubspotContactId?: string;
  amount: number;
  currency: string;
  formattedAmount?: string;
  customerEmail?: string | null;
  phone?: string;
  failureCode?: string;
  failureReason?: string;
}

export interface RefundEventPayload {
  refundId: string;
  originalPaymentId: string;
  hubspotContactId?: string;
  amount: number;
  currency: string;
  reason?: string;
}

/**
 * Format currency amount for display
 */
export function formatCurrency(
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
