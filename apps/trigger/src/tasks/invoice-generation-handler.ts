import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients, createEmailChannelAdapter } from '@medicalcor/integrations';
import type { EmailChannelConfig } from '@medicalcor/integrations';
import {
  InvoiceGenerationPayloadSchema,
  type InvoiceGenerationPayload,
  type InvoiceGenerationResult,
  type InvoiceData,
  formatInvoiceCurrency,
  formatInvoiceDate,
  getInvoiceLabels,
} from '@medicalcor/types';

/**
 * Invoice Generation Handler Task
 * Generates professional PDF invoices and delivers them via email
 */

// ============================================
// Constants
// ============================================

const PDF_VERSION = '1.4';
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

// Column widths for items table
const COL_WIDTHS = [200, 60, 80, 80, 75] as const;

// ============================================
// Lazy Client Initialization
// ============================================

function getClients() {
  return createIntegrationClients({
    source: 'invoice-generation-handler',
    includeNotifications: true,
  });
}

function getEmailClient(): ReturnType<typeof createEmailChannelAdapter> | null {
  const provider = process.env.EMAIL_PROVIDER as EmailChannelConfig['provider'] | undefined;
  const apiKey = process.env.EMAIL_API_KEY;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS;

  if (!provider || !apiKey || !fromEmail) {
    return null;
  }

  return createEmailChannelAdapter({
    provider,
    apiKey,
    fromEmail,
    fromName: process.env.EMAIL_FROM_NAME ?? 'MedicalCor',
    sandbox: process.env.NODE_ENV === 'development',
  });
}

// ============================================
// PDF Generation Utilities
// ============================================

function escapePdfText(text: string | undefined): string {
  const safeText = text ?? '';
  let result = '';
  for (let i = 0; i < safeText.length; i++) {
    const charCode = safeText.charCodeAt(i);
    const char = safeText[i] ?? '';
    if (charCode >= 0x20 && charCode < 0x7f) {
      if (char === '\\') result += '\\\\';
      else if (char === '(') result += '\\(';
      else if (char === ')') result += '\\)';
      else result += char;
    } else if (charCode >= 0x7f) {
      result += char;
    }
  }
  return result;
}

function buildPdfHeader(labels: Record<string, string>, invoice: InvoiceData): string {
  let stream = 'BT\n';
  stream += `/F1 24 Tf\n`;
  stream += `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n`;
  stream += `(${escapePdfText((labels.invoice ?? 'INVOICE').toUpperCase())}) Tj\n`;

  stream += `/F1 10 Tf\n`;
  stream += `0 -30 Td\n`;
  stream += `(${escapePdfText(labels.invoiceNumber)}: ${escapePdfText(invoice.invoiceNumber)}) Tj\n`;

  const statusLabel = labels[invoice.status] ?? invoice.status.toUpperCase();
  stream += `350 0 Td\n`;
  stream += `(${escapePdfText(statusLabel)}) Tj\n`;
  stream += `-350 0 Td\n`;

  stream += `0 -15 Td\n`;
  stream += `(${escapePdfText(labels.issueDate)}: ${escapePdfText(formatInvoiceDate(invoice.issueDate, invoice.language))}) Tj\n`;

  stream += `0 -15 Td\n`;
  stream += `(${escapePdfText(labels.dueDate)}: ${escapePdfText(formatInvoiceDate(invoice.dueDate, invoice.language))}) Tj\n`;

  return stream;
}

function buildPdfClinicSection(labels: Record<string, string>, invoice: InvoiceData): string {
  let stream = '';
  stream += `0 -30 Td\n`;
  stream += `/F1 12 Tf\n`;
  stream += `(${escapePdfText(labels.from)}:) Tj\n`;
  stream += `/F1 10 Tf\n`;
  stream += `0 -15 Td\n`;
  stream += `(${escapePdfText(invoice.clinic.name)}) Tj\n`;

  if (invoice.clinic.address) {
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.clinic.address)}) Tj\n`;
  }
  if (invoice.clinic.city) {
    const postalSuffix = invoice.clinic.postalCode ? `, ${invoice.clinic.postalCode}` : '';
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.clinic.city + postalSuffix)}) Tj\n`;
  }
  if (invoice.clinic.taxId) {
    stream += `0 -12 Td\n`;
    stream += `(CUI: ${escapePdfText(invoice.clinic.taxId)}) Tj\n`;
  }
  if (invoice.clinic.phone) {
    stream += `0 -12 Td\n`;
    stream += `(Tel: ${escapePdfText(invoice.clinic.phone)}) Tj\n`;
  }
  if (invoice.clinic.email) {
    stream += `0 -12 Td\n`;
    stream += `(Email: ${escapePdfText(invoice.clinic.email)}) Tj\n`;
  }

  return stream;
}

function buildPdfCustomerSection(labels: Record<string, string>, invoice: InvoiceData): string {
  let stream = '';
  stream += `250 84 Td\n`;
  stream += `/F1 12 Tf\n`;
  stream += `(${escapePdfText(labels.billTo)}:) Tj\n`;
  stream += `/F1 10 Tf\n`;
  stream += `0 -15 Td\n`;
  stream += `(${escapePdfText(invoice.customer.name)}) Tj\n`;

  if (invoice.customer.companyName) {
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.customer.companyName)}) Tj\n`;
  }
  if (invoice.customer.address) {
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.customer.address)}) Tj\n`;
  }
  if (invoice.customer.city) {
    const postalSuffix = invoice.customer.postalCode ? `, ${invoice.customer.postalCode}` : '';
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.customer.city + postalSuffix)}) Tj\n`;
  }
  if (invoice.customer.email) {
    stream += `0 -12 Td\n`;
    stream += `(${escapePdfText(invoice.customer.email)}) Tj\n`;
  }
  if (invoice.customer.taxId) {
    stream += `0 -12 Td\n`;
    stream += `(CUI: ${escapePdfText(invoice.customer.taxId)}) Tj\n`;
  }

  stream += `-250 -60 Td\n`;
  return stream;
}

function buildPdfItemsTable(
  labels: Record<string, string>,
  invoice: InvoiceData,
  yStart: number
): string {
  let stream = '';

  stream += `/F1 11 Tf\n`;
  stream += `(${escapePdfText(labels.description)}) Tj\n`;
  stream += `${COL_WIDTHS[0]} 0 Td\n`;
  stream += `(${escapePdfText(labels.quantity)}) Tj\n`;
  stream += `${COL_WIDTHS[1]} 0 Td\n`;
  stream += `(${escapePdfText(labels.unitPrice)}) Tj\n`;
  stream += `${COL_WIDTHS[2]} 0 Td\n`;
  stream += `(${escapePdfText(labels.amount)}) Tj\n`;

  const colOffset = COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2];
  stream += `${-colOffset} -20 Td\n`;

  stream += `ET\n`;
  stream += `q\n0.5 w\n`;
  stream += `${MARGIN} ${yStart - 170} m\n`;
  stream += `${PAGE_WIDTH - MARGIN} ${yStart - 170} l\n`;
  stream += `S\nQ\n`;
  stream += `BT\n/F1 10 Tf\n`;
  stream += `${MARGIN} ${yStart - 185} Td\n`;

  for (const item of invoice.items) {
    const desc =
      item.description.length > 40 ? item.description.substring(0, 37) + '...' : item.description;
    stream += `(${escapePdfText(desc)}) Tj\n`;
    stream += `${COL_WIDTHS[0]} 0 Td\n`;
    stream += `(${item.quantity}) Tj\n`;
    stream += `${COL_WIDTHS[1]} 0 Td\n`;
    stream += `(${escapePdfText(formatInvoiceCurrency(item.unitPrice, invoice.currency, invoice.language))}) Tj\n`;
    stream += `${COL_WIDTHS[2]} 0 Td\n`;
    stream += `(${escapePdfText(formatInvoiceCurrency(item.lineTotal, invoice.currency, invoice.language))}) Tj\n`;
    stream += `${-colOffset} -14 Td\n`;
  }

  return stream;
}

function buildPdfTotals(
  labels: Record<string, string>,
  invoice: InvoiceData,
  yPos: number
): string {
  let stream = '';
  const rightX = PAGE_WIDTH - MARGIN - 200;

  stream += `ET\nq\n0.5 w\n`;
  stream += `${rightX} ${yPos} m\n`;
  stream += `${PAGE_WIDTH - MARGIN} ${yPos} l\n`;
  stream += `S\nQ\n`;
  stream += `BT\n/F1 10 Tf\n`;
  stream += `${rightX} ${yPos - 15} Td\n`;

  stream += `(${escapePdfText(labels.subtotal)}:) Tj\n`;
  stream += `130 0 Td\n`;
  stream += `(${escapePdfText(formatInvoiceCurrency(invoice.subtotal, invoice.currency, invoice.language))}) Tj\n`;
  stream += `-130 -14 Td\n`;

  if (invoice.discountAmount > 0) {
    stream += `(${escapePdfText(labels.discount)}:) Tj\n`;
    stream += `130 0 Td\n`;
    stream += `(-${escapePdfText(formatInvoiceCurrency(invoice.discountAmount, invoice.currency, invoice.language))}) Tj\n`;
    stream += `-130 -14 Td\n`;
  }

  stream += `(${escapePdfText(labels.tax)} (${invoice.taxRate}%):) Tj\n`;
  stream += `130 0 Td\n`;
  stream += `(${escapePdfText(formatInvoiceCurrency(invoice.taxAmount, invoice.currency, invoice.language))}) Tj\n`;
  stream += `-130 -18 Td\n`;

  stream += `/F1 12 Tf\n`;
  stream += `(${escapePdfText(labels.total)}:) Tj\n`;
  stream += `130 0 Td\n`;
  stream += `(${escapePdfText(formatInvoiceCurrency(invoice.total, invoice.currency, invoice.language))}) Tj\n`;

  return stream;
}

function buildPdfFooter(labels: Record<string, string>, invoice: InvoiceData): string {
  let stream = '';

  if (invoice.clinic.iban) {
    stream += `-130 -40 Td\n`;
    stream += `${-(PAGE_WIDTH - MARGIN - 200 - MARGIN)} 0 Td\n`;
    stream += `/F1 11 Tf\n`;
    stream += `(${escapePdfText(labels.paymentDetails)}:) Tj\n`;
    stream += `/F1 10 Tf\n`;

    if (invoice.clinic.bankName) {
      stream += `0 -14 Td\n`;
      stream += `(${escapePdfText(labels.bankName)}: ${escapePdfText(invoice.clinic.bankName)}) Tj\n`;
    }
    stream += `0 -14 Td\n`;
    stream += `(${escapePdfText(labels.iban)}: ${escapePdfText(invoice.clinic.iban)}) Tj\n`;

    if (invoice.clinic.swift) {
      stream += `0 -14 Td\n`;
      stream += `(${escapePdfText(labels.swift)}: ${escapePdfText(invoice.clinic.swift)}) Tj\n`;
    }
  }

  if (invoice.notes) {
    stream += `0 -30 Td\n`;
    stream += `/F1 11 Tf\n`;
    stream += `(${escapePdfText(labels.notes)}:) Tj\n`;
    stream += `/F1 9 Tf\n`;
    stream += `0 -12 Td\n`;
    for (const line of invoice.notes.split('\n').slice(0, 3)) {
      stream += `(${escapePdfText(line.substring(0, 80))}) Tj\n`;
      stream += `0 -11 Td\n`;
    }
  }

  stream += `0 -30 Td\n`;
  stream += `/F1 10 Tf\n`;
  stream += `(${escapePdfText(labels.thankYou)}) Tj\n`;
  stream += 'ET';

  return stream;
}

function generateInvoicePdf(invoice: InvoiceData): Buffer {
  const labels = getInvoiceLabels(invoice.language);
  const objects: string[] = [];
  let objectCount = 0;
  const xref: number[] = [];

  function addObject(content: string): number {
    objectCount++;
    objects.push(`${objectCount} 0 obj\n${content}\nendobj\n`);
    return objectCount;
  }

  const pdfHeader = `%PDF-${PDF_VERSION}\n%\xff\xff\xff\xff\n`;

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  let stream = buildPdfHeader(labels, invoice);
  stream += buildPdfClinicSection(labels, invoice);
  stream += buildPdfCustomerSection(labels, invoice);
  stream += buildPdfItemsTable(labels, invoice, PAGE_HEIGHT - MARGIN);

  const itemsHeight = invoice.items.length * 14 + 40;
  const totalsY = PAGE_HEIGHT - MARGIN - 200 - itemsHeight;
  stream += buildPdfTotals(labels, invoice, totalsY);
  stream += buildPdfFooter(labels, invoice);

  const contentObjId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const fontObjId = addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  );

  const pageContent = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`;
  objects.splice(2, 0, `3 0 obj\n${pageContent}\nendobj\n`);
  objectCount = objects.length;

  let pdf = pdfHeader;
  let offset = pdfHeader.length;
  for (const obj of objects) {
    xref.push(offset);
    offset += obj.length;
  }
  pdf += objects.join('');

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of xref) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

function generateEmailHtml(invoice: InvoiceData): string {
  const labels = getInvoiceLabels(invoice.language);
  const greeting =
    invoice.language === 'ro' ? 'Stimate' : invoice.language === 'de' ? 'Sehr geehrte(r)' : 'Dear';
  const bodyText =
    invoice.language === 'ro'
      ? 'V\u0103 transmitem ata\u0219at factura pentru serviciile prestate.'
      : invoice.language === 'de'
        ? 'Im Anhang finden Sie Ihre Rechnung f\u00fcr die erbrachten Leistungen.'
        : 'Please find attached your invoice for the services provided.';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}.summary{background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0}.summary-row{display:flex;justify-content:space-between;margin-bottom:10px}.total-row{font-weight:bold;font-size:18px;border-top:2px solid #ddd;padding-top:10px}</style></head><body><h1>${labels.invoice} ${invoice.invoiceNumber}</h1><p>${greeting} ${invoice.customer.name},</p><p>${bodyText}</p><div class="summary"><div class="summary-row"><span>${labels.subtotal}:</span><span>${formatInvoiceCurrency(invoice.subtotal, invoice.currency, invoice.language)}</span></div>${invoice.discountAmount > 0 ? `<div class="summary-row"><span>${labels.discount}:</span><span>-${formatInvoiceCurrency(invoice.discountAmount, invoice.currency, invoice.language)}</span></div>` : ''}<div class="summary-row"><span>${labels.tax} (${invoice.taxRate}%):</span><span>${formatInvoiceCurrency(invoice.taxAmount, invoice.currency, invoice.language)}</span></div><div class="summary-row total-row"><span>${labels.total}:</span><span>${formatInvoiceCurrency(invoice.total, invoice.currency, invoice.language)}</span></div></div><p><strong>${labels.dueDate}:</strong> ${formatInvoiceDate(invoice.dueDate, invoice.language)}</p><p>${labels.thankYou}</p><p>${invoice.clinic.name}</p></body></html>`;
}

// ============================================
// Main Task Definition
// ============================================

export const InvoiceGenerationPayloadSchemaWithValidation = InvoiceGenerationPayloadSchema;

export type InvoiceGenerationPayloadType = z.infer<
  typeof InvoiceGenerationPayloadSchemaWithValidation
>;

export const generateInvoice = task({
  id: 'generate-invoice',
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: InvoiceGenerationPayload): Promise<InvoiceGenerationResult> => {
    const {
      invoice,
      emailOptions = { sendEmail: false, ccEmails: [], bccEmails: [] },
      correlationId,
      hubspotContactId
    } = payload;
    const { hubspot, eventStore } = getClients();
    const emailClient = getEmailClient();

    logger.info('Starting invoice generation', {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      correlationId,
    });

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = generateInvoicePdf(invoice);
      logger.info('PDF generated', {
        invoiceId: invoice.invoiceId,
        pdfSize: pdfBuffer.length,
        correlationId,
      });
    } catch (err) {
      logger.error('Failed to generate PDF', { err, correlationId });
      return createErrorResult(invoice, correlationId);
    }

    const emailDelivery = await sendInvoiceEmail(
      invoice,
      emailOptions,
      emailClient,
      pdfBuffer,
      correlationId
    );
    const hubspotTimelineEventId = await logToHubSpot(
      hubspot,
      hubspotContactId,
      invoice,
      correlationId
    );
    await emitDomainEvents(
      eventStore,
      invoice,
      payload.patientId ?? null,
      emailDelivery,
      correlationId
    );

    logger.info('Invoice generation completed', {
      invoiceId: invoice.invoiceId,
      success: true,
      emailSent: emailDelivery?.sent ?? false,
      correlationId,
    });

    return {
      success: true,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: null,
      pdfSizeBytes: pdfBuffer.length,
      emailDelivery,
      hubspotTimelineEventId,
      correlationId,
      generatedAt: new Date(),
    };
  },
});

function createErrorResult(invoice: InvoiceData, correlationId: string): InvoiceGenerationResult {
  return {
    success: false,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl: null,
    pdfSizeBytes: null,
    emailDelivery: null,
    hubspotTimelineEventId: null,
    correlationId,
    generatedAt: new Date(),
  };
}

async function sendInvoiceEmail(
  invoice: InvoiceData,
  emailOptions: InvoiceGenerationPayload['emailOptions'] | undefined,
  emailClient: ReturnType<typeof createEmailChannelAdapter> | null,
  pdfBuffer: Buffer,
  correlationId: string
): Promise<InvoiceGenerationResult['emailDelivery']> {
  const opts = emailOptions ?? { sendEmail: true, ccEmails: [], bccEmails: [] };
  if (!opts.sendEmail || !invoice.customer.email || !emailClient) {
    return null;
  }

  const emailHtml = opts.customBody ?? generateEmailHtml(invoice);
  const defaultSubject = `${getInvoiceLabels(invoice.language).invoice} ${invoice.invoiceNumber} - ${invoice.clinic.name}`;
  const emailSubject = opts.customSubject ?? defaultSubject;

  try {
    const result = await emailClient.send({
      recipient: invoice.customer.email,
      title: emailSubject,
      body: emailHtml,
      htmlBody: emailHtml,
      priority: 'medium',
      correlationId,
      replyTo: opts.replyTo ?? invoice.clinic.email ?? undefined,
      cc: opts.ccEmails,
      bcc: opts.bccEmails,
      attachments: [
        {
          filename: `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
          contentType: 'application/pdf',
          content: pdfBuffer.toString('base64'),
        },
      ],
    });

    // Use type guard pattern to safely access properties
    const resultObj = result as unknown as {
      success: boolean;
      value?: { messageId?: string };
      error?: { message?: string };
    };
    if (resultObj.success && resultObj.value) {
      const msgId = resultObj.value.messageId ?? null;
      return { sent: true, messageId: msgId, recipient: invoice.customer.email, error: null };
    }
    const errorMsg = resultObj.error?.message ?? 'Unknown error';
    return { sent: false, messageId: null, recipient: invoice.customer.email, error: errorMsg };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { sent: false, messageId: null, recipient: invoice.customer.email, error: errorMessage };
  }
}

async function logToHubSpot(
  hubspot: ReturnType<typeof getClients>['hubspot'],
  hubspotContactId: string | undefined | null,
  invoice: InvoiceData,
  correlationId: string
): Promise<string | null> {
  if (!hubspot || !hubspotContactId) return null;

  try {
    const message = `Invoice ${invoice.invoiceNumber} generated for ${invoice.customer.name}. Amount: ${formatInvoiceCurrency(invoice.total, invoice.currency, invoice.language)}. Status: ${invoice.status.toUpperCase()}`;
    await hubspot.logMessageToTimeline({
      contactId: hubspotContactId,
      message,
      direction: 'OUT',
      channel: 'web',
      metadata: {
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        status: invoice.status,
      },
    });
    // Return a generated ID since logMessageToTimeline doesn't return one
    return `invoice-timeline-${invoice.invoiceId}`;
  } catch (err) {
    logger.error('Failed to create HubSpot timeline event', { err, correlationId });
    return null;
  }
}

async function emitDomainEvents(
  eventStore: ReturnType<typeof getClients>['eventStore'],
  invoice: InvoiceData,
  patientId: string | null,
  emailDelivery: InvoiceGenerationResult['emailDelivery'],
  correlationId: string
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'invoice.generated',
      correlationId,
      aggregateId: invoice.invoiceId,
      aggregateType: 'invoice',
      payload: {
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        clinicId: invoice.clinicId,
        customerId: patientId,
        total: invoice.total,
        currency: invoice.currency,
        generatedAt: new Date().toISOString(),
      },
    });

    if (emailDelivery?.sent && invoice.customer.email) {
      await eventStore.emit({
        type: 'invoice.sent',
        correlationId,
        aggregateId: invoice.invoiceId,
        aggregateType: 'invoice',
        payload: {
          invoiceId: invoice.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          clinicId: invoice.clinicId,
          recipientEmail: invoice.customer.email,
          messageId: emailDelivery.messageId,
          sentAt: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    logger.error('Failed to emit domain events', { err, correlationId });
  }
}

// ============================================
// Batch Invoice Generation
// ============================================

export const BatchInvoicePayloadSchema = z.object({
  invoices: z.array(InvoiceGenerationPayloadSchema).min(1).max(50),
  correlationId: z.string(),
});

export type BatchInvoicePayload = z.infer<typeof BatchInvoicePayloadSchema>;

export const generateInvoicesBatch = task({
  id: 'generate-invoices-batch',
  retry: { maxAttempts: 2 },
  run: async (payload: BatchInvoicePayload) => {
    const { invoices, correlationId } = payload;

    logger.info('Starting batch invoice generation', { batchSize: invoices.length, correlationId });

    const results: InvoiceGenerationResult[] = [];

    for (const invoicePayload of invoices) {
      try {
        const taskResult = await generateInvoice.triggerAndWait({
          ...invoicePayload,
          correlationId: `${correlationId}-${invoicePayload.invoice.invoiceId}`,
        });
        if (taskResult.ok) {
          results.push(taskResult.output);
        } else {
          results.push(
            createErrorResult(
              invoicePayload.invoice,
              `${correlationId}-${invoicePayload.invoice.invoiceId}`
            )
          );
        }
      } catch {
        results.push(
          createErrorResult(
            invoicePayload.invoice,
            `${correlationId}-${invoicePayload.invoice.invoiceId}`
          )
        );
      }
    }

    const successCount = results.filter((r) => r.success).length;

    logger.info('Batch invoice generation completed', {
      batchSize: invoices.length,
      successCount,
      failureCount: invoices.length - successCount,
      correlationId,
    });

    return {
      correlationId,
      totalInvoices: invoices.length,
      successCount,
      failureCount: invoices.length - successCount,
      results,
    };
  },
});
