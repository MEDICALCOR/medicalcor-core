/**
 * WhatsApp Integration Branch Coverage Tests
 *
 * Tests WhatsApp client and TemplateCatalogService for 100% branch coverage.
 * Uses MSW for HTTP mocking via the global vitest.setup.ts configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../__mocks__/server.js';
import {
  WhatsAppClient,
  createWhatsAppClient,
  TemplateCatalogService,
  createTemplateCatalogService,
  TEMPLATE_CATALOG,
  type WhatsAppClientConfig,
  type SupportedLanguage,
} from '../whatsapp.js';

// =============================================================================
// WhatsAppClient Tests
// =============================================================================

describe('WhatsAppClient', () => {
  const validConfig: WhatsAppClientConfig = {
    apiKey: 'test-api-key',
    phoneNumberId: 'test-phone-number-id',
    businessAccountId: 'test-business-account-id',
    webhookSecret: 'test-webhook-secret',
  };

  let client: WhatsAppClient;

  beforeEach(() => {
    client = new WhatsAppClient(validConfig);
  });

  describe('constructor and config validation', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(WhatsAppClient);
    });

    it('should create client with minimal config', () => {
      const minimalConfig = {
        apiKey: 'test-key',
        phoneNumberId: 'test-phone',
      };
      const minClient = new WhatsAppClient(minimalConfig);
      expect(minClient).toBeInstanceOf(WhatsAppClient);
    });

    it('should use custom baseUrl when provided', () => {
      const customUrlConfig = {
        ...validConfig,
        baseUrl: 'https://custom.api.com/v1',
      };
      const customClient = new WhatsAppClient(customUrlConfig);
      expect(customClient).toBeInstanceOf(WhatsAppClient);
    });

    it('should throw on missing apiKey', () => {
      expect(
        () =>
          new WhatsAppClient({
            apiKey: '',
            phoneNumberId: 'test',
          })
      ).toThrow();
    });

    it('should throw on missing phoneNumberId', () => {
      expect(
        () =>
          new WhatsAppClient({
            apiKey: 'test',
            phoneNumberId: '',
          })
      ).toThrow();
    });

    it('should accept custom retry config', () => {
      const retryConfig = {
        ...validConfig,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      };
      const retryClient = new WhatsAppClient(retryConfig);
      expect(retryClient).toBeInstanceOf(WhatsAppClient);
    });
  });

  describe('sendText', () => {
    it('should send text message successfully', async () => {
      const result = await client.sendText({
        to: '+40721000001',
        text: 'Hello, this is a test message',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
      expect(result).toHaveProperty('messages');
      expect(result.messages).toHaveLength(1);
    });

    it('should send text with previewUrl enabled', async () => {
      const result = await client.sendText({
        to: '+40721000001',
        text: 'Check this link: https://example.com',
        previewUrl: true,
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should normalize Romanian phone numbers starting with country code', async () => {
      // Valid international format - country code + local number
      const result = await client.sendText({
        to: '+40721000001',
        text: 'Test message',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should handle phone numbers without plus prefix', async () => {
      // Numbers without + prefix are valid per regex
      const result = await client.sendText({
        to: '40721000001',
        text: 'Test message',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should reject invalid phone number format', async () => {
      await expect(
        client.sendText({
          to: '123', // Too short
          text: 'Test message',
        })
      ).rejects.toThrow();
    });

    it('should reject empty message text', async () => {
      await expect(
        client.sendText({
          to: '+40721000001',
          text: '',
        })
      ).rejects.toThrow();
    });

    it('should reject message text exceeding max length', async () => {
      const longText = 'a'.repeat(4097);
      await expect(
        client.sendText({
          to: '+40721000001',
          text: longText,
        })
      ).rejects.toThrow();
    });
  });

  describe('sendTemplate', () => {
    it('should send template message successfully', async () => {
      const result = await client.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_confirmation',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send template with custom language', async () => {
      const result = await client.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_confirmation',
        language: 'en',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send template with components', async () => {
      const result = await client.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_confirmation',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'Test Parameter' }],
          },
        ],
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should reject invalid template name format', async () => {
      await expect(
        client.sendTemplate({
          to: '+40721000001',
          templateName: 'Invalid-Template-Name', // Should be lowercase with underscores
        })
      ).rejects.toThrow();
    });
  });

  describe('sendInteractiveButtons', () => {
    it('should send button message successfully', async () => {
      const result = await client.sendInteractiveButtons({
        to: '+40721000001',
        bodyText: 'Please select an option',
        buttons: [
          { id: 'btn_1', title: 'Option 1' },
          { id: 'btn_2', title: 'Option 2' },
        ],
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send button message with header', async () => {
      const result = await client.sendInteractiveButtons({
        to: '+40721000001',
        bodyText: 'Please select an option',
        buttons: [{ id: 'btn_1', title: 'Option 1' }],
        headerText: 'Important Choice',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send button message with footer', async () => {
      const result = await client.sendInteractiveButtons({
        to: '+40721000001',
        bodyText: 'Please select an option',
        buttons: [{ id: 'btn_1', title: 'Option 1' }],
        footerText: 'Reply within 24 hours',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });
  });

  describe('sendInteractiveList', () => {
    it('should send list message successfully', async () => {
      const result = await client.sendInteractiveList({
        to: '+40721000001',
        bodyText: 'Select your appointment time',
        buttonText: 'View Options',
        sections: [
          {
            title: 'Morning Slots',
            rows: [
              { id: 'slot_1', title: '09:00', description: 'Available' },
              { id: 'slot_2', title: '10:30', description: 'Available' },
            ],
          },
        ],
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send list message with header and footer', async () => {
      const result = await client.sendInteractiveList({
        to: '+40721000001',
        bodyText: 'Select your appointment time',
        buttonText: 'View Options',
        sections: [
          {
            title: 'Morning Slots',
            rows: [{ id: 'slot_1', title: '09:00' }],
          },
        ],
        headerText: 'Appointment Booking',
        footerText: 'All times are in local timezone',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });
  });

  describe('sendImage', () => {
    it('should send image message successfully', async () => {
      const result = await client.sendImage({
        to: '+40721000001',
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send image with caption', async () => {
      const result = await client.sendImage({
        to: '+40721000001',
        imageUrl: 'https://example.com/image.jpg',
        caption: 'Here is your appointment confirmation',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });
  });

  describe('sendDocument', () => {
    it('should send document message successfully', async () => {
      const result = await client.sendDocument({
        to: '+40721000001',
        documentUrl: 'https://example.com/document.pdf',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send document with filename and caption', async () => {
      const result = await client.sendDocument({
        to: '+40721000001',
        documentUrl: 'https://example.com/document.pdf',
        filename: 'appointment_details.pdf',
        caption: 'Your appointment details attached',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });
  });

  describe('sendLocation', () => {
    it('should send location message successfully', async () => {
      const result = await client.sendLocation({
        to: '+40721000001',
        latitude: 44.4268,
        longitude: 26.1025,
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should send location with name and address', async () => {
      const result = await client.sendLocation({
        to: '+40721000001',
        latitude: 44.4268,
        longitude: 26.1025,
        name: 'MedicalCor Dental Clinic',
        address: 'Str. Victoriei 15, București',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read successfully', async () => {
      await expect(client.markAsRead('wamid.123456')).resolves.not.toThrow();
    });
  });

  describe('webhook signature verification', () => {
    it('should verify valid webhook signature', () => {
      const crypto = require('crypto');
      const payload = '{"test": "payload"}';
      const expectedSig = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const result = client.verifyWebhookSignature(payload, `sha256=${expectedSig}`);
      expect(result).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const result = client.verifyWebhookSignature('{"test": "payload"}', 'sha256=invalid');
      expect(result).toBe(false);
    });

    it('should throw when webhook secret not configured', () => {
      const noSecretClient = new WhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: 'test-phone',
      });

      expect(() => noSecretClient.verifyWebhookSignature('payload', 'sha256=signature')).toThrow(
        'Webhook secret not configured'
      );
    });

    it('should handle signature length mismatch gracefully', () => {
      const result = client.verifyWebhookSignature('payload', 'sha256=abc');
      expect(result).toBe(false);
    });

    it('should validate webhook and throw on invalid signature', () => {
      expect(() => client.validateWebhook('{"test": "payload"}', 'sha256=invalid')).toThrow(
        'Invalid WhatsApp webhook signature'
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      server.use(
        http.post('https://waba.360dialog.io/v1/messages', () => {
          return new HttpResponse(null, { status: 429 });
        })
      );

      await expect(
        client.sendText({
          to: '+40721000001',
          text: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle 502 errors and retry', async () => {
      let callCount = 0;
      server.use(
        http.post('https://waba.360dialog.io/v1/messages', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({
            messaging_product: 'whatsapp',
            contacts: [{ input: '40721000001', wa_id: '40721000001' }],
            messages: [{ id: 'wamid.retry' }],
          });
        })
      );

      const result = await client.sendText({
        to: '+40721000001',
        text: 'Test retry',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
      expect(callCount).toBeGreaterThan(1);
    });

    it('should handle 503 errors and retry', async () => {
      let callCount = 0;
      server.use(
        http.post('https://waba.360dialog.io/v1/messages', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({
            messaging_product: 'whatsapp',
            contacts: [{ input: '40721000001', wa_id: '40721000001' }],
            messages: [{ id: 'wamid.retry' }],
          });
        })
      );

      const result = await client.sendText({
        to: '+40721000001',
        text: 'Test retry on 503',
      });

      expect(result).toHaveProperty('messaging_product', 'whatsapp');
    });

    it('should handle generic API errors', async () => {
      server.use(
        http.post('https://waba.360dialog.io/v1/messages', () => {
          return new HttpResponse('Bad Request', { status: 400 });
        })
      );

      await expect(
        client.sendText({
          to: '+40721000001',
          text: 'Test',
        })
      ).rejects.toThrow('Request failed with status 400');
    });
  });

  describe('factory function', () => {
    it('should create client via factory function', () => {
      const factoryClient = createWhatsAppClient(validConfig);
      expect(factoryClient).toBeInstanceOf(WhatsAppClient);
    });
  });
});

// =============================================================================
// TemplateCatalogService Tests
// =============================================================================

describe('TemplateCatalogService', () => {
  let service: TemplateCatalogService;

  beforeEach(() => {
    service = new TemplateCatalogService();
  });

  describe('constructor', () => {
    it('should create service without redis', () => {
      expect(service).toBeInstanceOf(TemplateCatalogService);
    });

    it('should create service with redis config', () => {
      const mockRedis = {
        ttl: vi.fn(),
        set: vi.fn(),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      expect(redisService).toBeInstanceOf(TemplateCatalogService);
    });

    it('should accept custom redis key prefix', () => {
      const serviceWithPrefix = new TemplateCatalogService({
        redisKeyPrefix: 'custom:prefix:',
      });
      expect(serviceWithPrefix).toBeInstanceOf(TemplateCatalogService);
    });
  });

  describe('getTemplate', () => {
    it('should return template definition for valid template ID', () => {
      const template = service.getTemplate('appointment_confirmation');
      expect(template).toBeDefined();
      expect(template?.id).toBe('appointment_confirmation');
    });

    it('should return null for invalid template ID', () => {
      const template = service.getTemplate('nonexistent_template');
      expect(template).toBeNull();
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const templates = service.getAllTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.length).toBe(Object.keys(TEMPLATE_CATALOG).length);
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should filter templates by marketing category', () => {
      const marketingTemplates = service.getTemplatesByCategory('marketing');
      expect(marketingTemplates.every((t) => t.category === 'marketing')).toBe(true);
    });

    it('should filter templates by utility category', () => {
      const utilityTemplates = service.getTemplatesByCategory('utility');
      expect(utilityTemplates.every((t) => t.category === 'utility')).toBe(true);
    });

    it('should filter templates by authentication category', () => {
      const authTemplates = service.getTemplatesByCategory('authentication');
      expect(authTemplates.every((t) => t.category === 'authentication')).toBe(true);
    });
  });

  describe('getTemplatesForLanguage', () => {
    it('should return templates supporting Romanian', () => {
      const roTemplates = service.getTemplatesForLanguage('ro');
      expect(roTemplates.every((t) => t.languages.includes('ro'))).toBe(true);
    });

    it('should return templates supporting English', () => {
      const enTemplates = service.getTemplatesForLanguage('en');
      expect(enTemplates.every((t) => t.languages.includes('en'))).toBe(true);
    });

    it('should return templates supporting German', () => {
      const deTemplates = service.getTemplatesForLanguage('de');
      expect(deTemplates.every((t) => t.languages.includes('de'))).toBe(true);
    });
  });

  describe('validateParameters', () => {
    it('should validate correct parameters', () => {
      const result = service.validateParameters('appointment_confirmation', {
        date: '25.12.2024',
        time: '10:00',
        location: 'Clinica Centrală',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required parameters', () => {
      const result = service.validateParameters('appointment_confirmation', {
        date: '25.12.2024',
        // missing time and location
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('time'))).toBe(true);
    });

    it('should return error for nonexistent template', () => {
      const result = service.validateParameters('nonexistent', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template not found: nonexistent');
    });

    it('should reject parameters exceeding max length', () => {
      const result = service.validateParameters('hot_lead_acknowledgment', {
        name: 'a'.repeat(100), // Exceeds max 50
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('max length'))).toBe(true);
    });

    it('should validate date format DD.MM.YYYY', () => {
      const result = service.validateParameters('appointment_confirmation', {
        date: '2024-12-25', // Wrong format
        time: '10:00',
        location: 'Test',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DD.MM.YYYY'))).toBe(true);
    });

    it('should validate time format HH:mm', () => {
      const result = service.validateParameters('appointment_confirmation', {
        date: '25.12.2024',
        time: '10:00:00', // Wrong format
        location: 'Test',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('HH:mm'))).toBe(true);
    });

    it('should validate currency format', () => {
      const result = service.validateParameters('payment_confirmation', {
        amount: 'invalid_currency',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('currency'))).toBe(true);
    });

    it('should accept valid currency amounts', () => {
      const result = service.validateParameters('payment_confirmation', {
        amount: '500.00 EUR',
      });

      expect(result.valid).toBe(true);
    });

    it('should handle optional parameters being empty', () => {
      // consent_renewal has no required parameters
      const result = service.validateParameters('consent_renewal', {});
      expect(result.valid).toBe(true);
    });
  });

  describe('canSendTemplate (async)', () => {
    it('should allow sending template with no cooldown', async () => {
      const result = await service.canSendTemplate('contact123', 'appointment_confirmation');
      expect(result.allowed).toBe(true);
    });

    it('should allow first send of template with cooldown', async () => {
      const result = await service.canSendTemplate('contact123', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(true);
    });

    it('should block template during cooldown period', async () => {
      // Record a send first
      await service.recordTemplateSend('contact456', 'hot_lead_acknowledgment');

      // Try to send again immediately
      const result = await service.canSendTemplate('contact456', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBeDefined();
    });

    it('should return not allowed for nonexistent template', async () => {
      const result = await service.canSendTemplate('contact123', 'nonexistent');
      expect(result.allowed).toBe(false);
    });

    it('should check redis when available', async () => {
      const mockRedis = {
        ttl: vi.fn().mockResolvedValue(-2), // Key doesn't exist
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      const result = await redisService.canSendTemplate('contact789', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(true);
      expect(mockRedis.ttl).toHaveBeenCalled();
    });

    it('should block when redis shows active cooldown', async () => {
      const mockRedis = {
        ttl: vi.fn().mockResolvedValue(1800), // 30 minutes remaining
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      const result = await redisService.canSendTemplate('contact789', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBe(30);
    });

    it('should fall back to in-memory on redis error', async () => {
      const mockRedis = {
        ttl: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        set: vi.fn(),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      // Should not throw, falls back to in-memory
      const result = await redisService.canSendTemplate(
        'contact_fallback',
        'hot_lead_acknowledgment'
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('canSendTemplateSync (deprecated)', () => {
    it('should allow sending template with no cooldown (sync)', () => {
      const result = service.canSendTemplateSync('contact123', 'appointment_confirmation');
      expect(result.allowed).toBe(true);
    });

    it('should return not allowed for nonexistent template (sync)', () => {
      const result = service.canSendTemplateSync('contact123', 'nonexistent');
      expect(result.allowed).toBe(false);
    });

    it('should block during cooldown (sync)', () => {
      service.recordTemplateSendSync('contact_sync', 'recall_reminder');

      const result = service.canSendTemplateSync('contact_sync', 'recall_reminder');
      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBeDefined();
    });

    it('should allow sending after cooldown expires (sync)', () => {
      vi.useFakeTimers();

      const cooldownService = new TemplateCatalogService();

      // Record a send for a template with 60 minute cooldown
      cooldownService.recordTemplateSendSync('contact_expired', 'hot_lead_acknowledgment');

      // Verify blocked immediately
      let result = cooldownService.canSendTemplateSync(
        'contact_expired',
        'hot_lead_acknowledgment'
      );
      expect(result.allowed).toBe(false);

      // Advance time past cooldown (60 minutes + 1ms)
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should now be allowed
      result = cooldownService.canSendTemplateSync('contact_expired', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('canSendTemplate async cooldown expiry', () => {
    it('should allow sending after cooldown expires (async in-memory)', async () => {
      vi.useFakeTimers();

      const cooldownService = new TemplateCatalogService();

      // Record a send
      await cooldownService.recordTemplateSend('contact_async_expired', 'hot_lead_acknowledgment');

      // Verify blocked immediately
      let result = await cooldownService.canSendTemplate(
        'contact_async_expired',
        'hot_lead_acknowledgment'
      );
      expect(result.allowed).toBe(false);

      // Advance time past cooldown (60 minutes + 1ms)
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should now be allowed (falls back to in-memory check)
      result = await cooldownService.canSendTemplate(
        'contact_async_expired',
        'hot_lead_acknowledgment'
      );
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('recordTemplateSend', () => {
    it('should record template send without redis', async () => {
      await service.recordTemplateSend('record_contact', 'hot_lead_acknowledgment');

      const result = await service.canSendTemplate('record_contact', 'hot_lead_acknowledgment');
      expect(result.allowed).toBe(false);
    });

    it('should record template send with redis', async () => {
      const mockRedis = {
        ttl: vi.fn().mockResolvedValue(-2),
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      await redisService.recordTemplateSend('redis_contact', 'hot_lead_acknowledgment');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle redis error during record gracefully', async () => {
      const mockRedis = {
        ttl: vi.fn().mockResolvedValue(-2),
        set: vi.fn().mockRejectedValue(new Error('Redis write failed')),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      // Should not throw
      await expect(
        redisService.recordTemplateSend('error_contact', 'hot_lead_acknowledgment')
      ).resolves.not.toThrow();
    });

    it('should not record for template without cooldown', async () => {
      const mockRedis = {
        ttl: vi.fn().mockResolvedValue(-2),
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn(),
        del: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(),
      };

      const redisService = new TemplateCatalogService({
        redis: mockRedis as unknown as import('@medicalcor/core').SecureRedisClient,
      });

      await redisService.recordTemplateSend('no_cooldown_contact', 'appointment_confirmation');
      // appointment_confirmation has 0 cooldown, so redis.set should not be called
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('buildTemplateComponents', () => {
    it('should build body components from parameters', () => {
      const components = service.buildTemplateComponents('hot_lead_acknowledgment', {
        name: 'John Doe',
      });

      expect(components).toHaveLength(1);
      expect(components[0]?.type).toBe('body');
      expect(components[0]?.parameters).toHaveLength(1);
    });

    it('should return empty array for nonexistent template', () => {
      const components = service.buildTemplateComponents('nonexistent', {});
      expect(components).toHaveLength(0);
    });

    it('should return empty array when no parameters match', () => {
      const components = service.buildTemplateComponents('consent_renewal', {});
      expect(components).toHaveLength(0);
    });
  });

  describe('getTemplateNameForLanguage', () => {
    it('should return template name', () => {
      const name = service.getTemplateNameForLanguage('appointment_confirmation', 'ro');
      expect(name).toBe('appointment_confirmation');
    });

    it('should return templateId for nonexistent template', () => {
      const name = service.getTemplateNameForLanguage('nonexistent', 'ro');
      expect(name).toBe('nonexistent');
    });
  });

  describe('getMetaLanguageCode', () => {
    it('should return correct code for Romanian', () => {
      expect(service.getMetaLanguageCode('ro')).toBe('ro');
    });

    it('should return correct code for English', () => {
      expect(service.getMetaLanguageCode('en')).toBe('en');
    });

    it('should return correct code for German', () => {
      expect(service.getMetaLanguageCode('de')).toBe('de');
    });
  });

  describe('formatDateForTemplate', () => {
    it('should format date for Romanian (DD.MM.YYYY)', () => {
      const date = new Date('2024-12-25');
      const formatted = service.formatDateForTemplate(date, 'ro');
      expect(formatted).toBe('25.12.2024');
    });

    it('should format date for English (MM/DD/YYYY)', () => {
      const date = new Date('2024-12-25');
      const formatted = service.formatDateForTemplate(date, 'en');
      expect(formatted).toBe('12/25/2024');
    });

    it('should format date for German (DD.MM.YYYY)', () => {
      const date = new Date('2024-12-25');
      const formatted = service.formatDateForTemplate(date, 'de');
      expect(formatted).toBe('25.12.2024');
    });

    it('should handle string date input', () => {
      const formatted = service.formatDateForTemplate('2024-12-25', 'ro');
      expect(formatted).toBe('25.12.2024');
    });

    it('should default to Romanian format', () => {
      const date = new Date('2024-12-25');
      const formatted = service.formatDateForTemplate(date);
      expect(formatted).toBe('25.12.2024');
    });
  });

  describe('formatTimeForTemplate', () => {
    it('should format time from Date object', () => {
      const date = new Date('2024-12-25T14:30:00');
      const formatted = service.formatTimeForTemplate(date);
      expect(formatted).toBe('14:30');
    });

    it('should pass through correctly formatted time string', () => {
      const formatted = service.formatTimeForTemplate('10:00');
      expect(formatted).toBe('10:00');
    });

    it('should format time from ISO string', () => {
      const formatted = service.formatTimeForTemplate('2024-12-25T09:15:00Z');
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatCurrencyForTemplate', () => {
    it('should format currency for Romanian locale', () => {
      const formatted = service.formatCurrencyForTemplate(500, 'EUR', 'ro');
      expect(formatted).toContain('EUR');
      expect(formatted).toContain('500');
    });

    it('should format currency for English locale', () => {
      const formatted = service.formatCurrencyForTemplate(500, 'EUR', 'en');
      expect(formatted).toContain('500');
    });

    it('should format currency for German locale', () => {
      const formatted = service.formatCurrencyForTemplate(500, 'EUR', 'de');
      expect(formatted).toContain('500');
    });

    it('should use default currency and language', () => {
      const formatted = service.formatCurrencyForTemplate(1000);
      expect(formatted).toContain('1');
    });
  });

  describe('factory function', () => {
    it('should create service via factory function', () => {
      const factoryService = createTemplateCatalogService();
      expect(factoryService).toBeInstanceOf(TemplateCatalogService);
    });

    it('should accept config in factory function', () => {
      const factoryService = createTemplateCatalogService({
        redisKeyPrefix: 'custom:',
      });
      expect(factoryService).toBeInstanceOf(TemplateCatalogService);
    });
  });
});
