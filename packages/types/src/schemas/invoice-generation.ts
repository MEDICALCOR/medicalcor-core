/**
 * @fileoverview Invoice Generation Schemas
 *
 * L3 Feature: Automated invoice PDF generation with email delivery.
 * Defines types for generating professional invoices and sending them to customers.
 *
 * @module types/schemas/invoice-generation
 */

import { z } from 'zod';

// ============================================================================
// INVOICE STATUS
// ============================================================================

/**
 * Invoice status for tracking lifecycle
 */
export const InvoiceStatusSchema = z.enum([
  'draft', // Not yet finalized
  'pending', // Awaiting payment
  'paid', // Payment received
  'overdue', // Past due date
  'cancelled', // Invoice cancelled
  'refunded', // Payment refunded
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// ============================================================================
// INVOICE LINE ITEM
// ============================================================================

/**
 * Individual line item on an invoice
 */
export const InvoiceLineItemSchema = z.object({
  /** Item description */
  description: z.string().min(1).max(500),
  /** Quantity of items */
  quantity: z.number().positive(),
  /** Unit price in major currency units (e.g., EUR, not cents) */
  unitPrice: z.number().nonnegative(),
  /** Total for this line (quantity * unitPrice) */
  lineTotal: z.number().nonnegative(),
  /** Optional service/procedure code */
  serviceCode: z.string().max(50).nullable().optional(),
  /** Optional service name */
  serviceName: z.string().max(200).nullable().optional(),
  /** Optional line-specific tax rate (percentage, e.g., 19 for 19%) */
  taxRate: z.number().min(0).max(100).nullable().optional(),
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;

// ============================================================================
// CLINIC/BUSINESS DETAILS
// ============================================================================

/**
 * Clinic/business details for invoice header
 */
export const ClinicDetailsSchema = z.object({
  /** Business name */
  name: z.string().min(1).max(255),
  /** Legal business name (if different) */
  legalName: z.string().max(255).nullable().optional(),
  /** Tax identification number (CUI/CIF in Romania) */
  taxId: z.string().max(50).nullable().optional(),
  /** Trade register number */
  registrationNumber: z.string().max(50).nullable().optional(),
  /** Business address */
  address: z.string().max(500),
  /** City */
  city: z.string().max(100),
  /** Postal code */
  postalCode: z.string().max(20).nullable().optional(),
  /** Country */
  country: z.string().max(100).default('Romania'),
  /** Phone number */
  phone: z.string().max(50).nullable().optional(),
  /** Email address */
  email: z.string().email().nullable().optional(),
  /** Website */
  website: z.string().url().nullable().optional(),
  /** Bank name */
  bankName: z.string().max(100).nullable().optional(),
  /** IBAN */
  iban: z.string().max(50).nullable().optional(),
  /** SWIFT/BIC code */
  swift: z.string().max(20).nullable().optional(),
  /** Logo URL for PDF */
  logoUrl: z.string().url().nullable().optional(),
});

export type ClinicDetails = z.infer<typeof ClinicDetailsSchema>;

// ============================================================================
// CUSTOMER DETAILS
// ============================================================================

/**
 * Customer details for invoice
 */
export const InvoiceCustomerSchema = z.object({
  /** Customer full name */
  name: z.string().min(1).max(255),
  /** Customer email for delivery */
  email: z.string().email().nullable().optional(),
  /** Customer phone */
  phone: z.string().max(50).nullable().optional(),
  /** Billing address */
  address: z.string().max(500).nullable().optional(),
  /** City */
  city: z.string().max(100).nullable().optional(),
  /** Postal code */
  postalCode: z.string().max(20).nullable().optional(),
  /** Country */
  country: z.string().max(100).nullable().optional(),
  /** Customer tax ID (for B2B invoices) */
  taxId: z.string().max(50).nullable().optional(),
  /** Company name (for B2B invoices) */
  companyName: z.string().max(255).nullable().optional(),
});

export type InvoiceCustomer = z.infer<typeof InvoiceCustomerSchema>;

// ============================================================================
// INVOICE DATA
// ============================================================================

/**
 * Complete invoice data for PDF generation
 */
export const InvoiceDataSchema = z.object({
  /** Unique invoice ID */
  invoiceId: z.string().uuid(),
  /** Human-readable invoice number (e.g., INV-2024-00001) */
  invoiceNumber: z.string().min(1).max(50),
  /** Invoice status */
  status: InvoiceStatusSchema,
  /** Clinic ID */
  clinicId: z.string().uuid(),
  /** Issue date */
  issueDate: z.coerce.date(),
  /** Due date */
  dueDate: z.coerce.date(),
  /** Payment received date (if paid) */
  paidAt: z.coerce.date().nullable().optional(),

  // Parties
  /** Clinic/business details */
  clinic: ClinicDetailsSchema,
  /** Customer details */
  customer: InvoiceCustomerSchema,

  // Line items
  /** Invoice line items */
  items: z.array(InvoiceLineItemSchema).min(1),

  // Totals
  /** Subtotal before tax and discounts */
  subtotal: z.number().nonnegative(),
  /** Tax rate (percentage) */
  taxRate: z.number().min(0).max(100).default(19),
  /** Tax amount */
  taxAmount: z.number().nonnegative(),
  /** Discount amount */
  discountAmount: z.number().nonnegative().default(0),
  /** Discount description */
  discountDescription: z.string().max(200).nullable().optional(),
  /** Grand total */
  total: z.number().nonnegative(),
  /** Currency code */
  currency: z.string().length(3).default('EUR'),

  // Payment info
  /** Payment method used */
  paymentMethod: z.string().max(100).nullable().optional(),
  /** Payment reference (transaction ID, check number, etc.) */
  paymentReference: z.string().max(100).nullable().optional(),
  /** Stripe invoice ID if created via Stripe */
  stripeInvoiceId: z.string().nullable().optional(),

  // Additional
  /** Notes to display on invoice */
  notes: z.string().max(1000).nullable().optional(),
  /** Terms and conditions */
  terms: z.string().max(2000).nullable().optional(),
  /** Footer text */
  footer: z.string().max(500).nullable().optional(),

  // Language
  /** Language for invoice content */
  language: z.enum(['ro', 'en', 'de']).default('ro'),
});

export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

// ============================================================================
// EMAIL DELIVERY OPTIONS
// ============================================================================

/**
 * Email delivery options for invoice
 */
export const InvoiceEmailOptionsSchema = z.object({
  /** Send email to customer */
  sendEmail: z.boolean().default(true),
  /** Additional CC recipients */
  ccEmails: z.array(z.string().email()).default([]),
  /** Additional BCC recipients */
  bccEmails: z.array(z.string().email()).default([]),
  /** Custom email subject (default: "Invoice {number} from {clinic}") */
  customSubject: z.string().max(200).nullable().optional(),
  /** Custom email body (HTML supported) */
  customBody: z.string().max(5000).nullable().optional(),
  /** Reply-to email */
  replyTo: z.string().email().nullable().optional(),
});

export type InvoiceEmailOptions = z.infer<typeof InvoiceEmailOptionsSchema>;

// ============================================================================
// INVOICE GENERATION PAYLOAD
// ============================================================================

/**
 * Payload for invoice generation trigger task
 */
export const InvoiceGenerationPayloadSchema = z.object({
  /** Invoice data */
  invoice: InvoiceDataSchema,
  /** Email delivery options */
  emailOptions: InvoiceEmailOptionsSchema.optional().default({}),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Whether to store the generated PDF */
  storePdf: z.boolean().default(true),
  /** Storage path prefix (default: invoices/{clinicId}/{year}/{month}/) */
  storagePath: z.string().max(500).nullable().optional(),
  /** HubSpot contact ID to log invoice */
  hubspotContactId: z.string().nullable().optional(),
  /** Patient/Lead ID for reference */
  patientId: z.string().uuid().nullable().optional(),
  /** Case ID for reference */
  caseId: z.string().uuid().nullable().optional(),
});

export type InvoiceGenerationPayload = z.infer<typeof InvoiceGenerationPayloadSchema>;

// ============================================================================
// INVOICE GENERATION RESULT
// ============================================================================

/**
 * Result from invoice generation task
 */
export const InvoiceGenerationResultSchema = z.object({
  /** Success status */
  success: z.boolean(),
  /** Invoice ID */
  invoiceId: z.string().uuid(),
  /** Invoice number */
  invoiceNumber: z.string(),
  /** Generated PDF URL (if stored) */
  pdfUrl: z.string().url().nullable(),
  /** PDF size in bytes */
  pdfSizeBytes: z.number().int().nonnegative().nullable(),
  /** Email delivery result */
  emailDelivery: z
    .object({
      /** Email sent successfully */
      sent: z.boolean(),
      /** Email message ID */
      messageId: z.string().nullable(),
      /** Recipient email */
      recipient: z.string().email().nullable(),
      /** Error message if failed */
      error: z.string().nullable(),
    })
    .nullable(),
  /** HubSpot timeline event ID if logged */
  hubspotTimelineEventId: z.string().nullable(),
  /** Correlation ID */
  correlationId: z.string(),
  /** Generation timestamp */
  generatedAt: z.coerce.date(),
});

export type InvoiceGenerationResult = z.infer<typeof InvoiceGenerationResultSchema>;

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

/**
 * Event emitted when invoice is generated
 */
export const InvoiceGeneratedEventSchema = z.object({
  type: z.literal('invoice.generated'),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  clinicId: z.string().uuid(),
  customerId: z.string().nullable(),
  total: z.number().nonnegative(),
  currency: z.string(),
  pdfUrl: z.string().url().nullable(),
  generatedAt: z.coerce.date(),
  correlationId: z.string(),
});

export type InvoiceGeneratedEvent = z.infer<typeof InvoiceGeneratedEventSchema>;

/**
 * Event emitted when invoice is sent via email
 */
export const InvoiceSentEventSchema = z.object({
  type: z.literal('invoice.sent'),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  clinicId: z.string().uuid(),
  recipientEmail: z.string().email(),
  messageId: z.string().nullable(),
  sentAt: z.coerce.date(),
  correlationId: z.string(),
});

export type InvoiceSentEvent = z.infer<typeof InvoiceSentEventSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format currency amount for display
 */
export function formatInvoiceCurrency(
  amount: number,
  currency: string,
  language: 'ro' | 'en' | 'de' = 'ro'
): string {
  const locales: Record<string, string> = {
    ro: 'ro-RO',
    en: 'en-US',
    de: 'de-DE',
  };

  return new Intl.NumberFormat(locales[language], {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for invoice display
 */
export function formatInvoiceDate(date: Date, language: 'ro' | 'en' | 'de' = 'ro'): string {
  const locales: Record<string, string> = {
    ro: 'ro-RO',
    en: 'en-US',
    de: 'de-DE',
  };

  return new Intl.DateTimeFormat(locales[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Calculate invoice totals from line items
 */
export function calculateInvoiceTotals(
  items: InvoiceLineItem[],
  taxRate: number,
  discountAmount = 0
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

  return { subtotal, taxAmount, total };
}

/**
 * Generate default storage path for invoice PDF
 */
export function getDefaultInvoiceStoragePath(clinicId: string, issueDate: Date): string {
  const year = issueDate.getFullYear();
  const month = String(issueDate.getMonth() + 1).padStart(2, '0');
  return `invoices/${clinicId}/${year}/${month}/`;
}

/**
 * Get localized invoice labels
 */
export function getInvoiceLabels(language: 'ro' | 'en' | 'de'): Record<string, string> {
  const labels: {
    ro: Record<string, string>;
    en: Record<string, string>;
    de: Record<string, string>;
  } = {
    ro: {
      invoice: 'Factur\u0103',
      invoiceNumber: 'Num\u0103r factur\u0103',
      issueDate: 'Data emiterii',
      dueDate: 'Data scaden\u021bei',
      billTo: 'C\u0103tre',
      from: 'De la',
      description: 'Descriere',
      quantity: 'Cantitate',
      unitPrice: 'Pre\u021b unitar',
      amount: 'Valoare',
      subtotal: 'Subtotal',
      tax: 'TVA',
      discount: 'Reducere',
      total: 'Total',
      paymentDetails: 'Detalii plat\u0103',
      bankName: 'Banc\u0103',
      iban: 'IBAN',
      swift: 'SWIFT',
      notes: 'Note',
      terms: 'Termeni \u0219i condi\u021bii',
      thankYou: 'V\u0103 mul\u021bumim pentru \u00eencredere!',
      paid: 'PL\u0102TIT',
      pending: '\u00cen a\u0219teptare',
      overdue: 'SC\u0102DENT',
    },
    en: {
      invoice: 'Invoice',
      invoiceNumber: 'Invoice Number',
      issueDate: 'Issue Date',
      dueDate: 'Due Date',
      billTo: 'Bill To',
      from: 'From',
      description: 'Description',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      amount: 'Amount',
      subtotal: 'Subtotal',
      tax: 'VAT',
      discount: 'Discount',
      total: 'Total',
      paymentDetails: 'Payment Details',
      bankName: 'Bank',
      iban: 'IBAN',
      swift: 'SWIFT',
      notes: 'Notes',
      terms: 'Terms & Conditions',
      thankYou: 'Thank you for your business!',
      paid: 'PAID',
      pending: 'PENDING',
      overdue: 'OVERDUE',
    },
    de: {
      invoice: 'Rechnung',
      invoiceNumber: 'Rechnungsnummer',
      issueDate: 'Rechnungsdatum',
      dueDate: 'F\u00e4lligkeitsdatum',
      billTo: 'Rechnungsempf\u00e4nger',
      from: 'Von',
      description: 'Beschreibung',
      quantity: 'Menge',
      unitPrice: 'Einzelpreis',
      amount: 'Betrag',
      subtotal: 'Zwischensumme',
      tax: 'MwSt',
      discount: 'Rabatt',
      total: 'Gesamtbetrag',
      paymentDetails: 'Zahlungsinformationen',
      bankName: 'Bank',
      iban: 'IBAN',
      swift: 'SWIFT',
      notes: 'Anmerkungen',
      terms: 'Gesch\u00e4ftsbedingungen',
      thankYou: 'Vielen Dank f\u00fcr Ihr Vertrauen!',
      paid: 'BEZAHLT',
      pending: 'AUSSTEHEND',
      overdue: '\u00dcBERF\u00c4LLIG',
    },
  };

  return labels[language];
}
