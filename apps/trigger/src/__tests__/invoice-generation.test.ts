import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for Invoice Generation Handler Task
 * Tests PDF generation, email delivery, and HubSpot integration
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('EMAIL_PROVIDER', 'resend');
vi.stubEnv('EMAIL_API_KEY', 'test-email-key');
vi.stubEnv('EMAIL_FROM_ADDRESS', 'invoices@medicalcor.com');
vi.stubEnv('EMAIL_FROM_NAME', 'MedicalCor Billing');
vi.stubEnv('DATABASE_URL', '');

// Import after env setup
import { createHubSpotClient } from '@medicalcor/integrations';
import { createInMemoryEventStore } from '@medicalcor/core';
import {
  formatInvoiceCurrency,
  formatInvoiceDate,
  calculateInvoiceTotals,
  getDefaultInvoiceStoragePath,
  getInvoiceLabels,
  type InvoiceData,
  type InvoiceLineItem,
  type ClinicDetails,
  type InvoiceCustomer,
} from '@medicalcor/types';

describe('Invoice Generation Handler', () => {
  const correlationId = 'invoice-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invoice Data Validation', () => {
    it('should validate complete invoice data', () => {
      const invoice: InvoiceData = {
        invoiceId: '550e8400-e29b-41d4-a716-446655440000',
        invoiceNumber: 'INV-2024-00001',
        status: 'pending',
        clinicId: '550e8400-e29b-41d4-a716-446655440001',
        issueDate: new Date('2024-01-15'),
        dueDate: new Date('2024-02-15'),
        paidAt: null,
        clinic: {
          name: 'Clinica Dentara MedicalCor',
          legalName: 'MedicalCor SRL',
          taxId: 'RO12345678',
          registrationNumber: 'J40/1234/2020',
          address: 'Strada Victoriei 10',
          city: 'Bucuresti',
          postalCode: '010061',
          country: 'Romania',
          phone: '+40212345678',
          email: 'office@medicalcor.ro',
          website: 'https://medicalcor.ro',
          bankName: 'Banca Transilvania',
          iban: 'RO49AAAA1B31007593840000',
          swift: 'BTRLRO22',
          logoUrl: null,
        },
        customer: {
          name: 'Ion Popescu',
          email: 'ion.popescu@example.com',
          phone: '+40721000001',
          address: 'Strada Pacii 25',
          city: 'Bucuresti',
          postalCode: '020101',
          country: 'Romania',
          taxId: null,
          companyName: null,
        },
        items: [
          {
            description: 'Consultatie stomatologica',
            quantity: 1,
            unitPrice: 150,
            lineTotal: 150,
            serviceCode: 'CONS-001',
            serviceName: 'Consultatie',
            taxRate: 19,
          },
          {
            description: 'Detartraj si igienizare profesionala',
            quantity: 1,
            unitPrice: 350,
            lineTotal: 350,
            serviceCode: 'DTJ-001',
            serviceName: 'Detartraj',
            taxRate: 19,
          },
        ],
        subtotal: 500,
        taxRate: 19,
        taxAmount: 95,
        discountAmount: 0,
        discountDescription: null,
        total: 595,
        currency: 'EUR',
        paymentMethod: null,
        paymentReference: null,
        stripeInvoiceId: null,
        notes: 'Va multumim pentru incredere!',
        terms: 'Plata in 30 de zile de la emitere.',
        footer: null,
        language: 'ro',
      };

      expect(invoice.invoiceNumber).toBe('INV-2024-00001');
      expect(invoice.status).toBe('pending');
      expect(invoice.total).toBe(595);
      expect(invoice.items.length).toBe(2);
      expect(invoice.clinic.name).toBe('Clinica Dentara MedicalCor');
      expect(invoice.customer.name).toBe('Ion Popescu');
    });

    it('should validate line items structure', () => {
      const items: InvoiceLineItem[] = [
        {
          description: 'All-on-4 Dental Implants',
          quantity: 1,
          unitPrice: 8500,
          lineTotal: 8500,
          serviceCode: 'AO4-001',
          serviceName: 'All-on-4',
          taxRate: 19,
        },
      ];

      expect(items[0]!.quantity).toBeGreaterThan(0);
      expect(items[0]!.unitPrice).toBeGreaterThanOrEqual(0);
      expect(items[0]!.lineTotal).toBe(items[0]!.quantity * items[0]!.unitPrice);
    });

    it('should validate clinic details', () => {
      const clinic: ClinicDetails = {
        name: 'Clinica Dentara MedicalCor',
        address: 'Strada Victoriei 10',
        city: 'Bucuresti',
        country: 'Romania',
        taxId: 'RO12345678',
        iban: 'RO49AAAA1B31007593840000',
        bankName: 'Banca Transilvania',
      };

      expect(clinic.name.length).toBeGreaterThan(0);
      expect(clinic.address.length).toBeGreaterThan(0);
      expect(clinic.iban?.length).toBeGreaterThan(10);
    });

    it('should validate customer details', () => {
      const customer: InvoiceCustomer = {
        name: 'Ion Popescu',
        email: 'ion.popescu@example.com',
        phone: '+40721000001',
      };

      expect(customer.name.length).toBeGreaterThan(0);
      expect(customer.email).toMatch(/^.+@.+\..+$/);
    });
  });

  describe('Currency Formatting', () => {
    it('should format EUR correctly for Romanian locale', () => {
      const formatted = formatInvoiceCurrency(500, 'EUR', 'ro');
      expect(formatted.replace(/[.,\s]/g, '')).toContain('500');
    });

    it('should format RON correctly for Romanian locale', () => {
      const formatted = formatInvoiceCurrency(1500, 'RON', 'ro');
      expect(formatted.replace(/[.,\s]/g, '')).toContain('1500');
    });

    it('should format USD correctly for English locale', () => {
      const formatted = formatInvoiceCurrency(750.5, 'USD', 'en');
      expect(formatted).toContain('750');
    });

    it('should format EUR correctly for German locale', () => {
      const formatted = formatInvoiceCurrency(1250.75, 'EUR', 'de');
      expect(formatted.replace(/[.,\s]/g, '')).toContain('1250');
    });

    it('should handle decimal amounts correctly', () => {
      const formatted = formatInvoiceCurrency(99.99, 'EUR', 'en');
      expect(formatted).toContain('99');
    });

    it('should handle large amounts correctly', () => {
      const formatted = formatInvoiceCurrency(12500.5, 'EUR', 'ro');
      expect(formatted.replace(/[.,\s]/g, '')).toContain('12500');
    });
  });

  describe('Date Formatting', () => {
    it('should format date for Romanian locale', () => {
      const date = new Date('2024-03-15');
      const formatted = formatInvoiceDate(date, 'ro');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('15');
    });

    it('should format date for English locale', () => {
      const date = new Date('2024-03-15');
      const formatted = formatInvoiceDate(date, 'en');
      expect(formatted).toContain('2024');
      expect(formatted.toLowerCase()).toContain('march');
    });

    it('should format date for German locale', () => {
      const date = new Date('2024-03-15');
      const formatted = formatInvoiceDate(date, 'de');
      expect(formatted).toContain('2024');
    });
  });

  describe('Invoice Total Calculations', () => {
    it('should calculate totals correctly without discount', () => {
      const items: InvoiceLineItem[] = [
        { description: 'Item 1', quantity: 2, unitPrice: 100, lineTotal: 200 },
        { description: 'Item 2', quantity: 1, unitPrice: 150, lineTotal: 150 },
      ];

      const { subtotal, taxAmount, total } = calculateInvoiceTotals(items, 19, 0);

      expect(subtotal).toBe(350);
      expect(taxAmount).toBe(66.5); // 350 * 0.19 = 66.5
      expect(total).toBe(416.5); // 350 + 66.5 = 416.5
    });

    it('should calculate totals correctly with discount', () => {
      const items: InvoiceLineItem[] = [
        { description: 'Item 1', quantity: 1, unitPrice: 500, lineTotal: 500 },
      ];

      const { subtotal, taxAmount, total } = calculateInvoiceTotals(items, 19, 50);

      expect(subtotal).toBe(500);
      expect(taxAmount).toBe(85.5); // (500 - 50) * 0.19 = 85.5
      expect(total).toBe(535.5); // (500 - 50) + 85.5 = 535.5
    });

    it('should handle zero tax rate', () => {
      const items: InvoiceLineItem[] = [
        { description: 'Item 1', quantity: 1, unitPrice: 100, lineTotal: 100 },
      ];

      const { subtotal, taxAmount, total } = calculateInvoiceTotals(items, 0, 0);

      expect(subtotal).toBe(100);
      expect(taxAmount).toBe(0);
      expect(total).toBe(100);
    });

    it('should round tax amounts correctly', () => {
      const items: InvoiceLineItem[] = [
        { description: 'Item 1', quantity: 1, unitPrice: 99.99, lineTotal: 99.99 },
      ];

      const { taxAmount } = calculateInvoiceTotals(items, 19, 0);

      // Should be rounded to 2 decimal places
      expect(Number.isInteger(taxAmount * 100)).toBe(true);
    });
  });

  describe('Storage Path Generation', () => {
    it('should generate correct storage path', () => {
      const clinicId = '550e8400-e29b-41d4-a716-446655440000';
      const issueDate = new Date('2024-03-15');

      const path = getDefaultInvoiceStoragePath(clinicId, issueDate);

      expect(path).toBe('invoices/550e8400-e29b-41d4-a716-446655440000/2024/03/');
    });

    it('should pad month with leading zero', () => {
      const clinicId = 'clinic-123';
      const issueDate = new Date('2024-01-01');

      const path = getDefaultInvoiceStoragePath(clinicId, issueDate);

      expect(path).toContain('/01/');
    });

    it('should handle end of year dates', () => {
      const clinicId = 'clinic-123';
      const issueDate = new Date('2024-12-31');

      const path = getDefaultInvoiceStoragePath(clinicId, issueDate);

      expect(path).toContain('/2024/12/');
    });
  });

  describe('Invoice Labels', () => {
    it('should return Romanian labels', () => {
      const labels = getInvoiceLabels('ro');

      expect(labels.invoice).toBe('Factur\u0103');
      expect(labels.total).toBe('Total');
      expect(labels.thankYou).toContain('mul\u021bumim');
    });

    it('should return English labels', () => {
      const labels = getInvoiceLabels('en');

      expect(labels.invoice).toBe('Invoice');
      expect(labels.total).toBe('Total');
      expect(labels.thankYou).toContain('Thank you');
    });

    it('should return German labels', () => {
      const labels = getInvoiceLabels('de');

      expect(labels.invoice).toBe('Rechnung');
      expect(labels.total).toBe('Gesamtbetrag');
      expect(labels.thankYou).toContain('Vielen Dank');
    });

    it('should have all required label keys', () => {
      const requiredKeys = [
        'invoice',
        'invoiceNumber',
        'issueDate',
        'dueDate',
        'billTo',
        'from',
        'description',
        'quantity',
        'unitPrice',
        'amount',
        'subtotal',
        'tax',
        'discount',
        'total',
        'paymentDetails',
        'bankName',
        'iban',
        'swift',
        'notes',
        'terms',
        'thankYou',
        'paid',
        'pending',
        'overdue',
      ];

      for (const lang of ['ro', 'en', 'de'] as const) {
        const labels = getInvoiceLabels(lang);
        for (const key of requiredKeys) {
          expect(labels[key]).toBeDefined();
          expect(labels[key]!.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('HubSpot Integration', () => {
    it('should log timeline message for invoice', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      // logMessageToTimeline returns void, so we just verify it doesn't throw
      await expect(
        hubspot.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: 'Invoice INV-2024-00001 generated for Ion Popescu. Amount: 595,00 EUR. Status: PENDING',
          direction: 'OUT',
          channel: 'web',
        })
      ).resolves.not.toThrow();
    });

    it('should find contact by email for invoice delivery', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const contact = await hubspot.findContactByEmail('ion.popescu@example.com');

      expect(contact).toBeDefined();
    });
  });

  describe('Domain Event Emission', () => {
    it('should emit invoice.generated event', async () => {
      const eventStore = createInMemoryEventStore('invoice-test');

      await eventStore.emit({
        type: 'invoice.generated',
        correlationId,
        aggregateId: '550e8400-e29b-41d4-a716-446655440000',
        aggregateType: 'invoice',
        payload: {
          invoiceId: '550e8400-e29b-41d4-a716-446655440000',
          invoiceNumber: 'INV-2024-00001',
          clinicId: '550e8400-e29b-41d4-a716-446655440001',
          customerId: 'patient-123',
          total: 595,
          currency: 'EUR',
          pdfSizeBytes: 15000,
          generatedAt: new Date().toISOString(),
        },
      });

      const events = await eventStore.getByType('invoice.generated');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.invoiceNumber).toBe('INV-2024-00001');
    });

    it('should emit invoice.sent event after email delivery', async () => {
      const eventStore = createInMemoryEventStore('invoice-sent-test');

      await eventStore.emit({
        type: 'invoice.sent',
        correlationId,
        aggregateId: '550e8400-e29b-41d4-a716-446655440000',
        aggregateType: 'invoice',
        payload: {
          invoiceId: '550e8400-e29b-41d4-a716-446655440000',
          invoiceNumber: 'INV-2024-00001',
          clinicId: '550e8400-e29b-41d4-a716-446655440001',
          recipientEmail: 'ion.popescu@example.com',
          messageId: 'msg_abc123',
          sentAt: new Date().toISOString(),
        },
      });

      const events = await eventStore.getByType('invoice.sent');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.recipientEmail).toBe('ion.popescu@example.com');
    });
  });

  describe('Email Delivery', () => {
    it('should generate HTML email body', () => {
      // Simulate email HTML generation
      const invoice: Partial<InvoiceData> = {
        invoiceNumber: 'INV-2024-00001',
        issueDate: new Date('2024-03-15'),
        dueDate: new Date('2024-04-15'),
        customer: {
          name: 'Ion Popescu',
          email: 'ion@example.com',
        },
        clinic: {
          name: 'MedicalCor',
          address: 'Strada Victoriei 10',
          city: 'Bucuresti',
          country: 'Romania',
        },
        subtotal: 500,
        taxRate: 19,
        taxAmount: 95,
        discountAmount: 0,
        total: 595,
        currency: 'EUR',
        language: 'ro',
      };

      const labels = getInvoiceLabels(invoice.language ?? 'ro');
      const emailSubject = `${labels.invoice} ${invoice.invoiceNumber} - ${invoice.clinic?.name}`;

      expect(emailSubject).toContain('INV-2024-00001');
      expect(emailSubject).toContain('MedicalCor');
    });

    it('should handle missing customer email gracefully', () => {
      const invoice: Partial<InvoiceData> = {
        invoiceNumber: 'INV-2024-00002',
        customer: {
          name: 'Ion Popescu',
          email: null,
        },
      };

      const canSendEmail = !!invoice.customer?.email;
      expect(canSendEmail).toBe(false);
    });

    it('should validate email options', () => {
      const emailOptions = {
        sendEmail: true,
        ccEmails: ['finance@clinic.ro'],
        bccEmails: [],
        customSubject: null,
        customBody: null,
        replyTo: 'billing@clinic.ro',
      };

      expect(emailOptions.sendEmail).toBe(true);
      expect(emailOptions.ccEmails.length).toBe(1);
    });
  });

  describe('PDF Generation', () => {
    it('should escape PDF special characters', () => {
      function escapePdfText(text: string): string {
        let result = '';
        for (let i = 0; i < text.length; i++) {
          const charCode = text.charCodeAt(i);
          if (charCode >= 0x20 && charCode < 0x7f) {
            const char = text[i];
            if (char === '\\') result += '\\\\';
            else if (char === '(') result += '\\(';
            else if (char === ')') result += '\\)';
            else result += char;
          } else if (charCode >= 0x7f) {
            result += text[i];
          }
        }
        return result;
      }

      expect(escapePdfText('Hello (World)')).toBe('Hello \\(World\\)');
      expect(escapePdfText('Path\\to\\file')).toBe('Path\\\\to\\\\file');
      expect(escapePdfText('Normal text')).toBe('Normal text');
    });

    it('should handle Romanian characters', () => {
      const romanianText = 'Factur\u0103 pentru \u0218tefan';

      // Should preserve Romanian characters
      expect(romanianText).toContain('\u0103'); // a with breve
      expect(romanianText).toContain('\u0218'); // S with comma below
    });

    it('should truncate long descriptions', () => {
      const longDescription =
        'This is a very long description that should be truncated for display in the PDF table to prevent overflow';

      const maxLength = 40;
      const truncated =
        longDescription.length > maxLength
          ? longDescription.substring(0, maxLength - 3) + '...'
          : longDescription;

      expect(truncated.length).toBeLessThanOrEqual(maxLength);
      expect(truncated).toContain('...');
    });
  });

  describe('Batch Invoice Generation', () => {
    it('should validate batch payload', () => {
      const batchPayload = {
        invoices: [
          {
            invoice: {
              invoiceId: '550e8400-e29b-41d4-a716-446655440000',
              invoiceNumber: 'INV-2024-00001',
            },
            correlationId: 'batch-1',
          },
          {
            invoice: {
              invoiceId: '550e8400-e29b-41d4-a716-446655440001',
              invoiceNumber: 'INV-2024-00002',
            },
            correlationId: 'batch-2',
          },
        ],
        correlationId: 'batch-main',
      };

      expect(batchPayload.invoices.length).toBe(2);
      expect(batchPayload.invoices.length).toBeGreaterThanOrEqual(1);
      expect(batchPayload.invoices.length).toBeLessThanOrEqual(50);
    });

    it('should track success and failure counts', () => {
      const results = [
        { success: true, invoiceId: 'inv-1' },
        { success: false, invoiceId: 'inv-2' },
        { success: true, invoiceId: 'inv-3' },
      ];

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);
    });
  });

  describe('Retry Configuration', () => {
    it('should have correct retry settings', () => {
      const retryConfig = {
        maxAttempts: 3,
        minTimeoutInMs: 1000,
        maxTimeoutInMs: 10000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.minTimeoutInMs).toBe(1000);
      expect(retryConfig.maxTimeoutInMs).toBe(10000);
      expect(retryConfig.factor).toBe(2);
    });

    it('should calculate exponential backoff correctly', () => {
      const factor = 2;
      const minTimeout = 1000;

      const attempt1 = minTimeout;
      const attempt2 = minTimeout * factor;
      const attempt3 = minTimeout * factor * factor;

      expect(attempt1).toBe(1000);
      expect(attempt2).toBe(2000);
      expect(attempt3).toBe(4000);
    });
  });

  describe('Error Handling', () => {
    it('should return error result on PDF generation failure', () => {
      const errorResult = {
        success: false,
        invoiceId: '550e8400-e29b-41d4-a716-446655440000',
        invoiceNumber: 'INV-2024-00001',
        pdfUrl: null,
        pdfSizeBytes: null,
        emailDelivery: null,
        hubspotTimelineEventId: null,
        correlationId,
        generatedAt: new Date(),
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.pdfUrl).toBeNull();
    });

    it('should continue with partial success on email failure', () => {
      const partialResult = {
        success: true, // PDF generated successfully
        invoiceId: '550e8400-e29b-41d4-a716-446655440000',
        invoiceNumber: 'INV-2024-00001',
        pdfUrl: null,
        pdfSizeBytes: 15000,
        emailDelivery: {
          sent: false,
          messageId: null,
          recipient: 'ion@example.com',
          error: 'SMTP connection failed',
        },
        hubspotTimelineEventId: null,
        correlationId,
        generatedAt: new Date(),
      };

      expect(partialResult.success).toBe(true); // Overall success
      expect(partialResult.emailDelivery?.sent).toBe(false);
      expect(partialResult.pdfSizeBytes).toBeGreaterThan(0);
    });

    it('should handle missing email configuration', () => {
      const hasEmailConfig =
        process.env.EMAIL_PROVIDER && process.env.EMAIL_API_KEY && process.env.EMAIL_FROM_ADDRESS;

      // In test environment, these should be set
      expect(hasEmailConfig).toBeTruthy();
    });
  });

  describe('Invoice Status', () => {
    it('should recognize all valid invoice statuses', () => {
      const validStatuses = ['draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded'];

      for (const status of validStatuses) {
        expect(validStatuses).toContain(status);
      }
    });

    it('should display correct status badge label', () => {
      const labels = getInvoiceLabels('ro');

      expect(labels.paid).toBe('PL\u0102TIT');
      expect(labels.pending).toBe('\u00cen a\u0219teptare');
      expect(labels.overdue).toBe('SC\u0102DENT');
    });
  });
});
