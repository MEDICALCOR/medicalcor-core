import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  WhatsAppClient,
  createWhatsAppClient,
  TemplateCatalogService,
  createTemplateCatalogService,
  TEMPLATE_CATALOG,
} from '../whatsapp.js';
import { handlers, createRateLimitedHandler, createFailingHandler } from '../__mocks__/handlers.js';

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('WhatsAppClient', () => {
  const config = {
    apiKey: 'test-api-key',
    phoneNumberId: 'test-phone-id',
    webhookSecret: 'test-webhook-secret',
  };

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new WhatsAppClient(config);
      expect(client).toBeInstanceOf(WhatsAppClient);
    });

    it('should throw error for missing API key', () => {
      expect(
        () =>
          new WhatsAppClient({
            apiKey: '',
            phoneNumberId: 'test-phone-id',
          })
      ).toThrow();
    });

    it('should throw error for missing phone number ID', () => {
      expect(
        () =>
          new WhatsAppClient({
            apiKey: 'test-api-key',
            phoneNumberId: '',
          })
      ).toThrow();
    });

    it('should use default base URL when not provided', () => {
      const client = new WhatsAppClient(config);
      expect(client).toBeInstanceOf(WhatsAppClient);
    });

    it('should accept custom base URL', () => {
      const client = new WhatsAppClient({
        ...config,
        baseUrl: 'https://custom.360dialog.io/v1',
      });
      expect(client).toBeInstanceOf(WhatsAppClient);
    });

    it('should accept custom retry config', () => {
      const client = new WhatsAppClient({
        ...config,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(client).toBeInstanceOf(WhatsAppClient);
    });
  });

  describe('sendText', () => {
    it('should send text message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendText({
        to: '+40721123456',
        text: 'Hello, this is a test message',
      });

      expect(result.messaging_product).toBe('whatsapp');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toContain('wamid.');
    });

    it('should send text message with preview URL', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendText({
        to: '+40721123456',
        text: 'Check out https://example.com',
        previewUrl: true,
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should validate phone number format', async () => {
      const client = new WhatsAppClient(config);

      await expect(
        client.sendText({
          to: '123', // Too short
          text: 'Test message',
        })
      ).rejects.toThrow();
    });

    it('should validate message text is not empty', async () => {
      const client = new WhatsAppClient(config);

      await expect(
        client.sendText({
          to: '+40721123456',
          text: '',
        })
      ).rejects.toThrow();
    });

    it('should validate message text max length', async () => {
      const client = new WhatsAppClient(config);

      await expect(
        client.sendText({
          to: '+40721123456',
          text: 'x'.repeat(4097), // Over 4096 chars
        })
      ).rejects.toThrow();
    });
  });

  describe('sendTemplate', () => {
    it('should send template message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendTemplate({
        to: '+40721123456',
        templateName: 'appointment_confirmation',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: '25.01.2025' },
              { type: 'text', text: '10:00' },
              { type: 'text', text: 'Clinica Dentara' },
            ],
          },
        ],
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should use default language when not provided', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendTemplate({
        to: '+40721123456',
        templateName: 'welcome_first_contact',
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should validate template name format', async () => {
      const client = new WhatsAppClient(config);

      await expect(
        client.sendTemplate({
          to: '+40721123456',
          templateName: 'Invalid-Template-Name', // Contains uppercase and hyphens
        })
      ).rejects.toThrow();
    });
  });

  describe('sendInteractiveButtons', () => {
    it('should send interactive button message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendInteractiveButtons({
        to: '+40721123456',
        bodyText: 'Would you like to schedule an appointment?',
        buttons: [
          { id: 'yes', title: 'Yes' },
          { id: 'no', title: 'No' },
        ],
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should include header text when provided', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendInteractiveButtons({
        to: '+40721123456',
        headerText: 'Appointment Scheduling',
        bodyText: 'Would you like to schedule?',
        buttons: [{ id: 'yes', title: 'Yes' }],
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should include footer text when provided', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendInteractiveButtons({
        to: '+40721123456',
        bodyText: 'Would you like to schedule?',
        footerText: 'Reply anytime',
        buttons: [{ id: 'yes', title: 'Yes' }],
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('sendInteractiveList', () => {
    it('should send interactive list message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendInteractiveList({
        to: '+40721123456',
        bodyText: 'Select a procedure you are interested in:',
        buttonText: 'View Options',
        sections: [
          {
            title: 'Dental Procedures',
            rows: [
              { id: 'implant', title: 'Dental Implant', description: 'Single tooth replacement' },
              { id: 'all_on_4', title: 'All-on-4', description: 'Full arch restoration' },
            ],
          },
        ],
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('sendImage', () => {
    it('should send image message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendImage({
        to: '+40721123456',
        imageUrl: 'https://example.com/image.jpg',
        caption: 'Our clinic location',
      });

      expect(result.messages).toHaveLength(1);
    });

    it('should send image without caption', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendImage({
        to: '+40721123456',
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('sendDocument', () => {
    it('should send document message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendDocument({
        to: '+40721123456',
        documentUrl: 'https://example.com/doc.pdf',
        filename: 'treatment_plan.pdf',
        caption: 'Your treatment plan',
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('sendLocation', () => {
    it('should send location message', async () => {
      const client = new WhatsAppClient(config);

      const result = await client.sendLocation({
        to: '+40721123456',
        latitude: 44.4268,
        longitude: 26.1025,
        name: 'Dental Clinic',
        address: 'Bucharest, Romania',
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read', async () => {
      const client = new WhatsAppClient(config);

      await expect(client.markAsRead('wamid.123456')).resolves.toBeUndefined();
    });
  });

  describe('webhook signature verification', () => {
    it('should verify valid webhook signature', () => {
      const client = new WhatsAppClient(config);
      const payload = '{"test":"data"}';

      // Generate valid signature
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(payload)
        .digest('hex');

      expect(client.verifyWebhookSignature(payload, `sha256=${expectedSignature}`)).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const client = new WhatsAppClient(config);
      const payload = '{"test":"data"}';

      expect(client.verifyWebhookSignature(payload, 'sha256=invalid')).toBe(false);
    });

    it('should throw when webhook secret not configured', () => {
      const client = new WhatsAppClient({
        apiKey: 'test-api-key',
        phoneNumberId: 'test-phone-id',
      });

      expect(() => client.verifyWebhookSignature('payload', 'signature')).toThrow(
        'Webhook secret not configured'
      );
    });

    it('should validate webhook and throw on invalid signature', () => {
      const client = new WhatsAppClient(config);

      expect(() => client.validateWebhook('payload', 'sha256=invalid')).toThrow(
        'Invalid WhatsApp webhook signature'
      );
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit errors', async () => {
      const client = new WhatsAppClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 10 },
      });

      server.use(createRateLimitedHandler('https://waba.360dialog.io/v1/messages', 'post', 1));

      const result = await client.sendText({
        to: '+40721123456',
        text: 'Test message',
      });

      expect(result).toBeDefined();
    });

    it('should handle 502/503 errors with retry', async () => {
      const client = new WhatsAppClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 10 },
      });

      server.use(createFailingHandler('https://waba.360dialog.io/v1/messages', 'post', 2, 503));

      const result = await client.sendText({
        to: '+40721123456',
        text: 'Test message',
      });

      expect(result).toBeDefined();
    });

    it('should throw ExternalServiceError for API errors', async () => {
      const client = new WhatsAppClient(config);

      server.use(
        http.post('https://waba.360dialog.io/v1/messages', () => {
          return HttpResponse.json({ message: 'Invalid phone' }, { status: 400 });
        })
      );

      await expect(
        client.sendText({
          to: '+40721123456',
          text: 'Test',
        })
      ).rejects.toThrow('Request failed with status 400');
    });
  });

  describe('createWhatsAppClient factory', () => {
    it('should create a WhatsApp client instance', () => {
      const client = createWhatsAppClient(config);
      expect(client).toBeInstanceOf(WhatsAppClient);
    });
  });
});

describe('TemplateCatalogService', () => {
  describe('getTemplate', () => {
    it('should return template definition', () => {
      const service = new TemplateCatalogService();

      const template = service.getTemplate('appointment_confirmation');

      expect(template).not.toBeNull();
      expect(template?.id).toBe('appointment_confirmation');
      expect(template?.category).toBe('utility');
    });

    it('should return null for unknown template', () => {
      const service = new TemplateCatalogService();

      const template = service.getTemplate('unknown_template');

      expect(template).toBeNull();
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const service = new TemplateCatalogService();

      const templates = service.getAllTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.map((t) => t.id)).toContain('appointment_confirmation');
      expect(templates.map((t) => t.id)).toContain('hot_lead_acknowledgment');
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return marketing templates', () => {
      const service = new TemplateCatalogService();

      const templates = service.getTemplatesByCategory('marketing');

      expect(templates.every((t) => t.category === 'marketing')).toBe(true);
      expect(templates.map((t) => t.id)).toContain('hot_lead_acknowledgment');
    });

    it('should return utility templates', () => {
      const service = new TemplateCatalogService();

      const templates = service.getTemplatesByCategory('utility');

      expect(templates.every((t) => t.category === 'utility')).toBe(true);
      expect(templates.map((t) => t.id)).toContain('appointment_confirmation');
    });
  });

  describe('getTemplatesForLanguage', () => {
    it('should return templates available in Romanian', () => {
      const service = new TemplateCatalogService();

      const templates = service.getTemplatesForLanguage('ro');

      expect(templates.every((t) => t.languages.includes('ro'))).toBe(true);
    });

    it('should return templates available in English', () => {
      const service = new TemplateCatalogService();

      const templates = service.getTemplatesForLanguage('en');

      expect(templates.every((t) => t.languages.includes('en'))).toBe(true);
    });

    it('should return templates available in German', () => {
      const service = new TemplateCatalogService();

      const templates = service.getTemplatesForLanguage('de');

      expect(templates.every((t) => t.languages.includes('de'))).toBe(true);
    });
  });

  describe('validateParameters', () => {
    it('should validate valid parameters', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('appointment_confirmation', {
        date: '25.01.2025',
        time: '10:00',
        location: 'Clinica Dentara',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required parameters', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('appointment_confirmation', {
        date: '25.01.2025',
        // missing time and location
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: time');
      expect(result.errors).toContain('Missing required parameter: location');
    });

    it('should validate date format', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('appointment_confirmation', {
        date: '2025-01-25', // Wrong format
        time: '10:00',
        location: 'Clinica',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DD.MM.YYYY'))).toBe(true);
    });

    it('should validate time format', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('appointment_confirmation', {
        date: '25.01.2025',
        time: '10:00:00', // Wrong format
        location: 'Clinica',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('HH:mm'))).toBe(true);
    });

    it('should validate max length', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('appointment_confirmation', {
        date: '25.01.2025',
        time: '10:00',
        location: 'x'.repeat(101), // Over 100 chars
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds max length'))).toBe(true);
    });

    it('should return error for unknown template', () => {
      const service = new TemplateCatalogService();

      const result = service.validateParameters('unknown_template', {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template not found: unknown_template');
    });
  });

  describe('canSendTemplate (cooldown)', () => {
    it('should allow first send', () => {
      const service = new TemplateCatalogService();

      const result = service.canSendTemplate('contact_123', 'hot_lead_acknowledgment');

      expect(result.allowed).toBe(true);
    });

    it('should allow templates with zero cooldown', () => {
      const service = new TemplateCatalogService();

      // appointment_confirmation has 0 cooldown
      service.recordTemplateSend('contact_123', 'appointment_confirmation');
      const result = service.canSendTemplate('contact_123', 'appointment_confirmation');

      expect(result.allowed).toBe(true);
    });

    it('should block during cooldown period', () => {
      const service = new TemplateCatalogService();

      // hot_lead_acknowledgment has 60 minute cooldown
      service.recordTemplateSend('contact_123', 'hot_lead_acknowledgment');
      const result = service.canSendTemplate('contact_123', 'hot_lead_acknowledgment');

      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBeGreaterThan(0);
    });

    it('should return false for unknown template', () => {
      const service = new TemplateCatalogService();

      const result = service.canSendTemplate('contact_123', 'unknown_template');

      expect(result.allowed).toBe(false);
    });
  });

  describe('recordTemplateSend', () => {
    it('should record template send', () => {
      const service = new TemplateCatalogService();

      service.recordTemplateSend('contact_123', 'hot_lead_acknowledgment');

      const result = service.canSendTemplate('contact_123', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(false);
    });
  });

  describe('buildTemplateComponents', () => {
    it('should build components from parameters', () => {
      const service = new TemplateCatalogService();

      const components = service.buildTemplateComponents('appointment_confirmation', {
        date: '25.01.2025',
        time: '10:00',
        location: 'Clinica',
      });

      expect(components).toHaveLength(1);
      expect(components[0].type).toBe('body');
      expect(components[0].parameters).toHaveLength(3);
    });

    it('should return empty array for unknown template', () => {
      const service = new TemplateCatalogService();

      const components = service.buildTemplateComponents('unknown_template', {});

      expect(components).toHaveLength(0);
    });

    it('should return empty array when no parameters provided', () => {
      const service = new TemplateCatalogService();

      const components = service.buildTemplateComponents('appointment_confirmation', {});

      expect(components).toHaveLength(0);
    });
  });

  describe('getTemplateNameForLanguage', () => {
    it('should return template name', () => {
      const service = new TemplateCatalogService();

      const name = service.getTemplateNameForLanguage('appointment_confirmation', 'ro');

      expect(name).toBe('appointment_confirmation');
    });

    it('should return template ID for unknown template', () => {
      const service = new TemplateCatalogService();

      const name = service.getTemplateNameForLanguage('unknown', 'ro');

      expect(name).toBe('unknown');
    });
  });

  describe('getMetaLanguageCode', () => {
    it('should return correct language codes', () => {
      const service = new TemplateCatalogService();

      expect(service.getMetaLanguageCode('ro')).toBe('ro');
      expect(service.getMetaLanguageCode('en')).toBe('en');
      expect(service.getMetaLanguageCode('de')).toBe('de');
    });
  });

  describe('formatDateForTemplate', () => {
    it('should format date for Romanian', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatDateForTemplate(new Date('2025-01-25'), 'ro');

      expect(formatted).toBe('25.01.2025');
    });

    it('should format date for English', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatDateForTemplate(new Date('2025-01-25'), 'en');

      expect(formatted).toBe('01/25/2025');
    });

    it('should format date for German', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatDateForTemplate(new Date('2025-01-25'), 'de');

      expect(formatted).toBe('25.01.2025');
    });

    it('should accept string date', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatDateForTemplate('2025-01-25', 'ro');

      expect(formatted).toBe('25.01.2025');
    });
  });

  describe('formatTimeForTemplate', () => {
    it('should format time from Date', () => {
      const service = new TemplateCatalogService();
      const date = new Date('2025-01-25T10:30:00');

      const formatted = service.formatTimeForTemplate(date);

      expect(formatted).toBe('10:30');
    });

    it('should return already formatted time', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatTimeForTemplate('14:00');

      expect(formatted).toBe('14:00');
    });

    it('should format time from ISO string', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatTimeForTemplate('2025-01-25T09:15:00Z');

      expect(formatted).toBe('09:15');
    });
  });

  describe('formatCurrencyForTemplate', () => {
    it('should format EUR for Romanian', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatCurrencyForTemplate(500, 'EUR', 'ro');

      expect(formatted).toContain('500');
      expect(formatted).toContain('EUR');
    });

    it('should format USD for English', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatCurrencyForTemplate(500, 'USD', 'en');

      expect(formatted).toContain('500');
      expect(formatted).toContain('$');
    });

    it('should format EUR for German', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatCurrencyForTemplate(500, 'EUR', 'de');

      expect(formatted).toContain('500');
    });

    it('should use default EUR when currency not provided', () => {
      const service = new TemplateCatalogService();

      const formatted = service.formatCurrencyForTemplate(500);

      expect(formatted).toContain('500');
    });
  });

  describe('createTemplateCatalogService factory', () => {
    it('should create a template catalog service instance', () => {
      const service = createTemplateCatalogService();
      expect(service).toBeInstanceOf(TemplateCatalogService);
    });
  });

  describe('TEMPLATE_CATALOG', () => {
    it('should have all required templates', () => {
      const requiredTemplates = [
        'hot_lead_acknowledgment',
        'appointment_confirmation',
        'appointment_reminder_24h',
        'appointment_reminder_2h',
        'payment_confirmation',
        'recall_reminder',
        'consent_renewal',
        'treatment_follow_up',
        'consultation_offer',
        'welcome_first_contact',
      ];

      requiredTemplates.forEach((templateId) => {
        expect(TEMPLATE_CATALOG[templateId]).toBeDefined();
      });
    });

    it('should have valid template definitions', () => {
      Object.values(TEMPLATE_CATALOG).forEach((template) => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.category).toMatch(/^(marketing|utility|authentication)$/);
        expect(template.languages).toContain('ro');
        expect(template.description).toBeDefined();
        expect(typeof template.requiresConsent).toBe('boolean');
        expect(typeof template.cooldownMinutes).toBe('number');
      });
    });

    it('should have marketing consent requirements correct', () => {
      const marketingTemplates = Object.values(TEMPLATE_CATALOG).filter(
        (t) => t.category === 'marketing'
      );

      marketingTemplates.forEach((template) => {
        expect(template.requiresConsent).toBe(true);
      });
    });

    it('should have utility templates not requiring consent', () => {
      const utilityTemplates = Object.values(TEMPLATE_CATALOG).filter(
        (t) => t.category === 'utility' && t.id !== 'consent_renewal'
      );

      utilityTemplates.forEach((template) => {
        expect(template.requiresConsent).toBe(false);
      });
    });
  });
});
